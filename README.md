# Backend Foro

Elysia + MongoDB + Bun

## Setup

```bash
# Install dependencies
bun install

# Setup environment
cp .env.example .env
```

## Database

**Local MongoDB:**
```env
DATABASE_URL="mongodb://localhost:27017/foro"
```

**Docker MongoDB:**
```bash
docker compose up -d
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

## API

- **Base:** http://localhost:3000/
- **Docs:** http://localhost:3000/openapi
