# 实现进度

更新时间：2026-10-23。当前以 **Linux 真实 Electron 环境**完成共享 API、业务逻辑、页面和播放器验证；Windows/macOS 不阻塞开发，不使用 Wine 作为运行/验收依赖。不对外发布。

## himo 仓库与项目品牌统一（2026-10-23）

- verified（仓库改名与品牌配置）：个人仓库已改名为 `Govin-L/himo`，同步当前文档、克隆命令、项目主页与问题链接；新安装包以 `himo-` 开头，Linux 可执行文件和桌面入口统一为 `himo` / `himo.desktop`。
- 保留内部 `package.json.name`、`build.appId`、现有数据目录和开发 profile，避免影响已有登录、设置和队列；保留上游名称、署名、许可和历史证据。本项目日常开发直接提交推送 `main`。
- 本轮验证：实际 electron-builder 元数据生成覆盖 macOS arm64/x64、Linux AppImage 与 Windows NSIS 文件名及 Linux 桌面入口/WMClass；文档链接、依赖锁文件不变和数据身份不变检查通过。`npm run verify` 通过（类型检查、184 项 Node 单测、构建、隐藏窗口桌面歌词回归）。远端仓库固定 ID、默认分支、可见性和 fork 来源保持一致，个人 SSH `origin` 已更新；未生成本轮安装包，未做 Windows/Linux 运行验收、发布或安装。

## 鸿蒙风格底部导航（2026-10-23）

- 提交门禁（macOS arm64）：`npm run verify` 通过，包括类型检查、184 项 Node 单测、构建和桌面歌词 Electron 回归。回归使用隔离合成数据，临时检查入口保持窗口隐藏、不抢焦点，未修改测试断言或生产默认交互；紧凑顶栏的四组几何/图标检查另已通过。未新增 CI 或执行发布、覆盖安装。
- verified（紧凑顶栏结构，macOS arm64）：用户反馈上一版红黄绿与品牌上下分行仍显割裂；现将窗口按钮、20px 品牌图像、15px 品牌文字、搜索和账户操作合为同排，顶栏占 52px，页面标题、说明与卡片继续按内容区左边线对齐。保留现有可见入口、网页拖动区与交互按钮。先以后台失败检查复现两组中心线相差 40px，再通过 1180×760、960×640、1440 宽与 120% 字号四组中心线、尺寸、间距及内容区对齐检查；类型检查、构建与图标检查通过，实例未获得前台焦点。视觉与真实鼠标手感仍由用户体验；未运行全量测试或重新打包安装。
- 开发版此前仅配置打包图标，进程仍沿用 Electron Dock 图标；现仅在 macOS 非打包进程就绪后设置现有 512px himo 图像，资源由 `?asset` 随主进程复制到 `out/main/chunks/`。菜单栏从另画的单色线条改为同源彩色 himo 图像，32px 按 2x 显示为 16 点，不改技术应用名或数据目录。类型检查、构建、后台定向检查及资源字节核对通过；真实设置调用和存活 Tray 已核实，检查实例未获得前台焦点。该轮未重新打包安装，未运行全量测试；视觉细节交用户体验。
- verified（本轮滚动收起，macOS arm64）：按用户确认仅保留「首页」「我的」两个 Tab；首页保留封面卡片与收藏，「我的」包含歌单、播放历史和设置，搜索保留在顶部。暂无接口的音乐厅、现在就听、café听暂不显示；歌词页仍从播放条打开。
- 向下浏览内容时，Tab 收成左侧圆形按钮，播放条下移至右侧同一行，内容区随之增高；顶部搜索同时收成右侧圆形按钮。往回拉、回到顶部、切换页面或打开歌词页时恢复；点击收起的 Tab 按钮也可展开。短页面不触发收起，布局变化造成的底部滚动钳制不会反向触发展开；减少动态效果时直接切换。
- 局部原生桥接现包含播放条、Tab、顶部搜索三个固定 `NSGlassEffectView`；DOM 仍持有布局和交互，动画期间逐帧同步几何，圆角跟随尺寸变成圆形。折叠搜索图标禁止 flex 收缩，避免窄按钮内图标变成零宽。三个控件启用原生背景后均去除 CSS 背景与模糊，来源与坐标校验沿用现有边界。
- 本轮验证：类型检查、构建和 4 项边界定向单测通过；原生检查证据覆盖展开、收起、动画中途跟随、最小窗口、zoom、字号、独立显隐、全屏、重载、重开和旧视图清理共 14 个状态，无页面异常。arm64 本地包实际启动，7 个构建文件与 `out/` 一致，两类原生模块从 `app.asar.unpacked` 加载，三个控件背景透明且 CSS 模糊为 `none`，renderer 隔离保持不变；打包检查未点击界面或登录。普通离线预览已打开，视觉和真实鼠标手感待用户体验；未运行全量测试、提交推送或覆盖安装。

以下保留此前各轮接入与验证记录：

