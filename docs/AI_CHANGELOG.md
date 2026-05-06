# AI 修改记录 / AI_CHANGELOG.md

## 2026-05-06 18:31

### 任务目的

- 根据用户录屏反馈，修复首页滑动后突然瞬移的问题。
- 本轮只处理 `home.html` 的 wheel 滚动链，不做 UI 优化，不改 `detail.html` / `detail.css` / `detail.js`，不动 Sea Atlas、Planner Desk、页面过渡 CSS 或 localStorage / sessionStorage 主状态逻辑。

### 排查结论

- 动态记录复现到首页页脚附近一次 `delta -360` 最终移动约 `-580` / `-640`，说明上一轮“下一帧确认没动再补滚”的 fallback 在部分 Chrome 时序里会和原生滚动叠加。
- 瞬移不是深度计问题，也不是页面过渡残留；核心是同一次 wheel 同时走了浏览器原生滚动和 JS 补滚。

### 改动文件

- `site/js/home.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/js/home.js`：把首页窄 fallback 从“被动等待后补滚”改为“窄范围主动接管”：命中指定首页视觉层时使用 capture 阶段 `passive: false`，先 `preventDefault()`，再手动 `scrollBy()` 一次，避免原生滚动和补滚叠加。
- `site/js/home.js`：拆分直接命中层与包含命中层，覆盖 `#hero-home`、`#featured-destinations`、`#dive-match`、`#why-yanqi`、`#homeFooter`、`#pageStage` 以及首页三卡、精选展台、Dive Match、故事区、页脚内的少量真实卡住容器。
- `site/js/home.js`：为每个 wheel 事件加 WeakSet 去重，并把单次手动推进距离限制在 320px，避免大 delta 直接造成跨段跳跃。
- 保留 `scheduleNarrowHomeWheelFallback()` 给首屏轮播和 Sea Guide 边界使用；未恢复旧的全局 `setupHomeWheelBoundaryPassthrough()`，未新增 `home-scroll-active/restoring`，未改深度计追随逻辑。

### 验证方式

- 运行 `node --check site/js/home.js`，通过。
- 运行 `node --check site/js/depth-manager.js`，通过。
- 运行 `git diff --check -- site/js/home.js site/css/home.css docs/AI_CHANGELOG.md`，无空白错误；仅提示 Git 未来可能将 LF 替换为 CRLF。
- 使用 `http://127.0.0.1:8772/site/home.html`，Playwright 从 `./tools/qa/node_modules/playwright` 引入，Chrome 使用项目指定本地路径。
- 首页定点位移复测覆盖首屏卡片、今日海域卡片、精选展台、Dive Match、右下空白区、页脚中心：`suspiciousCount: 0`，`stuckCount: 0`；页脚此前的 `-580/-640` 异常跳跃消失，单次移动限制在约 320px 内。
- 首页 320 次网格上下滚压力扫描：`failureCount: 0`，`suspiciousCount: 0`；结束后 body 为 `home-page hero-awakened`，`homeScrollMode` 为 `normal`。
- 控制台仍有一次既有 404 资源提示；未捕获 `pageerror`。

### 尚未验证

- Headless Playwright 仍不能可靠合成真实 Chrome 中键自动滚动，本轮用首页 wheel 位移记录和网格压力扫描覆盖同类瞬移 / 卡住问题。
- 未运行全量 `npm run perf:pages` / `npm run perf:detail`；本轮目标是消除首页瞬移和卡住，不继续追 p95。
- 未做移动端专项验证；项目当前规则以桌面端体验为准。
- 未验证或修改详情页 Sea Atlas，因为用户明确要求 detail 不作为本轮目标。

### 影响范围

- depth-manager：无直接改动，本轮不改变深度计追随核心逻辑。
- 页面过渡：无直接改动。
- localStorage / sessionStorage：无影响，未修改主状态读写逻辑。
- Sea Atlas：无影响，未修改详情页或地图结构。
- Planner Desk：无结构影响，未修改 trip 相关文件。

## 2026-05-05 23:56

### 任务目的

- 根据用户录屏反馈，继续调整首页 SEA POSITION SVG 小海图，使其更接近正常地图地形，而不是装饰屏幕或发光 UI 图形。

### 改动文件

- `site/home.html`
- `site/js/home.js`
- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/home.html`：在小海图 SVG 中加入测深数字标注，让画面更接近海图缩略图。
- `site/js/home.js`：新增 `TODAY_SEA_MAPLET_CARTOGRAPHY_OVERRIDES`，用更折线化、更碎岸线感的 path 覆盖原先偏圆润的海岸、陆架和等深线数据；默认皇帝岛岸线也略微收窄，避免像一块过大的贴片。
- `site/css/home.css`：把陆地改为更接近海图的暖灰绿色块面，增强海岸白线；浅滩/陆架改为低饱和蓝面；路线改为细虚线航线；主/辅助潜点改为小环点，降低按钮感和发光感。
- 本次只改首页 SEA POSITION 小图视觉和数据层，不改首页布局、三卡轮播结构、滚动链、深度计、页面过渡、本地状态、Sea Atlas 或 Planner Desk。

### 验证方式

- 运行 `node --check site/js/home.js`，通过。
- 运行 `git diff --check -- site/home.html site/js/home.js site/css/home.css docs/AI_CHANGELOG.md`，无空白错误；仅提示 Git 未来可能将 LF 替换为 CRLF。
- 使用本地服务 `http://127.0.0.1:8777/site/home.html` 和项目指定 Chrome / Playwright 验证首页。
- 截图检查 `tmp-home-maplet-adjusted.png`：小图可见海岸线、陆地填色、浅滩面、测深数字、潜游路线和主/辅助潜点。
- 动态切换皇帝岛到热浪岛：海岸 path 与路线 path 均变化；首页滚轮可推进到 `scrollY=120`；未捕获 `pageerror` / `requestfailed`。

### 尚未验证

- 未运行全量 `npm run perf:pages` / `npm run perf:detail`；本轮使用定向 Playwright 和截图验证 SEA POSITION 小图。
- 未做移动端专项验证；项目当前规则以桌面端体验为准。

## 2026-05-06 00:03

### 任务目的

- 继续修复首页剩余“在部分区域上下滚几次后卡住”的问题，优先保证滚轮 / 中键式连续滑动能推进页面。
- 本轮只处理首页 wheel 命中区残留，不做 UI 优化，不改 `detail.html` / `detail.css` / `detail.js`，不动 Sea Atlas、Planner Desk、页面过渡 CSS 或 localStorage / sessionStorage 主状态逻辑。

### 排查结论

- Playwright 同一坐标多次上下滚动复现：卡住不是性能慢帧，而是滚轮命中到 section 边界或页脚空白层后，wheel 事件收到但 `scrollY` 不变化。
- 失败点集中在 `#hero-home` / `.hero-section`、故事区滚到页脚后的 `#homeFooter` / `.footer`，以及右下空白区直接命中 `#pageStage` 的场景。
- 现有窄 fallback 对 `.hero-hotspots-shell.today-sea-card`、`#featured-destinations`、`#why-yanqi` 等有效，但未覆盖这些边界层。

### 改动文件

- `site/js/home.js`
- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/js/home.js`：把 `#hero-home`、`.hero-section`、`#homeFooter`、`.footer` 加入现有窄 wheel fallback 白名单；规则仍然是 passive wheel、下一帧确认页面没动后才补一次 `window.scrollBy({ behavior: 'auto' })`。
- `site/js/home.js`：额外覆盖 `event.target.id === "pageStage"` 的首页空白命中点；只在 `#pageStage` 自身成为目标时触发，不把它作为 `closest()` 全页兜底。
- `site/css/home.css`：将 `body.home-page .footer` 加入 `overflow: clip` 命中区修正，保留视觉裁剪但避免页脚纯视觉层吞掉页面 wheel。
- 未恢复旧的全局 `setupHomeWheelBoundaryPassthrough()`，未新增 `home-scroll-active/restoring`，未触发 `markHomeScrollSettling()`，未改深度计追随逻辑。

### 验证方式

- 运行 `node --check site/js/home.js`，通过。
- 运行 `node --check site/js/depth-manager.js`，通过。
- 运行 `git diff --check -- site/js/home.js site/css/home.css docs/AI_CHANGELOG.md`，无空白错误；仅提示 Git 未来可能将 LF 替换为 CRLF。
- 使用 `http://127.0.0.1:8772/site/home.html`，Playwright 从 `./tools/qa/node_modules/playwright` 引入，Chrome 使用项目指定本地路径。
- 12 个定点上下滚复测 `badCount: 0`：覆盖首屏中心、今日海域卡片中心、今日海域按钮下方、首屏下方空白、精选海域 copy/media/边缘、Dive Match 标题/profile、故事卡片、故事下方和页脚中心。
- 320 次网格上下滚压力扫描 `failureCount: 0`：覆盖 `scrollY` 0、360、760、1120、1600、2200、3000、3820、4300、4550 与 8 个视口坐标组合；结束后 body 为 `home-page hero-awakened`，`homeScrollMode` 为 `normal`。
- `trip.html` Planner Desk 附近上下滚动 6 次均推进，`#plannerDeskControl` 存在。
- `home -> trip` 跳转后 URL 到达 `trip.html`，body class 为 `trip-page trip-depth-entry-released`，无 `page-transition-active` 残留，Planner Desk 存在。
- 控制台仍有一次 404 资源提示；未捕获 `pageerror`。

### 尚未验证

- Headless Playwright 仍不能可靠合成真实 Chrome 中键自动滚动，本轮用 wheel 命中区和同坐标上下滚压力扫描覆盖同类卡住问题。
- 未运行全量 `npm run perf:pages` / `npm run perf:detail`；本轮目标是滚轮不再卡住，不继续追 p95。
- 未做移动端专项验证；项目当前规则以桌面端体验为准。
- 未验证或修改详情页 Sea Atlas，因为用户明确要求 detail 不作为本轮目标。

### 影响范围

- depth-manager：无直接改动，本轮不改变深度计追随核心逻辑。
- 页面过渡：无直接改动，动态验证无 `page-transition-active` 残留。
- localStorage / sessionStorage：无影响，未修改主状态读写逻辑。
- Sea Atlas：无影响，未修改详情页或地图结构。
- Planner Desk：无结构影响，动态验证 Planner Desk 存在且页面可滚动。

## 2026-05-05 23:43

### 任务目的

- 重做 `home.html` 首页 SEA POSITION 小地图表现方式，让它更像“离线海图缩略图 / 海域位置图 / 潜点缩略图”，不再像装饰屏幕或雷达图。
- 本轮只做首页 SEA POSITION 小范围修改，不改首页大布局、不改首页三卡轮播结构、不触碰深度计、页面过渡、本地状态、Sea Atlas 或 Planner Desk。

### 改动文件

- `site/home.html`
- `site/js/home.js`
- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/home.html`：将 `.today-sea-maplet` 内部从多层 span / CSS 伪地图替换为轻量内联 SVG，包含深色底图、淡网格、海岸 path、陆架 path、路线 path、等深线 path、主潜点、辅助潜点、NE 方位标记和比例尺。
- `site/js/home.js`：新增 `TODAY_SEA_MAPLET_SVG_DATA`，为 14 个首页海域提供不同海岸轮廓、陆架轮廓、潜游路线、等深线、主潜点和辅助潜点数据。
- `site/js/home.js`：复用现有 `applyTodaySeaMapletState()` 首页联动入口，在 SEA POSITION 文案更新时同步更新 SVG 的 `d`、`cx/cy` 和方位文本，并添加短暂 `is-changing` 状态。
- `site/css/home.css`：新增 SVG 小海图视觉样式，使用深海蓝底、淡网格、清晰但克制的海岸/陆架轮廓、虚线潜游路线、主潜点和弱辅助潜点；切换动画只使用约 320ms 的 opacity / transform。
- 未使用外部地图 API，未引入新依赖，未改 detail Sea Atlas、trip、Planner Desk、depth-manager、depth-gauge、page-transition 或 localStorage / sessionStorage 主状态逻辑。

### 验证方式

- 运行 `node --check site/js/home.js`，通过。
- 运行 `git diff --check -- site/home.html site/js/home.js site/css/home.css docs/AI_CHANGELOG.md`，无空白错误；仅提示 Git 未来可能将 LF 替换为 CRLF。
- 启动本地服务 `python -m http.server 8776`，访问 `http://127.0.0.1:8776/site/home.html`。
- 使用项目指定本地 Chrome 路径与 `./tools/qa/node_modules/playwright` 动态验证首页桌面视口。
- 动态切换皇帝岛、热浪岛、诗巴丹、帕劳、大蓝洞：5 个海域的 SVG 海岸 path、陆架 path、路线 path、主潜点和辅助潜点均随当前卡片变化；`uniqueCoasts`、`uniqueRoutes`、`uniqueMainPoints` 均为 5。
- 首页首屏滚轮从 `scrollY=0` 推进到 `scrollY=620`，未发现滚动卡住。
- 打开 `detail.html?id=13`，`#seaAtlasShell` 与 `#mapContainer` 均存在；未捕获 `pageerror` / `requestfailed`。

### 尚未验证

- 未运行全量 `npm run perf:pages` / `npm run perf:detail`；本轮使用定向 Playwright 验证 SEA POSITION、首页滚动和 detail Sea Atlas 节点存在。
- 未做移动端专项验证；项目当前规则以桌面端体验为准。

## 2026-05-05 23:24

### 任务目的

- 修复首页残留的“滚轮事件触发但页面不动”的卡住命中区，重点覆盖 `today-sea-brief.is-ready`、`curated-display-copy`、`featured-destinations` 中下部和 Sea Guide 面板。
- 本轮只处理滚轮命中区，不继续做 UI 优化、不追 p95 极限、不改 `detail.html` / `detail.css` / `detail.js`，不动 Sea Atlas、Planner Desk、页面过渡 CSS 或 localStorage / sessionStorage 主状态逻辑。

### 排查结论

- 动态网格扫描确认：多处卡住点没有 `preventDefault()`，wheel 事件正常冒泡，但 `scrollY` 没推进。
- 临时 CSS 验证显示：把 `.featured-destinations` / `.curated-display-surface` 从 `overflow: hidden` 改为 `overflow: clip` 后，同一坐标可以滚动，说明它们作为纯视觉裁剪层时不应成为 wheel 命中的滚动容器。
- 首屏今日海域部分空白/轨道命中区仍需要窄 fallback；Sea Guide 展开时面板内容很短或到边界后应优先把 wheel 交回页面。

### 改动文件

