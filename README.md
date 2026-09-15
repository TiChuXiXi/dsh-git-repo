# dsh-git-vcs

DSH Web GUI 的 **Git 版本管理插件**：在右侧栏新增「版本管理」页，功能与界面参照 IntelliJ IDEA 的
Version Control 工具窗（`Alt+9`）与 Commit 工具窗（`Alt+0`）。

## 形态

单包，host 半区 + 浏览器半区，**零构建**（手写闭包工厂，无 tsdown/无运行时依赖）：

| 半区 | 文件 | 职责 |
|------|------|------|
| host | `index.js` | 用 `ctx.subprocess` 以 argv 形式执行 git；经 `ctx.connection.rpc.handle('/git-vcs')` 暴露端点；写操作门禁 |
| 浏览器 | `lib/client.js` | 注册右侧栏 tab 类型（`ctx.sidebarRightTabs`）+ 正文（`sidebar.right.pane.tab`）；IDEA 风格 React UI |

右侧栏的**分栏、全屏、拖出浮窗**由官方 `dsh-client-ui-sidebar-right` + `dockkit` 提供，本插件只贡献内容，
不碰布局（tab 条上的分栏控件与形态切换按钮即是这些能力的入口）。

## 安装

```powershell
$env:Path = "C:\Users\zdz20\AppData\Roaming\npm;" + $env:Path
dsh plugin --profile web add D:\zxh\code\git-plugin
dsh --profile web --dump-config | Select-String "dsh-git-vcs"   # 必须看到 "# == dsh-git-vcs" 层
```

**改完 host 半区必须重启 `dsh web`**（bundle 层在启动时加载，刷新页面不够）；
只改 `lib/client.js` 时刷新页面即可。

### ⚠️ 跨盘符安装坑（本机已踩到）

插件目录在 `D:`，profile 在 `C:\Users\zdz20\.dsh\profiles\web`。pnpm 对跨盘符的 `link:`/`file:`
无法算出相对路径，会生成**目标被拼错的坏 junction**，于是 `dsh` 的 bundle 对账读不到
`node_modules/dsh-git-vcs/package.json`，判定"declares no dsh.bundle"，插件只当普通依赖装、
**不进 `dsh.profile.bundles` 层**（现象：`dsh plugin add` 末尾提示 `declares no dsh.bundle`，
`--dump-config` 里没有自己的层）。

三条可行路线，任选其一：

1. **手动建正确 junction，再让 dsh 自己对账**（推荐，改动最小）
   ```powershell
   $p = "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-git-vcs"
   cmd /c rmdir "$p"                                                     # 先删掉坏 junction（rmdir 只删链接）
   cmd /c mklink /J "$p" "D:\zxh\code\git-plugin"
   dsh plugin --profile web install                                       # 对账：自动把 dsh-git-vcs 追加进 bundles
   dsh --profile web --dump-config | Select-String "dsh-git-vcs"
   ```
2. **把插件挪到 C: 盘同一盘符**，再 `dsh plugin --profile web add <新路径>`（例如 `%USERPROFILE%\code\dsh-git-vcs`）。
3. **发布成 npm 包后按包名安装**（`dsh plugin --profile web add dsh-git-vcs`），走 registry 就没有跨盘符问题。

清理残留（若第一次安装已经把坏依赖写进 profile 的 `package.json`）：

```powershell
dsh plugin --profile web remove dsh-git-vcs
# remove 若也失败，手工删链接与依赖条目：
cmd /c rmdir "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-git-vcs"
# 然后编辑 ~\.dsh\profiles\web\package.json，去掉 dependencies.dsh-git-vcs，并确认 dsh.profile.bundles 里没有它
```

## 自检

不需要挂 profile，直接跑 host 半区（真实 git、只读端点，不改仓库状态）：

```powershell
node scripts\verify-host.mjs D:\zxh\code\git-plugin
```

覆盖：`repo/info` / `repo/snapshot` / `status` / `log` / `branches` / `remote/list` / `diff` / `show` /
`console/list` 的解析结果，未知端点错误码、`allowPush=false` 的 push 门禁、相对路径与非仓库目录的拒绝。

浏览器半区没有等价的离线自检：它必须在真实 GUI 里加载，靠 DevTools Console 与
`window.__DSH_BOOT__` 验证（见下）。

