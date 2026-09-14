/**
 * dsh-git-vcs —— host 半区（跑在 DSH host 进程）。
 *
 * 职责：
 *   1. 用 `ctx.subprocess` 以 **argv 形式**（不经 shell）执行 git，输出集中收集；
 *   2. 把结果经 `ctx.connection.rpc.handle('/git-vcs', ...)` 暴露给浏览器半区；
 *   3. 读插件行的 config 做写操作门禁（allowWrite / allowPush / allowDangerous）。
 *
 * 依赖策略：不 import 任何 @deepseek-ai/* 运行时值，`subprocess` / `connection` 都用
 * `ctx.get()` 软依赖——任一服务缺席只降级并记录，不让插件停在 pending（也免去 profile 侧装依赖）。
 */

import { stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve as resolvePath } from 'node:path'

export const name = 'git-vcs'

/** 无硬依赖：两个服务都用 ctx.get() 取，缺席时降级而不是 pending。 */
export const inject = []

/** 插件行 config 的默认值（不导出 Schemastery Config：本插件刻意零运行时依赖）。 */
const DEFAULTS = {
  /** git 可执行文件绝对路径；空 = 从 PATH 解析。 */
  gitPath: '',
  /** 限定可操作的仓库根；空 = 允许任意会话工作目录。 */
  repoRoot: '',
  /** 关闭全部写操作。 */
  allowWrite: true,
  /** 允许 push。 */
  allowPush: false,
  /** 允许 reset / revert / cherry-pick / 删分支 / 丢弃改动。 */
  allowDangerous: true,
  /** diff 上下文行数。 */
  diffContextLines: 3,
  /** 单条命令 stdout/stderr 的内存上限（字节）。 */
  maxOutputBytes: 2 * 1024 * 1024,
  /** 单条命令超时（毫秒）。 */
  timeoutMs: 120000,
  /** 面板自动刷新间隔（秒）；0 = 关闭。 */
  autoRefreshSeconds: 0,
  /** Console 保留的命令条数。 */
  consoleLimit: 200,
}

const RPC_CHANNEL = '/git-vcs'
/** 所有 git 调用都带的公共参数：路径不做八进制转义（中文文件名可读）、关掉颜色与外部 diff。 */
const GIT_COMMON = ['-c', 'core.quotepath=false', '-c', 'color.ui=false', '-c', 'diff.noprefix=false']

/** git 执行期的环境：禁交互提示（否则挂起的凭据提示会一直等到超时）。 */
const GIT_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: 'echo',
  SSH_ASKPASS: 'echo',
  GIT_OPTIONAL_LOCKS: '0',
  LC_ALL: 'C.UTF-8',
}

/** 一次 RPC 失败：带稳定错误码，浏览器半区按 code 分支。 */
class GitError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.code = code
    this.details = details
  }
}

/** 合并 config：只接受对象，未知键忽略，数字做范围钳制。 */
function normalizeConfig(raw) {
  const input = raw !== null && typeof raw === 'object' ? raw : {}
  const cfg = { ...DEFAULTS }
  for (const key of Object.keys(DEFAULTS)) {
    const value = input[key]
    if (value === undefined || value === null) continue
    const expected = typeof DEFAULTS[key]
    if (typeof value !== expected) continue
    cfg[key] = value
  }
  cfg.diffContextLines = clampInt(cfg.diffContextLines, 0, 200, DEFAULTS.diffContextLines)
  cfg.maxOutputBytes = clampInt(cfg.maxOutputBytes, 4096, 64 * 1024 * 1024, DEFAULTS.maxOutputBytes)
  cfg.timeoutMs = clampInt(cfg.timeoutMs, 1000, 30 * 60 * 1000, DEFAULTS.timeoutMs)
  cfg.autoRefreshSeconds = clampInt(cfg.autoRefreshSeconds, 0, 3600, DEFAULTS.autoRefreshSeconds)
  cfg.consoleLimit = clampInt(cfg.consoleLimit, 10, 2000, DEFAULTS.consoleLimit)
  return cfg
}

function clampInt(value, min, max, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const int = Math.trunc(value)
  if (int < min) return min
  if (int > max) return max
  return int
}

/** 路径是否在 root 之内（Windows 大小写不敏感）。 */
function isInside(path, root) {
  const rel = relative(root, path)
  if (rel === '') return true
  return !rel.startsWith('..') && !isAbsolute(rel)
}

