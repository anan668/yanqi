# AI 修改记录 / AI_CHANGELOG.md

本文件用于记录 Codex / AI 对盐憩项目做过的实际文件修改。

规则：

- 每次 AI 实际修改文件后，都必须在本文件顶部追加记录。
- 最新记录放最上方。
- 如果只是分析、查看、讨论方案，没有改动文件，可以不记录。
- 记录必须写清楚任务目的、改动文件、具体改动、验证方式和尚未验证内容。

---

## 2026-05-02 19:43

### 任务目的

- 继续精修首页 `home.html` 首屏“今日海域”模块最后一轮细节，在不重做结构、不改深度计和页面过渡系统的前提下，统一主卡图片质感、继续压低顶部白雾、提升侧卡可读性，并把底部三块信息层收束成更像盐憩海域档案的玻璃层。

### 改动文件

- `site/css/home.css`
- `site/js/home.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `home.css` 末尾追加“主图统一与水下光束终稿”及“入场态压雾与亮图校准”样式层：把顶部中心大雾继续压成更窄的纵向水下光束，补充左右暗角，并覆盖 `hero-awakened` 入场态的高透明度，避免标题后方再次变成白雾罩。
- 为今日海域卡片图片包装层增加统一暗角和底部深色渐变遮罩；active 主卡统一使用 `saturate + contrast + brightness` 滤镜，保证皇帝岛、热浪岛、诗巴丹等不同亮度图片切到主卡时文字、价格、评分都稳定可读。
- 提升侧卡可读性：保留后退、缩小、压暗关系，但提高侧卡标题、描述、价格、评分文字亮度，降低“像没加载出来”的灰糊感；侧卡 hover 时轻微提亮图片。
- 继续品牌化底部 `SEA POSITION / DIVE READING / EXPLORATION`：给三块面板补玻璃档案线、小地图海图质感、统一数据图标光感，并弱化环形进度的后台统计感。
- 在 `home.js` 中将热浪岛探索文案调整为更克制的盐憩语气：“这片海适合慢慢放轻节奏，等第一眼蓝色靠近。”
- 本次没有修改 `site/js/depth-manager.js`、`site/css/depth-gauge.css`、`site/css/page-transition.css`；没有新增或改动 localStorage / sessionStorage 逻辑；没有触碰 Sea Atlas 代码或离线地图资源。

### 验证方式

- 运行 `node --check site/js/home.js`，通过。
- 运行 `node --check site/js/home.js; node --check site/js/depth-manager.js; node --check site/js/detail.js; node --check site/js/trip.js`，通过。
- 运行 `git diff --check -- site/css/home.css site/js/home.js docs/AI_CHANGELOG.md`，无空白错误，仅提示 Git 在下次接触时会将 LF 转为 CRLF。
- 使用项目指定 Chrome 路径动态检查 `http://127.0.0.1:8766/site/home.html`；直接在 Node 脚本中写中文路径时被管道转码为问号，已改用 PowerShell `Resolve-Path` 写入环境变量继续使用同一指定 Chrome。
- Playwright 检查 1440×900 与 2048×921：按钮从皇帝岛切到热浪岛、再切到诗巴丹均正常；热浪岛 active 主卡滤镜为 `saturate(1.12) contrast(1.14) brightness(0.97)`，主图遮罩存在；底部信息层主体完整露出。
- Playwright 单独拖拽检查 1440×900：左拖约 300px 从皇帝岛切到热浪岛，继续左拖切到诗巴丹，右拖可回到热浪岛，鼠标拖拽逻辑正常。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，index / home / trip / contact 在 1440、1920、2560 视口均无缺失 selector、console error 或 page error。
- 运行 `npm.cmd --prefix tools\qa run perf:detail`，详情页 `detail.html?id=1` 正常加载 Leaflet 与 `sipadan.pack.js`，Sea Atlas 全屏地图可打开。
- 输出截图：`tools/qa/out/home-today-sea-final-polish-1440x900-right1.png`、`tools/qa/out/home-today-sea-final-polish-2048x921-right1-v2.png`、`tools/qa/out/home-today-sea-final-polish-drag-1440x900.png`。

### 尚未验证

- 未做移动端专项适配与验收；按项目规则当前开发范围仍以桌面端展示为准。
- 未手动逐一点击所有 14 张海域卡进入详情页；本轮重点验证了首屏视觉、按钮切换、拖拽和详情页 Sea Atlas 烟测。

## 2026-05-02 19:32

### 任务目的

- 修复 `site/home.html` 在鼠标滚轮浏览时出现的滑动卡顿、偶尔像“滑了但页面不动”的问题；保留深度计和首页海层叙事，不重写滚动系统，不引入依赖。

### 改动文件

- `site/js/home.js`
- `site/js/depth-manager.js`
- `site/css/home.css`
- `site/css/depth-gauge.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `home.js` 新增稳定的 `home-scroll-active` 运行态，把 `settling`、`glide`、`traveling` 统一收束成滚动活跃降载语义；`data-home-scroll-mode` 只在 `active / normal` 间切换，减少滚动中反复写 `settling / traveling` 造成的 DOM 属性变更。
- 调整 `homeinteractionchange` 触发条件，只在锁定态或滚动活跃态真正进出时通知共享系统，减少滚动期间的重复重算；保留横向卡片拖拽、滚轮纵向让路和中键滚动逻辑。
- 在 `depth-manager.js` 为首页滚动增加轻量渲染路径：滚动活跃时深度值按当前 `scrollY` 同步，但深度计刻度、刻度带和遮罩变量只做低频/取整更新；滚动停止后下一帧按当前滚动位置重新计算目标深度并执行一次完整刷新。
- 首页滚动活跃期不再开启连续 rAF 阻尼追赶深度计，改为由滚动帧同步目标深度，降低主线程和绘制调度压力；`trip/detail` 深度逻辑不走该首页专用分支。
- 在 `home.css` 将原 `data-home-scroll-mode='settling' / 'glide'` 的滚动降载选择器收敛到 `.home-scroll-active`，并扩展到首屏、海域陈列和 Dive Match 的大面积滤镜、玻璃、阴影、入场 transition。
- 在 `depth-gauge.css` 为首页滚动活跃期暂停深度计刻度 transition / animation，降低发光、模糊、backdrop-filter 和重阴影；深度计仍保持可见，停止后恢复完整状态。
- 本次会影响深度计的首页滚动渲染策略；不改变跨页过渡语义、不新增本地状态 key、不修改 Sea Atlas 接口或详情页地图文件。

### 验证方式

- 运行 `node --check site/js/home.js`，通过。
- 运行 `node --check site/js/depth-manager.js`，通过。
- 运行 `git diff --check -- site/js/home.js site/js/depth-manager.js site/css/home.css site/css/depth-gauge.css`，无空白错误；仅提示相关文件下次 Git 接触时 LF 会替换为 CRLF。
- 使用项目指定 Chrome 路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 打开 `http://127.0.0.1:8766/site/home.html` 做 Playwright 动态验证。
- Playwright 在 `2048x921`、`1440x900` 桌面视口分别滚动今日海域、海域陈列、Dive Match：每轮 `wheelEvents=42`，`wheelPrevented=0`；`scrollY` 从 0 连续推进到约 4686～4715；`home-scroll-active` 滚动时出现、停止后回到 `normal`。
- 检查深度计：滚动中数字低频跟随海层变化，滚动停止后左右深度计重新补全为当前深度，例如底部段停止后恢复到约 `-42m`。
- 使用 Long Task 观察器复测连续滚轮，未捕获 JS long task；自动化 rAF 探针仍可见少量由绘制/窗口调度造成的 >100ms 间隔，但不再表现为滚轮被阻止或 `scrollY` 停住。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，index/home/trip/contact 在 1440、1920、2560 视口均无 missingSelectors、consoleErrors 或 pageErrors。
- 运行 `npm.cmd --prefix tools\qa run perf:detail`，详情页 `detail.html?id=1`、Leaflet、Sea Atlas pack、全屏地图、套餐/评论/相关推荐 smoke 检查通过。