- verified（macOS arm64 局部原生玻璃）：按用户明确要求扩展本项目的公开 AppKit / Node-API 桥接，播放条和底部 Tab 各有一个独立 `NSGlassEffectView`，保留整窗 `electron-liquid-glass@1.1.1`，未新增第三方依赖或改锁文件。网页只同步两个固定控件的矩形/隐藏状态，主进程复用 `isAllowedSender` 校验并按 renderer zoom 转换窗口坐标；原生句柄不进入 renderer，播放、队列和导航仍由现有页面持有。
- 两个局部视图明确位于 Chromium 合成视图下方，避免把控件自己的文字/图标采样进玻璃；原生 capsule 圆角随高度变化，鼠标命中返回 nil，HTML 保留交互。原生成功后去除这两个控件的 CSS 背景、模糊与阴影。页面重载先隐藏再同步，窗口销毁移除视图；macOS 26 以下或桥接不可用时保留原有 CSS 呈现。
- 局部接入验证：4 项边界/缩放/非法输入定向单测、类型检查和构建通过；真实 macOS 27.0.1 / arm64 的原生类型与 DOM/Cocoa 边界对照、960×640、renderer zoom、字号变化、独立显隐、全屏往返、重载不重复创建、窗口重开及旧视图清理检查通过，无页面异常。完整窗口取证确认文字清晰；没有自动点击界面代替真实鼠标手感验收，未运行全量测试。
- 原生构建集成到现有 main `closeBundle`，开发/构建入口均产出 arm64+x64 universal `.node`，其他平台跳过；macOS 源码构建需要包含 `NSGlassEffectView` 的 macOS 26+ SDK 和 Node 安装自带的 C 头。x64 仅核对二进制切片，本轮未在 x64/Windows/Linux 实机运行。
- 本轮局部玻璃的 arm64 包实际启动通过：局部模块与整窗模块都从 `app.asar.unpacked` 加载，包内原生二进制/主进程/preload/入口与当前构建逐字节一致；两个控件启用原生背景后 CSS `backdrop-filter` 均为 `none`，renderer 无 Node、原生句柄或通用 IPC。使用全新未登录 profile，未使用私人账号、未发布或覆盖安装。
- verified（macOS 窗口细节）：完整窗口截图复现系统浅色下独占 32px 的白色标题栏，改为 `hiddenInset` 一体化深色标题栏，保留红黄绿按钮、预留品牌空间，首帧就绪后显示。顶部提供拖动区域，搜索/账户按钮排除拖动；播放条与底部导航增加 CSS 玻璃层次和边缘高光。类型检查、构建、范围检查、原生窗口截图和 960×640 边界检查通过；renderer 的 sandbox/contextIsolation/Node 隔离设置保持原值，未运行全量测试。
- verified（macOS arm64 原生 Liquid Glass）：用户人工 review 批准后，精确锁定 macOS 可选依赖 `electron-liquid-glass@1.1.1`，完整性与已审查发布包一致。仅在 macOS 26+ 主进程动态加载，页面就绪后为主窗口调用一次标准 `addView`，真实原生二进制返回有效视图 ID；半透明深色背景透出 `NSGlassEffectView`，保留红黄绿按钮。不调用 `unstable_*` 私有实验方法，不叠加 Electron vibrancy；模块缺失或初始化失败时保留深色窗口。
- 本轮原生接入验证（macOS 27.0.1 / arm64）：类型检查、构建、范围检查、完整原生窗口截图通过；定向检查页面重载不重复插入原生层、960×640、全屏往返、窗口重开均正常，无页面异常。模拟旧系统时未加载原生二进制，模拟 addon 不可用时保持可见深色窗口；独立副本缺少 macOS 可选依赖时类型检查通过，未宣称 Windows/Linux 已运行验收。本轮未自动点击界面替代用户手感验收，未运行全量测试。
- 本地 arm64 应用打包并实际启动通过：`app.asar` 内构建文件与当前源码构建逐字节一致，包含 NOTICE、MIT 许可及依赖加载器；双架构 `.node` 资源正确解包，arm64 原生库实际从 `app.asar.unpacked` 加载。包内无私人目录或项目源码，renderer 隔离边界不变，使用全新未登录 profile；未发布或覆盖安装。
- 早期布局（已由本轮两个 Tab 替代）：主窗口曾为底部悬浮五 Tab、上方独立播放条与炭黑内容区、深灰浮层及红色强调，其中「现在就听」曾打开歌词页。当前入口以本节顶部的两个 Tab 和播放条说明为准。搜索、表单、设置和队列统一深色；桌面歌词设置中的浅色背景预览保持独立对比度。
- 播放条与歌词页共享现有播放器、队列和歌词状态；保留收藏总数、滚动分页、错误重试及返回位置，外观偏好继续使用现有设置。同步现有回归脚本的导航入口与最小窗口几何断言。
- 播放条与歌词页使用原生 View Transition 实现双向封面缩放、页面淡入淡出；共享元素名称仅分配给当前可见封面，快速切换时取消旧动画且旧回调不覆盖最新页面。系统开启「减少动态效果」时直接切换。
- 本轮验证：类型检查、三部分构建、4 个受影响脚本的语法检查及暂存 diff 格式检查通过。macOS arm64 的独立临时 profile、合成曲库及静音 WAV 定向检查通过：真实浏览器执行 360ms 过渡、双向切换、快速导航覆盖待执行展开、减少动态效果、唯一 Audio 与播放不中断、960×640 下播放条/导航/内容边界及无页面异常。已核对音乐库、过渡帧、歌词页和最小窗口设置页截图；未跑全量测试。新版普通离线预览已重新启动供用户体验。
- 外观与实际手感仍待用户验收；本轮未使用私人账号、未更新安装版或发布，其他平台未做本次运行验证。

