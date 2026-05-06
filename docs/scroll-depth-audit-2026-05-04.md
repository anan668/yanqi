# 盐憩 YANQI — 深度计 + 页面滚动静态核查报告

**日期**：2026-05-04
**范围**：只读静态核查，未修改任何文件
**问题**：
1. 深度计数值变化节奏不稳定，忽快忽慢
2. 页面滚动偶发卡住

---

## 1. 总体判断

目前最可能的问题集中在三个方面。深度计的不稳定节奏主要来自 **scroll 事件经过多级节流/RAF 桥接后，`instantVelocity` 的计算严重依赖事件到达间隔而非真正的物理滚动速度**，这个噪声速度再通过 `velocityBoost` 放大到 `responseFactor`，导致每帧深度步长忽大忽小。页面卡住则有两个更可能的根源：**首页轮播在指针按下后对前约 20px 纵向移动存在拖拽状态误判窗口**（拖拽还未释放但用户已经在纵向滚动），以及 **`body.page-transition-active { overflow: hidden }` 在过渡动画异常时可能残留 5-6 秒锁死整页滚动**。两者叠加时表现为用户快速滚动经过轮播区域时，页面像被"轻轻挡了一下"。

---

## 2. 可疑原因排序（按概率从高到低）

### 原因 1：scroll → RAF 桥接的节流间隔不稳定 → instantVelocity 噪声 → responseFactor 波动（概率最高）

**导致深度计忽快忽慢**：`queuePageScrollDepthUpdate` 对不同模式使用不同最短间隔（glide 12ms / traveling max(64) / normal 可变），scroll 事件本身到达频率也不稳定。`stepPageScrollDepth` 中用 `scrollDeltaPx / elapsedMs` 算出的 `instantVelocity` 因此波动剧烈，再经 `velocityBoost`（`clamp(scrollVelocity * 0.01, 0, 0.045)`）叠加到 `responseFactor`，导致每帧深度推进步长从 0.12 到 0.265 之间跳变，观感就是"忽快忽慢"。

**不直接导致页面滚动卡住**，但通过 RAF 链加重了 event loop 压力。

### 原因 2：轮播拖拽前 20px 纵向盲区（概率很高）

**同时导致两个问题**：`handlePointerDown` 在 pointerdown 时立即设 `isDragging = true`，`handlePointerMove` 要到 `absDy > 20px && absDy > absDx * 2` 才释放拖拽。在这约 20px 的窗口内，轮播的 `shouldRunFrame()` 会持续运行逐帧物理计算、调度 RAF，与页面纵向滚动争帧。`prepareForPageVerticalScroll` 只在拖拽释放后才调用。如果鼠标正好经过轮播区域开始纵向滚动，这 20px 的"争夺期"足以让页面滚动感觉"被挡了一下"。

### 原因 3：page-transition-active 残留导致的 overflow:hidden 锁死滚动（概率中等）

**导致页面滚动偶发卡住**：`page-transition.css` 第 237-239 行 `body.page-transition-active { overflow: hidden }` 是硬锁。虽然 `applyTransitionClass` 会启动看门狗（5200ms）和空闲兜底（6000ms），但在二者之间的 5-6 秒窗口内，如果 `animationend` 因 tab 不可见、GPU 上下文丢失等原因未触发，整页滚动会被完全锁死。深度计的 cover/animation class 残留也影响深度计显隐节奏。

**不直接导致深度计本身数值不稳定**，但锁死滚动时深度计当然不会更新。

### 原因 4：traveling/glide 模式的 fast-path 直接跳变（概率中等）

**导致深度计忽快忽慢**：`stepPageScrollDepth` 第 3665-3672 行在 traveling/glide 模式下走 fast path 直接设 `currentDepth = targetDepth` 并跳变渲染，不走逐帧缓动。当用户在普通滚动和程序化滚动（海图导览跳转）之间切换时，深度计在"跳变模式"和"缓慢缓动模式"之间来回切换，视觉上像深度计时而"猛跳一段"时而"慢悠悠追"。

### 原因 5：多个 RAF 循环 + scroll 监听同时运行（概率较低但加重了问题）

