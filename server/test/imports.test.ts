// @vitest-environment node
/**
 * Vercel compiles the API file by file and keeps import paths as written, and Node only loads ES modules
 * by exact path. An import like `'./app'` passes type-checks, tests and local dev, then crashes the live
 * function with ERR_MODULE_NOT_FOUND. This walks every file the function loads and checks each path.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '../..')
const ENTRIES = ['api/index.ts', 'server/db/migrate.ts', 'server/dev.ts']
// Static imports and re-exports (`from '…'`), side-effect imports and dynamic `import('…')`.
const RELATIVE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g

function walk(): { files: number; problems: string[] } {
  const seen = new Set<string>()
  const problems: string[] = []
  const queue = ENTRIES.map((e) => resolve(ROOT, e))
  for (let file = queue.pop(); file; file = queue.pop()) {
    if (seen.has(file)) continue
    seen.add(file)
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(RELATIVE_IMPORT)) {
      const where = `${relative(ROOT, file)} → '${spec}'`
      if (!spec!.endsWith('.js')) {
        problems.push(`${where}: add the .js extension`)
        continue
      }
      const target = resolve(dirname(file), spec!.replace(/\.js$/, '.ts'))
      if (existsSync(target)) queue.push(target)
      else problems.push(`${where}: no such file`)
    }
  }
  return { files: seen.size, problems }
}

describe('server imports', () => {
  it('use explicit .js paths that exist, so the Vercel function can load', () => {
    const { files, problems } = walk()
    expect(files).toBeGreaterThan(20) // sanity check that the walk followed the imports
    expect(problems).toEqual([])
  })
})
