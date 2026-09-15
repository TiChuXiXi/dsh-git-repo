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
| 2026-09-15 | 提交树的圆点改为**空心**（深色圆环），HEAD 仅加粗圆环而不填充 | 实心填充会盖住连线，且用户明确要求空心；圆环加粗足以区分 HEAD，同时保留"连线贯穿圆点"的视觉 |
| 2026-09-15 | 连线拆成上下两段：`top: -1px; height: calc(50% - 半径 - 1px)` 与 `top: calc(50% + 半径); bottom: -1px`，并把提交树单元格的 `overflow: hidden` 换成标签容器自己裁剪 | 圆点内部不能有连线（所以不能画一条通线再盖住），段与段又要跨行严丝合缝（所以各越界 1px 重叠）；单元格不再裁剪是让越界生效，标签容器裁剪则保证长分支名不会溢到 Message 列 |
| 2026-09-15 | 颜色按**分支名排序取模**分配（8 色调色板，每个分支固定一色；ring/line/fill 三档同色系）；没有标签的提交从子提交沿父提交继承颜色 | 分支名集合稳定 → 同一次会话/多次渲染同一分支永远同色；继承让一条线从头到尾同色，只在"另一个分支的 tip 落在本历史里"处换色，符合单轨图的表达能力 |
| 2026-09-15 | 一次性反馈（复制成功/失败、写操作耗时）改为**浮动 toast**（绝对定位 + 根节点 `position: relative` + `pointerEvents: none`），不再作为 flex 列的一段 | 用户明确要求"不能改变布局高度"：任何在流内的提示条进出都会顶动一次高度，视觉上就是抖动 |
| 2026-09-15 | HEAD 提交的圆点改为**实心**（`fill = 该分支深色`），不再用"加粗描边"区分 | 用户明确要求 HEAD 实心；实心填充不会遮住连线，因为上下两段本来就止于圆环外沿（圆点内部无线） |
| 2026-09-15 | 连线颜色由半透明改为**不透明浅色**（8 组 palette.line 各自给出浅色 hex） | 1px 越界重叠是为了消除行间接缝，但半透明色重叠会被叠两次 → 每行边界出现一条更深的横带；不透明色重叠结果不变，两个目标同时满足 |
| 2026-09-15 | 圆点改用 **SVG `<circle r=4 stroke-width=2>`**（12px 画布，外沿 5px）替代 CSS `border-radius: 50%` | 小尺寸 CSS 圆环在非整数行高（标签换行把行高变成奇数）下栅格化出棱角；SVG 圆稳定，且 fill/stroke 可分别控制（HEAD 实心） |
| 2026-09-15 | HEAD 判定用 `repo.oid`（精确哈希），拿不到时退回列表首行 | `git log` 由新到旧，首行在正常情况下就是 HEAD；`repo.oid` 在 detached HEAD 下也是精确值，避免"首行=HEAD"这个假设失效 |
| 2026-09-15 | 提交树的着色从「子→父单遍继承」改为**按分支优先级的多源 BFS**（当前分支 0 > 其它本地 1 > 远程 2，先到的染色不被覆盖） | 单遍继承的胜负取决于日志顺序：若其它分支的 tip 比当前分支 tip 更新，它会先写入父提交的颜色，把当前分支整条链染成别的分支色（用户举的反例：main A-B-C-D + 远程在 C + test C-E，要求 A/B/C/D 全 main、只有 E 是 test）。按优先级分组各刷一遍，当前分支的链先定型，后处理的分支只能染色自己独有的提交 |
| 2026-09-15 | HEAD 提交没有分支标签（detached HEAD）时，单独用 `headHash` 给优先级 0 补一个种子（颜色取 `repo.branch` 对应的调色板项，取不到则 0） | 否则 detached HEAD 下没有任何优先级 0 的种子，整条链会被别的分支颜色接管 |
| 2026-09-15 | Log 行高亮用 React 状态 `hoverHash`（`onMouseEnter`/`onMouseLeave`，仅在哈希变化时 set），并在行样式上加 `cursor: pointer` | 零构建路线下没有样式表可用（不能写 `:hover`）；用状态模拟是唯一不触碰构建链的写法，且只在哈希变化时更新，避免鼠标移动引发无谓渲染 |
| 2026-09-15 | 提交详情面板从「右侧栏」改为「Log 下方」的上下布局，高度用顶边拖拽条（`RowSplitter`，pointer capture + `row-resize`）调整，默认 300px、钳制 140–720px 且 `maxHeight: 80%` | 用户要求上下布局并把面板放下面；80% 上限避免面板拖高后溢出容器。为此把共用的 `S.body` / `S.detail` 拆开：Local Changes 仍用「左右布局」的 `S.body` + `S.detail`，Log 用新的 `S.bodyStack` + `S.detailBottom`（一开始改共用样式把 Local Changes 的差异栏也带歪了） |
| 2026-09-15 | `show` 增加 `noPatch: true`（只跑 meta + name-status 两个探测），新增 `show/file` 端点按需拉单个文件的 diff | 原来点一次提交就把整次提交的 patch 全传过来并整段渲染；用户要求"默认不显示文件详情、点哪个文件才展示哪个"。顺带省掉一次 git show 与整包传输 |
| 2026-09-15 | 详情里的文件行：hover 高亮（`detailHover` 状态）+ `cursor: pointer` + 点击选中（`detailFile`），选中行用 `detailFileRowOn`，再点一次收起 | 零构建下没有 `:hover`，仍用状态模拟；选中态与 hover 态分开，避免"点了看不出选中哪个" |
| 2026-09-15 | 提交行右键菜单用**数据模型 + 递归渲染**（`commitMenuItems` 产出 `{kind:'group'}` / 叶子 / `{items}` 父项，`menuRows(items, path, level)` 递归），而不是写死两层 JSX | 需求是"按功能分组 + 支持二级菜单"，数据模型让加一项/加一层只改数据；`level` 同时用于定位子菜单（父项所在层 = 子菜单在栈里的下标） |
| 2026-09-15 | 子菜单栈的收起规则：**叶子只收起比它更深的层级**（`current.slice(0, level)`），父项在 `level` 处替换 | 最初写成"hover 叶子就清空整个栈"，鼠标从父项移进子菜单的第一项就会把子菜单关掉，根本点不到 |
| 2026-09-15 | 关闭菜单用 `document` 的 `mousedown` + `keydown(Escape)` 监听（`useEffect` 内注册并按需清理），菜单容器自身 `onMouseDown` 里 `stopPropagation` | 面板内点空白就关是菜单的基本预期；React 的 synthetic `stopPropagation` 会调用原生 `stopPropagation`，所以文档级监听不会在菜单内部误触发 |
| 2026-09-15 | 菜单/子菜单坐标全部换算成**面板根相对坐标**（`rootRef.getBoundingClientRect()`），并用 `MENU_WIDTH` 估算宽度做夹取与左翻 | 菜单挂在面板根上（`position:relative`）而不是滚动容器里，避免被 `overflow` 裁剪；根相对坐标是唯一与滚动位置无关的坐标系 |
| 2026-09-15 | 右键点「基于此提交新建分支…」→ 打开详情 + `focusBranch` 标志，`useEffect` 里对 `branchRef` 调 `focus()` | 菜单里没法输分支名；把输入框聚焦比弹 prompt 更符合面板语义，也不需要额外对话框组件 |
| 2026-09-15 | `diff` 请求把选中行的分组语义完整转发（`staged` + `untracked`），并新增 `scripts/status-probe.mjs` 常驻排查工具 | 未跟踪文件不在 index 里，普通 `git diff -- <path>` 恒为空 → 必须在 `untracked=true` 时走 host 的 `--no-index` 分支；探针用插件自己的 status/diff 对当前工作区，把"列表有它但差异为空"一次性定性（文件真改没改 / 转发缺失） |
| 2026-09-15 | 命中 `.gitignore` 的条目不再发 diff 请求，直接显示"没有可展示的差异"；tracked 条目 diff 为空时显示"列表可能已过期，点 Refresh" | 忽略文件本来就没有可看差异，发请求只是白花一次 git 进程；而"列表来自快照、差异实时拉"这一组合在面板外改动（如我在 shell 里提交）时会自然出现，必须用文案解释，否则看起来像解析 bug |
| 2026-09-15 | tab 标题组件自带 `padding-right: 32px`（`min-width: 104px`）预留关闭按钮区 | dockkit 的 chip 用遮罩渐隐（标题容器最后 14-30px）给 × 让位，标题内容不预留就会被吃掉尾部；预留后 chip 也自然变宽（用户要的'再加宽'） |
| 2026-09-15 | 新增选中项校验 effect（依赖 [status, applied]）：条目消失则清空 selected/patch，条目换分组则跟随（staged <-> worktree），ignored 项不参与跟随 | 列表与选中项都是从快照派生的 UI 状态，快照刷新后必须复核；否则会留下指向已不存在条目的差异面板与写操作按钮 |
| 2026-09-15 | 右键菜单新增「远程」分组（位置在「修改历史（危险）」之前，危险项保持最底）：推送当前分支 + 无 upstream 时追加「推送并设置 upstream」 | push 与工具栏共用 allowPush 门禁与 host 的 push 端点（setUpstream: true 走 git push --set-upstream origin <branch>）；无 upstream 时普通 push 必失败，所以按 `repo.upstream === ''` 条件补一条 `-u` 入口，避免用户回终端设跟踪关系（此条后被下面的「迁移到 Branches 页」取代） |
| 2026-09-15 | 推送入口从提交右键菜单**迁移到 Branches 页**（本地分支行内按钮）；host 的 push 强制显式 remote | 用户要求推送归属分支模块；另外原来 push {branch} 拼成 git push <branch>，git 会把分支名当仓库名，改为 git push <remote> <branch>（remote 取自该分支 upstream，缺省 origin），无 upstream 时按钮变「推送并设 upstream」走 --set-upstream |
| 2026-09-15 | `BRANCH_FORMAT` 增加 `%(symref)`，`parseBranchList` 跳过符号引用 | `refs/remotes/origin/HEAD` 的 `%(refname:short)` 是 `origin`（不是 `origin/HEAD`），留在列表里会出现「origin + origin/main」两条远程分支，Log 的分支标签也会多一个假 origin |
| 2026-09-15 | Branches 页去掉「当前分支」的选中背景，改用行首 `*` + 绿色加粗分支名；所有分支行加 hover（`hoverBranch` 状态），行样式 `cursor: default` | 用户反馈：本地 main 一直是"选中"高亮很怪、远程行没有 hover 却又是可点光标。只读列表不应有选中态，行不可点就不该给 pointer；hover 是唯一的行级反馈。`S.rowOn` 只留给 Local Changes 与 Log 这两处真实选中 |
