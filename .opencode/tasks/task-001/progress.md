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
- **实现**：commitMenuItems 新增「远程」分组（排在「修改历史（危险）」之前）——「推送当前分支（Push）」`git push`（hint 显示 upstream），`repo.upstream === '' && 非分离 HEAD` 时追加「推送并设置 upstream」→ `push {setUpstream:true, branch}`（host 走 `--set-upstream origin <branch>`）。<br>**注**：本轮的菜单推送在下一轮已按用户要求**迁移到 Branches 页**，提交右键菜单不再有推送项。
- **门禁**：与工具栏一致 `allowPush !== true` 时置灰并给出悬停原因（配置未读到 / allowPush=false）；分离 HEAD 下推送置灰。
- **验证**：`node --check` 通过；`verify-host.mjs` 30/30；预览 `gitvcs-3/pkg-9` 已重启（run-19）。

### 2026-09-15（推送迁到 Branches 页 + 过滤 origin/HEAD 符号引用）

- **需求**：① 把推送从提交右键菜单挪到分支模块；② 远程分支里为什么有 origin 与 origin/main 两条。
- **② 的根因**：`refs/remotes/origin/HEAD` 的 `%(refname:short)` 实际是 **origin**（不是 origin/HEAD），`parseBranchList` 没过滤符号引用 → 远程分支多一条假的 origin（Log 的分支标签同样会多一个）。修法：`BRANCH_FORMAT` 加 `%(symref)`，非空即跳过。
- **① 的实现**：提交右键菜单删掉「远程」分组；Branches 页本地分支行加「推送」按钮（无 upstream 时变「推送并设 upstream」→ `--set-upstream <remote> <branch>`，remote 取自该分支 upstream，缺省 origin），与工具栏同一道 allowPush 门禁；页内加了一行说明。
- **顺带修 host 的 push 参数 bug**：原来 `push {branch}` 拼成 `git push <branch>`（git 会把分支名当仓库名）；现在强制 `git push <remote> <branch>`，并新增 `readRemoteArg` 校验（拒绝空/空白/NUL/以 - 开头）。
- **验证**：`verify-host.mjs` 新增 4 条断言（push 带 remote、--set-upstream 带 remote+分支、非法 remote 被拒、branches 过滤 origin/HEAD）→ **34 通过 / 0 失败**；预览 `gitvcs-3/pkg-9` 已重启（run-20）。

### 2026-09-15（Branches 页：去掉选中态、补 hover）

- **用户反馈**：本地 main 一直高亮选中；远程分支没有 hover 也不可点；分支模块不需要选中效果，只留 hover。
- **改动**：`renderBranches` 不再用 `S.rowOn`（那是 Local Changes / Log 的真实选中态），当前分支改为行首 `*` + 绿色加粗分支名；新增 `hoverBranch` 状态给所有分支行做 hover 背景；行样式 `cursor: default`（操作都在行内按钮）。
- **验证**：`node --check` 通过；`verify-host.mjs` 34/34；预览 `gitvcs-3/pkg-9` 已重启（run-21）。

### 2026-09-15（第一部分：提交勾选 + 提交门禁 + 错误改 toast）

- **用户需求（第一部分）**：① 没有文件改动时不该能点 Commit（点了才报错不合适）；② 不再用顶部错误横幅，全部走 toast；③ 每行改动前加勾选框，只提交勾选的文件，一个都没勾时 Commit 不可点。第二部分（三态勾选 + hunk 级部分提交）要求先出方案。
- **完成**：
  - 错误提示：删掉 `error` 状态与顶部横幅（连同 `S.banner` 样式），新增 `reportError()` → 右下角浮动 toast（6 秒；成功类提示仍是 2 秒），全部 7 处 `setError(result.error)` 改成 `reportError`。
  - 提交勾选：checkedPaths（path → bool）+ selectNew（刷新后新出现的改动默认是否勾上）；行内自绘勾选框（点它 stopPropagation，不打开差异）；提交区加「全选 / 全不选」与 已选 x/y 个文件 · z 个已暂存 统计。
  - 提交门禁：canCommit = !busy && allowWrite && 有信息 && (amend || 勾选数>0)，悬停分别说明原因（写操作关闭 / 先填提交信息 / 工作区无可提交改动 / 没有勾选任何文件）；commit() 只把勾选的 paths 传给 host。
  - Amend 明确为「修补上一次提交，忽略勾选」，按钮文案里注明。
- **第二部分方案**：写入 .opencode/tasks/task-001/plan-partial-commit.md（三态模型、hunk 选择、stage/hunks 端点、路线 A「提交=提交索引」、P1-P4 分阶段与工作量、需要用户拍板的 3 件事）。
- **验证**：`node --check` 通过；`verify-host.mjs` 34/34；`preview-check.mjs` 全通过；预览 `gitvcs-3/pkg-9` 已重启（run-22）。

