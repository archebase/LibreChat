# ArcheBase LibreChat Deployment

This directory contains the open-source deployment template for ArcheBase's LibreChat fork.
It includes public branding assets and runtime templates only. Do not commit production
secrets, certificates, logs, MongoDB data, Meilisearch data, or backups.

## Files

- `compose.yaml`: Docker Compose template for LibreChat, MongoDB, Meilisearch, Caddy, and the ArcheBase impersonator sidecar.
- `.env.example`: Required environment variables with placeholder values only.
- `librechat.yaml`: ArcheBase LibreChat configuration with model selection enabled, public icon URLs, native Agents, and user memory.
- `impersonator/server.js`: OIDC client-credentials sidecar that injects AIFlow bearer tokens at runtime.
- `brand/` and `images/`: Public ArcheBase logo and favicon assets.
- `caddy/Caddyfile.example`: Caddy reverse proxy example. Copy to `caddy/Caddyfile` on the host.

## Host Setup

```bash
cp .env.example .env
cp caddy/Caddyfile.example caddy/Caddyfile
mkdir -p data/logs data/mongo data/meili caddy/certs
```

Fill `.env` with production secrets on the host. Keep `.env` out of git.

## Deploy

The default `ArcheBase` model spec uses the direct custom endpoint so model
selection works immediately after deploy. To enable the memory-backed
`ArcheBase Memory` model spec, create the default ArcheBase Agent:

1. Sign in as a user with Agent create permission.
2. Create an Agent named `ArcheBase`.
3. Set the Agent provider to `ArcheBase` and the model to `deepseek-v4-pro`.
4. Grant the Agent `VIEW` access to the users, group, role, or public scope that should use Chat.
5. Replace `agent_replace_with_archebase_agent_id` in `librechat.yaml` with the created Agent id.

The Agent id is stored directly in `librechat.yaml` because LibreChat does not apply generic environment-variable expansion to this file. Keep runtime secrets in `.env`; do not commit production `.env` files.

```bash
docker compose -f compose.yaml pull api
docker compose -f compose.yaml up -d
```

For production deployments behind an internal load balancer, set `BIND_IP` in `.env`.

## Memory

`ArcheBase Memory` uses the LibreChat `agents` endpoint so configured memories are injected into chat, and `memory.agent` uses `ArcheBase` with `deepseek-v4-flash` to accumulate memories after responses. If the default Agent is not shared with a user, LibreChat filters the Agent-backed model spec from that user's model picker. The direct `ArcheBase` model spec remains visible as a no-memory fallback.

## Secret Rules

Never commit:

- `.env`
- `caddy/certs/`
- `data/`
- `*.bak-*`
- OIDC client secrets
- JWT or refresh secrets
- Meilisearch master keys
- private keys or certificates
