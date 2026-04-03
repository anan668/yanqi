/* ============================================
   Trip Page Logic - trip.js
   ============================================
   ?????
   1. ?? Planner Desk??????????????????????????????
   2. ????????????????????????????????
   3. ???????? -> Planner Desk -> ????? -> ???? -> DOMContentLoaded ?????????
*/

// 鍑嗗绯荤粺閰嶇疆锛氶泦涓畾涔変笁寮犲噯澶囧崱鐗囩殑鏍囬銆佹憳瑕佸拰妯℃澘鏄犲皠銆?
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
 * storePendingHomeScrollTarget(targetSelector) - 璁板綍璺ㄩ〉鍥為椤靛悗闇€瑕佽嚜鍔ㄥ榻愮殑 section
 * @param {string} targetSelector - 棣栭〉鍐呴渶瑕佹仮澶嶆粴鍔ㄧ殑鐩爣閫夋嫨鍣?
 * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鍐欏叆 sessionStorage
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
        // 蹇界暐瀛樺偍澶辫触锛岄伩鍏嶅奖鍝嶆甯歌烦椤点€?
    }
}

/**
 * storePendingHomeEntryDepth(targetSelector, depth) - 璁板綍鍥炲埌棣栭〉鏃跺簲鍏堢ǔ瀹氬埌鐨勭洰鏍囨繁搴?
 * @param {string} targetSelector - 棣栭〉鍐呴渶瑕佹仮澶嶇殑鐩爣閫夋嫨鍣?
 * @param {number} depth - 闇€瑕佷紭鍏堣繘鍏ョ殑棣栭〉娣卞害
 * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鍐欏叆 sessionStorage
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
        // 蹇界暐瀛樺偍澶辫触锛岄伩鍏嶅奖鍝嶆甯歌烦椤点€?
    }
}

// 缁熶竴瀵艰埅鍏ュ彛锛氳琛岀▼椤佃烦杞洖棣栭〉鎴栧叾浠栭〉闈㈡椂淇濇寔娣卞害灞傜骇涓€鑷淬€?
/**
 * navigateWithDepth(url) - 甯︽繁搴﹀垏鎹㈡晥鏋滃湴璺宠浆鍒扮洰鏍囬〉闈?
 * @param {string} url - 鐩爣椤甸潰鍦板潃
 * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鎵ц椤甸潰璺宠浆
 */
function navigateWithDepth(url) {
    if (window.DepthManager && typeof window.DepthManager.navigateTo === 'function') {
        window.DepthManager.navigateTo(url);
        return;
    }

    window.location.href = url;
}

