/**
 * 发布助手（一次性）：GitHub API 一律走 Node 的 fetch。
 * 原因：本机 schannel TLS 损坏，curl / Invoke-RestMethod 走 HTTPS 会失败（SEC_E_NO_CREDENTIALS）。
 *
 * 用法：
 *   node .opencode/gh-publish.mjs rename     # dsh-git-repo → dsh-git-vcs
 *   node .opencode/gh-publish.mjs release    # 建 v<version> 的 Release
 */
import { readFileSync } from 'node:fs'

const TOKEN = process.env.GH_TOKEN
const OWNER = 'TiChuXiXi'
const REPO = 'dsh-git-vcs'
const OLD_REPO = 'dsh-git-repo'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const VERSION = pkg.version

if (TOKEN === undefined || TOKEN === '') {
  console.error('缺少 GH_TOKEN')
  process.exit(1)
}

async function api(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dsh-git-vcs-publish',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  return { status: response.status, body }
}

const command = process.argv[2]

if (command === 'rename') {
  const result = await api(`/repos/${OWNER}/${OLD_REPO}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: REPO,
      description: pkg.description,
      homepage: `https://github.com/${OWNER}/${REPO}`,
    }),
  })
  const body = result.body
  console.log(result.status, body.full_name ?? body.message, body.html_url ?? '')
} else if (command === 'release') {
  const notes = [
    `首个发布版本：DSH Web GUI 的 Git 版本管理插件（右侧栏「版本管理」页，参照 IDEA 的 Version Control 工具窗）。`,
    '',
    '### 功能',
    '',
    '- 右侧栏 tab：Local Changes / Log / Console / Branches / Remotes / Stash 六页',
    '- 勾选提交（只提交勾选的文件，未跟踪文件同样可选）、暂存 / 取消暂存 / 回滚',
    '- 提交树（每条分支一色、HEAD 实心、分支标签）、提交详情按需拉取单文件 diff、右键菜单',
    '- 分支 / 远程 / 贮藏管理，命令流水（Console）',
    '- 推送链路：直推 → SSL 后端兜底 → 认证表单（凭据存进 git 凭据助手）',
    '',
    '### 安装',
    '',
    '```bash',
    `dsh plugin --profile web add ${pkg.name}`,
    '```',
    '',
    `兼容 \`@deepseek-ai/dsh\` ${pkg.dsh.engines.dsh}，零构建、零运行时依赖。`,
    '',
    '详见 [README](https://github.com/' + OWNER + '/' + REPO + '#readme)。',
  ].join('\n')

  const result = await api(`/repos/${OWNER}/${REPO}/releases`, {
    method: 'POST',
    body: JSON.stringify({
      tag_name: `v${VERSION}`,
      target_commitish: 'main',
      name: `v${VERSION}`,
      body: notes,
      draft: false,
      prerelease: false,
    }),
  })
  const body = result.body
  console.log(result.status, body.html_url ?? body.message)
  if (result.status !== 201) process.exitCode = 1
} else {
  console.error('用法：node .opencode/gh-publish.mjs rename|release')
  process.exit(1)
}
