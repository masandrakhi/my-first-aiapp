# Evals

How the app's checks are run, read and extended. All of them are deterministic: no model calls and no cost.

## Run

```bash
npm run verify             # the release gate: run before every commit (EV-1)
npm run smoke:live         # after every deploy: is the live API up and reaching the database? (EV-1)
npm run eval:gate          # checks the gate itself catches seeded breaks (EV-1, a few minutes)
npm run eval:reliability   # 10 shuffled runs under CPU load; before releases (EV-2; `-- 3` for a quick check)
npx vitest run server/test/safetyEval.test.ts    # one eval on its own
```

## EV-1 Release gate

`npm run verify` (`scripts/verify.mjs`) runs these steps and stops at the first failure. Vercel runs it in
every deploy's build (`vercel.json`), so a failing step stops the deploy.

| Step | Fails when |
| --- | --- |
| Type-check (`tsc -b`) | Any type error |
| Lint (`oxlint --deny-warnings`) | Any error or warning |
| Tests (`vitest run`, `CI=true`) | Any failing test, or any `.only` left in a test |
| Test count floor (`scripts/test-floor.json`) | Fewer tests passed than the floor (skipped or deleted tests). Raise the floor on purpose when adding tests; never lower it to pass |
| Compile API like Vercel (`tsconfig.verify.json`) | The API can't be emitted as separate files |
| API loads and answers (`scripts/smoke-api.mjs`) | The emitted API can't be imported (for example an import without `.js`) or doesn't answer `GET /api/nope` with a 404 and request id |

After a deploy, `npm run smoke:live` sends `POST /api/auth/refresh` without a cookie to the live site and
expects 401 `invalid_refresh`. That path touches the database, so it proves the Linux build and Neon work;
it reads nothing private. If it fails, roll back to the previous deployment in Vercel.

`npm run eval:gate` (`scripts/check-gate.mjs`) proves the gate works: in a temporary copy of the working
tree (uncommitted changes included) it seeds a failing test, a lint warning, an import without `.js`, a
`.only` and a deleted test file. `verify` must fail for each at the step meant to catch it (a fail at the
wrong step, or a crash, counts as wrong), and the untouched copy must pass. The copy is removed afterwards.

## EV-2 Suite reliability

`npm run eval:reliability` (`scripts/reliability.mjs`) runs the suite 10 times in shuffled order (seed
printed for replay) while one busy thread per two CPU cores loads the machine. Pass: 10/10 green. Duration
is reported, not scored. Time limits are capped in `vite.config.ts` (15 s per test, 30 s per setup);
raising them past the caps hides hangs instead of fixing them. Replay a failing order with
`npx vitest run --sequence.shuffle --sequence.seed=<seed>`.

The first shuffled runs found four tests that only passed after another test in the same file had created
data; each now sets up its own data (2026-10-22). One early loaded run stalled for 4 minutes with nine
test files never started and no test failing; its order passed when replayed. Each run's Vitest output is
now kept in `.eval/reliability-<n>.log` so a repeat can be diagnosed. The next 10 runs were all green.

## EV-3 Agent guardrails

Claude must ask before any deploy, production-settings change or publish:

- `.claude/settings.json` (committed) lists those commands under `permissions.ask`. Claude Code evaluates
  deny, then ask, then allow, so these prompt even if a broader `allow` rule exists.
- `CLAUDE.md` states the working rules in fixed sentences.
- `server/test/guardrails.test.ts` simulates risky commands (deploy, promote, rollback, env changes, npm
  publish) against every rule with Claude Code's wildcard matching, checks `.claude/settings.local.json`
  when present (reported as skipped, not passed, when absent), checks that no npm script hides a deploy,
  and checks the `CLAUDE.md` sentences word for word.
- Live check, repeated whenever a settings file changes: ask Claude to deploy and confirm a permission
  prompt appears before anything runs. Record the date here. A rule in `~/.claude/settings.json` can't be
  checked from the repo; this live check covers the combined result.

## Safety eval: four prohibited categories

**What it checks.** That the content rules in `server/safety/` flag violence, self-harm, cybersecurity and
harassment, and nothing else, in two places:

| Place | Check | When it runs |
| --- | --- | --- |
| Habit names (create, rename, Coach cards, import) | `checkHabit` | Before anything is saved |
| Chat messages | `checkInput` | Before the AI model is called; a flagged message never reaches it |

Model replies are checked by `checkOutput` after the model answers and before the user sees them; those
rules are covered by `server/test/safety.test.ts` and `server/test/coach.test.ts`.

**Files.**

- `server/safety/eval/cases.ts`: the labelled cases (category keywords, disguised spellings, and
  everyday look-alikes that must stay allowed).
- `server/test/safetyEval.test.ts`: the runner.
- `server/safety/terms.ts`: the term lists the eval measures. `server/safety/responses.ts`: the replies.

**Thresholds.**

| Measure | Threshold | Why |
| --- | --- | --- |
| Recall per category | 100% | A missed harmful case can be saved or answered by the model |
| False alarms on look-alikes | 0 | Blocking "Cutting sugar" or "Target 8 hours of sleep" breaks normal use |
| Reply rules | All pass | Neutral wording; a safe pivot where the reply offers one; crisis lines (988, Crisis Text Line, findahelpline.com) on every self-harm reply |
| End to end | All pass | One chat message per category gets its fixed reply through the real API without a model call; logs show the category, never the text |

**Read the results.** The first test prints a scorecard (cases and catches per category, and false alarms).
A failure lists each wrong case as `[place] "text" expected X, got Y`.

**Extend it.**

1. Add rows to `CASES` in `server/safety/eval/cases.ts`: the text, where it appears (`habit` or `chat`),
   the expected category or `ok`, and a tag (`keyword`, `disguise` or `lookalike`).
2. Run the eval. If a row fails, change the term lists in `server/safety/terms.ts`, never the row.
3. Add a harmless idiom that contains a flagged phrase to `BENIGN_IDIOMS` only when a look-alike can't be
   allowed any other way, and add that idiom as a look-alike row.
4. Slurs go in `HATE_SLURS` from a reviewed list your team maintains; add a matching row for each.

**Check the eval itself.** Remove one term from `terms.ts` and run it: the cases for that term must fail.
Restore the term afterwards. (Done on 2026-10-22 with "malware": 4 cases failed, then 13/13 passed once
restored.)

**Known limits.** Matching is by words and phrases after undoing disguises (accents, leetspeak, spacing,
split and stretched words), not by meaning, so new wording can slip through until it is added. "Hack",
"target", "exploit" and "cutting" are flagged only in harmful phrases, to keep everyday habit talk allowed.