// 椤甸潰鍐呮粴鍔ㄥ伐鍏凤細璐熻矗琛岀▼椤靛鑸笌鎸夐挳鍦ㄤ笉鍚?section 涔嬮棿鍋氬钩婊戠Щ鍔ㄣ€?
/**
 * scrollToSection(targetSelector, duration) - 骞虫粦婊氬姩鍒拌绋嬮〉鎸囧畾鍖哄潡
 * @param {string} targetSelector - 鐩爣鍖哄潡閫夋嫨鍣?
 * @param {number} duration - 婊氬姩鍔ㄧ敾鏃堕暱
 * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鎵ц婊氬姩
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

// 缁戝畾琛岀▼椤甸《閮ㄥ鑸拰甯?data-scroll-target 鐨勫唴閮ㄨ烦杞摼鎺ャ€?
/**
 * setupTripScrollLinks() - 缁戝畾琛岀▼椤甸《閮ㄥ鑸拰鍐呴儴婊氬姩閾炬帴
 * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴娉ㄥ唽浜嬩欢鐩戝惉
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

            this.updateRaf = window.requestAnimationFrame(() => {
                this.updateRaf = 0;
                this.updateState();
            });
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
        window.addEventListener('resize', requestStateUpdate);
        window.setTimeout(() => this.updateState(), 80);
    }
}

// Planner Desk 涓绘帶閫昏緫锛?
// 杩欎釜鍑芥暟鍚屾椂璐熻矗锛?
// 1. 绠＄悊娴峰煙 / 鏃ユ湡 / 浜烘暟涓変釜瀛楁鐨勫綋鍓嶅€?
// 2. 鎺у埗涓変釜娴眰鐨勬墦寮€銆佸叧闂拰瀹氫綅
// 3. 鎶婂瓧娈电粨鏋滃疄鏃跺洖鍐欏埌宸︿晶鎽樿鍗?
// 4. 鍦ㄦ闈㈢涓庣Щ鍔ㄧ涔嬮棿缁存寔涓€鑷寸殑浜や簰閫昏緫
/**
 * setupPlannerSummary() - 鐩戝惉 Planner Desk 杈撳叆骞跺疄鏃舵洿鏂版憳瑕佸崱鐗?
 * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴缁戝畾琛ㄥ崟杈撳叆浜嬩欢
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
    const summaryRoot = document.getElementById('plannerSummary');
    const summaryIntro = document.getElementById('plannerSummaryIntro');
    const summaryStatusNote = document.getElementById('plannerSummaryStatusNote');
    const summaryItems = Array.from(document.querySelectorAll('#plannerSummary .planner-item'));

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
        !summaryRoot ||
        !summaryIntro ||
        !summaryStatusNote ||
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

    // 娴眰涓庤鍙ｈ竟缂樸€佸瓧娈典箣闂寸殑瀹夊叏璺濈銆?
    // 杩欎簺鍊间細鍚屾椂褰卞搷鈥滄槸鍚﹀悜涓婂睍寮€鈥濆拰鈥滄渶缁堣兘鐣欏嚭澶氬皯鍛煎惛绌洪棿鈥濄€?
    const PANEL_MARGIN = 16;
    const PANEL_GAP = 14;

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

    /**
     * readPlannerOptionData(option) - 鎶婃捣鍩熼€夐」鎸夐挳鏁寸悊鎴愬彲澶嶇敤鐨勬暟鎹璞?
     * @param {HTMLElement} option - 鍘熷閫夐」鎸夐挳
     * @returns {{value: string, label: string, note: string, description: string}} - 褰掍竴鍖栧悗鐨勯€夐」鏁版嵁
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

        return {
            spot: spotInput.value,
            spotLabel: spotInput.dataset.label || COPY.spot.emptyLabel,
            spotNote: spotInput.dataset.note || COPY.spot.emptyHint,
            date: dateInput.value,
            dateLabel,
            dateNote: hasDate ? COPY.date.filledHint : COPY.date.emptyHint,
            people: peopleInput.value,
            peopleLabel: peopleInput.dataset.label || COPY.people.emptyLabel,
            peopleNote: peopleInput.dataset.note || COPY.people.emptyHint
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

    // fieldMap 鎶婃瘡涓瓧娈电浉鍏崇殑 DOM 鍜岄粯璁ゆ枃妗堟敹鎴愪竴涓〃銆?
    // 鍚庨潰鎵撳紑銆佸叧闂€佸啓鍊笺€佸畾浣嶆椂閮借兘澶嶇敤鍚屼竴濂楅€昏緫锛岄伩鍏嶄笁濂楄繎浼间唬鐮佹暎钀藉悇澶勩€?
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
            emptyValue: '海域尚未确认',
            emptyMeta: '前往哪片海还在整理里，先让这次下潜慢慢收出方向。',
            emptyState: '待确认',
            filledState: '已收住',
            filledMeta: '前往的海域已经落位，这一潜的方向也开始变得清楚。'
        },
        date: {
            valueNode: summaryDate,
            metaNode: summaryDateMeta,
            stateNode: summaryDateState,
            emptyValue: '仍在等一段合适的潮汐',
            emptyMeta: '出发时间还在等一段更合适的潮汐窗口。',
            emptyState: '待确认',
            filledState: '已写入',
            filledMeta: '出发时间已经写进这次下潜，整段安排开始有了节奏。'
        },
        people: {
            valueNode: summaryPeople,
            metaNode: summaryPeopleMeta,
            stateNode: summaryPeopleState,
            emptyValue: '同行尚未确认',
            emptyMeta: '同行人数还没落下，这趟海会怎样发生也还在确认。',
            emptyState: '待确认',
            filledState: '已写入',
            filledMeta: '同行人数已经写进来，这一潜的节奏和陪伴感也更明确了。'
        }
    };

    let activePanelKey = null;
    let panelPositionFrame = 0;
    let calendarViewDate = null;

    /**
     * getSpotOptions() - 鑾峰彇褰撳墠娴峰煙娴眰閲岀殑鍏ㄩ儴閫夐」鎸夐挳
     * @returns {HTMLElement[]} - 褰撳墠娴峰煙閫夐」鎸夐挳鏁扮粍
     */
    function getSpotOptions() {
        return Array.from(spotPanel.querySelectorAll('.planner-option[data-option-group="spot"]'));
    }

    /**
     * getConfirmedSpotOptions() - 鏍规嵁宸叉敹杩涜绋嬬殑濂楅锛岀敓鎴愬綋鍓嶅厑璁搁€夋嫨鐨勬捣鍩熼€夐」
     * @returns {{mode: string, options: Array<Object>}} - 閫夐」妯″紡鍜屽搴旈€夐」鍒楄〃
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
     * createSpotOptionMarkup(optionData, isSelected) - 鐢熸垚鍗曚釜娴峰煙閫夐」鎸夐挳鐨?HTML
     * @param {{value: string, label: string, note: string, description: string}} optionData - 閫夐」鏁版嵁
     * @param {boolean} isSelected - 褰撳墠鏄惁涓洪€変腑椤?
     * @returns {string} - 娴峰煙閫夐」鎸夐挳 HTML
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
     * renderSpotOptions(options, selectedValue) - 閲嶇粯娴峰煙娴眰鐨勫彲閫夐」鍒楄〃
     * @param {Array<Object>} options - 闇€瑕佹覆鏌撶殑閫夐」鏁版嵁
     * @param {string} selectedValue - 褰撳墠搴旇閫変腑鐨勫€?
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鏇存柊娴眰閫夐」
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
     * syncSpotOptionsFromBookings(draft, isInitial) - 鎸夊凡纭濂楅鏀剁缉娴峰煙閫夐」锛屽苟鍚屾褰撳墠瀛楁鍊?
     * @param {Object|null} draft - 鏈湴淇濆瓨鐨?Planner 鑽夌
     * @param {boolean} isInitial - 鏄惁涓洪〉闈㈠垵濮嬪寲闃舵
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鏇存柊娴峰煙瀛楁鐘舵€?
     */
    function syncSpotOptionsFromBookings(draft, isInitial) {
        const currentValue = String(spotInput.value || '').trim();
        const { mode, options } = getConfirmedSpotOptions();
        const availableValues = new Set(options.map((option) => option.value));
        const storedValue = availableValues.has(draftValue) ? draftValue : '';
        const liveValue = availableValues.has(currentValue) ? currentValue : '';
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
     * formatPlannerDate(value) - 鎶婂師鐢熸棩鏈熷€兼牸寮忓寲鎴?Planner Desk 鐨勫睍绀烘枃妗?
     * @param {string} value - 鍘熺敓鏃ユ湡杈撳叆鍊?
     * @returns {string} - 鏍煎紡鍖栧悗鐨勬棩鏈熸枃鏈?
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
     * isValidPlannerDateValue(value) - 鍒ゆ柇鏈湴鎭㈠鍑烘潵鐨勬棩鏈熸槸鍚﹁繕鏄彲鐢ㄧ殑鍘熺敓鏃ユ湡鍊?     * @param {string} value - 寰呮牎楠岀殑鏃ユ湡
     * @returns {boolean} - 鍙湁 YYYY-MM-DD 涓旇兘琚?Date 姝ｅ父璇嗗埆鏃舵墠杩斿洖 true
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
     * formatCalendarMonthLabel(date) - 鐢熸垚鏃ュ巻闈㈡澘椤堕儴鐨勬湀浠芥爣棰?
     * @param {Date} date - 褰撳墠鏃ュ巻瑙嗗浘鎵€鍦ㄦ湀浠?
     * @returns {string} - 骞存湀鏍囬鏂囨湰
     */
    function formatCalendarMonthLabel(date) {
        return `${date.getFullYear()}年 ${String(date.getMonth() + 1).padStart(2, '0')}月`;
    }

    /**
     * getCalendarDisplayDate() - 鑾峰彇鏃ュ巻闈㈡澘褰撳墠搴斿睍绀虹殑鍩哄噯鏃ユ湡
     * @returns {Date} - 褰撳墠閫変腑鏃ユ湡鎴栦粖澶?
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
     * syncDateFieldDisplay() - 鍚屾鏃ユ湡瀛楁鐨勪富鍊笺€佽緟鍔╄鏄庡拰婵€娲荤姸鎬?
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鍒锋柊鏃ユ湡瀛楁鏄剧ず
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
     * isRecommendedPlannerDate(date) - 鍒ゆ柇鏌愪竴澶╂槸鍚﹀睘浜庢帹鑽愬嚭鍙戠獥鍙?
     * @param {Date} date - 寰呭垽鏂殑鏃ユ湡瀵硅薄
     * @returns {boolean} - 鏄惁灞炰簬鎺ㄨ崘绐楀彛
     */
    function isRecommendedPlannerDate(date) {
        const day = date.getDate();
        return (day >= 8 && day <= 12) || (day >= 18 && day <= 22);
    }

    /**
     * getPanelWidth(fieldKey) - 鎸夊瓧娈电被鍨嬭绠楁诞灞傞潰鏉垮搴?
     * @param {string} fieldKey - 瀛楁閿悕
     * @returns {number} - 闈㈡澘瀹藉害
     */
    function getPanelWidth(fieldKey) {
        const config = fieldMap[fieldKey];
        if (!config) {
            return 360;
        }

        const triggerRect = config.trigger.getBoundingClientRect();
        const maxWidth = window.innerWidth - PANEL_MARGIN * 2;
        // 鍏堜粠瑙﹀彂鎸夐挳鑷韩瀹藉害鎺ㄥ鈥滅悊鎯抽潰鏉垮搴︹€濓紝
        // 鍐嶇敤瑙嗗彛瀹藉害鍑忓畨鍏ㄨ竟璺濆厹搴曪紝閬垮厤鍦ㄧ獎灞忎笂妯悜婧㈠嚭銆?

        if (fieldKey === 'spot') {
            return Math.min(Math.max(triggerRect.width + 48, 480), 620, maxWidth);
        }

        if (fieldKey === 'date') {
            return Math.min(Math.max(triggerRect.width + 32, 360), 392, maxWidth);
        }

        return Math.min(Math.max(triggerRect.width + 12, 360), 420, maxWidth);
    }

    /**
     * positionPanel(fieldKey) - 鏍规嵁瀛楁浣嶇疆灏嗘诞灞傜ǔ瀹氬畾浣嶅埌瑙嗗彛鍐?
     * @param {string} fieldKey - 瀛楁閿悕
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鍐欏叆闈㈡澘浣嶇疆
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
        // 鍏堟祴涓€娆＄湡瀹為珮搴︼紝鍐嶅喅瀹氭槸鍚戜笅灞曞紑杩樻槸鍚戜笂灞曞紑锛?
        // 涓嶇劧闈㈡澘鍙兘浼氱洿鎺ュ帇鍒板睆骞曞簳閮紝鎴栬€呭湪灏忓睆涓婅鍒囨帀涓€鎴€?
        const spaceBelow = window.innerHeight - triggerRect.bottom - PANEL_MARGIN;
        const spaceAbove = triggerRect.top - PANEL_MARGIN;
        const shouldOpenUpward = measuredHeight > spaceBelow && spaceAbove > spaceBelow;
        const availableHeight = Math.max(
            fieldKey === 'date' ? 320 : 220,
            (shouldOpenUpward ? spaceAbove : spaceBelow) - PANEL_GAP
        );

        config.panel.classList.toggle('opens-upward', shouldOpenUpward);
        if (fieldKey === 'date') {
            // 鏃ュ巻闈㈡澘濡傛灉澶煯浼氭尋鍧忔湀浠藉鑸拰 6 琛屾棩鏈熸牸锛屾墍浠ョ粰瀹冩洿楂樼殑鏈€浣庡彲鐢ㄩ珮搴︺€?
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
     * schedulePanelPosition() - 鍦ㄤ笅涓€甯ч噸鏂拌绠楀綋鍓嶆墦寮€娴眰鐨勪綅缃?
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴瀹夋帓瀹氫綅鍒锋柊
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
        // 瀹氫綅鏀惧埌涓嬩竴甯у仛锛屾槸涓轰簡绛夋祻瑙堝櫒鍏堟妸鏈疆 class銆佸昂瀵稿拰甯冨眬鍙樺寲绠楀畬锛?
        // 閬垮厤璇诲彇鍒版棫灏哄锛屽鑷存诞灞傗€滃厛璺充竴涓嬪啀褰掍綅鈥濄€?
    }

    /**
     * renderPlannerCalendar(direction) - 娓叉煋鑷畾涔夋疆姹愭棩鍘嗛潰鏉?
     * @param {string} direction - 鏈堜唤鍒囨崲鏂瑰悜锛岀敤浜庤Е鍙戝垏鎹㈠姩鐢?
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鏇存柊鏃ュ巻瑙嗗浘
     */
    function renderPlannerCalendar(direction) {
        const draw = () => {
            calendarMonth.textContent = formatCalendarMonthLabel(calendarViewDate);
            calendarGrid.innerHTML = '';

            const year = calendarViewDate.getFullYear();
            const month = calendarViewDate.getMonth();
            const monthStart = new Date(year, month, 1);
            const startOffset = (monthStart.getDay() + 6) % 7;
            // JS 鐨?getDay() 浠ュ懆鏃ヤ负 0锛岃繖閲岃浆鎴愨€滃懆涓€寮€澶粹€濈殑鏃ュ巻閫昏緫銆?
            const gridStart = new Date(year, month, 1 - startOffset);
            // 浠庣綉鏍肩涓€鏍煎簲璇ユ樉绀虹殑閭ｄ竴澶╁紑濮嬬敾锛岃€屼笉鏄洿鎺ヤ粠 1 鍙峰紑濮嬶紝
            // 杩欐牱鍓嶅悗鏈堜唤鐨勮ˉ浣嶆棩鏈熶篃鑳藉畬鏁村嚭鐜帮紝鏃ュ巻缁撴瀯浼氱ǔ瀹氭垚 6 琛?7 鍒椼€?
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
     * closePanel(fieldKey) - 鍏抽棴鎸囧畾瀛楁鐨勬诞灞傞潰鏉垮苟鎭㈠瀛楁鐘舵€?
     * @param {string} fieldKey - 闇€瑕佸叧闂殑瀛楁閿悕
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鍏抽棴娴眰
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
        // 杩欓噷涓嶇珛鍒?hidden锛岃€屾槸绛夐€€鍦哄姩鐢绘挱瀹屽啀钘忋€?
        // 鍚﹀垯瑙嗚涓婁細鍍忕灛闂存秷澶憋紝澶卞幓鈥滄诞灞傛敹鍥炴捣閲屸€濈殑杩囨浮鎰熴€?
    }

    /**
     * closeActivePanel() - 鍏抽棴褰撳墠澶勪簬鎵撳紑鐘舵€佺殑娴眰闈㈡澘
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鍏抽棴褰撳墠娴眰
     */
    function closeActivePanel() {
        if (!activePanelKey) {
            return;
        }

        closePanel(activePanelKey);
    }

    /**
     * openPanel(fieldKey) - 鎵撳紑鎸囧畾瀛楁鐨勬诞灞傞潰鏉匡紝骞惰嚜鍔ㄥ叧闂叾瀹冮潰鏉?
     * @param {string} fieldKey - 闇€瑕佹墦寮€鐨勫瓧娈甸敭鍚?
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴灞曞紑娴眰
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
        // 鎶婃诞灞傜Щ鍔ㄥ埌椤甸潰鏈€楂樺眰鎵胯浇瀹瑰櫒閲岋紝鑰屼笉鏄暀鍦ㄥ瓧娈靛唴閮ㄣ€?
        // 杩欐牱鍗充娇瀛楁鐖跺眰鏈?transform / overflow锛屼篃涓嶄細鎶婃诞灞傛埅鏂€?

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
        // 鍏堣娴忚鍣ㄧ煡閬撯€滃畠宸茬粡鏄剧ず浜嗏€濓紝涓嬩竴甯у啀璁＄畻浣嶇疆鍜屽姞鎵撳紑鎬侊紝
        // 鎵嶈兘鎷垮埌鐪熷疄灏哄骞惰閫忔槑搴?浣嶇Щ鍔ㄧ敾椤虹晠鍙戠敓銆?
    }

    /**
     * jumpToPlannerField(fieldKey) - 浠庘€滃凡鏀惰繘琛岀▼鈥濈殑淇℃伅鍧楃洿鎺ュ甫鐢ㄦ埛璺冲埌瀵瑰簲 Planner 瀛楁
     * @param {'date'|'people'|'spot'} fieldKey - 闇€瑕佸睍寮€鐨勫瓧娈甸敭鍚?
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴婊氬姩骞跺睍寮€瀵瑰簲娴眰
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
     * setOptionState(fieldKey, option) - 灏嗘捣鍩熸垨浜烘暟閫夐」鍐欏洖瀛楁涓庢憳瑕?
     * @param {string} fieldKey - 瀛楁閿悕
     * @param {HTMLElement} option - 褰撳墠閫変腑鐨勯€夐」鎸夐挳
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鍒锋柊瀛楁鏄剧ず
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
     * getCustomPeopleCount() - 璇诲彇褰撳墠瀛楁閲屾槸鍚﹀凡缁忓瓨鍦ㄢ€滈潪棰勮浜烘暟鈥濈殑鑷畾涔夊€?
     * @returns {string} - 褰撳墠鑷畾涔変汉鏁帮紝娌℃湁鍒欒繑鍥炵┖瀛楃涓?
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
     * hideCustomPeopleEditor() - 鏀惰捣鑷畾涔変汉鏁扮紪杈戝尯锛岄伩鍏嶅畠鍦ㄥ叧闂诞灞傚悗娈嬬暀
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鏇存柊娴眰鍐呴儴鐘舵€?
     */
    function hideCustomPeopleEditor() {
        customPeopleBox.hidden = true;
        customPeopleInput.value = '';
    }

    /**
     * showCustomPeopleEditor(prefillValue) - 灞曞紑鑷畾涔変汉鏁拌緭鍏ュ尯锛屽苟鐢ㄥ凡鏈変汉鏁伴濉?
     * @param {string} prefillValue - 棰勫～鐨勪汉鏁板€?
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴灞曞紑缂栬緫鍖?
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
     * applyCustomPeopleValue() - 鎶婅嚜瀹氫箟浜烘暟鍐欏洖瀛楁銆佹憳瑕佸拰宸叉敹杩涜绋?
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鏇存柊褰撳墠 Planner 鐘舵€?
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
     * selectCalendarDate(value) - 閫変腑鏌愪竴澶╁苟鍚屾鍥炲啓鍒板瓧娈典笌鎽樿
     * @param {string} value - 閫変腑鐨勬棩鏈熷€?
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鏇存柊鏃ユ湡鐘舵€?
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
     * updatePlannerSummary() - 鏍规嵁褰撳墠瀛楁鍊煎埛鏂板乏渚ф憳瑕佸尯
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鏇存柊鎽樿鏂囨
     */
    function updatePlannerSummary() {
        const spotLabel = spotInput.dataset.label || summaryMetaMap.spot.emptyValue;
        const peopleLabel = peopleInput.dataset.label || summaryMetaMap.people.emptyValue;
        const dateLabel = formatPlannerDate(dateInput.value);
        const hasSpot = Boolean(spotInput.value);
        const hasDate = Boolean(dateInput.value);
        const hasPeople = Boolean(peopleInput.value);
        const isConfirmed = hasSpot && hasDate && hasPeople;

        const nextValues = {
            spot: spotLabel,
            date: dateLabel,
            people: peopleLabel
        };

        summaryMetaMap.spot.valueNode.textContent = spotLabel;
        summaryMetaMap.spot.metaNode.textContent = hasSpot
            ? summaryMetaMap.spot.filledMeta
            : summaryMetaMap.spot.emptyMeta;
        summaryMetaMap.spot.stateNode.textContent = hasSpot
            ? summaryMetaMap.spot.filledState
            : summaryMetaMap.spot.emptyState;

        summaryMetaMap.date.valueNode.textContent = dateLabel;
        summaryMetaMap.date.metaNode.textContent = hasDate
            ? summaryMetaMap.date.filledMeta
            : summaryMetaMap.date.emptyMeta;
        summaryMetaMap.date.stateNode.textContent = hasDate
            ? summaryMetaMap.date.filledState
            : summaryMetaMap.date.emptyState;

        summaryMetaMap.people.valueNode.textContent = peopleLabel;
        summaryMetaMap.people.metaNode.textContent = hasPeople
            ? summaryMetaMap.people.filledMeta
            : summaryMetaMap.people.emptyMeta;
        summaryMetaMap.people.stateNode.textContent = hasPeople
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
     * commitPlannerDeskSelection() - 鎶婂綋鍓?Planner Desk 鐨勬渶鏂伴€夋嫨绔嬪嵆鍚屾鍒板凡鏀惰繘琛岀▼
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鏇存柊鍏变韩瀛樺偍骞跺埛鏂板垪琛?
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
     * restorePlannerDraft() - 浠庡叡浜瓨鍌ㄤ腑鍥炲～ Planner Desk 涔嬪墠淇濆瓨鐨勮崏绋?
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鍚屾瀛楁褰撳墠鐘舵€?
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
        let restoredPeopleFromDraft = false;

        syncSpotOptionsFromBookings({
            ...draft,
            spot: storedSpotValue,
            spotValue: storedSpotValue
        }, true);

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
        } else if (!restoredPeopleFromDraft && storedPeople) {
            setOptionState('people', storedPeople);
        }

        if (draft.dateValue) {
            dateInput.value = draft.dateValue;
        }

        calendarViewDate = new Date(getCalendarDisplayDate().getFullYear(), getCalendarDisplayDate().getMonth(), 1);
        syncDateFieldDisplay();
    }
    const peopleOptions = Array.from(peoplePanel.querySelectorAll('.planner-option[data-option-group="people"]'));

    // 涓変釜瀛楁閮介噰鐢ㄢ€滃啀鐐逛竴娆¤嚜宸卞氨鏀惰捣鈥濈殑鍒囨崲瑙勫垯锛屽噺灏戞墜鏈虹澶氫綑鎿嶄綔銆?
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
    // 鐐瑰嚮椤甸潰绌虹櫧澶勬椂鍏抽棴娴眰锛岄伩鍏嶆诞灞傞暱鏃堕棿鎮湪椤甸潰涓婃墦鏂槄璇汇€?

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeActivePanel();
        }
    });
    // ESC 鏄渶鑷劧鐨勨€滄敹璧锋诞灞傗€濋敭鐩樿涔夛紝涔熻ˉ涓婃闈㈢鍙闂€с€?

    window.addEventListener('resize', schedulePanelPosition);
    window.addEventListener('scroll', schedulePanelPosition, { passive: true });
    // 瑙嗗彛鍙樺寲鎴栭〉闈㈡粴鍔ㄥ悗锛屽瓧娈垫寜閽殑浣嶇疆浼氬彉锛屾墍浠ヨ閲嶆柊瀹氫綅娴眰銆?
    // 杩欓噷涓嶇洿鎺ュ叧闂紝鑰屾槸灏介噺璁╂诞灞傜户缁窡鐫€鐩爣瀛楁銆?

    const defaultPeopleOption = peoplePanel.querySelector('.planner-option.is-selected') || peopleOptions[0];

    floatingLayer.appendChild(spotPanel);
    floatingLayer.appendChild(datePanel);
    floatingLayer.appendChild(peoplePanel);
    floatingLayer.hidden = true;
    floatingLayer.setAttribute('aria-hidden', 'true');
    // 鍒濆鍖栨椂灏卞厛鎶婁笁涓潰鏉挎惉杩涚粺涓€娴眰瀹瑰櫒锛屽悗闈㈡墦寮€鏃跺彧闇€瑕佹敼鐘舵€侊紝涓嶅啀鍙嶅鎵句綅缃€?

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

