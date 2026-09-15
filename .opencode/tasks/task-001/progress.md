# 任务进度：task-001 DSH Git 版本管理插件

## 当前状态

- **状态**: 动态版全部改进已同步回源码，静态校验 + host 自检全绿；仍待跨盘符安装与真机 UI 验证
- **最后操作日期**: 2026-09-14

## 任务清单

- [x] 调研 DSH 侧入口机制（`sidebar.panellist` + `main` vs `sidebarRightTabs` + `sidebar.right.pane.tab`）
- [x] 调研 IDEA 版本管理工具功能面与 UI 结构
- [x] 调研 host↔client 通信与 git 执行落点（`ctx.connection.rpc` / `ctx.subprocess`）
- [x] 与用户确认 5 项边界（入口形态、包名 `dsh-git-vcs`、读写范围、不注册模型工具、零构建）
- [x] 写 host 半区 `index.js`（端点数见下 + 三级写操作门禁）
- [x] 写浏览器半区 `lib/client.js`（右侧栏 tab 类型 + IDEA 风格 UI）
- [x] 以动态 Cordis 插件（`gitvc-1` / `pkg-1`…`pkg-4`）在当前页面热加载，验证机制与手感
- [x] 把动态版改进同步回源码：缓存 + `repo/snapshot` 并发聚合 + `remote/list`；详情可关、Log 连线列、按提交建分支、Remotes 页、标题不裁、分阶段加载反馈
- [x] 修 `parseStatus` 的 porcelain v2 path 下标 bug（`1 ` → 8 / `2 ` → 9 / `u ` → 10）
- [x] 扩展 `scripts/verify-host.mjs`（snapshot / remote-list 断言、路径分隔符归一、去掉自相矛盾的重复断言）
- [ ] 跨盘符安装（junction 修法，待用户执行 README 命令）
- [ ] 真机 UI 验证（重启 `dsh web` → 刷新 → 引导页胶囊 / 面板 / 分栏 / 全屏 / 浮窗）

## 验证记录

- `node --check index.js` / `lib/client.js` / `scripts/verify-host.mjs`：全部通过
- `validate-plugin.mjs`：**0 ERROR / 0 WARN**
- `smoke-boot.mjs`（隔离 DSH_HOME）：**通过** —— 组合层 `# == dsh-git-vcs` 出现、启动无报错
- `scripts/verify-host.mjs`（真实 git、只读）：**13 通过 / 0 失败**，含新增的 `repo/snapshot`、`remote/list`
- `dsh --profile web --dump-config`：**未见本插件层**（跨盘符坏 junction → 未进 `dsh.profile.bundles`）
- 动态版真机（`gitvc-1`）：右侧栏 tab、六个 tab、暂存 + 提交链路实测通过（用户用面板提交出 `3048f64 提交测试`）
- 本包装进 profile 后的真机实测：未做

## 本次会话摘要

### 2026-09-14（动态热加载 → 同步回源码）

- **完成**：
  - 用动态 Cordis 插件把插件移植进当前页面热加载（`gitvc-1`，4 个 Package），确认右侧栏 tab 机制与 host git 通路真实可用。
  - 修 4 类问题：Log 表列错位（`tr` 上误用 `display:flex`）、提交详情加载态对 null 解属性崩溃、6 次往返 / 约 16 次串行 git 进程造成的 1–2s 卡顿、等待无任何反馈。
  - 新增：Log 单轨连线列（无表头、无行分割线）、提交详情与文件差异默认隐藏且可 `×` 关闭、按提交建分支（`branch/create` + `startPoint`）、Remotes 页（`remote/list`）、tab 标题不裁（`nowrap` + `min-width`）。
  - 同步回 `index.js` / `lib/client.js`：新增 `repo/snapshot` 聚合端点（6 项并发探测）、`remote/list`、git 路径 / 仓库根 / 版本 / remote 缓存、`show` 三段并发。
  - 自检脚本扩展到新端点后，抓出并修掉 `parseStatus` 的 porcelain v2 path 下标 bug（普通变更记录的 path 原本解析成空串）。
- **未完成 / 阻断**：
  - 真实 profile 安装仍卡在跨盘符坏 junction（`~/.dsh/profiles/web` 写入需提权），修法命令在 README「跨盘符安装坑」。
- **修改的关键文件**：`index.js`、`lib/client.js`、`scripts/verify-host.mjs`、`README.md`、`LESSONS.md`、`.opencode/tasks/**`
- **Git commit**：本轮 `feat:` 提交（`3048f64 提交测试` 是用户经插件面板产生的提交）

