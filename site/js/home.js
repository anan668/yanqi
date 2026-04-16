/* ============================================
   首页脚本逻辑 - home.js
   ============================================
   职责：
   1. 驱动首页首屏、热门潜点、目的地展台、潜水匹配和海图导览。
   2. 管理首页数据渲染、滚动联动、模块切换和返回顶部等交互。
   3. 把首页维持成“先看海、再被海吸引”的入口体验。
   阅读顺序：
   1. 常量与数据
   2. 工具函数
   3. 各模块类
   4. 页面初始化
*/

// 文件导读：建议先读数据结构和几个主要类，再回来看 DOMContentLoaded 入口如何把它们串起来。
const sharedPriceTools = window.YanqiPriceConfig || null;
const sharedSpotCatalog = window.YanqiSpotCatalog || null;
const sharedBrandConfig = window.YanqiBrandConfig || null;
const sharedDiverProfile = window.YanqiDiverProfile || null;
const sharedShowcaseState = window.YanqiShowcaseState || null;
const HOME_SCROLL_STORAGE_KEY = 'YANQI_HOME_SCROLL_TARGET';
const HERO_HOTSPOTS_STAGE_STORAGE_KEY = 'YANQI_HOME_HOTSPOTS_STAGE_SIZE';
const STAGE_DEBUG_STORAGE_KEY = 'YANQI_STAGE_DEBUG_MODE';
const STAGE_DEBUG_QUERY_KEY = 'stageDebug';
const HOME_GUIDE_JUMP_STORAGE_KEY = 'YANQI_HOME_GUIDE_JUMP_MODE';
const HOME_GUIDE_JUMP_QUERY_KEY = 'guideJump';
const HOME_GUIDE_JUMP_DEFAULT_MODE = 'custom';
const HOME_GUIDE_JUMP_LONG_TRAVEL_RATIO = 1.75;
const HOME_GUIDE_JUMP_PROXIMITY_THRESHOLD = 12;

function resolveHomeGuideJumpMode() {
    return HOME_GUIDE_JUMP_DEFAULT_MODE;
}

function clearLegacyHomeGuideJumpDebugState() {
    try {
        localStorage.removeItem(HOME_GUIDE_JUMP_STORAGE_KEY);
    } catch (error) {
        // 本地存储不可用时静默降级。
    }

    try {
        const nextUrl = new URL(window.location.href);
        if (nextUrl.searchParams.has(HOME_GUIDE_JUMP_QUERY_KEY)) {
            nextUrl.searchParams.delete(HOME_GUIDE_JUMP_QUERY_KEY);
            window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
        }
    } catch (error) {
        // URL 处理失败时静默降级。
    }
}

clearLegacyHomeGuideJumpDebugState();

/**
 * resolveStageDebugMode() - 读取当前页面是否需要暴露舞台调试能力
 * @returns {boolean} - 当前是否启用舞台调试态
 */
function resolveStageDebugMode() {
    let stageDebugEnabled = false;

    try {
        const queryValue = new URLSearchParams(window.location.search).get(STAGE_DEBUG_QUERY_KEY);
        if (queryValue != null) {
            const normalized = String(queryValue).trim().toLowerCase();
            stageDebugEnabled = ['1', 'true', 'yes', 'on'].includes(normalized);

            if (stageDebugEnabled) {
                localStorage.setItem(STAGE_DEBUG_STORAGE_KEY, '1');
            } else if (['0', 'false', 'no', 'off'].includes(normalized)) {
                localStorage.removeItem(STAGE_DEBUG_STORAGE_KEY);
            }
        } else {
            stageDebugEnabled = localStorage.getItem(STAGE_DEBUG_STORAGE_KEY) === '1';
        }
    } catch (error) {
        stageDebugEnabled = false;
    }

    document.documentElement?.classList.toggle('yanqi-stage-debug', stageDebugEnabled);
    document.body?.classList.toggle('yanqi-stage-debug', stageDebugEnabled);
    return stageDebugEnabled;
}

const isStageDebugModeEnabled = resolveStageDebugMode();

/**
 * persistStageDebugMode(enabled) - 把舞台调试开关写入本地存储，并同步根节点类名
 * @param {boolean} enabled - 是否启用舞台调试
 * @returns {void}
 */
function persistStageDebugMode(enabled) {
    const nextEnabled = Boolean(enabled);

    try {
        if (nextEnabled) {
            localStorage.setItem(STAGE_DEBUG_STORAGE_KEY, '1');
        } else {
            localStorage.removeItem(STAGE_DEBUG_STORAGE_KEY);
        }
    } catch (error) {
        // 本地存储不可用时静默降级，保持按钮仍可点击。
    }

    document.documentElement?.classList.toggle('yanqi-stage-debug', nextEnabled);
    document.body?.classList.toggle('yanqi-stage-debug', nextEnabled);
}

/**
 * stripStageDebugQueryFromUrl() - 移除 stageDebug query，避免按钮切换后被旧 query 覆盖
 * @returns {void}
 */
function stripStageDebugQueryFromUrl() {
    try {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete(STAGE_DEBUG_QUERY_KEY);
        window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    } catch (error) {
        // URL 处理失败时保留当前地址，不影响主流程。
    }
}

/**
 * setupStageDebugToggle() - 给页面底部的舞台调试按钮绑定状态和切换逻辑
 * @returns {void}
 */
function setupStageDebugToggle() {
    const toggle = document.querySelector('[data-stage-debug-toggle]');
    if (!toggle) {
        return;
    }

    const state = toggle.querySelector('[data-stage-debug-state]');
    const syncState = (enabled) => {
        toggle.classList.toggle('is-active', enabled);
        toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        toggle.setAttribute('aria-label', enabled ? '关闭舞台调试' : '打开舞台调试');
        toggle.setAttribute('title', enabled ? '关闭舞台调试' : '打开舞台调试');
        if (state) {
            state.textContent = enabled ? '调试中' : '';
        }
    };

    syncState(isStageDebugModeEnabled);

    toggle.addEventListener('click', () => {
        const nextEnabled = !toggle.classList.contains('is-active');
        persistStageDebugMode(nextEnabled);
        syncState(nextEnabled);
        stripStageDebugQueryFromUrl();
        window.location.reload();
    });
}

// 价格展示工具：首页不再自己换汇，统一走共享人民币模块。
/**
 * normalizeDisplayPriceText(priceText) - 将原始价格文本整理成共享人民币展示文本
 * @param {string} priceText - 原始价格文本
 * @returns {string} - 转换后的人民币价格文本
 */
function normalizeDisplayPriceText(priceText) {
    return sharedPriceTools && typeof sharedPriceTools.normalizePriceText === 'function'
        ? sharedPriceTools.normalizePriceText(priceText)
        : String(priceText || '');
}

/**
 * getSpotBasePriceText(spotId, fallbackPriceText) - 获取首页潜点卡片应展示的统一起价
 * @param {number} spotId - 潜点 id
 * @param {string} fallbackPriceText - 兜底价格文本
 * @returns {string} - 当前潜点起价文本
 */
function getSpotBasePriceText(spotId, fallbackPriceText) {
    return sharedPriceTools && typeof sharedPriceTools.getDestinationPriceText === 'function'
        ? sharedPriceTools.getDestinationPriceText(spotId, fallbackPriceText)
        : normalizeDisplayPriceText(fallbackPriceText);
}

/**
 * convertSpotCardPrices(spots) - 批量转换潜点卡片数据中的价格字段
 * @param {Array<Object>} spots - 潜点数据数组
 * @returns {Array<Object>} - 转换后的潜点数据数组
 */
function convertSpotCardPrices(spots) {
    return spots.map((spot) => ({
        ...spot,
        price: normalizeDisplayPriceText(spot.price)
    }));
}

/**
 * safeReadHeroHotspotsStageSize() - 读取首页今日海域舞台上次保存的宽高
 * @returns {{width:number,height:number,shiftX:number}|null} - 有效尺寸对象；读取失败或无记录时返回 null
 */
function safeReadHeroHotspotsStageSize() {
    try {
        const raw = localStorage.getItem(HERO_HOTSPOTS_STAGE_STORAGE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.width !== 'number' || typeof parsed.height !== 'number') {
            return null;
        }

        return {
            width: parsed.width,
            height: parsed.height,
            shiftX: typeof parsed.shiftX === 'number' ? parsed.shiftX : 0
        };
    } catch (error) {
        return null;
    }
}

/**
 * safeSaveHeroHotspotsStageSize(size) - 保存用户拖拽后的今日海域舞台尺寸
 * @param {{width:number,height:number,shiftX:number}} size - 最新宽高和横向偏移
 * @returns {void}
 */
function safeSaveHeroHotspotsStageSize(size) {
    try {
        localStorage.setItem(HERO_HOTSPOTS_STAGE_STORAGE_KEY, JSON.stringify(size));
    } catch (error) {
        // 本地存储异常时静默降级，不打断首页主流程。
    }
}

/**
 * clearHeroHotspotsStageSize(shell) - 清除首页今日海域舞台的自定义尺寸
 * @param {HTMLElement|null} shell - 今日海域舞台外壳
 * @returns {void}
 */
function clearHeroHotspotsStageSize(shell) {
    if (!shell) {
        return;
    }

    shell.style.removeProperty('--hero-hotspots-stage-width');
    shell.style.removeProperty('--hero-hotspots-stage-height');
    shell.style.removeProperty('--hero-hotspots-stage-shift-x');

    try {
        localStorage.removeItem(HERO_HOTSPOTS_STAGE_STORAGE_KEY);
    } catch (error) {
        // 忽略本地存储失败，保持页面可用。
    }
}

/**
 * measureHeroHotspotsStageNaturalHeight(shell, width) - 读取舞台在指定宽度下的自然内容高度
 * @param {HTMLElement|null} shell - 今日海域舞台外壳
 * @param {number|null} width - 目标宽度；为空时沿用当前宽度
 * @returns {number} - 不带强制外壳高度时的内容真实高度
 */
function measureHeroHotspotsStageNaturalHeight(shell, width = null) {
    const stageContent = shell?.querySelector('.hero-hotspots-shell');
    if (!shell || !stageContent) {
        return 520;
    }

    const previousWidth = shell.style.getPropertyValue('--hero-hotspots-stage-width');
    const previousHeight = shell.style.getPropertyValue('--hero-hotspots-stage-height');
    const previousMinHeight = stageContent.style.minHeight;

    if (typeof width === 'number' && Number.isFinite(width)) {
        shell.style.setProperty('--hero-hotspots-stage-width', `${Math.round(width)}px`);
    }
    shell.style.removeProperty('--hero-hotspots-stage-height');
    stageContent.style.minHeight = '0';

    const scrollHeight = Math.ceil(stageContent.scrollHeight || 0);
    const rectHeight = Math.ceil(stageContent.getBoundingClientRect().height || 0);

    if (previousWidth) {
        shell.style.setProperty('--hero-hotspots-stage-width', previousWidth);
    } else {
        shell.style.removeProperty('--hero-hotspots-stage-width');
    }

    if (previousHeight) {
        shell.style.setProperty('--hero-hotspots-stage-height', previousHeight);
    } else {
        shell.style.removeProperty('--hero-hotspots-stage-height');
    }

    if (previousMinHeight) {
        stageContent.style.minHeight = previousMinHeight;
    } else {
        stageContent.style.removeProperty('min-height');
    }

    return Math.max(520, scrollHeight, rectHeight);
}

/**
 * clampHeroHotspotsStageSize(shell, width, height) - 限制首页今日海域舞台在桌面端的可调范围
 * @param {HTMLElement} shell - 今日海域舞台外壳
 * @param {number} width - 目标宽度
 * @param {number} height - 目标高度
 * @param {number} shiftX - 目标横向偏移
 * @returns {{width:number,height:number,shiftX:number}} - 经过视口限制后的安全尺寸
 */
function clampHeroHotspotsStageSize(shell, width, height, shiftX = 0) {
    const sidePadding = Math.max(54, Math.min(window.innerWidth * 0.08, 180));
    const minWidth = 980;
    const maxWidth = Math.max(minWidth, Math.min(1560, window.innerWidth - sidePadding));
    const clampedWidth = Math.min(Math.max(width, minWidth), maxWidth);
    const minHeight = measureHeroHotspotsStageNaturalHeight(shell, clampedWidth);
    const maxHeight = Math.max(
        minHeight,
        Math.min(1120, Math.max(window.innerHeight - 28, minHeight + 220))
    );
    const availableWidth = Math.max(clampedWidth, window.innerWidth - sidePadding);
    const maxShiftX = Math.max(0, (availableWidth - clampedWidth) / 2);

    return {
        width: clampedWidth,
        height: Math.min(Math.max(height, minHeight), maxHeight),
        shiftX: Math.min(Math.max(shiftX, -maxShiftX), maxShiftX)
    };
}

/**
 * applyHeroHotspotsStageSize(shell, size) - 把今日海域舞台尺寸写回 CSS 变量
 * @param {HTMLElement|null} shell - 今日海域舞台外壳
 * @param {{width:number,height:number,shiftX:number}|null} size - 需要应用的尺寸
 * @returns {void}
 */
function applyHeroHotspotsStageSize(shell, size) {
    if (!shell) {
        return;
    }

    if (!size) {
        shell.style.removeProperty('--hero-hotspots-stage-width');
        shell.style.removeProperty('--hero-hotspots-stage-height');
        shell.style.removeProperty('--hero-hotspots-stage-shift-x');
        return;
    }

    const nextSize = clampHeroHotspotsStageSize(shell, size.width, size.height, size.shiftX || 0);
    shell.style.setProperty('--hero-hotspots-stage-width', `${Math.round(nextSize.width)}px`);
    shell.style.setProperty('--hero-hotspots-stage-height', `${Math.round(nextSize.height)}px`);
    shell.style.setProperty('--hero-hotspots-stage-shift-x', `${Math.round(nextSize.shiftX)}px`);
}

/**
 * createBufferedLiveAnnouncer(target, delay) - 为读屏摘要创建合并更新的播报器
 * @param {HTMLElement|null} target - 隐藏 live 区域节点
 * @param {number} delay - 合并等待时长
 * @returns {(message: string) => void} - 可反复调用的摘要播报函数
 */
function createBufferedLiveAnnouncer(target, delay = 320) {
    let timer = 0;

    return (message) => {
        if (!target) {
            return;
        }

        const nextMessage = String(message || '').trim();
        if (!nextMessage) {
            return;
        }

        if (timer) {
            window.clearTimeout(timer);
        }

        timer = window.setTimeout(() => {
            target.textContent = '';
            window.requestAnimationFrame(() => {
                target.textContent = nextMessage;
            });
            timer = 0;
        }, delay);
    };
}

/**
 * scheduleIdleTask(callback, timeout) - 在浏览器空闲时执行低优先级初始化，必要时按超时兜底
 * @param {Function} callback - 需要延后执行的任务
 * @param {number} timeout - 最长等待时间
 * @returns {Function} - 可用于取消该任务的函数
 */
function scheduleIdleTask(callback, timeout = 1200) {
    if (typeof callback !== 'function') {
        return () => {};
    }

    let isCancelled = false;
    let taskId = 0;
    const run = () => {
        if (isCancelled) {
            return;
        }

        isCancelled = true;
        callback();
    };

    if (typeof window.requestIdleCallback === 'function') {
        taskId = window.requestIdleCallback(run, { timeout });
        return () => {
            if (isCancelled) {
                return;
            }

            isCancelled = true;
            if (typeof window.cancelIdleCallback === 'function') {
                window.cancelIdleCallback(taskId);
            }
        };
    }

    taskId = window.setTimeout(run, Math.min(timeout, 360));
    return () => {
        if (isCancelled) {
            return;
        }

        isCancelled = true;
        window.clearTimeout(taskId);
    };
}

/**
 * createDeferredSectionBootstrap(selector, bootstrap, options) - 让下方区块在空闲或接近视口时再初始化
 * @param {string} selector - 目标区块选择器
 * @param {Function} bootstrap - 真正的初始化函数
 * @param {{ immediate?: boolean, idleTimeoutMs?: number|null, enableIdleBootstrap?: boolean, rootMargin?: string, threshold?: number, viewportLeadRatio?: number, viewportBottomRatio?: number }} options - 启动配置
 * @returns {Function} - 可重复调用的“确保已启动”函数
 */
function createDeferredSectionBootstrap(selector, bootstrap, options = {}) {
    const target = selector ? document.querySelector(selector) : null;
    const {
        immediate = false,
        idleTimeoutMs = 1200,
        enableIdleBootstrap = true,
        rootMargin = '180% 0px 140% 0px',
        threshold = 0.01,
        viewportLeadRatio = 1.4,
        viewportBottomRatio = -0.35
    } = options;
    let hasBootstrapped = false;
    let cancelIdleTask = () => {};
    let observer = null;
    let detachViewportBootstrap = () => {};

    const releaseViewportBootstrap = () => {
        detachViewportBootstrap();
        detachViewportBootstrap = () => {};
    };

    const shouldBootstrapFromViewport = () => {
        if (!target) {
            return false;
        }

        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const rect = target.getBoundingClientRect();
        return rect.top <= viewportHeight * viewportLeadRatio && rect.bottom >= viewportHeight * viewportBottomRatio;
    };

    function requestViewportBootstrapCheck() {
        if (hasBootstrapped) {
            return;
        }

        if (shouldBootstrapFromViewport()) {
            runBootstrap();
        }
    }

    const runBootstrap = () => {
        if (hasBootstrapped) {
            return;
        }

        hasBootstrapped = true;
        cancelIdleTask();
        releaseViewportBootstrap();
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        bootstrap();
        if (typeof homeViewportCoordinator !== 'undefined') {
            homeViewportCoordinator.requestMeasure();
        }
    };

    if (!target || immediate) {
        runBootstrap();
        return runBootstrap;
    }

    if (enableIdleBootstrap && Number.isFinite(idleTimeoutMs) && idleTimeoutMs > 0) {
        cancelIdleTask = scheduleIdleTask(runBootstrap, idleTimeoutMs);
    }

    if (typeof homeViewportCoordinator !== 'undefined') {
        detachViewportBootstrap = homeViewportCoordinator.register({
            measure: requestViewportBootstrapCheck,
            update: requestViewportBootstrapCheck
        });
    } else {
        window.addEventListener('scroll', requestViewportBootstrapCheck, { passive: true });
        window.addEventListener('resize', requestViewportBootstrapCheck, { passive: true });
        detachViewportBootstrap = () => {
            window.removeEventListener('scroll', requestViewportBootstrapCheck);
            window.removeEventListener('resize', requestViewportBootstrapCheck);
        };
    }

    requestViewportBootstrapCheck();

    if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
                runBootstrap();
            }
        }, {
            rootMargin,
            threshold
        });
        observer.observe(target);
    }

    return runBootstrap;
}

/**
 * parseCssTimeValueToMs(value) - 把 CSS duration / delay 文本转换成毫秒数
 * @param {string} value - CSS 时间值，例如 760ms / 1.04s / 300ms, 60ms
 * @returns {number} - 解析后的毫秒数
 */
function parseCssTimeValueToMs(value) {
    if (typeof value !== 'string') {
        return 0;
    }

    return value
        .split(',')
        .map((part) => {
            const normalized = part.trim();
            if (!normalized) {
                return 0;
            }

            if (normalized.endsWith('ms')) {
                return Number.parseFloat(normalized) || 0;
            }

            if (normalized.endsWith('s')) {
                return (Number.parseFloat(normalized) || 0) * 1000;
            }

            return Number.parseFloat(normalized) || 0;
        })
        .reduce((max, current) => Math.max(max, current), 0);
}

/**
 * hasActivePageEntryTransition() - 判断当前页面是否仍处于跨页入场动画阶段
 * @returns {boolean} - 是否还在执行页面入场动画
 */
function hasActivePageEntryTransition() {
    const body = document.body;
    if (!body || !body.classList.contains('page-transition-active')) {
        return false;
    }

    return [
        'page-enter-from-bottom',
        'page-enter-from-top',
        'page-ocean-dive-enter',
        'page-ocean-surface-enter',
        'page-ocean-swim-enter'
    ].some((className) => body.classList.contains(className));
}

/**
 * runAfterPageEntryTransition(callback) - 等首页跨页入场动画结束后再执行回调
 * @param {() => void} callback - 需要延后执行的逻辑
 * @returns {() => void} - 可用于提前取消等待的清理函数
 */
function runAfterPageEntryTransition(callback) {
    if (typeof callback !== 'function') {
        return () => {};
    }

    if (!hasActivePageEntryTransition()) {
        callback();
        return () => {};
    }

    const body = document.body;
    const pageStage = document.querySelector('.page-stage');
    const rootStyle = getComputedStyle(document.documentElement);
    const stageStyle = pageStage ? getComputedStyle(pageStage) : null;
    const fallbackDelay = Math.max(
        parseCssTimeValueToMs(rootStyle.getPropertyValue('--page-enter-duration')),
        parseCssTimeValueToMs(rootStyle.getPropertyValue('--page-ocean-enter-duration')),
        parseCssTimeValueToMs(stageStyle?.animationDuration || ''),
        320
    ) + 140;

    let settled = false;
    let timeoutId = 0;
    let mutationObserver = null;

    const cleanup = () => {
        if (timeoutId) {
            window.clearTimeout(timeoutId);
            timeoutId = 0;
        }

        pageStage?.removeEventListener('animationend', checkSettled);
        mutationObserver?.disconnect();
        mutationObserver = null;
    };

    const finish = () => {
        if (settled) {
            return;
        }

        settled = true;
        cleanup();
        callback();
    };

    const checkSettled = () => {
        if (!hasActivePageEntryTransition()) {
            finish();
        }
    };

    mutationObserver = new MutationObserver(checkSettled);
    mutationObserver.observe(body, {
        attributes: true,
        attributeFilter: ['class']
    });

    pageStage?.addEventListener('animationend', checkSettled);
    timeoutId = window.setTimeout(finish, fallbackDelay);
    window.requestAnimationFrame(checkSettled);

    return cleanup;
}

/**
 * observeOnceInViewport(target, onReveal, options) - 统一的一次性进入视口触发器
 * @param {Element|null} target - 需要观察的目标元素
 * @param {(entry?: IntersectionObserverEntry) => void} onReveal - 进入视口后执行的回调
 * @param {{ threshold?: number|number[], rootMargin?: string, deferDuringPageEntryTransition?: boolean }} options - 观察器配置
 * @returns {IntersectionObserver|null} - 观察器实例，或在降级场景下返回 null
 */
function observeOnceInViewport(target, onReveal, options = {}) {
    if (!target || typeof onReveal !== 'function') {
        return null;
    }

    const {
        threshold = 0.18,
        rootMargin = '0px 0px -10% 0px',
        deferDuringPageEntryTransition = true
    } = options;

    let observer = null;

    const startObserving = () => {
        if (!target.isConnected) {
            return;
        }

        if (!('IntersectionObserver' in window)) {
            onReveal();
            return;
        }

        observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting && entry.intersectionRatio <= 0) {
                    return;
                }

                observer?.unobserve(entry.target);
                onReveal(entry);
            });
        }, {
            threshold,
            rootMargin
        });

        observer.observe(target);
    };

    if (deferDuringPageEntryTransition) {
        runAfterPageEntryTransition(startObserving);
    } else {
        startObserving();
    }

    return observer;
}

/**
 * clamp(value, min, max) - 提供首页多个模块共享的数值约束工具
 * @param {number} value - 原始数值
 * @param {number} min - 下限
 * @param {number} max - 上限
 * @returns {number} - 约束后的安全值
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * resolveHomePerformanceProfile() - 根据设备能力和交互方式，给首页选择合适的性能档位
 * @returns {{mode:string,coarsePointer:boolean,compactViewport:boolean,lowMemory:boolean,lowConcurrency:boolean,lowEnd:boolean,lite:boolean}}
 */
function resolveHomePerformanceProfile() {
    const anyCoarsePointer = window.matchMedia?.('(any-pointer: coarse)')?.matches || false;
    const anyFinePointer = window.matchMedia?.('(any-pointer: fine)')?.matches
        || window.matchMedia?.('(pointer: fine)')?.matches
        || false;
    // 触屏笔电这类混合输入设备通常同时命中 coarse 和 fine。
    // 这里把 coarsePointer 收窄成“只有粗指针、没有精细指针”，
    // 避免桌面端鼠标仍在时把自动滑动和惯性误判关闭。
    const coarsePointer = anyCoarsePointer && !anyFinePointer;
    const compactViewport = window.matchMedia?.('(max-width: 1180px)')?.matches || false;
    const lowMemory = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory > 0 && navigator.deviceMemory <= 4;
    const lowConcurrency = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4;
    const lowEnd = lowMemory || lowConcurrency;
    const desktopFullMode = anyFinePointer;
    const lite = desktopFullMode ? false : (lowEnd || (coarsePointer && compactViewport));

    return {
        mode: desktopFullMode ? 'full' : (lite ? 'lite' : (coarsePointer || compactViewport ? 'balanced' : 'full')),
        coarsePointer,
        compactViewport,
        lowMemory,
        lowConcurrency,
        lowEnd,
        lite
    };
}

/**
 * applyHomePerformanceProfile(profile) - 把首页性能档位写到 body 上，供样式表降载
 * @param {{mode:string}|null} profile - 首页性能档位
 * @returns {void}
 */
function applyHomePerformanceProfile(profile) {
    if (!document.body) {
        return;
    }

    const mode = profile?.mode || 'full';
    document.body.dataset.homePerformance = mode;
    document.body.classList.toggle('home-performance-lite', mode === 'lite');
    document.body.classList.toggle('home-performance-balanced', mode === 'balanced');
}

/**
 * createHomeViewportCoordinator() - 把首页滚动、尺寸和可见状态同步收拢到单一调度入口
 * @returns {{register:function,requestUpdate:function,requestMeasure:function,readHomeSectionMetrics:function,readHomeSectionMetric:function}}
 */
function resolveHomeSectionProbeElement(selector, section = null) {
    const resolvedSection = section || (selector ? document.querySelector(selector) : null);
    if (!resolvedSection) {
        return null;
    }

    if (selector === '#featured-destinations') {
        return resolvedSection.querySelector('#curatedWatersStage') || resolvedSection;
    }

    if (selector === '#dive-match') {
        return resolvedSection.querySelector('#diveMatchStage') || resolvedSection;
    }

    if (selector === '#homeFooter') {
        return resolvedSection.querySelector('.footer-shell') || resolvedSection;
    }

    return resolvedSection;
}

function createHomeViewportCoordinator() {
    const listeners = new Set();
    let updateRaf = 0;
    let measureRaf = 0;
    let measureTimer = 0;
    let deferredResumeMeasureTimer = 0;
    let suspendDepth = 0;
    let pendingUpdate = false;
    let pendingMeasure = false;
    let pendingMeasureForce = false;
    let attached = false;
    let lastLockedUpdateAt = 0;
    let sectionMetricsVersion = 0;
    let syncedDepthMetricsVersion = 0;
    let lastMeasuredAt = 0;
    let homeSectionMetrics = null;
    const sectionElementCache = new Map();
    const trackedSectionSelectors = ['#hero-home', '#featured-destinations', '#dive-match', '#why-yanqi', '#homeFooter'];
    const depthMetricSelectors = [
        { sourceSelector: '#hero-home', pointSelector: '#hero-home' },
        { sourceSelector: '#featured-destinations', pointSelector: '#featured-destinations' },
        { sourceSelector: '#dive-match', pointSelector: '#dive-match' },
        { sourceSelector: '#why-yanqi', pointSelector: '#why-yanqi' },
        { sourceSelector: '#homeFooter', pointSelector: '.footer' }
    ];

    const resolveSectionElement = (selector) => {
        const cached = sectionElementCache.get(selector);
        if (cached && cached.isConnected) {
            return cached;
        }

        const next = document.querySelector(selector);
        sectionElementCache.set(selector, next || null);
        return next;
    };

    const readElementMetric = (element) => {
        if (!element) {
            return null;
        }

        const rect = element.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        const height = Math.max(1, rect.height || 0);

        return {
            top,
            height,
            bottom: top + height
        };
    };

    const computeSectionMetrics = () => {
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const documentHeight = Math.max(
            document.documentElement?.scrollHeight || 0,
            document.body?.scrollHeight || 0,
            viewportHeight
        );
        const scrollLimit = Math.max(documentHeight - viewportHeight, 1);
        const navbar = document.querySelector('.navbar');
        const navbarHeight = navbar ? navbar.offsetHeight : 0;
        const navOffsetScroll = navbarHeight + 14;
        const navOffsetNav = navbarHeight + 18;
        const sections = {};

        trackedSectionSelectors.forEach((selector) => {
            const section = resolveSectionElement(selector);
            const sectionMetric = readElementMetric(section);
            const anchorElement = resolveHomeSectionProbeElement(selector, section);
            const anchorMetric = readElementMetric(anchorElement);
            const threshold = Number.isFinite(sectionMetric?.top)
                ? Math.max(0, sectionMetric.top - viewportHeight * 0.42)
                : null;

            sections[selector] = {
                selector,
                top: sectionMetric?.top ?? null,
                height: sectionMetric?.height ?? null,
                threshold,
                sectionTop: sectionMetric?.top ?? null,
                sectionHeight: sectionMetric?.height ?? null,
                sectionBottom: sectionMetric?.bottom ?? null,
                anchorTop: anchorMetric?.top ?? null,
                anchorHeight: anchorMetric?.height ?? null,
                anchorBottom: anchorMetric?.bottom ?? null
            };
        });

        const featuredTop = sections['#featured-destinations']?.sectionTop;
        const diveMatchTop = sections['#dive-match']?.sectionTop;
        const featuredThreshold = Number.isFinite(featuredTop)
            ? Math.max(0, featuredTop - viewportHeight * 0.42)
            : null;
        const diveMatchThreshold = Number.isFinite(diveMatchTop)
            ? Math.max(0, diveMatchTop - viewportHeight * 0.42)
            : null;

        const layerSections = Array.from(document.querySelectorAll('[data-home-layer]')).map((section) => {
            const metric = readElementMetric(section);
            return {
                id: section.id || '',
                key: section.dataset.homeLayer || '',
                top: metric?.top ?? null,
                height: metric?.height ?? null,
                bottom: metric?.bottom ?? null
            };
        });
        const points = depthMetricSelectors
            .map(({ sourceSelector, pointSelector }) => {
                const sectionMetric = sections[sourceSelector];
                if (!Number.isFinite(sectionMetric?.top)) {
                    return null;
                }

                return {
                    selector: pointSelector,
                    top: sectionMetric.top,
                    height: Number.isFinite(sectionMetric.height) ? sectionMetric.height : null,
                    threshold: Number.isFinite(sectionMetric.threshold) ? sectionMetric.threshold : null
                };
            })
            .filter(Boolean);

        sectionMetricsVersion += 1;
        homeSectionMetrics = {
            version: sectionMetricsVersion,
            measuredAt: performance.now(),
            viewportHeight,
            documentHeight,
            scrollLimit,
            navOffsets: {
                scrollToSection: navOffsetScroll,
                navState: navOffsetNav,
                seaGuide: navOffsetNav
            },
            sections,
            points,
            thresholds: {
                featuredDepth: featuredThreshold,
                diveMatchDepth: diveMatchThreshold
            },
            layerSections
        };
    };

    const syncDepthManagerSectionMetrics = () => {
        const metrics = homeSectionMetrics;
        if (!metrics || syncedDepthMetricsVersion === metrics.version) {
            return;
        }

        const depthManager = window.DepthManager;
        if (!depthManager || typeof depthManager.setHomeSectionMetrics !== 'function') {
            return;
        }

        try {
            depthManager.setHomeSectionMetrics(metrics);
            syncedDepthMetricsVersion = metrics.version;
        } catch (error) {
            // DepthManager 可能尚未升级该接口，失败时静默降级。
        }
    };

    const shouldDeferLockedUpdate = () => {
        if (typeof isHomeInteractionLocked !== 'function' || !isHomeInteractionLocked()) {
            return false;
        }

        const now = performance.now();
        if (now - lastLockedUpdateAt < 84) {
            return true;
        }

        lastLockedUpdateAt = now;
        return false;
    };

    const runPhase = (phase) => {
        listeners.forEach((entry) => {
            const handler = phase === 'measure' ? entry.measure : entry.update;
            if (typeof handler === 'function') {
                handler();
            }
        });
    };

    const runMeasureCycle = () => {
        computeSectionMetrics();
        lastMeasuredAt = performance.now();
        syncDepthManagerSectionMetrics();
        runPhase('measure');
        if (shouldDeferLockedUpdate()) {
            return;
        }
        runPhase('update');
    };

    const scheduleMeasureFrame = () => {
        if (measureRaf) {
            return;
        }

        measureRaf = window.requestAnimationFrame(() => {
            measureRaf = 0;
            runMeasureCycle();
        });
    };

    const requestUpdate = () => {
        if (suspendDepth > 0) {
            pendingUpdate = true;
            return;
        }

        if (updateRaf) {
            return;
        }

        updateRaf = window.requestAnimationFrame(() => {
            updateRaf = 0;
            if (shouldDeferLockedUpdate()) {
                return;
            }
            runPhase('update');
        });
    };

    const requestMeasure = (options = {}) => {
        const force = Boolean(options?.force);
        if (suspendDepth > 0) {
            pendingMeasure = true;
            pendingMeasureForce = pendingMeasureForce || force;
            return;
        }

        if (measureRaf) {
            return;
        }

        if (measureTimer) {
            if (force) {
                window.clearTimeout(measureTimer);
                measureTimer = 0;
            } else {
                return;
            }
        }

        const now = performance.now();
        const isTraveling = typeof HOME_INTERACTION_STATE !== 'undefined'
            && Boolean(HOME_INTERACTION_STATE.scrollTraveling);
        const minIntervalMs = force || !homeSectionMetrics
            ? 0
            : (isTraveling ? 140 : 56);
        const waitMs = Math.max(0, minIntervalMs - (now - lastMeasuredAt));

        if (waitMs <= 0) {
            scheduleMeasureFrame();
            return;
        }

        measureTimer = window.setTimeout(() => {
            measureTimer = 0;
            scheduleMeasureFrame();
        }, waitMs);
    };

    const attach = () => {
        if (attached) {
            return;
        }

        attached = true;
        window.addEventListener('scroll', requestUpdate, { passive: true });
        window.addEventListener('resize', requestMeasure);
    };

    const cancelPendingSchedules = () => {
        if (updateRaf) {
            cancelAnimationFrame(updateRaf);
            updateRaf = 0;
        }

        if (measureRaf) {
            cancelAnimationFrame(measureRaf);
            measureRaf = 0;
        }

        if (measureTimer) {
            window.clearTimeout(measureTimer);
            measureTimer = 0;
        }

        if (deferredResumeMeasureTimer) {
            window.clearTimeout(deferredResumeMeasureTimer);
            deferredResumeMeasureTimer = 0;
        }
    };

    const suspend = () => {
        suspendDepth += 1;
        if (suspendDepth === 1) {
            cancelPendingSchedules();
        }
    };

    const resume = (options = {}) => {
        if (suspendDepth === 0) {
            return;
        }

        suspendDepth = Math.max(0, suspendDepth - 1);
        if (suspendDepth > 0) {
            return;
        }

        const shouldFlush = options?.flush !== false;
        const shouldMeasure = pendingMeasure;
        const shouldForceMeasure = pendingMeasureForce;
        const shouldUpdate = pendingUpdate;
        const deferMeasureMs = Math.max(0, Number(options?.deferMeasureMs) || 0);

        pendingMeasure = false;
        pendingMeasureForce = false;
        pendingUpdate = false;

        if (!shouldFlush) {
            return;
        }

        if (shouldUpdate) {
            requestUpdate();
        }

        if (!shouldMeasure) {
            return;
        }

        if (deferMeasureMs <= 0) {
            requestMeasure(shouldForceMeasure ? { force: true } : undefined);
            return;
        }

        if (deferredResumeMeasureTimer) {
            window.clearTimeout(deferredResumeMeasureTimer);
        }

        deferredResumeMeasureTimer = window.setTimeout(() => {
            deferredResumeMeasureTimer = 0;
            requestMeasure(shouldForceMeasure ? { force: true } : undefined);
        }, deferMeasureMs);
    };

    return {
        register({ measure, update } = {}) {
            attach();
            const entry = {
                measure: typeof measure === 'function' ? measure : null,
                update: typeof update === 'function' ? update : null
            };

            listeners.add(entry);
            return () => {
                listeners.delete(entry);
            };
        },
        readHomeSectionMetrics() {
            return homeSectionMetrics;
        },
        readHomeSectionMetric(selector) {
            if (!selector || !homeSectionMetrics) {
                return null;
            }

            return homeSectionMetrics.sections?.[selector] || null;
        },
        requestUpdate,
        requestMeasure,
        suspend,
        resume
    };
}