## 使用

右侧栏 tab 条的「+」或引导页胶囊 → **版本管理**。首次加入后右侧栏默认页会从「工作区文件」变为
引导页（官方规则：引导入口多于一个时打开引导页），页面上有两个胶囊：工作区文件 / 版本管理。

面板自上而下：

- **工具栏**：仓库路径（默认取会话工作目录）、当前分支（点击进分支页）、Refresh、Fetch、
  Update Project（pull --no-edit）、Push（仅 `allowPush=true` 时可用）
- **Tab**：Local Changes / Log / Console / Branches / Remotes / Stash（贮藏）
- **Local Changes**：按「冲突 / 已暂存 / 已修改 / 未跟踪」分组，行内状态字母（蓝=修改、绿=新增、
  灰=删除、红=冲突），选中行后可暂存 / 取消暂存 / 回滚；**差异默认不显示**，点文件才在右侧展开，右上角 `×` 关闭。
  > 两种"选择"在面板里是分开的、互不影响：**勾选框**决定本次提交包含哪些文件
  > （提交走 `git add -- <勾选的文件>` + `git commit -m <信息> -- <勾选的文件>`：
  > 先暂存再按 pathspec 提交，未跟踪文件也能直接勾选提交，且忽略索引里其它内容）；
  > **「暂存 / 取消暂存」**是 `git add` / `git restore --staged`，把改动放进或移出**索引（Index）**，
  > 供你在终端或别的工具里按标准 git 工作流使用。`MM` 状态的文件会同时出现在「已暂存」和「已修改」两个分组里。
  差异按行所属分组取：已暂存组走 `diff --cached`、其余走工作区 `diff`；**未跟踪文件必须带 `untracked=true`**
  （未跟踪文件不在 index 里，普通 `git diff -- <path>` 恒为空，只有 host 的 `--no-index` 分支拿得到"新文件"差异）；
  命中 `.gitignore` 的文件不发请求，直接说明没有可展示的差异。
  选中项会随快照校验：条目消失（文件被别处提交/回滚）即收起差异面板与底部操作条，条目只是换了分组（刚点了暂存）
  则跟随到新分组，避免右侧继续显示已经不存在的差异。
- **提交区**：提交信息、Amend（`allowDangerous` 控制）、Commit。每一行改动前面有**勾选框**（零构建下自己画的方块，
  点它只切换勾选、不打开右侧差异），**只提交勾选的文件**（host 的 `commit` 先 `git add` 这些路径、
  再按 pathspec 提交 → 只提这些路径，未跟踪文件同样可选）；
  行内还有「全选 / 全不选」。没有可提交的改动、或一个文件都没勾时 **Commit 置灰**（悬停说明原因），
  不再出现"点了才报错"；Amend 语义是修补上一次提交，**忽略勾选**（按钮文案里已注明）。
