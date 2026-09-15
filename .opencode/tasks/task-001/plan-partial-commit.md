# 第二部分方案：文件级三态勾选 + hunk 级部分提交

> 目标：提交勾选框支持 **不选中 / 部分选中 / 选中** 三态；点开某个改动后，能在差异面板里**逐 hunk 勾选**要提交的改动；
> 文件内 hunk 全选 → 该文件为「选中」，选一部分 → 「部分选中」，提交时只提交该文件被选中的那部分改动。
>
> 状态：**待用户确认后实施**（本文只做方案，不动代码）。

## 1. 核心难点先说清楚：为什么不能继续用现在的提交方式

当前实现是 `git commit -m <msg> -- <path>...`（pathspec 提交）。git 对 pathspec 的语义是
「把这些路径的**工作区内容**临时 stage 后提交」——**整文件粒度**，无法表达"这个文件只提交前两个 hunk"。

所以第二部分必须换模型。两条路线：

| | 路线 A：**提交 = 提交索引**（推荐，git 原生语义） | 路线 B：临时索引（`GIT_INDEX_FILE`） |
|---|---|---|
| 勾选的含义 | 勾选 = **暂存**这些改动（文件/hunk）；取消勾选 = 从索引里撤掉 | 勾选 = 这次提交要包含的改动 |
| 部分 hunk | `git apply --cached <只含选中 hunk 的 patch>` 直接落到真实索引，天然支持 | 用临时索引拼出提交树，再回写真实索引 |
| 提交命令 | `git commit -m <msg>`（不提 pathspec） | `GIT_INDEX_FILE=<tmp> git commit -m <msg>` + `git read-tree HEAD` + 回写 |
| 风险 | 与用户"另一个文件之前已暂存"的既有状态**叠加**：提交会带上此前已暂存的内容 | 索引记账复杂（提交后要把临时索引的差异反映回真实索引），出错会丢用户的暂存状态 |
| 用户心智 | 就是 git 的 stage → commit；IDEA / VS Code / magit 的默认行为 | 少见，容易出诡异状态 |

**结论：走路线 A**。同时把 UI 的语义讲清楚（勾选 = 暂存），并且让"提交全部改动"这条最常用路径保持一步到位：
勾选的文件如果有工作区改动，先 `git add <path>` 再提交。

> 需要用户确认的一点：路线 A 下，**此前已经手动暂存、但没有勾选的文件，仍会被提交带进去**（因为提交提交的是索引）。
> 规避办法有两种，二选一：
> - **A1（推荐）**：勾选框 = 暂存框并**双向同步**——进入面板时按索引现状初始化勾选（已暂存的默认勾上），
>   取消勾选会把该文件从索引里撤掉（`git restore --staged` 或 `git apply --cached --reverse`）。
>   这样"勾选集合"与"索引内容"始终一致，Commit 永远等于提交勾选的东西。
> - **A2**：不双向同步，Commit 前把未勾选但已暂存的文件反向 `unstage` 到临时状态，提交后再恢复（复杂，不推荐）。

## 2. 数据模型（客户端）

```
hunk 级选择（唯一真源）
  hunkSelection: Map<`${path}|${staged?'index':'worktree'}|${hunkId}`, boolean>

派生（不额外存状态，避免不一致）
  文件三态 = 已选 hunk 数 / 该文件可提交 hunk 总数
    0            → 不选中
    1..total-1   → 部分选中（盒子里画一条横线）
    total        → 选中
  文件级点击（含 indeterminate）→ 该文件全部 hunk 置 true / 全部置 false
```

- `hunkId`：`oldStart,oldCount,newStart,newCount` + 该 hunk 首行内容的短哈希（防"同一个文件两次不同 diff 的同一编号"错配）。
- 无 hunk 概念的改动（二进制文件、纯 mode 变更、纯重命名）→ 视为 **单 hunk**，只能整文件勾选。
- 冲突文件不参与（与第一部分一致）。

## 3. 交互设计

1. **行内勾选框**（Local Changes 每行）：三态。
   - 空心 = 不选中；✓ = 全部选中；横线 = 部分选中（hover 提示"部分选中：3/7 个改动块"）。
   - 点击：不选中 / 部分选中 → 全选；选中 → 全不选。
2. **差异面板（右侧）**：勾选某文件后，把该文件 patch 切成 hunk 块渲染，每个 hunk 头部左侧一个勾选框 + `@@ -a,b +c,d @@` 摘要。
   - hunk 勾选变化 → 立即刷新行内三态。
   - 面板顶部加一行小工具条：「本文件全选 / 全不选」+ 「本次选中 N/M 个改动块」。
   - 未勾选（部分选中之外）的 hunk 视觉弱化（透明度 0.5），一眼看出哪些不会被提交。
3. **提交按钮**：`勾选集合为空` 时置灰（第一部分已做），标题提示"没有勾选任何文件/改动块"。
4. **提交信息区**：把第一部分的「已选 x/y 个文件」升级成「已选 x/y 个文件（其中 z 个部分选中）」。
5. 未跟踪文件（新文件）：patch 里只有一个 hunk（整文件新增）→ 只有全选/全不选两态。

## 4. host 侧要实现什么

新增一个端点，把"选中的 hunk 落到索引"这件事做成一个原子操作：

```
POST stage/hunks
  { cwd, path, staged: boolean, patchHash: string, hunks: number[] }   // hunks = 选中的 hunk 下标
  → { applied: number, path, staged }
  → 失败：git-vcs/stale-diff（文件自上次 diff 后变了）/ git-vcs/bad-request / git-vcs/git-failed
```