const homeViewportCoordinator = createHomeViewportCoordinator();
let homeHydrationMeasureRafId = 0;
let homeHydrationMeasureNeedsForce = false;
let homeGuideScrollRequestToken = 0;

function scheduleHomeHydrationViewportRefresh(options = {}) {
    if (typeof homeViewportCoordinator === 'undefined') {
        return;
    }

    if (options.updateOnly) {
        homeViewportCoordinator.requestUpdate();
        return;
    }

    homeHydrationMeasureNeedsForce = homeHydrationMeasureNeedsForce || Boolean(options.force);
    if (homeHydrationMeasureRafId) {
        return;
    }

    homeHydrationMeasureRafId = window.requestAnimationFrame(() => {
        homeHydrationMeasureRafId = 0;
        const shouldForce = homeHydrationMeasureNeedsForce;
        homeHydrationMeasureNeedsForce = false;
        homeViewportCoordinator.requestMeasure(shouldForce ? { force: true } : undefined);
    });
}

const HOME_HERO_DEFAULT_SPOT_ID = 13;
const HOME_CURATED_DEFAULT_DESTINATION_ID = 13;
const HOME_IMAGE_MANIFEST_PATH = 'assets/images/home/home-image-manifest.json';
const HOME_IMAGE_MANIFEST_GLOBAL_KEYS = Object.freeze([
    'YANQI_HOME_IMAGE_MANIFEST',
    'YanqiHomeImageManifest',
    '__YANQI_HOME_IMAGE_MANIFEST__'
]);
const HOME_IMAGE_RENDER_SLOTS = Object.freeze({
    heroCard: Object.freeze({ width: 280, height: 180 }),
    curatedNavThumb: Object.freeze({ width: 56, height: 56 }),
    curatedDisplay: Object.freeze({ width: 760, height: 720 }),
    diveMatchCard: Object.freeze({ width: 520, height: 360 })
});
const HOME_IMAGE_FALLBACK_MANIFEST = Object.freeze([
    { original: 'assets/images/sipadan.jpg', compressed: 'assets/images/home/sipadan.webp', width: 1440, height: 1080 },
    { original: 'assets/images/palau.jpg', compressed: 'assets/images/home/palau.webp', width: 2400, height: 1600 },
    { original: 'assets/images/blue-hole.jpg', compressed: 'assets/images/home/blue-hole.webp', width: 1711, height: 2248 },
    { original: 'assets/images/timor.jpg', compressed: 'assets/images/home/timor.webp', width: 1080, height: 1903 },
    { original: 'assets/images/pohnpei.jpg', compressed: 'assets/images/home/pohnpei.webp', width: 1079, height: 1417 },
    { original: 'assets/images/komodo.jpg', compressed: 'assets/images/home/komodo.webp', width: 1426, height: 2564 },
    { original: 'assets/images/tuamotu.jpg', compressed: 'assets/images/home/tuamotu.webp', width: 1920, height: 1280 },
    { original: 'assets/images/mabul.jpg', compressed: 'assets/images/home/mabul.webp', width: 1080, height: 1606 },
    { original: 'assets/images/maldives-liveaboard.jpg', compressed: 'assets/images/home/maldives-liveaboard.webp', width: 1991, height: 1080 },
    { original: 'assets/images/coron-review-1-island-chain.jpg', compressed: 'assets/images/home/coron-review-1-island-chain.webp', width: 1280, height: 720 },
    { original: 'assets/images/bohol.jpg', compressed: 'assets/images/home/bohol.webp', width: 1280, height: 960 },
    { original: 'assets/images/racha.jpg', compressed: 'assets/images/home/racha.webp', width: 1439, height: 842 },
    { original: 'assets/images/redang.jpg', compressed: 'assets/images/home/redang.webp', width: 2200, height: 1117 }
]);

function getHomeHeroInitialSpotId() {
    const recentSpotId = Number(sharedShowcaseState?.getRecentSpotId?.() || 0);
    return Number.isFinite(recentSpotId) && recentSpotId > 0
        ? recentSpotId
        : HOME_HERO_DEFAULT_SPOT_ID;
}
const HOME_IMAGE_ASSET_MAP = new Map();
let homeImageManifestPromise = null;

function normalizeHomeImagePath(path) {
    return String(path || '').trim().replace(/\\/g, '/');
}

function normalizeHomeImageManifestEntries(manifest) {
    if (!manifest) {
        return [];
    }

    if (Array.isArray(manifest)) {
        return manifest;
    }

    if (typeof manifest === 'object') {
        return Object.entries(manifest).map(([original, value]) => {
            if (typeof value === 'string') {
                return { original, compressed: value };
            }

            if (value && typeof value === 'object') {
                return {
                    original,
                    compressed: value.compressed || value.src || value.image || '',
                    width: value.width,
                    height: value.height
                };
            }

            return null;
        }).filter(Boolean);
    }

    return [];
}

function registerHomeImageManifestEntries(manifest) {
    const entries = normalizeHomeImageManifestEntries(manifest);
    entries.forEach((entry) => {
        const original = normalizeHomeImagePath(entry?.original);
        const compressed = normalizeHomeImagePath(entry?.compressed);
        if (!original || !compressed) {
            return;
        }

        HOME_IMAGE_ASSET_MAP.set(original, {
            compressed,
            width: Number.isFinite(entry?.width) && entry.width > 0 ? Math.round(entry.width) : null,
            height: Number.isFinite(entry?.height) && entry.height > 0 ? Math.round(entry.height) : null
        });
    });
}

function readHomeImageManifestFromWindow() {
    for (const key of HOME_IMAGE_MANIFEST_GLOBAL_KEYS) {
        const manifest = window[key];
        if (manifest) {
            return manifest;
        }
    }

    return null;
}

function ensureHomeImageManifestReady() {
    if (homeImageManifestPromise) {
        return homeImageManifestPromise;
    }

    registerHomeImageManifestEntries(HOME_IMAGE_FALLBACK_MANIFEST);
    const windowManifest = readHomeImageManifestFromWindow();
    if (windowManifest) {
        registerHomeImageManifestEntries(windowManifest);
    }

    if (typeof fetch !== 'function' || window.location.protocol === 'file:') {
        homeImageManifestPromise = Promise.resolve();
        return homeImageManifestPromise;
    }

    homeImageManifestPromise = fetch(HOME_IMAGE_MANIFEST_PATH, { cache: 'force-cache' })
        .then((response) => (response.ok ? response.json() : null))
        .then((manifest) => {
            if (manifest) {
                registerHomeImageManifestEntries(manifest);
            }
        })
        .catch(() => {
            // Manifest 拉取失败时保持静默，继续使用内置映射和原图回退。
        });

    return homeImageManifestPromise;
}

async function settleHomeImageManifest(maxWaitMs = 220) {
    const waitMs = Number.isFinite(maxWaitMs) && maxWaitMs > 0
        ? Math.round(maxWaitMs)
        : 0;
    const manifestReady = ensureHomeImageManifestReady();

    if (!waitMs) {
        await manifestReady;
        return;
    }

    await Promise.race([
        manifestReady,
        new Promise((resolve) => {
            window.setTimeout(resolve, waitMs);
        })
    ]);
}

function resolveHomeImageAsset(imagePath) {
    const originalSrc = normalizeHomeImagePath(imagePath);
    if (!originalSrc) {
        return {
            src: '',
            fallbackSrc: '',
            originalSrc: ''
        };
    }

    if (originalSrc.includes('/home/')) {
        return {
            src: originalSrc,
            fallbackSrc: originalSrc,
            originalSrc
        };
    }

    const mapped = HOME_IMAGE_ASSET_MAP.get(originalSrc);
    if (!mapped?.compressed) {
        return {
            src: originalSrc,
            fallbackSrc: originalSrc,
            originalSrc
        };
    }

    return {
        src: mapped.compressed,
        fallbackSrc: originalSrc,
        originalSrc
    };
}

function withHomeImageDescriptor(record) {
    const imageAsset = resolveHomeImageAsset(record.image);
    return {
        ...record,
        imageOriginal: imageAsset.originalSrc,
        image: imageAsset.src,
        imageFallback: imageAsset.fallbackSrc
    };
}

function withHomeImageDescriptors(records) {
    return records.map((record) => withHomeImageDescriptor(record));
}

function refreshHomeImageDescriptors(records) {
    records.forEach((record) => {
        if (!record || typeof record !== 'object') {
            return;
        }

        const imageAsset = resolveHomeImageAsset(record.imageOriginal || record.image);
        record.imageOriginal = imageAsset.originalSrc;
        record.image = imageAsset.src;
        record.imageFallback = imageAsset.fallbackSrc;
    });
}

function buildImageErrorHandler(imageLabel, slot) {
    const width = slot?.width || 400;
    const height = slot?.height || 300;
    const fallbackImage = sharedBrandConfig?.createFallbackImageDataUri?.(imageLabel, width, height) || '';
    return `const fallback=this.dataset.fallbackSrc;const activeSrc=this.currentSrc||this.src||'';if(fallback&&activeSrc.indexOf(fallback)===-1){this.src=fallback;return;}this.onerror=null;this.src='${fallbackImage}'`;
}

function buildThumbImageErrorHandler() {
    return "const fallback=this.dataset.fallbackSrc;const activeSrc=this.currentSrc||this.src||'';if(fallback&&activeSrc.indexOf(fallback)===-1){this.src=fallback;return;}this.style.display='none'";
}

function getCatalogSpotById(spotId) {
    return sharedSpotCatalog && typeof sharedSpotCatalog.getById === 'function'
        ? sharedSpotCatalog.getById(spotId)
        : null;
}

function injectCatalogIdentityForHome(record) {
    const catalogSpot = getCatalogSpotById(record?.id);
    if (!catalogSpot) {
        return record;
    }

    return {
        ...record,
        key: catalogSpot.key,
        name: catalogSpot.name,
        englishName: catalogSpot.englishName,
        tagline: catalogSpot.tagline,
        image: catalogSpot.image,
        season: catalogSpot.season
    };
}

function injectCatalogIdentityForHomeList(records) {
    return records.map((record) => injectCatalogIdentityForHome(record));
}

ensureHomeImageManifestReady();

// 热门潜点数据：用于竹签滚动推荐区的卡片渲染、价格展示和详情页跳转。
const divingSpotsData = withHomeImageDescriptors(convertSpotCardPrices(injectCatalogIdentityForHomeList([
    {
        id: 1,
        name: '诗巴丹',
        tagline: '让海狼风暴把呼吸拉长',
        image: 'assets/images/sipadan.jpg',
        price: getSpotBasePriceText(1, '¥3,980'),
        rating: '4.9',
        difficulty: '★★★'
    },
    {
        id: 2,
        name: '帕劳',
        tagline: '在光与断层之间把节奏拉长',
        image: 'assets/images/palau.jpg',
        price: getSpotBasePriceText(2, '¥4,280'),
        rating: '4.8',
        difficulty: '★★'
    },
    {
        id: 3,
        name: '大蓝洞',
        tagline: '把敬畏留在逐渐下压的深蓝',
        image: 'assets/images/blue-hole.jpg',
        price: getSpotBasePriceText(3, '¥5,680'),
        rating: '4.7',
        difficulty: '★★★★'
    },
    {
        id: 4,
        name: '帝汶岛',
        tagline: '在珊瑚花园与缓流里慢慢停车',
        image: 'assets/images/timor.jpg',
        price: getSpotBasePriceText(4, '¥3,480'),
        rating: '4.6',
        difficulty: '★★'
    },
    {
        id: 5,
        name: '波纳佩岛',
        tagline: '让微距生命把节奏放轻',
        image: 'assets/images/pohnpei.jpg',
        price: getSpotBasePriceText(5, '¥2,980'),
        rating: '4.5',
        difficulty: '★'
    },
    {
        id: 6,
        name: '布纳肯',
        tagline: '在海墙与海龟之间整理呼吸',
        image: 'assets/images/timor.jpg',
        price: getSpotBasePriceText(6, '¥3,680'),
        rating: '4.7',
        difficulty: '★★'
    },
    {
        id: 7,
        name: '科莫多',
        tagline: '用巨龙与大鱼的流线保持平衡',
        image: 'assets/images/komodo.jpg',
        price: getSpotBasePriceText(7, '¥3,880'),
        rating: '4.8',
        difficulty: '★★'
    },
    {
        id: 8,
        name: '图阿莫图',
        tagline: '在环礁静水里让晨光缓走',
        image: 'assets/images/tuamotu.jpg',
        price: getSpotBasePriceText(8, '¥4,180'),
        rating: '4.6',
        difficulty: '★★'
    },
    {
        id: 9,
        name: '马布岛',
        tagline: '把码头与玻璃海之间的呼吸留白',
        image: 'assets/images/mabul.jpg',
        price: getSpotBasePriceText(9, '¥3,580'),
        rating: '4.8',
        difficulty: '★'
    },
    {
        id: 10,
        name: '马尔代夫船宿',
        tagline: '把几片蓝连在同一段船宿的呼吸里',
        image: 'assets/images/maldives-liveaboard.jpg',
        price: getSpotBasePriceText(10, '¥6,880'),
        rating: '4.9',
        difficulty: '★★'
    },
    {
        id: 11,
        name: '科隆',
        tagline: '把黑石、浅湾与沉船线索慢慢排进同一片蓝',
        image: 'assets/images/coron-review-1-island-chain.jpg',
        price: getSpotBasePriceText(11, '¥4,980'),
        rating: '4.8',
        difficulty: '★★'
    },
    {
        id: 12,
        name: '薄荷岛',
        tagline: '把白沙岸线和轻船潜排进更轻一点的假期',
        image: 'assets/images/bohol.jpg',
        price: getSpotBasePriceText(12, '¥3,980'),
        rating: '4.7',
        difficulty: '★'
    },
    {
        id: 13,
        name: '皇帝岛',
        tagline: '让玻璃蓝和缓坡珊瑚把呼吸慢慢放平',
        image: 'assets/images/racha.jpg',
        price: getSpotBasePriceText(13, '¥3,680'),
        rating: '4.7',
        difficulty: '★'
    },
    {
        id: 14,
        name: '热浪岛',
        tagline: '在清透礁坡与海岛风里把节奏慢慢放轻',
        image: 'assets/images/redang.jpg',
        price: getSpotBasePriceText(14, '¥3,680'),
        rating: '4.7',
        difficulty: '★'
    }
])));

// 精选目的地数据：用于海域档案陈列廊的主舞台卡和右侧样本卡切换。
const destinationsData = withHomeImageDescriptors(injectCatalogIdentityForHomeList([
    {
        id: 1,
        name: '诗巴丹',
        image: 'assets/images/sipadan.jpg',
        englishName: 'Sipadan',
        atmosphere: '鱼群风暴与海龟共游，是很多人第一次真正爱上海洋的地方。',
        level: 'OW / AOW',
        season: '4月–10月',
        audience: '第一次朝圣 / 鱼群爱好者',
        conditions: ['清澈水域', '中等洋流', '日光稳定'],
        worthIt: '适合把“第一次心动”留在海里。',
        sampleKeyword: '鱼群风暴',
        sampleMeta: '海龟 / 海狼 / 清澈',
        archiveLabel: 'Current Water 01'
    },
    {
        id: 2,
        name: '帕劳',
        image: 'assets/images/palau.jpg',
        englishName: 'Palau',
        atmosphere: '蓝洞、断层与洋流把光线切成层次分明的剧场，适合慢慢进入更立体的海。',
        level: 'AOW',
        season: '11月–次年5月',
        audience: '光线控 / 断层爱好者',
        conditions: ['蓝洞光柱', '中强洋流', '断层地形'],
        worthIt: '适合把光和流，都看得更清楚一些。',
        sampleKeyword: '蓝洞光柱',
        sampleMeta: '断层 / 洋流 / 蓝色大门',
        archiveLabel: 'Current Water 02'
    },
    {
        id: 3,
        name: '大蓝洞',
        image: 'assets/images/blue-hole.jpg',
        englishName: 'Great Blue Hole',
        atmosphere: '垂直下落的深蓝地形，让敬畏先于语言抵达，是更偏进阶的一次凝视。',
        level: 'AOW / 进阶',
        season: '3月–6月',
        audience: '地形潜 / 深潜进阶',
        conditions: ['深蓝垂降', '高能见度', '地形潜'],
        worthIt: '适合把真正的深蓝，留给更准备好的自己。',
        sampleKeyword: '深蓝垂降',
        sampleMeta: '地形 / 竖井 / 进阶',
        archiveLabel: 'Current Water 03'
    },
    {
        id: 4,
        name: '帝汶岛',
        image: 'assets/images/timor.jpg',
        englishName: 'Timor',
        atmosphere: '珊瑚花园、温柔光线与更包容的节奏，适合把下潜变成一次安静停驻。',
        level: 'OW',
        season: '5月–11月',
        audience: '第一次海岛长住 / 珊瑚偏爱者',
        conditions: ['温柔光线', '缓流', '珊瑚层次'],
        worthIt: '适合慢慢下去，也适合慢慢喜欢上海。',
        sampleKeyword: '珊瑚花园',
        sampleMeta: '光线 / 缓流 / 温柔',
        archiveLabel: 'Current Water 04'
    },
    {
        id: 5,
        name: '波纳佩岛',
        image: 'assets/images/pohnpei.jpg',
        englishName: 'Pohnpei',
        atmosphere: '火山海域的雾蓝层次和微距生命，让海面以下的细节变得格外安静而迷人。',
        level: 'OW / 微距爱好者',
        season: '1月–5月',
        audience: '微距摄影 / 慢潜爱好者',
        conditions: ['微距生态', '火山海底', '柔雾光线'],
        worthIt: '适合把注意力，从远景收回到更细微的生命上。',
        sampleKeyword: '微距雾蓝',
        sampleMeta: '火山 / 微距 / 安静',
        archiveLabel: 'Current Water 05'
    },
    {
        id: 6,
        name: '布纳肯',
        image: 'assets/images/timor.jpg',
        englishName: 'Bunaken',
        atmosphere: '海墙、海龟与清澈蓝水在这里保持着很舒服的平衡，适合把一次下潜留给更明亮、更从容的热带海。',
        level: 'OW / AOW',
        season: '3月–11月',
        audience: '海龟观察 / 墙潜偏爱者',
        conditions: ['海墙', '清澈蓝水', '海龟概率高'],
        worthIt: '适合把第一次真正放松的墙潜，留给一片明亮的蓝。',
        sampleKeyword: '海墙与海龟',
        sampleMeta: '墙潜 / 清澈 / 温柔',
        archiveLabel: 'Current Water 06'
    },
    {
        id: 9,
        name: '马布岛',
        image: 'assets/images/mabul.jpg',
        englishName: 'Mabul',
        atmosphere: '水屋、码头、浅礁与玻璃海把这里的节奏放得很慢，适合把潜水和海岛停驻真正放在同一段呼吸里。',
        level: '入门 / OW',
        season: '3月–10月',
        audience: '第一次海岛潜旅 / 慢节奏度假',
        conditions: ['浅礁生态', '码头氛围', '温柔海况'],
        worthIt: '适合把第一次轻松又有画面感的海岛潜旅，留给一片更柔和的蓝。',
        sampleKeyword: '码头与玻璃海',
        sampleMeta: '水屋 / 浅礁 / 慢节奏',
        archiveLabel: 'Current Water 07'
    },
    {
        id: 10,
        name: '马尔代夫船宿',
        image: 'assets/images/maldives-liveaboard.jpg',
        englishName: 'Maldives Liveaboard',
        atmosphere: '白天在环礁、航道与蓝水之间下潜，夜里把船停在更安静的海面上，适合把多片海收进同一段呼吸里。',
        level: 'OW / AOW',
        season: '11月–次年4月',
        audience: '船宿偏好 / 环礁巡航',
        conditions: ['环礁航线', '船宿节奏', '清澈蓝水'],
        worthIt: '适合把醒来就在另一片海上的期待，留给一次更完整的船宿旅程。',
        sampleKeyword: '环礁之间醒来',
        sampleMeta: '船宿 / 环礁 / 蓝水',
        archiveLabel: 'Current Water 08'
    },
    {
        id: 11,
        name: '科隆',
        image: 'assets/images/coron-review-1-island-chain.jpg',
        englishName: 'Coron',
        atmosphere: '黑色石灰岩、玻璃水海湾与沉船线索在这里一起靠近，适合把海面以上和海面以下都收进同一段停驻。',
        level: 'OW / AOW',
        season: '11月–次年5月',
        audience: '沉船初体验 / 岛湾风景偏爱者',
        conditions: ['沉船线索', '石灰岩海湾', '玻璃浅水'],
        worthIt: '适合把第一次既有地形感又有停驻感的菲律宾群岛之旅，留给更安静的蓝。',
        sampleKeyword: '黑石与玻璃水',
        sampleMeta: '沉船 / 石灰岩 / 海湾',
        archiveLabel: 'Current Water 09'
    },
    {
        id: 12,
        name: '薄荷岛',
        image: 'assets/images/bohol.jpg',
        englishName: 'Bohol',
        atmosphere: '白沙岸线、浅礁色带和轻船潜一起把节奏放轻，适合把潜水安放进更明亮、更容易靠近的一段海边假期。',
        level: '入门 / OW',
        season: '11月–次年6月',
        audience: '轻船潜入门 / 风景度假偏好',
        conditions: ['浅礁色带', '短船程', '白沙岸线'],
        worthIt: '适合把第一次不太紧张、也很有海岸画面感的菲律宾潜旅，留给一条更轻的岸线。',
        sampleKeyword: '白沙与浅礁线',
        sampleMeta: '轻船潜 / 岸线 / 玻璃水',
        archiveLabel: 'Current Water 10'
    },
    {
        id: 13,
        name: '皇帝岛',
        image: 'assets/images/racha.jpg',
        englishName: 'Racha Island',
        atmosphere: '泰国南部这片海会先用清透浅蓝和更柔和的下潜节奏，把身体慢慢带进状态。',
        level: '入门 / OW',
        season: '11月–次年4月',
        audience: '轻海况偏好 / 泰国海岛潜旅',
        conditions: ['玻璃蓝浅水', '缓流', '珊瑚缓坡'],
        worthIt: '适合把第一次泰国海岛船潜，留给更清透也更好读的一层蓝。',
        sampleKeyword: '玻璃蓝缓坡',
        sampleMeta: '泰国 / 缓流 / 入门友好',
        archiveLabel: 'Current Water 11'
    },
    {
        id: 14,
        name: '热浪岛',
        image: 'assets/images/redang.jpg',
        englishName: 'Redang Island',
        atmosphere: '马来西亚东海岸这片海用透亮浅蓝、礁坡层次和更轻的船潜节奏，把人慢慢带进更放松的状态。',
        level: '入门 / OW',
        season: '3月–10月',
        audience: '海岛入门潜旅 / 轻海况偏好',
        conditions: ['清透浅蓝', '礁坡地形', '轻船潜'],
        worthIt: '适合把第一次马来西亚海岛潜旅，留给更明亮也更好靠近的一层蓝。',
        sampleKeyword: '清透礁坡线',
        sampleMeta: '马来西亚 / 入门友好 / 轻船潜',
        archiveLabel: 'Current Water 12'
    }
]));

function refreshHomeDataImageSources() {
    refreshHomeImageDescriptors(divingSpotsData);
    refreshHomeImageDescriptors(destinationsData);
}

// 潜水匹配推荐数据：按能力、节奏和海况偏好组织首页新增的潜水匹配模块。
const destinationById = new Map(destinationsData.map((item) => [item.id, item]));
const DIVE_MATCH_STORAGE_KEY = 'yanqi_dive_match_state';
const DIVE_MATCH_QUERY_KEY = 'match';
const DIVE_MATCH_DEFAULT_KEY = 'beginner';
const DIVE_MATCH_FOCUS_DELAY_MS = 980;