- **Log**（列顺序对齐 IDEA：**时间 · 提交树 · Message · Author · Commit**）：
  - **提交树列**：本行正中的圆点 + 贯穿整行的连线（圆点内部不画线，上下两段正好接到圆环外沿，
    相邻行的段各越界 1px 重叠 —— 连线是**不透明**浅色，重叠不会变深，但能消除行高含小数时的接缝），行间无分割线。
    圆点用 **SVG 真圆**（直径 10px、圆环 2px；CSS 小圆环在非整数行高下会被栅格化出棱角），
    **HEAD 提交实心**（填充该分支深色）、其余空心。
    圆环用该分支色系的**深色**、连线用同色系**浅色**，**每条分支一个颜色**（8 色调色板按分支名排序取模，跨渲染稳定）。
    某次提交属于哪条分支按**分支优先级多源 BFS** 判定：当前分支（HEAD 所在）`0` > 其它本地分支 `1` > 远程分支 `2`，
    先用当前分支的 tip 沿父提交刷满整条链，再依次处理其它分支且不覆盖已染色的提交——
    于是「main: A-B-C-D，远程在 C，另有 test: C-E」里 A/B/C/D 都是 main 的色，只有 E 是 test 的色
    （即使 E 比 D 新、在日志里排在前面）。
    节点右侧标出**所有指向该提交的分支标签**（同色系描边 + 淡底，本地实线 / 远程虚线，当前 HEAD 分支加粗，
    `origin/HEAD` 符号引用跳过），一眼看出每个分支停在哪次提交。
    该列宽度按标签内容**自适应**（64–300px）且**不可拖动**。
  - **行交互**：鼠标移到任意提交行即高亮（零构建下没有 CSS `:hover`，用状态模拟），光标为 `pointer`，点击展开该提交详情。
  - **右键菜单**（提交行 `onContextMenu`，屏蔽浏览器原生菜单）：按功能分组并带分组标题与分隔线，支持多级子菜单
    （`menuRows` 递归渲染，父项 hover 或点击展开，按可用宽度自动向左翻转；点菜单外 / `Esc` 关闭，菜单自身 `stopPropagation` 不误关）：
    - **查看**：展开提交详情
    - **复制**：复制完整 ID / 短 ID / 提交信息 / 作者与邮箱
    - **分支** ▸：基于此提交新建分支（自动展开详情并聚焦分支名输入框）、检出此提交（分离 HEAD）、把此提交合并到当前分支
    - **修改历史（危险）** ▸：拣选（Cherry-Pick）、回滚（Revert）、重置到此提交 ▸（Soft / Mixed / Hard，Hard 走二次确认）
    - 受 `allowWrite` / `allowDangerous` 门禁的项自动置灰禁用。
  - **Commit 列**：显示短哈希，**直接点击短哈希即复制完整提交 ID**（无独立按钮），
    复制结果走**右下角浮动提示条**（绝对定位、不参与流式布局，因此出现/消失不会顶动高度造成抖动；2 秒后自动消失，
    失败为红底）；提交详情里的完整哈希同样可点。
  - **列宽**：时间 / Message / Author / Commit 四列表头右侧有拖动手柄（`col-resize`，pointer capture，
    不依赖 window 监听），拖动范围各自钳制（92–360 / 120–900 / 60–280 / 64–220px）；
    Message 列默认吃掉剩余宽度，被拖动后改为固定宽度，总宽超出面板即横向滚动。
  - **提交详情默认不显示**，点条目才展开；面板在**Log 下方**（上下布局），顶边有拖拽条可改高度（默认 300px，
    上拖变高，钳制 140–720px 且不超过容器 80%），右上角 `×` 关闭。
    详情内含 Revert / Cherry-Pick / Reset --soft / Reset --hard、**「新分支名」→ 基于该提交建分支（不切换）**，
    以及变更文件列表——**默认不展示任何文件的差异**，文件行有 hover 高亮、光标 `pointer`，
    **点某个文件才按需拉取该文件的 diff**（`show/file` 端点），再点一次收起；
    点提交时只取元数据与文件列表（`show` + `noPatch`），不再一次性传输整次提交的 patch。
- **Branches**：本地 / 远程分支。当前分支用首列 `*` + 绿色加粗分支名标识（**不做"选中"背景高亮**——
  这里没有选中态），行只在 hover 时变色、光标为默认箭头（操作都在行内按钮上，行本身不可点）。
  远程分支列表会**过滤符号引用**——`refs/remotes/origin/HEAD`
  的 `%(refname:short)` 会退化成 `origin`，不过滤就会和真正的 `origin/main` 一起显示成两条。每行操作：
  本地分支 **推送**（有 upstream 时 `git push <remote> <branch>`；没有 upstream 时按钮变成「推送并设 upstream」，
  走 `git push --set-upstream <remote> <branch>`，`remote` 取自该分支的 upstream，缺省 `origin`）、切换、合并、删除，
  顶部还有「新建并切换」。推送与工具栏 Push 同一道门禁（`allowPush`，默认开）。
- **Remotes**：`git remote -v` 的全部远程与 fetch / push 地址；顶部表单可填**名字 + URL（+ 可选 push URL）→ Add Remote**，
  每个远程行有 **Remove** 危险按钮（点击走内联二次确认）。均受 `allowWrite` 门禁控制。
