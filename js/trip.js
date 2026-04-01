/* ============================================
   Trip Page Logic - trip.js
   ============================================
   ?????
   1. ?? Planner Desk??????????????????????????????
   2. ????????????????????????????????
   3. ???????? -> Planner Desk -> ????? -> ???? -> DOMContentLoaded ?????????
*/

// 准备系统配置：集中定义三张准备卡片的标题、摘要和模板映射。
const PREP_CONTENT = Object.freeze({
    gear: {
        kicker: 'Equipment & Rhythm',
        title: '\u88c5\u5907\u4e0e\u8282\u594f',
        summary: '\u628a\u4e0b\u4e00\u6b21\u4e0b\u6f5c\uff0c\u5b89\u9759\u5730\u6392\u8fdb\u65e5\u7a0b\u3002\u9762\u955c\u3001\u811a\u8e7c\u3001\u7535\u8111\u8868\u4e0e\u9632\u5bd2\u8863\u53ef\u4ee5\u81ea\u5e26\uff0c\u4e5f\u53ef\u4ee5\u63d0\u524d\u4ea4\u7531\u884c\u7a0b\u9875\u7edf\u4e00\u5907\u6ce8\u3002',
        templateId: 'prep-template-gear'
    },
    certification: {
        kicker: 'Certification Path',
        title: '\u8bc1\u4e66\u4e0e\u7b49\u7ea7',
        summary: '\u786e\u8ba4 OW / AOW \u7b49\u7ea7\u3001\u8fd1 12 \u4e2a\u6708\u6f5c\u6c34\u8bb0\u5f55\uff0c\u4ee5\u53ca\u662f\u5426\u9700\u8981\u8fdb\u9636\u8bfe\u7a0b\u8854\u63a5\u3002',
        templateId: 'prep-template-certification'
    },
    weather: {
        kicker: 'Weather Window',
        title: '\u5929\u6c14\u4e0e\u7a97\u53e3',
        summary: '\u628a\u51fa\u53d1\u65e5\u671f\u653e\u8fdb\u6700\u9002\u5408\u7684\u5b63\u8282\u533a\u95f4\u91cc\uff0c\u8ba9\u80fd\u89c1\u5ea6\u3001\u6d0b\u6d41\u4e0e\u5149\u7ebf\u90fd\u66f4\u7a33\u5b9a\u3002',
        templateId: 'prep-template-weather'
    }
});

const HOME_SCROLL_STORAGE_KEY = 'YANQI_HOME_SCROLL_TARGET';
const HOME_ENTRY_DEPTH_STORAGE_KEY = 'YANQI_HOME_ENTRY_DEPTH';

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

// 页面内滚动工具：负责行程页导航与按钮在不同 section 之间做平滑移动。
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

    if (window.OceanScroll && typeof window.OceanScroll.toSelector === 'function') {
        window.OceanScroll.toSelector(targetSelector, {
            offset,
            duration: duration || 1580
        });
        return;
    }

    window.scrollTo(0, Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset));
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
    if (!button) {
        return;
    }

    window.addEventListener('scroll', () => {
        button.classList.toggle('visible', window.pageYOffset > 300);
    });

    button.addEventListener('click', () => {
        if (window.OceanScroll && typeof window.OceanScroll.animateTo === 'function') {
            window.OceanScroll.animateTo(0, { duration: 1760 });
            return;
        }

        window.scrollTo(0, 0);
    });
}

// Planner Desk 主控逻辑：
// 这个函数同时负责：
// 1. 管理海域 / 日期 / 人数三个字段的当前值
// 2. 控制三个浮层的打开、关闭和定位
// 3. 把字段结果实时回写到左侧摘要卡
// 4. 在桌面端与移动端之间维持一致的交互逻辑
/**
 * setupPlannerSummary() - 监听 Planner Desk 输入并实时更新摘要卡片
 * @returns {void} - 无返回值，直接绑定表单输入事件
 */
