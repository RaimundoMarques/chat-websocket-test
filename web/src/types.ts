export type Profile = 'host' | 'member'

export type User = {
  user_id: string
  username: string
  profile: Profile
  room_id: string | null
}

export type Room = {
  room_id: string
  name: string
  created_by: string
  members: string[]
  member_count: number
}

export type ChatLine = {
  id: string
  kind: 'chat' | 'system'
  text: string
  username?: string
  ts: string
}

export type ChatMessage = {
  id: number
  from_user: User
  text: string
  ts: string
}

export type ServerMessage =
  | { type: 'auth_ok'; user: User }
  | { type: 'profile_changed'; user: User }
  | { type: 'room_created'; room: Room }
  | { type: 'room_joined'; room: Room }
  | { type: 'room_left'; room_id: string }
  | { type: 'rooms_list'; rooms: Room[] }
  | { type: 'room_update'; room: Room }
  | { type: 'chat_history'; room_id: string; messages: ChatMessage[] }
  | { type: 'chat'; room_id: string; id: number; from_user: User; text: string; ts: string }
  | { type: 'system'; room_id: string; event: string; user: User; ts: string }
  | { type: 'error'; code: string; message: string }