- `site/css/home.css`
- `site/js/home.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/css/home.css`：在首页局部末尾增加滚轮命中区修正，将 `.featured-destinations`、`.curated-display-surface`、`.curated-display-media` 设为 `overflow: clip`，保留视觉裁剪但避免纯视觉层吞掉页面 wheel。
- `site/js/home.js`：新增 `getHomeWheelDeltaY()` 与 `scheduleNarrowHomeWheelFallback()`，只在 passive wheel 后下一帧确认页面 `scrollY` 完全没动时补一次 `window.scrollBy({ behavior: 'auto' })`。
- `site/js/home.js`：首屏 `.hero-hotspots-shell.today-sea-card` 增加窄 wheel fallback，覆盖今日海域装置空白/轨道命中区；复用原三卡 wrapper fallback，不恢复旧全局 passthrough。
- `site/js/home.js`：Sea Guide 面板在内容滚动余量很小、或已到顶/到底时使用同一窄 fallback 把 wheel 交回页面；不改变 Sea Guide 外观和跳转逻辑。
- 本次不新增 `home-scroll-active/restoring`，不触发 `markHomeScrollSettling()`，不恢复旧的 `setupHomeWheelBoundaryPassthrough()`。

### 验证方式

- 运行 `node --check site/js/home.js`，通过。
- 运行 `node --check site/js/depth-manager.js`，通过。
- 运行 `git diff --check -- site/js/home.js site/css/home.css docs/AI_CHANGELOG.md`，无空白错误；仅提示 Git 未来可能将 LF 替换为 CRLF。
- 使用 `http://127.0.0.1:8772/site/home.html`，Playwright 从 `./tools/qa/node_modules/playwright` 引入，Chrome 使用项目指定本地路径。
- 动态验证卡住复现场景共 11 个，`stuckCount: 0`：
  - `today-sea-brief.is-ready`：`scrollY 0 -> 360`。
  - 首屏三卡 wrapper / 空白轨道：`scrollY 0 -> 720`、`scrollY 0 -> 360`。
  - `featured-destinations` 中部 copy / facts / media：均 `scrollY 1060 -> 1420`。
  - `featured-destinations` 底部 copy / edge：均 `scrollY 1292 -> 1652`。
  - `dive-match` profile / filters：均 `scrollY 2128 -> 2488`，未新增卡住。
  - Sea Guide 面板连续向下滚：`scrollY 828 -> 2388`，短面板/边界后页面继续滚动。
- 轻量 RAF 混合验证：RAF p95 78.8ms，max 193.7ms，over32 20，over50 13，LongTask 0；body 回到 `home-page hero-awakened`，`homeScrollMode` 为 `normal`。
- `home -> trip` 跳转后 URL 到达 `trip.html`，body class 为 `trip-page trip-depth-entry-released`，无 `page-transition-active` 残留，`#plannerDeskControl` 存在。
- 控制台仍有一次 404 资源提示；未捕获 `pageerror`。

### 尚未验证

- Headless Playwright 仍不能可靠合成真实中键自动滚动；本轮用 wheel 命中区扫描验证同类卡住点。
- RAF p95 不是本轮目标且仍有偏高场景；本轮只确认“滚轮命中后页面能推进”。
- 未运行全量 `npm run perf:pages` / `npm run perf:detail`。
- 未做移动端专项验证；项目当前规则以桌面端体验为准。
- 未验证或修改详情页 Sea Atlas，因为用户明确要求 detail 不作为本轮目标。

### 影响范围

- depth-manager：无直接改动。
- 页面过渡：无直接改动，动态验证无 `page-transition-active` 残留。
- localStorage / sessionStorage：无影响，未修改主状态读写逻辑。
- Sea Atlas：无影响，未修改详情页或地图结构。
- Planner Desk：无结构影响，动态验证跳转后 Planner Desk 存在。

## 2026-05-05 23:11

### 任务目的

- 根据用户反馈，修正首页 SEA POSITION 小海图只剩雾状光斑、看不出地图地形的问题。

### 改动文件

- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/css/home.css`：在继续隐藏白点、航线、等深线和椭圆岛/礁盘标记的前提下，增强小海图的海岸块面、陆架纹理和边缘线。
- `site/css/home.css`：按 `data-map` 为不同海域分组设置不同 `clip-path` 岸线轮廓，避免只用同一块模糊形状平移。
- `site/css/home.css`：降低雾状光斑的主导性，让背景暗纹、网格、海岸轮廓和陆架块面承担“地图地形”语义。
- 本次只改首页小地图视觉层，不改首页轮播结构、不改 `home.js` 联动数据、不影响深度计、页面过渡、本地状态、Sea Atlas 或 Planner Desk。

### 验证方式

- 运行 `node --check site/js/home.js`，通过。
- 运行 `git diff --check -- site/css/home.css docs/AI_CHANGELOG.md`，无空白错误；仅提示 Git 未来可能将 LF 替换为 CRLF。
- 启动本地服务 `python -m http.server 8775`，访问 `http://127.0.0.1:8775/site/home.html`。
- 使用项目指定本地 Chrome 路径与 `./tools/qa/node_modules/playwright` 动态验证首页桌面视口。
- 动态抽样皇帝岛、热浪岛、诗巴丹、帕劳、大蓝洞：小海图点位、路线、椭圆岛均为隐藏；海岸块面显示为 `block`；诗巴丹、帕劳、大蓝洞等海域应用了不同 `clip-path` 地形轮廓；未捕获 `pageerror`。

### 尚未验证

- 未运行全量 `npm run perf:pages` / `npm run perf:detail`。
- 未做移动端专项验证；项目当前规则以桌面端体验为准。

## 2026-05-05 23:07

### 任务目的

- 根据用户反馈，继续收掉首页 SEA POSITION 小海图中两个看起来像固定贴纸的椭圆岛/礁盘标记。

### 改动文件

- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/css/home.css`：在上一轮隐藏白点、航线和等深线的基础上，继续隐藏 `.today-sea-maplet-island`，避免两个椭圆形岛/礁盘只随卡片移动位置却形状固定。
- 小地图保留背景暗纹、网格偏移、海岸轮廓和方位字符，继续提供克制的海图底纹变化。
- 本次只改首页小地图视觉层，不改首页轮播结构、不改 `home.js` 联动数据、不影响深度计、页面过渡、本地状态、Sea Atlas 或 Planner Desk。

### 验证方式

- 运行 `git diff --check -- site/css/home.css docs/AI_CHANGELOG.md`，无空白错误；仅提示 Git 未来可能将 LF 替换为 CRLF。

### 尚未验证

- 未重新运行 Playwright 动态截图；本次是 CSS 局部隐藏椭圆标记层，未改 JS 逻辑和页面结构。
- 未运行全量 `npm run perf:pages` / `npm run perf:detail`。
- 未做移动端专项验证；项目当前规则以桌面端体验为准。

## 2026-05-05 23:02

### 任务目的

- 根据用户截图反馈，收掉首页 SEA POSITION 小海图中过于显眼的白色点位和弧线标记，让小地图更安静，不像雷达或 HUD。

### 改动文件

- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/css/home.css`：隐藏 `.today-sea-maplet-route`、路线箭头、定位环、起点/当前点、等深弧线以及岛屿内部白色辅助点。
- `site/css/home.css`：保留小海图背景暗纹、海岸轮廓、岛屿轮廓、网格和随海域变化的 CSS 变量，让切换海域时仍有克制的图面差异。
- 本次只改首页小地图的视觉层，不改首页轮播结构，不改 `home.js` 联动数据，不影响深度计、页面过渡、本地状态、Sea Atlas 或 Planner Desk。

### 验证方式

- 运行 `node --check site/js/home.js`，通过。
- 运行 `git diff --check -- site/css/home.css docs/AI_CHANGELOG.md`，无空白错误；仅提示 Git 未来可能将 LF 替换为 CRLF。

### 尚未验证

- 未重新运行 Playwright 动态截图；本次是 CSS 局部隐藏标记层，未改 JS 逻辑和页面结构。
- 未运行全量 `npm run perf:pages` / `npm run perf:detail`。
- 未做移动端专项验证；项目当前规则以桌面端体验为准。

## 2026-05-05 23:00

### 任务目的

- 按“滑动优先”方案恢复 2026-04-19 备份版更少干预浏览器原生滚动的手感，优先处理 `home.html` 顶部 / 轮播区域滚动卡住和深度计节奏不稳。
- 本轮不做 UI 优化，不覆盖备份文件，不改 `detail.html` / `detail.css` / `detail.js`，不动 Sea Atlas、Planner Desk 核心结构和 localStorage / sessionStorage 主状态逻辑。

### 备份参照

- 备份版首页普通纵向滚动主要交给浏览器，轮播只做较简单的 pointer 处理。
- 备份版深度计普通滚动更接近 `scroll -> RAF -> targetDepth -> currentDepth 阻尼推进 -> renderDepth` 的简单节奏，没有普通滚动中的全局 wheel 补滚链、home settling/restoring 状态和多分支 scroll-rendering class。

### 改动文件

- `site/js/home.js`
- `site/js/depth-manager.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/js/home.js`：移除全局 `HOME_WHEEL_PASSTHROUGH_*`、`setupHomeWheelBoundaryPassthrough()` 和延迟 `window.scrollBy()` 补滚链，普通 wheel / 中键自动滚动不再进入 `home-scroll-active` / `home-scroll-restoring` 或 settling 状态。
- `site/js/home.js`：首页普通 scroll / wheel 不再记录 glide delta 或频繁触发 `markHomeScrollSettling()`；只在明显大幅滚动 burst 时保留轻量 traveling 标记。
- `site/js/home.js`：保留首页三卡轮播结构和基础交互，纵向 wheel 优先释放给原生页面滚动；只在首屏轮播命中区原生滚动完全没有推进时，下一帧做一次很窄的 hero wheel fallback，不写 body 滚动态 class。
- `site/js/depth-manager.js`：home 普通滚动恢复为更接近备份版的阻尼追随模型，停用 home fast path、velocity smoothing 滚动分支、普通滚动 `scrollRender` 渲染路径和 `depth-gauge-scroll-rendering` body class 写入。
- `site/js/depth-manager.js`：`renderDepth()` 保留深度文本变化时更新，但 marker / tape 结构只在强制刷新、home traveling 或 0.25m 深度桶变化时刷新，减少每帧重复写入。
- 本轮未修改 `site/css/depth-gauge.css` / `site/css/home.css`，但复核确认此前失败的 `body.home-scroll-active/restoring`、`body.depth-gauge-scroll-rendering` 宽滚动态深度计选择器没有继续参与本轮新增逻辑。

### 动态验证结果

- 使用本地服务 `http://127.0.0.1:8772/site/`，Playwright 从 `./tools/qa/node_modules/playwright` 引入，Chrome 使用项目指定本地路径。
- `home.html` 顶部首屏轮播命中区 wheel 卡住验证：`scrollY` 从 0 推进到 520，确认顶部卡死区已放开；body class 为 `home-page hero-awakened`，未残留 `page-transition-active`，未捕获 LongTask。
- `home.html` 顶部轮播 dead-zone 性能复测：RAF p95 60.5ms，max 121.2ms，over32 7，over50 5，LongTask 0；`UpdateLayoutTree` 185.09ms，`Layout` 23.14ms，`Paint` 14.38ms，`FireAnimationFrame` 74.07ms，`FunctionCall` 76.58ms。
- `home.html` 慢滚 down/up：RAF p95 54.5ms，max 151.5ms，over32 51，over50 25，LongTask 1；`UpdateLayoutTree` 1028.92ms，`Layout` 22.99ms，`Paint` 78.59ms，`FireAnimationFrame` 555.69ms，`FunctionCall` 571.29ms。
- `home.html` 快速经过轮播区域：RAF p95 42.4ms，max 91.0ms，over32 9，over50 5，LongTask 0。
- `trip.html` Planner Desk 附近滚动：RAF p95 24.3ms，max 169.8ms，over32 8，over50 3，LongTask 0，Planner Desk 存在。
- `home -> trip` 页面跳转：RAF p95 6.2ms，max 60.5ms，over32 2，over50 1，LongTask 0；跳转后 body class 为 `trip-page trip-depth-entry-released`，未残留 `page-transition-active`，Planner Desk 存在。
- 控制台：区域滚动验证中出现一次 404 提示；未捕获 `pageerror`。

### 尚未验证

- Headless Playwright 不能可靠合成 Chrome 原生中键自动滚动，本轮用顶部首屏 wheel dead-zone 和普通 wheel 替代验证；真实中键自动滚动仍需在可见 Chrome 中手动确认。
- `home.html` 顶部卡死区已改善，但慢滚 RAF p95 仍约 54.5ms，说明首页仍有视觉 / 深度计渲染成本，尚未达到 24-33ms 理想目标。
- 未做移动端专项验证；项目当前规则以桌面端体验为准。
- 未运行全量 `npm run perf:pages` / `npm run perf:detail`；本轮使用定向 Playwright / CDP 性能验证。
- 未验证或修改详情页 Sea Atlas，因为用户明确要求 detail 不作为本轮目标。

### 影响范围

- depth-manager：有影响，仅限恢复 home 普通滚动的简单追随节奏、停用普通滚动复杂分支和减少深度计重复写入；不删除深度计，不改变视觉风格，不重构跨页深度主状态。
- 页面过渡：无直接改动，动态验证未发现 `page-transition-active` 残留。
- localStorage / sessionStorage：无影响，未修改主状态读写逻辑。
- Sea Atlas：无影响，未修改详情页或地图结构。
- Planner Desk：无结构影响，动态验证 Planner Desk 存在且页面可滚动。

## 2026-05-05 22:58

### 任务目的

- 修复 `home.html` 首页今日海域轮播切换时，SEA POSITION 文案变化但左侧小地图几乎不变化的问题。
- 本轮只做首页小范围联动，不重构首页三卡轮播，不改整体 UI，不触碰深度计、页面过渡、Sea Atlas、Planner Desk 或本地状态主逻辑。

### 改动文件

- `site/js/home.js`
- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/js/home.js`：新增 `todaySeaMapletStates`，为 14 个首页今日海域定义离线海图缩略图状态，包括主潜点、辅助点、起点、路线、海岸轮廓、暗纹光斑、网格偏移和方位标记。
- `site/js/home.js`：在 `resolveTodaySeaBriefElements()` 中收集 `.today-sea-maplet` 与方位标记节点；新增 `applyTodaySeaMapletState()`，并在 `applyTodaySeaBriefContent()` 更新名称、位置、坐标时同步写入小地图 CSS 变量和 `data-map`。
- `site/css/home.css`：让小地图背景暗纹、深度线、海岸轮廓、主/辅助岛点、航线、起点和当前点读取 `--map-*` 变量；切换时使用约 320ms CSS transition 和 360ms 当前点 pulse，避免每帧 JS 动画。
- `site/css/home.css`：保留深海玻璃卡和克制海图质感，没有改成外部地图、雷达或游戏 HUD。
- 不影响 depth-manager、页面过渡、localStorage / sessionStorage、Sea Atlas 或 Planner Desk；未修改 `detail.html` / `detail.css` / `detail.js` / `trip.html`。

### 验证方式

- 运行 `node --check site/js/home.js`，通过。
- 运行 `git diff --check -- site/js/home.js site/css/home.css`，无空白错误；仅提示 Git 未来可能将 LF 替换为 CRLF。
- 启动本地服务 `python -m http.server 8774`，访问 `http://127.0.0.1:8774/site/home.html`。
- 使用项目指定本地 Chrome 路径与 `./tools/qa/node_modules/playwright` 动态验证首页桌面视口。
- 动态切换今日海域卡片：皇帝岛、热浪岛、诗巴丹、帕劳切换时，SEA POSITION 的 `data-map`、主点坐标、起点坐标、路线角度、海岸 transform 均随文案同步变化。
- 首页首屏滚轮从 `scrollY=0` 推进到 `scrollY=620`，未发现滚动卡住。
- 动态验证中未捕获 `pageerror` / `requestfailed`，未发现 `page-transition-active` 残留。