/** 从 git 的 stderr 归类错误码：调用方按 code 分支，不解析 message。 */
function classify(exitCode, stderr, aborted) {
  if (aborted) return 'git-vcs/timeout'
  const text = stderr.toLowerCase()
  if (text.includes('not a git repository')) return 'git-vcs/not-a-repo'
  if (text.includes('could not resolve host') || text.includes('failed to connect') || text.includes('network is unreachable')) return 'git-vcs/network'
  if (text.includes('automatic merge failed') || text.includes('fix conflicts')) return 'git-vcs/conflict'
  if (text.includes('nothing to commit') || text.includes('no changes added to commit')) return 'git-vcs/nothing-to-commit'
  if (text.includes('non-fast-forward') || text.includes('failed to push some refs') || text.includes('rejected')) return 'git-vcs/push-rejected'
  if (text.includes('please tell me who you are') || text.includes('unable to auto-detect email')) return 'git-vcs/identity-missing'
  if (text.includes('your local changes') || text.includes('would be overwritten')) return 'git-vcs/dirty-worktree'
  if (exitCode === 128) return 'git-vcs/git-failed'
  return 'git-vcs/git-failed'
}

/** 读一条 collect 模式输出（进程退出后仍可读）。 */
function readCollected(reader) {
  if (reader === undefined) return { text: '', truncated: false }
  const read = reader.readFrom(0)
  return { text: read.text, truncated: read.lossy, spillPath: read.spillPath }
}

/** 解析 `git status --porcelain=v2 --branch -z`。 */
function parseStatus(stdout) {
  const branch = { oid: '', head: '', upstream: '', ahead: 0, behind: 0, detached: false, unborn: false }
  const entries = []
  const tokens = stdout.split('\0')
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token === '') continue
    if (token.startsWith('# ')) {
      const line = token.slice(2)
      if (line.startsWith('branch.oid ')) branch.oid = line.slice('branch.oid '.length).trim()
      else if (line.startsWith('branch.head ')) {
        branch.head = line.slice('branch.head '.length).trim()
        branch.detached = branch.head === '(detached)'
      } else if (line.startsWith('branch.upstream ')) branch.upstream = line.slice('branch.upstream '.length).trim()
      else if (line.startsWith('branch.ab ')) {
        const match = /\+(\d+)\s+-(\d+)/.exec(line)
        if (match !== null) {
          branch.ahead = Number(match[1])
          branch.behind = Number(match[2])
        }
      }
      continue
    }
    const kind = token[0]
    if (kind === '?') {
      entries.push({ path: token.slice(2), index: '?', worktree: '?', staged: false, unstaged: false, untracked: true, ignored: false, conflicted: false, renamed: false, origPath: null })
      continue
    }
    if (kind === '!') {
      entries.push({ path: token.slice(2), index: '!', worktree: '!', staged: false, unstaged: false, untracked: false, ignored: true, conflicted: false, renamed: false, origPath: null })
      continue
    }
    if (kind === '1' || kind === '2' || kind === 'u') {
      const parts = token.split(' ')
      const xy = parts[1] ?? '..'
      // porcelain v2：`1 <XY> …<8 个字段> path`、`2 …<9 个字段> path`、`u …<10 个字段> path`。
      const pathIndex = kind === 'u' ? 10 : (kind === '2' ? 9 : 8)
      const path = parts.slice(pathIndex).join(' ')
      let origPath = null
      if (kind === '2') {
        const next = tokens[i + 1]
        if (next !== undefined) {
          origPath = next
          i += 1
        }
      }
      const index = xy[0] ?? '.'
      const worktree = xy[1] ?? '.'
      entries.push({
        path,
        index,
        worktree,
        staged: index !== '.',
        unstaged: worktree !== '.',
        untracked: false,
        ignored: false,
        conflicted: kind === 'u',
        renamed: index === 'R' || worktree === 'R',
        origPath,
      })
      continue
    }
  }
  return { branch, entries }
}

/** 解析 `--pretty=format:LOG_FORMAT` 的输出（末段为提交正文 %b，可能为空）。 */
function parseCommitList(stdout) {
  const commits = []
  for (const chunk of stdout.split('\x1e')) {
    const text = chunk.replace(/^\n+/, '')
    if (text === '') continue
    const parts = text.split('\x1f')
    if (parts.length < 7) continue
    commits.push({
      hash: parts[0],
      shortHash: parts[1],
      author: parts[2],
      email: parts[3],
      date: parts[4],
      parents: parts[5] === '' ? [] : parts[5].split(' '),
      subject: parts[6],
      body: (parts[7] ?? '').trim(),
    })
  }
  return commits
}

const LOG_FORMAT = '%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%P%x1f%s%x1f%b%x1e'
const BRANCH_FORMAT = '%(refname)%1f%(refname:short)%1f%(objectname:short)%1f%(upstream:short)%1f%(upstream:track,nobracket)%1f%(committerdate:iso-strict)%1f%(subject)'
const STASH_FORMAT = '%gd%x1f%H%x1f%ad%x1f%s%x1e'
/** for-each-ref 一次同时取本地与远程分支。 */
const REF_SCOPES = ['refs/heads', 'refs/remotes']