## himo 名称与图标（2026-10-23）

- verified（macOS arm64 构建）：应用显示名统一为 `himo`，用于窗口、侧栏、设置、托盘提示和打包配置。保留 `package.json.name`、`build.appId` 和现有数据目录；保留上游来源、版权及许可声明。
- 生成一版深蓝底、薄荷绿音乐丝带 `h` 图标，源图保存于 `build/himo-icon-source.png`；生成器输出 512px 应用图标、32px 彩色托盘及 16px / 32px macOS 单色模板，并同步内嵌资源。当前菜单栏已改用同源彩色托盘；原单色模板资源保留。界面品牌使用同一应用图标，图标外观交由用户验收。
- 本轮验证：类型检查与三部分构建通过；图标尺寸、透明外沿、非空像素及内嵌资源与 PNG 字节一致性校验通过；发行内容检查通过。提交门禁 `verify` 通过（180 项 Node 单测、类型检查、构建、桌面歌词 Electron 回归）；未安装或发布新版。

## 个人 Fork 开发基建（2026-10-23）

- verified（macOS arm64）：已移除唯一的 CI 工作流 `windows-installer.yml`；提交和推送不自动构建或发布。保留原生打包入口与历史研究记录。
- 新增 `dev` / `dev:mock` 自动重建和重启循环、`preview` 离线预览、`check` 与 `verify` 本地检查。开发实例使用独立临时数据目录；未引入开发服务器或放宽 CSP、导航和 IPC 来源校验。
- README、NOTICE 注明 fork 来源、分叉基线 `3fd6731`、修改内容与日期；新增 `docs/DEVELOPMENT.md`，同步 AGENTS 工作规则、`.editorconfig`、`.nvmrc`。移除未使用的 Vitest 及其独占依赖，其余锁定版本和完整性未变。
- 本轮验证：`verify` 通过（类型检查、180 项 Node 单测、三部分构建、桌面歌词 Electron 回归）；发行内容检查通过（171 个文件 / 200 个归档条目）。`dev`、`dev:mock` 均实测首次启动、源码文件变化后约 1.1–1.2 秒重建、旧进程退出并启动新实例、Ctrl+C 后无本轮 Electron 主进程残留；`preview` 实际启动，主进程与 renderer 保持运行。开发循环验收只触发文件变化事件，未改动业务源码、未登录真实账号；未另做界面点击或截图验收。Windows/Linux 的新开发循环未做本轮运行验证。

## 透明桌面歌词（2026-10-22，10-23 修正）

- verified（macOS arm64 源码版）：独立、透明、无边框置顶歌词窗口，字号可调 18–64px。锁定后隐藏工具栏并调用原生鼠标穿透、禁止聚焦；主播放栏提供解锁入口。位置、字号与锁定状态保存在现有设置文件，恢复时限制到当前屏幕工作区。
- in-progress（10-23）：真实鼠标验收发现悬停工具栏一移动就消失、点不到按钮。原因是整窗原生拖动区域在 macOS 上吞掉鼠标移动；自动化测试的鼠标事件直接注入页面，测不出该问题。已改为页面内指针拖动（主进程只接受浮窗自身发来的有效坐标）并开启 `acceptFirstMouse`；真实鼠标的悬停、拖动与按钮点击待复验。
- in-progress（10-23，样式设置）：设置页新增「桌面歌词」分区，含实时预览（深色/浅色桌面）；6 套预设配色；未播放与已播放色各支持上下两色渐变；描边颜色与粗细；歌词不透明度 20–100%、暂停时变淡；透明字幕或半透明背景条（颜色跟随描边，背景不透明度可调）；系统字体、字重、字号、第二行字号比例；一键恢复默认。描边为「加倍描边底层 + 渐变填充上层」两层叠字，渐变与外描边同时保持清晰。浮窗工具栏参照 QQ 音乐改为悬停底板加居中图标条：字号、不透明度、歌词设置（打开主窗口对应分区）、锁定、关闭。设置写入现有设置文件，规则只在 `settings.mjs` 一处，主进程仅接受原样通过清洗的补丁。外观与真实鼠标交互待用户在离线预览中验收。
- 复用主窗口唯一 Audio 与歌词缓存，同步播放/暂停/缓冲、seek、切歌、翻译、源文件提供的词级高亮和歌词偏移；超长句按播放进度平移，暂停后停止。时间戳空行视为间奏：淡显下一句（有翻译时第二行显示翻译，否则标「间奏」），最后一句之后只显示 ♪。浮窗只获得受限的歌词展示/偏好/移动/打开设置桥，使用独立内存 session，拒绝网络、权限请求与不可信导航，不传播放地址或凭据。
- 相关修正（10-23）：设置页系统字体列表在字体很多时条目被压扁裁字，列表条目改为不收缩；macOS 字体列表改用 AppKit 原生接口（经 `osascript`），fontconfig 仅作回退；「沉浸歌词」偏移按钮的无障碍标签方向对调，与实际效果一致（+ 为歌词提前）。
- 样式设置的验证（10-23）：类型检查与构建通过；全部 180 项 Node 单测通过（含样式清洗与 macOS 字体解析）；桌面歌词 Electron 测试通过，新增覆盖工具栏不透明度、从浮窗打开设置、套用配色、重启后保留与偏移按钮方向。依赖 ffmpeg 的 Smoke/UI 套件本机未运行；外观与真实鼠标交互待用户验收。
- 验证：类型检查及构建通过；全部 Node 单测通过；真实 Electron + 独立临时 profile + 静音合成 WAV 验证开关与重开、唯一 Audio、播放同步、主窗口隐藏后继续切句、间奏显示、长句平移/暂停、字号调整、页面拖动按指针位移移动窗口、位置保存、锁定/主窗口解锁、关闭主窗口无孤立浮窗、进程重启后位置/字号/锁定恢复、无效屏幕位置回收。锁定检查覆盖真实原生 API 的开关调用与焦点属性，未模拟操作系统鼠标实际点击穿过下层窗口；悬停与拖动的测试事件由测试注入页面，不等同于系统级真实鼠标。
- 离线预览：`npm run build && node scripts/preview-mock.mjs` 运行真实应用，仅在预览进程内替换账号与曲库 IPC，使用合成曲库、带时间轴歌词与静音音频；不联网、不读写账号数据，`scripts/` 不进入安装包。
- 截图：`release/qa/macos-desktop-lyrics-synthetic.png`（透明字幕）及 `release/qa/macos-desktop-lyrics-toolbar-synthetic.png`（悬停工具栏），均为离线合成数据。本轮未登录真实账号、未新增依赖、未修改 OAuth、未更新本机安装版；Windows/Linux 未做本次验收。完整 Smoke/UI 音频套件因本机无 `ffmpeg` 未运行，不能以本次定向验证替代全套结果。

