# 项目级长期记忆

> 跨任务的通用决策、已知问题、技术债务。每次打开任何任务前可选读取。
> 保持精简，详细内容引导到对应任务文件夹或 CONTEXT.md。

## 项目架构要点

- **项目性质**：DSH（DeepSeek Harness）cordis 插件包，用于 git 仓库管理。当前目录 `D:\zxh\code\git-plugin`。
- **形态**：单包（bundle）。host 半区必选；浏览器半区（Web GUI）可选，加在同一包内。
- **清单**：`package.json` 的 `dsh.bundle.patch` → `cordis.patch.yml`；Web 半区另加 `dsh.client` + `exports["./client"]`。**不声明 `dsh.profile`**。
- **入口**：`index.js` 导出 `name` / `inject` / `apply(ctx, config)`；副作用只写在 `apply()` 内。
- **依赖锁版本**：`@deepseek-ai/dsh-*` → `^0.1.5-rc.1`、`@deepseek-ai/cordis` → `^4.0.2`、`@deepseek-ai/schemastery` → `^3.18.2`；禁止 `latest` / `*`。
- **当前状态**（2026-09-14）：仓库已 `git init`（分支 `main`），完成记忆体系初始化与首个提交；插件骨架、包名、能力边界均未定。远端未配置。

## 跨任务技术决策

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-09-14 | 记忆体系采用 DSH 原生加载：只建 AGENTS.md / CONTEXT.md / LESSONS.md / .opencode 记忆区，**不建** `.opencode/opencode.json` | 会话运行在 DSH，AGENTS.md 自动注入；CONTEXT.md 与 LESSONS.md 由 AGENTS.md 的"会话启动必读"协议保证加载 |
| 2026-09-14 | `/save` 指令不下沉到项目，复用全局 `~/.dsh/commands/save.md` | 全局版本已含"步骤 0 纠错检视"，闭环完整，避免重复定义 |

## 已知全局问题

- **npm 缓存目录被沙箱拦（EPERM）** → npm 命令一律加 `--cache D:\zxh\deepseek\.npm-cache-tmp`。
- **registry 默认 npmmirror** → 安装 `@deepseek-ai/*` 官方包必须加 `--registry https://registry.npmjs.org`。
- **pnpm 不在 PATH** → 先 `$env:Path = "C:\Users\zdz20\AppData\Roaming\npm;" + $env:Path`，可执行文件为 `C:\Users\zdz20\AppData\Roaming\npm\pnpm.cmd`。
- **profile 目录在 workspace 外**（`~/.dsh/profiles/<name>`）→ `dsh plugin` 写入可能被沙箱拒绝，原样重试并带 `sandbox_permissions: danger-full-access` + justification。
- **codebase-memory-mcp 已安装连通，但本项目未建索引** → 首次语义检索前需对本目录执行 `index_repository`。

## 常用命令

```powershell
# 技能与脚手架（技能目录）
# C:\Users\zdz20\.dsh\skills\dsh-plugin-creator
node C:\Users\zdz20\.dsh\skills\dsh-plugin-creator\scripts\new-plugin.mjs <pkg> --kind host|tool|web-ui --dir <out>
node C:\Users\zdz20\.dsh\skills\dsh-plugin-creator\scripts\validate-plugin.mjs <dir>   # 静态校验，须零 ERROR
node C:\Users\zdz20\.dsh\skills\dsh-plugin-creator\scripts\smoke-boot.mjs <dir>        # 隔离 DSH_HOME 冒烟启动

# 挂载与验证（真实 profile：web）
$env:Path = "C:\Users\zdz20\AppData\Roaming\npm;" + $env:Path
dsh plugin --profile web add <绝对目录>
dsh --profile web --dump-config | Select-String "<包名>"     # 须出现 "# == <包名>" 层
# 改 bundle 行后必须重启 dsh web（页面刷新不够）；新工具只对新建会话生效

# 构建（仅 Web 半区需要）
pnpm install; pnpm build    # 产物 lib/client.js
```