### 尚未验证

- 未运行全量 `npm run perf:pages` / `npm run perf:detail`；本轮是首页 SEA POSITION 小范围联动，使用定向 Playwright 验证。
- 未做移动端专项验证；项目当前规则以桌面端体验为准。
- 未打开详情页 Sea Atlas 做复测，因为本轮明确不修改 detail / Sea Atlas，且动态检查确认首页没有加载或触碰 `#seaAtlasShell` / `#mapContainer`。

## 2026-05-05 22:17

### 任务目的

- 根据 2026-04-19 正常备份对比结论，做一个最小性能修复点，优先处理 `home.html` 滚动偶发卡住和深度计节奏不稳。
- 本轮不做 UI 优化，不改 `detail.html` / `detail.css` / `detail.js`，不动 Sea Atlas、Planner Desk 核心结构和 localStorage / sessionStorage 主状态逻辑。

### 备份对比结论摘要

- 卡顿更可能由后续叠加的首页滚动状态链、深度计多分支渲染链路、滚动态 body class 和宽 CSS 选择器共同引入，不是 2026-04-19 备份版原有问题。
- `page-transition-active` 在最近动态验证中未残留，不是本轮第一修复目标。

### 改动文件

- `site/js/home.js`
- `site/js/depth-manager.js`
- `site/css/depth-gauge.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/js/home.js`：普通 wheel / scroll 不再频繁切换 `home-scroll-active` / `home-scroll-restoring`；`settling` / `glide` 不再被当作首页滚动 active 降载状态。
- `site/js/home.js`：wheel passthrough 改为更保守的原生优先策略，延长兜底等待到约 160ms，增加最小 delta 门槛，只有页面滚动链完全没推进时才调用一次 `window.scrollBy()`，并且不再在兜底后触发 `markHomeScrollSettling()`。
- `site/js/home.js`：首页轮播的纵向释放路径不再给普通纵向滚动打上 settling 状态；wheel 监听保持 `passive: true`。
- `site/js/depth-manager.js`：停用 `depth-gauge-scroll-rendering` body class 写入，只清理历史残留 class，避免滚动期间通过 body class 牵动深度计 CSS 重算。
- `site/js/depth-manager.js`：保留当前深度追随主逻辑，不启用此前效果不稳定的 home fast path，不改跨页深度主状态。
- `site/css/depth-gauge.css`：移除 `body.home-page.home-scroll-active/restoring` 和 `body.depth-gauge-scroll-rendering` 相关深度计降载块，避免宽 body 状态选择器在滚动时扩大样式匹配成本。

### 动态验证结果

- 使用本地服务 `http://127.0.0.1:8772/site/`，Playwright 从 `./tools/qa/node_modules/playwright` 引入，Chrome 使用项目指定本地路径。
- `home.html` 慢滚 down/up：RAF p95 42.4ms，max 121.1ms，over32 61，over50 19，LongTask 0；`UpdateLayoutTree` 1534.61ms，`Layout` 33.47ms，`Paint` 146.65ms，`FireAnimationFrame` 582.26ms，`FunctionCall` 635.07ms；body class 为 `home-page hero-awakened`，未残留 `page-transition-active`。
- `home.html` 快速经过轮播区域：RAF p95 18.3ms，max 84.8ms，over32 6，over50 4，LongTask 0；`UpdateLayoutTree` 207.24ms，`Layout` 16.66ms，`Paint` 71.86ms，`FireAnimationFrame` 87.17ms，`FunctionCall` 94.15ms；body class 为 `home-page hero-awakened`。
- `trip.html` Planner Desk 附近滚动：RAF p95 18.2ms，max 66.6ms，over32 5，over50 2，LongTask 0；`UpdateLayoutTree` 577.27ms，`Layout` 7.06ms，`Paint` 109.27ms，`FireAnimationFrame` 260.08ms，`FunctionCall` 274.4ms；body class 为 `trip-page`。
- `home -> trip` 页面跳转后 URL 到达 `trip.html`，body class 为 `trip-page trip-depth-entry-released`，未残留 `page-transition-active`，`#plannerDeskControl` 存在。
- 控制台：`home.html` 慢滚场景有一次 404 资源提示；未捕获 `pageerror`。

### 撤回的实验改动

- 已撤回“滚动中跳过首页 overlay CSS 变量写入”的实验，因 home 慢滚 RAF p95 恶化到约 48.5ms。
- 已撤回“深度计 tape offset 改为 1px 量化”的实验，因 home 慢滚 RAF p95 恶化到约 47.1ms。

### 尚未验证

- 本轮保守修复后，home 快滚和 trip Planner 附近滚动明显稳定，但 `home.html` 慢滚 p95 仍约 42.4ms，尚未达到 24-33ms 理想目标。
- 未做移动端专项验证；项目当前规则以桌面端体验为准。
- 未运行全量 `npm run perf:pages` / `npm run perf:detail`；本轮使用定向 Playwright / CDP 性能验证。
- 未验证或修改详情页 Sea Atlas，因为用户明确要求 detail 不作为本轮目标。

### 影响范围

- depth-manager：有影响，仅限收窄首页滚动状态和深度计 class / 渲染写入路径；不删除深度计，不改变视觉风格，不重构 currentDepth 追随主逻辑。
- 页面过渡：无直接改动；动态验证未发现 `page-transition-active` 残留。
- localStorage / sessionStorage：无影响，未修改主状态读写逻辑。
- Sea Atlas：无影响，未修改详情页或地图结构。
- Planner Desk：无结构影响，动态验证 Planner Desk 存在且附近滚动稳定。

## 2026-05-05 21:03

### 任务目的

- 继续排查“页面滑动一顿一顿 + 深度计数值变化不稳定”的性能问题，只优先保证展示滚动体验，不改 UI 风格、不动详情页和 Sea Atlas。

### 动态性能定位结果

- 当前工作区原始状态复测：`home.html` 慢滚 down/up RAF p95 约 54.5ms、max 151.5ms、over32 76、over50 34、LongTask 7 个，`UpdateLayoutTree` 约 2078.57ms、`Paint` 约 290.72ms。
- 撤掉首页宽滚动态选择器后：`home.html` 慢滚 RAF p95 约 48.4ms、LongTask 2 个，说明宽选择器降载块确实放大了样式重算。
- 对用户提供的 2026-04-19 正常备份做参照验证：备份 `home.html` 慢滚 RAF p95 约 48.4ms、LongTask 1 个，备份没有当前这套 `home-scroll-active/restoring` 宽 CSS/JS 降载。
- 注入式隔离显示：完全跳过深度计 `renderDepth()` 时 `UpdateLayoutTree` 明显下降；单独停用覆盖层 CSS 变量写入时 `home.html` 慢滚 `UpdateLayoutTree` 可降到约 986.8ms，说明首页普通滚动期间的覆盖层变量写入是剩余高成本点之一。

### 改动文件

- `site/css/home.css`
- `site/js/depth-manager.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/css/home.css`：移除 `body.home-scroll-active` / `body.home-scroll-restoring` 相关的大范围滚动忙碌态降载选择器，避免滚动时反复匹配大量首页模块、伪元素和 `:is(...)` 列表。
- `site/css/home.css`：保留 `home-guide-custom-travel-active` 和 `data-home-interaction='locked'` 的导览 / 锁定态轻量规则，避免影响 Sea Guide、自定义滚动旅行和弹层锁定体验。
- `site/js/depth-manager.js`：新增首页普通滚动覆盖层同步节流，`home` normal scroll 下按整米深度桶和约 160ms 间隔写入覆盖层 CSS 变量，降低 `--ocean-*` 与深度计视觉变量造成的样式重算频率。
- `site/js/depth-manager.js`：滚动收敛到目标深度时强制同步一次覆盖层状态，避免节流后最终海层覆盖感停在旧桶。
- 本次不改 `detail.html` / `detail.css` / `detail.js`，不动 Sea Atlas、Planner Desk、localStorage / sessionStorage 主状态逻辑，不重构页面过渡系统。

### 验证方式

- 运行 `node --check site/js/depth-manager.js`，通过。
- 运行 `node --check site/js/home.js`，通过。
- 启动本地服务：`python -m http.server 8772`，访问 `http://127.0.0.1:8772/site/`。
- 使用项目指定 Chrome 路径和 `./tools/qa/node_modules/playwright` 做 CDP trace / RAF 验证。
- `home.html` 慢滚 down/up：RAF p95 约 42.5ms、max 157.6ms、over32 69、over50 22、LongTask 3 个；`UpdateLayoutTree` 约 1500.56ms、`Layout` 约 48.05ms、`Paint` 约 163.47ms、`FireAnimationFrame` 约 1038.41ms、`FunctionCall` 约 1088.61ms。
- `home.html` 快速经过轮播区域：RAF p95 约 18.3ms、max 96.9ms、over32 9、over50 3、LongTask 1 个；`UpdateLayoutTree` 约 365.2ms、`Paint` 约 96.89ms。
- `trip.html` Planner Desk 附近滚动：RAF p95 约 12.2ms、max 66.7ms、over32 3、over50 2、LongTask 1 个；`UpdateLayoutTree` 约 407.28ms、`Paint` 约 88.69ms。
- `home -> trip` 页面跳转后，`body.className` 为 `trip-page trip-depth-entry-released`，未残留 `page-transition-active`，`#plannerDeskControl` 存在。
- 验证过程中未捕获 `pageerror` / `requestfailed`；首页慢滚场景仍有一次浏览器控制台 404 资源提示，未进入 Playwright requestfailed 记录。

### 尚未验证

- `home.html` 慢滚 p95 已从约 54.5ms 降到约 42.5ms，但仍未达到 24-33ms 的理想目标；本轮按用户要求不继续叠加更多实验修复。
- 未做移动端专项验证；当前项目规则以桌面端体验为准。
- 未运行 `npm run perf:pages` / `npm run perf:detail`，本轮使用定向 Playwright / CDP 性能验证。
- 未修改或复测详情页 Sea Atlas 性能，因为用户明确要求 detail 没问题不要动。

### 影响范围

- depth-manager：有影响，仅限首页普通滚动时覆盖层 CSS 变量写入节流，以及收尾强制同步；不改变深度计视觉风格、不改 currentDepth 追随主逻辑。
- 页面过渡：无直接改动，本轮动态验证 `page-transition-active` 未残留。
- localStorage / sessionStorage：无影响，未改主状态读写逻辑。
- Sea Atlas：无影响，未修改详情页或地图结构。
- Planner Desk：无影响，未修改行程页规划结构，动态验证 Planner Desk 可见且滚动指标稳定。

## 2026-05-05 19:52

### 任务目的

- 继续修复用户截图反馈的首页多处“鼠标停在卡片 / 展台 / 海域陈列区域时滑不动”的问题，重点放开会吞掉纵向滚动链的首页视觉轨道。

### 改动文件

- `site/css/home.css`
- `site/js/home.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/css/home.css`：将 `.curated-nav-rail` 的 `overscroll-behavior-y` 从 `none` 改为 `auto`。该 rail 自身是 `overflow-y: hidden`，原设置会在不能纵向滚动时截断页面滚动链，导致鼠标停在海域陈列左侧按钮 / 换一组按钮附近时页面像被卡住。
- `site/js/home.js`：扩展首页 wheel passthrough 目标，覆盖今日海域卡片轨道、今日海域信息面板、海域陈列展台、Dive Match 展台和海图导览面板。
- `site/js/home.js`：新增延迟兜底滚动逻辑。纵向 wheel 先交给浏览器原生滚动链；只有 88ms 后页面 `scrollY` 完全没有推进，且事件目标内部没有可继续滚动的真实滚动容器时，才用同一笔 delta 调用一次 `window.scrollBy()`，避免视觉容器吞掉滚轮。
- `site/js/home.js`：兜底逻辑会避开页面顶部 / 底部边界、跨页过渡锁、头像返回弹层锁，并继续保留轮播“先判断横纵意图，再进入横向拖拽”的现有修复。
- 本次不回滚备份版本，不修改深度计参数，不重构页面结构，不影响 localStorage / sessionStorage 主状态逻辑、Sea Atlas 数据或 Planner Desk。

### 验证方式

- 运行 `node --check site/js/home.js`，通过。
- 运行 `node --check site/js/depth-manager.js`，通过。
- 运行 `git diff --check -- site/js/home.js site/css/home.css`，无空白错误，仅有 Git LF/CRLF 换行提示。
- 启动本地服务：`python -m http.server 8766`，访问 `http://127.0.0.1:8766/site/home.html`。
- 使用项目指定 Chrome 路径通过 `tools/qa/node_modules` 中的 Playwright 动态验证首页 900x700 桌面视口：在今日海域激活卡片上滚轮，`scrollY` 从 0 推进到 280，未卡住。
- 动态验证今日海域底部信息面板，`scrollY` 从 192 推进到 472。
- 动态验证海域陈列标题区、左侧海域按钮、左侧“另一组海域”按钮、右侧主展示卡，滚轮均能推进页面；左侧海域按钮向上滚动也能从 1419 回到 899。
- 动态验证 Dive Match 标题区、舞台区和推荐卡片，滚轮均能推进页面。
- 动态验证首页今日海域横向拖拽仍可进入 `.is-dragging`，松手后正常释放。
- 动态验证从 `home.html` 通过 `DepthManager.navigateTo('trip.html')` 进入行程页，等待后 `page-transition-active` 不残留，`#plannerDeskControl` 可见。
- 动态验证 `detail.html?id=11` 滚到 Sea Atlas 区后，`#seaAtlasShell`、`#mapContainer` 存在且地图区高度正常，页面无 `page-transition-active` 残留。
- 动态验证过程中未捕获 `pageerror` / `requestfailed`。

### 尚未验证

- 未做移动端专项验证；当前项目规则以桌面端体验为准。
- 未运行 `npm run perf:pages` / `npm run perf:detail`，本轮使用 Playwright 定向验证首页滚动链、轮播拖拽、过渡锁、Sea Atlas 和 Planner Desk。
- 未逐像素检查所有首页装饰层的渲染性能；本次只处理会导致滚轮卡住的事件链和 overscroll 风险点。

