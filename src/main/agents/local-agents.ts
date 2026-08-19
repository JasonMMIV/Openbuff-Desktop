/**
 * Custom agent loading (the desktop equivalent of the CLI's `/init` + `.agents/`).
 *
 * The SDK's `loadLocalAgents` dynamically `import()`s agent modules, which Node can only
 * do for .js/.mjs/.cjs. Since agent files are conventionally TypeScript, we transpile
 * .ts/.tsx files with `typescript.transpileModule` into a temp mirror directory and load
 * everything from there. Type-only imports (e.g. `./types/agent-definition`) are elided
 * by the transpiler, so a typical self-contained agent file works as-is.
 */

import { loadLocalAgents, type LoadedAgentDefinition } from '@openbuff/sdk'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { homedir, tmpdir } from 'os'
import { extname, join, relative, resolve, sep } from 'path'
// TypeScript 7 (native) has no JS transpile API; use the 5.x JS API for single-file
// transpilation of user .ts agent files (typechecking still uses `tsc` v7).
import ts from 'typescript5'

export interface LocalAgentInfo {
  id: string
  displayName: string
  spawnerPrompt: string
  /** Absolute path of the agent file (may point into the temp mirror for .ts sources). */
  source: string
}

export interface LocalAgentsResult {
  agents: LocalAgentInfo[]
  validationErrors: { agentId: string; filePath: string; message: string }[]
}

export interface CreateLocalAgentInput {
  cwd: string
  scope: 'project' | 'home'
  id: string
  displayName: string
  spawnerPrompt: string
  systemPrompt: string
  instructionsPrompt: string
  toolNames: string[]
}

export interface CreateLocalAgentResult {
  ok: boolean
  id?: string
  filePath?: string
  error?: string
}

const AGENT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs'])
const SKIP_DIRS = new Set(['skills', 'sessions', 'node_modules', '.git', '.codebuff-index'])
const SKIP_SUFFIXES = ['.d.ts', '.test.ts', '.test.tsx', '.spec.ts']

function isAgentFileName(name: string): boolean {
  const ext = extname(name).toLowerCase()
  if (!AGENT_EXTENSIONS.has(ext)) return false
  const lower = name.toLowerCase()
  return !SKIP_SUFFIXES.some((s) => lower.endsWith(s))
}

function scanAgentFiles(dir: string, out: string[]): void {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return // directory doesn't exist or is unreadable
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) scanAgentFiles(full, out)
      continue
    }
    if (entry.isFile() && isAgentFileName(entry.name)) out.push(full)
  }
}

function transpileToMjs(file: string, outDir: string, rel: string): void {
  const source = readFileSync(file, 'utf-8')
  const result = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      jsx: ts.JsxEmit.Preserve,
      isolatedModules: true
    }
  })
  const relNoExt = rel.slice(0, rel.length - extname(rel).length)
  const outFile = join(outDir, `${relNoExt}.mjs`)
  mkdirSync(outFile.slice(0, outFile.lastIndexOf(sep)), { recursive: true })
  writeFileSync(outFile, result.outputText, 'utf-8')
}

/**
 * Discover agent files in `~/.agents` and `<project>/.agents` (project wins on duplicate ids),
 * mirroring everything into a temp dir with .ts sources transpiled, then delegate to the SDK
 * loader which handles dynamic imports + validation.
 */