- **Stash（贮藏）**：`git stash` 的入口 —— 把当前未提交的改动**整体收起来**、工作区回到干净状态，
  之后用「应用（`apply`，保留记录）/ 弹出（`pop`，取回并删除记录）/ 删除（`drop`）」处理；
  与 Local Changes 里的「暂存」不是一回事（那是 `git add` 放进索引）。
  当前实现用 `git stash push [-m 说明]`，**不带 `-u`**：未跟踪的新文件不会被收走，会留在工作区。
  列表里的引用是 **`stash@{n}` 数字选择器**（由列表下标合成，与 git 编号一致）——不能用 `%gd` 配
  `--date=iso-strict`，那会生成 `stash@{2026-09-15T…}` 时间戳选择器，而 git 对它会打印 `Dropped …`、
  退出码 0，**却什么也不删**；host 现在还会核对操作前后的贮藏条数，把这种静默失败变成明确错误。
- **Console**：面板发起的每条 git 命令（argv、退出码、耗时、stderr、是否截断）
- **底部状态栏**：**只在忙碌时出现**，显示当前阶段（读取仓库 / 暂存中 / 提交中 / 刷新列表…）——仓库路径在顶部输入框、
  改动数在各分组标题、命令流水在 Console 页、单次操作耗时在完成 toast 里，不再重复显示。
  所有提示（写操作结果、复制反馈、**失败与 git 报错**）统一走右下角**浮动 toast**（绝对定位、不参与流式布局），
  不再有顶部错误横幅；失败的完整命令与 stderr 可在 Console 页回看。

作用范围是**当前会话的工作目录**（`session.cwd`），与 IDEA 的「项目根」同义；切换会话即切换仓库。

### 性能约定（改动前先读）

面板流畅度取决于「客户端→宿主往返次数」与「git 进程创建次数」，两者在 Windows 上都是几十到上百毫秒级：

- **一次刷新只发一次 RPC**：`repo/snapshot` 在 host 侧把 status / log / for-each-ref(本地+远程合并) /
  stash / 版本 / remote 六项并发探测后一次返回（含 Console 流水）。
  旧实现要 6 次往返、约 16 次串行进程创建，单次刷新 1.5–2.5s；现在是 1 次往返、6 次同波进程。
- **缓存**：`git` 可执行文件路径（`resolveExecutable`）、仓库根（`rev-parse --show-toplevel`，按路径）、
  `git --version`、`remote.origin.url` 各只取一次；`init` 会写回仓库根缓存。
- **所有等待都有文案**：顶部 2px 进度条 + 页脚阶段文案（读取仓库 / 暂存中 / 提交中 / 刷新列表…）+
  分区占位（读取差异… / 读取提交详情… / 读取远程仓库…），并在状态栏回显真实往返耗时 `上次操作 N ms`。

## 推送与认证（对齐 IDEA 的做法）

推送不是"配好就一直能推"或"永远推不了"，而是按下面这条链路逐级处理：

1. **直接推**：仓库已配好 remote 就直接 `git push`（当前分支到它的 upstream），或按分支行推指定的
   `git push <remote> <branch>`。
2. **SSL 后端兜底**：若失败原因是 `schannel` 拿不到凭据上下文（`SEC_E_NO_CREDENTIALS` 一类），
   自动换 `-c http.sslBackend=openssl` **重试一次**（第一次失败不会改动远端，重试是安全的），
   成功后 Console 里能看到这一次用了 openssl。也可用请求参数 `sslBackend` 固定后端。
3. **缺认证信息**：失败被归类为 `git-vcs/auth-required` 时，面板弹出**认证表单**（分支页顶部一行：
   用户名 + 密码/Token + 「保存并推送」）。提交走 `credential/approve`：
   - 用 `git credential approve` 把凭据交给**你机器上的凭据助手**保存（`store` → `~/.git-credentials`，
     或 `manager` → Windows 凭据管理器），**存成主机级**（`https://user:token@github.com`），
     所以同一主机下的仓库以后都不用再填；保存后用 `git credential fill` 回读校验，因为 `approve`
     即使没人接收也返回 0；
   - 密码只走 **stdin**，不进 argv；凭据类命令在 Console 流水里 argv 会脱敏、输出显示为"已隐藏"；
   - 若助手不可用（例如受限环境里 msys `sh` 起不来），结果里 `stored: false`，此时凭据记在**本进程内存**中，
     本次会话内的推送会用内嵌 URL 的兜底方式完成（同样脱敏）。
4. **其余失败**：网络不通、被拒（`push-rejected`）、无权限等**原样报错**（右下角 toast + Console 页可回看原文），
   插件不猜、不重试。