### 尚未验证

- 未做移动端专项验收；当前项目规则要求本阶段以桌面端体验为主。
- rAF 帧间隔探针在有头 Chrome 自动化里仍偶发 >100ms 间隔，Long Task 观察器未捕获 JS 阻塞；如果后续还要继续压低绘制峰值，需要单独做首页视觉资产和大面积滤镜预算检查。

## 2026-05-02 19:21

### 任务目的

- 按反馈继续精修 `site/index.html` 登录页，不重做风格，只在当前深海玻璃拟态方向上做“减重、减硬、减套娃”：缩小并减薄外层静水舱，弱化左右硬分割，减轻右侧表单层级，让入口更安静、更透、更像盐憩品牌门厅。

### 改动文件

- `site/index.html`
- `site/css/login.css`
- `site/js/auth.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `index.html` 左侧 Arrival Layer 中将原“进入之前，先把呼吸放慢。”档案区改为 `Archive / 静海档案`，并新增“信物：轻如一页水的重量”，让左侧除了“盐憩”大字外多一个精致第二记忆点。
- 将登录和注册主按钮文案统一改为“进入首页主线”，让按钮更像入口动作，而不是普通提交按钮。
- 在 `login.css` 追加“静水入口减重层”：桌面端主舱宽度收束为约 `76vw`，最大 `1240px`；高度收束为 `min(640px, calc(100dvh - 128px))`，矮屏下注册态仍完整显示；圆角收至约 `41px-46px`；边框、阴影、雾化和外发光整体降低。
- 弱化左右分割：降低中线不透明度和光晕，减少左/右底色差异，并增加一层跨左右的轻微整体渐变，让两边更像同一个静水空间。
- 减轻右侧 Entrance Console：去掉重面板感和多层卡片感，弱化 `auth-panel-shell`、`auth-panel-glass`、表单卡、tab 背板和点阵暗纹；表单保留一层轻阅读层，输入框、tab、底部链接保持清楚但不厚重。
- 调整入口按钮为更柔和的浅青蓝到深海蓝渐变，保留克制边缘光、hover 前推与 active 下潜反馈，避免后台按钮感。
- 为注册态增加专门紧凑规则，避免三输入框模式在轻量外舱中裁切按钮或底部辅助链接。
- 在 `auth.js` 继续收紧登录舞台旧尺寸缓存 clamp：旧的超大 `yanqi_login_stage_size` 会被限制回当前轻量比例，避免本地缓存把外舱撑成厚重满屏盒子。
- 本次未修改 `site/js/depth-manager.js`、`site/css/depth-gauge.css`、`site/css/page-transition.css`；未改动 Sea Atlas；未改变登录、注册、游客入口、本地账号或页面过渡状态结构。

### 验证方式

- 运行 `node --check site/js/auth.js`，语法检查通过。
- 运行 `git diff --check -- site/index.html site/css/login.css site/js/auth.js`，无空白错误；仅提示相关文件下次 Git 接触时 LF 会替换为 CRLF。
- 使用项目规则中的 Chrome 路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 做 Playwright 动态检查；用户此前给出的 `C:\Users\桉桉\Desktop\ai工具\playwright-browser\chrome-win64\chrome.exe` 当前不存在。
- Playwright 检查 `1366x768`、`1440x900`、`1920x1080` 的登录态和注册态：页面无横向/纵向溢出；玻璃舱在视口内；CTA、Entrance Progress、footer、右侧 panel 均在玻璃舱内；1366/1440 宽度约为 76vw，1920 受最大宽度限制为 1240px。
- Playwright 截图输出：`tools/qa/out/login-light-refine-final-login-1366x768.png`、`tools/qa/out/login-light-refine-final-register-1366x768.png`、以及对应的 1440x900 / 1920x1080 登录和注册截图。
- Playwright 检查旧尺寸缓存：手动写入 `yanqi_login_stage_size={width:1800,height:880}` 后刷新，舞台被夹回约 `1038x600`，没有撑满或裁切。
- Playwright 检查输入状态：手机号 focus 态有轻微边框和阴影增强；filled 后带 `is-filled is-complete`，保持稳定高亮。
- Playwright 检查 Entrance Progress：初始 `0%`；手机号后 `aria-valuenow=35`；密码后 `65`；勾选记住我后 `77`；等待完成后文字和值均到 `100%`，文案为“可以沿这层静水继续进入首页主线。”。
- Playwright 检查按钮 hover：`translate` 和 `scale` 发生轻微前推变化；seeded 测试账号点击后进入现有 page-transition，约 4 秒后到达 `home.html`，最终页面类恢复为 `home-page hero-awakened`。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，index/home/trip/contact 在 1440、1920、2560 视口下均无 missingSelectors、consoleErrors 或 pageErrors。

### 尚未验证

- 未做移动端专项验收；当前项目协作规则要求本阶段以桌面端体验为主。
- Playwright 点击 tab 和 CTA 时使用 `force: true`，原因是页面存在持续呼吸动效，普通点击会等待元素完全静止；布局测量、截图和跳转结果仍来自真实页面。
- Chrome 仍输出一条浏览器级 verbose DOM 提示“Multiple forms should be contained in their own form elements”，但 `perf:pages` 未记录 consoleErrors / pageErrors，页面行为未发现异常。

## 2026-05-02 13:47

### 任务目的

- 继续精修首页 `home.html` 首屏“今日海域”模块，在不重做结构的前提下提升展示稿质感：让主卡更像视觉主角、侧卡暗但清楚、顶部雾气更像水下光束、右下入口与评分不再拥挤，并把底部信息层从普通信息面板收束成更品牌化的海域档案层。

### 改动文件

- `site/css/home.css`
- `site/js/home.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `home.css` 末尾追加“今日海域：展示稿级质感收束”样式层：继续降低大面积白蓝雾罩，缩小中心光斑，增强四周深海暗角，并把卡组背后的亮区压成更克制的顶部水下光束。
- 强化主卡视觉权重：提高 active 卡边缘高光、深阴影、图片对比度和底部深色渐变遮罩；hover 时保留更干净的发光增强，让中间主卡更像可进入的海域主档案。
- 重新整理卡片右下信息：入口箭头独立为更清楚的圆形“进入海域”按钮，价格和评分回到左下信息行，评分变成克制的小胶囊，避免与箭头挤在一起。
- 优化侧卡可读性：在 `home.js` 中微调卡片状态计算，提升侧卡 opacity / brightness / saturate，降低 blur，同时保留后退、缩小、倾斜和压暗的层级关系。
- 品牌化底部信息层：加强 Sea Position / Dive Reading / Exploration 的玻璃档案感，统一图标与读数对比；为 Exploration 增加“探索进度”和“片海域”的叙事标签，弱化后台统计感。
- 修正 Dive Reading 在宽屏短高视口下 `清晨入海` 折行的问题，给读数增加 nowrap 并收紧短高桌面下的列距。
- 本次没有修改 `site/js/depth-manager.js`、`site/css/depth-gauge.css`、`site/css/page-transition.css`，没有改动本地状态结构，也没有触碰 Sea Atlas 实现文件。

### 验证方式

