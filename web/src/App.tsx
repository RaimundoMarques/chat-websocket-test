import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ChatSocket, getWsUrl } from './lib/ws'
import type { ChatLine, Profile, Room, ServerMessage, User } from './types'

type Screen = 'login' | 'lobby' | 'room'
type Status = 'idle' | 'connecting' | 'online' | 'offline' | 'error'
type Theme = 'light' | 'dark'

interface SessionData {
  username: string
  profile: Profile
  roomId: string | null
}

const SESSION_STORAGE_KEY = 'chathub_session'
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

function loadSavedSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SessionData>
    if (
      typeof parsed.username === 'string' &&
      parsed.username.trim() &&
      (parsed.profile === 'host' || parsed.profile === 'member')
    ) {
      return {
        username: parsed.username.trim(),
        profile: parsed.profile,
        roomId: typeof parsed.roomId === 'string' ? parsed.roomId : null,
      }
    }
  } catch {
    // ignore parsing errors
  }
  return null
}

function saveSession(data: SessionData | null) {
  try {
    if (data) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data))
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  } catch {
    // ignore storage errors
  }
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
  const [draft, setDraft] = useState('')

  const socketRef = useRef<ChatSocket | null>(null)
  const pendingAuth = useRef<{ username: string; profile: Profile } | null>(null)
  const targetRoomId = useRef<string | null>(null)
  const userRef = useRef<User | null>(null)
  const roomRef = useRef<Room | null>(null)
  const handleMessageRef = useRef<(msg: ServerMessage) => void>(() => {})
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const wsUrl = useMemo(() => getWsUrl(), [])

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
        saveSession({
          username: msg.user.username,
          profile: msg.user.profile,
          roomId: targetRoomId.current,
        })

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
        saveSession({
          username: msg.user.username,
          profile: msg.user.profile,
          roomId: roomRef.current ? roomRef.current.room_id : null,
        })
        break

      case 'rooms_list':
        setRooms(msg.rooms)
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
        if (userRef.current) {
          saveSession({
            username: userRef.current.username,
            profile: userRef.current.profile,
            roomId: msg.room.room_id,
          })
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
        if (userRef.current) {
          saveSession({
            username: userRef.current.username,
            profile: userRef.current.profile,
            roomId: null,
          })
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
                ? `${msg.user.username} entrou`
                : `${msg.user.username} saiu`,
            ts: msg.ts,
          },
        ])
        break

      case 'error':
        if (msg.code === 'room_not_found') {
          targetRoomId.current = null
          if (userRef.current) {
            saveSession({
              username: userRef.current.username,
              profile: userRef.current.profile,
              roomId: null,
            })
          }
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
      onClose: () => {
        setStatus('offline')
        socketRef.current = null
      },
      onError: () => {
        setStatus('error')
        setError('Não foi possível conectar ao chatHub.')
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

  // Restaura sessão do localStorage automaticamente ao carregar/dar refresh
  useEffect(() => {
    const saved = loadSavedSession()
    if (saved) {
      setUsername(saved.username)
      setProfile(saved.profile)
      targetRoomId.current = saved.roomId
      connectWith(saved.username, saved.profile)
    }

    return () => {
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [])

  function onLogin(e: FormEvent) {
    e.preventDefault()
    const name = username.trim()
    if (!name) {
      setError('Informe um username.')
      return
    }
    connectWith(name, profile)
  }

  function logout() {
    saveSession(null)
    targetRoomId.current = null
    userRef.current = null
    roomRef.current = null
    socketRef.current?.close()
    socketRef.current = null
    setUser(null)
    setRoom(null)
    setRooms([])
    setLines([])
    setScreen('login')
    setStatus('idle')
    setError(null)
  }

  function refreshRooms() {
    socketRef.current?.send({ type: 'list_rooms' })
  }

  function createRoom(e: FormEvent) {
    e.preventDefault()
    const name = roomName.trim()
    if (!name) {
      setError('Informe o nome da sala.')
      return
    }
    socketRef.current?.send({ type: 'create_room', name })
    setRoomName('')
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
            <p className="brand-sub">salas em tempo real</p>
          </div>
        </div>
        <div className="panel-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
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
            <button type="button" className="ghost danger" onClick={logout} title="Desconectar do chatHub">
              Sair da conta
            </button>
          )}
        </div>
      </header>

      <main className="shell">
        {error && <p className="banner">{error}</p>}

        {screen === 'login' && (
          <section className="panel login-panel">
            <h1>Entrar no hub</h1>
            <p className="lead">
              Informe um username e conecte para ver as salas. Só usuários autenticados
              podem entrar. Hosts criam salas; members entram e conversam.
            </p>
            <form className="stack" onSubmit={onLogin}>
              <label>
                Username
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ex.: Ana"
                  autoFocus
                />
              </label>
              <fieldset className="profiles">
                <legend>Perfil</legend>
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
                {status === 'connecting' ? 'Conectando…' : 'Conectar'}
              </button>
            </form>
            <p className="hint">WS: {wsUrl}</p>
          </section>
        )}

        {screen === 'lobby' && user && (
          <section className="panel lobby-panel">
            <div className="panel-head">
              <div>
                <h1>Salas</h1>
                <p className="lead">
                  Olá, <strong>{user.username}</strong>
                  <span className="profile-badge">{user.profile}</span>
                </p>
              </div>
              <div className="panel-actions">
                <button type="button" className="ghost" onClick={refreshRooms}>
                  Atualizar
                </button>
              </div>
            </div>

            <fieldset className="profiles lobby-profiles">
              <legend>Trocar perfil</legend>
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
              <form className="inline-form" onSubmit={createRoom}>
                <input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Nome da nova sala"
                />
                <button type="submit">Criar sala</button>
              </form>
            )}

            <ul className="room-list">
              {rooms.length === 0 && (
                <li className="empty">Nenhuma sala aberta. Aguarde um host criar uma.</li>
              )}
              {rooms.map((r) => (
                <li key={r.room_id}>
                  <div>
                    <strong>{r.name}</strong>
                    <span>
                      {r.member_count} online · {r.room_id}
                    </span>
                  </div>
                  <button type="button" onClick={() => joinRoom(r.room_id)}>
                    Entrar
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
                <h1>{room.name}</h1>
                <p className="lead">
                  {room.member_count} online · {user.username}
                </p>
              </div>
              <button type="button" className="ghost" onClick={leaveRoom}>
                Sair da sala
              </button>
            </div>

            <div className="transcript">
              {lines.length === 0 && (
                <p className="empty">Nenhuma mensagem ainda. Diga oi.</p>
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
                placeholder="Escreva uma mensagem"
                autoFocus
              />
              <button type="submit">Enviar</button>
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
      return 'conectando'
    case 'online':
      return 'online'
    case 'offline':
      return 'offline'
    case 'error':
      return 'erro'
    default:
      return 'pronto'
  }
}
