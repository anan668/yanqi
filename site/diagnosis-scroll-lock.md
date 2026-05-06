# 首页纵向滚动卡住排查报告

> 只读排查，未修改任何文件。分析范围：home.html / home.css / home.js / ocean-scroll.js / avatar-return.js / depth-manager.js / page-transition.css / global.css。

---

## 一、最可能原因（按概率排序）

### 1. `body.page-transition-active { overflow: hidden }` 残留 ⚠️ 危险

**文件：** `site/css/page-transition.css` 第 237 行

```css
body.page-transition-active {
    overflow: hidden;
}
```

这条规则直接阻断页面所有纵向滚动。`page-transition-active` 由 `depth-manager.js` 管理：
- 添加时机：`applyTransitionClass()`（第 3970 行）
- 移除时机：`clearTransitionClasses()`，通过以下路径触发：
  - 看门狗超时 `armTransitionWatchdog(5200)`，5.2 秒后兜底清除（第 3870–3886 行）
  - `scheduleTransitionCleanup(delayMs)` 主动清除
  - `BFCache` 恢复时的 `pageshow` 处理器（第 4427–4448 行）

**可疑场景：** 如果看门狗在页面被后台化/挂起时触发（`setTimeout` 被节流），过渡结束后 `overflow: hidden` 仍留在 `body`。同时 `isHomeInteractionLocked()` 第 2898 行会持续返回 `true`，进一步压低首页所有交互动效。

**验证方法：** 在卡住时打开 DevTools → Elements，查看 `<body>` 上是否存在 `page-transition-active` 类。

---

### 2. `HomeBambooCarousel.handlePointerDown` 中 `setPointerCapture` 未区分横向/纵向意图 ⚠️ 中高

**文件：** `site/js/home.js` `HomeBambooCarousel` 类

- `handlePointerDown(event)` 第 3642–3679 行：只要左键按下，立即 `this.isDragging = true` 并调用 `this.wrapper.setPointerCapture(event.pointerId)`（第 3677 行）。
- `flushPointerMoveFrame()` 第 3619–3655 行：**只读取 `dragDeltaX`（第 3630 行）追踪横向位移，完全忽略 `deltaY`**。
- 关键点：`handlePointerMove` 第 3662–3688 行，在 `isDragging` 为 `true` 时无条件进入横向拖拽逻辑，**没有早期探测"用户其实是想上下滑"并提前释放指针捕获的机制**。

**后果：** 用户在轮播区域上用鼠标左键垂直拖动时，`setPointerCapture` 已捕获了所有后续 `pointermove` 事件，浏览器原生 scroll 被抑制，而 JS 只更新横向位置 — 纵向滑动彻底静默。CSS `touch-action: pan-y`（第 3448 行 JS 动态写入、第 9701 行 CSS）理论上允许触摸端垂直滚动，但 **`touch-action` 不能覆盖指针捕获行为**，只影响 touch 手势。

---

### 3. `HOME_INTERACTION_STATE.lockUntil` 或 `programmaticTraveling` 可能未正确释放 ⚠️ 中

**文件：** `site/js/home.js`

- `beginHomeInteractionLock(durationMs)` 第 2721–2726 行：使用 `Math.max` 延长 `lockUntil`，**只能增加不能减少**。
- `scheduleHomeInteractionRefresh(delayMs)` 第 2692–2713 行：在 `setTimeout` 回调中重置 `programmaticTraveling = false`（第 2701 行）。如果此 `setTimeout` 被页面挂起/节流，或 `clearTimeout`（第 2693–2696 行 + 第 2693 行的 `unlockTimer` 覆盖逻辑），`programmaticTraveling` 会永久卡在 `true`。
- 卡在 `true` 的连锁效应：`isHomeVerticalScrollActive()`（第 2315 行）持续返回 `true` → `canAnimateFrame()`（第 4177 行）停止轮播动画循环 → `syncHomeInteractionDataset()` 设置 `body.dataset.homeInteraction = 'locked'`（第 2618 行）→ 海面氛围层 + 轮播按钮动画被暂停。

**需要注意的边界：** 这只暂停轮播动画和首屏氛围，**不会直接导致页面本身滚不动**（因为没有一个对应的 `overflow: hidden`）。但如果恰好与原因 #1 叠加就更难排查。

---

### 4. `html.has-avatar-return-open, body.has-avatar-return-open { overflow: hidden }` 残留 ⚠️ 中低

**文件：** `site/css/global.css` 第 551–553 行

```css
html.has-avatar-return-open,
body.has-avatar-return-open {
    overflow: hidden;
}
```

**文件：** `site/js/avatar-return.js`