- 运行 `node --check site/js/home.js`，脚本语法检查通过。
- 运行 `git diff --check -- site/home.html site/css/home.css site/js/home.js docs/AI_CHANGELOG.md`，无空白错误；仅提示相关文件下次 Git 接触时 LF 会替换为 CRLF。
- 使用项目规则中的 Chrome 路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 做 Playwright 动态检查。
- Playwright 检查 `2048x921`、`1440x900`、`1920x1080`：首屏导航、标题区、三卡、拖拽提示、三块底部信息、左右深度尺均可见；`today-sea-brief` 完整在首屏内；页面无横向溢出。
- Playwright 样式测量：active 主卡 opacity 为 1、blur 为 0、图片对比度提升；左右侧卡 opacity 约 0.792、blur 约 0.29px；评分与入口按钮间距充足；Exploration 显示“探索进度 / 片海域”叙事标签。
- Playwright 交互检查：右箭头从 `皇帝岛` 切到 `热浪岛`，左箭头回到 `皇帝岛`；鼠标拖拽时 `.hero-bamboo-cards-wrapper.is-dragging` 生效，松手后切换到下一片海，底部信息同步。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，index/home/trip/contact 在 1440、1920、2560 视口下均无 missingSelectors、consoleErrors 或 pageErrors。
- 运行 `npm.cmd --prefix tools\qa run perf:detail`，详情页 `detail.html?id=1`、Leaflet、Sea Atlas pack、全屏地图和套餐/评论/相关推荐 smoke 检查通过。
- 截图输出：`tools/qa/out/home-today-sea-polish-v2-2048x921.png`、`tools/qa/out/home-today-sea-polish-v2-1440x900.png`、`tools/qa/out/home-today-sea-polish-1920x1080.png`。

### 尚未验证

- 未做移动端专项验收；当前项目协作规则要求本阶段以桌面端体验为主。
- HTTP Playwright 在 `2048x921` 检查中仍出现一次浏览器泛化 404 console 文本，但 requestfailed 为空；随后 `perf:pages` 中 home 页面无 consoleErrors / pageErrors。

## 2026-05-02 13:32

### 任务目的

- 继续修正首页 `home.html` 首屏“今日海域”模块的两个细节：`bamboo-cards-content` / 卡片轨道高度偏低导致主卡上沿和“今日推荐”标签有裁切感；下方 Sea Position 小地图没有正确形成地图/路线层级。

### 改动文件

- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `home.css` 末尾追加今日海域局部修正层，小幅提高 `.hero-bamboo-scroll-container` 高度，并给 `.hero-bamboo-cards-wrapper` 与 `.bamboo-cards-content` 增加上方呼吸空间，避免 active 主卡缩放后顶部被裁。
- 保持短高桌面视口的首屏完整性，在 `1280px+` 且高度较矮的规则中同步收紧高度上限和 padding，避免底部信息层重新被挤出首屏。
- 重新收束 `.today-sea-maplet` 视觉：补齐绝对定位层级，明确网格、水痕、航线、定位环、起点和当前点，让 Sea Position 更像克制的小地图而不是普通光斑占位。
- 本次只改首页 CSS 视觉修正，没有修改 `site/js/depth-manager.js`、`site/css/depth-gauge.css`、`site/css/page-transition.css`，没有改动本地状态，也没有触碰 Sea Atlas。

### 验证方式

- 运行 `node --check site/js/home.js`，脚本语法检查通过。
- 运行 `git diff --check -- site/home.html site/css/home.css site/js/home.js docs/AI_CHANGELOG.md`，无空白错误；仅提示相关文件下次 Git 接触时 LF 会替换为 CRLF。
- 使用项目规则中的 Chrome 路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 做 Playwright 动态检查。
- Playwright 检查 `2048x921` 与 `1440x900`：主卡和“今日推荐”标签均在卡片轨道可见范围内；`today-sea-brief` 仍完整露出；页面无横向溢出。
- Playwright 检查 Sea Position 小地图：`.today-sea-maplet-route` 为 absolute，起点、当前点和路线都落在 maplet 内部，地图背景层正常渲染。
- Playwright 交互检查：右箭头从 `皇帝岛` 切到 `热浪岛`；拖拽过程中 `.hero-bamboo-cards-wrapper.is-dragging` 生效，拖拽后切到 `诗巴丹`，底部信息同步为 `诗巴丹`。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，index/home/trip/contact 在 1440、1920、2560 视口下均无 missingSelectors、consoleErrors 或 pageErrors。
- 截图输出：`tools/qa/out/home-today-sea-track-mapfix-2048x921.png`、`tools/qa/out/home-today-sea-track-mapfix-1440x900.png`。

### 尚未验证

- 未做移动端专项验收；当前项目协作规则要求本阶段以桌面端体验为主。
- 本轮未重新运行 `perf:detail`；本次只修改首页 CSS，未触碰详情页和 Sea Atlas 文件。

## 2026-05-02 13:23

### 任务目的

- 继续修正 `site/index.html` 深海玻璃拟态登录页的落地比例问题：让中央大玻璃舱、右侧登录/注册控制台、左侧 Entrance Progress 在桌面 16:9 首屏内完整显示，减少右侧套娃层级，并保留“盐憩静水入口”的品牌气质。

### 改动文件

