# 盐憩

> 一个把“潜水旅行”做成海层体验的前端网页项目。

如果你第一次打开这个仓库，先记住一句话：

盐憩不是普通旅游网站，也不是后台式预订系统。它更像一片被拆成不同深度层级的海。用户会先经过登录门厅，再进入首页这层较浅的海面，随后继续下潜到行程页和详情页，在浏览、选择、确认之间慢慢靠近一片海。

这份 `README.md` 现在就是项目的长版说明文档。它不只是介绍“项目做了什么”，也会尽量把“代码应该怎么看”讲清楚，适合：

- 上传 GitHub 时作为仓库首页说明
- 老师、同学、面试官快速理解项目
- 自己回头复盘时按文件重新学习代码
- 刚接触前端时，用一个完整项目练习 `HTML + CSS + JavaScript`

## 项目定位

- 品牌名：盐憩
- 项目类型：潜水旅游主题前端网页项目
- 核心体验：让用户像在同一片海里缓慢移动，而不是在几张普通网页之间生硬跳转
- 关键词：深海、安静、高级、舒缓、沉浸、呼吸感、玻璃感、雾感

这个项目最重要的不是“功能堆了多少”，而是下面这件事有没有成立：

用户会不会感觉自己在继续下潜。

如果一个模块只是“能用”，但看起来像普通旅游网站、普通后台、普通电商，那它在盐憩里就还没有完全成立。

## 一句话看懂页面关系

盐憩的页面关系不是平级导航，而是海层关系：

- `index.html`：潜前门厅，进入盐憩之前的一层静水
- `home.html`：浅层入口，先看海、先被海吸引
- `trip.html`：更深一层的规划空间，把海慢慢收进行程
- `detail.html`：真正进入一片具体海域
- `contact.html` / `terms.html` / `privacy.html`：更浅、更静的信息说明层

对应的页面切换也不是普通跳转，而是：

- `index -> home`：从门厅进入海面
- `home -> trip`：继续下潜
- `trip -> home`：缓慢上浮
- `detail -> detail`：在相邻海域之间潜游和平移

## 先从哪里开始看

如果你想最快理解项目，建议按这个顺序：

1. 先看 `home.html`、`css/home.css`、`js/home.js`
2. 再看 `js/depth-manager.js`
3. 再看 `trip.html`、`css/trip.css`、`js/trip.js`
4. 再看 `js/yanqi-trip-store.js`
5. 最后看 `detail.html`、`css/detail.css`、`js/detail.js`

为什么这样排：

- 首页最容易看出品牌方向和页面结构
- 深度计系统是整站空间语言的核心
- 行程页最能看出状态联动、本地存储和交互设计
- 共享存储脚本能帮你理解多个页面怎么共用数据
- 详情页最复杂，放到后面看更容易消化

如果你是前端初学者，也可以用下面这条更稳的顺序：

1. `index.html`
2. `css/global.css`
3. `css/login.css`
4. `js/auth.js`
5. `home.html`
6. `js/home.js`
7. `js/depth-manager.js`
8. `trip.html`
9. `js/trip.js`
10. `js/yanqi-trip-store.js`
11. `detail.html`
12. `js/detail.js`

## 快速运行

### 方式一：直接打开

这是一个纯前端项目，直接双击 `index.html` 也能看到基本页面。

### 方式二：本地静态服务器

更推荐这样做，因为一些资源路径和动态导入在本地服务环境里更稳定。

```bash
cd C:\Users\桉桉\Desktop\盐憩
python -m http.server 8000
```

打开：

```text
http://localhost:8000
```

### 方式三：VS Code Live Server

1. 右键 `index.html`
2. 选择 `Open with Live Server`

更短的启动说明请看 [QUICKSTART.md](./QUICKSTART.md)。

## 目录结构

```text
盐憩/
├─ assets/                     图片与静态素材
├─ css/                        全部样式文件
├─ js/                         全部交互脚本
├─ pretext-main/               文本布局预测依赖
├─ scripts/                    其他脚本资源
├─ index.html                  登录 / 注册门厅
├─ home.html                   首页
├─ trip.html                   我的行程页
├─ detail.html                 海域详情页
├─ contact.html                联系我们
├─ terms.html                  用户协议
├─ privacy.html                隐私政策
├─ README.md                   长版项目说明与学习导读
├─ QUICKSTART.md               快速启动说明
├─ YANQI_PRESENTATION.md       展示提纲
├─ YANQI_5MIN_SPEECH.md        五分钟演讲稿
└─ YANQI_HANDOFF.md            续接说明
```

## 这个项目到底用了哪些核心系统

下面这些系统是理解代码时最重要的部分。

### 1. 深度计系统

主要文件：

- `css/depth-gauge.css`
- `js/depth-manager.js`
- `css/page-transition.css`