const DIVE_MATCH_DATA = Object.freeze([
    {
        key: 'beginner',
        label: '入门新手',
        group: '基础等级',
        depth: -12,
        audience: '适合第一次把潜水放进行程的人。',
        guidance: '先让海变得友好、稳定、容易靠近，再去喜欢更深的那部分。',
        note: '更温和的窗口、更轻的流速和更容易安顿下来的节奏，会让第一次靠近海自然很多。',
        cards: [
            { id: 9, reason: '码头、浅礁和岛上慢生活放得很近，第一次下潜也不会太紧张。', tags: ['入门友好', '浅礁', '慢节奏'] },
            { id: 13, reason: '皇帝岛会先用白沙海湾、玻璃蓝和更轻一点的泰国船潜节奏，把第一次靠近安排得更从容。', tags: ['入门 / OW', '玻璃蓝', '轻船潜'] },
            { id: 14, reason: '热浪岛的清透浅蓝、礁坡和轻船潜窗口，会让第一次安排更容易进入状态。', tags: ['入门 / OW', '清透浅蓝', '礁坡'] }
        ]
    },
    {
        key: 'ow',
        label: 'OW 适合',
        group: '基础等级',
        depth: -13,
        audience: '适合已经完成开放水域训练、想看见更多层次的人。',
        guidance: '比第一次更从容，也比进阶海况更温和。',
        note: '这类海域会开始给你更多蓝水和鱼群，但还保留足够清楚的节奏。',
        cards: [
            { id: 1, reason: '在更友好的窗口里安排诗巴丹，会让第一次大景体验更完整。', tags: ['OW / AOW', '鱼群', '中等流'] },
            { id: 11, reason: '科隆把石灰岩海湾、玻璃水和沉船初体验放进同一段更好读的节奏里。', tags: ['OW / AOW', '海湾', '沉船初体验'] },
            { id: 6, reason: '布纳肯能给你墙潜感和海龟线索，但整体仍然明亮好读。', tags: ['OW / AOW', '墙潜', '海龟'] }
        ]
    },
    {
        key: 'aow',
        label: 'AOW 推荐',
        group: '基础等级',
        depth: -16,
        audience: '适合愿意进入更完整海况层次的人。',
        guidance: '更深的蓝、更明显的流、更值得记住的潜点，会在这里慢慢打开。',
        note: '不是为了更刺激，而是因为你已经准备好看见更立体的海况关系。',
        cards: [
            { id: 7, reason: '科莫多会把洋流、大景和空间张力一起推到你面前。', tags: ['AOW', '大景', '洋流'] },
            { id: 2, reason: '帕劳的蓝洞、断层和流线，更适合已有经验的人慢慢读懂。', tags: ['AOW', '蓝洞', '断层'] },
            { id: 3, reason: '大蓝洞的地形压迫感和深蓝垂降，需要更成熟的深度管理。', tags: ['AOW / 进阶', '深潜', '地形'] }
        ]
    },
    {
        key: 'slow-pace',
        label: '慢节奏潜水',
        group: '节奏偏好',
        depth: -14,
        audience: '适合想把潜水和停驻放在一起的人。',
        guidance: '不急着一天看完所有海，而是给身体、光线和呼吸都留出余地。',
        note: '这些海域更像一段被拉长的呼吸，而不是密集完成的清单。',
        cards: [
            { id: 9, reason: '马布岛很擅长把潜前潜后的停驻感也算进行程本身。', tags: ['慢节奏', '码头', '海岛生活'] },
            { id: 12, reason: '薄荷岛会先用岸线、浅礁和短船程把整天节奏慢慢放轻。', tags: ['慢节奏', '岸线', '轻船潜'] },
            { id: 5, reason: '波纳佩岛把注意力拉回微距和静水，节奏天然更慢。', tags: ['微距', '静水', '安静'] }
        ]
    },
    {
        key: 'comfort-first',
        label: '舒适度优先',
        group: '节奏偏好',
        depth: -13,
        audience: '适合把恢复感、住宿感和行程从容度看得更前的人。',
        guidance: '先让身体和海岛节奏对上，再决定这次要看多深的蓝。',
        note: '潜水当然重要，但舒服地进入、舒服地回来，同样是一段行程的质量。',
        cards: [
            { id: 9, reason: '水屋、码头和浅礁都离得近，潜后休息感很完整。', tags: ['舒适度', '水屋', '慢住'] },
            { id: 4, reason: '岸线和珊瑚坡都更温柔，适合把潜水和度假放进同一节奏。', tags: ['舒展', '度假', 'OW'] },
            { id: 12, reason: '从岸边到船上都不需要太多折返，薄荷岛很适合把身体先安顿好。', tags: ['舒适度', '短船程', '轻假期'] }
        ]
    },
    {
        key: 'scenery-first',
        label: '风景体验偏好',
        group: '节奏偏好',
        depth: -14,
        audience: '适合想把光线、海水颜色和海岛气氛一起记住的人。',
        guidance: '这类海域不只给你下潜，也会给你完整的海面与岸线记忆。',
        note: '风景不只是背景，它决定了这趟潜水被记住的方式。',
        cards: [
            { id: 2, reason: '帕劳的蓝色层次和断层光线，会让海景和水下都很完整。', tags: ['光线', '蓝洞', '断层'] },
            { id: 11, reason: '科隆会把黑石、白沙、玻璃水和沉船线索一起留在同一段岸线记忆里。', tags: ['石灰岩', '玻璃水', '海湾'] },
            { id: 13, reason: '皇帝岛会把清透浅蓝、珊瑚缓坡和更轻的泰国海岛气息排进同一段记忆。', tags: ['玻璃蓝', '珊瑚缓坡', '泰国海岛'] }
        ]
    },
    {
        key: 'big-scene',
        label: '鱼群 / 大景偏好',
        group: '节奏偏好',
        depth: -15,
        audience: '适合想把鱼群风暴、蓝水压迫感和更开阔的海一次看够的人。',
        guidance: '这类海域更擅长把空间感推到你面前。',
        note: '你会更频繁地看到海狼、鲨鱼、大鱼和真正开阔的蓝水层次。',
        cards: [
            { id: 1, reason: '诗巴丹的鱼群风暴和海龟线，是很多人大景记忆的起点。', tags: ['鱼群', '海龟', '蓝水'] },
            { id: 7, reason: '科莫多会把大景和流场一起展开，记忆张力很强。', tags: ['大景', '洋流', '蝠鲼'] },
            { id: 2, reason: '帕劳擅长用光线和断层把大场景切出层次。', tags: ['蓝洞', '断层', '流线'] }
        ]
    },
    {
        key: 'gentle-conditions',
        label: '海况适应力较弱',
        group: '海况经验',
        depth: -12,
        audience: '适合久未下潜、对风浪更敏感，或希望这次以舒适和安稳为先的人。',
        guidance: '不是退一步，而是让进入海的方式更适合自己。',
        note: '先把身体和海况重新对齐，再决定是否要去更深或更强的地方。',
        cards: [
            { id: 9, reason: '马布岛的浅礁和岛上慢节奏，更适合恢复状态。', tags: ['舒缓', '浅礁', '停驻'] },
            { id: 5, reason: '波纳佩岛的静水和微距观察，会让整趟潜水更轻。', tags: ['静水', '微距', '低压'] },
            { id: 4, reason: '帝汶岛流速更友好，适合把舒适和稳定放在第一位。', tags: ['温和流速', 'OW', '珊瑚'] }
        ]
    },
    {
        key: 'recent-dives',
        label: '近期有潜水记录',
        group: '海况经验',
        depth: -15,
        audience: '适合近 12 个月内仍保持下潜频率的人。',
        guidance: '身体和判断都还在线时，可以把更完整的海况层次安排进去。',
        note: '你不需要从最浅层重新开始，很多海况窗口都能更从容地接住。',
        cards: [
            { id: 1, reason: '诗巴丹会在近期状态在线时把鱼群和蓝水推得更完整。', tags: ['近期有潜水记录', '鱼群', '中等流'] },
            { id: 7, reason: '科莫多更适合把近期下潜经验直接转成对流区的判断。', tags: ['流区', '大景', 'AOW'] },
            { id: 2, reason: '帕劳的断层和流线，在状态稳定时会更容易读懂。', tags: ['断层', '光线', 'AOW'] }
        ]
    },
    {
        key: 'current-friendly',
        label: '洋流经验更友好',
        group: '海况经验',
        depth: -16,
        audience: '适合对流区更熟悉、愿意在更明显流线里保持判断的人。',
        guidance: '会潜得更忙一些，但海也会因此更完整地打开。',
        note: '这不是为了刺激，而是因为你已经知道怎样在流里保持从容。',
        cards: [
            { id: 7, reason: '科莫多会把流区张力、大景和判断感一次给到。', tags: ['洋流', '大景', '进阶'] },
            { id: 2, reason: '帕劳的蓝角和断层，是流线经验被真正用上的地方。', tags: ['蓝角', '断层', '流区'] },
            { id: 1, reason: '诗巴丹在更成熟的流潜判断下，会显得更立体。', tags: ['中等流', '鱼群', '蓝水'] }
        ]
    },
    {
        key: 'advanced-conditions',
        label: '进阶海况',
        group: '海况经验',
        depth: -18,
        audience: '适合愿意进入更深、更复杂、也更完整海况层次的人。',
        guidance: '更深的蓝、更明显的流、更需要判断的水下结构，会在这里慢慢打开。',
        note: '如果这次想认真决定自己适合怎样进入一片更成熟的海，这里是更深的一层。',
        cards: [
            { id: 3, reason: '大蓝洞的垂降地形和深度感，适合真正准备好的潜水员。', tags: ['进阶海况', '深潜', '地形'] },
            { id: 7, reason: '科莫多会把流场和空间感同时抬高，适合更成熟的判断。', tags: ['洋流', '大景', 'AOW / 进阶'] },
            { id: 2, reason: '帕劳把断层、流线和光柱叠在一起，更适合经验充足时进入。', tags: ['断层', '流区', 'AOW'] }
        ]
    }
]);

const DIVE_MATCH_MAP = new Map(DIVE_MATCH_DATA.map((item) => [item.key, item]));

/**
 * getDiveMatchEntry(key) - 按分类键名读取对应的潜水匹配配置
 * @param {string} key - 分类键名
 * @returns {Object} - 匹配分类配置对象
 */
function getDiveMatchEntry(key) {
    return DIVE_MATCH_MAP.get(key) || DIVE_MATCH_MAP.get(DIVE_MATCH_DEFAULT_KEY);
}

/**
 * readStoredDiveMatchKey() - 读取上一次保存的首页潜水匹配分类
 * @returns {string|null} - 已保存的分类键名或空值
 */
function readStoredDiveMatchKey() {
    const raw = sessionStorage.getItem(DIVE_MATCH_STORAGE_KEY);
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);
        return DIVE_MATCH_MAP.has(parsed.key) ? parsed.key : null;
    } catch (error) {
        return null;
    }
}

/**
 * readStoredHomeScrollTarget() - 读取跨页回到首页后需要恢复的滚动目标
 * @returns {string|null} - 需要自动对齐的首页 section 选择器
 */
function readStoredHomeScrollTarget() {
    const raw = sessionStorage.getItem(HOME_SCROLL_STORAGE_KEY);
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);
        return typeof parsed.target === 'string' && parsed.target.startsWith('#')
            ? parsed.target
            : null;
    } catch (error) {
        return null;
    }
}

/**
 * clearStoredHomeScrollTarget() - 清除首页跨页滚动目标，避免重复触发
 * @returns {void} - 无返回值，直接移除 sessionStorage 记录
 */
function clearStoredHomeScrollTarget() {
    try {
        sessionStorage.removeItem(HOME_SCROLL_STORAGE_KEY);
    } catch (error) {
        // 忽略存储异常，避免影响首页其他逻辑。
    }
}

/**
 * storeDiveMatchKey(key) - 保存当前激活的潜水匹配分类
 * @param {string} key - 需要保存的分类键名
 * @returns {void} - 无返回值，直接写入 sessionStorage
 */
function storeDiveMatchKey(key) {
    if (!DIVE_MATCH_MAP.has(key)) {
        return;
    }

    sessionStorage.setItem(DIVE_MATCH_STORAGE_KEY, JSON.stringify({
        key,
        at: Date.now()
    }));
}

/**
 * getDiveMatchKeyFromLocation() - 从当前首页 URL 中读取需要自动激活的潜水匹配分类
 * @returns {string|null} - URL 指定的分类键名或空值
 */
function getDiveMatchKeyFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const key = params.get(DIVE_MATCH_QUERY_KEY);
    return DIVE_MATCH_MAP.has(key) ? key : null;
}

function getActiveHomeDiverProfile() {
    return sharedDiverProfile?.getProfile?.() || null;
}

function resolveDefaultDiveMatchKey() {
    const profileKey = sharedDiverProfile?.getRecommendedMatchKey?.(getActiveHomeDiverProfile());
    return DIVE_MATCH_MAP.has(profileKey) ? profileKey : DIVE_MATCH_DEFAULT_KEY;
}

function resolveProfilePresetKey(profile) {
    const safeProfile = sharedDiverProfile?.normalizeProfile?.(profile);
    const presets = sharedDiverProfile?.getPresets?.() || [];
    const matchedPreset = presets.find((preset) => {
        const presetProfile = preset?.profile || {};
        return Object.keys(presetProfile).every((fieldKey) => presetProfile[fieldKey] === safeProfile?.[fieldKey]);
    });
    return matchedPreset?.key || '';
}

const DIVE_MATCH_PROFILE_PRESET_META = Object.freeze({
    'reentry-calm': Object.freeze({
        label: '恢复状态'
    }),
    'comfort-shore': Object.freeze({
        label: '舒适慢住'
    }),
    'showcase-current': Object.freeze({
        label: '大景进阶'
    })
});

const DIVE_MATCH_PROFILE_PRESET_ORDER = Object.freeze({
    'reentry-calm': 0,
    'comfort-shore': 1,
    'showcase-current': 2
});

const DIVE_MATCH_PROFILE_PRESET_SWAP_IN_DELAY_MS = 200;
const DIVE_MATCH_PROFILE_PRESET_SWAP_DURATION_MS = 1200;
const DIVE_MATCH_PROFILE_PANEL_SWAP_IN_DELAY_MS = 180;
const DIVE_MATCH_PROFILE_PANEL_SWAP_DURATION_MS = 1060;
const DIVE_MATCH_PROFILE_PANEL_TRACK_OUT_DURATION_MS = 340;
const DIVE_MATCH_PROFILE_PANEL_TRACK_IN_DURATION_MS = 520;
const DIVE_MATCH_PROFILE_PRESET_TRACK_OUT_DURATION_MS = 360;
const DIVE_MATCH_PROFILE_PRESET_TRACK_IN_DURATION_MS = 560;
const DIVE_MATCH_PROFILE_PRESET_ITEM_OUT_DURATION_MS = 300;
const DIVE_MATCH_PROFILE_PRESET_ITEM_IN_DURATION_MS = 500;

// 统一导航入口：所有需要跨页面保持深度过渡的跳转都先走这里。
/**
 * navigateWithDepth(url) - 带深度切换效果地跳转到目标页面
 * @param {string} url - 目标页面地址
 * @returns {void} - 无返回值，直接执行页面跳转
 */
function navigateWithDepth(url) {
    if (window.DepthManager && typeof window.DepthManager.navigateTo === 'function') {
        window.DepthManager.navigateTo(url);
        return;
    }

    window.location.href = url;
}

const HOME_INTERACTION_STATE = {
    guideOpen: false,
    lockUntil: 0,
    unlockTimer: 0,
    scrollTraveling: false,
    programmaticTraveling: false,
    manualTraveling: false,
    manualTravelTimer: 0,
    lastDatasetLocked: false,
    manualLastScrollY: 0,
    manualLastScrollAt: 0
};

const HOME_MANUAL_SCROLL_BURST_GAP_MS = 120;
const HOME_MANUAL_SCROLL_BURST_RESET_MS = 240;
const HOME_MANUAL_SCROLL_BURST_DELTA_MIN = 180;

/**
 * syncHomeInteractionDataset() - 把首页交互锁状态同步到 body data 属性，供样式层做临时降载
 * @returns {void}
 */
function syncHomeInteractionDataset() {
    if (!document.body) {
        return;
    }

    const nextScrollTraveling = HOME_INTERACTION_STATE.programmaticTraveling || HOME_INTERACTION_STATE.manualTraveling;
    const previousLocked = HOME_INTERACTION_STATE.lastDatasetLocked;
    const previousScrollTraveling = HOME_INTERACTION_STATE.scrollTraveling;
    const isLocked = HOME_INTERACTION_STATE.guideOpen || performance.now() < HOME_INTERACTION_STATE.lockUntil;
    HOME_INTERACTION_STATE.scrollTraveling = nextScrollTraveling;
    HOME_INTERACTION_STATE.lastDatasetLocked = isLocked;

    document.body.dataset.homeInteraction = isLocked ? 'locked' : 'idle';
    document.body.classList.toggle('home-scroll-traveling', nextScrollTraveling);

    if (
        previousLocked !== isLocked
        || previousScrollTraveling !== nextScrollTraveling
    ) {
        window.dispatchEvent(new CustomEvent('homeinteractionchange', {
            detail: {
                isLocked,
                scrollTraveling: nextScrollTraveling
            }
        }));
    }
}

/**
 * scheduleHomeInteractionRefresh(delayMs) - 在交互降载结束后刷新首页的滚动联动状态。
 * @param {number} delayMs - 延迟毫秒数
 * @returns {void}
 */
function scheduleHomeInteractionRefresh(delayMs = 0) {
    if (HOME_INTERACTION_STATE.unlockTimer) {
        window.clearTimeout(HOME_INTERACTION_STATE.unlockTimer);
        HOME_INTERACTION_STATE.unlockTimer = 0;
    }

    const delay = Math.max(0, delayMs);
    HOME_INTERACTION_STATE.unlockTimer = window.setTimeout(() => {
        HOME_INTERACTION_STATE.unlockTimer = 0;
        HOME_INTERACTION_STATE.programmaticTraveling = false;
        syncHomeInteractionDataset();
        const remainingLockMs = Math.ceil(HOME_INTERACTION_STATE.lockUntil - performance.now());
        if (!HOME_INTERACTION_STATE.guideOpen && remainingLockMs > 0) {
            scheduleHomeInteractionRefresh(remainingLockMs + 48);
            return;
        }

        if (typeof homeViewportCoordinator !== 'undefined') {
            homeViewportCoordinator.requestMeasure();
            homeViewportCoordinator.requestUpdate();
        }
    }, delay);
}

/**
 * beginHomeInteractionLock(durationMs) - 在程序化滚动期间短暂压低首页交互开销。
 * @param {number} durationMs - 预计持续时间
 * @returns {void}
 */
function beginHomeInteractionLock(durationMs = 0) {
    const nextUntil = performance.now() + Math.max(0, durationMs);
    HOME_INTERACTION_STATE.lockUntil = Math.max(HOME_INTERACTION_STATE.lockUntil, nextUntil);
    syncHomeInteractionDataset();
    scheduleHomeInteractionRefresh(Math.max(0, Math.ceil(HOME_INTERACTION_STATE.lockUntil - performance.now()) + 48));
}

/**
 * setHomeScrollTraveling(isTraveling, source) - 标记首页是否处于程序化或手动的大幅滚动中
 * @param {boolean} isTraveling - 是否处于长距离滚动态
 * @param {'programmatic'|'manual'} source - 滚动来源
 * @returns {void}
 */
function setHomeScrollTraveling(isTraveling, source = 'programmatic') {
    if (source === 'manual') {
        HOME_INTERACTION_STATE.manualTraveling = Boolean(isTraveling);
        if (!isTraveling && HOME_INTERACTION_STATE.manualTravelTimer) {
            window.clearTimeout(HOME_INTERACTION_STATE.manualTravelTimer);
            HOME_INTERACTION_STATE.manualTravelTimer = 0;
        }
    } else {
        HOME_INTERACTION_STATE.programmaticTraveling = Boolean(isTraveling);
    }

    syncHomeInteractionDataset();
}

function markHomeManualScrollTraveling() {
    if (HOME_INTERACTION_STATE.programmaticTraveling) {
        return;
    }

    HOME_INTERACTION_STATE.manualTraveling = true;
    syncHomeInteractionDataset();

    if (HOME_INTERACTION_STATE.manualTravelTimer) {
        window.clearTimeout(HOME_INTERACTION_STATE.manualTravelTimer);
    }

    HOME_INTERACTION_STATE.manualTravelTimer = window.setTimeout(() => {
        HOME_INTERACTION_STATE.manualTravelTimer = 0;
        HOME_INTERACTION_STATE.manualTraveling = false;
        syncHomeInteractionDataset();
        if (typeof homeViewportCoordinator !== 'undefined') {
            homeViewportCoordinator.requestUpdate();
        }
    }, HOME_MANUAL_SCROLL_BURST_RESET_MS);
}

function setupHomeManualScrollTraveling() {
    if (!document.body.classList.contains('home-page')) {
        return;
    }

    HOME_INTERACTION_STATE.manualLastScrollY = window.scrollY || window.pageYOffset || 0;
    HOME_INTERACTION_STATE.manualLastScrollAt = performance.now();

    let scrollRafId = 0;
    const evaluateScrollBurst = () => {
        scrollRafId = 0;

        const currentScrollY = window.scrollY || window.pageYOffset || 0;
        const now = performance.now();
        const delta = Math.abs(currentScrollY - HOME_INTERACTION_STATE.manualLastScrollY);
        const elapsed = Math.max(now - HOME_INTERACTION_STATE.manualLastScrollAt, 1);

        HOME_INTERACTION_STATE.manualLastScrollY = currentScrollY;
        HOME_INTERACTION_STATE.manualLastScrollAt = now;

        if (HOME_INTERACTION_STATE.programmaticTraveling) {
            return;
        }

        if (
            elapsed <= HOME_MANUAL_SCROLL_BURST_GAP_MS
            && delta >= Math.max((window.innerHeight || 0) * 0.35, HOME_MANUAL_SCROLL_BURST_DELTA_MIN)
        ) {
            markHomeManualScrollTraveling();
        }
    };

    window.addEventListener('scroll', () => {
        if (scrollRafId) {
            return;
        }

        scrollRafId = window.requestAnimationFrame(evaluateScrollBurst);
    }, { passive: true });

    window.addEventListener('wheel', (event) => {
        if (HOME_INTERACTION_STATE.programmaticTraveling) {
            return;
        }

        const deltaY = Math.abs(Number(event?.deltaY) || 0);
        const wheelBurstThreshold = Math.max(
            (window.innerHeight || 0) * 0.18,
            HOME_MANUAL_SCROLL_BURST_DELTA_MIN
        );

        if (deltaY >= wheelBurstThreshold) {
            markHomeManualScrollTraveling();
        }
    }, { passive: true });
}

/**
 * setHomeGuideOpenState(isOpen) - 记录海图导览是否处于展开态，用来暂停底层高频动画。
 * @param {boolean} isOpen - 是否展开
 * @returns {void}
 */
function setHomeGuideOpenState(isOpen) {
    HOME_INTERACTION_STATE.guideOpen = Boolean(isOpen);
    syncHomeInteractionDataset();
    if (!HOME_INTERACTION_STATE.guideOpen) {
        scheduleHomeInteractionRefresh(40);
    }
}

/**
 * isHomeInteractionLocked() - 判断首页当前是否处于程序化滚动或导览展开的降载窗口中。
 * @returns {boolean}
 */
function isHomeInteractionLocked() {
    return HOME_INTERACTION_STATE.guideOpen || performance.now() < HOME_INTERACTION_STATE.lockUntil;
}

function resolveHomeGuideJumpStrategy(mode) {
    const registry = window.YanqiHomeGuideJumpStrategies || {};
    const resolvedMode = mode === HOME_GUIDE_JUMP_DEFAULT_MODE
        ? mode
        : HOME_GUIDE_JUMP_DEFAULT_MODE;
    const strategy = registry[resolvedMode];
    return strategy && typeof strategy.run === 'function' ? strategy : null;
}

function runHomeGuideLongJumpStrategy(options = {}) {
    const mode = HOME_GUIDE_JUMP_DEFAULT_MODE;
    const strategy = resolveHomeGuideJumpStrategy(mode);
    if (!strategy) {
        return null;
    }

    const adaptiveDuration = clamp(Number(options.adaptiveDuration) || 0, 420, 2400);
    const top = Math.max(0, Number(options.top) || 0);
    const viewportHeight = Math.max(window.innerHeight || 0, 1);
    const travelDistance = Math.abs(top - (window.scrollY || window.pageYOffset || 0));
    const mood = travelDistance > viewportHeight * 2.2 ? 'midwater' : 'buoyant';

    if (window.OceanScroll && typeof window.OceanScroll.cancelActiveAnimation === 'function') {
        window.OceanScroll.cancelActiveAnimation();
    }

    return strategy.run({
        top,
        currentScrollY: window.scrollY || window.pageYOffset || 0,
        travelDistance,
        adaptiveDuration,
        viewportHeight,
        proximityThreshold: HOME_GUIDE_JUMP_PROXIMITY_THRESHOLD,
        targetSelector: String(options.targetSelector || ''),
        guideTargetDepth: options.guideTargetDepth !== null && options.guideTargetDepth !== undefined
            && Number.isFinite(Number(options.guideTargetDepth))
            ? Number(options.guideTargetDepth)
            : null,
        mood,
        animateTo(targetY, strategyOptions = {}) {
            if (window.OceanScroll && typeof window.OceanScroll.animateTo === 'function') {
                return window.OceanScroll.animateTo(targetY, strategyOptions);
            }

            window.scrollTo(0, Math.max(0, Number(targetY) || 0));
            return Promise.resolve();
        },
        beginManagedScroll(durationMs) {
            if (window.DepthManager && typeof window.DepthManager.beginManagedScroll === 'function') {
                window.DepthManager.beginManagedScroll(durationMs);
            }
        },
        finishManagedScroll() {
            if (window.DepthManager && typeof window.DepthManager.finishManagedScroll === 'function') {
                window.DepthManager.finishManagedScroll();
            }
        },
        resolveScrollMood(strategyOptions = {}) {
            if (window.OceanScroll && typeof window.OceanScroll.resolveScrollMood === 'function') {
                return window.OceanScroll.resolveScrollMood(strategyOptions);
            }

            return {
                name: String(strategyOptions?.mood || mood || 'buoyant').trim() || 'buoyant',
                durationScale: 1,
                easing(value) {
                    return clamp(Number(value) || 0, 0, 1);
                }
            };
        },
        setHomeScrollTraveling: (isTraveling) => {
            setHomeScrollTraveling(isTraveling, 'programmatic');
        },
        beginHomeInteractionLock,
        suspendHomeViewportCoordinator() {
            if (typeof homeViewportCoordinator?.suspend === 'function') {
                homeViewportCoordinator.suspend();
            }
        },
        resumeHomeViewportCoordinator(resumeOptions = {}) {
            if (typeof homeViewportCoordinator?.resume === 'function') {
                homeViewportCoordinator.resume(resumeOptions);
            }
        }
    });
}

// 竹签滚动推荐控制器：负责热门潜点卡片的渲染、拖拽、自动滑动、惯性与点击跳转。
class BambooScroll {
    /**
     * constructor() - 初始化热门潜点滚动组件的状态和 DOM 引用
     */
    constructor() {
        this.content = document.getElementById('bambooCardsContent');
        this.wrapper = document.querySelector('.bamboo-cards-wrapper');
        this.leftBtn = document.getElementById('scroll-left');
        this.rightBtn = document.getElementById('scroll-right');
        this.performanceProfile = resolveHomePerformanceProfile();
        // 自动滑动是这个首屏模块的基础节奏，不应因为系统“减少动态”而整条关闭，
        // 否则用户会直接看到“始终静止”。这里只在纯粗指针设备上停用自动滑动。
        this.enableAutoStep = !this.performanceProfile.coarsePointer;
        this.enableInertia = !(this.performanceProfile.lite || this.performanceProfile.coarsePointer);
        this.enableHoverTracking = !this.performanceProfile.coarsePointer;
        this.dragThreshold = this.performanceProfile.lite ? 10 : 8;

        this.totalCards = divingSpotsData.length;
        this.cloneSets = this.performanceProfile.lite ? 2 : 3;
        this.cards = [];
        this.cardPhysics = [];
        this.cardCenterOffsets = [];

        this.cardStride = 300;
        this.setWidth = this.totalCards * this.cardStride;
        this.trackPosition = this.setWidth;
        this.trackVelocity = 0;
        this.trackLoopMinFactor = this.cloneSets <= 2 ? 0.3 : 0.5;
        this.trackLoopMaxFactor = this.cloneSets <= 2 ? 1.5 : 2.5;
        this.wrapperWidth = 0;
        this.wrapperCenter = 0;
        this.centerWeightMaxDist = 0;
        this.physicsRangeRadius = this.performanceProfile.lite ? 4 : 5;

        this.isDragging = false;
        this.pointerId = null;
        this.startPointerX = 0;
        this.startTrackPosition = 0;
        this.lastPointerX = 0;
        this.lastPointerTime = 0;
        this.lastTrackVelocity = 0;
        this.dragMoved = false;
        this.suppressClickUntil = 0;
        this.pressedCard = null;

        this.hoveredCard = null;
        this.activeCard = null;
        this.pointerInsideWrapper = false;
        this.pointerClientX = 0;
        this.pointerClientY = 0;

        this.inertia = {
            active: false,
            boostTime: 0,
            boostAccel: 0
        };

        this.autoStep = null;
        this.autoTimer = null;
        this.autoStepCount = 0;
        this.autoIntervalMs = this.performanceProfile.lite ? 4200 : 3000;
        this.autoIntervalJitterMinMs = this.performanceProfile.lite ? -320 : -420;
        this.autoIntervalJitterMaxMs = this.performanceProfile.lite ? 320 : 420;
        this.autoInitialDelayMs = this.performanceProfile.lite ? 2600 : 1200;
        this.autoInitialDelayJitterMinMs = this.performanceProfile.lite ? -220 : -220;
        this.autoInitialDelayJitterMaxMs = this.performanceProfile.lite ? 220 : 220;
        this.autoStepDurationMin = this.performanceProfile.lite ? 1.08 : 1.02;
        this.autoStepDurationMax = this.performanceProfile.lite ? 1.24 : 1.18;
        this.motionLiteVelocityThreshold = 900;
        this.isMotionLite = false;

        this.shakeEnergy = 0;

        this.pointerMoveRafId = 0;
        this.pendingPointerMove = null;
        this.frameRafId = 0;
        this.lastFrameTs = 0;
        this.lastAppliedTrackPosition = Number.NaN;
        this.trackPositionDirty = false;
        this.lastActivePhysicsRange = null;
        this.lastHoverSyncTs = 0;
        this.lastHoverTrackPosition = this.trackPosition;
        this.isWrapperVisible = true;
        this.isPageVisible = !document.hidden;
        this.visibilityObserver = null;
        this.frameLoop = (timestamp) => this.runFrame(timestamp);
        this.handleDocumentVisibilityChange = () => this.syncDocumentVisibility();
        this.handleHomeInteractionChange = () => this.onHomeInteractionChange();

        if (!this.content || !this.wrapper) {
            return;
        }

        this.init();
    }

    /**
     * init() - 启动热门潜点滚动组件的渲染、测量和事件绑定
     * @returns {void} - 无返回值，直接初始化组件
     */
    init() {
        this.render();
        this.measure();
        this.centerOnSpotId(getHomeHeroInitialSpotId());
        this.attachEvents();
        this.updateTrackPosition(true);
        this.syncMotionLiteState(true);
        this.scheduleAutoStep();
    }

    /**
     * centerOnSpotId(spotId) - 让首页“今日海域”初始停在指定海域卡片
     * @param {number} spotId - 需要优先展示的海域 id
     * @returns {void} - 无返回值，直接把轨道移到目标卡片
     */
    centerOnSpotId(spotId) {
        const targetDataIndex = divingSpotsData.findIndex((spot) => spot.id === spotId);
        if (targetDataIndex < 0 || this.cards.length === 0 || this.cardCenterOffsets.length === 0) {
            return;
        }

        const preferredSetIndex = Math.max(0, Math.floor(this.cloneSets / 2));
        const targetCardIndex = this.clamp((preferredSetIndex * this.totalCards) + targetDataIndex, 0, this.cards.length - 1);
        const targetCenter = this.cardCenterOffsets[targetCardIndex];
        if (!Number.isFinite(targetCenter)) {
            return;
        }

        this.trackPosition = targetCenter - this.wrapperCenter;
        this.recenterTrack();
        this.lastAppliedTrackPosition = Number.NaN;
    }

    /**
     * render() - 渲染竹签滚动区的全部卡片和克隆集合
     * @returns {void} - 无返回值，直接更新卡片 DOM
     */
    render() {
        const fragment = document.createDocumentFragment();
        const visibleSetIndex = Math.floor(this.cloneSets / 2);
        const preferredDataIndex = Math.max(0, divingSpotsData.findIndex((spot) => spot.id === getHomeHeroInitialSpotId()));
        const eagerRange = this.performanceProfile.lite ? 0 : 1;
        const heroImageSlot = HOME_IMAGE_RENDER_SLOTS.heroCard;

        for (let set = 0; set < this.cloneSets; set += 1) {
            divingSpotsData.forEach((spot, dataIndex) => {
                const imageAsset = resolveHomeImageAsset(spot.imageOriginal || spot.image);
                const circularDistance = Math.min(
                    Math.abs(dataIndex - preferredDataIndex),
                    Math.abs(dataIndex - preferredDataIndex + this.totalCards),
                    Math.abs(dataIndex - preferredDataIndex - this.totalCards)
                );
                const shouldPrioritizeImage = set === visibleSetIndex && circularDistance <= eagerRange;
                const isPrimaryFocusImage = set === visibleSetIndex && circularDistance === 0;
                const card = document.createElement('div');
                card.className = 'bamboo-card';
                card.dataset.spotId = String(spot.id);
                card.dataset.url = `detail.html?id=${spot.id}`;
                card.style.setProperty('--enter-delay', `${(spot.id - 1) * 0.045 + set * 0.04}s`);
                card.innerHTML = `
                    <div class="bamboo-card-image-wrapper">
                        <img
                            src="${imageAsset.src}"
                            data-fallback-src="${imageAsset.fallbackSrc}"
                            alt="${spot.name}"
                            class="bamboo-card-image"
                            draggable="false"
                            decoding="async"
                            width="${heroImageSlot.width}"
                            height="${heroImageSlot.height}"
                            ${shouldPrioritizeImage
                                ? (isPrimaryFocusImage ? 'loading="eager" fetchpriority="high"' : 'loading="eager" fetchpriority="auto"')
                                : 'loading="lazy" fetchpriority="low"'}
                            onerror="${buildImageErrorHandler(spot.name, heroImageSlot)}"
                        >
                    </div>
                    <div class="bamboo-card-content">
                        <h3 class="bamboo-card-title">${spot.name}</h3>
                        <p class="bamboo-card-tagline">${spot.tagline}</p>
                        <div class="bamboo-card-footer">
                            <div class="bamboo-card-price">${spot.price}</div>
                            <div class="bamboo-card-rating">${spot.rating} ★</div>
                        </div>
                    </div>
                `;

                fragment.appendChild(card);
            });
        }

        this.content.innerHTML = '';
        this.content.appendChild(fragment);
        this.cards = Array.from(this.content.querySelectorAll('.bamboo-card'));
        this.cardPhysics = this.cards.map(() => this.createCardPhysicsState());
    }

    /**
     * createCardPhysicsState() - 创建单张卡片的物理状态参数
     * @returns {Object} - 卡片物理状态对象
     */
    createCardPhysicsState() {
        return {
            baseAmplitude: this.randomBetween(8, 15),
            frequency: this.randomBetween(4.5, 8.8),
            phase: this.randomBetween(0, Math.PI * 2),
            lagScale: this.randomBetween(0.018, 0.03),
            dragBackScale: this.randomBetween(0.005, 0.009),
            recoilScale: this.randomBetween(0.85, 1.3),
            jitterX: 0,
            jitterV: 0,
            lagX: 0,
            lagV: 0,
            wobbleY: 0,
            wobbleR: 0,
            renderedWobbleX: null,
            renderedElasticX: null,
            renderedWobbleY: null,
            renderedWobbleR: null
        };
    }