export async function loadProjectLocalAgents(cwd: string): Promise<LocalAgentsResult> {
  const roots = [join(homedir(), '.agents'), join(cwd, '.agents')]
  const uniqueRoots = roots.filter((r, i) => roots.indexOf(r) === i && existsSync(r))

  const files: string[] = []
  for (const root of uniqueRoots) scanAgentFiles(root, files)
  if (files.length === 0) return { agents: [], validationErrors: [] }

  const tempDir = mkdtempSync(join(tmpdir(), 'openbuff-agents-'))
  const fileErrors: { agentId: string; filePath: string; message: string }[] = []
  try {
    for (const file of files) {
      const root = uniqueRoots.find((r) => file.startsWith(r + sep)) ?? uniqueRoots[0]
      const rel = relative(root, file)
      const ext = extname(file).toLowerCase()
      try {
        if (ext === '.ts' || ext === '.tsx') {
          transpileToMjs(file, tempDir, rel)
        } else {
          const outFile = join(tempDir, rel)
          const parent = outFile.slice(0, outFile.lastIndexOf(sep))
          if (parent) mkdirSync(parent, { recursive: true })
          writeFileSync(outFile, readFileSync(file, 'utf-8'), 'utf-8')
        }
      } catch (err) {
        fileErrors.push({ agentId: '', filePath: file, message: `Failed to load agent file: ${err instanceof Error ? err.message : String(err)}` })
      }
    }

    const result = await loadLocalAgents({ agentsPath: tempDir, validate: true, verbose: false })
    const agents = 'agents' in result ? result.agents : (result as Record<string, LoadedAgentDefinition>)
    const validationErrors =
      'validationErrors' in result ? result.validationErrors : []

    return {
      agents: Object.values(agents).map((a) => ({
        id: a.id,
        displayName: a.displayName ?? a.id,
        spawnerPrompt: a.spawnerPrompt ?? '',
        source: a._sourceFilePath ?? ''
      })),
      validationErrors: [...fileErrors, ...validationErrors.map((e) => ({ agentId: e.agentId, filePath: e.filePath, message: e.message }))]
    }
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup failures
    }
  }
}

function quote(value: string): string {
  return JSON.stringify(value.trim())
}

const WINDOWS_RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
])

/** Write the dependency-free TypeScript agent file produced by the /init wizard. */
export function createLocalAgent(input: CreateLocalAgentInput): CreateLocalAgentResult {
  const id = input.id.trim().toLowerCase()
  const idError = id.match(/^[a-z0-9-]+$/) ? null : 'Agent ID must contain only lowercase letters, numbers, and hyphens.'
  if (idError) return { ok: false, error: idError }
  if (WINDOWS_RESERVED_NAMES.has(id)) {
    return { ok: false, error: `Agent ID "${id}" is a Windows reserved system name and cannot be used.` }
  }
  if (!input.displayName.trim()) return { ok: false, error: 'Display name is required.' }
  if (!input.spawnerPrompt.trim()) return { ok: false, error: 'Spawner description is required.' }
  if (!input.systemPrompt.trim()) return { ok: false, error: 'System prompt is required.' }
  if (!input.instructionsPrompt.trim()) return { ok: false, error: 'Instructions are required.' }
  try {
    if (!existsSync(input.cwd) || !statSync(input.cwd).isDirectory()) return { ok: false, error: 'The selected project folder does not exist.' }
  } catch {
    return { ok: false, error: 'The selected project folder cannot be accessed.' }
  }

  const rootResolved = resolve(input.scope === 'home' ? join(homedir(), '.agents') : join(input.cwd, '.agents'))
  const filePath = resolve(rootResolved, `${id}.ts`)
  if (!filePath.startsWith(rootResolved + sep)) return { ok: false, error: 'Invalid agent file path.' }
  if (existsSync(filePath)) return { ok: false, error: `An agent with the ID "${id}" already exists.` }

  const toolNames = [...new Set(input.toolNames.map((tool) => tool.trim()).filter(Boolean))]
  const source = [
    'const definition = {',
    `  id: ${quote(id)},`,
    `  displayName: ${quote(input.displayName)},`,
    `  spawnerPrompt: ${quote(input.spawnerPrompt)},`,
    '  inputSchema: {',
    '    prompt: {',
    "      type: 'string',",
    "      description: 'The focused task this agent should handle.',",
    '    },',
    '  },',
    "  outputMode: 'last_message',",
    '  includeMessageHistory: false,',
    `  toolNames: ${JSON.stringify(toolNames)},`,
    '  mcpServers: {},',
    '  spawnableAgents: [],',
    `  systemPrompt: ${quote(input.systemPrompt)},`,
    `  instructionsPrompt: ${quote(input.instructionsPrompt)},`,
    '}',
    '',
    'export default definition',
    ''
  ].join('\n')

  try {
    mkdirSync(rootResolved, { recursive: true })
    writeFileSync(filePath, source, 'utf-8')
    return { ok: true, id, filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