// 娼滃墠鍑嗗绯荤粺锛?
// 宸︿晶鏄富棰樺崱鐗囷紝鍙充晶鏄鎯呴潰鏉裤€?
// 瀹冪殑鏍稿績涓嶆槸鈥滃睍寮€鏀惰捣鏇村鏂囧瓧鈥濓紝鑰屾槸鐢ㄦ洿骞抽潤鐨勮妭濂忔妸鍑嗗浜嬮」閫愬眰鎽婂紑銆?
class PrepSystem {
    /**
     * constructor() - 鍒濆鍖栧噯澶囩郴缁熸墍闇€鐨勫崱鐗囥€侀潰鏉垮拰榛樿婵€娲婚」
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
     * bindEvents() - 缁戝畾鍑嗗鍗″垏鎹㈠拰浜岀骇甯姪闈㈡澘灞曞紑浜嬩欢
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴娉ㄥ唽浜嬩欢鐩戝惉
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
     * open(key) - 鎵撳紑鎸囧畾鍑嗗涓婚骞跺埛鏂板彸渚ц鎯呴潰鏉?
     * @param {string} key - 闇€瑕佹墦寮€鐨勫噯澶囦富棰橀敭鍚?
     * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鏇存柊鍗＄墖鍜岄潰鏉跨姸鎬?
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
        // 杩炵画涓ゅ抚 requestAnimationFrame 鏄负浜嗙‘淇濓細
        // 1. 鏂板唴瀹瑰厛鎻掑叆 DOM
        // 2. 娴忚鍣ㄥ厛瀹屾垚涓€娆″竷灞€
        // 3. 鍐嶈Е鍙戝彲瑙佺姸鎬侊紝璁╁叆鍦哄姩鐢荤ǔ瀹氱敓鏁?
    }
}

// 宸叉敹杩涜绋嬪尯鍩熼厤缃細缁熶竴鎺у埗绌虹姸鎬佹枃妗堜笌缂虹渷瀛楁鐨勭洂鎲╄姘斻€?
const CONFIRMED_BOOKING_COPY = Object.freeze({
    emptyDate: '仍在等一段合适的潮汐',
    emptyPeople: '同行节奏还没写进这一潜',
    emptyTagline: '这片海已经被收下，接下来只等节奏慢慢靠近。',
    emptyNote: '这次下潜已经停进行程里，接下来可以继续整理日期、同行与海况窗口。'
});

const CONFIRMED_BOOKINGS_PAGE_SIZE = 4;
let confirmedBookingsPageIndex = 0;

/**
 * escapeHtml(value) - 杞箟鍔ㄦ€佹枃鏈紝閬垮厤琛岀▼鍗＄墖娓叉煋鏃舵彃鍏ヤ笉瀹夊叏鍐呭
 * @param {*} value - 鍘熷鏂囨湰鍊?
 * @returns {string} - 杞箟鍚庣殑瀹夊叏瀛楃涓?
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
 * getTripStore() - 鑾峰彇鍏变韩鐨勭洂鎲╄绋嬪瓨鍌ㄥ疄渚?
 * @returns {Object|null} - 鍏变韩瀛樺偍瀵硅薄鎴栫┖鍊?
 */
function getTripStore() {
    return window.YanqiTripStore || null;
}

let confirmedBookingsTextLayoutController = null;

/**
 * syncConfirmedBookingsTextLayout() - 鐢?pretext 棰勬祴鈥滃凡鏀惰繘琛岀▼鈥濆崱鐗囬噷鐨勫琛屾枃鏈珮搴︺€? * 杩欓噷浼樺厛绋冲畾鏍囬銆佹捣鍩熷壇鏂囨鍜屽椁愯鏄庯紝閬垮厤涓嶅悓娴峰煙鏂囨湰闀跨煭涓嶄竴鏃跺嚭鐜板崱鐗囬珮搴﹁烦鍔ㄣ€? *
 * 杩欎竴灞傚彧鍦ㄢ€滃凡鏀惰繘琛岀▼鈥濆尯鎺ュ叆锛屾槸鍥犱负锛? * 1. 瀹冩槸鍔ㄦ€佹覆鏌撳垪琛紝鏂囨湰闀垮害鍙樺寲鏈€澶э紱
 * 2. 鐢ㄦ埛浼氶绻佷慨鏀规棩鏈?/ 浜烘暟骞惰Е鍙戦噸娓叉煋锛? * 3. 杩欓噷鎻愬墠鎷垮埌鏂囨湰楂樺害锛屾敹鐩婃瘮鍦ㄩ潤鎬佹钀介噷鏇撮珮銆? *
 * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鏇存柊褰撳墠鍒楄〃閲岀殑鏂囨湰鍧楁渶灏忛珮搴︺€? */
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
 * getConfirmedBookingSortValue(booking) - 璁＄畻宸叉敹杩涜绋嬪崱鐗囩殑鎺掑簭鍊硷紝浼樺厛璁╂洿鏃╃殑鏃ユ湡鍏堝嚭鐜?
 * @param {Object} booking - 宸茬‘璁ゅ椁愬璞?
 * @returns {number} - 鐢ㄤ簬鎺掑簭鐨勬椂闂存埑锛岃秺灏忚秺闈犲墠锛涙棤鏃ユ湡鍒欐帓鍒版渶鍚?
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
 * sortConfirmedBookings(bookings) - 瀵瑰凡鏀惰繘琛岀▼鍒楄〃鍋氱ǔ瀹氭帓搴忥紝浼樺厛灞曠ず鏃ユ湡鏇存棭鐨勫畨鎺?
 * @param {Array<Object>} bookings - 鍘熷宸茬‘璁ゅ椁愭暟缁?
 * @returns {Array<Object>} - 鎺掑簭鍚庣殑濂楅鏁扮粍
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
 * getPeopleCountFromSelectionValue(value) - 浠庡悓琛屼汉鏁板瓧娈典腑鎻愬彇鍙敤浜庝环鏍兼崲绠楃殑浜烘暟
 * @param {string} value - 鍘熷鍚岃浜烘暟鍊硷紝渚嬪 "2"銆?3-5"銆?6+"
 * @returns {number} - 鍙敤浜庝及绠楁€讳环鐨勪汉鏁帮紝鏃犳硶璇嗗埆鏃跺洖閫€涓?1
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
 * parseConfirmedBookingPrice(priceText) - 浠庡睍绀轰环鏍间腑鎷嗗嚭璐у竵绗﹀彿涓庢暟鍊奸儴鍒?
 * @param {string} priceText - 浠锋牸鏂囨湰锛屼緥濡?"$2,563"
 * @returns {{currency: string, amount: number, fractionDigits: number}|null} - 鍙绠楃殑浠锋牸瀵硅薄
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
 * formatConfirmedBookingAmount(amount, fractionDigits) - 鎶婅绠楀悗鐨勪环鏍兼牸寮忓寲鍥炲睍绀烘枃鏈?
 * @param {number} amount - 璁＄畻鍚庣殑浠锋牸鏁板€?
 * @param {number} fractionDigits - 鍘熷浠锋牸灏忔暟浣嶆暟
 * @returns {string} - 鏍煎紡鍖栧悗鐨勪环鏍煎瓧绗︿覆
 */
function formatConfirmedBookingAmount(amount, fractionDigits) {
    return amount.toLocaleString('en-US', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
    });
}