**添加远程时就能认证**：Remotes 页的 Add Remote 多了可选的「用户名 / 密码·Token」，填了会在
`remote/add` 之后顺手存进凭据助手（保存失败也只警告，不影响远程已加好的事实）。

**SSH 远程不做认证**：`git@host:owner/repo.git` 走密钥/agent，插件不参与；失败按第 4 条报错。

> `allowPush` 默认就是 `true`（与 IDEA 一致：配好 remote 就能直接推）。不想让插件碰远端时，
> 在 `cordis.patch.yml` 里置 `false`，Push / 推送按钮会置灰并说明原因。
> 沙箱环境里凭据助手可能起不来（`sh.exe: couldn't create signal pipe`），此时第 3 条的会话内存兜底就是主要通路。

## 配置

插件行的 `config`（见 `cordis.patch.yml`，改后触发热替换）：

| 字段 | 默认 | 说明 |
|------|------|------|
| `allowWrite` | `true` | 关闭后所有写操作（暂存/提交/分支/贮藏…）直接报 `git-vcs/write-disabled` |
| `allowPush` | `true` | 是否允许 push；置 `false` 时按钮禁用并提示 |
| `allowDangerous` | `true` | 是否允许 reset / revert / cherry-pick / 删分支 / 回滚文件 |
| `gitPath` | `''` | git 可执行文件绝对路径，空 = 从 PATH 解析 |
| `repoRoot` | `''` | 限定可操作的仓库根；空 = 允许任意会话工作目录 |
| `diffContextLines` | `3` | 统一 diff 上下文行数 |
| `maxOutputBytes` | `2097152` | 单条命令输出内存上限（超出保留尾部并标记截断） |
| `timeoutMs` | `120000` | 单条命令超时 |
| `autoRefreshSeconds` | `0` | 面板自动刷新间隔，0 = 关闭 |
| `consoleLimit` | `200` | 命令流水保留条数 |

> 本插件刻意**零运行时依赖**：host 半区不 import 任何 `@deepseek-ai/*` 值，`subprocess` / `connection`
> 都用 `ctx.get()` 软依赖（缺席时记日志降级，不让插件停在 pending）；因此配置没有走 Schemastery
> `Config` schema，而是在代码内 `normalizeConfig()` 合并默认值并做范围钳制。

## 安全边界

- git 一律以 **argv 形式**执行（`ctx.subprocess.spawn`，不经 shell），路径统一放在 `--` 之后，无注入面。
- `cwd` 必须是绝对路径、存在且是目录；默认还要求它是 git 工作树（`rev-parse --show-toplevel`）；
  配置 `repoRoot` 后限定在其之下。
- 执行环境禁用交互提示（`GIT_TERMINAL_PROMPT=0` / `GIT_ASKPASS=echo`），避免凭据提示挂起。
- 破坏性操作在 UI 内需二次确认（内联确认条），并有 `allowDangerous` / `allowPush` / `allowWrite` 三级开关。
- RPC 走的 `ctx.connection` 通道自带 loopback + 签名 cookie 认证与 Host/Origin 校验。

## 已知限制（v1）

- 历史只列当前分支（`--all` 需手工改调用）；提交树列是**单轨**图形（一条线 + 节点），
  不是多分支 lane 的彩色提交图——分支信息通过**节点右侧的分支标签**表达。
- 差异视图是统一 diff 文本，没有并排 diff、没有按 hunk/行勾选提交（Partial Commit）。
- Remotes 页增删远程后不会自动 fetch：track 关系已写进 `.git/config`，是否抓取由用户在工具栏点 Fetch。
- 没有 changelist 分组、没有 Shelf、没有多 VCS root、没有编辑器 gutter 标记（DSH 无编辑器面板可挂）。
- 没有文件系统监听：自动刷新依赖 `autoRefreshSeconds` 或手动刷新。
- 状态只在内存：刷新页面即重置（与官方右侧栏一致）。

## 卸载

```powershell
dsh plugin --profile web remove dsh-git-vcs
```

## 动态热加载验证版（临时，不落盘）

在插件尚未装进 profile（跨盘符坏 junction）时，用 DSH 的动态 Cordis 插件机制做**真机预览**：