## macOS 菜单栏图标修复（2026-10-22）

- verified（macOS arm64）：原图标生成页面存在嵌套 HTML 与 SVG 基线溢出，滚动条被截入 `build/icon.png` / `build/tray.png`。生成器改用单一文档、块级 SVG、透明背景与禁止溢出，并将 Retina 截图归一为目标像素尺寸。
- macOS 使用独立的 16px / 32px 黑色透明模板图，标记为 template image；Windows/Linux 保留彩色托盘图。已用独立临时 profile 启动源码版，实际菜单栏音符无滚动条。
- 验证：176 项离线单测、类型检查、构建及 arm64 DMG 打包通过；包内 5 个编译文件与当前 `out/` 逐字节一致，无私人目录。源码版及 macOS arm64 安装版实际菜单栏图标均正常，安装后归档哈希与构建产物一致。未验证其他平台。

## M0–M6

| 里程碑 | 状态 | 当前证据与剩余验收 |
|---|---|---|
| M0 工程与安全边界 | verified | 锁定依赖；`npm ci`、typecheck、134 项离线单测、构建通过。Linux Electron 验证 renderer 无 Node/通用 IPC、精确来源与导航限制；app.asar 白名单检查通过。 |
| M1 登录与播放 | in-progress | 历史本人扫码已在正式 Electron 完成 CAS → OAuth → 音乐会话 → 首批 50 首收藏，无写操作。当前 Linux 本地合成 MP3/FLAC 实测播放、seek、ended、页面切换不中断通过。**真实华为 CDN 音源 MP3/FLAC 在 Electron 全曲播放、可用系统 safeStorage 下重启恢复仍待验收**。当前系统 backend=basic_text，应用正确 memory-only。 |
| M2 音乐库只读 | in-progress | 收藏、个人歌单/详情、搜索、专辑/歌手、历史已实现；歌单/专辑有分页。新增收藏总数后台索引 + 滚动分页 + 失败重试 + 切页/位置保留。965 首合成库在正式主进程与真实 renderer 分别通过；**不是本人 960+ 首的本轮实测**。收藏/歌单只在网络失败时回退 5MB 有标记缓存；400 不误判失效。 |
| M3 播放器日用能力 | in-progress | 单 Audio、顺序/随机/循环、音量/seek、音质选择、歌词高亮/手动滚动暂停跟随、队列恢复不自动播放。本轮补全歌词：解析词级 `<mm:ss.xx>` 逐字时间、同时间戳双语合并为翻译行、忽略 `[ti:][ar:]` 等元数据、主进程按曲缓存 LRC 结果；新增沉浸歌词页（点击行跳转、进度拖动、±0.5s 偏移按曲记忆、滚轮暂停跟随、Esc 退出）。设置同步、媒体键旧闭包与初始化队列竞态已修。965 首队列真实磁盘读回完整且无播放 URL。真实 CDN/听播、过期资源和睡眠恢复仍未验收。 |
| M4 受控写操作 | in-progress | 主进程串行写，收藏幂等读回；简介/删除先确认当前账号 owned，再读回核对。创建保留本次基线与未决意图，超时不重发，进程重启仍阻止盲目重复创建。生产业务集成测试使用合成响应通过。历史真实接口写验证及 added=0/removed=0 证据仍有效；**新桌面写路径没有当前授权下的真实写验收**。 |
| M5 视觉与系统集成 | in-progress | 视觉整体重做：浮起玻璃面板、窄侧栏、无边框内容、独立播放坞；配色与图标体系自定（暖白中性色 + 默认华为红）。CSS 变量化设计系统，960/1100 两档响应式。设置改为二级分类（播放/外观/关于），外观可调主题色、面板透明度、圆角、字号、字体，写入设置并实时生效。沉浸歌词改为左侧封面 + 右侧居中歌词。Linux Electron 实际截图覆盖 1180×760、960×640、歌词抽屉与沉浸歌词页、队列抽屉、965 首长列表。**新视觉未经用户最终确认，不宣称定稿**。托盘/关闭/媒体键有代码，物理媒体键、无托盘桌面及睡眠恢复仍待验。 |
| M6 发行工程 | in-progress | Linux x64 AppImage 已构建；从实际 AppImage 提取二进制并启动隔离 profile，核对打包文件与当前 out 一致、renderer 无 Node、设置可保存，全部通过。Windows 目标已按要求改为 **NSIS 安装包**，单文件 portable 构建入口、校验脚本与 CI 工作流已删除（`dist:win:portable`、`test:windows-portable`、`windows-portable.yml`）。安装包只能在原生 Windows 上构建；本 Fork 已移除 CI，使用本地 `dist:win` + `test:windows-installer`，**安装/启动/播放仍未完成人工验收**。macOS arm64/x64 DMG 入口保留。deb 等待真实主页/维护者身份，不编造。 |

