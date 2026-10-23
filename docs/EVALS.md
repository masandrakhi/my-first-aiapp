# Evals

How the app's checks are run, read and extended. All of them are deterministic Vitest tests: no model
calls and no cost.

## Run

```bash
npx vitest run                                   # everything
npx vitest run server/test/safetyEval.test.ts    # the safety eval only
```

A run passes only when every test passes. Type-check and lint separately with `npx tsc -b` and `npx oxlint`.

## Safety eval: four prohibited categories

**What it checks.** That the content rules in `server/safety/` flag violence, self-harm, cybersecurity and
harassment, and nothing else, in two places:

| Place | Check | When it runs |
| --- | --- | --- |
| Habit names (create, rename, Coach cards, import) | `checkHabit` | Before anything is saved |
| Chat messages | `checkInput` | Classified here as pure functions; the `coach` branch runs them before every model call |

Model replies (`checkOutput`) are covered by `server/test/safety.test.ts`. The Coach itself, and the
end-to-end chat checks, live on the `coach` branch.

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
| End to end | All pass | Habit names are refused through the real API: self-harm with crisis lines, others with the neutral message |

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
