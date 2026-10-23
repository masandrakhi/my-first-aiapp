# Habits

A small, motivating daily habit tracker. React 19 + TypeScript (strict) + Tailwind CSS v4, built with Vite.
Accounts with email and password; habits are stored per user in Postgres behind a small API (Hono on Vercel Functions).

Live at <https://my-first-aiapp.vercel.app>. Full design document: [docs/DESIGN.md](docs/DESIGN.md).

## Try the AI Coach locally (this branch)

The `coach` branch adds an AI Coach tab that suggests small habits and adds the ones you pick. It isn't
deployed; it runs on your own computer, free, with a built-in practice model (no API key needed).

```bash
git clone <this repository's URL>
cd my-first-aiapp
git switch coach
npm install
npm run dev
```

Open <http://127.0.0.1:5173>, create an account (it stays on your computer, in `.data/`), and open the
**Coach** tab. Replies come from the practice model and are marked "Practice mode". To try the real model
(Claude Haiku 5.5, paid per use), put `ANTHROPIC_API_KEY=...` in a `.env.local` file; never commit it.
How the Coach works and what keeps it safe: [docs/DESIGN.md §8a](docs/DESIGN.md#8a-ai-coach).

## Scripts

```bash
npm install
npm run dev      # app http://127.0.0.1:5173 + API :8787 (local Postgres in .data/)
npm test         # Vitest + Testing Library + axe accessibility checks
npm run build    # type-check and production build
npm run lint     # oxlint
npm run db:migrate  # apply migrations to DATABASE_URL (Vercel runs this in every deploy's build)
```

## Structure

```
src/
  Root.tsx                sign-in gate: AuthPage when signed out, the app when signed in
  App.tsx                 screen shell: header, tabs, dialogs, celebrations
  auth/                   apiClient (tokens, refresh, cross-tab), AuthProvider, inactivity rules
  components/             UI (TodayView, WeeklyGrid, HabitCard, …); auth/ for sign-in screens
  state/                  reducer, useHabits(), HabitsProvider (loads and saves via the API)
  shared/schemas.ts       validation shared by client and server
  lib/                    pure helpers: dates, stats, palette, appData, legacy device storage
server/
  app.ts, middleware.ts   Hono API, requireAuth, origin check, error handling
  auth/                   Argon2id, JWTs, sessions, refresh rotation, rate limits, reset
  repo/habits.ts          every query scoped to the signed-in user
  repo/chat.ts            Coach conversations, messages and proposals (also user-scoped)
  chat/                   the AI Coach: coordinator, model adapter, tools, catalog, recommendations
  safety/                 content and conduct checks (habit names, chat input, model replies)
  db/                     Drizzle schema and migrations
  test/                   API tests against an in-memory Postgres
api/index.ts              Vercel Function entry
```

## Security model (short version)

- 15-minute access tokens in memory; rotating refresh tokens in HttpOnly SameSite=Strict cookies.
- 15-minute inactivity timeout enforced by the server, separate from token expiry; refreshing doesn't count as activity.
- Every habit query is filtered by the user id from the verified session; other users' habits return 404.
- The AI Coach has no tool that creates or deletes anything: it can only show a card, and habits are
  created when the user taps Create (re-checked on the server). Content and conduct rules run in code.
- See [docs/DESIGN.md §8](docs/DESIGN.md#8-security-solution-and-risks) for the full list and risk register.

## Accessibility

Targets WCAG 2.2 AA: contrast-checked palette, visible focus, keyboard support for every
control (including drag-to-reorder), screen-reader announcements, and reduced-motion support.
