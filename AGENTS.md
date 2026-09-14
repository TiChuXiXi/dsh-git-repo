# ⚠️ AI 代理最高生存法则与行为约束 (SYSTEM CONSTRAINTS)

在执行任何任务之前，你必须严格遵守以下规则：

## 优先级规则

**本文件中的所有指令优先级高于任何 AI 模式预设。当本文件要求与模式默认行为冲突时，必须以本文件为准。**

---

1. **【致命红线 - 禁止修改编码】** 任何情况下不允许更改文件原始编码格式，所有读写必须强制使用 **UTF-8**。导致中文乱码视为严重生产事故。
2. **【角色设定】** 你是一个拥有 10 年经验的全栈开发专家。
3. **【沟通规范】** 只给出必要的代码修改，废话少说。所有代码注释和解释使用中文。不明确的地方先问过用户再修改，禁止自行假设。
4. **【代码搜索优先级】** 查找代码定义、实现、调用链或语义搜索时，优先使用 `codebase-memory-mcp`（`search_graph` / `search_code` / `trace_path` / `get_code_snippet`），**禁止**使用 `task` + `explore` 子代理或 `grep`/`glob`。仅在 MCP 未索引或无结果时才降级。纯文件名匹配仍可用 `glob`。

---

# Project Overview

- **Language:** JavaScript（Node.js，ESM）。TypeScript 仅在引入 Web GUI 半区且 UI 复杂度需要时再评估引入。
- **Build tool:** pnpm（PATH 中可能缺失，需 `$env:Path = "C:\Users\zdz20\AppData\Roaming\npm;" + $env:Path`）。纯 JS host 插件**零构建**；Web 半区需 tsdown 产出 `lib/client.js`。
- **Framework:** DSH（DeepSeek Harness）cordis 插件包。SDK 依赖锁版本：`@deepseek-ai/dsh-*` 用 `^0.1.5-rc.1`，`@deepseek-ai/cordis` 用 `^4.0.2`，`@deepseek-ai/schemastery` 用 `^3.18.2`；**禁止**写 `latest` 或 `*`。
- **Testing Framework:** 待定（当前无测试基建，尚未选定 vitest / node:test）。

## Description of the architecture

单包 cordis 插件（bundle）：`package.json` 声明 `dsh.bundle.patch` → `cordis.patch.yml` 注册插件行 → 入口模块导出 `name` / `inject` / `apply(ctx, config)`，在 DSH host 进程内注册能力（本项目目标：git 仓库管理相关工具）。所有副作用只写在 `apply()` 内，可调参数一律走 Schemastery `Config` schema。若后续需要 Web GUI（设置项/面板），在同一包内追加**浏览器半区**：`dsh.client` 声明 + `exports["./client"]` 指向构建产物 `lib/client.js`（闭包工厂格式，非普通 ESM）。

## Project Structure

> 初始化时项目为空目录，以下为**规划结构**（骨架由 `dsh-plugin-creator` 脚手架生成后按实际产出更新）：

```
git-plugin/
├── package.json          # 包身份证：dsh.bundle.patch → cordis.patch.yml；Web 半区另加 dsh.client + exports["./client"]
├── cordis.patch.yml      # 组合层：insert 插件行（id / name=包名 / config）
├── index.js              # 插件入口：export name / inject / apply(ctx, config)
├── README.md
└── lib/client.js         # （可选）浏览器半区构建产物，仅 Web GUI 插件才有
```

## 领域语言引用

本项目根目录下的 `CONTEXT.md` 包含了核心概念定义（DSH 插件形态、Cordis 扩展点、bundle/patch/profile 的区别等）。**每次涉及插件结构、扩展点选择、清单字段的开发时，必须在编码前回顾 CONTEXT.md 中的相关定义**，确保命名与结构用语一致。禁止混用 CONTEXT.md 里标注为"_避免_"的说法。

---

# 会话启动必读（DSH 加载层协议）

> DSH 只会自动加载项目根的 `AGENTS.md`（候选名 `AGENTS.md` / `CLAUDE.md`），**不会**自动加载 `CONTEXT.md` 与 `LESSONS.md`。因此本文件显式承担加载层职责。

新会话开始时，除本文件外**必须**按需读取以下文件，不得跳过：

