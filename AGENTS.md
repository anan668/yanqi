# 盐憩项目 AI 协作规则 / AGENTS.md

本文件是给 Codex / AI 助手 / 后续维护者看的长期规则。
每次开始修改项目之前，必须先阅读本文件，再阅读 `README.md`，最后查看 `docs/AI_CHANGELOG.md` 最近 3～5 条记录。

---

## 1. 项目基本定位

项目名称：盐憩 / YANQI
项目仓库：https://github.com/anan668/yanqi
项目类型：潜水旅游主题多页面前端项目。

当前开发范围：只做桌面端体验。
后续 AI / Codex 对话不要主动扩展移动端适配，也不要把移动端问题列为当前必须修复项；除非用户明确提出移动端任务，否则所有视觉、交互、动态验证和验收优先以桌面端为准。

盐憩不是普通旅游信息站，不是电商预订站，不是后台管理系统，也不是普通工具平台。

它是一个围绕：

- 进入海
- 理解海
- 把海收进行程
- 在不同海层之间缓慢移动

建立起来的沉浸式前端作品。

项目核心气质：

- 深海
- 安静
- 高级
- 舒缓
- 沉浸
- 有呼吸感
- 海层叙事
- 空间层级
- 品牌体验

任何修改都必须服务于这个方向。

---

## 2. 页面层级关系

页面不是普通平级导航，而是海层关系。

### `site/index.html`

角色：潜前门厅 / 静水入口。
作用：让用户先进入盐憩的氛围，再登录、注册或先逛逛。
禁止改成普通登录页、后台登录页、SaaS 登录页。

### `site/home.html`

角色：海面第一层。
作用：先让用户看海、被海吸引，再进入目的地、Dive Match 和品牌故事。
禁止改成普通旅游首页或普通 landing page。

### `site/trip.html`

角色：更深一层的规划空间。
作用：通过 Planner Desk、摘要、已收进行程和准备系统，把一片海慢慢收进行程。
禁止改成普通搜索页、表单页、订单页。

### `site/detail.html`

角色：进入某一片具体海域。
作用：让用户读懂海域、查看 Sea Atlas、评论、套餐和相关推荐。
禁止改成普通景点详情页或电商商品详情页。

### `site/contact.html` / `site/terms.html` / `site/privacy.html`

角色：更浅、更静的说明层。
作用：提供联系、协议、隐私说明，但仍要留在盐憩的世界观里。
禁止退回普通白底文档页。

---

## 3. 视觉风格规则

视觉语言优先使用：

- 深海蓝
- 海盐白
- 低饱和青蓝
- 玻璃感
- 雾感
- 柔和模糊
- 微发光
- 充足留白
- 慢节奏动效

禁止使用：

- 高饱和旅游网站风格
- 电商促销风
- 后台系统风
- 普通 SaaS 模板风
- 夸张赛博科技风
- 廉价炫光风
- 过度 3D 效果
- 生硬弹簧动画

如果某个模块看起来像普通模板，需要继续调整到“盐憩”的世界观里。

---

## 4. 文案规则

文案必须保持：

- 安静
- 克制
- 有海洋画面感
- 不营销
- 不平台腔
- 不培训系统腔
- 不电商腔

避免使用：

- 立即下单
- 爆款推荐
- 全球领先
- 专业保障
- 高效筛选
- 一站式平台
- 智能解决方案
- 开启旅程

更适合盐憩的表达：

- 慢慢进入
- 慢慢排开
- 慢慢收住
- 把这片海收进行程
- 更适合你的那一片海
- 这层静水会记住你
- 沿这层静水继续进入首页主线
- 海的节奏
- 停驻感
- 呼吸感

---

## 5. 核心系统不能破坏

以下系统是项目核心，禁止随便删除、绕开或另起一套。

### 5.1 深度计系统

相关文件：

- `site/js/depth-manager.js`
- `site/css/depth-gauge.css`
- `site/css/page-transition.css`

深度计不是装饰，而是整站空间语言。
页面滚动、跨页跳转、模块切换、弹层打开，都应该优先考虑是否需要和深度计联动。

禁止把深度计改成纯视觉摆件。

### 5.2 跨页过渡系统

主系统是：

- `site/css/page-transition.css`
- `site/js/depth-manager.js`