- `site/index.html`
- `site/css/login.css`
- `site/js/auth.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `index.html` 的登录/注册输入区补充更清楚的 `field-hint` 辅助文案，让投屏时手机号、密钥、确认密钥的含义更明确。
- 在 `login.css` 追加首屏防裁切与比例收束层：桌面端将主玻璃舱高度限制为 `min(700px, calc(100dvh - 100px))`，在较矮桌面视口下收至 `min(620px, calc(100dvh - 92px))`；同步压缩右侧顶部、tab、表单、按钮、底链和左侧档案/进度区间距，确保按钮与进度条不掉出首屏。
- 在 `login.css` 减轻右侧内层控制台的垂直压迫感：弱化过多卡片式套层，保留雾化阅读层与边框高光，但让表单区更像安静入口控制台而不是后台面板。
- 在 `login.css` 补齐输入框 `default / focus / filled` 的可读状态与按钮 hover/active 推进反馈；按钮 hover 采用轻微前推和柔和光晕，active 保持轻微下潜反馈。
- 在 `auth.js` 调整桌面端已保存舞台尺寸的夹取逻辑，避免旧的 `yanqi_login_stage_size` 本地缓存把大玻璃舱撑出视口；同时把 Entrance Progress 的 77% 文案调整为“这层静水会替你把号码稳稳留住。”，并让完成态只在 100% 时出现。
- 本次未修改 `site/js/depth-manager.js`、`site/css/depth-gauge.css`、`site/css/page-transition.css`；未改动 Sea Atlas；本地状态只沿用既有 `localStorage` 缓存并增加尺寸夹取保护。

### 验证方式

- 运行 `node --check site/js/auth.js`，语法检查通过。
- 运行 `git diff --check -- site/index.html site/css/login.css site/js/auth.js`，无空白错误；仅提示相关文件下次 Git 接触时 LF 会替换为 CRLF。
- 使用项目规则中的 Chrome 路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 做 Playwright 动态检查；用户本次给出的 `C:\Users\桉桉\Desktop\ai工具\playwright-browser\chrome-win64\chrome.exe` 当前不存在。
- Playwright 检查 `1366x768`、`1440x900`、`1920x1080`：页面无横向/纵向滚动；大玻璃舱在视口内；登录按钮、底部辅助链接、左侧 Entrance Progress 均完整在玻璃舱和首屏内。
- Playwright 在 `1366x768` 下分别检查登录与注册 tab：登录态和注册态的 CTA、footer、progress、右侧 panel 均在玻璃舱内，注册态三输入框也没有裁切。
- Playwright 输入联动检查：初始 `aria-valuenow=0`；输入手机号后为 `35`，文案为“静水已经记住你的号码。”；输入密码后为 `65`，文案为“入口正在慢慢成形。”；勾选记住我后为 `77`，文案为“这层静水会替你把号码稳稳留住。”；准备完成后为 `100`，文案为“可以沿这层静水继续进入首页主线。”。
- Playwright 检查输入状态：手机号 focus 态边框和阴影增强；filled 后输入框带 `is-filled is-complete`，保持稳定高亮。
- Playwright 检查登录按钮 hover：`translate` 与 `scale` 发生轻微前推变化；seeded 测试账号点击登录后先进入现有页面过渡态，约 3.5 秒后到达 `home.html`。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，index/home/trip/contact 在 1440、1920、2560 视口下均无 missingSelectors、consoleErrors 或 pageErrors。

### 尚未验证

- 未做移动端专项验收；当前项目协作规则要求本阶段以桌面端体验为主。
- Playwright 中因为页面存在持续呼吸动效，点击 tab 和 CTA 时使用了 `force: true` 避免等待元素完全静止；布局测量和截图仍基于真实页面。
- Chrome 输出过一条浏览器级 verbose DOM 提示“Multiple forms should be contained in their own form elements”，但本次 `perf:pages` 未记录 consoleErrors / pageErrors，且没有发现页面行为异常。

## 2026-05-02 13:20

### 任务目的

- 继续精修首页 `home.html` 首屏“今日海域”，按反馈压低中间大面积白雾，把背后氛围收回为顶部水下光束；同时强化主卡压场感、提升左右侧卡可读性，并让底部 Sea Position / Dive Reading / Exploration 承接层在桌面首屏内完整露出。

### 改动文件

- `site/css/home.css`
- `site/js/home.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `home.css` 追加“今日海域光束与首屏可读性二次收束”样式层：降低大面积 radial 白蓝雾层的亮度和覆盖范围，改为更窄的顶部纵向 light beam，并加强左右暗角和深海 navy / teal 层次。
- 压缩今日海域首屏垂直节奏：标题区、卡片区、拖拽提示和底部信息层间距整体收紧；针对 `1280px+` 且高度较矮的桌面视口加入专门收束，让三块底部信息主体不再只露标题或被截断。
- 强化中间主卡：提高 active 卡的边框高光、深阴影、图片对比度和底部文字遮罩，保持主卡最亮、最清晰、最靠前。
- 调整侧卡状态：在 `home.js` 中降低侧卡过度模糊，提升侧卡 opacity / brightness / saturate，保留后退、倾斜、压暗关系但让标题和主要信息可读。
- 为 `is-prev / is-next` 侧卡补充文字内收、暗渐变和文字对比；其中左侧 `is-prev` 额外增加可见区内收，避免短宽桌面视口下标题被轨道裁切。
- 本次没有修改 `site/js/depth-manager.js`、`site/css/depth-gauge.css`、`site/css/page-transition.css`，没有改动本地状态结构，也没有触碰 Sea Atlas 实现。

### 验证方式

- 运行 `node --check site/js/home.js`，脚本语法检查通过。
- 运行 `git diff --check -- site/home.html site/css/home.css site/js/home.js docs/AI_CHANGELOG.md`，无空白错误；仅提示相关文件下次 Git 接触时 LF 会替换为 CRLF。
- 使用项目规则中的 Chrome 路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 做 Playwright 动态检查。
- Playwright 检查 `2048x921` 与 `1440x900`：底部 `today-sea-brief` 均完整在首屏内；页面无横向溢出；主卡为 `皇帝岛`，active 卡 opacity 为 1、blur 为 0，左右侧卡保持 `is-prev / is-next` 且可读。
- Playwright 交互检查：点击右箭头后主卡从 `皇帝岛` 切到 `热浪岛`，点击左箭头回到 `皇帝岛`；拖拽过程中 `.hero-bamboo-cards-wrapper.is-dragging` 生效，左拖切到下一张、右拖回到上一张，底部信息标题同步。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，index/home/trip/contact 在 1440、1920、2560 视口下均无 missingSelectors、consoleErrors 或 pageErrors。
- 运行 `npm.cmd --prefix tools\qa run perf:detail`，详情页 `detail.html?id=1`、Leaflet、Sea Atlas pack、全屏地图和套餐/评论/相关推荐 smoke 检查通过。
- 截图输出：`tools/qa/out/home-today-sea-beam-final-v2-2048x921.png`、`tools/qa/out/home-today-sea-beam-final-v2-1440x900.png`、`tools/qa/out/home-today-sea-beam-final-v3-1440x900.png`。

### 尚未验证

- 未做移动端专项验收；当前项目协作规则要求本阶段以桌面端体验为主。
- HTTP Playwright 在 `2048x921` 截图轮次出现一次浏览器泛化的 404 console 文本，但 requestfailed 和 response 4xx 未捕获到失败 URL；随后 `perf:pages` smoke 中 home 页面无 consoleErrors / pageErrors。

## 2026-05-02 00:54

### 任务目的

- 根据反馈继续收束首页 `home.html` 首屏“今日海域”模块：解决首屏高度偏低、底部承接层显示不完整、旧版顶部柔光柱丢失、底部行动按钮多余，以及地图/读数信息层不够完整的问题。

### 改动文件

- `site/home.html`
- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 从“今日海域”首屏末尾移除底部 `继续下潜 / 查看行程` 行动按钮，仅保留横向潜游卡组自身的左右控制环和拖拽提示，避免底部信息层被按钮挤压。
- 扩充 `today-sea-maplet` 结构，增加网格、水痕、当前点环形定位和路线层，让左侧 Sea Position 不再像简单占位块。
- 为 Dive Reading 四项数据增加语义 class 和 CSS 绘制的小图标，调整读数区列宽、分隔线和标签不换行，修复投屏下“能见度”等标签挤压竖排的问题。
- 在 `home.css` 追加“今日海域反馈收束层”：提高首屏与今日海域舞台高度，保证三块下方信息层在 1440x900 和 1920x1080 桌面视口内完整露出。
- 参考 2026-04-19 备份里的首屏氛围，把顶部 `hero-ocean-glow-one` / `hero-ocean-wave-two` 的旧版柔光感补回，并将当前舞台背后的光束改成更大的圆形/椭圆下落柔光，减弱硬矩形边缘。
- 本次没有修改 `site/js/depth-manager.js`、`site/css/depth-gauge.css`、`site/css/page-transition.css`，没有改本地状态结构，也没有触碰 Sea Atlas。

### 验证方式

- 运行 `node --check site/js/home.js`，脚本语法检查通过。
- 运行 `git diff --check -- site/home.html site/css/home.css site/js/home.js docs/AI_CHANGELOG.md`，无空白错误；仅提示相关文件下次 Git 接触时 LF 会替换为 CRLF。
- 使用项目规则中的 Chrome 路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 做 Playwright 桌面检查。
- Playwright 检查 `1440x900` 与 `1920x1080`：今日海域舞台、卡组、拖拽提示和三块信息层完整显示；底部行动按钮数量为 0；页面无横向溢出；顶部柔光伪元素正常渲染。
- Playwright 交互检查：点击右侧箭头后主卡从皇帝岛切到热浪岛，下方信息同步；鼠标拖拽过程中 `is-dragging` 生效，松手后切到诗巴丹，下方信息同步；无 pageErrors / requestfailed。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，index/home/trip/contact 在 1440、1920、2560 视口均无 missingSelectors、consoleErrors 或 pageErrors。
- 截图输出：`tools/qa/out/home-today-sea-feedback-1440-final.png`、`tools/qa/out/home-today-sea-feedback-1920-settled.png`、`tools/qa/out/home-today-sea-feedback-interaction.png`。