/** 解析 `for-each-ref --format=BRANCH_FORMAT` 的输出（本地 / 远程分组）。 */
function parseBranchList(stdout) {
  const local = []
  const remote = []
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue
    const parts = line.split('\x1f')
    if (parts.length < 7) continue
    const ahead = /ahead (\d+)/.exec(parts[4])
    const behind = /behind (\d+)/.exec(parts[4])
    const row = {
      ref: parts[0],
      name: parts[1],
      shortHash: parts[2],
      upstream: parts[3],
      ahead: ahead === null ? 0 : Number(ahead[1]),
      behind: behind === null ? 0 : Number(behind[1]),
      date: parts[5],
      subject: parts[6],
      kind: parts[0].startsWith('refs/heads/') ? 'local' : 'remote',
    }
    if (row.kind === 'local') local.push(row)
    else remote.push(row)
  }
  return { local, remote }
}

/** 解析 `stash list --pretty=format:STASH_FORMAT` 的输出。 */
function parseStashList(stdout) {
  const stashes = []
  for (const chunk of stdout.split('\x1e')) {
    const text = chunk.replace(/^\n+/, '')
    if (text === '') continue
    const parts = text.split('\x1f')
    if (parts.length < 4) continue
    stashes.push({ ref: parts[0], hash: parts[1], date: parts[2], subject: parts[3] })
  }
  return stashes
}

/** 解析 `git remote -v`：同名远程合并出 fetch / push 两条地址。 */
function parseRemoteList(stdout) {
  const byName = new Map()
  for (const line of stdout.split('\n')) {
    if (line === '') continue
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    const name = line.slice(0, tab)
    const rest = line.slice(tab + 1)
    const at = rest.lastIndexOf(' (')
    const url = (at < 0 ? rest : rest.slice(0, at)).trim()
    const kind = at < 0 ? '' : rest.slice(at + 2).replace(')', '').trim()
    let item = byName.get(name)
    if (item === undefined) {
      item = { name, fetch: '', push: '' }
      byName.set(name, item)
    }
    if (kind === 'push') item.push = url
    else item.fetch = url
  }
  return [...byName.values()]
}