function setupPlannerSummary() {
    const store = getTripStore();
    const spotInput = document.getElementById('plannerSpot');
    const dateInput = document.getElementById('plannerDate');
    const peopleInput = document.getElementById('plannerPeople');

    const summarySpot = document.getElementById('plannerSummarySpot');
    const summaryDate = document.getElementById('plannerSummaryDate');
    const summaryPeople = document.getElementById('plannerSummaryPeople');
    const summarySpotMeta = document.getElementById('plannerSummarySpotMeta');
    const summaryDateMeta = document.getElementById('plannerSummaryDateMeta');
    const summaryPeopleMeta = document.getElementById('plannerSummaryPeopleMeta');
    const summarySpotState = document.getElementById('plannerSummarySpotState');
    const summaryDateState = document.getElementById('plannerSummaryDateState');
    const summaryPeopleState = document.getElementById('plannerSummaryPeopleState');

    const spotField = document.querySelector('[data-planner-field="spot"]');
    const dateField = document.querySelector('[data-planner-field="date"]');
    const peopleField = document.querySelector('[data-planner-field="people"]');

    const spotTrigger = document.getElementById('plannerSpotTrigger');
    const dateTrigger = document.getElementById('plannerDateTrigger');
    const peopleTrigger = document.getElementById('plannerPeopleTrigger');
    const submitButton = document.querySelector('#plannerDeskControl .planner-submit-btn');

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

    if (
        !spotInput ||
        !dateInput ||
        !peopleInput ||
        !summarySpot ||
        !summaryDate ||
        !summaryPeople ||
        !summarySpotMeta ||
        !summaryDateMeta ||
        !summaryPeopleMeta ||
        !summarySpotState ||
        !summaryDateState ||
        !summaryPeopleState ||
        !spotField ||
        !dateField ||
        !peopleField ||
        !spotTrigger ||
        !dateTrigger ||
        !peopleTrigger ||
        !submitButton ||
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

    const COPY = {
        spot: {
            emptyLabel: '海域尚未落定',
            emptyHint: '等一片愿意下去的蓝慢慢浮现'
        },
        date: {
            emptyLabel: '仍在等一段合适的潮汐',
            emptyHint: '让天气、光线与节奏更从容一些',
            filledHint: '这一段潮汐，适合慢慢出发'
        },
        people: {
            emptyLabel: '同行尚未写进这次下潜',
            emptyHint: '也可以先一个人安静决定这片海'
        }
    };

    /**
     * readPlannerOptionData(option) - 把海域选项按钮整理成可复用的数据对象
     * @param {HTMLElement} option - 原始选项按钮
     * @returns {{value: string, label: string, note: string, description: string}} - 归一化后的选项数据
     */
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
            valueNode: summarySpot,
            metaNode: summarySpotMeta,
            stateNode: summarySpotState,
            emptyValue: '海域尚未落定',
            emptyMeta: '这段行程会从哪片蓝开始，还在慢慢浮现。',
            emptyState: '未落定',
            filledState: '已收进',
            filledMeta: '这一片海已经进入行程底稿，接下来只等节奏慢慢靠拢。'
        },
        date: {
            valueNode: summaryDate,
            metaNode: summaryDateMeta,
            stateNode: summaryDateState,
            emptyValue: '仍在等一段合适的潮汐',
            emptyMeta: '让天气、光线和身体状态先对上节奏。',
            emptyState: '待确认',
            filledState: '已择日',
            filledMeta: '这段潮汐窗口已经收住，旅程的呼吸感也会更清楚。'
        },
        people: {
            valueNode: summaryPeople,
            metaNode: summaryPeopleMeta,
            stateNode: summaryPeopleState,
            emptyValue: '同行尚未写进这次下潜',
            emptyMeta: '一起下去的人，会决定这趟海的速度与停驻方式。',
            emptyState: '未写入',
            filledState: '已同行',
            filledMeta: '同行节奏已经落位，这趟海会有更清晰的陪伴感。'
        }
    };

    let activePanelKey = null;
    let panelPositionFrame = 0;
    let calendarViewDate = null;

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
        const bookings = store && typeof store.getConfirmedBookings === 'function'
            ? store.getConfirmedBookings()
            : [];

        if (!Array.isArray(bookings) || bookings.length === 0) {
            return {
                mode: 'base',
                options: initialSpotOptionsData.slice()
            };
        }

        const seen = new Set();
        const bookedSpotOptions = [];

        bookings.forEach((booking) => {
            const spotKey = String(booking.spotKey || '').trim();
            if (!spotKey || seen.has(spotKey)) {
                return;
            }

            seen.add(spotKey);
            bookedSpotOptions.push({
                value: spotKey,
                label: String(booking.spotName || '未命名海域').trim(),
                note: String(
                    booking.spotTagline
                    || '这片海已经收进行程，接下来可以继续整理这次下潜的节奏。'
                ).trim(),
                description: String(
                    booking.spotTagline
                    || '这片海已经收进行程，接下来可以继续整理这次下潜的节奏。'
                ).trim()
            });
        });

        if (bookedSpotOptions.length === 0) {
            return {
                mode: 'base',
                options: initialSpotOptionsData.slice()
            };
        }

        if (bookedSpotOptions.length === 1) {
            return {
                mode: 'locked-single',
                options: bookedSpotOptions
            };
        }

        return {
            mode: 'booked-only',
            options: [emptySpotOptionData, ...bookedSpotOptions]
        };
    }

    /**
     * createSpotOptionMarkup(optionData, isSelected) - 生成单个海域选项按钮的 HTML
     * @param {{value: string, label: string, note: string, description: string}} optionData - 选项数据
     * @param {boolean} isSelected - 当前是否为选中项
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
     * @param {string} selectedValue - 当前应被选中的值
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
     * syncSpotOptionsFromBookings(draft, isInitial) - 按已确认套餐收缩海域选项，并同步当前字段值
     * @param {Object|null} draft - 本地保存的 Planner 草稿
     * @param {boolean} isInitial - 是否为页面初始化阶段
     * @returns {void} - 无返回值，直接更新海域字段状态
     */
    function syncSpotOptionsFromBookings(draft, isInitial) {
        const currentValue = String(spotInput.value || '').trim();
        const { mode, options } = getConfirmedSpotOptions();
        const availableValues = new Set(options.map((option) => option.value));
        let nextValue = '';

        if (mode === 'locked-single') {
            nextValue = options[0]?.value || '';
        } else if (mode === 'booked-only') {
            nextValue = isInitial
                ? ''
                : (availableValues.has(currentValue) ? currentValue : '');
        } else {
            const draftValue = String(draft?.spotValue || '').trim();
            nextValue = availableValues.has(draftValue)
                ? draftValue
                : (availableValues.has(currentValue) ? currentValue : '');
        }

        renderSpotOptions(options, nextValue);

        const selectedOption = getSpotOptions().find((option) => option.dataset.value === nextValue)
            || getSpotOptions()[0];

        if (selectedOption) {
            setOptionState('spot', selectedOption);
        }
    }

    /**
     * formatPlannerDate(value) - 把原生日期值格式化成 Planner Desk 的展示文案
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
     * formatCalendarMonthLabel(date) - 生成日历面板顶部的月份标题
     * @param {Date} date - 当前日历视图所在月份
     * @returns {string} - 年月标题文本
     */
    function formatCalendarMonthLabel(date) {
        return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月`;
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
        dateValue.textContent = hasValue
            ? formatPlannerDate(dateInput.value)
            : COPY.date.emptyLabel;
        dateHint.textContent = hasValue
            ? COPY.date.filledHint
            : COPY.date.emptyHint;
        dateField.classList.toggle('is-active', hasValue);
    }

    /**
     * isRecommendedPlannerDate(date) - 判断某一天是否属于推荐出发窗口
     * @param {Date} date - 待判断的日期对象
     * @returns {boolean} - 是否属于推荐窗口
     */
    function isRecommendedPlannerDate(date) {
        const day = date.getDate();
        return (day >= 8 && day <= 12) || (day >= 18 && day <= 22);
    }

    /**
     * getPanelWidth(fieldKey) - 按字段类型计算浮层面板宽度
     * @param {string} fieldKey - 字段键名
     * @returns {number} - 面板宽度
     */
    function getPanelWidth(fieldKey) {
        const config = fieldMap[fieldKey];
        if (!config) {
            return 360;
        }

        const triggerRect = config.trigger.getBoundingClientRect();
        const maxWidth = window.innerWidth - PANEL_MARGIN * 2;
        // 先从触发按钮自身宽度推导“理想面板宽度”，
        // 再用视口宽度减安全边距兜底，避免在窄屏上横向溢出。

        if (fieldKey === 'spot') {
            return Math.min(Math.max(triggerRect.width + 48, 480), 620, maxWidth);
        }

        if (fieldKey === 'date') {
            return Math.min(Math.max(triggerRect.width + 32, 360), 392, maxWidth);
        }

        return Math.min(Math.max(triggerRect.width + 12, 360), 420, maxWidth);
    }

    /**
     * positionPanel(fieldKey) - 根据字段位置将浮层稳定定位到视口内
     * @param {string} fieldKey - 字段键名
     * @returns {void} - 无返回值，直接写入面板位置
     */
    function positionPanel(fieldKey) {
        const config = fieldMap[fieldKey];
        if (!config || config.panel.hidden) {
            return;
        }

        const triggerRect = config.trigger.getBoundingClientRect();
        const panelWidth = getPanelWidth(fieldKey);

        config.panel.style.width = `${panelWidth}px`;
        config.panel.style.maxWidth = `${window.innerWidth - PANEL_MARGIN * 2}px`;

        const measuredHeight = config.panel.offsetHeight || config.panel.scrollHeight || 320;
        // 先测一次真实高度，再决定是向下展开还是向上展开，
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
        let left = fieldKey === 'people'
            ? triggerRect.right - panelWidth
            : triggerRect.left;
        left = Math.max(PANEL_MARGIN, Math.min(left, window.innerWidth - panelWidth - PANEL_MARGIN));

        let top = shouldOpenUpward
            ? triggerRect.top - finalHeight - PANEL_GAP
            : triggerRect.bottom + PANEL_GAP;
        top = Math.max(PANEL_MARGIN, Math.min(top, window.innerHeight - finalHeight - PANEL_MARGIN));

        config.panel.style.left = `${left}px`;
        config.panel.style.top = `${top}px`;
    }

    /**
     * schedulePanelPosition() - 在下一帧重新计算当前打开浮层的位置
     * @returns {void} - 无返回值，直接安排定位刷新
     */
    function schedulePanelPosition() {
        if (!activePanelKey) {
            return;
        }

        if (panelPositionFrame) {
            window.cancelAnimationFrame(panelPositionFrame);
        }

        panelPositionFrame = window.requestAnimationFrame(() => {
            panelPositionFrame = 0;
            positionPanel(activePanelKey);
        });
        // 定位放到下一帧做，是为了等浏览器先把本轮 class、尺寸和布局变化算完，
        // 避免读取到旧尺寸，导致浮层“先跳一下再归位”。
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
            // JS 的 getDay() 以周日为 0，这里转成“周一开头”的日历逻辑。
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

                if (!isOutside && isRecommendedPlannerDate(cellDate)) {
                    button.classList.add('is-recommended');
                }

                calendarGrid.appendChild(button);
            }

            calendarGrid.classList.remove('is-transitioning');
            schedulePanelPosition();
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
        config.field.classList.toggle('is-active', fieldKey === 'date'
            ? Boolean(dateInput.value)
            : Boolean(config.input.value));
        config.trigger.setAttribute('aria-expanded', 'false');
        config.panel.classList.remove('is-open');
        config.panel.classList.remove('opens-upward');
        if (fieldKey === 'people') {
            hideCustomPeopleEditor();
        }

        if (activePanelKey === fieldKey) {
            activePanelKey = null;
        }

        config.panel._closeTimer = window.setTimeout(() => {
            config.panel.hidden = true;
            config.panel.style.top = '';
            config.panel.style.left = '';
            config.panel.style.width = '';
            config.panel.style.maxWidth = '';
            config.panel.style.maxHeight = '';
            config.panel._closeTimer = 0;

            if (!activePanelKey) {
                floatingLayer.hidden = true;
                floatingLayer.setAttribute('aria-hidden', 'true');
            }
        }, 220);
        // 这里不立刻 hidden，而是等退场动画播完再藏。
        // 否则视觉上会像瞬间消失，失去“浮层收回海里”的过渡感。
    }

    /**
     * closeActivePanel() - 关闭当前处于打开状态的浮层面板
     * @returns {void} - 无返回值，直接关闭当前浮层
     */
    function closeActivePanel() {
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
        Object.keys(fieldMap).forEach((key) => {
            if (key !== fieldKey && !fieldMap[key].panel.hidden) {
                closePanel(key);
            }
        });

        const config = fieldMap[fieldKey];
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
        // 这样即使字段父层有 transform / overflow，也不会把浮层截断。

        floatingLayer.hidden = false;
        floatingLayer.setAttribute('aria-hidden', 'false');
        config.field.classList.add('is-open', 'is-active');
        config.trigger.setAttribute('aria-expanded', 'true');
        config.panel.hidden = false;
        activePanelKey = fieldKey;
        if (fieldKey === 'people') {
            const existingCustomCount = getCustomPeopleCount();
            if (existingCustomCount) {
                showCustomPeopleEditor(existingCustomCount);
            } else {
                hideCustomPeopleEditor();
            }
        }

        window.requestAnimationFrame(() => {
            positionPanel(fieldKey);
            config.panel.classList.add('is-open');
            schedulePanelPosition();
        });
        // 先让浏览器知道“它已经显示了”，下一帧再计算位置和加打开态，
        // 才能拿到真实尺寸并让透明度/位移动画顺畅发生。
    }

    /**
     * jumpToPlannerField(fieldKey) - 从“已收进行程”的信息块直接带用户跳到对应 Planner 字段
     * @param {'date'|'people'|'spot'} fieldKey - 需要展开的字段键名
     * @returns {void} - 无返回值，直接滚动并展开对应浮层
     */
    function jumpToPlannerField(fieldKey) {
        const config = fieldMap[fieldKey];
        if (!config) {
            return;
        }

        closeActivePanel();
        scrollToSection('#plannerDeskControl', 1320);

        window.setTimeout(() => {
            openPanel(fieldKey);
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
     * @returns {string} - 当前自定义人数，没有则返回空字符串
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
     * @returns {void} - 无返回值，直接更新浮层内部状态
     */
    function hideCustomPeopleEditor() {
        customPeopleBox.hidden = true;
        customPeopleInput.value = '';
    }

    /**
     * showCustomPeopleEditor(prefillValue) - 展开自定义人数输入区，并用已有人数预填
     * @param {string} prefillValue - 预填的人数值
     * @returns {void} - 无返回值，直接展开编辑区
     */
    function showCustomPeopleEditor(prefillValue) {
        customPeopleBox.hidden = false;
        customPeopleInput.value = prefillValue || '';
        window.requestAnimationFrame(() => {
            schedulePanelPosition();
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

        updatePlannerSummary();
        commitPlannerDeskSelection();
        hideCustomPeopleEditor();
        closePanel('people');
    }

    /**
     * selectCalendarDate(value) - 选中某一天并同步回写到字段与摘要
     * @param {string} value - 选中的日期值
     * @returns {void} - 无返回值，直接更新日期状态
     */
    function selectCalendarDate(value) {
        dateInput.value = value;

        const selectedDate = new Date(`${value}T00:00:00`);
        calendarViewDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

        syncDateFieldDisplay();
        updatePlannerSummary();
        commitPlannerDeskSelection();
        renderPlannerCalendar();
        closePanel('date');
    }

    /**
     * updatePlannerSummary() - 根据当前字段值刷新左侧摘要区
     * @returns {void} - 无返回值，直接更新摘要文案
     */
    function updatePlannerSummary() {
        const spotLabel = spotInput.dataset.label || summaryMetaMap.spot.emptyValue;
        const peopleLabel = peopleInput.dataset.label || summaryMetaMap.people.emptyValue;
        const dateLabel = formatPlannerDate(dateInput.value);

        summaryMetaMap.spot.valueNode.textContent = spotLabel;
        summaryMetaMap.spot.metaNode.textContent = spotInput.value
            ? summaryMetaMap.spot.filledMeta
            : summaryMetaMap.spot.emptyMeta;
        summaryMetaMap.spot.stateNode.textContent = spotInput.value
            ? summaryMetaMap.spot.filledState
            : summaryMetaMap.spot.emptyState;

        summaryMetaMap.date.valueNode.textContent = dateLabel;
        summaryMetaMap.date.metaNode.textContent = dateInput.value
            ? summaryMetaMap.date.filledMeta
            : summaryMetaMap.date.emptyMeta;
        summaryMetaMap.date.stateNode.textContent = dateInput.value
            ? summaryMetaMap.date.filledState
            : summaryMetaMap.date.emptyState;

        summaryMetaMap.people.valueNode.textContent = peopleLabel;
        summaryMetaMap.people.metaNode.textContent = peopleInput.value
            ? summaryMetaMap.people.filledMeta
            : summaryMetaMap.people.emptyMeta;
        summaryMetaMap.people.stateNode.textContent = peopleInput.value
            ? summaryMetaMap.people.filledState
            : summaryMetaMap.people.emptyState;

        if (store && typeof store.savePlannerDraft === 'function') {
            store.savePlannerDraft({
                spotValue: spotInput.value,
                spotLabel: spotInput.dataset.label || COPY.spot.emptyLabel,
                spotNote: spotInput.dataset.note || COPY.spot.emptyHint,
                dateValue: dateInput.value,
                dateLabel: dateInput.value ? dateLabel : '',
                dateNote: dateInput.value ? COPY.date.filledHint : COPY.date.emptyHint,
                peopleValue: peopleInput.value,
                peopleLabel: peopleInput.dataset.label || COPY.people.emptyLabel,
                peopleNote: peopleInput.dataset.note || COPY.people.emptyHint
            });
        }
    }

    /**
     * commitPlannerDeskSelection() - 把当前 Planner Desk 的最新选择立即同步到已收进行程
     * @returns {void} - 无返回值，直接更新共享存储并刷新列表
     */
    function commitPlannerDeskSelection() {
        syncPlannerSelectionToConfirmedBookings({
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
     * restorePlannerDraft() - 从共享存储中回填 Planner Desk 之前保存的草稿
     * @returns {void} - 无返回值，直接同步字段当前状态
     */
    function restorePlannerDraft() {
        if (!store || typeof store.getPlannerDraft !== 'function') {
            syncSpotOptionsFromBookings(null, true);
            return;
        }

        const draft = store.getPlannerDraft();
        if (!draft || typeof draft !== 'object') {
            syncSpotOptionsFromBookings(null, true);
            return;
        }
        const storedPeople = peopleOptions.find((option) => option.dataset.value === draft.peopleValue)
            || (draft.peopleValue
                ? peoplePanel.querySelector('.planner-option[data-option-group="people"][data-value="custom"]')
                : null)
            || peopleOptions.find((option) => option.dataset.value === '')
            || peopleOptions[0];

        syncSpotOptionsFromBookings(draft, true);

        if (storedPeople && storedPeople.dataset.value === 'custom' && draft.peopleValue) {
            peopleInput.value = String(draft.peopleValue).trim();
            peopleInput.dataset.label = draft.peopleLabel || `${draft.peopleValue} 人同行`;
            peopleInput.dataset.note = draft.peopleNote || `这次下潜按 ${draft.peopleValue} 人的同行节奏安排。`;
            peopleValue.textContent = peopleInput.dataset.label;
            peopleHint.textContent = peopleInput.dataset.note;
            peopleField.classList.add('is-active');
            peoplePanel.querySelectorAll('.planner-option[data-option-group="people"]').forEach((item) => {
                item.classList.toggle('is-selected', item === storedPeople);
            });
        } else if (storedPeople) {
            setOptionState('people', storedPeople);
        }

        if (draft.dateValue) {
            dateInput.value = draft.dateValue;
        }

        calendarViewDate = new Date(getCalendarDisplayDate().getFullYear(), getCalendarDisplayDate().getMonth(), 1);
        syncDateFieldDisplay();
    }

    const peopleOptions = Array.from(peoplePanel.querySelectorAll('.planner-option[data-option-group="people"]'));

    // 三个字段都采用“再点一次自己就收起”的切换规则，减少手机端多余操作。
    spotTrigger.addEventListener('click', () => {
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

        const activeDate = getCalendarDisplayDate();
        calendarViewDate = new Date(activeDate.getFullYear(), activeDate.getMonth(), 1);
        renderPlannerCalendar();
        openPanel('date');
    });

    dateInput.addEventListener('change', () => {
        calendarViewDate = new Date(getCalendarDisplayDate().getFullYear(), getCalendarDisplayDate().getMonth(), 1);
        syncDateFieldDisplay();
        updatePlannerSummary();
        commitPlannerDeskSelection();
        renderPlannerCalendar();
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
        updatePlannerSummary();
        commitPlannerDeskSelection();
        closePanel('spot');
    });

    peopleOptions.forEach((option) => {
        option.addEventListener('click', () => {
            if (option.dataset.value === 'custom') {
                showCustomPeopleEditor(getCustomPeopleCount());
                return;
            }

            setOptionState('people', option);
            updatePlannerSummary();
            commitPlannerDeskSelection();
            hideCustomPeopleEditor();
            closePanel('people');
        });
    });

    customPeopleApply.addEventListener('click', () => {
        applyCustomPeopleValue();
    });

    customPeopleInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            applyCustomPeopleValue();
        }
    });

    submitButton.addEventListener('click', (event) => {
        event.preventDefault();
        closeActivePanel();
        scrollToSection(submitButton.dataset.scrollTarget || '#trip-layer', 1640);
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

    window.addEventListener('resize', schedulePanelPosition);
    window.addEventListener('scroll', schedulePanelPosition, { passive: true });
    // 视口变化或页面滚动后，字段按钮的位置会变，所以要重新定位浮层。
    // 这里不直接关闭，而是尽量让浮层继续跟着目标字段。

    const defaultPeopleOption = peoplePanel.querySelector('.planner-option.is-selected') || peopleOptions[0];

    floatingLayer.appendChild(spotPanel);
    floatingLayer.appendChild(datePanel);
    floatingLayer.appendChild(peoplePanel);
    floatingLayer.hidden = true;
    floatingLayer.setAttribute('aria-hidden', 'true');
    // 初始化时就先把三个面板搬进统一浮层容器，后面打开时只需要改状态，不再反复找位置。

    calendarViewDate = new Date(getCalendarDisplayDate().getFullYear(), getCalendarDisplayDate().getMonth(), 1);

    setOptionState('people', defaultPeopleOption);
    restorePlannerDraft();
    renderPlannerCalendar();
    updatePlannerSummary();

    window.addEventListener('yanqi:confirmed-bookings-updated', () => {
        syncSpotOptionsFromBookings(null, false);
        updatePlannerSummary();
    });

    window.YanqiTripPlannerActions = {
        jumpToField: jumpToPlannerField
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
     * open(key) - 打开指定准备主题并刷新右侧详情面板
     * @param {string} key - 需要打开的准备主题键名
     * @returns {void} - 无返回值，直接更新卡片和面板状态
     */
    open(key) {
        if (!key || !PREP_CONTENT[key]) {
            return;
        }

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

        this.panel.classList.remove('is-visible');
        this.content.innerHTML = '';

        if (template) {
            this.content.appendChild(template.content.cloneNode(true));
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.panel.classList.add('is-visible');
            });
        });
        // 连续两帧 requestAnimationFrame 是为了确保：
        // 1. 新内容先插入 DOM
        // 2. 浏览器先完成一次布局
        // 3. 再触发可见状态，让入场动画稳定生效
    }
}

// 已收进行程区域配置：统一控制空状态文案与缺省字段的盐憩语气。
const CONFIRMED_BOOKING_COPY = Object.freeze({
    emptyDate: '仍在等一段合适的潮汐',
    emptyPeople: '同行节奏还没写进这一潜',
    emptyTagline: '这片海已经被收下，接下来只等节奏慢慢靠拢。',
    emptyNote: '这次下潜已经停进行程里，接下来可以继续整理日期、同行与海况窗口。'
});

const CONFIRMED_BOOKINGS_PAGE_SIZE = 4;
let confirmedBookingsPageIndex = 0;

/**
 * escapeHtml(value) - 转义动态文本，避免行程卡片渲染时插入不安全内容
 * @param {*} value - 原始文本值
 * @returns {string} - 转义后的安全字符串
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

/**
 * getConfirmedBookingSortValue(booking) - 计算已收进行程卡片的排序值，优先让更早的日期先出现
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
 * sortConfirmedBookings(bookings) - 对已收进行程列表做稳定排序，优先展示日期更早的安排
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

/**
 * getPeopleCountFromSelectionValue(value) - 从同行人数字段中提取可用于价格换算的人数
 * @param {string} value - 原始同行人数值，例如 "2"、"3-5"、"6+"
 * @returns {number} - 可用于估算总价的人数，无法识别时回退为 1
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

    const rangeMatch = safeValue.match(/^(\d+)\s*[-–]\s*(\d+)$/);
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
 * parseConfirmedBookingPrice(priceText) - 从展示价格中拆出货币符号与数值部分
 * @param {string} priceText - 价格文本，例如 "$2,563"
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
 * formatConfirmedBookingAmount(amount, fractionDigits) - 把计算后的价格格式化回展示文本
 * @param {number} amount - 计算后的价格数值
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
 * formatConfirmedBookingCny(amount, fractionDigits) - 把换算后的人民币价格格式化成更适合阅读的文本
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
 * @returns {{primary: string, secondary: string, cny: string}} - 主价格、人民币参考价与辅助说明
 */
function getConfirmedBookingPriceView(booking) {
    const USD_TO_CNY_RATE = 10000 / 1451; // 与详情页保持同一套汇率：10000 人民币 ≈ 1451 美元
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
    const showCny = parsedPrice.currency.includes('$') || /USD/i.test(parsedPrice.currency);
    const cnyText = showCny
        ? `约 ¥${formatConfirmedBookingCny(baseAmount * USD_TO_CNY_RATE, parsedPrice.fractionDigits)}`
        : '';

    if (peopleCount <= 1) {
        return {
            primary: rawPrice,
            secondary: '',
            cny: cnyText
        };
    }

    const pricePrefix = parsedPrice.currency ? `${parsedPrice.currency}` : '';
    const selectionLabel = String(booking?.selectedPeopleLabel || '').trim();
    const secondary = /^\d+$/.test(String(booking?.selectedPeople || '').trim())
        ? `${peopleCount} 人合计`
        : `${selectionLabel || `${peopleCount} 人同行`}按 ${peopleCount} 人起算`;

    return {
        primary: `${pricePrefix}${formatConfirmedBookingAmount(baseAmount, parsedPrice.fractionDigits)}`,
        secondary,
        cny: cnyText
    };
}

/**
 * syncPlannerSelectionToConfirmedBookings(selection) - 把当前 Planner Desk 的日期与同行写回已收进行程
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

    const targetSpot = String(selection?.spotValue || '').trim();
    const nextDateValue = String(selection?.dateValue || '').trim();
    const nextDateLabel = String(selection?.dateLabel || '').trim();
    const nextPeopleValue = String(selection?.peopleValue || '').trim();
    const nextPeopleLabel = String(selection?.peopleLabel || '').trim();
    const now = new Date().toISOString();

    const nextBookings = currentBookings.map((booking) => {
        const bookingSpotKey = String(booking?.spotKey || '').trim();
        const shouldSync = targetSpot ? bookingSpotKey === targetSpot : true;
        if (!shouldSync) {
            return booking;
        }

        return {
            ...booking,
            selectedDate: nextDateValue,
            selectedDateLabel: nextDateValue ? nextDateLabel : '',
            selectedPeople: nextPeopleValue,
            selectedPeopleLabel: nextPeopleValue ? nextPeopleLabel : '',
            updatedAt: now
        };
    });

    store.saveConfirmedBookings(nextBookings);
    return nextBookings;
}

/**
 * buildConfirmedBookingCardMarkup(booking) - 生成单张已收进行程卡片的 HTML
 * @param {Object} booking - 已确认套餐对象
 * @returns {string} - 已收进行程卡片 HTML
 */
function buildConfirmedBookingCardMarkup(booking) {
    const safeTagline = booking.spotTagline || CONFIRMED_BOOKING_COPY.emptyTagline;
    const safeDate = booking.selectedDateLabel || CONFIRMED_BOOKING_COPY.emptyDate;
    const safePeople = booking.selectedPeopleLabel || CONFIRMED_BOOKING_COPY.emptyPeople;
    const packageTags = Array.isArray(booking.packageTags) ? booking.packageTags.filter(Boolean).slice(0, 3) : [];
    const priceView = getConfirmedBookingPriceView(booking);

    return `
        <article class="confirmed-booking-card" data-booking-id="${escapeHtml(booking.bookingId)}">
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
                ${packageTags.length ? `
                    <div class="confirmed-booking-tags">
                        ${packageTags.map((tag) => `<span class="confirmed-booking-tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
            </div>

            <div class="confirmed-booking-details">
                <button
                    type="button"
                    class="confirmed-booking-detail"
                    data-planner-field-target="date"
                    aria-label="调整这次下潜的日期"
                >
                    <span class="confirmed-booking-detail-label">日期</span>
                    <strong>${escapeHtml(safeDate)}</strong>
                </button>
                <button
                    type="button"
                    class="confirmed-booking-detail"
                    data-planner-field-target="people"
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
                <button type="button" class="confirmed-booking-remove" data-booking-id="${escapeHtml(booking.bookingId)}">
                    从行程里移开
                </button>
            </div>
        </article>
    `;
}

/**
 * renderConfirmedBookings() - 读取共享存储并刷新 trip 页“已收进行程”区域
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
    list.innerHTML = visibleBookings.map((booking) => buildConfirmedBookingCardMarkup(booking)).join('');

    if (switchButton) {
        switchButton.hidden = bookings.length <= CONFIRMED_BOOKINGS_PAGE_SIZE;
    }
}

/**
 * setupConfirmedBookingsStage() - 绑定已收进行程区域的跳转与移除行为
 * @returns {void} - 无返回值，直接注册事件并完成初次渲染
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
        const detailField = event.target.closest('.confirmed-booking-detail[data-planner-field-target]');
        if (detailField) {
            event.preventDefault();
            window.YanqiTripPlannerActions?.jumpToField?.(detailField.dataset.plannerFieldTarget);
            return;
        }

        const detailLink = event.target.closest('.confirmed-booking-link[data-detail-href]');
        if (detailLink) {
            event.preventDefault();
            navigateWithDepth(detailLink.dataset.detailHref);
            return;
        }

        const removeButton = event.target.closest('.confirmed-booking-remove[data-booking-id]');
        if (!removeButton) {
            return;
        }

        event.preventDefault();
        const store = getTripStore();
        if (!store) {
            return;
        }

        store.removeConfirmedBooking(removeButton.dataset.bookingId);
        renderConfirmedBookings();
        window.dispatchEvent(new CustomEvent('yanqi:confirmed-bookings-updated'));
    });
}

// 行程页初始化入口：统一启动导航、摘要卡、准备系统和头像返回逻辑。
/**
 * document DOMContentLoaded 回调 - 初始化行程页的导航、摘要卡和准备系统
 * @returns {void} - 无返回值，直接启动页面逻辑
 */
document.addEventListener('DOMContentLoaded', () => {
    setupTripScrollLinks();
    setupBackToTop();
    setupPlannerSummary();
    setupConfirmedBookingsStage();
    if (window.YanqiTripStore) {
        console.log('trip confirmed bookings:', window.YanqiTripStore.getConfirmedBookings());
        console.log('trip planner draft:', window.YanqiTripStore.getPlannerDraft());
    }
    new PrepSystem();

    const avatar = document.querySelector('.avatar');
    if (avatar) {
        avatar.addEventListener('click', () => {
            if (confirm('\u786e\u8ba4\u8981\u8fd4\u56de\u767b\u5f55\u9875\u5417\uff1f')) {
                navigateWithDepth('index.html');
            }
        });
    }
});

