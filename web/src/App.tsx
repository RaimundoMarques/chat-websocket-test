import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ChatSocket, getWsUrl } from './lib/ws'
import type { ChatLine, KnownUser, Profile, Room, SavedSession, ServerMessage, Unit, User } from './types'

type Screen = 'login' | 'lobby' | 'room'
type Status = 'idle' | 'connecting' | 'online' | 'offline' | 'error'
type Theme = 'light' | 'dark'
type LobbyTab = 'rooms' | 'admin'

const THEME_STORAGE_KEY = 'chathub_theme'
const SESSION_STORAGE_KEY = 'chathub_session'

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'dark' || saved === 'light') return saved
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
  } catch {
    // ignore
  }
  return 'light'
}

let lineSeq = 0
function nextId() {
  lineSeq += 1
  return String(lineSeq)
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [screen, setScreen] = useState<Screen>('login')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [room, setRoom] = useState<Room | null>(null)
  const [lines, setLines] = useState<ChatLine[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showNewUserPassword, setShowNewUserPassword] = useState(false)
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [lobbyTab, setLobbyTab] = useState<LobbyTab>('rooms')

  // Organization entities (Units: ICCT, F1, F2...)
  const [units, setUnits] = useState<Unit[]>([])

  // Room Creation / Management
  const [roomName, setRoomName] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [selectedAllowedUsers, setSelectedAllowedUsers] = useState<string[]>([])
  const [knownUsers, setKnownUsers] = useState<KnownUser[]>([])
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [manageUserSearchQuery, setManageUserSearchQuery] = useState('')
  const [inviteInput, setInviteInput] = useState('')
  const [draft, setDraft] = useState('')

  // Admin Form States
  const [newUnitId, setNewUnitId] = useState('')
  const [newUnitName, setNewUnitName] = useState('')

  const [newUserName, setNewUserName] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserProfile, setNewUserProfile] = useState<Profile>('member')
  const [newUserUnit, setNewUserUnit] = useState('ICCT')

  const [resetPwdUserId, setResetPwdUserId] = useState<string | null>(null)
  const [resetPwdValue, setResetPwdValue] = useState('')

  // Modal de confirmação para alteração de Role de usuário
  const [roleChangeModal, setRoleChangeModal] = useState<{
    targetUser: KnownUser
    newProfile: Profile
  } | null>(null)

  const socketRef = useRef<ChatSocket | null>(null)
  const pendingAuth = useRef<{
    username?: string
    password?: string
    user_id?: string
    session_token?: string
  } | null>(null)
  const targetRoomId = useRef<string | null>(null)
  const userRef = useRef<User | null>(null)
  const roomRef = useRef<Room | null>(null)
  const handleMessageRef = useRef<(msg: ServerMessage) => void>(() => {})
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const wsUrl = useMemo(() => getWsUrl(), [])

  const otherKnownUsers = useMemo(() => {
    if (!user) return []
    const currentLower = user.username.toLowerCase()
    return knownUsers
      .filter((u) => u.username.toLowerCase() !== currentLower)
      .sort((a, b) => {
        if (a.is_online !== b.is_online) {
          return a.is_online ? -1 : 1
        }
        return a.username.localeCompare(b.username)
      })
  }, [knownUsers, user])

  const filteredLobbyUsers = useMemo(() => {
    const q = userSearchQuery.trim().toLowerCase()
    if (!q) return otherKnownUsers
    return otherKnownUsers.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.unit_id && u.unit_id.toLowerCase().includes(q)),
    )
  }, [otherKnownUsers, userSearchQuery])

  const availableToInvite = useMemo(() => {
    if (!user || !room) return []
    const currentLower = user.username.toLowerCase()
    const allowedLower = new Set((room.allowed_usernames || []).map((u) => u.toLowerCase()))
    return knownUsers
      .filter((u) => {
        const uLower = u.username.toLowerCase()
        return uLower !== currentLower && !allowedLower.has(uLower)
      })
      .sort((a, b) => {
        if (a.is_online !== b.is_online) return a.is_online ? -1 : 1
        return a.username.localeCompare(b.username)
      })
  }, [knownUsers, user, room])

  const filteredManageUsers = useMemo(() => {
    const q = manageUserSearchQuery.trim().toLowerCase()
    if (!q) return availableToInvite
    return availableToInvite.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.unit_id && u.unit_id.toLowerCase().includes(q)),
    )
  }, [availableToInvite, manageUserSearchQuery])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // ignore
    }
  }, [theme])

  function toggleTheme() {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  function handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'auth_ok':
        setUser(msg.user)
        userRef.current = msg.user
        setStatus('online')
        setError(null)

        try {
          if (msg.user.session_token) {
            const sessionData: SavedSession = {
              user_id: msg.user.user_id,
              username: msg.user.username,
              session_token: msg.user.session_token,
              room_id: targetRoomId.current || msg.user.room_id || null,
            }
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionData))
          }
        } catch {
          // ignore
        }

        if (targetRoomId.current) {
          socketRef.current?.send({ type: 'join_room', room_id: targetRoomId.current })
        } else {
          setScreen('lobby')
        }
        break

      case 'profile_changed':
        setUser(msg.user)
        userRef.current = msg.user
        setError(null)
        break

      case 'rooms_list':
        setRooms(msg.rooms)
        break

      case 'users_list':
        setKnownUsers(msg.users)
        break

      case 'units_list':
        setUnits(msg.units)
        if (msg.units.length > 0 && !newUserUnit) {
          setNewUserUnit(msg.units[0].id)
        }
        break

      case 'unit_created':
        setSuccessMsg(`Unit '${msg.unit.id} - ${msg.unit.name}' created successfully!`)
        setTimeout(() => setSuccessMsg(null), 4000)
        break

      case 'user_created':
        setSuccessMsg(`User '${msg.user.username}' created successfully!`)
        setTimeout(() => setSuccessMsg(null), 4000)
        break

      case 'user_updated':
        setSuccessMsg('User permissions updated successfully!')
        setTimeout(() => setSuccessMsg(null), 4000)
        break

      case 'password_reset':
        setSuccessMsg('User password was successfully reset!')
        setResetPwdUserId(null)
        setResetPwdValue('')
        setTimeout(() => setSuccessMsg(null), 4000)
        break

      case 'room_created':
      case 'room_joined':
        setRoom(msg.room)
        roomRef.current = msg.room
        setUser((u) => {
          const updated = u ? { ...u, room_id: msg.room.room_id } : u
          userRef.current = updated
          return updated
        })
        setLines([])
        setScreen('room')
        setError(null)
        targetRoomId.current = msg.room.room_id

        try {
          const savedStr = localStorage.getItem(SESSION_STORAGE_KEY)
          if (savedStr) {
            const parsed = JSON.parse(savedStr)
            parsed.room_id = msg.room.room_id
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(parsed))
          }
        } catch {
          // ignore
        }
        break

      case 'chat_history':
        setLines(
          msg.messages.map((m) => ({
            id: String(m.id),
            kind: 'chat' as const,
            text: m.text,
            username: m.from_user.username,
            ts: m.ts,
          })),
        )
        break

      case 'room_update':
      case 'room_permissions_updated':
        setRoom((current) => {
          const next = current && current.room_id === msg.room.room_id ? msg.room : current
          roomRef.current = next
          return next
        })
        setRooms((list) => {
          const others = list.filter((r) => r.room_id !== msg.room.room_id)
          return [...others, msg.room].sort((a, b) => a.name.localeCompare(b.name))
        })
        break

      case 'room_left':
        setRoom(null)
        roomRef.current = null
        setUser((u) => {
          const updated = u ? { ...u, room_id: null } : u
          userRef.current = updated
          return updated
        })
        setLines([])
        setScreen('lobby')
        targetRoomId.current = null

        try {
          const savedStr = localStorage.getItem(SESSION_STORAGE_KEY)
          if (savedStr) {
            const parsed = JSON.parse(savedStr)
            parsed.room_id = null
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(parsed))
          }
        } catch {
          // ignore
        }
        break

      case 'chat':
        setLines((prev) => [
          ...prev,
          {
            id: String(msg.id),
            kind: 'chat',
            text: msg.text,
            username: msg.from_user.username,
            ts: msg.ts,
          },
        ])
        break

      case 'system':
        setLines((prev) => [
          ...prev,
          {
            id: nextId(),
            kind: 'system',
            text:
              msg.event === 'user_joined'
                ? `${msg.user.username} joined`
                : `${msg.user.username} left`,
            ts: msg.ts,
          },
        ])
        break

      case 'error':
        if (msg.code === 'session_replaced' || msg.code === 'invalid_session') {
          try {
            localStorage.removeItem(SESSION_STORAGE_KEY)
          } catch {
            // ignore
          }
          targetRoomId.current = null
          userRef.current = null
          roomRef.current = null
          setUser(null)
          setRoom(null)
          setRooms([])
          setKnownUsers([])
          setSelectedAllowedUsers([])
          setLines([])
          setScreen('login')
          setStatus('idle')
          setError(msg.message)
          socketRef.current?.close()
          socketRef.current = null
          break
        }
        if (msg.code === 'room_not_found' || msg.code === 'forbidden_room' || msg.code === 'kicked') {
          targetRoomId.current = null
          setScreen('lobby')
          try {
            const savedStr = localStorage.getItem(SESSION_STORAGE_KEY)
            if (savedStr) {
              const parsed = JSON.parse(savedStr)
              parsed.room_id = null
              localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(parsed))
            }
          } catch {
            // ignore
          }
        }
        setError(msg.message)
        setStatus((prev) => (prev === 'connecting' ? 'idle' : prev))
        break
    }
  }

  handleMessageRef.current = handleMessage

  function ensureSocket() {
    if (socketRef.current) return socketRef.current

    const socket = new ChatSocket({
      onOpen: () => {
        const pending = pendingAuth.current
        if (pending) {
          if (pending.session_token && pending.user_id) {
            socket.send({
              type: 'auth',
              user_id: pending.user_id,
              session_token: pending.session_token,
              username: pending.username || '',
            })
          } else if (pending.username && pending.password) {
            socket.send({
              type: 'auth',
              username: pending.username,
              password: pending.password,
            })
          }
          pendingAuth.current = null
        } else {
          setStatus('online')
        }
      },
      onClose: (ev) => {
        setStatus('idle')
        socketRef.current = null
        userRef.current = null
        roomRef.current = null
        targetRoomId.current = null
        setUser(null)
        setRoom(null)
        setRooms([])
        setLines([])
        setScreen('login')
        if (ev?.code === 4001 || ev?.reason === 'session_replaced') {
          try {
            localStorage.removeItem(SESSION_STORAGE_KEY)
          } catch {
            // ignore
          }
          setError('You were disconnected because this account logged in from another window or device.')
        }
      },
      onError: () => {
        setStatus('error')
        setError('Unable to connect to chatHub backend.')
      },
      onMessage: (msg) => handleMessageRef.current(msg),
    })

    socketRef.current = socket
    return socket
  }

  function connectWith(name: string, pass: string) {
    setError(null)
    setStatus('connecting')
    pendingAuth.current = { username: name, password: pass }
    const socket = ensureSocket()
    if (socket.connected) {
      socket.send({ type: 'auth', username: name, password: pass })
      pendingAuth.current = null
    } else {
      socket.connect(wsUrl)
    }
  }

  // Auto-restore session on mount (such as page reload with F5 / Ctrl+F5)
  useEffect(() => {
    try {
      const savedStr = localStorage.getItem(SESSION_STORAGE_KEY)
      if (savedStr) {
        const saved: SavedSession = JSON.parse(savedStr)
        if (saved.user_id && saved.session_token) {
          if (saved.room_id) {
            targetRoomId.current = saved.room_id
          }
          setStatus('connecting')
          pendingAuth.current = {
            user_id: saved.user_id,
            session_token: saved.session_token,
            username: saved.username,
          }
          const socket = ensureSocket()
          if (!socket.connected) {
            socket.connect(wsUrl)
          }
        }
      }
    } catch {
      // ignore
    }
  }, [wsUrl])

  useEffect(() => {
    return () => {
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [])

  function onLogin(e: FormEvent) {
    e.preventDefault()
    const name = username.trim()
    const pass = password.trim()
    if (!name) {
      setError('Please enter your username.')
      return
    }
    if (!pass) {
      setError('Please enter your password.')
      return
    }
    connectWith(name, pass)
  }

  function logout() {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    } catch {
      // ignore
    }
    if (socketRef.current?.connected) {
      socketRef.current.send({ type: 'logout' })
    }
    targetRoomId.current = null
    userRef.current = null
    roomRef.current = null
    socketRef.current?.close()
    socketRef.current = null
    setUser(null)
    setRoom(null)
    setRooms([])
    setKnownUsers([])
    setSelectedAllowedUsers([])
    setUserSearchQuery('')
    setManageUserSearchQuery('')
    setLines([])
    setScreen('login')
    setStatus('idle')
    setError(null)
    setSuccessMsg(null)
    setPassword('')
  }

  function toggleAllowedUser(targetName: string) {
    setSelectedAllowedUsers((prev) =>
      prev.includes(targetName) ? prev.filter((name) => name !== targetName) : [...prev, targetName],
    )
  }

  function selectAllOnline() {
    const onlineNames = otherKnownUsers.filter((u) => u.is_online).map((u) => u.username)
    setSelectedAllowedUsers((prev) => Array.from(new Set([...prev, ...onlineNames])))
  }

  function clearSelectedUsers() {
    setSelectedAllowedUsers([])
  }

  function createRoom(e: FormEvent) {
    e.preventDefault()
    const name = roomName.trim()
    if (!name) {
      setError('Please enter a room name.')
      return
    }

    socketRef.current?.send({
      type: 'create_room',
      name,
      is_private: isPrivate,
      allowed_usernames: isPrivate ? selectedAllowedUsers : [],
    })
    setRoomName('')
    setIsPrivate(false)
    setSelectedAllowedUsers([])
    setUserSearchQuery('')
  }

  function quickInvite(targetUsername: string) {
    if (!room) return
    socketRef.current?.send({
      type: 'add_room_member',
      room_id: room.room_id,
      username: targetUsername,
    })
  }

  function addMemberPermission(e: FormEvent) {
    e.preventDefault()
    const target = inviteInput.trim()
    if (!target || !room) return
    socketRef.current?.send({
      type: 'add_room_member',
      room_id: room.room_id,
      username: target,
    })
    setInviteInput('')
  }

  function removeMemberPermission(targetUsername: string) {
    if (!room) return
    socketRef.current?.send({
      type: 'remove_room_member',
      room_id: room.room_id,
      username: targetUsername,
    })
  }

  function joinRoom(roomId: string) {
    socketRef.current?.send({ type: 'join_room', room_id: roomId })
  }

  function switchProfile(next: 'host' | 'member') {
    if (!user || user.active_role === next) return
    socketRef.current?.send({ type: 'change_profile', profile: next })
  }

  function leaveRoom() {
    socketRef.current?.send({ type: 'leave_room' })
  }

  function sendChat(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    socketRef.current?.send({ type: 'chat', text })
    setDraft('')
  }

  // Admin Actions
  function handleCreateUnit(e: FormEvent) {
    e.preventDefault()
    if (!newUnitId.trim() || !newUnitName.trim()) {
      setError('Please provide unit code and name.')
      return
    }
    socketRef.current?.send({
      type: 'create_unit',
      id: newUnitId.trim(),
      name: newUnitName.trim(),
    })
    setNewUnitId('')
    setNewUnitName('')
  }

  function handleCreateUser(e: FormEvent) {
    e.preventDefault()
    if (!newUserName.trim() || !newUserPassword.trim()) {
      setError('Please enter username and password for the new user.')
      return
    }
    socketRef.current?.send({
      type: 'admin_create_user',
      username: newUserName.trim(),
      password: newUserPassword.trim(),
      profile: newUserProfile,
      unit_id: newUserUnit,
    })
    setNewUserName('')
    setNewUserPassword('')
  }

  function handleResetPassword(e: FormEvent) {
    e.preventDefault()
    if (!resetPwdUserId || !resetPwdValue.trim()) {
      setError('Please enter the new password.')
      return
    }
    socketRef.current?.send({
      type: 'admin_reset_password',
      user_id: resetPwdUserId,
      new_password: resetPwdValue.trim(),
    })
  }

  function requestUpdateUserRole(targetUser: KnownUser, newProfile: Profile) {
    if (targetUser.profile === newProfile) return
    setRoleChangeModal({ targetUser, newProfile })
  }

  function confirmUpdateUserRole() {
    if (!roleChangeModal) return
    const { targetUser, newProfile } = roleChangeModal
    socketRef.current?.send({
      type: 'admin_update_user',
      user_id: targetUser.user_id,
      profile: newProfile,
      unit_id: targetUser.unit_id || 'ICCT',
    })
    setRoleChangeModal(null)
  }

  function handleUpdateUserUnit(targetUser: KnownUser, newUnitId: string) {
    socketRef.current?.send({
      type: 'admin_update_user',
      user_id: targetUser.user_id,
      profile: targetUser.profile,
      unit_id: newUnitId,
    })
  }

  return (
    <div className="app">
      <div className="atmosphere" aria-hidden />
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">ch</span>
          <div>
            <p className="brand-name">chatHub</p>
            <p className="brand-sub">real-time chat rooms</p>
          </div>
        </div>
        <div className="panel-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <div className={`status status-${status}`}>
            <span className="dot" />
            {statusLabel(status)}
          </div>
          {user && (
            <button type="button" className="ghost danger" onClick={logout} title="Sign out of chatHub">
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="shell">
        {error && <p className="banner">{error}</p>}
        {successMsg && <p className="banner banner-success">{successMsg}</p>}

        {screen === 'login' && (
          <section className="panel login-panel">
            <h1>Sign in to chatHub</h1>
            <p className="lead">
              Enter your registered username and password. Users belong to a system unit (e.g.{' '}
              <strong>ICCT</strong>, <strong>F1</strong>, <strong>F2</strong>).
            </p>
            <form className="stack" onSubmit={onLogin}>
              <label>
                Username
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. admin or ian"
                  autoFocus
                  required
                />
              </label>
              <label>
                Password
                <div className="password-input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    className="toggle-password-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>

              <button type="submit" disabled={status === 'connecting'}>
                {status === 'connecting' ? 'Verifying credentials…' : 'Sign In'}
              </button>
            </form>
            <p className="hint">WS: {wsUrl}</p>
          </section>
        )}

        {screen === 'lobby' && user && (
          <section className="panel lobby-panel">
            <div className="panel-head">
              <div>
                <h1>Lobby</h1>
                <div className="user-profile-summary">
                  <span>Logged in as: <strong>{user.username}</strong></span>
                  <span className={`profile-badge profile-${user.profile}`}>
                    {user.profile === 'host_member' ? 'host & member' : user.profile}
                  </span>
                  <span className="meta-tag org-tag">🏢 UNIT: {user.unit_id || 'ICCT'}</span>
                </div>
              </div>

              {user.profile === 'admin' && (
                <div className="tab-nav">
                  <button
                    type="button"
                    className={`tab-btn ${lobbyTab === 'rooms' ? 'active' : ''}`}
                    onClick={() => setLobbyTab('rooms')}
                  >
                    💬 Chat Rooms
                  </button>
                  <button
                    type="button"
                    className={`tab-btn ${lobbyTab === 'admin' ? 'active' : ''}`}
                    onClick={() => setLobbyTab('admin')}
                  >
                    ⚙️ Administration
                  </button>
                </div>
              )}
            </div>

            {user.profile === 'host_member' && (
              <fieldset className="profiles lobby-profiles">
                <legend>Active role</legend>
                <div className="profile-options">
                  <label className={(user.active_role || 'host') === 'host' ? 'chip active' : 'chip'}>
                    <input
                      type="radio"
                      name="lobby-profile"
                      checked={(user.active_role || 'host') === 'host'}
                      onChange={() => switchProfile('host')}
                    />
                    host
                  </label>
                  <label className={(user.active_role || 'host') === 'member' ? 'chip active' : 'chip'}>
                    <input
                      type="radio"
                      name="lobby-profile"
                      checked={(user.active_role || 'host') === 'member'}
                      onChange={() => switchProfile('member')}
                    />
                    member
                  </label>
                </div>
              </fieldset>
            )}

            {lobbyTab === 'rooms' && (
              <>
                {(user.profile === 'admin' || user.profile === 'host' || (user.profile === 'host_member' && (user.active_role || 'host') === 'host')) && (
                  <form className="create-room-form" onSubmit={createRoom}>
                    <div className="inline-form">
                      <input
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        placeholder="New room name"
                      />
                      <button type="submit">Create room</button>
                    </div>
                    <div className="privacy-options">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={isPrivate}
                          onChange={(e) => {
                            setIsPrivate(e.target.checked)
                            if (!e.target.checked) {
                              setSelectedAllowedUsers([])
                            }
                          }}
                        />
                        <span>Private / Reserved Room 🔒</span>
                      </label>
                      {isPrivate && (
                        <div className="privacy-config-box">
                          {otherKnownUsers.length > 0 ? (
                            <div className="user-picker">
                              <div className="picker-header">
                                <span className="picker-title">
                                  Select existing users ({otherKnownUsers.length} total ·{' '}
                                  {otherKnownUsers.filter((u) => u.is_online).length} online):
                                </span>
                                <div className="picker-actions">
                                  {otherKnownUsers.some((u) => u.is_online) && (
                                    <button
                                      type="button"
                                      className="btn-tiny"
                                      onClick={selectAllOnline}
                                      title="Select all online users"
                                    >
                                      + All Online
                                    </button>
                                  )}
                                  {selectedAllowedUsers.length > 0 && (
                                    <button
                                      type="button"
                                      className="btn-tiny ghost"
                                      onClick={clearSelectedUsers}
                                      title="Clear selected users"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                              </div>

                              {otherKnownUsers.length > 4 && (
                                <input
                                  type="text"
                                  className="search-filter-input"
                                  value={userSearchQuery}
                                  onChange={(e) => setUserSearchQuery(e.target.value)}
                                  placeholder="🔍 Filter users by name or factory..."
                                />
                              )}

                              <div className="picker-scroll-container">
                                <div className="picker-chips">
                                  {filteredLobbyUsers.map((u) => {
                                    const isSelected = selectedAllowedUsers.includes(u.username)
                                    return (
                                      <button
                                        type="button"
                                        key={u.user_id || u.username}
                                        className={`picker-chip ${isSelected ? 'active' : ''}`}
                                        onClick={() => toggleAllowedUser(u.username)}
                                        title={`${u.username} (${u.unit_id || 'ICCT'}) - ${
                                          u.is_online ? 'online' : 'offline'
                                        }`}
                                      >
                                        <span
                                          className={`status-indicator ${
                                            u.is_online ? 'online' : 'offline'
                                          }`}
                                        />
                                        <span className="user-name">{u.username}</span>
                                        <span className="chip-unit">[{u.unit_id || 'ICCT'}]</span>
                                        <span className="chip-badge">{isSelected ? '✓' : '+'}</span>
                                      </button>
                                    )
                                  })}
                                  {filteredLobbyUsers.length === 0 && (
                                    <span className="no-matches">
                                      No users matching "{userSearchQuery}"
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className="no-matches">No other registered users yet.</span>
                          )}
                          {selectedAllowedUsers.length > 0 && (
                            <div className="selected-summary">
                              Selected users ({selectedAllowedUsers.length}):{' '}
                              <strong>{selectedAllowedUsers.join(', ')}</strong>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </form>
                )}

                <h2 className="section-title">Available Rooms</h2>
                <ul className="room-list">
                  {rooms.length === 0 && (
                    <li className="empty">No open rooms. Create one above to get started.</li>
                  )}
                  {rooms.map((r) => (
                    <li key={r.room_id}>
                      <div>
                        <strong className="room-title">
                          {r.name}
                          {r.is_private && (
                            <span className="private-badge" title="Reserved / Private room">
                              🔒 Private
                            </span>
                          )}
                        </strong>
                        <span>
                          {r.member_count} online · Room ID: {r.room_id}
                        </span>
                      </div>
                      <button type="button" onClick={() => joinRoom(r.room_id)}>
                        Join
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {lobbyTab === 'admin' && user.profile === 'admin' && (
              <div className="admin-dashboard">
                <div className="admin-grid">
                  {/* Create User Card */}
                  <div className="admin-card">
                    <h3>➕ Create System User</h3>
                    <form className="admin-form" onSubmit={handleCreateUser}>
                      <label>
                        Username
                        <input
                          type="text"
                          value={newUserName}
                          onChange={(e) => setNewUserName(e.target.value)}
                          placeholder="e.g. carlos"
                          required
                        />
                      </label>
                      <label>
                        Password
                        <div className="password-input-wrapper">
                          <input
                            type={showNewUserPassword ? 'text' : 'password'}
                            value={newUserPassword}
                            onChange={(e) => setNewUserPassword(e.target.value)}
                            placeholder="e.g. secret123"
                            required
                          />
                          <button
                            type="button"
                            className="toggle-password-btn"
                            onClick={() => setShowNewUserPassword((prev) => !prev)}
                            title={showNewUserPassword ? 'Hide password' : 'Show password'}
                            aria-label={showNewUserPassword ? 'Hide password' : 'Show password'}
                          >
                            {showNewUserPassword ? (
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                              </svg>
                            ) : (
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                <circle cx="12" cy="12" r="3" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </label>
                      <div className="form-row">
                        <label>
                          Role
                          <select
                            value={newUserProfile}
                            onChange={(e) => setNewUserProfile(e.target.value as Profile)}
                          >
                            <option value="member">Member only</option>
                            <option value="host">Host only</option>
                            <option value="host_member">Host & Member</option>
                            <option value="admin">Admin</option>
                          </select>
                        </label>
                        <label>
                          Unit
                          <select
                            value={newUserUnit}
                            onChange={(e) => setNewUserUnit(e.target.value)}
                          >
                            {units.map((un) => (
                              <option key={un.id} value={un.id}>
                                {un.id} - {un.name}
                              </option>
                            ))}
                            {units.length === 0 && (
                              <>
                                <option value="ICCT">ICCT - Instituto ICCT</option>
                                <option value="F1">F1 - Fábrica F1</option>
                                <option value="F2">F2 - Fábrica F2</option>
                              </>
                            )}
                          </select>
                        </label>
                      </div>
                      <button type="submit">Create User</button>
                    </form>
                  </div>

                  {/* Create Unit Card */}
                  <div className="admin-card">
                    <h3>🏢 Create New Unit</h3>
                    <form className="admin-form" onSubmit={handleCreateUnit}>
                      <label>
                        Unit Code / ID
                        <input
                          type="text"
                          value={newUnitId}
                          onChange={(e) => setNewUnitId(e.target.value)}
                          placeholder="e.g. F3 or LAB or MATRIZ"
                          required
                        />
                      </label>
                      <label>
                        Unit Name
                        <input
                          type="text"
                          value={newUnitName}
                          onChange={(e) => setNewUnitName(e.target.value)}
                          placeholder="e.g. Fábrica 3"
                          required
                        />
                      </label>
                      <button type="submit">Register Unit</button>
                    </form>
                  </div>
                </div>

                {/* Modal de Confirmação para Alteração de Role */}
                {roleChangeModal && (
                  <div className="modal-backdrop">
                    <div className="modal-card">
                      <h3>⚠️ Confirm Role Change</h3>
                      <p>
                        Are you sure you want to change role for user{' '}
                        <strong>{roleChangeModal.targetUser.username}</strong> from{' '}
                        <span className="role-chip old-role">{roleChangeModal.targetUser.profile}</span> to{' '}
                        <span className="role-chip new-role">{roleChangeModal.newProfile}</span>?
                      </p>
                      <div className="modal-actions">
                        <button type="button" onClick={confirmUpdateUserRole}>
                          Confirm Change
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setRoleChangeModal(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Password Reset Modal / Panel */}
                {resetPwdUserId && (
                  <div className="modal-backdrop">
                    <div className="modal-card">
                      <h3>🔑 Reset Password</h3>
                      <p>
                        Resetting password for user:{' '}
                        <strong>
                          {knownUsers.find((u) => u.user_id === resetPwdUserId)?.username}
                        </strong>
                      </p>
                      <form onSubmit={handleResetPassword}>
                        <label>
                          New Password:
                          <div className="password-input-wrapper">
                            <input
                              type={showResetPassword ? 'text' : 'password'}
                              value={resetPwdValue}
                              onChange={(e) => setResetPwdValue(e.target.value)}
                              placeholder="Enter new password..."
                              autoFocus
                              required
                            />
                            <button
                              type="button"
                              className="toggle-password-btn"
                              onClick={() => setShowResetPassword((prev) => !prev)}
                              title={showResetPassword ? 'Hide password' : 'Show password'}
                              aria-label={showResetPassword ? 'Hide password' : 'Show password'}
                            >
                              {showResetPassword ? (
                                <svg
                                  width="15"
                                  height="15"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                  <line x1="1" y1="1" x2="23" y2="23" />
                                </svg>
                              ) : (
                                <svg
                                  width="15"
                                  height="15"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </label>
                        <div className="modal-actions">
                          <button type="submit">Save Password</button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => {
                              setResetPwdUserId(null)
                              setResetPwdValue('')
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* Registered Users Table */}
                <div className="admin-section">
                  <h3>👥 Registered System Users ({knownUsers.length})</h3>
                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Username</th>
                          <th>Role</th>
                          <th>UNIT</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {knownUsers.map((u) => (
                          <tr key={u.user_id}>
                            <td>
                              <span className={`status-pill ${u.is_online ? 'online' : 'offline'}`}>
                                {u.is_online ? 'Online' : 'Offline'}
                              </span>
                            </td>
                            <td>
                              <strong>{u.username}</strong>
                            </td>
                            <td>
                              <select
                                className="table-select"
                                value={u.profile}
                                onChange={(e) =>
                                  requestUpdateUserRole(u, e.target.value as Profile)
                                }
                              >
                                <option value="member">member</option>
                                <option value="host">host</option>
                                <option value="host_member">host & member</option>
                                <option value="admin">admin</option>
                              </select>
                            </td>
                            <td>
                              <select
                                className="table-select"
                                value={u.unit_id || 'ICCT'}
                                onChange={(e) => handleUpdateUserUnit(u, e.target.value)}
                              >
                                {units.map((un) => (
                                  <option key={un.id} value={un.id}>
                                    {un.id}
                                  </option>
                                ))}
                                {units.length === 0 && (
                                  <>
                                    <option value="ICCT">ICCT</option>
                                    <option value="F1">F1</option>
                                    <option value="F2">F2</option>
                                  </>
                                )}
                              </select>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn-tiny"
                                onClick={() => setResetPwdUserId(u.user_id)}
                                title="Reset user password"
                              >
                                🔑 Reset Pwd
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Units Directory */}
                <div className="admin-section">
                  <h3>🏢 System Units ({units.length})</h3>
                  <div className="factories-grid">
                    {units.map((un) => (
                      <div key={un.id} className="factory-chip-card">
                        <span className="factory-code">{un.id}</span>
                        <div>
                          <strong>{un.name}</strong>
                          <p className="subtext">Unit Code: {un.id}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {screen === 'room' && user && room && (
          <section className="panel room-panel">
            <div className="panel-head">
              <div>
                <h1 className="room-title">
                  {room.name}
                  {room.is_private && <span className="private-badge">🔒 Private</span>}
                </h1>
                <p className="lead">
                  {room.member_count} online · {user.username} [{user.unit_id || 'ICCT'}]
                </p>
              </div>
              <button type="button" className="ghost" onClick={leaveRoom}>
                Leave room
              </button>
            </div>

            {room.is_private && (room.created_by === user.user_id || user.profile === 'admin') && (
              <div className="management-box">
                <header className="management-head">
                  <strong>Manage Allowed Users 🔒</strong>
                </header>
                <form className="inline-form manage-form" onSubmit={addMemberPermission}>
                  <input
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    placeholder="Username to grant access"
                  />
                  <button type="submit">Invite</button>
                </form>

                {availableToInvite.length > 0 && (
                  <div className="quick-invite-box">
                    <div className="picker-header">
                      <span className="picker-title">
                        Quick invite existing users ({availableToInvite.length} available):
                      </span>
                    </div>

                    {availableToInvite.length > 4 && (
                      <input
                        type="text"
                        className="search-filter-input"
                        value={manageUserSearchQuery}
                        onChange={(e) => setManageUserSearchQuery(e.target.value)}
                        placeholder="🔍 Filter users to invite..."
                      />
                    )}

                    <div className="picker-scroll-container">
                      <div className="picker-chips">
                        {filteredManageUsers.map((u) => (
                          <button
                            type="button"
                            key={u.user_id || u.username}
                            className="picker-chip"
                            onClick={() => quickInvite(u.username)}
                            title={`Grant access to ${u.username} (${u.unit_id || 'ICCT'}) - ${
                              u.is_online ? 'online' : 'offline'
                            }`}
                          >
                            <span
                              className={`status-indicator ${u.is_online ? 'online' : 'offline'}`}
                            />
                            <span className="user-name">{u.username}</span>
                            <span className="chip-unit">[{u.unit_id || 'ICCT'}]</span>
                            <span className="chip-badge">+</span>
                          </button>
                        ))}
                        {filteredManageUsers.length === 0 && (
                          <span className="no-matches">
                            No users matching "{manageUserSearchQuery}"
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {room.allowed_usernames && room.allowed_usernames.length > 0 && (
                  <div className="allowed-chips">
                    {room.allowed_usernames.map((u) => (
                      <span key={u} className="user-tag">
                        {u}
                        {u.toLowerCase() !== user.username.toLowerCase() && (
                          <button
                            type="button"
                            className="remove-btn"
                            onClick={() => removeMemberPermission(u)}
                            title={`Revoke access for ${u}`}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="transcript">
              {lines.length === 0 && (
                <p className="empty">No messages yet. Say hello!</p>
              )}
              {lines.map((line) =>
                line.kind === 'system' ? (
                  <p key={line.id} className="sys">
                    {line.text}
                  </p>
                ) : (
                  <article
                    key={line.id}
                    className={
                      line.username === user.username ? 'bubble mine' : 'bubble'
                    }
                  >
                    <header>{line.username}</header>
                    <p>{line.text}</p>
                  </article>
                ),
              )}
              <div ref={bottomRef} />
            </div>

            <form className="composer" onSubmit={sendChat}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message..."
                autoFocus
              />
              <button type="submit">Send</button>
            </form>
          </section>
        )}
      </main>
    </div>
  )
}

function statusLabel(status: Status) {
  switch (status) {
    case 'connecting':
      return 'connecting'
    case 'online':
      return 'online'
    case 'offline':
      return 'offline'
    case 'error':
      return 'error'
    default:
      return 'ready'
  }
}