## UI 重做与歌词能力（2026-10-18）

- 视觉：`src/renderer/styles.css` 全量重写为 token 化设计系统（暖白中性色 + 单一华为红强调、圆角/阴影/间距/动效变量）。布局从「侧栏 + 通栏播放条」改为「浮起玻璃面板 + 独立播放坞」；列表加入封面缩略图、hover 播放按钮、当前行强调；设置页开关与下拉重绘；新增 `prefers-reduced-motion` 与 960/1180 两档断点。
- 借鉴边界：参考 Q-music 的布局语言与质感，未复制其色板（其主色为绿）、图标或组件实现，全部为本项目自写。
- 歌词解析（`src/lyrics.mjs`）：支持词级 `<mm:ss.xx>` 逐字标记、同一时间戳第二行合并为翻译、丢弃 `[ti:][ar:][al:][by:]` 元数据、纯文本歌词也保留逐字段；新增 6 项解析回归（共 11 项歌词单测）。
- 歌词来源降级：`resolvePlayback` 没有可用 `lyricAddress`、或地址拉取/解析为空时，改读响应内嵌的 `lyrics`（含 `contentExInfo` 与再套一层 JSON 的形态）；仍只接受华为 CDN 白名单地址，内嵌文本有 512KB 上限，新增 5 项 `lyric-resource` 单测。
- 歌词缓存：`AuthManager.getLyrics` 复用进程内 `memory-cache`（键 `lyrics:<trackId>`，账号切换/退出即失效）；renderer 另有一层按曲缓存，避免反复开关面板触发取链。
- 沉浸歌词页：全屏深色舞台 + 封面模糊背景，点击行 seek、进度条拖动、±0.5s 偏移（按曲存 `localStorage`，全局值兜底）、滚轮暂停跟随、Esc 退出；侧栏歌词抽屉保留并互斥于队列抽屉。
- 详情页：歌单/专辑/歌手新增封面 + 标题 + 主操作区（hero），取代原来的小标题行；歌单简介、删除确认、分页加载行为不变。
- 回归：typecheck、150 项离线单测、`test:electron`、`test:electron-ui`、`test:electron-business`、`test:electron-favorites` 全部通过；UI 测试仍覆盖歌词抽屉/队列互斥、播放与收藏写入。截图更新为 `docs/assets/{library,settings,favorites-total}.png`。

## 外观设置 / 歌词布局 / Windows 安装包（2026-10-18 第二轮）

- 沉浸歌词（`LyricsStage`）改为两栏：左侧封面 + 曲名/艺人/专辑，右侧歌词区域横向居中、当前行放大并保留逐字/翻译；底部仍是播放控制、进度、跟随与 ±0.5s 校正。
- 设置页拆成二级面板：`播放`（关闭行为、音质、模式、历史同步）、`外观`、`关于`；版本号常驻面板底部，`退出程序` 移到「关于」。
- 外观设置写入 `AppSettings.appearance`（`accent` / `panelOpacity` / `cornerRadius` / `fontScale` / `fontFamily`），`sanitizeAppearance` 做枚举校验与范围钳制（透明度 0.55–1、圆角 0–18px、字号 85%–120%），部分 patch 不会重置其它字段。renderer 通过 `document.documentElement` 上的 CSS 变量实时应用（`--accent*`、`--panel-alpha`、`--radius-unit`、`--fs-scale`、`--font-ui`）；设置页做乐观本地状态，连续拖动不丢步。
- 播放坞音量图标改为静音切换（记录上次可听音量）。
- 封面兜底：真实曲目封面来自 `picture.bigImgURL/middleImgURL/smallImgURL`（主域名 `music-pics-drcn.dbankcdn.cn` 等，均在 CSP 与队列持久化白名单内）；酷客部分封面仍是 `http://image.kuke.com`，会被 CSP 拦截，因此列表、播放坞、详情 hero 与歌词页统一使用带 `onError` 兜底的 `Cover` 组件，加载失败显示图标而不是破图。
- Windows 目标改为 **NSIS 安装包**：删除 `dist:win:portable`、`test:windows-portable`、`test:portable-data`、`windows-portable.yml`；新增 `dist:win`（仅原生 Windows）+ `test:windows-installer`（NSIS 标记、内嵌 x64 应用、无私有目录、图标像素、与 `out/` 逐文件一致）+ `windows-installer.yml`。**安装包尚未在 Windows runner 上实跑，安装/启动/播放未验收。**
- 回归：typecheck、152 项离线单测（新增外观 sanitize 与部分 patch 用例）、`test:electron`、`test:electron-ui`（新增外观改色/圆角/字体写盘与恢复默认断言）、`test:electron-business`、`test:electron-favorites` 全部通过。

