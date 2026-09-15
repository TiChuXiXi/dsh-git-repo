window.__ModuleLoader__.load({
  id: 'dsh-git-vcs',
  factory: (require) => {
    /**
     * dsh-git-vcs —— 浏览器半区（跑在 dsh web 页面里）。
     *
     * 形态与官方「工作区文件」(dsh-client-ui-sidebar-files) 完全相同：注册一个**右侧栏 tab 类型**
     *   · 阶段一  ctx.sidebarRightTabs.register({ id, kind, title, guide })   ← 类型 + 引导页入口
     *   · 阶段二  slots.register({ name: 'sidebar.right.pane.tab', key: id })  ← 正文
     *   · 阶段三  slots.register({ name: 'sidebar.right.pane.tab.title', key: id }) ← chip 标题
     * 分栏 / 全屏 / 拖出浮窗由 dsh-client-ui-sidebar-right + dockkit 提供，本包不做任何布局工作。
     *
     * 运行时约束：只 require 平台模块表里的 specifier（这里只用 react）；产物是闭包工厂；
     * 组件收不到 ctx，host 调用经注册项 inject 工厂闭包捕获后注入；样式全内联（不写 document.head）。
     *
     * 性能约定（面板流畅度的关键，改这里前先读）：
     *   · 首次加载 / 每次刷新只发**一次** RPC：`repo/snapshot`（host 侧 6 个 git 探测并发）。
     *   · 写操作后同样只刷一次 snapshot，并把真实往返耗时显示在状态栏「上次操作 N ms」。
     *   · 所有等待都有可见文案（顶部进度条 + 页脚转圈文案 + 各分区占位），不留白屏。
     */
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef } = React

    /** host 侧 RPC 通道（index.js 里 ctx.connection.rpc.handle 的同一个名字）。 */
    const CHANNEL = '/git-vcs'
    /** 包名：同时是 tab 类型的 id（正文与标题注册用同一个 key）。 */
    const PKG_ID = 'dsh-git-vcs'
    /** tab 类型判别符（引导页胶囊打开的就是它）。 */
    const KIND = 'git-vcs'

    /* ------------------------------------------------------------------ 样式 */

    const BORDER = '1px solid rgba(128,128,128,0.22)'
    const MUTED = 'rgba(128,128,128,0.95)'
    const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

    const S = {
      root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative', fontSize: '12px', lineHeight: 1.5 },
      busyBar: { flex: 'none', height: '2px', background: 'rgba(59,130,246,0.75)' },
      bar: { display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 8px', borderBottom: BORDER, flexWrap: 'wrap', flex: 'none' },
      spacer: { flex: 1, minWidth: 0 },
      button: {
        font: 'inherit', fontSize: '12px', padding: '2px 8px', borderRadius: '6px', cursor: 'pointer',
        border: BORDER, background: 'transparent', color: 'inherit',
      },
      buttonPrimary: { border: '1px solid rgba(59,130,246,0.55)', background: 'rgba(59,130,246,0.14)' },
      buttonDanger: { border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.12)' },
      buttonOff: { opacity: 0.45, cursor: 'default' },
      close: { width: '22px', height: '22px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', lineHeight: 1, flex: 'none' },
      chip: {
        display: 'inline-flex', alignItems: 'center', gap: '5px', font: 'inherit', fontSize: '12px',
        padding: '2px 8px', borderRadius: '999px', border: BORDER, background: 'rgba(128,128,128,0.08)',
        color: 'inherit', cursor: 'pointer',
      },
      input: {
        font: 'inherit', fontSize: '12px', flex: 1, minWidth: 0, padding: '2px 6px', borderRadius: '6px',
        border: BORDER, background: 'transparent', color: 'inherit',
      },
      tabs: { display: 'flex', gap: '2px', padding: '4px 6px 0', borderBottom: BORDER, flex: 'none', flexWrap: 'wrap' },
      tab: { font: 'inherit', fontSize: '12px', padding: '3px 10px', border: 0, background: 'transparent', color: MUTED, cursor: 'pointer', borderRadius: '6px 6px 0 0' },
      tabOn: { color: 'inherit', background: 'rgba(128,128,128,0.16)' },
      body: { flex: 1, minHeight: 0, overflow: 'auto', display: 'flex' },
      bodyCol: { flex: 1, minHeight: 0, overflow: 'auto' },
      col: { flex: 1, minWidth: 0, minHeight: 0, overflow: 'auto' },
      /** Log 专用：上下布局（提交列表在上，提交详情在下）。 */
      bodyStack: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
      /** 右侧详情栏（Local Changes 的文件差异）：左右布局的右半边。 */
      detail: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, borderLeft: BORDER },
      /** 提交详情面板（Log 下方）：高度由顶边拖拽条控制（默认 300px）。 */
      detailBottom: {
        flex: 'none', display: 'flex', flexDirection: 'column', minHeight: 0, maxHeight: '80%',
        borderTop: BORDER, background: 'var(--dsw-alias-bg-layer-1)',
      },
      splitterY: { flex: 'none', height: '7px', cursor: 'row-resize', position: 'relative', touchAction: 'none' },
      splitterYOn: { background: 'rgba(59,130,246,0.35)' },
      splitterYBar: { position: 'absolute', left: '50%', top: '3px', width: '40px', height: '2px', marginLeft: '-20px', borderRadius: '2px', background: 'rgba(128,128,128,0.55)' },
      detailBody: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
      detailSummary: { flex: 'none', maxHeight: '76px', overflow: 'auto', padding: '3px 8px', display: 'flex', flexDirection: 'column', gap: '2px' },
      /* 变更文件列表：自己占一小段并可滚动，高度随面板拖动变化。 */
      detailFiles: { flex: '0 1 auto', minHeight: '46px', maxHeight: '46%', overflow: 'auto' },
      detailFileRow: { display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap' },
      detailFileRowOn: { background: 'rgba(59,130,246,0.18)' },
      detailDiff: { flex: 1, minHeight: 0, overflow: 'auto', borderTop: BORDER },
      head: { padding: '3px 8px', color: MUTED, background: 'rgba(128,128,128,0.08)', position: 'sticky', top: 0, zIndex: 1 },
      row: { display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 8px', cursor: 'pointer', whiteSpace: 'nowrap', minWidth: 0 },
      rowOn: { background: 'rgba(59,130,246,0.18)' },
      letter: { width: '12px', textAlign: 'center', fontFamily: MONO, fontWeight: 700, flex: 'none' },
      name: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
      dir: { color: MUTED, flex: 'none' },
      pre: { margin: 0, fontFamily: MONO, fontSize: '11px', whiteSpace: 'pre-wrap', padding: '4px 8px' },
      line: { display: 'block', fontFamily: MONO, fontSize: '11px', whiteSpace: 'pre', padding: '0 8px' },
      lineAdd: { background: 'rgba(34,197,94,0.14)' },
      lineDel: { background: 'rgba(239,68,68,0.14)' },
      lineHunk: { background: 'rgba(59,130,246,0.14)', color: MUTED },
      /* ---- Log：div 版表格（列宽可拖动，提交树列自适应不可拖；宽度状态在 GitBody 的 logWidths） ---- */
      thead: {
        display: 'flex', alignItems: 'stretch', position: 'sticky', top: 0, zIndex: 2, boxSizing: 'border-box',
        background: 'var(--dsw-alias-bg-layer-1)', borderBottom: BORDER, fontSize: '12px', color: MUTED,
      },
      th: {
        position: 'relative', padding: '4px 8px', whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis', userSelect: 'none', boxSizing: 'border-box',
      },
      tr: { display: 'flex', alignItems: 'stretch', boxSizing: 'border-box', cursor: 'pointer' },
      rowHover: { background: 'rgba(128,128,128,0.13)' },
      td: { padding: '5px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', boxSizing: 'border-box' },
      resizer: { position: 'absolute', top: 0, right: 0, width: '9px', height: '100%', cursor: 'col-resize', zIndex: 4, touchAction: 'none' },
      resizerOn: { background: 'rgba(59,130,246,0.35)' },
      resizerBar: { position: 'absolute', top: '22%', bottom: '22%', right: '1px', width: '1px', background: 'rgba(128,128,128,0.5)' },
      tdGraph: { display: 'flex', alignItems: 'stretch', gap: '4px', padding: '0 6px 0 0', boxSizing: 'border-box' },
      lane: { position: 'relative', flex: 'none', width: '2px', marginLeft: '12px' },
      /**
       * 连线基样式：上下两段（top / height / bottom 由 GraphCell 按「是否首行 / 末行」逐行算），
       * 分别止于圆环外沿（= 距行中线一个半径），圆点内部不画线。
       */
      graphLine: { position: 'absolute', left: 0, width: '2px' },
      /**
       * 圆点：用 SVG 画的真圆（CSS 小圆环在非整数行高下会被栅格化出棱角），
       * 水平居中在泳道上、垂直居中于本行；外沿半径 = NODE_RADIUS，正好接住上下两段连线。
       */
      node: { position: 'absolute', left: '-5px', top: '50%', marginTop: '-6px', display: 'block', lineHeight: 0 },
      chips: {
        display: 'flex', flex: 1, minWidth: 0, gap: '3px', flexWrap: 'wrap', overflow: 'hidden',
        alignItems: 'center', alignContent: 'center', paddingLeft: '2px',
      },
      chipBranch: { flex: 'none', fontSize: '10px', lineHeight: '15px', padding: '0 5px', borderRadius: '999px', border: '1px solid currentColor', whiteSpace: 'nowrap' },
      chipHead: { fontWeight: 700 },
      hashLink: { fontFamily: MONO, fontSize: '11px', color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: '2px' },
      placeholder: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: MUTED, fontSize: '12px', padding: '14px' },
      foot: { flex: 'none', borderTop: BORDER, padding: '3px 8px', color: MUTED, fontSize: '11px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' },
      banner: { flex: 'none', padding: '6px 8px', background: 'rgba(239,68,68,0.12)', fontFamily: MONO, fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
      /* 提示条：绝对定位浮在面板右下角，**不参与流式布局**（出现/消失都不会顶动高度，因此不会抖）。 */
      toast: {
        position: 'absolute', bottom: '8px', right: '8px', zIndex: 20, maxWidth: '280px', boxSizing: 'border-box',
        padding: '5px 10px', borderRadius: '8px', fontSize: '11px', lineHeight: '16px', wordBreak: 'break-all',
        background: 'rgba(22,163,74,0.95)', color: '#fff', boxShadow: '0 3px 10px rgba(0,0,0,0.35)',
        pointerEvents: 'none',
      },
      toastBad: { background: 'rgba(220,38,38,0.95)' },
      /* 提交行右键菜单：绝对定位挂在面板根上（不在滚动容器里，避免被裁），支持多级子菜单。 */
      menu: {
        position: 'absolute', minWidth: '196px', maxWidth: '280px', zIndex: 40, padding: '4px 0',
        border: BORDER, borderRadius: '8px', background: 'var(--dsw-alias-bg-layer-1)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.35)', fontSize: '12px',
      },
      menuGroup: { padding: '3px 10px 1px', color: MUTED, fontSize: '10px', letterSpacing: '0.04em' },
      menuSep: { height: '1px', margin: '4px 0', background: 'rgba(128,128,128,0.22)' },
      menuItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' },
      menuItemOn: { background: 'rgba(59,130,246,0.18)' },
      menuItemOff: { opacity: 0.45, cursor: 'default' },
      menuItemDanger: { color: '#ef4444' },
      menuHint: { marginLeft: 'auto', color: MUTED, fontSize: '10px' },
      menuArrow: { marginLeft: 'auto', color: MUTED, flex: 'none' },
      commit: { flex: 'none', borderTop: BORDER, padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '5px' },
      area: {
        font: 'inherit', fontSize: '12px', width: '100%', minHeight: '48px', resize: 'vertical', boxSizing: 'border-box',
        padding: '4px 6px', borderRadius: '6px', border: BORDER, background: 'transparent', color: 'inherit',
      },
      confirm: { flex: 'none', borderTop: BORDER, padding: '6px 8px', background: 'rgba(239,68,68,0.1)', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
      hline: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
      meta: { color: MUTED, fontFamily: MONO, fontSize: '11px' },
      remoteRow: { display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '5px 8px', whiteSpace: 'normal' },
      remoteCol: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
      wrap: { wordBreak: 'break-all' },
      /**
       * tab chip 标题：单行不折行，并**预留右侧 30px 给关闭按钮**。
       *
       * dockkit 的 chip（._tab）在 hover / 选中时把关闭按钮绝对定位在 `<chip 右缘 - 24px>` 处，
       * 同时对标题容器（._tabTitle）加 `mask-image: linear-gradient(to right, black calc(100% - 30px), transparent calc(100% - 14px))`
       * —— 也就是**用渐隐吃掉标题尾部**来给按钮让位。我们如果不在自己这层留出这段内边距，
       * 渐隐区正好压住 "版本管理" 的最后一个字（选中时看起来像被 × 覆盖）。
       * 预留 30px 后渐隐落在空白上，文字保持清晰，chip 也相应变宽。
       * 数值：图标 14 + gap 5 + "版本管理"（13px CJK ≈ 52px）= 71px 内容；预留 32px 后
       * 渐变起点在 72px（= 104 - 32），正好在内容之后，留了几像素余量。
       */
      title: {
        display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', flex: 'none',
        minWidth: '104px', paddingRight: '32px', boxSizing: 'border-box', overflow: 'hidden',
      },
    }

    /** Log 列宽上下限（px）：有表项 = 可拖动；graph 不在表里，宽度自适应且不可拖。 */
    const LOG_LIMITS = { date: [92, 360], message: [120, 900], author: [60, 280], commit: [64, 220] }

    /** 提交树的圆点半径（px）：连线两段正好止于圆环外沿，圆点内部不画线。 */
    const NODE_RADIUS = 5

    /** 右键菜单的估算宽度（px）：用于把菜单与子菜单夹在面板内（S.menu 的 maxWidth 是 280，这里取常用值）。 */
    const MENU_WIDTH = 200

    /**
     * 提交树调色板：ring = 同色系深色（圆环 / 标签描边与文字），fill = 同色系淡底（标签），
     * line = 同色系浅色**不透明**（连线）。连线必须不透明：半透明色在相邻行的 1px 重叠处会叠出更深的色带。
     * 按分支名排序取模分配，保证跨渲染稳定。
     */
    const GRAPH_COLORS = [
      { ring: '#2563eb', line: '#9dbdf7', fill: 'rgba(37,99,235,0.14)' },
      { ring: '#16a34a', line: '#93d8b0', fill: 'rgba(22,163,74,0.14)' },
      { ring: '#7c3aed', line: '#c4b0f7', fill: 'rgba(124,58,237,0.14)' },
      { ring: '#ea580c', line: '#f7b78f', fill: 'rgba(234,88,12,0.14)' },
      { ring: '#db2777', line: '#f4a3c6', fill: 'rgba(219,39,119,0.14)' },
      { ring: '#0d9488', line: '#8ad3cd', fill: 'rgba(13,148,136,0.14)' },
      { ring: '#ca8a04', line: '#eed08a', fill: 'rgba(202,138,4,0.14)' },
      { ring: '#4f46e5', line: '#a9a5f2', fill: 'rgba(79,70,229,0.14)' },
    ]

    const STATE_COLORS = {
      M: '#3b82f6', A: '#22c55e', D: '#9ca3af', R: '#3b82f6', C: '#3b82f6',
      T: '#9ca3af', U: '#ef4444', '?': '#22c55e', '!': '#9ca3af',
    }

    /** 合并按钮样式：kind = undefined | 'primary' | 'danger'。 */
    function btnStyle(kind, disabled) {
      const style = { ...S.button }
      if (kind === 'primary') Object.assign(style, S.buttonPrimary)
      if (kind === 'danger') Object.assign(style, S.buttonDanger)
      if (disabled === true) Object.assign(style, S.buttonOff)
      return style
    }

    function Btn(props) {
      return h('button', {
        style: btnStyle(props.kind, props.disabled),
        disabled: props.disabled === true,
        title: props.title,
        onClick: props.onClick,
      }, props.children)
    }

    /** 等待提示：纯文本 + 计时符号（零构建下没有 CSS 动画可用）。 */
    function Busy(props) {
      return h('span', { style: S.hline }, h('span', { style: { color: '#3b82f6' } }, '⏳'), h('span', null, props.text))
    }

    /* ------------------------------------------------------------------ 图标 */

    /** 引导页胶囊、tab chip 与工具栏的图形（分支图形，无外部依赖）。 */
    function GitGlyph(props) {
      const s = typeof props.size === 'number' ? props.size : 16
      return h('svg', {
        width: s, height: s, viewBox: '0 0 16 16', className: props.className, 'aria-hidden': 'true',
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

    /** RPC 失败对象（{code,message,details}）→ 可读文本。 */
    function errorText(error) {
      if (error === null || error === undefined) return ''
      const code = typeof error.code === 'string' ? error.code : 'git-vcs/error'
      const message = typeof error.message === 'string' ? error.message : String(error)
      let extra = ''
      const details = error.details
      if (typeof details === 'string') extra = details
      else if (details !== null && typeof details === 'object') {
        if (Array.isArray(details.argv)) extra = details.argv.join(' ')
        else if (typeof details.exitCode === 'number') extra = `exit ${details.exitCode}`
      }
      return `${code}: ${message}${extra === '' ? '' : `\n${extra}`}`
    }

    function shortDate(value) {
      return typeof value === 'string' ? value.slice(0, 19).replace('T', ' ') : ''
    }

    function splitPath(path) {
      const at = path.lastIndexOf('/')
      if (at < 0) return { dir: '', name: path }
      return { dir: path.slice(0, at + 1), name: path.slice(at + 1) }
    }

    /** 字符宽度估算（10px 字号）：CJK / 全角按 10.5px，其余按 6.1px。用于提交树列的自适应宽度。 */
    function glyphWidth(text) {
      let width = 0
      for (const ch of text) width += ch.codePointAt(0) > 0x2e7f ? 10.5 : 6.1
      return width
    }

    /** 状态字母：冲突=U、未跟踪=?、忽略=!，否则取暂存 / 工作区字母（都变时按工作区）。 */
    function statusLetter(entry) {
      if (entry.conflicted) return { text: 'U', color: STATE_COLORS.U }
      if (entry.untracked) return { text: '?', color: STATE_COLORS['?'] }
      if (entry.ignored) return { text: '!', color: STATE_COLORS['!'] }
      const index = entry.index
      const worktree = entry.worktree
      if (index !== '.' && worktree !== '.') return { text: worktree, color: STATE_COLORS[worktree] || STATE_COLORS.M }
      if (index !== '.') return { text: index, color: STATE_COLORS[index] || STATE_COLORS.M }
      return { text: worktree, color: STATE_COLORS[worktree] || STATE_COLORS.M }
    }

    /** 统一 diff 文本 → 着色行。 */
    function DiffView(props) {
      if (props.loading === true) return h('div', { style: S.placeholder }, Busy({ text: '读取差异…' }))
      const text = props.text
      if (text === null || text === undefined || text === '') return h('div', { style: S.placeholder }, '无差异内容')
      return h('div', null, text.split('\n').map((line, index) => {
        let style = S.line
        if (line.startsWith('@@')) style = { ...S.line, ...S.lineHunk }
        else if (line.startsWith('+')) style = { ...S.line, ...S.lineAdd }
        else if (line.startsWith('-')) style = { ...S.line, ...S.lineDel }
        return h('span', { key: index, style }, line === '' ? ' ' : line)
      }))
    }

    /**
     * Log 的提交树列：一条贯穿整行的泳道 + 本行正中的圆点，圆点右侧是该提交上的分支标签。
     *
     * 圆点：SVG 真圆（直径 10px、圆环 2px），HEAD 提交**实心**、其余空心；
     * 连线：该分支色系的浅色不透明 2px 竖线，分上下两段止于圆环外沿（圆点内部不画线），
     * 两段各向相邻行越界 1px 重叠 —— 不透明色重叠不会变深，但能消除行高含小数时的接缝。
     * 列宽由 GitBody 依标签内容算好传进来（自适应，且不提供拖动手柄）。
     */
    function GraphCell(props) {
      const labels = Array.isArray(props.labels) ? props.labels : []
      const ring = typeof props.ring === 'string' ? props.ring : GRAPH_COLORS[0].ring
      const lineColor = typeof props.line === 'string' ? props.line : GRAPH_COLORS[0].line
      const up = { ...S.graphLine, background: lineColor, top: '-1px', height: `calc(50% - ${NODE_RADIUS - 1}px)` }
      const down = { ...S.graphLine, background: lineColor, top: `calc(50% + ${NODE_RADIUS}px)`, bottom: '-1px' }
      const node = h('svg', {
        style: S.node, width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': 'true',
      }, h('circle', {
        cx: 6,
        cy: 6,
        r: 4,
        fill: props.filled === true ? ring : 'none',
        stroke: ring,
        strokeWidth: 2,
      }))
      const box = { ...S.tdGraph, flex: `0 0 ${props.width}px`, width: `${props.width}px` }
      return h('div', {
        style: box,
        title: labels.length === 0
          ? undefined
          : labels.map((label) => `${label.kind === 'local' ? '本地分支' : '远程分支'} ${label.name}`).join('\n'),
      },
        h('div', { style: S.lane },
          props.first === true ? null : h('div', { style: up }),
          props.last === true ? null : h('div', { style: down }),
          node,
        ),
        h('div', { style: S.chips }, labels.map((label) => h('span', {
          key: `${label.kind}:${label.name}`,
          style: {
            ...S.chipBranch,
            ...(label.head === true ? S.chipHead : null),
            color: label.ring,
            background: label.fill,
            borderStyle: label.kind === 'remote' ? 'dashed' : 'solid',
          },
          title: `${label.kind === 'local' ? '本地分支' : '远程分支'}：${label.name}`,
        }, label.name))),
      )
    }

    /**
     * 列宽拖动手柄。用 pointer capture：指针拖出单元格之后 move 事件仍然送到这个手柄，
     * 所以不必给 window / document 挂监听；起始宽度直接量父单元格，不维护第二份宽度状态。
     */
    function ResizeHandle(props) {
      const [active, setActive] = useState(false)
      const drag = useRef(null)
      function start(event) {
        if (event.button !== undefined && event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        const host = event.currentTarget.parentElement
        const width = host === null || host === undefined ? props.width : host.getBoundingClientRect().width
        drag.current = { x: event.clientX, width }
        setActive(true)
        if (typeof event.currentTarget.setPointerCapture === 'function') {
          event.currentTarget.setPointerCapture(event.pointerId)
        }
      }
      function move(event) {
        if (drag.current === null) return
        event.preventDefault()
        props.onResize(drag.current.width + (event.clientX - drag.current.x))
      }
      function stop(event) {
        if (drag.current === null) return
        drag.current = null
        setActive(false)
        if (typeof event.currentTarget.releasePointerCapture === 'function'
          && event.currentTarget.hasPointerCapture(event.pointerId) === true) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }
      return h('span', {
        style: active === true ? { ...S.resizer, ...S.resizerOn } : S.resizer,
        title: '拖动调整列宽',
        onPointerDown: start,
        onPointerMove: move,
        onPointerUp: stop,
        onPointerCancel: stop,
      }, h('span', { style: S.resizerBar }))
    }

    /**
     * 提交详情面板顶边的拖拽条：上下拖动改变面板高度（往上拖变高）。
     * 同样用 pointer capture，拖出面板后事件仍回这个元素，不挂 window 监听。
     */
    function RowSplitter(props) {
      const [active, setActive] = useState(false)
      const drag = useRef(null)
      function start(event) {
        if (event.button !== undefined && event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        const host = event.currentTarget.parentElement
        const size = host === null || host === undefined ? props.height : host.getBoundingClientRect().height
        drag.current = { y: event.clientY, size }
        setActive(true)
        if (typeof event.currentTarget.setPointerCapture === 'function') {
          event.currentTarget.setPointerCapture(event.pointerId)
        }
      }
      function move(event) {
        if (drag.current === null) return
        event.preventDefault()
        props.onResize(drag.current.size - (event.clientY - drag.current.y))
      }
      function stop(event) {
        if (drag.current === null) return
        drag.current = null
        setActive(false)
        if (typeof event.currentTarget.releasePointerCapture === 'function'
          && event.currentTarget.hasPointerCapture(event.pointerId) === true) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }
      return h('div', {
        style: active === true ? { ...S.splitterY, ...S.splitterYOn } : S.splitterY,
        title: '拖动调整提交详情高度',
        onPointerDown: start,
        onPointerMove: move,
        onPointerUp: stop,
        onPointerCancel: stop,
      }, h('div', { style: S.splitterYBar }))
    }

    /* ------------------------------------------------------------------ 主体 */

    /**
     * 面板正文。
     * @param props - 注册项 inject 工厂注入的 { call }；call(endpoint, payload) 返回 RPC 信封。
     */
    function GitBody(props) {
      const rawCall = props.call
      // 会话工作目录：标准 prop useSessions 给出 current / byId，用来当默认仓库路径。
      const useSessions = props.useSessions
      const sessions = typeof useSessions === 'function' ? useSessions((state) => state) : undefined

      const [cwd, setCwd] = useState('')
      const [applied, setApplied] = useState('')
      const [tab, setTab] = useState('changes')
      const [repo, setRepo] = useState(null)
      const [config, setConfig] = useState(null)
      const [status, setStatus] = useState(null)
      const [commits, setCommits] = useState([])
      const [branches, setBranches] = useState({ local: [], remote: [] })
      const [stashes, setStashes] = useState([])
      const [remotes, setRemotes] = useState(null)
      const [remoteLoading, setRemoteLoading] = useState(false)
      const [shown, setShown] = useState(null)
      const [showLoading, setShowLoading] = useState(false)
      const [selected, setSelected] = useState(null)
      const [patch, setPatch] = useState(null)
      const [patchLoading, setPatchLoading] = useState(false)
      const [commands, setCommands] = useState([])
      const [message, setMessage] = useState('')
      const [amend, setAmend] = useState(false)
      const [newBranch, setNewBranch] = useState('')
      const [commitBranch, setCommitBranch] = useState('')
      const [stashMessage, setStashMessage] = useState('')
      const [remoteName, setRemoteName] = useState('')
      const [remoteUrl, setRemoteUrl] = useState('')
      const [remotePush, setRemotePush] = useState('')
      const [confirm, setConfirm] = useState(null)
      const [loading, setLoading] = useState(true)
      const [busy, setBusy] = useState(false)
      const [busyLabel, setBusyLabel] = useState('')
      const [lastMs, setLastMs] = useState(null)
      const [error, setError] = useState(null)
      const [notice, setNotice] = useState(null)
      const [tick, setTick] = useState(0)
      /** Log 列宽：date / message / author / commit 可拖；graph 由 logGraphWidth 依内容自适应。 */
      const [logWidths, setLogWidths] = useState({ date: 148, message: 320, author: 104, commit: 96 })
      /** message 列默认吃掉剩余宽度；被用户拖动过之后改成固定宽度（总宽超出即横向滚动）。 */
      const [msgAuto, setMsgAuto] = useState(true)
      /** Log 行的鼠标悬停高亮：零构建下没有 CSS :hover，用状态模拟（只在哈希变化时 set，避免无谓渲染）。 */
      const [hoverHash, setHoverHash] = useState(null)
      /** 提交详情面板：高度可拖、默认不展开任何文件的差异。 */
      const [detailHeight, setDetailHeight] = useState(300)
      const [detailFile, setDetailFile] = useState(null)
      const [detailHover, setDetailHover] = useState(null)
      const [filePatch, setFilePatch] = useState(null)
      const [fileLoading, setFileLoading] = useState(false)
      /** 提交行右键菜单：{ hash, x, y, bounds }；submenuStack 是逐级展开的子菜单（根相对坐标）。 */
      const [menu, setMenu] = useState(null)
      const [menuHover, setMenuHover] = useState(null)
      const [submenuStack, setSubmenuStack] = useState([])
      const [focusBranch, setFocusBranch] = useState(false)
      const rootRef = useRef(null)
      const menuRef = useRef(null)
      const branchRef = useRef(null)
      const noticeTimer = useRef(null)
      const alive = useRef(true)
      const appliedRef = useRef('')
      appliedRef.current = applied

      /** 统一调用：把 RPC 信封与异常都收敛成 { ok, value } / { ok:false, error }。 */
      async function rpc(endpoint, payload) {
        const body = { cwd: appliedRef.current, ...(payload === undefined ? {} : payload) }
        try {
          const result = await rawCall(endpoint, body)
          if (result === null || typeof result !== 'object') {
            return { ok: false, error: { code: 'git-vcs/empty', message: '宿主返回了空响应', details: {} } }
          }
          return result
        } catch (cause) {
          return {
            ok: false,
            error: { code: 'git-vcs/transport', message: cause instanceof Error ? cause.message : String(cause), details: {} },
          }
        }
      }

      /** 拉一次全量快照（一次 RPC，host 侧并发探测）。 */
      async function refresh(label) {
        setBusy(true)
        setBusyLabel(label)
        setError(null)
        const startedAt = Date.now()
        const result = await rpc('repo/snapshot', { limit: 50, consoleLimit: 60 })
        if (!alive.current) return
        setLastMs(Date.now() - startedAt)
        setBusy(false)
        setBusyLabel('')
        setLoading(false)
        if (!result.ok) {
          setError(result.error)
          return
        }
        const value = result.value
        setRepo(value.repo)
        setConfig(value.config)
        setStatus(value.status)
        setCommits(Array.isArray(value.commits) ? value.commits : [])
        setBranches(value.branches === undefined ? { local: [], remote: [] } : value.branches)
        setStashes(Array.isArray(value.stashes) ? value.stashes : [])
        setCommands(Array.isArray(value.console) ? value.console : [])
      }

      /** 未显式输入仓库路径时，用会话工作目录（首次拿到就自动打开）。 */
      useEffect(() => {
        if (applied !== '' || cwd !== '') return
        const summary = sessions === undefined || sessions === null || sessions.byId === undefined
          ? undefined
          : sessions.byId[sessions.current]
        const candidate = summary === undefined || summary === null ? '' : summary.cwd
        if (typeof candidate === 'string' && candidate !== '') {
          setCwd(candidate)
          setApplied(candidate)
        }
      }, [sessions, applied, cwd])

      /** 首次进入 / 用户点「打开仓库」/ 点 Refresh：拉一次快照。 */
      useEffect(() => {
        alive.current = true
        if (applied === '') return undefined
        refresh('读取仓库…')
        return () => { alive.current = false }
      }, [applied, tick])

      /** 自动刷新（config.autoRefreshSeconds > 0 时生效）。 */
      const autoRefreshSeconds = config === null ? 0 : config.autoRefreshSeconds
      useEffect(() => {
        if (autoRefreshSeconds <= 0) return undefined
        const timer = setInterval(() => { setTick((n) => n + 1) }, autoRefreshSeconds * 1000)
        return () => clearInterval(timer)
      }, [autoRefreshSeconds])

      /**
       * 选中文件 → 拉该文件的 diff（只读，可关闭）。
       *
       * 必须把 `untracked` 一起转发：未跟踪文件不在 index 里，`git diff -- <path>` 恒为空，
       * 只有 host 的 `--no-index`（untracked=true）分支才拿得到"新文件"的整段差异。
       * 忽略文件（.gitignore 命中）没有可看的差异，直接不发请求。
       */
      useEffect(() => {
        if (selected === null) {
          setPatch(null)
          setPatchLoading(false)
          return undefined
        }
        if (selected.ignored === true) {
          setPatch('')
          setPatchLoading(false)
          return undefined
        }
        let live = true
        setPatch(null)
        setPatchLoading(true)
        rpc('diff', {
          path: selected.path,
          staged: selected.staged === true,
          untracked: selected.untracked === true,
        }).then((result) => {
          if (!live) return
          setPatchLoading(false)
          if (result.ok) setPatch(result.value.patch)
          else setError(result.error)
        })
        return () => { live = false }
      }, [selected, applied])

      /**
       * 刷新 / 写操作后条目会变：选中项的处理。
       *
       *   · 已不在列表里（文件被别处提交、或已回滚）→ 收起差异面板与底部暂存/回滚操作条；
       *   · 还在但换了分组（刚点了「暂存」）→ 跟随到新的分组，避免右侧继续显示已经不存在的那种差异。
       *
       * 依赖只挂 status/applied：只在快照更新时校验，点击选中本身不需要重跑。
       */
      useEffect(() => {
        if (selected === null) return
        const entry = entries().find((row) => row.path === selected.path)
        if (entry === undefined) {
          setSelected(null)
          setPatch(null)
          setPatchLoading(false)
          return
        }
        if (selected.ignored === true) return
        const stagedNow = entry.staged === true
        const worktreeNow = entry.unstaged === true || entry.untracked === true
        if (selected.staged === true ? stagedNow === true : worktreeNow === true) return
        if (stagedNow === true || worktreeNow === true) {
          setSelected({ path: entry.path, staged: stagedNow, untracked: entry.untracked === true, ignored: false })
          return
        }
        setSelected(null)
        setPatch(null)
        setPatchLoading(false)
      }, [status, applied])

      /** 切到 Remotes 页才拉远程列表（懒加载，不占刷新的进程预算）。 */
      useEffect(() => {
        if (tab !== 'remotes' || applied === '') return undefined
        let live = true
        setRemoteLoading(true)
        setRemotes(null)
        rpc('remote/list', {}).then((result) => {
          if (!live) return
          setRemoteLoading(false)
          if (result.ok) setRemotes(result.value.remotes)
          else setError(result.error)
        })
        return () => { live = false }
      }, [tab, applied, tick])

      /** 写操作：调用端点 → 显示耗时 → 刷新快照。 */
      async function run(endpoint, payload, label) {
        setBusy(true)
        setBusyLabel(label)
        setError(null)
        setNotice(null)
        const startedAt = Date.now()
        const result = await rpc(endpoint, payload)
        if (!alive.current) return null
        if (!result.ok) {
          setError(result.error)
          setBusy(false)
          setBusyLabel('')
          return null
        }
        const elapsed = Date.now() - startedAt
        setLastMs(elapsed)
        setNotice({ text: `${label}完成 · ${elapsed} ms`, bad: false })
        await refresh('刷新列表…')
        return result.value
      }

      /** 顶部提示条：2 秒后自动消失（复制反馈 / 写操作耗时共用）。 */
      function flash(text, bad) {
        setNotice({ text, bad: bad === true })
        if (noticeTimer.current !== null) clearTimeout(noticeTimer.current)
        noticeTimer.current = setTimeout(() => { if (alive.current) setNotice(null) }, 2000)
      }

      /** 兜底复制：老浏览器 / 无剪贴板权限时用临时 textarea + execCommand。 */
      function fallbackCopy(text) {
        try {
          if (typeof document === 'undefined' || document.body === null) return false
          const area = document.createElement('textarea')
          area.value = text
          area.style.position = 'fixed'
          area.style.top = '-1000px'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          const ok = document.execCommand('copy')
          document.body.removeChild(area)
          return ok === true
        } catch (cause) {
          return false
        }
      }

      /** 复制纯文本（提交 ID 等）：优先 navigator.clipboard，失败退化到 fallbackCopy。 */
      function copyText(text, label) {
        function done(ok) {
          if (!alive.current) return
          if (ok === true) flash(`已复制${label}：${text}`, false)
          else flash(`复制失败，请手动选择复制${label}：${text}`, true)
        }
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined
            && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text).then(() => done(true), () => done(fallbackCopy(text)))
            return
          }
        } catch (cause) {
          // 剪贴板被策略挡住：走下面的兜底
        }
        done(fallbackCopy(text))
      }

      /** 拖动列宽：graph 列不在此列（自适应且不可拖）；message 一旦拖动即改为固定宽度。 */
      function resizeColumn(id, next) {
        const limit = LOG_LIMITS[id]
        if (limit === undefined) return
        const width = Math.max(limit[0], Math.min(limit[1], Math.round(next)))
        setLogWidths((prev) => (prev[id] === width ? prev : { ...prev, [id]: width }))
        if (id === 'message') setMsgAuto(false)
      }

      function ask(label, job) {
        setConfirm({ label, run: job })
      }

      function closeDetail() {
        setSelected(null)
        setShown(null)
        setShowLoading(false)
        setDetailFile(null)
        setDetailHover(null)
        setFilePatch(null)
        setFileLoading(false)
      }

      function entries() {
        if (status === null || !Array.isArray(status.entries)) return []
        return status.entries
      }

      function stagedPaths() {
        return entries().filter((entry) => entry.staged).map((entry) => entry.path)
      }

      function changesOf(group) {
        return entries().filter((entry) => {
          if (group === 'conflicted') return entry.conflicted
          if (group === 'staged') return entry.staged && !entry.conflicted
          if (group === 'unstaged') return entry.unstaged && !entry.conflicted
          if (group === 'ignored') return entry.ignored === true
          return entry.untracked
        })
      }

      /** 点提交：已展示则收起，否则拉详情（**不带整次提交的 patch**，只拿元数据与变更文件列表）。 */
      function openCommit(hash) {
        if (shown !== null && shown.commit !== null && shown.commit !== undefined && shown.commit.hash === hash) {
          setShown(null)
          setShowLoading(false)
          return
        }
        setShown(null)
        setShowLoading(true)
        setDetailFile(null)
        setFilePatch(null)
        rpc('show', { rev: hash, noPatch: true }).then((result) => {
          if (!alive.current) return
          setShowLoading(false)
          if (result.ok) setShown(result.value)
          else setError(result.error)
        })
      }

      /** 详情面板里点开某个文件 → 只拉这个文件在该次提交里的差异（默认一个都不拉）。 */      useEffect(() => {
        const commit = shown === null || shown.commit === null || shown.commit === undefined ? null : shown.commit
        if (detailFile === null || commit === null) {
          setFilePatch(null)
          setFileLoading(false)
          return undefined
        }
        let live = true
        setFilePatch(null)
        setFileLoading(true)
        rpc('show/file', { rev: commit.hash, path: detailFile }).then((result) => {
          if (!live) return
          setFileLoading(false)
          if (result.ok) setFilePatch(result.value.patch)
          else setError(result.error)
        })
        return () => { live = false }
      }, [detailFile, shown, applied])

      /* ------------------------------------------------------- 提交行右键菜单 */

      /** 菜单根相对定位用的面板尺寸；值取不到时按 0 处理（不夹取，摆到点击处）。 */
      function rootBox() {
        const node = rootRef.current
        if (node === null || node === undefined) return { width: 0, height: 0 }
        const box = node.getBoundingClientRect()
        return { width: box.width, height: box.height }
      }

      function openMenu(event, item) {
        event.preventDefault()
        event.stopPropagation()
        const node = rootRef.current
        const box = node === null || node === undefined ? null : node.getBoundingClientRect()
        const left = box === null ? 0 : box.left
        const top = box === null ? 0 : box.top
        const maxX = Math.max(2, (box === null ? 0 : box.width) - MENU_WIDTH - 2)
        setMenu({
          hash: item.hash,
          x: Math.max(2, Math.min(event.clientX - left, maxX)),
          y: Math.max(2, event.clientY - top),
        })
        setMenuHover(null)
        setSubmenuStack([])
      }

      function closeMenu() {
        setMenu(null)
        setMenuHover(null)
        setSubmenuStack([])
      }

      /** 点菜单之外 / Esc 关闭：菜单自身先 stopPropagation，所以不会误关。 */
      useEffect(() => {
        if (menu === null) return undefined
        function onDown() { setMenu(null); setMenuHover(null); setSubmenuStack([]) }
        function onKey(event) { if (event.key === 'Escape') onDown() }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [menu])

      /** 菜单渲染后量一次高度，太靠下就往上挪（只夹一次，避免抖动）。 */
      useEffect(() => {
        if (menu === null) return
        const node = menuRef.current
        if (node === null || node === undefined) return
        const box = rootBox()
        if (box.height === 0) return
        const maxY = Math.max(2, box.height - node.getBoundingClientRect().height - 4)
        if (menu.y > maxY) setMenu((current) => (current === null ? null : { ...current, y: maxY }))
      }, [menu, submenuStack])

      /** 右键点「基于此提交新建分支…」后把详情面板里的输入框聚焦（面板先展开再聚焦）。 */
      useEffect(() => {
        if (focusBranch !== true) return
        const node = branchRef.current
        if (node !== null && node !== undefined) node.focus()
        setFocusBranch(false)
      }, [focusBranch, shown])

      /**
       * 悬停菜单项：叶子只收起比它更深的层级（否则鼠标一进子菜单就被关掉），
       * 父项在 `level` 位置展开自己的子菜单（父项所在层 = 子菜单在栈里的下标）。
       */
      function openSubmenu(entry, key, level, event) {
        setMenuHover(key)
        if (entry.items === undefined) {
          setSubmenuStack((current) => (current.length <= level ? current : current.slice(0, level)))
          return
        }
        const node = event.currentTarget
        const box = rootBox()
        const rect = node.getBoundingClientRect()
        const root = rootRef.current
        const rootRect = root === null || root === undefined ? null : root.getBoundingClientRect()
        const left = rootRect === null ? 0 : rootRect.left
        const top = rootRect === null ? 0 : rootRect.top
        let x = rect.right - left + 2
        if (box.width !== 0 && x + MENU_WIDTH > box.width - 2) x = Math.max(2, rect.left - left - MENU_WIDTH - 2)
        const y = Math.max(2, rect.top - top)
        const level_ = { key, items: entry.items, x, y }
        setSubmenuStack((current) => {
          const kept = current.slice(0, level)
          const existing = current[level]
          if (existing !== undefined && existing.key === key && current.length === level + 1) return current
          return [...kept, level_]
        })
      }

      /** 某个提交的右键菜单项：按功能分组（查看 / 复制 / 分支 / 修改历史），子菜单递归渲染。 */
      function commitMenuItems(commit) {
        const allowWrite = config === null || config.allowWrite !== false
        const allowDangerous = config === null || config.allowDangerous !== false
        return [
          { kind: 'group', label: '查看' },
          {
            id: 'detail',
            label: '展开提交详情',
            hint: '左键单击',
            onPick: () => openCommit(commit.hash),
          },
          { kind: 'group', label: '复制' },
          { id: 'copy-hash', label: '复制提交 ID（完整）', onPick: () => copyText(commit.hash, '提交 ID') },
          { id: 'copy-short', label: '复制短 ID', onPick: () => copyText(commit.shortHash, '短 ID') },
          { id: 'copy-subject', label: '复制提交信息', onPick: () => copyText(commit.subject, '提交信息') },
          { id: 'copy-author', label: '复制作者与邮箱', onPick: () => copyText(`${commit.author} <${commit.email}>`, '作者') },
          { kind: 'group', label: '分支' },
          {
            id: 'branch',
            label: '分支操作',
            items: [
              {
                id: 'branch-create',
                label: '基于此提交新建分支…',
                disabled: !allowWrite,
                onPick: () => { openCommit(commit.hash); setFocusBranch(true) },
              },
              {
                id: 'checkout',
                label: '检出此提交（分离 HEAD）',
                disabled: !allowWrite,
                onPick: () => ask(`检出 ${commit.shortHash}？会切换工作区到该提交（分离 HEAD）。`, () => run('checkout', { ref: commit.hash }, '检出中…')),
              },
              {
                id: 'merge',
                label: '把此提交合并到当前分支',
                disabled: !allowWrite,
                onPick: () => ask(`把 ${commit.shortHash} 合并到当前分支？`, () => run('merge', { ref: commit.hash }, '合并中…')),
              },
            ],
          },
          { kind: 'group', label: '修改历史（危险）' },
          {
            id: 'history',
            label: '修改历史',
            items: [
              {
                id: 'cherry-pick',
                label: '拣选（Cherry-Pick）',
                danger: true,
                disabled: !allowDangerous,
                onPick: () => run('cherry-pick', { rev: commit.hash }, 'Cherry-Pick 中…'),
              },
              {
                id: 'revert',
                label: '回滚（Revert）',
                danger: true,
                disabled: !allowDangerous,
                onPick: () => run('revert', { rev: commit.hash }, 'Revert 中…'),
              },
              {
                id: 'reset',
                label: '重置到此提交',
                items: [
                  {
                    id: 'reset-soft',
                    label: 'Soft',
                    hint: '改动留在暂存区',
                    danger: true,
                    disabled: !allowDangerous,
                    onPick: () => run('reset', { rev: commit.hash, mode: 'soft' }, 'Reset 中…'),
                  },
                  {
                    id: 'reset-mixed',
                    label: 'Mixed',
                    hint: '改动留在工作区',
                    danger: true,
                    disabled: !allowDangerous,
                    onPick: () => run('reset', { rev: commit.hash, mode: 'mixed' }, 'Reset 中…'),
                  },
                  {
                    id: 'reset-hard',
                    label: 'Hard',
                    hint: '丢弃全部改动',
                    danger: true,
                    disabled: !allowDangerous,
                    onPick: () => ask(`硬重置到 ${commit.shortHash}？会丢弃工作区与暂存区的改动。`, () => run('reset', { rev: commit.hash, mode: 'hard' }, '硬重置中…')),
                  },
                ],
              },
            ],
          },
        ]
      }

      /** 递归渲染一层菜单项；分组标题自带分隔线，父项 hover 时在 level 位置展开下一级。 */
      function menuRows(items, path, level) {
        return items.map((entry, index) => {
          const key = `${path}/${index}`
          if (entry.kind === 'group') {
            return h('div', { key },
              path === '' && index === 0 ? null : h('div', { style: S.menuSep }),
              h('div', { style: S.menuGroup }, entry.label),
            )
          }
          const inStack = submenuStack.some((item) => item.key === key)
          const on = menuHover === key || inStack
          const style = { ...S.menuItem }
          if (on && entry.disabled !== true) Object.assign(style, S.menuItemOn)
          if (entry.disabled === true) Object.assign(style, S.menuItemOff)
          if (entry.danger === true) Object.assign(style, S.menuItemDanger)
          return h('div', {
            key,
            style,
            title: entry.title,
            onMouseEnter: (event) => openSubmenu(entry, key, level, event),
            onClick: (event) => {
              event.stopPropagation()
              if (entry.disabled === true) return
              if (typeof entry.onPick !== 'function') {
                // 只作为子菜单入口的项：点击等价于展开下一级。
                openSubmenu(entry, key, level, event)
                return
              }
              closeMenu()
              entry.onPick()
            },
          },
            h('span', null, entry.label),
            entry.items === undefined ? null : h('span', { style: S.menuArrow }, '▸'),
            entry.items === undefined && typeof entry.hint === 'string' ? h('span', { style: S.menuHint }, entry.hint) : null,
          )
        })
      }

      function renderMenu() {
        if (menu === null) return null
        const commit = commits.find((row) => row.hash === menu.hash)
        if (commit === undefined) return null
        return h('div', null,
          h('div', {
            ref: menuRef,
            style: { ...S.menu, left: `${menu.x}px`, top: `${menu.y}px` },
            onMouseDown: (event) => event.stopPropagation(),
            onContextMenu: (event) => { event.preventDefault(); event.stopPropagation() },
          }, menuRows(commitMenuItems(commit), '', 0)),
          submenuStack.map((item, depth) => h('div', {
            key: item.key,
            style: { ...S.menu, left: `${item.x}px`, top: `${item.y}px` },
            onMouseDown: (event) => event.stopPropagation(),
            onContextMenu: (event) => { event.preventDefault(); event.stopPropagation() },
          }, menuRows(item.items, item.key, depth + 1))),
        )
      }

      async function commit() {
        const paths = amend ? undefined : stagedPaths()
        const value = await run('commit', {
          message,
          amend,
          ...(paths === undefined || paths.length === 0 ? {} : { paths }),
        }, '提交中…')
        if (value !== null) {
          setMessage('')
          setAmend(false)
          setSelected(null)
        }
      }

      /* ------------------------------------------------------------ 变更视图 */

      function renderChanges() {
        const groups = [
          { id: 'conflicted', label: '冲突' },
          { id: 'staged', label: '已暂存（Index）' },
          { id: 'unstaged', label: '已修改（Working Tree）' },
          { id: 'untracked', label: '未跟踪文件' },
        ]
        return h('div', { style: S.body },
          h('div', { style: S.col },
            groups.map((group) => {
              const list = changesOf(group.id)
              if (list.length === 0) return null
              return h('div', { key: group.id },
                h('div', { style: S.head }, `${group.label} · ${list.length}`),
                list.map((entry) => {
                  const mark = statusLetter(entry)
                  const parts = splitPath(entry.path)
                  const isOn = selected !== null && selected.path === entry.path && selected.staged === (group.id === 'staged')
                  return h('div', {
                    key: `${group.id}:${entry.path}`,
                    style: isOn === true ? { ...S.row, ...S.rowOn } : S.row,
                    title: entry.path,
                    onClick: () => setSelected({
                      path: entry.path,
                      staged: group.id === 'staged',
                      untracked: entry.untracked === true,
                      ignored: entry.ignored === true,
                    }),
                  },
                    h('span', { style: { ...S.letter, color: mark.color } }, mark.text),
                    parts.dir === '' ? null : h('span', { style: S.dir }, parts.dir),
                    h('span', { style: S.name }, parts.name),
                    entry.origPath === null || entry.origPath === undefined ? null : h('span', { style: S.dir }, ` ← ${entry.origPath}`),
                  )
                }),
              )
            }),
            entries().length === 0 ? h('div', { style: S.head }, '工作区干净，没有未提交的改动') : null,
            selected === null ? null : h('div', { style: S.bar },
              h('span', { style: S.dir }, selected.path),
              h('span', { style: S.spacer }),
              selected.staged === true
                ? Btn({ disabled: busy, onClick: () => run('unstage', { paths: [selected.path] }, '取消暂存中…'), children: '取消暂存' })
                : Btn({ disabled: busy, onClick: () => run('stage', { paths: [selected.path] }, '暂存中…'), children: '暂存' }),
              Btn({
                kind: 'danger',
                disabled: busy || selected.untracked === true,
                title: selected.untracked === true ? '未跟踪文件不走 restore（用回滚会走 clean 删除）' : '丢弃工作区改动',
                onClick: () => ask(`丢弃 ${selected.path} 的工作区改动？此操作不可撤销。`, () => run('discard', { paths: [selected.path] }, '回滚中…')),
                children: '回滚',
              }),
            ),
          ),
          selected === null ? null : h('div', { style: S.detail },
            h('div', { style: S.bar },
              h('span', { style: S.name, title: selected.path }, `差异 · ${selected.path}${selected.staged === true ? '（已暂存）' : (selected.untracked === true ? '（未跟踪的新文件）' : (selected.ignored === true ? '（已忽略）' : '（工作区）'))}`),
              h('span', { style: S.spacer }),
              Btn({ title: '关闭差异', onClick: () => setSelected(null), children: '×' }),
            ),
            selected.ignored === true
              ? h('div', { style: S.placeholder }, '命中 .gitignore 的文件没有可展示的差异')
              : (patchLoading === true || (patch !== null && patch !== '')
                ? DiffView({ text: patch, loading: patchLoading })
                // 列表来自快照、差异是点击时实时拉的：两者不一致时给出明确解释（面板不监听文件系统）。
                : h('div', { style: S.placeholder },
                  'Git 报告此文件当前没有差异 —— 上方列表可能已过期（面板不监听文件系统变更），点 Refresh 重新读取')),
          ),
        )
      }

      function renderCommitBox() {
        const allowWrite = config === null || config.allowWrite !== false
        return h('div', { style: S.commit },
          h('textarea', {
            style: S.area,
            placeholder: '提交信息（Commit Message）',
            value: message,
            onChange: (event) => setMessage(event.target.value),
          }),
          h('div', { style: S.hline },
            h('label', { style: S.meta },
              h('input', {
                type: 'checkbox',
                checked: amend,
                disabled: config !== null && config.allowDangerous === false,
                onChange: (event) => setAmend(event.target.checked),
              }),
              ' Amend（修补上一次提交）',
            ),
            h('span', { style: S.spacer }),
            h('span', { style: S.meta }, `${stagedPaths().length} 个文件已暂存`),
            Btn({
              kind: 'primary',
              disabled: busy || !allowWrite || message.trim() === '',
              title: allowWrite ? undefined : '写操作已被插件配置关闭（allowWrite=false）',
              onClick: () => { void commit() },
              children: busy ? '执行中…' : (amend ? 'Amend' : 'Commit'),
            }),
          ),
        )
      }

      /* -------------------------------------------------------------- Log 视图 */

      function renderCommitBody(commit) {
        const files = shown === null || !Array.isArray(shown.files) ? [] : shown.files
        const allowDangerous = config === null || config.allowDangerous !== false
        return h('div', { style: S.detailBody },
          h('div', { style: S.detailSummary },
            h('div', { style: S.meta }, `${commit.author} · ${shortDate(commit.date)}`),
            h('div', { style: { ...S.name, whiteSpace: 'normal' }, title: commit.subject }, commit.subject),
            commit.body === '' || commit.body === undefined ? null : h('pre', { style: S.pre }, commit.body),
          ),
          h('div', { style: S.bar },
            Btn({ disabled: busy || !allowDangerous, onClick: () => run('revert', { rev: commit.hash }, 'Revert 中…'), children: 'Revert' }),
            Btn({ disabled: busy || !allowDangerous, onClick: () => run('cherry-pick', { rev: commit.hash }, 'Cherry-Pick 中…'), children: 'Cherry-Pick' }),
            Btn({ disabled: busy || !allowDangerous, onClick: () => run('reset', { rev: commit.hash, mode: 'soft' }, 'Reset 中…'), children: 'Reset --soft' }),
            Btn({
              kind: 'danger',
              disabled: busy || !allowDangerous,
              onClick: () => ask(`硬重置到 ${commit.shortHash}？会丢弃工作区与暂存区的改动。`, () => run('reset', { rev: commit.hash, mode: 'hard' }, '硬重置中…')),
              children: 'Reset --hard',
            }),
            h('input', {
              ref: branchRef,
              style: S.input,
              placeholder: '新分支名（基于此提交创建，不切换）',
              value: commitBranch,
              onChange: (event) => setCommitBranch(event.target.value),
            }),
            Btn({
              kind: 'primary',
              disabled: busy || commitBranch.trim() === '',
              onClick: () => {
                void run('branch/create', { name: commitBranch.trim(), startPoint: commit.hash }, '新建分支中…')
                  .then((value) => { if (value !== null) setCommitBranch('') })
              },
              children: '新建分支',
            }),
          ),
          h('div', { style: S.head }, `变更文件 · ${files.length}　点文件查看它在这次提交里的变更`),
          h('div', { style: S.detailFiles }, files.length === 0
            ? h('div', { style: S.placeholder }, '这次提交没有文件变更')
            : files.map((file) => {
              const isOn = detailFile === file.path
              const isHover = detailHover !== null && detailHover === file.path
              return h('div', {
                key: file.path,
                style: isOn ? { ...S.detailFileRow, ...S.detailFileRowOn } : (isHover ? { ...S.detailFileRow, ...S.rowHover } : S.detailFileRow),
                title: file.path,
                onClick: () => setDetailFile(isOn ? null : file.path),
                onMouseEnter: () => setDetailHover(file.path),
                onMouseLeave: () => setDetailHover((current) => (current === file.path ? null : current)),
              },
                h('span', { style: { ...S.letter, color: STATE_COLORS[file.status.charAt(0)] || STATE_COLORS.M } }, file.status.charAt(0)),
                h('span', { style: S.name }, file.path),
                isOn ? h('span', { style: { ...S.meta, flex: 'none' } }, '收起') : null,
              )
            })),
          h('div', { style: S.detailDiff }, detailFile === null
            ? h('div', { style: S.placeholder }, '点上面的文件查看它在这次提交里的变更')
            : (fileLoading === true
              ? h('div', { style: S.placeholder }, Busy({ text: `读取 ${detailFile} 的差异…` }))
              : DiffView({ text: filePatch, loading: false }))),
        )
      }

      function renderLogDetail() {
        if (shown === null && showLoading !== true) return null
        const commit = shown === null || shown.commit === null || shown.commit === undefined ? null : shown.commit
        return h('div', { style: { ...S.detailBottom, height: `${detailHeight}px` } },
          h(RowSplitter, {
            height: detailHeight,
            onResize: (next) => setDetailHeight(Math.max(140, Math.min(720, Math.round(next)))),
          }),
          h('div', { style: S.bar },
            h('span', { style: S.meta }, '提交详情'),
            commit === null
              ? null
              : h('span', {
                style: S.hashLink,
                title: `${commit.hash}\n点击复制完整提交 ID`,
                onClick: () => copyText(commit.hash, '提交 ID'),
              }, commit.hash),
            h('span', { style: S.spacer }),
            Btn({ title: '关闭提交详情', onClick: closeDetail, children: '×' }),
          ),
          commit === null ? h('div', { style: S.placeholder }, Busy({ text: '读取提交详情…' })) : renderCommitBody(commit),
        )
      }

      /** 提交哈希 → 指向它的分支标签（本地优先，HEAD 分支置顶）；远程的 origin/HEAD 是符号引用，跳过。 */
      function logTips() {
        const map = new Map()
        const head = repo === null || typeof repo.branch !== 'string' ? '' : repo.branch
        function collect(list, kind) {
          if (!Array.isArray(list)) return
          for (const item of list) {
            if (kind === 'remote' && /(^|\/)HEAD$/.test(item.name) === true) continue
            const key = typeof item.hash === 'string' && item.hash !== '' ? item.hash : item.shortHash
            if (typeof key !== 'string' || key === '') continue
            const label = { name: item.name, kind, head: kind === 'local' && item.name === head }
            const rows = map.get(key)
            if (rows === undefined) map.set(key, [label])
            else rows.push(label)
          }
        }
        collect(branches.local, 'local')
        collect(branches.remote, 'remote')
        for (const rows of map.values()) {
          rows.sort((a, b) => (a.head === b.head ? a.name.localeCompare(b.name) : (a.head === true ? -1 : 1)))
        }
        return map
      }

      /** 取某提交的分支标签：先按完整哈希匹配，取不到再退化到短哈希。 */
      function logLabelsOf(tips, commit) {
        const byHash = tips.get(commit.hash)
        if (byHash !== undefined) return byHash
        const byShort = tips.get(commit.shortHash)
        return byShort === undefined ? [] : byShort
      }

      /** 分支名 → 调色板下标：按名字排序后取模，保证同一分支每次渲染都是同一个颜色。 */
      function logColorByName(tips) {
        const names = []
        for (const rows of tips.values()) {
          for (const label of rows) if (names.includes(label.name) === false) names.push(label.name)
        }
        names.sort((left, right) => left.localeCompare(right))
        const map = new Map()
        for (let index = 0; index < names.length; index++) map.set(names[index], index % GRAPH_COLORS.length)
        return map
      }

      /**
       * 提交 → 调色板下标：**按分支优先级多源 BFS**，而不是简单的子→父传递。
       *
       * 优先级：当前分支（HEAD 所在分支）0 > 其它本地分支 1 > 远程分支 2。
       * 先用优先级 0 的种子（当前分支 tip）沿父提交刷满整条链，再依次处理其它分支，
       * 已染色的提交不再被覆盖。于是「main: A-B-C-D，远程在 C，另有 test: C-E」里
       * A/B/C/D 全是 main 的色，只有 E 是 test 的色（即使 E 比 D 新、日志里排在前面）。
       */
      function logColorOf(tips, colorByName, headHash) {
        const groups = [[], [], []]
        for (const item of commits) {
          let best
          for (const label of logLabelsOf(tips, item)) {
            const priority = label.head === true ? 0 : (label.kind === 'local' ? 1 : 2)
            if (best === undefined || priority < best.priority) {
              best = { priority, index: colorByName.get(label.name) ?? 0 }
            }
          }
          if (best !== undefined) groups[best.priority].push({ hash: item.hash, index: best.index })
        }
        // HEAD 提交没有分支标签时（detached HEAD）也要给它所在链一个种子。
        if (groups[0].length === 0 && headHash !== null) {
          groups[0].push({ hash: headHash, index: colorByName.get(repo === null ? '' : repo.branch) ?? 0 })
        }

        const colorOf = new Map()
        const parentsOf = new Map()
        for (const item of commits) parentsOf.set(item.hash, item.parents)
        for (const group of groups) {
          const queue = group.slice()
          while (queue.length > 0) {
            const current = queue.shift()
            if (colorOf.has(current.hash) === true) continue
            colorOf.set(current.hash, current.index % GRAPH_COLORS.length)
            for (const parent of parentsOf.get(current.hash) ?? []) {
              if (colorOf.has(parent) === false) queue.push({ hash: parent, index: current.index })
            }
          }
        }
        for (const item of commits) {
          if (colorOf.has(item.hash) === false) colorOf.set(item.hash, 0)
        }
        return colorOf
      }

      /** 给标签挂上它自己分支的颜色（标签与圆点、连线同色系）。 */
      function logLabelsStyled(tips, commit, colorByName) {
        return logLabelsOf(tips, commit).map((label) => {
          const palette = GRAPH_COLORS[(colorByName.get(label.name) ?? 0) % GRAPH_COLORS.length]
          return { ...label, ring: palette.ring, fill: palette.fill }
        })
      }

      /** 提交树列宽度自适应：按最宽一行的分支标签估算（上下限 64 / 300，不可拖动）。 */
      function logGraphWidth(tips) {
        let widest = 0
        for (const item of commits) {
          let width = 0
          for (const label of logLabelsOf(tips, item)) width += glyphWidth(label.name) + 16
          if (width > widest) widest = width
        }
        return Math.max(64, Math.min(300, Math.round(18 + widest)))
      }

      /**
       * Log 视图（列顺序对齐 IDEA）：时间 · 提交树 · Message · Author · Commit。
       * 提交树列自适应且不可拖；其余四列都能拖列宽，message 被拖过之后不再自动填充剩余宽度。
       */
      function renderLog() {
        const activeHash = shown === null || shown.commit === null || shown.commit === undefined ? null : shown.commit.hash
        const last = commits.length - 1
        /** HEAD 提交：repo.oid 是精确值；拿不到时退回列表首行（git log 由新到旧，首行就是 HEAD）。 */
        const headHash = repo !== null && typeof repo.oid === 'string' && repo.oid !== ''
          ? repo.oid
          : (commits.length === 0 ? null : commits[0].hash)
        const tips = logTips()
        const colorByName = logColorByName(tips)
        const colorOf = logColorOf(tips, colorByName, headHash)
        const graphWidth = logGraphWidth(tips)
        const rowWidth = logWidths.date + graphWidth + logWidths.message + logWidths.author + logWidths.commit
        const sized = msgAuto !== true
        const rowStyle = sized ? { ...S.tr, width: `${rowWidth}px`, minWidth: '100%' } : S.tr
        const headStyle = sized ? { ...S.thead, width: `${rowWidth}px`, minWidth: '100%' } : S.thead

        function headCell(id, label, width, grow) {
          const box = grow === true
            ? { flex: '1 1 auto', minWidth: `${LOG_LIMITS[id][0]}px` }
            : { flex: `0 0 ${width}px`, width: `${width}px` }
          return h('div', { key: id, style: { ...S.th, ...box } },
            h('span', null, label),
            LOG_LIMITS[id] === undefined ? null : h(ResizeHandle, { width, onResize: (next) => resizeColumn(id, next) }),
          )
        }

        function cell(id, width, content, title, grow) {
          const box = grow === true
            ? { flex: '1 1 auto', minWidth: `${LOG_LIMITS[id][0]}px` }
            : { flex: `0 0 ${width}px`, width: `${width}px` }
          return h('div', { key: id, style: { ...S.td, ...box }, title }, content)
        }

        return h('div', { style: S.bodyStack },
          h('div', { style: S.col },
            h('div', { style: headStyle },
              headCell('date', '时间', logWidths.date),
              headCell('graph', '提交树', graphWidth),
              headCell('message', 'Message', logWidths.message, msgAuto === true),
              headCell('author', 'Author', logWidths.author),
              headCell('commit', 'Commit', logWidths.commit),
            ),
            commits.length === 0
              ? h('div', { style: S.placeholder }, '这个仓库还没有提交')
              : commits.map((item, index) => {
                const isActive = activeHash !== null && activeHash === item.hash
                const isHover = hoverHash !== null && hoverHash === item.hash
                const isMenuTarget = menu !== null && menu.hash === item.hash
                return h('div', {
                  key: item.hash,
                  style: isActive || isMenuTarget ? { ...rowStyle, ...S.rowOn } : (isHover ? { ...rowStyle, ...S.rowHover } : rowStyle),
                  title: item.subject,
                  onClick: () => openCommit(item.hash),
                  onContextMenu: (event) => openMenu(event, item),
                  onMouseEnter: () => setHoverHash(item.hash),
                  onMouseLeave: () => setHoverHash((current) => (current === item.hash ? null : current)),
                },
                cell('date', logWidths.date, shortDate(item.date), item.date),
                h(GraphCell, {
                  key: 'graph',
                  first: index === 0,
                  last: index === last,
                  filled: headHash !== null && headHash === item.hash,
                  labels: logLabelsStyled(tips, item, colorByName),
                  ring: GRAPH_COLORS[colorOf.get(item.hash) ?? 0].ring,
                  line: GRAPH_COLORS[colorOf.get(item.hash) ?? 0].line,
                  width: graphWidth,
                }),
                cell('message', logWidths.message, item.subject, item.subject, msgAuto === true),
                cell('author', logWidths.author, item.author, item.author),
                cell('commit', logWidths.commit, h('span', {
                  style: S.hashLink,
                  title: `${item.hash}\n点击复制完整提交 ID`,
                  onClick: (event) => { event.stopPropagation(); copyText(item.hash, '提交 ID') },
                }, item.shortHash)),
                )
              }),
          ),
          renderLogDetail(),
        )
      }

      /* ---------------------------------------------------------- 其它视图 */

      function renderConsole() {
        if (commands.length === 0) return h('div', { style: S.placeholder }, '还没有执行过 git 命令')
        return h('div', { style: S.bodyCol }, commands.map((row, index) => {
          const argv = Array.isArray(row.argv) ? row.argv.join(' ') : String(row.argv)
          const bad = row.exitCode !== 0
          return h('div', {
            key: index,
            style: { ...S.row, alignItems: 'flex-start', whiteSpace: 'normal', cursor: 'default' },
          },
            h('span', { style: { ...S.meta, color: bad ? '#ef4444' : '#22c55e', flex: 'none' } }, row.exitCode === 0 ? '0' : String(row.exitCode)),
            h('span', { style: { ...S.meta, flex: 'none' } }, `${row.durationMs}ms`),
            h('span', { style: { ...S.name, fontFamily: MONO, whiteSpace: 'pre-wrap' } }, argv),
            row.truncated === true ? h('span', { style: { ...S.meta, color: '#ef4444' } }, '（输出被截断）') : null,
            bad && typeof row.stderr === 'string' && row.stderr !== '' ? h('span', { style: { ...S.pre, color: '#ef4444' } }, row.stderr) : null,
          )
        }))
      }

      /** 从某个本地分支的 upstream（形如 origin/main）取出远程名；没有 upstream 时给 origin。 */
      function remoteOfBranch(item) {
        const upstream = typeof item.upstream === 'string' ? item.upstream : ''
        const at = upstream.indexOf('/')
        return at > 0 ? upstream.slice(0, at) : 'origin'
      }

      function renderBranches() {
        const head = repo === null ? '' : repo.branch
        const allowWrite = config === null || config.allowWrite !== false
        const allowDangerous = config === null || config.allowDangerous !== false
        // push 与工具栏同一道门禁（默认关闭），推送入口按分支给出。
        const allowPush = config !== null && config.allowPush === true
        const pushOffTitle = config === null
          ? '插件配置还没读到（等首次快照完成）'
          : 'push 已被插件配置关闭（allowPush=false）'
        function group(title, list, isLocal) {
          return h('div', { key: title },
            h('div', { style: S.head }, `${title} · ${list.length}`),
            list.map((item) => {
              const isHead = isLocal && item.name === head
              const noUpstream = typeof item.upstream !== 'string' || item.upstream === ''
              const remote = remoteOfBranch(item)
              return h('div', {
                key: `${item.kind}:${item.name}`,
                style: isHead ? { ...S.row, ...S.rowOn } : S.row,
                title: item.subject,
              },
                h('span', { style: { ...S.letter, color: isHead ? '#22c55e' : '#9ca3af' } }, isHead ? '*' : '+'),
                h('span', { style: S.name }, item.name),
                item.upstream === '' ? null : h('span', { style: S.dir }, ` → ${item.upstream}`),
                h('span', { style: S.spacer }),
                // 推送：本地分支才有意义；没有 upstream 时走 --set-upstream，省得回终端设跟踪关系。
                isLocal ? Btn({
                  kind: 'primary',
                  disabled: busy || allowPush !== true,
                  title: allowPush !== true
                    ? pushOffTitle
                    : (noUpstream ? `git push --set-upstream ${remote} ${item.name}` : `git push ${remote} ${item.name}`),
                  onClick: () => run(
                    'push',
                    noUpstream ? { branch: item.name, remote, setUpstream: true } : { branch: item.name, remote },
                    noUpstream ? '推送并设置 upstream 中…' : '推送中…',
                  ),
                  children: noUpstream ? '推送并设 upstream' : '推送',
                }) : null,
                isHead ? null : Btn({ disabled: busy || !allowWrite, onClick: () => run('checkout', { ref: item.name }, '切换分支中…'), children: '切换' }),
                isHead ? null : Btn({ disabled: busy || !allowWrite, onClick: () => run('merge', { ref: item.name }, '合并中…'), children: '合并' }),
                isLocal && !isHead ? Btn({
                  kind: 'danger',
                  disabled: busy || !allowDangerous,
                  onClick: () => ask(`删除分支 ${item.name}？未合并的提交会丢失。`, () => run('branch/delete', { name: item.name, force: true }, '删除分支中…')),
                  children: '删除',
                }) : null,
              )
            }),
          )
        }
        return h('div', { style: S.bodyCol },
          h('div', { style: S.bar },
            h('input', {
              style: S.input,
              placeholder: '新分支名（基于当前 HEAD，新建并切换）',
              value: newBranch,
              onChange: (event) => setNewBranch(event.target.value),
            }),
            Btn({
              kind: 'primary',
              disabled: busy || !allowWrite || newBranch.trim() === '',
              onClick: () => {
                void run('checkout', { ref: newBranch.trim(), create: true }, '新建分支中…')
                  .then((value) => { if (value !== null) setNewBranch('') })
              },
              children: '新建并切换',
            }),
          ),
          h('div', { style: S.bar },
            h('span', { style: S.dir }, allowPush === true
              ? '本地分支行可「推送」到它的 upstream；没有 upstream 的行会带 --set-upstream'
              : '推送已关闭（allowPush=false）：需要时在 cordis.patch.yml 里打开'),
          ),
          group('本地分支', branches.local, true),
          group('远程分支', branches.remote, false),
        )
      }

      function renderRemotes() {
        const list = remotes === null ? [] : remotes
        const allowWrite = config === null || config.allowWrite !== false
        if (remoteLoading || remotes === null) return h('div', { style: S.placeholder }, Busy({ text: '读取远程仓库（git remote -v）…' }))
        return h('div', { style: S.bodyCol },
          h('div', { style: S.bar },
            h('input', {
              style: { ...S.input, flex: 'none', width: '110px' },
              placeholder: 'Remote 名',
              spellCheck: false,
              value: remoteName,
              onChange: (event) => setRemoteName(event.target.value),
            }),
            h('input', {
              style: S.input,
              placeholder: 'URL（fetch）',
              spellCheck: false,
              value: remoteUrl,
              onChange: (event) => setRemoteUrl(event.target.value),
            }),
            h('input', {
              style: S.input,
              placeholder: 'Push URL（可选，留空 = 与 fetch 相同）',
              spellCheck: false,
              value: remotePush,
              onChange: (event) => setRemotePush(event.target.value),
            }),
            Btn({
              kind: 'primary',
              disabled: busy || !allowWrite || remoteName.trim() === '' || remoteUrl.trim() === '',
              title: !allowWrite ? '写操作已被插件配置关闭（allowWrite=false）' : undefined,
              onClick: () => {
                const name = remoteName.trim()
                const url = remoteUrl.trim()
                const push = remotePush.trim()
                const payload = { name, url, ...(push === '' ? {} : { push }) }
                void run('remote/add', payload, '添加远程中…').then((value) => {
                  if (value !== null) {
                    setRemoteName('')
                    setRemoteUrl('')
                    setRemotePush('')
                    // 触发 Remotes 页 useEffect 重拉列表
                    setTick((n) => n + 1)
                  }
                })
              },
              children: 'Add Remote',
            }),
          ),
          list.length === 0 ? h('div', { style: S.head }, '没有配置任何远程仓库（git remote -v 为空）') : h('div', { style: S.head }, `远程仓库 · ${list.length}`),
          list.map((item) => h('div', { key: item.name, style: S.remoteRow },
            h('span', { style: { ...S.letter, color: '#3b82f6', flex: 'none' } }, '◆'),
            h('div', { style: S.remoteCol },
              h('span', { style: S.name }, item.name),
              h('span', { style: { ...S.meta, ...S.wrap } }, `fetch: ${item.fetch === '' ? '—' : item.fetch}`),
              h('span', { style: { ...S.meta, ...S.wrap } }, `push:  ${item.push === '' ? '—' : item.push}`),
            ),
            h('span', { style: S.spacer }),
            Btn({
              kind: 'danger',
              disabled: busy || !allowWrite,
              title: !allowWrite ? '写操作已被插件配置关闭（allowWrite=false）' : '删除远程',
              onClick: () => ask(`删除远程 ${item.name}？此操作不会影响本地分支。`, () => run('remote/remove', { name: item.name }, '删除远程中…').then((value) => {
                if (value !== null) setTick((n) => n + 1)
              })),
              children: 'Remove',
            }),
          )),
        )
      }

      function renderStash() {
        const allowWrite = config === null || config.allowWrite !== false
        return h('div', { style: S.bodyCol },
          h('div', { style: S.bar },
            h('input', {
              style: S.input,
              placeholder: 'Stash 说明（可选）',
              value: stashMessage,
              onChange: (event) => setStashMessage(event.target.value),
            }),
            Btn({
              kind: 'primary',
              disabled: busy || !allowWrite,
              onClick: () => run('stash', { action: 'push', message: stashMessage }, 'Stash 中…'),
              children: '暂存当前改动',
            }),
          ),
          stashes.length === 0 ? h('div', { style: S.head }, '没有 stash 记录') : null,
          stashes.map((item) => h('div', { key: item.ref, style: S.row, title: item.date },
            h('span', { style: { ...S.meta, flex: 'none' } }, item.ref),
            h('span', { style: S.name }, item.subject),
            h('span', { style: S.spacer }),
            Btn({ disabled: busy || !allowWrite, onClick: () => run('stash', { action: 'apply', ref: item.ref }, '应用 Stash 中…'), children: '应用' }),
            Btn({ disabled: busy || !allowWrite, onClick: () => run('stash', { action: 'pop', ref: item.ref }, '弹出 Stash 中…'), children: '弹出' }),
            Btn({
              kind: 'danger',
              disabled: busy || !allowWrite,
              onClick: () => ask(`删除 ${item.ref}？`, () => run('stash', { action: 'drop', ref: item.ref }, '删除 Stash 中…')),
              children: '删除',
            }),
          )),
        )
      }

      const TABS = [
        { id: 'changes', label: 'Local Changes' },
        { id: 'log', label: 'Log' },
        { id: 'console', label: 'Console' },
        { id: 'branches', label: 'Branches' },
        { id: 'remotes', label: 'Remotes' },
        { id: 'stash', label: 'Stash' },
      ]

      const total = entries().length
      const branchLabel = repo === null ? '（未加载）' : (repo.detached === true ? 'DETACHED' : repo.branch)

      return h('div', { style: S.root, ref: rootRef },
        busy ? h('div', { style: S.busyBar }) : null,
        h('div', { style: S.bar },
          h('input', {
            style: S.input,
            placeholder: '仓库路径（会话工作目录）',
            spellCheck: false,
            value: cwd,
            onChange: (event) => setCwd(event.target.value),
          }),
          Btn({
            disabled: busy || cwd.trim() === '',
            onClick: () => { setApplied(cwd.trim()); closeDetail() },
            children: '打开仓库',
          }),
        ),
        h('div', { style: S.bar },
          h('button', { style: S.chip, title: '查看 / 切换分支', onClick: () => setTab('branches') },
            h(GitGlyph, { size: 14 }),
            branchLabel,
          ),
          repo === null || (repo.ahead === 0 && repo.behind === 0) ? null : h('span', { style: S.meta }, `↑${repo.ahead} ↓${repo.behind}`),
          h('span', { style: S.spacer }),
          Btn({ disabled: busy || applied === '', onClick: () => setTick((n) => n + 1), children: 'Refresh' }),
          Btn({ disabled: busy || applied === '' || config !== null && config.allowWrite === false, onClick: () => run('fetch', {}, 'Fetch 中…'), children: 'Fetch' }),
          Btn({ disabled: busy || applied === '' || config !== null && config.allowWrite === false, onClick: () => run('pull', {}, 'Update Project 中…'), children: 'Update Project' }),
          Btn({
            disabled: busy || applied === '' || config === null || config.allowPush !== true,
            title: config !== null && config.allowPush !== true ? 'push 已被插件配置关闭（allowPush=false）' : '推送到远程',
            onClick: () => run('push', {}, 'Push 中…'),
            children: 'Push',
          }),
        ),
        error === null ? null : h('div', { style: S.banner }, errorText(error)),
        notice === null ? null : h('div', { style: notice.bad === true ? { ...S.toast, ...S.toastBad } : S.toast }, notice.text),
        h('div', { style: S.tabs }, TABS.map((item) => h('button', {
          key: item.id,
          style: tab === item.id ? { ...S.tab, ...S.tabOn } : S.tab,
          onClick: () => setTab(item.id),
        }, item.label))),
        loading
          ? h('div', { style: S.placeholder }, applied === ''
            ? '填写仓库路径后点「打开仓库」（默认取当前会话工作目录）'
            : Busy({ text: '正在读取仓库（status / log / branches / stash）…' }))
          : h('div', { style: { ...S.bodyCol, display: 'flex', flexDirection: 'column' } },
            tab === 'changes' ? renderChanges() : null,
            tab === 'log' ? renderLog() : null,
            tab === 'console' ? renderConsole() : null,
            tab === 'branches' ? renderBranches() : null,
            tab === 'remotes' ? renderRemotes() : null,
            tab === 'stash' ? renderStash() : null,
            tab === 'changes' ? renderCommitBox() : null,
          ),
        confirm === null ? null : h('div', { style: S.confirm },
          h('span', { style: S.spacer }, confirm.label),
          Btn({
            kind: 'danger',
            onClick: () => { const job = confirm.run; setConfirm(null); void job() },
            children: '确认执行',
          }),
          Btn({ onClick: () => setConfirm(null), children: '取消' }),
        ),
        h('div', { style: S.foot },
          busy ? Busy({ text: busyLabel === '' ? '处理中…' : busyLabel }) : null,
          h('span', null, repo === null ? '—' : repo.root),
          h('span', null, repo === null || repo.remoteUrl === '' ? '无远程' : repo.remoteUrl),
          h('span', null, `${total} 处改动`),
          lastMs === null ? null : h('span', null, `上次操作 ${lastMs} ms`),
          h('span', null, `${commands.length} 条命令`),
          h('span', { style: { marginLeft: 'auto' } }, '提交行右键打开操作菜单'),
        ),
        renderMenu(),
      )
    }

    /** tab chip 与浮窗标题：单行不折行、给足最小宽度，避免被裁。 */
    function GitTitle() {
      return h('span', { style: S.title }, h(GitGlyph, { size: 14 }), h('span', null, '版本管理'))
    }

    /* --------------------------------------------------------------- 插件入口 */

    /**
     * 浏览器半区必需的 Cordis 服务：
     *   slots            —— 注册 tab 正文与标题（sidebar.right.pane.tab / .title）
     *   sidebarRightTabs —— 注册 tab 类型与引导页入口
     *   connection       —— 调 host 的 /git-vcs RPC 通道
     */
    const inject = ['slots', 'sidebarRightTabs', 'connection']

    /**
     * 注册：类型（阶段一）、正文（阶段二）、标题（阶段三）。
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
          description: () => '参照 IDEA 的版本管理：本地变更、提交、历史、分支、远程与命令流水',
          icon: GitGlyph,
        }],
      }), 'dsh-git-vcs: tab type')

      // 组件拿不到 ctx：host 调用经注入工厂闭包捕获后交给组件。
      const face = () => ({
        call: (endpoint, payload) => ctx.connection.rpc.call(CHANNEL, endpoint, payload),
      })

      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: PKG_ID,
        inject: face,
      }, GitBody)), 'dsh-git-vcs: tab body')

      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab.title',
        key: PKG_ID,
      }, GitTitle)), 'dsh-git-vcs: tab title')
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
