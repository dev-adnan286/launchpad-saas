# LaunchPad

LaunchPad is a multi-tenant B2B project-management SaaS. Teams create an organization (workspace), invite members with roles, organize work into projects and tasks (Kanban and list views, labels, comments), follow an activity feed, and manage their subscription plan and API keys.

The repository is an npm-workspaces monorepo with two applications:

| App | Stack | Path |
| --- | --- | --- |
| API | NestJS 11, TypeScript, Prisma 6, PostgreSQL 16, Redis 7, Passport JWT, Swagger | `apps/api` |
| Web | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, React Query, react-hook-form + zod, @dnd-kit, Radix primitives | `apps/web` |

## Contents

- [Architecture](#architecture)
- [Features](#features)
- [Data model](#data-model)
- [Getting started (local)](#getting-started-local)
- [Running with Docker Compose](#running-with-docker-compose)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Authentication flow](#authentication-flow)
- [Multi-tenancy and authorization](#multi-tenancy-and-authorization)
- [Testing](#testing)
- [Continuous integration](#continuous-integration)
- [Project structure](#project-structure)

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    WEB[Next.js 15 web app<br/>React Query + in-memory access token]
  end

  subgraph API["NestJS API (apps/api)"]
    GUARDS[Auth guards<br/>JWT / API key -> OrgMember -> Roles]
    CTRL[Controllers + DTO validation]
    SVC[Domain services<br/>auth, orgs, projects, tasks, billing ...]
    EVENTS[EventEmitter2]
    ACT[Activity listener]
    MAIL[MailerService<br/>console / SMTP transport]
    PAY[PaymentProvider<br/>FakePaymentProvider]
  end

  PG[(PostgreSQL 16<br/>Prisma)]
  REDIS[(Redis 7<br/>membership cache + rate limiting)]

  WEB -- "HTTPS JSON<br/>Authorization: Bearer, X-Org-Id" --> GUARDS
  GUARDS --> CTRL --> SVC
  SVC --> PG
  GUARDS --> REDIS
  SVC --> EVENTS --> ACT --> PG
  SVC --> MAIL
  SVC --> PAY
  EXT[External billing webhook] -- "HMAC-signed POST /billing/webhook" --> CTRL
  CLI[Integrations using API keys<br/>Authorization: Bearer lp_...] --> GUARDS
```

Request pipeline (API): `RateLimitGuard (Redis)` -> `JwtOrApiKeyAuthGuard` -> `OrgMemberGuard` (resolves `X-Org-Id` / `:orgId`, cached membership) -> `RolesGuard` (`@Roles()` with role hierarchy) -> `ValidationPipe` -> handler -> `TransformInterceptor` (`{ data, meta }` envelope) / `HttpExceptionFilter` (consistent error shape) with `LoggingInterceptor` around everything.

## Features

- **Authentication**: register, login, JWT access tokens (15 min) + refresh tokens (7 days) with rotation, token families and reuse detection, logout, password reset via emailed token (console transport locally, SMTP-shaped transport interface).
- **Organizations (workspaces)**: create, list, update, delete, switch; every request is scoped to one organization via the `X-Org-Id` header.
- **Memberships and roles**: `OWNER > ADMIN > MEMBER > VIEWER`, role changes with last-owner protection, removal / self-leave.
- **Invitations**: emailed token links, accept flow, revoke, expiry, plan member-limit enforcement.
- **Projects**: CRUD, archive / unarchive, plan project-limit enforcement, task counts.
- **Tasks**: CRUD, filtering, pagination, sorting, assignment, validated status transitions, Kanban reordering with server-side position renumbering, bulk updates, labels and comments.
- **Activity feed**: services emit domain events; a listener persists an `Activity` row per event, queryable per organization or project.
- **Billing**: FREE / PRO / ENTERPRISE plans with limits, plan switching through a `PaymentProvider` abstraction (`FakePaymentProvider`), downgrade protection, HMAC-verified webhook endpoint.
- **API keys**: hashed at rest, plain key shown exactly once, prefix for identification, last-used tracking, revocation; usable as `Authorization: Bearer lp_...` instead of a JWT.
- **Operational**: Swagger UI at `/docs`, health checks (Prisma + Redis) via Terminus, Redis-backed rate limiting, structured request logging, Docker images for both apps, GitHub Actions CI.
- **Web app**: landing page with pricing, auth screens, invitation acceptance, dashboard with stats and recent activity, projects, Kanban board with drag-and-drop plus list view and task drawer, members management, settings (general, billing, API keys), profile, organization switcher, protected routes and automatic token refresh.

## Data model

```mermaid
erDiagram
  User ||--o{ Membership : has
  User ||--o{ RefreshToken : owns
  User ||--o{ PasswordResetToken : owns
  User ||--o{ Organization : "owns (ownerId)"
  User ||--o{ Invitation : "invitedBy"
  User ||--o{ Task : "assignee (optional)"
  User ||--o{ Task : "creator"
  User ||--o{ Comment : writes
  User ||--o{ Activity : "actor (optional)"
  User ||--o{ ApiKey : creates

  Organization ||--o{ Membership : has
  Organization ||--o{ Invitation : has
  Organization ||--o{ Project : has
  Organization ||--o{ Label : has
  Organization ||--o{ Activity : has
  Organization ||--o{ ApiKey : has
  Organization ||--|| Subscription : has

  Plan ||--o{ Subscription : "planId"

  Project ||--o{ Task : contains
  Task ||--o{ TaskLabel : tagged
  Label ||--o{ TaskLabel : tags
  Task ||--o{ Comment : has

  User {
    uuid id PK
    string email UK
    string passwordHash
    string name
    string avatarUrl
  }
  Organization {
    uuid id PK
    string name
    string slug UK
    uuid ownerId FK
  }
  Membership {
    uuid id PK
    uuid userId FK
    uuid organizationId FK
    MembershipRole role
  }
  Invitation {
    uuid id PK
    string email
    MembershipRole role
    string tokenHash UK
    InvitationStatus status
    datetime expiresAt
  }
  Project {
    uuid id PK
    uuid organizationId FK
    string name
    string color
    datetime archivedAt
  }
  Task {
    uuid id PK
    uuid projectId FK
    string title
    TaskStatus status
    TaskPriority priority
    int position
    uuid assigneeId FK
    uuid creatorId FK
    datetime dueDate
  }
  Label {
    uuid id PK
    uuid organizationId FK
    string name
    string color
  }
  TaskLabel {
    uuid taskId PK
    uuid labelId PK
  }
  Comment {
    uuid id PK
    uuid taskId FK
    uuid authorId FK
    string body
  }
  Activity {
    uuid id PK
    uuid organizationId FK
    uuid projectId
    uuid actorId FK
    string entityType
    string entityId
    string action
    json metadata
  }
  RefreshToken {
    uuid id PK
    uuid userId FK
    string tokenHash UK
    string familyId
    datetime expiresAt
    datetime revokedAt
  }
  PasswordResetToken {
    uuid id PK
    uuid userId FK
    string tokenHash UK
    datetime expiresAt
    datetime usedAt
  }
  Plan {
    PlanId id PK
    string name
    int priceMonthly
    int maxProjects
    int maxMembers
    json features
  }
  Subscription {
    uuid id PK
    uuid organizationId FK
    PlanId planId FK
    SubscriptionStatus status
    datetime currentPeriodEnd
  }
  ApiKey {
    uuid id PK
    uuid organizationId FK
    uuid createdById FK
    string name
    string prefix
    string keyHash UK
    datetime lastUsedAt
    datetime revokedAt
  }
```

Enums: `MembershipRole` (OWNER, ADMIN, MEMBER, VIEWER), `InvitationStatus` (PENDING, ACCEPTED, REVOKED, EXPIRED), `TaskStatus` (BACKLOG, TODO, IN_PROGRESS, IN_REVIEW, DONE, CANCELED), `TaskPriority` (LOW, MEDIUM, HIGH, URGENT), `PlanId` (FREE, PRO, ENTERPRISE), `SubscriptionStatus` (ACTIVE, PAST_DUE, CANCELED).

Deleting an organization cascades to memberships, invitations, projects (and their tasks, labels, comments), activity, API keys and the subscription. Deleting a user cascades to memberships, tokens, comments and API keys, while tasks they were assigned to are un-assigned (`SET NULL`) and activity keeps a null actor.

Plan limits:

| Plan | Price / month | Max projects | Max members |
| --- | --- | --- | --- |
| FREE | $0 | 3 | 5 |
| PRO | $19 | 25 | 25 |
| ENTERPRISE | $99 | 1000 ("unlimited") | 1000 ("unlimited") |

## Getting started (local)

Prerequisites: Node.js 20+ (tested with Node 24), npm 10+, PostgreSQL 16 and Redis 7 (both can come from `docker compose up postgres redis`).

```bash
npm install                                   # installs both workspaces

cp apps/api/.env.example apps/api/.env        # then edit DATABASE_URL / secrets
cp apps/web/.env.example apps/web/.env.local

npm run prisma:generate                       # generate the Prisma client
npm run prisma:migrate                        # prisma migrate deploy
npm run prisma:seed                           # plans + demo workspace

npm run dev                                   # API on :4000, web on :3000
```

Demo credentials created by the seed: `admin@launchpad.dev` / `Password123!`.

Useful URLs: web `http://localhost:3000`, API `http://localhost:4000`, Swagger `http://localhost:4000/docs`, health `http://localhost:4000/health`.

Redis is optional in development: the API starts without it, rate limiting and membership caching fall back to pass-through/DB, and `/health` reports the Redis indicator as down.

The `Makefile` wraps the same commands (`make install`, `make dev`, `make test`, `make prisma-migrate`, ...).

## Running with Docker Compose

```bash
docker compose up -d --build
```

This starts PostgreSQL 16, Redis 7, the API (runs `prisma migrate deploy` on boot, port 4000) and the web app (port 3000). The runtime image contains only production dependencies, so seed the demo data from the host against the published Postgres port:

```bash
DATABASE_URL=postgresql://launchpad:launchpad@localhost:5432/launchpad?schema=public npm run prisma:seed
```

`docker compose down -v` removes the volumes.

## Environment variables

### API (`apps/api/.env`)

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development` / `test` / `production` |
| `PORT` | no | `4000` | HTTP port |
| `DATABASE_URL` | yes | - | PostgreSQL connection string |
| `REDIS_URL` | no | `redis://localhost:6379` | Redis connection string (optional at runtime) |
| `JWT_ACCESS_SECRET` | yes | - | Secret for access tokens (min 16 chars) |
| `JWT_REFRESH_SECRET` | yes | - | Secret for refresh tokens (min 16 chars) |
| `JWT_ACCESS_TTL` | no | `15m` | Access token lifetime |
| `JWT_REFRESH_TTL` | no | `7d` | Refresh token lifetime |
| `PASSWORD_RESET_TTL_MIN` | no | `30` | Password reset token lifetime in minutes |
| `INVITATION_TTL_DAYS` | no | `7` | Invitation link lifetime in days |
| `CORS_ORIGIN` | no | `http://localhost:3000` | Allowed origin(s), comma separated |
| `WEB_URL` | no | `http://localhost:3000` | Used to build invitation / reset links in emails |
| `BILLING_WEBHOOK_SECRET` | yes | - | HMAC secret for `POST /billing/webhook` |
| `MAIL_FROM` | no | `LaunchPad <no-reply@launchpad.local>` | Sender for outgoing mail |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | no | - | When `SMTP_HOST` is set the built-in SMTP transport is used, otherwise mail is logged to the console |
| `RATE_LIMIT_WINDOW_SEC` | no | `60` | Rate-limit window (fixed window, Redis-backed) |
| `RATE_LIMIT_MAX` | no | `120` | Max requests per window per client |

### Web (`apps/web/.env.local`)

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | yes | `http://localhost:4000` | Base URL of the API |

## API reference

Interactive documentation (OpenAPI 3) is served by the API at **`/docs`** (`http://localhost:4000/docs`). Every successful response is wrapped as `{ "data": ..., "meta"?: ... }`; errors are `{ "statusCode", "error", "message", "path", "timestamp" }`. Paginated endpoints accept `page` and `pageSize` and return `meta: { page, pageSize, total, totalPages }`.

Org-scoped routes require the `X-Org-Id` header (or an API key, which implies its organization).

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/reset-password` |
| Users | `GET /users/me`, `PATCH /users/me`, `PATCH /users/me/password` |
| Organizations | `POST /organizations`, `GET /organizations`, `GET /organizations/:orgId`, `PATCH /organizations/:orgId`, `DELETE /organizations/:orgId`, `POST /organizations/:orgId/switch`, `GET /organizations/:orgId/stats` |
| Members | `GET /members`, `PATCH /members/:memberId`, `DELETE /members/:memberId` |
| Invitations | `GET /invitations`, `POST /invitations`, `DELETE /invitations/:id`, `GET /invitations/token/:token`, `POST /invitations/token/:token/accept` |
| Projects | `GET /projects`, `POST /projects`, `GET /projects/:id`, `PATCH /projects/:id`, `POST /projects/:id/archive`, `POST /projects/:id/unarchive`, `DELETE /projects/:id` |
| Tasks | `GET /projects/:projectId/tasks`, `POST /projects/:projectId/tasks`, `GET /tasks/:taskId`, `PATCH /tasks/:taskId`, `DELETE /tasks/:taskId`, `POST /tasks/:taskId/status`, `POST /tasks/:taskId/assign`, `POST /tasks/reorder`, `POST /tasks/bulk` |
| Comments | `GET /tasks/:taskId/comments`, `POST /tasks/:taskId/comments`, `PATCH /comments/:id`, `DELETE /comments/:id` |
| Labels | `GET /labels`, `POST /labels`, `PATCH /labels/:id`, `DELETE /labels/:id` |
| Activity | `GET /activity?projectId&page&pageSize` |
| Billing | `GET /billing/plans`, `GET /billing`, `POST /billing/change-plan`, `POST /billing/webhook` |
| API keys | `GET /api-keys`, `POST /api-keys`, `DELETE /api-keys/:id` |
| Health | `GET /health` |

Task status transitions enforced by the API (and mirrored in the web Kanban helper):

```
BACKLOG     -> TODO, CANCELED
TODO        -> BACKLOG, IN_PROGRESS, CANCELED
IN_PROGRESS -> TODO, IN_REVIEW, DONE, CANCELED
IN_REVIEW   -> IN_PROGRESS, DONE, CANCELED
DONE        -> IN_PROGRESS, IN_REVIEW
CANCELED    -> BACKLOG, TODO
```

## Authentication flow

```mermaid
sequenceDiagram
  participant W as Web app
  participant A as API
  participant DB as PostgreSQL

  W->>A: POST /auth/login { email, password }
  A->>DB: find user, verify password hash
  A->>DB: store hashed refresh token (new family)
  A-->>W: { user, accessToken (15m), refreshToken (7d) }
  Note over W: access token kept in memory, refresh token in localStorage

  W->>A: GET /projects (Authorization: Bearer access, X-Org-Id)
  A-->>W: 401 (access token expired)
  W->>A: POST /auth/refresh { refreshToken }
  A->>DB: lookup token hash: valid & not revoked?
  A->>DB: revoke old token, issue new token in same family
  A-->>W: { accessToken, refreshToken }
  W->>A: retry GET /projects
  A-->>W: 200 { data: [...] }

  Note over A: If a revoked token is presented again (reuse),<br/>the whole family is revoked and 401 is returned.
```

- Passwords are hashed with bcrypt (`bcryptjs`, cost 12) in `apps/api/src/auth/auth.service.ts`; the pure-JS implementation avoids native builds on Windows and in the Alpine Docker image.
- Refresh tokens are random 256-bit strings; only their SHA-256 hash is stored. Each login starts a token family; each refresh revokes the presented token and issues a new one in the same family. Presenting an already-revoked token is treated as theft and revokes every token in the family.
- Password reset: `POST /auth/forgot-password` always returns 200, stores a hashed one-time token (`PASSWORD_RESET_TTL_MIN`, default 30 minutes) and emails a link (`WEB_URL/reset-password?token=...`). `POST /auth/reset-password` consumes it and revokes all refresh tokens of the user.
- API keys: `Authorization: Bearer lp_<key>`; the key is looked up by SHA-256 hash, must not be revoked or expired, the organization is derived from the key, and `lastUsedAt` is updated.

## Multi-tenancy and authorization

- Every org-scoped controller is guarded by `OrgMemberGuard`, which resolves the organization from `X-Org-Id` (or the `:orgId` route param), loads the caller's membership (cached in Redis for 60 seconds, invalidated on role changes and removals) and attaches `org` + `membership` to the request.
- `RolesGuard` reads `@Roles('ADMIN')`-style metadata and applies the hierarchy `OWNER > ADMIN > MEMBER > VIEWER`.
- Services always filter by `organizationId`, so a resource that belongs to another organization is a `404`, never a `403` that would leak its existence.
- Plan limits (`maxProjects`, `maxMembers`) are checked when creating / unarchiving projects and when inviting or accepting members; violations return `409` with a message containing `limit`.

## Testing

```bash
npm test                       # unit tests for both apps (no database needed)
npm run test --workspace=@launchpad/api
npm run test --workspace=@launchpad/web
npm run test:e2e --workspace=@launchpad/api   # needs DATABASE_URL + REDIS_URL (CI job)
```

- **API unit tests (Jest)** mock `PrismaService` with `jest-mock-extended` and cover the auth service (refresh rotation, reuse detection, reset flow), tasks service (transitions, reorder, bulk), invitations (limits, expiry, email match), billing (limit enforcement, fake provider, webhook signatures), API keys (hashing / verification / revocation), guards (`OrgMemberGuard`, `RolesGuard`), interceptors and pagination helpers.
- **API e2e tests (Jest + supertest)** boot the full Nest application against a real PostgreSQL database and walk the register -> organization -> project -> task -> comment flow. They run in the CI `e2e` job with Postgres and Redis service containers.
- **Web tests (Vitest + Testing Library)** cover the UI kit, the API client (header injection, envelope unwrapping, single-flight refresh on 401, session clearing), zod schemas, the Kanban helpers and utilities.

## Continuous integration

`.github/workflows/ci.yml` runs three jobs on every push / pull request to `main`:

1. **api**: `npm ci`, Prisma generate + validate, lint, build, unit tests.
2. **web**: `npm ci`, lint, typecheck, unit tests, production build.
3. **e2e** (after `api`): PostgreSQL 16 and Redis 7 service containers, `prisma migrate deploy`, seed, `npm run test:e2e`.

## Project structure

```
launchpad-saas/
├── apps/
│   ├── api/                     # NestJS API
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/<timestamp>_init/migration.sql
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── main.ts, app.module.ts
│   │   │   ├── config/          # zod-validated env (env.ts)
│   │   │   ├── common/          # guards, filters, interceptors, pipes, pagination, decorators
│   │   │   ├── prisma/          # PrismaService
│   │   │   ├── redis/           # RedisService (ioredis, optional)
│   │   │   ├── mail/            # MailService + console / SMTP transports
│   │   │   ├── auth/            # register / login / refresh / reset, JWT + API key strategies
│   │   │   ├── users/
│   │   │   ├── organizations/
│   │   │   ├── memberships/
│   │   │   ├── invitations/
│   │   │   ├── projects/
│   │   │   ├── tasks/
│   │   │   ├── labels/
│   │   │   ├── comments/
│   │   │   ├── activity/        # event listener + feed
│   │   │   ├── billing/         # plans, subscriptions, PaymentProvider, webhook
│   │   │   ├── api-keys/
│   │   │   └── health/
│   │   ├── test/                # e2e (supertest)
│   │   ├── Dockerfile
│   │   └── .env.example
│   └── web/                     # Next.js 15 app
│       ├── src/
│       │   ├── app/             # routes: /, (auth)/*, invite/[token], app/*
│       │   ├── components/      # ui kit, layout, feature components
│       │   ├── lib/             # api client + resources, schemas, kanban helpers, utils
│       │   └── hooks/
│       ├── Dockerfile
│       └── .env.example
├── .github/workflows/ci.yml
├── docker-compose.yml
├── Makefile
├── package.json                 # npm workspaces + root scripts
├── LICENSE
└── README.md
```

## License

MIT - Copyright (c) 2026 Adnan. See [LICENSE](LICENSE).