## 第三方歌词 / 自定义外观 / 系统字体（2026-10-18 第三轮）

- 歌词兜底：服务端返回空歌词时，主进程按「歌名 + 艺人 + 时长」匹配第三方歌词库（酷狗 → LRCLIB）。纯函数 `lyrics-provider.mjs` 负责归一化与打分：标题非精确匹配时必须时长一致，艺人必须匹配，`MIN_SCORE` 以下一律拒绝，避免「安静下来」冒充「安静」。第三方结果带 `source`/`matchedTitle`，抽屉与沉浸页会标注来源；可在「设置 → 播放 → 第三方歌词匹配」关闭。实测（本机网络）：酷狗对《假如》《安静》《朵》《终有一天》《Bohemian Rhapsody》均命中；LRCLIB 华语覆盖较弱但英文可用。
- 自定义主题色：色板末尾增加原生取色器，`#rrggbb` 经 sanitize 校验，`theme.mjs` 从单个颜色派生 light/deep/soft/line/shadow。
- 系统字体：`fonts:list` 白名单 IPC，Windows 走 PowerShell + `System.Drawing.InstalledFontCollection`，Linux 走 `fc-list`；渲染进程用带搜索的字体列表（每项以自身字体渲染）选择，选择结果写入 `appearance.customFont` 并成为 CSS font-family 栈首项。Chromium 的 `queryLocalFonts()` 在 `file://` 文档下不可用，因此改为主进程枚举，main 窗口权限保持全拒。
- 回归：typecheck、170 项离线单测（新增 10 项歌词匹配、5 项主题色、2 项字体解析）、`test:electron`、`test:electron-ui`（新增自定义色写盘与 `fonts:list` 断言）、`test:electron-business`、`test:electron-favorites` 全部通过；`scripts/capture-ui.mjs` 增加系统字体与自定义色截图。

## 歌词磁盘缓存与本地导入（2026-10-18 第四轮）

- 磁盘缓存：`userData/lyrics-cache` 按曲目写入 JSON（sha256 键名、单文件上限 512 KB、TTL 90 天、超过 3000 个文件按 mtime 清理）。读取顺序为「本地导入 → 内存 → 磁盘 → 华为 → 第三方」，空结果不落盘，保证后续仍能重试。缓存不含账号信息，切换/退出账号不删除。
- 本地导入：`lyrics:import` 由主进程打开文件对话框，支持 `.lrc`/`.txt`，按 BOM 识别 UTF-16，UTF-8 校验失败回退 GBK；解析为空则报错不覆盖。导入内容写入 `userData/lyrics-local` 并优先于网络结果，歌词面板与沉浸页都可「移除本地」。
- 设置：`设置 → 播放` 显示缓存占用、网络条数、本地导入条数，提供「清除网络缓存」「清除本地导入」，清除后立即刷新数字。
- 回归：typecheck、176 项离线单测（新增 6 项歌词存储：GBK/UTF-16/UTF-8 BOM 解码、缓存文档校验、键稳定性）、`test:electron`（IPC 边界新增 `lyrics`）、`test:electron-ui`（真实文件导入 + 来源标注 + 缓存清除）、`test:electron-business`、`test:electron-favorites` 全部通过。

## 开源准备（README 重写）

- README 按开源项目结构重写：现状表（区分已实测/未验证）、截图（合成数据）、快速开始、功能范围与非目标、构建与打包（Windows 便携版 / Linux AppImage / macOS DMG / 交叉构建说明）、CI、测试、架构与安全边界、数据与隐私、已知限制、参与贡献、第三方组件、许可、免责声明。
- 原“Linux 内部构建 / Windows 单文件便携版（内部测试、未签名）/ GitHub Actions 自动打包”三节改为面向外部读者的构建与 CI 说明；不再以“内部”为标题，但保留未签名、未真机验收等事实说明。
- 新增 `docs/assets/` 三张合成数据截图；`test:release-contents` 确认它们不进入发行包。
- 许可已定为 **AGPL-3.0-only**：加入 `LICENSE`（GNU 官方文本）、`NOTICE`（版权、SPDX、第三方归属）、`package.json` 的 `license` 字段；README 说明许可范围、衍生作品与网络服务的源码义务，以及“许可不授予华为接口/商标/内容权利”。
- README 进一步明确 OAuth 应用标识出处：`client_id=101444301` 来自第三方公开帖（吾爱破解下载工具 / `Tontonnow/hwyy`），帖中未说明获取方式；我们的抓取显示它同时是华为音乐在 AppGallery 的应用 ID（`C101444301`），官方回调 scheme 为 `com.huawei.apps.101444301:/oauth2redirect`，因此极可能是官方 App 自身身份。
- 作者选择方案 B：仓库开源（AGPL-3.0）并保留现状；后续按作者要求恢复 **GitHub Release 发布**（未签名学习构建，发布说明写明未签名、非官方、OAuth 身份不属于本项目）。OSS 上的历史二进制已删除并验证 404；不再使用第三方对象存储分发。
- GitHub 仓库转为公开；Gitee 仍私有。