/** 缓存键：Windows 路径大小写不敏感。 */
function cacheKey(path) {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  const subprocess = ctx.get('subprocess')
  const connection = ctx.get('connection')

  console.log(`[dsh-git-vcs] host 半区激活：subprocess=${subprocess === undefined ? '缺席' : '就绪'} connection=${connection === undefined ? '缺席' : '就绪'}`)
  console.log(`[dsh-git-vcs] 配置：allowWrite=${config.allowWrite} allowPush=${config.allowPush} allowDangerous=${config.allowDangerous} gitPath=${config.gitPath === '' ? '(PATH)' : config.gitPath} repoRoot=${config.repoRoot === '' ? '(未限定)' : config.repoRoot}`)

  if (subprocess === undefined) {
    console.warn('[dsh-git-vcs] ctx.subprocess 缺席：无法执行 git，RPC 通道未注册。')
    return
  }

  /** Console 环形缓冲：每次 git 调用一条。 */
  const commandLog = []
  let resolvedGit = null
  /** 仓库根缓存：cacheKey(cwd) → rev-parse --show-toplevel 的结果，省掉每次端点的探测进程。 */
  const rootCache = new Map()
  /** remote.origin.url 缓存：cacheKey(root) → url。 */
  const remoteUrlCache = new Map()
  /** git --version 是进程级常量，只取一次。 */
  let cachedGitVersion = null

  async function resolveGit(signal) {
    if (config.gitPath !== '') return config.gitPath
    if (resolvedGit !== null) return resolvedGit
    resolvedGit = await subprocess.resolveExecutable('git', undefined, signal)
    return resolvedGit
  }

  /** remote.origin.url（按仓库根缓存一次）。 */
  async function remoteUrlOf(root, signal) {
    const key = cacheKey(root)
    if (remoteUrlCache.has(key)) return remoteUrlCache.get(key)
    const result = await runGit(['config', '--get', 'remote.origin.url'], { cwd: root, signal })
    const url = result.exitCode === 0 ? result.stdout.trim() : ''
    remoteUrlCache.set(key, url)
    return url
  }

  /** git 版本（进程级缓存一次）。 */
  async function gitVersionOf(root, signal) {
    if (cachedGitVersion !== null) return cachedGitVersion
    const result = await runGit(['--version'], { cwd: root, signal })
    cachedGitVersion = result.exitCode === 0 ? result.stdout.trim() : ''
    return cachedGitVersion
  }

  /**
   * 执行一次 git。永不因非零退出 throw（由调用方用 gitOk 判定），只有 spawn 失败/超时 throw。
   * @returns {{argv: string[], exitCode: number|null, stdout: string, stderr: string, durationMs: number, aborted: boolean}}
   */
  async function runGit(args, { cwd, signal }) {
    const executable = await resolveGit(signal)
    const timeout = AbortSignal.timeout(config.timeoutMs)
    const bound = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const startedAt = Date.now()
    const handle = subprocess.spawn({
      argv: [executable, ...GIT_COMMON, ...args],
      cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: config.maxOutputBytes },
        stderr: { maxBytes: config.maxOutputBytes },
      },
      graceMs: 5000,
      signal: bound,
      env: GIT_ENV,
    })
    let outcome
    try {
      outcome = await handle.done
    } catch (cause) {
      throw new GitError('git-vcs/spawn-failed', `无法启动 git：${cause instanceof Error ? cause.message : String(cause)}`, {
        argv: ['git', ...args],
      })
    }
    const stdout = readCollected(handle.collected.stdout)
    const stderr = readCollected(handle.collected.stderr)
    const durationMs = Date.now() - startedAt
    const record = {
      at: startedAt,
      argv: ['git', ...args],
      exitCode: outcome.exitCode,
      durationMs,
      stdout: stdout.text,
      stderr: stderr.text,
      truncated: stdout.truncated || stderr.truncated,
      timeout: timeout.aborted,
    }
    commandLog.push(record)
    while (commandLog.length > config.consoleLimit) commandLog.shift()
    return {
      argv: record.argv,
      exitCode: outcome.exitCode,
      stdout: stdout.text,
      stderr: stderr.text,
      truncated: record.truncated,
      durationMs,
      aborted: bound.aborted,
      timedOut: timeout.aborted,
    }
  }

  /** 非零退出即抛 GitError（按 stderr 归类）。 */
  function gitOk(result, { allowExit = [0] } = {}) {
    if (result.exitCode !== null && allowExit.includes(result.exitCode)) return result
    const stderr = result.stderr.trim()
    const stdout = result.stdout.trim()
    throw new GitError(
      result.timedOut ? 'git-vcs/timeout' : classify(result.exitCode, stderr, result.aborted),
      stderr !== '' ? stderr : (stdout !== '' ? stdout : `git 退出码 ${result.exitCode}`),
      { argv: result.argv, exitCode: result.exitCode },
    )
  }

  /** 解析并校验 cwd：绝对路径、存在、是目录、在 repoRoot 之下、确为 git 工作树。 */
  async function ensureWorkdir(rawCwd, signal) {
    if (typeof rawCwd !== 'string' || rawCwd.trim() === '') {
      throw new GitError('git-vcs/bad-request', '缺少 cwd（会话工作目录）')
    }
    if (!isAbsolute(rawCwd)) {
      throw new GitError('git-vcs/bad-request', `cwd 必须是绝对路径：${rawCwd}`)
    }
    const cwd = resolvePath(rawCwd)
    if (config.repoRoot !== '') {
      const root = resolvePath(config.repoRoot)
      const same = process.platform === 'win32' ? cwd.toLowerCase() === root.toLowerCase() : cwd === root
      const inside = process.platform === 'win32' ? isInside(cwd.toLowerCase(), root.toLowerCase()) : isInside(cwd, root)
      if (!same && !inside) {
        throw new GitError('git-vcs/outside-root', `路径不在允许的仓库根内：${cwd}`, { repoRoot: root })
      }
    }
    const info = await stat(cwd).catch(() => undefined)
    if (info === undefined || !info.isDirectory()) {
      throw new GitError('git-vcs/bad-request', `工作目录不存在或不是目录：${cwd}`)
    }
    const key = cacheKey(cwd)
    const cached = rootCache.get(key)
    if (cached !== undefined) return { cwd, root: cached }
    const top = await runGit(['rev-parse', '--show-toplevel'], { cwd, signal })
    if (top.exitCode !== 0) {
      throw new GitError('git-vcs/not-a-repo', `不是 git 仓库：${cwd}`, { cwd })
    }
    const root = top.stdout.trim()
    rootCache.set(key, root)
    rootCache.set(cacheKey(root), root)
    return { cwd, root }
  }

  function requireWrite() {
    if (!config.allowWrite) {
      throw new GitError('git-vcs/write-disabled', '写操作已被插件配置关闭（allowWrite=false）')
    }
  }

  function requirePush() {
    requireWrite()
    if (!config.allowPush) {
      throw new GitError('git-vcs/push-disabled', 'push 已被插件配置关闭（allowPush=false）')
    }
  }

  function requireDangerous() {
    requireWrite()
    if (!config.allowDangerous) {
      throw new GitError('git-vcs/dangerous-disabled', '危险操作已被插件配置关闭（allowDangerous=false）')
    }
  }

  /** 取要操作的路径数组（JSON 兼容校验）。 */
  function readPaths(payload) {
    const paths = payload?.paths
    if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string' || p === '' || p.includes('\0'))) {
      throw new GitError('git-vcs/bad-request', 'paths 必须是非空字符串数组')
    }
    return paths
  }

  function readRef(payload, key = 'ref') {
    const ref = payload?.[key]
    if (typeof ref !== 'string' || ref.trim() === '') {
      throw new GitError('git-vcs/bad-request', `${key} 必须是非空字符串`)
    }
    if (ref.startsWith('-')) {
      throw new GitError('git-vcs/bad-request', `${key} 不能以 - 开头`)
    }
    return ref
  }

  function readMessage(payload) {
    const message = payload?.message
    if (typeof message !== 'string' || message.trim() === '') {
      throw new GitError('git-vcs/bad-request', '提交信息不能为空')
    }
    return message
  }

  /** 一次 status 调用（repo/info 与 status 端点共用）。 */
  async function statusOf(cwd, signal) {
    const result = gitOk(await runGit(['status', '--porcelain=v2', '--branch', '-z'], { cwd, signal }))
    return parseStatus(result.stdout)
  }

  /** 生效配置：浏览器半区据此决定按钮可用性。 */
  function configView() {
    return {
      allowWrite: config.allowWrite,
      allowPush: config.allowPush,
      allowDangerous: config.allowDangerous,
      diffContextLines: config.diffContextLines,
      autoRefreshSeconds: config.autoRefreshSeconds,
    }
  }

  const endpoints = {
    /** 仓库总览 + 生效配置（分支/领先落后由一次 status 给出，省掉两次 rev-parse）。 */
    async 'repo/info'(payload, signal) {
      const { cwd, root } = await ensureWorkdir(payload?.cwd, signal)
      const [status, remoteUrl, gitVersion] = await Promise.all([
        statusOf(root, signal),
        remoteUrlOf(root, signal),
        gitVersionOf(root, signal),
      ])
      const branchName = status.branch.head !== '' ? status.branch.head : status.branch.oid
      return {
        repo: {
          cwd,
          root,
          branch: branchName,
          detached: status.branch.detached || branchName === 'HEAD',
          shortHead: status.branch.oid.slice(0, 7),
          oid: status.branch.oid,
          upstream: status.branch.upstream,
          ahead: status.branch.ahead,
          behind: status.branch.behind,
          remoteUrl,
          gitVersion,
        },
        config: configView(),
      }
    },

    /**
     * 面板首屏聚合端点：repo/info + status + log + branches + stash + console 合成一次往返。
     * 6 个 git 探测全部并发——单次刷新的进程创建从约 16 次（6 次往返、串行）降到 6 次同波。
     */
    async 'repo/snapshot'(payload, signal) {
      const { cwd, root } = await ensureWorkdir(payload?.cwd, signal)
      const limit = clampInt(Number.isInteger(payload?.limit) ? payload.limit : 50, 1, 500, 50)
      const consoleLimit = clampInt(Number.isInteger(payload?.consoleLimit) ? payload.consoleLimit : 60, 1, config.consoleLimit, 60)
      const [statusResult, logResult, branchResult, stashResult, remoteUrl, gitVersion] = await Promise.all([
        runGit(['status', '--porcelain=v2', '--branch', '-z'], { cwd: root, signal }),
        runGit(['log', '--no-color', '--date=iso-strict', `--pretty=format:${LOG_FORMAT}`, '-n', String(limit)], { cwd: root, signal }),
        runGit(['for-each-ref', `--format=${BRANCH_FORMAT}`, ...REF_SCOPES], { cwd: root, signal }),
        runGit(['stash', 'list', '--date=iso-strict', `--pretty=format:${STASH_FORMAT}`], { cwd: root, signal }),
        remoteUrlOf(root, signal),
        gitVersionOf(root, signal),
      ])
      const status = parseStatus(gitOk(statusResult).stdout)
      const branchName = status.branch.head !== '' ? status.branch.head : status.branch.oid
      const noCommits = logResult.exitCode !== 0 && logResult.stderr.includes('does not have any commits')
      return {
        repo: {
          cwd,
          root,
          branch: branchName,
          detached: status.branch.detached || branchName === 'HEAD',
          shortHead: status.branch.oid.slice(0, 7),
          oid: status.branch.oid,
          upstream: status.branch.upstream,
          ahead: status.branch.ahead,
          behind: status.branch.behind,
          remoteUrl,
          gitVersion,
        },
        config: configView(),
        status,
        commits: noCommits ? [] : parseCommitList(logResult.stdout),
        branches: branchResult.exitCode === 0 ? parseBranchList(branchResult.stdout) : { local: [], remote: [] },
        stashes: stashResult.exitCode === 0 ? parseStashList(stashResult.stdout) : [],
        console: commandLog.slice(-consoleLimit).map((entry) => ({ ...entry })),
      }
    },

    /** 把当前目录初始化为 git 仓库（IDEA 的 "Add project to VCS"）。 */
    async init(payload, signal) {
      requireWrite()
      const raw = payload?.cwd
      if (typeof raw !== 'string' || !isAbsolute(raw)) {
        throw new GitError('git-vcs/bad-request', 'cwd 必须是绝对路径')
      }
      const cwd = resolvePath(raw)
      const info = await stat(cwd).catch(() => undefined)
      if (info === undefined || !info.isDirectory()) {
        throw new GitError('git-vcs/bad-request', `目录不存在：${cwd}`)
      }
      const result = gitOk(await runGit(['init'], { cwd, signal }))
      // 刚初始化出来的仓库：把根写进缓存，省掉后续端点的一次探测。
      rootCache.set(cacheKey(cwd), cwd)
      remoteUrlCache.delete(cacheKey(cwd))
      return { root: cwd, message: result.stdout.trim() }
    },

    /** 变更列表（含分支跟踪信息）。 */
    async status(payload, signal) {
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      return statusOf(root, signal)
    },

    /** 单个文件的统一 diff；untracked 走 --no-index（退出码 1 表示有差异）。 */
    async diff(payload, signal) {
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const filePath = payload?.path
      const context = Number.isInteger(payload?.context) ? payload.context : config.diffContextLines
      const args = ['diff', '--no-color', '--no-ext-diff', `-U${clampInt(context, 0, 200, config.diffContextLines)}`]
      if (payload?.staged === true) args.push('--cached')
      if (typeof payload?.rev === 'string' && payload.rev !== '') args.push(readRef(payload, 'rev'))
      args.push('--')
      if (typeof filePath === 'string' && filePath !== '') {
        if (filePath.includes('\0')) throw new GitError('git-vcs/bad-request', 'path 非法')
        args.push(filePath)
      }
      if (payload?.untracked === true) {
        const result = await runGit(['diff', '--no-color', '--no-ext-diff', '--no-index', '--', '/dev/null', String(filePath)], { cwd: root, signal })
        gitOk(result, { allowExit: [0, 1] })
        return { patch: result.stdout, empty: result.stdout.trim() === '', argv: result.argv }
      }
      const result = gitOk(await runGit(args, { cwd: root, signal }), { allowExit: [0, 1] })
      return { patch: result.stdout, empty: result.stdout.trim() === '', argv: result.argv }
    },

    /** 提交历史。 */
    async log(payload, signal) {
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const limit = clampInt(Number.isInteger(payload?.limit) ? payload.limit : 50, 1, 500, 50)
      const args = ['log', '--no-color', '--date=iso-strict', `--pretty=format:${LOG_FORMAT}`, '-n', String(limit)]
      if (Number.isInteger(payload?.skip) && payload.skip > 0) args.push(`--skip=${payload.skip}`)
      if (payload?.all === true) args.push('--all')
      const branch = payload?.branch
      if (typeof branch === 'string' && branch !== '') args.push(readRef(payload, 'branch'))
      const filePath = payload?.path
      if (typeof filePath === 'string' && filePath !== '') {
        args.push('--', filePath)
      }
      const result = await runGit(args, { cwd: root, signal })
      if (result.exitCode !== 0 && result.stderr.includes('does not have any commits')) return { commits: [] }
      gitOk(result)
      return { commits: parseCommitList(result.stdout) }
    },

    /** 单个提交：元数据 + 变更文件 + patch。 */
    async show(payload, signal) {
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const rev = readRef(payload, 'rev')
      const filePath = typeof payload?.path === 'string' && payload.path !== '' ? payload.path : null
      const nameArgs = ['show', '--no-color', '--format=', '--name-status', rev]
      const patchArgs = ['show', '--no-color', '--format=', `-U${config.diffContextLines}`, rev]
      if (filePath !== null) {
        nameArgs.push('--', filePath)
        patchArgs.push('--', filePath)
      }
      // 三段探测并发：点一次提交只等一波进程创建。
      const [meta, nameStatus, patch] = await Promise.all([
        runGit(['show', '--no-color', '--date=iso-strict', `--pretty=format:${LOG_FORMAT}`, '--no-patch', rev], { cwd: root, signal }),
        runGit(nameArgs, { cwd: root, signal }),
        runGit(patchArgs, { cwd: root, signal }),
      ])
      const commits = parseCommitList(gitOk(meta).stdout)
      const files = []
      for (const line of gitOk(nameStatus).stdout.split('\n')) {
        if (line.trim() === '') continue
        const parts = line.split('\t')
        if (parts.length < 2) continue
        files.push({ status: parts[0], path: parts[parts.length - 1], origPath: parts.length > 2 ? parts[1] : null })
      }
      gitOk(patch)
      return { commit: commits[0] ?? null, files, patch: patch.stdout }
    },

    /** 本地 + 远程分支。 */
    async branches(payload, signal) {
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const result = gitOk(await runGit(['for-each-ref', `--format=${BRANCH_FORMAT}`, ...REF_SCOPES], { cwd: root, signal }))
      return parseBranchList(result.stdout)
    },

    /** 远程仓库列表（git remote -v）：同名远程合并 fetch / push 两条地址。 */
    async 'remote/list'(payload, signal) {
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const result = gitOk(await runGit(['remote', '-v'], { cwd: root, signal }))
      return { remotes: parseRemoteList(result.stdout), root }
    },

    /** 暂存（git add）。 */
    async stage(payload, signal) {
      requireWrite()
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const args = payload?.all === true ? ['add', '-A'] : ['add', '--', ...readPaths(payload)]
      const result = gitOk(await runGit(args, { cwd: root, signal }))
      return { argv: result.argv, stdout: result.stdout }
    },

    /** 取消暂存（git restore --staged）。 */
    async unstage(payload, signal) {
      requireWrite()
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const args = payload?.all === true ? ['restore', '--staged', '--', '.'] : ['restore', '--staged', '--', ...readPaths(payload)]
      const result = gitOk(await runGit(args, { cwd: root, signal }))
      return { argv: result.argv, stdout: result.stdout }
    },

    /** 丢弃工作区改动（危险）：未跟踪文件走 clean，其余走 restore。 */
    async discard(payload, signal) {
      requireDangerous()
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const paths = readPaths(payload)
      const tracked = []
      const untracked = []
      for (const p of paths) {
        const check = await runGit(['ls-files', '--error-unmatch', '--', p], { cwd: root, signal })
        if (check.exitCode === 0) tracked.push(p)
        else untracked.push(p)
      }
      if (tracked.length > 0) gitOk(await runGit(['restore', '--', ...tracked], { cwd: root, signal }))
      if (untracked.length > 0) gitOk(await runGit(['clean', '-f', '--', ...untracked], { cwd: root, signal }))
      return { restored: tracked, removed: untracked }
    },

    /** 提交（可选 amend）。调用方通常先 stage。 */
    async commit(payload, signal) {
      requireWrite()
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const message = readMessage(payload)
      const args = ['commit', '-m', message]
      if (payload?.amend === true) args.push('--amend')
      if (payload?.signoff === true) args.push('--signoff')
      if (Array.isArray(payload?.paths) && payload.paths.length > 0) args.push('--', ...readPaths(payload))
      const result = gitOk(await runGit(args, { cwd: root, signal }))
      return { stdout: result.stdout, stderr: result.stderr }
    },

    /** 切换分支 / 检出引用（create=true 时新建并切换）。 */
    async checkout(payload, signal) {
      requireWrite()
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const ref = readRef(payload)
      const args = payload?.create === true ? ['checkout', '-b', ref] : ['checkout', ref]
      const result = gitOk(await runGit(args, { cwd: root, signal }))
      return { stdout: result.stdout, stderr: result.stderr }
    },

    /** 新建分支（不切换）。 */
    async 'branch/create'(payload, signal) {
      requireWrite()
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const name = readRef(payload, 'name')
      const args = ['branch', name]
      if (typeof payload?.startPoint === 'string' && payload.startPoint !== '') args.push(readRef(payload, 'startPoint'))
      const result = gitOk(await runGit(args, { cwd: root, signal }))
      return { stdout: result.stdout }
    },

    /** 删除分支（危险）。 */
    async 'branch/delete'(payload, signal) {
      requireDangerous()
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const name = readRef(payload, 'name')
      const args = ['branch', payload?.force === true ? '-D' : '-d', name]
      const result = gitOk(await runGit(args, { cwd: root, signal }))
      return { stdout: result.stdout, stderr: result.stderr }
    },

    /** 合并一个引用到当前分支。 */
    async merge(payload, signal) {
      requireWrite()
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const ref = readRef(payload)
      const result = await runGit(['merge', '--no-edit', ref], { cwd: root, signal })
      gitOk(result)
      return { stdout: result.stdout, stderr: result.stderr }
    },

    async fetch(payload, signal) {
      requireWrite()
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const args = ['fetch', '--prune']
      if (typeof payload?.remote === 'string' && payload.remote !== '') args.push(readRef(payload, 'remote'))
      const result = gitOk(await runGit(args, { cwd: root, signal }))
      return { stdout: result.stdout, stderr: result.stderr }
    },

    async pull(payload, signal) {
      requireWrite()
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const result = await runGit(['pull', '--no-edit'], { cwd: root, signal })
      gitOk(result)
      return { stdout: result.stdout, stderr: result.stderr }
    },

    async push(payload, signal) {
      requirePush()
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const args = ['push']
      if (payload?.setUpstream === true) args.push('--set-upstream', 'origin', readRef(payload, 'branch'))
      else if (typeof payload?.branch === 'string' && payload.branch !== '') args.push(readRef(payload, 'branch'))
      const result = await runGit(args, { cwd: root, signal })
      gitOk(result)
      return { stdout: result.stdout, stderr: result.stderr }
    },

    /** 贮藏（stash）操作。 */
    async stash(payload, signal) {
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const action = payload?.action
      if (action === 'list') {
        const result = gitOk(await runGit(['stash', 'list', '--date=iso-strict', `--pretty=format:${STASH_FORMAT}`], { cwd: root, signal }))
        return { stashes: parseStashList(result.stdout) }
      }
      requireWrite()
      if (action === 'push') {
        const args = ['stash', 'push']
        if (typeof payload?.message === 'string' && payload.message !== '') args.push('-m', payload.message)
        const result = gitOk(await runGit(args, { cwd: root, signal }))
        return { stdout: result.stdout }
      }
      if (action === 'pop' || action === 'apply' || action === 'drop') {
        const args = ['stash', action]
        if (typeof payload?.ref === 'string' && payload.ref !== '') args.push(readRef(payload, 'ref'))
        const result = gitOk(await runGit(args, { cwd: root, signal }))
        return { stdout: result.stdout, stderr: result.stderr }
      }
      throw new GitError('git-vcs/bad-request', `未知的 stash action：${String(action)}`)
    },

    /** 回滚一个提交（生成反向提交，危险）。 */
    async revert(payload, signal) {
      requireDangerous()
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const rev = readRef(payload, 'rev')
      const result = await runGit(['revert', '--no-edit', rev], { cwd: root, signal })
      gitOk(result)
      return { stdout: result.stdout, stderr: result.stderr }
    },

    /** 拣选一个提交（危险）。 */
    async 'cherry-pick'(payload, signal) {
      requireDangerous()
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const rev = readRef(payload, 'rev')
      const result = await runGit(['cherry-pick', rev], { cwd: root, signal })
      gitOk(result)
      return { stdout: result.stdout, stderr: result.stderr }
    },

    /** 重置到某个提交（危险，mode = soft | mixed | hard）。 */
    async reset(payload, signal) {
      requireDangerous()
      const { root } = await ensureWorkdir(payload?.cwd, signal)
      const rev = readRef(payload, 'rev')
      const mode = payload?.mode
      if (mode !== 'soft' && mode !== 'mixed' && mode !== 'hard') {
        throw new GitError('git-vcs/bad-request', 'mode 必须是 soft | mixed | hard')
      }
      const result = await runGit(['reset', `--${mode}`, rev], { cwd: root, signal })
      gitOk(result)
      return { stdout: result.stdout, stderr: result.stderr }
    },

    /** Console 数据：最近的 git 调用。 */
    async 'console/list'(payload) {
      const limit = clampInt(Number.isInteger(payload?.limit) ? payload.limit : 100, 1, config.consoleLimit, 100)
      return { entries: commandLog.slice(-limit).map((entry) => ({ ...entry })) }
    },

    /** 清空 Console。 */
    async 'console/clear'() {
      commandLog.length = 0
      return { cleared: true }
    },
  }

  const handler = async (endpoint, payload, signal) => {
    const fn = endpoints[endpoint]
    if (fn === undefined) {
      return { ok: false, error: { code: 'git-vcs/unknown-endpoint', message: `未知端点：${String(endpoint)}`, details: {} } }
    }
    try {
      const value = await fn(payload ?? {}, signal)
      return { ok: true, value }
    } catch (cause) {
      if (cause instanceof GitError) {
        return { ok: false, error: { code: cause.code, message: cause.message, details: cause.details } }
      }
      const message = cause instanceof Error ? cause.message : String(cause)
      console.warn(`[dsh-git-vcs] 端点 ${endpoint} 失败：${message}`)
      return { ok: false, error: { code: 'git-vcs/internal', message, details: {} } }
    }
  }

  if (connection === undefined) {
    console.warn(`[dsh-git-vcs] ctx.connection 缺席：RPC 通道 ${RPC_CHANNEL} 未注册，浏览器半区将拿不到数据。`)
    return
  }

  ctx.effect(() => {
    const pending = connection.rpc.handle(RPC_CHANNEL, handler)
    return () => {
      void Promise.resolve(pending).then((dispose) => dispose()).catch(() => undefined)
    }
  }, 'dsh-git-vcs: rpc channel')
  console.log(`[dsh-git-vcs] RPC 通道已注册：${RPC_CHANNEL}`)
}
