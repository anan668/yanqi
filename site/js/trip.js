/* ============================================
   行程页脚本逻辑 - trip.js
   ============================================
   职责：
   1. 驱动行程控制台的海域、日期、人数选择与浮层交互。
   2. 实时联动摘要区、已收进行程、准备系统和跨页导航。
   3. 把行程页组织成“继续安排行程”的连续体验，而不是普通表单页。
   阅读顺序：
   1. 页面滚动与导航
   2. 行程控制台主控
   3. 准备系统
   4. 已收进行程渲染
   5. DOMContentLoaded 初始化
*/

// 准备系统配置：集中定义三张准备卡片的标题、摘要和模板映射，供下方准备系统统一读取。
const sharedDiverProfile = window.YanqiDiverProfile || null;
const sharedSpotWindowConfig = window.YanqiSpotWindowConfig || null;
const TRIP_SPOT_ID_MAP = Object.freeze({
    sipadan: 1,
    palau: 2,
    'blue-hole': 3,
    bohol: 4,
    'maldives-north-atoll': 5,
    bunaken: 6,
    komodo: 7,
    tuamotu: 8,
    mabul: 9,
    'maldives-liveaboard': 10,
    coron: 11,
    'racha-island': 13,
    'redang-island': 14
});

const PREP_CONTENT = Object.freeze({
    gear: {
        kicker: 'Equipment & Rhythm',
        title: '\u88c5\u5907\u4e0e\u8282\u594f',
        summary: '\u76d0\u61a9\u4f1a\u5148\u5e2e\u4f60\u786e\u8ba4\u88c5\u5907\u8fb9\u754c\u3001\u79df\u501f\u5206\u914d\u4e0e\u4e0a\u8239\u524d\u7684\u6838\u5bf9\u8282\u594f\uff0c\u518d\u628a\u8fd9\u4e9b\u5224\u65ad\u6536\u6210\u4e00\u6761\u53ef\u4ee5\u5b89\u5fc3\u6267\u884c\u7684\u51fa\u53d1\u7ebf\u3002',
        templateId: 'prep-template-gear'
    },
    certification: {
        kicker: 'Certification Path',
        title: '\u8bc1\u4e66\u4e0e\u7b49\u7ea7',
        summary: '\u4e0d\u53ea\u770b\u5361\u9762\u7b80\u79f0\u3002\u76d0\u61a9\u4f1a\u7ed3\u5408\u53d1\u8bc1\u673a\u6784\u3001\u8fd1\u671f\u4e0b\u6f5c\u72b6\u6001\u4e0e\u6d77\u51b5\u5f3a\u5ea6\uff0c\u786e\u8ba4\u4f60\u66f4\u9002\u5408\u600e\u6837\u7684\u4e0b\u6f5c\u5b89\u6392\u3002',
        templateId: 'prep-template-certification'
    },
    weather: {
        kicker: 'Weather Window',
        title: '\u5929\u6c14\u4e0e\u7a97\u53e3',
        summary: '\u76d0\u61a9\u4f1a\u6301\u7eed\u770b\u98ce\u6d6a\u3001\u80fd\u89c1\u5ea6\u4e0e\u6d0b\u6d41\u53d8\u5316\uff0c\u5e2e\u4f60\u786e\u8ba4\u662f\u6309\u539f\u8ba1\u5212\u51fa\u53d1\uff0c\u8fd8\u662f\u6362\u5230\u66f4\u7a33\u7684\u4e00\u6bb5\u6f6e\u6c50\u3002',
        templateId: 'prep-template-weather'
    },
    body: {
        kicker: 'Body & State',
        title: '身体与状态',
        summary: '在证书、装备和天气之外，也要先看身体是否已经准备好进入这一潜。盐憩会把恢复、耳压与第一潜节奏一起收进判断里。',
        templateId: 'prep-template-body'
    }
});

const HOME_SCROLL_STORAGE_KEY = 'YANQI_HOME_SCROLL_TARGET';
const HOME_ENTRY_DEPTH_STORAGE_KEY = 'YANQI_HOME_ENTRY_DEPTH';

function resolveTripSpotId(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) {
        return 0;
    }

    if (/^\d+$/.test(rawValue)) {
        return Number.parseInt(rawValue, 10);
    }

    return TRIP_SPOT_ID_MAP[rawValue] || 0;
}

function getTripDiverProfile() {
    return sharedDiverProfile?.getProfile?.() || null;
}

function getTripWindowConfigBySpotId(spotId) {
    return sharedSpotWindowConfig?.getBySpotId?.(spotId) || null;
}

function getTripWindowLabelByStatus(status) {
    return sharedSpotWindowConfig?.getStatusLabel?.(status) || '可行窗口';
}

/**
 * storePendingHomeScrollTarget(targetSelector) - 记录跨页回首页后需要自动对齐的 section
 * @param {string} targetSelector - 首页内需要恢复滚动的目标选择器
 * @returns {void} - 无返回值，直接写入 sessionStorage
 */
function storePendingHomeScrollTarget(targetSelector) {
    if (!targetSelector) {
        return;
    }

    try {
        sessionStorage.setItem(HOME_SCROLL_STORAGE_KEY, JSON.stringify({
            target: targetSelector,
            at: Date.now()
        }));
    } catch (error) {
        // 忽略存储失败，避免影响正常跳页。
    }
}

/**
 * storePendingHomeEntryDepth(targetSelector, depth) - 记录回到首页时应先稳定到的目标深度
 * @param {string} targetSelector - 首页内需要恢复的目标选择器
 * @param {number} depth - 需要优先进入的首页深度
 * @returns {void} - 无返回值，直接写入 sessionStorage
 */
function storePendingHomeEntryDepth(targetSelector, depth) {
    if (!targetSelector || !Number.isFinite(depth)) {
        return;
    }

    try {
        sessionStorage.setItem(HOME_ENTRY_DEPTH_STORAGE_KEY, JSON.stringify({
            target: targetSelector,
            depth,
            at: Date.now()
        }));
    } catch (error) {
        // 忽略存储失败，避免影响正常跳页。
    }
}

// 统一导航入口：让行程页跳转回首页或其他页面时保持深度层级一致。
/**
 * navigateWithDepth(url) - 带深度切换效果地跳转到目标页。
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

// 页面内滚动工具：负责行程页导航与按钮在不。section 之间做平滑移动。
/**
 * scrollToSection(targetSelector, duration) - 平滑滚动到行程页指定区块
 * @param {string} targetSelector - 目标区块选择器
 * @param {number} duration - 滚动动画时长
 * @returns {void} - 无返回值，直接执行滚动
 */
function scrollToSection(targetSelector, duration) {
    if (!targetSelector) {
        return;
    }

    const target = document.querySelector(targetSelector);
    if (!target) {
        return;
    }

    const navbar = document.querySelector('.navbar');
    const offset = navbar ? navbar.offsetHeight + 14 : 0;
    const mood = resolveTripScrollMood(targetSelector);

    if (window.OceanScroll && typeof window.OceanScroll.toSelector === 'function') {
        window.OceanScroll.toSelector(targetSelector, {
            offset,
            duration: duration || 1580,
            mood
        });
        return;
    }

    window.scrollTo(0, Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset));
}

function resolveTripScrollMood(targetSelector) {
    if (!targetSelector) {
        return 'midwater';
    }

    if (targetSelector === '#plannerDeskControl' || targetSelector === '#plannerSummary') {
        return 'deep';
    }

    if (targetSelector === '#trip-layer') {
        return 'midwater';
    }

    if (targetSelector === '#trip-prep' || targetSelector === '#tripFooter') {
        return 'surface';
    }

    return 'midwater';
}

function applyTripRevealPreset(elements, className) {
    if (!className) {
        return;
    }

    const targets = Array.isArray(elements) ? elements : [elements];
    targets
        .filter((element) => element instanceof Element)
        .forEach((element) => element.classList.add(className));
}

/**
 * restartTransientClassAnimation(element, className) - 用下一帧重新挂载状态类，避免为了重启动画强制回流。
 * @param {HTMLElement|null} element - 目标节点
 * @param {string} className - 需要重启的状态类
 * @returns {void}
 */
function restartTransientClassAnimation(element, className) {
    if (!element || !className) {
        return;
    }

    element.classList.remove(className);
    window.requestAnimationFrame(() => {
        if (element.isConnected) {
            element.classList.add(className);
        }
    });
}

// 绑定行程页顶部导航和带 data-scroll-target 的内部跳转链接。
/**
 * setupTripScrollLinks() - 绑定行程页顶部导航和内部滚动链接
 * @returns {void} - 无返回值，直接注册事件监听
 */
function setupTripScrollLinks() {
    const tripLink = document.querySelector('.nav-link.active');
    if (tripLink) {
        tripLink.addEventListener('click', (event) => {
            event.preventDefault();

            if ((window.scrollY || window.pageYOffset) <= 4) {
                return;
            }

            if (window.OceanScroll && typeof window.OceanScroll.animateTo === 'function') {
                window.OceanScroll.animateTo(0, { duration: 1960 });
                return;
            }

            window.scrollTo(0, 0);
        });
    }

    document.querySelectorAll('[data-scroll-target]').forEach((trigger) => {
        if (trigger.classList.contains('planner-submit-btn')) {
            return;
        }

        trigger.addEventListener('click', (event) => {
            event.preventDefault();
            scrollToSection(trigger.dataset.scrollTarget, 1640);
        });
    });

    document.querySelectorAll('a[href^="home.html#"]').forEach((link) => {
        link.addEventListener('click', (event) => {
            const rawHref = link.getAttribute('href') || '';
            const hashIndex = rawHref.indexOf('#');
            const targetSelector = hashIndex >= 0 ? rawHref.slice(hashIndex) : '';

            if (!targetSelector) {
                return;
            }

            event.preventDefault();
            storePendingHomeScrollTarget(targetSelector);
            if (targetSelector === '#featured-destinations') {
                storePendingHomeEntryDepth(targetSelector, -12);
            }
            navigateWithDepth(rawHref);
        });
    });
}

/**
 * setupBackToTop() - 初始化行程页返回顶部按钮的显示与点击行为
 * @returns {void} - 无返回值，直接注册滚动和点击事件
 */
function setupBackToTop() {
    const button = document.getElementById('back-to-top');
    let updateRaf = 0;
    if (!button) {
        return;
    }

    const syncButtonState = () => {
        updateRaf = 0;
        button.classList.toggle('visible', window.pageYOffset > 300);
    };

    const requestButtonStateSync = () => {
        if (updateRaf) {
            return;
        }

        updateRaf = window.requestAnimationFrame(syncButtonState);
    };

    window.addEventListener('scroll', requestButtonStateSync, { passive: true });
    requestButtonStateSync();

    button.addEventListener('click', () => {
        if (window.OceanScroll && typeof window.OceanScroll.animateTo === 'function') {
            window.OceanScroll.animateTo(0, { duration: 1760 });
            return;
        }

        window.scrollTo(0, 0);
    });
}

// 行程页海图导览：把“回到浅层 / 看已收进行程 / 跳到行程控制台”收成一组浮层导览入口。
class TripSeaGuide {
    /**
     * constructor() - 初始化行程页海图导览的 DOM 引用和内部状态
     */
    constructor() {
        this.guide = document.getElementById('tripSeaGuide');
        this.trigger = document.getElementById('tripSeaGuideTrigger');
        this.panel = document.getElementById('tripSeaGuidePanel');
        this.entries = Array.from(document.querySelectorAll('#tripSeaGuide .sea-guide-entry'));
        this.isOpen = false;
        this.updateRaf = 0;
        this.measureRaf = 0;
        this.navOffset = Number.NaN;
        this.targetTops = new Map();
        this.targetMetrics = [];
        this.resizeObserver = null;

        if (this.guide && this.trigger && this.panel && this.entries.length) {
            this.init();
        }
    }

    /**
     * getOffset() - 计算海图导览滚动时需要避开的固定导航高度
     * @returns {number} - 顶部偏移量
     */
    getOffset(forceMeasure = false) {
        if (!forceMeasure && Number.isFinite(this.navOffset)) {
            return this.navOffset;
        }

        const navbar = document.querySelector('.navbar');
        this.navOffset = (navbar ? navbar.offsetHeight : 72) + 18;
        return this.navOffset;
    }

    /**
     * getProbeTarget(selector) - 获取用于判断当前 section 的锚点元素
     * @param {string} selector - 条目指向的目标选择器
     * @returns {Element|null} - 用于高亮判断的 DOM 元素
     */
    getProbeTarget(selector) {
        return selector ? document.querySelector(selector) : null;
    }

    /**
     * measureTargets() - 预先测量海图导览各 section 的绝对位置，避免滚动时反复读布局
     * @returns {void}
     */
    measureTargets() {
        const offset = this.getOffset(true);
        this.targetTops.clear();
        this.targetMetrics = [];

        this.entries.forEach((entry) => {
            const selector = entry.dataset.target;
            const target = this.getProbeTarget(selector);
            if (!selector || !target) {
                return;
            }

            const top = target.getBoundingClientRect().top + window.scrollY - offset;
            this.targetTops.set(
                selector,
                top
            );
            this.targetMetrics.push({
                key: entry.dataset.key || '',
                selector,
                top
            });
        });
    }

    /**
     * scheduleMeasureTargets() - 把 section 位置重测压到下一帧，避免 resize/布局变化时重复执行
     * @returns {void}
     */
    scheduleMeasureTargets() {
        if (this.measureRaf) {
            return;
        }

        this.measureRaf = window.requestAnimationFrame(() => {
            this.measureRaf = 0;
            this.measureTargets();
        });
    }

    /**
     * setOpen(isOpen) - 切换海图导览面板的展开和收起状态
     * @param {boolean} isOpen - 是否展开面板
     * @returns {void} - 无返回值，直接更新海图导览状态
     */
    setOpen(isOpen) {
        this.isOpen = Boolean(isOpen);
        this.guide.classList.toggle('is-open', this.isOpen);
        this.trigger.setAttribute('aria-expanded', String(this.isOpen));
        this.panel.setAttribute('aria-hidden', String(!this.isOpen));
    }

    /**
     * scrollToTarget(selector) - 根据条目平滑滚动到行程页对应区块
     * @param {string} selector - 目标区块选择器
     * @returns {void} - 无返回值，直接触发行程页滚动
     */
    scrollToTarget(selector) {
        if (!selector) {
            return;
        }

        scrollToSection(selector, 1560);
    }

    /**
     * getCurrentKey() - 计算当前更接近哪一个行程页区块
     * @returns {string} - 当前 section 对应的海图 key
     */
    getCurrentKey() {
        if (!this.targetMetrics.length) {
            return '';
        }

        const probeY = window.scrollY + this.getOffset() + Math.min(window.innerHeight * 0.24, 220);
        let currentKey = this.targetMetrics[0].key || '';

        this.targetMetrics.forEach((metric) => {
            if (probeY >= metric.top - 24) {
                currentKey = metric.key || currentKey;
            }
        });

        return currentKey;
    }

    /**
     * updateState() - 同步海图导览的显隐、深层状态和当前 section 高亮
     * @returns {void} - 无返回值，直接更新 DOM 状态
     */
    updateState() {
        const scrollTop = window.scrollY || window.pageYOffset || 0;
        const isVisible = scrollTop > 180;
        const isDeep = scrollTop > Math.max(window.innerHeight * 0.9, 860);
        const currentKey = this.getCurrentKey();

        this.guide.classList.toggle('is-visible', isVisible);
        this.guide.classList.toggle('is-deep', isDeep);
        this.guide.setAttribute('aria-hidden', String(!isVisible));

        this.entries.forEach((entry) => {
            const isCurrent = entry.dataset.key === currentKey;
            entry.classList.toggle('is-current', isCurrent);
            entry.setAttribute('aria-current', isCurrent ? 'true' : 'false');
        });
    }