它的作用不是“页面边上放两个装饰条”，而是把整站所有页面组织成一套海层空间。

它负责：

- 不同页面的默认深度
- 首页滚动时不同 section 的深浅变化
- 页面跳转时的下潜 / 上浮感
- 部分交互触发时的轻微深度波动

如果你看 `js/depth-manager.js`，可以重点留意：

- `PAGE_DEPTH_MAP`：每个页面默认深度
- `HOME_SECTION_DEPTH_STOPS`：首页不同区块的深度停靠点
- `navigateTo()`：跨页时如何接管跳转
- 页面进入、页面离开、`pageshow` 恢复时的处理逻辑

可以把它理解成：

这个项目的“空间总控”。

### 2. 页面过渡系统

主要文件：

- `css/page-transition.css`
- `js/depth-manager.js`
- `css/transitions.css`
- `js/transition.js`

其中：

- `page-transition.css` + `depth-manager.js` 是当前主系统
- `transitions.css` + `transition.js` 更偏旧版兼容和保留实现

它们共同服务一件事：

不要让页面切换看起来像普通网页刷新。

### 3. 首页内容系统

主要文件：

- `home.html`
- `css/home.css`
- `js/home.js`

首页不是搜索页，而是“海面入口”。

这里的重点系统包括：

- Hero 区的入口氛围
- 热门潜点横向浏览
- `Curated Waters` 目的地展台
- `Dive Match` 适配推荐
- 首页海图导览

`js/home.js` 里几个值得重点看的类和模块：

- `BambooScroll`
- `CuratedWatersStage`
- `DiveMatchStage`
- `HomeSeaGuide`

学习建议：

- 先看页面结构，再看数据，再看类
- 先理解“用户在首页会经历什么”，再去读每个方法

### 4. Planner Desk 系统

主要文件：

- `trip.html`
- `css/trip.css`
- `js/trip.js`
- `js/yanqi-trip-store.js`

这是整个项目里最有“状态感”的一部分。

它负责：

- 选择海域
- 选择出发日期
- 选择同行人数
- 更新左侧摘要区
- 把状态保存到本地
- 从详情页同步“已收进行程”的海域卡片

如果你要学“一个前端页面怎样用本地存储维持连续体验”，这一组文件最值得看。

重点理解链路：

1. 用户在 `trip.html` 里点击字段
2. `js/trip.js` 控制浮层面板、写入字段、更新摘要
3. `js/yanqi-trip-store.js` 统一处理本地存储
4. 页面刷新或离开再回来时，再从本地把内容恢复回来

### 5. 已收进行程系统

主要文件：

- `js/detail.js`
- `js/trip.js`
- `js/yanqi-trip-store.js`

它的逻辑可以这样理解：

- 详情页负责“确认把这片海收进行程”
- 行程页负责“继续整理这片海的日期与同行节奏”
- 共享存储负责“让这两个页面读写同一份数据”

这套结构很适合学习：

一个纯前端项目没有后端时，怎样把“跨页状态”收住。

### 6. 详情页系统

主要文件：

- `detail.html`
- `css/detail.css`
- `js/detail.js`

详情页承担“进入一片具体海域”的任务。

它不只是展示资料，还包含：

- 英雄区
- 海域介绍
- 套餐与价格
- 评论和图片
- 地图说明
- 相关推荐
- 详情页之间的平移切换
- 套餐确认后的反馈层

如果你读 `js/detail.js`，建议先抓大结构，不要一开始陷进很长的数据里。

先看：

- 价格格式化函数
- 详情页类 `DetailPage`
- 套餐确认和反馈层
- 相关推荐和页面内导航

### 7. 信息页系统

主要文件：

- `contact.html`
- `terms.html`
- `privacy.html`
- `css/info-pages.css`
- `js/info-pages.js`
- `js/ocean-scroll.js`

这部分页看起来更安静，但依然不是普通白底说明页。

这里可以学到：

- 信息页怎样保持品牌统一
- 页面内锚点导航怎样做得更柔和
- 联系表单怎样用本地存储做演示版留言

### 8. 文本布局预测系统

主要文件：

- `js/text-layout-adapter.js`
- `pretext-main/`

这部分是比较偏“细节优化”的系统。

它的主要用途是：

提前预测多行文本高度，减少动态渲染时卡片高低跳动的问题。

通俗一点说：

当同一个列表里，不同海域的标题和说明长短不一样时，这个系统可以帮页面更稳。

## 本地存储 key 一览

这个项目没有接后端数据库，所以很多状态都保存在浏览器本地。

