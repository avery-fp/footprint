import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Regression guard against the sign-in loop.
 *
 * The loop came from 11+ files hardcoding '/login' or '/auth/login' or
 * '/signup' as string literals. PR #1 killed the loop by adding redirect
 * stubs. PR #2 unified the modal. PR #3 replaced the literals with the
 * AUTH_ENTRY constant from lib/routes.ts.
 *
 * This test walks the source tree and asserts that no file contains a
 * hardcoded dead auth URL literal. If you're adding a new sign-in path,
 * import AUTH_ENTRY from @/lib/routes instead.
 *
 * The test is tolerant: a small allowlist carries the canonical references
 * (the helper's docstring, the redirect stub files themselves, the scripts
 * directory, and the intentional e2e regression scaffolding).
 */

const ROOT = join(__dirname, '..')

// Directories to walk for source files
const SCAN_DIRS = ['app', 'components', 'lib', 'scripts', 'cli', 'src', 'middleware.ts']

// Files that are ALLOWED to contain the literal references.
// Everything else must use AUTH_ENTRY or authEntryFor from @/lib/routes.
const ALLOWLIST = new Set([
  // The helper itself — its docstring names the literals it replaces
  'lib/routes.ts',
  // Redirect stub files — they ARE the redirect landing points
  'app/login/page.tsx',
  'app/auth/login/page.tsx',
  'app/signin/page.tsx',
  'app/signup/page.tsx',
  'app/welcome/page.tsx',
  'app/claim/page.tsx',
])

// Patterns that MUST NOT appear in non-allowlisted source files
const DEAD_LITERAL_PATTERNS = [
  /["'`]\/login["'`/?]/,
  /["'`]\/auth\/login["'`/?]/,
  /["'`]\/signin["'`/?]/,
  /["'`]\/signup["'`/?]/,
]

function walk(dir: string, relative: string): string[] {
  const results: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return results
  }
  for (const entry of entries) {
    const abs = join(dir, entry)
    const rel = relative ? `${relative}/${entry}` : entry
    let stats
    try {
      stats = statSync(abs)
    } catch {
      continue
    }
    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue
      results.push(...walk(abs, rel))
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      results.push(rel)
    }
  }
  return results
}

function collectSourceFiles(): string[] {
  const results: string[] = []
  for (const entry of SCAN_DIRS) {
    const abs = join(ROOT, entry)
    let stats
    try {
      stats = statSync(abs)
    } catch {
      continue
    }
    if (stats.isFile()) {
      results.push(entry)
    } else if (stats.isDirectory()) {
      results.push(...walk(abs, entry))
    }
  }
  return results
}

describe('no dead auth literals in source', () => {
  const sourceFiles = collectSourceFiles()

  it('scans a non-trivial number of files', () => {
    // Sanity: the walker should find at least a few dozen files. If it finds
    // zero, the test is giving a false pass and should be investigated.
    expect(sourceFiles.length).toBeGreaterThan(20)
  })

  for (const file of sourceFiles) {
    it(`${file} has no hardcoded /login, /auth/login, /signin, or /signup`, () => {
      if (ALLOWLIST.has(file)) return

      const content = readFileSync(join(ROOT, file), 'utf8')
      const violations: string[] = []

      for (const pattern of DEAD_LITERAL_PATTERNS) {
        const match = content.match(pattern)
        if (match) {
          // Find the line number for a better error message
          const idx = content.indexOf(match[0])
          const lineNum = content.slice(0, idx).split('\n').length
          violations.push(`${file}:${lineNum} -> ${match[0]}`)
        }
      }

      expect(
        violations,
        `${file} contains dead auth literal(s). Use AUTH_ENTRY from @/lib/routes instead:\n${violations.join('\n')}`
      ).toEqual([])
    })
  }
})
