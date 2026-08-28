import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ChatSocket, getWsUrl } from './lib/ws'
import type { ChatLine, KnownUser, Profile, Room, ServerMessage, User } from './types'

type Screen = 'login' | 'lobby' | 'room'
type Status = 'idle' | 'connecting' | 'online' | 'offline' | 'error'
type Theme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'chathub_theme'

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
  const [user, setUser] = useState<User | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [room, setRoom] = useState<Room | null>(null)
  const [lines, setLines] = useState<ChatLine[]>([])
  const [username, setUsername] = useState('')
  const [profile, setProfile] = useState<Profile>('member')
  const [roomName, setRoomName] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [selectedAllowedUsers, setSelectedAllowedUsers] = useState<string[]>([])
  const [knownUsers, setKnownUsers] = useState<KnownUser[]>([])
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [manageUserSearchQuery, setManageUserSearchQuery] = useState('')
  const [inviteInput, setInviteInput] = useState('')
  const [draft, setDraft] = useState('')

  const socketRef = useRef<ChatSocket | null>(null)
  const pendingAuth = useRef<{ username: string; profile: Profile } | null>(null)
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
    return otherKnownUsers.filter((u) => u.username.toLowerCase().includes(q))
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
    return availableToInvite.filter((u) => u.username.toLowerCase().includes(q))
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

        if (targetRoomId.current) {
          socketRef.current?.send({ type: 'join_room', room_id: targetRoomId.current })
        } else {
          setScreen('lobby')
        }
        break

      case 'profile_changed':
        setUser(msg.user)
        userRef.current = msg.user
        setProfile(msg.user.profile)
        setError(null)
        break

      case 'rooms_list':
        setRooms(msg.rooms)
        break

      case 'users_list':
        setKnownUsers(msg.users)
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
        if (msg.code === 'session_replaced') {
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
          socket.send({
            type: 'auth',
            username: pending.username,
            profile: pending.profile,
          })
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
          setError('You were disconnected because this account logged in from another window or device.')
        }
      },
      onError: () => {
        setStatus('error')
        setError('Unable to connect to chatHub.')
      },
      onMessage: (msg) => handleMessageRef.current(msg),
    })

    socketRef.current = socket
    return socket
  }

  function connectWith(name: string, prof: Profile) {
    setError(null)
    setStatus('connecting')
    pendingAuth.current = { username: name, profile: prof }
    const socket = ensureSocket()
    if (socket.connected) {
      socket.send({ type: 'auth', username: name, profile: prof })
      pendingAuth.current = null
    } else {
      socket.connect(wsUrl)
    }
  }

  useEffect(() => {
    return () => {
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [])

  function onLogin(e: FormEvent) {
    e.preventDefault()
    const name = username.trim()
    if (!name) {
      setError('Please enter a username.')
      return
    }
    connectWith(name, profile)
  }

  function logout() {
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

  function switchProfile(next: Profile) {
    if (!user || user.profile === next) return
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

        {screen === 'login' && (
          <section className="panel login-panel">
            <h1>Join the Hub</h1>
            <p className="lead">
              Enter a username and connect to view rooms. Only authenticated users
              can enter. Hosts create rooms; members join and chat.
            </p>
            <form className="stack" onSubmit={onLogin}>
              <label>
                Username
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. Alice"
                  autoFocus
                />
              </label>
              <fieldset className="profiles">
                <legend>Role</legend>
                <label className={profile === 'host' ? 'chip active' : 'chip'}>
                  <input
                    type="radio"
                    name="profile"
                    checked={profile === 'host'}
                    onChange={() => setProfile('host')}
                  />
                  host
                </label>
                <label className={profile === 'member' ? 'chip active' : 'chip'}>
                  <input
                    type="radio"
                    name="profile"
                    checked={profile === 'member'}
                    onChange={() => setProfile('member')}
                  />
                  member
                </label>
              </fieldset>
              <button type="submit" disabled={status === 'connecting'}>
                {status === 'connecting' ? 'Connecting…' : 'Connect'}
              </button>
            </form>
            <p className="hint">WS: {wsUrl}</p>
          </section>
        )}

        {screen === 'lobby' && user && (
          <section className="panel lobby-panel">
            <div className="panel-head">
              <div>
                <h1>Rooms</h1>
                <p className="lead">
                  Hello, <strong>{user.username}</strong>
                  <span className="profile-badge">{user.profile}</span>
                </p>
              </div>
            </div>

            <fieldset className="profiles lobby-profiles">
              <legend>Switch role</legend>
              <div className="profile-options">
                <label className={user.profile === 'host' ? 'chip active' : 'chip'}>
                  <input
                    type="radio"
                    name="lobby-profile"
                    checked={user.profile === 'host'}
                    onChange={() => switchProfile('host')}
                  />
                  host
                </label>
                <label className={user.profile === 'member' ? 'chip active' : 'chip'}>
                  <input
                    type="radio"
                    name="lobby-profile"
                    checked={user.profile === 'member'}
                    onChange={() => switchProfile('member')}
                  />
                  member
                </label>
              </div>
            </fieldset>

            {user.profile === 'host' && (
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
                              Select existing users ({otherKnownUsers.length} total · {otherKnownUsers.filter((u) => u.is_online).length} online):
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
                              placeholder="🔍 Filter users by name..."
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
                                    title={`${u.username} (${u.is_online ? 'online' : 'offline'})`}
                                  >
                                    <span className={`status-indicator ${u.is_online ? 'online' : 'offline'}`} />
                                    <span className="user-name">{u.username}</span>
                                    <span className="chip-badge">{isSelected ? '✓' : '+'}</span>
                                  </button>
                                )
                              })}
                              {filteredLobbyUsers.length === 0 && (
                                <span className="no-matches">No users matching "{userSearchQuery}"</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="no-matches">No other registered users yet.</span>
                      )}
                      {selectedAllowedUsers.length > 0 && (
                        <div className="selected-summary">
                          Selected users ({selectedAllowedUsers.length}): <strong>{selectedAllowedUsers.join(', ')}</strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </form>
            )}

            <ul className="room-list">
              {rooms.length === 0 && (
                <li className="empty">No open rooms. Wait for a host to create one.</li>
              )}
              {rooms.map((r) => (
                <li key={r.room_id}>
                  <div>
                    <strong className="room-title">
                      {r.name}
                      {r.is_private && <span className="private-badge" title="Reserved / Private room">🔒 Private</span>}
                    </strong>
                    <span>
                      {r.member_count} online · {r.room_id}
                    </span>
                  </div>
                  <button type="button" onClick={() => joinRoom(r.room_id)}>
                    Join
                  </button>
                </li>
              ))}
            </ul>
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
                  {room.member_count} online · {user.username}
                </p>
              </div>
              <button type="button" className="ghost" onClick={leaveRoom}>
                Leave room
              </button>
            </div>

            {room.is_private && room.created_by === user.user_id && (
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
                            title={`Grant access to ${u.username} (${u.is_online ? 'online' : 'offline'})`}
                          >
                            <span className={`status-indicator ${u.is_online ? 'online' : 'offline'}`} />
                            <span className="user-name">{u.username}</span>
                            <span className="chip-badge">+</span>
                          </button>
                        ))}
                        {filteredManageUsers.length === 0 && (
                          <span className="no-matches">No users matching "{manageUserSearchQuery}"</span>
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