    /**
     * init() - 绑定海图导览的展开、关闭、滚动同步和点击跳转逻辑
     * @returns {void} - 无返回值，直接注册交互事件
     */
    init() {
        const requestStateUpdate = () => {
            if (this.updateRaf) {
                return;
            }

            this.updateRaf = window.requestAnimationFrame(() => {
                this.updateRaf = 0;
                this.updateState();
            });
        };
        const handleLayoutChange = () => {
            this.scheduleMeasureTargets();
            requestStateUpdate();
        };

        this.trigger.addEventListener('click', (event) => {
            event.preventDefault();
            this.setOpen(!this.isOpen);
        });

        this.entries.forEach((entry) => {
            entry.addEventListener('click', () => {
                this.setOpen(false);
                this.scrollToTarget(entry.dataset.target);
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

        window.addEventListener('scroll', requestStateUpdate, { passive: true });
        window.addEventListener('resize', handleLayoutChange);

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
        window.setTimeout(() => {
            this.measureTargets();
            this.updateState();
        }, 80);
    }
}

// 行程控制台主控逻辑：
// 1. 管理海域 / 日期 / 人数三个字段的当前选择。
// 2. 控制三个浮层的打开、关闭、定位与联动。
// 3. 把字段结果实时回写到回执层和“已收进行程”。
// 4. 在桌面端与移动端之间维持一致的交互节奏。
/**
 * setupPlannerSummary() - 监听行程控制台输入并实时更新摘要卡片
 * @returns {void} - 无返回值，直接绑定表单输入事件
 */
function setupPlannerSummary() {
    const store = getTripStore();

    // 这里把控制台拆成“真实字段值 / 视觉字段 / 摘要卡 / 浮层 / 日历”几组引用。
    // 后面不管是恢复草稿、切换浮层还是提交行程，都会围绕这几组节点同步状态。
    const spotInput = document.getElementById('plannerSpot');
    const dateInput = document.getElementById('plannerDate');
    const peopleInput = document.getElementById('plannerPeople');

    const summaryRoot = document.getElementById('plannerSummary');
    const summaryIntro = document.getElementById('plannerSummaryIntro');
    const summaryActiveIndex = document.getElementById('plannerSummaryActiveIndex');
    const summaryMeterFill = document.getElementById('plannerSummaryMeterFill');
    const summaryMeterOrbs = Array.from(document.querySelectorAll('#plannerSummary .planner-summary-meter-orb'));
    const summarySwimStage = document.getElementById('plannerSummarySwimStage');
    const summarySwimViewport = document.getElementById('plannerSummarySwimViewport');
    const summaryPrevNeighbor = document.getElementById('plannerSummaryPrevNeighbor');
    const summaryNextNeighbor = document.getElementById('plannerSummaryNextNeighbor');
    const summarySwitchLive = document.getElementById('plannerSummarySwitchLive');
    const initialSummaryDeck = summarySwimViewport?.querySelector('.planner-summary-swim-deck') || null;

    const spotField = document.querySelector('[data-planner-field="spot"]');
    const dateField = document.querySelector('[data-planner-field="date"]');
    const peopleField = document.querySelector('[data-planner-field="people"]');

    const spotTrigger = document.getElementById('plannerSpotTrigger');
    const dateTrigger = document.getElementById('plannerDateTrigger');
    const peopleTrigger = document.getElementById('plannerPeopleTrigger');
    const plannerDeskControl = document.getElementById('plannerDeskControl');
    const plannerBookingSwitcher = document.getElementById('plannerBookingSwitcher');
    const plannerBookingSwitcherTrack = document.getElementById('plannerBookingSwitcherTrack');
    const plannerBookingSwitcherNote = document.getElementById('plannerBookingSwitcherNote');
    const submitButton = document.querySelector('#plannerDeskControl .planner-submit-btn');
    const submitButtonInner = submitButton?.querySelector('.planner-submit-btn-inner');
    const submitButtonLabel = submitButton?.querySelector('.planner-submit-btn-label');

    const spotPanel = document.getElementById('plannerSpotPanel');
    const datePanel = document.getElementById('plannerDatePanel');
    const peoplePanel = document.getElementById('plannerPeoplePanel');
    const floatingLayer = document.getElementById('plannerFloatingLayer');

    const spotValue = document.getElementById('plannerSpotValue');
    const spotHint = document.getElementById('plannerSpotHint');
    const dateValue = document.getElementById('plannerDateValue');
    const dateHint = document.getElementById('plannerDateHint');
    const peopleValue = document.getElementById('plannerPeopleValue');
    const peopleHint = document.getElementById('plannerPeopleHint');
    const customPeopleBox = document.getElementById('plannerCustomPeople');
    const customPeopleInput = document.getElementById('plannerCustomPeopleInput');
    const customPeopleApply = document.getElementById('plannerCustomPeopleApply');

    const calendarMonth = document.getElementById('plannerCalendarMonth');
    const calendarGrid = document.getElementById('plannerCalendarGrid');
    const calendarPrev = document.getElementById('plannerCalendarPrev');
    const calendarNext = document.getElementById('plannerCalendarNext');
    const tripLayerLead = document.getElementById('tripLayerLead');
    const tripPrepLead = document.getElementById('tripPrepLead');

    if (
        !spotInput ||
        !dateInput ||
        !peopleInput ||
        !summaryRoot ||
        !summaryIntro ||
        !summaryActiveIndex ||
        !summaryMeterFill ||
        !summarySwimStage ||
        !summarySwimViewport ||
        !summaryPrevNeighbor ||
        !summaryNextNeighbor ||
        !summarySwitchLive ||
        !spotField ||
        !dateField ||
        !peopleField ||
        !spotTrigger ||
        !dateTrigger ||
        !peopleTrigger ||
        !plannerDeskControl ||
        !plannerBookingSwitcher ||
        !plannerBookingSwitcherTrack ||
        !plannerBookingSwitcherNote ||
        !submitButton ||
        !submitButtonInner ||
        !submitButtonLabel ||
        !spotPanel ||
        !datePanel ||
        !peoplePanel ||
        !floatingLayer ||
        !spotValue ||
        !spotHint ||
        !dateValue ||
        !dateHint ||
        !peopleValue ||
        !peopleHint ||
        !customPeopleBox ||
        !customPeopleInput ||
        !customPeopleApply ||
        !calendarMonth ||
        !calendarGrid ||
        !calendarPrev ||
        !calendarNext
    ) {
        return;
    }

    // 浮层与视口边缘、字段之间的安全距离。
    // 这些值会同时影响“是否向上展开”和“最终能留出多少呼吸空间”。
    const PANEL_MARGIN = 16;
    const PANEL_GAP = 14;
    const PROGRESSIVE_ORDER = ['spot', 'date', 'people'];

    const COPY = {
        spot: {
            emptyLabel: '海域尚未落定',
            emptyHint: '先决定，这一次要把自己交给哪片蓝'
        },
        date: {
            emptyLabel: '仍在等一段合适的潮汐',
            emptyHint: '让天气、光线与节奏更从容一些',
            filledHint: '这一段潮汐，适合慢慢出发'
        },
        people: {
            emptyLabel: '同行尚未写进这次下潜',
            emptyHint: '决定这趟海会以怎样的节奏发生'
        }
    };
    const LOCKED_HINTS = {
        date: '\u5148\u8ba9\u6d77\u57df\u843d\u4f4d\uff0c\u51fa\u53d1\u7684\u6f6e\u6c50\u7a97\u53e3\u624d\u4f1a\u6162\u6162\u6d6e\u51fa\u6765',
        people: '\u5148\u628a\u51fa\u53d1\u65f6\u95f4\u5199\u8fdb\u6765\uff0c\u540c\u884c\u7684\u8282\u594f\u518d\u7ee7\u7eed\u5f20\u5f00'
    };
    const SUBMIT_FEEDBACK_COPY = {
        idle: {
            button: '\u5148\u5f80\u4e0b\u4e00\u5c42\u770b\u770b',
            status: '\u8fd9\u4e00\u5c42\u8fd8\u7559\u7740\u7a7a\u767d\uff0c\u4e5f\u53ef\u4ee5\u5148\u7ee7\u7eed\u5f80\u4e0b\u770b\uff0c\u540e\u9762\u518d\u6162\u6162\u8865\u9f50\u3002'
        },
        progress: {
            button: '\u8fd9\u4e00\u5c42\u5148\u66ff\u4f60\u6536\u4f4f',
            status: '\u8fd9\u4e00\u5c42\u5b89\u6392\u5df2\u7ecf\u5148\u66ff\u4f60\u6536\u4f4f\u4e86\uff0c\u63a5\u4e0b\u6765\u7ee7\u7eed\u5f80\u66f4\u6df1\u4e00\u5c42\u770b\u3002'
        },
        confirmed: {
            button: '\u5df2\u5199\u8fdb\u884c\u7a0b\uff0c\u7ee7\u7eed\u4e0b\u6f5c',
            status: '\u8fd9\u4e00\u6b21\u4e0b\u6f5c\u5df2\u7ecf\u5199\u8fdb\u884c\u7a0b\u4e86\uff0c\u63a5\u4e0b\u6765\u7ee7\u7eed\u770b\u540e\u9762\u7684\u51c6\u5907\u4e0e\u505c\u9a7b\u3002'
        }
    };
    const SUMMARY_INTRO_COPY = {
        idle: '\u5148\u7559\u4e0b\u4e00\u53e5\u5f88\u8f7b\u7684\u56de\u6267\uff0c\u7b49\u6d77\u57df\u3001\u6f6e\u6c50\u4e0e\u540c\u884c\u8282\u594f\u6162\u6162\u6536\u51fa\u8f6e\u5ed3\u3002',
        date: '\u6d77\u57df\u5df2\u7ecf\u5148\u5199\u8fdb\u6765\uff0c\u8fd9\u5c42\u56de\u6267\u4f1a\u987a\u7740\u540e\u9762\u7684\u5b89\u6392\u7ee7\u7eed\u663e\u5f62\u3002',
        people: '\u6d77\u57df\u548c\u51fa\u53d1\u7a97\u53e3\u90fd\u5df2\u843d\u4f4d\uff0c\u56de\u6267\u5f00\u59cb\u6709\u4e86\u66f4\u6e05\u695a\u7684\u8282\u594f\u3002',
        confirmed: '\u8fd9\u4e00\u6f5c\u7684\u8f6e\u5ed3\u5df2\u7ecf\u88ab\u5b89\u9759\u6536\u4f4f\uff0c\u540e\u9762\u53ea\u9700\u8981\u987a\u7740\u5b83\u7ee7\u7eed\u51c6\u5907\u3002'
    };
    function readInitialSummaryDeckText(slotName, fallbackValue = '') {
        return initialSummaryDeck?.querySelector(`[data-summary-slot="${slotName}"]`)?.textContent?.trim()
            || fallbackValue;
    }

    function readInitialSummaryNeighborText(button, slotName, fallbackValue = '') {
        return button?.querySelector(`[data-summary-neighbor-slot="${slotName}"]`)?.textContent?.trim()
            || fallbackValue;
    }

    const DEFAULT_PLANNER_LINKAGE_COPY = {
        rhythm: readInitialSummaryDeckText('rhythm-sentence')
            || '\u8fd9\u4e00\u6f5c\u8fd8\u7559\u5728\u6d77\u9762\u4e0a\uff0c\u5148\u8ba9\u4e00\u7247\u613f\u610f\u4e0b\u53bb\u7684\u84dd\u6162\u6162\u9760\u8fd1\u3002',
        focusTitle: readInitialSummaryDeckText('focus-title')
            || '\u5148\u628a\u60f3\u770b\u89c1\u7684\u90a3\u4e00\u5c42\u6d77\u8bf4\u6e05\u695a',
        focusCopy: readInitialSummaryDeckText('focus-copy')
            || '\u4e0b\u4e00\u5c42\u4f1a\u5e2e\u4f60\u628a\u6d77\u57df\u3001\u51fa\u53d1\u8282\u594f\u4e0e\u60f3\u7559\u4e0b\u7684\u90a3\u4e00\u9762\uff0c\u6162\u6162\u6536\u6210\u4e00\u8d9f\u66f4\u6e05\u695a\u7684\u6d77\u6d41\u3002',
        prepTitle: readInitialSummaryDeckText('prep-title')
            || '\u51c6\u5907\u53ef\u4ee5\u5148\u505c\u5728\u5224\u65ad\uff0c\u4e0d\u7528\u6025\u7740\u8865\u6e05\u5355',
        prepCopy: readInitialSummaryDeckText('prep-copy')
            || '\u7b49\u6d77\u57df\u548c\u65f6\u95f4\u66f4\u6e05\u695a\u4ee5\u540e\uff0c\u518d\u53bb\u770b\u8bc1\u4e66\u3001\u88c5\u5907\u548c\u5929\u6c14\u7a97\u53e3\uff0c\u4f1a\u66f4\u50cf\u76d0\u61a9\u7684\u51c6\u5907\u65b9\u5f0f\u3002',
        tripLead: tripLayerLead?.textContent?.trim()
            || '\u5148\u4ece\u4f60\u771f\u6b63\u60f3\u770b\u89c1\u4ec0\u4e48\u5f00\u59cb\uff0c\u884c\u7a0b\u624d\u4f1a\u6162\u6162\u6709\u65b9\u5411\u3002',
        prepLead: tripPrepLead?.textContent?.trim()
            || '\u8fd8\u4e0d\u7528\u6025\u7740\u628a\u6240\u6709\u51c6\u5907\u505a\u5b8c\uff0c\u5148\u8ba9\u5224\u65ad\u548c\u6d77\u57df\u4e00\u8d77\u9760\u8fd1\u3002'
    };

    /**
     * readPlannerOptionData(option) - 把海域选项按钮整理成可复用的数据对象
     * @param {HTMLElement} option - 原始选项按钮
     * @returns {{value: string, label: string, note: string, description: string}} - 归一化后的选项数据
     */
    function readPlannerDraftValue(draft, fieldKey) {
        const nextValue = String(draft?.[fieldKey] || '').trim();
        if (nextValue) {
            return nextValue;
        }

        return String(draft?.[`${fieldKey}Value`] || '').trim();
    }

    function buildCustomPeopleLabel(value) {
        return `${value} 人同行`;
    }

    function buildCustomPeopleNote(value) {
        return `这次下潜按 ${value} 人的同行节奏安排。`;
    }

    function applyCustomPeopleState(value, label, note) {
        const safeValue = String(value || '').trim();
        const customOption = peoplePanel.querySelector('.planner-option[data-option-group="people"][data-value="custom"]');
        if (!customOption) {
            return;
        }

        peopleInput.value = safeValue;
        peopleInput.dataset.label = label || buildCustomPeopleLabel(safeValue);
        peopleInput.dataset.note = note || buildCustomPeopleNote(safeValue);
        peopleValue.textContent = peopleInput.dataset.label;
        peopleHint.textContent = peopleInput.dataset.note;
        peopleField.classList.toggle('is-active', Boolean(safeValue));

        peoplePanel.querySelectorAll('.planner-option[data-option-group="people"]').forEach((item) => {
            item.classList.toggle('is-selected', item === customOption);
        });
    }

    function buildPlannerDraftPayload() {
        const hasDate = Boolean(dateInput.value);
        const dateLabel = hasDate ? formatPlannerDate(dateInput.value) : '';
        const activeBooking = getActiveBooking();

        return {
            spot: spotInput.value,
            spotLabel: spotInput.dataset.label || COPY.spot.emptyLabel,
            spotNote: spotInput.dataset.note || COPY.spot.emptyHint,
            date: dateInput.value,
            dateLabel,
            dateNote: hasDate ? COPY.date.filledHint : COPY.date.emptyHint,
            people: peopleInput.value,
            peopleLabel: peopleInput.dataset.label || COPY.people.emptyLabel,
            peopleNote: peopleInput.dataset.note || COPY.people.emptyHint,
            editingMode: activeBooking ? 'confirmed-booking' : 'draft',
            editingEntryId: activeBooking?.entryId || '',
            editingSpotKey: activeBooking?.spotKey || spotInput.value || '',
            editingPackageId: activeBooking?.packageId || ''
        };
    }

    function persistPlannerDraft() {
        if (!store || typeof store.savePlannerDraft !== 'function') {
            return null;
        }

        return store.savePlannerDraft(buildPlannerDraftPayload());
    }

    function readPlannerOptionData(option) {
        const strong = option?.querySelector('strong');
        const small = option?.querySelector('small');

        return {
            value: option?.dataset.value || '',
            label: option?.dataset.label || strong?.textContent?.trim() || '',
            note: option?.dataset.note || small?.textContent?.trim() || '',
            description: small?.textContent?.trim() || option?.dataset.note || ''
        };
    }

    const initialSpotOptionsData = Array
        .from(spotPanel.querySelectorAll('.planner-option[data-option-group="spot"]'))
        .map((option) => readPlannerOptionData(option));
    const emptySpotOptionData = initialSpotOptionsData.find((option) => option.value === '')
        || {
            value: '',
            label: COPY.spot.emptyLabel,
            note: COPY.spot.emptyHint,
            description: '先让这一潜停在想象里，慢慢等它靠近。'
        };

    // fieldMap 把每个字段相关的 DOM 和默认文案收成一个表。
    // 后面打开、关闭、写值、定位时都能复用同一套逻辑，避免三套近似代码散落各处。
    const fieldMap = {
        spot: {
            input: spotInput,
            field: spotField,
            trigger: spotTrigger,
            panel: spotPanel,
            valueNode: spotValue,
            hintNode: spotHint,
            emptyLabel: COPY.spot.emptyLabel,
            emptyHint: COPY.spot.emptyHint
        },
        date: {
            input: dateInput,
            field: dateField,
            trigger: dateTrigger,
            panel: datePanel,
            valueNode: dateValue,
            hintNode: dateHint,
            emptyLabel: COPY.date.emptyLabel,
            emptyHint: COPY.date.emptyHint
        },
        people: {
            input: peopleInput,
            field: peopleField,
            trigger: peopleTrigger,
            panel: peoplePanel,
            valueNode: peopleValue,
            hintNode: peopleHint,
            emptyLabel: COPY.people.emptyLabel,
            emptyHint: COPY.people.emptyHint
        }
    };

    const summaryMetaMap = {
        spot: {
            valueSlot: 'spot-value',
            metaSlot: 'spot-meta',
            stateSlot: 'spot-state',
            emptyValue: '\u6d77\u57df\u5f85\u5b9a',
            emptyMeta: '\u8fd8\u6ca1\u5199\u8fdb\u56de\u6267\u3002',
            emptyState: '\u5f85\u5199\u5165',
            filledState: '\u5df2\u843d\u4f4d',
            filledMeta: '\u8fd9\u4e00\u7247\u84dd\u5df2\u7ecf\u5148\u843d\u4e0b\u3002'
        },
        date: {
            valueSlot: 'date-value',
            metaSlot: 'date-meta',
            stateSlot: 'date-state',
            emptyValue: '\u65e5\u671f\u5f85\u5b9a',
            emptyMeta: '\u8fd8\u5728\u7b49\u4e00\u6bb5\u66f4\u5408\u9002\u7684\u6f6e\u6c50\u7a97\u53e3\u3002',
            emptyState: '\u5f85\u5199\u5165',
            filledState: '\u5df2\u5199\u5165',
            filledMeta: '\u51fa\u53d1\u7a97\u53e3\u5df2\u7ecf\u5199\u8fdb\u6765\u4e86\u3002'
        },
        people: {
            valueSlot: 'people-value',
            metaSlot: 'people-meta',
            stateSlot: 'people-state',
            emptyValue: '\u4eba\u6570\u5f85\u5b9a',
            emptyMeta: '\u540c\u884c\u8282\u594f\u8fd8\u6ca1\u5199\u8fdb\u6765\u3002',
            emptyState: '\u5f85\u5199\u5165',
            filledState: '\u5df2\u5199\u5165',
            filledMeta: '\u540c\u884c\u8282\u594f\u5df2\u7ecf\u5199\u8fdb\u6765\u4e86\u3002'
        }
    };

    let activePanelKey = null;
    let panelPositionFrame = 0;
    let panelPositionListenersAttached = false;
    let panelLayoutMetrics = new Map();
    let calendarViewDate = null;
    let autoAdvanceTimer = 0;
    let submitContinueTimer = 0;
    let submitFeedbackCountdownTimer = 0;
    let submitFeedbackResetTimer = 0;
    let detachSubmitFeedbackInterrupt = null;
    let hasRenderedSummaryOnce = false;
    let previousSummaryFilledCount = 0;
    let hasInitializedProgressiveState = false;
    let activeBookingEntryId = '';
    let summaryStageSwitchTimer = 0;
    let summaryStageCleanupTimer = 0;
    let summaryStageHeightResetTimer = 0;
    let summaryIsSwitching = false;
    const summaryGestureState = {
        pointerId: null,
        startX: 0,
        startY: 0,
        shiftX: 0,
        claimed: false
    };
    const fieldUnlockTimers = new WeakMap();
    const defaultSubmitButtonLabel = submitButtonLabel.textContent.trim() || '\u786e\u8ba4\u8fd9\u4e00\u5c42\u5b89\u6392';
    const defaultSummaryActiveIndex = summaryActiveIndex.textContent.trim() || '01 / 01';
    const defaultSummaryActiveSpot = readInitialSummaryDeckText('route-spot', '\u5f53\u524d\u6d77\u57df\u5f85\u5b9a');
    const defaultSummaryActivePackage = readInitialSummaryDeckText('active-package', '\u5957\u9910\u5c1a\u672a\u5199\u5165');
    const defaultSummaryActiveCompanion = readInitialSummaryDeckText('active-companion', '\u540c\u884c\u8282\u594f\u5f85\u5b9a');
    const defaultSummaryNeighborStatus = readInitialSummaryNeighborText(summaryPrevNeighbor, 'status', '\u65f6\u95f4\u4e0e\u540c\u884c\u5f85\u6536\u62e2');
    const defaultPlannerSwitcherNote = plannerBookingSwitcherNote.textContent.trim() || '\u5f53\u524d\u53ea\u6574\u7406\u4e00\u6761\u4e0b\u6f5c\u8282\u594f';
    const SUMMARY_SWITCH_DURATION_MS = 780;
    const SUMMARY_SWIPE_TRIGGER_DISTANCE = 58;
    const SUMMARY_SWIPE_CLAIM_DISTANCE = 18;
    const SUMMARY_SWIPE_CLAIM_RATIO = 1.2;

    function getConfirmedBookings() {
        return sortConfirmedBookings(
            store && typeof store.getConfirmedBookings === 'function'
                ? store.getConfirmedBookings()
                : []
        );
    }

    function getBookingByEntryId(entryId, bookings = getConfirmedBookings()) {
        const safeEntryId = String(entryId || '').trim();
        if (!safeEntryId) {
            return null;
        }

        return bookings.find((booking) => String(booking?.entryId || '').trim() === safeEntryId) || null;
    }

    function getMostRecentlyUpdatedBooking(bookings = getConfirmedBookings()) {
        return getMostRecentlyUpdatedConfirmedBooking(bookings);
    }

    function getActiveBooking(bookings = getConfirmedBookings()) {
        return getBookingByEntryId(activeBookingEntryId, bookings);
    }

    function saveActiveBookingSelection(entryId) {
        const safeEntryId = String(entryId || '').trim();
        activeBookingEntryId = safeEntryId;

        if (!store) {
            return safeEntryId;
        }

        if (!safeEntryId) {
            store.clearActiveBookingId?.();
            return '';
        }

        return store.saveActiveBookingId?.(safeEntryId) || safeEntryId;
    }

    function resolveInitialActiveBookingEntryId(bookings = getConfirmedBookings()) {
        if (!Array.isArray(bookings) || bookings.length === 0) {
            return '';
        }

        const storedEntryId = store && typeof store.getActiveBookingId === 'function'
            ? String(store.getActiveBookingId() || '').trim()
            : '';
        if (storedEntryId && getBookingByEntryId(storedEntryId, bookings)) {
            return storedEntryId;
        }

        const liveEntryId = String(activeBookingEntryId || '').trim();
        if (liveEntryId && getBookingByEntryId(liveEntryId, bookings)) {
            return liveEntryId;
        }

        return String(getMostRecentlyUpdatedBooking(bookings)?.entryId || '').trim();
    }

    function isPlannerBoundToConfirmedBooking(bookings = getConfirmedBookings()) {
        return Boolean(getActiveBooking(bookings));
    }

    function buildPlannerBookingSpotOption(booking) {
        const defaultNote = '\u8fd9\u7247\u6d77\u5df2\u7ecf\u6536\u8fdb\u884c\u7a0b\uff0c\u63a5\u4e0b\u6765\u53ef\u4ee5\u7ee7\u7eed\u6574\u7406\u8fd9\u6b21\u4e0b\u6f5c\u7684\u8282\u594f\u3002';
        return {
            value: String(booking?.spotKey || '').trim(),
            label: String(booking?.spotName || COPY.spot.emptyLabel).trim() || COPY.spot.emptyLabel,
            note: String(booking?.spotTagline || defaultNote).trim(),
            description: String(booking?.spotTagline || defaultNote).trim()
        };
    }

    function buildPlannerBookingPackageLabel(booking) {
        const packageLabel = String(booking?.packageTier || booking?.packageTitle || '\u5957\u9910\u5f85\u5b9a').trim();
        const stayLabel = getConfirmedBookingStayLabel(booking);
        return stayLabel && stayLabel !== '\u505c\u7559\u8282\u594f\u5f85\u5b9a'
            ? `${packageLabel} · ${stayLabel}`
            : packageLabel;
    }

    function buildPlannerCompanionChipLabel(activeBooking, hasDate, hasPeople, dateLabel, peopleLabel) {
        if (hasPeople) {
            return peopleLabel;
        }

        if (hasDate) {
            return `\u51fa\u53d1 ${dateLabel}`;
        }

        if (activeBooking) {
            return '\u540c\u884c\u4e0e\u65f6\u95f4\u5f85\u7ee7\u7eed\u6536\u62e2';
        }

        return defaultSummaryActiveCompanion;
    }

    function buildPlannerSwitcherStatusDotsMarkup(booking) {
        const hasDate = Boolean(String(booking?.selectedDate || '').trim());
        const hasPeople = Boolean(String(booking?.selectedPeople || '').trim());

        return `
            <span class="planner-booking-switcher-status-dots" aria-hidden="true">
                <span class="planner-booking-switcher-status-dot planner-booking-switcher-status-dot-date${hasDate ? ' is-ready' : ''}"></span>
                <span class="planner-booking-switcher-status-dot planner-booking-switcher-status-dot-people${hasPeople ? ' is-ready' : ''}"></span>
            </span>
        `;
    }

    function buildPlannerBookingSwitcherMarkup(booking, index, total, isActive) {
        const statusText = [
            booking?.selectedDateLabel ? '\u65f6\u95f4\u5df2\u843d\u4f4d' : '\u65f6\u95f4\u5f85\u6536\u62e2',
            booking?.selectedPeopleLabel ? '\u540c\u884c\u5df2\u843d\u4f4d' : '\u540c\u884c\u5f85\u6536\u62e2'
        ].join(' · ');

        return `
            <button
                type="button"
                class="planner-booking-switcher-chip${isActive ? ' planner-booking-switcher-chip-active is-active' : ''}"
                data-entry-id="${escapeHtml(booking.entryId)}"
                data-active-index="${index + 1}"
                role="tab"
                aria-selected="${isActive ? 'true' : 'false'}"
                aria-label="\u5207\u6362\u5230 ${escapeHtml(booking.spotName || '\u672a\u547d\u540d\u6d77\u57df')} ${escapeHtml(String(index + 1).padStart(2, '0'))} / ${escapeHtml(String(total).padStart(2, '0'))}，${escapeHtml(statusText)}"
            >
                <span class="planner-booking-switcher-chip-dot" aria-hidden="true"></span>
                <span class="planner-booking-switcher-chip-title">${escapeHtml(booking.spotName || '\u672a\u547d\u540d\u6d77\u57df')}</span>
                <span class="planner-booking-switcher-chip-package">${escapeHtml(buildPlannerBookingPackageLabel(booking))}</span>
                <span class="planner-booking-switcher-chip-status">
                    ${buildPlannerSwitcherStatusDotsMarkup(booking)}
                    <span class="planner-booking-switcher-chip-status-text">${escapeHtml(statusText)}</span>
                </span>
            </button>
        `;
    }

    function renderPlannerBookingSwitcher(bookings = getConfirmedBookings()) {
        const safeBookings = Array.isArray(bookings) ? bookings : [];
        const activeBooking = getActiveBooking(safeBookings);
        const total = safeBookings.length;
        const activeIndex = Math.max(0, safeBookings.findIndex((booking) => booking?.entryId === activeBooking?.entryId));

        plannerBookingSwitcher.hidden = total === 0;
        plannerBookingSwitcher.classList.toggle('is-single', total === 1);
        plannerBookingSwitcherTrack.classList.toggle('is-single', total === 1);
        plannerBookingSwitcherTrack.innerHTML = '';

        if (!total) {
            plannerBookingSwitcherNote.textContent = defaultPlannerSwitcherNote;
            return;
        }

        plannerBookingSwitcherNote.textContent = total === 1
            ? '\u8fd9\u4e00\u5c42\u53ea\u5269\u4e0b\u4e00\u6761\u6b63\u5728\u6536\u675f\u7684\u4e0b\u6f5c'
            : `\u6b63\u5728\u6574\u7406 ${String(activeIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')} \u6761\u5df2\u6536\u8fdb\u884c\u7a0b`;
        plannerBookingSwitcherTrack.innerHTML = safeBookings
            .map((booking, index) => buildPlannerBookingSwitcherMarkup(booking, index, total, activeBooking?.entryId === booking.entryId))
            .join('');
    }

    function buildPlannerSubmitActionLabel() {
        const activeBooking = getActiveBooking();
        const hasDate = Boolean(dateInput.value);
        const hasPeople = Boolean(peopleInput.value);
        const spotName = String(activeBooking?.spotName || spotInput.dataset.label || '').trim();

        if (!activeBooking) {
            return defaultSubmitButtonLabel;
        }

        if (hasDate && hasPeople && spotName) {
            return `\u5e26\u7740 ${spotName} \u7ee7\u7eed\u4e0b\u6f5c`;
        }

        if (spotName) {
            return `\u7ee7\u7eed\u6574\u7406 ${spotName}`;
        }

        return defaultSubmitButtonLabel;
    }

    function syncPlannerSubmitActionLabel() {
        const nextLabel = buildPlannerSubmitActionLabel();
        submitButton.dataset.baseLabel = nextLabel;
        submitButtonLabel.textContent = nextLabel;
    }

    function getPlannerSummaryStage(hasSpot, hasDate, hasPeople) {
        if (hasSpot && hasDate && hasPeople) {
            return 'confirmed';
        }

        if (hasSpot && hasDate) {
            return 'people';
        }

        if (hasSpot) {
            return 'date';
        }

        return 'idle';
    }

    function getPlannerSummaryStayLabel(activeBooking, spotValue) {
        if (activeBooking) {
            const stayLabel = getConfirmedBookingStayLabel(activeBooking);
            return stayLabel && stayLabel !== '停留节奏待定' ? stayLabel : '';
        }

        const targetSpot = String(spotValue || '').trim();
        if (!targetSpot || !store || typeof store.getConfirmedBookings !== 'function') {
            return '';
        }

        const bookings = store.getConfirmedBookings();
        if (!Array.isArray(bookings) || bookings.length === 0) {
            return '';
        }

        const currentBooking = bookings.find((booking) => String(booking?.spotKey || '').trim() === targetSpot);
        if (!currentBooking) {
            return '';
        }

        const stayLabel = getConfirmedBookingStayLabel(currentBooking);
        return stayLabel && stayLabel !== '停留节奏待定' ? stayLabel : '';
    }

    function buildPlannerSummaryReceiptCopy({
        hasSpot,
        hasDate,
        hasPeople,
        spotLabel,
        dateLabel,
        peopleLabel,
        stayLabel
    }) {
        const staySegment = stayLabel ? ` · ${stayLabel}` : '';

        if (hasSpot && hasDate && hasPeople) {
            return `已记下 ${spotLabel}${staySegment} · ${dateLabel} · ${peopleLabel}，这一潜已经被海安静收住。`;
        }

        if (hasSpot && hasDate) {
            return `已记下 ${spotLabel}${staySegment} · ${dateLabel}，再把同行节奏写进来，这层回执就会收完整。`;
        }

        if (hasSpot) {
            return `已记下 ${spotLabel}${staySegment}，接下来等一段合适的潮汐把出发写进来。`;
        }

        return '先让回执停在一声很轻的潮响里，等第一片愿意下去的蓝慢慢靠近。';
    }

    function buildPlannerRhythmSentence({
        hasSpot,
        hasDate,
        hasPeople,
        spotLabel,
        dateLabel,
        peopleLabel,
        stayLabel
    }) {
        const staySegment = stayLabel ? `${stayLabel}的停驻感` : '这片海自己的呼吸';

        if (hasSpot && hasDate && hasPeople) {
            return `${spotLabel} 会沿着 ${dateLabel} 这一段潮汐慢慢靠近，${peopleLabel} 的同行节奏也已经写进来，接下来只要顺着 ${staySegment} 继续往下收。`;
        }

        if (hasSpot && hasDate) {
            return `${spotLabel} 已经先落在 ${dateLabel} 这一段光线里，同行节奏还可以再慢慢写进来，这一潜的方向已经开始清楚了。`;
        }

        if (hasSpot) {
            return `${spotLabel} 已经先靠到桌面边，接下来只要等一段更合适的潮汐把出发写下来，这程海就会更像你自己的呼吸。`;
        }

        return DEFAULT_PLANNER_LINKAGE_COPY.rhythm;
    }

    function buildPlannerSummaryGuidance({
        hasSpot,
        hasDate,
        hasPeople,
        spotLabel,
        dateLabel,
        peopleLabel,
        stayLabel
    }) {
        if (hasSpot && hasDate && hasPeople) {
            return {
                focusTitle: '这一程已经有了自己的海流方向',
                focusCopy: `去下一层把 ${spotLabel} 里真正想停下来的那一面说清，后面的 notes 会更适合 ${peopleLabel} 在 ${dateLabel} 这一段安排里慢慢展开。`,
                prepTitle: '潜前准备现在更像一次判断',
                prepCopy: `从证书、装备到天气窗口，都只需要围着 ${spotLabel} 和 ${dateLabel} 这一段安排慢慢核对，不必再把准备做成赶时间的清单。`,
                tripLead: `海域、时间和同行已经安静落位，接下来更适合把 ${spotLabel}${stayLabel ? ` 的 ${stayLabel}` : ''} 真正想留下来的画面说清。`,
                prepLead: `现在去看潜前准备，会更像替 ${spotLabel} 做一次从容判断，而不是临时补作业。`
            };
        }

        if (hasSpot && hasDate) {
            return {
                focusTitle: `顺着 ${dateLabel} 这一段光线，把 ${spotLabel} 的重点再收拢一点`,
                focusCopy: `下一层会继续帮你把这片海真正想停下来的那一面说清，也让后面的行程 notes 更贴近这次出发窗口。`,
                prepTitle: '接下来先确认同行与潜前判断',
                prepCopy: `先把同行节奏写进来，再去看装备、证书和天气窗口，会比现在立刻补清单更稳，也更像盐憩的步调。`,
                tripLead: `${spotLabel} 和 ${dateLabel} 已经先靠近了，下面更适合把这一潜真正想看的内容慢慢排开。`,
                prepLead: '等同行节奏也落位以后，再去看潜前准备，判断会更完整。'
            };
        }

        if (hasSpot) {
            return {
                focusTitle: `先沿着 ${spotLabel}，把这一潜想看的那一面说清楚`,
                focusCopy: stayLabel
                    ? `${spotLabel} 更适合 ${stayLabel} 的停驻，下一层会继续帮你把这片海里最值得停下来的那一面排稳。`
                    : `下一层会继续帮你把这片海里真正想停下来的那一面说清，让行程不只停在“去哪儿”。`,
                prepTitle: `先为 ${spotLabel} 留出一段更合适的窗口`,
                prepCopy: '等出发时间慢慢落下来以后，再去看装备、证书和天气窗口，就不会把准备做成普通搜索栏后面的补充信息。',
                tripLead: `${spotLabel} 已经先靠过来了，下面更适合把这一潜真正想看的那一面慢慢说清。`,
                prepLead: '先别急着把所有事项做完，等这片海的时间窗口更清楚，准备才会更稳。'
            };
        }

        return {
            focusTitle: DEFAULT_PLANNER_LINKAGE_COPY.focusTitle,
            focusCopy: DEFAULT_PLANNER_LINKAGE_COPY.focusCopy,
            prepTitle: DEFAULT_PLANNER_LINKAGE_COPY.prepTitle,
            prepCopy: DEFAULT_PLANNER_LINKAGE_COPY.prepCopy,
            tripLead: DEFAULT_PLANNER_LINKAGE_COPY.tripLead,
            prepLead: DEFAULT_PLANNER_LINKAGE_COPY.prepLead
        };
    }

    function syncPlannerSummaryGuidance(copy) {
        if (tripLayerLead) {
            tripLayerLead.textContent = copy.tripLead;
        }

        if (tripPrepLead) {
            tripPrepLead.textContent = copy.prepLead;
        }
    }

    function getActiveSummaryDeck() {
        return summarySwimViewport.querySelector('.planner-summary-swim-deck.is-deck-active')
            || summarySwimViewport.querySelector('.planner-summary-swim-deck:not(.is-deck-outgoing)')
            || summarySwimViewport.querySelector('.planner-summary-swim-deck');
    }

    function buildPlannerSummaryNeighborStatusLabel(booking) {
        if (!booking) {
            return defaultSummaryNeighborStatus;
        }

        return [
            booking?.selectedDateLabel ? '时间已落位' : '时间待收拢',
            booking?.selectedPeopleLabel ? '同行已落位' : '同行待收拢'
        ].join(' · ');
    }

    function syncPlannerSummaryNeighbor(button, booking) {
        if (!button) {
            return;
        }

        const nameNode = button.querySelector('[data-summary-neighbor-slot="name"]');
        const packageNode = button.querySelector('[data-summary-neighbor-slot="package"]');
        const statusNode = button.querySelector('[data-summary-neighbor-slot="status"]');
        const dateDot = button.querySelector('[data-summary-neighbor-slot="date-dot"]');
        const peopleDot = button.querySelector('[data-summary-neighbor-slot="people-dot"]');

        if (!booking) {
            button.hidden = true;
            button.disabled = true;
            button.removeAttribute('data-entry-id');
            button.setAttribute('aria-label', '暂无相邻海域');
            nameNode && (nameNode.textContent = '');
            packageNode && (packageNode.textContent = '');
            statusNode && (statusNode.textContent = defaultSummaryNeighborStatus);
            dateDot?.classList.remove('is-ready');
            peopleDot?.classList.remove('is-ready');
            return;
        }

        const statusText = buildPlannerSummaryNeighborStatusLabel(booking);
        button.hidden = false;
        button.disabled = summaryIsSwitching;
        button.dataset.entryId = String(booking.entryId || '').trim();
        button.setAttribute('aria-label', `切换到 ${String(booking.spotName || '未命名海域').trim()}，${statusText}`);
        nameNode && (nameNode.textContent = String(booking.spotName || '未命名海域').trim());
        packageNode && (packageNode.textContent = buildPlannerBookingPackageLabel(booking));
        statusNode && (statusNode.textContent = statusText);
        dateDot?.classList.toggle('is-ready', Boolean(String(booking?.selectedDate || '').trim()));
        peopleDot?.classList.toggle('is-ready', Boolean(String(booking?.selectedPeople || '').trim()));
    }

    function syncPlannerSummaryNeighbors(bookings = getConfirmedBookings(), activeBooking = getActiveBooking(bookings)) {
        const safeBookings = Array.isArray(bookings) ? bookings : [];
        const total = safeBookings.length;
        const activeIndex = Math.max(0, safeBookings.findIndex((booking) => booking?.entryId === activeBooking?.entryId));
        const hasMultiple = total > 1 && Boolean(activeBooking);

        summarySwimStage.classList.toggle('has-multiple', hasMultiple);

        if (!hasMultiple) {
            syncPlannerSummaryNeighbor(summaryPrevNeighbor, null);
            syncPlannerSummaryNeighbor(summaryNextNeighbor, null);
            return;
        }

        const prevBooking = safeBookings[(activeIndex - 1 + total) % total];
        const nextBooking = safeBookings[(activeIndex + 1) % total];
        syncPlannerSummaryNeighbor(summaryPrevNeighbor, prevBooking);
        syncPlannerSummaryNeighbor(summaryNextNeighbor, nextBooking);
    }

    function buildPlannerSummaryDeckMarkup(state) {
        const spotItem = state.items.spot;
        const dateItem = state.items.date;
        const peopleItem = state.items.people;

        return `
            <p class="planner-summary-status-note" data-summary-slot="status-note">
                ${escapeHtml(state.statusNote)}
            </p>

            <div class="planner-summary-ritual">
                <div class="planner-summary-ritual-segment planner-summary-ritual-segment--route">
                    <p class="planner-summary-ritual-route-label">Current Route</p>
                    <strong class="planner-summary-ritual-route-spot" data-summary-slot="route-spot">${escapeHtml(state.activeSpotLabel || '当前海域待定')}</strong>
                </div>
                <div class="planner-summary-ritual-segment planner-summary-ritual-segment--rhythm">
                    <p class="planner-summary-ritual-rhythm" data-summary-slot="rhythm-sentence">
                        ${escapeHtml(state.rhythmSentence)}
                    </p>
                </div>
                <div class="planner-summary-ritual-segment planner-summary-ritual-segment--chips">
                    <span class="planner-summary-ritual-chip planner-summary-ritual-chip-package" data-summary-slot="active-package">${escapeHtml(state.activePackageLabel)}</span>
                    <span class="planner-summary-ritual-chip planner-summary-ritual-chip-companion" data-summary-slot="active-companion">${escapeHtml(state.activeCompanionLabel)}</span>
                </div>
            </div>

            <div class="planner-summary-receipt">
                <article class="planner-item${spotItem.isFilled ? ' is-confirmed' : ' is-empty'}" data-summary-field="spot">
                    <span class="planner-item-index">01</span>
                    <div class="planner-item-copy">
                        <span class="planner-label">海域</span>
                        <strong data-summary-slot="spot-value">${escapeHtml(spotItem.value)}</strong>
                        <small data-summary-slot="spot-meta">${escapeHtml(spotItem.meta)}</small>
                    </div>
                    <span class="planner-item-state" data-summary-slot="spot-state">${escapeHtml(spotItem.state)}</span>
                </article>

                <article class="planner-item${dateItem.isFilled ? ' is-confirmed' : ' is-empty'}" data-summary-field="date">
                    <span class="planner-item-index">02</span>
                    <div class="planner-item-copy">
                        <span class="planner-label">出发</span>
                        <strong data-summary-slot="date-value">${escapeHtml(dateItem.value)}</strong>
                        <small data-summary-slot="date-meta">${escapeHtml(dateItem.meta)}</small>
                    </div>
                    <span class="planner-item-state" data-summary-slot="date-state">${escapeHtml(dateItem.state)}</span>
                </article>

                <article class="planner-item${peopleItem.isFilled ? ' is-confirmed' : ' is-empty'}" data-summary-field="people">
                    <span class="planner-item-index">03</span>
                    <div class="planner-item-copy">
                        <span class="planner-label">同行</span>
                        <strong data-summary-slot="people-value">${escapeHtml(peopleItem.value)}</strong>
                        <small data-summary-slot="people-meta">${escapeHtml(peopleItem.meta)}</small>
                    </div>
                    <span class="planner-item-state" data-summary-slot="people-state">${escapeHtml(peopleItem.state)}</span>
                </article>
            </div>

            <div class="planner-summary-guidance">
                <article class="planner-summary-guidance-card">
                    <p class="planner-summary-guidance-label">海域焦点</p>
                    <h3 class="planner-summary-guidance-title" data-summary-slot="focus-title">${escapeHtml(state.guidance.focusTitle)}</h3>
                    <p class="planner-summary-guidance-copy" data-summary-slot="focus-copy">${escapeHtml(state.guidance.focusCopy)}</p>
                </article>
                <article class="planner-summary-guidance-card">
                    <p class="planner-summary-guidance-label">准备提示</p>
                    <h3 class="planner-summary-guidance-title" data-summary-slot="prep-title">${escapeHtml(state.guidance.prepTitle)}</h3>
                    <p class="planner-summary-guidance-copy" data-summary-slot="prep-copy">${escapeHtml(state.guidance.prepCopy)}</p>
                </article>
            </div>
        `;
    }

    function createPlannerSummaryDeckElement(state) {
        const deck = document.createElement('div');
        deck.className = 'planner-summary-swim-deck';
        deck.innerHTML = buildPlannerSummaryDeckMarkup(state);
        return deck;
    }

    function renderPlannerSummaryDeckState(state) {
        const currentDeck = getActiveSummaryDeck();
        const nextDeck = createPlannerSummaryDeckElement(state);
        nextDeck.classList.add('is-deck-active');

        if (!currentDeck) {
            summarySwimViewport.innerHTML = '';
            summarySwimViewport.appendChild(nextDeck);
            return nextDeck;
        }

        currentDeck.replaceWith(nextDeck);
        return nextDeck;
    }

    function setPlannerSummaryStatusOverride(statusText) {
        const statusNode = getActiveSummaryDeck()?.querySelector('[data-summary-slot="status-note"]');
        if (statusNode) {
            statusNode.textContent = statusText;
        }
    }

    function clearPlannerSummaryHeightResetTimer() {
        if (!summaryStageHeightResetTimer) {
            return;
        }

        window.clearTimeout(summaryStageHeightResetTimer);
        summaryStageHeightResetTimer = 0;
    }

    function lockPlannerSummaryViewportHeight(...decks) {
        clearPlannerSummaryHeightResetTimer();

        const heights = [
            summarySwimViewport.offsetHeight || 0,
            ...decks.map((deck) => deck?.offsetHeight || 0)
        ].filter((value) => value > 0);

        if (!heights.length) {
            return;
        }

        summarySwimViewport.style.height = `${Math.max(...heights)}px`;
    }

    function releasePlannerSummaryViewportHeight(delay = 80) {
        clearPlannerSummaryHeightResetTimer();
        summaryStageHeightResetTimer = window.setTimeout(() => {
            summarySwimViewport.style.height = '';
            summaryStageHeightResetTimer = 0;
        }, delay);
    }

    function resetPlannerSummarySwipeShift() {
        summaryGestureState.shiftX = 0;
        summaryGestureState.claimed = false;
        summarySwimStage.style.setProperty('--planner-summary-swipe-shift', '0px');
        summarySwimStage.classList.remove('is-dragging');
    }

    function pulsePlannerSummaryProgress() {
        restartTransientClassAnimation(summaryRoot, 'is-progress-shifting');
    }

    function syncPlannerSummaryMeter(filledCount, isConfirmed, state = {}) {
        const progress = Math.max(0, Math.min(1, filledCount / 3));
        summaryRoot.style.setProperty('--planner-summary-progress', progress.toFixed(3));
        summaryMeterFill.style.width = `${Math.max(progress * 100, progress > 0 ? 8 : 0)}%`;
        const currentStep = !state.hasSpot
            ? 'spot'
            : (!state.hasDate ? 'date' : (!state.hasPeople ? 'people' : 'people'));

        summaryRoot.dataset.summaryCurrentStep = currentStep;

        summaryMeterOrbs.forEach((orb, index) => {
            const isComplete = index < filledCount;
            const stepKey = String(orb.dataset.summaryMeterStep || '').trim();
            orb.classList.toggle('is-complete', isComplete);
            orb.classList.toggle('is-confirmed', isConfirmed && isComplete);
            orb.classList.toggle('is-current', !isComplete && stepKey === currentStep);
        });

        if (hasRenderedSummaryOnce && filledCount > previousSummaryFilledCount) {
            pulsePlannerSummaryProgress();
        }

        previousSummaryFilledCount = filledCount;
    }

    function getRequiredFieldKey(fieldKey) {
        return String(fieldMap[fieldKey]?.field?.dataset?.plannerRequires || '').trim();
    }

    function clearPlannerFieldUnlockReveal(fieldNode) {
        if (!fieldNode) {
            return;
        }

        const existingTimer = fieldUnlockTimers.get(fieldNode);
        if (existingTimer) {
            window.clearTimeout(existingTimer);
            fieldUnlockTimers.delete(fieldNode);
        }

        fieldNode.classList.remove('is-unlocking');
    }

    function triggerPlannerFieldUnlockReveal(fieldNode) {
        if (!fieldNode) {
            return;
        }

        clearPlannerFieldUnlockReveal(fieldNode);
        restartTransientClassAnimation(fieldNode, 'is-unlocking');

        const timer = window.setTimeout(() => {
            fieldNode.classList.remove('is-unlocking');
            fieldUnlockTimers.delete(fieldNode);
        }, 920);

        fieldUnlockTimers.set(fieldNode, timer);
    }

    function getFieldSelectionValue(fieldKey) {
        if (fieldKey === 'date') {
            return String(dateInput.value || '').trim();
        }

        return String(fieldMap[fieldKey]?.input?.value || '').trim();
    }

    function isFieldComplete(fieldKey) {
        return Boolean(getFieldSelectionValue(fieldKey));
    }

    function isFieldUnlocked(fieldKey) {
        const requiredFieldKey = getRequiredFieldKey(fieldKey);
        return requiredFieldKey ? isFieldComplete(requiredFieldKey) : true;
    }

    function resolvePlannerFieldKey(fieldKey) {
        let nextKey = fieldKey;

        while (nextKey) {
            if (isFieldUnlocked(nextKey)) {
                return nextKey;
            }

            nextKey = getRequiredFieldKey(nextKey);
        }

        return 'spot';
    }

    function getNextFieldKey(fieldKey) {
        const index = PROGRESSIVE_ORDER.indexOf(fieldKey);
        return index >= 0 ? (PROGRESSIVE_ORDER[index + 1] || '') : '';
    }

    function clearPendingAutoAdvance() {
        if (!autoAdvanceTimer) {
            return;
        }

        window.clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = 0;
    }

    function getPlannerSubmitFeedbackStage() {
        const filledCount = [spotInput.value, dateInput.value, peopleInput.value].filter(Boolean).length;

        if (filledCount >= 3) {
            return 'confirmed';
        }

        if (filledCount > 0) {
            return 'progress';
        }

        return 'idle';
    }

    function getPlannerSubmitFeedbackCopy() {
        const activeBooking = getActiveBooking();
        const spotName = String(activeBooking?.spotName || spotInput.dataset.label || '').trim();

        if (activeBooking && spotName) {
            return {
                stage: (dateInput.value && peopleInput.value) ? 'confirmed' : 'progress',
                button: buildPlannerSubmitActionLabel(),
                status: `已替 ${spotName} 收住这一层，接下来继续往更深一层看`
            };
        }

        const feedbackStage = getPlannerSubmitFeedbackStage();
        return {
            stage: feedbackStage,
            ...(SUBMIT_FEEDBACK_COPY[feedbackStage] || SUBMIT_FEEDBACK_COPY.idle)
        };
    }

    function getPlannerSubmitFeedbackDelay() {
        return 2000;
    }

    function buildPlannerSubmitCountdownLabel(baseLabel, secondsLeft) {
        const safeSeconds = Math.max(1, Number.parseInt(secondsLeft, 10) || 1);
        return `${baseLabel} · ${safeSeconds} 秒后继续下潜`;
    }

    function startPlannerSubmitFeedbackCountdown(baseLabel, feedbackDelay) {
        const deadline = Date.now() + feedbackDelay;
        let lastSecond = -1;

        const syncCountdown = () => {
            const remainingMs = Math.max(0, deadline - Date.now());
            const secondsLeft = Math.max(1, Math.ceil(remainingMs / 1000));

            if (secondsLeft !== lastSecond) {
                lastSecond = secondsLeft;
                const countdownLabel = buildPlannerSubmitCountdownLabel(baseLabel, secondsLeft);
                submitButtonLabel.textContent = countdownLabel;
                submitButton.setAttribute('aria-label', countdownLabel);
            }

            if (remainingMs <= 0) {
                submitFeedbackCountdownTimer = 0;
                return;
            }

            submitFeedbackCountdownTimer = window.setTimeout(syncCountdown, Math.min(250, remainingMs));
        };

        syncCountdown();
    }

    function clearPlannerSubmitFeedbackInterruption() {
        if (typeof detachSubmitFeedbackInterrupt === 'function') {
            detachSubmitFeedbackInterrupt();
        }

        detachSubmitFeedbackInterrupt = null;
    }

    function attachPlannerSubmitFeedbackInterruption() {
        clearPlannerSubmitFeedbackInterruption();

        const handleWheelInterrupt = (event) => {
            const deltaX = Math.abs(Number(event?.deltaX) || 0);
            const deltaY = Math.abs(Number(event?.deltaY) || 0);
            const deltaZ = Math.abs(Number(event?.deltaZ) || 0);

            if (deltaX < 0.5 && deltaY < 0.5 && deltaZ < 0.5) {
                return;
            }

            if (window.OceanScroll && typeof window.OceanScroll.cancelActiveAnimation === 'function') {
                window.OceanScroll.cancelActiveAnimation();
            }

            resetPlannerSubmitFeedback();
        };

        window.addEventListener('wheel', handleWheelInterrupt, { passive: true });
        detachSubmitFeedbackInterrupt = () => {
            window.removeEventListener('wheel', handleWheelInterrupt, { passive: true });
        };
    }

    function clearPlannerSubmitFeedbackTimers() {
        if (submitContinueTimer) {
            window.clearTimeout(submitContinueTimer);
            submitContinueTimer = 0;
        }

        if (submitFeedbackCountdownTimer) {
            window.clearTimeout(submitFeedbackCountdownTimer);
            submitFeedbackCountdownTimer = 0;
        }

        if (submitFeedbackResetTimer) {
            window.clearTimeout(submitFeedbackResetTimer);
            submitFeedbackResetTimer = 0;
        }
    }

    function resetPlannerSubmitFeedback(options = {}) {
        const shouldSyncSummary = options.syncSummary !== false;

        clearPlannerSubmitFeedbackInterruption();
        clearPlannerSubmitFeedbackTimers();
        submitButton.disabled = false;
        submitButton.removeAttribute('aria-busy');
        submitButton.removeAttribute('aria-label');
        submitButton.classList.remove('is-feedback', 'is-feedback-confirmed');
        summaryRoot.classList.remove('is-submit-feedback');
        syncPlannerSubmitActionLabel();

        if (shouldSyncSummary) {
            updatePlannerSummary();
        }
    }

    function triggerPlannerSubmitFeedback() {
        const feedbackCopy = getPlannerSubmitFeedbackCopy();
        const feedbackDelay = getPlannerSubmitFeedbackDelay();

        resetPlannerSubmitFeedback({ syncSummary: false });

        submitButton.disabled = true;
        submitButton.setAttribute('aria-busy', 'true');
        submitButton.classList.add('is-feedback');
        submitButton.classList.toggle('is-feedback-confirmed', feedbackCopy.stage === 'confirmed');
        startPlannerSubmitFeedbackCountdown(feedbackCopy.button, feedbackDelay);
        attachPlannerSubmitFeedbackInterruption();

        restartTransientClassAnimation(summaryRoot, 'is-submit-feedback');
        setPlannerSummaryStatusOverride(feedbackCopy.status);

        submitContinueTimer = window.setTimeout(() => {
            submitContinueTimer = 0;
            scrollToSection(submitButton.dataset.scrollTarget || '#trip-layer', 1640);

            submitFeedbackResetTimer = window.setTimeout(() => {
                submitFeedbackResetTimer = 0;
                resetPlannerSubmitFeedback();
            }, 560);
        }, feedbackDelay);
    }

    function prepareFieldPanel(fieldKey) {
        if (fieldKey !== 'date') {
            return;
        }

        const activeDate = getCalendarDisplayDate();
        calendarViewDate = new Date(activeDate.getFullYear(), activeDate.getMonth(), 1);
        renderPlannerCalendar();
    }

    /**
     * resetDateFieldValue() - 在上游字段失效时清空日期选择，并刷新日历显示
     * @returns {boolean} - 本次是否真的清掉了已有日期
     */
    function resetDateFieldValue() {
        const hadValue = Boolean(dateInput.value);
        if (!hadValue) {
            syncDateFieldDisplay();
            return false;
        }

        dateInput.value = '';
        calendarViewDate = new Date(getCalendarDisplayDate().getFullYear(), getCalendarDisplayDate().getMonth(), 1);
        syncDateFieldDisplay();
        renderPlannerCalendar();
        return true;
    }

    /**
     * resetPeopleFieldValue() - 把同行人数退回空选项，并收起自定义人数编辑区
     * @returns {boolean} - 本次是否真的清掉了已有同行人数
     */
    function resetPeopleFieldValue() {
        const hadValue = Boolean(String(peopleInput.value || '').trim());
        const emptyOption = peoplePanel.querySelector('.planner-option[data-option-group="people"][data-value=""]');
        if (!emptyOption) {
            return false;
        }

        setOptionState('people', emptyOption);
        hideCustomPeopleEditor();
        return hadValue;
    }

    /**
     * syncProgressivePlannerState() - 维护 Planner 的逐层解锁关系与字段回退
     * @returns {boolean} - 本轮同步中是否发生了下游字段重置
     */
    function syncProgressivePlannerState() {
        let didReset = false;
        const isBookingBound = isPlannerBoundToConfirmedBooking();

        // Planner 的顺序固定为“海域 -> 日期 -> 同行人数”。
        // 只要上游被改空，下游就必须一起回退，避免残留不再成立的组合。
        if (!isFieldComplete('spot')) {
            didReset = resetDateFieldValue() || didReset;
            didReset = resetPeopleFieldValue() || didReset;
        } else if (!isFieldComplete('date')) {
            didReset = resetPeopleFieldValue() || didReset;
        }

        Object.keys(fieldMap).forEach((key) => {
            const config = fieldMap[key];
            const unlocked = isFieldUnlocked(key);
            const wasLocked = config.field.classList.contains('is-locked');

            // “可用 / 锁定”状态同时驱动视觉态、tab 可达性和解锁显现动画。
            config.field.classList.toggle('is-ready', unlocked);
            config.field.classList.toggle('is-locked', !unlocked);
            config.trigger.setAttribute('aria-disabled', String(key === 'spot' ? (isBookingBound || !unlocked) : !unlocked));

            if (!hasInitializedProgressiveState) {
                clearPlannerFieldUnlockReveal(config.field);
            } else if (wasLocked && unlocked) {
                triggerPlannerFieldUnlockReveal(config.field);
            } else if (!unlocked) {
                clearPlannerFieldUnlockReveal(config.field);
            }

            if (unlocked) {
                config.trigger.removeAttribute('tabindex');
            } else {
                config.trigger.setAttribute('tabindex', '-1');
            }
        });

        spotField.classList.toggle('is-booking-bound', isBookingBound);
        plannerDeskControl.dataset.editingMode = isBookingBound ? 'confirmed-booking' : 'draft';
        summaryRoot.dataset.editingMode = isBookingBound ? 'confirmed-booking' : 'draft';
        if (isBookingBound) {
            spotTrigger.setAttribute('tabindex', '-1');
        }

        if (!isFieldUnlocked('date') && !isFieldComplete('date')) {
            dateHint.textContent = LOCKED_HINTS.date;
        } else {
            syncDateFieldDisplay();
        }

        if (!isFieldUnlocked('people') && !isFieldComplete('people')) {
            peopleHint.textContent = LOCKED_HINTS.people;
        } else if (isFieldComplete('people')) {
            peopleHint.textContent = peopleInput.dataset.note || COPY.people.emptyHint;
        } else {
            peopleHint.textContent = COPY.people.emptyHint;
        }

        if (activePanelKey) {
            const availableFieldKey = resolvePlannerFieldKey(activePanelKey);
            if (availableFieldKey !== activePanelKey) {
                closePanel(activePanelKey);
            }
        }

        hasInitializedProgressiveState = true;

        return didReset;
    }

    /**
     * queueAutoAdvance(fieldKey) - 在完成当前步骤后，短暂停顿再引导到下一步
     * @param {string} fieldKey - 当前刚完成的字段键名
     * @returns {void} - 无返回值，直接安排自动展开
     */
    function queueAutoAdvance(fieldKey) {
        const nextFieldKey = getNextFieldKey(fieldKey);
        if (!nextFieldKey || !isFieldUnlocked(nextFieldKey) || isFieldComplete(nextFieldKey)) {
            return;
        }

        clearPendingAutoAdvance();
        autoAdvanceTimer = window.setTimeout(() => {
            autoAdvanceTimer = 0;

            if (!isFieldUnlocked(nextFieldKey) || isFieldComplete(nextFieldKey)) {
                return;
            }

            // 给用户一点“上一层刚收住”的缓冲，再把焦点带进下一层。
            openPanel(nextFieldKey);
            fieldMap[nextFieldKey]?.trigger?.focus({ preventScroll: true });
        }, 280);
    }

    /**
     * getSpotOptions() - 获取当前海域浮层里的全部选项按钮
     * @returns {HTMLElement[]} - 当前海域选项按钮数组
     */
    function getSpotOptions() {
        return Array.from(spotPanel.querySelectorAll('.planner-option[data-option-group="spot"]'));
    }

    /**
     * getConfirmedSpotOptions() - 根据已收进行程的套餐，生成当前允许选择的海域选项
     * @returns {{mode: string, options: Array<Object>}} - 选项模式和对应选项列表
     */
    function getConfirmedSpotOptions() {
        const bookings = getConfirmedBookings();
        const activeBooking = getActiveBooking(bookings);

        if (!Array.isArray(bookings) || bookings.length === 0) {
            return {
                mode: 'base',
                options: initialSpotOptionsData.slice()
            };
        }

        if (!activeBooking) {
            return {
                mode: 'base',
                options: initialSpotOptionsData.slice()
            };
        }

        return {
            mode: 'booking-bound',
            options: [buildPlannerBookingSpotOption(activeBooking)]
        };
    }

    /**
     * createSpotOptionMarkup(optionData, isSelected) - 生成单个海域选项按钮。HTML
     * @param {{value: string, label: string, note: string, description: string}} optionData - 选项数据
     * @param {boolean} isSelected - 当前是否为选中。
     * @returns {string} - 海域选项按钮 HTML
     */
    function createSpotOptionMarkup(optionData, isSelected) {
        return `
            <button
                type="button"
                class="planner-option${isSelected ? ' is-selected' : ''}"
                data-option-group="spot"
                data-value="${escapeHtml(optionData.value)}"
                data-label="${escapeHtml(optionData.label)}"
                data-note="${escapeHtml(optionData.note)}"
            >
                <span class="planner-option-copy">
                    <strong>${escapeHtml(optionData.label)}</strong>
                    <small>${escapeHtml(optionData.description || optionData.note)}</small>
                </span>
            </button>
        `;
    }

    /**
     * renderSpotOptions(options, selectedValue) - 重绘海域浮层的可选项列表
     * @param {Array<Object>} options - 需要渲染的选项数据
     * @param {string} selectedValue - 当前应被选中的。
     * @returns {void} - 无返回值，直接更新浮层选项
     */
    function renderSpotOptions(options, selectedValue) {
        spotPanel.innerHTML = options
            .map((optionData, index) => createSpotOptionMarkup(
                optionData,
                selectedValue
                    ? optionData.value === selectedValue
                    : index === 0
            ))
            .join('');
    }

    /**
     * syncSpotOptionsFromBookings(draft, isInitial) - 按已确认套餐收缩海域选项，并同步当前字段。
     * @param {Object|null} draft - 本地保存。Planner 草稿
     * @param {boolean} isInitial - 是否为页面初始化阶段
     * @returns {void} - 无返回值，直接更新海域字段状态
     */
    function syncSpotOptionsFromBookings(draft, isInitial) {
        const currentValue = String(spotInput.value || '').trim();
        const draftValue = readPlannerDraftValue(draft, 'spot');
        const { mode, options } = getConfirmedSpotOptions();
        const availableValues = new Set(options.map((option) => option.value));
        const storedValue = availableValues.has(draftValue) ? draftValue : '';
        const liveValue = availableValues.has(currentValue) ? currentValue : '';
        let nextValue = '';

        // 当已收进行程收缩了可选海域后，旧草稿里原本的值可能已经不再合法。
        // 这里会先过滤掉失效值，再从“锁定单海域 / 草稿值 / 当前值”里选出一个可继续使用的值。
        if (mode === 'booking-bound') {
            nextValue = options[0]?.value || '';
        } else if (mode !== 'base') {
            nextValue = storedValue || liveValue || '';
        } else {
            nextValue = storedValue || liveValue || '';
        }

        renderSpotOptions(options, nextValue);

        const selectedOption = getSpotOptions().find((option) => option.dataset.value === nextValue)
            || getSpotOptions()[0];

        if (selectedOption) {
            setOptionState('spot', selectedOption);
        }
    }

    /**
     * formatPlannerDate(value) - 把原生日期值格式化为行程控制台的展示文案
     * @param {string} value - 原生日期输入值
     * @returns {string} - 格式化后的日期文本
     */
    function formatPlannerDate(value) {
        if (!value) {
            return COPY.date.emptyLabel;
        }

        const parsed = new Date(`${value}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) {
            return value;
        }

        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}.${month}.${day}`;
    }

    /**
     * isValidPlannerDateValue(value) - 判断本地恢复出来的日期是否还是可用的原生日期。     * @param {string} value - 待校验的日期
     * @returns {boolean} - 只有 YYYY-MM-DD 且能。Date 正常识别时才返回 true
     */
    function isValidPlannerDateValue(value) {
        const normalized = String(value || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
            return false;
        }

        const parsed = new Date(`${normalized}T00:00:00`);
        return !Number.isNaN(parsed.getTime());
    }

    /**
     * formatCalendarMonthLabel(date) - 生成日历面板顶部的月份标题
     * @param {Date} date - 当前日历视图所在月。
     * @returns {string} - 年月标题文本
     */
    function formatCalendarMonthLabel(date) {
        return `${date.getFullYear()}年 ${String(date.getMonth() + 1).padStart(2, '0')}月`;
    }

    /**
     * getCalendarDisplayDate() - 获取日历面板当前应展示的基准日期
     * @returns {Date} - 当前选中日期或今天
     */
    function getCalendarDisplayDate() {
        const parsed = dateInput.value
            ? new Date(`${dateInput.value}T00:00:00`)
            : new Date();

        if (Number.isNaN(parsed.getTime())) {
            return new Date();
        }

        return parsed;
    }

    /**
     * syncDateFieldDisplay() - 同步日期字段的主值、辅助说明和激活状态
     * @returns {void} - 无返回值，直接刷新日期字段显示
     */
    function syncDateFieldDisplay() {
        const hasValue = Boolean(dateInput.value);
        const plannerSpotId = resolveTripSpotId(getActiveBooking()?.spotKey || spotInput.value);
        const dateStatus = hasValue && plannerSpotId
            ? sharedSpotWindowConfig?.getDateStatus?.(plannerSpotId, dateInput.value)
            : '';
        dateValue.textContent = hasValue
            ? formatPlannerDate(dateInput.value)
            : COPY.date.emptyLabel;
        dateHint.textContent = hasValue
            ? `${COPY.date.filledHint} · ${getTripWindowLabelByStatus(dateStatus)}`
            : COPY.date.emptyHint;
        dateField.classList.toggle('is-active', hasValue);
    }

    /**
     * getPlannerDateStatus(date) - 结合当前海域判断某一天属于哪种窗口
     * @param {Date} date - 待判断的日期对象
     * @returns {'recommended'|'available'|'caution'} - 当前窗口状态
     */
    function getPlannerDateStatus(date) {
        const plannerSpotId = resolveTripSpotId(getActiveBooking()?.spotKey || spotInput.value);
        if (!plannerSpotId || !sharedSpotWindowConfig) {
            return 'available';
        }

        return sharedSpotWindowConfig.getDateStatus(plannerSpotId, date);
    }

    /**
     * getPanelWidth(fieldKey) - 按字段类型计算浮层面板宽度
     * @param {string} fieldKey - 字段键名
     * @returns {number} - 面板宽度
     */
    function getPanelWidth(fieldKey, triggerRect = null) {
        const config = fieldMap[fieldKey];
        if (!config) {
            return 360;
        }

        const rect = triggerRect || config.trigger.getBoundingClientRect();
        const maxWidth = window.innerWidth - PANEL_MARGIN * 2;
        // 先从触发按钮自身宽度推导“理想面板宽度”，
        // 再用视口宽度减安全边距兜底，避免在窄屏上横向溢出。

        if (fieldKey === 'spot') {
            return Math.min(Math.max(rect.width + 48, 480), 620, maxWidth);
        }

        if (fieldKey === 'date') {
            return Math.min(Math.max(rect.width + 32, 360), 392, maxWidth);
        }

        return Math.min(Math.max(rect.width + 12, 360), 420, maxWidth);
    }

    /**
     * measurePanelPosition(fieldKey) - 先读取一次字段和面板布局，并缓存当前打开浮层的位置依据。
     * @param {string} fieldKey - 字段键名
     * @returns {Object|null} - 当前面板的布局快照
     */
    function measurePanelPosition(fieldKey) {
        const config = fieldMap[fieldKey];
        if (!config || config.panel.hidden) {
            return null;
        }

        const triggerRect = config.trigger.getBoundingClientRect();
        const panelWidth = getPanelWidth(fieldKey, triggerRect);

        config.panel.style.width = `${panelWidth}px`;
        config.panel.style.maxWidth = `${window.innerWidth - PANEL_MARGIN * 2}px`;

        const measuredHeight = config.panel.offsetHeight || config.panel.scrollHeight || 320;
        // 先测一次真实高度，再决定是向下展开还是向上展开。
        // 不然面板可能会直接压到屏幕底部，或者在小屏上被切掉一截。
        const spaceBelow = window.innerHeight - triggerRect.bottom - PANEL_MARGIN;
        const spaceAbove = triggerRect.top - PANEL_MARGIN;
        const shouldOpenUpward = measuredHeight > spaceBelow && spaceAbove > spaceBelow;
        const availableHeight = Math.max(
            fieldKey === 'date' ? 320 : 220,
            (shouldOpenUpward ? spaceAbove : spaceBelow) - PANEL_GAP
        );

        config.panel.classList.toggle('opens-upward', shouldOpenUpward);
        if (fieldKey === 'date') {
            // 日历面板如果太矮会挤坏月份导航和 6 行日期格，所以给它更高的最低可用高度。
            config.panel.style.maxHeight = `${Math.min(measuredHeight, Math.max(360, availableHeight))}px`;
        } else {
            config.panel.style.maxHeight = `${Math.min(measuredHeight, availableHeight)}px`;
        }

        const finalHeight = config.panel.offsetHeight || Math.min(measuredHeight, availableHeight);
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const metrics = {
            triggerTop: triggerRect.top + scrollY,
            triggerBottom: triggerRect.bottom + scrollY,
            triggerLeft: triggerRect.left,
            triggerRight: triggerRect.right,
            panelWidth,
            finalHeight,
            shouldOpenUpward
        };

        panelLayoutMetrics.set(fieldKey, metrics);
        return metrics;
    }

    /**
     * positionPanel(fieldKey) - 根据字段位置将浮层稳定定位到视口。
     * @param {string} fieldKey - 字段键名
     * @returns {void} - 无返回值，直接写入面板位置
     */
    function positionPanel(fieldKey, metrics = panelLayoutMetrics.get(fieldKey)) {
        const config = fieldMap[fieldKey];
        if (!config || config.panel.hidden) {
            return;
        }

        if (!metrics) {
            metrics = measurePanelPosition(fieldKey);
            if (!metrics) {
                return;
            }
        }

        const scrollY = window.scrollY || window.pageYOffset || 0;
        let left = fieldKey === 'people'
            ? metrics.triggerRight - metrics.panelWidth
            : metrics.triggerLeft;
        left = Math.max(PANEL_MARGIN, Math.min(left, window.innerWidth - metrics.panelWidth - PANEL_MARGIN));

        let top = metrics.shouldOpenUpward
            ? metrics.triggerTop - scrollY - metrics.finalHeight - PANEL_GAP
            : metrics.triggerBottom - scrollY + PANEL_GAP;
        top = Math.max(PANEL_MARGIN, Math.min(top, window.innerHeight - metrics.finalHeight - PANEL_MARGIN));

        config.panel.style.left = `${left}px`;
        config.panel.style.top = `${top}px`;
    }

    /**
     * schedulePanelPosition() - 在下一帧重新计算当前打开浮层的位。
     * @returns {void} - 无返回值，直接安排定位刷新
     */
    function schedulePanelPosition(options = {}) {
        const { measure = false } = options;
        if (!activePanelKey || panelPositionFrame) {
            return;
        }

        panelPositionFrame = window.requestAnimationFrame(() => {
            panelPositionFrame = 0;
            if (measure || !panelLayoutMetrics.has(activePanelKey)) {
                measurePanelPosition(activePanelKey);
            }
            positionPanel(activePanelKey);
        });
        // 定位放到下一帧做，是为了等浏览器先把本轮 class、尺寸和布局变化算完。
        // 避免读取到旧尺寸，导致浮层“先跳一下再归位”。
    }

    /**
     * requestPanelPositionMeasure() - 需要重测尺寸时使用的刷新入口。
     * @returns {void}
     */
    function requestPanelPositionMeasure() {
        schedulePanelPosition({ measure: true });
    }

    /**
     * requestPanelPositionFollow() - 仅根据滚动位置追随时使用的刷新入口。
     * @returns {void}
     */
    function requestPanelPositionFollow() {
        schedulePanelPosition({ measure: false });
    }

    /**
     * attachPanelPositionListeners() - 仅在浮层打开时监听滚动和尺寸变化
     * @returns {void}
     */
    function attachPanelPositionListeners() {
        if (panelPositionListenersAttached) {
            return;
        }

        window.addEventListener('resize', requestPanelPositionMeasure);
        window.addEventListener('scroll', requestPanelPositionFollow, { passive: true });
        panelPositionListenersAttached = true;
    }

    /**
     * detachPanelPositionListeners() - 在没有打开浮层时移除定位监听，避免整页滚动白跑
     * @returns {void}
     */
    function detachPanelPositionListeners() {
        if (!panelPositionListenersAttached) {
            return;
        }

        window.removeEventListener('resize', requestPanelPositionMeasure);
        window.removeEventListener('scroll', requestPanelPositionFollow);
        panelPositionListenersAttached = false;

        if (panelPositionFrame) {
            window.cancelAnimationFrame(panelPositionFrame);
            panelPositionFrame = 0;
        }
    }

    /**
     * renderPlannerCalendar(direction) - 渲染自定义潮汐日历面板
     * @param {string} direction - 月份切换方向，用于触发切换动画
     * @returns {void} - 无返回值，直接更新日历视图
     */
    function renderPlannerCalendar(direction) {
        const draw = () => {
            calendarMonth.textContent = formatCalendarMonthLabel(calendarViewDate);
            calendarGrid.innerHTML = '';

            const year = calendarViewDate.getFullYear();
            const month = calendarViewDate.getMonth();
            const monthStart = new Date(year, month, 1);
            const startOffset = (monthStart.getDay() + 6) % 7;
            // JS 。getDay() 以周日为 0，这里转成“周一开头”的日历逻辑。
            const gridStart = new Date(year, month, 1 - startOffset);
            // 从网格第一格应该显示的那一天开始画，而不是直接从 1 号开始，
            // 这样前后月份的补位日期也能完整出现，日历结构会稳定成 6 行 7 列。
            const selectedValue = dateInput.value;
            const today = new Date();
            const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            for (let index = 0; index < 42; index += 1) {
                const cellDate = new Date(gridStart);
                cellDate.setDate(gridStart.getDate() + index);

                const cellYear = cellDate.getFullYear();
                const cellMonth = String(cellDate.getMonth() + 1).padStart(2, '0');
                const cellDay = String(cellDate.getDate()).padStart(2, '0');
                const cellValue = `${cellYear}-${cellMonth}-${cellDay}`;
                const isOutside = cellDate.getMonth() !== month;

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'planner-calendar-day';
                button.dataset.value = cellValue;
                button.textContent = String(cellDate.getDate());

                if (isOutside) {
                    button.classList.add('is-outside');
                }

                if (cellValue === selectedValue) {
                    button.classList.add('is-selected');
                }

                if (cellValue === todayKey) {
                    button.classList.add('is-today');
                }

                if (!isOutside) {
                    const status = getPlannerDateStatus(cellDate);
                    button.dataset.windowStatus = status;
                    if (status === 'recommended') {
                        button.classList.add('is-recommended');
                    } else if (status === 'caution') {
                        button.classList.add('is-caution');
                    } else {
                        button.classList.add('is-available');
                    }
                }

                calendarGrid.appendChild(button);
            }

            calendarGrid.classList.remove('is-transitioning');
            requestPanelPositionMeasure();
        };

        if (!direction) {
            draw();
            return;
        }

        calendarGrid.classList.add('is-transitioning');
        window.setTimeout(draw, 120);
    }

    /**
     * closePanel(fieldKey) - 关闭指定字段的浮层面板并恢复字段状态
     * @param {string} fieldKey - 需要关闭的字段键名
     * @returns {void} - 无返回值，直接关闭浮层
     */
    function closePanel(fieldKey) {
        const config = fieldMap[fieldKey];
        if (!config) {
            return;
        }

        if (config.panel._closeTimer) {
            window.clearTimeout(config.panel._closeTimer);
            config.panel._closeTimer = 0;
        }

        config.field.classList.remove('is-open');
        config.field.classList.remove('is-submerging');
        config.field.classList.toggle('is-active', fieldKey === 'date'
            ? Boolean(dateInput.value)
            : Boolean(config.input.value));
        config.trigger.setAttribute('aria-expanded', 'false');
        config.panel.classList.remove('is-open');
        config.panel.classList.remove('opens-upward');
        config.panel.classList.remove('is-submerged-panel');
        panelLayoutMetrics.delete(fieldKey);
        if (fieldKey === 'people') {
            hideCustomPeopleEditor();
        }

        if (activePanelKey === fieldKey) {
            activePanelKey = null;
            detachPanelPositionListeners();
        }

        document.body.dataset.tripActivePlannerField = '';

        config.panel._closeTimer = window.setTimeout(() => {
            config.panel.hidden = true;
            config.panel.style.top = '';
            config.panel.style.left = '';
            config.panel.style.width = '';
            config.panel.style.maxWidth = '';
            config.panel.style.maxHeight = '';
            config.panel._closeTimer = 0;

            if (!activePanelKey) {
                floatingLayer.classList.remove('is-active', 'is-opening');
                floatingLayer.hidden = true;
                floatingLayer.setAttribute('aria-hidden', 'true');
                document.body.classList.remove('trip-planner-submerge-active');
                document.body.dataset.scrollMood = 'midwater';
            }
        }, 220);
        // 这里不立。hidden，而是等退场动画播完再藏。
        // 否则视觉上会像瞬间消失，失去“浮层收回海里”的过渡感。
    }

    /**
     * closeActivePanel() - 关闭当前处于打开状态的浮层面板
     * @returns {void} - 无返回值，直接关闭当前浮层
     */
    function closeActivePanel() {
        clearPendingAutoAdvance();

        if (!activePanelKey) {
            return;
        }

        closePanel(activePanelKey);
    }

    /**
     * openPanel(fieldKey) - 打开指定字段的浮层面板，并自动关闭其它面板
     * @param {string} fieldKey - 需要打开的字段键名
     * @returns {void} - 无返回值，直接展开浮层
     */
    function openPanel(fieldKey) {
        const targetFieldKey = resolvePlannerFieldKey(fieldKey);
        if (targetFieldKey === 'spot' && isPlannerBoundToConfirmedBooking()) {
            return;
        }

        clearPendingAutoAdvance();
        prepareFieldPanel(targetFieldKey);

        Object.keys(fieldMap).forEach((key) => {
            if (key !== targetFieldKey && !fieldMap[key].panel.hidden) {
                closePanel(key);
            }
        });

        const config = fieldMap[targetFieldKey];
        if (!config) {
            return;
        }

        if (config.panel._closeTimer) {
            window.clearTimeout(config.panel._closeTimer);
            config.panel._closeTimer = 0;
        }

        if (config.panel.parentElement !== floatingLayer) {
            floatingLayer.appendChild(config.panel);
        }
        // 把浮层移动到页面最高层承载容器里，而不是留在字段内部。
        // 这样即使字段父层。transform / overflow，也不会把浮层截断。

        floatingLayer.hidden = false;
        floatingLayer.setAttribute('aria-hidden', 'false');
        floatingLayer.classList.add('is-active', 'is-opening');
        document.body.classList.add('trip-planner-submerge-active');
        document.body.dataset.tripActivePlannerField = targetFieldKey;
        document.body.dataset.scrollMood = 'deep';
        config.field.classList.add('is-open', 'is-active', 'is-submerging');
        config.trigger.setAttribute('aria-expanded', 'true');
        config.panel.hidden = false;
        config.panel.classList.add('is-submerged-panel');
        activePanelKey = targetFieldKey;
        attachPanelPositionListeners();
        if (targetFieldKey === 'people') {
            const existingCustomCount = getCustomPeopleCount();
            if (existingCustomCount) {
                showCustomPeopleEditor(existingCustomCount);
            } else {
                hideCustomPeopleEditor();
            }
        }

        window.requestAnimationFrame(() => {
            measurePanelPosition(targetFieldKey);
            positionPanel(targetFieldKey);
            config.panel.classList.add('is-open');
            floatingLayer.classList.remove('is-opening');
            requestPanelPositionFollow();
        });
        // 先让浏览器知道“它已经显示了”，下一帧再计算位置和加打开态，
        // 才能拿到真实尺寸并让透明。位移动画顺畅发生。
    }

    /**
     * jumpToPlannerField(fieldKey) - 从“已收进行程”的信息块直接带用户跳到对应 Planner 字段
     * @param {'date'|'people'|'spot'} fieldKey - 需要展开的字段键名
     * @returns {void} - 无返回值，直接滚动并展开对应浮层
     */
    function jumpToPlannerField(fieldKey, entryId) {
        const targetFieldKey = resolvePlannerFieldKey(fieldKey);
        const config = fieldMap[targetFieldKey];
        if (!config) {
            return;
        }

        const safeEntryId = String(entryId || '').trim();
        if (safeEntryId) {
            setActiveBooking(safeEntryId, {
                refreshSummary: true,
                refreshCards: true
            });
        }

        closeActivePanel();
        scrollToSection('#plannerDeskControl', 1320);

        window.setTimeout(() => {
            openPanel(targetFieldKey);
            config.trigger?.focus({ preventScroll: true });
        }, 360);
    }

    /**
     * setOptionState(fieldKey, option) - 将海域或人数选项写回字段与摘要
     * @param {string} fieldKey - 字段键名
     * @param {HTMLElement} option - 当前选中的选项按钮
     * @returns {void} - 无返回值，直接刷新字段显示
     */
    function setOptionState(fieldKey, option) {
        const config = fieldMap[fieldKey];
        if (!config || !option) {
            return;
        }

        const { value = '', label = '', note = '' } = option.dataset;
        config.input.value = value;
        config.input.dataset.label = label || config.emptyLabel;
        config.input.dataset.note = note || config.emptyHint;
        config.valueNode.textContent = config.input.dataset.label;
        config.hintNode.textContent = config.input.dataset.note;
        config.field.classList.toggle('is-active', Boolean(value));

        config.panel.querySelectorAll('.planner-option').forEach((item) => {
            item.classList.toggle('is-selected', item === option);
        });
    }

    /**
     * getCustomPeopleCount() - 读取当前字段里是否已经存在“非预设人数”的自定义值
     * @returns {string} - 当前自定义人数，没有则返回空字符。
     */
    function getCustomPeopleCount() {
        const currentValue = String(peopleInput.value || '').trim();
        const hasPresetMatch = peopleOptions.some((option) => {
            const optionValue = String(option.dataset.value || '').trim();
            return optionValue && optionValue === currentValue && optionValue !== 'custom';
        });

        if (!currentValue || hasPresetMatch || currentValue === 'custom') {
            return '';
        }

        return currentValue;
    }

    /**
     * hideCustomPeopleEditor() - 收起自定义人数编辑区，避免它在关闭浮层后残留
     * @returns {void} - 无返回值，直接更新浮层内部状。
     */
    function hideCustomPeopleEditor() {
        customPeopleBox.hidden = true;
        customPeopleInput.value = '';
    }

    /**
     * showCustomPeopleEditor(prefillValue) - 展开自定义人数输入区，并用已有人数预填
     * @param {string} prefillValue - 预填的人数组
     * @returns {void} - 无返回值，直接展开编辑。
     */
    function showCustomPeopleEditor(prefillValue) {
        customPeopleBox.hidden = false;
        customPeopleInput.value = prefillValue || '';
        window.requestAnimationFrame(() => {
            requestPanelPositionMeasure();
            customPeopleInput.focus();
            customPeopleInput.select();
        });
    }

    /**
     * applyCustomPeopleValue() - 把自定义人数写回字段、摘要和已收进行程
     * @returns {void} - 无返回值，直接更新当前 Planner 状态
     */
    function applyCustomPeopleValue() {
        const customValue = String(customPeopleInput.value || '').trim();
        const parsed = Number.parseInt(customValue, 10);
        if (!Number.isFinite(parsed) || parsed < 1) {
            return;
        }

        const customOption = peoplePanel.querySelector('.planner-option[data-option-group="people"][data-value="custom"]');
        if (!customOption) {
            return;
        }

        peopleInput.value = String(parsed);
        peopleInput.dataset.label = `${parsed} 人同行`;
        peopleInput.dataset.note = `这次下潜按 ${parsed} 人的同行节奏安排。`;
        peopleValue.textContent = peopleInput.dataset.label;
        peopleHint.textContent = peopleInput.dataset.note;
        peopleField.classList.add('is-active');

        peoplePanel.querySelectorAll('.planner-option[data-option-group="people"]').forEach((item) => {
            item.classList.toggle('is-selected', item === customOption);
        });

        syncProgressivePlannerState();
        updatePlannerSummary();
        commitPlannerDeskSelection();
        hideCustomPeopleEditor();
        closePanel('people');
    }

    /**
     * selectCalendarDate(value) - 选中某一天并同步回写到字段与摘要
     * @param {string} value - 选中的日期。
     * @returns {void} - 无返回值，直接更新日期状。
     */
    function selectCalendarDate(value) {
        dateInput.value = value;

        const selectedDate = new Date(`${value}T00:00:00`);
        calendarViewDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

        syncProgressivePlannerState();
        updatePlannerSummary();
        commitPlannerDeskSelection();
        renderPlannerCalendar();
        closePanel('date');

        if (!peopleInput.value) {
            queueAutoAdvance('date');
        }
    }

    function applyPeopleSelectionValue(value, label, note) {
        const safeValue = String(value || '').trim();
        const matchedOption = peopleOptions.find((option) => String(option.dataset.value || '').trim() === safeValue);
        const customOption = peoplePanel.querySelector('.planner-option[data-option-group="people"][data-value="custom"]');
        const emptyOption = peopleOptions.find((option) => String(option.dataset.value || '').trim() === '') || peopleOptions[0];

        if (matchedOption) {
            setOptionState('people', matchedOption);
            hideCustomPeopleEditor();
            return;
        }

        if (safeValue && customOption) {
            applyCustomPeopleState(
                safeValue,
                label || buildCustomPeopleLabel(safeValue),
                note || `这次下潜按 ${label || buildCustomPeopleLabel(safeValue)} 的同行节奏安排。`
            );
            return;
        }

        if (emptyOption) {
            setOptionState('people', emptyOption);
        }
        hideCustomPeopleEditor();
    }

    function applyBookingToPlanner(booking) {
        const safeBooking = booking && typeof booking === 'object' ? booking : null;
        if (!safeBooking) {
            return;
        }

        const spotOption = buildPlannerBookingSpotOption(safeBooking);
        renderSpotOptions([spotOption], spotOption.value);
        const selectedSpotOption = getSpotOptions().find((option) => option.dataset.value === spotOption.value) || getSpotOptions()[0];
        if (selectedSpotOption) {
            setOptionState('spot', selectedSpotOption);
        }

        dateInput.value = isValidPlannerDateValue(safeBooking.selectedDate)
            ? safeBooking.selectedDate
            : '';
        applyPeopleSelectionValue(
            safeBooking.selectedPeople,
            safeBooking.selectedPeopleLabel,
            safeBooking.selectedPeopleLabel
                ? `这次下潜按 ${safeBooking.selectedPeopleLabel} 的同行节奏安排。`
                : ''
        );
        calendarViewDate = new Date(getCalendarDisplayDate().getFullYear(), getCalendarDisplayDate().getMonth(), 1);
        syncDateFieldDisplay();
        syncProgressivePlannerState();
    }

    function setActiveBooking(entryId, options = {}) {
        const bookings = Array.isArray(options.bookings) ? options.bookings : getConfirmedBookings();
        const fallbackEntryId = resolveInitialActiveBookingEntryId(bookings);
        const nextBooking = getBookingByEntryId(entryId, bookings)
            || getBookingByEntryId(fallbackEntryId, bookings)
            || getMostRecentlyUpdatedBooking(bookings);

        if (!nextBooking) {
            saveActiveBookingSelection('');
            renderPlannerBookingSwitcher(bookings);
            if (options.refreshCards !== false) {
                renderConfirmedBookings();
            }
            return null;
        }

        saveActiveBookingSelection(nextBooking.entryId);
        applyBookingToPlanner(nextBooking);
        renderPlannerBookingSwitcher(bookings);

        if (options.refreshSummary !== false) {
            updatePlannerSummary();
        }

        if (options.refreshCards !== false) {
            renderConfirmedBookings();
        }

        window.dispatchEvent(new CustomEvent('yanqi:confirmed-bookings-updated', {
            detail: {
                entryId: nextBooking.entryId
            }
        }));

        return nextBooking;
    }

    function restoreDraftSelection(draft) {
        const safeDraft = draft && typeof draft === 'object' ? draft : null;
        const storedSpotValue = readPlannerDraftValue(safeDraft, 'spot');
        const storedPeopleValue = readPlannerDraftValue(safeDraft, 'people');
        const storedPeople = peopleOptions.find((option) => option.dataset.value === storedPeopleValue)
            || (storedPeopleValue
                ? peoplePanel.querySelector('.planner-option[data-option-group="people"][data-value="custom"]')
                : null)
            || peopleOptions.find((option) => option.dataset.value === '')
            || peopleOptions[0];

        syncSpotOptionsFromBookings({
            ...safeDraft,
            spot: storedSpotValue,
            spotValue: storedSpotValue
        }, true);

        if (storedPeople && storedPeople.dataset.value === 'custom' && storedPeopleValue) {
            applyCustomPeopleState(storedPeopleValue, safeDraft?.peopleLabel, safeDraft?.peopleNote);
        } else if (storedPeople) {
            setOptionState('people', storedPeople);
        }

        dateInput.value = isValidPlannerDateValue(safeDraft?.dateValue || safeDraft?.date)
            ? (safeDraft.dateValue || safeDraft.date)
            : '';

        calendarViewDate = new Date(getCalendarDisplayDate().getFullYear(), getCalendarDisplayDate().getMonth(), 1);
        syncDateFieldDisplay();
        syncProgressivePlannerState();
    }

    function buildPlannerSummaryViewState() {
        const bookings = getConfirmedBookings();
        const activeBooking = getActiveBooking(bookings);
        const spotLabel = spotInput.dataset.label || summaryMetaMap.spot.emptyValue;
        const peopleLabel = peopleInput.dataset.label || summaryMetaMap.people.emptyValue;
        const hasSpot = Boolean(spotInput.value);
        const hasDate = Boolean(dateInput.value);
        const hasPeople = Boolean(peopleInput.value);
        const dateLabel = hasDate ? formatPlannerDate(dateInput.value) : summaryMetaMap.date.emptyValue;
        const stayLabel = hasSpot ? getPlannerSummaryStayLabel(activeBooking, spotInput.value) : '';
        const isConfirmed = hasSpot && hasDate && hasPeople;
        const filledCount = [hasSpot, hasDate, hasPeople].filter(Boolean).length;
        const summaryStage = getPlannerSummaryStage(hasSpot, hasDate, hasPeople);
        const activeIndex = Math.max(0, bookings.findIndex((booking) => booking?.entryId === activeBooking?.entryId));
        const activeIndexLabel = activeBooking
            ? `${String(activeIndex + 1).padStart(2, '0')} / ${String(bookings.length).padStart(2, '0')}`
            : defaultSummaryActiveIndex;
        const activeSpotLabel = activeBooking
            ? String(activeBooking.spotName || spotLabel || defaultSummaryActiveSpot).trim()
            : (hasSpot ? spotLabel : defaultSummaryActiveSpot);
        const activePackageLabel = activeBooking
            ? buildPlannerBookingPackageLabel(activeBooking)
            : defaultSummaryActivePackage;
        const activeCompanionLabel = buildPlannerCompanionChipLabel(activeBooking, hasDate, hasPeople, dateLabel, peopleLabel);
        const guidance = buildPlannerSummaryGuidance({
            hasSpot,
            hasDate,
            hasPeople,
            spotLabel,
            dateLabel,
            peopleLabel,
            stayLabel
        });

        return {
            bookings,
            activeBooking,
            activeIndex,
            activeIndexLabel,
            activeSpotLabel,
            activePackageLabel,
            activeCompanionLabel,
            guidance,
            hasSpot,
            hasDate,
            hasPeople,
            isConfirmed,
            filledCount,
            summaryStage,
            intro: SUMMARY_INTRO_COPY[summaryStage] || SUMMARY_INTRO_COPY.idle,
            statusNote: buildPlannerSummaryReceiptCopy({
                hasSpot,
                hasDate,
                hasPeople,
                spotLabel,
                dateLabel,
                peopleLabel,
                stayLabel
            }),
            rhythmSentence: buildPlannerRhythmSentence({
                hasSpot,
                hasDate,
                hasPeople,
                spotLabel,
                dateLabel,
                peopleLabel,
                stayLabel
            }),
            items: {
                spot: {
                    value: spotLabel,
                    meta: hasSpot
                        ? (stayLabel ? `这片海先收成${stayLabel}的停驻。` : summaryMetaMap.spot.filledMeta)
                        : summaryMetaMap.spot.emptyMeta,
                    state: hasSpot ? summaryMetaMap.spot.filledState : summaryMetaMap.spot.emptyState,
                    isFilled: hasSpot
                },
                date: {
                    value: dateLabel,
                    meta: hasDate ? summaryMetaMap.date.filledMeta : summaryMetaMap.date.emptyMeta,
                    state: hasDate ? summaryMetaMap.date.filledState : summaryMetaMap.date.emptyState,
                    isFilled: hasDate
                },
                people: {
                    value: peopleLabel,
                    meta: hasPeople ? summaryMetaMap.people.filledMeta : summaryMetaMap.people.emptyMeta,
                    state: hasPeople ? summaryMetaMap.people.filledState : summaryMetaMap.people.emptyState,
                    isFilled: hasPeople
                }
            }
        };
    }

    function applyPlannerSummaryState(state, options = {}) {
        const { renderDeck = true } = options;
        const wasConfirmed = summaryRoot.classList.contains('is-confirmed');

        summaryActiveIndex.textContent = state.activeIndexLabel;
        summaryIntro.textContent = state.intro;
        syncPlannerSummaryGuidance(state.guidance);
        syncPlannerSummaryNeighbors(state.bookings, state.activeBooking);
        summaryRoot.dataset.summaryStage = state.summaryStage;
        summaryRoot.classList.toggle('is-empty', state.filledCount === 0);
        summaryRoot.classList.toggle('has-progress', state.filledCount > 0);
        summaryRoot.classList.toggle('is-confirmed', state.isConfirmed);
        summaryRoot.classList.toggle('is-breathing', state.filledCount > 0 && !state.isConfirmed);
        syncPlannerSummaryMeter(state.filledCount, state.isConfirmed, {
            hasSpot: state.hasSpot,
            hasDate: state.hasDate,
            hasPeople: state.hasPeople
        });
        syncPlannerSubmitActionLabel();

        if (renderDeck) {
            renderPlannerSummaryDeckState(state);
            clearPlannerSummaryHeightResetTimer();
            if (!summaryIsSwitching) {
                summarySwimViewport.style.height = '';
            }
        }

        if (hasRenderedSummaryOnce && state.isConfirmed && !wasConfirmed) {
            restartTransientClassAnimation(summaryRoot, 'is-updated-confirmed');
        } else if (!state.isConfirmed) {
            summaryRoot.classList.remove('is-updated-confirmed');
        }

        hasRenderedSummaryOnce = true;
    }

    /**
     * updatePlannerSummary() - 根据当前字段值刷新回执层
     * @returns {Object} - 当前回执状态对象
     */
    function updatePlannerSummary() {
        const state = buildPlannerSummaryViewState();
        applyPlannerSummaryState(state);

        if (store && typeof store.savePlannerDraft === 'function') {
            // 这里保存的是 Planner 的“编辑中草稿”；
            // 它和下面 commitPlannerDeskSelection() 写入的已收进行程是两层不同的数据。
            store.savePlannerDraft(buildPlannerDraftPayload());
        }

        return state;
    }

    function getPlannerSummarySwitchTarget(direction, bookings = getConfirmedBookings()) {
        const safeBookings = Array.isArray(bookings) ? bookings : [];
        const activeBooking = getActiveBooking(safeBookings);

        if (!activeBooking || safeBookings.length < 2) {
            return null;
        }

        const activeIndex = safeBookings.findIndex((booking) => booking?.entryId === activeBooking?.entryId);
        if (activeIndex === -1) {
            return null;
        }

        const targetIndex = direction === 'backward'
            ? (activeIndex - 1 + safeBookings.length) % safeBookings.length
            : (activeIndex + 1) % safeBookings.length;

        return safeBookings[targetIndex] || null;
    }

    function switchPlannerSummaryBooking(entryId, direction = 'forward', source = 'preview') {
        const safeEntryId = String(entryId || '').trim();
        const flowDirection = direction === 'backward' ? 'backward' : 'forward';
        const bookings = getConfirmedBookings();
        const activeBooking = getActiveBooking(bookings);
        const nextBooking = getBookingByEntryId(safeEntryId, bookings);

        if (
            !safeEntryId ||
            summaryIsSwitching ||
            !activeBooking ||
            !nextBooking ||
            safeEntryId === String(activeBooking.entryId || '').trim() ||
            bookings.length < 2
        ) {
            return null;
        }

        const currentDeck = getActiveSummaryDeck();
        if (!currentDeck) {
            const fallbackBooking = setActiveBooking(safeEntryId, {
                bookings,
                refreshSummary: true,
                refreshCards: true
            });
            if (summarySwitchLive && fallbackBooking?.spotName) {
                summarySwitchLive.textContent = `已切到${fallbackBooking.spotName}。`;
            }
            return fallbackBooking;
        }

        clearPlannerSummaryHeightResetTimer();
        resetPlannerSummarySwipeShift();

        summaryIsSwitching = true;
        summaryRoot.classList.add('is-swim-switching');
        summarySwimStage.classList.add('is-stage-switching');
        summarySwimStage.classList.toggle('is-flow-backward', flowDirection === 'backward');
        summarySwimStage.classList.toggle('is-flow-forward', flowDirection !== 'backward');
        summarySwimViewport.classList.add('is-stage-switching');
        lockPlannerSummaryViewportHeight(currentDeck);
        currentDeck.classList.remove('is-deck-active');
        currentDeck.classList.add('is-deck-outgoing');

        setActiveBooking(safeEntryId, {
            bookings,
            refreshSummary: false,
            refreshCards: true
        });

        const nextState = buildPlannerSummaryViewState();
        applyPlannerSummaryState(nextState, { renderDeck: false });

        if (store && typeof store.savePlannerDraft === 'function') {
            store.savePlannerDraft(buildPlannerDraftPayload());
        }

        const incomingDeck = createPlannerSummaryDeckElement(nextState);
        incomingDeck.classList.add('is-deck-incoming');
        summarySwimViewport.appendChild(incomingDeck);
        lockPlannerSummaryViewportHeight(currentDeck, incomingDeck);

        summaryStageSwitchTimer = window.setTimeout(() => {
            incomingDeck.classList.add('is-deck-active');
            summaryStageSwitchTimer = 0;
        }, 24);

        summaryStageCleanupTimer = window.setTimeout(() => {
            if (currentDeck.isConnected) {
                currentDeck.remove();
            }

            incomingDeck.classList.remove('is-deck-incoming');
            incomingDeck.classList.add('is-deck-active');
            summarySwimStage.classList.remove('is-stage-switching', 'is-flow-forward', 'is-flow-backward', 'is-dragging');
            summarySwimViewport.classList.remove('is-stage-switching');
            summaryRoot.classList.remove('is-swim-switching');
            summaryIsSwitching = false;
            releasePlannerSummaryViewportHeight();
            syncPlannerSummaryNeighbors(nextState.bookings, nextState.activeBooking);

            if (summarySwitchLive && nextBooking?.spotName) {
                summarySwitchLive.textContent = source === 'gesture'
                    ? `已潜游到${nextBooking.spotName}。`
                    : `已切到${nextBooking.spotName}。`;
            }

            summaryStageCleanupTimer = 0;
        }, SUMMARY_SWITCH_DURATION_MS);

        return nextBooking;
    }

    /**
     * commitPlannerDeskSelection() - 把当前行程控制台的最新选择立即同步到已收进行程
     * @returns {void} - 无返回值，直接更新共享存储并刷新列表
     */
    function commitPlannerDeskSelection() {
        const activeBooking = getActiveBooking();
        // 草稿负责“页面回来还能继续填”，
        // 这里负责“已收进行程列表立刻看到最新日期和人数”。
        syncPlannerSelectionToConfirmedBookings({
            entryId: activeBooking?.entryId || '',
            spotValue: spotInput.value,
            dateValue: dateInput.value,
            dateLabel: dateInput.value ? formatPlannerDate(dateInput.value) : '',
            peopleValue: peopleInput.value,
            peopleLabel: peopleInput.dataset.label || COPY.people.emptyLabel
        });

        renderConfirmedBookings();
        window.dispatchEvent(new CustomEvent('yanqi:confirmed-bookings-updated'));
    }

    /**
     * restorePlannerDraft() - 从共享存储中回填行程控制台之前保存的草稿
     * @returns {void} - 无返回值，直接同步字段当前状态
     */
    function restorePlannerDraft() {
        const bookings = getConfirmedBookings();
        if (Array.isArray(bookings) && bookings.length) {
            setActiveBooking(resolveInitialActiveBookingEntryId(bookings), {
                bookings,
                refreshSummary: false,
                refreshCards: false
            });
            return;
        }

        saveActiveBookingSelection('');
        renderPlannerBookingSwitcher([]);

        if (!store || typeof store.getPlannerDraft !== 'function') {
            syncSpotOptionsFromBookings(null, true);
            applyPeopleSelectionValue('', '', '');
            syncDateFieldDisplay();
            return;
        }

        const draft = store.getPlannerDraft();
        restoreDraftSelection(draft);
    }
    const peopleOptions = Array.from(peoplePanel.querySelectorAll('.planner-option[data-option-group="people"]'));

    function resetPlannerSummaryGestureTracking() {
        const pointerId = summaryGestureState.pointerId;
        if (
            pointerId !== null &&
            typeof pointerId === 'number' &&
            typeof summarySwimStage.releasePointerCapture === 'function' &&
            summarySwimStage.hasPointerCapture?.(pointerId)
        ) {
            try {
                summarySwimStage.releasePointerCapture(pointerId);
            } catch (error) {
                // 某些浏览器在 pointer 已结束后会抛异常，这里静默兜底即可。
            }
        }

        summaryGestureState.pointerId = null;
        summaryGestureState.startX = 0;
        summaryGestureState.startY = 0;
        resetPlannerSummarySwipeShift();
    }

    function beginPlannerSummaryGesture(pointerToken, clientX, clientY) {
        if (
            summaryIsSwitching ||
            getConfirmedBookings().length < 2 ||
            summaryGestureState.pointerId !== null
        ) {
            return false;
        }

        summaryGestureState.pointerId = pointerToken;
        summaryGestureState.startX = clientX;
        summaryGestureState.startY = clientY;
        summaryGestureState.shiftX = 0;
        summaryGestureState.claimed = false;
        return true;
    }

    function updatePlannerSummaryGesture(pointerToken, clientX, clientY, onClaim = null) {
        if (summaryGestureState.pointerId !== pointerToken || summaryIsSwitching) {
            return;
        }

        const deltaX = clientX - summaryGestureState.startX;
        const deltaY = clientY - summaryGestureState.startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (!summaryGestureState.claimed) {
            if (absX < SUMMARY_SWIPE_CLAIM_DISTANCE && absY < SUMMARY_SWIPE_CLAIM_DISTANCE) {
                return;
            }

            if (absX <= absY * SUMMARY_SWIPE_CLAIM_RATIO) {
                resetPlannerSummaryGestureTracking();
                return;
            }

            summaryGestureState.claimed = true;
            summarySwimStage.classList.add('is-dragging');
            if (typeof onClaim === 'function') {
                onClaim();
            }
        }

        summaryGestureState.shiftX = Math.max(-136, Math.min(136, deltaX));
        summarySwimStage.style.setProperty('--planner-summary-swipe-shift', `${summaryGestureState.shiftX}px`);
    }

    function finishPlannerSummaryGesture(pointerToken) {
        if (summaryGestureState.pointerId !== pointerToken) {
            return;
        }

        const finalShift = summaryGestureState.shiftX;
        const direction = finalShift < 0 ? 'forward' : 'backward';
        const targetBooking = Math.abs(finalShift) >= SUMMARY_SWIPE_TRIGGER_DISTANCE
            ? getPlannerSummarySwitchTarget(direction)
            : null;

        resetPlannerSummaryGestureTracking();

        if (!targetBooking) {
            return;
        }

        switchPlannerSummaryBooking(targetBooking.entryId, direction, 'gesture');
    }

    [summaryPrevNeighbor, summaryNextNeighbor].forEach((button, index) => {
        button.addEventListener('click', () => {
            const entryId = String(button.dataset.entryId || '').trim();
            const direction = index === 0 ? 'backward' : 'forward';
            if (!entryId) {
                return;
            }

            switchPlannerSummaryBooking(entryId, direction, 'preview');
        });
    });

    summarySwimStage.addEventListener('keydown', (event) => {
        if (summaryIsSwitching || event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }

        const direction = event.key === 'ArrowLeft'
            ? 'backward'
            : (event.key === 'ArrowRight' ? 'forward' : '');
        if (!direction) {
            return;
        }

        const targetBooking = getPlannerSummarySwitchTarget(direction);
        if (!targetBooking) {
            return;
        }

        event.preventDefault();
        switchPlannerSummaryBooking(targetBooking.entryId, direction, 'keyboard');
    });

    summarySwimStage.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse') {
            return;
        }

        if (event.button !== 0) {
            return;
        }

        beginPlannerSummaryGesture(event.pointerId, event.clientX, event.clientY);
    });

    summarySwimStage.addEventListener('pointermove', (event) => {
        if (summaryGestureState.pointerId !== event.pointerId) {
            return;
        }

        if (event.cancelable) {
            event.preventDefault();
        }

        updatePlannerSummaryGesture(event.pointerId, event.clientX, event.clientY, () => {
            if (typeof summarySwimStage.setPointerCapture === 'function') {
                summarySwimStage.setPointerCapture(event.pointerId);
            }
        });
    });

    const handlePlannerSummaryPointerRelease = (event) => {
        finishPlannerSummaryGesture(event.pointerId);
    };

    summarySwimStage.addEventListener('pointerup', handlePlannerSummaryPointerRelease);
    summarySwimStage.addEventListener('pointercancel', handlePlannerSummaryPointerRelease);
    summarySwimStage.addEventListener('lostpointercapture', handlePlannerSummaryPointerRelease);

    summarySwimStage.addEventListener('mousedown', (event) => {
        if (event.button !== 0) {
            return;
        }

        beginPlannerSummaryGesture('mouse', event.clientX, event.clientY);
    });

    window.addEventListener('mousemove', (event) => {
        if (summaryGestureState.pointerId !== 'mouse') {
            return;
        }

        updatePlannerSummaryGesture('mouse', event.clientX, event.clientY);
    });

    window.addEventListener('mouseup', () => {
        finishPlannerSummaryGesture('mouse');
    });

    plannerBookingSwitcherTrack.addEventListener('click', (event) => {
        const chip = event.target.closest('.planner-booking-switcher-chip[data-entry-id]');
        if (!chip) {
            return;
        }

        const entryId = String(chip.dataset.entryId || '').trim();
        if (!entryId || entryId === activeBookingEntryId) {
            return;
        }

        closeActivePanel();
        setActiveBooking(entryId, {
            refreshSummary: true,
            refreshCards: true
        });
    });

    // 三个字段都采用“再点一次自己就收起”的切换规则，减少手机端多余操作。
    spotTrigger.addEventListener('click', () => {
        if (isPlannerBoundToConfirmedBooking()) {
            closeActivePanel();
            return;
        }

        if (activePanelKey === 'spot') {
            closePanel('spot');
            return;
        }

        openPanel('spot');
    });

    peopleTrigger.addEventListener('click', () => {
        if (activePanelKey === 'people') {
            closePanel('people');
            return;
        }

        openPanel('people');
    });

    dateTrigger.addEventListener('click', () => {
        if (activePanelKey === 'date') {
            closePanel('date');
            return;
        }

        openPanel('date');
    });

    dateInput.addEventListener('change', () => {
        prepareFieldPanel('date');
        syncProgressivePlannerState();
        updatePlannerSummary();
        commitPlannerDeskSelection();

        if (dateInput.value) {
            queueAutoAdvance('date');
        }
    });

    calendarPrev.addEventListener('click', () => {
        calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() - 1, 1);
        renderPlannerCalendar('prev');
    });

    calendarNext.addEventListener('click', () => {
        calendarViewDate = new Date(calendarViewDate.getFullYear(), calendarViewDate.getMonth() + 1, 1);
        renderPlannerCalendar('next');
    });

    calendarGrid.addEventListener('click', (event) => {
        const dayButton = event.target.closest('.planner-calendar-day');
        if (!dayButton || !dayButton.dataset.value) {
            return;
        }

        selectCalendarDate(dayButton.dataset.value);
    });

    spotPanel.addEventListener('click', (event) => {
        const option = event.target.closest('.planner-option[data-option-group="spot"]');
        if (!option) {
            return;
        }

        setOptionState('spot', option);
        syncProgressivePlannerState();
        updatePlannerSummary();
        commitPlannerDeskSelection();
        closePanel('spot');

        if (spotInput.value && !dateInput.value) {
            queueAutoAdvance('spot');
        }
    });

    // 人数选项分成两条处理路径：
    // 1. 预设人数：直接把按钮上挂的 data-* 写回字段、摘要和已收进行程；
    // 2. 自定义人数：先展开输入区，让用户确认具体人数，再统一走 applyCustomPeopleValue()。
    peopleOptions.forEach((option) => {
        option.addEventListener('click', () => {
            if (option.dataset.value === 'custom') {
                // 再次打开“自定义”时，优先把当前自定义人数带回输入框，方便继续调整。
                showCustomPeopleEditor(getCustomPeopleCount());
                return;
            }

            // 预设人数不需要额外确认，点一下就立刻同步整块 Planner 的显示与已收进行程。
            setOptionState('people', option);
            syncProgressivePlannerState();
            updatePlannerSummary();
            commitPlannerDeskSelection();
            hideCustomPeopleEditor();
            closePanel('people');
        });
    });

    // “应用”按钮与回车键共用同一提交函数，避免两套入口出现不同校验结果。
    customPeopleApply.addEventListener('click', () => {
        applyCustomPeopleValue();
    });

    customPeopleInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            // 阻止 Enter 触发表单默认提交，改由自定义人数自己的确认逻辑接管。
            event.preventDefault();
            applyCustomPeopleValue();
        }
    });

    // 主按钮更像“把当前安排收进下一层浏览节奏”：
    // 先保存草稿和已收进行程，再给出一小段“已收住”的确认反馈，最后平滑滚动到目标区块。
    submitButton.addEventListener('click', (event) => {
        event.preventDefault();
        clearPendingAutoAdvance();
        persistPlannerDraft();
        commitPlannerDeskSelection();
        closeActivePanel();
        triggerPlannerSubmitFeedback();
    });

    document.addEventListener('click', (event) => {
        if (
            event.target.closest('#plannerDeskControl') ||
            event.target.closest('.planner-option-panel')
        ) {
            return;
        }

        closeActivePanel();
    });
    // 点击页面空白处时关闭浮层，避免浮层长时间悬在页面上打断阅读。

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeActivePanel();
        }
    });
    // ESC 是最自然的“收起浮层”键盘语义，也补上桌面端可访问性。

    const defaultPeopleOption = peoplePanel.querySelector('.planner-option.is-selected') || peopleOptions[0];

    floatingLayer.appendChild(spotPanel);
    floatingLayer.appendChild(datePanel);
    floatingLayer.appendChild(peoplePanel);
    floatingLayer.hidden = true;
    floatingLayer.setAttribute('aria-hidden', 'true');
    // 初始化时就先把三个面板搬进统一浮层容器，后面打开时只需要改状态，不再反复找位置

    calendarViewDate = new Date(getCalendarDisplayDate().getFullYear(), getCalendarDisplayDate().getMonth(), 1);

    setOptionState('people', defaultPeopleOption);
    restorePlannerDraft();
    renderPlannerCalendar();
    syncProgressivePlannerState();
    updatePlannerSummary();

    window.addEventListener('yanqi:confirmed-bookings-updated', () => {
        restorePlannerDraft();
        renderPlannerCalendar();
        updatePlannerSummary();
    });

    window.YanqiTripPlannerActions = {
        jumpToField: jumpToPlannerField,
        focusBookingField(entryId, fieldKey) {
            jumpToPlannerField(fieldKey, entryId);
        },
        setActiveBooking: (entryId) => {
            setActiveBooking(entryId, {
                refreshSummary: true,
                refreshCards: true
            });
        }
    };
}