    /**
     * measure() - 测量卡片步长和整组宽度，用于滚动定位
     * @returns {void} - 无返回值，直接更新尺寸数据
     */
    measure() {
        if (this.cards.length < 1) {
            return;
        }

        const first = this.cards[0];
        const second = this.cards[1];

        if (second) {
            this.cardStride = Math.abs(second.offsetLeft - first.offsetLeft);
        } else {
            this.cardStride = first.getBoundingClientRect().width;
        }

        this.setWidth = this.totalCards * this.cardStride;
        this.wrapperWidth = this.wrapper.clientWidth;
        this.wrapperCenter = this.wrapperWidth * 0.5;
        this.centerWeightMaxDist = Math.max(
            this.wrapperWidth * (this.performanceProfile.lite ? 0.58 : 0.7),
            this.cardStride * (this.performanceProfile.lite ? 1.8 : 2.2)
        );
        this.physicsRangeRadius = Math.max(
            this.performanceProfile.lite ? 3 : 4,
            Math.ceil(this.wrapperWidth / Math.max(this.cardStride, 1)) + (this.performanceProfile.lite ? 1 : 2)
        );
        this.cardCenterOffsets = this.cards.map((card) => card.offsetLeft + card.offsetWidth * 0.5);

        if (!Number.isFinite(this.trackPosition) || this.trackPosition <= 0) {
            this.trackPosition = this.setWidth;
        }

        this.recenterTrack();
        this.lastAppliedTrackPosition = Number.NaN;
    }

    /**
     * attachEvents() - 绑定拖拽、悬停、按钮点击和窗口尺寸变化事件
     * @returns {void} - 无返回值，直接注册交互事件
     */
    attachEvents() {
        if (this.leftBtn) {
            this.leftBtn.addEventListener('click', (event) => {
                event.preventDefault();
                this.startStepScroll(-1, false);
            });
        }

        if (this.rightBtn) {
            this.rightBtn.addEventListener('click', (event) => {
                event.preventDefault();
                this.startStepScroll(1, false);
            });
        }

        this.wrapper.style.touchAction = 'pan-y';

        this.wrapper.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
        this.wrapper.addEventListener('pointermove', (event) => this.handlePointerMove(event));
        this.wrapper.addEventListener('pointerup', (event) => this.handlePointerUp(event));
        this.wrapper.addEventListener('pointercancel', (event) => this.handlePointerUp(event));
        this.wrapper.addEventListener('lostpointercapture', (event) => this.handleLostPointerCapture(event));
        this.wrapper.addEventListener('click', (event) => this.handleCardClick(event));
        this.wrapper.addEventListener('dragstart', (event) => {
            event.preventDefault();
        });

        if (this.enableHoverTracking) {
            this.wrapper.addEventListener('mouseenter', (event) => {
                this.pointerInsideWrapper = true;
                this.pointerClientX = event.clientX;
                this.pointerClientY = event.clientY;
                this.lastHoverSyncTs = 0;
                this.lastHoverTrackPosition = this.trackPosition;
                // 进入时不直接清掉自动轮播链路，只在定时器触发时按悬停状态决定是否继续，
                // 避免 mouseleave 丢失后整段自动滑动永久停死。
                this.updateHoverFromPointer();
            });

            this.wrapper.addEventListener('mousemove', (event) => {
                this.pointerInsideWrapper = true;
                this.pointerClientX = event.clientX;
                this.pointerClientY = event.clientY;
                if (this.isDragging) {
                    return;
                }
                this.updateHoverFromPointer();
            });

            this.wrapper.addEventListener('mouseleave', () => {
                this.pointerInsideWrapper = false;
                this.setHoveredCard(null);
                this.lastHoverSyncTs = 0;
                if (!this.isDragging) {
                    this.scheduleAutoStep();
                }
            });
        }

        window.addEventListener('resize', () => {
            this.measure();
            this.updateTrackPosition(true);
            this.ensureFrameLoop();
        });
        window.addEventListener('homeinteractionchange', this.handleHomeInteractionChange);

        this.setupVisibilityTracking();
    }

    /**
     * handlePointerDown(event) - 处理拖拽开始时的状态初始化
     * @param {PointerEvent} event - 指针按下事件对象
     * @returns {void} - 无返回值，直接更新拖拽状态
     */
    handlePointerDown(event) {
        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        this.cancelPointerMoveFrame();
        this.cancelAutoStep();
        this.inertia.active = false;
        this.trackVelocity = 0;

        this.isDragging = true;
        this.pointerId = event.pointerId;
        this.startPointerX = event.clientX;
        this.startTrackPosition = this.trackPosition;
        this.lastPointerX = event.clientX;
        this.lastPointerTime = performance.now();
        this.lastTrackVelocity = 0;
        this.dragMoved = false;

        this.pointerClientX = event.clientX;
        this.pointerClientY = event.clientY;
        this.pressedCard = event.target.closest('.bamboo-card');
        this.setHoveredCard(null);
        this.trackPositionDirty = false;

        this.wrapper.classList.add('is-dragging');
        this.syncMotionLiteState(true);
        this.ensureFrameLoop();

        if (this.wrapper.setPointerCapture) {
            this.wrapper.setPointerCapture(event.pointerId);
        }
    }

    /**
     * cancelPointerMoveFrame() - 取消尚未刷新的拖拽位移合并帧
     * @returns {void}
     */
    cancelPointerMoveFrame() {
        if (this.pointerMoveRafId) {
            cancelAnimationFrame(this.pointerMoveRafId);
            this.pointerMoveRafId = 0;
        }

        this.pendingPointerMove = null;
    }

    /**
     * flushPointerMoveFrame(timestamp) - 在动画帧里合并最近一次拖拽移动
     * @param {number} timestamp - 当前帧时间戳
     * @returns {void}
     */
    flushPointerMoveFrame(timestamp) {
        this.pointerMoveRafId = 0;

        const pending = this.pendingPointerMove;
        if (!pending || !this.isDragging || pending.pointerId !== this.pointerId) {
            return;
        }

        this.pendingPointerMove = null;

        const now = pending.now || performance.now();
        const dragDeltaX = pending.clientX - this.startPointerX;

        this.trackPosition = this.startTrackPosition - dragDeltaX;
        this.recenterTrack();
        this.trackPositionDirty = true;

        const dt = Math.max((now - this.lastPointerTime) / 1000, 0.001);
        const deltaX = pending.clientX - this.lastPointerX;
        const nextVelocity = -(deltaX / dt);
        const accel = (nextVelocity - this.lastTrackVelocity) / dt;
        this.lastTrackVelocity = nextVelocity;
        this.trackVelocity = this.lastTrackVelocity;

        if (Math.abs(dragDeltaX) > this.dragThreshold) {
            this.dragMoved = true;
        }

        this.pointerClientX = pending.clientX;
        this.pointerClientY = pending.clientY;
        this.lastPointerX = pending.clientX;
        this.lastPointerTime = now;

        this.injectShake(Math.abs(this.lastTrackVelocity));
        this.applyDragRecoil(this.lastTrackVelocity, accel);
        this.ensureFrameLoop();
    }

    /**
     * handlePointerMove(event) - 处理拖拽过程中的位置更新和速度记录
     * @param {PointerEvent} event - 指针移动事件对象
     * @returns {void} - 无返回值，直接更新轨道位置
     */
    handlePointerMove(event) {
        if (!this.isDragging || event.pointerId !== this.pointerId) {
            return;
        }

        // If mouseup happened outside the wrapper and pointerup was missed,
        // stop the drag on the next move back into the region.
        if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
            this.handlePointerUp(event);
            return;
        }

        this.pointerClientX = event.clientX;
        this.pointerClientY = event.clientY;
        this.pendingPointerMove = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            now: performance.now()
        };

        if (!this.pointerMoveRafId) {
            this.pointerMoveRafId = requestAnimationFrame((timestamp) => this.flushPointerMoveFrame(timestamp));
        }

        this.ensureFrameLoop();
    }

    /**
     * handlePointerUp(event) - 处理拖拽结束后的收尾与惯性计算
     * @param {PointerEvent} event - 指针抬起或取消事件对象
     * @returns {void} - 无返回值，直接结束拖拽流程
     */
    handlePointerUp(event) {
        if (!this.isDragging || event.pointerId !== this.pointerId) {
            return;
        }

        this.flushPointerMoveFrame(performance.now());
        this.cancelPointerMoveFrame();

        this.isDragging = false;
        this.pointerId = null;
        this.wrapper.classList.remove('is-dragging');

        if (this.dragMoved) {
            this.suppressClickUntil = performance.now() + 180;
            this.pressedCard = null;
        }

        if (this.wrapper.releasePointerCapture && this.wrapper.hasPointerCapture(event.pointerId)) {
            this.wrapper.releasePointerCapture(event.pointerId);
        }

        if (this.dragMoved) {
            this.startInertiaFromRelease(this.lastTrackVelocity);
        } else {
            this.trackVelocity = 0;
            this.inertia.active = false;
        }

        this.syncMotionLiteState(true);

        if (this.enableAutoStep && !HOME_INTERACTION_STATE.scrollTraveling) {
            this.scheduleAutoStep();
        }
    }

    /**
     * handleLostPointerCapture(event) - 在指针捕获丢失时兜底清理拖拽状态
     * @param {PointerEvent} event - 指针捕获丢失事件对象
     * @returns {void} - 无返回值，直接恢复组件状态
     */
    handleLostPointerCapture(event) {
        if (!this.isDragging || event.pointerId !== this.pointerId) {
            return;
        }

        this.handlePointerUp(event);
    }

    /**
     * handleCardClick(event) - 处理热门潜点卡片点击并跳转到详情页
     * @param {MouseEvent} event - 卡片点击事件对象
     * @returns {void} - 无返回值，直接执行跳转
     */
    handleCardClick(event) {
        if (performance.now() < this.suppressClickUntil) {
            this.pressedCard = null;
            return;
        }

        if (this.isDragging) {
            this.pressedCard = null;
            return;
        }

        const card = event.target.closest('.bamboo-card') || this.pressedCard;
        this.pressedCard = null;
        if (!card || !this.content.contains(card)) {
            return;
        }

        if (this.autoStep) {
            this.finishStepScrollImmediately();
        }

        const url = card.dataset.url;
        if (url) {
            const isHeroHotspotCard = Boolean(card.closest('.hero-hotspots-shell'));

            if (isHeroHotspotCard) {
                runHeroDeparture(() => {
                    navigateWithDepth(url);
                }, { shouldReset: false, callbackDelay: HERO_ROUTE_READY_DELAY });
                return;
            }

            navigateWithDepth(url);
        }
    }

    /**
     * startInertiaFromRelease(releaseVelocity) - 按释放速度启动轨道惯性滚动
     * @param {number} releaseVelocity - 拖拽释放瞬间的速度
     * @returns {void} - 无返回值，直接更新惯性状态
     */
    startInertiaFromRelease(releaseVelocity) {
        if (!this.enableInertia) {
            this.trackVelocity = 0;
            this.inertia.active = false;
            this.inertia.boostTime = 0;
            this.inertia.boostAccel = 0;
            return;
        }

        const clamped = this.clamp(releaseVelocity, -3200, 3200);

        if (Math.abs(clamped) < 40) {
            this.trackVelocity = 0;
            this.inertia.active = false;
            this.inertia.boostTime = 0;
            this.inertia.boostAccel = 0;
            return;
        }

        this.inertia.active = true;
        this.inertia.boostTime = 0;
        this.inertia.boostAccel = 0;
        this.trackVelocity = clamped;
        this.injectShake(Math.abs(this.trackVelocity) * 1.1);
        this.ensureFrameLoop();
    }

    /**
     * startStepScroll(direction, isAutoStep) - 按指定方向启动单步滚动动画
     * @param {number} direction - 滚动方向，通常为 -1 或 1
     * @param {boolean} isAutoStep - 是否为自动滚动触发
     * @returns {void} - 无返回值，直接启动步进滚动
     */
    startStepScroll(direction, isAutoStep) {
        if (this.isDragging) {
            return false;
        }

        if (HOME_INTERACTION_STATE.scrollTraveling) {
            return false;
        }

        if (isHomeInteractionLocked()) {
            return false;
        }

        const normalizedDirection = Math.sign(direction || 0) || 1;

        if (this.autoStep && isAutoStep) {
            return false;
        }

        if (isAutoStep && !this.canAnimateFrame()) {
            return false;
        }

        if (!isAutoStep && this.autoStep) {
            if (normalizedDirection === this.autoStep.direction) {
                this.finishStepScrollImmediately();
            } else {
                this.settleCurrentStepForDirection(normalizedDirection);
            }
        }

        this.inertia.active = false;
        this.trackVelocity = 0;

        const from = this.trackPosition;
        const to = from + normalizedDirection * this.cardStride;

        this.autoStep = {
            from,
            to,
            direction: normalizedDirection,
            duration: this.randomBetween(this.autoStepDurationMin, this.autoStepDurationMax),
            elapsed: 0,
            brakeImpulseApplied: false
        };

        if (isAutoStep) {
            this.autoStepCount += 1;
        }

        this.injectShake(1000);

        if (!isAutoStep && this.enableAutoStep) {
            this.scheduleAutoStep();
        }

        this.ensureFrameLoop();
        return true;
    }

    /**
     * scheduleAutoStep() - 安排下一次自动滚动的触发时间
     * @returns {void} - 无返回值，直接设置定时器
     */
    scheduleAutoStep() {
        if (!this.enableAutoStep || HOME_INTERACTION_STATE.scrollTraveling) {
            return;
        }

        if (this.autoTimer) {
            clearTimeout(this.autoTimer);
            this.autoTimer = null;
        }

        const isFirstAutoStep = this.autoStepCount < 1;
        const baseDelay = isFirstAutoStep ? this.autoInitialDelayMs : this.autoIntervalMs;
        const jitterMin = isFirstAutoStep ? this.autoInitialDelayJitterMinMs : this.autoIntervalJitterMinMs;
        const jitterMax = isFirstAutoStep ? this.autoInitialDelayJitterMaxMs : this.autoIntervalJitterMaxMs;
        const randomJitter = this.randomBetween(jitterMin, jitterMax);
        const delay = Math.max(isFirstAutoStep ? 900 : 1600, baseDelay + randomJitter);
        this.autoTimer = setTimeout(() => {
            // `pointerInsideWrapper` 只靠 mouseenter / mouseleave 维护，可能出现状态残留；
            // 这里用真实 hover 状态兜底，把“视觉已离开但内部仍判定悬停”的情况清掉。
            if (this.pointerInsideWrapper && this.wrapper && !this.wrapper.matches(':hover')) {
                this.pointerInsideWrapper = false;
                this.setHoveredCard(null);
                this.lastHoverSyncTs = 0;
            }

            if (!this.canAnimateFrame() || HOME_INTERACTION_STATE.scrollTraveling) {
                this.scheduleAutoStep();
                return;
            }

            if (!this.isDragging && !this.inertia.active && !this.autoStep && !this.pointerInsideWrapper) {
                this.startStepScroll(1, true);
                this.scheduleAutoStep();
            } else {
                this.scheduleAutoStep();
            }
        }, delay);
    }

    /**
     * cancelAutoStep() - 取消当前自动滚动定时或正在执行的自动步进
     * @returns {void} - 无返回值，直接清理自动滚动状态
     */
    cancelAutoStep() {
        this.autoStep = null;
        if (this.autoTimer) {
            clearTimeout(this.autoTimer);
            this.autoTimer = null;
        }
    }

    /**
     * schedulePendingManualStep() - 在当前自动步进结束后再安排下一轮自动滑动
     * @returns {void}
     */
    schedulePendingManualStep() {
        if (!this.enableAutoStep) {
            return;
        }

        this.scheduleAutoStep();
    }

    /**
     * startFrameLoop() - 启动组件的逐帧更新循环
     * @returns {void} - 无返回值，直接开始 requestAnimationFrame 循环
     */
    startFrameLoop() {
        this.ensureFrameLoop();
    }

    /**
     * setupVisibilityTracking() - 监听可见性变化，只在真正需要时驱动逐帧动画
     * @returns {void}
     */
    setupVisibilityTracking() {
        document.addEventListener('visibilitychange', this.handleDocumentVisibilityChange);

        if (!('IntersectionObserver' in window)) {
            return;
        }

        this.visibilityObserver = new IntersectionObserver((entries) => {
            const entry = entries[0];
            this.isWrapperVisible = Boolean(entry?.isIntersecting || entry?.intersectionRatio > 0);

            if (this.isWrapperVisible) {
                this.ensureFrameLoop();
                return;
            }

            this.stopFrameLoop();
        }, {
            threshold: 0.02
        });

        this.visibilityObserver.observe(this.wrapper);
    }

    /**
     * syncDocumentVisibility() - 根据页面标签显隐切换动画循环
     * @returns {void}
     */
    syncDocumentVisibility() {
        this.isPageVisible = !document.hidden;

        if (this.isPageVisible) {
            this.lastFrameTs = 0;
            this.ensureFrameLoop();
            return;
        }

        this.stopFrameLoop();
    }

    onHomeInteractionChange() {
        if (HOME_INTERACTION_STATE.scrollTraveling) {
            if (this.autoStep) {
                this.finishStepScrollImmediately();
            }
            this.cancelAutoStep();
            this.inertia.active = false;
            this.trackVelocity = 0;
        }

        if (isHomeInteractionLocked() && !this.isDragging) {
            this.syncMotionLiteState(true);
            this.stopFrameLoop();
            return;
        }

        if (this.enableAutoStep && !this.isDragging && !this.pointerInsideWrapper) {
            this.scheduleAutoStep();
        }

        this.syncMotionLiteState(true);
        this.ensureFrameLoop();
    }

    shouldUseMotionLite() {
        return this.isDragging
            || HOME_INTERACTION_STATE.scrollTraveling
            || Math.abs(this.trackVelocity) >= this.motionLiteVelocityThreshold;
    }

    syncMotionLiteState(force = false) {
        const nextMotionLite = this.shouldUseMotionLite();
        if (!force && nextMotionLite === this.isMotionLite) {
            return;
        }

        this.isMotionLite = nextMotionLite;
        this.wrapper.classList.toggle('is-motion-lite', nextMotionLite);

        if (!nextMotionLite) {
            return;
        }

        this.shakeEnergy = 0;
        this.lastActivePhysicsRange = null;
        this.cardPhysics.forEach((_, index) => {
            this.resetCardPhysicsState(index);
        });
    }

    /**
     * canAnimateFrame() - 判断当前组件是否适合继续执行逐帧动画
     * @returns {boolean}
     */
    canAnimateFrame() {
        return this.isPageVisible && this.isWrapperVisible && (!isHomeInteractionLocked() || this.isDragging);
    }

    /**
     * shouldRunFrame() - 判断当前时刻是否真的需要保留 requestAnimationFrame 循环
     * @returns {boolean}
     */
    shouldRunFrame() {
        if (!this.canAnimateFrame()) {
            return false;
        }

        if (isHomeInteractionLocked() && !this.isDragging && !this.pendingPointerMove) {
            return false;
        }

        return Boolean(this.pendingPointerMove)
            || this.isDragging
            || Boolean(this.autoStep)
            || this.inertia.active
            || Math.abs(this.trackVelocity) > 0.1
            || this.shakeEnergy > 0.01
            || this.trackPositionDirty;
    }

    /**
     * ensureFrameLoop() - 在需要时才启动帧循环，避免组件空转
     * @returns {void}
     */
    ensureFrameLoop() {
        if (this.frameRafId || !this.shouldRunFrame()) {
            return;
        }

        this.frameRafId = requestAnimationFrame(this.frameLoop);
    }

    /**
     * stopFrameLoop() - 停止当前逐帧循环，并重置时间戳
     * @returns {void}
     */
    stopFrameLoop() {
        if (this.frameRafId) {
            cancelAnimationFrame(this.frameRafId);
            this.frameRafId = 0;
        }

        this.lastFrameTs = 0;
    }

    /**
     * runFrame(timestamp) - 执行一帧轨道和卡片动画，并按需继续调度下一帧
     * @param {number} timestamp - 当前帧时间戳
     * @returns {void}
     */
    runFrame(timestamp) {
        this.frameRafId = 0;

        if (!this.shouldRunFrame()) {
            this.lastFrameTs = 0;
            return;
        }

        if (!this.lastFrameTs) {
            this.lastFrameTs = timestamp;
        }

        const dt = Math.min((timestamp - this.lastFrameTs) / 1000, 0.05);
        this.lastFrameTs = timestamp;

        this.updateTrackMotion(dt);
        if (this.trackPositionDirty) {
            this.updateTrackPosition();
            this.trackPositionDirty = false;
        }
        this.syncMotionLiteState();
        this.updateCardPhysics(dt, timestamp / 1000);
        this.syncHoverWhileTrackMoves(timestamp);

        if (this.shouldRunFrame()) {
            this.frameRafId = requestAnimationFrame(this.frameLoop);
            return;
        }

        this.lastFrameTs = 0;
    }

    /**
     * updateTrackMotion(dt) - 按时间步进更新轨道位置与惯性状态
     * @param {number} dt - 当前帧的时间增量
     * @returns {void} - 无返回值，直接更新轨道运动
     */
    updateTrackMotion(dt) {
        const previous = this.trackPosition;
        let shouldDeriveVelocityFromDelta = false;

        if (this.autoStep) {
            shouldDeriveVelocityFromDelta = true;
            this.autoStep.elapsed += dt;
            const progress = Math.min(this.autoStep.elapsed / this.autoStep.duration, 1);
            const eased = this.easeStepWithBrake(progress);

            this.trackPosition = this.autoStep.from + (this.autoStep.to - this.autoStep.from) * eased;

            if (!this.autoStep.brakeImpulseApplied && progress >= 0.78) {
                this.applyStepBrakeImpulse(this.autoStep.direction);
                this.autoStep.brakeImpulseApplied = true;
            }

            if (progress >= 1) {
                this.trackPosition = this.autoStep.to;
                this.trackVelocity = 0;
                this.autoStep = null;
                this.schedulePendingManualStep();
            }
        } else if (this.inertia.active && !this.isDragging) {
            this.trackPosition += this.trackVelocity * dt;
            this.trackVelocity *= Math.pow(0.94, dt * 60);

            if (Math.abs(this.trackVelocity) < 10) {
                this.trackVelocity = 0;
                this.inertia.active = false;
            }
        } else if (!this.isDragging) {
            this.trackVelocity *= Math.pow(0.82, dt * 60);
            if (Math.abs(this.trackVelocity) < 0.1) {
                this.trackVelocity = 0;
            }
        }

        if (this.trackPosition !== previous) {
            const trackDelta = this.trackPosition - previous;
            this.recenterTrack();
            // Use the pre-wrap delta so crossing the loop seam does not turn into a huge velocity spike.
            if (shouldDeriveVelocityFromDelta && dt > 0) {
                this.trackVelocity = trackDelta / dt;
            }
            this.updateTrackPosition();
            this.trackPositionDirty = false;
        }
    }

    /**
     * updateCardPhysics(dt, time) - 更新单张卡片的漂浮、抖动和滞后效果
     * @param {number} dt - 当前帧时间增量
     * @param {number} time - 当前动画时间戳
     * @returns {void} - 无返回值，直接更新卡片视觉状态
     */
    updateCardPhysics(dt, time) {
        if (this.cards.length === 0) {
            return;
        }

        if (this.isMotionLite) {
            return;
        }

        const energyDecay = this.isDragging ? 0.985 : 0.965;
        this.shakeEnergy *= Math.pow(energyDecay, dt * 60);
        if (this.shakeEnergy < 0.01) {
            this.shakeEnergy = 0;
        }

        const activeRange = this.getActivePhysicsRange();

        if (!this.hasPhysicsActivity() || activeRange.end < activeRange.start) {
            this.resetStalePhysics(null);
            return;
        }

        for (let i = activeRange.start; i <= activeRange.end; i += 1) {
            const card = this.cards[i];
            const state = this.cardPhysics[i];
            const centerWeight = this.getCenterWeightByIndex(i);

            const dynamicAmp = state.baseAmplitude * this.shakeEnergy * centerWeight * 1.1;
            const oscillationA = Math.sin(time * state.frequency + state.phase);
            const oscillationB = Math.sin(time * (state.frequency * 0.63) + state.phase * 1.77);
            const targetJitterX = (oscillationA + oscillationB * 0.46) * dynamicAmp;

            const springK = 108 + state.frequency * 7;
            const springC = 13.5;
            const accel = (targetJitterX - state.jitterX) * springK - state.jitterV * springC;
            state.jitterV += accel * dt;
            state.jitterX += state.jitterV * dt;

            const velocityLagTarget = this.clamp(-this.trackVelocity * state.lagScale * centerWeight, -34, 34);
            const dragBackTarget = this.isDragging
                ? this.clamp(-Math.sign(this.trackVelocity || 0.001) * Math.abs(this.trackVelocity) * state.dragBackScale * centerWeight, -20, 20)
                : 0;
            const lagTarget = velocityLagTarget + dragBackTarget;
            const lagSpring = this.isDragging ? 96 : 144;
            const lagDamping = this.isDragging ? 14.5 : 21.5;
            const lagAccel = (lagTarget - state.lagX) * lagSpring - state.lagV * lagDamping;
            state.lagV += lagAccel * dt;
            state.lagX += state.lagV * dt;

            const verticalTarget = Math.sin(time * (state.frequency * 1.18) + state.phase * 0.8) * dynamicAmp * 0.26;
            state.wobbleY += (verticalTarget - state.wobbleY) * Math.min(1, dt * 10);

            const rotateTarget = this.clamp((state.jitterX + state.lagX) * 0.22, -6, 6);
            state.wobbleR += (rotateTarget - state.wobbleR) * Math.min(1, dt * 12);

            this.applyCardPhysicsStyle(card, state);
        }

        this.resetStalePhysics(activeRange);
    }

    /**
     * injectShake(speedPxPerSecond) - 向轨道注入一次刹停抖动能量
     * @param {number} speedPxPerSecond - 当前滚动速度
     * @returns {void} - 无返回值，直接更新抖动能量
     */
    injectShake(speedPxPerSecond) {
        if (this.shouldUseMotionLite()) {
            return;
        }

        const normalized = this.clamp(speedPxPerSecond / 1600, 0, 1);
        this.shakeEnergy = this.clamp(this.shakeEnergy + 0.22 + normalized * 0.82, 0, 1.28);

        this.forEachActivePhysics((state, index) => {
            const centerWeight = this.getCenterWeightByIndex(index);
            const impulse = (120 + normalized * 340) * centerWeight * this.randomBetween(0.85, 1.35);
            const direction = Math.random() < 0.5 ? -1 : 1;
            state.jitterV += direction * impulse;
        });
    }

    /**
     * applyDragRecoil(velocity, accel) - 根据拖拽速度和加速度施加回弹感
     * @param {number} velocity - 当前拖拽速度
     * @param {number} accel - 当前拖拽加速度
     * @returns {void} - 无返回值，直接更新回弹参数
     */
    applyDragRecoil(velocity, accel) {
        if (this.shouldUseMotionLite()) {
            return;
        }

        if (Math.abs(velocity) < 25 && Math.abs(accel) < 650) {
            return;
        }

        const speedNorm = this.clamp(Math.abs(velocity) / 1900, 0, 1);
        const accelNorm = this.clamp(Math.abs(accel) / 7000, 0, 1);
        const direction = -Math.sign(velocity || accel || 1);
        const impulseBase = 80 + speedNorm * 180 + accelNorm * 140;

        this.forEachActivePhysics((state, index) => {
            const centerWeight = this.getCenterWeightByIndex(index);
            const impulse = impulseBase * state.recoilScale * centerWeight * this.randomBetween(0.8, 1.2);
            state.lagV += direction * impulse;
            state.jitterV += (-direction * impulse) * 0.33;
        });
    }

    /**
     * updateHoverFromPointer() - 根据当前鼠标位置更新悬停卡片
     * @returns {void} - 无返回值，直接同步 hover 状态
     */
    updateHoverFromPointer() {
        if (!this.enableHoverTracking || isHomeInteractionLocked()) {
            return;
        }

        const element = document.elementFromPoint(this.pointerClientX, this.pointerClientY);
        const card = element ? element.closest('.bamboo-card') : null;

        if (!card || !this.content.contains(card)) {
            this.setHoveredCard(null);
            return;
        }

        this.setHoveredCard(card);
    }

    /**
     * syncHoverWhileTrackMoves(timestamp) - 轨道移动时低频同步 hover，避免 elementFromPoint 每帧轮询
     * @param {number} timestamp - 当前帧时间戳
     * @returns {void}
     */
    syncHoverWhileTrackMoves(timestamp) {
        if (
            !this.enableHoverTracking ||
            !this.pointerInsideWrapper ||
            this.isDragging ||
            isHomeInteractionLocked() ||
            (!this.autoStep && !this.inertia.active)
        ) {
            return;
        }

        if (
            timestamp - this.lastHoverSyncTs < 48
            && Math.abs(this.trackPosition - this.lastHoverTrackPosition) < 10
        ) {
            return;
        }

        this.lastHoverSyncTs = timestamp;
        this.lastHoverTrackPosition = this.trackPosition;
        this.updateHoverFromPointer();
    }

    /**
     * setHoveredCard(card) - 设置当前高亮悬停的卡片
     * @param {Element|null} card - 当前悬停卡片元素
     * @returns {void} - 无返回值，直接切换卡片状态
     */
    setHoveredCard(card) {
        if (card === this.activeCard) {
            return;
        }

        if (this.activeCard) {
            this.activeCard.classList.remove('active');
        }

        this.hoveredCard = card;
        this.activeCard = card;

        if (this.activeCard) {
            this.activeCard.classList.add('active');
        }
    }

    /**
     * getCenterWeightByIndex(index) - 计算指定卡片相对中心位置的权重
     * @param {number} index - 卡片索引
     * @returns {number} - 中心权重值
     */
    getCenterWeightByIndex(index) {
        const cardCenterOffset = this.cardCenterOffsets[index];
        if (!Number.isFinite(cardCenterOffset) || !this.wrapperWidth) {
            return 0.2;
        }

        const cardCenter = cardCenterOffset - this.trackPosition;
        const dist = Math.abs(cardCenter - this.wrapperCenter);
        const maxDist = this.centerWeightMaxDist || Math.max(this.wrapperWidth * 0.7, this.cardStride * 2.2);
        const normalized = 1 - dist / maxDist;

        return this.clamp(normalized, 0.2, 1);
    }

    /**
     * recenterTrack() - 在循环滚动场景下重置轨道到中间安全区
     * @returns {void} - 无返回值，直接调整轨道位置
     */
    recenterTrack() {
        const min = this.setWidth * this.trackLoopMinFactor;
        const max = this.setWidth * this.trackLoopMaxFactor;

        if (this.trackPosition < min) {
            this.trackPosition += this.setWidth;
        } else if (this.trackPosition > max) {
            this.trackPosition -= this.setWidth;
        }
    }

    /**
     * updateTrackPosition() - 将当前轨道位移同步到 DOM transform
     * @returns {void} - 无返回值，直接更新轨道样式
     */
    updateTrackPosition(force = false) {
        if (!force && Math.abs(this.trackPosition - this.lastAppliedTrackPosition) < 0.01) {
            return;
        }

        this.lastAppliedTrackPosition = this.trackPosition;
        this.content.style.transform = `translate3d(${-this.trackPosition}px, 0, 0)`;
    }

    /**
     * finishStepScrollImmediately() - 立即结束当前步进滚动并对齐到最终位置
     * @returns {void} - 无返回值，直接完成步进收束
     */
    finishStepScrollImmediately() {
        if (!this.autoStep) {
            return;
        }

        this.trackPosition = this.autoStep.to;
        this.autoStep = null;
        this.trackVelocity = 0;
        this.recenterTrack();
        this.updateTrackPosition();
        this.trackPositionDirty = false;
    }

    /**
     * settleCurrentStepForDirection(direction) - 在用户中途反向点击时，把当前步进收回到更合理的卡位
     * @param {number} direction - 用户这次最新点击的目标方向
     * @returns {void}
     */
    settleCurrentStepForDirection(direction) {
        if (!this.autoStep) {
            return;
        }

        const normalizedDirection = Math.sign(direction || 0) || 1;
        const stride = Math.max(this.cardStride, 1);
        const stepIndex = normalizedDirection > 0
            ? Math.ceil(this.trackPosition / stride)
            : Math.floor(this.trackPosition / stride);

        this.trackPosition = stepIndex * stride;
        this.autoStep = null;
        this.trackVelocity = 0;
        this.recenterTrack();
        this.updateTrackPosition();
        this.trackPositionDirty = false;
    }

    /**
     * applyStepBrakeImpulse(direction) - 为步进滚动添加一次刹停阻尼脉冲
     * @param {number} direction - 当前滚动方向
     * @returns {void} - 无返回值，直接修改轨道速度
     */
    applyStepBrakeImpulse(direction) {
        if (this.shouldUseMotionLite()) {
            return;
        }

        const brakeDirection = -Math.sign(direction || 1);
        this.shakeEnergy = this.clamp(this.shakeEnergy + 0.08, 0, 1.12);

        this.forEachActivePhysics((state, index) => {
            const centerWeight = this.getCenterWeightByIndex(index);
            const impulse = (42 + centerWeight * 30) * state.recoilScale * this.randomBetween(0.92, 1.12);

            state.lagV += brakeDirection * impulse;
            state.jitterV += (-brakeDirection * impulse) * 0.16;
        });
    }

    /**
     * hasPhysicsActivity() - 判断当前是否还需要继续更新卡片物理状态
     * @returns {boolean}
     */
    hasPhysicsActivity() {
        return this.isDragging
            || Boolean(this.autoStep)
            || this.inertia.active
            || Math.abs(this.trackVelocity) > 0.1
            || this.shakeEnergy > 0.01;
    }

    /**
     * getActivePhysicsRange() - 估算当前视口附近需要更新物理效果的卡片范围
     * @returns {{start:number,end:number}}
     */
    getActivePhysicsRange() {
        if (this.cards.length === 0 || this.cardCenterOffsets.length === 0) {
            return { start: 0, end: -1 };
        }

        const firstCenter = this.cardCenterOffsets[0];
        const approximateCenterIndex = Math.round(
            (this.trackPosition + this.wrapperCenter - firstCenter) / Math.max(this.cardStride, 1)
        );
        const maxIndex = this.cards.length - 1;

        return {
            start: this.clamp(approximateCenterIndex - this.physicsRangeRadius, 0, maxIndex),
            end: this.clamp(approximateCenterIndex + this.physicsRangeRadius, 0, maxIndex)
        };
    }

    /**
     * forEachActivePhysics(callback) - 遍历当前视口附近真正需要参与计算的卡片状态
     * @param {(state: Object, index: number) => void} callback - 处理函数
     * @returns {void}
     */
    forEachActivePhysics(callback) {
        const range = this.getActivePhysicsRange();
        if (range.end < range.start) {
            return;
        }

        for (let i = range.start; i <= range.end; i += 1) {
            callback(this.cardPhysics[i], i);
        }
    }

    /**
     * resetStalePhysics(activeRange) - 将已离开可见范围的卡片物理状态收回到静止值
     * @param {{start:number,end:number}|null} activeRange - 当前活跃范围
     * @returns {void}
     */
    resetStalePhysics(activeRange) {
        const previousRange = this.lastActivePhysicsRange;
        this.lastActivePhysicsRange = activeRange;

        if (!previousRange) {
            return;
        }

        for (let i = previousRange.start; i <= previousRange.end; i += 1) {
            const stillActive = activeRange && i >= activeRange.start && i <= activeRange.end;
            if (stillActive) {
                continue;
            }

            this.resetCardPhysicsState(i);
        }
    }

    /**
     * resetCardPhysicsState(index) - 把单张卡片收回静止状态，避免离屏卡片继续参与动画
     * @param {number} index - 卡片索引
     * @returns {void}
     */
    resetCardPhysicsState(index) {
        const state = this.cardPhysics[index];
        const card = this.cards[index];
        if (!state || !card) {
            return;
        }

        state.jitterX = 0;
        state.jitterV = 0;
        state.lagX = 0;
        state.lagV = 0;
        state.wobbleY = 0;
        state.wobbleR = 0;

        this.applyCardPhysicsStyle(card, state);
    }

    /**
     * applyCardPhysicsStyle(card, state) - 仅在值变化时写入 CSS 变量，减少样式写入频率
     * @param {HTMLElement} card - 目标卡片节点
     * @param {Object} state - 卡片物理状态
     * @returns {void}
     */
    applyCardPhysicsStyle(card, state) {
        const wobbleX = `${state.jitterX.toFixed(2)}px`;
        const elasticX = `${state.lagX.toFixed(2)}px`;
        const wobbleY = `${state.wobbleY.toFixed(2)}px`;
        const wobbleR = `${state.wobbleR.toFixed(2)}deg`;

        if (state.renderedWobbleX !== wobbleX) {
            card.style.setProperty('--wobble-x', wobbleX);
            state.renderedWobbleX = wobbleX;
        }

        if (state.renderedElasticX !== elasticX) {
            card.style.setProperty('--elastic-x', elasticX);
            state.renderedElasticX = elasticX;
        }

        if (state.renderedWobbleY !== wobbleY) {
            card.style.setProperty('--wobble-y', wobbleY);
            state.renderedWobbleY = wobbleY;
        }

        if (state.renderedWobbleR !== wobbleR) {
            card.style.setProperty('--wobble-r', wobbleR);
            state.renderedWobbleR = wobbleR;
        }
    }

    /**
     * easeStepWithBrake(progress) - 计算带刹停感的步进缓动曲线
     * @param {number} progress - 当前动画进度
     * @returns {number} - 缓动后的进度值
     */
    easeStepWithBrake(progress) {
        const t = this.clamp(progress, 0, 1);
        return 1 - Math.pow(1 - t, 4);
    }

    /**
     * randomBetween(min, max) - 生成指定区间内的随机数
     * @param {number} min - 区间最小值
     * @param {number} max - 区间最大值
     * @returns {number} - 生成的随机数
     */
    randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }

    /**
     * clamp(value, min, max) - 将数值限制在指定区间内
     * @param {number} value - 原始数值
     * @param {number} min - 区间最小值
     * @param {number} max - 区间最大值
     * @returns {number} - 限制后的数值
     */
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
}

