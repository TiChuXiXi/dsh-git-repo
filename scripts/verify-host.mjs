/**
 * host 半区自检：不挂 profile，直接把 index.js 的 apply() 跑起来，用假的 ctx.subprocess 执行真实 git，
 * 校验只读端点的解析结果、错误码与写操作门禁。
 *
 * 用法：node scripts/verify-host.mjs [仓库路径]   （默认当前目录；只做只读调用，不改仓库状态）
 *
 * 注意：沙箱下 Node 抓子进程输出不能用管道（EPERM），这里统一用文件描述符重定向。
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { apply } from '../index.js'

const REPO = resolve(process.argv[2] ?? process.cwd())
const scratch = mkdtempSync(join(tmpdir(), 'gitvcs-verify-'))
let counter = 0

const fakeSubprocess = {
  async resolveExecutable(command) {
    return command
  },
  spawn(spec) {
    const id = counter++
    const outPath = join(scratch, `out-${id}.txt`)
    const errPath = join(scratch, `err-${id}.txt`)
    const outFd = openSync(outPath, 'w')
    const errFd = openSync(errPath, 'w')
    const child = spawn(spec.argv[0], spec.argv.slice(1), {
      cwd: spec.cwd,
      env: { ...process.env, ...(spec.env ?? {}) },
      stdio: ['ignore', outFd, errFd],
      windowsHide: true,
      signal: spec.signal,
    })
    const done = new Promise((settle, reject) => {
      child.on('error', (cause) => {
        closeSync(outFd)
        closeSync(errFd)
        reject(cause)
      })
      child.on('close', (code, signal) => {
        closeSync(outFd)
        closeSync(errFd)
        settle({ exitCode: code, signal: signal ?? null })
      })
    })
    const reader = (path) => ({
      readFrom() {
        let text = ''
        try {
          text = readFileSync(path, 'utf8')
        } catch {
          text = ''
        }
        return { text, nextOffset: text.length, lossy: false }
      },
    })
    return {
      stdin: undefined,
      stdout: undefined,
      stderr: undefined,
      collected: { stdout: reader(outPath), stderr: reader(errPath) },
      done,
      terminate() {
        child.kill()
      },
      async waitForExit() {
        return true
      },
    }
  },
}

let handler
const fakeCtx = {
  get(key) {
    if (key === 'subprocess') return fakeSubprocess
    if (key === 'connection') {
      return {
        rpc: {
          handle(channel, fn) {
            handler = fn
            return Promise.resolve(async () => undefined)
          },
        },
      }
    }
    return undefined
  },
  effect(fn) {
    fn()
  },
}

apply(fakeCtx, { allowWrite: true, allowPush: false, allowDangerous: true })

const results = []
async function check(label, endpoint, payload, inspect) {
  const result = await handler(endpoint, payload, new AbortController().signal)
  if (result.ok !== true) {
    results.push(`FAIL ${label}: ${result.error.code} ${result.error.message}`)
    return
  }
  const problem = inspect === undefined ? undefined : inspect(result.value)
  results.push(problem === undefined ? `OK   ${label}` : `FAIL ${label}: ${problem}`)
}

const cwd = REPO
/** git 输出的路径分隔符是正斜杠，比较前统一。 */
const samePath = (left, right) => left.replace(/\\/g, '/').toLowerCase() === right.replace(/\\/g, '/').toLowerCase()

await check('repo/info', 'repo/info', { cwd }, (value) => {
  if (!samePath(value.repo.root, REPO)) return `root=${value.repo.root}`
  if (value.repo.branch !== 'main') return `branch=${value.repo.branch}`
  if (value.config.allowPush !== false) return 'allowPush 未透传'
  return undefined
})

await check('repo/snapshot 聚合', 'repo/snapshot', { cwd, limit: 5 }, (value) => {
  if (value.repo === null || typeof value.repo !== 'object') return 'repo 缺失'
  if (!samePath(value.repo.root, REPO)) return `root=${value.repo.root}`
  if (!Array.isArray(value.commits) || value.commits.length === 0) return 'commits 为空'
  if (value.branches === null || !Array.isArray(value.branches.local)) return 'branches 缺失'
  if (!Array.isArray(value.stashes)) return 'stashes 不是数组'
  if (!Array.isArray(value.console) || value.console.length === 0) return 'console 为空'
  const bad = value.status.entries.find((entry) => typeof entry.path !== 'string' || entry.path === '')
  return bad === undefined ? undefined : `条目 path 异常：${JSON.stringify(bad)}`
})

await check('remote/list', 'remote/list', { cwd }, (value) => {
  if (!Array.isArray(value.remotes)) return 'remotes 不是数组'
  return undefined
})

await check('status 解析', 'status', { cwd }, (value) => {
  if (!Array.isArray(value.entries)) return 'entries 不是数组'
  if (typeof value.branch.head !== 'string') return 'branch.head 缺失'
  const bad = value.entries.find((entry) => typeof entry.path !== 'string' || entry.path === '')
  return bad === undefined ? undefined : `条目 path 异常：${JSON.stringify(bad)}`
})

await check('log 解析', 'log', { cwd, limit: 5 }, (value) => {
  if (!Array.isArray(value.commits) || value.commits.length === 0) return '没有解析到提交'
  const first = value.commits[0]
  if (typeof first.hash !== 'string' || first.hash.length < 7) return `hash 异常 ${first.hash}`
  if (typeof first.subject !== 'string') return 'subject 缺失'
  return undefined
})

await check('branches 解析', 'branches', { cwd }, (value) => {
  if (!Array.isArray(value.local)) return 'local 不是数组'
  const main = value.local.find((row) => row.name === 'main')
  return main === undefined ? '没有找到 main 分支' : undefined
})

