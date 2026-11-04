# Changelog

## 1.0.0 — 2026-11-05

首个独立发布版本。基于 [dsh-preview-theme](https://github.com/FelixJiashengFu/dsh-preview-theme) 0.1.0
（MIT），改动如下：

### 新增

- 预览标题栏「☀ / ☾」一键浅色 / 深色切换按钮（无需打开调色盘）。
- 调色盘面板顶部「跟随系统」开关，跟随操作系统浅色 / 深色外观实时切换。
- 浅色侧与深色侧的纸张配色分别记忆，来回切换时各自恢复。
- 深色方案亮度调节（70%–120%）。
- 首次运行自动迁移上游插件（`dsh-preview-theme`）保存的偏好到本插件自己的 localStorage 键。

### 发布相关

- 使用独立的包名 `dsh-preview-theme-dark`、Loader 行 id `preview-theme-dark`、CSS 前缀 `dsh-ptd-`、
  DOM 属性 `data-dsh-preview-theme-dark`、token 覆盖层 `dsh-preview-theme-dark`，可与上游插件共存。
- 补齐 repository / homepage / bugs / publishConfig / engines 等发布元数据与 README、LICENSE、CHANGELOG。
