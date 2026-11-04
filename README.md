# 预览深色模式 · dsh-preview-theme-dark

给 **DeepSeek Harness** 右侧边栏的文档预览加一层「深色阅读」：PDF、Word（docx/doc，经 LibreOffice 转 PDF）、
PowerPoint（转 PDF）、Excel（xlsx/xls/csv/tsv）都适用。**只改显示，不改文件**——全部是浏览器里的 CSS，
原文件一个字节都不会动。

本插件是 [dsh-preview-theme](https://github.com/FelixJiashengFu/dsh-preview-theme)（MIT 许可）的**独立增强版**，
在上游「纸张配色」的基础上补了三件事，并以自己的包名单独发布，可以直接在任意一台装了 DSH 的机器上安装：

1. **一键浅色 / 深色切换**：预览标题栏最右边、调色盘左边多一个 ☀ / ☾ 按钮，点一下就在浅色与深色之间
   来回切，不用进面板挑颜色；
2. **跟随系统外观**：调色盘面板顶部有「跟随系统」开关，打开后跟随 macOS / Windows 的浅色、深色外观，
   系统切外观时预览实时跟着变；
3. **两侧配色各自记住**：你选的深色纸张（纯黑 / 墨黑 / 深灰 / 午夜蓝 / 墨绿）和浅色纸张
   （原色 / 护眼米黄 / 豆沙绿 / 淡蓝 / 淡粉）会分别记住，切换时各自恢复，不会互相覆盖。

## 安装到其他机器

要求：**DeepSeek Harness 0.2.x**（`engines.dsh: >=0.2.0-rc.1 <0.3.0-0`，已在 0.2.1-rc.5 验证）。

### 方式 A：从 GitHub Release 安装（推荐，不需要 npm 账号）

1. 打开 [最新 Release](https://github.com/xiaoqiangch/dsh-preview-theme-dark/releases/latest)，复制
   `dsh-preview-theme-dark-1.0.0.tgz` 的下载链接，形如：

   ```
   https://github.com/xiaoqiangch/dsh-preview-theme-dark/releases/download/v1.0.0/dsh-preview-theme-dark-1.0.0.tgz
   ```

2. 在 DSH 里打开**侧边栏 → 插件 → 添加插件 → 安装第三方插件**，把上面的 `.tgz` 链接粘进
   「包名或地址」，点**安装**。
3. 按页面提示重启 DSH（profile 没开 HMR 时需要重启；开着 HMR 会自动生效）。
4. 验证：打开任意 PDF / Word / Excel 预览，标题栏最右边出现 **☀ / ☾** 与调色盘两个按钮。

> 安装页也接受 npm 包名、Git 仓库地址和本地目录；`.tgz` 直链走的是 pnpm 的 tarball 安装路径，不经过 npm 源。

### 方式 B：命令行安装

```bash
# 把 <tgz-url> 换成 Release 里的链接（也可以换成下载到本机的绝对路径）
dsh plugin --profile web add "<tgz-url>"
# 或：dsh plugin --profile web add "https://github.com/xiaoqiangch/dsh-preview-theme-dark/releases/download/v1.0.0/dsh-preview-theme-dark-1.0.0.tgz"
```

`dsh plugin add` 会把依赖写进 profile、并把组合包**自动追加到** `dsh.profile.bundles`。之后重启该
profile（`dsh web`）即可生效。如果只想让某台机器临时试试，也可以先下载 `.tgz` 再用本地绝对路径安装：

```bash
dsh plugin --profile web add "/绝对路径/dsh-preview-theme-dark-1.0.0.tgz"
```

### 方式 C：从源码目录安装

```bash
git clone https://github.com/xiaoqiangch/dsh-preview-theme-dark.git
dsh plugin --profile web add "file:/绝对路径/dsh-preview-theme-dark"
```

也可以在插件页「安装第三方插件」里直接填**该目录的绝对路径**。

### 方式 D：从插件市场「发现」页一键安装

本仓库同时维护了一份**插件市场索引**（DSH 自定义插件市场格式 1），加进 DSH 之后就能在插件页的「发现」
标签页里像应用商店一样浏览并安装：

1. 插件页 → **实验性插件** 旁的**更多** → 启用**自定义插件市场**（重启或随 HMR 生效）；
2. 插件页切到「**发现**」标签页 → 添加索引源，粘贴下面任一地址：

   ```
   https://raw.githubusercontent.com/xiaoqiangch/dsh-preview-theme-dark/main/docs/market-index.json
   https://cdn.jsdelivr.net/gh/xiaoqiangch/dsh-preview-theme-dark@main/docs/market-index.json
   ```

3. 在「发现」里找到「预览深色模式」，点**安装**即可（走 `git+https` 源，固定到发布提交，不需要 npm 账号）。

> 这套索引也兼容 `plugin_market` agent 工具：让 DSH 列出已配置索引里的插件，再把条目的
> `install_bundle` 参数交给插件管理器。索引文件由 `node scripts/build-market-index.mjs` 从
> `package.json` 生成，发布新版本后重新跑一次并提交即可。

---

装好后确认一下：`dsh --profile web --dump-config | grep preview-theme-dark` 应该能看到
`id: preview-theme-dark` 这一行（说明组合包已被 profile 选中并合入配置树）。

## 使用

打开右侧边栏里任意 PDF / Word / PPT / Excel 预览，标题栏最右边有两个控件：

- **☀ / ☾ 按钮**：单击切换浅色 ⇄ 深色。图标显示的是「点下去会变成哪一侧」；处于深色时按钮为月亮旁的
  高亮态。点它会退出「跟随系统」模式（因为你刚手动选了明确的一侧）。
- **调色盘按钮**：打开配色面板
  - 顶部「跟随系统」开关：跟随系统外观；
  - 中间色板：原色、纯黑、墨黑、深灰、午夜蓝、墨绿、护眼米黄、豆沙绿、淡蓝、淡粉、自定义；
  - 自定义颜色：系统取色器选任意颜色，深色自动黑底白字、浅色自动浅底深字；
  - 深色方案下有「亮度」滑杆（70%–120%）；
  - 底部「恢复默认」回到初始状态。

选择会保存在 localStorage，重启 / 刷新后仍然生效；在面板里点「原色」或「恢复默认」就完全还原。
首次运行时如果检测到上游插件（`dsh-preview-theme`）存下的旧偏好，会自动读过来并改用本插件自己的键
`dsh-preview-theme-dark:v1`，两个插件可以共存、互不干扰。

## 配色表

| 名称 | 色值 | 效果 |
| --- | --- | --- |
| 原色 | — | 关闭插件效果（白色纸张 + 浅灰底）＝ 浅色 |
| 纯黑 | #000000 | 纯黑纸、白字（默认深色侧） |
| 墨黑 | #0b0f14 | 近黑（偏冷） |
| 深灰 | #1f2126 | 炭灰纸、浅字 |
| 午夜蓝 | #101b2d | 深蓝纸、白字 |
| 墨绿 | #101f17 | 深绿纸、白字 |
| 护眼米黄 | #f4ecd8 | 米黄纸、黑字 |
| 豆沙绿 | #cce8cf | 护眼绿纸、黑字 |
| 淡蓝 | #dbe7f5 | 淡蓝纸、黑字 |
| 淡粉 | #f6e3e5 | 淡粉纸、黑字 |
| 自定义 | 任意 | 按亮度自动选深色 / 浅色方案 |

## 原理（为什么不用改预览器）

内置预览包 `@deepseek-ai/dsh-client-ui-sidebar-documentpreview` 在 DOM 上留了稳定的 data-* 钩子：

- `[data-textpreview-body]`：预览滚动区；
- `[data-pdf-preview]`：PDF / Word / PPT 的页面容器（每页一个 canvas + 透明文字层）；
- `[data-excel-preview]`：表格容器（FortuneSheet 画布 + 公式栏 + 工作表标签）。

插件做两件事：

1. **纸色**：覆盖主题 token `--dsw-alias-bg-document-preview`（通过 `ctx.theme.overrideTokens`，官方
   扩展点，写成 body 内联变量，不跟内置样式抢优先级）；
2. **页面内容**：
   - 浅色纸：给 canvas（PDF）/ 表格子元素（Excel）加 `mix-blend-mode: multiply` —— 白纸乘上纸色变成
     纸色，黑字仍是黑字；
   - 深色纸：先 `filter: invert(1) hue-rotate(180deg)` 把白纸 / 黑字翻成黑纸 / 白字，再
     `mix-blend-mode: screen` 把页面底色染成所选深色（白色文字保持不变）。`hue-rotate(180deg)` 让图表和
     图片的颜色尽量保持原色相。

插件只注册一个标题栏动作（文档预览的 `sidebar.right.tab.document.actions` 槽位，内部渲染「开关按钮 +
调色盘按钮」）和一段样式表，关掉 / 卸载后样式与 token 覆盖都会被清理干净。

## 限制

- **只影响内置预览**。「近期成品」等其它位置里用系统 PDF 查看器 iframe 显示的 PDF 不在可样式化范围内。
- 深色方案会**反转文档里的图片 / 图表颜色**（hue-rotate 只能近似还原色相），这是所有「反色阅读模式」的
  通病。
- Excel 是整块画布渲染，深色模式下公式栏、工作表标签会跟着一起反色；不支持只改单元格区域。
- 预览的 data-* 属性属于 DSH 内部实现，升级 DSH 大版本后如失效，重新适配即可（同时更新 `engines.dsh`）。
- 与上游插件同时安装时各自独立工作：不同的 localStorage 键、不同的 DOM 属性 / CSS 前缀 / token 覆盖层，
  不会互相覆盖；但两个插件都会往标题栏加按钮，同时开启会看到两组控件。

## 升级 / 卸载

- **升级**：插件页对第三方插件不提供「更新」按钮，先**卸载**再从新 Release 链接安装即可。
- **卸载**：插件页 → 已安装插件 → 本插件 → 卸载；样式与 token 覆盖会随模块卸载一起清理。localStorage
  里的偏好不会被自动删除（想彻底清掉可在浏览器控制台执行
  `localStorage.removeItem('dsh-preview-theme-dark:v1')`）。

## 与上游的关系

- 上游：[FelixJiashengFu/dsh-preview-theme](https://github.com/FelixJiashengFu/dsh-preview-theme)（MIT），
  提供基础配色方案与预览重绘思路；
- 本仓库在上游 0.1.0 的基础上增加了「一键浅 / 深切换」「跟随系统」「浅深两侧配色记忆」，修正了文件头、
  包名、Loader 行 id、CSS 前缀、localStorage 键等身份信息，补齐独立发布所需的 README / LICENSE / 版本号，
  以便作为独立插件分发。
- 许可证：MIT，保留上游版权声明，见 [LICENSE](LICENSE)。

## 目录

```
dsh-preview-theme-dark/
  package.json          # dsh.bundle.patch + dsh.client（无构建步骤）
  cordis.patch.yml      # Host 行（空实现，只为让 Loader 挂载并下发 client bundle）
  lib/index.js          # Host 半边：空 apply
  lib/client.js         # 全部功能：样式、token、标题栏按钮、配色面板（纯 React.createElement）
  locale/{zh,en}.json   # 插件管理里显示的名称 / 描述
  icon.svg              # 插件图标
  docs/market-index.json # 插件市场索引（格式 1，指向本仓库固定提交）
  scripts/build-market-index.mjs # 从 package.json 重新生成上面的索引
  README.md             # 本文件
  LICENSE               # MIT（含上游版权声明）
  CHANGELOG.md
```

## 维护者：发新版本怎么做

1. 改 `package.json` 的 `version`，在 `CHANGELOG.md` 记一条；
2. `npm pack` 得到 `dsh-preview-theme-dark-<版本>.tgz`（会被 `.gitignore` 忽略，不提交）；
3. `git commit && git tag v<版本> && git push --tags`；
4. `gh release create v<版本> dsh-preview-theme-dark-<版本>.tgz --title ... --notes-file ...`，
   把 `.tgz` 挂到 Release 上（方式 A、B 用的就是它）；
5. `node scripts/build-market-index.mjs` 重新生成市场索引（会把安装源固定到当前提交），提交并推送；
6. 可选：发布到 npm——

   ```bash
   npm login                      # 首次需要
   npm publish --access public
   ```

   发布后其他机器的安装方式可以简化成 `dsh plugin --profile web add dsh-preview-theme-dark`
   （`publishConfig.access` 已设为 public，`files` 已限定发布内容）。

发布前自检：

```bash
node --check lib/index.js                 # Host 半边语法
node scripts/smoke-test.mjs               # 无依赖冒烟测试：注册 id、标题栏动作、浅深切换、偏好持久化、旧键迁移
# 干净环境安装验证：
DSH_HOME=/tmp/dsh-verify dsh plugin --profile web add "<tgz 或 Release 链接>"
DSH_HOME=/tmp/dsh-verify dsh --profile web --dump-config | grep preview-theme-dark
```