在首页同时运行的有：depth-manager 的 `queuePageScrollDepthUpdate → stepPageScrollDepth` RAF 链、轮播的 `frameLoop` RAF 链、`evaluateScrollBurst` 的 RAF 链、viewportCoordinator 的 measure/update RAF 链。虽然不是 lock，但多个 RAF 抢占帧预算，会让个别帧的深度更新延迟 1-2 帧，视觉上就是"偶尔慢半拍"。

---

## 3. 具体可疑代码位置

### A. 深度更新核心循环

| 文件 | 函数/区域 | 行号 | 可疑描述 |
|------|-----------|------|----------|
| `site/js/depth-manager.js` | `queuePageScrollDepthUpdate` | 3409-3474 | minIntervalMs 按模式分三个档（12/64/可变），节流不均匀导致 `elapsedMs` 不连续 |
| `site/js/depth-manager.js` | `stepPageScrollDepth` | 3614-3735 | `instantVelocity`（line 3641）依赖不稳定的 `elapsedMs`；`velocityBoost`（line 2340）把速度噪声放大到 responseFactor |
| `site/js/depth-manager.js` | `stepPageScrollDepth` fast path | 3665-3672 | traveling/glide 模式下直接跳变 `currentDepth = targetDepth`，不经过逐帧缓动 |
| `site/js/depth-manager.js` | `getScrollDepthResponseFactor` | 2313-2348 | `velocityBoost` 公式（line 2340）和 `deltaBoost`（line 2339）对不规则帧间隔敏感 |
| `site/js/depth-manager.js` | `renderDepth` | 2504-2567 | 每帧写 `textContent`、调 `updateMarkersForContainer`（遍历 marker 缓存改 classList）、`setOverlayState` |
| `site/js/depth-manager.js` | settle threshold | 3685-3696 | glide 模式下 settleThreshold 仅 0.02m，容易一直在追精度而不进入 settle |

### B. 轮播拖拽与滚动拦截

| 文件 | 函数/区域 | 行号 | 可疑描述 |
|------|-----------|------|----------|
| `site/js/home.js` | `handlePointerDown` | 3709-3739 | pointerdown 立即设 `isDragging = true`，没有先判断意图 |
| `site/js/home.js` | `handlePointerMove` | 3863-3901 | 纵向释放条件 `absDy > 20px && absDy > absDx * 2`，前 20px 窗口内拖拽和滚动争抢 |
| `site/js/home.js` | `handlePointerMove` line 3899 | 3899 | `prepareForPageVerticalScroll` 只在拖拽释放后才调用，释放前轮播仍在逐帧运行 |
| `site/js/home.js` | `handleWrapperWheel` | 3755-3768 | wrapper wheel 监听虽为 passive，但内部 `prepareForPageVerticalScroll` 和 `scheduleHomePageWheelFallback` 仍有副作用 |
| `site/js/home.js` | `setupHomeWheelBoundaryPassthrough` | 9367-9388 | 对 curated-waters 内部元素的 wheel 事件调用 `scheduleHomePageWheelFallback`，可能与浏览器原生滚动叠加 |
| `site/js/home.js` | `handlePointerUp` | 3924-3949 | 正常释放路径完善；但 `pointercancel` / `mouseleave` / `blur` 均转发到 `handlePointerUp`（line 3653-3655），风险低 |
| `site/js/home.js` | `handleLostPointerCapture` | 3985-3991 | 有 `lostpointercapture` 兜底转发到 `handlePointerUp`，状态残留风险低，但需验证是否在所有场景下触发 |

### C. 页面过渡锁滚动

| 文件 | 选择器/区域 | 行号 | 可疑描述 |
|------|-----------|------|----------|
| `site/css/page-transition.css` | `body.page-transition-active` | 237-239 | `overflow: hidden` 硬锁整页滚动 |
| `site/js/depth-manager.js` | `applyTransitionClass` | 4112-4141 | 加 `page-transition-active` 并启动看门狗 (5200ms) 和空闲兜底 (6000ms) |
| `site/js/depth-manager.js` | `clearTransitionClasses` | 4064-4088 | 正常清理路径完备，但依赖动画 `animationend` 事件触发 |
| `site/js/depth-manager.js` | `armTransitionWatchdog` | 4013-4030 | 看门狗 5200ms 后清理，窗口偏长 |