### 影响范围

- 深度计：轻微相关。新增兜底只在原生滚动链完全没推进时触发，并沿用现有 settling 状态；不改深度计速度、步进、渲染模式或跨页深度状态。
- 页面过渡：无直接改动，动态验证 `page-transition-active` 未残留。
- localStorage / sessionStorage：无影响，未修改主状态读写逻辑。
- Sea Atlas：无影响，动态验证详情页 Sea Atlas 区存在且高度正常。
- Planner Desk：无影响，动态验证行程页规划区可见。

## 2026-05-05 19:34

### 任务目的

- 按 diff 分析后的最小修复方案，继续排查并修复当前版本“页面滚动偶发卡住 + 深度计数值忽快忽慢”的高风险引入点。

### 改动文件

- `site/js/home.js`
- `site/js/depth-manager.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/js/home.js`：移除首页 wheel fallback 中下一帧检测后主动 `window.scrollBy()` 补滚的逻辑，避免与浏览器原生滚动链争帧；保留 passive wheel 监听、轮播纵向释放和横向拖拽意图判断。
- `site/js/home.js`：轮播区域和首页内部展示层的纵向 wheel 不再触发手动补偿滚动，只让原生滚动链处理。
- `site/js/depth-manager.js`：`resolveHomeScrollRenderMode()` 不再把 `isHomeScrollSettlingActive()` 归入 `traveling`，普通 wheel settling 阶段保持 normal 深度渲染节奏，避免深度计在 settling 阶段整数化跳变。
- 本次不回退备份版本，不重构，不修改 CSS、不改页面结构、不新增依赖；不影响 localStorage / sessionStorage 主状态逻辑、Sea Atlas 或 Planner Desk。

### 验证方式

- 运行 `node --check site/js/home.js`，通过。
- 运行 `node --check site/js/depth-manager.js`，通过。
- 启动本地服务：`python -m http.server 8766`，访问 `http://127.0.0.1:8766/site/`。
- 使用项目指定 Chrome 路径通过 `tools/qa/node_modules` 中的 Playwright 动态验证 `home.html`：普通页面区域连续 wheel 后 `scrollY` 从 0 推进到约 1820，轮播区域纵向 wheel 从约 1820 推进到约 2180，未出现 `pageerror` / `requestfailed`。
- 动态验证首页轮播横向拖拽：横向移动时 `.hero-bamboo-cards-wrapper` 进入 `is-dragging`，松手后正常移除。
- 动态验证首页 settling 修复点：150px wheel 触发 `body[data-home-scroll-mode="active"]` 且 `isHomeScrollSettlingActive()` 为 true 时，`DepthManager.resolveHomeScrollRenderMode()` 返回 `normal`；settling 结束后仍为 `normal`。
- 动态验证从 `home.html` 通过 `DepthManager.navigateTo('trip.html')` 进入行程页，等待后 `page-transition-active` 不残留，`#plannerDeskControl` 可见。
- 动态验证 `detail.html?id=11` 的 `#spotMapSection` 可见，`trip.html` 的 `#plannerDeskControl` 可见。

### 尚未验证

- 未做移动端专项验证；当前项目规则以桌面端体验为准。
- 未运行 `npm run perf:pages` / `npm run perf:detail`，本轮使用 Playwright 定向验证滚动、轮播拖拽、过渡锁、Sea Atlas 和 Planner Desk。
- 未逐一覆盖所有详情页潜点和所有首页轮播卡片，验证集中在本次最小修复涉及的首页滚动链与深度计渲染模式。

### 影响范围

- 深度计：有影响，仅调整首页 settling 阶段的渲染模式判断，不改变深度计结构、速度平滑参数或跨页深度状态。
- 页面过渡：无直接改动，动态验证 `page-transition-active` 未残留。
- localStorage / sessionStorage：无影响，未修改主状态读写逻辑。
- Sea Atlas：无影响，动态验证详情页地图区可见。
- Planner Desk：无影响，动态验证行程页规划区可见。

## 2026-05-05 17:58

### 任务目的

- 根据 DeepSeek 静态核查报告，对“深度计数值忽快忽慢 + 页面滚动偶发卡住”做动态验证，并在确认问题后小范围修复深度节奏、首页轮播纵向滚动误判和页面过渡锁兜底。

### DeepSeek 静态报告摘要

- `depth-manager.js` 的 `instantVelocity` 使用单次 `scrollDeltaPx / elapsedMs`，不同 scroll / RAF 间隔会放大速度噪声。
- `getScrollDepthResponseFactor()` 中 `velocityBoost` 对速度噪声仍有放大效应，首页 `traveling / glide` 模式存在直接贴合目标深度的 fast path。
- `home.js` 首页轮播在 `pointerdown` 立即进入 `isDragging`，纵向释放阈值约 20px，可能与页面纵向滚动争帧。
- `page-transition-active` 会通过 `overflow: hidden` 锁滚动，若动画清理未触发，旧兜底最长可能让锁滚状态保留约 5-6 秒。

### 改动文件

- `site/js/depth-manager.js`
- `site/js/home.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- `site/js/depth-manager.js`：为滚动速度增加最近 5 帧加权移动平均，`pageScrollSmoothedVelocity` 不再直接追单帧 `instantVelocity`；把 `velocityBoost` 上限降到普通滚动 0.02、托管滚动 0.016，并降低 delta / snap boost。
- `site/js/depth-manager.js`：降低普通、detail、home traveling / glide 的单帧最大深度步进；home traveling / glide 不再走 `currentDepth = targetDepth` 的 fast path，而是继续使用阻尼追随；glide / traveling settle 阈值放宽到 0.05m。
- `site/js/depth-manager.js`：确认 `body.page-transition-active` 会锁滚动后，将默认 watchdog 缩短到约 1800ms、idle fallback 缩短到约 3000ms，并补 `animationcancel`、`blur`、`visibilitychange` 清理兜底。
- `site/js/home.js`：轮播 `handlePointerDown()` 改为只记录 pointer intent，不立即进入 `isDragging`、不立即 `setPointerCapture`；`handlePointerMove()` 中只有明确横向拖动才进入轮播拖拽。
- `site/js/home.js`：纵向意图释放阈值从 20px 降到 9px，并在纵向位移不弱于横向时优先调用 `prepareForPageVerticalScroll()`；保留 `pointerup / pointercancel / mouseleave / lostpointercapture` 释放兜底。

### 验证方式

- 启动本地服务：`python -m http.server 8771`，访问 `http://127.0.0.1:8771/site/`。
- 使用项目指定 Chrome 路径通过 Playwright 动态验证 `index.html`、`home.html`、`detail.html?id=11`、`trip.html`，指定路径初次因 PowerShell 中文路径转码为 `??` 启动失败，随后用同一路径 Unicode 转义字符串成功启动。
- 改前动态验证：慢滚采样中深度最大粗采样步进约 2.69m，快滚粗采样约 4.06m；轮播 `pointerdown` 后立即出现 `is-dragging`，向下移动约 12px 仍未释放；人工触发缺少动画结束的过渡锁，约 5.3s 后才释放。
- 改后动态验证：慢滚最大粗采样步进降至约 1.31m，停止后速度值约 0.016；快滚逐帧采样最大每帧深度变化约 0.38m，停止后速度约 0.000012。
- 改后动态验证：首页轮播 `pointerdown` 后不再进入 `is-dragging`；纵向移动约 12px 会进入页面纵向滚动释放态；横向拖动仍能进入 `is-dragging`，松手后正常释放；快速点击左右按钮后滚轮滚动正常。
- 改后动态验证：人工触发 `page-transition-active page-enter-from-bottom` 后，过渡锁在约 1.2s 检查点已清理，body 不残留 `page-transition-active`。
- 改后动态验证：`detail.html?id=11` 的 Sea Atlas 存在且可见；`trip.html` 的 Planner Desk 存在且可见；四个页面均无 `pageerror` / `requestfailed`。
- 运行 `node --check site/js/depth-manager.js`，通过。
- 运行 `node --check site/js/home.js`，通过。
- 运行 `git diff --check -- site/js/depth-manager.js site/js/home.js docs/AI_CHANGELOG.md`，无空白错误，仅有 LF/CRLF 换行提示。

### 尚未验证

- 未做移动端专项验证；当前项目规则以桌面端体验为准。
- 未运行 `npm run perf:pages` / `npm run perf:detail`，本轮使用 Playwright 定向验证滚动、轮播、过渡锁、Sea Atlas 和 Planner Desk。
- 未逐一覆盖所有详情页潜点和所有首页轮播卡片，验证集中在本次报告涉及的深度计、首页今日海域轮播和页面过渡锁路径。

### 影响范围

- depth-manager：有影响，仅为滚动深度追随节奏、过渡锁兜底和缓存节流的小范围调整；不删除深度计，不改变视觉风格。
- 页面过渡：有影响，仅缩短已确认残留锁滚的兜底释放时间并增加取消 / 失焦兜底；不改 keyframes 和整体过渡风格。
- localStorage / sessionStorage：无影响，未修改主状态读写逻辑；仅沿用原有当前深度持久化。
- Sea Atlas：无影响，未修改详情页地图结构或数据，动态验证可见。
- Planner Desk：无影响，未修改行程页规划系统，动态验证可见。

## 2026-05-04 — 深度计滚动更新节奏与性能优化

### 任务目的
修复盐憩 / YANQI 项目页面滚动时深度计数值变化节奏不稳定（忽快忽慢、跳动感）和轻微卡顿问题。只改性能与平滑度，不改视觉风格，不重构。

### 改动文件

1. **site/js/depth-manager.js** — 7 处小步修改
2. **site/css/depth-gauge.css** — 1 处小步修改
3. **site/css/global.css** — 未经修改（经检查无性能问题）

### 具体改动

#### site/js/depth-manager.js

1. **DOM 查询缓存 — `updateDetailGaugeTapePosition`**
   - 原：每帧 `container._depthTape || container.querySelector('.gauge-scale-tape')`，若 `_depthTape` 未缓存则每帧 querySelector
   - 改：首次调用时显式赋值 `container._depthTape`，之后直接读取缓存
   - 效果：消除滚动帧中唯一的条件式 DOM 查询

2. **DOM 查询缓存 — `syncDetailGaugeContainerLayout`**
   - 原：与上面类似的三处 `|| querySelector` 模式
   - 改：统一改为首次调用时缓存到 `container._depthTape / _depthTopSpacer / _depthBottomSpacer`
   - 效果：确保 resize 和初始化后的重复调用无 DOM 查询开销

3. **增大 settle 阈值以提前结束 rAF 尾帧**
   - 原：`detail: 0.035 | glide: 0.012 | normal: 0.05`
   - 改：`detail: 0.06 | glide: 0.02 | normal: 0.08`
   - 效果：当深度接近目标时更快收敛，减少不必要的 rAF 尾帧循环，降低滚动停止后的短暂抖动

4. **降低速度平滑响应系数**
   - 原：`VELOCITY_EASING = 0.18 | VELOCITY_DECAY = 0.82`
   - 改：`VELOCITY_EASING = 0.12 | VELOCITY_DECAY = 0.88`
   - 效果：平滑速度对瞬时滚动变化的反应更温和；停止滚动后速度值回落更平缓，避免"突然归零"感

5. **降低单帧最大深度步进**
   - 原：`PAGE_SCROLL_DEPTH_MAX_STEP = 0.62`
   - 改：`PAGE_SCROLL_DEPTH_MAX_STEP = 0.48`
   - 效果：快速滚动时每一帧的深度变化上限降低约 23%，减少深度读数"跳一下"的视觉突兀

6. **粗化 overlay depth 量化粒度**
   - 原：normal scroll 下 `Math.round(safeDepth * 5) / 5`（0.2m 精度）
   - 改：normal scroll 下 `Math.round(safeDepth * 2) / 2`（0.5m 精度）
   - 效果：减少 CSS 变量 `--ocean-base-opacity` / `--ocean-cover-opacity` / `--ocean-depth-progress` 的高频写入

7. **粗化 overlay boost 量化粒度**
   - 原：normal scroll 下 `Math.round(clamp(..., 0, 0.45) * 100) / 100`（0.01 精度）
   - 改：normal scroll 下 `Math.round(clamp(..., 0, 0.45) * 20) / 20`（0.05 精度）
   - 效果：覆盖层增强值写入频率降低约 5x，对视觉无感知影响

#### site/css/depth-gauge.css

8. **给 `.gauge-markers` 添加 `contain: layout style`**
   - 原：无 `contain`
   - 改：`contain: layout style`
   - 效果：限制刻度容器内部 layout 变化不影响外部，减少重排计算范围

### 验证方式

- 浏览器中打开 index.html / home.html / detail.html / trip.html
- 缓慢滚动：深度数字平滑变化，无忽快忽慢
- 快速滚动：深度数字不乱跳，紧跟滚动位置且不突兀
- 停止滚动：右侧深度数值稳定、无尾帧抖动
- 首页轮播正常，无卡顿影响
- Sea Atlas / Planner Desk 正常
- 页面过渡正常
- localStorage / sessionStorage 行为无变化

### 尚未验证的内容

- 低端设备 / 模拟 CPU 降频场景下的实际帧率改善（缺少测试环境）
- 首页 glide / traveling 模式下深度节奏的微调（当前参数改动侧重 normal scroll）
- 登录页交互 wobble 动画不受影响（未修改相关代码路径）

### 影响范围

| 模块 | 是否影响 |
|---|---|
| depth-manager 主逻辑 | 否——未改结构，仅缓存、阈值、步进参数调整 |
| 页面过渡系统 | 否——未改 page-transition.css 和过渡触发逻辑 |
| localStorage / sessionStorage | 否——未改存储读写逻辑 |
| Sea Atlas（detail 页） | 否——未改 Atlas 相关代码 |
| Planner Desk（trip 页） | 否——未改 Planner Desk 相关代码 |
| 首页轮播 | 否——未改轮播代码 |

## 2026-05-03 20:55

### 任务目的

- 修复 `site/home.html` 首页纵向滚动偶发卡住的问题，按 `site/diagnosis-scroll-lock.md` 的排查结论为页面过渡锁、首页竹签轮播拖拽锁、首页滚动交互锁和头像返回弹层锁补上兜底释放。

### 改动文件