// 潜前准备系统：
// 左侧是主题卡片，右侧是详情面板。
// 它的核心不是“展开收起更多文字”，而是用更平静的节奏把准备事项逐层摊开。
class PrepSystem {
    /**
     * constructor() - 初始化准备系统所需的卡片、面板和默认激活项
     */
    constructor() {
        this.cards = Array.from(document.querySelectorAll('[data-prep-card]'));
        this.panel = document.getElementById('prepDetailPanel');
        this.kicker = document.getElementById('prepDetailKicker');
        this.title = document.getElementById('prepDetailTitle');
        this.summary = document.getElementById('prepDetailSummary');
        this.content = document.getElementById('prepDetailContent');
        this.activeKey = null;

        if (!this.cards.length || !this.panel || !this.content) {
            return;
        }

        this.bindEvents();
        window.addEventListener('yanqi:confirmed-bookings-updated', () => {
            if (this.activeKey) {
                this.open(this.activeKey);
            }
        });
        this.open(this.cards[0].dataset.prepCard);
    }

    /**
     * bindEvents() - 绑定准备卡切换和二级帮助面板展开事件
     * @returns {void} - 无返回值，直接注册事件监听
     */
    bindEvents() {
        this.cards.forEach((card) => {
            card.addEventListener('click', () => {
                this.open(card.dataset.prepCard);
            });
        });

        this.content.addEventListener('click', (event) => {
            const toggle = event.target.closest('.prep-subtoggle');
            if (!toggle) {
                return;
            }

            const targetName = toggle.dataset.subpanelTarget;
            if (!targetName) {
                return;
            }

            const subpanel = this.content.querySelector(`[data-subpanel="${targetName}"]`);
            if (!subpanel) {
                return;
            }

            const isOpen = subpanel.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', String(isOpen));
        });
    }