## 本次会话摘要

### 2026-09-14（远程仓库模块：add / remove）

- **完成**：
  - host 半区新增两个 RPC 端点：`remote/add`（`git remote add`，可选 push URL）与 `remote/remove`（`git remote remove`）。
    入参校验在 `readRemoteName` / `readUrl` / `readOptionalUrl` 三个 helper 中；错误码沿用 `git-vcs/bad-request`，新增 `git-vcs/remote-exists` / `git-vcs/remote-not-found`。
  - 写后清理 `remoteUrlCache`（与 `repo/info` 的 `remote.origin.url` 缓存对齐），保证后续 `repo/info` 立即看到新远程。
  - 写门禁走 `requireWrite()`（不挂 `requireDangerous()`：删除仅删 `.git/config` 段，不丢历史/分支）。
  - 浏览器半区改写 `renderRemotes`：顶部 toolbar 加 Remote 名 + URL + 可选 Push URL 输入 + Add Remote 按钮；
    每行右侧加 Remove 危险按钮走 `ask()` 内联二次确认；写后 `setTick(n=>n+1)` 触发 `useEffect` 重拉 `remote/list`。
  - `scripts/verify-host.mjs` 扩展：临时仓库（`mkdtempSync` + `git init` + 空 commit）+ `expectError` helper，
    覆盖 8 条断言（add 缺 name/url/名字非法、add 正常、add 后 list、add 重名、remove 不存在、remove 正常、remove 后 list），
    跑完整体 `rmSync` 清理。
- **验证**：
  - `node --check index.js` / `lib/client.js` / `scripts/verify-host.mjs`：全部通过
  - `validate-plugin.mjs`：**0 ERROR / 0 WARN**
  - `smoke-boot.mjs`（隔离 DSH_HOME）：通过
  - `scripts/verify-host.mjs`：**22 通过 / 0 失败**（原 13 + 新 9，含 add 后 list 与 remove 后 list 两条；expectError 计为单独的 OK 行）
- **修改的关键文件**：`index.js`、`lib/client.js`、`scripts/verify-host.mjs`、`README.md`、`.opencode/tasks/**`
- **Git commit**：本轮 `feat:` 提交（远程仓库模块：add / remove）

## 本次会话摘要

### 2026-09-15（Log 改版：IDEA 列序 + 分支标签 + 点击复制 + 可拖列宽）

- **需求**（用户原话要点）：列顺序改为时间、提交树、message、author、commit；提交树列标出所有分支名（本地+远程）；
  Commit 列直接点 ID 复制（不要独立按钮）；列宽可手动拖动，提交树列自适应且不可拖。
- **完成**：
  - `index.js`：`BRANCH_FORMAT` 末尾追加 `%(objectname)`，`parseBranchList` 多输出 `hash`（完整哈希）——
    提交树列靠它把分支标签钉到提交上（短哈希在同仓库内也可匹配，作为回退）。
  - `lib/client.js`：
    - Log 从 `<table>` 改为 **div 版表格**（`S.thead/S.tr/S.th/S.td`），因为表格列宽无法既固定又逐列拖动；
      列顺序 时间 / 提交树 / Message / Author / Commit。
    - `GraphCell`：泳道线 + 节点 + **该提交上的全部分支标签**（本地绿框、远程蓝框、HEAD 分支加粗；`origin/HEAD` 跳过），
      列宽由 `logGraphWidth()` 按标签内容估算（`glyphWidth` 中文按 10.5px、ASCII 6.1px），钳制 64–300px。
    - `ResizeHandle`：pointer capture 拖动列宽，起始宽度量父单元格，不挂 window 监听；
      `resizeColumn` 按 `LOG_LIMITS`（92–360 / 120–900 / 60–280 / 64–220）钳制；
      Message 列默认吃剩余宽度（`msgAuto`），被拖动后转固定宽度，总宽超出即横向滚动。
    - Commit 列短哈希可点即复制（`navigator.clipboard` → 兜底 `textarea + execCommand`），
      顶部提示条回显 2 秒后自动消失（`flash()`，`notice` 由字符串改为 `{text,bad}`）；提交详情里的完整哈希同样可点。
  - `scripts/verify-host.mjs`：新增「分支完整哈希」与「snapshot 分支标签可定位提交」两条断言 → **23 通过 / 0 失败**。
  - **动态预览机制重做**：新增 `scripts/preview-check.mjs`（同构 node:vm 复现动态沙箱）；
    动态包 `gitvcs-3` 的 `pkg-8`/`pkg-9` 改为**装载器**（读磁盘真实源码再编译运行），预览恒等于当前源码。
