# 项目教训库（Project Lessons）

> 本文件由 AI 自动维护，记录所有被纠正过的错误做法。DSH 不会自动注入本文件，由 `AGENTS.md` 的"会话启动必读"章节强制加载，用于规避已知陷阱。
> 分类按本项目实际技术栈（DSH cordis 插件包 / JavaScript ESM）设定，初始化时已与用户确认。

## 📋 分类索引

- [DSH 插件规范](#dsh-插件规范)
- [Cordis/服务注入 规范](#cordis服务注入-规范)
- [JavaScript/Node ESM 规范](#javascriptnode-esm-规范)
- [Git/协作 规范](#git协作-规范)
- [架构/设计 规范](#架构设计-规范)
- [工具链/构建与环境 规范](#工具链构建与环境-规范)

---

### DSH 插件规范

> 覆盖：`package.json` 清单（`dsh.bundle` / `dsh.client` / `dsh.engines`）、`cordis.patch.yml` 语法、插件加载与生效条件、脚手架与验证脚本。

| 日期 | 错误做法 ❌ | 正确做法 ✅ | 原因 / 后果 | 关联文件/模块 |
|------|------------|------------|-------------|---------------|
| _(待填充)_ | - | - | - | - |

### Cordis/服务注入 规范

> 覆盖：`apply(ctx, config)` 生命周期、`inject` 硬依赖 vs `ctx.get()` 软依赖、事件订阅与 disposer 清理、Schemastery `Config`。

| 日期 | 错误做法 ❌ | 正确做法 ✅ | 原因 / 后果 | 关联文件/模块 |
|------|------------|------------|-------------|---------------|
| _(待填充)_ | - | - | - | - |

### JavaScript/Node ESM 规范

> 覆盖：ESM 导出形态（具名 vs default vs class Service）、模块级副作用、Node 版本与 API 用法、UTF-8 编码。

| 日期 | 错误做法 ❌ | 正确做法 ✅ | 原因 / 后果 | 关联文件/模块 |
|------|------------|------------|-------------|---------------|
| _(待填充)_ | - | - | - | - |

### Git/协作 规范

> 覆盖：分支与提交规范（Conventional Commits）、工作区状态处理、提交/推送等仓库操作的安全边界。

| 日期 | 错误做法 ❌ | 正确做法 ✅ | 原因 / 后果 | 关联文件/模块 |
|------|------------|------------|-------------|---------------|
| _(待填充)_ | - | - | - | - |

### 架构/设计 规范

> 覆盖：插件形态判定（host / Web GUI / overlay / 动态插件）、扩展点选择（tools / events / systemPrompt / slots）、能力边界划分。

| 日期 | 错误做法 ❌ | 正确做法 ✅ | 原因 / 后果 | 关联文件/模块 |
|------|------------|------------|-------------|---------------|
| 2026-09-14 | 用户说"入口/面板要和官方某功能一样"时，只对齐**功能面**，自己另选一套机制（用 `sidebar.panellist` + `main` 全局面板做入口） | 先找到产品内该功能的**活实现**并照抄它的注册路径（本例：`dsh-client-ui-sidebar-files` 的两阶段 `sidebarRightTabs.register` + `sidebar.right.pane.tab` keyed 注册） | 机制选错要重做整个注册层与 UI 布局假设；而分栏 / 全屏 / 拖出浮窗这些能力本来可以白拿 | `lib/client.js`、`.opencode/tasks/task-001/context.md` |

### 工具链/构建与环境 规范

> 覆盖：pnpm 路径、npm registry 与缓存目录、沙箱权限（profile 目录写入）、`dsh plugin` / `--dump-config` 验证命令、构建产物。

| 日期 | 错误做法 ❌ | 正确做法 ✅ | 原因 / 后果 | 关联文件/模块 |
|------|------------|------------|-------------|---------------|
| 2026-09-14 | 照技能文档用 `--cache D:\zxh\deepseek\.npm-cache-tmp` 跑 npm，未先确认该路径是否在沙箱可写范围内 | npm/npx 的缓存目录一律放在**会话 workspace 内**（本项目用 `--cache D:\zxh\code\git-plugin\.npm-cache`，并加进 .gitignore） | 缓存目录在 workspace 外 → 每次 npm 调用都 EPERM 失败，误判为网络/registry 问题 | `.gitignore`、`.opencode/memory.md` |
| 2026-09-14 | 插件在 D: 盘、profile 在 C: 盘时直接 `dsh plugin add <插件目录>`，没先确认 pnpm 能否算出相对路径 | 跨盘符时不要指望 `link:`：直接 `cmd /c mklink /J <profile>\node_modules\<pkg> <插件绝对路径>`，再 `dsh plugin --profile web install` 让 dsh 对账 bundles；或把插件放到与 profile 同盘 | pnpm 生成目标被拼错的坏 junction → dsh 判定 `declares no dsh.bundle`，插件只当普通依赖装、永不进层；profile 留下半装状态需手工清理 | `README.md`「跨盘符安装坑」、`~/.dsh/profiles/web` |
| 2026-09-14 | 用户说"先写好、不用着急安装验证"之后，仍在推进安装与提权 | 用户要求先写代码时，安装/提权/真机验证一律停手，把命令写进 README 交给用户执行 | 提权被拒 + 环境留下坏链接，多花一轮清理；打断用户的节奏 | `README.md` 安装章节 |

---

## 🔄 元规则（Meta Rules）

*（此处记录"如何管理教训"的教训，由 AI 月度压缩时自动填充）*

- _2026-09-14_：初始化教训库，按 DSH 插件技术栈设定 6 个分类，启用 `/save` 自动写入机制（DSH 全局指令 `~/.dsh/commands/save.md` 步骤 0）。
- _2026-09-14_：本项目采用 DSH 原生加载（AGENTS.md 单文件自动加载），未创建 `.opencode/opencode.json`；CONTEXT.md 与 LESSONS.md 的加载依赖 AGENTS.md 中的"会话启动必读"协议。
