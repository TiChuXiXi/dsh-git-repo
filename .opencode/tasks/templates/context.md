# 任务上下文模板

> 新会话时 Agent 优先读本文件，了解任务全貌后直接开始工作。

## 基本信息

- **任务ID**: [task-xxx]
- **任务名称**: [一句话描述]
- **关联模块**: [如 host 半区工具注册 / 插件清单 / 浏览器半区 UI]
- **关联分支**: [分支名，未 git init 前填 -]
- **创建日期**: [YYYY-MM-DD]

## 涉及的关键文件和代码路径

### 插件清单与组合
- package.json（`dsh.bundle.patch` / `dsh.client` / `dsh.engines`）:
- cordis.patch.yml（插件行 id / name / config）:

### host 半区
- 入口（`export name / inject / apply`）:
- 注册的工具（`ctx.tools.register(defineTool(...))`）:
- 配置 schema（Schemastery `Config`）:
- 事件订阅 / 服务依赖（`ctx.on` / `ctx.get`）:

### 浏览器半区（可选）
- 产物入口（`exports["./client"]` → `lib/client.js`）:
- 挂载的 Slot（名称 / 协议 single|list|keyed|chain）:
- Host↔Client RPC（`harness.handle` / `host.call`）:

## 核心逻辑摘要

<!-- 3-5 句话概括关键调用链：能力如何从 apply() 注册到生效 -->

## 已知坑点/注意事项

1. 装了 bundle 就不要再手写 `insert`（会 `duplicate loader entry id`）。
2. 新工具/新插件只对**新建会话**生效；bundle 层改动必须重启 `dsh web`。
3. patch 的 `config` 是整值替换，覆盖行需重述全部键。

## 技术决策记录

| 日期 | 决策 | 原因 |
|------|------|------|
