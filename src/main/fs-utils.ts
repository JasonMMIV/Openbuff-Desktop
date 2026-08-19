import { execFile } from 'child_process'
import { readdirSync, readFileSync, statSync, existsSync, rmSync, type Dirent } from 'fs'
import { basename, join, relative, sep } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: TreeNode[]
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', '.freebuff', '__pycache__', 'openbuff-src'])
const SKIP_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', '.DS_Store'])

/** Minimal .gitignore matcher: supports `name`, `dir/`, `pattern/`, `*.ext`, `!negation`, and comments. */
function loadGitignore(root: string): string[] {
  try {
    const content = readFileSync(join(root, '.gitignore'), 'utf-8')
    return content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  } catch {
    return []
  }
}

function gitignoreMatches(patterns: string[], relPath: string): boolean {
  if (patterns.length === 0) return false
  const posix = relPath.split(sep).join('/')
  let ignored = false
  for (const raw of patterns) {
    const negate = raw.startsWith('!')
    const pat = (negate ? raw.slice(1) : raw).replace(/^\/+|\/+$/g, '')
    if (!pat) continue
    let match = false
    if (pat.endsWith('/')) {
      // Directory pattern: matches the dir itself or anything under it
      match = posix === pat.slice(0, -1) || posix.startsWith(pat.slice(0, -1) + '/')
    } else if (pat.includes('/')) {
      match = posix === pat || posix.endsWith('/' + pat)
    } else {
      // Basename pattern (with optional wildcards)
      const re = new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')
      const parts = posix.split('/')
      match = parts.some((p) => re.test(p))
    }
    if (match) ignored = !negate
  }
  return ignored
}

/** List a single directory's immediate children (lazy tree loading). */
export function listDir(root: string): TreeNode[] {
  let entries: Dirent[]
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  const ignorePatterns = loadGitignore(root)
  const nodes: TreeNode[] = []
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name) || SKIP_FILES.has(entry.name)) continue
    if (entry.name.startsWith('.')) continue
    const full = join(root, entry.name)
    const rel = relative(root, full)
    if (gitignoreMatches(ignorePatterns, rel)) continue
    if (entry.isDirectory()) {
      nodes.push({ name: entry.name, path: full, type: 'dir' })
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, path: full, type: 'file' })
    }
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return nodes
}

/** Recursive listing (used for @-folder attachment expansion). */
export function listFiles(root: string, depth = 0): TreeNode[] {
  const nodes = listDir(root)
  if (depth >= 8) return nodes
  for (const node of nodes) {
    if (node.type === 'dir') {
      node.children = listFiles(node.path, depth + 1)
    }
  }
  return nodes
}

export function readProjectFile(path: string): { ok: boolean; content?: string; error?: string } {
  try {
    const stat = statSync(path)
    if (!stat.isFile() || stat.size > 1024 * 1024) {
      return { ok: false, error: 'Not a file or larger than 1MB' }
    }
    return { ok: true, content: readFileSync(path, 'utf-8') }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 })
    return stdout.trim()
  } catch {
    return ''
  }
}

export async function getGitBranch(cwd: string): Promise<string> {
  const branch = await runGit(cwd, ['branch', '--show-current'])
  return branch || ''
}

export async function getGitStatus(cwd: string): Promise<string> {
  const status = await runGit(cwd, ['status', '--short'])
  return status
}

export async function getGitDiff(cwd: string): Promise<{ diff: string; files: string[] }> {
  const stat = await runGit(cwd, ['diff', '--stat'])
  const files = stat
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith(' '))
    .map((l) => l.split('|')[0].trim())
    .filter(Boolean)
  const full = await runGit(cwd, ['diff', '--no-color'])
  return { diff: full, files }
}

/** Stage a single file so its change is "accepted" into the index. */
export async function gitAcceptFile(cwd: string, file: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await execFileAsync('git', ['add', '--', file], { cwd })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Discard working-tree changes for a single file. */
export async function gitRevertFile(cwd: string, file: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await execFileAsync('git', ['checkout', '--', file], { cwd })
    return { ok: true }
  } catch (err) {
    // Untracked files (created during the run) can't be checked out — delete them instead.
    // Verify it really is untracked before removing anything.
    try {
      await execFileAsync('git', ['ls-files', '--error-unmatch', '--', file], { cwd })
    } catch {
      const full = join(cwd, file)
      if (existsSync(full)) {
        rmSync(full, { force: true })
        return { ok: true }
      }
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function projectName(cwd: string): string {
  return basename(cwd) || cwd
}