    /**
     * open(key) - 打开指定准备主题并刷新右侧详情面。
     * @param {string} key - 需要打开的准备主题键。
     * @returns {void} - 无返回值，直接更新卡片和面板状。
     */
    open(key) {
        if (!key || !PREP_CONTENT[key]) {
            return;
        }

        const shouldRefreshPanel = this.activeKey && this.activeKey !== key;
        this.activeKey = key;
        const config = PREP_CONTENT[key];
        const template = document.getElementById(config.templateId);

        this.cards.forEach((card) => {
            const isActive = card.dataset.prepCard === key;
            card.classList.toggle('is-active', isActive);
            card.setAttribute('aria-expanded', String(isActive));
            card.setAttribute('aria-selected', String(isActive));
        });

        if (this.kicker) {
            this.kicker.textContent = config.kicker;
        }

        if (this.title) {
            this.title.textContent = config.title;
        }

        if (this.summary) {
            this.summary.textContent = config.summary;
        }

        if (shouldRefreshPanel) {
            this.panel.classList.remove('is-switching');
            requestAnimationFrame(() => {
                this.panel.classList.add('is-switching');
            });
            window.setTimeout(() => {
                this.panel.classList.remove('is-switching');
            }, 780);
        }
        this.content.innerHTML = '';

        if (template) {
            this.content.appendChild(template.content.cloneNode(true));
        }

        const dynamicMarkup = buildDynamicPrepPanelMarkup(key);
        if (dynamicMarkup) {
            this.content.insertAdjacentHTML('beforeend', dynamicMarkup);
        }

        const detailBlocks = Array.from(this.content.querySelectorAll('.prep-detail-block'));

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                detailBlocks.forEach((block) => block.classList.add('is-ready'));
            });
        });
        // 连续两帧 requestAnimationFrame 是为了确保：
        // 1. 新内容先插入 DOM。
        // 2. 浏览器先完成一次布局。
        // 3. 再触发内容显现，让换面节奏稳定生效。
    }
}