/**
 * formatConfirmedBookingCny(amount, fractionDigits) - 鎶婃崲绠楀悗鐨勪汉姘戝竵浠锋牸鏍煎紡鍖栨垚鏇撮€傚悎闃呰鐨勬枃鏈?
 * @param {number} amount - 浜烘皯甯侀噾棰?
 * @param {number} fractionDigits - 鍘熶环鐨勫皬鏁颁綅锛岀敤鏉ュ喅瀹氭槸鍚︿繚鐣欒鍒?
 * @returns {string} - 鏍煎紡鍖栧悗鐨勪汉姘戝竵浠锋牸
 */
function formatConfirmedBookingCny(amount, fractionDigits) {
    const safeFractionDigits = fractionDigits > 0 ? Math.min(fractionDigits, 2) : 0;

    return amount.toLocaleString('zh-CN', {
        minimumFractionDigits: safeFractionDigits,
        maximumFractionDigits: safeFractionDigits
    });
}

/**
 * getConfirmedBookingPriceView(booking) - 鏍规嵁鍚岃浜烘暟杩斿洖琛岀▼鍗＄墖瑕佹樉绀虹殑浠锋牸鏂囨湰
 * @param {Object} booking - 宸叉敹杩涜绋嬪璞?
 * @returns {{primary: string, secondary: string, cny: string}} - 涓讳环鏍笺€佷汉姘戝竵鍙傝€冧环涓庤緟鍔╄鏄?
 */
