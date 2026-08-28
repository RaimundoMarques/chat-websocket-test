# Visão geral

**chatHub** é um sistema de chat em tempo real baseado em WebSocket, com salas, perfis e persistência em PostgreSQL.

## Objetivo

Permitir que usuários autenticados com um perfil específico criem **salas de conversa**, e que outros usuários entrem nessas salas para trocar mensagens.

## Escopo atual

- Backend Python + `asyncio` + `websockets`
- Protocolo de mensagens em JSON
- **PostgreSQL** (Docker) para usuários, salas e mensagens
- Estado ao vivo (conexões / membros online) em memória
- Clientes CLI e **frontend web** (`../web`) para desenvolvimento/teste
- Sem autenticação com senha

## Não objetivos (por enquanto)

- Login real (senha, JWT, OAuth)
- Salas privadas com senha / convite
- Escala multi-instância

## Conceitos principais

| Conceito | Descrição |
|----------|-----------|
| Usuário | Conexão WebSocket autenticada com `username` + `profile` |
| Perfil | `host` ou `member` — define permissões |
| Sala | Canal de chat sem limite de participantes |
| Hub | Servidor central que gerencia conexões, salas e broadcast |
| Banco | PostgreSQL — persiste usuários, salas e histórico de mensagens |