- **踩坑**（已写入 LESSONS.md）：
  - 宿主动态沙箱是全新 `node:vm` 上下文：**没有 `AbortSignal`**（也没有 `AbortController`/`setTimeout`/`fetch`/`require`/`process`），
    真实 host 半区一进去每个端点都 `AbortSignal is not defined` → 全部回 `git-vcs/internal`；
    装载器用鸭子类型信号（`aborted`/`addEventListener`/`removeEventListener`，超时走 `ctx.timeout`）顶替后全通。
  - 动态通道返回值要过 host-runner 的 `cloneJson` 无损检查，桥上加自查并把坏值换成带端点名的干净错误码。
- **验证**：`node --check` 两半区通过；`validate-plugin.mjs` 0 ERROR / 0 WARN；`verify-host.mjs` 23/23；`preview-check.mjs` 全通过。
- **Git commit**：本轮提交（Log 改版）。

### 2026-09-15（Log 视觉修正：空心圆点 + 分支配色 + 无缝连线；提示改为浮动 toast）

- **用户反馈**：① 提交树连线效果不好——要求圆点在本行中间、空心（同色系深色圆环）、连线用同色系浅色、
  从正中贯穿圆点但**圆点内不画线**、上下行之间**不能有空隙**、不同分支用不同颜色（原实现是实心圆 + 固定蓝 + 写死 13px 端点）；
  ② 复制提示会导致布局高度变化两次 → 视觉抖动，要求改用弹窗类提示。
- **完成**：
  - `lib/client.js`：新增 `GRAPH_COLORS`（8 组 ring/line/fill 同色系）、`NODE_RADIUS`；
    `GraphCell` 改为「上下两段连线 + 居中空心圆」——`up = top:-1px / height:calc(50% - 4px)`、
    `down = top:calc(50% + 5px) / bottom:-1px`（各越界 1px 与相邻行重叠，消除小数行高的接缝），
    圆点 `top: 50%` + `marginTop: -5px`（行内居中），HEAD 只把圆环加粗到 3px；
    提交树单元格放开 `overflow`、由标签容器自己裁剪，保证越界生效且长标签不溢到 Message 列。
  - 颜色：`logColorByName`（分支名排序取模）+ `logColorOf`（本行标签优先，无标签从子提交沿父提交继承）；
    标签同时带上自己分支的 ring/fill（本地实线、远程虚线、HEAD 加粗）。
  - 提示：`S.notice/S.noticeBad` → `S.toast/S.toastBad`（`position:absolute` 右下角 + 根节点 `position:relative`
    + `pointerEvents:none`），复制与写操作耗时提示都不再参与流式布局。
- **验证**：`node --check` 通过；`verify-host.mjs` 23/23；`preview-check.mjs` 全通过；动态预览 `gitvcs-3/pkg-9` 已重启（run-11）加载最新源码。

### 2026-09-15（提交树第三轮：HEAD 实心 + SVG 真圆 + 连线不透明消除深色接缝）

- **用户反馈**：① HEAD 要实心；② 圆看着不圆、有棱角；③ 每行连接线的连接处像被重复绘制、颜色更深。
- **原因与修法**：
  - ③ 是"半透明连线 + 1px 越界重叠"造成的：`rgba(...,0.42)` 在重叠区被叠两次 → 每行边界一条更深的横带。
    `GRAPH_COLORS.line` 全部换成**不透明浅色 hex**，保留 1px 重叠消除接缝。
  - ② 是 CSS `border-radius: 50%` 小圆环在非整数行高（标签换行使行高为奇数）下被栅格化出棱角。
    圆点改为 **SVG `<circle cx=6 cy=6 r=4 stroke-width=2>`**（12px 画布，外沿半径 5px 正好接住两段连线）。
  - ① HEAD 由"加粗描边"改为 **`fill = ring` 实心**；判定用 `repo.oid === item.hash`（拿不到时退回列表首行）。
- **验证**：`node --check` 通过；`preview-check.mjs` 全通过；动态预览 `gitvcs-3/pkg-9` 已重启加载最新源码。

### 2026-09-15（提交树第四轮：按当前分支优先着色 + 行 hover/pointer）

