# Habits

A small, motivating daily habit tracker. React 19 + TypeScript (strict) + Tailwind CSS v4, built with Vite.
All data stays in the browser (localStorage); there is no server or account.

Live at <https://my-first-aiapp.vercel.app>. Full design document: [docs/DESIGN.md](docs/DESIGN.md).

## Scripts

```bash
npm install
npm run dev      # http://127.0.0.1:5173 (localhost redirects there)
npm test         # Vitest + Testing Library + axe accessibility checks
npm run build    # type-check and production build
npm run lint     # oxlint
```

## Structure

```
src/
  App.tsx                 screen shell: header, tabs, dialogs, celebrations
  components/             UI (TodayView, WeeklyGrid, HabitCard, CheckButton, …)
  components/ui/          Modal and ConfirmDialog primitives
  hooks/                  useClock, useStableCallback, useSortableWiring
  state/                  reducer, context + useHabits(), HabitsProvider (persistence)
  lib/                    pure helpers: dates, stats, storage, palette, motivation
```

## Data

- One key, `habit-tracker:v1`, holding `{ version, habits, completions, settings }`.
- Saved after every change (never on startup); unreadable data is copied to a
  `…:backup:<timestamp>` key before the app starts fresh.
- `localhost` and `127.0.0.1` are separate storage origins, so the app always uses
  `127.0.0.1` and merges anything saved under `localhost` once.

## Accessibility

Targets WCAG 2.2 AA: contrast-checked palette, visible focus, keyboard support for every
control (including drag-to-reorder), screen-reader announcements, and reduced-motion support.
