# 开发指南

## 1. 准备环境

需要 Node.js 22.15+、npm 和可用的桌面会话。`.nvmrc` 选择 Node.js 22，使用 nvm 时可执行：

```sh
git clone https://github.com/Govin-L/himo.git
cd himo
nvm install
nvm use
npm ci
npm run dev:mock
```

不使用 nvm 时自行安装满足版本要求的 Node.js 后运行 `npm ci`。`package-lock.json` 是依赖安装的基准；不要为本地启动顺带升级依赖。本项目使用 Node 自带测试运行器，不再依赖 Vitest。

macOS / Windows 使用当前桌面；Linux 无头环境运行开发或预览命令时需自行加 `xvfb-run -a`。现有 Electron 测试启动器会自动处理无头 Linux。Smoke/UI 音频套件另需 ffmpeg；开发预览和桌面歌词测试直接生成静音 WAV，不需要 ffmpeg。

## 2. 常用命令

| 命令 | 行为 |
|---|---|
| `npm run dev` | 首次编译后启动真实客户端；监听 `src/`，保存后自动重建并重启 |
| `npm run dev:mock` | 同样的开发循环，使用离线合成曲库、歌词和静音音频，无需登录 |
| `npm start` | 类型检查、生产构建、启动普通实例，使用日常应用数据目录 |
| `npm run preview` | 类型检查、生产构建、启动离线预览，供人工验收 |
| `npm run typecheck` | 只做 TypeScript 类型检查 |
| `npm run build` | 类型检查并生成 `out/main`、`out/preload`、`out/renderer` |
| `npm test` | 全部 Node 离线单测 |
| `npm run check` | 类型检查 + Node 离线单测 |
| `npm run verify` | check + 生产构建 + 桌面歌词 Electron 测试；每个阶段只执行一次 |
| `npm run test:release-contents` | 构建并检查安装包白名单，排除私人目录与开发文件 |

