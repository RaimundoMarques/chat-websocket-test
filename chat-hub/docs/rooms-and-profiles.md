# Perfis e salas

Configuração em `app/config.py`.

## Perfis

| Perfil | Criar sala | Entrar em sala | Enviar chat | Trocar perfil |
|--------|------------|----------------|-------------|---------------|
| `host` | sim | sim | sim (dentro da sala) | sim (no lobby) |
| `member` | não | sim | sim (dentro da sala) | sim (no lobby) |

- Perfis válidos: `VALID_PROFILES = {host, member}`
- Quem pode criar sala: `ROOM_CREATOR_PROFILES = {host}`

Auth é por conexão: fecha o WebSocket → usuário some do hub.

## Visibilidade das salas

- Salas criadas ficam visíveis no lobby de **todos os usuários autenticados** (via `rooms_list`).
- A lista é atualizada em tempo real quando uma sala é criada, alguém entra ou sai.
- **Entrar em sala** exige `auth` antes (`join_room` sem autenticação retorna `unauthenticated`).
- Quem ainda não conectou (tela de login) não vê salas.

## Salas

| Regra | Valor |
|-------|-------|
| Capacidade | Sem limite de usuários por sala |
| Criador | Entra automaticamente na sala |
| Um usuário | Só pode estar em **uma** sala por vez |
| Sala vazia | Permanece listada no hub |
| Chat | Só entre membros da mesma sala |

## Ciclo de vida da sala

1. `host` autentica e chama `create_room`
2. Outros usuários entram com `join_room` (quantos forem necessários)
3. Saídas via `leave_room` ou disconnect notificam a sala (`system` + `room_update`)
4. Último membro sair → sala permanece disponível para novos entrantes

## Identificadores

- `user_id` e `room_id`: gerados como UUID truncado (8 caracteres hex)
- `username`: único enquanto o usuário estiver conectado
