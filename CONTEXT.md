# git-plugin 上下文

> 本项目是**纯技术项目**（DSH cordis 插件包），故本节描述技术概念与模块关系，而非业务领域语言。
> 框架层术语取自 `dsh-plugin-creator` 技能的本机事实与官方文档；标注 ⚠️ 的条目为**待用户确认**的项目特定内容。

## 领域语言

**DSH（DeepSeek Harness）**：本项目插件所运行/挂载的宿主程序（本机 0.1.5-rc.1）。_避免_：说成"框架"以外的泛指"平台/系统"。

**插件包（bundle package）**：`package.json` 中声明了 `dsh.bundle.patch` 的 npm 包，被 `dsh plugin add` 安装进 profile 后自动成为组合中的一层。_避免_：把仅有普通依赖关系的包也叫"插件"（无 `dsh.bundle` 声明则永不激活）。

**host 半区**：插件在 DSH host 进程内运行的部分，由 `cordis.patch.yml` 的 loader 行按**包名**加载，入口导出 `apply(ctx, config)`。

**浏览器半区（client half）**：插件在 Web GUI 浏览器内运行的部分，由 `package.json` 的 `dsh.client` + `exports["./client"]` 声明，产物走 `/plugins/<pkg>/client.js` 注入，用 `window.__ModuleLoader__` 加载。_避免_：把浏览器半区产物当成普通 ESM（它是闭包工厂格式）。

**Cordis**：DSH 的插件运行时与依赖注入容器（`@deepseek-ai/cordis`）。插件通过 `ctx` 访问服务、注册事件与副作用。

**apply(ctx, config)**：插件的唯一入口函数，所有副作用（注册工具、订阅事件、挂载 UI）只能写在这里。模块加载 ≠ 插件激活。

**扩展点（extension point）**：插件可挂钩的位置，本项目涉及 `tools`（模型可调用工具）、`events`（生命周期事件）、`systemPrompt`（系统提示词段）、`settings`、`slots`（浏览器半区 UI 槽位）。

**Tool**：注册给模型调用的工具，参数与返回值必须是 JSON 兼容数据，`description` 需写清调用场景与边界。

**Slot**：浏览器半区的 UI 挂载点，有 `single` / `list` / `keyed` / `chain` 四种协议；应选最窄且够用的入口。

**profile**：`~/.dsh/profiles/<name>` 下的一组组合配置（本项目验证用 `web`）。**bundle 与 profile 是两种东西**，没有任何包同时是两者。

**patch**：YAML 形式的补丁数组（`insert` / 覆盖已有行），用于把插件行插入组合。其 `config` 是**整值替换**，不是深合并。

**overlay**：`dsh web --patch <file>` 传入的临时 patch，路径必须**绝对**，且不参与 live watch（改了要重启）。

**服务注入**：硬依赖写在插件导出的 `inject` 数组（未就绪则 pending）；软依赖用 `ctx.get('x')` + 判空。

## 关系

- 一个**插件包**包含 1 个 host 半区，以及 0 或 1 个浏览器半区。
- 一个**插件包**通过 `cordis.patch.yml` 贡献 1 个或多个**组合层**；装了 bundle 就不要再手写 `insert`（会 `duplicate loader entry id`）。
- 一个 **Tool** 由 host 半区在 `apply()` 中注册，只对**新建会话**生效（preset 在会话创建时锁定）。
- 一个 **Slot** 由浏览器半区通过 `slots.register` 注册，其可见性依赖 `dsh.client.inject` 声明的模块图依赖。
- **配置**由 Schemastery `Config` schema 定义并填默认值；改配置会触发插件热替换。
- **host 与浏览器半区**是两个进程，只通过 RPC（`harness.handle` / `host.call`）交换 JSON 无损数据。

## 已解决的模糊点

<!-- 格式：原设计/表述 → 明确后设计。以下两条待用户确认后填充或删除 -->

- ⚠️ 项目目录名 `git-plugin` → 插件包名（须 kebab-case，如 `dsh-git-repo`）**待定**。
- ⚠️ "git 仓库管理"的能力边界（只读查询如 status/log/diff？还是含 commit/branch/push 等写操作？是否需 Web GUI 面板？作用于哪个 profile？）**待用户明确**。