- `site/js/depth-manager.js`
- `site/js/home.js`
- `site/js/avatar-return.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `site/js/depth-manager.js` 的 `applyTransitionClass()` 末尾登记 `scheduleTransitionIdleFallback()`：过渡开始后同时使用 6s `setTimeout` 与 `requestIdleCallback({ timeout: 6000 })` 检查 `body.page-transition-active`，如仍残留则调用现有 `clearTransitionClasses()` 释放页面滚动锁；新增 token 失效机制，避免正常清理后的旧兜底误清理新过渡。
- 在 `site/js/home.js` 的竹签轮播 `handlePointerMove()` 中加入纵向意图判断：拖拽开始后若纵向位移超过 20px 且大于横向位移 2 倍，主动取消拖拽帧、释放 pointer capture、移除 `is-dragging`，让浏览器接回纵向滚动。
- 在 `site/js/home.js` 的 `beginHomeInteractionLock()` 和 `markHomeScrollSettling()` 中分别加入 10s 与 2s 的绝对时间上限，避免高频 wheel 或异常定时器节流导致首页交互降载状态长期延长。
- 在 `site/js/avatar-return.js` 的 `closeAvatarReturnModal()` 280ms 收尾回调内重复移除 `html/body.has-avatar-return-open`，即使关闭初始清理被中断也能兜底释放滚动。
- 本次不改 CSS、不改页面结构、不新增依赖；影响深度计/页面过渡系统的部分仅为过渡锁兜底清理，不改变深度计算和过渡语义；不影响 localStorage/sessionStorage 状态逻辑、Sea Atlas 或 Planner Desk。

### 验证方式

- 运行 `node --check site/js/depth-manager.js`，通过。
- 运行 `node --check site/js/home.js`，通过。
- 运行 `node --check site/js/avatar-return.js`，通过。
- 运行 `git diff --check -- site/js/depth-manager.js site/js/home.js site/js/avatar-return.js`，无空白错误，仅有 Git LF/CRLF 换行提示。
- 启动本地服务并访问 `http://127.0.0.1:8768/site/home.html`，HTTP 200。
- 使用项目指定 Chrome 路径通过 Playwright / DevTools Protocol 录制首页滚动 Performance trace：`tools/qa/out/home-scroll-lock-performance-trace-warm.json`；预热后滚动窗口内 `observedLongTasks` 为空，trace 中无 `RunTask > 50ms`、无长时间 `EventDispatch / FunctionCall`、无 `Layout / RecalculateStyles / UpdateLayoutTree > 50ms`。
- 截图输出：`tools/qa/out/home-scroll-lock-after-warm-scroll.png`。
- 额外验证纵向拖拽竹签轮播：拖拽期间 `.hero-bamboo-cards-wrapper` 退出 `is-dragging`，`body[data-home-scroll-mode]` 从 `active` 回到 `normal`。
- 额外验证过渡锁兜底：自然加载后无 `page-transition-active`；强行给 body 添加 `page-transition-active page-enter-from-bottom` 并调用 `window.DepthManager.scheduleTransitionIdleFallback()` 后，约 6.35s 内自动清空过渡锁。
- 额外验证头像返回弹层：打开时 `html/body.has-avatar-return-open` 均存在，按 Esc 关闭 360ms 后两个 class 均被清除。

### 尚未验证

- 初次 Playwright 启动指定 Chrome 时，PowerShell 内联 Node 脚本里的中文路径被编码替换成 `??` 导致启动失败；随后改用同一路径的 Unicode 转义字符串成功启动指定 Chrome 并完成验证。
- Performance 冷启动录制中曾出现图片解码/GPU commit 相关 `RunTask > 50ms`，预热后只录滚动窗口已确认无长任务；本轮结论以预热后的滚动 trace 为准。
- 浏览器控制台仍有一条既有泛化资源 404 文案；`pageerror` 和 `requestfailed` 为空，滚动锁、拖拽释放、过渡锁兜底和头像弹层锁验证未受影响。
- 未做移动端专项验证；项目当前规则以桌面端体验为准。

## 2026-05-03 17:57

### 任务目的

- 小范围优化 `home.html` 首页“今日海域”模块的轮播切换稳定性和下方海域档案信息变化动画，让卡片按钮切换不再有明显“竹签抖动感”，并让 `SEA POSITION / DIVE READING / EXPLORATION` 内容变化更像柔和的海域档案读取。

### 改动文件

- `site/css/home.css`
- `site/js/home.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `site/js/home.js` 为首页竹签轮播增加手动步进锁：按钮触发后约 620ms 内暂时禁用左右按钮并给轨道加 `is-step-locked`，避免连续点击叠加 step / snap / inertia 造成抖动。
- 调整按钮步进时的物理反馈：手动点击不再向首屏主轮播注入强 shake，自动步进和刹停脉冲也降低首屏 hero 场景下的 jitter / brake 强度，让点击切换更稳。
- 将下方承接层更新拆成 `is-updating -> is-reading -> is-ready`：旧内容先轻微下沉淡出，再写入新海域数据，新内容按 SEA POSITION、DIVE READING、EXPLORATION 轻微 stagger 浮现。
- `DIVE READING` 数值增加轻柔上浮淡入，小地图主潜点和 EXPLORATION 圆环增加克制读取动画；保留现有 SEA POSITION 小海图、DIVE READING 结构和“海域阅读记录”表达。
- 在 `site/css/home.css` 增加档案切换 keyframes、手动锁定态按钮样式和 hover 收束样式；同时保留本轮前置的 DIVE READING 内框轻量化、承接层轻微下移和侧卡投屏可读性微调。
- 本次未修改 `depth-manager.js`、`depth-gauge.css`、`page-transition.css`、localStorage/sessionStorage 状态逻辑、Sea Atlas、Planner Desk、行程页或详情页。

### 验证方式

- 运行 `node --check site/js/home.js`，通过。
- 运行 `git diff --check -- site/home.html site/css/home.css site/js/home.js docs/AI_CHANGELOG.md`，无空白错误，仅有 Git 换行提示。
- 使用本地服务打开 `http://127.0.0.1:8767/site/home.html`，HTTP 200。
- 使用项目指定 Chrome 路径通过 Playwright 检查 `1440x900` 首页首屏，并输出截图：`tools/qa/out/home-archive-animation-before.png`、`tools/qa/out/home-archive-animation-after.png`。
- Playwright 验证空闲态点击右箭头后：按钮立即进入 `is-step-locked` / disabled，约 760ms 后解锁；活动卡从“皇帝岛”切到“热浪岛”。
- Playwright 验证信息层动画状态依次出现 `is-updating`、`is-reading`、`is-ready`，并且 brief 文案从旧海域柔和切到新海域。
- Playwright 验证小幅拖动未达到强切换后会回到稳定态：活动卡和下方档案保持一致，最终 wrapper 不再停留在 `is-dragging`，页面保留 2 个深度计元素。

### 尚未验证

- 未做移动端专项验收；当前项目规则以桌面展示为准。
- 未逐一手动拖拽和点击覆盖全部 14 个海域；本轮通过按钮切换、快速点击锁定和小幅拖拽回弹验证核心路径。
- Playwright 控制台仍捕获到一条浏览器泛化资源 404 文案，但 requestfailed 和 pageerror 均为空，首页关键资源、轮播、档案动画和深度计检查未受影响。

## 2026-05-03 17:50

### 任务目的

- 小范围优化 `detail.html` 的 Sea Atlas 信息层布局，取消底部整条横向信息栏对海图主体的遮挡，把图例 / Sea Layer / 能见度 / 点位摘要收回上方信息卡，并把“查看剖面”并入右上出海点卡。

### 改动文件

- `site/css/detail.css`
- `site/js/detail.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `site/js/detail.js` 移除了 Sea Atlas location 视图底部的 `.sea-atlas-legend-rail`，不再让整条玻璃栏压住地图底部。
- 在 `site/js/detail.js` 为左上潜点信息卡补入轻量图例 chips（`图例` / `Sea Layer 02` / `能见度`）和点位摘要文案，把底部信息改为顶部收纳。
- 在 `site/js/detail.js` 把 `查看剖面` 移到右上出海点卡底部，并补上 fullscreen 容器内同样的 `data-sea-atlas-view-shortcut` 点击处理。
- 在 `site/js/detail.js` 让 detail 页 inline Sea Atlas 的右上出海点卡默认常驻，避免动作入口只能靠 hover 才出现。
- 在 `site/css/detail.css` 为新的 info chips、点位摘要和右上卡动作按钮补了局部样式；保留原有深海玻璃感和 overlay 层级，不改 Sea Atlas 核心结构。
- 本次改动不影响 `depth-manager.js`、页面过渡系统和 `localStorage / sessionStorage` 主状态逻辑；Sea Atlas 仅调整 detail 页信息层布局和 view shortcut 入口位置。

### 验证方式

- 运行 `node --check site/js/detail.js`
- 运行 `git diff --check -- site/css/detail.css site/js/detail.js docs/AI_CHANGELOG.md`
- 使用项目指定 Chrome 路径通过 Playwright 打开 `http://127.0.0.1:8766/site/detail.html?id=11`
- 桌面端检查确认：
- 底部 `.sea-atlas-legend-rail` 已不存在
- 左上与右上两张信息卡不重叠
- 右上 `查看剖面` 按钮可点击，并成功把 Sea Atlas 从 `location` 切换到 `underwater`
- 截图输出：`tools/qa/out/detail-sea-atlas-bottom-lightened-spot11.png`
- Playwright 控制台仅记录 1 条既有 404 资源报错，未见新的 JS 运行错误

### 尚未验证

- 未逐一检查所有潜点 id 在不同文案长度下的两张顶层信息卡布局。
- 未单独验证 fullscreen Sea Atlas 在所有交互路径下的按钮常驻策略。
- 未做移动端验证；当前仍按项目规则以桌面端为准。

## 2026-05-03 17:46

### 任务目的

- 修复首页 `Dive Match` 区块无法正常显示的问题；用户本地误改后，`#dive-match` 与 `data-home-layer="match"` 对应的结构和联动失效。

### 改动文件

- `site/home.html`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `site/home.html` 把 `Dive Match` 区块真实标签属性里的中文弯引号恢复为标准 ASCII 引号，修复了以下节点的 `class` / `id` / `data-*` / `aria-*` 解析：
- `section.dive-match#dive-match`
- `div#diveMatchStage`
- `div#diveMatchFilters`
- `p#diveMatchLiveSummary`
- `div#diveMatchDisplay`
- 同时把首页页脚 `footer#homeFooter[data-home-layer="harbor"]` 的真实标签属性恢复为标准引号，避免首页海层滚动联动在页脚层继续断开。
- 同步把同一段注释中的属性写法统一回标准引号，方便后续继续编辑时不再混入弯引号。
- 本次没有改动 `site/css/home.css`、`site/js/home.js`、深度计、跨页过渡、本地状态或 Sea Atlas 逻辑；只是把被错误字符破坏的首页结构接回现有系统。

### 验证方式

- 运行 `rg -n "[“”]" site/home.html`，确认首页文件内已无残留弯引号。
- 运行 `git diff --check -- site/home.html`，无空白错误；仅有 Git 的 LF/CRLF 提示。
- 启动本地服务：`python -m http.server 8766`，访问 `http://127.0.0.1:8766/site/home.html`。
- 使用项目指定 Chrome 路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe`，通过 `tools/qa` 目录已安装的 Playwright 做桌面端检查。
- Playwright 验证结果：
- `document.querySelector('#dive-match')` 命中成功；
- `#diveMatchFilters .dive-match-filter` 渲染出 `11` 个匹配筛选项；
- `#diveMatchDisplay` 成功渲染内容；
- 滚动到该区块后，`#dive-match` 的 class 恢复为 `dive-match is-home-current is-visible is-stage-visible is-display-visible`。
- 截图输出：`tools/qa/out/home-dive-match-fixed-1440.png`。

### 尚未验证

- 未逐一点击 11 个 `Dive Match` 分类检查每一档推荐卡切换是否都正常；本轮重点是修复区块不显示与 `is-home-current` 失效问题。
- 浏览器控制台仍有一条泛化 `404` 资源错误文案，但没有 `pageerror`，且本轮 `Dive Match` 结构、渲染和海层联动验证均已恢复正常。

## 2026-05-03 14:30（更新于 2026-05-03 17:00）

### 任务目的

- 为盐憩/YANQI 全站前端项目添加清晰、实用的中文注释，便于论文答辩使用。要求只添加注释，不改动任何功能代码、样式和页面结构。
- 分四批处理：Batch 1 HTML 页面结构注释 → Batch 2 CSS 文件内部注释 → Batch 3 JS 文件逻辑注释 → Batch 4 核心系统保护性检查。

### 改动文件

- `site/index.html`（HTML 结构注释：body 状态属性、过渡遮罩、深度计、氛围层、门厅外壳、玻璃卡、品牌文案、静海档案、进度条、认证表单区、tab 切换、表单面板、底部链接、舞台 HUD、脚本加载顺序）
- `site/home.html`（HTML 结构注释：缓存禁用 meta、导航数据属性、英雄区氛围层、3D 按钮结构、信息承接层、迷你海图、潜水数据面板、探索进度面板、深海档案墙、匹配舞台、故事网格、页脚海层、海图导览机制、脚本加载顺序）
- `site/trip.html`（HTML 结构注释：海图导览数据键位、脚本加载顺序）
- `site/detail.html`（HTML 结构注释：Leaflet 地图库、首屏防闪烁样式、bootstrap 内联脚本、调试回声按钮、脚本加载顺序）
- `site/contact.html`（HTML 结构注释：脚本加载说明）
- `site/terms.html`（HTML 结构注释：info-pages.js 导航联动说明）
- `site/privacy.html`（HTML 结构注释：info-pages.js 导航联动说明）
- `site/css/detail.css`（CSS @property 声明和全局自定义属性的逐行注释）
- `site/css/home.css`（已在上一轮添加 7 组注释块，本轮无额外 CSS 改动）
- `docs/AI_CHANGELOG.md`（本次更新）

### 评估结果

对全部项目文件进行逐文件检查后，发现：

- **CSS 核心系统文件**（depth-gauge.css、page-transition.css、global.css）和 **JS 核心系统文件**（depth-manager.js、auth.js、avatar-return.js、yanqi-trip-store.js）已有极其完善的中文注释体系，每条 CSS 属性、每个 JS 函数和常量都有详细的中文说明，无需补充。
- **trip.html** 和 **contact.html** 已有接近逐元素的详细中文注释，仅需补充脚本加载区的简要说明。
- **index.html** 和 **home.html** 现有注释较为概括，需要在关键结构节点上增加更详细的注释，解释数据属性驱动机制、动画层职责、3D 按钮结构等。
- **detail.html** 头部包含复杂的内联 bootstrap 脚本（首屏渲染优化），需要注释说明其工作机制和与 CSS 防闪烁规则的配合。
- **detail.css** 头部的 @property 声明和 CSS 自定义变量区缺少逐条注释，需要说明每个变量的用途和设计决策。

### 具体改动

#### Batch 1: HTML 结构注释（7 个文件）