// 已收进行程区域配置：统一控制空状态文案与缺省字段的盐憩语气。
const CONFIRMED_BOOKING_COPY = Object.freeze({
    emptyDate: '仍在等一段合适的潮汐',
    emptyPeople: '同行节奏还没写进这一潜',
    emptyTagline: '这片海已经被收下，接下来只等节奏慢慢靠近。',
    emptyNote: '这次下潜已经停进行程里，接下来可以继续整理日期、同行与海况窗口。'
});

const CONFIRMED_BOOKINGS_PAGE_SIZE = 4;
let confirmedBookingsPageIndex = 0;

/**
 * escapeHtml(value) - 转义动态文本，避免行程卡片渲染时插入不安全内容
 * @param {*} value - 原始文本值
 * @returns {string} - 转义后的安全字符。
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * getTripStore() - 获取共享的盐憩行程存储实例
 * @returns {Object|null} - 共享存储对象或空值
 */
function getTripStore() {
    return window.YanqiTripStore || null;
}

function getActiveConfirmedBooking(bookings = []) {
    const store = getTripStore();
    const safeBookings = Array.isArray(bookings) ? bookings : [];
    const activeEntryId = String(store?.getActiveBookingId?.() || '').trim();
    return safeBookings.find((booking) => String(booking?.entryId || '').trim() === activeEntryId)
        || safeBookings[0]
        || null;
}