### D. CSS 滚动相关

| 文件 | 选择器 | 行号 | 可疑描述 |
|------|--------|------|----------|
| `site/css/global.css` | `html` | 130-144 | `overflow-x: hidden` + `scrollbar-width: none` — scrollbar 隐藏本身不导致卡住，但放大感知 |
| `site/css/global.css` | `html` | 131 | `scroll-behavior: auto` — 确认无 `smooth` 干扰，正常 |
| `site/css/home.css` | `.hero-bamboo-cards-wrapper` | 9690-9705 | `touch-action: pan-y` 只对触摸有效；`overscroll-behavior-y: auto` 允许链接滚动 |
| `site/css/home.css` | `.curated-nav-rail` | 3484-3486 | `overflow-y: hidden` + `overscroll-behavior-y: none` — 但在 curated 导航区域内，不影响主页面滚动 |
| `site/css/page-transition.css` | `.page-transition-overlay` | 37-53 | `position: fixed; inset: 0; z-index: 780; pointer-events: none` — 正常情况下不拦截交互 |

### E. 性能相关

| 文件 | 位置 | 行号 | 可疑描述 |
|------|------|------|----------|
| `site/js/depth-manager.js` | scroll listener | 3353-3355 | depth-manager scroll 监听（passive: true） |
| `site/js/home.js` | scroll listener | 510 | requestViewportBootstrapCheck（passive） |
| `site/js/home.js` | scroll listener | 1073 | requestUpdate via viewportCoordinator（passive） |
| `site/js/home.js` | scroll listener | 2902 | evaluateScrollBurst via RAF（passive） |
| `site/js/home.js` | scroll listener | 8771 | handleStoryRevealScroll（passive） |
| `site/js/home.js` | wheel listener | 2910 | 记录滚动模式和 markHomeScrollSettling（passive） |
| `site/js/home.js` | wheel listener | 9368 | setupHomeWheelBoundaryPassthrough（passive，但触发 fallback scroll） |

---

## 4. 是否需要修改

| 问题 | 判定 |
|------|------|
| depth-manager 的 instantVelocity 依赖不稳定帧间隔 | **必须修** |
| traveling/glide 模式 fast-path 直接跳变 | **必须修** |
| 轮播拖拽前 20px 纵向盲区 | **必须修** |
| page-transition-active overflow:hidden 残留 | **必须修**（缩短看门狗 + 增加 animationcancel 监听） |
| 多个 RAF 循环同时运行 | **建议修**（统一协调器） |
| setupHomeWheelBoundaryPassthrough 的双重滚动 | **建议修** |
| glide settleThreshold 过紧 (0.02m) | **可观察** |
| html scrollbar-width: none 放大感知 | **可观察**（不建议动，是设计选择） |
| 各模式 responseFactor 不同曲线 | **可观察** |
| renderDepth 每帧大量 DOM 写入 | **建议修**（缓存 lastRendered） |

---

## 5. 后续小范围修复方案

### 任务 A：优化 depth-manager 的 depth step 稳定性

只改 `stepPageScrollDepth` 和 `getScrollDepthResponseFactor`：

- 把 `instantVelocity` 改为使用最近 N 帧的加权移动平均（而非单帧 deltaPx/elapsedMs）
- 降低 `velocityBoost` 权重（当前 max 0.045，可降到 0.02）
- 在 traveling/glide 的 fast path 中不直接跳变，改用至少 2-3 帧的 mini-ease
- 把 glide settleThreshold 从 0.02 放宽到 0.05

### 任务 B：修复首页轮播纵向滚动识别窗口

只改 `handlePointerDown` 和 `handlePointerMove`：

