# API WebSocket

Endpoint: `ws://localhost:8765`

Todas as mensagens (ida e volta) são **JSON** com o campo obrigatório `type`.

---

## Cliente → Servidor

### `auth`

Autentica o usuário no banco de dados com username e senha. Obrigatório antes de qualquer outra ação.

```json
{"type": "auth", "username": "admin", "password": "admin123"}
```

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|-------|
| `username` | string | sim | Nome de usuário cadastrado |
| `password` | string | sim | Senha do usuário |

### `admin_create_user`

Permite ao administrador (`admin`) cadastrar novos usuários com unidade (UNIT) vinculada.

```json
{
  "type": "admin_create_user",
  "username": "carlos",
  "password": "user123",
  "profile": "member",
  "unit_id": "F1"
}
```

### `create_unit`

Permite ao administrador (`admin`) criar novas unidades (ex: `ICCT`, `F1`, `F2`, `F3`).

```json
{
  "type": "create_unit",
  "id": "F3",
  "name": "Fábrica 3 - Produção"
}
```

### `admin_reset_password`

Permite ao administrador redefinir a senha de um usuário.

```json
{
  "type": "admin_reset_password",
  "user_id": "a1b2c3d4",
  "new_password": "newpassword123"
}
```

### `create_room`

Cria uma sala. Só `host`. O criador **entra automaticamente**. Permite configurar privacidade (`is_private`) e convidados autorizados (`allowed_usernames`).

```json
{
  "type": "create_room",
  "name": "Sala Privada",
  "is_private": true,
  "allowed_usernames": ["ana", "carlos"]
}
```

### `add_room_member`

Exige que o usuário seja o Host criador da sala. Concede acesso para um usuário na sala privada.

```json
{
  "type": "add_room_member",
  "room_id": "abc12345",
  "username": "denysson"
}
```

### `remove_room_member`

Exige que o usuário seja o Host criador da sala. Revoga o acesso e desconecta o usuário se ele estiver na sala.

```json
{
  "type": "remove_room_member",
  "room_id": "abc12345",
  "username": "denysson"
}
```

### `join_room`

Entra em uma sala existente.

```json
{"type": "join_room", "room_id": "abc12345"}
```

### `leave_room`

Sai da sala atual. Se a sala ficar vazia, ela é removida.

```json
{"type": "leave_room"}
```

### `list_rooms`

Lista salas abertas no hub.

```json
{"type": "list_rooms"}
```

### `change_profile`

Troca o perfil do usuário autenticado. Só no lobby (fora de sala).

```json
{"type": "change_profile", "profile": "member"}
```

### `chat`

Envia mensagem de texto para a sala em que o usuário está.

```json
{"type": "chat", "text": "olá"}
```

---

## Servidor → Cliente

### `auth_ok`

```json
{
  "type": "auth_ok",
  "user": {
    "user_id": "22d909e2",
    "username": "Ana",
    "profile": "host",
    "room_id": null
  }
}
```

Logo em seguida o servidor envia `rooms_list` com as salas disponíveis. Entrar em sala exige autenticação prévia (`auth`).

### `profile_changed`

Resposta após `change_profile` bem-sucedido.

```json
{
  "type": "profile_changed",
  "user": {
    "user_id": "22d909e2",
    "username": "Ana",
    "profile": "member",
    "room_id": null
  }
}
```

### `room_created` / `room_joined`

```json
{
  "type": "room_created",
  "room": {
    "room_id": "b9464bf8",
    "name": "Sala Demo",
    "created_by": "22d909e2",
    "members": ["22d909e2"],
    "member_count": 1
  }
}
```

`room_joined` usa o mesmo formato de `room`.

### `room_left`

```json
{"type": "room_left", "room_id": "b9464bf8"}
```

### `rooms_list`

Lista salas abertas. Enviado automaticamente após `auth_ok` e reenviado ao lobby quando salas são criadas, entradas ou saídas mudam a disponibilidade.

```json
{
  "type": "rooms_list",
  "rooms": [ /* objetos room */ ]
}
```

### `room_update`

Enviado aos membros da sala quando a lista de membros muda.

```json
{"type": "room_update", "room": { /* room atualizado */ }}
```

### `chat_history`

Enviado logo após `room_created` ou `room_joined`, com o histórico persistido da sala.

```json
{
  "type": "chat_history",
  "room_id": "b9464bf8",
  "messages": [
    {
      "id": 1,
      "from_user": {
        "user_id": "11e5bffd",
        "username": "Bob",
        "profile": "member",
        "room_id": "b9464bf8"
      },
      "text": "Oi",
      "ts": "2026-08-27T18:24:01.297280+00:00"
    }
  ]
}
```

### `chat`

Broadcast na sala (incluindo o remetente). Também usado para novas mensagens em tempo real.

```json
{
  "type": "chat",
  "room_id": "b9464bf8",
  "id": 1,
  "from_user": {
    "user_id": "11e5bffd",
    "username": "Bob",
    "profile": "member",
    "room_id": "b9464bf8"
  },
  "text": "Oi",
  "ts": "2026-08-27T18:24:01.297280+00:00"
}
```

### `system`

Eventos de presença na sala.

```json
{
  "type": "system",
  "room_id": "b9464bf8",
  "event": "user_joined",
  "user": { /* user público */ },
  "ts": "2026-08-27T18:24:01.297280+00:00"
}
```

`event`: `user_joined` | `user_left`

### `error`

```json
{
  "type": "error",
  "code": "forbidden",
  "message": "Apenas usuários com perfil 'host' podem criar salas."
}
```

#### Códigos de erro

| code | Situação |
|------|----------|
| `invalid_json` | Payload não é JSON |
| `invalid_message` | Sem campo `type` |
| `unknown_type` | `type` desconhecido |
| `unauthenticated` | Ação sem `auth` prévio |
| `invalid_username` | Username vazio |
| `invalid_profile` | Perfil fora de `host`/`member` |
| `username_taken` | Username já conectado |
| `forbidden` | Sem permissão (ex.: member criar sala) |
| `invalid_room_name` | Nome da sala vazio |
| `already_in_room` | Já está em uma sala |
| `not_in_room` | Precisa estar em sala |
| `room_not_found` | `room_id` inexistente |
| `empty_message` | Chat sem texto |
| `in_room` | Troca de perfil dentro de sala |

---

## Fluxo recomendado

```
1. auth (host)
2. create_room
3. (outros) auth (member) → list_rooms → join_room
4. chat
5. leave_room / disconnect
```
