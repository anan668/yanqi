# 快速开始指南

## ⚡ 5 分钟快速开始

### 1. 打开项目
直接在浏览器中打开 `index.html` 文件即可开始使用。

或者使用本地服务器（推荐）：

**方式 A：Python 3**
```bash
cd C:\Users\桉桉\Desktop\盐憩
python -m http.server 8000
```

**方式 B：PowerShell**
```powershell
Set-Location "C:\Users\桉桉\Desktop\盐憩"
python -m http.server 8000
```

然后在浏览器中访问：`http://localhost:8000`

**方式 C：使用 VS Code 的 Live Server**
1. 右键点击 `index.html`
2. 选择 "Open with Live Server"

### 2. 页面流程

```
登录页 (index.html)
    ↓ 输入任意信息，点击"登录"或"先逛逛"
    ↓ 触发深度计过渡动画（3秒）
    ↓
主页 (home.html)
    ↓ 竹签卡片可以左右拖拽或用箭头按钮滚动
    ↓ 点击任何潜点卡片
    ↓
详情页 (detail.html)
    ↓ 查看潜点详细信息、用户评价、预订选项
    ↓ 点击头像可返回登录页
```

## 🎮 交互操作

### 登录页
- ✅ 输入任意内容都可以提交（前端验证）
- ✅ 点击 **登录** / **注册** Tab 切换页面
- ✅ 点击 **先逛逛** 直接进入主页
- ✅ 点击社交按钮（微信/QQ/Google）也可进入
- ✅ 勾选**记住我**会保存输入内容到本地存储
- ✨ 所有元素带逐次上浮动画

### 主页
- **竹签滚动**（核心功能）：
  - 🖱️ 鼠标在卡片区域**拖拽**左右滚动
  - ⬅️➡️ 点击两侧**箭头**快速滚动
  - 🎯 点击下方**指示器点**快速跳转
- 🖱️ 悬停卡片会上浮并放大显示阴影
- 🔗 点击任何潜点卡片进入详情页
- 💬 点击用户头像可返回登录页
- ⬆️ 滚动页面时会显示"返回顶部"按钮

### 详情页
- 📖 查看潜点的详细信息（地理、生物、注意事项等）
- ⭐ 浏览真实用户评价（带日期和评分）
- 📅 查看可预订的行程套餐和价格
- 🔘 点击 **预订** 按钮弹出预订表单
- 📍 查看地图位置及相关潜点推荐
- 💬 点击用户头像返回登录页或其他页面

## 📝 文件说明

| 文件 | 作用 |
|------|------|
| `index.html` | 登录/注册页面，包含毛玻璃卡片和背景粒子 |
| `home.html` | 主页，重点是竹签滚动推荐区 |
| `detail.html` | 潜点详情页，包含行程、评价、预订 |
| `css/global.css` | 全局样式、CSS 变量、导航栏、底部等 |
| `css/login.css` | 登录页专属样式（毛玻璃、动画等） |
| `css/home.css` | 主页样式（竹签滚动、网格布局等） |
| `css/detail.css` | 详情页样式（英雄区、侧边栏等） |
| `css/transitions.css` | 深度计过渡动画样式 |
| `js/auth.js` | 登录/注册逻辑、Tab 切换、表单验证 |
| `js/transition.js` | 深度计过渡动画控制 |
| `js/home.js` | 竹签滚动逻辑、目的地网格、数据渲染 |
| `js/detail.js` | 详情页交互、行程渲染、评价展示 |

## 🎨 自定义样式

### 改变主色调
编辑 `css/global.css`，修改 `:root` 中的颜色变量：

```css
:root {
    --primary: #1e88e5;        /* 改为你喜欢的颜色 */
    --secondary: #00bcd4;
    /* 其他颜色 */
}
```

### 改变字体
在 `css/global.css` 中修改字体声明：

```css
--font-family: 'Your Font Name', Arial, sans-serif;
```

### 改变动画速度
在全局样式中修改过渡时间：

```css
--transition-fast: 0.15s ease-in-out;    /* 改成你想要的速度 */
--transition-normal: 0.3s ease-in-out;
```

## 📱 响应式预览

在浏览器开发者工具中按下 `F12`，然后按 `Ctrl+Shift+M` 切换设备模式。

可以看到在不同屏幕尺寸下的响应效果：
- **桌面** 1920px
- **平板** 768px
- **手机** 375px

## 🔧 常见问题

**Q: 图片无法加载怎么办？**
A: 不用担心！代码已配置为使用在线 placeholder 服务。如果你想用真实图片，请在 `assets/images/` 目录中添加相应图片文件。

**Q: 动画卡顿怎么办？**
A: 这可能是因为有其他程序占用 CPU。尝试：
1. 关闭其他标签页
2. 使用隐私模式打开浏览器
3. 更新浏览器到最新版本

**Q: 如何修改数据？**
A: 主要数据在 JS 文件中：
- `js/home.js` 的 `divingSpotsData` 数组
- `js/detail.js` 的 `divingSpotDetails` 对象

直接编辑这些对象的内容即可。

**Q: 如何添加新的潜点？**
A: 在 `js/home.js` 中的 `divingSpotsData` 数组末尾添加新对象：

```javascript
{
    id: 9,
    name: '新潜点',
    tagline: '特色描述',
    image: 'assets/images/new-spot.jpg',
    price: '¥X,XXX',
    rating: '4.8',
    difficulty: '★★'
}
```

然后在 `js/detail.js` 的 `divingSpotDetails` 对象中添加对应的详细信息。

## ✨ 高级功能提示

### 深色模式
所有样式都支持深色模式。可以在系统设置中切换，网页会自动适应。

### 键盘导航
使用 `Tab` 键可以在表单中导航，`Enter` 提交表单。

### 导出优化
若要上线，建议：
1. 压缩 CSS 和 JS 文件
2. 优化图片大小
3. 使用 GZIP 压缩
4. 添加 Service Worker 进行离线支持

## 📚 进阶修改

### 修改竹签滚动速度
在 `js/home.js` 的 `BambooScroll` 类中：

```javascript
scroll(direction) {
    this.currentPosition += direction * 300;  // 改这个数字（默认 300）
}
```

### 修改过渡动画时长
在 `js/auth.js` 中：

```javascript
setTimeout(() => {
    // ...
}, 2500);  // 改这个数字（毫秒）
```

### 修改卡片宽度
在 `js/home.js` 中：

```javascript
this.cardWidth = 300;  // 改这个数字
```

## 🚀 部署到线上

### 1. 上传到 GitHub Pages
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的用户名/yanqi.git
git push -u origin main
```

在 GitHub 仓库设置中启用 Pages，选择 `main` 分支。

### 2. 上传到免费服务器
使用 Netlify（最简单）：
1. 访问 https://netlify.com
2. 将项目文件夹拖拽进去
3. 自动部署完成

### 3. 绑定自定义域名
购买域名后，在域名提供商处配置 DNS 指向你的服务器。

## 📞 获取帮助

如遇任何问题，可以尝试：
1. 查看浏览器控制台（F12 → Console）看是否有错误信息
2. 检查网络标签（Network）看是否有加载失败的资源
3. 使用浏览器的开发者工具调试 CSS 和 JavaScript

---

**祝你探索愉快！🌊**

如果你对这个项目有任何改进建议或想要添加新功能，欢迎修改和扩展！
