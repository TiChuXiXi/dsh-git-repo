# task-001 决策记录

> 关键设计选择与原因。出现新的纠正时追加到对应条目，不要覆盖历史。

| 日期 | 决策 | 原因 |
|------|------|------|
| 2026-09-14 | ~~入口 = `sidebar.panellist`（list）+ `main`（keyed）同 id 双注册~~ **已被用户否决**：入口改为右侧栏 tab 类型（`ctx.sidebarRightTabs.register` + `sidebar.right.pane.tab`），与官方「工作区文件」同机制 | 用户明确要求入口与面板都跟「工作区文件」一致；分栏/全屏/浮窗由 ui-sidebar-right + dockkit 提供。副作用：引导入口由 1 个变 2 个，右侧栏默认页从「工作区文件」变为引导页（用户已确认接受） |
| 2026-09-14 | host↔client 走 `ctx.connection.rpc.handle/call` 自定义通道，不用生成式 Remote | 免 Typert 代码生成管线；认证/信任由 Connection 统一处理 |
| 2026-09-14 | git 用 `ctx.subprocess` argv 形式（非 `ctx.shell`） | 无 shell 解释面、cwd/argv 精确可控、输出可 collect+spill |
| 2026-09-14 | Local Changes 与 Commit 合并为同一 tab | 对齐 IDEA 2020.1+ 默认的非模态提交界面 |
| 2026-09-14 | 右侧栏 tab 的注册照抄 `dsh-client-ui-sidebar-files` 的两阶段写法：`ctx.sidebarRightTabs.register({id, kind, title, guide})` + `slots.inject('sidebar.right.pane.tab', () => slots.register({name, key: id, inject}, Body))` | 该包是产品内唯一活着的同类实现，照抄即对齐官方契约（keyed slot 用 `key` 而非 `id`） |
| 2026-09-14 | 客户端只 `require('react')`，UI 全用 `React.createElement`、样式全内联；不用 CSS Modules、不写 `document.head` | 零构建路线下这是唯一不触碰构建链的写法；避开 purity 门禁与全局样式污染 |
| 2026-09-14 | 写操作分三级门禁：`allowWrite` / `allowDangerous`（reset·revert·cherry-pick·删分支·回滚文件）/ `allowPush`（默认 false） | push 与破坏性操作默认最保守；危险操作在 UI 内还要过一次内联确认条 |
| 2026-09-14 | `remote/add` 与 `remote/remove` 仅走 `requireWrite()`，**不**挂 `requireDangerous()` | 删除远程仅删 `.git/config` 段，不丢本地分支或历史，破坏面小于 reset/revert；IDEA 中删除远程也是普通写操作而非"危险"操作。代价：用户在 UI 内必须走 `ask()` 二次确认（与 IDEA 一致），并受 `allowWrite` 总闸控制 |
| 2026-09-14 | `remote/add` 的 push URL 用独立输入项（与 fetch 不同时走 `git remote set-url --push`） | IDEA 的"添加远程"对话框也分 fetch / push 两栏；只填一个时推等同 fetch，语义与官方一致 |
| 2026-09-14 | `remote/add` / `remote/remove` 写后清 `remoteUrlCache` | 与 `repo/info` 的 `remote.origin.url` 缓存对齐，否则添加新 origin 后 `repo/info` 仍返回旧值 |
| 2026-09-14 | `remote/add` 用 `git remote get-url <name>` 检测重名（退出码 0 = 已存在），失败提示 `git-vcs/remote-exists` | 比解析 stderr 更稳（跨 git 版本文案可能变化，退出码是稳定契约） |
| 2026-09-14 | `verify-host.mjs` 的 add/remove 用 `mkdtempSync` + `git init` + 空 commit 建临时仓库，跑完 `rmSync` 整体清理 | add/remove 是写操作会改 `.git/config`，不能拿真实仓库试；保持脚本"不污染仓库"承诺 |
| 2026-09-14 | `verify-host.mjs` 加 `expectError(label, endpoint, payload, expectedCode)` helper | 现有 `check()` 只验成功路径；端点的错误码分支（`bad-request` / `remote-exists` / `remote-not-found`）需要单独断言 |
| 2026-09-15 | Log 从 `<table>` 改成 div 版表格（`S.thead`/`S.tr`/`S.th`/`S.td`） | HTML 表格无法同时做到「逐列固定 px 宽 + 用户拖动某一列」：`table-layout:fixed` 下指定宽度以外的列只能由浏览器分配，拖动 message 列再想恢复自适应就只能靠测量容器宽度；div + flex 让「每列一个 basis、message 列 `1 1 auto`」直接表达 IDEA 的行为，且不用第二份宽度状态 |
| 2026-09-15 | 提交树列宽按**标签内容估算**（`glyphWidth`：CJK 10.5px / ASCII 6.1px）并钳制 64–300px，不做 DOM 测量 | 该列要"自适应且不可拖"，用 DOM 测量需要 ref + ResizeObserver + 二次渲染；内容只有分支名的固定字符集，估算法已足够贴合，且渲染是纯函数、无副作用 |
| 2026-09-15 | 分支标签按**完整哈希**匹配提交：`BRANCH_FORMAT` 追加 `%(objectname)` | `%(objectname:short)` 的缩写长度随仓库对象数变化，理论上可能与 `%h` 不一致；完整哈希是稳定契约，短哈希仅作回退。代价：`parseBranchList` 多一个字段，Branches 页无感 |
| 2026-09-15 | 拖动列宽用 **pointer capture**（`setPointerCapture`），起始宽度量父单元格 | 零构建路线下不能给 `window`/`document` 挂监听（也不该）；capture 让指针移出单元格后事件仍回手柄，宽度也不必在 state 里维护第二份 |
| 2026-09-15 | `notice` 由字符串改为 `{ text, bad }`，并加 `flash()` 2 秒自动消失 | 复制反馈既可能是成功也可能是失败，需要区分配色；自动消失让复制提示不污染写操作的耗时提示 |
| 2026-09-15 | 动态预览不再手抄代码，改为**装载器**（`git-vcs-boot` / `git-vcs-source` + `new Function` + `__ModuleLoader__` 垫片） | 手抄版每轮都要重新粘贴几十 KB 且必然与源码漂移；装载器让预览恒等于磁盘上的源码，改完重启即生效。代价：预览依赖字符串改写点（imports / export / connection 注册 / require('react') / 传输那一行），源码改这些行时装载器要同步 |
| 2026-09-15 | 装载器自带 `AbortSignal` 鸭子类型垫片（超时走 `ctx.timeout`），并在桥上做无损 JSON 自查 | vm 沙箱没有 Web/Node 全局，真实代码直接跑会 `AbortSignal is not defined`；自查把坏值换成带端点名的干净错误码，避免 harness 报"路径不明"的失败 |
| 2026-09-15 | `scripts/preview-check.mjs` 作为常驻自检（同构 node:vm 复现动态沙箱） | 这类"只在动态沙箱出现的失败"在宿主域永远不复现；同构脚本把定位成本从多轮真机试错降到一条命令 |
