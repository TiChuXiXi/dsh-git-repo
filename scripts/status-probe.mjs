/**
 * 一次性探针：直接用插件自己的 host 半区（index.js）读当前工作区，
 * 打印 status 解析出的条目与每个条目的 diff 长度，用于判断「列表报已修改但差异为空」是解析问题还是文件确实无改动。
 *
 * 用法：node .opencode/status-probe.mjs [仓库路径]
 */
import { spawn } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { apply } from '../index.js'

const REPO = resolve(process.argv[2] ?? process.cwd())
const scratch = mkdtempSync(join(tmpdir(), 'gitvcs-probe-'))
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

const call = (endpoint, payload) => handler(endpoint, payload, new AbortController().signal)

const status = await call('status', { cwd: REPO })
if (status.ok !== true) {
  console.log('status 失败：', status.error)
  process.exit(1)
}

const entries = Array.isArray(status.value.entries) ? status.value.entries : []
console.log(`分支：${status.value.branch.head}　条目数：${entries.length}`)
for (const entry of entries) {
  const staged = await call('diff', { cwd: REPO, path: entry.path, staged: true })
  const worktree = await call('diff', { cwd: REPO, path: entry.path, staged: false })
  const untracked = await call('diff', { cwd: REPO, path: entry.path, untracked: true })
  const stagedLen = staged.ok === true ? staged.value.patch.length : -1
  const worktreeLen = worktree.ok === true ? worktree.value.patch.length : -1
  const untrackedLen = untracked.ok === true ? untracked.value.patch.length : `错误 ${untracked.error.code}`
  console.log(`  index=${entry.index} worktree=${entry.worktree} staged=${entry.staged} unstaged=${entry.unstaged} untracked=${entry.untracked === true} ignored=${entry.ignored === true} path=${entry.path}`)
  console.log(`    diff --cached=${stagedLen}　diff 工作区=${worktreeLen}　diff untracked=true=${untrackedLen}`)
  if (untracked.ok === true && typeof untracked.value.patch === 'string' && untracked.value.patch !== '') {
    console.log(`    untracked patch 首行：${untracked.value.patch.split('\n').slice(0, 4).join(' | ')}`)
  }
}
