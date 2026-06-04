# ArcheBase LibreChat Deployment

This directory contains the open-source deployment template for ArcheBase's LibreChat fork.
It includes public branding assets and runtime templates only. Do not commit production
secrets, certificates, logs, MongoDB data, Meilisearch data, or backups.

## Files

- `compose.yaml`: Docker Compose template for LibreChat, MongoDB, Meilisearch, Caddy, and the ArcheBase impersonator sidecar.
- `.env.example`: Required environment variables with placeholder values only.
- `librechat.yaml`: ArcheBase LibreChat configuration with model selection enabled and public icon URLs.
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

```bash
docker compose -f compose.yaml pull api
docker compose -f compose.yaml up -d
```

For production deployments behind an internal load balancer, set `BIND_IP` in `.env`.

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
