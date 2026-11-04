/**
 * Regenerate docs/market-index.json from package.json.
 *
 * The index lists this package for a DSH custom plugin market (the Web
 * "Discover" tab). The install source is the Git repository pinned to the
 * current HEAD commit, so no npm account is needed: DSH installs it with
 * `pnpm add git+https://github.com/<repo>.git#<commit>`.
 *
 * Usage: node scripts/build-market-index.mjs [--publish <unix-seconds>]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const icon = readFileSync(join(root, 'icon.svg')).toString('base64')
const repository = manifest.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const publishedArg = process.argv.indexOf('--publish')
const publishTimestamp = publishedArg === -1
  ? Math.floor(Date.now() / 1000)
  : Number(process.argv[publishedArg + 1])

const index = {
  format: 1,
  title: { en: 'xiaoqiangch DSH plugins', zh: 'xiaoqiangch 的 DSH 插件' },
  description: {
    en: 'Small, focused DeepSeek Harness plugins maintained by xiaoqiangch.',
    zh: 'xiaoqiangch 维护的 DeepSeek Harness 小插件。'
  },
  metadata: {
    categories: { appearance: { title: { en: 'Appearance', zh: '外观' } } },
    labels: { 'dark-mode': { title: { en: 'Dark mode', zh: '深色模式' } } },
    sortKeys: {}
  },
  plugins: [
    {
      name: manifest.name,
      title: {
        en: 'Preview Dark Mode',
        zh: '预览深色模式'
      },
      description: {
        en: 'One-click light / dark switch for PDF, Word and Excel sidebar previews, optionally following the system appearance, with separate light and dark paper memories. Display only: the files are never modified.',
        zh: 'PDF / Word / Excel 侧边栏预览一键切换浅色 / 深色，可跟随系统外观，浅色侧与深色侧的纸张配色分别记忆。只改显示，不改文件。'
      },
      icon: `data:image/svg+xml;base64,${icon}`,
      author: 'xiaoqiangch',
      homepage: manifest.homepage,
      repository: { url: repository },
      metadata: {
        category: 'appearance',
        keywords: manifest.keywords,
        labels: ['dark-mode'],
        sortKeys: {}
      },
      versions: [
        {
          version: manifest.version,
          publishTimestamp,
          source: { type: 'git', url: repository, commit },
          engines: { dsh: manifest.engines.dsh }
        }
      ]
    }
  ]
}

writeFileSync(join(root, 'docs', 'market-index.json'), `${JSON.stringify(index, null, 2)}\n`)
console.log(`market index written for ${manifest.name}@${manifest.version} at ${commit}`)