- **用户反馈**：① 节点与连线颜色要跟"当前链 head 所在分支"，不能被中间出现的分支颜色覆盖
  （例：main A-B-C-D、远程在 C、从 C 分出 test 到 E → A/B/C/D 全 main，只有 E 是 test）；
  ② 每行要 hover 高亮且光标为 pointer。
- **修法**：
  - `logColorOf` 改为**分支优先级多源 BFS**：把带标签的提交按优先级分组（当前分支 0 > 其它本地分支 1 > 远程分支 2），
    逐组沿父提交传播、已染色不覆盖；detached HEAD 时用 `headHash` 给优先级 0 补种子。
    这样当前分支的整条链先定型，其它分支只能染自己独有的提交，与日志顺序无关。
  - Log 行样式加 `cursor: pointer`，新增 `rowHover` 背景 + `hoverHash` 状态（`onMouseEnter`/`onMouseLeave`，
    只在哈希变化时 set），选中行仍用 `rowOn`。
- **验证**：`node --check` 通过；`verify-host.mjs` 23/23；`preview-check.mjs` 全通过；预览 `gitvcs-3/pkg-9` 已重启（run-13）。

### 2026-09-15（提交详情改上下布局 + 高度可拖 + 按文件懒加载差异）

- **用户反馈**：点提交后详情面板改为上下布局、放到下面、高度可拖拽；默认不显示变更文件的具体变更；
  变更文件行要有 hover；点击某个文件才展示该文件的变更（不要一次性展示所有文件的变更）。
- **完成**：
  - `index.js`：`show` 支持 `noPatch: true`（只并发 meta + name-status 两探测，`patch` 返回空串）；
    新增 `'show/file'`（rev + path → 单文件 patch）；抽出 `readFilePath` 校验（非空、无 NUL、不以 - 开头）。
  - `lib/client.js`：`S.body`/`S.detail`（Local Changes 的左右布局）保持不变，新增 `S.bodyStack` + `S.detailBottom`；
    `RowSplitter`（顶边拖拽条，pointer capture、`row-resize`）控制高度 `detailHeight`（默认 300，钳 140–720，maxHeight 80%）；
    `openCommit` 改走 `show + noPatch`；新增 `show/file` 的按需拉取 effect（`detailFile`/`filePatch`/`fileLoading`/`detailHover`）；
    变更文件行 hover 高亮 + `pointer` + 点击选中/再点收起；差异区默认提示"点上面的文件…"。
  - `scripts/verify-host.mjs`：新增 4 条断言（`show` noPatch 空 patch、`show/file` 单文件且只含一个 diff、缺 path、path 以 - 开头）→ **27 通过 / 0 失败**。
  - `scripts/preview-check.mjs`：端点清单改为「端点 + 载荷」，覆盖 `show` / `show/file`。
- **验证**：`node --check` 两半区通过；`verify-host.mjs` 27/27；`preview-check.mjs` 全通过；预览 `gitvcs-3/pkg-9` 已重启（run-14）。

### 2026-09-15（提交行右键菜单：分组 + 多级子菜单）

- **需求**：提交列表加自定义右键菜单，包含对提交的基本操作，按功能分组，支持二级菜单。
- **完成**（`lib/client.js`）：
  - 数据模型 `commitMenuItems(commit)`：分组（`{kind:'group'}`）、叶子（`onPick`）、父项（`items`）三类；
    `menuRows(items, path, level)` 递归渲染，父项 hover 或点击展开，子菜单按可用宽度自动左翻。
  - 菜单分组：**查看**（展开详情）/ **复制**（完整 ID、短 ID、提交信息、作者与邮箱）/ **分支** ▸（新建分支并聚焦输入框、
    检出此提交（分离 HEAD）、合并到当前分支）/ **修改历史（危险）** ▸（Cherry-Pick、Revert、重置到此提交 ▸ Soft/Mixed/Hard）。
  - 门禁：`allowWrite` / `allowDangerous` 关闭时对应项置灰；破坏性操作走 `ask()` 二次确认。
  - 交互：`onContextMenu` 屏蔽原生菜单并把坐标换算成面板根相对坐标（`MENU_WIDTH` 夹取、越界上移）；
    子菜单栈状态 `submenuStack` + `menuHover`；点菜单外 / `Esc` 关闭（`document` 监听，菜单内 `stopPropagation`）；
    右键行同时高亮该行；面板底部加了"提交行右键打开操作菜单"的提示。
- **验证**：`node --check` 通过；`verify-host.mjs` 27/27；`preview-check.mjs` 全通过；`validate-plugin.mjs` 0 ERROR / 0 WARN；
  预览 `gitvcs-3/pkg-9` 已重启（run-15）。