**index.html（登录页）：**
- body 标签：添加 data-auth-mode / data-auth-progress-state / data-auth-progress-step / is-auth-login 四个属性的完整说明，解释它们作为页面状态机的唯一来源
- 页面过渡遮罩：补充 auth.js 配合 page-transition.css 的工作流程
- 舞台调试按钮：补充 data-stage-debug 的激活机制
- 深度计：补充整站深度系统各页面深度值的映射关系（登录页 0m、首页 ~30m、行程页 ~60m、详情页 ~90m）
- 主舞台：补充 page-transition.css 依赖 #pageStage 做退出动画的原因
- 氛围层：为每一个 atmosphere-* span 添加具体视觉效果说明（haze = 大面积光晕、wave = 横向波浪、current = 暗流光带、ripple = 圆形涟漪）
- 盐粒粒子：补充 10 个独立 div 各自以不同延迟/速度做浮动 + 淡入淡出的机制
- 门厅外壳：补充 --stage-w / --stage-h CSS 自定义属性控制尺寸的说明
- 玻璃卡片：补充 backdrop-filter + 半透明渐变边框的毛玻璃实现
- 左侧品牌区：补充 fade-in-up 动画序列营造"慢慢进入"节奏；补充静海档案四列信息卡各自的概念映射；补充进入进度条的 JS 驱动机制
- 右侧认证区：补充 auth-panel-glass 底层毛玻璃 + auth-panel-inner 内边距的分层结构
- 表单品牌区：补充 form-copy-login / form-copy-register 双 div 并存、JS 按 data-auth-mode 切换显示的机制
- tab 切换区：补充 role="tablist" + role="tab" + role="tabpanel" 的无障碍模式
- 登录/注册面板：补充每个输入框和复选框的业务逻辑（pattern 正则、记住我 localStorage、确认密码校验、协议同意）
- 底部链接：补充四种进入方式（忘记密码、展示航线、先逛逛、联系我们）对应的权限状态
- 舞台 HUD：补充 data-stage-debug 激活时显示的机制
- 脚本加载：补充 5 个 JS 文件的依赖关系和按序加载的原因

**home.html（首页）：**
- head 缓存禁用：补充三行 meta 禁用缓存的必要性（动态内容页）和 Pragma/Expires 旧浏览器兼容
- CSS 版本号：补充 ?v= 的缓存破坏机制
- 导航栏：补充 data-scroll-target 平滑滚动属性和 active 类表示当前页
- 头像：补充 avatar-return.js 监听点击、根据认证状态跳转或退出
- 英雄区氛围层：补充 glow/wave/plankton 三类元素的视觉效果说明
- 竹简卡片轮播：补充 3D 玻璃按钮的三层结构（button-base 阴影盘 → button-bottom 厚度层 → button-top 表层）
- 信息承接层：补充左侧迷你海图（13 个 span 纯 CSS 拼出航海图）、中间四列潜水数据（dl/dt/dd 语义化数据列表）、右侧探索进度面板
- 深海档案墙：补充 curated-nav-rail（左侧导航）+ curated-main-card（右侧大卡）的左右联动机制和 curated-reveal 的 IntersectionObserver 渐显动画
- 潜水匹配区：补充 data-home-layer="match" 海层标记和深度计联动机制
- 故事区：补充 --story-delay 自定义属性驱动动画延迟和 story-card-offset 中间卡片微上移的视觉节奏
- 页脚：补充 data-home-layer="harbor" 港湾层标记和 arrival-bridge → brand-stage → middle → bottom 的结构层次
- 海图导览：补充 data-key → data-target 的滚动联动机制和 aria-expanded 无障碍折叠面板
- 脚本加载：补充 11 个 JS 文件的依赖关系和各自职责

**trip.html（行程页）：**
- 海图导览：补充 trip 页特有 data-key 值（surface/bookings/console/summary/notes/prep/harbor）到锚点的映射
- 脚本加载：补充 10 个 JS 文件依赖关系，特别说明 yanqi-trip-store.js 负责 localStorage 读写层

**detail.html（详情页）：**
- head 区：补充 Leaflet 地图库用途、数据脚本在 head 中提前加载的原因（bootstrap 脚本需要）
- 防闪烁 CSS：补充 visibility: hidden + data-detail-hero-bootstrap 的配合机制
- bootstrap 脚本：补充完整的注释说明立即执行内联脚本的首屏渲染优化流程
- 调试回声按钮：补充 hidden + disabled 默认态、由 detail.js 按条件激活
- 脚本加载：补充 11 个 JS 文件职责说明，备注 data 脚本已在 head 加载

**contact.html / terms.html / privacy.html：**
- 脚本加载区：补充 info-pages.js 的共用逻辑说明和导航联动机制

#### Batch 2: CSS 内部注释

**detail.css：**
- @property --booking-copy-stick-top / --booking-copy-stick-height：补充注册为 <length> 类型后 JS 修改可触发 CSS transition 的机制说明
- @property --booking-sticky-stack-gap：补充侧栏 sticky 状态下区块间距的用途
- .detail-page 全局变量区：为每个 --detail-* 变量添加逐条注释，包括：
  - --detail-safe-side 为深度计预留空间的设计
  - --detail-sidebar-stick-* 的 navbar 高度计算
  - --detail-swap-* 系列 6 个变量的"海流推移"动画设计（位移方向、缩放比例、时长选择）
  - --detail-hero-* 系列变量的 Ken Burns 缓慢漂浮效果

**home.css：** 已在上一轮完成 7 组注释块的添加，本轮未额外改动。

#### Batch 3: JS 文件逻辑注释

经逐文件检查，所有 JS 文件（depth-manager.js、auth.js、home.js、trip.js、detail.js、avatar-return.js、yanqi-trip-store.js、ocean-scroll.js、yanqi-brand-config.js 等 15+ 个文件）均已有完善的 JSDoc 函数文档、状态变量注释和逻辑步骤注释，无需补充。

#### Batch 4: 核心系统保护性检查

已验证以下核心系统文件未被本轮任何编辑改动或破坏：
- **depth-manager.js**：深度系统核心，控制左右深度计和页面下潜动画 — 未修改
- **page-transition.css**：跨页过渡样式（潜水/上浮/潜游三种动画）— 未修改
- **depth-gauge.css**：深度计视觉样式 — 未修改
- **Planner Desk**（trip.html 控制台 + trip.css + trip.js）：仅对 trip.html 添加了注释，未修改结构
- **Sea Atlas**（detail.html 地图 + detail.css 地图样式 + detail.js Leaflet）：仅对 detail.html 添加了注释，未修改结构
- **localStorage / sessionStorage**：所有存储键值和读写逻辑未修改

### 验证方式

- 所有编辑均仅添加 `<!-- ... -->` 或 `/* ... */` 注释，未修改任何 HTML 标签、CSS 属性、JS 逻辑。
- 使用 Grep 搜索 U+201C/U+201D 等 Unicode 智能引号，确认文件中无残留的编码错误。
- 确认七类核心保护系统（depth-manager、page-transition、depth-gauge、Planner Desk、Sea Atlas、localStorage、sessionStorage）均未被修改。

### 注释质量准则

所有新增注释遵循以下原则：
- 解释"这段代码做什么、为什么这么写、对应哪个页面效果"三个维度
- 不写无意义注释（如"设置宽度"、"点击事件"等仅翻译属性名的注释）
- 重点注释数据属性驱动机制、CSS 动画链的视觉意图、3D 分层结构的设计原理
- JS 文件注释保持原有 JSDoc 体系不变

### 任务目的

- 修复详情页 Sea Atlas 区域上方海域信息卡与下方底部工具条的重叠问题，只处理布局层，不改动 Sea Atlas 的整体视觉方向。

### 改动文件

- `site/css/detail.css`
- `site/js/detail.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `site/css/detail.css` 把 Sea Atlas spot info 卡的默认锚点从底部安全区改到顶部阅读区，并限制其宽度，避免它继续侵入底部 rail 所在区域。
- 在 `site/js/detail.js` 同步修正 `positionSeaAtlasInfoCard()`：spot 卡不再写入 `bottom`，而是明确写入 `top`，避免 JS 内联定位和 CSS 同时生效导致卡片被上下双向拉伸。
- 保留 port 卡在右上角、底部 rail 在下方的层级结构，没有隐藏内容，也没有重做 Sea Atlas 组件；只是把 overlay 分区明确成 top / bottom 两层。
- 本次不影响 `depth-manager.js`、页面过渡、`localStorage/sessionStorage` 主状态逻辑；Sea Atlas 仅调整详情页信息层布局，不改核心展示概念和主交互流程。

### 验证方式

- 运行 `node --check site/js/detail.js`，通过。
- 运行 `git diff --check -- site/css/detail.css site/js/detail.js docs/AI_CHANGELOG.md`，无空白错误；仅有 Git 的 LF/CRLF 提示。
- 使用项目指定 Chrome 路径，通过 Playwright 打开 `http://127.0.0.1:8766/site/detail.html?id=11`，等待 Sea Atlas 稳定后检查 overlay 位置关系。
- Playwright 读取到 Sea Atlas spot 卡与底部 rail 的可视间距约为 `285px`，不再重叠。
- 截图输出：`tools/qa/out/detail-sea-atlas-no-overlap-spot11-fixed.png`。

### 尚未验证

- 未逐一检查所有潜点在不同信息卡文案长度下的 top / bottom overlay 间距表现；本轮动态验证基于 `detail.html?id=11`。
- 未额外制造 fullscreen、fallback 或极窄宽度场景做专项截图；本轮只修当前桌面端 Sea Atlas overlay 重叠 bug。
## 2026-05-03 12:51

### 任务目的

- 继续小范围收紧详情页 Sea Atlas 底部图例 rail，减少信息堆叠，避免地图底部抢戏。

### 改动文件

- `site/css/detail.css`
- `site/js/detail.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `site/js/detail.js` 精简 Sea Atlas 底部 rail：删除重复的“潜游路线” chip 与按钮，只保留 `图例`、合并后的 `Sea Layer 02 · 深度层`、`能见度` 和一个 `查看剖面` 轻按钮；点位文案改成 `主点位 + 点位数量` 的简写，不再横向铺满多个名称。
- 在 `site/css/detail.css` 收紧 rail 的栅格、字号、padding 和按钮尺寸，让它更像地图附注，而不是第二层信息面板。
- 本次不影响 `depth-manager.js`、页面过渡、`localStorage/sessionStorage` 主状态逻辑，也不改动 Sea Atlas 的主交互流程。

### 验证方式

- 运行 `node --check site/js/detail.js`，通过。
- 运行 `git diff --check -- site/css/detail.css site/js/detail.js docs/AI_CHANGELOG.md`，无空白错误；仅有 Git 的 LF/CRLF 提示。
- 使用项目指定 Chrome 路径，通过 Playwright 打开 `http://127.0.0.1:8766/site/detail.html?id=11`，等待 Sea Atlas 稳定后截取底部 rail。
- 截图输出：`tools/qa/out/detail-sea-atlas-legend-simplified-spot11.png`。
- Playwright 读取到的 rail 内容为 3 个 chip、1 个按钮、1 行摘要：`图例`、`Sea Layer 02 · 5-30m`、`能见度：10-25米`、`查看剖面`、`Skeleton Wreck 等 5 个点位`。

### 尚未验证

- 未逐一检查所有潜点在不同英文点位名长度下的 rail 换行表现；本轮动态验证基于 `detail.html?id=11`。
- 未重新截全页图；本轮只针对用户指出的 Sea Atlas 底部信息过多问题做局部验证。

## 2026-05-03 12:50

### 任务目的

- 小范围精修 `home.html` 首页“今日海域”首屏下方 `SEA POSITION / DIVE READING / EXPLORATION` 三块信息承接层，让它们更像统一的海域档案承接层，而不是普通信息组件或后台数据面板。

### 改动文件

- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `site/css/home.css` 末尾追加“今日海域：下方海域档案承接层精修”样式层，未修改 `home.html` 结构，未修改首页 JS。
- 统一三块信息卡的玻璃背景、边框高光、顶部标签线和承接层连接线，让它们看起来属于同一层海域档案系统。
- 重点精修 `DIVE READING`：增加内层读数托盘、轻分隔、统一图标尺寸和读数权重，收紧四项数据的组织感；同时把辅助水线下沉，避免压到读数文字。
- 统一 `SEA POSITION` 左图右文关系：保留小海图方向，轻调文案对齐和“查看档案”入口，让它更像一张完整海域档案卡。
- 弱化 `EXPLORATION` 统计感：保留圆环、进度数字、季节和说明，调整为“海域阅读记录”语义，降低圆环亮度和数字 KPI 感。
- 本次未修改 `depth-manager.js`、`depth-gauge.css`、`page-transition.css`、localStorage/sessionStorage 状态逻辑、Sea Atlas、Planner Desk、行程页或详情页。

### 验证方式

- 运行 `git diff --check -- site/home.html site/css/home.css docs/AI_CHANGELOG.md`，无空白错误，仅有 Git 换行提示。
- 使用本地服务打开 `http://127.0.0.1:8767/site/home.html`，HTTP 200。
- 使用项目指定 Chrome 路径通过 Playwright 检查 `1440x900` 桌面首屏，并输出截图：`tools/qa/out/home-brief-layer-refine-final-1440.png`、`tools/qa/out/home-brief-layer-refine-final-crop.png`。
- Playwright 验证三块信息层位于首屏内，`.today-sea-brief` bottom 为 720，未被首屏裁切；页面 body class 为 `home-page hero-awakened`。
- Playwright 验证 `DIVE READING` 内层读数托盘、底部水线、`EXPLORATION` 的“海域阅读记录”标签、圆环透明度和 `SEA POSITION` 轻入口均命中本轮样式。
- Playwright 点击右侧轮播按钮，活动卡从“热浪岛”切换到“诗巴丹”，确认轮播按钮切换未受影响；页面保留 2 个深度计元素。

### 尚未验证

- 未做移动端专项验收；当前项目规则以桌面展示为准。
- 未逐一手动切换全部 14 个海域检查每组信息文案组合；本轮通过当前活动卡和一次按钮切换验证动态内容承接正常。
- Playwright 控制台仍捕获到一条浏览器泛化资源 404 文案，但 requestfailed 和 pageerror 均为空，首页关键资源、轮播和信息层检查未受影响。

## 2026-05-03 12:37

### 任务目的

- 只精修 `site/detail.html` 详情页的 Sea Atlas / 潜点位置、Sea Dossier / 海域档案和右侧 sticky 侧栏，消除 Sea Atlas 空蓝块感，提升档案可读性，并把右侧栏从商品购买卡收回到 Dive Brief / 海域入口档案语境。

### 改动文件

