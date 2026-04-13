# 盐憩快速开始

这份文档只负责一件事：让你用最短时间跑起项目并知道先看哪里。

更完整的项目介绍、文件说明和学习顺序，请直接看 [README.md](../README.md)。

## 1. 启动项目

### 直接打开

双击 `site/index.html` 即可查看页面。

### 推荐方式：本地静态服务器

```bash
cd C:\Users\桉桉\Desktop\盐憩
python -m http.server 8000
```

打开：

```text
http://localhost:8000/site/
```

### VS Code

1. 右键 `site/index.html`
2. 选择 `Open with Live Server`

## 2. 最快体验路径

建议按这个顺序点一遍：

1. `site/index.html` 登录门厅
2. 进入 `site/home.html`
3. 浏览 首屏、热门潜点、潜水匹配
4. 进入 `site/detail.html`
5. 确认一个套餐
6. 打开 `site/trip.html`
7. 查看 行程控制台 和“已收进行程”

## 3. 最快理解代码路径

如果你只想先抓主线，按这个顺序读：

1. `site/home.html`
2. `site/css/home.css`
3. `site/js/home.js`
4. `site/js/depth-manager.js`
5. `site/trip.html`
6. `site/js/trip.js`
7. `site/js/yanqi-trip-store.js`
8. `site/detail.html`
9. `site/js/detail.js`

## 4. 文档分工

- [README.md](../README.md)：长版说明，适合学习代码
- [YANQI_PRESENTATION.md](./YANQI_PRESENTATION.md)：展示提纲
- [YANQI_5MIN_SPEECH.md](./YANQI_5MIN_SPEECH.md)：五分钟演讲稿
- [YANQI_HANDOFF.md](./YANQI_HANDOFF.md)：续接说明

## 5. 注释入口

- 核心脚本和样式文件现在都带了中文文件头说明，先看文件顶部会最快进入状态。
- 想看页面节奏与深度切换：先读 `js/depth-manager.js`
- 想看首页模块组织：先读 `js/home.js` 和 `css/home.css`
- 想看行程联动：先读 `js/trip.js` 和 `js/yanqi-trip-store.js`
- 想看详情页完整交互：先读 `js/detail.js`


