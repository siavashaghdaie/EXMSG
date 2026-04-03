# Exclusive Messenger

A private corporate messenger with Telegram-level features and AI-powered task management. Built with TypeScript across the full stack.

## Tech Stack

- **Backend:** Node.js, Express, Prisma ORM, Socket.io, PostgreSQL, Redis
- **Web Frontend:** React, Vite, TailwindCSS, Zustand, Socket.io Client
- **Mobile:** React Native (Expo) — scaffolded, Phase 4
- **Shared:** TypeScript types and constants shared across all packages

## Prerequisites

- Node.js >= 20
- Docker and Docker Compose (for PostgreSQL, Redis, MinIO)
- Git

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/exclusive-messenger.git
cd exclusive-messenger
npm install
```

### 2. Environment setup

```bash
cp .env.example .env
```

Edit `.env` if you want to change default credentials (the defaults work for local dev).

### 3. Start infrastructure

```bash
npm run docker:up
```

This starts PostgreSQL (port 5432), Redis (port 6379), and MinIO (port 9000/9001).

### 4. Initialize the database

```bash
cd packages/backend
npx prisma generate
npx prisma migrate dev --name init
cd ../..
```

### 5. Start development servers

```bash
npm run dev
```

This starts both:
- **Backend API** at `http://localhost:3001`
- **Web frontend** at `http://localhost:5173`

The web frontend proxies API requests to the backend automatically via Vite config.

## Project Structure

```
exclusive-messenger/
├── packages/
│   ├── backend/          # Express + Prisma + Socket.io API
│   │   ├── prisma/       # Database schema and migrations
│   │   └── src/
│   │       ├── config/   # Database, Redis, environment config
│   │       ├── middleware/# Auth, validation middleware
│   │       ├── modules/  # Auth, messaging, user modules
│   │       └── services/ # Socket.io server
│   ├── web/              # React + Vite + TailwindCSS
│   │   └── src/
│   │       ├── components/ # Auth, chat, sidebar, common UI
│   │       ├── services/   # API client, socket client
│   │       └── store/      # Zustand state management
│   ├── mobile/           # React Native (Expo) — Phase 4
│   └── shared/           # Shared TypeScript types
├── docker/               # Docker Compose for infrastructure
└── ROADMAP.md            # Full project roadmap with phases
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start backend + web frontend |
| `npm run dev:backend` | Start only the backend |
| `npm run dev:web` | Start only the web frontend |
| `npm run docker:up` | Start PostgreSQL, Redis, MinIO |
| `npm run docker:down` | Stop all Docker services |
| `npm run db:migrate` | Run database migrations |
| `npm run lint` | Lint all packages |
| `npm run format` | Format code with Prettier |

## VS Code

Open `exclusive-messenger.code-workspace` for the multi-root workspace with:
- Recommended extensions (Prettier, ESLint, Tailwind, Prisma)
- Auto-format on save
- Path aliases configured

## API Endpoints

### Auth
- `POST /api/auth/register` — Register new user
- `POST /api/auth/login` — Login
- `POST /api/auth/refresh` — Refresh JWT tokens
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Get current user

### Messaging
- `GET /api/conversations` — List conversations
- `POST /api/conversations` — Create conversation
- `GET /api/conversations/:id` — Get conversation details
- `GET /api/conversations/:id/messages` — Get messages (paginated)
- `POST /api/conversations/:id/messages` — Send message
- `PUT /api/messages/:id` — Edit message
- `DELETE /api/messages/:id` — Delete message
- `POST /api/messages/:id/reactions` — Add reaction
- `DELETE /api/messages/:id/reactions/:emoji` — Remove reaction
- `POST /api/conversations/:id/read` — Mark as read

### Users
- `GET /api/users/search?query=...` — Search users
- `PATCH /api/users/profile` — Update profile

## WebSocket Events

### Client to Server
- `conversation:join` — Join conversation room
- `conversation:leave` — Leave conversation room
- `typing:start` — Start typing indicator
- `typing:stop` — Stop typing indicator

### Server to Client
- `message:new` — New message received
- `message:edited` — Message was edited
- `message:deleted` — Message was deleted
- `typing:update` — User typing status changed
- `user:online` / `user:offline` — Presence updates
- `reaction:added` / `reaction:removed` — Reaction updates

## License

Private — All rights reserved.