## CI：GitHub Actions 原生 Windows 打包（上游历史记录）

> 本节保留历史证据。本 Fork 已于 2026-10-23 移除所有 workflow，当前只通过本地命令检查和打包。

- 仓库镜像到 GitHub 私有仓库（`talongao/huawei-music-desktop`），CI 工作流 `windows-installer.yml`（原 `windows-portable.yml`）：手动或 `v*` 标签触发，windows-latest 上执行 `npm ci` → 单元测试 → `dist:win` → 安装包静态校验 → SHA256SUMS，发布到 GitHub Release；不上传 OSS。改动后尚未在 Windows runner 上实跑。
- 产物发布：手动运行或 `v*` 标签会创建/更新对应标签的 GitHub Release（exe + SHA256SUMS），不自动传 OSS；标签与 `package.json` 版本不一致会失败。
- 可选 Windows 烟测需要 ffmpeg，runner 不自带，已在步骤内 `choco install ffmpeg`；该步骤失败不阻断任务（此前失败即为缺少 ffmpeg，非应用缺陷）。
- 首次运行验证：run 38936061865 全绿，产物 100,141,218 字节，`SHA256 6d8c829c1613f46da6c01abb04699e7fe8a0001bbfe2de46424d3373dc7b774e`，应用 exe 名称为“华为音乐第三方客户端（学习版）.exe”，图标像素校验通过。
- 为让校验适配 Windows，静态检查改为：解包定位（不解析 7-Zip 清单文本）、兼容展平布局、asar 解包后按文件比对（不再依赖 asar 条目分隔符）。这些修复保留了 Linux 侧原有的 payload 名与 PE 架构断言。
- 原生 Windows 构建与本地 Linux 交叉构建字节不同，两者均通过同一套静态校验；**Windows 启动/播放仍未验收**。

## 第四批完成（去掉默认菜单 / 改名学习版）

- 移除 Electron 默认菜单：Windows/Linux `Menu.setApplicationMenu(null)`，窗口 `autoHideMenuBar`；macOS 仅保留 appMenu/editMenu/windowMenu 最小角色，Cmd+Q 等仍可用。smoke 回归新增断言：应用菜单为 null 且窗口菜单栏不可见。
- 改名为“华为音乐第三方客户端（学习版）”：显示名集中在 `src/shared/app-name.mjs`（窗口标题、侧栏、设置页、托盘 tooltip），`build.productName` 同步改为该名称，exe 显示名与 Linux desktop `Name` 一致；`package.json` 的 `name` 与 `appId` 未改，因此 userData 目录和已存设置/登录数据不迁移、不丢失。
- 回归：140 项单测、smoke（含菜单断言）、UI、业务、965 首、cancel/callback/navigation 均通过；Windows 包静态校验通过（应用 exe 改为动态发现，图标像素校验仍通过）；重命名后 Linux 包含新名称与图标。

## 第三批完成（登录内嵌窗口 / 自绘图标）

- 登录宿主由独立 `BrowserWindow` 改为主窗口内的 `WebContentsView`：远程页依旧无 preload、无 Node、独立临时 partition，权限/下载全拒；顶部保留 48px 取消条（`LOGIN_VIEW_TOP_INSET`），新增 `auth:cancelLogin` 白名单 IPC；窗口 resize 会重排视图，窗口关闭/取消/清理失败仍 fail-closed。
- 回归更新：取消用例改为点应用内“取消登录”，并断言全程 `BrowserWindow.getAllWindows().length === 1`；回调用例同步；live 工具改从 `web-contents-created` 取脱敏导航轨迹、按 URL 解析内嵌页。
- 图标：`scripts/make-icon.mjs` 从 Lucide（ISC）Music 字形生成 `build/icon.png`(512) 与 `build/tray.png`(32)，托盘改用生成的 `src/main/icons.ts`；归属声明写入 `build/icon.LICENSE.txt`。
- 图标证据：Windows 包内 `.icon-ico/icon.ico` 被解析出 16/24/32/48/64/128/256 七档，最大档 PNG 解码后品牌底色覆盖 85.6%、字形 11%（Electron 默认图标不可能满足）；Linux AppImage 内的 `huawei-music-desktop.png` 与 `build/icon.png` SHA-256 逐字节一致，`.desktop` 的 `Icon=` 指向它。
- 回归：140 项单测、smoke、UI、业务、965 首、cancel/callback/navigation、Linux AppImage 启动与重复解压不丢数据均通过。

## 第二轮完成（歌单缓存 / 随机播放 / 历史同步）

