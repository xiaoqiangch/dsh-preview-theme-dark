/**
 * Dependency-free smoke test for the browser half.
 *
 * The bundle is plain ES2022 that @deepseek-ai/dsh-client-modules executes with
 * a `require` for the shared React module, so it can be loaded in Node with a
 * few DOM and React stubs. This checks the things unit tests usually catch
 * late: the module registers under the package name, apply() registers exactly
 * one header action in the right seat plus its locale namespace, the one-click
 * light/dark switch really flips the <html> attribute, theme token layer and
 * persistence, unsupported files render nothing, and the legacy-preference
 * migration fires once.
 *
 * Usage: node scripts/smoke-test.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLIENT = join(dirname(dirname(fileURLToPath(import.meta.url))), 'lib', 'client.js')

// ---- DOM stubs ----------------------------------------------------------
const htmlAttrs = new Map()
const htmlStyle = new Map()
const bodyStyle = new Map()
const storage = new Map()
const created = []

function styleMap(map) {
  return {
    setProperty: (k, v) => map.set(k, v),
    removeProperty: (k) => map.delete(k),
  }
}

globalThis.document = {
  documentElement: {
    setAttribute: (k, v) => htmlAttrs.set(k, v),
    removeAttribute: (k) => htmlAttrs.delete(k),
    getAttribute: (k) => htmlAttrs.get(k) ?? null,
    style: styleMap(htmlStyle),
  },
  body: { style: styleMap(bodyStyle) },
  head: { appendChild: () => {} },
  createElement: (tag) => {
    const el = { tag, dataset: {}, textContent: '', remove: () => {} }
    created.push(el)
    return el
  },
  getElementById: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
}

const mediaListeners = []
globalThis.window = {
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  matchMedia: () => ({
    matches: false,
    addEventListener: (_t, fn) => mediaListeners.push(fn),
    removeEventListener: () => {},
  }),
  addEventListener: () => {},
  removeEventListener: () => {},
  innerWidth: 1440,
  innerHeight: 900,
}

// ---- React stub ---------------------------------------------------------
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children } }),
  Fragment: Symbol('Fragment'),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useRef: (initial) => ({ current: initial ?? null }),
  useCallback: (fn) => fn,
  useEffect: () => {},
}
const reactDomStub = { createPortal: (node) => node }

// ---- Loader stub --------------------------------------------------------
let registered = null
globalThis.window.__ModuleLoader__ = {
  load: ({ id, factory }) => {
    const require = (name) => {
      if (name === 'react') return reactStub
      if (name === 'react-dom') return reactDomStub
      throw new Error('unexpected require: ' + name)
    }
    registered = { id, exports: factory(require) }
  },
}

// ---- Execute the bundle -------------------------------------------------
const source = readFileSync(CLIENT, 'utf8')
new Function('window', 'document', 'globalThis', source)(globalThis.window, globalThis.document, globalThis)

if (registered === null) throw new Error('bundle did not register')
if (registered.id !== 'dsh-preview-theme-dark') throw new Error('wrong id: ' + registered.id)
const plugin = registered.exports
if (typeof plugin.apply !== 'function') throw new Error('no apply export')
if (!Array.isArray(plugin.inject)) throw new Error('no inject export')
console.log('registered id:', registered.id, '| inject:', JSON.stringify(plugin.inject))

// ---- Run apply with a stubbed client context ----------------------------
const registeredSlots = []
const disposers = []
const localeNamespaces = []
let tokenLayer = null
const ctx = {
  effect: (fn, label) => {
    const dispose = fn()
    if (typeof dispose === 'function') disposers.push(dispose)
    return dispose
  },
  theme: {
    overrideTokens: (source, tokens) => {
      tokenLayer = { source, tokens }
      return () => { tokenLayer = null }
    },
  },
  slots: {
    inject: (_seat, cb) => cb(),
    register: (def, component) => {
      registeredSlots.push({ def, component })
      return () => {}
    },
  },
  locale: { register: (ns) => { localeNamespaces.push(ns); return () => {} } },
}
plugin.apply(ctx)

console.log('slots:', registeredSlots.map((s) => `${s.def.name}#${s.def.id}`).join(','))
console.log('locale namespaces:', localeNamespaces.join(','))
if (registeredSlots.length !== 1) throw new Error('expected exactly one slot registration')
const slot = registeredSlots[0]
if (slot.def.name !== 'sidebar.right.tab.document.actions') throw new Error('wrong seat')
if (slot.def.id !== 'preview-theme-dark') throw new Error('wrong action id: ' + slot.def.id)
if (!localeNamespaces.includes('preview-theme-dark')) throw new Error('locale namespace not registered')

// ---- Render the header action for a PDF and click the mode button -------
const HeaderAction = slot.component
const t = (key) => key
const tree = HeaderAction({ t, absolutePath: '/tmp/report.pdf' })
const children = tree.props.children.filter(Boolean)
console.log('header controls:', children.map((c) => c.props.className).join(','))
if (children.length !== 2) throw new Error('expected mode button + palette trigger')
const modeButton = children[0]
if (modeButton.props.className !== 'dsh-ptd-mode') throw new Error('wrong mode button class: ' + modeButton.props.className)
console.log('initial aria-label:', modeButton.props['aria-label'])

modeButton.props.onClick()
console.log('after click -> html attr:', htmlAttrs.get('data-dsh-preview-theme-dark'))
console.log('after click -> filter var:', htmlStyle.get('--dsh-preview-dark-filter'))
console.log('after click -> paper token:', bodyStyle.get('--dsw-alias-bg-document-preview'))
console.log('storage key:', [...storage.keys()].join(','))
console.log('storage value:', [...storage.values()].join(','))

if (htmlAttrs.get('data-dsh-preview-theme-dark') !== 'dark') throw new Error('click did not enter dark mode')
if (tokenLayer === null || tokenLayer.source !== 'dsh-preview-theme-dark') throw new Error('theme override layer missing')
if (tokenLayer.tokens['--dsw-alias-bg-document-preview'].light !== '#000000') throw new Error('paper token not black')

// toggle back
const tree2 = HeaderAction({ t, absolutePath: '/tmp/report.pdf' })
const modeButton2 = tree2.props.children.filter(Boolean)[0]
modeButton2.props.onClick()
console.log('second click -> html attr:', htmlAttrs.get('data-dsh-preview-theme-dark') ?? '(removed)')
console.log('second click -> paper token:', bodyStyle.get('--dsw-alias-bg-document-preview') ?? '(removed)')
if (htmlAttrs.get('data-dsh-preview-theme-dark') !== undefined) throw new Error('second click did not return to light/original')

// unsupported file renders nothing
if (HeaderAction({ t, absolutePath: '/tmp/notes.txt' }) !== null) throw new Error('unsupported file should render null')
console.log('unsupported file renders null: ok')

// legacy storage migration
storage.clear()
storage.set('dsh-preview-theme:v1', JSON.stringify({ preset: 'midnight', custom: '#ffffff', brightness: 100 }))
// reload the bundle to re-read storage
registered = null
new Function('window', 'document', 'globalThis', source)(globalThis.window, globalThis.document, globalThis)
console.log('after legacy read -> own key present:', storage.has('dsh-preview-theme-dark:v1'))
console.log('after legacy read -> own value:', storage.get('dsh-preview-theme-dark:v1'))
if (!storage.has('dsh-preview-theme-dark:v1')) throw new Error('legacy preference was not migrated')

console.log('\nALL SMOKE CHECKS PASSED')
