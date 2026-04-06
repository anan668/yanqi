/* ============================================
   深度总控 - depth-manager.js
   ============================================
   职责：
   1. 统一管理整站深度计、页面默认深度和滚动深浅变化。
   2. 接管跨页切换，把导航动作翻译成下潜、上浮或潜游体验。
   3. 维护覆盖层、导航状态、页面进入与恢复时的深度节奏。
   阅读顺序：
   1. 常量与深度映射
   2. 基础工具函数
   3. 过渡配置
   4. `DepthManager` 类本体
*/
(function () {
    // 页面深度层级：定义每个页面在整站海洋空间中的默认深度。
    // 这里把 trip / detail 调得比首页 footer 更深，保证从首页底部继续跳转时仍有“继续下潜”的空间感。
    const PAGE_DEPTH_MAP = Object.freeze({
        login: 0,
        contact: -4,
        terms: -4,
        privacy: -4,
        home: -8,
        trip: -26,
        detail: -30
    });

    // 首页分层深度：随着浏览从首屏进入不同 section，深度计会缓慢下潜到更深一层。
    // 这些停靠点不是硬跳，而是后面通过滚动插值平滑过渡成连续的下潜曲线。
    const HOME_SECTION_DEPTH_STOPS = Object.freeze([
        { selector: '#hero-home', depth: PAGE_DEPTH_MAP.home },
        { selector: '#featured-destinations', depth: -10 },
        { selector: '#dive-match', depth: -14 },
        { selector: '#why-yanqi', depth: -18 },
        { selector: '.footer', depth: -22 }
    ]);

    const MIN_DEPTH = -32;
    const MAX_DEPTH = 0;
    const STEP = 1;
    const PAGE_GAUGE_VISUAL_MAX_DEPTH_MAP = Object.freeze({
        home: 48,
        trip: 48
    });

    // 行程页与详情页的滚动深度停靠点：
    // 它们会沿着各自的主要区块继续下潜，让深度计不只是跨页时变化，
    // 也能在页面内部随着阅读和安排慢慢往更深一层走。
    const PAGE_SCROLL_DEPTH_STOP_MAP = Object.freeze({
        trip: Object.freeze([
            { selector: '#trip-top', depth: PAGE_DEPTH_MAP.trip },
            { selector: '#plannerDeskControl', depth: -28 },
            { selector: '#plannerSummary', depth: -29 },
            { selector: '#trip-layer', depth: -30 },
            { selector: '#trip-prep', depth: -31 },
            { selector: '#tripFooter', depth: MIN_DEPTH }
        ]),
        detail: Object.freeze([
            { selector: '#detailHero', depth: PAGE_DEPTH_MAP.detail },
            { selector: '#spotOverview', depth: -30.18 },
            { selector: '#spotMapSection', depth: -30.72 },
            { selector: '#spotReviews', depth: -31.22 },
            { selector: '#relatedSpots', depth: -31.66 },
            { selector: '#detailFooter', depth: MIN_DEPTH }
        ])
    });
    const PAGE_STATE_DEPTH_OFFSET_RULES = Object.freeze({
        trip: Object.freeze([
            Object.freeze({
                selector: '#plannerFloatingLayer',
                depthOffset: 0.55
            })
        ]),
        detail: Object.freeze([
            Object.freeze({
                selector: '#bookingModal',
                depthOffset: 0.52
            }),
            Object.freeze({
                selector: '#reviewDetailModal',
                depthOffset: 0.4
            }),
            Object.freeze({
                selector: '#reviewLightbox',
                depthOffset: 0.48
            }),
            Object.freeze({
                selector: '#bookingConfirmFeedback',
                depthOffset: 0.38
            })
        ])
    });
    const DETAIL_GAUGE_DEFAULT_MAX_DEPTH = 72;
    const DETAIL_GAUGE_FOCUS_RATIO = 0.46;
    const DETAIL_GAUGE_MIN_ENTRY_DEPTH = Math.abs(PAGE_DEPTH_MAP.detail);
    const DETAIL_GAUGE_MIN_DEEP_DEPTH = 50;
    const DETAIL_GAUGE_STEP_SIZE_FALLBACK = 18;
    const DETAIL_GAUGE_STEP_SIZE_MIN = 16;
    const DETAIL_GAUGE_STEP_SIZE_MAX = 24;
    const DETAIL_GAUGE_DEFAULT_PROFILE = Object.freeze({
        minDepth: 6,
        maxDepth: 40,
        focusDepth: 28,
        surfaceDepth: 24,
        deepDepth: 34,
        gaugeMaxDepth: DETAIL_GAUGE_DEFAULT_MAX_DEPTH
    });

    const STORAGE_KEY_CURRENT = 'yanqi_depth_current';
    const STORAGE_KEY_NAV = 'yanqi_depth_nav';
    const STORAGE_KEY_HOME_ENTRY_DEPTH = 'YANQI_HOME_ENTRY_DEPTH';
    const DETAIL_SWAP_STORAGE_KEY = 'yanqi_detail_swap_transition';
    const DETAIL_SWAP_MAX_AGE_MS = 12000;

    // 统一过渡时序配置：
    // 1. general 控制整站默认切页节奏
    // 2. loginHome 控制登录门厅沉入首页的专用阶段时序
    // 3. oceanNav 控制首页与行程页之间的潜浮节奏
    // 如需整体调快 / 调慢，优先改这里，或在脚本加载前挂 window.YANQI_DEPTH_TRANSITION_CONFIG 覆盖。
    const DEFAULT_TRANSITION_TIMINGS = Object.freeze({
        general: Object.freeze({
            exitPageMs: 1120,
            exitNavigateLeadMs: 100,
            enterPageMs: 880,
            overlayBoost: 0.23,
            pageshowOverlayBoost: 0.18,
            navFreshMs: 10000
        }),
        loginHome: Object.freeze({
            blueMs: 1260,
            bubbleDelayMs: 320,
            slideStartMs: 1580,
            navigateMs: 1860,
            depthMs: 1740,
            blueOpacity: 0.78,
            entryMs: 1460,
            entryBlueMs: 1320,
            bubbleFadeStartMs: 320,
            bubbleCount: 16
        }),
        oceanNav: Object.freeze({
            diveExitMs: 1460,
            diveEnterMs: 1280,
            surfaceExitMs: 1520,
            surfaceEnterMs: 1340,
            navigateLeadMs: 120,
            overlayBoost: 0.2,
            pageshowOverlayBoost: 0.14
        })
    });
    const SPECIAL_TRANSITION_LOGIN_HOME = 'login-home-ocean';
    const NAV_TRANSITION_OCEAN = 'ocean-layer-nav';

    /**
     * readTimingNumber(value, fallbackValue, min, max) - 读取并约束时序配置数值
     * @param {*} value - 原始配置值
     * @param {number} fallbackValue - 兜底值
     * @param {number} min - 最小允许值
     * @param {number} max - 最大允许值
     * @returns {number} - 清洗后的安全数值
     */
    function readTimingNumber(value, fallbackValue, min, max) {
        const parsed = readNumber(value);
        return clamp(parsed ?? fallbackValue, min, max);
    }

    /**
     * getScrollDepthStopConfig(pageId) - 读取某个页面可用的滚动深度停靠点配置
     * @param {string} pageId - 页面标识
     * @returns {Array<Object>} - 对应页面的滚动深度配置
     */
    function getScrollDepthStopConfig(pageId) {
        if (pageId === 'home') {
            return HOME_SECTION_DEPTH_STOPS;
        }

        return PAGE_SCROLL_DEPTH_STOP_MAP[pageId] || [];
    }

    /**
     * getPageStateDepthOffsetRules(pageId) - 读取当前页面需要联动附加下潜的 DOM 状态规则
     * @param {string} pageId - 页面标识
     * @returns {Array<Object>} - 当前页面的轻微附加下潜规则
     */
    function getPageStateDepthOffsetRules(pageId) {
        return PAGE_STATE_DEPTH_OFFSET_RULES[pageId] || [];
    }

    /**
     * isDepthStateElementActive(element) - 判断某个浮层或弹层是否处于打开或收束中的可感知状态
     * @param {HTMLElement|null} element - 需要检查的 DOM 元素
     * @returns {boolean} - 当前元素是否应被视为“更深一层”状态
     */
    function isDepthStateElementActive(element) {
        if (!element || element.hidden) {
            return false;
        }

        const ariaHidden = element.getAttribute('aria-hidden');
        if (ariaHidden === 'false') {
            return true;
        }

        return (
            element.classList.contains('active')
            || element.classList.contains('is-open')
            || element.classList.contains('is-closing')
        );
    }

    /**
     * getPageGaugeVisualMinDepth(pageId) - 获取普通页面深度计可视刻度带的最深边界
     * @param {string} pageId - 页面标识
     * @returns {number} - 当前页面刻度带应延展到的最深层
     */
    function getPageGaugeVisualMinDepth(pageId) {
        const configuredMaxDepth = PAGE_GAUGE_VISUAL_MAX_DEPTH_MAP[pageId];
        const visualMaxDepth = Number.isFinite(configuredMaxDepth)
            ? Math.max(configuredMaxDepth, Math.abs(MIN_DEPTH))
            : Math.abs(MIN_DEPTH);

        return -visualMaxDepth;
    }

    /**
     * roundToStep(value, step) - 按指定步长对数值做就近取整
     * @param {number} value - 原始数值
     * @param {number} step - 需要对齐的步长
     * @returns {number} - 对齐后的数值
     */
    function roundToStep(value, step = 1) {
        const safeStep = Math.max(Number(step) || 1, 1);
        return Math.round(value / safeStep) * safeStep;
    }

    /**
     * parseDepthRangeText(depthText) - 从潜点深度文本中提取最浅层与最深层
     * @param {string} depthText - 潜点深度文本，如 5-40m
     * @returns {{minDepth:number,maxDepth:number}|null} - 解析后的深度范围
     */
    function parseDepthRangeText(depthText) {
        const text = String(depthText || '');
        const matches = text.match(/\d+(?:\.\d+)?/g);
        if (!matches || matches.length === 0) {
            return null;
        }

        const first = Number(matches[0]);
        const last = Number(matches[matches.length - 1]);

        if (!Number.isFinite(first)) {
            return null;
        }

        let minDepth = first;
        let maxDepth = Number.isFinite(last) ? last : first;

        if (matches.length === 1 && /\+/.test(text)) {
            maxDepth = Math.max(maxDepth, minDepth + 12);
        }

        if (maxDepth < minDepth) {
            const swap = minDepth;
            minDepth = maxDepth;
            maxDepth = swap;
        }

        return {
            minDepth: clamp(minDepth, 0, 120),
            maxDepth: clamp(maxDepth, 0, 140)
        };
    }

    /**
     * createDetailGaugeProfile(source) - 根据潜点深度信息生成详情页深度计滚动带配置
     * @param {string|Object|null} source - 深度文本或显式配置对象
     * @returns {Object} - 详情页深度计显示配置
     */
    function createDetailGaugeProfile(source) {
        const parsedRange = typeof source === 'string'
            ? parseDepthRangeText(source)
            : null;
        const sourceObject = source && typeof source === 'object' && !Array.isArray(source)
            ? source
            : {};

        const baseMinDepth = parsedRange?.minDepth ?? clamp(readNumber(sourceObject.minDepth) ?? DETAIL_GAUGE_DEFAULT_PROFILE.minDepth, 0, 120);
        const baseMaxDepth = parsedRange?.maxDepth ?? clamp(readNumber(sourceObject.maxDepth) ?? DETAIL_GAUGE_DEFAULT_PROFILE.maxDepth, baseMinDepth + 1, 140);
        const range = Math.max(baseMaxDepth - baseMinDepth, 8);
        const computedGaugeMaxDepth = Math.max(
            DETAIL_GAUGE_DEFAULT_MAX_DEPTH,
            roundToStep(baseMaxDepth + 12, 10)
        );
        // 详情页显示的“当前海层”更偏向这片海的代表观察层，
        // 不直接等于潜点最浅层，避免从首页底部进入详情时反而像上浮。
        const computedFocusDepth = clamp(
            roundToStep(Math.max(baseMinDepth + range * 0.74, DETAIL_GAUGE_MIN_ENTRY_DEPTH), 2),
            DETAIL_GAUGE_MIN_ENTRY_DEPTH,
            computedGaugeMaxDepth - 4
        );
        const driftSpan = clamp(roundToStep(range * 0.12, 1), 3, 5);
        const computedSurfaceDepth = clamp(
            roundToStep(computedFocusDepth - driftSpan, 1),
            Math.max(DETAIL_GAUGE_MIN_ENTRY_DEPTH - 4, 8),
            Math.max(computedFocusDepth - 1, 5)
        );
        const computedDeepDepth = clamp(
            roundToStep(
                Math.max(
                    baseMaxDepth + 8,
                    computedFocusDepth + 14,
                    computedFocusDepth + driftSpan,
                    DETAIL_GAUGE_MIN_DEEP_DEPTH
                ),
                1
            ),
            computedFocusDepth + 4,
            computedGaugeMaxDepth - 2
        );

        const focusDepth = clamp(
            roundToStep(readNumber(sourceObject.focusDepth) ?? computedFocusDepth, 1),
            Math.max(DETAIL_GAUGE_MIN_ENTRY_DEPTH, computedSurfaceDepth + 1),
            computedDeepDepth - 1
        );
        const surfaceDepth = clamp(
            roundToStep(readNumber(sourceObject.surfaceDepth) ?? computedSurfaceDepth, 1),
            Math.max(DETAIL_GAUGE_MIN_ENTRY_DEPTH - 4, 8),
            focusDepth - 1
        );
        const deepDepth = clamp(
            roundToStep(readNumber(sourceObject.deepDepth) ?? computedDeepDepth, 1),
            focusDepth + 4,
            computedGaugeMaxDepth - 2
        );
        const gaugeMaxDepth = Math.max(
            DETAIL_GAUGE_DEFAULT_MAX_DEPTH,
            roundToStep(readNumber(sourceObject.gaugeMaxDepth) ?? computedGaugeMaxDepth, 10)
        );

        return Object.freeze({
            minDepth: baseMinDepth,
            maxDepth: baseMaxDepth,
            focusDepth: focusDepth,
            surfaceDepth: surfaceDepth,
            deepDepth: deepDepth,
            gaugeMaxDepth: gaugeMaxDepth
        });
    }

    /**
     * resolveTransitionTimingConfig(rawConfig) - 合并外部覆盖配置并生成当前生效的过渡时序表
     * 这里可以把它理解成“过渡节奏总表”的整理器：
     * 1. 先把外部传进来的原始配置拆成 general / loginHome / oceanNav 三组；
     * 2. 再逐项做数值兜底和范围限制，避免异常值把整站过渡节奏拉坏；
     * 3. 最后冻结结果，保证后续读取到的都是一份稳定配置。
     *
     * 对阅读代码的人来说，最重要的是记住三组配置分别服务哪一段体验：
     * - `general`：绝大多数页面切换共用的基础节奏；
     * - `loginHome`：登录门厅沉入首页这一段专属节奏；
     * - `oceanNav`：首页与行程页之间“下潜 / 上浮”的专属节奏。
     *
     * @param {Object|null} rawConfig - 外部注入的时序配置
     * @returns {Object} - 已清洗且冻结的过渡时序对象
     */
    function resolveTransitionTimingConfig(rawConfig) {
        // 先保证最外层一定是对象；如果外部没传或类型不对，就回退为空对象再走默认值。
        const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
        // 三组子配置分别单独读取，这样某一组缺失时不会影响另外两组。
        const generalSource = source.general && typeof source.general === 'object' ? source.general : {};
        const loginHomeSource = source.loginHome && typeof source.loginHome === 'object' ? source.loginHome : {};
        const oceanNavSource = source.oceanNav && typeof source.oceanNav === 'object' ? source.oceanNav : {};

        return Object.freeze({
            general: Object.freeze({
                // 当前页面完全离场需要多久。
                exitPageMs: readTimingNumber(generalSource.exitPageMs, DEFAULT_TRANSITION_TIMINGS.general.exitPageMs, 320, 3200),
                // 离场动画开始后，提前多少毫秒真正执行页面跳转。
                exitNavigateLeadMs: readTimingNumber(generalSource.exitNavigateLeadMs, DEFAULT_TRANSITION_TIMINGS.general.exitNavigateLeadMs, 80, 720),
                // 新页面浮现完成需要多久。
                enterPageMs: readTimingNumber(generalSource.enterPageMs, DEFAULT_TRANSITION_TIMINGS.general.enterPageMs, 280, 2800),
                // 离场时海洋遮罩要额外加深多少。
                overlayBoost: readTimingNumber(generalSource.overlayBoost, DEFAULT_TRANSITION_TIMINGS.general.overlayBoost, 0, 0.45),
                // 浏览器前进 / 后退恢复页面时，遮罩要额外补多少层次。
                pageshowOverlayBoost: readTimingNumber(generalSource.pageshowOverlayBoost, DEFAULT_TRANSITION_TIMINGS.general.pageshowOverlayBoost, 0, 0.35),
                // 这次导航状态在多长时间内仍算“新鲜”，可用于恢复过渡状态。
                navFreshMs: readTimingNumber(generalSource.navFreshMs, DEFAULT_TRANSITION_TIMINGS.general.navFreshMs, 1000, 30000)
            }),
            loginHome: Object.freeze({
                // 门厅专属蓝层压下来的时长。
                blueMs: readTimingNumber(loginHomeSource.blueMs, DEFAULT_TRANSITION_TIMINGS.loginHome.blueMs, 420, 4000),
                // 气泡开始出现前的等待时间。
                bubbleDelayMs: readTimingNumber(loginHomeSource.bubbleDelayMs, DEFAULT_TRANSITION_TIMINGS.loginHome.bubbleDelayMs, 0, 2400),
                // 页面开始位移、像继续下潜那样滑入的起始时间点。
                slideStartMs: readTimingNumber(loginHomeSource.slideStartMs, DEFAULT_TRANSITION_TIMINGS.loginHome.slideStartMs, 180, 4200),
                // 视觉动作建立后，真正执行页面跳转的时间点。
                navigateMs: readTimingNumber(loginHomeSource.navigateMs, DEFAULT_TRANSITION_TIMINGS.loginHome.navigateMs, 240, 4600),
                // 深度计同步沉入首页默认深度的时长。
                depthMs: readTimingNumber(loginHomeSource.depthMs, DEFAULT_TRANSITION_TIMINGS.loginHome.depthMs, 320, 4200),
                // 门厅蓝层允许达到的最高透明度。
                blueOpacity: readTimingNumber(loginHomeSource.blueOpacity, DEFAULT_TRANSITION_TIMINGS.loginHome.blueOpacity, 0, 0.92),
                // 首页加载完成后，整页恢复清晰度和呼吸感的时长。
                entryMs: readTimingNumber(loginHomeSource.entryMs, DEFAULT_TRANSITION_TIMINGS.loginHome.entryMs, 320, 3600),
                // 首页入场时蓝层退去的时长。
                entryBlueMs: readTimingNumber(loginHomeSource.entryBlueMs, DEFAULT_TRANSITION_TIMINGS.loginHome.entryBlueMs, 240, 3600),
                // 气泡开始淡出的时间点，避免它们停留过晚。
                bubbleFadeStartMs: readTimingNumber(loginHomeSource.bubbleFadeStartMs, DEFAULT_TRANSITION_TIMINGS.loginHome.bubbleFadeStartMs, 0, 2400),
                // 生成的气泡数量，最后会四舍五入成整数。
                bubbleCount: Math.round(readTimingNumber(loginHomeSource.bubbleCount, DEFAULT_TRANSITION_TIMINGS.loginHome.bubbleCount, 0, 48))
            }),
            oceanNav: Object.freeze({
                // 首页继续下潜到行程页时，旧页面离场需要多久。
                diveExitMs: readTimingNumber(oceanNavSource.diveExitMs, DEFAULT_TRANSITION_TIMINGS.oceanNav.diveExitMs, 420, 3600),
                // 行程页作为更深海层浮现出来的时长。
                diveEnterMs: readTimingNumber(oceanNavSource.diveEnterMs, DEFAULT_TRANSITION_TIMINGS.oceanNav.diveEnterMs, 320, 3200),
                // 行程页上浮回首页时，旧页面离场需要多久。
                surfaceExitMs: readTimingNumber(oceanNavSource.surfaceExitMs, DEFAULT_TRANSITION_TIMINGS.oceanNav.surfaceExitMs, 420, 3600),
                // 首页重新显现出来的时长。
                surfaceEnterMs: readTimingNumber(oceanNavSource.surfaceEnterMs, DEFAULT_TRANSITION_TIMINGS.oceanNav.surfaceEnterMs, 320, 3200),
                // 首页与行程页之间真正触发跳转前的预留时差。
                navigateLeadMs: readTimingNumber(oceanNavSource.navigateLeadMs, DEFAULT_TRANSITION_TIMINGS.oceanNav.navigateLeadMs, 80, 860),
                // 海层导航专用的遮罩加深量。
                overlayBoost: readTimingNumber(oceanNavSource.overlayBoost, DEFAULT_TRANSITION_TIMINGS.oceanNav.overlayBoost, 0, 0.45),
                // 浏览器恢复页面时的海层遮罩加强量。
                pageshowOverlayBoost: readTimingNumber(oceanNavSource.pageshowOverlayBoost, DEFAULT_TRANSITION_TIMINGS.oceanNav.pageshowOverlayBoost, 0, 0.35)
            })
        });
    }

    const TRANSITION_TIMINGS = resolveTransitionTimingConfig(
        window.YANQI_DEPTH_TRANSITION_CONFIG || window.YanqiDepthTransitionConfig || null
    );
    const TRANSITION = TRANSITION_TIMINGS.general;
    const LOGIN_HOME_SPECIAL = TRANSITION_TIMINGS.loginHome;
    const OCEAN_NAV = TRANSITION_TIMINGS.oceanNav;

    // 基础数学与路径工具：负责数值约束、URL 解析、页面识别和深度方向判断。
    /**
     * clamp(value, min, max) - 将数值限制在指定区间内
     * @param {number} value - 原始数值
     * @param {number} min - 区间最小值
     * @param {number} max - 区间最大值
     * @returns {number} - 限制后的数值
     */
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * randomBetween(min, max) - 生成指定区间内的随机数
     * @param {number} min - 区间最小值
     * @param {number} max - 区间最大值
     * @returns {number} - 生成的随机数
     */
    function randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }

    /**
     * getNavigationEntryType() - 读取当前文档的导航进入类型
     * @returns {string} - 浏览器记录的 navigation type
     */
    function getNavigationEntryType() {
        const [navigationEntry] = performance.getEntriesByType('navigation');
        return navigationEntry && navigationEntry.type ? navigationEntry.type : 'navigate';
    }

    /**
     * easeInOutCubic(value) - 计算三次缓入缓出的动画进度
     * @param {number} value - 原始动画进度
     * @returns {number} - 缓动后的进度值
     */
    function easeInOutCubic(value) {
        return value < 0.5
            ? 4 * value * value * value
            : 1 - Math.pow(-2 * value + 2, 3) / 2;
    }

    /**
     * readNumber(value) - 安全读取并转换数值
     * @param {*} value - 待转换的原始值
     * @returns {number|null} - 可用数值或空值
     */
    function readNumber(value) {
        if (value === null || value === undefined || value === '') {
            return null;
        }

        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    /**
     * parseUrl(rawUrl) - 解析目标地址为 URL 对象
     * @param {string} rawUrl - 原始地址字符串
     * @returns {URL|null} - 解析后的 URL 对象或空值
     */
    function parseUrl(rawUrl) {
        try {
            return new URL(rawUrl, window.location.href);
        } catch (error) {
            return null;
        }
    }

    /**
     * getPageIdFromPath(pathname) - 根据路径识别当前页面类型
     * @param {string} pathname - 当前页面路径
     * @returns {string|null} - 页面标识或空值
     */
    function getPageIdFromPath(pathname) {
        const fileName = (pathname.split('/').pop() || 'index.html').toLowerCase();

        if (fileName === '' || fileName === 'index.html') {
            return 'login';
        }

        if (fileName === 'home.html') {
            return 'home';
        }

        if (fileName === 'contact.html') {
            return 'contact';
        }

        if (fileName === 'terms.html') {
            return 'terms';
        }

        if (fileName === 'privacy.html') {
            return 'privacy';
        }

        if (fileName === 'trip.html') {
            return 'trip';
        }

        if (fileName === 'detail.html') {
            return 'detail';
        }

        return null;
    }

    /**
     * getPageIdFromUrl(rawUrl) - 根据链接地址识别目标页面类型
     * @param {string} rawUrl - 原始链接地址
     * @returns {string|null} - 页面标识或空值
     */
    function getPageIdFromUrl(rawUrl) {
        if (!rawUrl || rawUrl.startsWith('#') || rawUrl.startsWith('javascript:')) {
            return null;
        }

        const parsedUrl = parseUrl(rawUrl);
        if (!parsedUrl || parsedUrl.origin !== window.location.origin) {
            return null;
        }

        return getPageIdFromPath(parsedUrl.pathname);
    }

    /**
     * getTargetDepthByPage(pageId) - 获取指定页面的目标深度层级
     * @param {string} pageId - 页面标识
     * @returns {number} - 该页面对应的目标深度
     */
    function getTargetDepthByPage(pageId) {
        if (!pageId || !Object.prototype.hasOwnProperty.call(PAGE_DEPTH_MAP, pageId)) {
            return 0;
        }

        return PAGE_DEPTH_MAP[pageId];
    }

    /**
     * getVisualDirection(fromDepth, toDepth) - 判断深度变化对应的视觉方向
     * @param {number} fromDepth - 起始深度
     * @param {number} toDepth - 目标深度
     * @returns {string} - forward、backward 或 none
     */
    function getVisualDirection(fromDepth, toDepth) {
        if (toDepth < fromDepth) {
            return 'forward';
        }

        if (toDepth > fromDepth) {
            return 'backward';
        }

        return 'none';
    }

    /**
     * getAmbientOverlayOpacity(depth) - 根据当前深度计算环境覆盖层透明度
     * @param {number} depth - 当前深度值
     * @returns {number} - 覆盖层基础透明度
     */
    function getAmbientOverlayOpacity(depth) {
        const progress = clamp(Math.abs(depth) / Math.abs(MIN_DEPTH), 0, 1);
        return 0.02 + progress * 0.24;
    }

    /**
     * getOceanNavConfig(fromPage, toPage) - 获取首页与行程页之间的专用导航过渡配置
     * @param {string} fromPage - 来源页面标识
     * @param {string} toPage - 目标页面标识
     * @returns {Object|null} - 过渡配置对象或空值
     */
    function getOceanNavConfig(fromPage, toPage) {
        if (fromPage === 'home' && toPage === 'trip') {
            return {
                navTransition: NAV_TRANSITION_OCEAN,
                exitClass: 'page-ocean-dive-exit',
                entryClass: 'page-ocean-dive-enter',
                exitDuration: OCEAN_NAV.diveExitMs,
                entryDuration: OCEAN_NAV.diveEnterMs,
                overlayBoost: OCEAN_NAV.overlayBoost,
                navigateLeadMs: OCEAN_NAV.navigateLeadMs,
                pageshowOverlayBoost: OCEAN_NAV.pageshowOverlayBoost
            };
        }

        if (fromPage === 'trip' && toPage === 'home') {
            return {
                navTransition: NAV_TRANSITION_OCEAN,
                exitClass: 'page-ocean-surface-exit',
                entryClass: 'page-ocean-surface-enter',
                exitDuration: OCEAN_NAV.surfaceExitMs,
                entryDuration: OCEAN_NAV.surfaceEnterMs,
                overlayBoost: OCEAN_NAV.overlayBoost,
                navigateLeadMs: OCEAN_NAV.navigateLeadMs,
                pageshowOverlayBoost: OCEAN_NAV.pageshowOverlayBoost
            };
        }

        return null;
    }

    /**
     * getDefaultTransitionConfig(visualDirection) - 获取常规页面切换的默认过渡配置
     * @param {string} visualDirection - 当前切换方向
     * @returns {Object} - 默认过渡配置对象
     */
    function getDefaultTransitionConfig(visualDirection) {
        return {
            navTransition: null,
            exitClass: visualDirection === 'forward' ? 'page-exit-up' : 'page-exit-down',
            entryClass: visualDirection === 'forward' ? 'page-enter-from-bottom' : 'page-enter-from-top',
            exitDuration: TRANSITION.exitPageMs,
            entryDuration: TRANSITION.enterPageMs,
            overlayBoost: TRANSITION.overlayBoost,
            navigateLeadMs: TRANSITION.exitNavigateLeadMs,
            pageshowOverlayBoost: TRANSITION.pageshowOverlayBoost
        };
    }

    /**
     * getPageshowTransitionConfig(pageId, visualDirection) - 获取浏览器恢复页面时的入场配置
     * @param {string} pageId - 当前页面标识
     * @param {string} visualDirection - 当前切换方向
     * @returns {Object} - pageshow 入场配置对象
     */
    function getPageshowTransitionConfig(pageId, visualDirection) {
        if (pageId === 'trip' && visualDirection === 'forward') {
            return {
                entryClass: 'page-ocean-dive-enter',
                entryDuration: OCEAN_NAV.diveEnterMs,
                overlayBoostStart: OCEAN_NAV.pageshowOverlayBoost
            };
        }

        if (pageId === 'home' && visualDirection === 'backward') {
            return {
                entryClass: 'page-ocean-surface-enter',
                entryDuration: OCEAN_NAV.surfaceEnterMs,
                overlayBoostStart: OCEAN_NAV.pageshowOverlayBoost
            };
        }

        return {
            entryClass: visualDirection === 'forward' ? 'page-enter-from-bottom' : 'page-enter-from-top',
            entryDuration: TRANSITION.enterPageMs + 40,
            overlayBoostStart: TRANSITION.pageshowOverlayBoost
        };
    }

    /**
     * parseNavState() - 解析 sessionStorage 中记录的跨页面导航状态
     * @returns {Object|null} - 解析后的导航状态对象或空值
     */
    function parseNavState() {
        const raw = sessionStorage.getItem(STORAGE_KEY_NAV);
        if (!raw) {
            return null;
        }

        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return null;
            }

            const fromDepth = readNumber(parsed.fromDepth);
            const toDepth = readNumber(parsed.toDepth);

            if (fromDepth === null || toDepth === null) {
                return null;
            }

            return {
                fromPage: parsed.fromPage || null,
                toPage: parsed.toPage || null,
                fromDepth: clamp(fromDepth, MIN_DEPTH, MAX_DEPTH),
                toDepth: clamp(toDepth, MIN_DEPTH, MAX_DEPTH),
                visualDirection: parsed.visualDirection || getVisualDirection(fromDepth, toDepth),
                overlayBoost: clamp(readNumber(parsed.overlayBoost) ?? TRANSITION.overlayBoost, 0, 0.45),
                specialTransition: parsed.specialTransition || null,
                specialBlueOpacity: clamp(readNumber(parsed.specialBlueOpacity) ?? LOGIN_HOME_SPECIAL.blueOpacity, 0, 0.92),
                navTransition: parsed.navTransition || null,
                entryClass: parsed.entryClass || null,
                entryDuration: readNumber(parsed.entryDuration),
                depthDuration: readNumber(parsed.depthDuration),
                animatedOnSource: Boolean(parsed.animatedOnSource),
                continueDepthOnEntry: Boolean(parsed.continueDepthOnEntry),
                entryStartDepth: clamp(
                    readNumber(parsed.entryStartDepth) ?? fromDepth,
                    MIN_DEPTH,
                    MAX_DEPTH
                ),
                at: readNumber(parsed.at) ?? 0
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * consumePendingHomeEntryDepth(targetUrl) - 读取并消费跨页回首页时的一次性目标深度
     * @param {URL} targetUrl - 当前准备跳转到的目标 URL
     * @returns {number|null} - 需要覆盖首页默认入场深度的值
     */
    function consumePendingHomeEntryDepth(targetUrl) {
        if (!targetUrl || getPageIdFromPath(targetUrl.pathname) !== 'home') {
            return null;
        }

        const raw = sessionStorage.getItem(STORAGE_KEY_HOME_ENTRY_DEPTH);
        if (!raw) {
            return null;
        }

        sessionStorage.removeItem(STORAGE_KEY_HOME_ENTRY_DEPTH);

        try {
            const parsed = JSON.parse(raw);
            const target = typeof parsed?.target === 'string' ? parsed.target : '';
            const depth = readNumber(parsed?.depth);
            const hash = targetUrl.hash || '';

            if (!target || target !== hash || depth === null) {
                return null;
            }

            return clamp(depth, MIN_DEPTH, MAX_DEPTH);
        } catch (error) {
            return null;
        }
    }

    /**
     * readIncomingDetailSwapState() - 判断当前详情页是否正承接相关推荐切页进入
     * @returns {{fromId:number,toId:number,at:number}|null} - 当前详情页可用的相关推荐切页状态
     */
    function readIncomingDetailSwapState() {
        if (getPageIdFromPath(window.location.pathname) !== 'detail') {
            return null;
        }

        const spotId = Number(new URL(window.location.href).searchParams.get('id'));
        if (!Number.isFinite(spotId)) {
            return null;
        }

        const raw = sessionStorage.getItem(DETAIL_SWAP_STORAGE_KEY);
        if (!raw) {
            return null;
        }

        try {
            const parsed = JSON.parse(raw);
            const fromId = Number(parsed.fromId);
            const toId = Number(parsed.toId);
            const at = Number(parsed.at);
            const forwardConsumed = Boolean(parsed.forwardConsumed);

            if (!Number.isFinite(fromId) || !Number.isFinite(toId) || !Number.isFinite(at)) {
                return null;
            }

            if (forwardConsumed || toId !== spotId || Date.now() - at > DETAIL_SWAP_MAX_AGE_MS) {
                return null;
            }

            return { fromId, toId, at };
        } catch (error) {
            return null;
        }
    }

    // 导航拦截基础判断：过滤新标签、下载链接、组合键等不应接管的点击。
    /**
     * shouldInterceptAnchorClick(event, anchor) - 判断当前链接点击是否应由深度管理器接管
     * @param {MouseEvent} event - 点击事件对象
     * @param {HTMLAnchorElement} anchor - 当前链接元素
     * @returns {boolean} - 是否应该接管该次点击
     */
    function shouldInterceptAnchorClick(event, anchor) {
        if (event.defaultPrevented) {
            return false;
        }

        if (event.button !== 0) {
            return false;
        }

        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return false;
        }

        if (anchor.target && anchor.target.toLowerCase() !== '_self') {
            return false;
        }

        if (anchor.hasAttribute('download')) {
            return false;
        }

        return true;
    }

    /**
     * formatDepth(depth) - 将深度数值格式化为带单位的文本
     * @param {number} depth - 当前深度值
     * @returns {string} - 格式化后的深度文本
     */
    function formatDepth(depth, options = {}) {
        const shouldUseAbsolute = Boolean(options.absolute);
        const displayValue = shouldUseAbsolute ? Math.abs(depth) : depth;
        return `${Math.round(displayValue)}m`;
    }

    // 主控制器：负责初始化深度计、拦截导航、播放入场离场动画，并在 pageshow 时恢复状态。
    class DepthManager {
        /**
         * constructor() - 初始化深度管理器的页面状态、DOM 引用和首次入场逻辑
         */
        constructor() {
            this.pageId = getPageIdFromPath(window.location.pathname) || 'login';
            this.targetDepth = getTargetDepthByPage(this.pageId);
            this.currentDepth = this.targetDepth;
            this.overlayBoost = 0;
            this.isNavigating = false;

            this.depthAnimationId = 0;
            this.overlayAnimationId = 0;
            this.specialBlueAnimationId = 0;
            this.interactionAnimationId = 0;
            this.cleanupTimerId = 0;
            this.navigateTimerId = 0;
            this.interactionResetTimerId = 0;
            this.specialTransitionMode = null;
            this.specialTimers = [];
            // 页面滚动深度状态：记录当前页面的区块停靠点、是否已启用滚动联动，以及当前缓动目标。
            this.pageScrollDepthStops = [];
            this.pageScrollDepthEnabled = false;
            this.pageScrollFrameId = 0;
            this.pageScrollSyncTimerId = 0;
            this.pageScrollTargetDepth = null;
            this.pageStateDepthObserver = null;
            this.pageStateDepthRules = [];
            this.homeDiveMatchDepth = null;
            this.detailGaugeProfile = this.pageId === 'detail'
                ? { ...DETAIL_GAUGE_DEFAULT_PROFILE }
                : null;
            this.detailGaugeStepSize = null;
            this.detailGaugeLayoutReady = false;

            this.rootElement = document.documentElement;
            this.body = document.body;
            this.pageStage = document.getElementById('pageStage');
            this.overlayElement = document.getElementById('pageTransitionOverlay');
            this.leftMarkersContainer = document.getElementById('leftGaugeMarkers');
            this.rightMarkersContainer = document.getElementById('rightGaugeMarkers');
            this.leftCurrent = document.getElementById('leftGaugeCurrent');
            this.rightCurrent = document.getElementById('rightGaugeCurrent');
            this.bubbleContainer = null;

            this.ensureSpecialOverlayLayers();
            this.buildMarkersIfNeeded();
            this.refreshDetailGaugeViewportLayout();
            this.setupGaugeViewportSync();

            const incomingState = this.consumeIncomingNavState();
            if (incomingState && incomingState.specialTransition === SPECIAL_TRANSITION_LOGIN_HOME) {
                this.currentDepth = incomingState.toDepth;
                this.overlayBoost = incomingState.overlayBoost;
                this.renderDepth(this.currentDepth);
                this.startLoginHomeEntryTransition(incomingState);
                // 登录页专用过渡结束后，再把首页深度交给滚动 section 接管，避免刚入场就和滚动逻辑抢状态。
                if (this.pageId === 'home') {
                    this.schedulePageScrollDepthSync(LOGIN_HOME_SPECIAL.entryMs + 200);
                }
            } else if (incomingState && incomingState.animatedOnSource) {
                const shouldContinueDepthOnEntry = Boolean(
                    incomingState.continueDepthOnEntry
                    && Math.abs(incomingState.entryStartDepth - incomingState.toDepth) > 0.05
                );
                this.currentDepth = shouldContinueDepthOnEntry
                    ? incomingState.entryStartDepth
                    : incomingState.toDepth;
                this.overlayBoost = incomingState.overlayBoost;
                this.renderDepth(this.currentDepth);
                this.startEntryTransition(incomingState.visualDirection, {
                    animateDepth: shouldContinueDepthOnEntry,
                    entryClass: incomingState.entryClass,
                    startDepth: incomingState.entryStartDepth,
                    targetDepth: incomingState.toDepth,
                    overlayBoostStart: incomingState.overlayBoost,
                    duration: incomingState.entryDuration,
                    depthDuration: incomingState.depthDuration
                });
                // 进入带滚动深度的页面时，也等通用入场动画收完，再把后续深浅变化交给页面内部区块。
                if (this.hasScrollDepthConfig()) {
                    this.schedulePageScrollDepthSync((readNumber(incomingState.entryDuration) ?? TRANSITION.enterPageMs) + 200);
                }
            } else {
                this.overlayBoost = 0;
                const incomingDetailSwapState = this.pageId === 'detail'
                    ? readIncomingDetailSwapState()
                    : null;
                if (this.pageId === 'login') {
                    const initialLoginDepth = clamp(this.targetDepth - 3, MIN_DEPTH, MAX_DEPTH);
                    this.currentDepth = initialLoginDepth;
                    this.renderDepth(initialLoginDepth);
                    this.animateDepth(initialLoginDepth, this.targetDepth, 860);
                } else if (this.pageId === 'home') {
                    const initialHomeDepth = 0;
                    this.currentDepth = initialHomeDepth;
                    this.renderDepth(initialHomeDepth);
                    window.setTimeout(() => {
                        if (this.isNavigating || this.pageId !== 'home' || this.depthAnimationId) {
                            return;
                        }

                        this.animateDepth(initialHomeDepth, this.targetDepth, 1680);
                    }, 180);
                    // 首次直接进入首页时，先完成 0m -> 首页浅层深度的入场，再启动滚动驱动的继续下潜。
                    this.schedulePageScrollDepthSync(2060);
                } else if (incomingDetailSwapState && getNavigationEntryType() === 'navigate') {
                    const storedDepth = readNumber(sessionStorage.getItem(STORAGE_KEY_CURRENT));
                    const startDepth = clamp(storedDepth ?? MIN_DEPTH, MIN_DEPTH, MAX_DEPTH);

                    if (Math.abs(startDepth - this.targetDepth) > 0.05) {
                        this.currentDepth = startDepth;
                        this.renderDepth(startDepth);
                        this.animateDepth(startDepth, this.targetDepth, 860);

                        if (this.hasScrollDepthConfig()) {
                            this.schedulePageScrollDepthSync(1040);
                        }
                    } else {
                        this.finishDepth(this.targetDepth);
                        if (this.hasScrollDepthConfig()) {
                            this.schedulePageScrollDepthSync(140);
                        }
                    }
                } else {
                    this.finishDepth(this.targetDepth);
                    if (this.hasScrollDepthConfig()) {
                        this.schedulePageScrollDepthSync(140);
                    }
                }
            }

            this.setupPageScrollDepth();
            this.setupPageStateDepthObserver();
            this.setupPageShowHandler();
            this.setupSpecialTransitionAbortHandler();
            this.bindTrackedLinks();
        }

        // 特殊遮罩层准备：为登录页到首页的蓝层和气泡动画补齐需要的 DOM 结构。
        /**
         * ensureSpecialOverlayLayers() - 确保特殊过渡所需的气泡容器已存在
         * @returns {void} - 无返回值，直接补齐遮罩层结构
         */
        ensureSpecialOverlayLayers() {
            if (!this.overlayElement || this.overlayElement.querySelector('.page-transition-bubbles')) {
                this.bubbleContainer = this.overlayElement
                    ? this.overlayElement.querySelector('.page-transition-bubbles')
                    : null;
                return;
            }

            const bubbleContainer = document.createElement('div');
            bubbleContainer.className = 'page-transition-bubbles';
            bubbleContainer.setAttribute('aria-hidden', 'true');
            this.overlayElement.appendChild(bubbleContainer);
            this.bubbleContainer = bubbleContainer;
        }

        /**
         * setupGaugeViewportSync() - 在窗口尺寸变化时同步深度计滚动带布局，保证所有页面都使用同一观察位
         * @returns {void} - 无返回值，直接注册全站深度计布局同步
         */
        setupGaugeViewportSync() {
            window.addEventListener('resize', () => {
                this.refreshDetailGaugeViewportLayout();
                this.renderDepth(this.currentDepth);
            }, { passive: true });
        }

        /**
         * isDetailGaugeMode() - 判断当前页面是否启用了详情页滚动刻度带模式
         * @returns {boolean} - 是否为详情页滚动刻度带模式
         */
        isDetailGaugeMode() {
            return this.pageId === 'detail';
        }

        /**
         * getGaugeDepthBounds() - 获取当前页面深度计可视刻度带的上下界
         * @returns {{maxDepth:number,minDepth:number}} - 当前页面刻度带的深度范围
         */
        getGaugeDepthBounds() {
            if (this.isDetailGaugeMode()) {
                return {
                    maxDepth: 0,
                    minDepth: -(this.detailGaugeProfile?.gaugeMaxDepth || DETAIL_GAUGE_DEFAULT_MAX_DEPTH)
                };
            }

            return {
                maxDepth: MAX_DEPTH,
                minDepth: getPageGaugeVisualMinDepth(this.pageId)
            };
        }

        /**
         * formatGaugeMarkerLabel(depth) - 根据当前页面模式生成刻度标签文案
         * @param {number} depth - 当前刻度深度值
         * @returns {string} - 当前刻度对应的标签文本
         */
        formatGaugeMarkerLabel(depth) {
            return `${depth}m`;
        }

        /**
         * getDetailGaugeStepSize() - 读取当前页面滚动刻度带每 1m 对应的视觉步长
         * @returns {number} - 当前深度计刻度步长像素值
         */
        getDetailGaugeStepSize() {
            if (this.detailGaugeLayoutReady && Number.isFinite(this.detailGaugeStepSize)) {
                return clamp(this.detailGaugeStepSize, DETAIL_GAUGE_STEP_SIZE_MIN, DETAIL_GAUGE_STEP_SIZE_MAX);
            }

            this.detailGaugeStepSize = this.measureDetailGaugeStepSize();
            return this.detailGaugeStepSize;
        }

        /**
         * measureDetailGaugeStepSize() - 计算当前页面刻度带每 1m 的视觉步距，让全站深度计拥有一致的舒展节奏
         * @returns {number} - 当前应使用的详情页刻度步距
         */
        measureDetailGaugeStepSize() {
            const referenceContainer = [this.leftMarkersContainer, this.rightMarkersContainer]
                .find((container) => container && container.clientHeight > 0);

            if (referenceContainer) {
                const visibleRange = Math.abs(MIN_DEPTH) + 2;
                const derivedStep = referenceContainer.clientHeight / Math.max(visibleRange, 1);
                return clamp(derivedStep, DETAIL_GAUGE_STEP_SIZE_MIN, DETAIL_GAUGE_STEP_SIZE_MAX);
            }

            if (!this.body) {
                return DETAIL_GAUGE_STEP_SIZE_FALLBACK;
            }

            const rawValue = window.getComputedStyle(this.body).getPropertyValue('--depth-gauge-step-size');
            return clamp(
                parseFloat(rawValue) || DETAIL_GAUGE_STEP_SIZE_FALLBACK,
                DETAIL_GAUGE_STEP_SIZE_MIN,
                DETAIL_GAUGE_STEP_SIZE_MAX
            );
        }

        /**
         * getRenderedGaugeDepth(depth) - 把逻辑深度转换为当前深度计真正需要渲染的刻度深度
         * @param {number} depth - 页面逻辑深度
         * @returns {number} - 用于刻度高亮与滚动带平移的渲染深度
         */
        getRenderedGaugeDepth(depth) {
            const safeDepth = clamp(depth, MIN_DEPTH, MAX_DEPTH);
            if (!this.isDetailGaugeMode()) {
                return safeDepth;
            }

            return -this.getDetailGaugeDisplayDepth(safeDepth);
        }

        /**
         * getDetailLogicalRange() - 获取详情页逻辑滚动深度的起止范围
         * @returns {{start:number,end:number}} - 详情页逻辑深度映射区间
         */
        getDetailLogicalRange() {
            const detailStops = getScrollDepthStopConfig('detail');
            const startDepth = detailStops[0]?.depth ?? PAGE_DEPTH_MAP.detail;
            const endDepth = detailStops[detailStops.length - 1]?.depth ?? MIN_DEPTH;

            return {
                start: startDepth,
                end: endDepth
            };
        }

        /**
         * getDetailGaugeDisplayDepth(logicalDepth) - 把详情页逻辑深度映射为真实潜深显示值
         * @param {number} logicalDepth - 当前详情页逻辑深度
         * @returns {number} - 对应的详情页显示深度
         */
        getDetailGaugeDisplayDepth(logicalDepth) {
            const profile = this.detailGaugeProfile || DETAIL_GAUGE_DEFAULT_PROFILE;
            const { start, end } = this.getDetailLogicalRange();
            // 详情页内部继续下潜时，用更深的代表海层放大变化；
            // 但当用户离开详情页上浮到别的页面时，直接回接逻辑深度，
            // 这样 trip -> home / detail 的深度动画就不会在 30m 附近被截断。
            if (logicalDepth > start) {
                return clamp(Math.abs(logicalDepth), 0, profile.gaugeMaxDepth);
            }

            const progress = Math.abs(end - start) < 0.001
                ? 0
                : clamp((logicalDepth - start) / (end - start), 0, 1);

            return clamp(
                profile.focusDepth + (profile.deepDepth - profile.focusDepth) * progress,
                0,
                profile.gaugeMaxDepth
            );
        }

        /**
         * refreshDetailGaugeViewportLayout() - 刷新当前页面滚动刻度带的顶部和底部留白，确保当前层级停在统一观察位
         * @returns {void} - 无返回值，直接同步滚动刻度带布局
         */
        refreshDetailGaugeViewportLayout() {
            this.detailGaugeLayoutReady = false;
            this.detailGaugeStepSize = this.getDetailGaugeStepSize();
            if (this.body) {
                this.body.style.setProperty('--depth-gauge-step-size', `${this.detailGaugeStepSize.toFixed(2)}px`);
            }

            let didSyncLayout = false;
            [this.leftMarkersContainer, this.rightMarkersContainer].forEach((container) => {
                didSyncLayout = this.syncDetailGaugeContainerLayout(container) || didSyncLayout;
            });

            this.detailGaugeLayoutReady = didSyncLayout;
        }

        /**
         * syncDetailGaugeContainerLayout(container) - 同步单侧深度计刻度带的上下留白高度
         * @param {HTMLElement|null} container - 单侧深度计刻度容器
         * @returns {boolean} - 当前容器是否成功完成布局同步
         */
        syncDetailGaugeContainerLayout(container) {
            if (!container) {
                return false;
            }

            const tape = container.querySelector('.gauge-scale-tape');
            const topSpacer = tape?.querySelector('.gauge-scale-spacer-top');
            const bottomSpacer = tape?.querySelector('.gauge-scale-spacer-bottom');
            if (!tape || !topSpacer || !bottomSpacer) {
                return false;
            }

            const viewportHeight = container.clientHeight || 0;
            if (!viewportHeight) {
                return false;
            }

            const stepSize = this.getDetailGaugeStepSize();
            const focusY = viewportHeight * DETAIL_GAUGE_FOCUS_RATIO;
            const topSpacerHeight = Math.max(focusY - stepSize / 2, 0);
            const bottomSpacerHeight = Math.max(viewportHeight - focusY - stepSize / 2, 0);

            topSpacer.style.height = `${topSpacerHeight.toFixed(2)}px`;
            bottomSpacer.style.height = `${bottomSpacerHeight.toFixed(2)}px`;
            return true;
        }

        /**
         * updateDetailGaugeTapePosition(container, currentDepth) - 平移当前页面刻度带，让当前深度经过统一的固定海层观察位
         * @param {HTMLElement|null} container - 单侧深度计刻度容器
         * @param {number} currentDepth - 当前应显示的刻度深度
         * @returns {void} - 无返回值，直接更新刻度带 transform
         */
        updateDetailGaugeTapePosition(container, currentDepth) {
            if (!container) {
                return;
            }

            if (!this.detailGaugeLayoutReady) {
                this.refreshDetailGaugeViewportLayout();
            }

            const tape = container.querySelector('.gauge-scale-tape');
            if (!tape) {
                return;
            }

            const stepSize = this.getDetailGaugeStepSize();
            const offset = -Math.abs(currentDepth) * stepSize;
            tape.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
        }

        // 刻度初始化：在左右两侧深度计容器中生成完整刻度，保证跨页面样式一致。
        /**
         * buildMarkersIfNeeded() - 在左右深度计容器中初始化刻度结构
         * @returns {void} - 无返回值，直接生成刻度 DOM
         */
        buildMarkersIfNeeded() {
            if (!this.leftMarkersContainer || !this.rightMarkersContainer) {
                sessionStorage.setItem(STORAGE_KEY_CURRENT, String(this.targetDepth));
                return;
            }

            this.detailGaugeLayoutReady = false;
            this.buildMarkers(this.leftMarkersContainer, 'left');
            this.buildMarkers(this.rightMarkersContainer, 'right');
        }

        // 入场状态消费：读取上一个页面写入的导航状态，并校验目标页和时效性。
        /**
         * consumeIncomingNavState() - 读取并消费进入当前页的导航状态
         * @returns {Object|null} - 可用的导航状态对象或空值
         */
        consumeIncomingNavState() {
            const navState = parseNavState();
            sessionStorage.removeItem(STORAGE_KEY_NAV);

            if (!navState) {
                return null;
            }

            if (navState.toPage !== this.pageId) {
                return null;
            }

            if (navState.at && Date.now() - navState.at > TRANSITION.navFreshMs) {
                return null;
            }

            return navState;
        }

        // 刻度渲染：按 0 到最深层的步长生成刻度线和数字标签。
        /**
         * buildMarkers(container, side) - 为指定深度计容器生成刻度线和数字
         * @param {HTMLElement} container - 刻度容器元素
         * @param {string} side - 当前深度计所在侧边
         * @returns {void} - 无返回值，直接写入刻度 DOM
         */
        buildMarkers(container, side) {
            const fragment = document.createDocumentFragment();
            const gaugeBounds = this.getGaugeDepthBounds();

            for (let depth = gaugeBounds.maxDepth; depth >= gaugeBounds.minDepth; depth -= STEP) {
                const marker = document.createElement('div');
                const isMajor = Math.abs(depth) % 10 === 0;
                const isMedium = !isMajor && Math.abs(depth) % 5 === 0;
                marker.className = `depth-marker${isMajor ? ' major' : ''}${isMedium ? ' medium' : ''}`;
                marker.dataset.depth = String(depth);

                const line = document.createElement('span');
                line.className = 'depth-marker-line';

                if (side === 'left') {
                    marker.appendChild(line);
                }

                if (isMajor) {
                    const label = document.createElement('span');
                    label.className = 'depth-marker-label';
                    label.textContent = this.formatGaugeMarkerLabel(depth);

                    marker.appendChild(label);
                }

                if (side === 'right') {
                    if (isMajor) {
                        marker.insertBefore(marker.lastChild, marker.firstChild);
                    }
                    marker.appendChild(line);
                }

                fragment.appendChild(marker);
            }

            const tape = document.createElement('div');
            tape.className = 'gauge-scale-tape';
            const topSpacer = document.createElement('div');
            topSpacer.className = 'gauge-scale-spacer gauge-scale-spacer-top';

            const bottomSpacer = document.createElement('div');
            bottomSpacer.className = 'gauge-scale-spacer gauge-scale-spacer-bottom';

            tape.appendChild(topSpacer);
            tape.appendChild(fragment);
            tape.appendChild(bottomSpacer);

            container.innerHTML = '';
            container.appendChild(tape);
        }

        // 动画清理：统一停止当前深度、覆盖层、交互 wobble 和特殊登录过渡。
        /**
         * cancelActiveAnimations() - 停止当前所有正在执行的深度与过渡动画
         * @returns {void} - 无返回值，直接清理动画句柄和状态
         */
        cancelActiveAnimations() {
            if (this.depthAnimationId) {
                cancelAnimationFrame(this.depthAnimationId);
                this.depthAnimationId = 0;
            }

            if (this.overlayAnimationId) {
                cancelAnimationFrame(this.overlayAnimationId);
                this.overlayAnimationId = 0;
            }

            if (this.specialBlueAnimationId) {
                cancelAnimationFrame(this.specialBlueAnimationId);
                this.specialBlueAnimationId = 0;
            }

            if (this.interactionAnimationId) {
                cancelAnimationFrame(this.interactionAnimationId);
                this.interactionAnimationId = 0;
            }

            if (this.interactionResetTimerId) {
                window.clearTimeout(this.interactionResetTimerId);
                this.interactionResetTimerId = 0;
            }

            this.body.classList.remove('depth-gauge-interactive');

            this.clearSpecialTimers();

            if (this.cleanupTimerId) {
                window.clearTimeout(this.cleanupTimerId);
                this.cleanupTimerId = 0;
            }

            if (this.pageScrollFrameId) {
                cancelAnimationFrame(this.pageScrollFrameId);
                this.pageScrollFrameId = 0;
            }

            if (this.pageScrollSyncTimerId) {
                window.clearTimeout(this.pageScrollSyncTimerId);
                this.pageScrollSyncTimerId = 0;
            }
        }

        // 通用数值动画：供深度、覆盖层、特殊蓝层等连续变化复用同一套补间逻辑。
        /**
         * animateValue(key, from, to, duration, onUpdate, onComplete) - 执行通用数值补间动画
         * @param {string} key - 动画帧句柄存储键名
         * @param {number} from - 起始值
         * @param {number} to - 目标值
         * @param {number} duration - 动画时长
         * @param {Function} onUpdate - 每帧更新回调
         * @param {Function} onComplete - 动画完成回调
         * @returns {Promise<void>} - 动画结束时返回的 Promise
         */
        animateValue(key, from, to, duration, onUpdate, onComplete) {
            if (this[key]) {
                cancelAnimationFrame(this[key]);
                this[key] = 0;
            }

            const totalDuration = clamp(duration, 120, 2200);
            if (Math.abs(to - from) < 0.001) {
                onUpdate(to);
                if (typeof onComplete === 'function') {
                    onComplete();
                }
                return Promise.resolve();
            }

            return new Promise((resolve) => {
                const startedAt = performance.now();

                const tick = (timestamp) => {
                    const progress = clamp((timestamp - startedAt) / totalDuration, 0, 1);
                    const nextValue = from + (to - from) * easeInOutCubic(progress);

                    onUpdate(nextValue);

                    if (progress < 1) {
                        this[key] = requestAnimationFrame(tick);
                        return;
                    }

                    this[key] = 0;
                    onUpdate(to);
                    if (typeof onComplete === 'function') {
                        onComplete();
                    }
                    resolve();
                };

                this[key] = requestAnimationFrame(tick);
            });
        }

        // 深度与覆盖层动画：分别更新数字刻度和海水覆盖强度，并写入当前深度状态。
        /**
         * animateDepth(startDepth, targetDepth, duration) - 平滑更新深度计当前深度
         * @param {number} startDepth - 起始深度
         * @param {number} targetDepth - 目标深度
         * @param {number} duration - 动画时长
         * @returns {Promise<void>} - 动画结束时返回的 Promise
         */
        animateDepth(startDepth, targetDepth, duration) {
            const from = clamp(startDepth, MIN_DEPTH, MAX_DEPTH);
            const to = clamp(targetDepth, MIN_DEPTH, MAX_DEPTH);

            return this.animateValue(
                'depthAnimationId',
                from,
                to,
                duration,
                (value) => {
                    this.currentDepth = clamp(value, MIN_DEPTH, MAX_DEPTH);
                    this.renderDepth(this.currentDepth);
                },
                () => {
                    this.currentDepth = to;
                    this.renderDepth(this.currentDepth);
                    sessionStorage.setItem(STORAGE_KEY_CURRENT, String(Math.round(this.currentDepth)));
                }
            );
        }

        /**
         * animateOverlayBoost(startBoost, targetBoost, duration) - 平滑更新海水覆盖层增强值
         * @param {number} startBoost - 起始覆盖增强值
         * @param {number} targetBoost - 目标覆盖增强值
         * @param {number} duration - 动画时长
         * @returns {Promise<void>} - 动画结束时返回的 Promise
         */
        animateOverlayBoost(startBoost, targetBoost, duration) {
            const from = clamp(startBoost, 0, 0.45);
            const to = clamp(targetBoost, 0, 0.45);

            return this.animateValue(
                'overlayAnimationId',
                from,
                to,
                duration,
                (value) => {
                    this.overlayBoost = clamp(value, 0, 0.45);
                    this.setOverlayState(this.currentDepth, this.overlayBoost);
                },
                () => {
                    this.overlayBoost = to;
                    this.setOverlayState(this.currentDepth, this.overlayBoost);
                }
            );
        }

        /**
         * setOverlayState(depth, boost) - 按当前深度和增强值同步页面海水覆盖层状态
         * @param {number} depth - 当前深度
         * @param {number} boost - 覆盖层增强值
         * @returns {void} - 无返回值，直接设置 CSS 变量
         */
        setOverlayState(depth, boost) {
            const safeDepth = clamp(depth, MIN_DEPTH, MAX_DEPTH);
            const depthProgress = clamp(Math.abs(safeDepth) / Math.abs(MIN_DEPTH), 0, 1);
            const baseOpacity = getAmbientOverlayOpacity(safeDepth);
            const extraOpacity = clamp(boost, 0, 0.45);

            this.rootElement.style.setProperty('--ocean-base-opacity', baseOpacity.toFixed(3));
            this.rootElement.style.setProperty('--ocean-cover-opacity', extraOpacity.toFixed(3));
            this.rootElement.style.setProperty('--ocean-depth-progress', depthProgress.toFixed(3));
        }

        /**
         * renderDepth(depth) - 将当前深度渲染到左右仪表和覆盖层
         * @param {number} depth - 当前深度值
         * @returns {void} - 无返回值，直接更新深度显示
         */
        renderDepth(depth) {
            const safeDepth = clamp(depth, MIN_DEPTH, MAX_DEPTH);
            const renderedGaugeDepth = this.getRenderedGaugeDepth(safeDepth);
            const depthText = formatDepth(renderedGaugeDepth);

            if (this.leftCurrent) {
                this.leftCurrent.textContent = depthText;
            }

            if (this.rightCurrent) {
                this.rightCurrent.textContent = depthText;
            }

            this.updateMarkersForContainer(this.leftMarkersContainer, renderedGaugeDepth);
            this.updateMarkersForContainer(this.rightMarkersContainer, renderedGaugeDepth);
            this.updateDetailGaugeTapePosition(this.leftMarkersContainer, renderedGaugeDepth);
            this.updateDetailGaugeTapePosition(this.rightMarkersContainer, renderedGaugeDepth);
            this.setOverlayState(safeDepth, this.overlayBoost);
        }

        // 刻度高亮状态：根据当前深度同步哪些刻度已到达、哪一条是当前指针位置。
        /**
         * updateMarkersForContainer(container, currentDepth) - 更新指定深度计刻度的高亮状态
         * @param {HTMLElement|null} container - 刻度容器元素
         * @param {number} currentDepth - 当前深度值
         * @returns {void} - 无返回值，直接切换刻度状态
         */
        updateMarkersForContainer(container, currentDepth) {
            if (!container) {
                return;
            }

            const markers = Array.from(container.querySelectorAll('.depth-marker'));
            if (markers.length === 0) {
                return;
            }

            let nearestDepth = MAX_DEPTH;
            let nearestDistance = Number.POSITIVE_INFINITY;

            markers.forEach((marker) => {
                const markerDepth = Number(marker.dataset.depth);
                const distance = Math.abs(markerDepth - currentDepth);

                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestDepth = markerDepth;
                }
            });

            markers.forEach((marker) => {
                const markerDepth = Number(marker.dataset.depth);
                marker.classList.toggle('is-reached', markerDepth >= currentDepth);
                marker.classList.toggle('is-current', markerDepth === nearestDepth);
            });
        }

        /**
         * finishDepth(depth) - 直接结束深度动画并写入最终深度
         * @param {number} depth - 最终深度值
         * @returns {void} - 无返回值，直接更新深度状态
         */
        finishDepth(depth) {
            this.currentDepth = clamp(depth, MIN_DEPTH, MAX_DEPTH);
            this.renderDepth(this.currentDepth);
            sessionStorage.setItem(STORAGE_KEY_CURRENT, String(Math.round(this.currentDepth)));
        }

        // 页面滚动深度：首页按 section 和潜水匹配细分层次，
        // trip / detail 则沿主要区块继续下潜，让页面内部阅读也有海层推进感。
        /**
         * hasScrollDepthConfig(pageId) - 判断当前页面是否配置了滚动驱动的深度停靠点
         * @param {string} pageId - 页面标识，默认使用当前页面
         * @returns {boolean} - 当前页面是否支持滚动深度联动
         */
        hasScrollDepthConfig(pageId = this.pageId) {
            return getScrollDepthStopConfig(pageId).length > 0;
        }

        /**
         * setHomeDiveMatchDepth(depth) - 接收首页潜水匹配当前分类的细分深度并平滑推进深度计
         * @param {number} depth - 当前匹配分类对应的目标深度
         * @returns {void} - 无返回值，直接刷新首页滚动深度目标
         */
        setHomeDiveMatchDepth(depth) {
            const safeDepth = readNumber(depth);
            this.homeDiveMatchDepth = safeDepth === null ? null : clamp(safeDepth, MIN_DEPTH, MAX_DEPTH);

            if (this.pageId !== 'home' || !this.pageScrollDepthEnabled) {
                return;
            }

            this.pageScrollTargetDepth = this.computePageScrollDepth();

            if (this.pageScrollFrameId) {
                return;
            }

            this.pageScrollFrameId = requestAnimationFrame(() => {
                this.stepPageScrollDepth();
            });
        }

        /**
         * setDetailGaugeProfile(source) - 根据当前潜点的真实深度范围重设详情页深度计显示档位
         * @param {string|Object|null} source - 潜点深度文本或显式配置对象
         * @returns {void} - 无返回值，直接刷新详情页滚动刻度带
         */
        setDetailGaugeProfile(source) {
            if (!this.isDetailGaugeMode()) {
                return;
            }

            const nextProfile = createDetailGaugeProfile(source);
            const previousGaugeMaxDepth = this.detailGaugeProfile?.gaugeMaxDepth || DETAIL_GAUGE_DEFAULT_MAX_DEPTH;
            this.detailGaugeProfile = { ...nextProfile };

            if (previousGaugeMaxDepth !== nextProfile.gaugeMaxDepth) {
                this.buildMarkersIfNeeded();
            }

            this.refreshDetailGaugeViewportLayout();
            this.renderDepth(this.currentDepth);
        }

        /**
         * setupPageStateDepthObserver() - 监听 trip / detail 页面浮层状态，让深度计在打开时轻微继续下潜
         * @returns {void} - 无返回值，直接注册 DOM 属性观察
         */
        setupPageStateDepthObserver() {
            const stateRules = getPageStateDepthOffsetRules(this.pageId);
            if (!window.MutationObserver || stateRules.length === 0) {
                return;
            }

            this.pageStateDepthRules = stateRules
                .map((rule) => ({
                    ...rule,
                    element: document.querySelector(rule.selector)
                }))
                .filter((rule) => Boolean(rule.element));

            if (this.pageStateDepthRules.length === 0) {
                return;
            }

            this.pageStateDepthObserver = new MutationObserver(() => {
                this.queuePageScrollDepthUpdate();
            });

            this.pageStateDepthRules.forEach((rule) => {
                this.pageStateDepthObserver.observe(rule.element, {
                    attributes: true,
                    attributeFilter: ['class', 'hidden', 'aria-hidden']
                });
            });
        }

        /**
         * getPageStateDepthOffset() - 根据当前页面可见浮层状态计算附加下潜量
         * @returns {number} - 需要叠加到页面基础深度上的附加下潜值
         */
        getPageStateDepthOffset() {
            if (this.pageStateDepthRules.length === 0) {
                return 0;
            }

            const strongestOffset = this.pageStateDepthRules.reduce((currentOffset, rule) => {
                if (!isDepthStateElementActive(rule.element)) {
                    return currentOffset;
                }

                const offset = clamp(readNumber(rule.depthOffset) ?? 0, 0, 1.2);
                return Math.max(currentOffset, offset);
            }, 0);

            return strongestOffset > 0 ? -strongestOffset : 0;
        }

        /**
         * normalizeHomeThresholdPoints(rawPoints) - 把首页 section 的原始文档位置映射到真实可滚动范围里
         * @param {Array<Object>} rawPoints - 首页 section 对应的原始位置点
         * @returns {Array<Object>} - 归一化后的首页阈值点
         */
        normalizeHomeThresholdPoints(rawPoints) {
            if (rawPoints.length <= 1) {
                return rawPoints.map((point, index) => ({
                    ...point,
                    threshold: index === 0 ? 0 : Math.max(window.innerHeight || document.documentElement.clientHeight || 0, 1)
                }));
            }

            const documentHeight = Math.max(
                document.documentElement?.scrollHeight || 0,
                document.body?.scrollHeight || 0
            );
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
            const scrollLimit = Math.max(documentHeight - viewportHeight, 1);
            const firstTop = rawPoints[0]?.top ?? 0;
            const lastTop = rawPoints[rawPoints.length - 1]?.top ?? firstTop;
            const topRange = Math.max(lastTop - firstTop, 1);

            return rawPoints.map((point, index) => {
                if (index === 0) {
                    return {
                        ...point,
                        threshold: 0
                    };
                }

                if (index === rawPoints.length - 1) {
                    return {
                        ...point,
                        threshold: scrollLimit
                    };
                }

                const ratio = clamp((point.top - firstTop) / topRange, 0, 1);
                return {
                    ...point,
                    threshold: ratio * scrollLimit
                };
            });
        }

        /**
         * getPageScrollThresholdPoints() - 把当前页面的 section 停靠点整理成带滚动阈值的可计算数组
         * @returns {Array<Object>} - 当前页面用于深度插值的阈值点
         */
        getPageScrollThresholdPoints() {
            if (this.pageScrollDepthStops.length === 0) {
                return [];
            }

            const rawPoints = this.pageScrollDepthStops.map((stop, index) => {
                const top = stop.element.getBoundingClientRect().top + window.scrollY;
                if (index === 0) {
                    return {
                        selector: stop.selector,
                        depth: stop.depth,
                        top: top,
                        threshold: 0
                    };
                }

                return {
                    selector: stop.selector,
                    depth: stop.depth,
                    top: top,
                    threshold: Math.max(
                        0,
                        top - window.innerHeight * 0.42
                    )
                };
            });

            if (this.pageId === 'home') {
                return this.normalizeHomeThresholdPoints(rawPoints);
            }

            if (this.pageId !== 'detail') {
                return rawPoints;
            }

            return rawPoints.reduce((normalizedPoints, point, index) => {
                if (index === 0) {
                    normalizedPoints.push(point);
                    return normalizedPoints;
                }

                const previousPoint = normalizedPoints[normalizedPoints.length - 1];
                const minGap = Math.max(window.innerHeight * 0.18, 170);
                const maxGap = Math.max(window.innerHeight * 0.56, 520);
                const preferredThreshold = clamp(
                    point.threshold,
                    previousPoint.threshold + minGap,
                    previousPoint.threshold + maxGap
                );

                normalizedPoints.push({
                    ...point,
                    threshold: preferredThreshold
                });
                return normalizedPoints;
            }, []);
        }

        /**
         * computeContinuousDepthFromPoints(points) - 按常规缓动方式在停靠点之间连续插值
         * @param {Array<Object>} points - 当前页面可用的滚动阈值点
         * @returns {number} - 计算出的基础深度
         */
        computeContinuousDepthFromPoints(points) {
            if (points.length === 0) {
                return this.targetDepth;
            }

            const scrollY = window.scrollY || window.pageYOffset || 0;
            let baseDepth = points[0].depth;

            if (scrollY <= points[0].threshold) {
                return baseDepth;
            }

            for (let index = 0; index < points.length - 1; index += 1) {
                const currentPoint = points[index];
                const nextPoint = points[index + 1];

                if (scrollY <= nextPoint.threshold) {
                    const range = Math.max(nextPoint.threshold - currentPoint.threshold, 1);
                    const progress = clamp((scrollY - currentPoint.threshold) / range, 0, 1);
                    const eased = easeInOutCubic(progress);
                    baseDepth = currentPoint.depth + (nextPoint.depth - currentPoint.depth) * eased;
                    return baseDepth;
                }
            }

            return points[points.length - 1].depth;
        }

        /**
         * computePlateauDepthFromPoints(points) - 让详情页 section 在各自海层里更明显停靠，再过渡到下一层
         * @param {Array<Object>} points - 详情页当前可用的滚动阈值点
         * @returns {number} - 计算出的详情页基础深度
         */
        computePlateauDepthFromPoints(points) {
            if (points.length === 0) {
                return this.targetDepth;
            }

            const scrollY = window.scrollY || window.pageYOffset || 0;
            if (points.length === 1 || scrollY <= points[0].threshold) {
                return points[0].depth;
            }

            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
            const minTransitionPx = Math.max(viewportHeight * 0.08, 56);
            const maxTransitionPx = Math.max(viewportHeight * 0.18, 160);
            const transitionBias = 0.74;
            const transitionSpanRatio = 0.36;

            for (let index = 0; index < points.length - 1; index += 1) {
                const currentPoint = points[index];
                const nextPoint = points[index + 1];

                if (scrollY > nextPoint.threshold) {
                    continue;
                }

                const range = Math.max(nextPoint.threshold - currentPoint.threshold, 1);
                const transitionCenter = currentPoint.threshold + range * transitionBias;
                const halfTransitionSpan = Math.min(
                    clamp(range * transitionSpanRatio * 0.5, minTransitionPx * 0.5, maxTransitionPx * 0.5),
                    range * 0.48
                );
                const transitionStart = clamp(
                    transitionCenter - halfTransitionSpan,
                    currentPoint.threshold,
                    nextPoint.threshold
                );
                const transitionEnd = clamp(
                    transitionCenter + halfTransitionSpan,
                    transitionStart,
                    nextPoint.threshold
                );

                if (transitionEnd - transitionStart < 1) {
                    return this.computeContinuousDepthFromPoints([currentPoint, nextPoint]);
                }

                if (scrollY <= transitionStart) {
                    return currentPoint.depth;
                }

                if (scrollY >= transitionEnd) {
                    return nextPoint.depth;
                }

                const progress = clamp((scrollY - transitionStart) / (transitionEnd - transitionStart), 0, 1);
                const eased = easeInOutCubic(progress);
                return currentPoint.depth + (nextPoint.depth - currentPoint.depth) * eased;
            }

            return points[points.length - 1].depth;
        }

        /**
         * computeDetailLinearDepth() - 按整页滚动进度均匀计算详情页逻辑深度
         * @returns {number} - 当前滚动位置对应的线性逻辑深度
         */
        computeDetailLinearDepth() {
            const { start, end } = this.getDetailLogicalRange();
            const documentHeight = Math.max(
                document.documentElement?.scrollHeight || 0,
                document.body?.scrollHeight || 0
            );
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
            const scrollLimit = Math.max(documentHeight - viewportHeight, 1);
            const scrollY = clamp(window.scrollY || window.pageYOffset || 0, 0, scrollLimit);
            const progress = clamp(scrollY / scrollLimit, 0, 1);

            return start + (end - start) * progress;
        }

        /**
         * setupPageScrollDepth() - 注册当前页面的滚动深度停靠点，并绑定滚动/尺寸变化监听
         * @returns {void} - 无返回值，直接准备页面滚动深度逻辑
         */
        setupPageScrollDepth() {
            if (!this.hasScrollDepthConfig()) {
                return;
            }

            // 把 selector 配置解析成真实 DOM，后续计算时直接使用元素位置。
            this.pageScrollDepthStops = getScrollDepthStopConfig(this.pageId)
                .map((stop) => {
                    const element = document.querySelector(stop.selector);
                    if (!element) {
                        return null;
                    }

                    return {
                        selector: stop.selector,
                        depth: stop.depth,
                        element: element
                    };
                })
                .filter(Boolean);

            if (this.pageScrollDepthStops.length === 0) {
                return;
            }

            // 页面滚动和 resize 都会影响区块在视口中的位置，所以两者都需要触发深度重算。
            window.addEventListener('scroll', () => {
                this.queuePageScrollDepthUpdate();
            }, { passive: true });

            window.addEventListener('resize', () => {
                this.queuePageScrollDepthUpdate();
            }, { passive: true });
        }

        /**
         * schedulePageScrollDepthSync(delayMs) - 在页面入场结束后延迟启用滚动深度联动
         * @param {number} delayMs - 延迟启用的毫秒数
         * @returns {void} - 无返回值，直接登记启用时机
         */
        schedulePageScrollDepthSync(delayMs = 0) {
            if (!this.hasScrollDepthConfig()) {
                return;
            }

            if (this.pageScrollSyncTimerId) {
                window.clearTimeout(this.pageScrollSyncTimerId);
                this.pageScrollSyncTimerId = 0;
            }

            const enable = () => {
                this.pageScrollDepthEnabled = true;
                this.pageScrollSyncTimerId = 0;
                this.queuePageScrollDepthUpdate();
            };

            if (delayMs <= 0) {
                enable();
                return;
            }

            this.pageScrollDepthEnabled = false;
            this.pageScrollSyncTimerId = window.setTimeout(enable, delayMs);
        }

        /**
         * queuePageScrollDepthUpdate() - 请求下一帧刷新当前页面滚动驱动的目标深度
         * @returns {void} - 无返回值，直接排队执行深度同步
         */
        queuePageScrollDepthUpdate() {
            if (
                !this.hasScrollDepthConfig() ||
                !this.pageScrollDepthEnabled ||
                this.isNavigating ||
                this.specialTransitionMode
            ) {
                return;
            }

            this.pageScrollTargetDepth = this.computePageScrollDepth();

            if (this.pageScrollFrameId) {
                return;
            }

            this.pageScrollFrameId = requestAnimationFrame(() => {
                this.stepPageScrollDepth();
            });
        }

        /**
         * computeScrollDepthFromStops() - 根据当前页面停靠点插值计算基础深度
         * @returns {number} - 当前滚动位置对应的基础深度
         */
        computeScrollDepthFromStops() {
            const points = this.getPageScrollThresholdPoints();
            return this.computeContinuousDepthFromPoints(points);
        }

        /**
         * computeHomeLinearDepth() - 按首页整页可滚动进度均匀计算基础海层深度
         * @returns {number} - 首页当前滚动位置对应的线性基础深度
         */
        computeHomeLinearDepth() {
            const points = this.getPageScrollThresholdPoints();
            if (points.length === 0) {
                return this.targetDepth;
            }

            const documentHeight = Math.max(
                document.documentElement?.scrollHeight || 0,
                document.body?.scrollHeight || 0
            );
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
            const scrollLimit = Math.max(documentHeight - viewportHeight, 1);
            const scrollY = clamp(window.scrollY || window.pageYOffset || 0, 0, scrollLimit);
            const progress = clamp(scrollY / scrollLimit, 0, 1);
            const startDepth = points[0].depth;
            const endDepth = points[points.length - 1].depth;

            return startDepth + (endDepth - startDepth) * progress;
        }

        /**
         * computeHomeScrollDepth() - 根据首页 section 与潜水匹配舞台位置计算当前应显示的深度
         * @returns {number} - 当前滚动位置对应的首页目标深度
         */
        computeHomeScrollDepth() {
            const linearDepth = this.computeHomeLinearDepth();
            const stopDepth = this.computeScrollDepthFromStops();
            const sectionInfluence = 0.34;
            const baseDepth = linearDepth + (stopDepth - linearDepth) * sectionInfluence;

            if (this.homeDiveMatchDepth === null) {
                return baseDepth;
            }

            const diveMatchStop = this.pageScrollDepthStops.find((stop) => stop.selector === '#dive-match');
            if (!diveMatchStop || !diveMatchStop.element) {
                return baseDepth;
            }

            const rect = diveMatchStop.element.getBoundingClientRect();
            const focusY = window.innerHeight * 0.48;
            const sectionMid = rect.top + Math.max(rect.height * 0.42, 120);
            const fadeDistance = Math.max(window.innerHeight * 0.54, rect.height * 0.65, 240);
            const influence = clamp(1 - (Math.abs(sectionMid - focusY) / fadeDistance), 0, 1);

            if (influence <= 0.001) {
                return baseDepth;
            }

            const easedInfluence = easeInOutCubic(influence);
            return baseDepth + (this.homeDiveMatchDepth - baseDepth) * easedInfluence;
        }

        /**
         * computeDetailScrollDepth() - 以整页均匀下潜为主，再轻轻保留 section 停靠感
         * @returns {number} - 详情页当前应显示的目标深度
         */
        computeDetailScrollDepth() {
            const points = this.getPageScrollThresholdPoints();
            const linearDepth = this.computeDetailLinearDepth();

            if (points.length === 0) {
                return linearDepth;
            }

            const plateauDepth = this.computePlateauDepthFromPoints(points);
            const plateauInfluence = 0.16;

            return linearDepth + (plateauDepth - linearDepth) * plateauInfluence;
        }

        /**
         * computePageScrollDepth() - 计算当前页面滚动位置对应的目标深度
         * @returns {number} - 当前页面应显示的目标深度
         */
        computePageScrollDepth() {
            if (this.pageId === 'home') {
                return this.computeHomeScrollDepth();
            }

            if (this.pageId === 'detail') {
                return clamp(this.computeDetailScrollDepth() + this.getPageStateDepthOffset(), MIN_DEPTH, MAX_DEPTH);
            }

            return clamp(this.computeScrollDepthFromStops() + this.getPageStateDepthOffset(), MIN_DEPTH, MAX_DEPTH);
        }

        /**
         * stepPageScrollDepth() - 以缓和阻尼方式把当前页面深度显示推进到滚动目标深度
         * @returns {void} - 无返回值，直接更新深度计显示
         */
        stepPageScrollDepth() {
            this.pageScrollFrameId = 0;

            if (
                !this.hasScrollDepthConfig() ||
                !this.pageScrollDepthEnabled ||
                this.isNavigating ||
                this.specialTransitionMode
            ) {
                return;
            }

            // 这里不用 animateDepth 做固定时长动画，而是每帧按差值推进，形成更像水下阻尼的深度变化。
            const targetDepth = clamp(
                this.pageScrollTargetDepth ?? this.computePageScrollDepth(),
                MIN_DEPTH,
                MAX_DEPTH
            );
            const delta = targetDepth - this.currentDepth;

            const settleThreshold = this.pageId === 'detail' ? 0.035 : 0.05;
            if (Math.abs(delta) <= settleThreshold) {
                this.currentDepth = targetDepth;
                this.renderDepth(targetDepth);
                sessionStorage.setItem(STORAGE_KEY_CURRENT, String(Math.round(targetDepth)));
                return;
            }

            const responseFactor = this.pageId === 'detail' ? 0.14 : 0.1;
            const nextDepth = this.currentDepth + delta * responseFactor;
            this.currentDepth = clamp(nextDepth, MIN_DEPTH, MAX_DEPTH);
            this.renderDepth(this.currentDepth);
            sessionStorage.setItem(STORAGE_KEY_CURRENT, String(Math.round(this.currentDepth)));

            this.pageScrollFrameId = requestAnimationFrame(() => {
                this.stepPageScrollDepth();
            });
        }

        // 登录页轻交互：在 hover / focus 时让深度计做轻微晃动，增强仪表悬浮感。
        /**
         * setInteractiveGaugeState(isActive) - 切换登录页深度计的交互高亮态
         * @param {boolean} isActive - 是否启用交互态
         * @returns {void} - 无返回值，直接更新页面 class
         */
        setInteractiveGaugeState(isActive) {
            if (this.pageId !== 'login' || this.isNavigating) {
                return;
            }

            this.body.classList.toggle('depth-gauge-interactive', Boolean(isActive));
        }

        /**
         * triggerInteractiveWobble(intensity) - 触发登录页深度计的一次轻微波动动画
         * @param {number} intensity - 交互波动强度
         * @returns {void} - 无返回值，直接播放波动动画
         */
        triggerInteractiveWobble(intensity = 1) {
            if (this.pageId !== 'login' || this.isNavigating || this.depthAnimationId || this.specialTransitionMode) {
                return;
            }

            const baselineDepth = clamp(this.currentDepth, MIN_DEPTH, MAX_DEPTH);
            // 登录门厅已经接近海面时，不再让交互反馈去改动真实深度值，
            // 避免 0m 与 -1m 之间来回跳字，看起来像深度计抖动。
            if (Math.abs(baselineDepth) <= 1.2) {
                if (this.interactionAnimationId) {
                    cancelAnimationFrame(this.interactionAnimationId);
                    this.interactionAnimationId = 0;
                    this.renderDepth(this.currentDepth);
                }

                if (this.interactionResetTimerId) {
                    window.clearTimeout(this.interactionResetTimerId);
                    this.interactionResetTimerId = 0;
                }

                return;
            }

            const safeIntensity = clamp(readNumber(intensity) ?? 1, 0.8, 1.4);
            const amplitude = clamp(1.05 * safeIntensity, 0.9, 1.9);
            const targetDepth = clamp(baselineDepth - amplitude, MIN_DEPTH, MAX_DEPTH);

            if (this.interactionAnimationId) {
                cancelAnimationFrame(this.interactionAnimationId);
                this.interactionAnimationId = 0;
            }

            if (this.interactionResetTimerId) {
                window.clearTimeout(this.interactionResetTimerId);
                this.interactionResetTimerId = 0;
            }

            this.body.classList.add('depth-gauge-interactive');

            this.animateValue(
                'interactionAnimationId',
                0,
                1,
                920,
                (progress) => {
                    const oscillation = Math.sin(progress * Math.PI);
                    const displayDepth = baselineDepth + (targetDepth - baselineDepth) * oscillation;
                    this.renderDepth(displayDepth);
                },
                () => {
                    this.renderDepth(this.currentDepth);
                    this.interactionAnimationId = 0;
                    this.interactionResetTimerId = window.setTimeout(() => {
                        this.body.classList.remove('depth-gauge-interactive');
                        this.interactionResetTimerId = 0;
                    }, 180);
                }
            );
        }

        /**
         * clearSpecialTimers() - 清理登录专用特殊过渡挂起的所有定时器
         * @returns {void} - 无返回值，直接清理定时器引用
         */
        clearSpecialTimers() {
            this.specialTimers.forEach((timerId) => {
                window.clearTimeout(timerId);
            });
            this.specialTimers = [];
        }

        // 登录页专用特效：控制气泡构建、蓝层透明度和特殊过渡状态清理。
        /**
         * queueSpecialTimer(callback, delayMs) - 为登录专用过渡登记一个延时任务
         * @param {Function} callback - 延时后执行的回调函数
         * @param {number} delayMs - 延迟毫秒数
         * @returns {number} - 定时器 ID
         */
        queueSpecialTimer(callback, delayMs) {
            const timerId = window.setTimeout(() => {
                this.specialTimers = this.specialTimers.filter((id) => id !== timerId);
                callback();
            }, delayMs);

            this.specialTimers.push(timerId);
            return timerId;
        }

        /**
         * setSpecialBlueOpacity(value) - 设置登录专用蓝色覆盖层透明度
         * @param {number} value - 蓝层透明度值
         * @returns {void} - 无返回值，直接更新 CSS 变量
         */
        setSpecialBlueOpacity(value) {
            this.rootElement.style.setProperty(
                '--login-home-blue-opacity',
                clamp(value, 0, 0.92).toFixed(3)
            );
        }

        /**
         * buildSpecialBubbles(count) - 构建登录页特殊过渡使用的气泡元素
         * @param {number} count - 需要生成的气泡数量
         * @returns {void} - 无返回值，直接生成气泡 DOM
         */
        buildSpecialBubbles(count = LOGIN_HOME_SPECIAL.bubbleCount) {
            if (!this.bubbleContainer) {
                return;
            }

            const fragment = document.createDocumentFragment();

            for (let index = 0; index < count; index += 1) {
                const bubble = document.createElement('span');
                bubble.className = 'page-transition-bubble';
                bubble.style.setProperty('--bubble-size', `${randomBetween(10, 34).toFixed(1)}px`);
                bubble.style.setProperty('--bubble-left', `${randomBetween(4, 96).toFixed(1)}%`);
                bubble.style.setProperty('--bubble-duration', `${randomBetween(2.45, 3.25).toFixed(2)}s`);
                bubble.style.setProperty('--bubble-delay', `${randomBetween(0, 1.25).toFixed(2)}s`);
                bubble.style.setProperty('--bubble-drift', `${randomBetween(-36, 36).toFixed(1)}px`);
                fragment.appendChild(bubble);
            }

            this.bubbleContainer.innerHTML = '';
            this.bubbleContainer.appendChild(fragment);
        }

        /**
         * clearSpecialTransitionState() - 清理登录页专用蓝层、气泡和特殊过渡状态
         * @returns {void} - 无返回值，直接重置特殊过渡状态
         */
        clearSpecialTransitionState() {
            this.specialTransitionMode = null;
            this.clearSpecialTimers();
            this.body.classList.remove(
                'page-login-home-special-active',
                'page-login-home-bubbles',
                'page-login-home-bubbles-fade'
            );
            this.setSpecialBlueOpacity(0);

            if (this.bubbleContainer) {
                this.bubbleContainer.innerHTML = '';
            }
        }

        /**
         * clearTransitionClasses() - 清理页面当前所有通用切换 class
         * @returns {void} - 无返回值，直接移除页面过渡状态
         */
        clearTransitionClasses() {
            this.body.classList.remove(
                'page-transition-active',
                'page-exit-up',
                'page-exit-down',
                'page-enter-from-bottom',
                'page-enter-from-top',
                'page-ocean-dive-exit',
                'page-ocean-dive-enter',
                'page-ocean-surface-exit',
                'page-ocean-surface-enter'
            );

            if (this.cleanupTimerId) {
                window.clearTimeout(this.cleanupTimerId);
                this.cleanupTimerId = 0;
            }
        }

        /**
         * forceTransitionReflow() - 在切换 class 前后强制浏览器同步布局，避免首帧位移被吞掉
         * @returns {void} - 无返回值，仅用于刷新当前舞台的布局状态
         */
        forceTransitionReflow() {
            if (this.pageStage) {
                void this.pageStage.offsetWidth;
                return;
            }

            if (this.body) {
                void this.body.offsetWidth;
            }
        }

        // 通用切页控制：负责设置过渡 class、时长、覆盖层和入场/离场清理时机。
        /**
         * applyTransitionClass(className) - 应用当前页面切换所需的主动画 class
         * @param {string} className - 需要添加的动画 class
         * @returns {void} - 无返回值，直接更新页面 class
         */
        applyTransitionClass(className) {
            this.clearTransitionClasses();
            this.forceTransitionReflow();
            this.body.classList.add('page-transition-active');
            this.forceTransitionReflow();

            if (className) {
                this.body.classList.add(className);
            }
        }

        /**
         * setTransitionDuration(className, duration) - 按不同过渡类型写入对应的动画时长变量
         * @param {string} className - 当前动画 class 名称
         * @param {number} duration - 动画时长
         * @returns {void} - 无返回值，直接设置 CSS 变量
         */
        setTransitionDuration(className, duration) {
            const safeDuration = clamp(readNumber(duration) ?? 0, 240, 2400);
            if (!safeDuration) {
                return;
            }

            if (className && className.startsWith('page-ocean-')) {
                if (className.endsWith('-enter')) {
                    this.rootElement.style.setProperty('--page-ocean-enter-duration', `${safeDuration}ms`);
                } else {
                    this.rootElement.style.setProperty('--page-ocean-exit-duration', `${safeDuration}ms`);
                }
                return;
            }

            if (className && className.startsWith('page-enter-')) {
                this.rootElement.style.setProperty('--page-enter-duration', `${safeDuration}ms`);
                return;
            }

            if (className && className.startsWith('page-exit-')) {
                this.rootElement.style.setProperty('--page-exit-duration', `${safeDuration}ms`);
            }
        }

        /**
         * scheduleTransitionCleanup(delayMs) - 在指定延迟后清理通用页面切换状态
         * @param {number} delayMs - 延迟毫秒数
         * @returns {void} - 无返回值，直接登记清理任务
         */
        scheduleTransitionCleanup(delayMs) {
            if (this.cleanupTimerId) {
                window.clearTimeout(this.cleanupTimerId);
            }

            this.cleanupTimerId = window.setTimeout(() => {
                this.clearTransitionClasses();
                this.overlayBoost = 0;
                this.setOverlayState(this.currentDepth, 0);
            }, delayMs);
        }

        /**
         * startEntryTransition(direction, options) - 播放目标页面的入场动画并同步深度与覆盖层收束
         * @param {string} direction - 入场方向标记，决定从上方还是下方进入
         * @param {Object} options - 入场动画配置项，如深度起点、目标深度和覆盖层初始值
         * @returns {void} - 无返回值，直接执行入场过渡
         */
        startEntryTransition(direction, options = {}) {
            if (direction === 'none') {
                this.overlayBoost = 0;
                this.finishDepth(readNumber(options.targetDepth) ?? this.targetDepth);
                this.clearTransitionClasses();
                return;
            }

            const entryClass = options.entryClass || (
                direction === 'forward'
                    ? 'page-enter-from-bottom'
                    : 'page-enter-from-top'
            );

            const entryDuration = readNumber(options.duration) ?? TRANSITION.enterPageMs;
            const targetDepth = clamp(
                readNumber(options.targetDepth) ?? this.targetDepth,
                MIN_DEPTH,
                MAX_DEPTH
            );
            const overlayBoostStart = clamp(
                readNumber(options.overlayBoostStart) ?? this.overlayBoost,
                0,
                0.45
            );

            this.cancelActiveAnimations();
            this.setTransitionDuration(entryClass, entryDuration);
            this.applyTransitionClass(entryClass);
            this.overlayBoost = overlayBoostStart;
            this.setOverlayState(this.currentDepth, overlayBoostStart);

            if (options.animateDepth === true) {
                const startDepth = clamp(
                    readNumber(options.startDepth) ?? this.currentDepth,
                    MIN_DEPTH,
                    MAX_DEPTH
                );
                const depthDuration = readNumber(options.depthDuration) ?? (entryDuration + 80);

                this.currentDepth = startDepth;
                this.renderDepth(startDepth);
                this.animateDepth(startDepth, targetDepth, depthDuration);
            } else {
                this.finishDepth(targetDepth);
            }

            this.animateOverlayBoost(overlayBoostStart, 0, entryDuration);
            this.scheduleTransitionCleanup(entryDuration + 60);
        }

        /**
         * scheduleSpecialCleanup(delayMs) - 延迟清理登录页到首页专用特效残留状态
         * @param {number} delayMs - 延迟清理的毫秒数
         * @returns {void} - 无返回值，直接登记清理定时器
         */
        scheduleSpecialCleanup(delayMs) {
            if (this.cleanupTimerId) {
                window.clearTimeout(this.cleanupTimerId);
            }

            this.cleanupTimerId = window.setTimeout(() => {
                this.clearTransitionClasses();
                this.clearSpecialTransitionState();
                this.overlayBoost = 0;
                this.setOverlayState(this.currentDepth, 0);
            }, delayMs);
        }

        /**
         * startLoginHomeSourceTransition(rawUrl, fromDepth, toDepth) - 播放登录页跳往首页时的专用离场动画
         * @param {string} rawUrl - 即将跳转到的目标地址
         * @param {number} fromDepth - 当前页面起始深度
         * @param {number} toDepth - 首页目标深度
         * @returns {void} - 无返回值，直接执行登录页离场并在合适时机导航
         */
        startLoginHomeSourceTransition(rawUrl, fromDepth, toDepth) {
            this.cancelActiveAnimations();
            this.clearTransitionClasses();
            this.clearSpecialTransitionState();

            this.specialTransitionMode = SPECIAL_TRANSITION_LOGIN_HOME;
            this.body.classList.add('page-transition-active', 'page-login-home-special-active');
            this.buildSpecialBubbles();
            this.setSpecialBlueOpacity(0);
            this.overlayBoost = 0;
            this.setOverlayState(fromDepth, 0);

            this.animateDepth(fromDepth, toDepth, LOGIN_HOME_SPECIAL.depthMs);
            this.animateOverlayBoost(0, TRANSITION.overlayBoost, LOGIN_HOME_SPECIAL.blueMs + 120);
            this.animateValue(
                'specialBlueAnimationId',
                0,
                LOGIN_HOME_SPECIAL.blueOpacity,
                LOGIN_HOME_SPECIAL.blueMs,
                (value) => this.setSpecialBlueOpacity(value)
            );

            this.queueSpecialTimer(() => {
                this.body.classList.add('page-login-home-bubbles');
            }, LOGIN_HOME_SPECIAL.bubbleDelayMs);

            this.queueSpecialTimer(() => {
                this.body.classList.add('page-exit-up');
            }, LOGIN_HOME_SPECIAL.slideStartMs);

            const navState = {
                fromPage: this.pageId,
                toPage: 'home',
                fromDepth: Math.round(fromDepth),
                toDepth: Math.round(toDepth),
                visualDirection: 'forward',
                overlayBoost: TRANSITION.overlayBoost,
                specialTransition: SPECIAL_TRANSITION_LOGIN_HOME,
                specialBlueOpacity: LOGIN_HOME_SPECIAL.blueOpacity,
                animatedOnSource: true,
                at: Date.now()
            };

            if (this.navigateTimerId) {
                window.clearTimeout(this.navigateTimerId);
            }

            this.navigateTimerId = window.setTimeout(() => {
                sessionStorage.setItem(STORAGE_KEY_NAV, JSON.stringify(navState));
                sessionStorage.setItem(STORAGE_KEY_CURRENT, String(Math.round(toDepth)));
                window.location.href = rawUrl;
            }, LOGIN_HOME_SPECIAL.navigateMs);
        }

        /**
         * startLoginHomeEntryTransition(incomingState) - 播放首页承接登录页特效的专用入场动画
         * @param {Object} incomingState - 来自上一页写入的导航状态对象
         * @returns {void} - 无返回值，直接执行首页入场特效
         */
        startLoginHomeEntryTransition(incomingState) {
            const specialBlueOpacity = clamp(
                readNumber(incomingState.specialBlueOpacity) ?? LOGIN_HOME_SPECIAL.blueOpacity,
                0,
                0.92
            );

            this.cancelActiveAnimations();
            this.clearTransitionClasses();
            this.clearSpecialTransitionState();

            this.specialTransitionMode = SPECIAL_TRANSITION_LOGIN_HOME;
            this.overlayBoost = clamp(incomingState.overlayBoost, 0, 0.45);
            this.currentDepth = clamp(incomingState.toDepth, MIN_DEPTH, MAX_DEPTH);
            this.renderDepth(this.currentDepth);
            this.setSpecialBlueOpacity(specialBlueOpacity);
            this.buildSpecialBubbles();

            this.body.classList.add(
                'page-transition-active',
                'page-login-home-special-active',
                'page-enter-from-bottom'
            );

            this.queueSpecialTimer(() => {
                this.body.classList.add('page-login-home-bubbles');
            }, 50);

            this.queueSpecialTimer(() => {
                this.body.classList.add('page-login-home-bubbles-fade');
            }, LOGIN_HOME_SPECIAL.bubbleFadeStartMs);

            this.animateOverlayBoost(this.overlayBoost, 0, LOGIN_HOME_SPECIAL.entryMs);
            this.animateValue(
                'specialBlueAnimationId',
                specialBlueOpacity,
                0,
                LOGIN_HOME_SPECIAL.entryBlueMs,
                (value) => this.setSpecialBlueOpacity(value)
            );

            this.scheduleSpecialCleanup(LOGIN_HOME_SPECIAL.entryMs + 140);
        }

        /**
         * cancelSpecialLoginHomeTransition(resetDepth) - 终止登录页到首页的专用切换并按需回退深度状态
         * @param {boolean} resetDepth - 是否将深度和覆盖层重置回目标状态
         * @returns {void} - 无返回值，直接清理特殊过渡状态
         */
        cancelSpecialLoginHomeTransition(resetDepth = false) {
            if (this.navigateTimerId) {
                window.clearTimeout(this.navigateTimerId);
                this.navigateTimerId = 0;
            }

            this.cancelActiveAnimations();
            this.clearTransitionClasses();
            this.clearSpecialTransitionState();
            this.isNavigating = false;

            if (resetDepth) {
                this.overlayBoost = 0;
                this.finishDepth(this.targetDepth);
            }
        }

        /**
         * getCurrentDepth() - 读取当前深度计正在显示的安全深度值
         * @returns {number} - 约束后的当前深度值
         */
        getCurrentDepth() {
            return clamp(this.currentDepth, MIN_DEPTH, MAX_DEPTH);
        }

        /**
         * getTargetDepth(pageId) - 根据页面标识获取该页面预设的目标深度
         * @param {string} pageId - 页面唯一标识，默认使用当前页面
         * @returns {number} - 该页面对应的目标深度值
         */
        getTargetDepth(pageId = this.pageId) {
            return getTargetDepthByPage(pageId);
        }

        /**
         * getTransitionTimings() - 读取当前生效的整站过渡时序配置
         * @returns {Object} - 已解析完成的过渡时序对象
         */
        getTransitionTimings() {
            return TRANSITION_TIMINGS;
        }

        /**
         * navigateTo(rawUrl) - 接管站内跨页面跳转并按深度逻辑播放对应离场动画
         * @param {string} rawUrl - 目标页面地址
         * @returns {void} - 无返回值，直接决定导航方式并执行跳转
         */
        navigateTo(rawUrl) {
            if (this.isNavigating) {
                return;
            }

            const parsedUrl = parseUrl(rawUrl);
            if (!parsedUrl || parsedUrl.origin !== window.location.origin) {
                window.location.href = rawUrl;
                return;
            }

            if (parsedUrl.pathname === window.location.pathname && parsedUrl.search === window.location.search) {
                return;
            }

            const toPage = getPageIdFromPath(parsedUrl.pathname);
            if (!toPage) {
                window.location.href = rawUrl;
                return;
            }

            const fromDepth = this.getCurrentDepth();
            const pendingHomeEntryDepth = consumePendingHomeEntryDepth(parsedUrl);
            const toDepth = pendingHomeEntryDepth ?? this.getTargetDepth(toPage);
            const visualDirection = getVisualDirection(fromDepth, toDepth);
            // 目标页面先被翻译成一个“目标深度”，再根据深浅判断是继续下潜还是缓慢上浮。

            if (visualDirection === 'none') {
                sessionStorage.setItem(STORAGE_KEY_CURRENT, String(Math.round(toDepth)));
                window.location.href = rawUrl;
                return;
            }

            this.isNavigating = true;
            this.cancelActiveAnimations();

            if (this.pageId === 'login' && toPage === 'home' && visualDirection === 'forward') {
                this.startLoginHomeSourceTransition(rawUrl, fromDepth, toDepth);
                return;
            }

            const transitionConfig = getOceanNavConfig(this.pageId, toPage) || getDefaultTransitionConfig(visualDirection);
            const exitClass = transitionConfig.exitClass;
            const depthDuration = transitionConfig.navTransition === NAV_TRANSITION_OCEAN
                ? transitionConfig.exitDuration - transitionConfig.navigateLeadMs - 120
                : clamp(
                    Math.abs(toDepth - fromDepth) * 14 + 420,
                    620,
                    transitionConfig.exitDuration - transitionConfig.navigateLeadMs - 60
                );
            // 页面位移动画和深度计动画不是完全同长。
            // 这里给导航跳转提前留出一小段 lead time，让目标页面能无缝接住入场动画。
            const navState = {
                fromPage: this.pageId,
                toPage: toPage,
                fromDepth: Math.round(fromDepth),
                toDepth: Math.round(toDepth),
                visualDirection: visualDirection,
                overlayBoost: transitionConfig.overlayBoost,
                navTransition: transitionConfig.navTransition,
                entryClass: transitionConfig.entryClass,
                entryDuration: transitionConfig.entryDuration,
                depthDuration: transitionConfig.entryDuration + 80,
                continueDepthOnEntry: this.pageId === 'detail' && toPage !== 'detail',
                entryStartDepth: Math.round(fromDepth),
                animatedOnSource: true,
                at: Date.now()
            };

            this.setTransitionDuration(exitClass, transitionConfig.exitDuration);
            this.applyTransitionClass(exitClass);
            this.animateDepth(fromDepth, toDepth, depthDuration);
            this.animateOverlayBoost(
                this.overlayBoost,
                transitionConfig.overlayBoost,
                transitionConfig.exitDuration - transitionConfig.navigateLeadMs
            );

            if (this.navigateTimerId) {
                window.clearTimeout(this.navigateTimerId);
            }

            this.navigateTimerId = window.setTimeout(() => {
                const departureDepth = this.getCurrentDepth();
                navState.fromDepth = Math.round(departureDepth);
                navState.entryStartDepth = Math.round(departureDepth);
                sessionStorage.setItem(STORAGE_KEY_NAV, JSON.stringify(navState));
                sessionStorage.setItem(STORAGE_KEY_CURRENT, String(Math.round(departureDepth)));
                window.location.href = rawUrl;
            }, transitionConfig.exitDuration - transitionConfig.navigateLeadMs);
        }

        /**
         * setupPageShowHandler() - 处理浏览器前进后退缓存恢复时的深度续接和入场动画
         * @returns {void} - 无返回值，直接注册 pageshow 监听
         */
        setupPageShowHandler() {
            window.addEventListener('pageshow', (event) => {
                if (!event.persisted) {
                    return;
                }

                this.isNavigating = false;
                this.cancelActiveAnimations();
                this.clearTransitionClasses();

                if (this.navigateTimerId) {
                    window.clearTimeout(this.navigateTimerId);
                    this.navigateTimerId = 0;
                }

                const storedDepth = readNumber(sessionStorage.getItem(STORAGE_KEY_CURRENT));
                const startDepth = clamp(storedDepth ?? this.targetDepth, MIN_DEPTH, MAX_DEPTH);
                const visualDirection = getVisualDirection(startDepth, this.targetDepth);
                const pageshowConfig = getPageshowTransitionConfig(this.pageId, visualDirection);

                if (visualDirection === 'none') {
                    this.overlayBoost = 0;
                    this.finishDepth(this.targetDepth);
                    if (this.hasScrollDepthConfig()) {
                        this.schedulePageScrollDepthSync(0);
                    }
                    return;
                }

                this.currentDepth = startDepth;
                this.overlayBoost = pageshowConfig.overlayBoostStart;
                this.renderDepth(startDepth);
                this.startEntryTransition(visualDirection, {
                    animateDepth: true,
                    startDepth: startDepth,
                    targetDepth: this.targetDepth,
                    overlayBoostStart: pageshowConfig.overlayBoostStart,
                    entryClass: pageshowConfig.entryClass,
                    duration: pageshowConfig.entryDuration,
                    depthDuration: pageshowConfig.entryDuration + 80
                });

                if (this.hasScrollDepthConfig()) {
                    this.schedulePageScrollDepthSync(pageshowConfig.entryDuration + 200);
                }
            });
        }

        /**
         * setupSpecialTransitionAbortHandler() - 为特殊登录过渡注册中断兜底清理逻辑
         * @returns {void} - 无返回值，直接注册 popstate 和 pagehide 监听
         */
        setupSpecialTransitionAbortHandler() {
            window.addEventListener('popstate', () => {
                if (this.specialTransitionMode === SPECIAL_TRANSITION_LOGIN_HOME) {
                    this.cancelSpecialLoginHomeTransition(true);
                }
            });

            window.addEventListener('pagehide', () => {
                this.clearSpecialTransitionState();
            });
        }

        /**
         * bindTrackedLinks() - 给站内链接统一绑定深度导航逻辑并排除外链与下载链接
         * @returns {void} - 无返回值，直接批量接管页面链接
         */
        bindTrackedLinks() {
            const trackedAnchors = document.querySelectorAll('a[href]');

            trackedAnchors.forEach((anchor) => {
                const rawHref = anchor.getAttribute('href');
                const toPage = getPageIdFromUrl(rawHref);

                if (!toPage) {
                    return;
                }

                anchor.addEventListener('click', (event) => {
                    if (!shouldInterceptAnchorClick(event, anchor)) {
                        return;
                    }

                    event.preventDefault();
                    this.navigateTo(anchor.href);
                });
                // 这里只接管“站内普通链接”。
                // 外链、下载链接、用户带辅助键的新标签行为都保留浏览器默认语义。
            });
        }
    }

    // 挂载全局单例：让首页、详情页、登录页和行程页都能共用同一套深度逻辑。
    window.YanqiDepthTransitionDefaults = DEFAULT_TRANSITION_TIMINGS;
    window.YanqiDepthTransitionConfigResolved = TRANSITION_TIMINGS;
    window.DepthManager = new DepthManager();
})();