- 歌单缓存：`src/main/memory-cache.mjs` + `AuthManager` 进程内 5 分钟缓存；重复读歌单/详情不再请求，显式 `refresh` 回源；写操作与切换账号失效。生产业务测试断言重复读不增加网络请求、刷新只增加一次。
- 随机播放：设置页新增“随机播放（打乱队列顺序）”模式，与工具栏随机按钮同源；随机模式下“上一首”按实际播放顺序回退（`pushPlayHistory`/`popPlayHistory`）。
- 播放历史上报：`recentlyplayed/create` 按公开 H5 形态实现（`src/music.mjs` + `huawei.createRecentPlay`），真实收听达阈值后只报一次，秒数为实际收听；`syncHistory` 可关；`retry:false`、失败静默。**未用真实账号发起过写请求**，服务端效果待验。
- 测试：140 项单测、Electron smoke/UI/业务/965 首回归全部通过；UI 回归断言真实播放只上报一次且不超过整曲时长；业务回归断言上报负载与失败静默。

## 上一轮完成

- `src/main/favorites-catalog.mjs`：50 首分页计数到末页、ID 去重、在途请求共享、刷新/账号变更失效、无进展保护。接口无可靠总数字段，不猜接口或硬编码 960/965。
- `src/renderer/favorites-page.tsx`：总数与已加载数独立显示，底部预取下一批，错误保留内容并暂停自动重试；保留切页数据/滚动位置；播放全部先补齐分页，可取消准备。
- `src/main/writes.mjs`：owned 归属核验、写后读回、幂等/互斥、创建未决意图持久化。JSON 写入按文件串行，账号退出清队列、缓存、历史、未决意图及损坏备份；保留通用设置。
- `test:electron-business`：**不替换业务 IPC**，仅模拟登录页和 HTTP transport，生产 AuthManager/API/IPC 流程覆盖读取、写约束、缓存、400、退出清理；主进程 965 首扫描正好 20 页，随后读末页不重发。
- `test:electron-favorites`：965 首合成库，50→100→失败→重试→150，返回页面位置不变；播放全部取得 965 首，实际 queue.json 也是 965 首，无音频地址。
- `test:electron-ui`：页面、合成音频、写 UI、设置即时同步、最小窗口几何、队列跨进程恢复。
- 登录取消回归修复测试时序：等实际 CAS 页面后再投递错误 state；生产登录逻辑未因该测试更换。

## 测试边界

已运行：`npm ci`、typecheck/build、134 项单测、`test:electron`、`test:electron-ui`、`test:electron-business`、`test:electron-favorites`、`test:login-callback`、`test:login-cancel`、`test:login-navigation`、发行内容检查。公开登录页回归没有扫码或令牌交换。

`test:safe-storage-restart` 在当前 Linux 明确失败于 basic_text/backend 检查。**不通过 mock 加密器、明文后端或其它平台声明来代替它。**

截图位于被忽略的 `release/qa/`，其中 `linux-favorites-965-synthetic.png` 与 Smoke MP3/FLAC 都是离线测试内容，绝不是用户真实账号数据。当前 AppImage 是内部测试，不代表 M1 或三端验收完成。

本轮未读取/导入 `.local/` 私人会话、未执行任何真实账号写操作，因此没有新增真实对象需要清理。测试 profile 与合成资源由脚本 finally 清除。源码后按用户授权提交至 Gitee 私有仓库；安装包/凭据/日志未上传，未改系统代理。

## 运行与剩余参与点

- Linux 桌面：`npm ci && npm start`；headless 自动化：`npm run test:electron-favorites` 等命令自动使用 Xvfb。
- Linux 构建：`npm run dist:linux`；产物 `release/linux-x64/`。`test:packaged` 可检查 unpacked 或从 AppImage 提取的实际二进制。
- 真实账号完整收藏：新增 `npm run test:login-live -- --login --qr --full-library`，同一次本人授权核验总数、完整分页和滚动加载，只输出统计；默认不会运行。真实 MP3/FLAC 播放仍另验，不以该脚本冒充。
- 最新 AppImage：`release/linux-x64/huawei-music-desktop-0.0.1-linux-x86_64-internal.AppImage`；`release/linux-x64/SHA256SUMS` 已生成。`npm run test:packaged -- <AppImage路径>` 已通过，未上传。
- ~~Windows portable~~（已废弃）：2026-10-18 起不再产出单文件免安装版，改为 NSIS 安装包；历史验证记录保留但不再适用当前构建目标。
- ~~`npm run test:portable-data`~~（已随 portable 目标移除）：该测试验证的是「解压到临时目录后用户数据不丢」，安装包场景改为覆盖安装保留 userData，待 Windows 真机验收。
- 视觉选择：`design-previews/2026-10-15-desktop/index.html` 的 A/B/C/D，未选前保持当前基础样式。
- Linux 密钥服务、真实听播、托盘/物理媒体键/睡眠仍需环境证据；Windows/macOS 原生测试延后，不阻塞共享逻辑。

历史流水及旧沙箱阻塞记录见 [IMPLEMENTATION_HISTORY.md](IMPLEMENTATION_HISTORY.md)，只作历史，不是当前环境结论。登录修复证据见 [LOGIN_CALLBACK_FIX.md](LOGIN_CALLBACK_FIX.md)。
