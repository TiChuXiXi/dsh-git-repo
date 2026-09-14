# 任务进度：task-001 DSH Git 版本管理插件

## 当前状态

- **状态**: 实现完成，待安装验证（代码已提交，未进 profile）
- **最后操作日期**: 2026-09-14

## 任务清单

- [x] 调研 DSH 侧入口机制（`sidebar.panellist` + `main` vs `sidebarRightTabs` + `sidebar.right.pane.tab`）
- [x] 调研 IDEA 版本管理工具功能面与 UI 结构
- [x] 调研 host↔client 通信与 git 执行落点（`ctx.connection.rpc` / `ctx.subprocess`）
- [x] 与用户确认 5 项边界（入口形态、包名 `dsh-git-vcs`、读写范围、不注册模型工具、零构建）
- [x] 写 host 半区 `index.js`（21 个端点 + 三级写操作门禁）
- [x] 写浏览器半区 `lib/client.js`（右侧栏 tab 类型 + IDEA 风格 UI）
- [x] 静态校验 + 隔离冒烟启动通过
- [ ] 跨盘符安装（junction 修法，待用户执行 README 命令）
- [ ] 真机 UI 验证（重启 `dsh web` → 刷新 → 引导页胶囊 / 面板 / 分栏 / 全屏 / 浮窗）
- [ ] 运行 `scripts/verify-host.mjs`（用户要求先不急着验证）

## 验证记录

- `node --check index.js` / `lib/client.js` / `scripts/verify-host.mjs`：全部通过
- `validate-plugin.mjs`：**0 ERROR / 0 WARN**
- `smoke-boot.mjs`（隔离 DSH_HOME）：**通过** —— 组合层 `# == dsh-git-vcs` 出现、启动无报错、`apply()` 打印了生效配置（顺带证明不导出 Schemastery `Config` 时 patch 行的 config 仍会透传）
- `dsh --profile web --dump-config`：**未见本插件层**（跨盘符坏 junction → 未进 `dsh.profile.bundles`；本次未能重跑 dump-config，因 profile 写入被拒）
- 真机实测：未做

## 本次会话摘要

### 2026-09-14

- **完成**：
  - 调研并核实了三处真源——侧边栏面板行来自 `sidebar.panellist` 注册项、`selectPanel` 要求 `main` 有同 id 注册、官方「工作区文件」用的是右侧栏 tab 类型两阶段注册；host↔client 走 `ctx.connection.rpc.handle/call`；git 用 `ctx.subprocess` argv 形式。
  - 按用户要求改为与「工作区文件」完全一致的机制，写出 `package.json` / `cordis.patch.yml` / `index.js` / `lib/client.js` / `README.md` / `scripts/verify-host.mjs`。
  - 通过静态校验与隔离冒烟启动；提交 `e964185 feat: 新增 dsh-git-vcs 插件（右侧栏 Git 版本管理页）`。
- **未完成 / 阻断**：
  - 真实 profile 安装失败（跨盘符 `link:` 生成坏 junction → dsh 判定 `declares no dsh.bundle`）；profile 里留有 `"dsh-git-vcs": "link:D:/zxh/code/git-plugin"` 与坏链接，需按 README 清理。
  - `~/.dsh/profiles/web` 写入需提权，一次 `danger-full-access` 提权被用户拒绝 → 后续安装命令交由用户执行。
- **修改的关键文件**：`package.json`、`cordis.patch.yml`、`index.js`、`lib/client.js`、`README.md`、`scripts/verify-host.mjs`、`.gitignore`、`.opencode/**`、`LESSONS.md`
- **Git commit**：
  - `e964185` feat: 新增 dsh-git-vcs 插件（右侧栏 Git 版本管理页）
  - 记忆/文档归档：见下一次提交 `chore: 归档 task-001 …`