// 精选目的地舞台：深海档案墙 — 左侧竖排导航 + 右侧展示面板，海流推移式切换。
class CuratedWatersStage {
    /**
     * constructor() - 初始化深海档案墙的 DOM 引用和状态
     */
    constructor() {
        this.section = document.getElementById('featured-destinations');
        this.shell = this.section ? this.section.querySelector('.curated-waters-shell') : null;
        this.stage = document.getElementById('curatedWatersStage');
        this.mainCard = document.getElementById('curatedMainCard');
        this.liveSummary = document.getElementById('curatedLiveSummary');
        this.navRail = document.getElementById('destinationsGrid');
        this.currentIndex = Math.max(0, destinationsData.findIndex((item) => item.id === HOME_CURATED_DEFAULT_DESTINATION_ID));
        this.sampleBatchSize = 3;
        this.sampleBatchCursor = 0;
        this.activeSampleSlot = 0;
        this.switchTimer = 0;
        this.batchSwitchTimer = 0;
        this.batchRevealTimer = 0;
        this.revealTimer = 0;
        this.revealIntroRafId = 0;
        this.revealStageRafId = 0;
        this.stageSettleTimer = 0;
        this.initialHydrationRafId = 0;
        this.initialHydrationStep = 0;
        this.initialHydrationComplete = false;
        this.chunkedNavRailRafId = 0;
        this.cancelInitialPreloadTask = () => {};
        this.preloadedImageSources = new Set();
        this.announceSummary = createBufferedLiveAnnouncer(this.liveSummary);

        if (!this.section || !this.shell || !this.mainCard || !this.navRail) {
            return;
        }

        this.init();
    }

    /**
     * init() - 启动档案墙的渲染、事件绑定和预加载
     */
    init() {
        this.section.classList.remove('is-stage-hydrated');
        this.attachEvents();
        this.setupReveal();
        this.scheduleInitialHydration();
    }

    scheduleInitialHydration() {
        if (this.initialHydrationComplete || this.initialHydrationRafId) {
            return;
        }

        this.initialHydrationRafId = window.requestAnimationFrame(() => {
            this.initialHydrationRafId = 0;
            this.runInitialHydrationStep();
        });
    }

    runInitialHydrationStep() {
        if (this.initialHydrationComplete) {
            return;
        }

        if (this.initialHydrationStep === 0) {
            this.renderNavRail({
                chunked: true,
                onComplete: () => {
                    this.syncActiveNav();
                    this.initialHydrationStep = 1;
                    scheduleHomeHydrationViewportRefresh({ updateOnly: true });
                    this.scheduleInitialHydration();
                }
            });
            return;
        }

        if (this.initialHydrationStep === 1) {
            const hasSurface = Boolean(this.mainCard.querySelector('.curated-display-surface'));
            if (!hasSurface) {
                this.renderMainCard(this.currentIndex, { immediate: true, skipPreload: true });
            } else {
                this.syncActiveNav();
            }

            this.initialHydrationStep = 2;
            scheduleHomeHydrationViewportRefresh({ updateOnly: true });
            this.scheduleInitialHydration();
            return;
        }

        this.section.classList.add('is-stage-hydrated');
        this.initialHydrationComplete = true;
        this.initialHydrationStep = 3;
        scheduleHomeHydrationViewportRefresh({ force: true });
        this.scheduleInitialPreload(this.currentIndex);
    }

    scheduleInitialPreload(index) {
        this.cancelInitialPreloadTask();
        this.cancelInitialPreloadTask = scheduleIdleTask(() => {
            this.preloadNearby(index);
            this.cancelInitialPreloadTask = () => {};
        }, 900);
    }

    cancelPendingNavRailHydration() {
        if (this.chunkedNavRailRafId) {
            cancelAnimationFrame(this.chunkedNavRailRafId);
            this.chunkedNavRailRafId = 0;
        }
    }

    createNavButton(index, railIndex) {
        const dest = destinationsData[index];
        if (!dest) {
            return null;
        }

        const imageAsset = resolveHomeImageAsset(dest.imageOriginal || dest.image);
        const thumbSlot = HOME_IMAGE_RENDER_SLOTS.curatedNavThumb;
        const isActive = index === this.currentIndex;
        const revealDelay = 120 + railIndex * 56;
        const cycleDelay = 32 + railIndex * 42;
        const cycleShift = 12 + railIndex * 3;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `curated-nav-btn${isActive ? ' is-active' : ''}`;
        button.dataset.index = String(index);
        button.dataset.id = String(dest.id);
        button.dataset.slot = String(railIndex);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        button.setAttribute('aria-current', isActive ? 'true' : 'false');
        button.style.setProperty('--sample-reveal-delay', `${revealDelay}ms`);
        button.style.setProperty('--sample-cycle-delay', `${cycleDelay}ms`);
        button.style.setProperty('--sample-cycle-shift', `${cycleShift}px`);
        button.innerHTML = `
            <span class="curated-nav-thumb">
                <img
                    src="${imageAsset.src}"
                    data-fallback-src="${imageAsset.fallbackSrc}"
                    alt=""
                    class="curated-nav-thumb-img"
                    loading="lazy"
                    decoding="async"
                    fetchpriority="low"
                    width="${thumbSlot.width}"
                    height="${thumbSlot.height}"
                    onerror="${buildThumbImageErrorHandler()}"
                >
            </span>
            <span class="curated-nav-label">
                <span class="curated-nav-index">${String(index + 1).padStart(2, '0')}</span>
                <span class="curated-nav-name-row">
                    <span class="curated-nav-name">${dest.name}</span>
                    <span class="curated-nav-state">${dest.archiveLabel}</span>
                </span>
                <span class="curated-nav-eng">${dest.englishName}</span>
                <span class="curated-nav-keyword">${dest.sampleKeyword}</span>
                <span class="curated-nav-meta">${dest.sampleMeta}</span>
            </span>
        `;
        return button;
    }

    createNavRefreshButton(sampleCount) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'curated-nav-refresh';
        button.dataset.action = 'cycle-samples';
        button.style.setProperty('--sample-reveal-delay', `${132 + sampleCount * 56}ms`);
        button.style.setProperty('--sample-cycle-delay', `${54 + sampleCount * 34}ms`);
        button.innerHTML = `
            <span class="curated-nav-refresh-title">另一组海域</span>
            <span class="curated-nav-refresh-copy">换一批相邻海域，让中央这片继续安静停留。</span>
        `;
        return button;
    }

    /**
     * renderNavRail() - 渲染左侧竖排导航按钮
     */
    renderNavRail(options = {}) {
        const { chunked = false, onComplete = null } = options;
        const sampleIndices = this.getVisibleSampleIndices();
        const canCycleSamples = destinationsData.length > this.sampleBatchSize;

        this.cancelPendingNavRailHydration();

        if (chunked) {
            this.navRail.replaceChildren();
            const appenders = sampleIndices
                .map((index, railIndex) => () => {
                    const button = this.createNavButton(index, railIndex);
                    if (button) {
                        this.navRail.appendChild(button);
                    }
                });

            if (canCycleSamples) {
                appenders.push(() => {
                    this.navRail.appendChild(this.createNavRefreshButton(sampleIndices.length));
                });
            }

            const batchSize = 2;
            const runChunk = () => {
                this.chunkedNavRailRafId = 0;
                appenders.splice(0, batchSize).forEach((append) => append());
                if (appenders.length) {
                    this.chunkedNavRailRafId = requestAnimationFrame(runChunk);
                    return;
                }

                if (typeof onComplete === 'function') {
                    onComplete();
                }
            };

            this.chunkedNavRailRafId = requestAnimationFrame(runChunk);
            return;
        }

        const sampleMarkup = sampleIndices.map((index, railIndex) => {
            const button = this.createNavButton(index, railIndex);
            return button ? button.outerHTML : '';
        }).join('');

        const refreshMarkup = canCycleSamples
            ? this.createNavRefreshButton(sampleIndices.length).outerHTML
            : '';

        this.navRail.innerHTML = sampleMarkup + refreshMarkup;

        if (typeof onComplete === 'function') {
            onComplete();
        }
    }

    getAvailableSampleIndices() {
        return destinationsData
            .map((_, index) => index)
            .filter((index) => index !== this.currentIndex);
    }

    getVisibleSampleIndices() {
        const totalVisibleCount = Math.min(this.sampleBatchSize, destinationsData.length);
        if (totalVisibleCount <= 0) {
            return [];
        }

        const available = this.getAvailableSampleIndices();
        const activeSlot = Math.max(0, Math.min(this.activeSampleSlot, totalVisibleCount - 1));
        const visible = Array(totalVisibleCount).fill(null);
        const used = new Set([this.currentIndex]);
        let cursor = available.length ? this.sampleBatchCursor % available.length : 0;
        let guard = 0;

        visible[activeSlot] = this.currentIndex;

        for (let slot = 0; slot < totalVisibleCount; slot += 1) {
            if (slot === activeSlot) {
                continue;
            }

            while (guard < available.length * 2 + totalVisibleCount) {
                const candidate = available.length ? available[cursor % available.length] : null;
                cursor += 1;
                guard += 1;

                if (!Number.isInteger(candidate) || used.has(candidate)) {
                    continue;
                }

                visible[slot] = candidate;
                used.add(candidate);
                break;
            }
        }

        return visible.filter((index) => Number.isInteger(index));
    }

    cycleSampleBatch() {
        const available = this.getAvailableSampleIndices();
        const otherCount = Math.max(1, this.sampleBatchSize - 1);
        if (available.length <= otherCount || this.navRail.classList.contains('is-cycling')) {
            return;
        }

        if (this.batchSwitchTimer) {
            window.clearTimeout(this.batchSwitchTimer);
            this.batchSwitchTimer = 0;
        }

        if (this.batchRevealTimer) {
            window.clearTimeout(this.batchRevealTimer);
            this.batchRevealTimer = 0;
        }

        this.navRail.classList.remove('is-cycle-prime', 'is-cycle-reveal');
        this.navRail.classList.add('is-cycling');

        this.batchSwitchTimer = window.setTimeout(() => {
            this.sampleBatchCursor = (this.sampleBatchCursor + otherCount) % available.length;
            this.renderNavRail();
            this.syncActiveNav();

            requestAnimationFrame(() => {
                this.navRail.classList.remove('is-cycling');
                this.navRail.classList.add('is-cycle-prime');

                requestAnimationFrame(() => {
                    this.navRail.classList.remove('is-cycle-prime');
                    this.navRail.classList.add('is-cycle-reveal');

                    this.batchRevealTimer = window.setTimeout(() => {
                        this.navRail.classList.remove('is-cycle-reveal');
                        this.batchRevealTimer = 0;
                    }, 980);
                });
            });

            this.batchSwitchTimer = 0;
        }, 240);
    }

    /**
     * createDisplaySurface(dest, index, directionClass) - 创建右侧展示面板的 DOM
     * @param {Object} dest - 目的地数据
     * @param {number} index - 索引
     * @param {string} directionClass - 入场方向 class
     * @returns {HTMLDivElement}
     */
    createDisplaySurface(dest, index, directionClass) {
        const imageAsset = resolveHomeImageAsset(dest.imageOriginal || dest.image);
        const displaySlot = HOME_IMAGE_RENDER_SLOTS.curatedDisplay;
        const surface = document.createElement('div');
        surface.className = `curated-display-surface${directionClass ? ` ${directionClass}` : ''}`;
        surface.innerHTML = `
            <div class="curated-display-media">
                <img
                    src="${imageAsset.src}"
                    data-fallback-src="${imageAsset.fallbackSrc}"
                    alt="${dest.name}"
                    class="curated-display-image"
                    loading="lazy"
                    decoding="async"
                    fetchpriority="low"
                    width="${displaySlot.width}"
                    height="${displaySlot.height}"
                    onerror="${buildImageErrorHandler(dest.name, displaySlot)}"
                >
                <div class="curated-display-sea-note" aria-hidden="true">
                    <span class="curated-display-sea-note-label">Sea Signal</span>
                    <span class="curated-display-sea-note-value">${dest.sampleKeyword}</span>
                </div>
            </div>

            <div class="curated-display-copy">
                <p class="curated-display-kicker">${dest.archiveLabel}</p>

                <div class="curated-display-heading">
                    <h3 class="curated-display-name">${dest.name}</h3>
                    <p class="curated-display-english">${dest.englishName}</p>
                </div>

                <p class="curated-display-atmosphere">${dest.atmosphere}</p>

                <div class="curated-display-facts">
                    <div class="curated-display-fact">
                        <span class="curated-display-fact-label">适合等级</span>
                        <span class="curated-display-fact-value">${dest.level}</span>
                    </div>
                    <div class="curated-display-fact">
                        <span class="curated-display-fact-label">最佳季节</span>
                        <span class="curated-display-fact-value">${dest.season}</span>
                    </div>
                    <div class="curated-display-fact">
                        <span class="curated-display-fact-label">适合人群</span>
                        <span class="curated-display-fact-value">${dest.audience}</span>
                    </div>
                </div>

                <div class="curated-display-conditions">
                    ${dest.conditions.map((condition) => `
                        <span class="curated-display-condition">${condition}</span>
                    `).join('')}
                </div>

                <p class="curated-display-worth">
                    <span class="curated-display-worth-label">值得去</span>
                    <span class="curated-display-worth-text">${dest.worthIt}</span>
                </p>

                <p class="curated-display-footnote">${dest.sampleMeta}</p>

                <button type="button" class="curated-detail-button" data-detail-url="detail.html?id=${dest.id}">
                    <span>查看详情</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 12h12M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>
            </div>
        `;

        surface.dataset.index = String(index);
        return surface;
    }

    /**
     * renderMainCard(nextIndex, options) - 海流推移式切换展示面板
     * @param {number} nextIndex - 目标目的地索引
     * @param {Object} options - 配置项
     */
    renderMainCard(nextIndex, options = {}) {
        const { immediate = false, refreshNav = false, skipPreload = false } = options;
        const dest = destinationsData[nextIndex];
        if (!dest) {
            return;
        }

        const currentSurface = this.mainCard.querySelector('.curated-display-surface.is-active')
            || this.mainCard.querySelector('.curated-display-surface');
        const enterClass = immediate ? '' : 'from-depth is-entering';
        const leavingClass = 'to-depth';

        const nextSurface = this.createDisplaySurface(dest, nextIndex, enterClass);

        if (this.switchTimer) {
            window.clearTimeout(this.switchTimer);
            this.switchTimer = 0;
        }

        Array.from(this.mainCard.querySelectorAll('.curated-display-surface.is-leaving')).forEach((s) => {
            s.remove();
        });

        if (currentSurface && !immediate) {
            currentSurface.classList.remove('is-active', 'is-resting');
            currentSurface.classList.add('is-leaving', leavingClass);
        } else {
            Array.from(this.mainCard.querySelectorAll('.curated-display-surface')).forEach((s) => {
                s.remove();
            });
        }

        this.mainCard.appendChild(nextSurface);

        if (immediate) {
            nextSurface.classList.add('is-active');
        } else {
            requestAnimationFrame(() => {
                nextSurface.classList.add('is-active');
            });
            this.switchTimer = window.setTimeout(() => {
                Array.from(this.mainCard.querySelectorAll('.curated-display-surface.is-leaving')).forEach((s) => {
                    s.remove();
                });
                nextSurface.classList.remove('from-depth', 'is-entering');
                this.switchTimer = 0;
            }, 980);
        }

        this.currentIndex = nextIndex;
        if (refreshNav) {
            this.renderNavRail();
        }
        this.syncActiveNav();
        if (!skipPreload) {
            this.preloadNearby(nextIndex);
        }

        if (!immediate) {
            this.announceSummary(`已切换到${dest.name}，适合${dest.level}，最佳季节${dest.season}。`);
        }
    }

    /**
     * syncActiveNav() - 同步左侧导航按钮的激活态
     */
    syncActiveNav() {
        this.navRail.querySelectorAll('.curated-nav-btn').forEach((btn) => {
            const index = Number(btn.dataset.index);
            const isActive = index === this.currentIndex;
            const total = destinationsData.length;
            const clockwiseDistance = (index - this.currentIndex + total) % total;
            const distance = Math.min(
                Math.abs(index - this.currentIndex),
                total - Math.abs(index - this.currentIndex)
            );
            const clampedDistance = Math.min(distance, 4);
            const directionSign = isActive
                ? 0
                : (clockwiseDistance === 0
                    ? 0
                    : (clockwiseDistance <= total / 2 ? 1 : -1));
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            btn.setAttribute('aria-current', isActive ? 'true' : 'false');
            btn.style.setProperty('--sample-shift-x', `${isActive ? 0 : directionSign * (6 + clampedDistance * 4)}px`);
            btn.style.setProperty('--sample-shift-y', `${isActive ? 0 : clampedDistance * 9}px`);
            btn.style.setProperty('--sample-scale', `${isActive ? 1 : Math.max(0.92, 1 - clampedDistance * 0.018)}`);
            btn.style.setProperty('--sample-opacity', `${isActive ? 1 : Math.max(0.52, 0.88 - clampedDistance * 0.08)}`);
        });
    }

    /**
     * preloadNearby(index) - 预加载附近目的地图片
     */
    preloadNearby(index) {
        const targets = [
            destinationsData[index],
            destinationsData[(index + 1) % destinationsData.length],
            destinationsData[(index - 1 + destinationsData.length) % destinationsData.length]
        ].filter(Boolean);

        targets.forEach((dest) => {
            const imageAsset = resolveHomeImageAsset(dest.imageOriginal || dest.image);
            this.preloadImageOnce(imageAsset.src, imageAsset.fallbackSrc);
        });
    }

    preloadImageOnce(src, fallbackSrc = '') {
        const normalizedSrc = normalizeHomeImagePath(src);
        if (!normalizedSrc || this.preloadedImageSources.has(normalizedSrc)) {
            return;
        }

        this.preloadedImageSources.add(normalizedSrc);
        const image = new Image();
        image.decoding = 'async';
        image.src = normalizedSrc;

        const normalizedFallback = normalizeHomeImagePath(fallbackSrc);
        if (normalizedFallback && normalizedFallback !== normalizedSrc) {
            image.onerror = () => {
                if (this.preloadedImageSources.has(normalizedFallback)) {
                    return;
                }

                this.preloadedImageSources.add(normalizedFallback);
                const fallbackImage = new Image();
                fallbackImage.decoding = 'async';
                fallbackImage.src = normalizedFallback;
            };
        }
    }

    /**
     * attachEvents() - 绑定导航按钮点击和详情按钮跳转
     */
    attachEvents() {
        this.navRail.addEventListener('click', (event) => {
            const refreshButton = event.target.closest('.curated-nav-refresh');
            if (refreshButton) {
                this.cycleSampleBatch();
                return;
            }

            const btn = event.target.closest('.curated-nav-btn');
            if (!btn) {
                return;
            }

            const nextIndex = Number(btn.dataset.index);
            if (!Number.isFinite(nextIndex) || nextIndex === this.currentIndex) {
                return;
            }

            this.activeSampleSlot = Number.isFinite(Number(btn.dataset.slot))
                ? Number(btn.dataset.slot)
                : this.activeSampleSlot;
            this.renderMainCard(nextIndex);
        });

        this.mainCard.addEventListener('click', (event) => {
            const detailButton = event.target.closest('.curated-detail-button');
            if (!detailButton) {
                return;
            }

            const url = detailButton.dataset.detailUrl;
            if (url) {
                navigateWithDepth(url);
            }
        });
    }

    triggerRevealSequence() {
        if (this.section.classList.contains('is-stage-visible')) {
            return;
        }

        this.section.classList.add('is-visible');
        this.section.classList.remove('is-stage-settled');

        if (!this.section.classList.contains('is-intro-visible')) {
            if (this.revealIntroRafId) {
                cancelAnimationFrame(this.revealIntroRafId);
            }

            this.revealIntroRafId = requestAnimationFrame(() => {
                this.revealIntroRafId = 0;
                this.section.classList.add('is-intro-visible');
            });
        }

        if (this.revealTimer) {
            return;
        }

        this.revealTimer = window.setTimeout(() => {
            this.revealTimer = 0;
            if (this.revealStageRafId) {
                cancelAnimationFrame(this.revealStageRafId);
            }

            this.revealStageRafId = requestAnimationFrame(() => {
                this.revealStageRafId = 0;
                this.section.classList.add('is-stage-visible');
            });

            if (this.stageSettleTimer) {
                window.clearTimeout(this.stageSettleTimer);
            }

            this.stageSettleTimer = window.setTimeout(() => {
                this.section.classList.add('is-stage-settled');
                this.stageSettleTimer = 0;
            }, 1400);
        }, 220);
    }

    /**
     * setupReveal() - 进入视口时唤醒档案墙
     */
    setupReveal() {
        observeOnceInViewport(this.section, () => {
            this.triggerRevealSequence();
        }, {
            threshold: 0.18,
            rootMargin: '0px 0px -8% 0px'
        });
    }
}

// 潜水匹配主舞台：
// 这块会根据用户能力 / 节奏偏好切换推荐内容，
// 同时把当前选择同步给深度计，让首页滚动深度出现更细的层次变化。
class DiveMatchStage {
    /**
     * constructor() - 初始化首页潜水匹配模块的 DOM 引用和初始分类状态
     */
    constructor() {
        this.section = document.getElementById('dive-match');
        this.stage = document.getElementById('diveMatchStage');
        this.filters = document.getElementById('diveMatchFilters');
        this.display = document.getElementById('diveMatchDisplay');
        this.liveSummary = document.getElementById('diveMatchLiveSummary');
        this.profile = getActiveHomeDiverProfile();
        this.profilePanel = null;
        this.profileCopy = null;
        this.profileReason = null;
        this.profilePresetRail = null;
        this.profilePresetTransitionTimer = 0;
        this.profilePresetTransitionRafId = 0;
        this.profilePresetTransitionRafId2 = 0;
        this.profilePresetFocusRafId = 0;
        this.profilePresetFocusAuraNode = null;
        this.profilePresetRailResizeObserver = null;
        this.profilePresetSwapInTimer = 0;
        this.profilePanelSlotTransitions = {
            copy: { timer: 0, swapInTimer: 0, rafId: 0, rafId2: 0, typingTimers: [], typingToken: 0 },
            reason: { timer: 0, swapInTimer: 0, rafId: 0, rafId2: 0, typingTimers: [], typingToken: 0 }
        };
        this.activeKey = getDiveMatchKeyFromLocation() || resolveDefaultDiveMatchKey() || readStoredDiveMatchKey() || DIVE_MATCH_DEFAULT_KEY;
        this.switchTimer = 0;
        this.focusTimer = 0;
        this.stageSettleTimer = 0;
        this.ritualTimer = 0;
        this.initialSurfaceRafId = 0;
        this.initialSurfaceReady = false;
        this.initialCardHydrationRafId = 0;
        this.shouldAutoFocus = window.location.hash === '#dive-match' || Boolean(getDiveMatchKeyFromLocation());
        this.announceSummary = createBufferedLiveAnnouncer(this.liveSummary);

        if (this.section && this.stage && this.filters && this.display) {
            this.init();
        }
    }

    getProfileDescriptor(activeMatch = getDiveMatchEntry(this.activeKey)) {
        const baseDescriptor = sharedDiverProfile?.describeProfile?.(this.profile) || {
            title: '当前潜水者档案',
            summary: '先把这次下潜的节奏慢慢说清，推荐才会更贴近此刻。',
            chips: [],
            recommendedMatchKey: this.activeKey
        };

        const recommendedMatchKey = baseDescriptor.recommendedMatchKey || this.activeKey;
        const recommendedMatch = DIVE_MATCH_MAP.has(recommendedMatchKey)
            ? getDiveMatchEntry(recommendedMatchKey)
            : null;
        const viewingChip = activeMatch?.label ? `当前查看 · ${activeMatch.label}` : '';
        const recommendationChip = recommendedMatch && recommendedMatch.key !== activeMatch?.key
            ? `默认贴近 · ${recommendedMatch.label}`
            : '';
        const chips = [viewingChip, recommendationChip, ...(baseDescriptor.chips || [])]
            .filter(Boolean)
            .filter((chip, index, source) => source.indexOf(chip) === index);

        let summary = baseDescriptor.summary || '先把这次下潜的节奏慢慢说清，推荐才会更贴近此刻。';
        if (activeMatch?.label) {
            if (recommendedMatch && recommendedMatch.key !== activeMatch.key) {
                summary = `${summary} 当前档案原本更贴近「${recommendedMatch.label}」，现在你正在查看「${activeMatch.label}」这一层。`;
            } else {
                summary = `${summary} 这次会先从「${activeMatch.label}」这一层慢慢进入。`;
            }
        }

        return {
            ...baseDescriptor,
            summary,
            chips
        };
    }

    resolveProfilePresetKey() {
        return resolveProfilePresetKey(this.profile);
    }

    buildProfileRecommendation(match) {
        const topSpotId = Number(match?.cards?.[0]?.id || 0);
        const destination = destinationById.get(topSpotId);
        const recommendation = sharedDiverProfile?.describeSpotRecommendation?.(topSpotId, this.profile) || {
            reason: '这片海和你此刻的节奏更容易对上。'
        };

        return {
            name: destination?.name || '这一片海',
            reason: recommendation.reason
        };
    }

    buildProfilePresetVariant(preset, activeMatch, activePresetKey) {
        const presetMeta = DIVE_MATCH_PROFILE_PRESET_META[preset.key] || {};
        const targetKey = sharedDiverProfile?.getRecommendedMatchKey?.(preset.profile) || '';
        const targetMatch = DIVE_MATCH_MAP.has(targetKey) ? getDiveMatchEntry(targetKey) : null;
        const activeDepth = Math.abs(activeMatch?.depth || 0);
        const targetDepth = Math.abs(targetMatch?.depth || activeDepth);
        const isCurrentProfile = preset.key === activePresetKey;
        const isAligned = Boolean(targetMatch) && targetMatch.key === activeMatch?.key;
        const sameGroup = Boolean(targetMatch) && targetMatch.group === activeMatch?.group;
        const goesDeeper = targetDepth > activeDepth;

        let badge = '档案预设';
        let copy = '切换这组档案后，首页推荐会重新整理成更贴近这次状态的进入方式。';

        if (isAligned) {
            badge = '正贴合这一层';
            copy = `切过去后仍会停在「${activeMatch.label}」这一层，沿着当前海层继续把海慢慢看完整。`;
        } else if (sameGroup && targetMatch) {
            badge = goesDeeper ? '同组更深一点' : '同组更轻一点';
            copy = `会把默认分类切到同组的「${targetMatch.label}」，在${activeMatch.group}里换成${goesDeeper ? '更深一点' : '更轻一点'}的进入方式。`;
        } else if (targetMatch) {
            badge = goesDeeper ? '会下潜一层' : '先回轻一点';
            copy = goesDeeper
                ? `会把档案带往更深的「${targetMatch.label}」，从别的维度把眼前这层再推开一些。`
                : `会把档案收回更轻的「${targetMatch.label}」，先让身体与海况重新对齐，再决定要不要继续往下。`;
        }

        if (isCurrentProfile) {
            badge = `当前档案 · ${badge}`;
        }

        return {
            key: preset.key,
            label: presetMeta.label || preset.label || '档案预设',
            badge,
            targetLabel: targetMatch ? `${targetMatch.group} · ${targetMatch.label}` : '档案预设',
            copy,
            isCurrentProfile,
            isAligned,
            relationRank: isAligned ? 0 : (sameGroup ? 1 : 2),
            currentProfileRank: isCurrentProfile ? 0 : 1,
            depthDelta: Math.abs(targetDepth - activeDepth),
            order: DIVE_MATCH_PROFILE_PRESET_ORDER[preset.key] ?? 99
        };
    }