- `handlePointerDown` 中不立即设 `isDragging = true`，先记录起始坐标，等 `pointermove` 确认水平意图（absDx > 5 && absDx > absDy）再进入拖拽状态
- 纵向阈值 `HOME_BAMBOO_VERTICAL_RELEASE_MIN_PX` 从 20px 降到 8-10px
- 或者更安全：`handlePointerDown` 中先设一个 `pointerIntentPending` flag，在 pointermove 的前 10px 内判断方向后再决定是 drag 还是忽略

### 任务 C：缩短页面过渡滚动锁的看门狗 + 增加 animationcancel 兜底

只改 `armTransitionWatchdog` 和 `applyTransitionClass`：

- 看门狗从 5200ms 缩到 1800ms（过渡动画最长 1200ms + 600ms 余量）
- 在 `applyTransitionClass` 中给 `body` 加一个 `onanimationcancel` 监听器（或在该元素上用 transitionend fallback）
- 空闲兜底也缩到 3000ms

### 任务 D：优化 renderDepth 的 DOM 写入频率

只改 `renderDepth`：

- 已有的 `lastRenderedDepthText` 缓存检查是正确的（line 2524/2528），但 `updateMarkersForContainer` 每次 traveling 都调用。可加一个 `_lastMarkerDepth` 缓存避免在深度值不变时重复更新 marker classList

---

## 6. 风险提醒

以下不能乱动：

- **depth-manager.js 不能重写**：它的 `renderDepth` / `setOverlayState` / `persistCurrentDepth` / `navigateToPage` 等构成了整站深度系统的骨架，改主线逻辑会导致跨页过渡、深度存储、Sea Atlas 全部出问题。
- **page-transition.css 过渡动画曲线不能随便改**：`page-exit-up/down` 等 keyframes 有精确的时序和 cubic-bezier，配合 JS 的 `applyTransitionClass` 和 `setTransitionDuration`。只改 `overflow: hidden` 的触发/恢复时机，不要动动画本身。
- **Sea Atlas（海图导览）不能动**：它和 `home-guide-jump-native.js` / `home-guide-jump-custom.js` 联动，涉及程序化滚动管理和 `HOME_INTERACTION_STATE`。
- **Planner Desk（行程桌面）不能动**：涉及 `trip.js` 和 Planner 面板的复杂状态。
- **localStorage / sessionStorage 主状态逻辑不能改**：`STORAGE_KEY_CURRENT` / `STORAGE_KEY_NAV` 等控制了深度值的跨页持久化。
- **首页轮播结构不能大改**：竹简轮播的 `frameLoop` / 物理模拟 / 惯性 / snap 是多层耦合的精细系统，只修纵向拖拽判断。

---

## 7. 给 Codex 的动态验证建议

Codex 后续应优先动态验证以下几点（可以用 Chrome DevTools Performance 面板 + 自定义断点）：

1. **在 stepPageScrollDepth 中打 console.table**，连续记录 30 帧的 `elapsedMs`、`instantVelocity`、`responseFactor`、`delta`、`adjustedDepthStep`。看帧间隔方差是否 > 3x（说明节流不稳定），以及 velocityBoost 是否在 delta 很小时仍推高 responseFactor。

2. **在轮播 wrapper 上覆盖一个透明的 pointer-events 检测层**，或者用 `monitorEvents(wrapper, 'pointermove')` 观察：当用户在 wrapper 上做纯纵向滚动时，pointermove 回调是否在前几帧就把 `isDragging` 设为了 true。记录纵向释放距离是否确实要接近 20px 才触发。

3. **手动触发 page-transition（点击导航链接），然后在动画进行中切到另一个 tab 再回来**，检查 `body` 上是否残留 `page-transition-active` 和 `overflow: hidden`。用 `getComputedStyle(document.body).overflow` 确认。

4. **在 scroll 事件回调中统计所有同时注册的 scroll 监听器数量**（通过 `getEventListeners(window).scroll`），确认首页滚动时是否有超过 4 个监听器在同时跑。

5. **在 Performance 面板中录制一次完整滚动（从页面顶部到底部）**，检查是否有 frame 的 Scripting 时间超过 50ms（黄色长任务），以及 RAF 火焰图中 depth-manager 和轮播 frameLoop 是否在同一个 16ms 帧内竞争。
