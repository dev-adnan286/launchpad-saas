# @launchpad/web

Next.js 15 (App Router) frontend for LaunchPad.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server on http://localhost:3000 |
| `npm run build` | Production build (standalone output) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (flat config, next/core-web-vitals + typescript) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (jsdom + Testing Library) |

## Environment

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL` to the API base URL.

## Structure

- `src/app`: routes (landing, auth pages, invite acceptance, `/app/*` workspace shell)
- `src/components/ui`: Tailwind + Radix UI kit
- `src/components`: feature components (Kanban board, task drawer, dialogs, layout)
- `src/lib/api`: typed API client with in-memory access token, single-flight refresh and org header injection
- `src/lib/kanban.ts`: pure board helpers (transitions, grouping, optimistic move)
- `src/lib/schemas`: zod form schemas
- `src/hooks`: auth / org / toast providers