    getProfilePresetVariants(activeMatch = getDiveMatchEntry(this.activeKey)) {
        const activePresetKey = this.resolveProfilePresetKey();
        return (sharedDiverProfile?.getPresets?.() || [])
            .map((preset) => this.buildProfilePresetVariant(preset, activeMatch, activePresetKey))
            .sort((left, right) => {
                if (left.relationRank !== right.relationRank) {
                    return left.relationRank - right.relationRank;
                }
                if (left.depthDelta !== right.depthDelta) {
                    return left.depthDelta - right.depthDelta;
                }
                if (left.currentProfileRank !== right.currentProfileRank) {
                    return left.currentProfileRank - right.currentProfileRank;
                }
                return left.order - right.order;
            });
    }

    shouldReduceProfilePresetMotion() {
        return false;
    }

    ensureProfilePanelShell() {
        if (!this.stage || !sharedDiverProfile) {
            return;
        }

        if (!this.profilePanel) {
            this.profilePanel = document.createElement('section');
            this.profilePanel.className = 'dive-match-profile-panel';
            this.profilePanel.id = 'diveMatchProfilePanel';
            this.profileCopy = document.createElement('div');
            this.profileCopy.className = 'dive-match-profile-copy';
            this.profileReason = document.createElement('div');
            this.profileReason.className = 'dive-match-profile-reason';
            this.profilePresetRail = document.createElement('div');
            this.profilePresetRail.className = 'dive-match-profile-presets';
            this.profilePresetRail.setAttribute('role', 'group');
            this.profilePresetRail.setAttribute('aria-label', '切换潜水者档案预设');
            this.ensureProfilePresetFocusAuraNode();
            this.profilePanel.append(this.profileCopy, this.profileReason, this.profilePresetRail);
            this.stage.insertBefore(this.profilePanel, this.filters);

            if ('ResizeObserver' in window) {
                this.profilePresetRailResizeObserver = new ResizeObserver(() => {
                    this.syncProfilePresetFocusAura(this.getActiveProfilePresetButton(), {
                        immediate: !this.profilePresetRail?.classList.contains('is-transitioning')
                    });
                });
                this.profilePresetRailResizeObserver.observe(this.profilePresetRail);
            }
        }
    }

    syncProfilePanelMotionState() {
        if (!this.profilePanel) {
            return;
        }

        const hasMotion = [this.profileCopy, this.profileReason, this.profilePresetRail]
            .some((node) => node?.classList.contains('is-transitioning'));

        this.profilePanel.classList.toggle('is-content-transitioning', hasMotion);
    }

    cancelNodeAnimations(node) {
        if (!node?.getAnimations) {
            return;
        }

        node.getAnimations({ subtree: true }).forEach((animation) => {
            animation.cancel();
        });
    }

    animateNode(node, keyframes, options) {
        if (!node?.animate) {
            return null;
        }

        return node.animate(keyframes, {
            fill: 'both',
            ...options
        });
    }

    playProfilePanelTrackAnimations(currentTrack, nextTrack) {
        this.cancelNodeAnimations(currentTrack);
        this.cancelNodeAnimations(nextTrack);
        void currentTrack.offsetWidth;
        void nextTrack.offsetWidth;

        this.animateNode(currentTrack, [
            { opacity: 1, transform: 'translate3d(0, 0, 0)' },
            { opacity: 0, transform: 'translate3d(0, -16px, 0)' }
        ], {
            duration: DIVE_MATCH_PROFILE_PANEL_TRACK_OUT_DURATION_MS,
            easing: 'cubic-bezier(0.22, 0.1, 0.24, 1)'
        });

        this.animateNode(nextTrack, [
            { opacity: 0, transform: 'translate3d(0, 20px, 0)' },
            { opacity: 1, transform: 'translate3d(0, 0, 0)' }
        ], {
            duration: DIVE_MATCH_PROFILE_PANEL_TRACK_IN_DURATION_MS,
            delay: DIVE_MATCH_PROFILE_PANEL_SWAP_IN_DELAY_MS,
            easing: 'cubic-bezier(0.14, 0.82, 0.2, 1)'
        });
    }