### 尚未验证

- 未做移动端专项验收；当前项目协作规则要求本阶段以桌面端体验为主。
- 未运行 `npm run perf:detail`；本次只修改首页首屏结构与样式，未触碰详情页和 Sea Atlas。

## 2026-05-01 23:39

### 任务目的

- 继续精修首页 `home.html` 首屏“今日海域”模块，把现有横向卡片轨道从偏平的轮播感升级为更明确的“横向潜游”首屏展示区，并增加不抢主卡的下方承接信息层。

### 改动文件

- `site/home.html`
- `site/css/home.css`
- `site/js/home.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在“今日海域”卡片轨道下方新增轻量拖拽提示，文案为“轻拖卡片，沿海流看下一片海”，用细线和微动效提示横向浏览能力。
- 在首屏新增 `today-sea-brief` 承接层，包含海域位置、小地图感位置片、潜水读数（水温、海流、潮汐、能见度）和探索进度/最佳季节说明，保持低密度玻璃面板，不改成普通旅游信息卡。
- 为首屏卡片渲染补充“今日推荐”标签和右下角圆形进入箭头，让主卡更像当前可进入的海域入口。
- 在 `BambooScroll` 中新增 `is-active`、`is-prev`、`is-next` 状态同步，根据轨道中心实时标记主卡与左右侧卡；新增动态 CSS 变量控制缩放、压暗、模糊、轻微透视倾斜和 z-index。
- 新增今日海域承接数据 `todaySeaBriefData`，卡片按钮切换或鼠标拖拽换卡后会同步更新下方位置、读数、季节、进度和“查看档案”入口。
- 将按钮手动切换时长收束到约 620ms，并为轨道增加 `is-animating` 状态；保留原有拖拽、惯性、吸附和页面纵向滚动让路逻辑。
- 在最终样式层关闭首屏卡片旧 `bamboo-card-reveal` forwards 动画，避免旧动画固化 transform/opacity 后盖住新的主/侧卡透视层级。
- 将左右按钮改成靠近卡组的海中浮动控制环，补充柔和外发光、圆环、hover 放大和 active 压下反馈。
- 本次只增强首页“今日海域”首屏，不修改 `site/js/depth-manager.js`、`site/css/depth-gauge.css`、`site/css/page-transition.css`，不改变本地状态结构，也不影响 Sea Atlas。

### 验证方式

- 运行 `node --check site/js/home.js`，语法检查通过。
- 运行 `git diff --check -- site/home.html site/css/home.css site/js/home.js`，未发现空白错误；命令仅提示这些文件下次 Git 接触时 LF 会替换为 CRLF。
- 使用 Node REPL 启动本地静态服务，访问 `http://127.0.0.1:8766/site/home.html` 返回 200。
- 用户本次指定 Chrome 路径 `C:\Users\桉桉\Desktop\ai工具\playwright-browser\chrome-win64\chrome.exe` 当前不存在；动态验证改用项目规则中存在的 Chrome 路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe`。
- Playwright 检查 `1440x900`：初始主卡为皇帝岛，点击右箭头后主卡切到热浪岛，拖拽后主卡切到诗巴丹；`today-sea-brief` 的名称、activeSpotId 和进度同步更新；页面横向溢出为 0。
- Playwright 检查 `1440x900` 与 `1920x1080` 首屏布局：标题、卡片轨道、拖拽提示、承接层和操作入口均在首屏视口内，底部操作区可见，横向溢出为 0。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，index/home/trip/contact 在 1440、1920、2560 视口下均无 missingSelectors、consoleErrors 或 pageErrors。
- 截图输出到 `tools/qa/out/home-today-sea-refined-1440-initial-v2.png`、`tools/qa/out/home-today-sea-refined-1440-button-v2.png`、`tools/qa/out/home-today-sea-refined-1440-drag-v2.png`、`tools/qa/out/home-today-sea-refined-1440.png`、`tools/qa/out/home-today-sea-refined-1920.png`。

### 尚未验证

- 未做移动端专项验收；本项目当前范围按协作规则以桌面端体验为主。
- Playwright 第一轮探针曾记录一条泛化的 404 console 文本，随后用 response/requestfailed 追踪未捕获到 4xx URL 或失败请求，页面无 `pageErrors`；未继续展开到全站资源审计。
- 未运行 `npm run perf:detail`；本次变更集中在首页首屏，已完成首页脚本检查、空白检查、桌面 Playwright 交互/布局验证和 `perf:pages` smoke。

## 2026-04-30 23:34

### 任务目的

- 继续修复 `home.html` 首屏“今日海域”轮播区域鼠标滚轮和中键滑动时仍有卡住感的问题，并复查其它页面是否还有同类滚动链风险。

### 改动文件

- `site/js/home.js`
- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在首页 `BambooScroll` 中新增纵向滚动让路路径：鼠标停在今日海域卡片轨道上滚轮或中键按下时，不拦截浏览器原生滚动，只暂停轮播自动步进、惯性、吸附、hover 高亮和卡片物理帧。
- 将首页滚动状态统一扩展为 `isHomeVerticalScrollActive()`，让 `BambooScroll` 在 `traveling`、`settling`、`glide` 任一纵向滚动状态下都不启动自动漂移或 RAF 物理循环，左键拖拽仍保留原交互。
- 为首页首屏 `settling` / `glide` 小步滚动状态补充轻量化 CSS：暂停今日海域卡片呼吸、首屏海浪/浮光/浮游光点、箭头动画，移除卡片滚动期间的 transition、filter、backdrop-filter 和图片 transform。
- 为 `.hero-bamboo-cards-wrapper` 补充 `overscroll-behavior-y: auto` 与 `touch-action: pan-y`，明确纵向滚动交回页面，不改变横向轮播视觉结构。
- 本次不改深度计语义、不改跨页过渡系统、不改本地状态结构，也不改 Sea Atlas 数据或地图逻辑。

### 验证方式

- 运行 `node --check site/js/home.js`，语法检查通过。
- 运行 `git diff --check -- site/js/home.js site/css/home.css`，未发现空白错误；命令提示相关文件下次 Git 接触时 LF 会替换为 CRLF。
- 使用项目指定 Chrome 路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 打开 `file:///C:/Users/桉桉/Desktop/盐憩/site/home.html` 做 Playwright 探针：今日海域卡片轨道滚轮 `defaultPrevented` 为 0，页面继续下潜；中键按下不进入 `.is-dragging`，轮播 hover 清空，卡片 transition 归零，今日海域动画暂停后可恢复。

### 尚未验证

- 尚未用真实鼠标中键自动滚动录屏复测手感；本轮用 Playwright 事件探针验证了 wheel / middle pointer 状态、锁页状态和滚动推进。
- 全站 QA 性能脚本仍需在本条记录之后继续运行并补充结果。

## 2026-04-30 23:08

### 任务目的

- 修复 `home.html` 在精选目的地、Sea Guide 等区域滚轮/中键滚动卡顿或边界滑不下去的问题，并同步排查 Trip、Detail、信息页和门厅是否存在同类滚动锁残留。

### 改动文件

