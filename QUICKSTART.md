# 盐憩快速开始

这份文档只负责一件事：让你用最短时间跑起项目并知道先看哪里。

更完整的项目介绍、文件说明和学习顺序，请直接看 [README.md](./README.md)。

## 1. 启动项目

### 直接打开

双击 `index.html` 即可查看页面。

### 推荐方式：本地静态服务器

```bash
cd C:\Users\桉桉\Desktop\盐憩
python -m http.server 8000
```

打开：

```text
http://localhost:8000
```

### VS Code

1. 右键 `index.html`
2. 选择 `Open with Live Server`

## 2. 最快体验路径

建议按这个顺序点一遍：

1. `index.html` 登录门厅
2. 进入 `home.html`
3. 浏览 Hero、热门潜点、Dive Match
4. 进入 `detail.html`
5. 确认一个套餐
6. 打开 `trip.html`
7. 查看 Planner Desk 和“已收进行程”

## 3. 最快理解代码路径

如果你只想先抓主线，按这个顺序读：

1. `home.html`
2. `css/home.css`
3. `js/home.js`
4. `js/depth-manager.js`
5. `trip.html`
6. `js/trip.js`
7. `js/yanqi-trip-store.js`
8. `detail.html`
9. `js/detail.js`

## 4. 文档分工

- [README.md](./README.md)：长版说明，适合学习代码
- [YANQI_PRESENTATION.md](./YANQI_PRESENTATION.md)：展示提纲
- [YANQI_5MIN_SPEECH.md](./YANQI_5MIN_SPEECH.md)：五分钟演讲稿
- [YANQI_HANDOFF.md](./YANQI_HANDOFF.md)：续接说明
