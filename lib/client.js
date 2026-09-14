window.__ModuleLoader__.load({
  id: 'dsh-git-vcs',
  factory: (require) => {
    /**
     * dsh-git-vcs —— 浏览器半区（跑在 dsh web 页面里）。
     *
     * 形态与官方「工作区文件」(dsh-client-ui-sidebar-files) 完全相同：注册一个**右侧栏 tab 类型**
     *   · 阶段一  ctx.sidebarRightTabs.register({ id, kind, title, guide })   ← 类型 + 引导页入口
     *   · 阶段二  slots.register({ name: 'sidebar.right.pane.tab', key: id })  ← 正文
     * 分栏 / 全屏 / 拖出浮窗由 dsh-client-ui-sidebar-right + dockkit 提供，本包不做任何布局工作。
     *
     * 运行时约束：只 require 平台模块表里的 specifier（这里只用 react）；产物是闭包工厂。
     * 组件收不到 ctx：host 调用经注册项 inject 工厂闭包捕获后注入。
     */
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useCallback, useRef } = React

    /** host 侧 RPC 通道（index.js 里 ctx.connection.rpc.handle 的同一个名字）。 */
    const CHANNEL = '/git-vcs'
    /** 包名：同时是 tab 类型的 id（正文注册用同一个 key）。 */
    const PKG_ID = 'dsh-git-vcs'
    /** tab 类型判别符（引导页胶囊打开的就是它）。 */
    const KIND = 'git-vcs'

    /* ------------------------------------------------------------------ 样式 */

    const BORDER = '1px solid rgba(128,128,128,0.22)'
    const MUTED = 'rgba(128,128,128,0.95)'
    const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

    const S = {
      root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, fontSize: '12px', lineHeight: 1.5 },
      toolbar: { display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 8px', borderBottom: BORDER, flexWrap: 'wrap' },
      spacer: { flex: 1 },
      button: {
        font: 'inherit', fontSize: '12px', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer',
        border: BORDER, background: 'transparent', color: 'inherit',
      },
      buttonPrimary: {
        font: 'inherit', fontSize: '12px', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer',
        border: '1px solid rgba(59,130,246,0.55)', background: 'rgba(59,130,246,0.14)', color: 'inherit',
      },
      buttonDanger: {
        font: 'inherit', fontSize: '12px', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer',
        border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.12)', color: 'inherit',
      },
      branchChip: {
        font: 'inherit', fontSize: '12px', padding: '2px 8px', borderRadius: '999px', cursor: 'pointer',
        border: BORDER, background: 'rgba(128,128,128,0.08)', color: 'inherit', display: 'inline-flex', gap: '5px', alignItems: 'center',
      },
      tabs: { display: 'flex', gap: '2px', padding: '4px 6px 0', borderBottom: BORDER, flexWrap: 'wrap' },
      body: { flex: 1, minHeight: 0, overflow: 'auto' },
      columns: { display: 'flex', height: '100%', minHeight: 0 },
      col: { flex: 1, minWidth: 0, overflow: 'auto', borderRight: BORDER },
      colLast: { flex: 1, minWidth: 0, overflow: 'auto' },
      groupHeader: { padding: '4px 8px', color: MUTED, background: 'rgba(128,128,128,0.07)', display: 'flex', gap: '6px', alignItems: 'center' },
      row: { display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 8px', cursor: 'pointer' },
      rowSelected: { display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 8px', cursor: 'pointer', background: 'rgba(59,130,246,0.18)' },
      letter: { width: '12px', textAlign: 'center', fontFamily: MONO, fontWeight: 700 },
      path: { color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      name: { whiteSpace: 'nowrap' },
      hint: { padding: '10px 12px', color: MUTED },
      banner: { padding: '6px 8px', borderBottom: BORDER, background: 'rgba(239,68,68,0.10)', display: 'flex', gap: '8px', alignItems: 'flex-start' },
      bannerText: { flex: 1, minWidth: 0, wordBreak: 'break-word', fontFamily: MONO, fontSize: '11px' },
      commitBox: { borderTop: BORDER, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '5px' },
      textarea: {
        font: 'inherit', fontSize: '12px', width: '100%', minHeight: '52px', resize: 'vertical', boxSizing: 'border-box',
        padding: '4px 6px', borderRadius: '4px', border: BORDER, background: 'rgba(128,128,128,0.06)', color: 'inherit',
      },
      input: {
        font: 'inherit', fontSize: '12px', flex: 1, minWidth: 0, padding: '3px 6px', borderRadius: '4px',
        border: BORDER, background: 'rgba(128,128,128,0.06)', color: 'inherit',
      },
      pre: { margin: 0, fontFamily: MONO, fontSize: '11px', whiteSpace: 'pre', overflowX: 'auto' },
      footer: {
        borderTop: BORDER, padding: '3px 8px', color: MUTED, display: 'flex', gap: '8px', alignItems: 'center',
        fontSize: '11px', flexWrap: 'wrap',
      },
      confirmBar: {
        borderTop: BORDER, padding: '6px 8px', background: 'rgba(239,68,68,0.10)',
        display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap',
      },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
      th: { textAlign: 'left', padding: '4px 8px', color: MUTED, fontWeight: 500, borderBottom: BORDER, position: 'sticky', top: 0, background: 'inherit' },
      td: { padding: '3px 8px', borderBottom: '1px solid rgba(128,128,128,0.12)', verticalAlign: 'top' },
      section: { padding: '6px 8px', borderBottom: BORDER, display: 'flex', flexDirection: 'column', gap: '5px' },
      buttonRow: { display: 'flex', gap: '4px', flexWrap: 'wrap' },
      meta: { color: MUTED, fontFamily: MONO, fontSize: '11px' },
    }

    /* ------------------------------------------------------------------ 图标 */

    /** 引导页胶囊与 tab chip 的图形（分支图形，无外部依赖）。 */
    function GitGlyph({ size = 16, className }) {
      const s = typeof size === 'number' ? size : 16
      return h('svg', {
        width: s, height: s, viewBox: '0 0 16 16', className, 'aria-hidden': 'true',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
        h('circle', { cx: 4.3, cy: 3.3, r: 1.6 }),
        h('circle', { cx: 4.3, cy: 12.7, r: 1.6 }),
        h('circle', { cx: 11.7, cy: 6.5, r: 1.6 }),
        h('path', { d: 'M4.3 4.9v6.2' }),
        h('path', { d: 'M5.9 3.3h2.4a3.4 3.4 0 0 1 3.4 3.2' }),
      )
    }

    /* ------------------------------------------------------------- 小工具函数 */

    const STATE_COLORS = {
      M: '#3b82f6', A: '#22c55e', D: '#9ca3af', R: '#3b82f6', C: '#3b82f6',
      T: '#9ca3af', U: '#ef4444', '?': '#22c55e', '!': '#9ca3af', '.': 'transparent',
    }

    /** 状态字母：untracked=? 冲突=U，否则取暂存区/工作区字母（都变时用两字母，IDEA 同义）。 */
    function statusLetter(entry) {
      if (entry.untracked) return '?'
      if (entry.conflicted) return 'U'
      if (entry.staged && entry.unstaged) return `${entry.index}${entry.worktree}`
      return entry.staged ? entry.index : entry.worktree
    }

    function letterColor(letter) {
      return STATE_COLORS[letter[0]] ?? '#3b82f6'
    }

    /** 路径拆成「目录 + 文件名」，目录淡显（IDEA 的文件行写法）。 */
    function splitPath(path) {
      const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
      return slash < 0 ? ['', path] : [path.slice(0, slash + 1), path.slice(slash + 1)]
    }

    function entryKey(entry) {
      return `${entry.staged ? 'S' : 'W'}:${entry.path}`
    }

    function shortDate(value) {
      if (typeof value !== 'string' || value === '') return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return value
      const pad = (n) => String(n).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function diffLineStyle(line) {
      if (line.startsWith('@@')) return { color: '#569cd6' }
      if (line.startsWith('+')) return { background: 'rgba(34,197,94,0.14)' }
      if (line.startsWith('-')) return { background: 'rgba(239,68,68,0.14)' }
      if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ') ||
        line.startsWith('new file') || line.startsWith('deleted file') || line.startsWith('rename ') || line.startsWith('similarity index')) {
        return { color: MUTED }
      }
      return undefined
    }

    /** 统一 diff 视图（IDEA 的 Diff Viewer 文本形态）。 */
    function DiffPane({ data, onBack, onStageFile, onRollbackFile }) {
      if (data === null || data === undefined) {
        return h('div', { style: S.hint }, '在上方列表里点一个文件查看差异。')
      }
      const lines = String(data.patch ?? '').split('\n')
      const empty = String(data.patch ?? '').trim() === ''
      return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        h('div', { style: S.section },
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } },
            onBack !== undefined ? h('button', { style: S.button, onClick: onBack }, '← 返回列表') : null,
            h('span', { style: { fontFamily: MONO, wordBreak: 'break-all' } }, data.title),
            h('span', { style: S.meta }, data.staged === true ? '已暂存版本 vs HEAD' : '工作区 vs 暂存区'),
            h('span', { style: S.spacer }),
            onStageFile !== undefined ? h('button', { style: S.button, onClick: onStageFile }, '暂存此文件') : null,
            onRollbackFile !== undefined ? h('button', { style: S.buttonDanger, onClick: onRollbackFile }, '回滚此文件') : null,
          ),
        ),
        h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 0' } },
          empty
            ? h('div', { style: S.hint }, '没有差异内容（新文件请先用「暂存」再看，或该文件已与暂存区一致）。')
            : lines.map((line, index) => h('div', {
              key: `l${index}`,
              style: { ...S.pre, padding: '0 8px', ...(diffLineStyle(line) ?? {}) },
            }, line === '' ? '\u00a0' : line)),
        ),
      )
    }

    /* ---------------------------------------------------------------- 组件 */

    function StatusLetter({ entry }) {
      const letter = statusLetter(entry)
      return h('span', { style: { ...S.letter, color: letterColor(letter) }, title: letter }, letter)
    }

    function ChangeRow({ entry, checked, selected, onToggle, onOpen, onDiff, onRollback, onStage, onUnstage }) {
      const [dir, name] = splitPath(entry.path)
      return h('div', {
        style: selected ? S.rowSelected : S.row,
        onClick: onOpen,
        onDoubleClick: onDiff,
        title: entry.path,
      },
        h('input', {
          type: 'checkbox',
          checked,
          onClick: (event) => event.stopPropagation(),
          onChange: () => onToggle(),
        }),
        h(StatusLetter, { entry }),
        h('span', { style: S.path }, dir),
        h('span', { style: S.name }, name),
        h('span', { style: S.spacer }),
        entry.staged
          ? h('button', { style: S.button, onClick: (e) => { e.stopPropagation(); onUnstage() } }, '取消暂存')
          : h('button', { style: S.button, onClick: (e) => { e.stopPropagation(); onStage() } }, '暂存'),
        h('button', { style: S.button, onClick: (e) => { e.stopPropagation(); onRollback() } }, '回滚'),
      )
    }

    function Toolbar({ repo, busy, onRefresh, onFetch, onPull, onPush, onGotoBranches, allowPush }) {
      return h('div', { style: S.toolbar },
        h('button', {
          style: S.branchChip,
          onClick: onGotoBranches,
          title: repo.detached ? '当前处于游离 HEAD' : `当前分支：${repo.branch}`,
        }, h(GitGlyph, { size: 13 }), repo.branch === '' ? '(未知分支)' : repo.branch),
        repo.ahead > 0 ? h('span', { style: S.meta }, `↑${repo.ahead}`) : null,
        repo.behind > 0 ? h('span', { style: S.meta }, `↓${repo.behind}`) : null,
        h('span', { style: S.spacer }),
        h('button', { style: S.button, disabled: busy, onClick: onRefresh, title: '重新读取状态' }, '刷新'),
        h('button', { style: S.button, disabled: busy, onClick: onFetch, title: 'git fetch --prune' }, '抓取'),
        h('button', { style: S.button, disabled: busy, onClick: onPull, title: 'git pull --no-edit' }, '拉取'),
        h('button', {
          style: S.button, disabled: busy || !allowPush, onClick: onPush,
          title: allowPush ? 'git push' : 'push 已被插件配置关闭（allowPush=false）',
        }, '推送'),
      )
    }

    function TabStrip({ tab, onSelect, counts }) {
      const tabs = [
        ['changes', `变更${counts.changes > 0 ? ` (${counts.changes})` : ''}`],
        ['log', '历史'],
        ['branches', '分支'],
        ['stash', `贮藏${counts.stashes > 0 ? ` (${counts.stashes})` : ''}`],
        ['console', '命令'],
      ]
      return h('div', { style: S.tabs },
        tabs.map(([id, label]) => h('button', {
          key: id,
          style: {
            ...S.button,
            borderBottom: 'none',
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
            padding: '3px 10px',
            background: tab === id ? 'rgba(128,128,128,0.16)' : 'transparent',
            fontWeight: tab === id ? 600 : 400,
          },
          onClick: () => onSelect(id),
        }, label)),
      )
    }

    function ChangesTab({ status, unchecked, onToggle, selectedKey, onSelect, onDiff, onRollback, onStage, onUnstage,
      message, setMessage, amend, setAmend, onCommit, onCommitAndPush, busy, allowPush, onStageAll, onUnstageAll, onSelectAll }) {
      const entries = status !== null ? status.entries.filter((entry) => !entry.ignored) : []
      const staged = entries.filter((entry) => entry.staged)
      const unstaged = entries.filter((entry) => !entry.staged)
      const conflicted = entries.filter((entry) => entry.conflicted)
      const rows = (list) => list.map((entry) => h(ChangeRow, {
        key: entryKey(entry),
        entry,
        checked: !unchecked.has(entryKey(entry)),
        selected: selectedKey === entryKey(entry),
        onToggle: () => onToggle(entryKey(entry)),
        onOpen: () => onSelect(entryKey(entry)),
        onDiff: () => onDiff(entry),
        onRollback: () => onRollback(entry),
        onStage: () => onStage(entry),
        onUnstage: () => onUnstage(entry),
      }))

      return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto' } },
          entries.length === 0
            ? h('div', { style: S.hint }, '没有本地变更。')
            : [
              conflicted.length > 0 ? h('div', { key: 'conflict' },
                h('div', { style: S.groupHeader }, `冲突 (${conflicted.length})`),
                rows(conflicted)) : null,
              h('div', { key: 'unstaged' },
                h('div', { style: S.groupHeader },
                  h('span', null, `未暂存 (${unstaged.length})`),
                  h('span', { style: S.spacer }),
                  h('button', { style: S.button, onClick: () => onStageAll(unstaged) }, '全部暂存'),
                ),
                unstaged.length === 0 ? h('div', { style: S.hint }, '（无）') : rows(unstaged)),
              h('div', { key: 'staged' },
                h('div', { style: S.groupHeader },
                  h('span', null, `已暂存 (${staged.length})`),
                  h('span', { style: S.spacer }),
                  h('button', { style: S.button, onClick: () => onUnstageAll(staged) }, '全部取消暂存'),
                ),
                staged.length === 0 ? h('div', { style: S.hint }, '（无）') : rows(staged)),
            ],
        ),
        h('div', { style: S.commitBox },
          h('textarea', {
            style: S.textarea,
            placeholder: '提交信息（Ctrl+Enter 提交）',
            value: message,
            onChange: (event) => setMessage(event.target.value),
            onKeyDown: (event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') onCommit()
            },
          }),
          h('div', { style: S.buttonRow },
            h('label', { style: { display: 'inline-flex', gap: '4px', alignItems: 'center' } },
              h('input', { type: 'checkbox', checked: amend, onChange: (event) => setAmend(event.target.checked) }),
              'Amend（追加到上一次提交）'),
            h('span', { style: S.spacer }),
            h('button', { style: S.button, onClick: onSelectAll }, '全选'),
            h('button', { style: S.buttonPrimary, disabled: busy, onClick: onCommit }, '提交'),
            h('button', {
              style: S.buttonPrimary, disabled: busy || !allowPush, onClick: onCommitAndPush,
              title: allowPush ? '提交后立即 push' : 'push 已被插件配置关闭（allowPush=false）',
            }, '提交并推送'),
          ),
        ),
      )
    }

    function LogTab({ commits, selected, detail, onSelect, busy, onCherryPick, onRevert, onCopy, onReset, allowDangerous }) {
      if (commits === null) return h('div', { style: S.hint }, '读取中…')
      if (commits.length === 0) return h('div', { style: S.hint }, '没有提交记录。')
      return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        h('div', { style: { flex: 1, minHeight: 0, overflow: 'auto' } },
          h('table', { style: S.table },
            h('thead', null, h('tr', null,
              h('th', { style: S.th }, '提交'),
              h('th', { style: S.th }, '作者'),
              h('th', { style: S.th }, '日期'),
              h('th', { style: S.th }, '说明'))),
            h('tbody', null, commits.map((commit) => h('tr', {
              key: commit.hash,
              style: selected === commit.hash ? { background: 'rgba(59,130,246,0.18)', cursor: 'pointer' } : { cursor: 'pointer' },
              onClick: () => onSelect(commit),
            },
              h('td', { style: { ...S.td, fontFamily: MONO, color: '#3b82f6' } }, commit.shortHash),
              h('td', { style: S.td }, commit.author),
              h('td', { style: { ...S.td, whiteSpace: 'nowrap' } }, shortDate(commit.date)),
              h('td', { style: S.td }, commit.subject))))),
        ),
        detail !== null ? h('div', { style: { borderTop: BORDER, flex: '0 0 auto', maxHeight: '55%', overflow: 'auto' } },
          h('div', { style: S.section },
            h('div', { style: { fontFamily: MONO, wordBreak: 'break-all' } }, `${detail.commit !== null ? detail.commit.hash : ''}`),
            detail.commit !== null ? h('div', { style: S.meta }, `${detail.commit.author} <${detail.commit.email}> · ${shortDate(detail.commit.date)}`) : null,
            detail.commit !== null ? h('div', null, detail.commit.subject) : null,
            h('div', { style: S.buttonRow },
              h('button', { style: S.button, disabled: busy, onClick: () => onCopy(detail) }, '复制哈希'),
              h('button', { style: S.button, disabled: busy || !allowDangerous, onClick: () => onCherryPick(detail) }, '拣选'),
              h('button', { style: S.button, disabled: busy || !allowDangerous, onClick: () => onRevert(detail) }, '回滚'),
              h('button', { style: S.button, disabled: busy || !allowDangerous, onClick: () => onReset(detail, 'soft') }, '软重置'),
              h('button', { style: S.button, disabled: busy || !allowDangerous, onClick: () => onReset(detail, 'mixed') }, '混合重置'),
              h('button', { style: { ...S.buttonDanger }, disabled: busy || !allowDangerous, onClick: () => onReset(detail, 'hard') }, '硬重置'),
            ),
          ),
          h('div', { style: S.section },
            h('div', { style: S.meta }, `变更文件 (${detail.files.length})`),
            ...detail.files.map((file, index) => h('div', { key: `f${index}`, style: { fontFamily: MONO, fontSize: '11px' } },
              `${file.status}  ${file.origPath !== null && file.origPath !== undefined ? `${file.origPath} → ` : ''}${file.path}`))),
          h('div', { style: { padding: '4px 8px' } },
            String(detail.patch ?? '').split('\n').map((line, index) => h('div', {
              key: `p${index}`,
              style: { ...S.pre, ...(diffLineStyle(line) ?? {}) },
            }, line === '' ? '\u00a0' : line))),
        ) : null,
      )
    }

    function BranchesTab({ branches, current, busy, newName, setNewName, onCreate, onCheckout, onMerge, onDelete, allowDangerous }) {
      if (branches === null) return h('div', { style: S.hint }, '读取中…')
      const section = (title, list, kind) => h('div', null,
        h('div', { style: S.groupHeader }, `${title} (${list.length})`),
        list.length === 0 ? h('div', { style: S.hint }, '（无）') : list.map((row) => h('div', {
          key: row.ref,
          style: row.name === current ? S.rowSelected : S.row,
        },
          h('span', { style: { fontFamily: MONO, whiteSpace: 'nowrap' } }, row.name === current ? `● ${row.name}` : row.name),
          row.ahead > 0 ? h('span', { style: S.meta }, `↑${row.ahead}`) : null,
          row.behind > 0 ? h('span', { style: S.meta }, `↓${row.behind}`) : null,
          h('span', { style: S.spacer }),
          h('span', { style: { ...S.meta, maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.subject),
          kind === 'local' && row.name !== current ? h('button', { style: S.button, disabled: busy, onClick: () => onCheckout(row.name) }, '切换') : null,
          row.name !== current ? h('button', { style: S.button, disabled: busy, onClick: () => onMerge(row.name) }, '合并') : null,
          kind === 'local' && row.name !== current ? h('button', {
            style: S.buttonDanger, disabled: busy || !allowDangerous, onClick: () => onDelete(row.name),
          }, '删除') : null,
        )))
      return h('div', { style: { height: '100%', overflow: 'auto' } },
        h('div', { style: S.section },
          h('div', { style: S.meta }, '新建分支（从当前 HEAD）'),
          h('div', { style: S.buttonRow },
            h('input', {
              style: S.input, placeholder: '分支名，例如 feature/git-panel', value: newName,
              onChange: (event) => setNewName(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter') onCreate(false) },
            }),
            h('button', { style: S.button, disabled: busy, onClick: () => onCreate(false) }, '新建'),
            h('button', { style: S.buttonPrimary, disabled: busy, onClick: () => onCreate(true) }, '新建并切换'),
          )),
        section('本地分支', branches.local, 'local'),
        section('远程分支', branches.remote, 'remote'),
      )
    }

    function StashTab({ stashes, busy, message, setMessage, onPush, onAction }) {
      return h('div', { style: { height: '100%', overflow: 'auto' } },
        h('div', { style: S.section },
          h('div', { style: S.meta }, '贮藏当前工作区改动（git stash push）'),
          h('div', { style: S.buttonRow },
            h('input', {
              style: S.input, placeholder: '可选：贮藏说明', value: message,
              onChange: (event) => setMessage(event.target.value),
            }),
            h('button', { style: S.buttonPrimary, disabled: busy, onClick: onPush }, '贮藏'),
          )),
        stashes === null
          ? h('div', { style: S.hint }, '读取中…')
          : stashes.length === 0
            ? h('div', { style: S.hint }, '没有贮藏记录。')
            : h('div', null, stashes.map((row) => h('div', { key: row.ref, style: S.row },
              h('span', { style: { fontFamily: MONO, whiteSpace: 'nowrap' } }, row.ref),
              h('span', { style: S.spacer }),
              h('span', { style: { ...S.meta, maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `${shortDate(row.date)} · ${row.subject}`),
              h('button', { style: S.button, disabled: busy, onClick: () => onAction('pop', row.ref) }, '弹出'),
              h('button', { style: S.button, disabled: busy, onClick: () => onAction('apply', row.ref) }, '应用'),
              h('button', { style: S.buttonDanger, disabled: busy, onClick: () => onAction('drop', row.ref) }, '删除'),
            ))),
      )
    }

    function ConsoleTab({ entries, busy, onRefresh, onClear }) {
      return h('div', { style: { height: '100%', overflow: 'auto' } },
        h('div', { style: S.section },
          h('div', { style: S.buttonRow },
            h('button', { style: S.button, disabled: busy, onClick: onRefresh }, '刷新'),
            h('button', { style: S.button, disabled: busy, onClick: onClear }, '清空记录'),
            h('span', { style: S.meta }, '面板发起的每条 git 命令都记录在这里'),
          )),
        entries === null
          ? h('div', { style: S.hint }, '读取中…')
          : entries.length === 0
            ? h('div', { style: S.hint }, '还没有执行过 git 命令。')
            : entries.slice().reverse().map((entry, index) => h('div', { key: `c${index}`, style: { borderBottom: '1px solid rgba(128,128,128,0.12)', padding: '4px 8px' } },
              h('div', { style: { display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' } },
                h('span', {
                  style: { fontFamily: MONO, color: entry.exitCode === 0 ? '#22c55e' : '#ef4444' },
                }, entry.exitCode === 0 ? '✓' : `✗ ${entry.exitCode}`),
                h('span', { style: { fontFamily: MONO, wordBreak: 'break-all' } }, entry.argv.join(' ')),
                h('span', { style: S.meta }, `${entry.durationMs} ms`),
                entry.truncated ? h('span', { style: S.meta }, '（输出被截断）') : null,
              ),
              entry.stdout !== '' ? h('pre', { style: { ...S.pre, marginTop: '3px', color: MUTED } }, entry.stdout.slice(0, 20000)) : null,
              entry.stderr !== '' ? h('pre', { style: { ...S.pre, marginTop: '3px', color: '#ef4444' } }, entry.stderr.slice(0, 20000)) : null,
            )),
      )
    }

    /* ------------------------------------------------------------- 主组件 */

    function GitBody(props) {
      const call = props.call
      const sessionId = props.sessionId
      const sessions = props.useSessions !== undefined ? props.useSessions() : undefined
      const tabInfo = props.useTabInfo !== undefined ? props.useTabInfo() : undefined
      const fullscreen = tabInfo !== undefined && tabInfo.sidebar !== undefined && tabInfo.sidebar.fullscreen === true
      const summary = sessions !== undefined && sessionId !== undefined ? sessions.byId[sessionId] : undefined
      const cwd = summary !== undefined ? summary.cwd : undefined

      const [repo, setRepo] = useState(null)
      const [status, setStatus] = useState(null)
      const [error, setError] = useState(null)
      const [notice, setNotice] = useState(null)
      const [busy, setBusy] = useState(false)
      const [tab, setTab] = useState('changes')
      const [unchecked, setUnchecked] = useState(() => new Set())
      const [selectedKey, setSelectedKey] = useState(null)
      const [diff, setDiff] = useState(null)
      const [message, setMessage] = useState('')
      const [amend, setAmend] = useState(false)
      const [commits, setCommits] = useState(null)
      const [detail, setDetail] = useState(null)
      const [branches, setBranches] = useState(null)
      const [newBranch, setNewBranch] = useState('')
      const [stashes, setStashes] = useState(null)
      const [stashMessage, setStashMessage] = useState('')
      const [consoleEntries, setConsoleEntries] = useState(null)
      const [confirmState, setConfirmState] = useState(null)
      const callRef = useRef(call)
      callRef.current = call

      const allowWrite = repo !== null ? repo.config.allowWrite !== false : true
      const allowPush = repo !== null ? repo.config.allowPush === true : false
      const allowDangerous = repo !== null ? repo.config.allowDangerous !== false : true

      /** 调用 host；失败统一进 error 横幅（RPC 不 reject，载体故障也在 result.error 里）。 */
      const invoke = useCallback(async (endpoint, payload) => {
        if (cwd === undefined || cwd === '') return undefined
        const result = await callRef.current(endpoint, { cwd, ...(payload ?? {}) })
        if (result === undefined || result.ok !== true) {
          const failure = result !== undefined && result.error !== undefined
            ? result.error
            : { code: 'git-vcs/no-result', message: 'RPC 未返回结果（连接可能已断开）' }
          setError({ endpoint, ...failure })
          return undefined
        }
        return result.value
      }, [cwd])

      const refresh = useCallback(async () => {
        if (cwd === undefined || cwd === '') {
          setRepo(null)
          setStatus(null)
          return
        }
        const info = await invoke('repo/info', {})
        if (info === undefined) {
          setRepo(null)
          setStatus(null)
          return
        }
        setRepo(info)
        const state = await invoke('status', {})
        if (state !== undefined) setStatus(state)
      }, [cwd, invoke])

      useEffect(() => {
        setUnchecked(new Set())
        setSelectedKey(null)
        setDiff(null)
        setCommits(null)
        setDetail(null)
        setBranches(null)
        setStashes(null)
        setConsoleEntries(null)
        setTab('changes')
        void refresh()
      }, [cwd, refresh])

      useEffect(() => {
        const seconds = repo !== null ? repo.config.autoRefreshSeconds : 0
        if (seconds === undefined || seconds <= 0 || cwd === undefined) return undefined
        const timer = window.setInterval(() => { void refresh() }, seconds * 1000)
        return () => window.clearInterval(timer)
      }, [repo, cwd, refresh])

      useEffect(() => {
        if (notice === null) return undefined
        const timer = window.setTimeout(() => setNotice(null), 4000)
        return () => window.clearTimeout(timer)
      }, [notice])

      const loadTab = useCallback(async (name) => {
        if (name === 'log') {
          const value = await invoke('log', { limit: 100 })
          if (value !== undefined) setCommits(value.commits)
        } else if (name === 'branches') {
          const value = await invoke('branches', {})
          if (value !== undefined) setBranches(value)
        } else if (name === 'stash') {
          const value = await invoke('stash', { action: 'list' })
          if (value !== undefined) setStashes(value.stashes)
        } else if (name === 'console') {
          const value = await invoke('console/list', { limit: 200 })
          if (value !== undefined) setConsoleEntries(value.entries)
        }
      }, [invoke])

      async function selectTab(name) {
        setTab(name)
        setDiff(null)
        await loadTab(name)
      }

      /** 写操作统一入口：busy 门 + 失败进横幅 + 成功后刷新状态与当前 tab。 */
      async function action(endpoint, payload, options) {
        const opts = options ?? {}
        setBusy(true)
        const value = await invoke(endpoint, payload)
        setBusy(false)
        if (value === undefined) return undefined
        if (opts.success !== undefined) setNotice(opts.success)
        const state = await invoke('status', {})
        if (state !== undefined) setStatus(state)
        const info = await invoke('repo/info', {})
        if (info !== undefined) setRepo(info)
        if (tab !== 'changes') await loadTab(tab)
        return value
      }

      /** 危险操作：先内联确认再执行。 */
      function askConfirm(label, run) {
        setConfirmState({ label, run })
      }

      const entries = status !== null ? status.entries.filter((entry) => !entry.ignored) : []
      const checkedEntries = entries.filter((entry) => !unchecked.has(entryKey(entry)))

      function toggleChecked(key) {
        setUnchecked((previous) => {
          const next = new Set(previous)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        })
      }

      async function openDiff(entry) {
        const staged = entry.staged && !entry.unstaged
        const value = await invoke('diff', {
          path: entry.path,
          staged,
          untracked: entry.untracked === true,
        })
        if (value !== undefined) {
          setSelectedKey(entryKey(entry))
          setDiff({ title: entry.path, patch: value.patch, staged, entry })
        }
      }

      async function doCommit(andPush) {
        if (message.trim() === '') {
          setError({ endpoint: 'commit', code: 'git-vcs/bad-request', message: '提交信息不能为空' })
          return
        }
        setBusy(true)
        setError(null)
        const paths = checkedEntries.filter((entry) => !entry.conflicted).map((entry) => entry.path)
        if (paths.length > 0 && !amend) {
          const staged = await invoke('stage', { paths })
          if (staged === undefined) { setBusy(false); return }
        }
        const committed = await invoke('commit', { message: message.trim(), amend })
        if (committed === undefined) { setBusy(false); return }
        setMessage('')
        setAmend(false)
        setUnchecked(new Set())
        if (andPush) {
          const pushed = await invoke('push', {})
          if (pushed !== undefined) setNotice('已提交并推送。')
          else setNotice('已提交，但推送失败（见上方错误）。')
        } else {
          setNotice('提交成功。')
        }
        setBusy(false)
        await refresh()
        if (tab === 'log') setCommits(null)
      }

      async function loadDetail(commit) {
        const value = await invoke('show', { rev: commit.hash })
        if (value !== undefined) setDetail({ ...value, hash: commit.hash })
      }

      async function copyHash(current) {
        const hash = current !== null && current.commit !== null ? current.commit.hash : ''
        try {
          await navigator.clipboard.writeText(hash)
          setNotice(`已复制 ${hash.slice(0, 8)}`)
        } catch {
          setNotice(`复制失败，哈希：${hash}`)
        }
      }

      /* ---------------------------------------------------------- 无会话 / 无仓库 */

      if (cwd === undefined || cwd === '') {
        return h('div', { style: S.hint }, '当前会话没有工作目录，版本管理不可用。')
      }

      if (repo === null) {
        const notRepo = error !== null && error.code === 'git-vcs/not-a-repo'
        return h('div', { style: S.root },
          error !== null ? h('div', { style: S.banner },
            h('div', { style: S.bannerText }, `${error.code}: ${error.message}`),
            h('button', { style: S.button, onClick: () => setError(null) }, '关闭'),
          ) : null,
          h('div', { style: S.hint },
            notRepo ? `${cwd} 不是 git 仓库。` : '读取仓库信息中…',
            notRepo ? h('div', { style: { marginTop: '6px' } },
              h('button', {
                style: S.buttonPrimary,
                disabled: busy || !allowWrite,
                onClick: async () => {
                  setBusy(true)
                  const value = await invoke('init', {})
                  setBusy(false)
                  if (value !== undefined) { setNotice('已初始化 git 仓库。'); await refresh() }
                },
              }, '初始化 git 仓库')) : null,
            !notRepo ? h('div', { style: { marginTop: '6px' } },
              h('button', { style: S.button, disabled: busy, onClick: () => { void refresh() } }, '重试')) : null,
          ),
        )
      }

      const counts = {
        changes: entries.length,
        stashes: stashes === null ? 0 : stashes.length,
      }

      const changesPane = h(ChangesTab, {
        status,
        unchecked,
        onToggle: toggleChecked,
        selectedKey,
        onSelect: (key) => {
          setSelectedKey(key)
          const entry = entries.find((candidate) => entryKey(candidate) === key)
          if (entry !== undefined) void openDiff(entry)
        },
        onDiff: (entry) => { void openDiff(entry) },
        onRollback: (entry) => askConfirm(
          `丢弃 ${entry.path} 的本地改动${entry.untracked ? '（未跟踪文件将被删除）' : ''}`,
          async () => {
            await action('discard', { paths: [entry.path] }, { success: `已回滚 ${entry.path}` })
            if (diff !== null && diff.title === entry.path) setDiff(null)
          },
        ),
        onStage: (entry) => { void action('stage', { paths: [entry.path] }) },
        onUnstage: (entry) => { void action('unstage', { paths: [entry.path] }) },
        onStageAll: (list) => {
          const paths = list.map((entry) => entry.path)
          if (paths.length > 0) void action('stage', { paths })
        },
        onUnstageAll: (list) => {
          const paths = list.map((entry) => entry.path)
          if (paths.length > 0) void action('unstage', { paths })
        },
        onSelectAll: () => setUnchecked(new Set()),
        message,
        setMessage,
        amend,
        setAmend,
        onCommit: () => { void doCommit(false) },
        onCommitAndPush: () => { void doCommit(true) },
        busy,
        allowPush,
      })

      const body = tab === 'changes'
        ? (fullscreen
          ? h('div', { style: S.columns },
            h('div', { style: S.col }, changesPane),
            h('div', { style: S.colLast }, h(DiffPane, {
              data: diff,
              onStageFile: diff !== null && diff.entry !== undefined && diff.entry.staged !== true
                ? () => { void action('stage', { paths: [diff.entry.path] }) }
                : undefined,
              onRollbackFile: diff !== null && diff.entry !== undefined
                ? () => askConfirm(`丢弃 ${diff.entry.path} 的本地改动`, async () => {
                  await action('discard', { paths: [diff.entry.path] }, { success: '已回滚' })
                  setDiff(null)
                })
                : undefined,
            })))
          : (diff !== null
            ? h(DiffPane, {
              data: diff,
              onBack: () => setDiff(null),
              onStageFile: diff.entry !== undefined && diff.entry.staged !== true
                ? () => { void action('stage', { paths: [diff.entry.path] }) }
                : undefined,
              onRollbackFile: diff.entry !== undefined
                ? () => askConfirm(`丢弃 ${diff.entry.path} 的本地改动`, async () => {
                  await action('discard', { paths: [diff.entry.path] }, { success: '已回滚' })
                  setDiff(null)
                })
                : undefined,
            })
            : changesPane))
        : tab === 'log'
          ? h(LogTab, {
            commits,
            selected: detail !== null ? detail.hash : null,
            detail,
            busy,
            allowDangerous,
            onSelect: (commit) => { void loadDetail(commit) },
            onCopy: (current) => { void copyHash(current) },
            onCherryPick: (current) => askConfirm(`拣选提交 ${current.hash.slice(0, 8)} 到当前分支`, async () => {
              await action('cherry-pick', { rev: current.hash }, { success: '已拣选。' })
            }),
            onRevert: (current) => askConfirm(`回滚提交 ${current.hash.slice(0, 8)}（生成一个反向提交）`, async () => {
              await action('revert', { rev: current.hash }, { success: '已回滚。' })
            }),
            onReset: (current, mode) => askConfirm(
              `将当前分支重置到 ${current.hash.slice(0, 8)}（--${mode}${mode === 'hard' ? '，会丢弃工作区与暂存区改动' : ''}）`,
              async () => {
                await action('reset', { rev: current.hash, mode }, { success: `已 --${mode} 重置。` })
                setDetail(null)
                setCommits(null)
                await loadTab('log')
              },
            ),
          })
          : tab === 'branches'
            ? h(BranchesTab, {
              branches,
              current: repo.repo !== undefined ? repo.repo.branch : repo.branch,
              busy,
              allowDangerous,
              newName: newBranch,
              setNewName: setNewBranch,
              onCreate: async (andSwitch) => {
                const name = newBranch.trim()
                if (name === '') return
                const created = andSwitch
                  ? await action('checkout', { ref: name, create: true }, { success: `已新建并切换到 ${name}` })
                  : await action('branch/create', { name }, { success: `已新建分支 ${name}` })
                if (created !== undefined) {
                  setNewBranch('')
                  setBranches(null)
                  await loadTab('branches')
                }
              },
              onCheckout: async (name) => {
                const done = await action('checkout', { ref: name }, { success: `已切换到 ${name}` })
                if (done !== undefined) { setBranches(null); await loadTab('branches') }
              },
              onMerge: (name) => askConfirm(`把 ${name} 合并进当前分支`, async () => {
                await action('merge', { ref: name }, { success: `已合并 ${name}` })
                setBranches(null)
                await loadTab('branches')
              }),
              onDelete: (name) => askConfirm(`删除本地分支 ${name}`, async () => {
                await action('branch/delete', { name }, { success: `已删除 ${name}` })
                setBranches(null)
                await loadTab('branches')
              }),
            })
            : tab === 'stash'
              ? h(StashTab, {
                stashes,
                busy,
                message: stashMessage,
                setMessage: setStashMessage,
                onPush: async () => {
                  const done = await action('stash', { action: 'push', message: stashMessage.trim() === '' ? undefined : stashMessage.trim() },
                    { success: '已贮藏当前改动。' })
                  if (done !== undefined) { setStashMessage(''); setStashes(null); await loadTab('stash') }
                },
                onAction: async (kind, ref) => {
                  const run = async () => {
                    await action('stash', { action: kind, ref }, { success: `已 ${kind} ${ref}` })
                    setStashes(null)
                    await loadTab('stash')
                  }
                  if (kind === 'drop') askConfirm(`删除贮藏 ${ref}`, run)
                  else await run()
                },
              })
              : h(ConsoleTab, {
                entries: consoleEntries,
                busy,
                onRefresh: () => { void loadTab('console') },
                onClear: async () => {
                  await invoke('console/clear', {})
                  setConsoleEntries([])
                },
              })

      return h('div', { style: S.root },
        h(Toolbar, {
          repo: repo.repo,
          busy,
          allowPush,
          onRefresh: () => { void refresh() },
          onGotoBranches: () => { void selectTab('branches') },
          onFetch: async () => {
            const done = await action('fetch', {}, { success: '抓取完成。' })
            if (done !== undefined) { setBranches(null); if (tab === 'branches') await loadTab('branches') }
          },
          onPull: () => askConfirm('拉取远端改动（git pull --no-edit）', async () => {
            await action('pull', {}, { success: '拉取完成。' })
          }),
          onPush: () => askConfirm('推送当前分支到远端', async () => {
            await action('push', {}, { success: '推送完成。' })
          }),
        }),
        h(TabStrip, { tab, onSelect: (name) => { void selectTab(name) }, counts }),
        error !== null ? h('div', { style: S.banner },
          h('div', { style: S.bannerText }, `${error.endpoint !== undefined ? `[${error.endpoint}] ` : ''}${error.code}: ${error.message}`),
          h('button', { style: S.button, onClick: () => setError(null) }, '关闭'),
        ) : null,
        h('div', { style: S.body }, body),
        confirmState !== null ? h('div', { style: S.confirmBar },
          h('span', null, `确认${confirmState.label}？`),
          h('span', { style: S.spacer }),
          h('button', {
            style: S.buttonDanger,
            disabled: busy,
            onClick: async () => {
              const run = confirmState.run
              setConfirmState(null)
              await run()
            },
          }, '执行'),
          h('button', { style: S.button, onClick: () => setConfirmState(null) }, '取消'),
        ) : null,
        notice !== null ? h('div', { style: S.footer }, notice) : null,
        h('div', { style: S.footer },
          h('span', { title: repo.repo.root }, `仓库：${repo.repo.root}`),
          h('span', null, `分支：${repo.repo.branch === '' ? '(未知)' : repo.repo.branch}`),
          repo.repo.upstream !== '' ? h('span', null, `跟踪：${repo.repo.upstream} ↑${repo.repo.ahead} ↓${repo.repo.behind}`) : null,
          !allowWrite ? h('span', { style: { color: '#ef4444' } }, '写操作已关闭') : null,
          h('span', { style: S.spacer }),
          h('span', null, busy ? '执行中…' : `${entries.length} 个变更`),
        ),
      )
    }

    /* --------------------------------------------------------------- 插件入口 */

    /**
     * 浏览器半区必需的 Cordis 服务：
     *   slots            —— 注册 tab 正文（sidebar.right.pane.tab）
     *   sidebarRightTabs —— 注册 tab 类型与引导页入口
     *   connection       —— 调 host 的 /git-vcs RPC 通道
     */
    const inject = ['slots', 'sidebarRightTabs', 'connection']

    /**
     * 注册：类型（阶段一）、正文（阶段二）。
     * 分栏 / 全屏 / 浮窗由 ui-sidebar-right + dockkit 提供，本包不碰布局。
     * @param ctx - 客户端根 context。
     */
    function apply(ctx) {
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: PKG_ID,
        kind: KIND,
        title: () => '版本管理',
        guide: [{
          order: 20,
          title: () => '版本管理',
          description: () => '参照 IDEA 的版本管理：本地变更、提交、历史、分支与命令流水',
          icon: GitGlyph,
        }],
      }), 'dsh-git-vcs: tab type')

      // 组件拿不到 ctx：host 调用经注入工厂闭包捕获后交给组件。
      const face = () => ({
        call: (endpoint, payload, signal) => ctx.connection.rpc.call(CHANNEL, endpoint, payload, signal),
      })

      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: PKG_ID,
        inject: face,
      }, GitBody)), 'dsh-git-vcs: tab body')
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
