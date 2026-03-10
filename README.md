# Backend Foro

## Ports

- **Production:** 3000 (default when `PORT` is not set)
- **Local dev:** 3145 (set `PORT=3145` in `.env` to avoid affecting prod)

## Setup

```bash
# Install dependencies
bun install

# Setup environment
cp .env.example .env
```

## Environment

Required variables (see `.env.example`):
- `DATABASE_URL` - MongoDB connection string
- `PORT` - Server port (optional; defaults to 3000 for prod; set to 3145 for local dev)
- `JWT_SECRET` - Secret for JWT signing
- `EXTERNAL_API_URL` - SIIAU login API endpoint
- `SISPA_URL`, `SISPA_CODIGO`, `SISPA_PASSWORD` - SISPA API credentials for student prefill

Optional: `SMTP_*` for email (defaults work for local dev without auth)

## Docker (backend only)

Assumes MongoDB runs elsewhere. Set `DATABASE_URL` in `.env` (e.g. `mongodb://root:foro@host.docker.internal:27017/foro` if Mongo is on host).

```bash
docker compose up -d --build
```

API at http://localhost:3000 (or whatever port is in `PORT`; use 3145 for local dev)

## Database

**Local MongoDB:**
```env
DATABASE_URL="mongodb://localhost:27017/foro"
```

**Docker MongoDB:**
```bash
docker compose up -d
```
```env
DATABASE_URL="mongodb://root:foro@localhost:27017/foro"
```

## Development

```bash
bun run dev
```

## Seeding

```bash
bun run seed
```

Seeds admin users from `seeds/auth.ts`.

## Testing

```bash
bun test
```

## Email Preview

```bash
bun email
```

Open http://localhost:3145/email in your browser to preview the email (requires `PORT=3145` in `.env`).

## API Documentation

```bash
bun dev
```

Open http://localhost:3145/openapi in your browser to view the API documentation (requires `PORT=3145` in `.env`).