- `site/js/home.js`
- `site/css/home.css`
- `site/css/trip.css`
- `site/css/detail.css`
- `site/js/detail.js`
- `site/js/depth-manager.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 重写首页 `setupHomeWheelBoundaryPassthrough()`：移除 `.sea-guide-trigger` 目标，不再使用 `passive:false`、`preventDefault()` 和 `window.scrollBy()` 手动接管滚轮；只保留对真实内部滚动容器的边界判断，并把边界滚动交回浏览器原生滚动链。
- 将首页 Sea Guide 面板、Trip Planner 选项浮层、详情页右侧 `booking-sticky` 和详情页 Sea Guide 面板的非模态滚动边界改为允许继续传给页面，避免鼠标停在这些区域时主页面下潜被截断。
- 保留详情页套餐弹层、评论详情弹层等模态层的 `overscroll-behavior: contain`，弹层打开时仍按预期锁住背景滚动。
- 为详情页 `has-overlay-lock` 增加状态汇总、超时兜底和 `pageshow` / `visibilitychange` 恢复同步，避免 Sea Atlas 全屏、套餐弹层、评论弹层异常关闭后残留锁页。
- 为 `DepthManager` 的 `page-transition-active` 增加过渡 watchdog，并在 `pageshow` 时检测无主过渡锁，保留正常跨页过渡锁滚语义的同时避免异常残留。
- 本次不改本地状态存储结构，不改 Sea Atlas 数据、地图 pack 或深度计深度语义；只增强滚动链、弹层锁页清理和页面过渡清理。

### 验证方式

- 运行 `node --check site/js/home.js`、`node --check site/js/trip.js`、`node --check site/js/detail.js`、`node --check site/js/depth-manager.js`，均通过。
- 运行 `git diff --check -- site/js/home.js site/css/home.css site/css/trip.css site/css/detail.css site/js/detail.js site/js/depth-manager.js`，无空白错误；命令提示这些文件下次 Git 接触时 LF 会替换为 CRLF。
- 使用项目指定 Chrome 路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 做 Playwright 动态探针：`home.html` 的 `#destinationsGrid`、首页 Sea Guide 面板、Trip `#plannerSpotPanel`、Detail `.booking-sticky`、Detail Sea Guide 面板滚轮 `defaultPrevented` 均为 0，页面在边界后继续滚动。
- Playwright 检查 Sea Atlas fullscreen：打开后 `html/body.has-overlay-lock` 为 true，关闭后均恢复 false。
- Playwright 检查详情页套餐弹层：打开后锁页，按 Escape 关闭后 `active/is-closing/has-overlay-lock` 均清理。
- Playwright 额外打开 `contact.html` 与 `index.html` 做 body 滚轮探针，未发现新增滚轮拦截；`index.html` 本身首屏不可继续下滚。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，index/home/trip/contact 在 1440 / 1920 / 2560 视口均无 missingSelectors、consoleErrors 或 pageErrors。
- 运行 `npm.cmd --prefix tools\qa run perf:detail`，详情页套餐、评论、相关推荐、Sea Atlas inline/fullscreen 均正常，脚本无 pageErrors。

### 尚未验证

- 未进行真实鼠标中键自动滚动的人工手感录屏复测；本轮用 Playwright wheel 事件和锁页状态探针验证了默认滚动是否被取消以及边界是否继续推进页面。
- Playwright 动态探针捕获到一条泛化的 `Failed to load resource: the server responded with a status of 404 (Not Found)` 控制台文本，但未出现 pageErrors，项目 QA smoke 也未报告 consoleErrors。

## 2026-04-30 23:07

### 任务目的

- 修复首页滚到精选目的地、Dive Match 和故事区时先出现大面积空雾场、内容后显影的迟滞，并把“当前项目只做桌面端”的范围写入协作规则。

### 改动文件

- `site/js/home.js`
- `AGENTS.md`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 调整首页延迟区块初始化时机，让 `#featured-destinations` 与 `#dive-match` 在更远的桌面视口提前水化，减少滚动到目标区块时才补结构的等待。
- 为精选目的地和 Dive Match 增加 `prepareForApproach()` 路径，导航/导览跳转前会先完成目标区块水化与稳定显影，避免目标海层先空一拍。
- 将精选目的地 reveal 触发提前，并在需要时直接完成 `is-intro-visible`、`is-stage-visible`、`is-stage-settled` 状态；Dive Match 的 intro、stage、display 也改为更早进入视口带时唤醒。
- 将 Dive Match 首屏推荐卡片初始水化从较长 idle 延迟改为立即或更短延迟提交，降低推荐卡区域空白时间。
- 放宽故事区显影检测带，让故事段在桌面端接近视口时提前唤醒。
- 在 `AGENTS.md` 项目定位中新增当前开发范围：只做桌面端体验；除非用户明确要求，后续对话不要主动扩展移动端适配。
- 本次修改不影响深度计、页面过渡、本地状态或 Sea Atlas；只影响首页下方分段显影节奏和协作文档范围说明。

### 验证方式

- 运行 `node --check site/js/home.js`，脚本语法检查通过。
- 运行 `git diff --check -- site/js/home.js AGENTS.md docs/AI_CHANGELOG.md`，无空白错误；命令提示 `AGENTS.md` 与 `site/js/home.js` 下次 Git 接触时 LF 会替换为 CRLF。
- 使用项目指定 Chrome 路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 做 Playwright 桌面端动态检查，视口为 `1440x900`。
- Playwright 第一轮接近视口采样确认：`#featured-destinations` 已提前进入 `is-visible is-intro-visible is-stage-visible is-stage-hydrated`，精选舞台可见且主卡已有内容；`#dive-match` 的推荐卡片已提前水化；`#why-yanqi` 前方 Dive Match 展示层已正常显影。
- Playwright 第二轮滚动定位采样确认：精选目的地区块顶端到达桌面视口约 `720px / 430px` 时舞台已可见、内容已存在；Dive Match 在展示层进入视口前已具备卡片内容，展示层到达约 `602px` 时透明度约 `0.953`；故事区接近视口时首张故事卡已唤醒。
- Playwright 第二轮采样未发现 consoleErrors、pageErrors 或 4xx 响应。

### 尚未验证

- 未做移动端验证，因为本次已把项目当前范围写明为只做桌面端体验。
- 推荐的 `python -m http.server` 启动方式在当前环境命中 WindowsApps 占位 `python.exe`，无法连接本地服务；本次动态验证改用一次性 Node 静态服务承载同一工作目录，并使用项目指定 Chrome 完成。

## 记录模板

```md
## YYYY-MM-DD HH:mm

### 任务目的

- （填写内容）

### 改动文件

- （填写内容）

### 具体改动

- （填写内容）

### 验证方式

- （填写内容）

### 尚未验证

- （填写内容）
```

---

## 2026-04-30 22:54

### 任务目的

- 更新项目协作规则和历史记录里引用的 Playwright Chrome 路径，并恢复 `docs/AI_CHANGELOG.md` 的头部说明与模板顺序。

### 改动文件

