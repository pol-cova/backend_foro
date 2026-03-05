# Backend Foro

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
- `JWT_SECRET` - Secret for JWT signing
- `EXTERNAL_API_URL` - SIIAU login API endpoint
- `SISPA_URL`, `SISPA_CODIGO`, `SISPA_PASSWORD` - SISPA API credentials for student prefill

Optional: `SMTP_*` for email (defaults work for local dev without auth)

## Docker (backend only)

Assumes MongoDB runs elsewhere. Set `DATABASE_URL` in `.env` (e.g. `mongodb://root:foro@host.docker.internal:27017/foro` if Mongo is on host).

```bash
docker compose up -d --build
```

API at http://localhost:3000

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

Open http://localhost:3000/email in your browser to preview the email.

## API Documentation

```bash
bun dev
```

Open http://localhost:3000/openapi in your browser to view the API documentation.