await check('diff 全仓', 'diff', { cwd }, (value) => typeof value.patch === 'string' ? undefined : 'patch 不是字符串')

await check('show 单提交', 'show', { cwd, rev: 'HEAD' }, (value) => {
  if (value.commit === null) return 'commit 元数据为空'
  if (!Array.isArray(value.files)) return 'files 不是数组'
  return undefined
})

await check('console/list', 'console/list', {}, (value) => {
  if (!Array.isArray(value.entries) || value.entries.length === 0) return '命令流水为空'
  const bad = value.entries.find((entry) => !Array.isArray(entry.argv))
  return bad === undefined ? undefined : 'argv 缺失'
})

// 未知端点：必须返回 git-vcs/unknown-endpoint 信封（不抛）。
const unknown = await handler('nope/nope', {}, new AbortController().signal)
if (unknown.ok !== false || unknown.error.code !== 'git-vcs/unknown-endpoint') {
  results.push('FAIL 未知端点未返回 git-vcs/unknown-endpoint')
} else {
  results.push('OK   未知端点返回 git-vcs/unknown-endpoint')
}

// 写操作门禁：allowPush=false 时 push 必须在跑 git 之前就被拒。
const push = await handler('push', { cwd }, new AbortController().signal)
if (push.ok === false && push.error.code === 'git-vcs/push-disabled') results.push('OK   push 被配置门禁拦截')
else results.push(`FAIL push 未被拦截：${JSON.stringify(push).slice(0, 160)}`)

const badCwd = await handler('status', { cwd: 'relative/path' }, new AbortController().signal)
if (badCwd.ok === false && badCwd.error.code === 'git-vcs/bad-request') results.push('OK   相对路径被拒')
else results.push('FAIL 相对路径未被拒')

const outside = await handler('status', { cwd: 'C:\\Windows' }, new AbortController().signal)
if (outside.ok === false && (outside.error.code === 'git-vcs/not-a-repo' || outside.error.code === 'git-vcs/bad-request')) {
  results.push(`OK   非仓库目录被拒（${outside.error.code}）`)
} else {
  results.push(`FAIL 非仓库目录未按预期被拒：${JSON.stringify(outside).slice(0, 160)}`)
}

/* ----------------------------------------- remote/add / remote/remove 端点
 * 用 mkdtemp + 真实 git 建临时仓库；add/remove 是写操作，会改 .git/config，
 * 不能拿真实仓库试。所有断言用与上面同样的 check() 风格，跑完整体 rmSync。
 */
async function expectError(label, endpoint, payload, expectedCode) {
  const result = await handler(endpoint, payload, new AbortController().signal)
  if (result.ok === false && result.error.code === expectedCode) {
    results.push(`OK   ${label}`)
  } else {
    results.push(`FAIL ${label}: 期望 ${expectedCode}，得到 ${JSON.stringify(result).slice(0, 200)}`)
  }
}

const remoteScratch = mkdtempSync(join(tmpdir(), 'gitvcs-remote-'))
function rawGit(args) {
  const r = spawnSync('git', args, { cwd: remoteScratch, env: process.env, stdio: 'ignore', windowsHide: true })
  return r.status
}
rawGit(['init', '--initial-branch=main', '--quiet'])
rawGit(['config', 'user.email', 'verify@test'])
rawGit(['config', 'user.name', 'verify'])
rawGit(['commit', '--allow-empty', '--quiet', '-m', 'init'])

await expectError('remote/add 缺 name', 'remote/add', { cwd: remoteScratch }, 'git-vcs/bad-request')
await expectError('remote/add 缺 url', 'remote/add', { cwd: remoteScratch, name: 'foo' }, 'git-vcs/bad-request')
await expectError('remote/add 名字非法 ..evil', 'remote/add', { cwd: remoteScratch, name: '..evil', url: 'https://example.com/r.git' }, 'git-vcs/bad-request')

await check('remote/add 正常', 'remote/add', { cwd: remoteScratch, name: 'test-origin', url: 'https://example.com/r.git' }, (value) => {
  if (value === null || value === undefined) return '返回值为空'
  if (value.name !== 'test-origin') return `name=${value.name}`
  if (value.url !== 'https://example.com/r.git') return `url=${value.url}`
  return undefined
})

await check('remote/list 验证 add', 'remote/list', { cwd: remoteScratch }, (value) => {
  const hit = Array.isArray(value.remotes) ? value.remotes.find((r) => r.name === 'test-origin') : undefined
  return hit === undefined ? '新增远程未出现在 list 中' : undefined
})

await expectError('remote/add 重名', 'remote/add', { cwd: remoteScratch, name: 'test-origin', url: 'https://x.com/y.git' }, 'git-vcs/remote-exists')
await expectError('remote/remove 不存在', 'remote/remove', { cwd: remoteScratch, name: 'nope' }, 'git-vcs/remote-not-found')

await check('remote/remove 正常', 'remote/remove', { cwd: remoteScratch, name: 'test-origin' }, (value) => {
  if (value === null || value === undefined) return '返回值为空'
  if (value.removed !== 'test-origin') return `removed=${value.removed}`
  return undefined
})

await check('remote/list 验证 remove', 'remote/list', { cwd: remoteScratch }, (value) => {
  const hit = Array.isArray(value.remotes) ? value.remotes.find((r) => r.name === 'test-origin') : undefined
  return hit === undefined ? undefined : '删除远程仍出现在 list 中'
})

rmSync(remoteScratch, { recursive: true, force: true })

console.log(results.join('\n'))
const failed = results.filter((line) => line.startsWith('FAIL'))
console.log(`\n结果：${results.length - failed.length} 通过 / ${failed.length} 失败`)
rmSync(scratch, { recursive: true, force: true })
process.exit(failed.length > 0 ? 1 : 0)