- `AGENTS.md`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 将 `AGENTS.md` 里的动态调试 Chrome 目录、`chrome.exe` 路径和 Playwright 示例 `executablePath` 全部替换为新的本地路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64`。
- 将 `docs/AI_CHANGELOG.md` 既有记录中提到的旧 Chrome `chrome.exe` 路径统一替换为新路径，避免后续查阅历史记录时继续复制旧地址。
- 将 `docs/AI_CHANGELOG.md` 重新整理为“文件说明 / 记录模板 / 最新记录到旧记录”的顺序，移除顶部误插入的重复日期标题。
- 本次修改只涉及协作文档中的调试路径引用和记录结构，不影响深度计、页面过渡、本地状态或 Sea Atlas。

### 验证方式

- 检查新路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 存在。
- 运行路径搜索，确认 `AGENTS.md` 与 `docs/AI_CHANGELOG.md` 中的旧路径命中已完成替换。
- 运行 `git diff --check -- AGENTS.md docs/AI_CHANGELOG.md` 检查 Markdown 文件无空白错误。

### 尚未验证

- 未启动 Playwright 或 Chrome 做动态验证，因为这次只更新文档中的本地工具路径引用和变更记录结构。

## 2026-04-29 19:25

### 任务目的

- 继续修正首页首屏“今日海域”区域：清理旧观察窗残影，让标题回到白光中心，修复卡片点击无法跳转，并消除长拖结束后的二段回抖。

### 改动文件

- `site/css/home.css`
- `site/js/home.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在首页样式末尾增加最终收束层：隐藏 `hero-hotspots-shell` 与 `hero-bamboo-scroll-container` 的旧面板伪元素，弱化左右水流拨片，压轻卡片阴影，避免卡片背后出现横向货架/旧底板感。
- 将 `hero-hotspots-head` 改回中心对齐，让 `YANQI JOURNAL / 今日海域 / 提示` 落在首屏白光中心，并同步移动端居中和溢出约束。
- 调整 `BambooScroll` 点击逻辑：鼠标点击不再被克隆卡片的 `aria-hidden` / `tabIndex` 拦截，解决可见卡片无法进入 `detail.html?id=...` 的问题；键盘进入仍保留可访问性限制。
- 调整首屏拖拽释放逻辑：今日海域松手后直接进入居中吸附，不再先跑惯性再吸附；新增 `resolveCenteredTrackTarget()` 按卡片中心对齐观察窗中心，降低 release shake、拖拽 recoil 和自动轮播频率，并在手动操作后延后下一次自动漂移。
- 本次修改只影响首页今日海域首屏轮播视觉与交互，不影响深度计、页面过渡、本地状态或 Sea Atlas。

### 验证方式

- 运行 `node --check site/js/home.js`，脚本语法检查通过。
- 运行 `git diff --check -- site\css\home.css site\js\home.js`，未发现空白错误；命令提示相关文件下次 Git 接触时 LF 会替换为 CRLF。
- 使用 Playwright + 指定 Chrome `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 打开 `http://127.0.0.1:8766/site/home.html`，检查 `2048x921`、`1440x900`、`390x844`：标题中心偏移为 0 或小于 1px，提示和底部入口无横向溢出，旧 shell / scroll 伪元素为 `content: none`。
- Playwright 点击 1440 视口中心卡片，成功跳转到 `http://127.0.0.1:8766/site/detail.html?id=13`。
- Playwright 模拟长拖释放后采样：0.85s 到 1.7s 间中心卡片位移约 0.04px，未再出现二段跳；截图输出到 `tools/qa/out/home-today-window-final-2048.png`、`home-today-window-final-1440.png`、`home-today-window-final-390.png`、`home-today-window-final-drag.png`。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，index/home/trip/contact 在 1440 / 1920 / 2560 视口均无缺失选择器、consoleErrors 或 pageErrors。

### 尚未验证

- Playwright 本地服务动态脚本仍捕获到一条浏览器泛化的 `Failed to load resource: 404` 控制台文本，但 `response` 未捕获到 404 URL，页面无 pageErrors；`perf:pages` 中 home 无 consoleErrors。

## 2026-04-28 20:43

### 任务目的

- 修复详情页评论区右侧第一张套餐焦点卡显示不全，以及左侧滚到第二条评论后 `booking-copy is-reading-current is-awakened is-typed` 仍占位的问题。

### 改动文件

- `site/js/detail.js`
- `site/css/detail.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在评论区滚动度量里新增第二条评论卡片的位置缓存 `secondReview`，作为右侧陪读评价卡收起阈值。
- 将 `shouldCollapseBookingCopy()` 调整为：评论区第一条评论保留 `booking-copy` 与套餐焦点卡并行，进入第二条评论后折叠 `booking-copy`；相邻海域区仍保持折叠。
- 在 `syncBookingCopyDepthState()` 中同步 `is-booking-copy-collapsed` 到 `booking-sticky`，让 CSS 可以把套餐焦点卡重新上移到顶部。
- 调整 reviews focus-only 样式：只有未折叠时才让焦点卡停在 `booking-copy` 下方；未折叠阶段压缩焦点卡间距、摘要字号和行高，避免第一张套餐焦点卡底部被裁切。
- 本次修改不影响深度计、页面过渡、本地状态或 Sea Atlas；只影响详情页评论区右侧 `booking-sticky` 的陪读卡片与焦点卡停驻关系。

### 验证方式

- 运行 `node --check site/js/detail.js`，脚本语法检查通过。
- 运行 `git diff --check -- site/js/detail.js site/css/detail.css`，未发现空白错误；命令提示相关文件下次 Git 接触时 LF 会替换为 CRLF。
- 使用 `tools/qa/node_modules/playwright` 和指定 Chrome `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 打开 `http://127.0.0.1:8766/site/detail.html?id=1&stageDebug=1`，手动触发评论懒加载后分别滚到第一、第二条评论。
- Playwright 验证第一条评论时 `booking-copy` 透明度为 1、高度约 180px，套餐焦点卡底部 862px 小于 sticky 容器底部 872px；第二条评论时 `booking-sticky` 包含 `is-booking-copy-collapsed is-focus-only-context`，`booking-copy` 透明度为 0、高度约 2px，页面无 console/page error。

### 尚未验证

- 未输出新的截图文件；本次以 Playwright DOM / computed style 状态验证为准。

## 2026-04-25 19:06

### 任务目的

- 落地第一轮桌面端性能优化，减少滚动期重复 DOM 写入、详情页滚动帧 reveal 扫描和程序化滚动时深度计滞后/跳层，不削弱现有视觉效果。

### 改动文件

- `site/js/depth-manager.js`
- `site/js/ocean-scroll.js`
- `site/js/detail.js`
- `site/js/trip.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 将深度计刻度更新从每次整数变化全量遍历 marker，改为缓存 depth->node 映射，只更新 reached 边界变化区间和 current 前后两条刻度。
- 取消滚动大跨度时直接 snap 到目标深度，改为临时提高阻尼响应，让深度计用 2-4 帧以上贴合目标海层。
- 为 `DepthManager` 增加 `syncManagedScrollProgress()`，并在 `OceanScroll.animateTo()` 每帧低频推进深度计，使 trip/detail 程序化滚动时深度计不再等结束后才追上。
- 将详情页 Sea Guide 滚动帧里的 intro/review/gallery reveal 扫描移入 120ms 节流通道；保留阅读区、booking、导览高亮的实时同步。
- 为详情页和行程页 Sea Guide 增加 visible/deep/currentKey 缓存，只在状态变化时写 class 和 `aria-current`。
- 本次不改视觉 CSS，不影响页面过渡、本地状态或 Sea Atlas 数据；只调整滚动/深度计/导览调度方式。

### 验证方式

- 运行 `node --check site/js/depth-manager.js`、`node --check site/js/ocean-scroll.js`、`node --check site/js/detail.js`、`node --check site/js/trip.js`，均通过。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，index/home/trip/contact 在 1440 / 1920 / 2560 视口均无缺失选择器、consoleErrors 或 pageErrors。
- 运行 `npm.cmd --prefix tools\qa run perf:detail`，详情页内容、评论、相关海域、Sea Atlas inline/fullscreen 均正常。
- 使用临时 Playwright 桌面滚动采样检查 home/trip/detail，无新增控制台错误；详情页本轮滚动采样未记录到 long task。

### 尚未验证

- 未进行 Chrome DevTools Performance trace 录制；当前验证为现有 QA 与轻量 headless 采样。

## 2026-04-25 17:36

### 任务目的

- 修正上次改动导致评论区第二阶段 `booking-sticky is-focus-only-context` 消失的问题，同时保持评价陪读卡片在右侧持续显示。

### 改动文件

- `site/js/detail.js`
- `site/css/detail.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 将 `isBookingFocusOnlyContext()` 恢复为评论区和相邻海域区都会进入 focus-only 侧栏语境，保证评论区第二阶段仍有 `is-focus-only-context`。
- 在 `site/css/detail.css` 中为 `data-reading-zone="reviews"` 的 focus-only / entering / settling 阶段补充覆盖规则，让 `booking-copy` 保持可见、保留高度与间距，并把 `booking-focus-panel` 停驻到评价卡片下方。
- 保留 `shouldCollapseBookingCopy()` 只在 `related` 区折叠的逻辑，因此评论区不会再把评价陪读卡收起。
- 本次修改不影响深度计、页面过渡、本地状态或 Sea Atlas；只影响详情页右侧 `booking-sticky` 在评论区第二阶段的展示状态。

