/* ============================================
   Depth Manager - depth-manager.js
   ============================================
   ?????
   1. ???????????????????????????
   2. ?????????????????????????????????
   3. ?????????? -> ???? -> ???? -> ???? -> ??????????
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

    // 首页分层深度：随着浏览从 Hero 进入不同 section，深度计会缓慢下潜到更深一层。
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

    const STORAGE_KEY_CURRENT = 'yanqi_depth_current';
    const STORAGE_KEY_NAV = 'yanqi_depth_nav';
    const STORAGE_KEY_HOME_ENTRY_DEPTH = 'YANQI_HOME_ENTRY_DEPTH';

    // 页面切换动画的全局时间配置（滑出/滑入时长、覆盖层系数、导航刷新间隔等）。
    // 这里统一规定离场多久、提前多久真正跳转、入场多久，以及遮罩层额外加深多少。
    // 这样首页、行程页、详情页都能共用一套“下潜 / 上浮”的节奏，不会每页各跑各的。
    // 如果这里的时间被打乱，整站的海层切换就会失去统一感。
    const TRANSITION = Object.freeze({
        exitPageMs: 1120,
        exitNavigateLeadMs: 180,
        enterPageMs: 880,
        overlayBoost: 0.23,
        pageshowOverlayBoost: 0.18,
        navFreshMs: 10000
    });

    // 登录页进入首页的特殊过渡配置：控制变蓝、气泡、下潜滑动和入场恢复的独立节奏。
    const SPECIAL_TRANSITION_LOGIN_HOME = 'login-home-ocean';
    const NAV_TRANSITION_OCEAN = 'ocean-layer-nav';
    const LOGIN_HOME_SPECIAL = Object.freeze({
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
    });
    // 首页和行程页之间的专用潜浮配置：
    // home -> trip 更像继续下潜，所以节奏更深、更慢；
    // trip -> home 更像上浮回入口，所以会把海水层从深蓝慢慢推回更浅一点。
    const OCEAN_NAV = Object.freeze({
        diveExitMs: 1460,
        diveEnterMs: 1280,
        surfaceExitMs: 1520,
        surfaceEnterMs: 1340,
        navigateLeadMs: 240,
        overlayBoost: 0.2,
        pageshowOverlayBoost: 0.14
    });

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
    function formatDepth(depth) {
        return `${Math.round(depth)}m`;
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
            // 首页滚动深度状态：记录 section 深度停靠点、是否已启用滚动联动，以及当前缓动目标。
            this.homeScrollDepthStops = [];
            this.homeScrollDepthEnabled = false;
            this.homeScrollFrameId = 0;
            this.homeScrollSyncTimerId = 0;
            this.homeScrollTargetDepth = null;
            this.homeDiveMatchDepth = null;

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

            const incomingState = this.consumeIncomingNavState();
            if (incomingState && incomingState.specialTransition === SPECIAL_TRANSITION_LOGIN_HOME) {
                this.currentDepth = incomingState.toDepth;
                this.overlayBoost = incomingState.overlayBoost;
                this.renderDepth(this.currentDepth);
                this.startLoginHomeEntryTransition(incomingState);
                // 登录页专用过渡结束后，再把首页深度交给滚动 section 接管，避免刚入场就和滚动逻辑抢状态。
                if (this.pageId === 'home') {
                    this.scheduleHomeScrollDepthSync(LOGIN_HOME_SPECIAL.entryMs + 200);
                }
            } else if (incomingState && incomingState.animatedOnSource) {
                this.currentDepth = incomingState.toDepth;
                this.overlayBoost = incomingState.overlayBoost;
                this.renderDepth(this.currentDepth);
                this.startEntryTransition(incomingState.visualDirection, {
                    animateDepth: false,
                    entryClass: incomingState.entryClass,
                    targetDepth: incomingState.toDepth,
                    overlayBoostStart: incomingState.overlayBoost,
                    duration: incomingState.entryDuration
                });
                // 其他页面进入首页时，也等通用入场动画收完，再启用首页分层深度。
                if (this.pageId === 'home') {
                    this.scheduleHomeScrollDepthSync((readNumber(incomingState.entryDuration) ?? TRANSITION.enterPageMs) + 200);
                }
            } else {
                this.overlayBoost = 0;
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
                    this.scheduleHomeScrollDepthSync(2060);
                } else {
                    this.finishDepth(this.targetDepth);
                }
            }

            this.setupHomeScrollDepth();
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

            for (let depth = MAX_DEPTH; depth >= MIN_DEPTH; depth -= STEP) {
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
                    label.textContent = `${depth}m`;

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

            container.innerHTML = '';
            container.appendChild(fragment);
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

            if (this.homeScrollFrameId) {
                cancelAnimationFrame(this.homeScrollFrameId);
                this.homeScrollFrameId = 0;
            }

            if (this.homeScrollSyncTimerId) {
                window.clearTimeout(this.homeScrollSyncTimerId);
                this.homeScrollSyncTimerId = 0;
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
            const depthText = formatDepth(safeDepth);

            if (this.leftCurrent) {
                this.leftCurrent.textContent = depthText;
            }

            if (this.rightCurrent) {
                this.rightCurrent.textContent = depthText;
            }

            this.updateMarkersForContainer(this.leftMarkersContainer, safeDepth);
            this.updateMarkersForContainer(this.rightMarkersContainer, safeDepth);
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

        // 首页滚动深度：根据 section 所在位置持续计算当前海层，让浏览过程像继续下潜。
        // 这一组方法只在 home 页启用，不会影响第一页到第二页的专用过渡。
        /**
         * setupHomeScrollDepth() - 注册首页 section 分层深度的滚动监听和初始化引用
         * @returns {void} - 无返回值，直接准备首页滚动深度逻辑
         */
        /**
         * setHomeDiveMatchDepth(depth) - 接收首页 Dive Match 当前分类的细分深度并平滑推进深度计
         * @param {number} depth - 当前匹配分类对应的目标深度
         * @returns {void} - 无返回值，直接刷新首页滚动深度目标
         */
        setHomeDiveMatchDepth(depth) {
            const safeDepth = readNumber(depth);
            this.homeDiveMatchDepth = safeDepth === null ? null : clamp(safeDepth, MIN_DEPTH, MAX_DEPTH);

            if (this.pageId !== 'home' || !this.homeScrollDepthEnabled) {
                return;
            }

            this.homeScrollTargetDepth = this.computeHomeScrollDepth();

            if (this.homeScrollFrameId) {
                return;
            }

            this.homeScrollFrameId = requestAnimationFrame(() => {
                this.stepHomeScrollDepth();
            });
        }

        setupHomeScrollDepth() {
            if (this.pageId !== 'home') {
                return;
            }

            // 把 selector 配置解析成真实 DOM，后续计算时直接使用元素位置。
            this.homeScrollDepthStops = HOME_SECTION_DEPTH_STOPS
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

            if (this.homeScrollDepthStops.length === 0) {
                return;
            }

            // 首页滚动和 resize 都会影响 section 在视口中的位置，所以两者都需要触发深度重算。
            window.addEventListener('scroll', () => {
                this.queueHomeScrollDepthUpdate();
            }, { passive: true });

            window.addEventListener('resize', () => {
                this.queueHomeScrollDepthUpdate();
            }, { passive: true });
        }

        /**
         * scheduleHomeScrollDepthSync(delayMs) - 在首页入场结束后延迟启用 section 深度联动
         * @param {number} delayMs - 延迟启用的毫秒数
         * @returns {void} - 无返回值，直接登记启用时机
         */
        scheduleHomeScrollDepthSync(delayMs = 0) {
            if (this.pageId !== 'home') {
                return;
            }

            if (this.homeScrollSyncTimerId) {
                window.clearTimeout(this.homeScrollSyncTimerId);
                this.homeScrollSyncTimerId = 0;
            }

            const enable = () => {
                this.homeScrollDepthEnabled = true;
                this.homeScrollSyncTimerId = 0;
                this.queueHomeScrollDepthUpdate();
            };

            if (delayMs <= 0) {
                enable();
                return;
            }

            this.homeScrollDepthEnabled = false;
            this.homeScrollSyncTimerId = window.setTimeout(enable, delayMs);
        }

        /**
         * queueHomeScrollDepthUpdate() - 请求下一帧刷新首页 section 驱动的目标深度
         * @returns {void} - 无返回值，直接排队执行深度同步
         */
        queueHomeScrollDepthUpdate() {
            if (
                this.pageId !== 'home' ||
                !this.homeScrollDepthEnabled ||
                this.isNavigating ||
                this.specialTransitionMode
            ) {
                return;
            }

            this.homeScrollTargetDepth = this.computeHomeScrollDepth();

            if (this.homeScrollFrameId) {
                return;
            }

            this.homeScrollFrameId = requestAnimationFrame(() => {
                this.stepHomeScrollDepth();
            });
        }

        /**
         * computeHomeScrollDepth() - 根据首页各 section 的滚动位置计算当前应显示的深度
         * @returns {number} - 当前滚动位置对应的目标深度
         */
        computeHomeScrollDepth() {
            if (this.homeScrollDepthStops.length === 0) {
                return this.targetDepth;
            }

            const scrollY = window.scrollY || window.pageYOffset || 0;
            // 每个 section 都会换算成一个滚动阈值，滚动位置落在哪两个阈值之间，就在那两层深度之间缓慢过渡。
            const points = this.homeScrollDepthStops.map((stop, index) => {
                if (index === 0) {
                    return {
                        selector: stop.selector,
                        depth: stop.depth,
                        threshold: 0
                    };
                }

                return {
                    selector: stop.selector,
                    depth: stop.depth,
                    threshold: Math.max(
                        0,
                        stop.element.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.42
                    )
                };
            });

            let baseDepth = points[0].depth;

            if (scrollY <= points[0].threshold) {
                baseDepth = points[0].depth;
            } else {
                for (let index = 0; index < points.length - 1; index += 1) {
                    const currentPoint = points[index];
                    const nextPoint = points[index + 1];

                    if (scrollY <= nextPoint.threshold) {
                        const range = Math.max(nextPoint.threshold - currentPoint.threshold, 1);
                        const progress = clamp((scrollY - currentPoint.threshold) / range, 0, 1);
                        const eased = easeInOutCubic(progress);
                        baseDepth = currentPoint.depth + (nextPoint.depth - currentPoint.depth) * eased;
                        break;
                    }
                }

                if (scrollY > points[points.length - 1].threshold) {
                    baseDepth = points[points.length - 1].depth;
                }
            }

            if (this.homeDiveMatchDepth === null) {
                return baseDepth;
            }

            const diveMatchPoint = points.find((point) => point.selector === '#dive-match');
            if (!diveMatchPoint || scrollY <= diveMatchPoint.threshold) {
                return baseDepth;
            }

            const blendRange = Math.max(window.innerHeight * 0.22, 160);
            const blendProgress = clamp((scrollY - diveMatchPoint.threshold) / blendRange, 0, 1);
            const easedBlend = easeInOutCubic(blendProgress);
            return baseDepth + (this.homeDiveMatchDepth - baseDepth) * easedBlend;
        }

        /**
         * stepHomeScrollDepth() - 以缓和阻尼方式把首页深度显示推进到当前 section 目标深度
         * @returns {void} - 无返回值，直接更新深度计显示
         */
        stepHomeScrollDepth() {
            this.homeScrollFrameId = 0;

            if (
                this.pageId !== 'home' ||
                !this.homeScrollDepthEnabled ||
                this.isNavigating ||
                this.specialTransitionMode
            ) {
                return;
            }

            // 这里不用 animateDepth 做固定时长动画，而是每帧按差值推进，形成更像水下阻尼的深度变化。
            const targetDepth = clamp(
                this.homeScrollTargetDepth ?? this.computeHomeScrollDepth(),
                MIN_DEPTH,
                MAX_DEPTH
            );
            const delta = targetDepth - this.currentDepth;

            if (Math.abs(delta) <= 0.05) {
                this.currentDepth = targetDepth;
                this.renderDepth(targetDepth);
                sessionStorage.setItem(STORAGE_KEY_CURRENT, String(Math.round(targetDepth)));
                return;
            }

            const nextDepth = this.currentDepth + delta * 0.1;
            this.currentDepth = clamp(nextDepth, MIN_DEPTH, MAX_DEPTH);
            this.renderDepth(this.currentDepth);
            sessionStorage.setItem(STORAGE_KEY_CURRENT, String(Math.round(this.currentDepth)));

            this.homeScrollFrameId = requestAnimationFrame(() => {
                this.stepHomeScrollDepth();
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

        // 通用切页控制：负责设置过渡 class、时长、覆盖层和入场/离场清理时机。
        /**
         * applyTransitionClass(className) - 应用当前页面切换所需的主动画 class
         * @param {string} className - 需要添加的动画 class
         * @returns {void} - 无返回值，直接更新页面 class
         */
        applyTransitionClass(className) {
            this.clearTransitionClasses();
            this.body.classList.add('page-transition-active', className);
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
                sessionStorage.setItem(STORAGE_KEY_NAV, JSON.stringify(navState));
                sessionStorage.setItem(STORAGE_KEY_CURRENT, String(Math.round(toDepth)));
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
                    if (this.pageId === 'home') {
                        this.scheduleHomeScrollDepthSync(0);
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

                if (this.pageId === 'home') {
                    this.scheduleHomeScrollDepthSync(pageshowConfig.entryDuration + 200);
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
    window.DepthManager = new DepthManager();
})();