- `site/detail.html`
- `site/css/detail.css`
- `site/js/detail.js`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `site/detail.html` 重写了 Sea Atlas 区块标题和说明文案，加入首屏 first-paint 海图骨架，占位阶段就能看到海域轮廓、扫描感和路线提示；同时把右侧顶部价格区改成 `Dive Brief / Sea Layer 01 · Entry Plan` 语义，并把说明文案改成海图与进入节奏导向。
- 在 `site/js/detail.js` 只对详情页 Sea Atlas 做小幅增强：新增加载态海图板、fallback 海图板、图例 rail、快捷按钮、深度层与能见度文案；把真地图状态改成 `loading / ready / fallback` 三态；补充 4 个 waypoint 潜点标记，让正常态达到 6 个标记；同时把套餐列表高度测量的安全缓冲抬高，避免底部提示卡过早贴近上方深色卡片。
- 在 `site/css/detail.css` 末尾追加详情页覆盖样式：让 Sea Atlas 未唤醒前也有内容可看，不再出现空蓝块；强化 Sea Atlas loading / fallback / legend / dashed route / waypoint marker 的视觉；提高 Sea Dossier 卡片正文、编号、边框和天气卡的清晰度；弱化右侧 sticky 栏的商业购买感，压轻透明度、阴影和间距，让它更像随行档案条；并把 `itinerary-list` 与 `booking-note` 的底部间距再拉开，修正用户截图里的重叠感。
- 本次不影响 `depth-manager.js`、`depth-gauge.css`、`page-transition.css`、`home.html`、`index.html`、`trip.html`、Planner Desk，也没有改写 `localStorage / sessionStorage` 主状态逻辑；Sea Atlas 交互仍沿用现有 detail 页逻辑，只在详情页脚本内补状态层和展示信息。

### 验证方式

- 运行 `node --check site/js/detail.js`，通过。
- 运行 `git diff --check -- site/detail.html site/css/detail.css site/js/detail.js`，无空白错误；仅有 Git 的 LF/CRLF 提示。
- 从项目根目录启动 `python -m http.server 8766`，并确认 `http://127.0.0.1:8766/site/detail.html?id=1` 返回 HTTP 200。
- 使用项目规则指定的 Chrome 路径，通过 Playwright 桌面端验证详情页：
  `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe`
- Playwright 读取 Sea Atlas 早期态与稳定态：早期态 `hasLoading=true`，不再是空蓝块；稳定态 `stageState=ready`、`loadingOpacity=0`、`markerCount=6`，标记文案包含 `Barracuda Point`、`Turtle Patch`、`Coral Garden`、`Hanging Gardens`、`Whitetip Avenue` 与出发码头。
- 输出截图：
  `tools/qa/out/detail-after-sea-atlas-early-1440.png`
  `tools/qa/out/detail-after-sea-atlas-settled-1440.png`
  `tools/qa/out/detail-dossier-section-1440.png`
  `tools/qa/out/detail-reading-with-sidebar-settled-1440.png`
  `tools/qa/out/detail-sea-atlas-section-settled-1440.png`
  `tools/qa/out/detail-sidebar-overlap-bottom-fixed.png`
- Playwright 控制台仅捕获到 `http://127.0.0.1:8766/favicon.ico` 的 404，未发现 Sea Atlas 自身脚本报错或 page error；侧栏底部复测后，最后一张深色卡与 `booking-note` 的可视间距约为 `53px`。

### 尚未验证

- 未逐一手动切换所有潜点 id 检查每一张离线海图包；本轮动态验证基于 `detail.html?id=1` 的桌面端详情页。
- 未单独截图 Sea Atlas 的 fallback 分支；本轮主要验证了正常态与 loading 态，fallback 结构已接入但未人为制造离线包缺失场景逐帧检查。
- 未做移动端专项验收；按项目规则，本轮仍以桌面端展示为准。
本文件用于记录 Codex / AI 对盐憩项目做过的实际文件修改。

规则：

- 每次 AI 实际修改文件后，都必须在本文件顶部追加记录。
- 最新记录放最上方。
- 如果只是分析、查看、讨论方案，没有改动文件，可以不记录。
- 记录必须写清楚任务目的、改动文件、具体改动、验证方式和尚未验证内容。

---

## 2026-05-03 12:28

### 任务目的

- 小范围完成 `home.html` 首页“今日海域”首屏最后一轮细节小修，只处理 SEA POSITION 小地图投屏可读性、主卡图片阅读层、左右侧卡图片统一和 EXPLORATION 统计味弱化，不重构首页结构、不改动核心系统。

### 改动文件

- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `site/css/home.css` 末尾追加“今日海域：最后一轮投屏可读性小修”样式层，未继续改动 `home.html` 结构，未修改首页 JS。
- 轻微提亮并收紧 `SEA POSITION` 小海图：增强海图底色、网格、方位标记、海岸轮廓、等深线和主潜点可读性；辅助点继续保持更弱，路线线条保持轻，不改成雷达或科技连接图。
- 统一主卡图片阅读层：略微增强主卡图片对比度、饱和度和中下部暗部渐变，保证标题、描述、价格和评分在不同图片上稳定可读，但不整体压黑图片。
- 统一左右侧卡图片质感：降低灰糊感，保留后退层级，同时提高侧卡标题、描述、价格和评分的基础可读性。
- 弱化 EXPLORATION 的后台统计感：将进度辅助标签调整为“海层阅读”，降低环形进度的亮度和 KPI 感，保留探索数据但让它更像海域阅读记录。
- 本次未修改 `depth-manager.js`、`depth-gauge.css`、`page-transition.css`、localStorage/sessionStorage 状态逻辑、Sea Atlas、Planner Desk、行程页或详情页。

### 验证方式

- 运行 `git diff --check -- site/home.html site/css/home.css docs/AI_CHANGELOG.md`，无空白错误，仅有 Git 换行提示。
- 使用本地服务打开 `http://127.0.0.1:8767/site/home.html`，HTTP 200。
- 使用项目指定 Chrome 路径通过 Playwright 检查 `1440x900` 桌面首屏，并输出截图：`tools/qa/out/home-final-detail-polish-1440.png`、`tools/qa/out/home-final-detail-polish-maplet.png`。
- Playwright 检查小海图元素存在并可读：方位标记、比例尺、海岸轮廓、2 个岛屿层、3 条等深线、主潜点、辅助点和轻路线均存在。
- Playwright 点击右侧按钮两次，轮播标题依次从“皇帝岛”切换到“热浪岛”“诗巴丹”，确认按钮切换和卡片状态仍正常。
- Playwright 读取主卡和侧卡样式，确认主卡滤镜、遮罩透明度、侧卡滤镜、侧卡标题颜色、EXPLORATION 辅助标签和环形进度透明度均命中本轮样式。

### 尚未验证

- 未做移动端专项验收；当前项目规则以桌面展示为准。
- 未逐一手动切换全部 14 个海域逐张审图；本轮通过多次轮播和样式读取验证图片遮罩与文字可读性规则已统一生效。
- Playwright 控制台捕获到一条浏览器泛化资源 404 文案，但 request/response 捕获未发现对应 404 URL，页面关键资源、轮播和小海图检查未受影响。

## 2026-05-03 01:23

### 任务目的

- 对 `site/index.html` 登录入口页做最后一轮小范围验收微调，只增强投屏可读性、玻璃层次、输入框三态、Entrance Progress 清晰度和入口按钮反馈，不重构页面、不更换“深海玻璃拟态静水入口控制台”方向。

### 改动文件

- `site/css/login.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `login.css` 末尾追加终验投屏可读性微调层；未修改 `index.html` 结构，未修改 `site/js/auth.js`。
- 轻微提高大玻璃入口舱边框高光、内部暗部和顶部水光线，让内容和背景分离更清楚，但保持深海低亮度与轻玻璃感。
- 提升左侧 `Archive / 静海档案` 的右侧文字、分隔线、小发光点和水纹底线可读性，让档案卡更像静海记录，不新增内容、不加厚面板。
- 强化 `Entrance Progress` 的轨道、填充、百分比和说明文字可读性，使进度联动更像重要入口反馈而不是淡装饰线。
- 微调右侧表单区域向上收 8px 到 12px；提高 label、placeholder、输入框边框和 filled/focus 状态的投屏识别度。
- 保留 `进入首页主线` 按钮文案，增强 hover 的轻微前推与光晕，active 的下潜/压入反馈；未改变登录跳转逻辑。
- 未修改 `depth-manager.js`、`depth-gauge.css`、`page-transition.css`、首页/行程/详情页、Planner Desk、Sea Atlas 或 localStorage/sessionStorage 主状态逻辑。

### 验证方式

- 运行 `git diff --check -- site/css/login.css docs/AI_CHANGELOG.md`，无空白错误，仅有 Git 换行提示。
- 运行 `node --check site/js/auth.js`，通过；本轮未修改 `auth.js`。
- 通过 `Invoke-WebRequest http://127.0.0.1:8766/site/index.html` 确认本地页面 HTTP 200。
- 使用项目指定 Chrome 路径以 Playwright 打开 `http://127.0.0.1:8766/site/index.html`，验证 `1366x768` 桌面视口下无横向/纵向溢出，主玻璃舱、左侧档案卡、Entrance Progress、右侧表单、登录/注册按钮均完整在首屏内。
- 验证登录 / 注册切换正常，注册态按钮完整可见，底部未被裁切。
- 验证输入框默认态干净无 invalid class；手机号和通行密钥 focus / filled 均有边框、背景和完成感变化。
- 验证 Entrance Progress 联动：空状态 `0`，手机号后 `35`，密钥后 `65`，勾选记住号码后 `77`，等待完成后 `100`，文案同步更新。
- 验证按钮 hover / active：hover 命中 `:hover` 并产生轻微前推，active 命中 `:active` 并产生压入反馈。
- 使用测试账号点击登录后约 5.6 秒进入 `home.html`，最终 body class 为 `home-page hero-awakened`。

### 尚未验证

- 未做移动端专项验收；当前项目规则以桌面展示为准。
- 未运行全站性能脚本或详情页/行程页 smoke；本轮只改登录页 CSS，未触碰其他页面系统。
- Playwright 控制台仍捕获到一条资源 404 文本，但无 pageErrors，登录页交互和跳转未受影响。

## 2026-05-03 01:21

### 任务目的

- 小范围继续精修首页 `home.html` 首屏 `SEA POSITION` 小地图，让它从“抽象科技图标 / 节点扫描图”更接近盐憩的海域小海图、离线海图缩略视图和潜点位置图。

### 改动文件

- `site/home.html`
- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `home.html` 的 `.today-sea-maplet` 内新增方位 `NE` 和轻比例尺图层，增强小海图的方位/坐标感；没有改 SEA POSITION 外层结构。
- 在 `home.css` 中继续收束小海图样式：弱化中心十字网格、扫描圆环和双点同级发光；将主点改为更克制的当前潜点，辅助点改为低亮度参考点。
- 将原本偏亮的弧线改为更细、更淡、有轻微方向感的潜游路线/海流线，降低科技连接线感。
- 保留并调整海岸线、岛屿、等深线、海图网格、玻璃档案外框，使小地图投屏时能看出海域缩略图而不抢主卡。
- 本次未修改首页 JS；未修改 `depth-manager.js`、`depth-gauge.css`、`page-transition.css`、Planner Desk、Sea Atlas 或 localStorage/sessionStorage 状态逻辑。

### 验证方式

- 运行 `git diff --check -- site/home.html site/css/home.css docs/AI_CHANGELOG.md`，无空白错误，仅提示相关文件下次 Git 接触时 LF 会转为 CRLF。
- 使用项目指定 Chrome 路径打开 `http://127.0.0.1:8766/site/home.html`，检查 1440×900 桌面首屏。
- Playwright 截图输出：`tools/qa/out/home-sea-position-maplet-refine-1440.png`、`tools/qa/out/home-sea-position-maplet-refine-crop.png`。
- Playwright 验证小地图存在方位、比例尺、海岸线、2 个岛屿、3 条等深线、路线和潜点标记；按钮切换从“皇帝岛”到“热浪岛”正常。

### 尚未验证

- 未做移动端专项验收；按项目规则当前仍以桌面端展示为准。
- 未逐一切换 14 个海域检查所有内容组合；本轮重点验证小地图视觉和首页轮播按钮不受影响。

## 2026-05-03 01:15

### 任务目的

- 小范围精修 `site/index.html` 登录入口页，不重构、不换风格；在现有“深海玻璃拟态静水入口控制台”基础上，补强玻璃入口舱层次、左侧静海档案、Entrance Progress、输入框三态、入口按钮动作和右侧表单间距。

### 改动文件

- `site/css/login.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `login.css` 末尾追加最终展示微调层；未修改 `index.html` 结构，未修改 `site/js/auth.js`。
- 入口大玻璃舱增强边框高光、顶部水光线、内部暗部和纹理层，让内容与背景分离更清楚，但保持低亮度、轻玻璃和深海感。
- 左侧 `Archive / 静海档案` 增强细边框、标题横线、条目分隔、小圆点发光和右侧文字字重，让它更像轻档案卡。
- Entrance Progress 提升轨道边界、刻度感、百分比和状态文案可读性，填充状态更明显但仍保持静水入口语气。
- 输入框 default / focus / filled 三态微调：default 更清楚但低亮，focus 边框与水光增强，filled 增加轻微完成感；手机号和密钥输入框同样适用。
- 登录按钮继续保留 `进入首页主线` 文案，增强 hover 的轻微前推、水光扫过和箭头移动，active 保留下潜/压入反馈；未改变跳转逻辑。
- 右侧表单微调内边距和局部间距，让中部空间更稳定但不新增文案。
- 未修改 `site/js/depth-manager.js`、`site/css/depth-gauge.css`、`site/css/page-transition.css`、首页/行程/详情页、Planner Desk、Sea Atlas 或 localStorage/sessionStorage 主状态逻辑。

### 验证方式

- 运行 `git diff --check -- site/css/login.css docs/AI_CHANGELOG.md`，无空白错误，仅有 Git 换行提示。
- 运行 `node --check site/js/auth.js`，通过；本轮未修改 `auth.js`。
- 使用项目指定 Chrome 路径打开 `http://127.0.0.1:8766/site/index.html` 做 Playwright 动态检查。
- 检查 `1366x768` 登录态：无横向/纵向溢出，主玻璃舱完整在首屏，左侧档案卡、Entrance Progress、右侧表单和按钮均完整可见。
- 检查登录/注册切换：注册态按钮可见，底部未裁切，Entrance Progress 仍完整显示。
- 检查输入框三态：手机号和密钥 default / focus / filled 均有不同边框和背景反馈。
- 检查 Entrance Progress 联动：初始 `0`，手机号后 `35`，密钥后 `65`，勾选记住号码后 `77`，等待后 `100`，文案同步更新。
- 检查按钮 hover / active：hover 命中 `:hover`，`translate` 约 `4.8px -1.9px`、`scale` 约 `1.006`；active 命中 `:active`，`translate` 约 `4.1px 2.7px`、`scale` 约 `0.993`。
- 使用测试账号点击登录后约 5.6 秒进入 `home.html`，最终 body class 为 `home-page hero-awakened`。