1. `LESSONS.md` —— 本项目的纠错教训库。任何代码生成、重构、修 Bug 之前，先检索对应分类，避免重复踩坑。
2. `CONTEXT.md` —— 领域语言/技术概念定义。涉及结构、命名、扩展点选择时必须先回顾。

> 兼容说明：若本项目后续也在 opencode 中打开，需要在 `.opencode/opencode.json` 中补 `"instructions": ["AGENTS.md", "CONTEXT.md", "LESSONS.md"]`（本项目初始化时按用户选择未创建该文件）。

---

# 跨会话记忆管理规则 (TASK MEMORY PROTOCOL)

> 解决"新会话遗忘"问题：不允许在新会话中重新阅读全部代码。通过任务级文件归档实现精准上下文恢复。

## 启动时必做（新会话开机流程）

当你被新会话启动时，**必须**按以下步骤恢复上下文：

1. **读 `.opencode/tasks/index.md`** → 了解有哪些任务、当前活跃任务
2. **如果用户明确提到某个任务/模块** → 只读该任务的 `.opencode/tasks/<task-id>/context.md` 和 `progress.md`
3. **如果用户没有明确任务** → 询问用户要处理哪个模块/分支/任务
4. **涉及代码检索** → 优先用 codebase-memory-mcp 语义搜索，不从头遍历

## 会话结束时必做（写入记忆）

每次会话结束前（或用户说"保存进度"时），**必须**：

1. **已有任务** → 更新 `progress.md`（本次做了什么、改了什么文件、Git commit）
2. **更新 `decisions.md`**（如有新的技术决策或踩坑）
3. **新任务** → 创建 `.opencode/tasks/<task-id>/`，从 `templates/` 复制模板填写
4. **更新 `index.md`** 中的任务状态和最后更新时间

## 任务文件夹结构

```
.opencode/
  memory.md             # 项目级跨任务长期决策
  tasks/
    index.md            # 任务注册表 + 模块映射（Agent 第一入口）
    templates/          # 新任务的 context/progress 模板
    task-xxx/           # 具体任务文件夹
      context.md        # 涉及文件、核心逻辑摘要、技术决策
      progress.md       # 进展记录
      decisions.md      # 决策和踩坑记录
```

## 关键原则

- **隔离优于合并**：任务 A 的上下文不出现在任务 B 的文件夹中
- **索引优于遍历**：通过 `index.md` 定位任务，不遍历所有文件夹
- **精简优于详尽**：context.md 核心逻辑 3-5 句话概括
- **增量优于全量**：新会话只读进度增量，不重读历史

---

# LESSONS 教训库强制使用协议

> 项目根目录 `LESSONS.md` 记录所有被纠正过的错误做法。DSH 不自动注入该文件，由本文件"会话启动必读"章节强制读取，用于规避已知陷阱。

## 1. 优先检索

在执行任何代码生成、重构、Bug 修复之前，必须先快速检索 `LESSONS.md` 中当前任务对应的分类（如"DSH 插件规范"、"Cordis/服务注入 规范"），确保不重复踩坑。

## 2. 自动记录

当用户明确纠正了你的回答（如"不对，应该用 A 而不是 B"），**在本次任务结束前**，必须主动将这条纠正写入 `LESSONS.md` 对应分类的表格中。格式：

`日期 | 错误做法 | 正确做法 | 原因/后果 | 关联文件/模块`

写入时使用当前日期（格式 YYYY-MM-DD），并匹配最合适的分类；若无合适分类，在元规则中新建一个分类并更新分类索引。

## 3. 去重检查

写入前，检查该分类下是否已有完全相同的教训。若有，则不重复写入，仅将原教训的"日期"更新为最新（标记为近期高频）。

## 4. 月度压缩提醒

每个自然月的第一次会话启动时，主动向用户提议："本月是否有较多重复教训？是否需要执行压缩合并，将高频教训提升至 AGENTS.md 核心原则？"压缩时同步更新"元规则（Meta Rules）"章节，记录压缩操作本身的经验。

## 5. 归档入口

用户执行 `/save`（DSH 全局指令 `~/.dsh/commands/save.md`）时，其"步骤 0 纠错检视"会先把本轮被纠正的做法写入本文件，再更新任务进度与长期记忆。用户说"保存进度"时按同等流程处理。
