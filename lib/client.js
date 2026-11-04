/**
 * dsh-preview-theme-dark - browser half (standalone dark-mode plugin).
 *
 * This package started as a fork of the MIT-licensed dsh-preview-theme and adds
 * a one-click light/dark header switch, system-appearance following and a
 * separate light/dark palette memory, then republishes them under its own
 * package name so it can be installed on any DSH 0.2.x machine.
 *
 * What it does
 * ------------
 * Adds two controls to the built-in document preview header and restyles the
 * PDF / Word / Excel preview "paper":
 *
 *   - a one-click light/dark switch (sun / moon) that flips the preview
 *     between the remembered light and dark palettes, and
 *   - the palette popover, which also carries a "follow the system theme"
 *     switch (prefers-color-scheme) and the manual paper colors.
 *
 *   1. Paper color. The shipped preview paints its backdrop with the theme
 *      token --dsw-alias-bg-document-preview. We override that token through
 *      ctx.theme.overrideTokens (the official third-party hook; the presenter
 *      writes it as an inline custom property on <body>, so no stylesheet
 *      specificity fight and no rebuild of the shipped CSS is needed).
 *
 *   2. Page content. PDF/Word render into <canvas> pages; Excel renders a
 *      FortuneSheet canvas plus DOM chrome. A pure CSS filter + blend turns
 *      the pages over:
 *
 *        light paper: canvas { mix-blend-mode: multiply }
 *            white page x paper color = paper color, black text stays black
 *        dark paper:  canvas { filter: invert(1) hue-rotate(180deg);
 *                              mix-blend-mode: screen }
 *            white page -> black -> paper color, black text -> white,
 *            the hue rotation keeps colored charts/images roughly recognizable
 *
 *      Excel uses the same trick on the section's direct children so the grid,
 *      the formula bar and the sheet tabs all follow along.
 *
 * The stable hooks are the data attributes written by the shipped package
 * @deepseek-ai/dsh-client-ui-sidebar-documentpreview (DSH 0.2.x):
 *
 *   [data-textpreview-body]  the preview scrollport (header is a sibling)
 *   [data-pdf-preview]       the PDF / converted-Word / converted-PowerPoint body
 *   [data-pdf-page] [data-pdf-text]  one page and its selectable text layer
 *   [data-excel-preview]     the spreadsheet body
 *
 * Nothing is read from disk, fetched or rewritten: this is a display-only
 * transform, and switching back to 原色 removes every trace.
 *
 * Loading model
 * -------------
 * @deepseek-ai/dsh-client-modules executes this file lazily and calls the
 * factory below; the returned object is a normal Cordis client plugin
 * ({ apply, inject }). No bundler is involved, so the file is plain ES2022 and
 * React.createElement (no JSX, no template literals).
 *
 * @module dsh-preview-theme-dark/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-preview-theme-dark',
  factory: (require) => {
    'use strict'

    const React = require('react')
    const h = React.createElement

    /**
     * react-dom is used only for a body portal so the popover escapes the
     * header's overflow clipping. If the module is not part of the shared
     * module table the popover still renders inline (position: fixed).
     */
    let createPortal = null
    try {
      const reactDom = require('react-dom')
      if (reactDom !== null && typeof reactDom.createPortal === 'function') createPortal = reactDom.createPortal
    } catch (_error) {
      createPortal = null
    }

    /** Locale namespace registered through ctx.locale. */
    const NS = 'preview-theme-dark'
    /** localStorage key; survives window reloads and app restarts. */
    const STORAGE_KEY = 'dsh-preview-theme-dark:v1'
    /**
     * Key written by the upstream plugin / earlier local fork. Read once when
     * the new key is absent so a first run here keeps the user's palette, then
     * every later write goes to STORAGE_KEY and the two plugins stay apart.
     */
    const LEGACY_STORAGE_KEY = 'dsh-preview-theme:v1'
    /** The single styled element this plugin owns. */
    const STYLE_ID = 'dsh-preview-theme-dark/style'
    /** <html> attribute that switches the stylesheet on: "dark" or "light". */
    const THEME_ATTR = 'data-dsh-preview-theme-dark'
    /** Browser cross-document custom property carrying the invert/brightness filter. */
    const FILTER_VAR = '--dsh-preview-dark-filter'
    /** The registry id of this plugin's header action. */
    const ACTION_ID = 'preview-theme-dark'
    /** The document-preview header action seat (list child slot). */
    const ACTION_SEAT = 'sidebar.right.tab.document.actions'
    /** Theme-token override layer id. */
    const TOKEN_SOURCE = 'dsh-preview-theme-dark'

    /** The paper-color token consumed by [data-pdf-preview] and friends. */
    const PAPER_TOKEN = '--dsw-alias-bg-document-preview'
    /** Status/empty text token that must stay legible on the chosen paper. */
    const LABEL_TOKEN = '--dsw-alias-label-document-preview'

    /** Preview extensions this plugin is offered for. */
    const SUPPORTED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xlsx', 'xls', 'csv', 'tsv'])

    /** Factory defaults. `mode: 'system'` follows prefers-color-scheme. */
    const DEFAULT_STATE = {
      mode: 'manual',
      preset: 'off',
      custom: '#1f2126',
      brightness: 100,
      lastDark: 'black',
      lastLight: 'off'
    }

    /**
     * Every selectable paper theme.
     *
     * kind:
     *   'off'   - do nothing (original white pages on the app backdrop)
     *   'light' - light paper: multiply blend keeps dark text dark
     *   'dark'  - dark paper: invert + screen blend turns text light
     *   'auto'  - the custom color decides by luminance
     */
    const PRESETS = [
      { id: 'off', kind: 'off' },
      { id: 'black', kind: 'dark', color: '#000000' },
      { id: 'ink', kind: 'dark', color: '#0b0f14' },
      { id: 'charcoal', kind: 'dark', color: '#1f2126' },
      { id: 'midnight', kind: 'dark', color: '#101b2d' },
      { id: 'forest', kind: 'dark', color: '#101f17' },
      { id: 'sepia', kind: 'light', color: '#f4ecd8' },
      { id: 'sage', kind: 'light', color: '#cce8cf' },
      { id: 'sky', kind: 'light', color: '#dbe7f5' },
      { id: 'rose', kind: 'light', color: '#f6e3e5' },
      { id: 'custom', kind: 'auto' }
    ]

    /** Simplified-Chinese dictionary (the primary audience of this plugin). */
    const ZH = {
      title: '预览背景',
      subtitle: '只作用于 PDF / Word / Excel 预览',
      close: '关闭',
      custom: '自定义',
      brightness: '亮度',
      hint: '只改变显示，不改动文件；返回「原色」即完全还原。',
      reset: '恢复默认',
      'mode.dark': '深色',
      'mode.light': '浅色',
      'mode.toDark': '切换到深色',
      'mode.toLight': '切换到浅色',
      system: '跟随系统',
      'system.on': '跟随系统外观',
      'system.off': '手动选择',
      'preset.off': '原色',
      'preset.black': '纯黑',
      'preset.ink': '墨黑',
      'preset.charcoal': '深灰',
      'preset.midnight': '午夜蓝',
      'preset.forest': '墨绿',
      'preset.sepia': '护眼米黄',
      'preset.sage': '豆沙绿',
      'preset.sky': '淡蓝',
      'preset.rose': '淡粉',
      'preset.custom': '自定义'
    }

    /** English dictionary. */
    const EN = {
      title: 'Preview background',
      subtitle: 'PDF / Word / Excel previews only',
      close: 'Close',
      custom: 'Custom',
      brightness: 'Brightness',
      hint: 'Display only - the file is never modified. Choose Original to undo.',
      reset: 'Reset',
      'mode.dark': 'Dark',
      'mode.light': 'Light',
      'mode.toDark': 'Switch to dark',
      'mode.toLight': 'Switch to light',
      system: 'Follow system',
      'system.on': 'Following the system appearance',
      'system.off': 'Manual',
      'preset.off': 'Original',
      'preset.black': 'Black',
      'preset.ink': 'Ink',
      'preset.charcoal': 'Charcoal',
      'preset.midnight': 'Midnight',
      'preset.forest': 'Forest',
      'preset.sepia': 'Sepia',
      'preset.sage': 'Sage',
      'preset.sky': 'Sky',
      'preset.rose': 'Rose',
      'preset.custom': 'Custom'
    }

    // ------------------------------------------------------------------
    // Small helpers
    // ------------------------------------------------------------------

    /**
     * Clamp a number into [min, max].
     * @param {number} value - candidate.
     * @param {number} min - lower bound.
     * @param {number} max - upper bound.
     * @returns {number} clamped value.
     */
    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value))
    }

    /**
     * Normalize a CSS hex color (#abc / #aabbcc / without hash) to #aabbcc.
     * @param {unknown} value - candidate string.
     * @returns {string|null} normalized lowercase hex, or null when invalid.
     */
    function normalizeHex(value) {
      if (typeof value !== 'string') return null
      let text = value.trim()
      if (text === '') return null
      if (!/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(text)) return null
      if (text.charAt(0) !== '#') text = '#' + text
      if (text.length === 4) text = '#' + text.charAt(1) + text.charAt(1) + text.charAt(2) + text.charAt(2) + text.charAt(3) + text.charAt(3)
      return text.toLowerCase()
    }

    /**
     * Relative luminance (WCAG) of a normalized hex color.
     * @param {string} hex - #rrggbb.
     * @returns {number} 0 (black) .. 1 (white).
     */
    function luminance(hex) {
      const value = parseInt(hex.slice(1), 16)
      const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
      const linear = channels.map((channel) => {
        const c = channel / 255
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
      })
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
    }

    /**
     * Lowercase extension of a host path (empty for dotfiles).
     * @param {string} path - absolute host path.
     * @returns {string} extension without the dot.
     */
    function fileExtension(path) {
      const name = path.slice(path.lastIndexOf('/') + 1)
      const dot = name.lastIndexOf('.')
      return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
    }

    /**
     * Whether the preview of this path is one this plugin can restyle.
     * @param {unknown} path - the header action's absolutePath prop.
     * @returns {boolean} true for PDF / Word / PowerPoint / spreadsheet previews.
     */
    function supportsFile(path) {
      return typeof path === 'string' && path !== '' && SUPPORTED_EXTENSIONS.has(fileExtension(path))
    }

    /**
     * Whether the operating system currently asks for a dark appearance.
     * @returns {boolean} true for prefers-color-scheme: dark.
     */
    function systemPrefersDark() {
      try {
        return typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches
      } catch (_error) {
        return false
      }
    }

    /**
     * The preset id a state resolves to right now (system mode swaps palettes).
     * @param {{mode: string, preset: string, lastDark: string, lastLight: string}} state - current state.
     * @returns {string} one of the PRESETS ids.
     */
    function resolvedPresetId(state) {
      if (state.mode === 'system') return systemPrefersDark() ? state.lastDark : state.lastLight
      return state.preset
    }

    /**
     * The light/dark class of a preset, folding the custom colour by luminance.
     * @param {string} presetId - one of the PRESETS ids.
     * @param {string} custom - normalized custom hex used by the 'auto' preset.
     * @returns {'off'|'light'|'dark'} appearance class.
     */
    function presetKind(presetId, custom) {
      const preset = PRESETS.find((item) => item.id === presetId) || PRESETS[0]
      if (preset.kind !== 'auto') return preset.kind
      return luminance(normalizeHex(custom) || DEFAULT_STATE.custom) < 0.42 ? 'dark' : 'light'
    }

    /**
     * Read the persisted preference, falling back to defaults on any garbage.
     * v1 records (no `mode` / `lastDark` / `lastLight`) are upgraded in place:
     * their current preset becomes the remembered palette of its own class.
     * When this plugin has never stored anything, the legacy key used by the
     * upstream package is read once and re-saved under STORAGE_KEY.
     * @returns {typeof DEFAULT_STATE} sanitized state.
     */
    function loadState() {
      try {
        let raw = window.localStorage.getItem(STORAGE_KEY)
        let migrated = false
        if (raw === null) {
          raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
          migrated = raw !== null
        }
        if (raw === null) return Object.assign({}, DEFAULT_STATE)
        const parsed = JSON.parse(raw)
        const preset = PRESETS.some((item) => item.id === parsed.preset) ? parsed.preset : DEFAULT_STATE.preset
        const custom = normalizeHex(parsed.custom) || DEFAULT_STATE.custom
        const brightness = clamp(Number(parsed.brightness) || DEFAULT_STATE.brightness, 70, 120)
        const mode = parsed.mode === 'system' ? 'system' : 'manual'
        const kind = presetKind(preset, custom)
        const lastDark = PRESETS.some((item) => item.id === parsed.lastDark && presetKind(item.id, custom) === 'dark')
          ? parsed.lastDark
          : (kind === 'dark' ? preset : DEFAULT_STATE.lastDark)
        const lastLight = PRESETS.some((item) => item.id === parsed.lastLight && presetKind(item.id, custom) === 'light')
          ? parsed.lastLight
          : (kind === 'light' ? preset : DEFAULT_STATE.lastLight)
        const next = { mode, preset, custom, brightness, lastDark, lastLight }
        // A v1 record predates mode/lastDark/lastLight, and a legacy-key record
        // predates this plugin's own storage key: write the upgraded shape back
        // once so the next read starts from the same state.
        if (migrated || parsed.mode === undefined || parsed.lastDark === undefined || parsed.lastLight === undefined) persistState(next)
        return next
      } catch (_error) {
        return Object.assign({}, DEFAULT_STATE)
      }
    }

    /**
     * Persist one state object; storage failures must never break the UI.
     * @param {typeof DEFAULT_STATE} state - current state.
     * @returns {void}
     */
    function persistState(state) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch (_error) {
        // Private mode / disabled storage: keep the in-memory state only.
      }
    }

    /**
     * Resolve a state into the concrete CSS recipe.
     * @param {typeof DEFAULT_STATE} state - current state.
     * @returns {{mode: 'off'|'dark'|'light', color?: string, filter?: string, brightness?: number}} recipe.
     */
    function resolveScheme(state) {
      const preset = PRESETS.find((item) => item.id === resolvedPresetId(state)) || PRESETS[0]
      if (preset.kind === 'off') return { mode: 'off' }
      const custom = normalizeHex(state.custom) || DEFAULT_STATE.custom
      const color = preset.kind === 'auto' ? custom : preset.color
      const mode = preset.kind === 'auto' ? (luminance(color) < 0.42 ? 'dark' : 'light') : preset.kind
      const brightness = clamp(Number(state.brightness) || 100, 70, 120) / 100
      const filter = mode === 'dark'
        ? 'invert(1) hue-rotate(180deg)' + (brightness === 1 ? '' : ' brightness(' + brightness + ')')
        : ''
      return { mode, color, filter, brightness }
    }

    // ------------------------------------------------------------------
    // Stylesheet (preview recipe + the header control's own chrome)
    // ------------------------------------------------------------------

    const CSS_TEXT = [
      '/* ==== preview recipe: paper token + page blend ==== */',
      'html[' + THEME_ATTR + '] [data-pdf-preview],',
      'html[' + THEME_ATTR + '] [data-excel-preview] {',
      '  isolation: isolate;',
      '  background: var(' + PAPER_TOKEN + ') !important;',
      '}',
      'html[' + THEME_ATTR + '="dark"] [data-pdf-preview] canvas {',
      '  filter: var(' + FILTER_VAR + ', invert(1) hue-rotate(180deg));',
      '  mix-blend-mode: screen;',
      '}',
      'html[' + THEME_ATTR + '="light"] [data-pdf-preview] canvas {',
      '  mix-blend-mode: multiply;',
      '}',
      'html[' + THEME_ATTR + '="dark"] [data-excel-preview] > :not(style) {',
      '  filter: var(' + FILTER_VAR + ', invert(1) hue-rotate(180deg));',
      '  mix-blend-mode: screen;',
      '}',
      'html[' + THEME_ATTR + '="light"] [data-excel-preview] > :not(style) {',
      '  mix-blend-mode: multiply;',
      '}',
      '/* Inverse-mode page shadows glow on a dark paper; keep a quiet edge instead. */',
      'html[' + THEME_ATTR + '="dark"] [data-pdf-preview] [data-document-zoom-surface] {',
      '  box-shadow: none;',
      '}',
      '',
      '/* ==== the header control ==== */',
      '.dsh-ptd-trigger {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  width: 26px;',
      '  height: 26px;',
      '  margin: 0 2px;',
      '  padding: 0;',
      '  border: 0;',
      '  border-radius: 6px;',
      '  background: transparent;',
      '  color: var(--dsw-alias-label-secondary, #9aa0a6);',
      '  cursor: pointer;',
      '  transition: background 120ms ease, color 120ms ease;',
      '}',
      '.dsh-ptd-trigger:hover {',
      '  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14));',
      '  color: var(--dsw-alias-label-primary, #e8eaed);',
      '}',
      '.dsh-ptd-trigger[data-active="true"] { color: var(--dsw-alias-label-primary, #e8eaed); }',
      '.dsh-ptd-trigger:focus-visible {',
      '  outline: 2px solid var(--dsw-alias-label-link, #6aa6ff);',
      '  outline-offset: 1px;',
      '}',
      '/* One-click light/dark switch; the glyph is the side you would switch to. */',
      '.dsh-ptd-mode {',
      '  display: inline-flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  width: 26px;',
      '  height: 26px;',
      '  margin: 0 2px 0 0;',
      '  padding: 0;',
      '  border: 0;',
      '  border-radius: 6px;',
      '  background: transparent;',
      '  color: var(--dsw-alias-label-secondary, #9aa0a6);',
      '  cursor: pointer;',
      '  transition: background 120ms ease, color 120ms ease;',
      '}',
      '.dsh-ptd-mode:hover {',
      '  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14));',
      '  color: var(--dsw-alias-label-primary, #e8eaed);',
      '}',
      '.dsh-ptd-mode[data-mode="dark"] { color: var(--dsw-alias-label-primary, #e8eaed); }',
      '.dsh-ptd-mode:focus-visible {',
      '  outline: 2px solid var(--dsw-alias-label-link, #6aa6ff);',
      '  outline-offset: 1px;',
      '}',
      '.dsh-ptd-panel {',
      '  position: fixed;',
      '  z-index: 2147483000;',
      '  width: 300px;',
      '  box-sizing: border-box;',
      '  padding: 12px;',
      '  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.24));',
      '  border-radius: 14px;',
      '  background: var(--dsw-alias-bg-layer-2, #24262b);',
      '  color: var(--dsw-alias-label-primary, #eceff3);',
      '  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);',
      '  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);',
      '  font-size: 12px;',
      '  line-height: 1.4;',
      '  user-select: none;',
      '  -webkit-user-select: none;',
      '}',
      '.dsh-ptd-head { display: flex; align-items: flex-start; gap: 8px; }',
      '.dsh-ptd-heading { flex: 1; min-width: 0; }',
      '.dsh-ptd-title { font-size: 13px; font-weight: 600; }',
      '.dsh-ptd-sub { margin-top: 2px; color: var(--dsw-alias-label-secondary, #a3a9b0); font-size: 11px; }',
      '.dsh-ptd-close {',
      '  flex: none;',
      '  width: 22px;',
      '  height: 22px;',
      '  padding: 0;',
      '  border: 0;',
      '  border-radius: 6px;',
      '  background: transparent;',
      '  color: var(--dsw-alias-label-secondary, #a3a9b0);',
      '  font-size: 16px;',
      '  line-height: 1;',
      '  cursor: pointer;',
      '}',
      '.dsh-ptd-close:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14)); color: var(--dsw-alias-label-primary, #eceff3); }',
      '.dsh-ptd-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-top: 10px; }',
      '.dsh-ptd-swatch {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  gap: 5px;',
      '  padding: 7px 2px 6px;',
      '  border: 1px solid transparent;',
      '  border-radius: 9px;',
      '  background: transparent;',
      '  color: inherit;',
      '  font: inherit;',
      '  cursor: pointer;',
      '}',
      '.dsh-ptd-swatch:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14)); }',
      '.dsh-ptd-swatch[data-active="true"] {',
      '  border-color: var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.4));',
      '  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));',
      '}',
      '.dsh-ptd-dot {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  width: 20px;',
      '  height: 20px;',
      '  border-radius: 50%;',
      '  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(128, 128, 128, 0.35);',
      '}',
      '.dsh-ptd-swatch[data-active="true"] .dsh-ptd-dot {',
      '  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12), 0 0 0 2px var(--dsw-alias-label-link, #6aa6ff);',
      '}',
      '.dsh-ptd-dot-off { background: transparent; color: var(--dsw-alias-label-secondary, #a3a9b0); }',
      '.dsh-ptd-label {',
      '  max-width: 100%;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  white-space: nowrap;',
      '  font-size: 11px;',
      '  color: var(--dsw-alias-label-secondary, #a3a9b0);',
      '}',
      '.dsh-ptd-swatch[data-active="true"] .dsh-ptd-label { color: var(--dsw-alias-label-primary, #eceff3); }',
      '.dsh-ptd-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }',
      '.dsh-ptd-row-label { flex: none; color: var(--dsw-alias-label-secondary, #a3a9b0); }',
      '/* "Follow the system appearance" switch, first row of the popover. */',
      '.dsh-ptd-system {',
      '  justify-content: space-between;',
      '  padding-bottom: 10px;',
      '  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.2));',
      '}',
      '.dsh-ptd-system-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }',
      '.dsh-ptd-system-state { color: var(--dsw-alias-label-tertiary, #8b9199); font-size: 10.5px; }',
      '.dsh-ptd-switch {',
      '  flex: none;',
      '  position: relative;',
      '  width: 34px;',
      '  height: 20px;',
      '  padding: 0;',
      '  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.4));',
      '  border-radius: 999px;',
      '  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.16));',
      '  cursor: pointer;',
      '  transition: background 120ms ease, border-color 120ms ease;',
      '}',
      '.dsh-ptd-switch::after {',
      '  content: "";',
      '  position: absolute;',
      '  top: 50%;',
      '  left: 2px;',
      '  width: 14px;',
      '  height: 14px;',
      '  border-radius: 50%;',
      '  background: var(--dsw-alias-label-secondary, #a3a9b0);',
      '  transform: translateY(-50%);',
      '  transition: left 120ms ease, background 120ms ease;',
      '}',
      '.dsh-ptd-switch[aria-checked="true"] {',
      '  border-color: var(--dsw-alias-label-link, #6aa6ff);',
      '  background: var(--dsw-alias-label-link, #6aa6ff);',
      '}',
      '.dsh-ptd-switch[aria-checked="true"]::after {',
      '  left: 16px;',
      '  background: #fff;',
      '}',
      '.dsh-ptd-switch:focus-visible {',
      '  outline: 2px solid var(--dsw-alias-label-link, #6aa6ff);',
      '  outline-offset: 1px;',
      '}',
      '.dsh-ptd-color {',
      '  flex: none;',
      '  width: 30px;',
      '  height: 24px;',
      '  padding: 0;',
      '  border: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.3));',
      '  border-radius: 6px;',
      '  background: transparent;',
      '  cursor: pointer;',
      '}',
      '.dsh-ptd-hex {',
      '  flex: 1;',
      '  min-width: 0;',
      '  overflow: hidden;',
      '  text-overflow: ellipsis;',
      '  white-space: nowrap;',
      '  color: var(--dsw-alias-label-secondary, #a3a9b0);',
      '  font-family: var(--ds-font-family-code, ui-monospace, monospace);',
      '  font-size: 11px;',
      '}',
      '.dsh-ptd-range { flex: 1; min-width: 0; accent-color: var(--dsw-alias-label-link, #6aa6ff); }',
      '.dsh-ptd-value { min-width: 34px; text-align: right; color: var(--dsw-alias-label-secondary, #a3a9b0); font-variant-numeric: tabular-nums; }',
      '.dsh-ptd-foot {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 8px;',
      '  margin-top: 12px;',
      '  padding-top: 10px;',
      '  border-top: 1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.2));',
      '}',
      '.dsh-ptd-hint { flex: 1; color: var(--dsw-alias-label-tertiary, #8b9199); font-size: 10.5px; line-height: 1.35; }',
      '.dsh-ptd-reset {',
      '  flex: none;',
      '  padding: 2px 6px;',
      '  border: 0;',
      '  border-radius: 5px;',
      '  background: transparent;',
      '  color: var(--dsw-alias-label-link, #6aa6ff);',
      '  font: inherit;',
      '  cursor: pointer;',
      '}',
      '.dsh-ptd-reset:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14)); }'
    ].join('\n')

    /**
     * Install the stylesheet once; the disposer removes it when the plugin
     * unloads. The data-plugin marker lets the module loader also sweep it on
     * disable (it owns styles created by plugin materialization).
     * @returns {() => void} cleanup.
     */
    function installStyles() {
      if (document.getElementById(STYLE_ID) !== null) return () => {}
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.dataset.plugin = 'dsh-preview-theme-dark'
      style.dataset.pluginCss = 'dsh-preview-theme-dark/preview.css'
      style.textContent = CSS_TEXT
      document.head.appendChild(style)
      return () => {
        style.remove()
      }
    }

    // ------------------------------------------------------------------
    // Preference controller: one source of truth shared by every preview tab
    // ------------------------------------------------------------------

    const controller = {
      /** @type {{preset: string, custom: string, brightness: number}} */
      state: loadState(),
      /** @type {Set<() => void>} */
      listeners: new Set(),
      /** @type {null | {overrideTokens?: Function}} */
      themeApi: null,
      /** @type {null | (() => void)} */
      tokenDispose: null,

      /** @returns {{preset: string, custom: string, brightness: number}} current state. */
      getState() {
        return this.state
      },

      /**
       * Subscribe to state changes (the popover re-renders from this).
       * @param {() => void} listener - callback.
       * @returns {() => void} unsubscribe.
       */
      subscribe(listener) {
        this.listeners.add(listener)
        return () => {
          this.listeners.delete(listener)
        }
      },

      /** Notify every subscriber. */
      emit() {
        for (const listener of Array.from(this.listeners)) {
          try {
            listener()
          } catch (_error) {
            // One broken subscriber must not break the others.
          }
        }
      },

      /**
       * Merge a patch into the state, persist it and repaint the document.
       * @param {{mode?: string, preset?: string, custom?: string, brightness?: number, lastDark?: string, lastLight?: string}} patch - changed fields.
       * @returns {void}
       */
      set(patch) {
        const next = Object.assign({}, this.state, patch)
        const same = Object.keys(next).every((key) => next[key] === this.state[key])
        if (same) return
        this.state = next
        persistState(next)
        this.apply()
        this.emit()
      },

      /**
       * Pick one paper palette, remembering it as the light or dark choice so
       * the header switch can restore each side without losing the palette.
       * @param {string} presetId - one of the PRESETS ids.
       * @returns {void}
       */
      choose(presetId) {
        const kind = presetKind(presetId, this.state.custom)
        const patch = { mode: 'manual', preset: presetId }
        if (kind === 'dark') patch.lastDark = presetId
        else if (kind === 'light') patch.lastLight = presetId
        this.set(patch)
      },

      /**
       * Pick an arbitrary paper color: it becomes the custom palette and is
       * remembered on the light or dark side according to its luminance.
       * @param {string} value - any color the picker reports.
       * @returns {void}
       */
      chooseCustom(value) {
        const hex = normalizeHex(value)
        if (hex === null) return
        const kind = luminance(hex) < 0.42 ? 'dark' : 'light'
        const patch = { mode: 'manual', preset: 'custom', custom: hex }
        if (kind === 'dark') patch.lastDark = 'custom'
        else patch.lastLight = 'custom'
        this.set(patch)
      },

      /**
       * Flip between the remembered light and dark palettes in one click.
       * A click also leaves system-follow mode, because the user just chose
       * an explicit side.
       * @returns {void}
       */
      toggle() {
        const scheme = resolveScheme(this.state)
        if (scheme.mode === 'dark') this.set({ mode: 'manual', preset: this.state.lastLight })
        else this.set({ mode: 'manual', preset: this.state.lastDark })
      },

      /**
       * Enable or disable following the operating system appearance.
       * Turning it off freezes the palette currently on screen, so the act of
       * disabling the switch never changes what the user is looking at.
       * @param {boolean} on - true to follow prefers-color-scheme.
       * @returns {void}
       */
      setSystem(on) {
        if (on) {
          this.set({ mode: 'system' })
          return
        }
        const shown = resolvedPresetId(this.state)
        this.set({ mode: 'manual', preset: shown })
      },

      /** Return to factory defaults (original paper). */
      reset() {
        this.set(Object.assign({}, DEFAULT_STATE))
      },

      /** Re-read localStorage (another window changed the preference). */
      reloadFromStorage() {
        this.state = loadState()
        this.apply()
        this.emit()
      },

      /**
       * Bind the theme service so the paper color can be applied with the
       * official token-override layer (inline <body> custom property).
       * @param {{overrideTokens?: Function}} theme - ctx.theme.
       * @returns {void}
       */
      attachTheme(theme) {
        this.themeApi = theme || null
        this.apply()
      },

      /** Detach the theme service and undo every document mutation. */
      detachTheme() {
        this.themeApi = null
        if (typeof document === 'undefined') return
        document.documentElement.removeAttribute(THEME_ATTR)
        document.documentElement.style.removeProperty(FILTER_VAR)
        this.disposeToken()
      },

      /**
       * Paint the current scheme onto <html> (mode + filter) and <body> (tokens).
       * @returns {void}
       */
      apply() {
        if (typeof document === 'undefined') return
        const root = document.documentElement
        const scheme = resolveScheme(this.state)
        if (scheme.mode === 'off') {
          root.removeAttribute(THEME_ATTR)
          root.style.removeProperty(FILTER_VAR)
          this.disposeToken()
          return
        }
        root.setAttribute(THEME_ATTR, scheme.mode)
        root.style.setProperty(FILTER_VAR, scheme.filter)
        this.applyPaper(scheme)
      },

      /**
       * Put the paper color into the preview's theme tokens. Preferred path:
       * ctx.theme.overrideTokens, which stacks above the active theme and is
       * applied by the theme presenter as inline custom properties on <body>.
       * Fallback: write the inline custom properties directly.
       * @param {{mode: string, color: string}} scheme - resolved scheme.
       * @returns {void}
       */
      applyPaper(scheme) {
        this.disposeToken()
        if (typeof document === 'undefined' || document.body === null) return
        const label = scheme.mode === 'dark' ? '#cfd3d6' : '#61666b'
        const api = this.themeApi
        if (api !== null && typeof api.overrideTokens === 'function') {
          try {
            this.tokenDispose = api.overrideTokens(TOKEN_SOURCE, {
              [PAPER_TOKEN]: { light: scheme.color, dark: scheme.color },
              [LABEL_TOKEN]: { light: label, dark: label }
            })
            return
          } catch (_error) {
            this.tokenDispose = null
          }
        }
        document.body.style.setProperty(PAPER_TOKEN, scheme.color)
        document.body.style.setProperty(LABEL_TOKEN, label)
      },

      /** Remove the token override / fallback inline properties. */
      disposeToken() {
        if (this.tokenDispose !== null) {
          try {
            this.tokenDispose()
          } catch (_error) {
            // A stale disposer is harmless.
          }
          this.tokenDispose = null
        }
        if (typeof document === 'undefined' || document.body === null) return
        document.body.style.removeProperty(PAPER_TOKEN)
        document.body.style.removeProperty(LABEL_TOKEN)
      }
    }

    // ------------------------------------------------------------------
    // React components
    // ------------------------------------------------------------------

    /** Palette glyph used by the header trigger. */
    function PaletteIcon() {
      return h('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true'
      }, [
        h('path', {
          key: 'outline',
          d: 'M8 1.6a6.4 6.4 0 1 0 0 12.8c.86 0 1.5-.64 1.5-1.46 0-.4-.16-.74-.42-1.02-.24-.27-.38-.6-.38-.95 0-.8.64-1.44 1.44-1.44h1.16A2.7 2.7 0 0 0 14.4 6.9C14.4 3.94 11.53 1.6 8 1.6Z',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinejoin: 'round'
        }),
        h('circle', { key: 'dot-a', cx: 5.1, cy: 5.4, r: 1, fill: 'currentColor' }),
        h('circle', { key: 'dot-b', cx: 8.3, cy: 4.3, r: 1, fill: 'currentColor' }),
        h('circle', { key: 'dot-c', cx: 4.4, cy: 8.6, r: 1, fill: 'currentColor' })
      ])
    }

    /** Sun glyph: shown while the preview is dark, because a click returns to light. */
    function SunIcon() {
      return h('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true'
      }, [
        h('circle', { key: 'core', cx: 8, cy: 8, r: 3.1, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', {
          key: 'rays',
          d: 'M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.13 1.13M11.67 11.67l1.13 1.13M12.8 3.2l-1.13 1.13M4.33 11.67L3.2 12.8',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinecap: 'round'
        })
      ])
    }

    /** Moon glyph: shown while the preview is light, because a click turns it dark. */
    function MoonIcon() {
      return h('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true'
      }, [
        h('path', {
          key: 'crescent',
          d: 'M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinejoin: 'round'
        })
      ])
    }

    /**
     * The header controls: a one-click light/dark switch followed by the
     * palette button and its popover. Registered into
     * sidebar.right.tab.document.actions, so it renders after the preview
     * header's own controls for every file the preview shows.
     * @param {object} props - slot props (t plus the owner prop absolutePath).
     * @returns {object|null} React node, or null for unsupported files.
     */
    function HeaderAction(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [state, setState] = React.useState(() => controller.getState())
      const [open, setOpen] = React.useState(false)
      const [position, setPosition] = React.useState(null)
      const triggerRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const supported = supportsFile(props.absolutePath)
      const dark = resolveScheme(state).mode === 'dark'

      React.useEffect(() => controller.subscribe(() => setState(controller.getState())), [])

      /** Recompute the fixed popover position from the trigger's rect. */
      const place = React.useCallback(() => {
        const node = triggerRef.current
        if (node === null) return
        const rect = node.getBoundingClientRect()
        const width = 300
        const right = Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - width - 8))
        setPosition({ top: Math.round(rect.bottom + 6), right: Math.round(right) })
      }, [])

      const toggle = React.useCallback(() => {
        if (open) {
          setOpen(false)
          return
        }
        place()
        setOpen(true)
      }, [open, place])

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const target = event.target
          if (panelRef.current !== null && panelRef.current.contains(target)) return
          if (triggerRef.current !== null && triggerRef.current.contains(target)) return
          setOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        const onReflow = () => place()
        document.addEventListener('mousedown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('resize', onReflow)
        window.addEventListener('scroll', onReflow, true)
        return () => {
          document.removeEventListener('mousedown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('resize', onReflow)
          window.removeEventListener('scroll', onReflow, true)
        }
      }, [open, place])

      if (!supported) return null

      const panel = open && position !== null
        ? h(ThemePanel, {
            t,
            state,
            position,
            panelRef,
            onChange: (patch) => controller.set(patch),
            onChoose: (presetId) => controller.choose(presetId),
            onCustom: (hex) => controller.chooseCustom(hex),
            onSystem: (on) => controller.setSystem(on),
            onReset: () => controller.reset(),
            onClose: () => setOpen(false)
          })
        : null

      return h(React.Fragment, null,
        h('button', {
          key: 'mode',
          type: 'button',
          className: 'dsh-ptd-mode',
          'aria-label': dark ? t('mode.toLight') : t('mode.toDark'),
          title: dark ? t('mode.toLight') : t('mode.toDark'),
          'aria-pressed': dark ? 'true' : 'false',
          'data-mode': dark ? 'dark' : 'light',
          onClick: () => controller.toggle()
        }, dark ? h(SunIcon) : h(MoonIcon)),
        h('button', {
          key: 'trigger',
          ref: triggerRef,
          type: 'button',
          className: 'dsh-ptd-trigger',
          'aria-label': t('title'),
          title: t('title'),
          'aria-expanded': open ? 'true' : 'false',
          'aria-haspopup': 'dialog',
          'data-active': resolveScheme(state).mode === 'off' ? undefined : 'true',
          onClick: toggle
        }, h(PaletteIcon)),
        panel === null ? null : (createPortal !== null ? createPortal(panel, document.body) : panel)
      )
    }

    /**
     * The popover: a follow-the-system switch, preset swatches, a native color
     * picker and a brightness slider (only meaningful for the inverted / dark
     * schemes).
     * @param {object} props - t, state, position, panelRef and callbacks.
     * @returns {object} React node.
     */
    function ThemePanel(props) {
      const t = props.t
      const state = props.state
      const scheme = resolveScheme(state)
      const effectivePreset = resolvedPresetId(state)
      const customColor = normalizeHex(state.custom) || DEFAULT_STATE.custom
      const style = { top: props.position.top + 'px', right: props.position.right + 'px' }
      return h('div', {
        ref: props.panelRef,
        className: 'dsh-ptd-panel',
        role: 'dialog',
        'aria-label': t('title'),
        style
      },
        h('div', { className: 'dsh-ptd-head' },
          h('div', { className: 'dsh-ptd-heading' },
            h('div', { className: 'dsh-ptd-title' }, t('title')),
            h('div', { className: 'dsh-ptd-sub' }, t('subtitle'))
          ),
          h('button', {
            type: 'button',
            className: 'dsh-ptd-close',
            'aria-label': t('close'),
            title: t('close'),
            onClick: props.onClose
          }, '\u00d7')
        ),
        h('div', { className: 'dsh-ptd-row dsh-ptd-system' },
          h('div', { className: 'dsh-ptd-system-main' },
            h('span', { className: 'dsh-ptd-row-label' }, t('system')),
            h('span', { className: 'dsh-ptd-system-state' },
              state.mode === 'system' ? t('system.on') : t('system.off'))
          ),
          h('button', {
            type: 'button',
            role: 'switch',
            className: 'dsh-ptd-switch',
            'aria-label': t('system'),
            'aria-checked': state.mode === 'system' ? 'true' : 'false',
            onClick: () => props.onSystem(state.mode !== 'system')
          })
        ),
        h('div', { className: 'dsh-ptd-grid' }, PRESETS.map((preset) => {
          const active = effectivePreset === preset.id
          const color = preset.kind === 'auto' ? customColor : (preset.kind === 'off' ? 'transparent' : preset.color)
          return h('button', {
            key: preset.id,
            type: 'button',
            className: 'dsh-ptd-swatch',
            'data-active': active ? 'true' : undefined,
            'aria-pressed': active ? 'true' : 'false',
            title: t('preset.' + preset.id),
            onClick: () => props.onChoose(preset.id)
          },
            h('span', {
              className: 'dsh-ptd-dot' + (preset.kind === 'off' ? ' dsh-ptd-dot-off' : ''),
              style: { background: color }
            }, preset.kind === 'off'
              ? h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': 'true' }, [
                  h('path', { key: 'slash', d: 'M2.5 9.5L9.5 2.5', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' })
                ])
              : null),
            h('span', { className: 'dsh-ptd-label' }, t('preset.' + preset.id))
          )
        })),
        h('div', { className: 'dsh-ptd-row' },
          h('span', { className: 'dsh-ptd-row-label' }, t('custom')),
          h('input', {
            type: 'color',
            className: 'dsh-ptd-color',
            value: customColor,
            'aria-label': t('custom'),
            onChange: (event) => {
              const next = normalizeHex(event.target.value)
              if (next !== null) props.onCustom(next)
            }
          }),
          h('span', { className: 'dsh-ptd-hex' }, customColor)
        ),
        scheme.mode === 'dark'
          ? h('div', { className: 'dsh-ptd-row' },
              h('span', { className: 'dsh-ptd-row-label' }, t('brightness')),
              h('input', {
                type: 'range',
                className: 'dsh-ptd-range',
                min: 70,
                max: 120,
                step: 1,
                value: state.brightness,
                'aria-label': t('brightness'),
                onChange: (event) => props.onChange({ brightness: clamp(Number(event.target.value) || 100, 70, 120) })
              }),
              h('span', { className: 'dsh-ptd-value' }, state.brightness + '%')
            )
          : null,
        h('div', { className: 'dsh-ptd-foot' },
          h('span', { className: 'dsh-ptd-hint' }, t('hint')),
          h('button', { type: 'button', className: 'dsh-ptd-reset', onClick: props.onReset }, t('reset'))
        )
      )
    }

    // ------------------------------------------------------------------
    // Plugin entry
    // ------------------------------------------------------------------

    /**
     * Client plugin entry: stylesheet, theme binding, storage sync, locale
     * dictionaries and the header action registration.
     * @param {object} ctx - client root context (slots, locale, theme, effect).
     * @returns {void}
     */
    function apply(ctx) {
      ctx.effect(installStyles, 'preview-theme-dark: stylesheet')

      ctx.effect(() => {
        controller.attachTheme(ctx.theme)
        return () => controller.detachTheme()
      }, 'preview-theme-dark: paper token')

      ctx.effect(() => {
        const onStorage = (event) => {
          if (event.key === STORAGE_KEY) controller.reloadFromStorage()
        }
        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
      }, 'preview-theme-dark: cross-window sync')

      // Keep the preview in step with the OS appearance while "follow system"
      // is on; the palette/computed scheme itself is derived on every render.
      ctx.effect(() => {
        if (typeof window.matchMedia !== 'function') return undefined
        const media = window.matchMedia('(prefers-color-scheme: dark)')
        const onSchemeChange = () => {
          if (controller.getState().mode !== 'system') return
          controller.apply()
          controller.emit()
        }
        media.addEventListener('change', onSchemeChange)
        return () => media.removeEventListener('change', onSchemeChange)
      }, 'preview-theme-dark: system appearance')

      ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'preview-theme-dark: dictionaries')

      ctx.slots.inject(ACTION_SEAT, () => ctx.slots.register({
        name: ACTION_SEAT,
        id: ACTION_ID,
        order: 10,
        locale: NS
      }, HeaderAction))
    }

    const module_ = { exports: {} }
    module_.exports.apply = apply
    module_.exports.inject = ['slots', 'locale', 'theme']
    return module_.exports
  }
})
