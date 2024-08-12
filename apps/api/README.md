# @launchpad/api

NestJS 11 + Prisma 6 + PostgreSQL + Redis backend for LaunchPad. See the repository root README for
architecture, data model and the full API reference; Swagger UI is served at `/docs`.

## Run locally

```bash
cp .env.example .env            # adjust DATABASE_URL / secrets
npm install
npx prisma generate
npx prisma migrate deploy       # or: npm run prisma:migrate:dev
npm run prisma:seed             # plans + demo org (admin@launchpad.dev / Password123!)
npm run start:dev               # http://localhost:4000, docs at /docs
```

Redis is optional in development: when `REDIS_URL` is unreachable the API logs a warning, disables
caching and rate limiting, and `/health` reports the `redis` indicator as down.

## Scripts

| Script                 | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `npm run build`        | Compile to `dist/` with the Nest CLI                          |
| `npm run start:dev`    | Watch mode                                                    |
| `npm run lint`         | ESLint (flat config, type-aware)                              |
| `npm run typecheck`    | `tsc --noEmit` over src, test and prisma                      |
| `npm test`             | Jest unit tests (no database; Prisma is mocked)               |
| `npm run test:e2e`     | Supertest flow against a real PostgreSQL (CI service containers) |
| `npm run prisma:*`     | generate / validate / migrate / seed                          |

## Layout

```
prisma/            schema, hand-written init migration, seed
src/
  auth/            register, login, refresh rotation + reuse detection, password reset, JWT strategy, combined auth guard
  api-keys/        lp_ keys (sha256 at rest, shown once), verification
  organizations/   workspaces, dashboard stats
  memberships/     roles, removal, cache invalidation
  invitations/     token flow with plan seat enforcement
  projects/ tasks/ labels/ comments/   work management (Kanban reorder, transitions, bulk)
  activity/        event listener persisting the feed
  billing/         plan catalog, limits, PaymentProvider (fake), HMAC webhook
  health/          terminus indicators for Postgres + Redis
  common/          guards, decorators, filter, interceptors, pagination
  mail/            MailerService with console + minimal SMTP transports
  redis/ prisma/   infrastructure wrappers
test/              e2e harness (CI only)
```

## Mail transports

`MAIL_TRANSPORT` is chosen at boot: when `SMTP_HOST` is set, `SmtpMailTransport` (a small
dependency-free SMTP client supporting implicit TLS and AUTH LOGIN) is used; otherwise
`ConsoleMailTransport` prints messages to the log, which is how reset links and invitation tokens are
read during development.