实现步骤（host 内，全部用现有 `runGit`）：

1. 复算该文件的 patch：`staged ? git diff --cached -U<n> -- <path> : git diff -U<n> -- <path>`（未跟踪走 `--no-index /dev/null <path>`）。
2. **一致性校验**：对 patch 文本取哈希与请求里的 `patchHash` 比对；不一致直接回 `git-vcs/stale-diff`，
   让客户端提示"文件已变化，请刷新后重选"（这一步是必须的，否则 hunk 下标会错位提交错内容）。
3. 拆分 patch：文件头（`diff --git` / `index` / `---` / `+++` / mode 行）+ 每个 `@@ … @@` 块。
4. 按选中下标重组：文件头 + 选中 hunk（hunk 头原样保留；**同一文件多个 hunk 的 `@@` 起始行号不需要重算**，
   `git apply` 会自行做偏移匹配——VS Code / magit 都是这么做的；唯一要重算的是"只有部分 hunk 时 `index` 行"可省略）。
5. 应用：
   - 未暂存文件提交部分 hunk：`git apply --cached --whitespace=nowarn -`（patch 走 stdin；若 subprocess 不方便给 stdin，
     则写入临时文件后 `git apply --cached <tmpfile>`，跑完删除）。
   - 已暂存文件取消部分 hunk：`git apply --cached --reverse --whitespace=nowarn`。
6. 边界：
   - 文件被完全取消 → `git restore --staged -- <path>`（等价于把所有 hunk 反向应用，用 restore 更省事）。
   - 二进制 / mode-only / rename-only → host 直接拒绝 hunk 级操作（回 `git-vcs/bad-request` + "该文件只能整文件提交"），客户端据此只显示整文件勾选框。
   - 未跟踪文件 → `git apply --cached` 新增即可（patch 带 `new file mode` 与 `--- /dev/null`）。
7. 复用现有的 `requireWrite()` 门禁与 `runGit` 的 argv 形式；**落盘 patch 用临时目录**（`fs.mkdtemp`），
   或给 `subprocess.spawn` 加 `stdin: { text }`（需先确认 `ctx.subprocess` 是否支持写 stdin；不支持就走临时文件）。

配套小端点（可选、也可由客户端拼现有端点）：
- `stage/paths`：批量 `git add` / `git restore --staged`（用于整文件勾选的双向同步，A1 方案必需）。

## 5. 客户端要实现什么

1. `parseHunks(patch)`：把统一 diff 切成 `[{ id, header, lines, oldStart, oldCount, newStart, newCount }]`，
   并计算 `patchHash`（`djb2`/`fnv1a` 字符串哈希，零依赖）。
2. 三态状态与派生逻辑（§2）。
3. 差异面板：hunk 列表 + 每块勾选框；复用现有 `DiffView` 的行着色，把 hunk 块包一层（含头部勾选框）。
4. 提交前流程：
   - 对**完全选中**的文件：若工作区有改动 → `git add`（或直接靠 `commit -- path`）；
   - 对**部分选中**的文件：先 `stage/hunks`（可能需要多次：未暂存 hunk 用正向、已暂存 hunk 取消用反向）；
   - 然后 `git commit -m <msg>`（不提 pathspec，因为索引已经是最终内容）。
     注意：若仍有"未勾选但已暂存"的文件，按 A1 方案在初始化时就已经取消勾选并撤出索引，所以这里不会误带。
5. `git-vcs/stale-diff` 的处理：toast 提示 + 自动 `Refresh` + 清空该文件的选择。

## 6. 分阶段实施建议（每步都能独立验证）

| 阶段 | 内容 | 产出/验收 |
|---|---|---|
| P1 | host `stage/hunks` + `stage/paths`，纯 argv 实现，配 `verify-host.mjs` 断言 | 临时仓库里造一个多 hunk 文件，只 stage 第 2 个 hunk，`git diff --cached` 只含它；非法 hunk 下标 / 过期 patchHash 都被拒 |
| P2 | 客户端 `parseHunks` + 差异面板 hunk 勾选（先不接提交） | 面板里逐块勾选，行内三态随之变化（纯 UI） |
| P3 | 接通提交：部分选中文件的 stage + `git commit`（不提 pathspec）；A1 的双向同步 | 端到端：一个文件改两处，只勾第二处提交，`git show` 确认只含第二处 |
| P4 | 边界与体验：二进制/重命名/mode-only、stale-diff 自动刷新、未跟踪新文件、全选/全不选、提交信息区统计 | 各边界有明确提示且不产生错误提交 |

工作量估计：P1 ≈ 150 行（host + 断言）、P2 ≈ 120 行（客户端）、P3 ≈ 100 行、P4 ≈ 80 行；
主要风险集中在 **P3 的索引记账**（已暂存 ↔ 未暂存混合）与 **stale-diff**，这两处建议先写断言再用 UI 验。

## 7. 需要你拍板的三件事

1. **提交模型**：确认走路线 A（勾选 = 暂存，`git commit` 提交索引）还是坚持现在的 pathspec 语义（那样部分提交做不了）。
2. **A1 还是 A2**：勾选与索引双向同步（A1，推荐）还是保留"已暂存的照样提交"（A2 变体：勾选只对未暂存生效）。
3. **粒度**：先做 **hunk 级**（推荐，够用且风险低），还是一步到位到**行级**（行级需要拆分 hunk 并重算行数，风险与工作量都明显更高）。