### 尚未验证

- 未做移动端专项验收；当前项目规则以桌面端展示为主。
- 未运行全站性能脚本和详情页 smoke；本轮只精修登录入口页 CSS，未触碰其他页面系统。
- HTTP Playwright 验证时仍出现一条资源 404 console 文本；页面无 pageErrors，登录页交互和跳转未受影响。

## 2026-05-03 00:59

### 任务目的

- 只修首页 `home.html` 首屏“今日海域”底部 `SEA POSITION` 小地图显示问题，让它从抽象发光块更像盐憩海域档案小海图，同时不影响轮播、拖拽、深度计、页面过渡、本地状态或 Sea Atlas。

### 改动文件

- `site/home.html`
- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `home.html` 的 `.today-sea-maplet` 内补充海图专用图层：三条等深线、海岸线、主岛屿和小岛屿；未改今日海域整体结构，也未改首页 JS。
- 在 `home.css` 末尾追加 `Sea Position 小海图修正` 样式层：提亮小地图底色，加入淡海图网格、等深线、海岸边缘、岛屿描边、细航线弧线、发光定位点和玻璃档案外框。
- 小地图仍为纯 HTML/CSS 装饰海图，没有引入外部地图 API、图片或新依赖。
- 本次未修改 `site/js/depth-manager.js`、`site/css/depth-gauge.css`、`site/css/page-transition.css`、Planner Desk、Sea Atlas 或本地状态逻辑。

### 验证方式

- 运行 `git diff --check -- site/home.html site/css/home.css docs/AI_CHANGELOG.md`，无空白错误，仅提示相关文件下次 Git 接触时 LF 会转为 CRLF。
- 使用项目指定 Chrome 路径检查 `http://127.0.0.1:8766/site/home.html` 的 1440×900 桌面首屏。
- Playwright 截图输出：`tools/qa/out/home-sea-position-maplet-fix-1440-settled.png`、`tools/qa/out/home-sea-position-maplet-fix-crop-v3.png`。
- Playwright 验证 `.today-sea-maplet` 内存在海岸线、2 个岛屿、3 条等深线、航线和定位点；按钮切换从“皇帝岛”到“热浪岛”正常，说明首页轮播未受影响。

### 尚未验证

- 未做移动端专项验收；按项目规则当前仍以桌面端展示为准。
- 未逐一切换 14 个海域检查每个小地图文案组合；本轮重点验证了小地图视觉图层和首页轮播按钮不受影响。

## 2026-05-03 00:58

### 任务目的

- 只精修 `site/index.html` 登录入口页当前“深海玻璃拟态静水入口控制台”方向，不重做结构；重点强化左侧 `Archive / 静海档案`、提高 Entrance Progress 可读性、让主按钮更像进入首页主线的入口动作，并让背景海面细节稍微透出但不抢内容。

### 改动文件

- `site/css/login.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `login.css` 末尾追加“入口档案与进度抛光层”，没有改动 `site/index.html` 结构，也没有改动 `site/js/auth.js`。
- 轻微提高背景图可见度：降低背景遮罩压暗强度，提升背景图 brightness/contrast/saturate，让海面与海岛轮廓稍微参与画面，同时保留四周暗部和顶部克制光束。
- 强化左侧 `Archive / 静海档案`：提升轻玻璃边框、内侧反光、标题横线、条目分隔、小圆点和条目文字层级，让它更像品牌档案卡而不是普通文字列表。
- 强化 Entrance Progress：加清楚轨道边界、微光、填充亮度、`0%` 数字和状态文案可读性；保留静水入口语气，不改成普通下载进度条。
- 优化 `进入首页主线` 按钮：默认态改为更柔和的浅青蓝到深海蓝渐变，hover 增强克制边缘光和前推感，active 保留下潜/压入反馈。
- 本次未修改 `site/js/depth-manager.js`、`site/css/depth-gauge.css`、`site/css/page-transition.css`、首页/行程/详情页、Planner Desk 或 Sea Atlas；未新增依赖，未改变 localStorage/sessionStorage 状态逻辑。

### 验证方式

- 运行 `git diff --check -- site/css/login.css docs/AI_CHANGELOG.md`，无空白错误，仅有 Git 换行提示。
- 运行 `node --check site/js/auth.js`，通过；本轮未修改 `auth.js`。
- 使用项目指定 Chrome 路径进行 Playwright 动态验证，访问 `http://127.0.0.1:8766/site/index.html`。
- Playwright 在 `1366x768` 桌面视口检查登录态：页面无横向/纵向溢出，主舱约 `1038x600`，玻璃舱完整在首屏内；左侧档案卡和 Entrance Progress 完整显示。
- Playwright 检查注册态：注册按钮、底部辅助链接、Entrance Progress 均完整可见，无裁切。
- Playwright 检查进度联动：初始 `0`，输入手机号后 `35`，输入密码后 `65`，勾选记住我后 `77`，等待完成后 `100`；对应文案正常更新。
- Playwright 检查按钮状态：hover 命中 `:hover`，`translate` 约 `4.8px -1.9px`、`scale` 约 `1.006`；active 命中 `:active`，`translate` 约 `4.1px 2.6px`、`scale` 约 `0.993`。
- 使用测试账号点击登录按钮后，约 5.6 秒进入 `home.html`，最终 body class 为 `home-page hero-awakened`。

### 尚未验证

- 未做移动端专项验收；当前项目规则以桌面端体验为主。
- 未运行全站性能脚本或详情页 smoke；本轮按任务范围只精修登录页 CSS，未触碰详情页、Sea Atlas 或其他页面。

## 2026-05-03 00:55

### 任务目的

- 根据新录屏继续修复 `site/home.html` 桌面端滚动手感：减少滚动中的卡顿、滚动停止后组件恢复造成的轻微抖动，并解决鼠标停在“海域陈列”大卡、文案标签区、右侧样本栏或右侧按钮时页面偶发滑不动的问题。

### 改动文件

- `site/js/home.js`
- `site/css/home.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `home.js` 增加 `home-scroll-restoring` 的短暂恢复态：`home-scroll-active` 退出后先冻结一小段 transition / animation，再回到完整视觉状态，避免滚动结束那一下组件阴影、滤镜和深度计视觉同时恢复导致抖动。
- 扩展首页滚轮兜底范围：把 `.curated-waters-stage`、`.curated-display`、`.curated-display-surface`、`.curated-nav-rail` 纳入纵向滚轮透传判断；如果浏览器原生滚动链下一帧没有推进页面，则用同一段 `deltaY` 补一次页面滚动，不主动 `preventDefault`。
- 在 `home.css` 将 `.curated-nav-rail` 从内部 `overflow-y: auto` 改为 `overflow-y: hidden` 并设置 `overscroll-behavior-y: none`，让右侧样本栏不再消费鼠标滚轮，保留它作为海域样本导航而不是内部滚动容器。
- 收敛滚动降载退出时的视觉切换：移除新增大范围规则中的 `filter/backdrop-filter/box-shadow` 强制切换，只保留暂停动画、关闭 transition 和清理 will-change；新增 `home-scroll-restoring` 对关键首页组件和伪元素的恢复期 transition 冻结。
- 为 `CuratedWatersStage` 和 `DiveMatchStage` 增加滚动空闲调度：模块显现、舞台展开和 Dive Match 展示层的重动画在滚动活跃或恢复期内暂缓，滚动停稳后再一次性补齐，减少进入后续组件时的主线程峰值。
- 本次不改 URL、HTML 数据结构、localStorage/sessionStorage key、跨页导航语义或 Sea Atlas；深度计共享逻辑 `depth-manager.js` 未在本次跟进中继续改动。

### 验证方式

- 运行 `node --check site/js/home.js`，通过。
- 运行 `node --check site/js/depth-manager.js`，通过。
- 运行 `git diff --check`，无空白错误；仅提示部分工作区文件下次 Git 接触时会由 LF 转为 CRLF。
- 使用项目指定 Chrome 路径打开 `http://127.0.0.1:8766/site/home.html` 做 Playwright 桌面验证：在 `1440x900` 视口把鼠标停在海域陈列大卡、文案标签区、右侧样本栏、右侧样本按钮上滚动，`wheelPrevented=0`，页面分别推进约 `1469px-1729px`，右侧栏 `scrollTop` 始终为 `0`。
- 使用同一 Chrome 在 `2048x921` 视口复测海域陈列大卡、右侧样本栏和右侧按钮，页面分别推进约 `1272px-1356px`，`wheelPrevented=0`，恢复后 `home-scroll-active=false` 且 `home-scroll-restoring=false`。
- 滚动状态时间线验证：滚轮后进入 `home-scroll-active`，停止后短暂进入 `home-scroll-restoring`，随后回到 `normal`；海域陈列和 Dive Match 停稳后均补齐显现状态与卡片内容。
- Performance 探针复测连续滚轮：滚轮未被阻止，`scrollY` 从顶部持续推进到页面底部；延后显现后原先进入 Dive Match 时约 `199ms` 的长峰值不再出现，剩余少量约 `50-70ms` 绘制/调度峰值。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，index/home/trip/contact 在 1440、1920、2560 视口均无 missingSelectors、consoleErrors、pageErrors。
- 运行 `npm.cmd --prefix tools\qa run perf:detail`，详情页 `detail.html?id=1`、Leaflet、Sea Atlas pack、全屏地图、套餐/评论/相关推荐 smoke 检查通过。

### 尚未验证

- 未做移动端专项验证；按项目规则，本次仍只处理桌面端体验。
- 自动化 Performance 探针仍能观察到少量 `50-70ms` 绘制/调度峰值和若干 rAF 间隔峰值；它们不再表现为滚轮被拦截或 `scrollY` 卡住，但如果后续要继续压低绘制峰值，需要单独做首页大面积滤镜、图片解码和 Dive Match 视觉层的专项预算。
- HTTP 动态探针中 Chrome 仍输出过一条泛化的 `Failed to load resource: 404` 控制台文本，脚本未捕获到对应 4xx response；`perf:pages` 文件模式回归未记录 consoleErrors / pageErrors。

## 2026-05-03 00:47

### 任务目的

- 继续精修 `site/index.html` 登录入口页的视觉落地，不重做结构，只按第 4 张参考图方向做“更轻、更透、更安静”的减重微调：弱化左右硬切、化开右侧套娃感、增强左侧静海档案和 Entrance Progress 可读性、提升输入框三态辨识度，并减少大气泡灰尘感。

### 改动文件

- `site/css/login.css`
- `docs/AI_CHANGELOG.md`

### 具体改动

- 在 `login.css` 末尾追加第 4 张参考图精修覆盖层，压低背景大面积白雾，保留顶部集中光束和四周暗角，让背景海面更参与而不是被厚玻璃整块盖住。
- 进一步减轻主玻璃舱：降低玻璃背景不透明度、缩小外发光和阴影权重、细化边框高光与反光层，使外舱更像轻盈静水舱而不是厚塑料盒。
- 弱化左右分割：把中线 opacity 降到更低，降低左右底色差异，右侧不再像独立深色板，左右通过微弱渐变和雾化连成同一个静水空间。
- 化开右侧 Entrance Console 的内层大面板：`auth-panel-shell` 去掉可见边框、背景和阴影，只保留控件自身的轻阅读层，减少后台控制台套娃感。
- 强化左侧 `Archive / 静海档案`：轻微提高档案卡边界、标题分隔线和条目文字权重，同时保持轻薄；Entrance Progress 的标题、数值、轨道和文案提升可读性。
- 提升输入框 default / focus / filled / complete 状态：label、placeholder、边框、背景和微光更清楚，focus 与 filled 状态更容易投屏识别，但没有变成高亮霓虹。
- 减少背景大气泡：缩小 ripple 尺寸和透明度，隐藏几颗较大的上浮粒子，把气泡感改成更细小的漂浮颗粒，避免像屏幕灰尘。
- 本次未修改 `site/index.html` 结构，未修改 `site/js/auth.js`，未触碰 `site/js/depth-manager.js`、`site/css/depth-gauge.css`、`site/css/page-transition.css`；不改变登录跳转、本地账号存储、进度联动或 Sea Atlas。

### 验证方式

- 运行 `node --check site/js/auth.js`，通过。
- 运行 `git diff --check -- site/css/login.css site/index.html site/js/auth.js docs/AI_CHANGELOG.md`，无空白错误。
- 使用项目规则指定 Chrome 路径 `C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe` 进行 Playwright 动态检查。
- 重新启动本地服务 `python -m http.server 8766 --bind 127.0.0.1`，访问 `http://127.0.0.1:8766/site/index.html` 返回 200。
- Playwright 检查 `1366x768`、`1440x900`、`1920x1080` 登录态和注册态：页面无横向/纵向溢出，玻璃舱完整在首屏内，登录按钮、底部辅助链接和 Entrance Progress 均完整可见。
- Playwright 测量：1366 视口下主舱约 `1038x600`，玻璃背景降低到 `rgba(3, 19, 34, 0.14)`，中线 opacity 约 `0.11`，右侧 auth shell 背景/边框/阴影均为透明或 none。
- Playwright 截图输出：`tools/qa/out/login-v4-polish-login-1366x768.png`、`tools/qa/out/login-v4-polish-register-1366x768.png`，以及 1440/1920 对应截图。
- Playwright 检查输入与进度联动：默认 `0%`；手机号后 `aria-valuenow=35`，文案为“静水已经记住你的号码。”；密码后 `65`；勾选记住我后 `77`；等待后 `100%`，文案为“可以沿这层静水继续进入首页主线。”。
- Playwright 检查输入框三态：default 边框为 `rgba(221, 244, 252, 0.24)`；focus 边框提升到约 `rgba(190, 237, 250, 0.53)` 并出现克制外光；filled/complete 添加 `is-filled is-complete`，边框提升到约 `rgba(196, 238, 250, 0.48)`。
- Playwright 检查按钮 hover / active：hover 匹配 `:hover` 且 `translate` 约 `5px -2px`、`scale` 约 `1.006`；active 匹配 `:active` 且 `translate` 约 `4px 3px`、`scale` 约 `0.992`；使用测试账号点击后约 5.6 秒到达 `home.html`，最终 body class 为 `home-page hero-awakened`。
- 运行 `npm.cmd --prefix tools\qa run perf:pages`，index/home/trip/contact 在 1440/1920/2560 视口均无 missingSelectors、consoleErrors、pageErrors。

### 尚未验证

- 未做移动端专项验收；当前项目规则要求本阶段以桌面端体验为主。
- 本轮没有重新运行 `perf:detail`，因为只改登录页 CSS，未触碰详情页或 Sea Atlas。
- HTTP Playwright 在 1366 动态验证时仍可见一条浏览器资源 404 提示，`perf:pages` 的 file smoke 未记录 consoleErrors/pageErrors，页面行为和本次 CSS 修改未发现异常。

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