    playProfilePresetTrackAnimations(currentTrack, nextTrack) {
        this.cancelNodeAnimations(currentTrack);
        this.cancelNodeAnimations(nextTrack);
        void currentTrack.offsetWidth;
        void nextTrack.offsetWidth;

        this.animateNode(currentTrack, [
            { opacity: 1, transform: 'translate3d(0, 0, 0)' },
            { opacity: 0, transform: 'translate3d(0, -14px, 0)' }
        ], {
            duration: DIVE_MATCH_PROFILE_PRESET_TRACK_OUT_DURATION_MS,
            easing: 'cubic-bezier(0.22, 0.1, 0.24, 1)'
        });

        Array.from(currentTrack.querySelectorAll('.dive-match-profile-preset')).forEach((node, index) => {
            this.animateNode(node, [
                { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
                { opacity: 0, transform: 'translate3d(0, -10px, 0) scale(0.94)' }
            ], {
                duration: DIVE_MATCH_PROFILE_PRESET_ITEM_OUT_DURATION_MS,
                delay: index * 60,
                easing: 'cubic-bezier(0.22, 0.1, 0.24, 1)'
            });
        });

        this.animateNode(nextTrack, [
            { opacity: 0, transform: 'translate3d(0, 22px, 0)' },
            { opacity: 1, transform: 'translate3d(0, 0, 0)' }
        ], {
            duration: DIVE_MATCH_PROFILE_PRESET_TRACK_IN_DURATION_MS,
            delay: DIVE_MATCH_PROFILE_PRESET_SWAP_IN_DELAY_MS,
            easing: 'cubic-bezier(0.14, 0.82, 0.2, 1)'
        });

        Array.from(nextTrack.querySelectorAll('.dive-match-profile-preset')).forEach((node, index) => {
            this.animateNode(node, [
                { opacity: 0, transform: 'translate3d(0, 18px, 0) scale(0.92)' },
                { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' }
            ], {
                duration: DIVE_MATCH_PROFILE_PRESET_ITEM_IN_DURATION_MS,
                delay: DIVE_MATCH_PROFILE_PRESET_SWAP_IN_DELAY_MS + 100 + index * 90,
                easing: 'cubic-bezier(0.14, 0.82, 0.2, 1)'
            });
        });
    }

    buildProfileCopyMarkup(descriptor) {
        return `
            <p class="dive-match-profile-kicker">
                <span
                    class="dive-match-profile-kicker-line dive-match-profile-type-line"
                    data-type-order="0"
                    data-type-delay="38"
                >Diver Profile</span>
            </p>
            <h3 class="dive-match-profile-title">
                <span
                    class="dive-match-profile-title-line dive-match-profile-type-line"
                    data-type-order="1"
                    data-type-delay="52"
                >${descriptor.title}</span>
            </h3>
            <p class="dive-match-profile-summary">
                <span
                    class="dive-match-profile-summary-line dive-match-profile-type-line"
                    data-type-order="2"
                    data-type-delay="18"
                >${descriptor.summary}</span>
            </p>
            <div class="dive-match-profile-chips">
                ${descriptor.chips.map((chip) => `<span class="dive-match-profile-chip">${chip}</span>`).join('')}
            </div>
        `;
    }

    buildProfileCopySignature(descriptor) {
        return [
            descriptor.title,
            descriptor.summary,
            ...(descriptor.chips || [])
        ].join('::');
    }

    buildProfileReasonMarkup(activeMatch, recommendation) {
        return `
            <p class="dive-match-profile-reason-kicker">
                <span
                    class="dive-match-profile-reason-kicker-line dive-match-profile-type-line"
                    data-type-order="0"
                    data-type-delay="38"
                >Why This Water</span>
            </p>
            <p class="dive-match-profile-reason-title">
                <span
                    class="dive-match-profile-reason-title-line dive-match-profile-type-line"
                    data-type-order="1"
                    data-type-delay="52"
                >当前默认落在「${activeMatch.label}」这一层</span>
            </p>
            <p class="dive-match-profile-reason-copy">
                <span
                    class="dive-match-profile-reason-copy-line dive-match-profile-type-line"
                    data-type-order="2"
                    data-type-delay="18"
                >先推 ${recommendation.name}，因为${recommendation.reason}</span>
            </p>
        `;
    }

    buildProfileReasonSignature(activeMatch, recommendation) {
        return [
            activeMatch?.key || '',
            activeMatch?.label || '',
            recommendation?.name || '',
            recommendation?.reason || ''
        ].join('::');
    }

    getProfilePanelTypeLines(track) {
        if (!track) {
            return [];
        }

        return Array.from(track.querySelectorAll('.dive-match-profile-type-line'))
            .sort((left, right) => Number(left.dataset.typeOrder || 0) - Number(right.dataset.typeOrder || 0));
    }

    getProfilePanelTrackLineTexts(track) {
        return this.getProfilePanelTypeLines(track).map((line) => (
            line.dataset.text
            || line.getAttribute('aria-label')
            || line.textContent
            || ''
        ).trim());
    }

    buildProfilePanelTypeDiff(text, previousText = '') {
        const nextChars = Array.from(String(text || ''));
        const previousChars = Array.from(String(previousText || ''));
        const changedMap = new Array(nextChars.length).fill(false);

        if (!nextChars.length) {
            return {
                changedMap,
                hasDiff: false
            };
        }

        if (!previousChars.length) {
            nextChars.forEach((char, index) => {
                if (!/\s/.test(char)) {
                    changedMap[index] = true;
                }
            });

            return {
                changedMap,
                hasDiff: changedMap.some(Boolean)
            };
        }

        let prefixLength = 0;
        while (
            prefixLength < nextChars.length
            && prefixLength < previousChars.length
            && nextChars[prefixLength] === previousChars[prefixLength]
        ) {
            prefixLength += 1;
        }

        let nextSuffixIndex = nextChars.length - 1;
        let previousSuffixIndex = previousChars.length - 1;
        while (
            nextSuffixIndex >= prefixLength
            && previousSuffixIndex >= prefixLength
            && nextChars[nextSuffixIndex] === previousChars[previousSuffixIndex]
        ) {
            nextSuffixIndex -= 1;
            previousSuffixIndex -= 1;
        }

        for (let index = prefixLength; index <= nextSuffixIndex; index += 1) {
            if (!/\s/.test(nextChars[index])) {
                changedMap[index] = true;
            }
        }

        return {
            changedMap,
            hasDiff: changedMap.some(Boolean)
        };
    }

    syncProfilePanelTrackPreviousTexts(track, previousTexts = []) {
        if (!track) {
            return;
        }

        this.getProfilePanelTypeLines(track).forEach((line, index) => {
            const text = (line.dataset.text || line.textContent || '').trim();
            line.dataset.text = text;
            line.dataset.previousText = previousTexts[index] ?? text;
        });
    }

    buildProfilePanelTypeCharacters(line, options = {}) {
        if (!line) {
            return [];
        }

        const { active = false } = options;
        const text = line.dataset.text || line.textContent || '';
        const previousText = options.previousText ?? line.dataset.previousText ?? text;
        const { changedMap, hasDiff } = active
            ? { changedMap: new Array(Array.from(String(text)).length).fill(false), hasDiff: false }
            : this.buildProfilePanelTypeDiff(text, previousText);
        const fragment = document.createDocumentFragment();
        const ghostLayer = document.createElement('span');
        ghostLayer.className = 'dive-match-profile-type-ghost';
        ghostLayer.setAttribute('aria-hidden', 'true');
        const activeLayer = document.createElement('span');
        activeLayer.className = 'dive-match-profile-type-active';
        activeLayer.setAttribute('aria-hidden', 'true');
        const characters = Array.from(String(text)).map((char, index) => {
            const isSpace = /\s/.test(char);
            const isChanged = Boolean(changedMap[index]) && !isSpace;
            const ghostCharNode = document.createElement('span');
            const charNode = document.createElement('span');
            ghostCharNode.className = 'dive-match-profile-ghost-char';
            charNode.className = 'dive-match-profile-type-char';
            ghostCharNode.textContent = char;
            charNode.textContent = char;

            if (isSpace) {
                ghostCharNode.classList.add('is-space');
                charNode.classList.add('is-space', 'is-visible');
            } else if (active || !isChanged) {
                charNode.classList.add('is-visible');
            } else {
                ghostCharNode.classList.add('is-diff');
                charNode.dataset.typeDiff = 'true';
            }

            ghostLayer.appendChild(ghostCharNode);
            activeLayer.appendChild(charNode);
            return charNode;
        });

        line.classList.toggle('has-type-diff', hasDiff);
        line.dataset.text = text;
        line.dataset.previousText = previousText;
        line.dataset.hasTypeDiff = hasDiff ? 'true' : 'false';
        fragment.appendChild(ghostLayer);
        fragment.appendChild(activeLayer);
        line.setAttribute('aria-label', text);
        line.replaceChildren(fragment);
        return characters;
    }

    prepareProfilePanelTrackTypeTargets(track) {
        if (!track) {
            return [];
        }

        const lines = this.getProfilePanelTypeLines(track);
        lines.forEach((line) => {
            if (!line.dataset.text) {
                line.dataset.text = line.textContent.trim();
            }

            line.classList.remove('is-typed');
            line.dataset.typingActive = 'false';
            this.buildProfilePanelTypeCharacters(line, { active: false });
            if (!line.classList.contains('has-type-diff')) {
                line.classList.add('is-typed');
            }
        });

        track.classList.remove('is-awakened', 'is-typed');
        return lines;
    }

    restoreProfilePanelTrackTypeText(track) {
        if (!track) {
            return;
        }

        const lines = this.getProfilePanelTypeLines(track);
        lines.forEach((line) => {
            if (!line.dataset.text) {
                line.dataset.text = line.textContent.trim();
            }

            this.buildProfilePanelTypeCharacters(line, { active: true });
            line.classList.add('is-typed');
            line.dataset.typingActive = 'false';
        });

        track.classList.remove('is-awakened');
        track.classList.add('is-typed');
    }

    queueProfilePanelTypeTimeout(slotKey, callback, delay = 0) {
        const state = this.getProfilePanelSlotTransitionState(slotKey);
        const timerId = window.setTimeout(() => {
            state.typingTimers = state.typingTimers.filter((activeTimerId) => activeTimerId !== timerId);
            callback();
        }, delay);

        state.typingTimers.push(timerId);
        return timerId;
    }

    clearProfilePanelTrackTyping(slotKey, track = null, options = {}) {
        const { restoreText = false } = options;
        const state = this.getProfilePanelSlotTransitionState(slotKey);
        state.typingToken += 1;
        state.typingTimers.forEach((timerId) => {
            window.clearTimeout(timerId);
        });
        state.typingTimers = [];

        if (restoreText) {
            this.restoreProfilePanelTrackTypeText(track);
        }
    }

    awakenProfilePanelLine(track, line, slotKey, token) {
        return new Promise((resolve) => {
            const state = this.getProfilePanelSlotTransitionState(slotKey);
            const characters = Array.from(line?.querySelectorAll('.dive-match-profile-type-char[data-type-diff=\"true\"]') || []);
            const baseDelay = Number.parseInt(line?.dataset.typeDelay || '34', 10) || 34;

            if (!track?.isConnected || !line?.isConnected || state.typingToken !== token || !characters.length) {
                if (line?.isConnected) {
                    this.buildProfilePanelTypeCharacters(line, { active: true });
                    line.classList.add('is-typed');
                    line.dataset.typingActive = 'false';
                }
                resolve();
                return;
            }

            line.classList.remove('is-typed');
            line.dataset.typingActive = 'true';
            let index = 0;

            const activateNextCharacter = () => {
                if (!track.isConnected || !line.isConnected || state.typingToken !== token) {
                    line.dataset.typingActive = 'false';
                    resolve();
                    return;
                }

                const charNode = characters[index];
                charNode.classList.add('is-visible');
                index += 1;
                if (index >= characters.length) {
                    line.dataset.typingActive = 'false';
                    line.classList.add('is-typed');
                    this.queueProfilePanelTypeTimeout(slotKey, resolve, 90);
                    return;
                }

                const extraPause = /[·，。！？,.!?：:]/.test(charNode.textContent || '') ? 86 : 0;
                this.queueProfilePanelTypeTimeout(slotKey, activateNextCharacter, baseDelay + extraPause);
            };

            activateNextCharacter();
        });
    }

    async runProfilePanelTrackTypewriter(track, slotKey, slotNode = null) {
        if (!track?.isConnected) {
            return;
        }

        this.clearProfilePanelTrackTyping(slotKey);
        const lines = this.prepareProfilePanelTrackTypeTargets(track);
        const diffLines = lines.filter((line) => line.classList.contains('has-type-diff'));
        const state = this.getProfilePanelSlotTransitionState(slotKey);
        const token = state.typingToken;

        if (!diffLines.length) {
            lines.forEach((line) => line.classList.add('is-typed'));
            track.classList.add('is-typed');
            slotNode?.classList.remove('is-transitioning');
            this.syncProfilePanelMotionState();
            return;
        }

        slotNode?.classList.add('is-transitioning');
        this.syncProfilePanelMotionState();
        track.classList.remove('is-typed');
        track.classList.remove('is-awakened');
        void track.offsetWidth;
        track.classList.add('is-awakened');

        for (const line of diffLines) {
            if (!track.isConnected || state.typingToken !== token) {
                return;
            }

            await this.awakenProfilePanelLine(track, line, slotKey, token);
        }

        if (!track.isConnected || state.typingToken !== token) {
            return;
        }

        track.classList.remove('is-awakened');
        track.classList.add('is-typed');
        slotNode?.classList.remove('is-transitioning');
        this.syncProfilePanelMotionState();
    }

    createProfilePanelTrack(trackClass, markup, signature, options = {}) {
        const { current = false, stateClass = '' } = options;
        const track = document.createElement('div');
        track.className = `dive-match-profile-panel-track ${trackClass}`;
        track.dataset.panelSignature = signature;
        if (stateClass) {
            track.classList.add(stateClass);
        }
        if (current) {
            track.classList.add('is-current');
        }
        track.innerHTML = markup;
        return track;
    }

    getProfilePanelSlotTransitionState(slotKey) {
        if (!this.profilePanelSlotTransitions[slotKey]) {
            this.profilePanelSlotTransitions[slotKey] = {
                timer: 0,
                swapInTimer: 0,
                rafId: 0,
                rafId2: 0,
                typingTimers: [],
                typingToken: 0
            };
        }
        return this.profilePanelSlotTransitions[slotKey];
    }

    cancelPendingProfilePanelSlotTransition(slotNode, slotKey) {
        const state = this.getProfilePanelSlotTransitionState(slotKey);

        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = 0;
        }

        if (state.swapInTimer) {
            clearTimeout(state.swapInTimer);
            state.swapInTimer = 0;
        }

        if (state.rafId) {
            cancelAnimationFrame(state.rafId);
            state.rafId = 0;
        }

        if (state.rafId2) {
            cancelAnimationFrame(state.rafId2);
            state.rafId2 = 0;
        }

        this.clearProfilePanelTrackTyping(slotKey);

        if (!slotNode) {
            return null;
        }

        const tracks = Array.from(slotNode.querySelectorAll('.dive-match-profile-panel-track'));
        const currentTrack = tracks.find((track) => track.classList.contains('is-current')) || tracks[tracks.length - 1] || null;
        tracks.forEach((track) => {
            if (track !== currentTrack) {
                track.remove();
            }
        });

        if (currentTrack) {
            this.restoreProfilePanelTrackTypeText(currentTrack);
            this.cancelNodeAnimations(currentTrack);
            currentTrack.classList.remove('is-preparing', 'is-swapping-in', 'is-swapping-out');
            currentTrack.classList.add('is-current');
            currentTrack.removeAttribute('aria-hidden');
        }

        slotNode.classList.remove('is-transitioning');
        this.syncProfilePanelMotionState();
        return currentTrack;
    }

    finalizeProfilePanelSlotTransition(slotNode, slotKey, activeTrack) {
        if (!slotNode) {
            return;
        }

        const state = this.getProfilePanelSlotTransitionState(slotKey);
        const survivingTrack = activeTrack?.isConnected
            ? activeTrack
            : slotNode.querySelector('.dive-match-profile-panel-track.is-current')
                || slotNode.querySelector('.dive-match-profile-panel-track');

        slotNode.querySelectorAll('.dive-match-profile-panel-track').forEach((track) => {
            if (track !== survivingTrack) {
                track.remove();
            }
        });

        if (survivingTrack) {
            this.cancelNodeAnimations(survivingTrack);
            survivingTrack.classList.remove('is-preparing', 'is-swapping-in', 'is-swapping-out');
            survivingTrack.classList.add('is-current');
            survivingTrack.removeAttribute('aria-hidden');
        }

        slotNode.classList.remove('is-transitioning');
        state.timer = 0;
        this.syncProfilePanelMotionState();
    }

    transitionProfilePanelSlot(slotNode, slotKey, trackClass, markup, signature, options = {}) {
        if (!slotNode) {
            return;
        }

        const { immediate = false } = options;
        const currentTrack = this.cancelPendingProfilePanelSlotTransition(slotNode, slotKey);
        const previousLineTexts = this.getProfilePanelTrackLineTexts(currentTrack);

        if (currentTrack?.dataset.panelSignature === signature) {
            slotNode.replaceChildren(currentTrack);
            this.syncProfilePanelMotionState();
            return;
        }

        if (immediate || this.shouldReduceProfilePresetMotion() || !currentTrack) {
            const nextTrack = currentTrack || this.createProfilePanelTrack(trackClass, '', signature);
            nextTrack.className = `dive-match-profile-panel-track ${trackClass} is-current`;
            nextTrack.dataset.panelSignature = signature;
            nextTrack.innerHTML = markup;
            nextTrack.removeAttribute('aria-hidden');
            this.syncProfilePanelTrackPreviousTexts(nextTrack, previousLineTexts);
            slotNode.replaceChildren(nextTrack);
            this.restoreProfilePanelTrackTypeText(nextTrack);
            slotNode.classList.remove('is-transitioning');
            this.syncProfilePanelMotionState();
            return;
        }

        currentTrack.className = `dive-match-profile-panel-track ${trackClass} is-current`;
        currentTrack.dataset.panelSignature = signature;
        currentTrack.innerHTML = markup;
        currentTrack.removeAttribute('aria-hidden');
        this.syncProfilePanelTrackPreviousTexts(currentTrack, previousLineTexts);
        slotNode.replaceChildren(currentTrack);
        this.syncProfilePanelMotionState();
        this.runProfilePanelTrackTypewriter(currentTrack, slotKey, slotNode);
    }

    renderProfileCopy(descriptor, options = {}) {
        if (!this.profileCopy) {
            return;
        }

        this.transitionProfilePanelSlot(
            this.profileCopy,
            'copy',
            'dive-match-profile-copy-track',
            this.buildProfileCopyMarkup(descriptor),
            this.buildProfileCopySignature(descriptor),
            options
        );
    }

    renderProfileReason(activeMatch, recommendation, options = {}) {
        if (!this.profileReason) {
            return;
        }

        this.transitionProfilePanelSlot(
            this.profileReason,
            'reason',
            'dive-match-profile-reason-track',
            this.buildProfileReasonMarkup(activeMatch, recommendation),
            this.buildProfileReasonSignature(activeMatch, recommendation),
            options
        );
    }

    getProfilePresetSignature(presetVariants) {
        return presetVariants.map((preset) => [
            preset.key,
            preset.label,
            preset.badge,
            preset.targetLabel,
            preset.copy,
            preset.isCurrentProfile ? 'current' : 'rest',
            preset.isAligned ? 'aligned' : 'loose'
        ].join('::')).join('||');
    }

    buildProfilePanelState() {
        const activeMatch = getDiveMatchEntry(this.activeKey);
        const descriptor = this.getProfileDescriptor(activeMatch);
        const recommendation = this.buildProfileRecommendation(activeMatch);
        const presetVariants = this.getProfilePresetVariants(activeMatch);
        const signature = [
            this.buildProfileCopySignature(descriptor),
            this.buildProfileReasonSignature(activeMatch, recommendation),
            this.getProfilePresetSignature(presetVariants)
        ].join('||');

        return {
            descriptor,
            activeMatch,
            recommendation,
            presetVariants,
            signature
        };
    }

    applyProfilePanelState(panelState, options = {}) {
        if (!panelState) {
            return;
        }

        const { immediate = false } = options;
        this.renderProfileCopy(panelState.descriptor, { immediate });
        this.renderProfileReason(panelState.activeMatch, panelState.recommendation, { immediate });
        this.transitionProfilePresets(panelState.presetVariants, { immediate });

        if (this.profilePanel) {
            this.profilePanel.dataset.panelSignature = panelState.signature;
        }
    }

    createProfilePresetTrack(presetVariants, options = {}) {
        const { signature = this.getProfilePresetSignature(presetVariants), stateClass = '', current = false } = options;
        const track = document.createElement('div');
        track.className = 'dive-match-profile-presets-track';
        track.dataset.presetSignature = signature;
        if (stateClass) {
            track.classList.add(stateClass);
        }
        if (current) {
            track.classList.add('is-current');
        }
        track.innerHTML = presetVariants.map((preset, index) => `
            <button
                type="button"
                class="dive-match-profile-preset${preset.isCurrentProfile ? ' is-active' : ''}${preset.isAligned ? ' is-aligned' : ''}"
                data-profile-preset="${preset.key}"
                aria-pressed="${preset.isCurrentProfile ? 'true' : 'false'}"
                title="${preset.copy}"
                style="--preset-order: ${index};"
            >
                <span class="dive-match-profile-preset-meta">
                    <span class="dive-match-profile-preset-badge">${preset.badge}</span>
                    <span class="dive-match-profile-preset-target">${preset.targetLabel}</span>
                </span>
                <span class="dive-match-profile-preset-label">${preset.label}</span>
                <span class="dive-match-profile-preset-copy">${preset.copy}</span>
            </button>
        `).join('');
        return track;
    }

    ensureProfilePresetFocusAuraNode() {
        if (!this.profilePresetRail) {
            return null;
        }

        if (!this.profilePresetFocusAuraNode || !this.profilePresetFocusAuraNode.isConnected) {
            this.profilePresetFocusAuraNode = document.createElement('span');
            this.profilePresetFocusAuraNode.className = 'dive-match-profile-presets-focus-aura';
            this.profilePresetFocusAuraNode.setAttribute('aria-hidden', 'true');
        }

        if (this.profilePresetRail.firstElementChild !== this.profilePresetFocusAuraNode) {
            this.profilePresetRail.prepend(this.profilePresetFocusAuraNode);
        }

        return this.profilePresetFocusAuraNode;
    }

    getActiveProfilePresetButton(track = null) {
        const targetTrack = track?.isConnected
            ? track
            : this.profilePresetRail?.querySelector('.dive-match-profile-presets-track.is-current')
                || this.profilePresetRail?.querySelector('.dive-match-profile-presets-track');

        if (!targetTrack) {
            return null;
        }

        return targetTrack.querySelector('.dive-match-profile-preset.is-active')
            || targetTrack.querySelector('.dive-match-profile-preset');
    }

    syncProfilePresetFocusAura(button, options = {}) {
        if (!this.profilePresetRail) {
            return;
        }

        const { immediate = false } = options;
        if (this.profilePresetFocusRafId) {
            cancelAnimationFrame(this.profilePresetFocusRafId);
            this.profilePresetFocusRafId = 0;
        }

        const focusAura = this.ensureProfilePresetFocusAuraNode();
        if (!focusAura) {
            return;
        }

        if (immediate) {
            this.profilePresetRail.classList.add('is-focus-static');
        } else {
            this.profilePresetRail.classList.remove('is-focus-static');
        }

        if (!button?.isConnected) {
            focusAura.style.opacity = '0';
        } else {
            const railRect = this.profilePresetRail.getBoundingClientRect();
            const buttonRect = button.getBoundingClientRect();
            focusAura.style.transform = `translate3d(${buttonRect.left - railRect.left}px, ${buttonRect.top - railRect.top}px, 0)`;
            focusAura.style.width = `${buttonRect.width}px`;
            focusAura.style.height = `${buttonRect.height}px`;
            focusAura.style.opacity = '0.78';
        }

        if (immediate) {
            this.profilePresetFocusRafId = requestAnimationFrame(() => {
                this.profilePresetFocusRafId = 0;
                this.profilePresetRail?.classList.remove('is-focus-static');
            });
        }
    }

    cancelPendingProfilePresetTransition() {
        if (this.profilePresetTransitionTimer) {
            clearTimeout(this.profilePresetTransitionTimer);
            this.profilePresetTransitionTimer = 0;
        }

        if (this.profilePresetSwapInTimer) {
            clearTimeout(this.profilePresetSwapInTimer);
            this.profilePresetSwapInTimer = 0;
        }

        if (this.profilePresetTransitionRafId) {
            cancelAnimationFrame(this.profilePresetTransitionRafId);
            this.profilePresetTransitionRafId = 0;
        }

        if (this.profilePresetTransitionRafId2) {
            cancelAnimationFrame(this.profilePresetTransitionRafId2);
            this.profilePresetTransitionRafId2 = 0;
        }

        if (this.profilePresetFocusRafId) {
            cancelAnimationFrame(this.profilePresetFocusRafId);
            this.profilePresetFocusRafId = 0;
        }

        if (!this.profilePresetRail) {
            return null;
        }

        const tracks = Array.from(this.profilePresetRail.querySelectorAll('.dive-match-profile-presets-track'));
        const currentTrack = tracks.find((track) => track.classList.contains('is-current')) || tracks[tracks.length - 1] || null;
        tracks.forEach((track) => {
            if (track !== currentTrack) {
                track.remove();
            }
        });

        if (currentTrack) {
            this.cancelNodeAnimations(currentTrack);
            currentTrack.classList.remove('is-preparing', 'is-swapping-in', 'is-swapping-out');
            currentTrack.classList.add('is-current');
            currentTrack.removeAttribute('aria-hidden');
        }

        this.profilePresetRail.classList.remove('is-transitioning');
        this.syncProfilePanelMotionState();
        this.syncProfilePresetFocusAura(this.getActiveProfilePresetButton(currentTrack), { immediate: true });
        return currentTrack;
    }

    finalizeProfilePresetTransition(activeTrack) {
        if (!this.profilePresetRail) {
            return;
        }

        const survivingTrack = activeTrack?.isConnected
            ? activeTrack
            : this.profilePresetRail.querySelector('.dive-match-profile-presets-track.is-current')
                || this.profilePresetRail.querySelector('.dive-match-profile-presets-track');

        this.profilePresetRail.querySelectorAll('.dive-match-profile-presets-track').forEach((track) => {
            if (track !== survivingTrack) {
                track.remove();
            }
        });

        if (survivingTrack) {
            this.cancelNodeAnimations(survivingTrack);
            survivingTrack.classList.remove('is-preparing', 'is-swapping-in', 'is-swapping-out');
            survivingTrack.classList.add('is-current');
            survivingTrack.removeAttribute('aria-hidden');
        }

        this.profilePresetRail.classList.remove('is-transitioning');
        this.profilePresetTransitionTimer = 0;
        this.syncProfilePanelMotionState();
        this.syncProfilePresetFocusAura(this.getActiveProfilePresetButton(survivingTrack), { immediate: true });
    }

    transitionProfilePresets(presetVariants, options = {}) {
        if (!this.profilePresetRail) {
            return;
        }

        const { immediate = false } = options;
        const signature = this.getProfilePresetSignature(presetVariants);
        const currentTrack = this.cancelPendingProfilePresetTransition();

        if (currentTrack?.dataset.presetSignature === signature) {
            this.profilePresetRail.replaceChildren(currentTrack);
            this.syncProfilePanelMotionState();
            this.syncProfilePresetFocusAura(this.getActiveProfilePresetButton(currentTrack), { immediate: true });
            return;
        }

        const nextTrack = this.createProfilePresetTrack(presetVariants, { signature });
        if (immediate || this.shouldReduceProfilePresetMotion() || !currentTrack) {
            nextTrack.classList.add('is-current');
            this.profilePresetRail.replaceChildren(nextTrack);
            this.syncProfilePanelMotionState();
            this.syncProfilePresetFocusAura(this.getActiveProfilePresetButton(nextTrack), { immediate: true });
            return;
        }

        this.syncProfilePresetFocusAura(this.getActiveProfilePresetButton(currentTrack), { immediate: true });
        currentTrack.classList.remove('is-current');
        currentTrack.classList.add('is-swapping-out');
        currentTrack.setAttribute('aria-hidden', 'true');
        nextTrack.classList.add('is-preparing');
        this.profilePresetRail.classList.add('is-transitioning');
        this.profilePresetRail.appendChild(nextTrack);
        this.playProfilePresetTrackAnimations(currentTrack, nextTrack);
        this.syncProfilePanelMotionState();

        this.profilePresetSwapInTimer = window.setTimeout(() => {
            this.profilePresetSwapInTimer = 0;
            this.profilePresetTransitionRafId = requestAnimationFrame(() => {
                this.profilePresetTransitionRafId = 0;
                this.profilePresetTransitionRafId2 = requestAnimationFrame(() => {
                    this.profilePresetTransitionRafId2 = 0;
                    if (!nextTrack.isConnected) {
                        return;
                    }

                    nextTrack.classList.remove('is-preparing');
                    nextTrack.classList.add('is-current', 'is-swapping-in');
                    this.syncProfilePresetFocusAura(this.getActiveProfilePresetButton(nextTrack));
                });
            });
        }, DIVE_MATCH_PROFILE_PRESET_SWAP_IN_DELAY_MS);

        this.profilePresetTransitionTimer = window.setTimeout(() => {
            this.finalizeProfilePresetTransition(nextTrack);
        }, DIVE_MATCH_PROFILE_PRESET_SWAP_DURATION_MS);
    }

    renderProfilePanel(options = {}) {
        if (!this.stage || !sharedDiverProfile) {
            return;
        }

        const { immediate = false } = options;
        this.ensureProfilePanelShell();
        const panelState = this.buildProfilePanelState();
        this.applyProfilePanelState(panelState, { immediate });
    }

    /**
     * init() - 渲染分类标签、首屏内容并绑定模块交互
     * @returns {void} - 无返回值，直接启动潜水匹配模块
     */
    init() {
        this.renderProfilePanel({ immediate: true });
        this.renderFilters();
        this.attachEvents();
        this.setupReveal();
        this.scheduleInitialSurfaceRender();

        if (this.shouldAutoFocus) {
            this.scheduleAutoFocus();
        } else {
            if (window.DepthManager && typeof window.DepthManager.setHomeDiveMatchDepth === 'function') {
                window.DepthManager.setHomeDiveMatchDepth(null);
            }
        }
    }

    scheduleInitialSurfaceRender() {
        if (this.initialSurfaceReady || this.initialSurfaceRafId) {
            return;
        }

        this.initialSurfaceRafId = window.requestAnimationFrame(() => {
            this.initialSurfaceRafId = 0;
            if (this.display.querySelector('.dive-match-surface')) {
                this.initialSurfaceReady = true;
                return;
            }

            this.renderInitialMatchSurface();
        });
    }

    cancelPendingInitialSurfaceHydration() {
        if (this.initialSurfaceRafId) {
            cancelAnimationFrame(this.initialSurfaceRafId);
            this.initialSurfaceRafId = 0;
        }

        if (this.initialCardHydrationRafId) {
            cancelAnimationFrame(this.initialCardHydrationRafId);
            this.initialCardHydrationRafId = 0;
        }
    }

    /**
     * renderFilters() - 根据配置数据渲染顶部漂浮式匹配标签
     * @returns {void} - 无返回值，直接写入标签 DOM
     */
    renderFilters() {
        this.filters.innerHTML = DIVE_MATCH_DATA.map((match, index) => `
            <button
                type="button"
                class="dive-match-filter"
                data-match-key="${match.key}"
                data-match-group="${match.group}"
                data-match-depth="${Math.abs(match.depth)}"
                aria-pressed="${match.key === this.activeKey ? 'true' : 'false'}"
                style="--match-delay: ${index * 56}ms;"
            >
                <span class="dive-match-filter-tide" aria-hidden="true"></span>
                <span class="dive-match-filter-head">
                    <span class="dive-match-filter-group">${match.group}</span>
                    <span class="dive-match-filter-depth">${Math.abs(match.depth)}m</span>
                </span>
                <span class="dive-match-filter-label">${match.label}</span>
                <span class="dive-match-filter-whisper">${match.note}</span>
            </button>
        `).join('');

        this.syncActiveFilter();
    }

    /**
     * createMatchSurface(match, directionClass) - 创建当前分类的大引导卡和推荐档案卡组合
     * @param {Object} match - 当前激活的匹配分类数据
     * @param {string} directionClass - 切换方向附加类名
     * @returns {HTMLDivElement} - 构建好的分类内容层
     */
    createMatchSurface(match, directionClass = '') {
        const surface = document.createElement('div');
        const cardsMarkup = match.cards.map((card, index) => this.createMatchCardMarkup(card, index)).join('');

        surface.className = `dive-match-surface${directionClass ? ` ${directionClass}` : ''}`;
        surface.innerHTML = `
            ${this.createMatchFocusMarkup(match)}
            <div class="dive-match-card-grid">
                ${cardsMarkup}
            </div>
        `;

        return surface;
    }

    createMatchCardMarkup(card, index) {
        const destination = destinationById.get(card.id);
        if (!destination) {
            return '';
        }

        const imageAsset = resolveHomeImageAsset(destination.imageOriginal || destination.image);
        const cardImageSlot = HOME_IMAGE_RENDER_SLOTS.diveMatchCard;

        return `
            <article
                class="dive-match-card"
                data-detail-url="detail.html?id=${destination.id}"
                role="link"
                tabindex="0"
                aria-label="查看 ${destination.name} 详情"
                style="--card-delay: ${index * 90}ms;"
            >
                <div class="dive-match-card-media">
                    <img
                        src="${imageAsset.src}"
                        data-fallback-src="${imageAsset.fallbackSrc}"
                        alt="${destination.name}"
                        class="dive-match-card-image"
                        loading="lazy"
                        decoding="async"
                        fetchpriority="low"
                        width="${cardImageSlot.width}"
                        height="${cardImageSlot.height}"
                        onerror="${buildImageErrorHandler(destination.name, cardImageSlot)}"
                    >
                </div>
                <div class="dive-match-card-copy">
                    <p class="dive-match-card-kicker">${destination.englishName}</p>
                    <h3 class="dive-match-card-name">${destination.name}</h3>
                    <p class="dive-match-card-reason">${card.reason}</p>
                    <div class="dive-match-card-tags">
                        ${card.tags.map((tag) => `<span class="dive-match-card-tag">${tag}</span>`).join('')}
                    </div>
                    <button type="button" class="dive-match-card-action" data-detail-url="detail.html?id=${destination.id}">
                        查看详情
                    </button>
                </div>
            </article>
        `;
    }

    createMatchFocusMarkup(match) {
        const recommendation = this.buildProfileRecommendation(match);
        return `
            <article class="dive-match-focus-card">
                <p class="dive-match-focus-group">${match.group}</p>
                <p class="dive-match-focus-ritual">把这次下潜，先安放在更适合此刻身体与呼吸的这一层。</p>
                <div class="dive-match-focus-head">
                    <h3 class="dive-match-focus-title">${match.label}</h3>
                    <span class="dive-match-focus-depth">${Math.abs(match.depth)}m 海层</span>
                </div>
                <p class="dive-match-focus-audience">${match.audience}</p>
                <p class="dive-match-focus-guidance">${match.guidance}</p>
                <p class="dive-match-focus-note">${match.note}</p>
                <div class="dive-match-focus-personal">
                    <span class="dive-match-focus-personal-label">档案联动</span>
                    <p class="dive-match-focus-personal-copy">先看 ${recommendation.name}，因为${recommendation.reason}</p>
                </div>
            </article>
        `;
    }

    createMatchSurfaceSkeleton(match, directionClass = '') {
        const surface = document.createElement('div');
        surface.className = `dive-match-surface${directionClass ? ` ${directionClass}` : ''}`;
        surface.innerHTML = `
            ${this.createMatchFocusMarkup(match)}
            <div class="dive-match-card-grid"></div>
        `;
        return surface;
    }

    hydrateMatchSurfaceCards(surface, match, options = {}) {
        const { markInitialReady = false } = options;
        const grid = surface?.querySelector('.dive-match-card-grid');
        if (!grid) {
            if (markInitialReady) {
                this.initialSurfaceReady = true;
            }
            scheduleHomeHydrationViewportRefresh({ force: true });
            return;
        }

        const cards = Array.isArray(match?.cards) ? [...match.cards] : [];
        const batchSize = 2;
        const appendBatch = () => {
            this.initialCardHydrationRafId = 0;
            if (!surface.isConnected) {
                return;
            }

            const batchMarkup = cards
                .splice(0, batchSize)
                .map((card, index) => this.createMatchCardMarkup(card, grid.children.length + index))
                .filter(Boolean)
                .join('');

            if (batchMarkup) {
                grid.insertAdjacentHTML('beforeend', batchMarkup);
            }
            scheduleHomeHydrationViewportRefresh({ updateOnly: true });

            if (cards.length) {
                this.initialCardHydrationRafId = requestAnimationFrame(appendBatch);
                return;
            }

            if (markInitialReady) {
                this.initialSurfaceReady = true;
            }
            scheduleHomeHydrationViewportRefresh({ force: true });
        };

        this.initialCardHydrationRafId = requestAnimationFrame(appendBatch);
    }

    renderInitialMatchSurface() {
        const match = getDiveMatchEntry(this.activeKey);
        const surface = this.createMatchSurfaceSkeleton(match);

        this.display.replaceChildren(surface);
        this.syncRitualState(match, match, { immediate: true });
        this.syncActiveFilter();
        requestAnimationFrame(() => {
            if (!surface.isConnected) {
                return;
            }

            surface.classList.add('is-active', 'is-resting');
        });
        this.hydrateMatchSurfaceCards(surface, match, { markInitialReady: true });
    }

    /**
     * renderActiveMatch(nextKey, options) - 切换当前激活的匹配分类内容层
     * @param {string} nextKey - 目标分类键名
     * @param {Object} options - 切换配置项
     * @returns {void} - 无返回值，直接更新推荐内容区
     */
    renderActiveMatch(nextKey, options = {}) {
        this.cancelPendingInitialSurfaceHydration();
        const { immediate = false, syncDepth = true } = options;
        const nextMatch = getDiveMatchEntry(nextKey);
        const currentMatch = getDiveMatchEntry(this.activeKey);
        this.activeKey = nextMatch.key;
        this.renderProfilePanel({ immediate });
        storeDiveMatchKey(this.activeKey);
        this.syncActiveFilter();
        if (syncDepth) {
            this.syncDepth();
        }

        const currentSurface = this.display.querySelector('.dive-match-surface.is-active')
            || this.display.querySelector('.dive-match-surface');
        const goingDeeper = nextMatch.depth < currentMatch.depth;
        const enterClass = immediate ? '' : (goingDeeper ? 'from-deeper is-entering' : 'from-shallower is-entering');
        const leaveClass = goingDeeper ? 'to-deeper' : 'to-shallower';
        // 这里用深浅方向而不是左右方向，
        // 是因为潜水匹配的切换更像“往更深一层 / 回到更浅一层”。
        const nextSurface = immediate
            ? this.createMatchSurface(nextMatch, enterClass)
            : this.createMatchSurfaceSkeleton(nextMatch, enterClass);
        this.syncRitualState(nextMatch, currentMatch, { immediate });

        if (this.switchTimer) {
            window.clearTimeout(this.switchTimer);
            this.switchTimer = 0;
        }

        Array.from(this.display.querySelectorAll('.dive-match-surface.is-leaving')).forEach((surface) => {
            surface.remove();
        });

        if (currentSurface && !immediate) {
            currentSurface.classList.remove('is-active', 'is-resting');
            currentSurface.classList.add('is-leaving', leaveClass);
        } else {
            Array.from(this.display.querySelectorAll('.dive-match-surface')).forEach((surface) => surface.remove());
        }

        this.display.appendChild(nextSurface);

        requestAnimationFrame(() => {
            nextSurface.classList.add('is-active');
        });

        if (immediate) {
            nextSurface.classList.add('is-resting');
        } else {
            this.switchTimer = window.setTimeout(() => {
                Array.from(this.display.querySelectorAll('.dive-match-surface.is-leaving')).forEach((surface) => {
                    surface.remove();
                });
                nextSurface.classList.remove('is-entering', 'from-deeper', 'from-shallower');
                nextSurface.classList.add('is-resting');
                this.switchTimer = 0;
            }, 760);
        }

        if (!immediate) {
            this.hydrateMatchSurfaceCards(nextSurface, nextMatch);
        }

        if (!immediate) {
            this.announceSummary(`已切到${nextMatch.label}这一层，眼前展开${nextMatch.cards.length}片更适合此刻的海域。`);
        }

        if (immediate) {
            this.initialSurfaceReady = true;
        }
    }

    /**
     * syncRitualState() - 把当前匹配层级同步成模块外层的仪式态状态
     * @param {Object} nextMatch - 即将成为当前层级的匹配数据
     * @param {Object|null} previousMatch - 上一个层级数据
     * @param {{ immediate?: boolean }} options - 过渡配置
     * @returns {void}
     */
    syncRitualState(nextMatch, previousMatch = null, options = {}) {
        if (!this.section || !nextMatch) {
            return;
        }

        const { immediate = false } = options;
        const direction = !previousMatch || previousMatch.key === nextMatch.key
            ? 'steady'
            : (nextMatch.depth < previousMatch.depth ? 'deeper' : 'shallower');

        if (this.ritualTimer) {
            window.clearTimeout(this.ritualTimer);
            this.ritualTimer = 0;
        }

        this.section.dataset.activeMatchKey = nextMatch.key;
        this.section.dataset.activeMatchGroup = nextMatch.group;
        this.section.dataset.matchDirection = direction;
        this.section.style.setProperty('--dive-match-depth-ratio', String(clamp((Math.abs(nextMatch.depth) - 12) / 6, 0, 1)));
        this.section.classList.remove('is-switching-deeper', 'is-switching-shallower');

        if (immediate || direction === 'steady') {
            this.section.classList.remove('is-transitioning');
            return;
        }

        this.section.classList.add('is-transitioning');
        this.section.classList.add(direction === 'deeper' ? 'is-switching-deeper' : 'is-switching-shallower');

        this.ritualTimer = window.setTimeout(() => {
            this.section.classList.remove('is-transitioning', 'is-switching-deeper', 'is-switching-shallower');
            this.ritualTimer = 0;
        }, 860);
    }

    /**
     * syncActiveFilter() - 同步顶部分类标签的激活状态和无障碍属性
     * @returns {void} - 无返回值，直接更新分类标签样式
     */
    syncActiveFilter() {
        const activeMatch = getDiveMatchEntry(this.activeKey);
        this.filters.querySelectorAll('.dive-match-filter').forEach((button) => {
            const isActive = button.dataset.matchKey === this.activeKey;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        this.section?.style.setProperty('--dive-match-active-depth', `${Math.abs(activeMatch.depth)}m`);
    }

    /**
     * syncDepth() - 把当前匹配分类对应的深度同步给首页深度计系统
     * @returns {void} - 无返回值，直接通知深度计更新目标层级
     */
    syncDepth() {
        const match = getDiveMatchEntry(this.activeKey);
        if (window.DepthManager && typeof window.DepthManager.setHomeDiveMatchDepth === 'function') {
            window.DepthManager.setHomeDiveMatchDepth(match.depth);
        }
    }

    /**
     * scheduleAutoFocus() - 当从详情页带分类返回时，自动滚到潜水匹配并激活对应内容
     * @returns {void} - 无返回值，直接安排自动聚焦滚动
     */
    scheduleAutoFocus() {
        this.focusTimer = window.setTimeout(() => {
            scrollToSection('#dive-match');
            window.setTimeout(() => {
                this.syncDepth();
            }, 980);
        }, DIVE_MATCH_FOCUS_DELAY_MS);
        // 先滚动回模块，再补一次深度同步，
        // 是为了让页面和深度计一起到位，而不是深度计先跳到目标层。
    }

    /**
     * attachEvents() - 绑定分类切换和推荐卡跳转交互
     * @returns {void} - 无返回值，直接注册模块事件
     */
    attachEvents() {
        this.filters.addEventListener('click', (event) => {
            const trigger = event.target.closest('.dive-match-filter');
            if (!trigger) {
                return;
            }

            const nextKey = trigger.dataset.matchKey;
            if (!nextKey || nextKey === this.activeKey) {
                return;
            }

            this.renderActiveMatch(nextKey);
        });

        this.stage.addEventListener('click', (event) => {
            const presetButton = event.target.closest('[data-profile-preset]');
            if (!presetButton || !sharedDiverProfile) {
                return;
            }

            const preset = sharedDiverProfile.getPreset(presetButton.dataset.profilePreset);
            if (!preset?.profile) {
                return;
            }

            this.profile = sharedDiverProfile.saveProfile(preset.profile);
            const nextKey = sharedDiverProfile.getRecommendedMatchKey(this.profile);
            if (DIVE_MATCH_MAP.has(nextKey) && nextKey !== this.activeKey) {
                this.renderActiveMatch(nextKey);
                return;
            }

            this.renderProfilePanel();
        });

        this.display.addEventListener('click', (event) => {
            const action = event.target.closest('.dive-match-card-action');
            const card = event.target.closest('.dive-match-card');
            const detailTarget = action || card;
            if (!detailTarget) {
                return;
            }

            const url = detailTarget.dataset.detailUrl;
            if (url) {
                navigateWithDepth(url);
            }
        });

        this.display.addEventListener('keydown', (event) => {
            const card = event.target.closest('.dive-match-card');
            if (!card) {
                return;
            }

            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            event.preventDefault();
            const url = card.dataset.detailUrl;
            if (url) {
                navigateWithDepth(url);
            }
        });
    }

    revealIntro() {
        this.section.classList.add('is-visible');
    }

    revealStage() {
        this.section.classList.add('is-stage-visible');
        this.section.classList.remove('is-stage-settled');

        if (this.stageSettleTimer) {
            window.clearTimeout(this.stageSettleTimer);
        }

        this.stageSettleTimer = window.setTimeout(() => {
            this.section.classList.add('is-stage-settled');
            this.stageSettleTimer = 0;
        }, 1500);
    }

    /**
     * setupReveal() - 在模块进入视口时触发整组匹配档案的显现动画
     * @returns {void} - 无返回值，直接设置显现状态
     */
    setupReveal() {
        observeOnceInViewport(this.section, () => {
            this.revealIntro();
        }, {
            threshold: 0.18,
            rootMargin: '0px 0px -8% 0px'
        });

        observeOnceInViewport(this.stage, () => {
            this.revealStage();
        }, {
            threshold: 0.12,
            rootMargin: '0px 0px 0px 0px'
        });
    }
}

// 首页区块滚动工具：
// 不同 section 的视觉锚点并不完全等于 section 顶部，
// 所以这里会按模块类型微调落点，让滚动结果更像“停在正确海层”。
/**
 * scrollToSection(targetSelector) - 平滑滚动到首页指定区块
 * @param {string} targetSelector - 目标区块选择器
 * @returns {void} - 无返回值，直接执行首页滚动
 */
function scrollToSection(targetSelector) {
    if (!targetSelector) {
        return;
    }

    const requestToken = ++homeGuideScrollRequestToken;
    const primedNewLayout = primeHomeScrollTarget(targetSelector);

    const target = document.querySelector(targetSelector);
    if (!target) {
        return;
    }

    const sharedMetrics = homeViewportCoordinator.readHomeSectionMetrics?.();
    const navbar = document.querySelector('.navbar');
    const navOffset = Number.isFinite(sharedMetrics?.navOffsets?.scrollToSection)
        ? sharedMetrics.navOffsets.scrollToSection
        : (navbar ? navbar.offsetHeight + 14 : 0);
    let anchor = target;
    let extraOffset = 0;
    let anchorTopFromMetrics = sharedMetrics?.sections?.[targetSelector]?.anchorTop
        ?? sharedMetrics?.sections?.[targetSelector]?.sectionTop
        ?? null;

    const featuredDestinationsTargetDepth = -12;
    const resolveFeaturedTopOverride = (metrics) => {
        const featuredThreshold = metrics?.thresholds?.featuredDepth;
        const diveMatchThreshold = metrics?.thresholds?.diveMatchDepth;
        if (!Number.isFinite(featuredThreshold) || !Number.isFinite(diveMatchThreshold)) {
            return null;
        }

        const depthTwelveRatio = 0.5;
        return featuredThreshold + ((diveMatchThreshold - featuredThreshold) * depthTwelveRatio);
    };

    if (targetSelector === '#featured-destinations') {
        const curatedStage = target.querySelector('#curatedWatersStage');
        if (curatedStage) {
            anchor = curatedStage;
            extraOffset = 26;
        }
        // 精选目的地真正的视觉入口在舞台本身，不在 section 标题顶端。

        if (Number.isFinite(sharedMetrics?.sections?.['#featured-destinations']?.anchorTop)) {
            anchorTopFromMetrics = sharedMetrics.sections['#featured-destinations'].anchorTop;
        } else if (Number.isFinite(sharedMetrics?.sections?.['#featured-destinations']?.sectionTop)) {
            anchorTopFromMetrics = sharedMetrics.sections['#featured-destinations'].sectionTop;
        }
        // 这里不是简单滚到 featured 顶部，而是取它和下一层潜水匹配之间的中间落点，
        // 让深度计更自然地停在“约 -12m”附近的层次上。
    } else if (targetSelector === '#dive-match') {
        const diveMatchStage = target.querySelector('#diveMatchStage');
        if (diveMatchStage) {
            anchor = diveMatchStage;
            extraOffset = 18;
        }

        if (Number.isFinite(sharedMetrics?.sections?.['#dive-match']?.anchorTop)) {
            anchorTopFromMetrics = sharedMetrics.sections['#dive-match'].anchorTop;
        } else if (Number.isFinite(sharedMetrics?.sections?.['#dive-match']?.sectionTop)) {
            anchorTopFromMetrics = sharedMetrics.sections['#dive-match'].sectionTop;
        }
    }

    const startScroll = () => {
        const latestMetrics = homeViewportCoordinator.readHomeSectionMetrics?.() || sharedMetrics;
        const latestTopOverride = targetSelector === '#featured-destinations'
            ? resolveFeaturedTopOverride(latestMetrics)
            : null;
        const latestAnchorTop = latestMetrics?.sections?.[targetSelector]?.anchorTop
            ?? latestMetrics?.sections?.[targetSelector]?.sectionTop
            ?? anchorTopFromMetrics;
        const anchorTop = Number.isFinite(latestAnchorTop)
            ? latestAnchorTop
            : (anchor.getBoundingClientRect().top + window.scrollY);
        const latestNavOffset = Number.isFinite(latestMetrics?.navOffsets?.scrollToSection)
            ? latestMetrics.navOffsets.scrollToSection
            : navOffset;
        const top = latestTopOverride !== null
            ? Math.max(0, latestTopOverride)
            : Math.max(0, anchorTop - latestNavOffset - extraOffset);
        const currentScrollY = window.scrollY || window.pageYOffset || 0;
        const travelDistance = Math.abs(top - currentScrollY);
        const isLongTravel = travelDistance > window.innerHeight * HOME_GUIDE_JUMP_LONG_TRAVEL_RATIO;
        const adaptiveDuration = clamp(
            680 + travelDistance * 0.12,
            820,
            1320
        );
        const scrollMood = travelDistance > window.innerHeight * 2.2 ? 'midwater' : 'buoyant';
        const longJumpMode = isLongTravel ? resolveHomeGuideJumpMode() : '';
        const expectedLongTravelDuration = clamp(
            Math.ceil(adaptiveDuration * (longJumpMode === 'staged' ? 1.08 : 1.02)),
            820,
            2400
        );
        const guideTargetDepth = getHomeGuideDepthTarget(targetSelector);
        const depthManager = window.DepthManager;

        const finishScroll = () => {
            if (requestToken !== homeGuideScrollRequestToken) {
                return;
            }

            if (depthManager && typeof depthManager.finishManagedScroll === 'function') {
                depthManager.finishManagedScroll({
                    skipImmediateSync: longJumpMode === 'custom'
                });
            }

            if (
                guideTargetDepth !== null &&
                depthManager &&
                typeof depthManager.finishDepth === 'function'
            ) {
                const currentScrollY = window.scrollY || window.pageYOffset || 0;
                if (Math.abs(currentScrollY - top) <= 12) {
                    // 首页导览跳转时，深度计优先跟随导览目标所在海层稳定停靠，
                    // 避免程序化滚动结束后再做一段明显的“追赶动画”。
                    depthManager.finishDepth(
                        targetSelector === '#featured-destinations'
                            ? featuredDestinationsTargetDepth
                            : guideTargetDepth
                    );
                }
            }

            scheduleHomeInteractionRefresh(24);
        };

        if (
            !isLongTravel &&
            guideTargetDepth !== null &&
            depthManager &&
            typeof depthManager.animateDepth === 'function'
        ) {
            const startDepth = Number.isFinite(depthManager.currentDepth)
                ? depthManager.currentDepth
                : guideTargetDepth;
            depthManager.animateDepth(
                startDepth,
                guideTargetDepth,
                clamp(adaptiveDuration - 120, 520, 1180)
            );
        }

        if (isLongTravel) {
            const strategyResult = runHomeGuideLongJumpStrategy({
                mode: longJumpMode,
                top,
                adaptiveDuration,
                targetSelector,
                guideTargetDepth
            });
            if (strategyResult) {
                setHomeScrollTraveling(true, 'programmatic');
                beginHomeInteractionLock(expectedLongTravelDuration + 220);
                Promise.resolve(strategyResult).then(finishScroll, finishScroll);
                return;
            }
        }

        if (window.OceanScroll && typeof window.OceanScroll.animateTo === 'function') {
            setHomeScrollTraveling(isLongTravel, 'programmatic');
            beginHomeInteractionLock((isLongTravel ? expectedLongTravelDuration : adaptiveDuration) + 180);
            const animateResult = window.OceanScroll.animateTo(top, {
                duration: adaptiveDuration,
                mood: scrollMood
            });
            if (animateResult && typeof animateResult.then === 'function') {
                animateResult.then(finishScroll, finishScroll);
            } else {
                finishScroll();
            }
            return;
        }

        beginHomeInteractionLock(160);
        window.scrollTo(0, top);
        finishScroll();
    };

    const featuredTopOverride = targetSelector === '#featured-destinations'
        ? resolveFeaturedTopOverride(sharedMetrics)
        : null;
    const needsFreshMetrics = primedNewLayout
        || !sharedMetrics
        || !Number.isFinite(anchorTopFromMetrics)
        || (targetSelector === '#featured-destinations' && !Number.isFinite(featuredTopOverride));

    if (needsFreshMetrics && typeof homeViewportCoordinator !== 'undefined') {
        window.requestAnimationFrame(() => {
            homeViewportCoordinator.requestMeasure({ force: true });
            window.requestAnimationFrame(startScroll);
        });
        return;
    }

    window.requestAnimationFrame(startScroll);
}

/**
 * primeHomeScrollTarget(targetSelector) - 在长距离滚动前预热目标路径上的延迟模块，避免滚动途中初始化造成掉帧
 * @param {string} targetSelector - 目标区块选择器
 * @returns {boolean} - 本次是否初始化了新的会影响布局的延迟模块
 */
function primeHomeScrollTarget(targetSelector) {
    const shouldPrimeCurated = [
        '#featured-destinations',
        '#dive-match',
        '#why-yanqi',
        '#homeFooter'
    ].includes(targetSelector);
    const shouldPrimeDiveMatch = ['#dive-match', '#why-yanqi', '#homeFooter'].includes(targetSelector);
    const shouldPrimeStory = ['#why-yanqi', '#homeFooter'].includes(targetSelector);
    let primedNewLayout = false;

    if (shouldPrimeCurated && !curatedWatersStageInstance) {
        ensureCuratedWatersStage();
        primedNewLayout = true;
    }

    if (shouldPrimeDiveMatch && !diveMatchStageInstance) {
        ensureDiveMatchStage();
        primedNewLayout = true;
    }

    if (shouldPrimeStory && !homeStoryRevealInitialized) {
        ensureStoryReveal();
    }

    return primedNewLayout;
}

/**
 * getHomeGuideDepthTarget(targetSelector) - 返回首页导览目标区块对应的预期深度值
 * @param {string} targetSelector - 目标区块选择器
 * @returns {number|null}
 */
function getHomeGuideDepthTarget(targetSelector) {
    const depthMap = {
        '#hero-home': -12,
        '#featured-destinations': -12,
        '#dive-match': -28,
        '#why-yanqi': -36,
        '#homeFooter': -42
    };

    return Object.prototype.hasOwnProperty.call(depthMap, targetSelector)
        ? depthMap[targetSelector]
        : null;
}

/**
 * setHomeActiveNavLink(link) - 同步首页顶部导航当前激活项的下划线和无障碍状态
 * @param {HTMLAnchorElement|null} link - 需要设为当前项的导航链接
 * @returns {void} - 无返回值，直接更新首页导航状态
 */
function setHomeActiveNavLink(link) {
    const navLinks = document.querySelectorAll('.navbar .nav-menu .nav-link');
    navLinks.forEach((navLink) => {
        const isCurrent = navLink === link;
        navLink.classList.toggle('active', isCurrent);
        if (isCurrent) {
            navLink.setAttribute('aria-current', 'page');
        } else {
            navLink.removeAttribute('aria-current');
        }
    });
}

/**
 * setupHomeNavState() - 根据首页当前滚动位置同步顶部导航的激活下划线
 * @returns {void} - 无返回值，直接绑定滚动与尺寸变化监听
 */
function setupHomeNavState() {
    const homeLink = document.querySelector('.navbar .nav-link[href="#"]');
    const destinationsLink = document.querySelector('.navbar .nav-link[data-scroll-target="#featured-destinations"]');
    const storyLink = document.querySelector('.navbar .nav-link[data-scroll-target="#why-yanqi"]');
    const featuredSection = document.getElementById('featured-destinations');
    const storySection = document.getElementById('why-yanqi');
    const navbar = document.querySelector('.navbar');

    if (!homeLink || !destinationsLink || !storyLink || !featuredSection || !storySection) {
        return;
    }

    let navOffset = (navbar ? navbar.offsetHeight : 70) + 18;
    let featuredTop = 0;
    let storyTop = 0;
    let activeLink = null;
    const featuredAnchor = featuredSection.querySelector('#curatedWatersStage') || featuredSection;

    const measureAnchors = () => {
        const sharedMetrics = homeViewportCoordinator.readHomeSectionMetrics?.();
        if (sharedMetrics) {
            navOffset = Number.isFinite(sharedMetrics.navOffsets?.navState)
                ? sharedMetrics.navOffsets.navState
                : ((navbar ? navbar.offsetHeight : 70) + 18);
            const sharedFeaturedTop = sharedMetrics.sections?.['#featured-destinations']?.anchorTop;
            const sharedStoryTop = sharedMetrics.sections?.['#why-yanqi']?.anchorTop;
            featuredTop = Number.isFinite(sharedFeaturedTop)
                ? Math.max(0, sharedFeaturedTop - navOffset)
                : (featuredAnchor.getBoundingClientRect().top + window.scrollY - navOffset);
            storyTop = Number.isFinite(sharedStoryTop)
                ? Math.max(0, sharedStoryTop - navOffset)
                : (storySection.getBoundingClientRect().top + window.scrollY - navOffset);
            return;
        }

        navOffset = (navbar ? navbar.offsetHeight : 70) + 18;
        featuredTop = featuredAnchor.getBoundingClientRect().top + window.scrollY - navOffset;
        storyTop = storySection.getBoundingClientRect().top + window.scrollY - navOffset;
    };

    const scheduleMeasure = () => {
        homeViewportCoordinator.requestMeasure();
    };

    const updateNavState = () => {
        const probeY = (window.scrollY || window.pageYOffset || 0) + navOffset + Math.min(window.innerHeight * 0.24, 220);

        if (probeY >= storyTop - 24) {
            if (activeLink !== storyLink) {
                activeLink = storyLink;
                setHomeActiveNavLink(storyLink);
            }
            return;
        }

        if (probeY >= featuredTop - 24) {
            if (activeLink !== destinationsLink) {
                activeLink = destinationsLink;
                setHomeActiveNavLink(destinationsLink);
            }
            return;
        }

        if (activeLink !== homeLink) {
            activeLink = homeLink;
            setHomeActiveNavLink(homeLink);
        }
    };

    homeViewportCoordinator.register({
        measure: measureAnchors,
        update: updateNavState
    });

    if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(scheduleMeasure);
        observer.observe(featuredAnchor);
        observer.observe(storySection);
        if (navbar) {
            observer.observe(navbar);
        }
    }

    measureAnchors();
    updateNavState();
    window.setTimeout(() => homeViewportCoordinator.requestMeasure(), 60);
}

// 英雄区入场：控制首页首屏的渐进式开场状态。
/**
 * setupHeroImmersion() - 初始化首页首屏的沉浸式入场状态
 * @returns {void} - 无返回值，直接更新首页首屏状态
 */
function setupHeroImmersion() {
    if (!document.body.classList.contains('home-page')) {
        return;
    }

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            document.body.classList.add('hero-awakened');
        });
    });
}