- 打开时 `setLockState(true)`（第 242 行）→ 加 `has-avatar-return-open`
- 关闭时 `setLockState(false)`（第 120 行）→ 移除 `has-avatar-return-open`
- 但关闭是异步的：先移除 `active` 类 + 加 `is-closing`，**280ms 后才彻底清理样式**（第 126–129 行）。如果在这 280ms 内浏览器挂起或定时器被节流，`overflow: hidden` 会残留在 `<html>` 和 `<body>`。

---

### 5. `handleWrapperWheel` 的 `{ passive: true }` 与 `prepareForPageVerticalScroll` 连锁 ⚠️ 低

**文件：** `site/js/home.js`

- `handleWrapperWheel` 第 3687 行注册为 `{ passive: true }`，所以 **不会** `preventDefault` 拦截 wheel。
- 但它触发的 `prepareForPageVerticalScroll(560)` 调用 `markHomeScrollSettling(560)`，后者将 `scrollSettlingUntil` 延长 560ms。如果 wheel 事件高频触发，`scrollSettlingUntil` 被反复延长 → `isHomeVerticalScrollActive()` 持续 `true` → `isHomeInteractionLocked()` 持续 `true` → `body.dataset.homeInteraction = 'locked'` → 轮播相关的 rAF 回收。**这同样不妨碍页面原生滚动**，但会让开发者误判"锁没释放"。

---

## 二、已排除的嫌疑项（检查结论）

| # | 排查项 | 结论 |
|---|---|---|
| 1 | JS 中 `preventDefault` 误拦截纵向滚动 | `preventDefault` 仅用于：按钮点击（3429/3436/3443）、dragstart（3459）、键盘 Enter/Space（3820），以及 dive-match 区部分按钮（7507ff），均不涉及全局纵向滚动。 |
| 2 | `stopPropagation` 误拦截 | 仅在 dive-match profile panel 的 `pointerdown`（8312）调用，且只拦截该组件内部，不影响页面滚动链。 |
| 3 | `touch-action: none` | 未发现。`.hero-bamboo-cards-wrapper` 使用 `touch-action: pan-y`（home.css 9701），`.bamboo-cards-wrapper` 同（JS 3448），均为允许纵向。 |
| 4 | `html/body` 或 `.page-stage` 上 `overflow: hidden` 未恢复 | 仅两个入口可以写入 `body overflow: hidden`：`page-transition-active`（page-transition.css 237）和 `has-avatar-return-open`（global.css 551），如上分析均存在清理残留风险。 |
| 5 | `isDragging / isAnimating / isLocked` 未释放 | `isDragging`：`handlePointerUp`（3705）和 `handleLostPointerCapture`（3761）都会置 `false`，且在 `handlePointerMove`（3669）中对 mouse 做了 "buttons & 1 === 0" 自救检测。`isAnimating`：CSS 类 `.is-animating`（home.css 10789）仅影响卡片阴影，不阻塞 scroll。 |
| 6 | 透明覆盖层 `pointer-events: auto` 挡页面 | `.hero-ocean-layers`（778）、`.hero-ocean-glow`（787）、`.hero-ocean-wave`（787）、`.hero-plankton`（787）、`.hero-section::before`（413）、`::after`（427）、`.hero-bamboo-cards-wrapper::before`（9723）、`::after`（9735）、`.depth-gauge`（depth-gauge.css 40）全部 `pointer-events: none`。未发现遮挡。 |
| 7 | 按钮热区/伪元素/光效层覆盖过大 | 同上，所有装饰层均为 `pointer-events: none`。 |

---

## 三、推荐修复方案（仅建议，未实际修改）

### 针对原因 #1 — 最高优先级

**方案 A（保守）：给 `body.page-transition-active` 加更短的兜底恢复**

在 `depth-manager.js` 的 `armTransitionWatchdog` 中把默认延迟从 5200ms 降至 3000ms，并给 `clearTransitionClasses` 加上一层"即使看门狗没触发也恢复"的 `requestIdleCallback` 后备：

```
// depth-manager.js applyTransitionClass() 末尾追加：
requestIdleCallback(() => {
    if (this.body.classList.contains('page-transition-active') && !this.cleanupTimerId) {
        this.clearTransitionClasses();
    }
}, { timeout: 6000 });
```

**方案 B（更彻底）：限制 `overflow: hidden` 的作用范围**

将 `page-transition.css` 第 237–239 行改为：

```css
body.page-transition-active {
    overflow: hidden;
    /* 新增：用 touch-action 保持触摸端仍可滚动（但视觉效果会跳）— 仅为最后兜底 */
    touch-action: pan-y;
}
```

### 针对原因 #2 — 指针捕获时应区分方向

在 `handlePointerMove`（第 3662 行）开头加入方向探测：