### 2026-09-15（排查「列表说改了、差异却是空」→ 修未跟踪文件差异缺失）

- **用户问题**：面板里 `client.js` 显示已修改，点开却没有差异内容，怀疑插件解析错。
- **定性结论**：文件确实没有改动（已在 `cf35637` 提交，`git status --porcelain=v2` 为空，LF 行尾无 CRLF 问题）。
  现象成因是**数据来源不同步**：列表来自快照（面板不监听文件系统、`autoRefreshSeconds` 默认 0），差异是点击时实时拉；
  我在 shell 里提交代码后面板仍持着旧快照。
- **顺带修掉一个真 bug**：`diff` 请求没转发 `untracked`，导致**未跟踪文件点开永远是"无差异内容"**
  （未跟踪文件不在 index 里，普通 `git diff -- path` 恒为空，host 的 `--no-index` 分支从未被走通）。
- **改动**：
  - `lib/client.js`：diff effect 带上 `untracked`；忽略条目不发请求（显示"命中 .gitignore 的文件没有可展示的差异"）；
    tracked 条目 diff 为空时显示"列表可能已过期，点 Refresh 重新读取"；差异标题区分 已暂存 / 未跟踪的新文件 / 已忽略 / 工作区。
  - `scripts/verify-host.mjs`：新增 3 条回归断言（status 认出未跟踪、普通 diff 为空、`untracked=true` 拿到新文件差异）→ **30 通过 / 0 失败**。
  - `scripts/status-probe.mjs`：新增常驻探针（用插件自己的 status/diff 打印条目与三种 diff 长度）。
- **验证**：`node --check` 通过；`verify-host.mjs` 30/30；`preview-check.mjs` 全通过；预览 `gitvcs-3/pkg-9` 已重启（run-16）。

### 2026-09-15（tab 标题被关闭按钮覆盖）

- **用户反馈**：右侧栏「版本管理」tab 选中时关闭按钮覆盖了标题尾字，要求再加宽。
- **根因**：dockkit 的 chip CSS —— 选中 / hover 时把 × 绝对定位在 `右缘 - 24px`，并对标题容器 `._tabTitle` 加 mask-image: linear-gradient(to right, black calc(100% - 30px), transparent calc(100% - 14px))`，用**渐隐吃掉标题尾部**给按钮让位；我们的标题组件没预留这段，于是渐隐压住最后一个字。
- **修法**：`S.title` 加 `paddingRight: 32px` + `minWidth: 104px`（`boxSizing: border-box`）—— 内容 71px（图标 14 + gap 5 + 4 个 13px CJK ≈ 52）之后留出空白，渐隐落在空白上；chip 宽度随之增加（约 124px，未超 kit 的 max-width 170px）。
- **验证**：`node --check` 通过；预览 `gitvcs-3/pkg-9` 已重启（run-17）。

### 2026-09-15（刷新后残留的差异面板与操作条）

- **用户反馈**：点开一个改动查看后按 Refresh，改动没了，但底部「暂存/回滚」操作条与右侧差异面板仍在。
- **根因**：`selected` 只在点击时写入，快照刷新后没有复核，于是留下了指向已不存在条目的面板与按钮。
- **修法**：新增选中项校验 effect（依赖 `[status, applied]`）——条目已不在 `entries()` 里就清空 `selected`/`patch`；条目只是换了分组（刚点暂存）则跟随到新分组；`ignored` 项不参与跟随。
- **验证**：`node --check` 通过；`verify-host.mjs` 30/30；预览 `gitvcs-3/pkg-9` 已重启（run-18）。副作用行为需真机点一次确认（客户端逻辑，自检脚本覆盖不到）。

### 2026-09-15（右键菜单加推送）

- **需求**：右键菜单里加推送功能。
- **实现**：commitMenuItems 新增「远程」分组（排在「修改历史（危险）」之前）——「推送当前分支（Push）」git push（hint 显示 upstream），epo.upstream === '' && 非分离 HEAD 时追加「推送并设置 upstream」→ push {setUpstream:true, branch}（host 走 `--set-upstream origin <branch>`）。
- **门禁**：与工具栏一致 `allowPush !== true` 时置灰并给出悬停原因（配置未读到 / allowPush=false）；分离 HEAD 下推送置灰。
- **验证**：`node --check` 通过；`verify-host.mjs` 30/30；预览 `gitvcs-3/pkg-9` 已重启（run-19）。