不要重新写一套割裂的页面过渡系统。
如果需要优化，优先在现有系统上增强。

页面切换语义：

- `index -> home`：从岸上进入海面
- `home -> trip`：继续下潜
- `trip -> home`：缓慢上浮
- `detail -> detail`：在相邻海域之间平移潜游
- 信息页返回主线：从说明水域回到主海层

### 5.3 Planner Desk

相关文件：

- `site/trip.html`
- `site/css/trip.css`
- `site/js/trip.js`
- `site/js/yanqi-trip-store.js`

Planner Desk 不是普通搜索栏，也不是普通表单。
它是“把海域、日期、同行人数慢慢写进行程”的规划控制台。

禁止退回普通 input / select / date 表单风格。

### 5.4 Sea Atlas

相关文件：

- `site/detail.html`
- `site/css/detail.css`
- `site/js/detail.js`
- `site/js/yanqi-spot-map-catalog.js`
- `site/assets/maps/packs/`
- `tools/maps/generate-sea-atlas-tiles.py`

Sea Atlas 不是普通地图占位，也不是截图。
它是详情页的核心展示模块，包含离线海图、路线、海域结构和水下剖面语义。

不要轻易删除地图懒加载、离线 pack、三态视图和相关说明结构。

### 5.5 本地状态系统

项目当前是纯前端站点，状态主要使用：

- `localStorage`
- `sessionStorage`

用途包括：

- 行程草稿
- 已确认套餐
- 跨页深度状态
- 页面过渡状态
- 展示态数据

修改状态逻辑时必须注意跨页连续性。

---

## 6. 组件改造原则

以下组件不能退回普通网页范式：

- 表单
- 搜索栏
- 推荐区
- 地图区
- 页脚
- 悬浮导航
- 弹窗 / 浮层
- 评论区
- 详情页侧栏
- 联系页留言区
- 信息页目录

如果它看起来像：

- 普通搜索框
- 普通推荐卡
- 普通地图占位
- 普通下拉框
- 普通回到顶部按钮
- 普通页脚
- 普通客服表单
- 普通协议文档

就需要继续调整，直到它回到“盐憩”的语境里。

---

## 7. 代码修改原则

### 7.1 不要大拆

除非用户明确要求重构，否则不要大规模重写项目结构。
优先小步改进、局部增强、保持现有文件关系。

### 7.2 不要引入重型依赖

项目以原生 HTML / CSS / JavaScript 为主。
不要为了一个小效果引入重型框架或复杂依赖。

### 7.3 保持命名清晰

新增 class、函数、状态名要能看出语义，例如：

- `is-filled`
- `is-reading-current`
- `trip-depth-entry-released`
- `updateEntranceProgress`
- `syncAuthFieldState`
- `bindPlannerFieldState`

不要使用无意义命名，例如：

- `box1`
- `newStyle`
- `test2`
- `aaa`
- `fix-final-final`

### 7.4 修改 CSS 时注意层级

优先遵循现有文件分层：

- 全站变量和公共底盘：`site/css/global.css`
- 登录页：`site/css/login.css`
- 首页：`site/css/home.css`
- 行程页：`site/css/trip.css`
- 详情页：`site/css/detail.css`
- 信息页：`site/css/info-pages.css`
- 深度计：`site/css/depth-gauge.css`
- 跨页过渡：`site/css/page-transition.css`

不要把某一页专属样式随便写进全局文件。

### 7.5 修改 JS 时注意页面作用域

不要让某个页面的逻辑影响其他页面。
如果脚本是全站共享的，必须先确认其他页面是否依赖。

---

## 8. 动态调试工具位置

本项目动态调试、截图检查、Playwright 浏览器调试时，优先使用以下本地 Chrome 工具目录：

```text
C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64
```

通常可执行文件路径为：

```text
C:\Users\桉桉\Desktop\_文件夹分类_2026-04-29\AI与提示词\ai工具\playwright-browser\chrome-win64\chrome.exe
```

如果使用 Playwright，请优先指定该浏览器路径，例如：

```js
const { chromium } = require('playwright');

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\桉桉\\Desktop\\_文件夹分类_2026-04-29\\AI与提示词\\ai工具\\playwright-browser\\chrome-win64\\chrome.exe',
  headless: false
});
```