| key | 用途 | 主要读写文件 |
| --- | --- | --- |
| `YANQI_PLANNER_DRAFT` | 保存 Planner Desk 的海域、日期、人数草稿 | `js/trip.js`、`js/yanqi-trip-store.js` |
| `YANQI_CONFIRMED_BOOKINGS` | 保存详情页确认后的“已收进行程”套餐 | `js/detail.js`、`js/trip.js`、`js/yanqi-trip-store.js` |
| `YANQI_CONTACT_MESSAGES` | 保存联系页演示版留言 | `js/info-pages.js` |
| `yanqi_email` / `yanqi_password` / `yanqi_accounts` | 登录页前端演示版账号信息 | `js/auth.js` |
| `yanqi_depth_current` / `yanqi_depth_nav` | 深度计和跨页过渡状态 | `js/depth-manager.js` |
| `YANQI_HOME_SCROLL_TARGET` | 首页回跳时需要对齐的 section | `js/home.js`、`js/trip.js` |

要注意：

- 这些数据只存在当前浏览器
- 清理缓存或更换设备后不会同步
- 它们是“前端体验状态”，不是正式业务订单

## 文件逐个说明

这一节是给“想一个个学文件”的人准备的。

### 根目录 HTML

| 文件 | 作用 | 建议怎么读 |
| --- | --- | --- |
| `index.html` | 登录 / 注册门厅页面骨架 | 先看整体分区，再对照 `css/login.css` 和 `js/auth.js` |
| `home.html` | 首页骨架，承载 Hero、热门潜点、目的地、Dive Match、故事和页脚 | 先看 section 顺序，再看每个 section 对应的 CSS 和 JS |
| `trip.html` | 行程页骨架，承载 Planner Desk、摘要、已收进行程、准备系统 | 先找字段，再找摘要，再看底部卡片区 |
| `detail.html` | 详情页骨架，承载海域内容、套餐、评论、地图和推荐 | 先看页面区块，再看 `DetailPage` 如何逐块接管 |
| `contact.html` | 联系页，包含联络方式和演示版留言表单 | 先读结构，再看 `info-pages.js` 如何绑定 |
| `terms.html` | 用户协议页 | 可作为信息页模板看待 |
| `privacy.html` | 隐私政策页 | 可作为信息页模板看待 |

### `css/` 目录

| 文件 | 作用 | 学习重点 |
| --- | --- | --- |
| `css/global.css` | 全站变量、reset、公共导航和公共基线 | 看变量命名、共用色彩、基础组件 |
| `css/login.css` | 登录门厅专属样式 | 看品牌门厅、玻璃卡、登录注册切换氛围 |
| `css/home.css` | 首页样式 | 看 Hero、目的地展台、品牌叙事如何被组织 |
| `css/trip.css` | 行程页样式 | 看 Planner Desk、摘要区和深海控制台感 |
| `css/detail.css` | 详情页样式 | 看英雄区、套餐区、地图区和推荐区层次 |
| `css/depth-gauge.css` | 深度计样式 | 看固定布局、刻度生成配合、空间语言 |
| `css/page-transition.css` | 当前主过渡样式 | 看遮罩层和海层切换效果 |
| `css/transitions.css` | 较早版本的过渡样式保留 | 看旧逻辑如何与新系统并存 |
| `css/info-pages.css` | 联系页 / 协议页 / 隐私页通用样式 | 看说明页如何维持品牌统一 |

### `js/` 目录

| 文件 | 作用 | 学习重点 |
| --- | --- | --- |
| `js/auth.js` | 登录 / 注册切换、表单验证、前端演示账号逻辑 | 看表单状态、轻交互和本地存储 |
| `js/home.js` | 首页数据渲染和核心交互 | 看多模块页面如何拆成几个类 |
| `js/trip.js` | 行程页主控脚本 | 看字段、浮层、摘要、列表、跨页联动 |
| `js/detail.js` | 详情页主控脚本 | 看复杂页面如何集中到一个类里管理 |
| `js/depth-manager.js` | 深度计和跨页过渡总控 | 看跨页面空间系统的设计方式 |
| `js/yanqi-trip-store.js` | 行程与套餐共享存储层 | 看数据标准化和本地存储封装 |
| `js/info-pages.js` | 信息页导航和联系表单逻辑 | 看轻页面的交互脚本怎么写得干净 |
| `js/ocean-scroll.js` | 平滑滚动工具 | 看可复用小工具脚本的写法 |
| `js/text-layout-adapter.js` | 文本高度预测和布局适配 | 看偏工程化的小工具如何封装 |
| `js/transition.js` | 旧版过渡逻辑兼容入口 | 了解历史实现，不必第一优先级深读 |

## 如果你要开始学习代码，建议这样学

### 第一轮：只看结构

目标：

先知道页面被分成哪些区域，不着急看细节。

做法：

1. 打开 `home.html`
2. 只看大 section
3. 打开 `trip.html`
4. 看 Planner Desk 和 summary 的对应关系
5. 打开 `detail.html`
6. 看英雄区、套餐区、评论区、地图区的顺序