```
handlePointerMove(event) {
    if (!this.isDragging || event.pointerId !== this.pointerId) return;
    // ... existing mouse button check ...

    const absDx = Math.abs(event.clientX - this.startPointerX);
    const absDy = Math.abs(event.clientY - this.startPointerY);

    // 如果纵向位移明显超过横向，且超过阈值，释放捕获让浏览器接管滚动
    if (absDy > absDx * 2 && absDy > 20) {
        if (this.wrapper.releasePointerCapture) {
            this.wrapper.releasePointerCapture(event.pointerId);
        }
        this.isDragging = false;
        this.pointerId = null;
        this.wrapper.classList.remove('is-dragging');
        return;
    }
    // ... existing logic ...
}
```

### 针对原因 #3 — lockUntil 不能只能增加

给 `beginHomeInteractionLock` 加一个绝对上限：

```
function beginHomeInteractionLock(durationMs = 0) {
    const nextUntil = performance.now() + Math.max(0, durationMs);
    HOME_INTERACTION_STATE.lockUntil = Math.min(
        Math.max(HOME_INTERACTION_STATE.lockUntil, nextUntil),
        performance.now() + 10000  // 绝对上限：单次锁不超过 10s
    );
    // ...
}
```

### 针对原因 #4 — avatar return 异步清理加兜底

在 `closeAvatarReturnModal()`（avatar-return.js 第 111 行）中，`setTimeout` 280ms 清理 `CLOSING_CLASS` 之外，额外加：

```
// 在 setTimeout 回调内同时确保 LOCK_CLASS 也被移除（即使 setLockState(false) 已经调过）
document.documentElement.classList.remove(LOCK_CLASS);
document.body?.classList.remove(LOCK_CLASS);
```

### 针对原因 #5 — settleUntil 应加总时长上限

`markHomeScrollSettling`（第 2656 行）当前使用 `Math.max` 只能延长。建议加一个从本函数入口时间戳计算的总上限：

```
function markHomeScrollSettling(durationMs = HOME_MANUAL_SCROLL_SETTLING_MS) {
    const safeDuration = Math.max(0, Number(durationMs) || 0);
    if (safeDuration <= 0) return;
    stopHomeManualGlide();
    HOME_INTERACTION_STATE.scrollSettlingUntil = Math.min(
        Math.max(HOME_INTERACTION_STATE.scrollSettlingUntil, performance.now() + safeDuration),
        performance.now() + 2000  // 上限 2s
    );
    // ...
}
```

---

## 四、修改风险提醒

1. **`page-transition-active` 相关修改** 风险最高：这是整站跨页过渡动画的核心状态。方案 A（加 `requestIdleCallback` 兜底）相对安全。方案 B（`touch-action: pan-y` 兜底）可能在过渡动画中造成页面抖动，仅在无法修复 root cause 时考虑。

2. **`handlePointerMove` 方向探测** 风险中等：一旦方向判断阈值（20px / 2x 比率）设置不当，会导致本应是横向拖拽却被误判为纵向。建议先在开发环境调参。

3. **`lockUntil` 和 `settlingUntil` 上限** 风险低：它们控制的是"在滚动期间暂停哪些动画"，加上限不会破坏功能，最多在极长滚动时不再暂停动画。

4. **`avatar-return` 关闭清理** 风险低：重复 `classList.remove` 是幂等操作。

5. **所有涉及 `setTimeout` → `requestAnimationFrame` → `requestIdleCallback` 的改动** 都需要注意：在页面后台时这些 API 会被浏览器节流。建议全部同时使用 `setTimeout` + `requestIdleCallback` 双重兜底。

---

## 五、给 Codex 的简短修复提示词草稿

> 排查 home.html 页面偶发纵向滚动卡住问题。
>
> 1. 先检查 body 上是否残留 `page-transition-active`：给 `depth-manager.js` 的 `applyTransitionClass` 末尾加 `requestIdleCallback` 兜底超时清理。
> 2. 给 `home.js` 的 `HomeBambooCarousel.handlePointerMove` 开头加方向判断：拖拽开始后如果纵向位移明显 > 横向（absDy > absDx * 2 且 > 20px），主动释放 pointerCapture 并把 `isDragging` 置 false，把滚动权还给浏览器。
> 3. 给 `beginHomeInteractionLock` 加绝对时间上限 10s，给 `markHomeScrollSettling` 加上限 2s，防止高频 wheel 导致 settleUntil 无限延长。
> 4. `avatar-return.js` 的 `closeAvatarReturnModal` 280ms setTimeout 内再次移除 `has-avatar-return-open` class。
> 5. 改完用 Chrome DevTools Performance 面板录制一次完整滚动操作，确认无 long task 和 forced reflow。