function getConfirmedBookingPriceView(booking) {
    const USD_TO_CNY_RATE = 10000 / 1451; // 涓庤鎯呴〉淇濇寔鍚屼竴濂楁眹鐜囷細10000 浜烘皯甯?鈮?1451 缇庡厓
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
        ? `绾?楼${formatConfirmedBookingCny(baseAmount * USD_TO_CNY_RATE, parsedPrice.fractionDigits)}`
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
        : `${selectionLabel || `${peopleCount} 人同行`} · 按 ${peopleCount} 人起算`;

    return {
        primary: `${pricePrefix}${formatConfirmedBookingAmount(baseAmount, parsedPrice.fractionDigits)}`,
        secondary,
        cny: cnyText
    };
}

/**
 * syncPlannerSelectionToConfirmedBookings(selection) - 鎶婂綋鍓?Planner Desk 鐨勬棩鏈熶笌鍚岃鍐欏洖宸叉敹杩涜绋?
 * @param {{spotValue: string, dateValue: string, dateLabel: string, peopleValue: string, peopleLabel: string}} selection - 褰撳墠鎺у埗鍙伴€夋嫨缁撴灉
 * @returns {Object[]} - 鏇存柊鍚庣殑宸叉敹杩涜绋嬪垪琛?
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
 * buildConfirmedBookingCardMarkup(booking) - 鐢熸垚鍗曞紶宸叉敹杩涜绋嬪崱鐗囩殑 HTML
 * @param {Object} booking - 宸茬‘璁ゅ椁愬璞?
 * @returns {string} - 宸叉敹杩涜绋嬪崱鐗?HTML
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
 * renderConfirmedBookings() - 璇诲彇鍏变韩瀛樺偍骞跺埛鏂?trip 椤碘€滃凡鏀惰繘琛岀▼鈥濆尯鍩?
 * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鏇存柊琛岀▼鍗＄墖鍒楄〃
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
    list.innerHTML = visibleBookings.map((booking) => buildConfirmedBookingCardMarkup(booking)).join('');
    syncConfirmedBookingsTextLayout();

    if (switchButton) {
        switchButton.hidden = bookings.length <= CONFIRMED_BOOKINGS_PAGE_SIZE;
    }
}

/**
 * setupConfirmedBookingsStage() - 缁戝畾宸叉敹杩涜绋嬪尯鍩熺殑璺宠浆涓庣Щ闄よ涓?
 * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴娉ㄥ唽浜嬩欢骞跺畬鎴愬垵娆℃覆鏌?
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

// 琛岀▼椤靛垵濮嬪寲鍏ュ彛锛氱粺涓€鍚姩瀵艰埅銆佹憳瑕佸崱銆佸噯澶囩郴缁熷拰澶村儚杩斿洖閫昏緫銆?
/**
 * document DOMContentLoaded 鍥炶皟 - 鍒濆鍖栬绋嬮〉鐨勫鑸€佹憳瑕佸崱鍜屽噯澶囩郴缁?
 * @returns {void} - 鏃犺繑鍥炲€硷紝鐩存帴鍚姩椤甸潰閫昏緫
 */
document.addEventListener('DOMContentLoaded', () => {
    setupTripScrollLinks();
    new TripSeaGuide();
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

