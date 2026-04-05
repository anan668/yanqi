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
const HOME_SCROLL_STORAGE_KEY = 'YANQI_HOME_SCROLL_TARGET';
const HERO_HOTSPOTS_STAGE_STORAGE_KEY = 'YANQI_HOME_HOTSPOTS_STAGE_SIZE';
const STAGE_DEBUG_STORAGE_KEY = 'YANQI_STAGE_DEBUG_MODE';
const STAGE_DEBUG_QUERY_KEY = 'stageDebug';

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

// 热门潜点数据：用于竹签滚动推荐区的卡片渲染、价格展示和详情页跳转。
const divingSpotsData = convertSpotCardPrices([
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
    }
]);

// 精选目的地数据：用于海域档案陈列廊的主舞台卡和右侧样本卡切换。
const destinationsData = [
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
    }
];

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
            { id: 4, reason: '光线温和、礁坡层次清楚，适合把第一次热带海域留得更舒服。', tags: ['OW', '温柔光线', '珊瑚坡'] },
            { id: 6, reason: '海墙和海龟都很明亮，但整体节奏不会逼得太快。', tags: ['OW / AOW', '海龟', '清澈'] }
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
            { id: 4, reason: '帝汶岛的珊瑚坡和柔和光线，很适合 OW 把呼吸放稳。', tags: ['OW', '舒展', '珊瑚'] },
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
            { id: 4, reason: '帝汶岛的珊瑚坡和日光很适合慢慢潜、慢慢看。', tags: ['舒展', '珊瑚坡', '光线'] },
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
            { id: 8, reason: '图阿莫图的通透蓝水很开阔，停留感也很安静。', tags: ['蓝水', '开阔', '停驻'] }
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
            { id: 8, reason: '图阿莫图适合把通透海面和通道蓝水一起留在记忆里。', tags: ['玻璃海', '通道', '蓝水'] },
            { id: 9, reason: '马布岛的码头、木栈道和海风，会让海面以上也一样好看。', tags: ['海岛生活', '码头', '慢行'] }
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
        this.enableAutoStep = true;
        this.enableInertia = false;
        this.dragThreshold = 8;

        this.totalCards = divingSpotsData.length;
        this.cloneSets = 3;
        this.cards = [];
        this.cardPhysics = [];

        this.cardStride = 300;
        this.setWidth = this.totalCards * this.cardStride;
        this.trackPosition = this.setWidth;
        this.trackVelocity = 0;

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
        this.autoIntervalMs = 3800;
        this.autoIntervalJitterMinMs = -600;
        this.autoIntervalJitterMaxMs = 600;
        this.autoStepDurationMin = 1.02;
        this.autoStepDurationMax = 1.18;

        this.shakeEnergy = 0;

        this.frameRafId = 0;
        this.lastFrameTs = 0;

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
        this.attachEvents();
        this.updateTrackPosition();
        this.startFrameLoop();
        this.scheduleAutoStep();
    }

    /**
     * render() - 渲染竹签滚动区的全部卡片和克隆集合
     * @returns {void} - 无返回值，直接更新卡片 DOM
     */
    render() {
        const fragment = document.createDocumentFragment();

        for (let set = 0; set < this.cloneSets; set += 1) {
            divingSpotsData.forEach((spot) => {
                const card = document.createElement('div');
                card.className = 'bamboo-card';
                card.dataset.spotId = String(spot.id);
                card.dataset.url = `detail.html?id=${spot.id}`;
                card.style.setProperty('--enter-delay', `${(spot.id - 1) * 0.045 + set * 0.04}s`);
                card.innerHTML = `
                    <div class="bamboo-card-image-wrapper">
                        <img src="${spot.image}" alt="${spot.name}" class="bamboo-card-image" onerror="this.src='https://via.placeholder.com/280x180?text=${encodeURIComponent(spot.name)}'">
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
            wobbleR: 0
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

        if (!Number.isFinite(this.trackPosition) || this.trackPosition <= 0) {
            this.trackPosition = this.setWidth;
        }

        this.recenterTrack();
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

        this.wrapper.addEventListener('mouseenter', (event) => {
            this.pointerInsideWrapper = true;
            this.pointerClientX = event.clientX;
            this.pointerClientY = event.clientY;
            this.cancelAutoStep();
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
            if (!this.isDragging) {
                this.scheduleAutoStep();
            }
        });

        window.addEventListener('resize', () => {
            this.measure();
            this.updateTrackPosition();
        });
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

        this.wrapper.classList.add('is-dragging');

        if (this.wrapper.setPointerCapture) {
            this.wrapper.setPointerCapture(event.pointerId);
        }
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

        const now = performance.now();
        const dragDeltaX = event.clientX - this.startPointerX;

        this.trackPosition = this.startTrackPosition - dragDeltaX;
        this.recenterTrack();
        this.updateTrackPosition();

        const dt = Math.max((now - this.lastPointerTime) / 1000, 0.001);
        const deltaX = event.clientX - this.lastPointerX;
        const nextVelocity = -(deltaX / dt);
        const accel = (nextVelocity - this.lastTrackVelocity) / dt;
        this.lastTrackVelocity = nextVelocity;
        this.trackVelocity = this.lastTrackVelocity;

        if (Math.abs(dragDeltaX) > this.dragThreshold) {
            this.dragMoved = true;
        }

        this.pointerClientX = event.clientX;
        this.pointerClientY = event.clientY;

        this.injectShake(Math.abs(this.lastTrackVelocity));
        this.applyDragRecoil(this.lastTrackVelocity, accel);

        this.lastPointerX = event.clientX;
        this.lastPointerTime = now;
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

        if (this.enableAutoStep) {
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
                }, { shouldReset: false, callbackDelay: 300 });
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
            return;
        }

        const clamped = this.clamp(releaseVelocity, -3200, 3200);

        if (Math.abs(clamped) < 40) {
            this.trackVelocity = 0;
            this.inertia.active = false;
            return;
        }

        this.inertia.active = true;
        this.inertia.boostTime = 0.12;
        this.inertia.boostAccel = Math.sign(clamped) * 2200;

        this.trackVelocity = clamped * 1.08;
        this.injectShake(Math.abs(this.trackVelocity) * 1.1);
    }

    /**
     * startStepScroll(direction, isAutoStep) - 按指定方向启动单步滚动动画
     * @param {number} direction - 滚动方向，通常为 -1 或 1
     * @param {boolean} isAutoStep - 是否为自动滚动触发
     * @returns {void} - 无返回值，直接启动步进滚动
     */
    startStepScroll(direction, isAutoStep) {
        if (this.isDragging || this.autoStep) {
            return false;
        }

        this.inertia.active = false;

        const from = this.trackPosition;
        const to = from + direction * this.cardStride;

        this.autoStep = {
            from,
            to,
            direction,
            duration: this.randomBetween(this.autoStepDurationMin, this.autoStepDurationMax),
            elapsed: 0,
            brakeImpulseApplied: false
        };

        this.injectShake(1000);

        if (!isAutoStep && this.enableAutoStep) {
            this.scheduleAutoStep();
        }

        return true;
    }

    /**
     * scheduleAutoStep() - 安排下一次自动滚动的触发时间
     * @returns {void} - 无返回值，直接设置定时器
     */
    scheduleAutoStep() {
        if (!this.enableAutoStep) {
            return;
        }

        if (this.autoTimer) {
            clearTimeout(this.autoTimer);
            this.autoTimer = null;
        }

        const randomJitter = this.randomBetween(this.autoIntervalJitterMinMs, this.autoIntervalJitterMaxMs);
        const delay = Math.max(2200, this.autoIntervalMs + randomJitter);
        this.autoTimer = setTimeout(() => {
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
     * startFrameLoop() - 启动组件的逐帧更新循环
     * @returns {void} - 无返回值，直接开始 requestAnimationFrame 循环
     */
    startFrameLoop() {
        const frame = (timestamp) => {
            if (!this.lastFrameTs) {
                this.lastFrameTs = timestamp;
            }

            const dt = Math.min((timestamp - this.lastFrameTs) / 1000, 0.05);
            this.lastFrameTs = timestamp;

            this.updateTrackMotion(dt);
            this.updateCardPhysics(dt, timestamp / 1000);

            if (this.pointerInsideWrapper && !this.isDragging) {
                this.updateHoverFromPointer();
            }

            this.frameRafId = requestAnimationFrame(frame);
        };

        this.frameRafId = requestAnimationFrame(frame);
    }

    /**
     * updateTrackMotion(dt) - 按时间步进更新轨道位置与惯性状态
     * @param {number} dt - 当前帧的时间增量
     * @returns {void} - 无返回值，直接更新轨道运动
     */
    updateTrackMotion(dt) {
        const previous = this.trackPosition;

        if (this.autoStep) {
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
            }
        } else if (this.inertia.active && !this.isDragging) {
            if (this.inertia.boostTime > 0) {
                this.trackVelocity += this.inertia.boostAccel * dt;
                this.inertia.boostTime -= dt;
            }

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
            this.recenterTrack();
            const delta = this.trackPosition - previous;
            if (dt > 0) {
                this.trackVelocity = delta / dt;
            }
            this.updateTrackPosition();
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

        const energyDecay = this.isDragging ? 0.985 : 0.965;
        this.shakeEnergy *= Math.pow(energyDecay, dt * 60);
        if (this.shakeEnergy < 0.01) {
            this.shakeEnergy = 0;
        }

        for (let i = 0; i < this.cards.length; i += 1) {
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

            card.style.setProperty('--wobble-x', `${state.jitterX.toFixed(2)}px`);
            card.style.setProperty('--elastic-x', `${state.lagX.toFixed(2)}px`);
            card.style.setProperty('--wobble-y', `${state.wobbleY.toFixed(2)}px`);
            card.style.setProperty('--wobble-r', `${state.wobbleR.toFixed(2)}deg`);
        }
    }

    /**
     * injectShake(speedPxPerSecond) - 向轨道注入一次刹停抖动能量
     * @param {number} speedPxPerSecond - 当前滚动速度
     * @returns {void} - 无返回值，直接更新抖动能量
     */
    injectShake(speedPxPerSecond) {
        const normalized = this.clamp(speedPxPerSecond / 1600, 0, 1);
        this.shakeEnergy = this.clamp(this.shakeEnergy + 0.22 + normalized * 0.82, 0, 1.28);

        for (let i = 0; i < this.cardPhysics.length; i += 1) {
            const state = this.cardPhysics[i];
            const centerWeight = this.getCenterWeightByIndex(i);
            const impulse = (120 + normalized * 340) * centerWeight * this.randomBetween(0.85, 1.35);
            const direction = Math.random() < 0.5 ? -1 : 1;
            state.jitterV += direction * impulse;
        }
    }

    /**
     * applyDragRecoil(velocity, accel) - 根据拖拽速度和加速度施加回弹感
     * @param {number} velocity - 当前拖拽速度
     * @param {number} accel - 当前拖拽加速度
     * @returns {void} - 无返回值，直接更新回弹参数
     */
    applyDragRecoil(velocity, accel) {
        if (Math.abs(velocity) < 25 && Math.abs(accel) < 650) {
            return;
        }

        const speedNorm = this.clamp(Math.abs(velocity) / 1900, 0, 1);
        const accelNorm = this.clamp(Math.abs(accel) / 7000, 0, 1);
        const direction = -Math.sign(velocity || accel || 1);
        const impulseBase = 80 + speedNorm * 180 + accelNorm * 140;

        for (let i = 0; i < this.cardPhysics.length; i += 1) {
            const state = this.cardPhysics[i];
            const centerWeight = this.getCenterWeightByIndex(i);
            const impulse = impulseBase * state.recoilScale * centerWeight * this.randomBetween(0.8, 1.2);
            state.lagV += direction * impulse;
            state.jitterV += (-direction * impulse) * 0.33;
        }
    }

    /**
     * updateHoverFromPointer() - 根据当前鼠标位置更新悬停卡片
     * @returns {void} - 无返回值，直接同步 hover 状态
     */
    updateHoverFromPointer() {
        const element = document.elementFromPoint(this.pointerClientX, this.pointerClientY);
        const card = element ? element.closest('.bamboo-card') : null;

        if (!card || !this.content.contains(card)) {
            this.setHoveredCard(null);
            return;
        }

        this.setHoveredCard(card);
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
        const card = this.cards[index];
        if (!card || !this.wrapper) {
            return 0.2;
        }

        const wrapperCenter = this.wrapper.clientWidth * 0.5;
        const cardCenter = card.offsetLeft + card.offsetWidth * 0.5 - this.trackPosition;
        const dist = Math.abs(cardCenter - wrapperCenter);
        const maxDist = Math.max(this.wrapper.clientWidth * 0.7, this.cardStride * 2.2);
        const normalized = 1 - dist / maxDist;

        return this.clamp(normalized, 0.2, 1);
    }

    /**
     * recenterTrack() - 在循环滚动场景下重置轨道到中间安全区
     * @returns {void} - 无返回值，直接调整轨道位置
     */
    recenterTrack() {
        const min = this.setWidth * 0.5;
        const max = this.setWidth * 2.5;

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
    updateTrackPosition() {
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
    }

    /**
     * applyStepBrakeImpulse(direction) - 为步进滚动添加一次刹停阻尼脉冲
     * @param {number} direction - 当前滚动方向
     * @returns {void} - 无返回值，直接修改轨道速度
     */
    applyStepBrakeImpulse(direction) {
        const brakeDirection = -Math.sign(direction || 1);
        this.shakeEnergy = this.clamp(this.shakeEnergy + 0.08, 0, 1.12);

        for (let i = 0; i < this.cardPhysics.length; i += 1) {
            const state = this.cardPhysics[i];
            const centerWeight = this.getCenterWeightByIndex(i);
            const impulse = (42 + centerWeight * 30) * state.recoilScale * this.randomBetween(0.92, 1.12);

            state.lagV += brakeDirection * impulse;
            state.jitterV += (-brakeDirection * impulse) * 0.16;
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

// 精选目的地舞台：负责主卡渲染、样本卡切换，以及不同海域之间的缓慢转场。
class CuratedWatersStage {
    /**
     * constructor() - 初始化精选目的地舞台的 DOM 引用和当前激活索引
     */
    constructor() {
        this.section = document.getElementById('featured-destinations');
        this.shell = this.section ? this.section.querySelector('.curated-waters-shell') : null;
        this.intro = this.section ? this.section.querySelector('.curated-waters-intro') : null;
        this.stage = document.getElementById('curatedWatersStage');
        this.mainCard = document.getElementById('curatedMainCard');
        this.liveSummary = document.getElementById('curatedLiveSummary');
        this.sampleCloud = document.getElementById('destinationsGrid');
        this.currentIndex = 0;
        this.switchTimer = 0;
        this.phaseRaf = 0;
        this.hasUserSelected = true;
        this.sampleCardsObserver = null;
        this.announceSummary = createBufferedLiveAnnouncer(this.liveSummary);

        if (!this.section || !this.shell || !this.intro || !this.mainCard || !this.sampleCloud) {
            return;
        }

        this.init();
    }

    /**
     * init() - 启动精选目的地舞台的渲染、事件绑定和预加载
     * @returns {void} - 无返回值，直接初始化舞台
     */
    init() {
        this.renderSampleCloud();
        this.renderMainCard(this.currentIndex, { immediate: true });
        this.attachEvents();
        this.setupReveal();
        this.setupScrollPhases();
        this.preloadNearby(this.currentIndex);
    }

    /**
     * renderSampleCloud() - 渲染右侧样本卡片云层
     * @returns {void} - 无返回值，直接更新样本卡 DOM
     */
    renderSampleCloud() {
        if (this.sampleCardsObserver) {
            this.sampleCardsObserver.disconnect();
            this.sampleCardsObserver = null;
        }

        this.sampleCloud.classList.remove('is-samples-awakened');

        const offsets = [
            { x: 0, y: -10 },
            { x: 12, y: 10 },
            { x: -14, y: 16 },
            { x: 16, y: -8 },
            { x: -10, y: 6 },
            { x: 8, y: 18 }
        ];

        this.sampleCloud.innerHTML = destinationsData.map((dest, index) => {
            const offset = offsets[index] || { x: 0, y: 0 };
            return `
                <button
                    type="button"
                    class="curated-sample-card${index === this.currentIndex ? ' is-active' : ''}"
                    data-index="${index}"
                    data-id="${dest.id}"
                    style="--sample-delay: ${index * 90}ms; --sample-offset-x: ${offset.x}px; --sample-offset-y: ${offset.y}px;"
                >
                    <span class="curated-sample-image-wrap">
                        <img src="${dest.image}" alt="${dest.name}" class="curated-sample-image" onerror="this.src='https://via.placeholder.com/240x220?text=${encodeURIComponent(dest.name)}'">
                    </span>
                    <span class="curated-sample-copy">
                        <span class="curated-sample-name">${dest.name}</span>
                        <span class="curated-sample-keyword">${dest.sampleKeyword}</span>
                        <span class="curated-sample-meta">${dest.sampleMeta}</span>
                    </span>
                </button>
            `;
        }).join('');
    }

    /**
     * revealSampleCards() - 让右侧样本卡在真正滑进视口时才各自显形
     * @returns {void} - 无返回值，直接给样本卡设置观察器
     */
    revealSampleCards() {
        if (!this.sampleCloud) {
            return;
        }

        const cards = Array.from(this.sampleCloud.querySelectorAll('.curated-sample-card'));
        if (!cards.length) {
            return;
        }

        this.sampleCloud.classList.add('is-samples-awakened');

        if (!('IntersectionObserver' in window)) {
            cards.forEach((card) => card.classList.add('is-sample-visible'));
            return;
        }

        if (this.sampleCardsObserver) {
            this.sampleCardsObserver.disconnect();
        }

        this.sampleCardsObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add('is-sample-visible');
                this.sampleCardsObserver?.unobserve(entry.target);
            });
        }, {
            threshold: 0.28,
            rootMargin: '0px 0px -8% 0px'
        });

        cards.forEach((card) => {
            this.sampleCardsObserver.observe(card);
        });
    }

    /**
     * createMainSurface(dest, index, directionClass) - 创建主舞台卡片的 DOM 结构
     * @param {Object} dest - 当前目的地数据
     * @param {number} index - 当前目的地索引
     * @param {string} directionClass - 切换方向对应的附加 class
     * @returns {HTMLDivElement} - 创建好的主舞台卡片元素
     */
    createMainSurface(dest, index, directionClass) {
        const surface = document.createElement('div');
        surface.className = `curated-main-surface${directionClass ? ` ${directionClass}` : ''}${this.hasUserSelected ? ' is-shifted-layout' : ''}`;
        surface.innerHTML = `
            <div class="curated-main-media">
                <img src="${dest.image}" alt="${dest.name}" class="curated-main-image" onerror="this.src='https://via.placeholder.com/760x720?text=${encodeURIComponent(dest.name)}'">
            </div>

            <div class="curated-main-copy">
                <p class="curated-main-kicker">${dest.archiveLabel}</p>

                <div class="curated-main-heading">
                    <h3 class="curated-main-name">${dest.name}</h3>
                    <p class="curated-main-english">${dest.englishName}</p>
                </div>

                <p class="curated-main-atmosphere">${dest.atmosphere}</p>

                <div class="curated-main-facts">
                    <div class="curated-main-fact">
                        <span class="curated-main-fact-label">适合等级</span>
                        <span class="curated-main-fact-value">${dest.level}</span>
                    </div>
                    <div class="curated-main-fact">
                        <span class="curated-main-fact-label">最佳季节</span>
                        <span class="curated-main-fact-value">${dest.season}</span>
                    </div>
                    <div class="curated-main-fact">
                        <span class="curated-main-fact-label">适合人群</span>
                        <span class="curated-main-fact-value">${dest.audience}</span>
                    </div>
                </div>

                <div class="curated-main-conditions">
                    ${dest.conditions.map((condition) => `
                        <span class="curated-main-condition">${condition}</span>
                    `).join('')}
                </div>

                <p class="curated-main-worth">
                    <span class="curated-main-worth-label">值得去</span>
                    <span class="curated-main-worth-text">${dest.worthIt}</span>
                </p>

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
     * renderMainCard(nextIndex, options) - 切换并渲染当前激活的主舞台卡片
     * @param {number} nextIndex - 目标目的地索引
     * @param {Object} options - 渲染配置项
     * @returns {void} - 无返回值，直接更新主舞台内容
     */
    renderMainCard(nextIndex, options = {}) {
        const { immediate = false } = options;
        const dest = destinationsData[nextIndex];
        if (!dest) {
            return;
        }

        const currentSurface = this.mainCard.querySelector('.curated-main-surface.is-active')
            || this.mainCard.querySelector('.curated-main-surface');
        const movingForward = nextIndex >= this.currentIndex;
        const enterClass = immediate ? '' : (movingForward ? 'from-right is-entering' : 'from-left is-entering');
        const leavingClass = movingForward ? 'to-left' : 'to-right';
        // 这里不是简单替换 innerHTML，而是区分“当前卡离场”和“下一张卡入场”的方向，
        // 让精选目的地像在同一片海域陈列廊里缓慢平移，而不是瞬间换页。
        const nextSurface = this.createMainSurface(dest, nextIndex, enterClass);
        this.stage.classList.toggle('is-shifted', this.hasUserSelected);

        if (this.switchTimer) {
            window.clearTimeout(this.switchTimer);
            this.switchTimer = 0;
        }

        Array.from(this.mainCard.querySelectorAll('.curated-main-surface.is-leaving')).forEach((surface) => {
            surface.remove();
        });

        if (currentSurface && !immediate) {
            currentSurface.classList.remove('is-active', 'is-resting');
            currentSurface.classList.add('is-leaving', leavingClass);
        } else {
            Array.from(this.mainCard.querySelectorAll('.curated-main-surface')).forEach((surface) => {
                surface.remove();
            });
        }

        this.mainCard.appendChild(nextSurface);

        requestAnimationFrame(() => {
            nextSurface.classList.add('is-active');
        });
        // 先插入 DOM，再下一帧加 is-active，浏览器才能识别“从初始态到激活态”的动画差异。

        if (immediate) {
            nextSurface.classList.add('is-resting');
        } else {
            this.switchTimer = window.setTimeout(() => {
                Array.from(this.mainCard.querySelectorAll('.curated-main-surface.is-leaving')).forEach((surface) => {
                    surface.remove();
                });
                nextSurface.classList.remove('is-entering', 'from-right', 'from-left');
                nextSurface.classList.add('is-resting');
                this.switchTimer = 0;
            }, 760);
        }

        this.currentIndex = nextIndex;
        this.syncActiveSample();
        this.preloadNearby(nextIndex);

        if (!immediate) {
            this.announceSummary(`已切换到${dest.name}，适合${dest.level}，最佳季节${dest.season}。`);
        }
    }

    /**
     * syncActiveSample() - 同步右侧样本卡的激活态显示
     * @returns {void} - 无返回值，直接更新样本卡状态
     */
    syncActiveSample() {
        this.sampleCloud.querySelectorAll('.curated-sample-card').forEach((card) => {
            const isActive = Number(card.dataset.index) === this.currentIndex;
            card.classList.toggle('is-active', isActive);
            card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    /**
     * preloadNearby(index) - 预加载当前主卡附近的目的地图片资源
     * @param {number} index - 当前激活目的地索引
     * @returns {void} - 无返回值，直接触发资源预加载
     */
    preloadNearby(index) {
        const preloadTargets = [
            destinationsData[index],
            destinationsData[(index + 1) % destinationsData.length],
            destinationsData[(index - 1 + destinationsData.length) % destinationsData.length]
        ].filter(Boolean);

        preloadTargets.forEach((dest) => {
            const image = new Image();
            image.src = dest.image;
        });
    }

    /**
     * attachEvents() - 绑定样本卡点击和主卡详情跳转事件
     * @returns {void} - 无返回值，直接注册交互事件
     */
    attachEvents() {
        this.sampleCloud.addEventListener('click', (event) => {
            const card = event.target.closest('.curated-sample-card');
            if (!card) {
                return;
            }

            const nextIndex = Number(card.dataset.index);
            if (!Number.isFinite(nextIndex) || nextIndex === this.currentIndex) {
                return;
            }

            this.hasUserSelected = true;
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

    /**
     * setupReveal() - 初始化精选目的地区块的进入视口唤醒效果
     * @returns {void} - 无返回值，直接设置观察器或降级显示
     */
    setupReveal() {
        if (!('IntersectionObserver' in window)) {
            this.section.classList.add('is-visible');
            this.revealSampleCards();
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                this.section.classList.add('is-visible');
                this.revealSampleCards();
                observer.unobserve(entry.target);
            });
        }, {
            threshold: 0.18,
            rootMargin: '0px 0px -8% 0px'
        });

        observer.observe(this.section);
    }

    /**
     * setupScrollPhases() - 监听滚动并切换精选目的地的三段式进入阶段
     * @returns {void} - 无返回值，直接登记滚动和尺寸变化监听
     */
    setupScrollPhases() {
        const requestPhaseSync = () => {
            if (this.phaseRaf) {
                return;
            }

            this.phaseRaf = window.requestAnimationFrame(() => {
                this.phaseRaf = 0;
                this.syncScrollPhase();
            });
        };

        window.addEventListener('scroll', requestPhaseSync, { passive: true });
        window.addEventListener('resize', requestPhaseSync, { passive: true });
        requestPhaseSync();
    }

    /**
     * syncScrollPhase() - 让精选目的地先完整交代，再平滑收束到左侧舞台
     * @returns {void} - 无返回值，直接更新 section 的滚动阶段状态
     */
    syncScrollPhase() {
        if (!this.section) {
            return;
        }

        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const sectionTop = this.section.getBoundingClientRect().top + scrollY;
        const sectionHeight = this.section.offsetHeight;

        const introVisibleThreshold = Math.max(0, sectionTop - viewportHeight * 0.94);
        const settlingThreshold = Math.max(0, sectionTop - viewportHeight * 0.54);
        const leftThreshold = Math.max(
            settlingThreshold + viewportHeight * 0.18,
            sectionTop + Math.min(sectionHeight * 0.34, 380) - viewportHeight * 0.1
        );
        const stageProgressRaw = clamp(
            (scrollY - introVisibleThreshold) / Math.max(settlingThreshold - introVisibleThreshold, 1),
            0,
            1
        );
        const leftProgressRaw = window.innerWidth <= 1024
            ? 0
            : clamp(
                (scrollY - settlingThreshold) / Math.max(leftThreshold - settlingThreshold, 1),
                0,
                1
            );
        const stageProgress = 1 - Math.pow(1 - stageProgressRaw, 1.45);
        const leftProgress = leftProgressRaw * leftProgressRaw * (3 - 2 * leftProgressRaw);

        let nextPhase = 'top';

        if (window.innerWidth <= 1024) {
            nextPhase = scrollY >= settlingThreshold ? 'settling' : 'top';
        } else if (scrollY >= leftThreshold) {
            nextPhase = 'left';
        } else if (scrollY >= settlingThreshold) {
            nextPhase = 'settling';
        }

        if (scrollY >= introVisibleThreshold && !this.section.classList.contains('is-visible')) {
            this.section.classList.add('is-visible');
            this.revealSampleCards();
        }

        this.section.style.setProperty('--curated-stage-progress', stageProgress.toFixed(4));
        this.section.style.setProperty('--curated-left-progress', leftProgress.toFixed(4));

        if (this.section.dataset.curatedPhase !== nextPhase) {
            this.section.dataset.curatedPhase = nextPhase;
        }
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
        this.activeKey = getDiveMatchKeyFromLocation() || readStoredDiveMatchKey() || DIVE_MATCH_DEFAULT_KEY;
        this.switchTimer = 0;
        this.focusTimer = 0;
        this.shouldAutoFocus = window.location.hash === '#dive-match' || Boolean(getDiveMatchKeyFromLocation());
        this.announceSummary = createBufferedLiveAnnouncer(this.liveSummary);

        if (this.section && this.stage && this.filters && this.display) {
            this.init();
        }
    }

    /**
     * init() - 渲染分类标签、首屏内容并绑定模块交互
     * @returns {void} - 无返回值，直接启动潜水匹配模块
     */
    init() {
        this.renderFilters();
        this.renderActiveMatch(this.activeKey, { immediate: true, syncDepth: false });
        this.attachEvents();
        this.setupReveal();

        if (this.shouldAutoFocus) {
            this.scheduleAutoFocus();
        } else {
            if (window.DepthManager && typeof window.DepthManager.setHomeDiveMatchDepth === 'function') {
                window.DepthManager.setHomeDiveMatchDepth(null);
            }
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
                aria-pressed="${match.key === this.activeKey ? 'true' : 'false'}"
                style="--match-delay: ${index * 56}ms;"
            >
                <span class="dive-match-filter-group">${match.group}</span>
                <span class="dive-match-filter-label">${match.label}</span>
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
        const cardsMarkup = match.cards.map((card, index) => {
            const destination = destinationById.get(card.id);
            if (!destination) {
                return '';
            }

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
                        <img src="${destination.image}" alt="${destination.name}" class="dive-match-card-image" onerror="this.src='https://via.placeholder.com/520x360?text=${encodeURIComponent(destination.name)}'">
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
        }).join('');

        surface.className = `dive-match-surface${directionClass ? ` ${directionClass}` : ''}`;
        surface.innerHTML = `
            <article class="dive-match-focus-card">
                <p class="dive-match-focus-group">${match.group}</p>
                <div class="dive-match-focus-head">
                    <h3 class="dive-match-focus-title">${match.label}</h3>
                    <span class="dive-match-focus-depth">${Math.abs(match.depth)}m layer</span>
                </div>
                <p class="dive-match-focus-audience">${match.audience}</p>
                <p class="dive-match-focus-guidance">${match.guidance}</p>
                <p class="dive-match-focus-note">${match.note}</p>
            </article>
            <div class="dive-match-card-grid">
                ${cardsMarkup}
            </div>
        `;

        return surface;
    }

    /**
     * renderActiveMatch(nextKey, options) - 切换当前激活的匹配分类内容层
     * @param {string} nextKey - 目标分类键名
     * @param {Object} options - 切换配置项
     * @returns {void} - 无返回值，直接更新推荐内容区
     */
    renderActiveMatch(nextKey, options = {}) {
        const { immediate = false, syncDepth = true } = options;
        const nextMatch = getDiveMatchEntry(nextKey);
        const currentMatch = getDiveMatchEntry(this.activeKey);
        const currentSurface = this.display.querySelector('.dive-match-surface.is-active')
            || this.display.querySelector('.dive-match-surface');
        const goingDeeper = nextMatch.depth < currentMatch.depth;
        const enterClass = immediate ? '' : (goingDeeper ? 'from-deeper is-entering' : 'from-shallower is-entering');
        const leaveClass = goingDeeper ? 'to-deeper' : 'to-shallower';
        // 这里用深浅方向而不是左右方向，
        // 是因为潜水匹配的切换更像“往更深一层 / 回到更浅一层”。
        const nextSurface = this.createMatchSurface(nextMatch, enterClass);

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

        this.activeKey = nextMatch.key;
        storeDiveMatchKey(this.activeKey);
        this.syncActiveFilter();
        if (syncDepth) {
            this.syncDepth();
        }

        if (!immediate) {
            this.announceSummary(`已切换到${nextMatch.label}，推荐${nextMatch.cards.length}片海域。`);
        }
    }

    /**
     * syncActiveFilter() - 同步顶部分类标签的激活状态和无障碍属性
     * @returns {void} - 无返回值，直接更新分类标签样式
     */
    syncActiveFilter() {
        this.filters.querySelectorAll('.dive-match-filter').forEach((button) => {
            const isActive = button.dataset.matchKey === this.activeKey;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
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

    /**
     * setupReveal() - 在模块进入视口时触发整组匹配档案的显现动画
     * @returns {void} - 无返回值，直接设置显现状态
     */
    setupReveal() {
        if (!('IntersectionObserver' in window)) {
            this.section.classList.add('is-visible', 'is-stage-visible');
            return;
        }

        const sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                this.section.classList.add('is-visible');
                sectionObserver.unobserve(entry.target);
            });
        }, {
            threshold: 0.18,
            rootMargin: '0px 0px -8% 0px'
        });

        sectionObserver.observe(this.section);

        const stageObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                this.section.classList.add('is-stage-visible');
                stageObserver.unobserve(entry.target);
            });
        }, {
            threshold: 0.12,
            rootMargin: '0px 0px 0px 0px'
        });

        stageObserver.observe(this.stage);
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

    const target = document.querySelector(targetSelector);
    if (!target) {
        return;
    }

    const navbar = document.querySelector('.navbar');
    const navOffset = navbar ? navbar.offsetHeight + 14 : 0;
    let anchor = target;
    let extraOffset = 0;
    let topOverride = null;

    const featuredDestinationsTargetDepth = -12;

    if (targetSelector === '#featured-destinations') {
        const curatedStage = target.querySelector('#curatedWatersStage');
        if (curatedStage) {
            anchor = curatedStage;
            extraOffset = 26;
        }
        // 精选目的地真正的视觉入口在舞台本身，不在 section 标题顶端。

        const diveMatchSection = document.querySelector('#dive-match');
        if (diveMatchSection) {
            const featuredThreshold = Math.max(
                0,
                target.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.42
            );
            const diveMatchThreshold = Math.max(
                0,
                diveMatchSection.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.42
            );
            const depthTwelveRatio = 0.5;
            topOverride = featuredThreshold + ((diveMatchThreshold - featuredThreshold) * depthTwelveRatio);
        }
        // 这里不是简单滚到 featured 顶部，而是取它和下一层潜水匹配之间的中间落点，
        // 让深度计更自然地停在“约 -12m”附近的层次上。
    } else if (targetSelector === '#dive-match') {
        const diveMatchStage = target.querySelector('#diveMatchStage');
        if (diveMatchStage) {
            anchor = diveMatchStage;
            extraOffset = 18;
        }
    }

    const anchorTop = anchor.getBoundingClientRect().top + window.scrollY;
    const top = topOverride !== null
        ? Math.max(0, topOverride)
        : Math.max(0, anchorTop - navOffset - extraOffset);

    if (window.OceanScroll && typeof window.OceanScroll.animateTo === 'function') {
        window.OceanScroll.animateTo(top, { duration: 1520 }).then(() => {
            if (
                targetSelector !== '#featured-destinations' ||
                !window.DepthManager ||
                typeof window.DepthManager.finishDepth !== 'function'
            ) {
                return;
            }

            const currentScrollY = window.scrollY || window.pageYOffset || 0;
            if (Math.abs(currentScrollY - top) > 12) {
                return;
            }

            // “目的地”这一条链路需要稳定停在 12m。
            // 这里在滚动完成后再做一次轻量兜底，避免由于首页滚动阻尼或取整显示，
            // 最终肉眼看到的仍然偏在 11m。
            window.DepthManager.finishDepth(featuredDestinationsTargetDepth);
        });
        return;
    }

    window.scrollTo(0, top);

    if (
        targetSelector === '#featured-destinations' &&
        window.DepthManager &&
        typeof window.DepthManager.finishDepth === 'function'
    ) {
        window.DepthManager.finishDepth(featuredDestinationsTargetDepth);
    }
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

    let rafId = 0;

    const updateNavState = () => {
        rafId = 0;

        const navOffset = (navbar ? navbar.offsetHeight : 70) + 18;
        const probeY = (window.scrollY || window.pageYOffset || 0) + navOffset + Math.min(window.innerHeight * 0.24, 220);

        const featuredAnchor = featuredSection.querySelector('#curatedWatersStage') || featuredSection;
        const featuredTop = featuredAnchor.getBoundingClientRect().top + window.scrollY - navOffset;
        const storyTop = storySection.getBoundingClientRect().top + window.scrollY - navOffset;

        if (probeY >= storyTop - 24) {
            setHomeActiveNavLink(storyLink);
            return;
        }

        if (probeY >= featuredTop - 24) {
            setHomeActiveNavLink(destinationsLink);
            return;
        }

        setHomeActiveNavLink(homeLink);
    };

    const queueUpdate = () => {
        if (rafId) {
            return;
        }

        rafId = window.requestAnimationFrame(updateNavState);
    };

    window.addEventListener('scroll', queueUpdate, { passive: true });
    window.addEventListener('resize', queueUpdate);
    window.setTimeout(updateNavState, 60);
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
            }, { shouldReset: false, callbackDelay: 300 });
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
            }, { shouldReset: false, callbackDelay: 300 });
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
                window.OceanScroll.animateTo(0, { duration: 1900 });
                return;
            }

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
    const resizeHandles = Array.from(document.querySelectorAll('.hero-hotspots-resize-handle'));
    if (!heroHotspotsStageShell || !resizeHandles.length) {
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
    const revealItems = document.querySelectorAll('.story-reveal');
    if (revealItems.length === 0) {
        return;
    }

    if (!('IntersectionObserver' in window)) {
        revealItems.forEach((item) => item.classList.add('is-visible'));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        });
    }, {
        threshold: 0.18,
        rootMargin: '0px 0px -8% 0px'
    });

    revealItems.forEach((item) => observer.observe(item));
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
        this.updateRaf = 0;

        if (this.guide && this.trigger && this.panel && this.entries.length) {
            this.init();
        }
    }

    /**
     * getOffset() - 计算首页海图导览滚动时需要避开的固定导航栏高度
     * @returns {number} - 供滚动定位使用的顶部偏移量
     */
    getOffset() {
        const navbar = document.querySelector('.navbar');
        return (navbar ? navbar.offsetHeight : 72) + 18;
    }

    /**
     * getProbeTarget(selector) - 获取用于判断当前所在 section 的实际锚点元素
     * @param {string} selector - 海图导览条目指向的 section 选择器
     * @returns {Element|null} - 用于高亮判断的 DOM 元素
     */
    getProbeTarget(selector) {
        const target = selector ? document.querySelector(selector) : null;
        if (!target) {
            return null;
        }

        if (selector === '#featured-destinations') {
            return target.querySelector('#curatedWatersStage') || target;
        }

        if (selector === '#dive-match') {
            return target.querySelector('#diveMatchStage') || target;
        }

        if (selector === '#homeFooter') {
            return target.querySelector('.footer-shell') || target;
        }

        return target;
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

        const probeY = window.scrollY + this.getOffset() + Math.min(window.innerHeight * 0.24, 220);
        let currentKey = this.entries[0].dataset.key || '';

        this.entries.forEach((entry) => {
            const target = this.getProbeTarget(entry.dataset.target);
            if (!target) {
                return;
            }

            const sectionTop = target.getBoundingClientRect().top + window.scrollY - this.getOffset();
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
     * init() - 绑定首页海图导览的展开、关闭、滚动同步和点击跳转逻辑
     * @returns {void} - 无返回值，直接注册首页海图导览事件
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

        window.addEventListener('scroll', requestStateUpdate, { passive: true });
        window.addEventListener('resize', requestStateUpdate);
        window.setTimeout(() => this.updateState(), 80);
    }
}

// 页面初始化：创建首页主要组件，并绑定头像退出、首屏、故事区等交互。
/**
 * document DOMContentLoaded 回调 - 初始化首页的主要组件和页面级交互
 * @returns {void} - 无返回值，直接启动首页逻辑
 */
document.addEventListener('DOMContentLoaded', function () {
    setupStageDebugToggle();
    new BambooScroll();
    new CuratedWatersStage();
    new DiveMatchStage();
    new HomeSeaGuide();
    setupHeroImmersion();
    setupHeroHotspotsStageResize();
    setupHeroActions();
    setupHomeNavState();
    setupHomeScrollLinks();
    consumePendingHomeScrollTarget();
    setupStoryReveal();

    window.YanqiAvatarReturn?.bind({
        targetUrl: 'index.html'
    });
});




