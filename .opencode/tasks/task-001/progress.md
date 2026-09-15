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
