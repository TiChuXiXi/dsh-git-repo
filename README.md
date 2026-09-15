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
- **Tab**：Local Changes / Log / Console / Branches / Remotes / Stash
- **Local Changes**：按「冲突 / 已暂存 / 已修改 / 未跟踪」分组，行内状态字母（蓝=修改、绿=新增、
  灰=删除、红=冲突），选中行后可暂存 / 取消暂存 / 回滚；**差异默认不显示**，点文件才在右侧展开，右上角 `×` 关闭
- **提交区**：提交信息、Amend（`allowDangerous` 控制）、Commit（提交已暂存文件；`allowWrite` 关闭时禁用）
- **Log**（列顺序对齐 IDEA：**时间 · 提交树 · Message · Author · Commit**）：
  - **提交树列**：本行正中的圆点 + 贯穿整行的连线（圆点内部不画线，上下两段正好接到圆环外沿，
    相邻行的段各越界 1px 重叠 —— 连线是**不透明**浅色，重叠不会变深，但能消除行高含小数时的接缝），行间无分割线。
    圆点用 **SVG 真圆**（直径 10px、圆环 2px；CSS 小圆环在非整数行高下会被栅格化出棱角），
    **HEAD 提交实心**（填充该分支深色）、其余空心。
    圆环用该分支色系的**深色**、连线用同色系**浅色**，**每条分支一个颜色**（8 色调色板按分支名排序取模，跨渲染稳定；
    提交没有标签时从子提交沿父提交继承颜色）。
    节点右侧标出**所有指向该提交的分支标签**（同色系描边 + 淡底，本地实线 / 远程虚线，当前 HEAD 分支加粗，
    `origin/HEAD` 符号引用跳过），一眼看出每个分支停在哪次提交。
    该列宽度按标签内容**自适应**（64–300px）且**不可拖动**。
  - **Commit 列**：显示短哈希，**直接点击短哈希即复制完整提交 ID**（无独立按钮），
    复制结果走**右下角浮动提示条**（绝对定位、不参与流式布局，因此出现/消失不会顶动高度造成抖动；2 秒后自动消失，
    失败为红底）；提交详情里的完整哈希同样可点。
  - **列宽**：时间 / Message / Author / Commit 四列表头右侧有拖动手柄（`col-resize`，pointer capture，
    不依赖 window 监听），拖动范围各自钳制（92–360 / 120–900 / 60–280 / 64–220px）；
    Message 列默认吃掉剩余宽度，被拖动后改为固定宽度，总宽超出面板即横向滚动。
  - **提交详情默认不显示**，点条目才展开，详情内含 Revert / Cherry-Pick / Reset --soft / Reset --hard、
    **「新分支名」→ 基于该提交建分支（不切换）**、变更文件与 patch，右上角 `×` 关闭。
- **Branches**：本地 / 远程分支（当前分支高亮），切换、合并、删除，以及「新建并切换」
- **Remotes**：`git remote -v` 的全部远程与 fetch / push 地址；顶部表单可填**名字 + URL（+ 可选 push URL）→ Add Remote**，
  每个远程行有 **Remove** 危险按钮（点击走内联二次确认）。均受 `allowWrite` 门禁控制。
- **Stash**：stash 列表与 push / pop / apply / drop
- **Console**：面板发起的每条 git 命令（argv、退出码、耗时、stderr、是否截断）
- **底部状态栏**：仓库根、当前远程、改动数、上次操作耗时、命令条数；忙碌时显示进度条与阶段文案

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

## 配置

插件行的 `config`（见 `cordis.patch.yml`，改后触发热替换）：

| 字段 | 默认 | 说明 |
|------|------|------|
| `allowWrite` | `true` | 关闭后所有写操作（暂存/提交/分支/贮藏…）直接报 `git-vcs/write-disabled` |
| `allowPush` | **`false`** | 是否允许 push；关闭时按钮禁用并提示 |
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

离线自检（不需要真机）：`node .opencode/preview-check.mjs` 会在与动态沙箱同构的 `node:vm`
上下文里装载真实 host 半区，并按 host-runner 的 cloneJson 规则校验每个端点的信封是否无损 JSON。
