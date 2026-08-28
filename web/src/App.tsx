import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ChatSocket, getWsUrl } from './lib/ws'
import type { ChatLine, Profile, Room, ServerMessage, User } from './types'

type Screen = 'login' | 'lobby' | 'room'
type Status = 'idle' | 'connecting' | 'online' | 'offline' | 'error'

let lineSeq = 0
function nextId() {
  lineSeq += 1
  return String(lineSeq)
}

export default function App() {
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
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const wsUrl = useMemo(() => getWsUrl(), [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  useEffect(() => {
    return () => socketRef.current?.close()
  }, [])

  function ensureSocket() {
    if (socketRef.current) return socketRef.current

    const socket = new ChatSocket({
      onOpen: () => {
        setStatus('online')
        const pending = pendingAuth.current
        if (pending) {
          socket.send({
            type: 'auth',
            username: pending.username,
            profile: pending.profile,
          })
          pendingAuth.current = null
        }
      },
      onClose: () => {
        setStatus('offline')
        setScreen('login')
        setUser(null)
        setRoom(null)
        setRooms([])
        setLines([])
        setError('Conexão encerrada. Entre novamente.')
        socketRef.current = null
      },
      onError: () => {
        setStatus('error')
        setError('Não foi possível conectar ao chatHub.')
      },
      onMessage: handleMessage,
    })

    socketRef.current = socket
    return socket
  }

  function handleMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'auth_ok':
        setUser(msg.user)
        setError(null)
        setScreen('lobby')
        break
      case 'profile_changed':
        setUser(msg.user)
        setProfile(msg.user.profile)
        setError(null)
        break
      case 'rooms_list':
        setRooms(msg.rooms)
        break
      case 'room_created':
      case 'room_joined':
        setRoom(msg.room)
        setUser((u) => (u ? { ...u, room_id: msg.room.room_id } : u))
        setLines([])
        setScreen('room')
        setError(null)
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
        setRoom((current) =>
          current && current.room_id === msg.room.room_id ? msg.room : current,
        )
        setRooms((list) => {
          const others = list.filter((r) => r.room_id !== msg.room.room_id)
          return [...others, msg.room].sort((a, b) => a.name.localeCompare(b.name))
        })
        break
      case 'room_left':
        setRoom(null)
        setUser((u) => (u ? { ...u, room_id: null } : u))
        setLines([])
        setScreen('lobby')
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
        setError(msg.message)
        break
    }
  }

  function onLogin(e: FormEvent) {
    e.preventDefault()
    const name = username.trim()
    if (!name) {
      setError('Informe um username.')
      return
    }
    setError(null)
    setStatus('connecting')
    pendingAuth.current = { username: name, profile }
    const socket = ensureSocket()
    if (socket.connected) {
      socket.send({ type: 'auth', username: name, profile })
      pendingAuth.current = null
    } else {
      socket.connect(wsUrl)
    }
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
        <div className={`status status-${status}`}>
          <span className="dot" />
          {statusLabel(status)}
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
              <button type="button" className="ghost" onClick={refreshRooms}>
                Atualizar
              </button>
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