function buildSeaBriefPrepMarkup(booking, profile, windowConfig) {
    const prepLabels = {
        'check-dive': '把第一潜收作 check dive',
        'current-briefing': '出海前再读一遍流区 brief',
        'equipment-review': '出发前复核耳压、电脑表和基础装备',
        'rest-window': '在两潜之间留更从容的恢复窗',
        'gentle-window': '优先选择更稳的入海窗口'
    };
    const prepFlags = Array.isArray(booking?.prepFlags) ? booking.prepFlags : [];
    const prepItems = prepFlags.length
        ? prepFlags.map((flag) => prepLabels[flag] || flag)
        : ['这一次暂时不需要额外的准备标记。'];
    const recentState = profile?.recentDiveState || '';
    const bodyStateCopy = recentState && recentState !== 'recent'
        ? (windowConfig?.reentryNote || '如果近期没有稳定下潜记录，第一潜更适合先收作回水确认。')
        : '当前状态更适合把注意力留给节奏、光线和进入海的方式。';

    return `
        <div class="sea-brief-prep-block">
            <p class="sea-brief-prep-label">准备清单</p>
            <div class="sea-brief-prep-list">
                ${prepItems.map((item) => `<span class="sea-brief-prep-chip">${escapeHtml(item)}</span>`).join('')}
            </div>
        </div>
        <div class="sea-brief-prep-block">
            <p class="sea-brief-prep-label">身体与状态</p>
            <p class="sea-brief-prep-copy">${escapeHtml(bodyStateCopy)}</p>
        </div>
    `;
}