- 动态插件 `gitvcs-3`：
  - `pkg-1` → `pkg-7`：把 host / client 语义**逐份手抄**成动态包（每次改 UI 都要重抄一遍，成本高且容易与源码漂移）。
  - `pkg-8` 起改为**装载器**：动态包本身只有几十行，`git-vcs-boot` 时从磁盘读 `index.js`，
    去掉 ESM 语法、把 `ctx.connection.rpc.handle('/git-vcs', …)` 接到 `harness.handle`，
    再用 `new Function` 编译执行；`git-vcs-source` 把 `lib/client.js` 原文交给浏览器，
    浏览器侧用临时替换的 `globalThis.__ModuleLoader__` 垫片捕获闭包工厂再运行。
    **预览从此恒等于当前源码**，改完只要 `cordis_run mode:"run"` 重启即加载最新代码。
  - `pkg-9`：补上 vm 沙箱缺失的全局——沙箱上下文只有 ECMAScript 内建，**没有 `AbortSignal`**，
    真实代码的 `AbortSignal.timeout/any` 会 `ReferenceError`，导致每个端点都回 `git-vcs/internal`；
    现在用鸭子类型信号（`aborted` / `addEventListener` / `removeEventListener`，超时走 `ctx.timeout`）顶替。
- 与正式版的差异：配置用默认值（`allowPush=false`），RPC 走包内 `harness.handle` / `host.call`
  （正式版走 `ctx.connection.rpc`），客户端 ctx 声明里去掉 `connection`；`dsh` 进程重启即消失。
- 结论口径：动态版能验证 UI 与端点语义，**不能**验证 `dsh.client` 半区的闭包工厂产物格式——
  那一步仍必须走上面的 junction 修法 + `dsh plugin --profile web install`。

离线自检（不需要真机）：`node scripts/preview-check.mjs` 会在与动态沙箱同构的 `node:vm`
上下文里装载真实 host 半区，并按 host-runner 的 cloneJson 规则校验每个端点的信封是否无损 JSON。

其余自检脚本：

- `node scripts/verify-host.mjs [仓库]`：宿主域内跑只读端点 + 错误码门禁 + 临时仓库写操作（43 条断言）。
- `node scripts/status-probe.mjs [仓库]`：用插件自己的 `status` / `diff` 读当前工作区，
  逐条打印 index/worktree 标记与三种 diff 的长度 —— 用于排查「列表说改了、差异却是空」
  （先确认是解析问题还是文件真的没改动）。
- `node scripts/web-rpc-probe.mjs`：在**隔离的 DSH_HOME** 里用完整 web 组合（base + web-app + 本插件）
  起一个临时实例（端口 3199），抓插件的 host 日志，并对 `/git-vcs` 路由做免认证探测：
  路由存在 → 信任栅栏回 401（与 `/api` 对照一致）；路由缺失 → 静态兜底回 405。
  专门用于验证「装进 profile 后 RPC 有没有真的挂上」这类只在真组合里暴露的问题。

## RPC 通道是怎么挂的（以及与官方 API 的取舍）

浏览器侧照旧用 `ctx.connection.rpc.call('/git-vcs', endpoint, payload)`；host 侧**自己注册**一条
`webServer` 的 prefix 路由 `/git-vcs`，线格式与 Connection RPC 一致
（请求 `{type:"client-request",rpcId,method,payload}` → 响应 `{type:"server-response",rpcId,result}`），
并复用 `ctx.connection.requestRejection(req)` 做信任栅栏（Host/Origin + 浏览器会话认证）。

不用官方那两个入口的原因（dsh 0.9.0 实测）：

- `connection.rpc.handle(channel, handler)`：它把路由注册到 **connection 服务自己 ctx** 的 `webServer` 上，
  而 web-app 的 `connection` 行只 `inject: [webRuntime]`，任何第三方调用都会
  `cannot get property "webServer" without inject`，**整棵插件树加载失败**（不只是本插件的问题）。
- `connection.rpc.intercept('/api', …)`：官方推荐的共享通道，但是**单占位**——
  api-gateway 已经占了，再注册会抛 `already has an interceptor`。

host 行的 `inject` 必须是真实存在的三个服务：`subprocess`（跑 git）、`connection`（信任栅栏）、
`webServer`（注册路由）。早期用 `inject: []` + 一次性 `ctx.get()` 会在提供方就绪前激活，
日志表现为 `host 半区激活：subprocess=缺席 connection=缺席` → 通道没挂上 → 浏览器侧 405。