### 第二轮：只看样式

目标：

理解这个项目为什么“不像普通模板”。

做法：

1. 看 `css/global.css` 的变量
2. 看 `css/home.css` 里 Hero 的组织方式
3. 看 `css/trip.css` 里 Planner Desk 的材质和层次
4. 看 `css/detail.css` 如何把页面做得像进入海域

### 第三轮：只看交互

目标：

弄清楚用户点击之后发生了什么。

做法：

1. 看 `js/home.js`
2. 看 `js/trip.js`
3. 看 `js/detail.js`
4. 再回来看 `js/depth-manager.js`

### 第四轮：只看状态和存储

目标：

理解多页状态为什么能收住。

做法：

1. 先看 `js/yanqi-trip-store.js`
2. 再看 `trip.js` 如何读写它
3. 再看 `detail.js` 如何把套餐塞进它
4. 最后打开浏览器 `localStorage` 亲自观察 key 的变化

## 几个特别值得学的代码点

### 1. `data-*` 属性怎么和 JS 配合

这个项目大量使用 `data-*`：

- `data-scroll-target`
- `data-info-scroll`
- `data-target`
- 各种 `data-key`

这样做的好处是：

- HTML 结构更清楚
- JS 不需要把所有逻辑都写死
- 页面与脚本的关系更容易维护

### 2. 为什么要写共享存储层

很多初学者第一次写多页前端时，会把 `localStorage` 调用散落在各个文件里。

盐憩里单独做了 `js/yanqi-trip-store.js`，好处是：

- key 统一
- 数据结构统一
- 旧数据与新数据可以一起兼容
- trip 页和 detail 页不用重复写一套存储代码

### 3. 为什么要把复杂页面交给类来管理

像 `home.js` 和 `detail.js` 这种文件，如果所有逻辑都平铺写成几十个函数，会非常容易乱。

所以项目里把部分系统收成类，比如：

- `BambooScroll`
- `CuratedWatersStage`
- `DiveMatchStage`
- `DetailPage`

这样会更适合维护。

### 4. 为什么要保留旧版过渡文件

项目迭代过程中，新的过渡系统不会总是立刻把旧逻辑完全删掉。

所以你会看到：

- `page-transition.css` / `depth-manager.js`
- `transitions.css` / `transition.js`

同时存在。

这在真实项目里很常见。代码不是一次就长成最终样子，而是会经历一段兼容期。

## 常见修改入口

如果以后要继续改这个项目，下面这些入口最常用。

### 想改全站颜色和基础风格

看：

- `css/global.css`

### 想改首页内容或推荐逻辑

看：

- `home.html`
- `css/home.css`
- `js/home.js`

### 想改 Planner Desk 字段或摘要联动

看：

- `trip.html`
- `css/trip.css`
- `js/trip.js`
- `js/yanqi-trip-store.js`

### 想改详情页套餐、评论、相关推荐

看：

- `detail.html`
- `css/detail.css`
- `js/detail.js`

### 想改跨页动效、深度变化、下潜节奏

看：

- `css/depth-gauge.css`
- `css/page-transition.css`
- `js/depth-manager.js`

### 想改说明页或联系页

看：

- `contact.html`
- `terms.html`
- `privacy.html`
- `css/info-pages.css`
- `js/info-pages.js`

## 提交到 GitHub 时，这个仓库最适合怎样介绍

可以直接用下面这段做简版仓库介绍：

> 盐憩是一个潜水旅游主题前端网页项目。它不把页面当作普通网页堆叠，而是把首页、行程页、详情页设计成同一片海里的不同深度层级，并通过深度计、潜浮式过渡、本地存储和品牌化界面，让用户在浏览、选择与规划之间慢慢进入一片更适合自己的海。

如果想更短一点：

> 一个把潜水旅行做成海层体验的品牌化前端网页项目。

## 文档说明

当前仓库里的文档分工如下：

- [README.md](./README.md)：长版项目说明，也是最适合学习代码的主文档
- [QUICKSTART.md](./QUICKSTART.md)：最短启动说明
- [YANQI_PRESENTATION.md](./YANQI_PRESENTATION.md)：项目展示提纲
- [YANQI_5MIN_SPEECH.md](./YANQI_5MIN_SPEECH.md)：五分钟演讲稿
- [YANQI_HANDOFF.md](./YANQI_HANDOFF.md)：续接开发时的上下文说明

## 最后给第一次看这个项目的人一句提醒

看盐憩时，不要只问：

“这里有没有按钮、有没有卡片、有没有表单？”

更应该问：

“这些结构有没有一起把‘下潜’这件事讲出来？”

如果你带着这个问题去读代码，这个仓库会比普通页面模板更有意思。
