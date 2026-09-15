/**
 * 动态预览自检：在**与动态沙箱同构**的 node:vm 上下文里装载真实 host 半区，
 * 再用动态通道（harness.handle）调端点，并按 host-runner 的 cloneJson 规则校验返回的信封。
 *
 * 用途：真机上「host.call 返回非无损 JSON」这类只有动态沙箱才会暴露的问题，先在这里复现。
 * 用法：node .opencode/preview-check.mjs [仓库路径]
 */
import { spawn } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, statSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createContext, runInContext } from 'node:vm'

const REPO = resolve(process.argv[2] ?? process.cwd())
const ROOT = resolve(import.meta.dirname, '..')
const scratch = mkdtempSync(join(tmpdir(), 'gitvcs-preview-'))
let counter = 0

/* ---------------------------------------------------------------- 假的服务 */

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

const fakeFs = {
  async resolve(path) {
    return { path }
  },
  async readText(target) {
    return readFileSync(target.path, 'utf8')
  },
  async listDir(target) {
    readdirSync(target.path)
    return []
  },
}

const registry = new Map()
const fakeCtx = {
  get(key) {
    if (key === 'subprocess') return fakeSubprocess
    if (key === 'fs') return fakeFs
    return undefined
  },
  effect(fn) {
    fn()
  },
}

/* -------------------------------------------------- 与真实 loader 相同的转换 */

const HOST_FILE = join(ROOT, 'index.js')
const CHANNEL = 'git-vcs'
const CONNECTION_SHIM = "const connection = { rpc: { handle: (_channel, handler) => { bridge.handler = handler; return harness.handle('" + CHANNEL + "', (args) => bridge.invoke(args)) } } }"

/** 沙箱里没有 AbortSignal：用鸭子类型信号顶上（真实 subprocess 只按属性校验）。 */
function makeAbortSignal() {
  const listeners = new Set()
  const signal = {
    aborted: false,
    reason: undefined,
    onabort: null,
    addEventListener(type, listener) {
      if (type === 'abort' && typeof listener === 'function') listeners.add(listener)
    },
    removeEventListener(type, listener) {
      if (type === 'abort') listeners.delete(listener)
    },
    dispatchEvent() {
      return false
    },
    throwIfAborted() {
      if (signal.aborted === true) throw signal.reason
    },
    fire(reason) {
      if (signal.aborted === true) return
      signal.aborted = true
      signal.reason = reason
      const event = { type: 'abort', target: signal }
      if (typeof signal.onabort === 'function') signal.onabort(event)
      for (const listener of [...listeners]) listener(event)
    },
  }
  return signal
}
const AbortSignalShim = {
  timeout(ms) {
    const signal = makeAbortSignal()
    setTimeout(() => signal.fire(new Error(`git 超时（${ms} ms）`)), ms).unref?.()
    return signal
  },
  any(list) {
    const signal = makeAbortSignal()
    for (const item of Array.isArray(list) ? list : []) {
      if (item === undefined || item === null) continue
      if (item.aborted === true) {
        signal.fire(item.reason)
        break
      }
      if (typeof item.addEventListener === 'function') item.addEventListener('abort', () => signal.fire(item.reason))
    }
    return signal
  },
  abort(reason) {
    const signal = makeAbortSignal()
    signal.fire(reason === undefined ? new Error('aborted') : reason)
    return signal
  },
}

