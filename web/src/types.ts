export type Profile = 'admin' | 'host' | 'member' | 'host_member'

export type Unit = {
  id: string
  name: string
}

export type User = {
  user_id: string
  username: string
  profile: Profile
  active_role?: 'host' | 'member' | 'admin'
  room_id: string | null
  unit_id?: string
  session_token?: string
}

export type KnownUser = {
  user_id: string
  username: string
  profile: Profile
  active_role?: 'host' | 'member' | 'admin'
  is_online: boolean
  unit_id?: string
  unit_name?: string
}

export type Room = {
  room_id: string
  name: string
  created_by: string
  is_private: boolean
  members: string[]
  member_count: number
  allowed_usernames?: string[]
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

export type SavedSession = {
  user_id: string
  username: string
  session_token: string
  room_id?: string | null
}

export type ServerMessage =
  | { type: 'auth_ok'; user: User }
  | { type: 'logout_ok' }
  | { type: 'profile_changed'; user: User }
  | { type: 'room_created'; room: Room }
  | { type: 'room_joined'; room: Room }
  | { type: 'room_left'; room_id: string }
  | { type: 'rooms_list'; rooms: Room[] }
  | { type: 'users_list'; users: KnownUser[] }
  | { type: 'units_list'; units: Unit[] }
  | { type: 'unit_created'; unit: Unit }
  | { type: 'user_created'; user: Partial<KnownUser> }
  | { type: 'user_updated'; user_id: string }
  | { type: 'password_reset'; user_id: string }
  | { type: 'room_update'; room: Room }
  | { type: 'room_permissions_updated'; room: Room }
  | { type: 'chat_history'; room_id: string; messages: ChatMessage[] }
  | { type: 'chat'; room_id: string; id: number; from_user: User; text: string; ts: string }
  | { type: 'system'; room_id: string; event: string; user: User; ts: string }
  | { type: 'error'; code: string; message: string }