function renderSeaBrief(bookings = []) {
    const empty = document.getElementById('seaBriefEmpty');
    const card = document.getElementById('seaBriefCard');
    const spotNode = document.getElementById('seaBriefSpot');
    const packageNode = document.getElementById('seaBriefPackage');
    const badgesNode = document.getElementById('seaBriefBadges');
    const gridNode = document.getElementById('seaBriefGrid');
    const prepNode = document.getElementById('seaBriefPrep');

    if (!empty || !card || !spotNode || !packageNode || !badgesNode || !gridNode || !prepNode) {
        return;
    }

    const activeBooking = getActiveConfirmedBooking(bookings);
    if (!activeBooking) {
        empty.hidden = false;
        card.hidden = true;
        return;
    }

    const profile = getTripDiverProfile();
    const windowConfig = getTripWindowConfigBySpotId(resolveTripSpotId(activeBooking.spotKey));
    const gridItems = [
        ['海域', activeBooking.spotName || '当前海域'],
        ['套餐', activeBooking.packageTitle || '当前套餐'],
        ['停留', activeBooking.packageDuration || '停留待定'],
        ['入海时段', activeBooking.windowLabel || windowConfig?.dayWindows?.[0]?.label || '窗口待定'],
        ['同行人数', activeBooking.selectedPeopleLabel || '同行待定'],
        ['适配结论', activeBooking.fitLabel || '待判断'],
        ['check dive', activeBooking.prepFlags?.includes('check-dive') ? '建议先做' : '可按当前节奏进入'],
        ['当前窗口', windowConfig ? `${(windowConfig.recommendedMonths || []).join(' / ')} 月更稳` : '窗口待确认']
    ];

    empty.hidden = true;
    card.hidden = false;
    spotNode.textContent = activeBooking.spotName || '当前海域';
    packageNode.textContent = activeBooking.packageTitle || '当前套餐';
    badgesNode.innerHTML = [
        activeBooking.packageTier,
        activeBooking.fitLabel,
        activeBooking.windowLabel
    ].filter(Boolean).map((item) => `<span class="sea-brief-badge">${escapeHtml(item)}</span>`).join('');
    gridNode.innerHTML = gridItems.map(([label, value]) => `
        <div class="sea-brief-item">
            <span class="sea-brief-item-label">${escapeHtml(label)}</span>
            <strong class="sea-brief-item-value">${escapeHtml(value)}</strong>
        </div>
    `).join('');
    prepNode.innerHTML = buildSeaBriefPrepMarkup(activeBooking, profile, windowConfig);
}

let confirmedBookingsTextLayoutController = null;
const tripRevealObservers = new Map();

// 把“单个显现区块 -> 它当前挂着的 reveal timeout”绑定起来。
// 这样区块还没来得及显示就被重新渲染时，可以先把旧计时器清掉，避免动画串线。
const tripRevealTimers = new WeakMap();

/**
 * clearTripRevealTimer(element) - 清理某个 reveal 元素挂着的延迟计时器
 * @param {Element} element - 需要清理计时器的目标元素
 * @returns {void} - 无返回值，直接清理内部状态
 */
function clearTripRevealTimer(element) {
    const timerId = tripRevealTimers.get(element);
    if (timerId) {
        window.clearTimeout(timerId);
        tripRevealTimers.delete(element);
    }
}

/**
 * scheduleTripReveal(element, delay) - 按轻微错落节奏触发单个区块显现
 * @param {Element} element - 需要显现的目标元素
 * @param {number} delay - 延迟时间
 * @returns {void} - 无返回值，直接切换可见状态
 */
function scheduleTripReveal(element, delay) {
    if (!element || element.classList.contains('is-visible')) {
        return;
    }

    clearTripRevealTimer(element);
    const timerId = window.setTimeout(() => {
        element.classList.add('is-visible');
        tripRevealTimers.delete(element);
    }, Math.max(0, delay || 0));

    tripRevealTimers.set(element, timerId);
}

/**
 * getTripRevealObserver(options) - 按不同阈值配置复用 reveal 观察器
 * @param {{ threshold?: number, rootMargin?: string, requireViewportReady?: boolean, readyTopRatio?: number, readyBottomRatio?: number }} [options] - observer 配置
 * @returns {IntersectionObserver} - 对应配置下的可复用 observer
 */
function getTripRevealObserver(options = {}) {
    const thresholdValue = Number.isFinite(options.threshold) ? options.threshold : 0.14;
    const threshold = Math.min(1, Math.max(0, thresholdValue));
    const rootMargin = typeof options.rootMargin === 'string' && options.rootMargin.trim()
        ? options.rootMargin.trim()
        : '0px 0px -8% 0px';
    const requireViewportReady = options.requireViewportReady === true;
    const readyTopRatio = Number.isFinite(options.readyTopRatio) ? options.readyTopRatio : 0.96;
    const readyBottomRatio = Number.isFinite(options.readyBottomRatio) ? options.readyBottomRatio : 0.08;
    const observerKey = [
        threshold.toFixed(3),
        rootMargin,
        requireViewportReady ? '1' : '0',
        readyTopRatio.toFixed(3),
        readyBottomRatio.toFixed(3)
    ].join('|');

    if (tripRevealObservers.has(observerKey)) {
        return tripRevealObservers.get(observerKey);
    }

    const observer = new IntersectionObserver((entries, currentObserver) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            const target = entry.target;
            if (requireViewportReady && !isElementReadyForViewportEntrance(target, {
                topRatio: readyTopRatio,
                bottomRatio: readyBottomRatio
            })) {
                return;
            }

            const revealIndex = Number(target.dataset.tripRevealIndex || 0);
            const revealDelay = Number(target.dataset.tripRevealDelay || 0);
            const stepDelay = Number(target.dataset.tripRevealStepDelay || 0);
            scheduleTripReveal(target, revealDelay || (revealIndex * stepDelay));
            currentObserver.unobserve(target);
        });
    }, {
        threshold,
        rootMargin
    });

    tripRevealObservers.set(observerKey, observer);
    return observer;
}

/**
 * observeTripRevealElements(elements, options) - 用统一 observer 监听行程页的区块显现
 * @param {Element[]} elements - 需要监听的节点列表
 * @param {{ baseDelay?: number, stepDelay?: number, threshold?: number, rootMargin?: string, requireViewportReady?: boolean, readyTopRatio?: number, readyBottomRatio?: number }} [options] - reveal 节奏与 observer 配置
 * @returns {void} - 无返回值，直接注册 reveal 行为
 */
function observeTripRevealElements(elements, options = {}) {
    const targets = Array.isArray(elements)
        ? elements.filter((element) => element instanceof Element)
        : [];

    if (!targets.length) {
        return;
    }

    const baseDelay = Number.isFinite(options.baseDelay) ? options.baseDelay : 0;
    const stepDelay = Number.isFinite(options.stepDelay) ? options.stepDelay : 88;
    const observer = getTripRevealObserver({
        threshold: options.threshold,
        rootMargin: options.rootMargin,
        requireViewportReady: options.requireViewportReady,
        readyTopRatio: options.readyTopRatio,
        readyBottomRatio: options.readyBottomRatio
    });

    targets.forEach((target, index) => {
        if (target.classList.contains('is-visible')) {
            return;
        }

        target.dataset.tripRevealIndex = String(index);
        target.dataset.tripRevealDelay = String(baseDelay + (index * stepDelay));
        target.dataset.tripRevealStepDelay = String(stepDelay);
        observer.observe(target);
    });
}

/**
 * setupTripReveal() - 给 trip 页中后段区块补一层进入视口后的显现节奏
 * @returns {void} - 无返回值，直接为已存在的区块注册 reveal
 */
function setupTripReveal() {
    const plannerDesk = document.getElementById('plannerDeskControl');
    const focusHead = document.querySelector('#trip-layer .trip-section-head');
    const focusCards = Array.from(document.querySelectorAll('#trip-layer .trip-focus-card'));
    const prepHead = document.querySelector('#trip-prep .trip-section-head');
    const prepCards = Array.from(document.querySelectorAll('#trip-prep .prep-card'));
    const prepPanel = document.getElementById('prepDetailPanel');

    plannerDesk?.classList.add('trip-reveal-block');
    focusHead?.classList.add('trip-reveal-head');
    prepHead?.classList.add('trip-reveal-head');
    prepPanel?.classList.add('trip-reveal-panel');
    focusCards.forEach((card) => card.classList.add('trip-reveal-card'));
    prepCards.forEach((card) => card.classList.add('trip-reveal-card'));

    applyTripRevealPreset([plannerDesk], 'trip-reveal-descent');
    applyTripRevealPreset([focusHead, ...focusCards], 'trip-reveal-current');
    applyTripRevealPreset([prepHead, prepPanel, ...prepCards], 'trip-reveal-ascent');

    observeTripRevealElements([plannerDesk], {
        baseDelay: 80,
        stepDelay: 0,
        threshold: 0.28,
        rootMargin: '0px 0px -18% 0px',
        requireViewportReady: true,
        readyTopRatio: 0.74,
        readyBottomRatio: 0.12
    });
    observeTripRevealElements([focusHead], {
        baseDelay: 20,
        stepDelay: 0,
        threshold: 0.08,
        rootMargin: '0px 0px -10% 0px',
        requireViewportReady: true,
        readyTopRatio: 0.92,
        readyBottomRatio: 0.04
    });
    observeTripRevealElements(focusCards, {
        baseDelay: 40,
        stepDelay: 72,
        threshold: 0.08,
        rootMargin: '0px 0px -10% 0px',
        requireViewportReady: true,
        readyTopRatio: 0.94,
        readyBottomRatio: 0.02
    });
    observeTripRevealElements([prepHead], { baseDelay: 20, stepDelay: 0 });
    observeTripRevealElements(prepCards, { baseDelay: 70, stepDelay: 96 });
    observeTripRevealElements([prepPanel], { baseDelay: 110, stepDelay: 0 });
}

function buildDynamicPrepPanelMarkup(key) {
    const store = getTripStore();
    const bookings = store?.getConfirmedBookings?.() || [];
    const activeBooking = getActiveConfirmedBooking(bookings);
    if (!activeBooking) {
        return '';
    }

    const profile = getTripDiverProfile();
    const profileTitle = sharedDiverProfile?.describeProfile?.(profile)?.title || '当前潜水者档案';
    const spotId = resolveTripSpotId(activeBooking.spotKey);
    const windowConfig = getTripWindowConfigBySpotId(spotId);
    const certLabel = sharedDiverProfile?.getFieldLabel?.('certificationLevel', profile?.certificationLevel) || '当前证书';
    const recentLabel = sharedDiverProfile?.getFieldLabel?.('recentDiveState', profile?.recentDiveState) || '近期状态';
    const comfortLabel = sharedDiverProfile?.getFieldLabel?.('currentComfort', profile?.currentComfort) || '海况偏好';
    const recommendedMonths = (windowConfig?.recommendedMonths || []).length
        ? `${windowConfig.recommendedMonths.join(' / ')} 月`
        : '待确认';
    const prepFlags = Array.isArray(activeBooking.prepFlags) ? activeBooking.prepFlags : [];

    if (key === 'gear') {
        return `
            <div class="prep-detail-block prep-detail-dynamic">
                <h4>这一套安排会额外照看的装备提醒</h4>
                <p>${escapeHtml(activeBooking.fitLabel || '当前安排')} · ${escapeHtml(activeBooking.windowLabel || '当前窗口')}。${escapeHtml(prepFlags.includes('equipment-review') ? '建议出发前再做一次基础装备复核。' : '基础装备按正常节奏排稳即可。')}</p>
            </div>
        `;
    }

    if (key === 'certification') {
        return `
            <div class="prep-detail-block prep-detail-dynamic">
                <h4>与你当前档案对应的证书判断</h4>
                <p>${escapeHtml(profileTitle)} · ${escapeHtml(certLabel)} · ${escapeHtml(recentLabel)}。这一次会更偏向「${escapeHtml(activeBooking.fitLabel || '适合')}」的安排判断。</p>
            </div>
        `;
    }

    if (key === 'weather') {
        return `
            <div class="prep-detail-block prep-detail-dynamic">
                <h4>当前海况窗口回看</h4>
                <p>${escapeHtml(activeBooking.spotName || '当前海域')}更稳的月份通常落在 ${escapeHtml(recommendedMonths)}，这一次已经先收作「${escapeHtml(activeBooking.windowLabel || '窗口待定')}」。</p>
                ${windowConfig?.advancedNote ? `<p class="prep-detail-inline-note">${escapeHtml(windowConfig.advancedNote)}</p>` : ''}
            </div>
        `;
    }

    if (key === 'body') {
        return `
            <div class="prep-detail-block prep-detail-dynamic">
                <h4>身体与状态联动判断</h4>
                <p>${escapeHtml(recentLabel)} · ${escapeHtml(comfortLabel)}。${escapeHtml(windowConfig?.reentryNote || '如果近期状态不够稳定，第一潜更适合先做回水确认。')}</p>
            </div>
        `;
    }

    return '';
}

let confirmedBookingsEntranceObserver = null;

// 把“某个已收进行程列表节点 -> 这一轮入场动画挂着的全部 timeout id”绑定在一起。
// 这样列表重渲染时可以整批取消旧计时器，避免旧回调落到新 DOM 上。
// 这里用 WeakMap，是因为 key 是 DOM 节点；节点销毁后不需要继续强持有这份映射。
const confirmedBookingsEntranceTimers = new WeakMap();

/**
 * isElementReadyForViewportEntrance(element, options) - 判断某个区块是否已经进入当前可见区域
 * @param {Element} element - 需要判断的 DOM 元素
 * @param {{ topRatio?: number, bottomRatio?: number }} [options] - 进入视口判定比例
 * @returns {boolean} - 当前元素是否足够可见，适合触发入场动画
 */
function isElementReadyForViewportEntrance(element, options = {}) {
    if (!(element instanceof Element)) {
        return false;
    }

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const topRatio = Number.isFinite(options.topRatio) ? options.topRatio : 0.96;
    const bottomRatio = Number.isFinite(options.bottomRatio) ? options.bottomRatio : 0.08;

    return rect.top < viewportHeight * topRatio && rect.bottom > viewportHeight * bottomRatio;
}

/**
 * clearConfirmedBookingsEntranceTimers(list) - 清理已收进行程列表挂着的入场计时器
 * 这里清理的不只是“动画延迟”，更是在结束上一轮 render 留下的异步回调；
 * 否则旧 timeout 可能会在新一轮 DOM 已经写入后继续执行，造成重复入场或状态串线。
 * @param {Element} list - 已收进行程列表容器
 * @returns {void} - 无返回值，直接清理内部计时器
 */
function clearConfirmedBookingsEntranceTimers(list) {
    const timerIds = confirmedBookingsEntranceTimers.get(list);
    if (Array.isArray(timerIds)) {
        timerIds.forEach((timerId) => window.clearTimeout(timerId));
    }

    confirmedBookingsEntranceTimers.delete(list);
}

/**
 * runConfirmedBookingsEntrance(list) - 触发已收进行程卡片的成组进入动画
 * 这个函数负责把“最新一批已收进行程卡片”从刷新态推进到稳定态。
 * 它会先确认当前列表确实还在等这一轮入场，再按错落节奏给每张卡片补一次进入动画，
 * 最后统一收尾，避免 observer、类名和 timeout 残留到下一次重渲染。
 * @param {Element} list - 已收进行程列表容器
 * @returns {void} - 无返回值，直接启动两张卡的推进显现
 */
function runConfirmedBookingsEntrance(list) {
    // 只有“当前这批 DOM 还处在待入场状态”时才继续：
    // 1. 节点必须真实存在；
    // 2. `pendingEntrance = true` 表示 renderConfirmedBookings() 刚写入了新卡片，
    //    但这批卡片还没有完整走完本轮入场流程。
    if (!(list instanceof Element) || list.dataset.pendingEntrance !== 'true') {
        return;
    }

    // 一旦决定现在启动入场，就不再需要继续 observe 这个列表。
    // 否则滚动过程中再次满足阈值时，observer 可能重复触发，给同一批卡片重复排队。
    confirmedBookingsEntranceObserver?.unobserve?.(list);

    // 列表可能刚被再次刷新过；先清掉上一轮还没结束的 timeout，
    // 确保当前 DOM 只响应“最新这一轮”的入场节奏。
    clearConfirmedBookingsEntranceTimers(list);

    const cards = Array.from(list.querySelectorAll('.confirmed-booking-card'));
    if (!cards.length) {
        // `is-refreshing` 表示列表刚经历重渲染，CSS 仍处在等待入场的刷新态；
        // 没有卡片时要立即退回稳定态，避免容器一直挂着过渡状态。
        list.classList.remove('is-refreshing');
        list.dataset.pendingEntrance = 'false';
        return;
    }

    const INITIAL_ENTRANCE_DELAY = 90;
    const CARD_STAGGER_DELAY = 150;
    const CARD_ENTERING_DURATION = 980;
    const timerIds = [];

    cards.forEach((card, index) => {
        // 用 setTimeout 把每张卡片错开，是为了做出更轻的成组推进感，
        // 同时把加类动作推迟到当前渲染提交之后，让 CSS 动画从稳定的初始态开始。
        const timerId = window.setTimeout(() => {
            restartTransientClassAnimation(card, 'is-entering');
        }, INITIAL_ENTRANCE_DELAY + (index * CARD_STAGGER_DELAY));
        timerIds.push(timerId);
    });

    // cleanupTimer 负责在最后一张卡片的入场动画结束后，把整组临时状态收干净：
    // 1. 结束列表的刷新态 `is-refreshing`
    // 2. 把“这一批还在等入场”的标记 `pendingEntrance` 复位
    // 3. 移除卡片上的 `is-entering`，保证下次还能重新触发同一段动画
    // 4. 从 WeakMap 删除这一轮 timer 记录，表示当前入场生命周期已结束
    const cleanupTimer = window.setTimeout(() => {
        list.classList.remove('is-refreshing');
        list.dataset.pendingEntrance = 'false';
        cards.forEach((card) => card.classList.remove('is-entering'));
        confirmedBookingsEntranceTimers.delete(list);
    }, INITIAL_ENTRANCE_DELAY + Math.max(0, cards.length - 1) * CARD_STAGGER_DELAY + CARD_ENTERING_DURATION);
    timerIds.push(cleanupTimer);

    // 把这一轮所有 timeout 都记下来。
    // 后面如果用户立刻切换分页、修改日期或人数导致再次 render，就能先整批取消旧回调。
    confirmedBookingsEntranceTimers.set(list, timerIds);
}

/**
 * ensureConfirmedBookingsEntranceObserver() - 保证已收进行程列表有专门的视口 observer
 * 已收进行程不一定在渲染完成时就出现在可见区里；
 * 这个 observer 负责把入场时机延后到“用户真正滚到这里”的那一刻，
 * 避免动画在屏幕外提前播完，回来时只剩静态结果。
 * @returns {IntersectionObserver} - 负责触发卡片入场的 observer 实例
 */