### 验证方式

- 运行 `node --check site/js/detail.js`，脚本语法检查通过。
- 运行 `git diff --check -- site/js/detail.js site/css/detail.css`，未发现空白错误；命令提示相关文件下次 Git 接触时 LF 会替换为 CRLF。
- 使用 `tools/qa/node_modules/playwright` 和指定 Chrome `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 打开 `http://127.0.0.1:8766/site/detail.html`，滚动到 `#spotReviews` 后确认 `.booking-sticky` class 为 `booking-sticky is-focus-only-context`，`data-reading-zone="reviews"`，`#bookingCopy` 高度约 180px、透明度为 1。
- 额外检查本地页面加载响应，未发现 4xx 资源。

### 尚未验证

- 未输出截图文件；本次以 Playwright DOM / computed style 状态验证为准。

## 2026-04-25 17:30

### 任务目的

- 继续修正首页首屏“今日海域”区域仍像大玻璃面板和商品轮播的问题，把视觉重心改成更轻的海流观察带。

### 改动文件

- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `site/css/home.css` 末尾增加“今日海域海流带重构”覆盖层，取消 `today-sea-card` 的外壳背景、边框、呼吸阴影动画和大面板伪元素。
- 将标题区改为左上航日志签布局，修正旧 `justify-items:center` 导致标题回到居中的问题。
- 将卡片改成图片占满的海域切片，信息层压到图片底部，弱化价格与评分，减少商品卡感。
- 将左右箭头改成贴边的水流拨片，并把底部两个 CTA 降级成低存在感文字入口。
- 补充移动端间距，让 `390x844` 下标题不再被导航压住，入口不再竖向堆成按钮块。
- 本次不改动 `home.js` 轮播、拖拽、跳转逻辑，不影响深度计、页面过渡、本地状态或 Sea Atlas。

### 验证方式

- 运行 `git diff --check -- site\css\home.css site\home.html`，未发现空白错误；命令提示相关文件下次 Git 接触时 LF 会替换为 CRLF。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，首页、门厅、行程页、联系页在 1440 / 1920 / 2560 视口的 smoke 均无缺失选择器、consoleErrors 或 pageErrors。
- 使用项目指定 Chrome 路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 通过 Playwright 检查 `2048x921`、`1440x900`、`390x844`，输出截图到 `tools/qa/out/home-tidal-strip-final-v2-*.png`。
- Playwright 量测确认三视口无横向溢出，标题和底部入口可见，`hero-hotspots-shell` 外壳阴影已为 `none`。

### 尚未验证

- 未手动点击卡片进入详情页；本次未改 `home.js` 交互逻辑，已通过页面 smoke 与截图检查覆盖布局回归。

## 2026-04-25 13:35

### 任务目的

- 修复详情页右侧 `booking-sticky` 在 `is-focus-only-context` 与普通 `booking-sticky` 语境切换后，评论区对应的 `booking-copy is-reading-current is-awakened is-typed` 陪读评价卡片没有持续停驻的问题。

### 改动文件

- `site/js/detail.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 将 `isBookingFocusOnlyContext()` 的单焦点侧栏触发范围从评论区与相邻海域区收窄为仅相邻海域区，避免评论区切换到 `is-focus-only-context` 后把 `booking-copy` 收起。
- 简化 `shouldCollapseBookingCopy()` 的折叠判断，让评论区始终保留陪读评价与套餐焦点舱并行停驻，只在 `related` 相邻海域区折叠陪读文案。
- 本次修改不改动深度计、页面过渡、本地状态或 Sea Atlas；只影响详情页右侧阅读陪伴栏的评论区展示状态。

### 验证方式

- 运行 `node --check site/js/detail.js`，脚本语法检查通过。
- 运行 `git diff --check -- site/js/detail.js`，未发现空白错误；命令提示该文件下次 Git 接触时 LF 会替换为 CRLF。

### 尚未验证

- 未使用 Playwright / Chrome 动态滚动检查页面；本次先完成 JS 状态逻辑修复与静态检查。

## 2026-04-25 00:00

### 任务目的

- 调整 `docs/AI_CHANGELOG.md` 自身说明和记录模板，让后续 AI / Codex 能按统一格式追加修改历史。

### 改动文件

- `docs/AI_CHANGELOG.md`

### 具体改动

- 将文件标题调整为 `AI 修改记录 / AI_CHANGELOG.md`。
- 补充记录用途、顶部追加规则、可不记录场景和必须写清楚的字段。
- 新增标准 `记录模板` 代码块，并保留实际修改记录区。
- 本次修改不影响深度计、页面过渡、本地状态或 Sea Atlas。

### 验证方式

- 读取了 `AGENTS.md`、`README.md` 和现有 `docs/AI_CHANGELOG.md`。
- 运行 `git diff --check -- docs/AI_CHANGELOG.md` 检查 Markdown 文件无空白错误。

### 尚未验证

- 未运行页面级 Playwright / Chrome 动态验证，因为本次只修改协作文档，不涉及页面结构、样式或交互。

## 2026-04-25 00:00

### 任务目的

- 补充并重整 `AGENTS.md`，把 AI 协作前置阅读、动态调试、运行验证、输出格式和独立修改记录文件规则写清楚。

### 改动文件

- `AGENTS.md`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 将 `AGENTS.md` 开头要求扩展为先读 `AGENTS.md`、再读 `README.md`、最后查看 `docs/AI_CHANGELOG.md` 最近 3～5 条记录。
- 将运行方式、常用验证命令、动态调试工具位置、修改前检查、输出格式拆成独立章节。
- 明确每次实际文件修改后必须写入 `docs/AI_CHANGELOG.md`，且记录最新放顶部。
- 创建 `docs/AI_CHANGELOG.md` 作为后续 AI / Codex 窗口共享的修改历史入口。
- 本次修改不影响深度计、页面过渡、本地状态或 Sea Atlas。

### 验证方式

- 读取了 `AGENTS.md` 当前规则、`README.md` 项目主线。
- 检查到 `docs/AI_CHANGELOG.md` 原本不存在，并已创建。
- 运行 `git diff --check -- AGENTS.md docs/AI_CHANGELOG.md` 检查 Markdown 文件无空白错误。

### 尚未验证

- 未运行页面级 Playwright / Chrome 动态验证，因为本次只修改协作文档，不涉及页面结构、样式或交互。
