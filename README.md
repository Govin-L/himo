# 华为音乐第三方桌面客户端

独立登录本人华为账号、读取自己的音乐库，并按账号已有权益播放华为音乐原音源。不是手机遥控器，不使用其它音乐平台替换音源。

## 免责声明与使用边界

> **本项目为独立开发的非官方实验性客户端，与华为及其关联公司不存在隶属、合作或代理关系，未获得其官方授权、认可或技术支持。当前仅用于内部研究与测试，尚未取得公开分发所需的授权，不提供公开发行或商业服务。**

- **商标与内容权利**：“华为”“HUAWEI”“华为音乐”等名称及相关商标归各自权利人所有，在此仅用于说明所兼容的服务，不表示官方身份或背书。歌曲、录音、歌词、封面及其它服务内容的权利归各自权利人所有；本项目不提供这些内容的所有权或再分发许可。
- **合法使用前提**：仅在适用法律、相关服务协议及实际授权允许的范围内，使用本人合法持有的账号访问有权使用的内容。个人研究、非商业用途、购买会员或能够成功调用接口，均不当然意味着已获准使用第三方客户端、接口或分发相关软件。
- **禁止用途**：不得利用本项目绕过付费、会员、地域、版权或技术保护限制；不得破解、下载后转售或未经许可传播受保护内容；不得盗取账号、收集他人凭据、滥用接口、未经授权批量抓取数据，或搭建面向公众的音源解析、转发及商业服务。
- **接口与登录身份**：本项目不是华为提供的 SDK，也不代表获得了接口使用许可。当前 OAuth 应用标识来自公开兼容性研究，并非本项目自有注册身份；技术上登录或播放成功不构成授权证明。公开源代码、发布安装包或商业化之前，仍须核查服务条款、应用身份、商标与内容权利，并取得必要许可。
- **使用风险与保证限制**：项目处于实验阶段，接口可能变更或停止服务，也可能发生功能错误、账号限制、数据丢失或安全问题。在适用法律允许的范围内，项目按现状提供，不承诺持续可用、适合特定用途、绝对安全或不涉及第三方权利。不要将其用于关键业务，不要向维护者发送密码、Cookie、授权码或令牌。法律规定不得排除或限制的责任，不因本声明而免除。
- **权利反馈**：权利人如认为项目中的代码、文档、标识或使用方式涉及其合法权益，可通过本仓库的 Issue 或仓库托管平台的联系渠道提供具体说明与权利依据。请勿公开提交个人信息或凭据；维护者会核查，并视情况暂停相关功能、调整或移除争议内容。

**本声明不是法律意见，也不替代必要授权，更不能保证免除法律责任或避免权利主张。** 在完成合规审查前，项目保持私有与内部测试状态；有意公开分发时，应先咨询熟悉软件、网络服务及知识产权事项的律师。

## 当前实现状态

**Electron + React + TypeScript 已落地，当前以 Linux 真实 Electron 验证共享逻辑与界面。** 已有真实扫码登录/首批收藏证据；真实华为 CDN 的 MP3/FLAC 在 Electron 全曲播放、安全凭据跨进程恢复仍待验收。因此当前是**内部测试版，不是完整验收版或公开发行版**。

## 启动

需要 Node.js 22.15+、Linux 桌面与常规 Electron 运行库：

```sh
npm ci
npm start
```

`npm start` 构建并启动本地 Electron，不使用浏览器演示页或业务后端。`npm run dev` 当前与 start 相同，不声称支持热更新。root 仅用于开发测试，启动器会加进程级 `--no-sandbox`；应用窗口本身仍启用 sandbox/contextIsolation/webSecurity。正式桌面验收应以普通用户运行。

无图形环境的离线测试自动使用 Xvfb；Xvfb 不代表物理音频输出/系统托盘已验收。测试需要 `ffmpeg` 生成合成音频和可用中文系统字体。测试启动器使用独立 fontconfig 缓存，解决系统缓存版本比 Electron 更新导致的中文方框，不改系统配置、不将整套字体打入发行包。

## 已实现与证据