其他集成测试和各平台打包入口保留在 [README](../README.md#测试) 与 `package.json`，按改动范围选用。`verify` 是常用本地检查入口，不代表已覆盖所有平台和真实账号场景。本仓库不配置 CI，也不因提交或推送自动打包、发布。

## 3. 开发循环与数据目录

`scripts/dev.mjs` 调用当前锁定版本的 electron-vite 编译三部分源码，然后启动 Electron。监听范围是 `src/`；保存后的事件先防抖，重建和重启串行执行。编译失败会显示错误，已运行的实例继续保留；首次编译失败则退出，修复后重新执行命令。

编辑 `package.json`、`electron.vite.config.ts` 或 `scripts/` 后需手动重新启动开发命令。开发循环只做编译，类型检查留给 `check` / `verify`。重启会中断播放；设置和队列写入对应开发目录。

| 实例 | 数据目录 |
|---|---|
| `dev` | 系统临时目录下 `huawei-music-desktop-dev` |
| `dev:mock` | 系统临时目录下 `huawei-music-desktop-dev-mock` |
| `preview` | 系统临时目录下 `huawei-music-desktop-mock-preview` |
| `start` / 安装版 | Electron 正常的 `userData` 目录 |

三个开发/预览目录相互独立，不读取日常安装版的登录数据。临时目录可能被系统清理；真实账号的开发实例需要自行登录，仍使用应用原有的系统安全存储策略。不要同时启动两个使用相同数据目录的实例；Electron 的单实例锁会将后一次启动交给已有实例。

macOS 开发/预览直接运行 Electron，因此打包配置中的应用图标不会自动用于 Dock。主进程会在非打包实例就绪后设置现有 himo 图像；菜单栏复用同一标识的彩色图像，以 2x 显示为 16 点。无需修改 `Electron.app`、`package.json.name` 或数据目录。顶部对齐与这条图标链路可用 `node scripts/test-mac-header-branding.mjs` 定向检查：它创建独立的后台合成数据实例，不点击、截图或抢前台，结束时只关闭自己的实例。

终端按 Ctrl+C 停止开发会话，会关闭该会话创建的 Electron 和编译子进程。应用菜单/托盘「退出程序」或 macOS 的 ⌘Q 也会结束开发会话；仅关闭窗口可能保留托盘进程。

## 4. 为什么采用重建后重启

本工程已采用 electron-vite 常见的主进程、preload、renderer 目录结构，见 [官方开发说明](https://electron-vite.org/guide/dev)。工具的标准 dev 模式会给 renderer 启动开发服务器，见 [官方 CLI 说明](https://electron-vite.org/guide/cli)。

当前客户端只信任本地构建页面，并限制 CSP、导航和 IPC 来源。因此本 Fork 保留这些边界：`dev` 使用生产文件重建后重启；`preview` 在真实构建上替换预览进程内的账号/曲库 IPC。没有开发服务器，不开放新的端口，不放宽来源校验。

离线预览中的曲目、封面、歌词、写操作结果和音频都是合成数据。它用于界面与交互验收，不能当作真实登录、音乐库或播放权益的证明。

## 5. 代码入口

| 路径 | 职责 |
|---|---|
| `src/main/index.ts` | 应用生命周期、主窗口、托盘与媒体键 |
| `src/main/ipc.ts` | 主窗口 IPC 注册、来源校验与业务入口 |
| `src/main/auth-manager.ts` | 官方登录宿主、凭据与账号业务 |
| `src/main/desktop-lyrics.ts` | 桌面歌词窗口、受限 IPC、位置与设置 |
| `src/main/settings.mjs` | 设置默认值与清洗规则 |
| `src/preload/index.ts`、`src/shared/` | 白名单桥、通道常量与跨进程类型 |
| `src/renderer/App.tsx`、`components.tsx`、`pages.tsx` | 单一播放器状态、通用组件与页面 |
| `src/renderer/DesktopLyricsWindow.tsx`、`desktop-lyrics.css` | 浮窗歌词及工具栏 |
| `src/*.mjs`、`test/` | 可独立验证的协议、解析、缓存与离线单测 |
| `scripts/dev.mjs`、`preview-mock.mjs` | 开发循环与离线预览 |
| `scripts/test-*.mjs`、`scripts/build-desktop.mjs` | Electron 回归、产物检查与本地打包 |

不为迭代方便将 `src/`、`scripts/` 搬迁重排。应用显示名由 `src/shared/app-name.mjs` 管理，不通过更改 `package.json.name` 切换名称，以免改变现有数据目录。

仓库地址为 `https://github.com/Govin-L/himo`，新安装包文件名以 `himo-` 开头，Linux 可执行文件和桌面入口分别为 `himo` 与 `himo.desktop`。内部包名、应用 ID 和上表的开发/预览目录为兼容已有数据保留原值；不需要迁移登录状态、设置或队列。

## 6. 检查与贡献

本个人项目日常开发直接在 `main` 提交推送，不默认创建功能分支或 PR。先在干净工作区核对远端并快进同步：

```sh
git fetch origin
git switch main
git merge --ff-only origin/main
# 编辑代码
npm run verify
git diff --check
```

按实际改动补选现有 Electron 集成测试；需要打包时再运行对应平台的构建与产物校验。Windows 安装包只能在原生 Windows 构建。当前 macOS 上验证的命令不等于 Windows/Linux 均已验收。

`.editorconfig` 统一 UTF-8、LF、两空格缩进和文件末尾换行；Markdown 保留行尾空格。不新增 formatter，也不要对局部改动运行全文件自动格式化。

提交说明写清行为和验证，范围外改进另行讨论。不提交 `.local/`、`research/`、账号数据、Token、Cookie、构建产物或本机配置。开发或预览的数据也不应拷贝到仓库。

## 7. 手动同步上游

原始上游为 [talongao/huawei-music-desktop](https://github.com/talongao/huawei-music-desktop)，本 Fork 的分叉基线为 `3fd6731`。上游合并不是继续开发的前提。

第一次同步前添加远程（已有 `upstream` 时先检查地址，不重复添加）：

```sh
git remote add upstream https://github.com/talongao/huawei-music-desktop.git
```

在干净工作区中创建专门的同步分支，查看上游差异再合并：

```sh
git fetch origin
git fetch upstream
git switch --no-track -c feature/sync-upstream origin/main
git log --oneline HEAD..upstream/main
git merge upstream/main
npm run verify
```

逐项处理冲突，保留本 Fork 的桌面歌词和开发能力，检查上游变更是否重新引入 CI 工作流。核对无误后再按维护流程合入个人 `main`；不自动推送、发布安装包或改写历史。

## 8. 文档如何维护

- [README](../README.md)：fork 来源、功能状态、快速开始和命令索引。
- [实现状态](IMPLEMENTATION_STATUS.md)：当前验证证据、平台范围和剩余验收。
- `IMPLEMENTATION_PLAN.md`、`API_CONTRACT.md` 和历史研究文档：保留上游与研究过程，不能仅凭目标描述声称功能已经可用。
- `NOTICE`、`LICENSE` 和 `build/icon.LICENSE.txt`：保留上游版权、许可与第三方归属；变更来源声明时同步更新。