function isAbsoluteShim(value) {
  const text = String(value)
  return /^[A-Za-z]:[\\/]/.test(text) === true || text.startsWith('/') === true
}
function resolvePathShim(value) {
  const text = String(value).replace(/\//g, '\\')
  const parts = []
  for (const segment of text.split('\\')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') { parts.pop(); continue }
    parts.push(segment)
  }
  return parts.join('\\')
}
function relativeShim(from, to) {
  const left = String(from).replace(/\\+$/, '').toLowerCase()
  const right = String(to).replace(/\\+$/, '')
  if (right.toLowerCase().startsWith(left) === true) return right.slice(left.length).replace(/^\\+/, '')
  return right
}
async function statShim(path) {
  const info = statSync(path)
  return { isDirectory: () => info.isDirectory() }
}

const transformed = readFileSync(HOST_FILE, 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/^export /gm, '')
  .replace("const connection = ctx.get('connection')", CONNECTION_SHIM)

const traps = {}
for (const name of ['require', 'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'fetch']) {
  traps[name] = () => {
    throw new Error(`${name} 在动态沙箱里不可用`)
  }
}
const sandbox = {
  ...traps,
  console: { log: (...a) => console.log('[dyn]', ...a), warn: (...a) => console.log('[dyn]', ...a), error: (...a) => console.log('[dyn]', ...a) },
  harness: {
    handle(method, fn) {
      registry.set(method, fn)
      return () => registry.delete(method)
    },
    defineTool: (t) => t,
    registerTool: () => () => undefined,
  },
  btoa: (value) => Buffer.from(value, 'utf-8').toString('base64'),
  atob: (value) => Buffer.from(value, 'base64').toString('utf-8'),
  TextEncoder,
  TextDecoder,
  ctx: fakeCtx,
}
createContext(sandbox)

/* -------------------------------------------------------- cloneJson 等价校验 */

function lossless(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return undefined
  if (typeof value === 'number') {
    return Number.isFinite(value) && !Object.is(value, -0) ? undefined : path
  }
  if (typeof value !== 'object') return path
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) return path
      const problem = lossless(value[index], `${path}[${index}]`)
      if (problem !== undefined) return problem
    }
    return undefined
  }
  const prototype = Object.getPrototypeOf(value)
  const plain = prototype === null || (typeof prototype === 'object' && Object.getPrototypeOf(prototype) === null)
  if (!plain) return path
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(value, key)) return path
    const problem = lossless(value[key], `${path}.${key}`)
    if (problem !== undefined) return problem
  }
  return undefined
}

/* -------------------------------------------------------------------- 跑起来 */

const factory = runInContext(
  `(function (ctx, harness, console, process, stat, isAbsolute, relative, resolvePath, AbortSignal, bridge) {\n${transformed}\nreturn apply })`,
  sandbox,
  { filename: 'cordis-dyn-preview.js' },
)
const bridge = { handler: null }
bridge.invoke = async (args) => {
  const endpoint = typeof args === 'object' && args !== null ? args.endpoint : undefined
  const payload = typeof args === 'object' && args !== null ? args.payload : undefined
  let envelope
  try {
    envelope = await bridge.handler(endpoint, payload, undefined)
  } catch (cause) {
    return { ok: false, error: { code: 'git-vcs/preview-failed', message: `端点 ${String(endpoint)} 抛出：${cause instanceof Error ? cause.message : String(cause)}`, details: {} } }
  }
  const problem = lossless(envelope, 'result')
  if (problem !== undefined) {
    return { ok: false, error: { code: 'git-vcs/preview-payload', message: `端点 ${String(endpoint)} 返回值不是无损 JSON：${problem}`, details: {} } }
  }
  return envelope
}
const realApply = factory(fakeCtx, sandbox.harness, sandbox.console, { platform: 'win32' }, statShim, isAbsoluteShim, relativeShim, resolvePathShim, AbortSignalShim, bridge)
await realApply(fakeCtx, {})

const call = registry.get(CHANNEL)
if (call === undefined) {
  console.log('FAIL 未注册 harness 通道', [...registry.keys()])
  process.exit(1)
}

const calls = [
  { endpoint: 'repo/snapshot', payload: { cwd: REPO, limit: 50, consoleLimit: 60 } },
  { endpoint: 'repo/info', payload: { cwd: REPO } },
  { endpoint: 'show', payload: { cwd: REPO, rev: 'HEAD', noPatch: true } },
  { endpoint: 'show/file', payload: { cwd: REPO, rev: 'HEAD', path: 'README.md' } },
  { endpoint: 'console/list', payload: { cwd: REPO } },
  { endpoint: 'remote/list', payload: { cwd: REPO } },
]
let bad = 0
for (const { endpoint, payload } of calls) {
  let envelope
  try {
    envelope = await call({ endpoint, payload })
  } catch (cause) {
    console.log(`FAIL ${endpoint} 抛出：${cause instanceof Error ? cause.message : String(cause)}`)
    bad++
    continue
  }
  const problem = lossless(envelope, `harness.handle("${CHANNEL}") result`)
  if (problem !== undefined) {
    console.log(`FAIL ${endpoint} 非无损 JSON：${problem}`)
    bad++
    continue
  }
  const shape = envelope.ok === true ? 'ok' : `error ${envelope.error.code}`
  console.log(`OK   ${endpoint} → ${shape}`)
}
console.log(bad === 0 ? '结果：全部通过' : `结果：${bad} 个端点有问题`)
