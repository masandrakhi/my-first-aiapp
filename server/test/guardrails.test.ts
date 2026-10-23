// @vitest-environment node
/**
 * Agent guardrails (EV-3): deploys and production changes must always ask for approval.
 *
 * Instead of spotting words in rules, it simulates risky commands against every permission rule using
 * Claude Code's wildcard matching, so a broad rule like `Bash(npx *)` is caught even though it never says
 * "deploy". Claude Code evaluates deny, then ask, then allow, so a matching `ask` rule wins over `allow`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../..')
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

/** Commands that must never run without a prompt. */
const RISKY = [
  'npx.cmd --yes vercel deploy --prod --yes 2>&1',
  'npx vercel deploy --prod',
  'vercel --prod',
  'npx.cmd vercel promote my-first-aiapp-abc.vercel.app',
  'npx.cmd vercel rollback',
  'npx.cmd vercel env add SMTP_PASS production',
  'npx.cmd vercel env rm SMTP_USER production',
  'npm publish',
]
const TOOLS = ['Bash', 'PowerShell']

/** Claude Code rule matching: `Tool(pattern)`, where `*` matches anything and a trailing `:*` means "starts with". */
function matches(rule: string, tool: string, command: string): boolean {
  const m = /^(\w+)(?:\((.*)\))?$/s.exec(rule.trim())
  if (!m || m[1] !== tool) return false
  if (m[2] === undefined) return true // bare tool name: every command
  const pattern = m[2].endsWith(':*') ? `${m[2].slice(0, -2)}*` : m[2]
  const regex = new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 's')
  return regex.test(command)
}

const settings = JSON.parse(read('.claude/settings.json')) as { permissions?: { ask?: string[]; allow?: string[] } }
const LOCAL = '.claude/settings.local.json'
const hasLocal = existsSync(resolve(ROOT, LOCAL))

describe('agent guardrails', () => {
  it('3-1: every risky command asks for approval (committed settings)', () => {
    const ask = settings.permissions?.ask ?? []
    const unprotected = TOOLS.flatMap((tool) => RISKY.filter((cmd) => !ask.some((r) => matches(r, tool, cmd))).map((cmd) => `${tool}: ${cmd}`))
    expect(unprotected).toEqual([])
  })

  it('3-1b: the committed settings pre-approve no risky command', () => {
    const allow = settings.permissions?.allow ?? []
    expect(TOOLS.flatMap((tool) => allow.filter((r) => RISKY.some((cmd) => matches(r, tool, cmd))))).toEqual([])
  })

  // Local settings aren't in git; when absent this is reported as skipped, never as passed.
  it.skipIf(!hasLocal)('3-2: local settings pre-approve no risky command', () => {
    const local = JSON.parse(read(LOCAL)) as { permissions?: { allow?: string[] } }
    const allow = local.permissions?.allow ?? []
    expect(TOOLS.flatMap((tool) => allow.filter((r) => RISKY.some((cmd) => matches(r, tool, cmd))))).toEqual([])
  })

  it('3-2b: no npm script hides a deploy or production change', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts
    const risky = Object.entries(scripts).filter(([, cmd]) => /vercel\b.*(deploy|--prod|promote|rollback|env\s+(add|rm|update))|npm publish/.test(cmd))
    expect(risky).toEqual([])
  })

  it('3-3: CLAUDE.md states the rules word for word', () => {
    const rules = read('CLAUDE.md')
    for (const sentence of [
      "Never deploy, publish, or change production settings without the owner's explicit approval in this conversation.",
      'Never buy, upgrade, or enable anything that costs money; use free plans only.',
      'On this Windows machine, run npx as `npx.cmd`.',
      'Server-side relative imports must end in `.js`.',
      'Run `npm run verify` before every commit; it must pass.',
      'After every deploy, run `npm run smoke:live` and report the result.',
    ]) expect(rules).toContain(sentence)
  })

  it('the matcher itself: broad rules are caught, narrow safe ones are not', () => {
    expect(matches('PowerShell(npx.cmd *)', 'PowerShell', RISKY[0]!)).toBe(true)
    expect(matches('Bash', 'Bash', 'npm publish')).toBe(true)
    expect(matches('Bash(npx vercel:*)', 'Bash', 'npx vercel deploy --prod')).toBe(true)
    expect(matches('PowerShell(npx.cmd --yes vercel whoami 2>&1)', 'PowerShell', RISKY[0]!)).toBe(false)
    expect(matches('Bash(npm run *)', 'Bash', 'npm publish')).toBe(false)
  })
})
