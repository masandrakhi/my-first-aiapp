# Working rules for Claude in this repository

These sentences are checked word for word by `server/test/guardrails.test.ts`. Change them only on
purpose, and update the test in the same commit.

## Approval and cost

- Never deploy, publish, or change production settings without the owner's explicit approval in this conversation.
- Never buy, upgrade, or enable anything that costs money; use free plans only.

## This machine and codebase

- On this Windows machine, run npx as `npx.cmd`.
- Server-side relative imports must end in `.js`.

## Before committing and after deploying

- Run `npm run verify` before every commit; it must pass.
- After every deploy, run `npm run smoke:live` and report the result.

## Branches

- `main` is the live app. The AI Coach lives on the `coach` branch for local use and is not deployed.