function ensureConfirmedBookingsEntranceObserver() {
    if (confirmedBookingsEntranceObserver) {
        return confirmedBookingsEntranceObserver;
    }

    confirmedBookingsEntranceObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            const target = entry.target;
            if (target instanceof Element) {
                runConfirmedBookingsEntrance(target);
            }
        });
    }, {
        // 稍微提前一点触发，保证卡片刚进入阅读区时就能开始显现。
        threshold: 0.14,
        rootMargin: '0px 0px -6% 0px'
    });

    return confirmedBookingsEntranceObserver;
}

/**
 * syncConfirmedBookingsTextLayout() - 用文本布局工具稳定“已收进行程”卡片里的多行文本高度。
 * 这里优先稳定标题、海域副文案和套餐说明，避免不同海域文本长短不一时出现卡片高度跳动。
 *
 * 这一层只在“已收进行程”区接入，是因为：
 * 1. 它是动态渲染列表，文本长度变化最大；
 * 2. 用户会频繁修改日期 / 人数并触发重渲染；
 * 3. 提前拿到文本高度，收益比放在静态段落里更明显。
 *
 * @returns {void} - 无返回值，直接更新当前列表里的文本块最小高度。
 */
function syncConfirmedBookingsTextLayout() {
    const list = document.getElementById('confirmedBookingsList');
    const textLayout = window.YanqiTextLayout;

    confirmedBookingsTextLayoutController?.disconnect?.();
    confirmedBookingsTextLayoutController = null;

    if (!list || !textLayout || typeof textLayout.mountResponsiveBatch !== 'function' || !list.children.length) {
        return;
    }

    confirmedBookingsTextLayoutController = textLayout.mountResponsiveBatch(list, [
        {
            selector: '.confirmed-booking-spot'
        },
        {
            selector: '.confirmed-booking-tagline'
        },
        {
            selector: '.confirmed-booking-note'
        }
    ]);
}

/**
 * getConfirmedBookingSortValue(booking) - 计算已收进行程卡片的排序值，优先让更早的日期先出。
 * @param {Object} booking - 已确认套餐对象
 * @returns {number} - 用于排序的时间戳，越小越靠前；无日期则排到最后
 */
function getConfirmedBookingSortValue(booking) {
    const rawDate = String(booking?.selectedDate || '').trim();
    if (!rawDate) {
        return Number.POSITIVE_INFINITY;
    }

    const timestamp = Date.parse(`${rawDate}T00:00:00`);
    return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

/**
 * sortConfirmedBookings(bookings) - 对已收进行程列表做稳定排序，优先展示日期更早的安排。
 * @param {Array<Object>} bookings - 原始已确认套餐数组
 * @returns {Array<Object>} - 排序后的套餐数组
 */
function sortConfirmedBookings(bookings) {
    return [...bookings].sort((left, right) => {
        const leftSortValue = getConfirmedBookingSortValue(left);
        const rightSortValue = getConfirmedBookingSortValue(right);

        if (leftSortValue !== rightSortValue) {
            return leftSortValue - rightSortValue;
        }

        const rightUpdatedAt = Date.parse(String(right?.updatedAt || '')) || 0;
        const leftUpdatedAt = Date.parse(String(left?.updatedAt || '')) || 0;
        return rightUpdatedAt - leftUpdatedAt;
    });
}

function getMostRecentlyUpdatedConfirmedBooking(bookings) {
    if (!Array.isArray(bookings) || bookings.length === 0) {
        return null;
    }

    return [...bookings].sort((left, right) => {
        const rightUpdatedAt = Date.parse(String(right?.updatedAt || '')) || 0;
        const leftUpdatedAt = Date.parse(String(left?.updatedAt || '')) || 0;
        return rightUpdatedAt - leftUpdatedAt;
    })[0] || null;
}

/**
 * getPeopleCountFromSelectionValue(value) - 从同行人数字段中提取可用于价格换算的人数
 * @param {string} value - 原始同行人数值，例如 "2"、"3-5"、"6+"
 * @returns {number} - 可用于估算总价的人数，无法识别时回退到 1
 */
function getPeopleCountFromSelectionValue(value) {
    const safeValue = String(value || '').trim();
    if (!safeValue) {
        return 1;
    }

    const exactMatch = safeValue.match(/^(\d+)$/);
    if (exactMatch) {
        return Math.max(1, Number.parseInt(exactMatch[1], 10) || 1);
    }

    const rangeMatch = safeValue.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (rangeMatch) {
        return Math.max(1, Number.parseInt(rangeMatch[1], 10) || 1);
    }

    const plusMatch = safeValue.match(/^(\d+)\s*\+$/);
    if (plusMatch) {
        return Math.max(1, Number.parseInt(plusMatch[1], 10) || 1);
    }

    return 1;
}

/**
 * parseConfirmedBookingPrice(priceText) - 从展示价格中拆出货币符号与数值部分。
 * @param {string} priceText - 价格文本，例如 "¥3,980"
 * @returns {{currency: string, amount: number, fractionDigits: number}|null} - 可计算的价格对象
 */
function parseConfirmedBookingPrice(priceText) {
    const safeText = String(priceText || '').trim();
    if (!safeText) {
        return null;
    }

    const amountMatch = safeText.match(/[\d,.]+/);
    if (!amountMatch) {
        return null;
    }

    const amountText = amountMatch[0].replace(/,/g, '');
    const amount = Number.parseFloat(amountText);
    if (!Number.isFinite(amount)) {
        return null;
    }

    const currency = safeText.replace(amountMatch[0], '').trim();
    const fractionDigits = amountText.includes('.') ? amountText.split('.')[1].length : 0;

    return {
        currency,
        amount,
        fractionDigits
    };
}

/**
 * formatConfirmedBookingAmount(amount, fractionDigits) - 把计算后的价格格式化回展示文案
 * @param {number} amount - 计算后的价格金额
 * @param {number} fractionDigits - 原始价格小数位数
 * @returns {string} - 格式化后的价格字符串
 */
function formatConfirmedBookingAmount(amount, fractionDigits) {
    return amount.toLocaleString('en-US', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
    });
}

/**
 * formatConfirmedBookingCny(amount, fractionDigits) - 把人民币金额格式化成更适合阅读的文本
 * @param {number} amount - 人民币金额
 * @param {number} fractionDigits - 原价的小数位，用来决定是否保留角分
 * @returns {string} - 格式化后的人民币价格
 */
function formatConfirmedBookingCny(amount, fractionDigits) {
    const safeFractionDigits = fractionDigits > 0 ? Math.min(fractionDigits, 2) : 0;

    return amount.toLocaleString('zh-CN', {
        minimumFractionDigits: safeFractionDigits,
        maximumFractionDigits: safeFractionDigits
    });
}

/**
 * getConfirmedBookingPriceView(booking) - 根据同行人数返回行程卡片要显示的价格文本
 * @param {Object} booking - 已收进行程对象
 * @returns {{primary: string, secondary: string, cny: string}} - 主价格与辅助说明
 */
function getConfirmedBookingPriceView(booking) {
    const rawPrice = String(booking?.packagePrice || '').trim();
    const parsedPrice = parseConfirmedBookingPrice(rawPrice);
    const peopleCount = getPeopleCountFromSelectionValue(booking?.selectedPeople);

    if (!parsedPrice) {
        return {
            primary: rawPrice,
            secondary: '',
            cny: ''
        };
    }

    const baseAmount = peopleCount > 1 ? parsedPrice.amount * peopleCount : parsedPrice.amount;
    if (peopleCount <= 1) {
        return {
            primary: rawPrice,
            secondary: '',
            cny: ''
        };
    }

    const pricePrefix = parsedPrice.currency || '¥';
    const selectionLabel = String(booking?.selectedPeopleLabel || '').trim();
    const secondary = /^\d+$/.test(String(booking?.selectedPeople || '').trim())
        ? `${peopleCount} 人合计`
        : `${selectionLabel || `${peopleCount} 人同行`} · 按 ${peopleCount} 人起算`;

    return {
        primary: `${pricePrefix}${formatConfirmedBookingCny(baseAmount, parsedPrice.fractionDigits)}`,
        secondary,
        cny: ''
    };
}

const CONFIRMED_BOOKING_DURATION_BY_PACKAGE_ID = Object.freeze({
    'leisure-1': '3天2晚',
    'leisure-2': '4天3晚',
    'advanced-1': '4天3晚',
    'advanced-2': '5天4晚'
});

function getConfirmedBookingStayLabel(booking) {
    const explicitDuration = String(booking?.packageDuration || '').trim();
    if (explicitDuration) {
        return explicitDuration;
    }

    const packageTitle = String(booking?.packageTitle || '').trim();
    const titleMatch = packageTitle.match(/(\d+\s*天\s*\d+\s*晚)/);
    if (titleMatch) {
        return titleMatch[1].replace(/\s+/g, '');
    }

    const packageId = String(booking?.packageId || '').trim();
    if (packageId && CONFIRMED_BOOKING_DURATION_BY_PACKAGE_ID[packageId]) {
        return CONFIRMED_BOOKING_DURATION_BY_PACKAGE_ID[packageId];
    }

    const packageTags = Array.isArray(booking?.packageTags) ? booking.packageTags : [];
    const durationTag = packageTags.find((tag) => /\d+\s*天\s*\d+\s*晚/.test(String(tag || '')));
    if (durationTag) {
        return String(durationTag).replace(/\s+/g, '');
    }

    const packageNote = String(booking?.packageNote || '').trim();
    const durationMatch = packageNote.match(/(\d+\s*天\s*\d+\s*晚)/);
    if (durationMatch) {
        return durationMatch[1].replace(/\s+/g, '');
    }

    return '停留节奏待定';
}

/**
 * syncPlannerSelectionToConfirmedBookings(selection) - 把当前行程控制台的日期与同行写回已收进行程
 * @param {{spotValue: string, dateValue: string, dateLabel: string, peopleValue: string, peopleLabel: string}} selection - 当前控制台选择结果
 * @returns {Object[]} - 更新后的已收进行程列表
 */
function syncPlannerSelectionToConfirmedBookings(selection) {
    const store = getTripStore();
    if (!store || typeof store.getConfirmedBookings !== 'function' || typeof store.saveConfirmedBookings !== 'function') {
        return [];
    }

    const currentBookings = store.getConfirmedBookings();
    if (!Array.isArray(currentBookings) || currentBookings.length === 0) {
        return [];
    }

    const targetEntryId = String(selection?.entryId || '').trim();
    const nextDateValue = String(selection?.dateValue || '').trim();
    const nextDateLabel = String(selection?.dateLabel || '').trim();
    const nextPeopleValue = String(selection?.peopleValue || '').trim();
    const nextPeopleLabel = String(selection?.peopleLabel || '').trim();
    const now = new Date().toISOString();

    if (!targetEntryId) {
        return currentBookings;
    }

    let hasUpdated = false;
    const nextBookings = currentBookings.map((booking) => {
        const bookingEntryId = String(booking?.entryId || '').trim();
        if (bookingEntryId !== targetEntryId) {
            return booking;
        }

        hasUpdated = true;

        return {
            ...booking,
            selectedDate: nextDateValue,
            selectedDateLabel: nextDateValue ? nextDateLabel : '',
            selectedPeople: nextPeopleValue,
            selectedPeopleLabel: nextPeopleValue ? nextPeopleLabel : '',
            updatedAt: now
        };
    });

    if (!hasUpdated) {
        return currentBookings;
    }

    store.saveConfirmedBookings(nextBookings);
    return nextBookings;
}

/**
 * buildConfirmedBookingCardMarkup(booking) - 生成单张已收进行程卡片的 HTML
 * @param {Object} booking - 已确认套餐对象
 * @returns {string} - 已收进行程卡。HTML
 */
function buildConfirmedBookingCardMarkup(booking) {
    const store = getTripStore();
    const activeBookingId = store && typeof store.getActiveBookingId === 'function'
        ? String(store.getActiveBookingId() || '').trim()
        : '';
    const entryId = String(booking?.entryId || '').trim();
    const isActive = entryId && activeBookingId === entryId;
    const safeTagline = booking.spotTagline || CONFIRMED_BOOKING_COPY.emptyTagline;
    const safeDate = booking.selectedDateLabel || CONFIRMED_BOOKING_COPY.emptyDate;
    const safePeople = booking.selectedPeopleLabel || CONFIRMED_BOOKING_COPY.emptyPeople;
    const safeStay = getConfirmedBookingStayLabel(booking);
    const packageTags = Array.isArray(booking.packageTags) ? booking.packageTags.filter(Boolean).slice(0, 3) : [];
    const priceView = getConfirmedBookingPriceView(booking);
    const metaSignals = [booking.fitLabel, booking.windowLabel].filter(Boolean);

    return `
        <article class="confirmed-booking-card${isActive ? ' is-active' : ''}" data-booking-id="${escapeHtml(booking.bookingId)}" data-booking-entry-id="${escapeHtml(entryId)}">
            <div class="confirmed-booking-top">
                <div class="confirmed-booking-meta">
                    <p class="confirmed-booking-kicker">${escapeHtml(booking.packageTier || '行程档案')}</p>
                    <h3 class="confirmed-booking-spot">${escapeHtml(booking.spotName || '未命名海域')}</h3>
                    <p class="confirmed-booking-tagline">${escapeHtml(safeTagline)}</p>
                </div>
                <span class="confirmed-booking-chip">${escapeHtml(booking.packageTitle || '未命名套餐')}</span>
            </div>

            <div class="confirmed-booking-body">
                <div class="confirmed-booking-price-wrap">
                    <div class="confirmed-booking-price-row">
                        <div class="confirmed-booking-price">${escapeHtml(priceView.primary)}</div>
                        ${priceView.cny ? `<div class="confirmed-booking-price-cny">${escapeHtml(priceView.cny)}</div>` : ''}
                    </div>
                    ${priceView.secondary ? `<div class="confirmed-booking-price-note">${escapeHtml(priceView.secondary)}</div>` : ''}
                </div>
                <p class="confirmed-booking-note">${escapeHtml(booking.packageNote || CONFIRMED_BOOKING_COPY.emptyNote)}</p>
                ${metaSignals.length ? `
                    <div class="confirmed-booking-signal-row">
                        ${metaSignals.map((item) => `<span class="confirmed-booking-signal">${escapeHtml(item)}</span>`).join('')}
                    </div>
                ` : ''}
                ${packageTags.length ? `
                    <div class="confirmed-booking-tags">
                        ${packageTags.map((tag) => `<span class="confirmed-booking-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
            </div>

            <div class="confirmed-booking-details">
                <div
                    class="confirmed-booking-detail confirmed-booking-detail-static"
                    aria-label="这次行程停留时长"
                >
                    <span class="confirmed-booking-detail-label">停留</span>
                    <strong>${escapeHtml(safeStay)}</strong>
                </div>
                <button
                    type="button"
                    class="confirmed-booking-detail"
                    data-planner-field-target="date"
                    data-booking-entry-id="${escapeHtml(entryId)}"
                    aria-label="调整这次下潜的日期"
                >
                    <span class="confirmed-booking-detail-label">日期</span>
                    <strong>${escapeHtml(safeDate)}</strong>
                </button>
                <button
                    type="button"
                    class="confirmed-booking-detail"
                    data-planner-field-target="people"
                    data-booking-entry-id="${escapeHtml(entryId)}"
                    aria-label="调整这次下潜的同行人数"
                >
                    <span class="confirmed-booking-detail-label">同行</span>
                    <strong>${escapeHtml(safePeople)}</strong>
                </button>
            </div>

            <div class="confirmed-booking-actions">
                <button type="button" class="confirmed-booking-link" data-detail-href="${escapeHtml(booking.detailHref || `detail.html?id=${booking.spotKey}`)}">
                    回到这片海
                </button>
                <button type="button" class="confirmed-booking-remove" data-booking-entry-id="${escapeHtml(entryId)}">
                    从行程里移开
                </button>
            </div>
        </article>
    `;
}

/**
 * renderConfirmedBookings() - 读取共享存储并刷新行程页“已收进行程”区。
 * @returns {void} - 无返回值，直接更新行程卡片列表
 */
function renderConfirmedBookings() {
    const list = document.getElementById('confirmedBookingsList');
    const empty = document.getElementById('confirmedBookingsEmpty');
    const switchButton = document.getElementById('confirmedBookingsSwitch');
    if (!list || !empty) {
        return;
    }

    const store = getTripStore();
    const bookings = sortConfirmedBookings(store ? store.getConfirmedBookings() : []);
    if (!Array.isArray(bookings) || bookings.length === 0) {
        empty.hidden = false;
        list.innerHTML = '';
        renderSeaBrief([]);

        // 空列表时不应该保留任何上一轮入场状态。
        // 这里把刷新态、待入场标记和挂着的 timeout 一并清掉，避免下一次渲染继承旧状态。
        list.classList.remove('is-refreshing');
        list.dataset.pendingEntrance = 'false';
        clearConfirmedBookingsEntranceTimers(list);
        confirmedBookingsTextLayoutController?.disconnect?.();
        confirmedBookingsTextLayoutController = null;
        confirmedBookingsPageIndex = 0;
        if (switchButton) {
            switchButton.hidden = true;
        }
        return;
    }

    const totalPages = Math.max(1, Math.ceil(bookings.length / CONFIRMED_BOOKINGS_PAGE_SIZE));
    confirmedBookingsPageIndex = ((confirmedBookingsPageIndex % totalPages) + totalPages) % totalPages;
    const start = confirmedBookingsPageIndex * CONFIRMED_BOOKINGS_PAGE_SIZE;
    const visibleBookings = bookings.slice(start, start + CONFIRMED_BOOKINGS_PAGE_SIZE);

    empty.hidden = true;

    // 新一页卡片准备写入前，先结束上一轮可能还没跑完的入场节奏。
    clearConfirmedBookingsEntranceTimers(list);

    // `is-refreshing` 表示列表 DOM 刚被重建，CSS 可以先进入“等待显现”的刷新态；
    // `pendingEntrance = true` 表示这一批卡片还没正式完成入场，
    // 不管后面是立即触发还是等 observer 触发，都还属于同一轮待执行状态。
    list.classList.add('is-refreshing');
    list.dataset.pendingEntrance = 'true';
    list.innerHTML = visibleBookings.map((booking) => buildConfirmedBookingCardMarkup(booking)).join('');
    syncConfirmedBookingsTextLayout();

    if (isElementReadyForViewportEntrance(document.getElementById('confirmedBookingsStage') || list)) {
        requestAnimationFrame(() => {
            // 即使列表已经在视口里，也等一帧再启动，
            // 让新 DOM、文本布局和尺寸先稳定下来，再从初始样式切入动画。
            runConfirmedBookingsEntrance(list);
        });
    } else {
        // 当前还没滚到这一层时，交给 observer 延后触发，
        // 避免动画在用户看不见的地方先结束。
        ensureConfirmedBookingsEntranceObserver().observe(list);
    }

    if (switchButton) {
        switchButton.hidden = bookings.length <= CONFIRMED_BOOKINGS_PAGE_SIZE;
    }

    renderSeaBrief(bookings);
}

/**
 * setupConfirmedBookingsStage() - 绑定已收进行程区域的跳转与移除行为
 * @returns {void} - 无返回值，直接注册事件并完成初次渲。
 */
function setupConfirmedBookingsStage() {
    const stage = document.getElementById('confirmedBookingsStage');
    const switchButton = document.getElementById('confirmedBookingsSwitch');
    if (!stage) {
        return;
    }

    renderConfirmedBookings();

    switchButton?.addEventListener('click', () => {
        const store = getTripStore();
        const bookings = sortConfirmedBookings(store ? store.getConfirmedBookings() : []);
        const totalPages = Math.max(1, Math.ceil(bookings.length / CONFIRMED_BOOKINGS_PAGE_SIZE));
        if (totalPages <= 1) {
            return;
        }

        confirmedBookingsPageIndex = (confirmedBookingsPageIndex + 1) % totalPages;
        renderConfirmedBookings();
    });

    stage.addEventListener('click', (event) => {
        const card = event.target.closest('.confirmed-booking-card[data-booking-entry-id]');
        if (card && !event.target.closest('button')) {
            const entryId = String(card.dataset.bookingEntryId || '').trim();
            if (entryId) {
                store?.saveActiveBookingId?.(entryId);
                renderConfirmedBookings();
                window.dispatchEvent(new CustomEvent('yanqi:confirmed-bookings-updated'));
            }
            return;
        }

        const detailField = event.target.closest('.confirmed-booking-detail[data-planner-field-target]');
        if (detailField) {
            event.preventDefault();
            window.YanqiTripPlannerActions?.focusBookingField?.(
                detailField.dataset.bookingEntryId,
                detailField.dataset.plannerFieldTarget
            );
            return;
        }

        const detailLink = event.target.closest('.confirmed-booking-link[data-detail-href]');
        if (detailLink) {
            event.preventDefault();
            navigateWithDepth(detailLink.dataset.detailHref);
            return;
        }

        const removeButton = event.target.closest('.confirmed-booking-remove[data-booking-entry-id]');
        if (!removeButton) {
            return;
        }

        event.preventDefault();
        const store = getTripStore();
        if (!store) {
            return;
        }

        const removedEntryId = String(removeButton.dataset.bookingEntryId || '').trim();
        const activeBookingId = store.getActiveBookingId?.() || '';
        store.removeConfirmedBooking(removedEntryId);
        const nextBookings = sortConfirmedBookings(store.getConfirmedBookings ? store.getConfirmedBookings() : []);
        if (!nextBookings.length) {
            store.clearActiveBookingId?.();
        } else if (removedEntryId && removedEntryId === activeBookingId) {
            const fallbackBooking = getMostRecentlyUpdatedConfirmedBooking(nextBookings);
            if (fallbackBooking?.entryId) {
                store.saveActiveBookingId?.(fallbackBooking.entryId);
            }
        }

        renderConfirmedBookings();
        window.dispatchEvent(new CustomEvent('yanqi:confirmed-bookings-updated'));
    });
}

// 行程页初始化入口：统一启动导航、摘要卡、已收进行程、准备系统和头像返回逻辑。
/**
 * document DOMContentLoaded 回调 - 初始化行程页的主交互模块。
 * @returns {void} - 无返回值，直接启动页面逻辑
 */
document.addEventListener('DOMContentLoaded', () => {
    setupTripScrollLinks();
    new TripSeaGuide();
    setupPlannerSummary();
    setupConfirmedBookingsStage();
    new PrepSystem();
    setupTripReveal();

    if (!document.body.dataset.scrollMood) {
        document.body.dataset.scrollMood = 'midwater';
    }

    window.YanqiAvatarReturn?.bind({
        targetUrl: 'index.html'
    });
});