| 功能 | 当前实现 / 验证边界 |
|---|---|
| 官方扫码、回调、音乐会话 | 真实 Electron 本人扫码通过，读取首批 50 首收藏；登录页无 Node/preload/业务 IPC，取消/错误 state/清理故障回归通过 |
| 收藏列表 | 每页 50 首，滚动接近底部自动加载，失败保留内容并可重试；切页保留数据和位置 |
| 收藏总数 | 接口没有已确认的直接总数字段，主进程后台分页到末页后按 ID 去重；总数与“已加载 N 首”分开，失败不显示假总数；计数/显示共用页索引，不重复请求 |
| 播放全部 | 先补齐分页，准备中可取消；不再把当前一页叫“全部”；965 首合成库队列与磁盘保存完整验证通过 |
| 歌单/搜索/专辑/歌手/历史 | 主进程 + 白名单 IPC + 页面；歌单/专辑分页；本机历史与华为只读历史分开；正式业务集成使用合成 HTTP 响应通过 |
| 歌单缓存 | 进程内 5 分钟缓存：重复进入歌单页不再重复请求，只有“刷新”回源；创建/改名/简介/删除与切换账号会失效缓存；离线时有标记的磁盘缓存仍可用 |
| 播放模式 | 设置里可选顺序播放/列表循环/单曲循环/**随机播放**（工具栏随机按钮同源）；随机模式的“上一首”按实际播放顺序回退，而不是打乱后的下标顺序 |
| 播放历史上报 | 按公开 H5 的 `recentlyplayed/create` 形态上报：真实收听达到阈值后只报一次，秒数为实际收听而非整曲时长；失败静默、不重试、不影响播放，可在设置关闭。**尚未用真实账号验证服务端结果** |
| 播放器 | 单 Audio、暂停/上下曲/seek/音量/队列/随机/循环/音质选择/行级歌词/MediaSession；本地 MP3/FLAC 与切页不中断通过，不等于真实 CDN/听播验收 |
| 账号写操作 | 收藏、带歌曲建歌单、简介修改、删自建歌单；主进程归属核验/串行/幂等/写后读回/创建未决意图；本轮只有合成集成测试，真实桌面写验收需另行授权 |
| 离线只读缓存 | 收藏与歌单网络失败可显示 5MB 上限缓存，并标“离线缓存，可能不是最新”；400 不清会话 |
| 凭据 | 主进程 safeStorage 保存最小音乐会话；不可用或 Linux basic_text 时只保留内存并提示，绝不明文降级；当前 headless Linux 无可用 backend，真实加密重启尚未通过 |
| 系统集成 | 托盘/关闭行为/MediaSession/媒体键已有代码；真实桌面媒体键、托盘可恢复性和睡眠恢复待验 |
| Linux 包 | AppImage/unpacked 内部构建；只打包 out + 必要依赖，检查私有资料/研究材料不进入包；见下方命令 |

**截图中的 Smoke MP3/FLAC、测试收藏 0001–0965 是离线合成夹具，不是你的真实音乐库。** 965 首测试验证的是完整大列表行为，本轮没有复用 `.local/` 中的真实会话重新读取本人 960+ 收藏。

## 测试

```sh
npm test                         # 140 项离线协议/业务/状态测试
npm run typecheck
npm run build
npm run test:electron             # 真实 Electron 边界、本地音频/seek/ended、代理路由
npm run test:electron-ui          # 页面、设置同步、最小窗口、队列跨进程恢复
npm run test:electron-favorites   # 965 首合成库，滚动/总数/重试/切页/完整队列
npm run test:electron-business    # 正式 AuthManager/API/IPC；仅登录页与 HTTP 为合成响应
npm run test:login-callback       # 离线 CAS/service/错误 state 导航
npm run test:release-contents     # 模拟发行白名单并检查 asar
```

可选公开网络测试（不扫码、不用个人会话）：

```sh
npm run test:login-navigation
npm run test:login-cancel
npm run probe:login
npm run probe:music
```

可选真实系统安全存储：`npm run test:safe-storage-restart`。使用合成会话跨三个 Electron 进程，系统 backend 不可用时明确失败；本机当前 basic_text，不能用单测加密器代替系统验收。

真实账号本人扫码入口：`npm run test:login-live -- --login --qr --full-library`。需当前用户明确准备授权；集中扫码后核验总数、完整分页和滚动加载，只输出数量，不输出 ID/曲名/凭据，并清临时 profile 和二维码。不带 `--full-library` 只检首批；不会自动写账号或冒充全曲播放验收。其它研究命令仅按 [接口契约](docs/API_CONTRACT.md) 与明确授权使用。

## Linux 内部构建

```sh
npm run dist:linux
npm run test:packaged -- release/linux-x64/linux-unpacked/huawei-music-desktop
npm run test:packaged -- release/linux-x64/huawei-music-desktop-0.0.1-linux-x86_64-internal.AppImage
node scripts/release-checksums.mjs release/linux-x64
```

普通 Linux 桌面直接执行 AppImage。`test:packaged` 从真正 AppImage 提取二进制后启动隔离 profile，核对 archive 与当前 out 一致、无私人路径、renderer 边界与设置写入。它不是本人账号/真实音频验收。

- `.deb` 需要真实主页和 `Name <email>` 维护者；有真实发布身份时通过 `DESKTOP_BUILD_HOMEPAGE`、`DESKTOP_BUILD_MAINTAINER` 传入。缺失就只产出 AppImage，不编造地址。
- Windows NSIS 安装包、macOS 分架构 DMG 入口保留为原生 OS 上的 `dist:win`、`dist:mac:x64`、`dist:mac:arm64`。Windows 单文件便携版可在 Linux 不借助 Wine 交叉打包，见下节。**不需要 Windows 才能验证共享 API/播放器逻辑**，交叉打包也不等于 Windows/macOS 已验收。
- 所有构建 `publish: never`，不自动上传。无真实签名身份的产物仅为内部测试；不能声称官方客户端或公开分发已获授权。
- `release/`、`dist/` 可能有历史包/失败的 NSIS 中间文件；只以本次成功命令及当前 Linux 目录为准，不把旧包当现役交付。

## Windows 单文件便携版（内部测试、未签名）

```sh
npm run dist:win:portable
npm run test:windows-portable -- release/win-x64-portable/huawei-music-desktop-0.0.1-win-x64-portable-internal.exe
node scripts/release-checksums.mjs release/win-x64-portable
```

- 只需一个 EXE，在 Windows x64 双击运行；不要求预装 Node.js，不弹安装向导、不生成卸载器、不注册系统协议。构建使用 electron-builder 的 portable 目标，**不调用 Wine**。
- 每次启动都会把程序解压至临时目录，正常退出后清理，因此启动比已解压目录版多一次解压成本。实际速度受磁盘、杀毒扫描等影响，尚无 Windows 测量，不承诺秒数。
- 设置、队列、本机历史与加密音乐会话仍保存在 Electron 的 `userData`（Windows 通常在 `%APPDATA%` 下），不在临时解压目录；正常重启或替换同一应用身份的新 EXE 不应因解压重置数据。`npm run test:portable-data` 已在 Linux 实际打包 Electron 中验证：删除第一份程序，换目录重新解压启动，userData 不变，设置、队列与 Chromium 本机存储均可恢复；这不是 Windows 凭据验收。退出账号会主动清个人数据。安全存储不可用/会话失效时仍须重新登录。
- “免安装”不等于“数据跟随 EXE”：复制 EXE 到另一台电脑不会带上原电脑的设置/登录，加密凭据也不能保证跨电脑或 Windows 用户解密。不把账号数据迁入 EXE 同目录来冒充全便携。
- 当前产物约 95 MiB，已在 Linux 静态拆包确认内嵌应用为 x64、内容与当前 `out/` 一致、无私人资料且无签名；外层 NSIS 启动器为 x86，不改变内嵌程序的 x64 要求。**尚未在 Windows 启动、听播或验证凭据恢复**。
- 未签名程序可能被 SmartScreen 或企业安全策略拦截；不要求关闭防护或绕过组织策略。仅供已知来源的内部测试，不自动上传或公开分发。

## 已知边界

- AT 实测 3600 秒，音乐 Token 是另一种凭据；新进程 78 分钟复用曾成功，约 7 天只是到期字段线索，不能承诺固定期限。
- 自动续期未打通，首版真正失效后重新扫码，不每小时强制登录。
- MP3/FLAC 协议研究样本曾完整 FFmpeg 解码，但不能替代 Electron 真实 CDN 的 metadata/seek/ended 与设备听播。
- 每日推荐不做。歌单只提供已验证的简介修改，不提供改名/封面/曲目编辑的空按钮。
- 不做下载/解密/特殊音质/Hi-Res 承诺/自动更新。
- 播放历史上报的接口形态来自公开 H5 资源，尚未用真实账号验证；若服务端拒绝，只会静默失败，不重试、不改变播放行为。
- 当前 OAuth client_id 来自公开兼容性研究，不是本项目自有注册身份；公开分发前仍需身份、授权和条款评估。

主进程 HTTP 与 Chromium 登录/音频遵循进程级 HTTP(S) 代理配置，不改系统代理。暂不支持 SOCKS/PAC/代理认证；错误配置明确拒绝而非静默直连。NO_PROXY 中 CIDR 仅主进程支持，Chromium 侧保留可表达的域名/IP 例外。

## 文档入口

- [当前进度 M0–M6](docs/IMPLEMENTATION_STATUS.md)：现役状态、测试与未验项。
- [实现方案](docs/IMPLEMENTATION_PLAN.md)：目标架构/行为，不代表全部已实现。
- [接口契约](docs/API_CONTRACT.md)：已测协议/参数与陷阱。
- [本人授权研究证据](docs/authorized-feature-validation.md)：历史真实写操作与清理证据。
- [登录回调修复](docs/LOGIN_CALLBACK_FIX.md)、[历史实现流水](docs/IMPLEMENTATION_HISTORY.md)：过程记录，冲突以当前状态为准。

`.local/` 包含真实凭据与私人音乐库数据，`research/` 是私有研究现场；不自动导入、不打印、不上传、不提交、不打包。renderer 只取固定 DTO，临时播放地址不写日志或磁盘队列。本轮未使用私人会话、未执行真实账号写操作。