如果该路径无法启动，必须在输出中说明原因。
不要在未说明原因的情况下随便换浏览器、换路径或跳过动态验证。

---

## 9. 运行方式

推荐本地运行：

```bash
python -m http.server 8000
```

然后访问：

```text
http://localhost:8000/site/
```

如果当前工作目录不是项目根目录，请先切到项目根目录。

如果需要指定端口，也可以使用：

```bash
python -m http.server 8766
```

然后访问：

```text
http://localhost:8766/site/
```

如果项目根目录没有 `site/` 目录，必须先检查当前项目结构，不要盲目改路径。

---

## 10. 常用验证命令

修改 JS 后，至少运行对应文件检查：

```bash
node --check site/js/auth.js
node --check site/js/home.js
node --check site/js/trip.js
node --check site/js/detail.js
node --check site/js/depth-manager.js
```

修改 CSS / JS 后，尽量运行：

```bash
git diff --check
```

如果项目 QA 依赖可用，可以运行：

```bash
npm run perf:pages
npm run perf:detail
```

如果项目 QA 脚本在 `tools/qa` 目录下，需要根据实际情况进入对应目录后运行：

```bash
cd tools/qa
npm install
npm run perf:pages
npm run perf:detail
```

如果没有安装依赖、命令不存在、浏览器无法启动，必须在输出里说明“未验证原因”。

---

## 11. 每次修改都必须写入记录文件

每一次 AI / Codex 对项目做出实际文件修改后，都必须把修改记录写入：

```text
docs/AI_CHANGELOG.md
```

如果该文件不存在，必须自动创建。

不要只在聊天窗口里说“已修改”。
必须把修改历史写进 `docs/AI_CHANGELOG.md`，方便下一个 AI 窗口继续接手。

### 记录格式

每次修改后，在 `docs/AI_CHANGELOG.md` 顶部追加一条：

```md
## YYYY-MM-DD HH:mm

### 任务目的

- 本次为什么修改。

### 改动文件

- `site/xxx.html`
- `site/css/xxx.css`
- `site/js/xxx.js`

### 具体改动

- 改了什么结构。
- 改了什么样式。
- 改了什么交互。
- 是否影响深度计、页面过渡、本地状态或 Sea Atlas。

### 验证方式

- 运行了哪些命令。
- 用 Playwright / Chrome 检查了哪些页面。
- 是否有截图输出。
- 是否有控制台错误。

### 尚未验证

- 如果某些内容没验证，写清楚原因。
```

### 记录要求

- 最新记录放在最上方。
- 每次实际修改都必须记录。
- 如果只是查看、分析、讨论方案，没有改动文件，可以不写。
- 记录必须写清楚，不要只写“优化 UI”“修复问题”。
- 如果动态调试失败，也要写入失败原因。

---

## 12. 修改前必须先检查

每次 Codex 开始任务前，先做这几件事：

1. 阅读 `AGENTS.md`
2. 阅读 `README.md`
3. 查看 `docs/AI_CHANGELOG.md` 最近 3～5 条记录
4. 确认这次任务涉及哪些页面和文件
5. 先查现有结构，不要凭空重写
6. 确认是否会影响深度计、跨页过渡、状态存储或 Sea Atlas

---

## 13. 输出格式

每次完成任务后，聊天输出必须包含：

1. 改了哪些文件
2. 每个文件改了什么
3. 为什么这样改
4. 如何验证
5. 哪些地方没有验证
6. 是否影响深度计 / 页面过渡 / 本地状态 / Sea Atlas
7. 是否已经写入 `docs/AI_CHANGELOG.md`

不要只写：

- 已优化
- 已修复
- 已完成

必须写清楚具体改动。

---

## 14. 长期判断标准

如果一次修改完成后，用户看到它更像：

- 在同一片海里继续下潜
- 在不同海域之间缓慢移动
- 在网页里感受到海的深浅、停驻和余韵
- 功能被自然收进盐憩的世界观
- 页面更安静、更完整、更有品牌感

那么这个方向通常是正确的。

如果它更像：

- 普通旅游网站
- 商品列表页
- 后台管理页面
- 通用 UI 模板
- 高饱和科技网页
- 普通表单 / 普通推荐 / 普通地图

那么这个方向通常需要继续调整。