// 英雄区离场动画：点击首页关键入口时，先让当前首屏做失焦和下潜式退场，再执行后续动作。
/**
 * runHeroDeparture(callback, options) - 播放首屏离场动画并在适当时机执行后续操作
 * @param {Function} callback - 离场后需要执行的回调函数
 * @param {Object} options - 离场配置项
 * @returns {void} - 无返回值，直接驱动离场流程
 */
function runHeroDeparture(callback, options = {}) {
    const { callbackDelay = 260, resetDelay = 980, shouldReset = true } = options;
    const heroSection = document.querySelector('.hero-section');

    if (!heroSection) {
        if (typeof callback === 'function') {
            callback();
        }
        return;
    }

    heroSection.classList.add('is-diving-out');

    window.setTimeout(() => {
        if (typeof callback === 'function') {
            callback();
        }
    }, callbackDelay);

    if (shouldReset) {
        window.setTimeout(() => {
            heroSection.classList.remove('is-diving-out');
        }, resetDelay);
    }
}

const HERO_ROUTE_READY_DELAY = 300;

// 首屏离场：点击入口时先播放轻微失焦与下潜感，再执行实际跳转。
/**
 * setupHeroActions() - 绑定首屏区域内主要按钮和今日海域卡片的交互
 * @returns {void} - 无返回值，直接注册交互事件
 */
function setupHeroActions() {
    const todaySeaSpot = document.querySelector('.today-sea-spot-link');
    if (todaySeaSpot) {
        todaySeaSpot.addEventListener('click', (event) => {
            event.preventDefault();
            const url = todaySeaSpot.dataset.detailUrl;
            if (!url) {
                return;
            }

            runHeroDeparture(() => {
                navigateWithDepth(url);
            }, { shouldReset: false, callbackDelay: HERO_ROUTE_READY_DELAY });
        });
    }

    const exploreButton = document.querySelector('.sea-action-primary[data-scroll-target]');
    if (exploreButton) {
        exploreButton.addEventListener('click', (event) => {
            event.preventDefault();
            const target = exploreButton.dataset.scrollTarget;
            if (!target) {
                return;
            }

            runHeroDeparture(() => {
                scrollToSection(target);
            }, { shouldReset: true, callbackDelay: 260, resetDelay: 1200 });
        });
    }

    const tripButton = document.querySelector('.sea-action-secondary[data-navigation-url]');
    if (tripButton) {
        tripButton.addEventListener('click', (event) => {
            event.preventDefault();
            const url = tripButton.dataset.navigationUrl;
            if (!url) {
                return;
            }

            runHeroDeparture(() => {
                navigateWithDepth(url);
            }, { shouldReset: false, callbackDelay: HERO_ROUTE_READY_DELAY });
        });
    }
}

// 首页滚动链接绑定：统一接管顶部导航和 footer 内指向首页区块的平滑滚动。
/**
 * setupHomeScrollLinks() - 绑定首页导航、页脚和锚点入口的滚动行为
 * @returns {void} - 无返回值，直接注册滚动事件
 */
function setupHomeScrollLinks() {
    const homeLink = document.querySelector('.navbar .nav-link[href="#"]');
    if (homeLink) {
        homeLink.addEventListener('click', (event) => {
            event.preventDefault();
            setHomeActiveNavLink(homeLink);

            if ((window.scrollY || window.pageYOffset) <= 4) {
                return;
            }

            if (window.OceanScroll && typeof window.OceanScroll.animateTo === 'function') {
                beginHomeInteractionLock(1980);
                window.OceanScroll.animateTo(0, { duration: 1900 });
                return;
            }

            beginHomeInteractionLock(160);
            window.scrollTo(0, 0);
        });
    }

    document.querySelectorAll('[data-scroll-target]').forEach((trigger) => {
        trigger.addEventListener('click', (event) => {
            if (event.defaultPrevented) {
                return;
            }

            event.preventDefault();

            if (trigger.matches('.navbar .nav-link')) {
                setHomeActiveNavLink(trigger);
            }

            scrollToSection(trigger.dataset.scrollTarget);
        });
    });
}

/**
 * consumePendingHomeScrollTarget() - 消费跨页写入的首页滚动目标，并对齐到首页既有的 section 落点逻辑
 * @returns {void} - 无返回值，直接触发首页平滑滚动
 */
/**
 * setupHeroHotspotsStageResize() - 给首页今日海域舞台添加桌面端鼠标拖拽缩放
 * @returns {void} - 无返回值，直接绑定拖拽句柄与尺寸记忆逻辑
 */
function setupHeroHotspotsStageResize() {
    const heroHotspotsStageShell = document.getElementById('heroHotspotsStageShell');
    if (!heroHotspotsStageShell) {
        return;
    }

    const desktopQuery = window.matchMedia('(min-width: 1180px)');
    const savedSize = safeReadHeroHotspotsStageSize();

    if (!isStageDebugModeEnabled) {
        if (desktopQuery.matches && savedSize) {
            applyHeroHotspotsStageSize(heroHotspotsStageShell, savedSize);
            heroHotspotsStageShell.dataset.stageSizeMode = 'custom';
        } else {
            heroHotspotsStageShell.dataset.stageSizeMode = 'default';
            heroHotspotsStageShell.style.removeProperty('--hero-hotspots-stage-width');
            heroHotspotsStageShell.style.removeProperty('--hero-hotspots-stage-height');
            heroHotspotsStageShell.style.removeProperty('--hero-hotspots-stage-shift-x');
        }

        heroHotspotsStageShell.classList.remove('is-resizing');
        document.body.classList.remove('is-resizing-hero-hotspots');
        return;
    }

    const resizeHandles = Array.from(document.querySelectorAll('.hero-hotspots-resize-handle'));
    if (!resizeHandles.length) {
        return;
    }

    const hudValue = document.getElementById('heroHotspotsStageHudValue');
    const hudHint = document.getElementById('heroHotspotsStageHudHint');
    const resetButton = document.getElementById('heroHotspotsStageReset');
    let resizeState = null;
    let hasCustomSize = Boolean(safeReadHeroHotspotsStageSize());

    const readCurrentStageSize = () => {
        const rect = heroHotspotsStageShell.getBoundingClientRect();
        return {
            width: rect.width,
            height: rect.height
        };
    };

    const syncStageHud = (size = null) => {
        heroHotspotsStageShell.dataset.stageSizeMode = hasCustomSize ? 'custom' : 'default';

        if (!hudValue || !hudHint || !resetButton || !desktopQuery.matches) {
            return;
        }

        const nextSize = size || readCurrentStageSize();
        hudValue.textContent = `${Math.round(nextSize.width)} x ${Math.round(nextSize.height)}`;
        hudHint.textContent = hasCustomSize ? '已记住本次观察尺度' : '当前为默认舞台';
        resetButton.disabled = !hasCustomSize;
    };

    const syncDesktopState = () => {
        if (desktopQuery.matches) {
            const saved = safeReadHeroHotspotsStageSize();
            hasCustomSize = Boolean(saved);
            if (saved) {
                applyHeroHotspotsStageSize(heroHotspotsStageShell, saved);
            }
            syncStageHud();
            return;
        }

        resizeState = null;
        hasCustomSize = Boolean(safeReadHeroHotspotsStageSize());
        heroHotspotsStageShell.classList.remove('is-resizing');
        document.body.classList.remove('is-resizing-hero-hotspots');
        heroHotspotsStageShell.style.removeProperty('--hero-hotspots-stage-width');
        heroHotspotsStageShell.style.removeProperty('--hero-hotspots-stage-height');
        heroHotspotsStageShell.style.removeProperty('--hero-hotspots-stage-shift-x');
        syncStageHud();
    };

    const stopResize = () => {
        if (!resizeState) {
            return;
        }

        const finalSize = {
            width: resizeState.width,
            height: resizeState.height,
            shiftX: resizeState.shiftX
        };
        const state = resizeState;

        resizeState = null;
        heroHotspotsStageShell.classList.remove('is-resizing');
        document.body.classList.remove('is-resizing-hero-hotspots');
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', stopResize);
        window.removeEventListener('pointercancel', stopResize);

        if (state.hadCustomSize || state.hasMoved) {
            hasCustomSize = true;
            safeSaveHeroHotspotsStageSize(finalSize);
            syncStageHud(finalSize);
            return;
        }

        hasCustomSize = false;
        syncStageHud();
    };

    const onPointerMove = (event) => {
        if (!resizeState) {
            return;
        }

        const dx = event.clientX - resizeState.startX;
        const dy = event.clientY - resizeState.startY;
        const direction = resizeState.direction;

        let nextWidth = resizeState.startWidth;
        let nextHeight = resizeState.startHeight;
        let nextShiftX = resizeState.startShiftX;

        if (direction.includes('e')) {
            nextWidth += dx;
            nextShiftX += dx / 2;
        }
        if (direction.includes('w')) {
            nextWidth -= dx;
            nextShiftX += dx / 2;
        }
        if (direction.includes('s')) {
            nextHeight += dy;
        }
        if (direction.includes('n')) {
            nextHeight -= dy;
        }

        const clamped = clampHeroHotspotsStageSize(heroHotspotsStageShell, nextWidth, nextHeight, nextShiftX);
        resizeState.hasMoved =
            resizeState.hasMoved ||
            Math.abs(clamped.width - resizeState.startWidth) > 0.5 ||
            Math.abs(clamped.height - resizeState.startHeight) > 0.5 ||
            Math.abs(clamped.shiftX - resizeState.startShiftX) > 0.5;
        applyHeroHotspotsStageSize(heroHotspotsStageShell, clamped);
        const actualSize = readCurrentStageSize();
        resizeState.width = actualSize.width;
        resizeState.height = actualSize.height;
        resizeState.shiftX = clamped.shiftX;
        hasCustomSize = resizeState.hadCustomSize || resizeState.hasMoved;
        syncStageHud(actualSize);
    };

    resizeHandles.forEach((handle) => {
        handle.addEventListener('pointerdown', (event) => {
            if (!desktopQuery.matches) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const rect = heroHotspotsStageShell.getBoundingClientRect();
            resizeState = {
                direction: handle.dataset.hotspotsResizeDirection || 'se',
                startX: event.clientX,
                startY: event.clientY,
                startWidth: rect.width,
                startHeight: rect.height,
                startShiftX: parseFloat(getComputedStyle(heroHotspotsStageShell).getPropertyValue('--hero-hotspots-stage-shift-x')) || 0,
                width: rect.width,
                height: rect.height,
                shiftX: parseFloat(getComputedStyle(heroHotspotsStageShell).getPropertyValue('--hero-hotspots-stage-shift-x')) || 0,
                hasMoved: false,
                hadCustomSize: hasCustomSize
            };

            heroHotspotsStageShell.classList.add('is-resizing');
            document.body.classList.add('is-resizing-hero-hotspots');
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', stopResize);
            window.addEventListener('pointercancel', stopResize);
        });
    });

    heroHotspotsStageShell.addEventListener('dblclick', (event) => {
        if (!desktopQuery.matches || !event.target.closest('.hero-hotspots-resize-handle')) {
            return;
        }

        clearHeroHotspotsStageSize(heroHotspotsStageShell);
        hasCustomSize = false;
        syncStageHud();
    });

    if (resetButton) {
        resetButton.addEventListener('click', () => {
            if (!desktopQuery.matches || !hasCustomSize) {
                return;
            }

            clearHeroHotspotsStageSize(heroHotspotsStageShell);
            hasCustomSize = false;
            syncStageHud();
        });
    }

    desktopQuery.addEventListener('change', syncDesktopState);
    window.addEventListener('resize', () => {
        if (!desktopQuery.matches) {
            return;
        }

        const saved = safeReadHeroHotspotsStageSize();
        if (saved) {
            applyHeroHotspotsStageSize(heroHotspotsStageShell, saved);
        }

        hasCustomSize = Boolean(saved);
        syncStageHud();
    });

    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
            if (desktopQuery.matches) {
                syncStageHud();
            }
        });
        resizeObserver.observe(heroHotspotsStageShell);
    }

    syncDesktopState();
}

function consumePendingHomeScrollTarget() {
    const targetSelector = readStoredHomeScrollTarget();
    if (!targetSelector) {
        return;
    }

    clearStoredHomeScrollTarget();
    window.setTimeout(() => {
        scrollToSection(targetSelector);
    }, 220);
}

// 品牌故事区显现：在滚动进入视口时逐张唤醒故事卡片，形成更缓慢的叙事节奏。
/**
 * setupStoryReveal() - 初始化盐憩故事区的进入视口显现动画
 * @returns {void} - 无返回值，直接设置观察器或降级显示
 */
function setupStoryReveal() {
    const section = document.getElementById('why-yanqi');
    const revealItems = Array.from(document.querySelectorAll('#why-yanqi .story-reveal'));
    if (!section || revealItems.length === 0) {
        return;
    }

    if (!('IntersectionObserver' in window)) {
        revealItems.forEach((item) => item.classList.add('is-visible'));
        return;
    }

    // 直接用 observer 的 rootMargin 定义“入场线”，避免先收到一次 intersect 回调、
    // 但因为未过 trigger line 而被跳过，后续又没有新的阈值变化可触发的问题。
    revealItems.forEach((item) => {
        const isStoryCard = item.classList.contains('story-card');

        observeOnceInViewport(item, () => {
            item.classList.add('is-visible');
        }, {
            threshold: 0.01,
            rootMargin: isStoryCard ? '0px 0px -28% 0px' : '0px 0px -8% 0px',
            deferDuringPageEntryTransition: false
        });
    });
}

// 首页海图导览：用浮层式海图导航替代普通回顶按钮，负责快速跳转和当前位置反馈。
class HomeSeaGuide {
    /**
     * constructor() - 初始化首页海图导览的 DOM 引用和内部状态
     */
    constructor() {
        this.guide = document.getElementById('homeSeaGuide');
        this.trigger = document.getElementById('homeSeaGuideTrigger');
        this.panel = document.getElementById('homeSeaGuidePanel');
        this.entries = Array.from(document.querySelectorAll('#homeSeaGuide .sea-guide-entry'));
        this.isOpen = false;
        this.currentKey = '';
        this.lastVisible = false;
        this.lastDeep = false;
        this.probeTargets = new Map();
        this.targetTops = new Map();
        this.targetMetricsVersion = 0;
        this.targetOffset = Number.NaN;
        this.resizeObserver = null;
        this.viewportSyncDisposer = null;
        this.currentEntrySyncRafId = 0;

        if (this.guide && this.trigger && this.panel && this.entries.length) {
            this.init();
        }
    }

    /**
     * getOffset() - 计算首页海图导览滚动时需要避开的固定导航栏高度
     * @returns {number} - 供滚动定位使用的顶部偏移量
     */
    getOffset() {
        const sharedMetrics = homeViewportCoordinator.readHomeSectionMetrics?.();
        if (Number.isFinite(sharedMetrics?.navOffsets?.seaGuide)) {
            return sharedMetrics.navOffsets.seaGuide;
        }

        const navbar = document.querySelector('.navbar');
        return (navbar ? navbar.offsetHeight : 72) + 18;
    }

    /**
     * getProbeTarget(selector) - 获取用于判断当前所在 section 的实际锚点元素
     * @param {string} selector - 海图导览条目指向的 section 选择器
     * @returns {Element|null} - 用于高亮判断的 DOM 元素
     */
    getProbeTarget(selector) {
        if (!selector) {
            return null;
        }

        const cached = this.probeTargets.get(selector);
        if (cached && cached.isConnected) {
            return cached;
        }

        const target = document.querySelector(selector);
        const probeTarget = resolveHomeSectionProbeElement(selector, target);
        this.probeTargets.set(selector, probeTarget || null);
        return probeTarget;
    }

    /**
     * measureTargets() - 预先测量首页海图导览各区块的绝对位置，减少滚动时布局读取
     * @returns {void}
     */
    measureTargets() {
        const offset = this.getOffset();
        const sharedMetrics = homeViewportCoordinator.readHomeSectionMetrics?.();
        const metricsVersion = Number.isFinite(sharedMetrics?.version) ? sharedMetrics.version : 0;
        const previousTargetTops = new Map(this.targetTops);
        if (
            this.targetTops.size
            && metricsVersion > 0
            && this.targetMetricsVersion === metricsVersion
            && Math.abs(this.targetOffset - offset) < 1
        ) {
            return;
        }

        this.targetTops.clear();
        this.targetMetricsVersion = metricsVersion;
        this.targetOffset = offset;

        this.entries.forEach((entry) => {
            const selector = entry.dataset.target;
            const sharedSection = selector ? sharedMetrics?.sections?.[selector] : null;
            if (selector && Number.isFinite(sharedSection?.anchorTop)) {
                this.targetTops.set(
                    selector,
                    Math.max(0, sharedSection.anchorTop - offset)
                );
                return;
            }

            const target = this.getProbeTarget(selector);
            if (!selector || !target) {
                return;
            }

            const cachedTop = previousTargetTops.get(selector);
            if (Number.isFinite(cachedTop)) {
                this.targetTops.set(selector, cachedTop);
            }
        });
    }

    /**
     * scheduleMeasureTargets() - 把首页海图区块重测压到下一帧，避免频繁 resize/布局更新时抖动
     * @returns {void}
     */
    scheduleMeasureTargets() {
        homeViewportCoordinator.requestMeasure();
    }

    /**
     * setOpen(isOpen) - 切换首页海图导览的展开和收起状态
     * @param {boolean} isOpen - 是否展开海图导览面板
     * @returns {void} - 无返回值，直接更新 DOM 状态
     */
    setOpen(isOpen) {
        this.isOpen = Boolean(isOpen);
        this.guide.classList.toggle('is-open', this.isOpen);
        this.trigger.setAttribute('aria-expanded', String(this.isOpen));
        this.panel.setAttribute('aria-hidden', String(!this.isOpen));
        setHomeGuideOpenState(this.isOpen);

        if (this.isOpen) {
            this.scheduleCurrentEntryVisibilitySync();
        }
    }

    /**
     * scheduleCurrentEntryVisibilitySync() - 把当前高亮条目的可视区修正压到下一帧，避免打开时出现半截卡片
     * @returns {void}
     */
    scheduleCurrentEntryVisibilitySync() {
        if (!this.isOpen || !this.panel) {
            return;
        }

        if (this.currentEntrySyncRafId) {
            cancelAnimationFrame(this.currentEntrySyncRafId);
        }

        this.currentEntrySyncRafId = requestAnimationFrame(() => {
            this.currentEntrySyncRafId = 0;
            this.ensureCurrentEntryVisible();
        });
    }

    /**
     * ensureCurrentEntryVisible() - 确保当前高亮的导览条目始终完整处于面板可视区内
     * @returns {void}
     */
    ensureCurrentEntryVisible() {
        if (!this.isOpen || !this.panel) {
            return;
        }

        const currentEntry = this.entries.find((entry) => entry.classList.contains('is-current'));
        if (!currentEntry) {
            return;
        }

        const panelRect = this.panel.getBoundingClientRect();
        const entryRect = currentEntry.getBoundingClientRect();
        const topInset = 18;
        const bottomInset = 26;
        const isFullyVisible = entryRect.top >= panelRect.top + topInset
            && entryRect.bottom <= panelRect.bottom - bottomInset;

        if (isFullyVisible) {
            return;
        }

        currentEntry.scrollIntoView({
            behavior: 'auto',
            block: 'nearest',
            inline: 'nearest'
        });
    }

    /**
     * scrollToTarget(selector) - 根据海图导览条目平滑滚动到首页对应区域
     * @param {string} selector - 目标 section 的 CSS 选择器
     * @returns {void} - 无返回值，直接触发首页滚动
     */
    scrollToTarget(selector) {
        if (!selector) {
            return;
        }

        scrollToSection(selector);
    }

    /**
     * getCurrentKey() - 计算用户当前更接近首页的哪一个海图导览区域
     * @returns {string} - 当前 section 对应的海图导览 key
     */
    getCurrentKey() {
        if (!this.entries.length) {
            return '';
        }

        const offset = this.getOffset();
        const sharedMetrics = homeViewportCoordinator.readHomeSectionMetrics?.();
        const probeY = window.scrollY + offset + Math.min(window.innerHeight * 0.24, 220);
        let currentKey = this.entries[0].dataset.key || '';

        this.entries.forEach((entry) => {
            const selector = entry.dataset.target;
            const sharedSection = selector ? sharedMetrics?.sections?.[selector] : null;
            if (selector && Number.isFinite(sharedSection?.anchorTop)) {
                const sharedTop = Math.max(0, sharedSection.anchorTop - offset);
                if (probeY >= sharedTop - 24) {
                    currentKey = entry.dataset.key || currentKey;
                }
                return;
            }

            const sectionTop = this.targetTops.get(entry.dataset.target);
            if (!Number.isFinite(sectionTop)) {
                return;
            }
            if (probeY >= sectionTop - 24) {
                currentKey = entry.dataset.key || currentKey;
            }
        });

        return currentKey;
    }

    /**
     * updateState() - 同步首页海图导览的显隐、深层状态和当前区域高亮
     * @returns {void} - 无返回值，直接更新海图导览状态
     */
    updateState() {
        if (HOME_INTERACTION_STATE.scrollTraveling && !this.isOpen) {
            return;
        }

        const scrollTop = window.scrollY || window.pageYOffset || 0;
        const isVisible = scrollTop > 180;
        const isDeep = scrollTop > Math.max(window.innerHeight * 0.9, 860);
        const currentKey = this.getCurrentKey();

        if (this.lastVisible !== isVisible) {
            this.lastVisible = isVisible;
            this.guide.classList.toggle('is-visible', isVisible);
            this.guide.setAttribute('aria-hidden', String(!isVisible));
        }

        if (this.lastDeep !== isDeep) {
            this.lastDeep = isDeep;
            this.guide.classList.toggle('is-deep', isDeep);
        }

        if (this.currentKey === currentKey) {
            return;
        }

        this.currentKey = currentKey;

        this.entries.forEach((entry) => {
            const isCurrent = entry.dataset.key === currentKey;
            entry.classList.toggle('is-current', isCurrent);
            entry.setAttribute('aria-current', isCurrent ? 'true' : 'false');
        });

        if (this.isOpen) {
            this.scheduleCurrentEntryVisibilitySync();
        }
    }

    /**
     * init() - 绑定首页海图导览的展开、关闭、滚动同步和点击跳转逻辑
     * @returns {void} - 无返回值，直接注册首页海图导览事件
     */
    init() {
        this.viewportSyncDisposer = homeViewportCoordinator.register({
            measure: () => this.measureTargets(),
            update: () => this.updateState()
        });
        const handleLayoutChange = () => homeViewportCoordinator.requestMeasure();
        // 滚动时不直接频繁计算当前 section，而是压到 requestAnimationFrame 里统一做。
        // 这样能减少抖动，也更符合“海图导览跟着页面呼吸”这种缓和节奏。

        this.trigger.addEventListener('click', (event) => {
            event.preventDefault();
            this.setOpen(!this.isOpen);
        });

        this.entries.forEach((entry) => {
            entry.addEventListener('click', () => {
                const selector = entry.dataset.target;
                this.setOpen(false);
                this.scrollToTarget(selector);
            });
        });

        document.addEventListener('click', (event) => {
            if (!this.isOpen || this.guide.contains(event.target)) {
                return;
            }

            this.setOpen(false);
        });

        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && this.isOpen) {
                this.setOpen(false);
            }
        });

        if ('ResizeObserver' in window) {
            this.resizeObserver = new ResizeObserver(handleLayoutChange);
            this.entries.forEach((entry) => {
                const target = this.getProbeTarget(entry.dataset.target);
                if (target) {
                    this.resizeObserver.observe(target);
                }
            });
        }

        this.measureTargets();
        this.updateState();
        window.setTimeout(() => homeViewportCoordinator.requestMeasure(), 80);
    }
}

let curatedWatersStageInstance = null;
let diveMatchStageInstance = null;
let homeStoryRevealInitialized = false;

/**
 * ensureCuratedWatersStage() - 确保精选目的地舞台只初始化一次
 * @returns {CuratedWatersStage} - 首页精选目的地舞台实例
 */
function ensureCuratedWatersStage() {
    if (!curatedWatersStageInstance) {
        curatedWatersStageInstance = new CuratedWatersStage();
    }

    return curatedWatersStageInstance;
}

/**
 * ensureDiveMatchStage() - 确保潜水匹配舞台只初始化一次
 * @returns {DiveMatchStage} - 首页潜水匹配舞台实例
 */
function ensureDiveMatchStage() {
    if (!diveMatchStageInstance) {
        diveMatchStageInstance = new DiveMatchStage();
    }

    return diveMatchStageInstance;
}

/**
 * ensureStoryReveal() - 确保品牌故事区的显现观察器只建立一次
 * @returns {void}
 */
function ensureStoryReveal() {
    if (homeStoryRevealInitialized) {
        return;
    }

    homeStoryRevealInitialized = true;
    setupStoryReveal();
}

/**
 * setupHomeLayerFlow() - 监听首页中段海层变化，让首页更像一条连续下潜路径
 * @returns {void}
 */
function setupHomeLayerFlow() {
    const layerSections = Array.from(document.querySelectorAll('[data-home-layer]'));
    if (!layerSections.length) {
        return;
    }

    const body = document.body;
    const setCurrentLayer = (layerKey) => {
        if (!body) {
            return;
        }

        body.dataset.currentHomeLayer = layerKey || '';
    };

    let sectionMetrics = [];
    let currentLayerIndex = -1;
    let currentLayerKey = '';
    let lastProgressBucket = '';

    const measureSections = () => {
        const sharedMetrics = homeViewportCoordinator.readHomeSectionMetrics?.();
        const sharedLayerMetrics = Array.isArray(sharedMetrics?.layerSections) ? sharedMetrics.layerSections : null;

        sectionMetrics = layerSections.map((section, index) => {
            const sharedLayerMetric = sharedLayerMetrics?.[index];
            if (Number.isFinite(sharedLayerMetric?.top)) {
                return {
                    section,
                    top: sharedLayerMetric.top
                };
            }

            return {
                section,
                top: section.getBoundingClientRect().top + window.scrollY
            };
        });
    };

    const scheduleMeasure = () => {
        homeViewportCoordinator.requestMeasure();
    };

    const updateLayerState = () => {
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const probeY = scrollY + Math.min(viewportHeight * 0.42, 320);
        let currentIndex = 0;

        sectionMetrics.forEach((metric, index) => {
            if (probeY >= metric.top - viewportHeight * 0.18) {
                currentIndex = index;
            }
        });

        const currentSection = layerSections[currentIndex];
        const nextSection = layerSections[Math.min(currentIndex + 1, layerSections.length - 1)];
        const currentTop = Number.isFinite(sectionMetrics[currentIndex]?.top)
            ? sectionMetrics[currentIndex].top
            : (currentSection.getBoundingClientRect().top + scrollY);
        const nextMetricTop = sectionMetrics[Math.min(currentIndex + 1, sectionMetrics.length - 1)]?.top;
        const nextTop = Number.isFinite(nextMetricTop)
            ? nextMetricTop
            : (nextSection.getBoundingClientRect().top + scrollY);
        const layerDistance = Math.max(1, nextTop - currentTop);
        const layerProgress = clamp((probeY - currentTop) / layerDistance, 0, 1);
        const nextLayerKey = currentSection?.dataset.homeLayer || '';
        const progressBucket = HOME_INTERACTION_STATE.scrollTraveling
            ? ''
            : layerProgress.toFixed(3);

        if (currentLayerIndex !== currentIndex) {
            currentLayerIndex = currentIndex;
            layerSections.forEach((section, index) => {
                const distance = index - currentIndex;
                section.classList.toggle('is-home-current', index === currentIndex);
                section.classList.toggle('is-home-passed', index < currentIndex);
                section.classList.toggle('is-home-upcoming', index > currentIndex);
                section.style.setProperty('--home-layer-distance', String(distance));
            });
        }

        if (currentLayerKey !== nextLayerKey) {
            currentLayerKey = nextLayerKey;
            setCurrentLayer(nextLayerKey);
        }

        if (progressBucket && lastProgressBucket !== progressBucket) {
            lastProgressBucket = progressBucket;
            body?.style.setProperty('--home-layer-progress', progressBucket);
        }
    };

    homeViewportCoordinator.register({
        measure: measureSections,
        update: updateLayerState
    });
    measureSections();
    updateLayerState();
    window.setTimeout(() => homeViewportCoordinator.requestMeasure(), 80);

    if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(scheduleMeasure);
        layerSections.forEach((section) => observer.observe(section));
    }
}

// 页面初始化：创建首页主要组件，并绑定头像退出、首屏、故事区等交互。
/**
 * document DOMContentLoaded 回调 - 初始化首页的主要组件和页面级交互
 * @returns {void} - 无返回值，直接启动首页逻辑
 */
document.addEventListener('DOMContentLoaded', async function () {
    await settleHomeImageManifest(220);
    refreshHomeDataImageSources();

    const pendingHomeScrollTarget = readStoredHomeScrollTarget();
    const hasDiveMatchDeepLink = window.location.hash === '#dive-match' || Boolean(getDiveMatchKeyFromLocation());
    const shouldBootstrapCuratedImmediately =
        pendingHomeScrollTarget === '#featured-destinations' ||
        pendingHomeScrollTarget === '#dive-match' ||
        window.location.hash === '#featured-destinations' ||
        hasDiveMatchDeepLink;
    const shouldBootstrapDiveMatchImmediately =
        pendingHomeScrollTarget === '#dive-match' ||
        hasDiveMatchDeepLink;
    const homePerformanceProfile = resolveHomePerformanceProfile();

    setupStageDebugToggle();
    applyHomePerformanceProfile(homePerformanceProfile);
    setupHomeManualScrollTraveling();
    new BambooScroll();
    setupHeroImmersion();
    setupHeroHotspotsStageResize();
    setupHeroActions();
    setupHomeNavState();
    setupHomeScrollLinks();
    new HomeSeaGuide();
    setupHomeLayerFlow();
    homeViewportCoordinator.requestMeasure();
    ensureStoryReveal();

    createDeferredSectionBootstrap('#featured-destinations', ensureCuratedWatersStage, {
        immediate: shouldBootstrapCuratedImmediately,
        enableIdleBootstrap: shouldBootstrapCuratedImmediately,
        idleTimeoutMs: shouldBootstrapCuratedImmediately ? 900 : null,
        rootMargin: '0px 0px 10% 0px',
        viewportLeadRatio: shouldBootstrapCuratedImmediately ? 1.4 : 0.78,
        viewportBottomRatio: -0.16
    });
    createDeferredSectionBootstrap('#dive-match', ensureDiveMatchStage, {
        immediate: shouldBootstrapDiveMatchImmediately,
        enableIdleBootstrap: shouldBootstrapDiveMatchImmediately,
        idleTimeoutMs: shouldBootstrapDiveMatchImmediately ? 1200 : null,
        rootMargin: '0px 0px 12% 0px',
        viewportLeadRatio: shouldBootstrapDiveMatchImmediately ? 1.4 : 0.56,
        viewportBottomRatio: -0.12
    });
    consumePendingHomeScrollTarget();
    setupHeroAnimationPause();

    window.YanqiAvatarReturn?.bind({
        targetUrl: 'index.html'
    });
});

/**
 * setupHeroAnimationPause() - 首屏滚出视口时暂停无限循环装饰动画以节省 GPU
 * @returns {void}
 */
function setupHeroAnimationPause() {
    const hero = document.querySelector('.hero-section');
    if (!hero || !('IntersectionObserver' in window)) {
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            hero.style.setProperty(
                '--hero-play-state',
                entry.isIntersecting ? 'running' : 'paused'
            );
        });
    }, { threshold: 0 });

    observer.observe(hero);
}