### 2026-09-15（一轮 UI 打磨 + Stash 引用真 bug；用户边测边提，逐条改，最后统一提交）

> 本轮用户全程在面板实测逐条反馈，改动**一直留在工作区未提交**（用户明确要求"不要自动提交，我要测"），
> 最后由用户发话才提交。

- **提交勾选与门禁**
  - 删掉 `error` 状态与顶部错误横幅（含 `S.banner` 样式），新增 `reportError()` → 右下角浮动 toast（错误停 6 秒、成功 2 秒）。
  - 每行改动前加自绘勾选框（`stopPropagation`，点它不打开差异）；`checkedPaths` + `selectNew`（新出现的改动默认勾上，手动取消会记住）；
    提交区加「全选 / 全不选」「清空」与 `已选 x/y 个文件 · z 个已暂存`。
  - `canCommit = !busy && allowWrite && 有信息 && (Amend || 勾选数 > 0)`，置灰时 title 说明原因；`commit()` 只把勾选的 paths 交给 host。
  - 未勾选态"看不见"：原描边只有 22% 透明、13px，改成 65% 描边 + 淡底、14px。
- **Stash（贮藏）**
  - 与「暂存」区分：tab 保持英文 `Stash`，页内统一「贮藏」；按用户要求删掉顶部说明条与两处括号补充。
  - `stash push` 成功后清空说明输入框，并加「清空」按钮。
  - **真 bug**：`STASH_FORMAT` 用 `%gd` + `--date=iso-strict` → ref 变成 `stash@{2026-09-15T…}` 时间戳选择器；
    git 对它打印 `Dropped …`、退出码 0 **却什么都不删**（同秒两条 ref 还完全一样），所以 pop/drop 都"没反应"、toast 还一直挂着。
    修法：`STASH_FORMAT` 只取哈希/日期/标题，ref 由列表下标合成 `stash@{n}`；新增 `readStashRef` 校验；
    pop/apply/drop 前后核对贮藏条数，不符即报 `git-vcs/git-failed`。
- **toast 永不消失**：`run()` 直接 `setNotice` 没排定时器（改成 toast 之前它是常驻提示条，看不出来）→ 统一走 `flash()`。
- **差异面板**
  - 布局从右侧栏改为**上下结构**（列表在上、差异在下），顶边拖拽条调高，与提交详情**共用同一个高度状态**。
  - 左侧加**行号槽**（上下文/新增用新文件行号，删除用旧侧行号，`@@`/文件头留空；`parseHunkHeader` 驱动）。
  - 长行**默认换行**（`pre-wrap` + `break-all`，容器 `overflow-x: hidden`）：横向滚动条消失；底色改画在**整行**上
    （原来画在行内 span 上，横向滚动露出的右侧没有红/绿）。
  - `↑`/`↓` 改为**改动块**导航：目标是连续的 `+`/`-` 行（同一 hunk 内被上下文隔开的两处算两站）；
    光标**按滚动位置实时算**（顶端滚到视口顶的最后一块；贴底时视口内可见的最后一块也算）；
    页首 ↑ 置灰、滚动后再点不会跳回旧位置；高亮**只点亮左侧行号槽**（保留代码区红/绿）。
  - 工具条加改动统计：`N 处改动` / 已定位时 `第 n/N 处改动`。
- **其它 UI**
  - 所有 Busy 提示的 `⏳` 换成 **SVG 圆弧 spinner** + `requestAnimationFrame` 旋转（不注入样式表、不押 SMIL 支持）。
  - 输入框统一优化：`outline: none` 去掉默认黑焦点圈，新增 `TextInput` / `TextArea` 用状态模拟 `:focus`（蓝描边 + 淡底 + 柔光）；
    Amend 复选框改回 `input[type=checkbox]` 并加 `accent-color`（批量替换时被误伤过）。
  - Branches：本地分支行显示相对 upstream 的 `↑领先` / `↓落后`；去掉"当前分支"的选中背景（改行首 `*` + 绿色分支名），
    行加 hover、光标改默认；页内说明条与页脚的多项说明按用户要求删除。
  - 底部状态栏只保留忙碌阶段文案，空闲时不占位置。
- **验证**：`node --check`（index.js / lib/client.js）通过；`validate-plugin.mjs` 0 ERROR / 0 WARN；
  `verify-host.mjs` **39 通过 / 0 失败**；`preview-check.mjs` 全通过；动态预览 `gitvcs-3/pkg-9` 每轮重启（run-22 … run-37）由用户点验。
