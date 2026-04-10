/* ============================================
   详情页脚本逻辑 - detail.js
   ============================================
   职责：
   1. 驱动详情页首屏、套餐、评论、地图、推荐与反馈层的整体交互。
   2. 管理海域数据渲染、价格展示、详情页内切换和套餐确认流程。
   3. 把“进入一片海”这件事收成一套完整的页面体验。
   阅读顺序：
   1. 价格与文本工具
   2. 海域数据
   3. `DetailPage` 类
   4. 页面初始化与跨页联动
*/
// 共享价格配置：详情页与首页共用同一套人民币展示规则。
const sharedPriceTools = window.YanqiPriceConfig || null;
const PRICE_DISPLAY_VERSION = sharedPriceTools?.PRICE_DISPLAY_VERSION || '';
const STAGE_DEBUG_STORAGE_KEY = 'YANQI_STAGE_DEBUG_MODE';
const STAGE_DEBUG_QUERY_KEY = 'stageDebug';
const PACKAGE_MODAL_DURATION_MIN_DAYS = 2;
const PACKAGE_MODAL_PRESET_DURATION_MAX_DAYS = 6;
const PACKAGE_MODAL_CUSTOM_DURATION_MAX_DAYS = 12;

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

// 价格工具：负责从原始价格文本里提取数值，并统一转换为当前展示货币格式。
/**
 * extractCurrencyAmount(priceText) - 从价格文本中提取数值部分
 * @param {string} priceText - 原始价格文本
 * @returns {number} - 提取后的金额数值
 */
function extractCurrencyAmount(priceText) {
    return sharedPriceTools && typeof sharedPriceTools.extractCurrencyAmount === 'function'
        ? sharedPriceTools.extractCurrencyAmount(priceText)
        : 0;
}

/**
 * formatDisplayPriceValue(value) - 把金额数值格式化为人民币文本
 * @param {number} value - 需要格式化的金额
 * @returns {string} - 人民币格式价格字符串
 */
function formatDisplayPriceValue(value) {
    return sharedPriceTools && typeof sharedPriceTools.formatPrice === 'function'
        ? sharedPriceTools.formatPrice(value)
        : `¥${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('zh-CN')}`;
}

/**
 * normalizeDisplayPriceText(priceText) - 将原始价格文本整理为共享人民币价格文本
 * @param {string} priceText - 原始价格文本
 * @returns {string} - 转换后的人民币价格文本
 */
function normalizeDisplayPriceText(priceText) {
    return sharedPriceTools && typeof sharedPriceTools.normalizePriceText === 'function'
        ? sharedPriceTools.normalizePriceText(priceText)
        : String(priceText || '');
}

/**
 * getSpotBasePriceText(spotId, fallbackPriceText) - 获取详情页当前海域的统一起价文本
 * @param {number|string} spotId - 潜点 id
 * @param {string} fallbackPriceText - 兜底价格文本
 * @returns {string} - 当前海域起价文本
 */
function getSpotBasePriceText(spotId, fallbackPriceText) {
    return sharedPriceTools && typeof sharedPriceTools.getDestinationPriceText === 'function'
        ? sharedPriceTools.getDestinationPriceText(spotId, fallbackPriceText)
        : normalizeDisplayPriceText(fallbackPriceText);
}

/**
 * convertSpotPriceDisplay(spots) - 批量转换潜点数据中的价格展示字段
 * @param {Object} spots - 原始潜点数据对象
 * @returns {Object} - 转换后的潜点数据对象
 */
function convertSpotPriceDisplay(spots) {
    return Object.fromEntries(
        Object.entries(spots).map(([spotId, spot]) => [
            spotId,
            {
                ...spot,
                priceFrom: getSpotBasePriceText(spotId, spot.priceFrom),
                itineraries: Array.isArray(spot.itineraries)
                    ? spot.itineraries.map((item) => ({
                        ...item,
                        price: normalizeDisplayPriceText(item.price)
                    }))
                    : [],
                related: Array.isArray(spot.related)
                    ? spot.related.map((item) => ({
                        ...item,
                        price: getSpotBasePriceText(item.id, item.price)
                    }))
                    : []
            }
        ])
    );
}

/**
 * escapeHtml(value) - 转义文本内容，避免动态字符串写回模板时破坏结构
 * @param {*} value - 任意原始值
 * @returns {string} - 可安全插入 HTML 的字符串
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
 * createBufferedLiveAnnouncer(target, delay) - 为详情页动态区域创建合并摘要播报器
 * @param {HTMLElement|null} target - 隐藏 live 区域节点
 * @param {number} delay - 合并等待时长
 * @returns {(message: string) => void} - 可重复调用的播报函数
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
 * scheduleIdleTask(callback, timeout) - 在空闲时机安排轻量后置任务，并提供取消句柄
 * @param {Function} callback - 需要执行的回调
 * @param {number} timeout - 最长等待时长
 * @returns {() => void} - 取消当前空闲任务的函数
 */
function scheduleIdleTask(callback, timeout = 1200) {
    if (typeof callback !== 'function') {
        return () => {};
    }

    let settled = false;
    let idleId = 0;
    let timerId = 0;

    const finish = () => {
        if (settled) {
            return;
        }

        settled = true;
        callback();
    };

    if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(finish, {
            timeout: Math.max(0, Math.round(timeout) || 0)
        });
    } else {
        timerId = window.setTimeout(finish, Math.min(Math.max(0, Math.round(timeout) || 0), 640));
    }

    return () => {
        settled = true;
        if (idleId && 'cancelIdleCallback' in window) {
            window.cancelIdleCallback(idleId);
        }
        if (timerId) {
            window.clearTimeout(timerId);
        }
    };
}

/**
 * createDeferredSectionBootstrap(target, bootstrap, options) - 把详情页非首屏区块延后到接近视口时再真正渲染
 * @param {Element|null} target - 需要监听的区块锚点
 * @param {Function} bootstrap - 真正执行渲染的函数
 * @param {{ immediate?: boolean, rootMargin?: string, threshold?: number|number[], enableIdleBootstrap?: boolean, idleTimeoutMs?: number|null }} options - 触发配置
 * @returns {{ run: Function, destroy: Function }} - 手动触发和销毁句柄
 */
function createDeferredSectionBootstrap(target, bootstrap, options = {}) {
    const {
        immediate = false,
        rootMargin = '0px 0px 24% 0px',
        threshold = 0.01,
        enableIdleBootstrap = false,
        idleTimeoutMs = 0
    } = options;

    let settled = false;
    let observer = null;
    let cancelIdle = () => {};

    const cleanup = () => {
        observer?.disconnect();
        observer = null;
        cancelIdle();
        cancelIdle = () => {};
    };

    const run = () => {
        if (settled) {
            return false;
        }

        settled = true;
        cleanup();
        bootstrap();
        return true;
    };

    const destroy = () => {
        settled = true;
        cleanup();
    };

    if (!target) {
        run();
        return { run, destroy };
    }

    if (immediate) {
        run();
        return { run, destroy };
    }

    if (enableIdleBootstrap && idleTimeoutMs !== null) {
        cancelIdle = scheduleIdleTask(run, idleTimeoutMs);
    }

    if (!('IntersectionObserver' in window)) {
        run();
        return { run, destroy };
    }

    observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
            run();
        }
    }, {
        rootMargin,
        threshold
    });
    observer.observe(target);

    return { run, destroy };
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

// 潜点主数据：这里集中定义每个潜点的文案、图片、套餐、评论与相关推荐信息。
const divingSpotDetails = convertSpotPriceDisplay({
    1: {
        name: '诗巴丹',
        tagline: '鱼群会先靠近，海墙随后把整片蓝慢慢放深。',
        image: 'assets/images/sipadan.jpg',
        difficulty: '需要流潜经验',
        depth: '5-40m',
        season: '3-10月',
        priceFrom: '¥3,980',
        mapLocation: '马来西亚沙巴州 · 诗巴丹',
        coordinates: '北纬 4.2°, 东经 118.6°',
        features: {
            location: '诗巴丹位于马来西亚沙巴州外海，坐落在苏禄海深蓝水域之中。这里以陡降海墙、强劲流场和高密度的大型鱼群著称，是许多潜水员心中的朝圣潜点。',
            wildlife: [
                '黑鳍礁鲨、白鳍礁鲨与杰克风暴',
                '绿海龟、玳瑁海龟与鹰鳐',
                '梭鱼风暴与大群隆头鹦哥鱼',
                '海狼、笛鲷、拿破仑与大型石斑',
                '软珊瑚与陡峭海墙上的丰富附着生物'
            ],
            warnings: [
                '洋流变化明显，建议拥有进阶开放水域及以上经验',
                '热门潜点需要提早预约名额，旺季更紧张',
                '海墙潜水深度变化快，需严格控制中性浮力',
                '注意补水和防晒，船程较长时建议备好晕船药'
            ],
            weather: {
                season: '3月-10月',
                temperature: '26-28°C',
                visibility: '15-30米'
            }
        },
        itineraries: [
            {
                name: '3天2晚经典流潜',
                includes: '2次主潜点流潜 + 1次黄昏潜 + 中文向导 + 船上午餐',
                price: '¥3,980'
            },
            {
                name: '5天4晚海狼风暴线',
                includes: '5次核心潜点 + 2次深潜 + 装备协助 + 全程住宿接驳',
                price: '¥6,980'
            },
            {
                name: '7天6晚深蓝进阶营',
                includes: '7次日潜 + 2次夜潜 + 高氧支持 + 海墙技巧训练',
                price: '¥9,280'
            }
        ],
        reviews: [
            {
                user: '海流追踪者',
                rating: '★★★★★',
                date: '2026-01-18',
                text: '第一次在诗巴丹看到梭鱼风暴，整片海水都像在旋转，冲击力非常强。向导对流向判断很准，整趟潜得又稳又过瘾。'
            },
            {
                user: '深蓝旅人',
                rating: '★★★★★',
                date: '2025-12-06',
                text: '海龟数量远超预期，海墙也非常壮观。这里的重点不是慢悠悠拍照，而是投入那种被鱼群包围的气势。'
            },
            {
                user: '盐线记录员',
                rating: '★★★★☆',
                date: '2025-11-22',
                text: '强流确实比一般热带海岛更考验经验，但也正因为这样，整片海域的生命力非常高，值得专门来一次。'
            }
        ],
        related: [
            {
                id: 2,
                name: '帕劳',
                description: '蓝洞、断层与外海光线，会把层次慢慢推开。',
                image: 'assets/images/palau.jpg',
                price: '¥4,280'
            },
            {
                id: 3,
                name: '大蓝洞',
                description: '伯利兹的深蓝之眼，垂直洞穴地貌震撼。',
                image: 'assets/images/blue-hole.jpg',
                price: '¥5,680'
            },
            {
                id: 4,
                name: '帝汶岛',
                description: '珊瑚花园和大坡度海底地形并存，层次丰富。',
                image: 'assets/images/timor-hero.jpg',
                price: '¥3,480'
            }
        ]
    },
    2: {
        name: '帕劳',
        tagline: '让光线、断层与洋流在同一片蓝里慢慢排开。',
        image: 'assets/images/palau.jpg',
        difficulty: '适合已有外海经验',
        depth: '8-35m',
        season: '11月-次年5月',
        priceFrom: '¥4,280',
        mapLocation: '帕劳共和国 · 科罗尔外海',
        coordinates: '北纬 7.3°, 东经 134.5°',
        features: {
            location: '帕劳由众多石灰岩岛屿和外海平台组成，蓝洞、蓝角、大断层等经典潜点分布集中，适合连续多天深度探索。',
            wildlife: [
                '灰礁鲨、白鳍鲨与成群梭鱼',
                '海龟、鹰鳐和大群笛鲷',
                '蓝角常见巨型拿破仑与金枪鱼巡游',
                '蓝洞光柱中可见玻璃鱼与清洁虾',
                '珊瑚台地上软珊瑚与海扇茂盛'
            ],
            warnings: [
                '外海流场强弱变化快，需听从船宿和向导节奏',
                '蓝洞与洞穴地形对下潜节奏和耳压平衡要求较高',
                '拍摄光柱时容易分心，注意队伍距离',
                '部分潜点出水需放流，务必确认 SMB 使用方法'
            ],
            weather: {
                season: '11月-次年5月',
                temperature: '27-29°C',
                visibility: '20-35米'
            }
        },
        itineraries: [
            {
                name: '4天3晚蓝洞经典线',
                includes: '蓝洞 + 蓝角 + 大断层 + 中文向导 + 船上简餐',
                price: '¥4,280'
            },
            {
                name: '6天5晚洋流巡航',
                includes: '6次核心潜点 + 2次漂流潜 + 珊瑚台地拍摄支持',
                price: '¥7,180'
            },
            {
                name: '8天7晚帕劳全景深潜',
                includes: '8次日潜 + 蓝洞专题 + 水下摄影陪潜 + 住宿接送',
                price: '¥10,380'
            }
        ],
        reviews: [
            {
                user: '蓝门观察者',
                rating: '★★★★★',
                date: '2026-02-03',
                text: '蓝洞的光柱像舞台灯光一样从头顶打下来，出洞后直接接上蓝角的鱼群，节奏非常完整。'
            },
            {
                user: '海风校准员',
                rating: '★★★★☆',
                date: '2025-12-18',
                text: '帕劳很适合已经有几次外海经验的潜水员，既能看景，也能体验流潜的速度感。'
            },
            {
                user: '礁墙写作者',
                rating: '★★★★★',
                date: '2025-10-29',
                text: '大断层层次分明，视野特别开阔，向导也很会带位置，几次转身都能撞上惊喜。'
            }
        ],
        related: [
            {
                id: 1,
                name: '诗巴丹',
                description: '海狼风暴密度惊人，是典型的大鱼潜点。',
                image: 'assets/images/sipadan.jpg',
                price: '¥3,980'
            },
            {
                id: 3,
                name: '大蓝洞',
                description: '如果喜欢洞穴感和垂直深井，大蓝洞更极致。',
                image: 'assets/images/blue-hole.jpg',
                price: '¥5,680'
            },
            {
                id: 7,
                name: '科莫多',
                description: '同样是流潜胜地，但地形和鱼群风格完全不同。',
                image: 'assets/images/komodo-hero.jpg',
                price: '¥3,880'
            }
        ]
    },
    3: {
        name: '大蓝洞',
        tagline: '像从海面缓慢下望，看到一口更深的蓝在安静张开。',
        image: 'assets/images/blue-hole.jpg',
        difficulty: '适合深潜与结构观察',
        depth: '18-40m',
        season: '4月-6月',
        priceFrom: '¥5,680',
        mapLocation: '伯利兹外海 · 大蓝洞',
        coordinates: '北纬 17.3°, 西经 87.5°',
        features: {
            location: '大蓝洞位于伯利兹外海，是一个近乎完美的圆形海底塌陷结构。它以深邃的蓝色井口和巨大的钟乳石洞顶闻名，是经典的世界级地标潜点。',
            wildlife: [
                '加勒比礁鲨、护士鲨与大型梭鱼',
                '洞壁附近常见银鱼和玻璃鱼群',
                '外围珊瑚环礁有鹰鳐和海龟巡游',
                '回程常能遇见海豚或飞鱼',
                '环礁浅区的珊瑚和海扇保存良好'
            ],
            warnings: [
                '整体偏深，适合有深潜经验的潜水员',
                '大蓝洞重点在地貌体验，不是高密度生物型潜点',
                '下潜和返程时间控制严格，需精确管理气体',
                '长航程出海较常见，建议准备防晒与晕船药'
            ],
            weather: {
                season: '4月-6月',
                temperature: '26-28°C',
                visibility: '25-40米'
            }
        },
        itineraries: [
            {
                name: '3天2晚蓝洞首潜',
                includes: '大蓝洞 + 灯塔礁 + 半月岛 + 资深向导',
                price: '¥5,680'
            },
            {
                name: '5天4晚深井结构线',
                includes: '蓝洞双潜 + 环礁外墙 + 洞顶地形讲解 + 住宿早餐',
                price: '¥8,480'
            },
            {
                name: '7天6晚伯利兹大环礁',
                includes: '蓝洞专题 + 7次日潜 + 摄影位点优化 + 机场接送',
                price: '¥11,680'
            }
        ],
        reviews: [
            {
                user: '深井记录员',
                rating: '★★★★★',
                date: '2026-01-09',
                text: '从海面看像一块纯色宝石，下去以后则像进入了另一种地质空间，洞顶结构非常震撼。'
            },
            {
                user: '蓝洞边缘人',
                rating: '★★★★☆',
                date: '2025-12-01',
                text: '这里不是那种鱼群炸裂的路线，但地形体验独一无二，尤其适合把深潜当作一次仪式来完成。'
            },
            {
                user: '环礁回声',
                rating: '★★★★★',
                date: '2025-09-14',
                text: '外围珊瑚环礁和蓝洞主体形成强烈反差，一趟出海里能同时收获热带色彩和深蓝压迫感。'
            }
        ],
        related: [
            {
                id: 2,
                name: '帕劳',
                description: '同样兼具洞穴与外海，但帕劳更强调洋流和大景。',
                image: 'assets/images/palau.jpg',
                price: '¥4,280'
            },
            {
                id: 6,
                name: '布纳肯',
                description: '如果想从地貌压迫感切回墙潜、海龟和更明亮的蓝水，布纳肯会更舒展。',
                image: 'assets/images/bunaken.jpg',
                price: '¥3,680'
            },
            {
                id: 8,
                name: '图阿莫图',
                description: '同样拥有开阔蓝水，但风格更偏环礁通道和鲨鱼。',
                image: 'assets/images/tuamotu.jpg',
                price: '¥4,180'
            }
        ]
    },
    4: {
        name: '帝汶岛',
        tagline: '光线落在珊瑚坡地上，整片海会显得更舒展一些。',
        image: 'assets/images/timor-hero.jpg',
        difficulty: '适合慢慢进入',
        depth: '6-32m',
        season: '4月-11月',
        priceFrom: '¥3,480',
        mapLocation: '印度尼西亚 · 帝汶岛',
        coordinates: '南纬 10.2°, 东经 123.6°',
        features: {
            location: '帝汶岛位于印度尼西亚东努沙登加拉群岛，岸潜和船潜资源都很丰富。这里的海底坡地连绵，珊瑚覆盖度高，整体节奏更从容，适合长时间停留。',
            wildlife: [
                '海龟、海蛇和礁栖石斑',
                '微距爱好者常见裸鳃、海蛞蝓和小型甲壳类',
                '浅区珊瑚花园中鱼群密度高',
                '外坡偶尔可见鹰鳐与金枪鱼巡游',
                '夜潜经常有章鱼和螳螂虾活动'
            ],
            warnings: [
                '部分岸潜入口为碎石或珊瑚沙，需留意脚下',
                '雨季能见度波动较大，行程建议避开高降雨周',
                '长时间微距拍摄容易忽略用气，需定期互相确认',
                '部分海岸线补给点较少，建议提前准备个人用品'
            ],
            weather: {
                season: '4月-11月',
                temperature: '27-29°C',
                visibility: '12-25米'
            }
        },
        itineraries: [
            {
                name: '3天2晚珊瑚花园线',
                includes: '岸潜 + 浅坡珊瑚带 + 夜潜体验 + 酒店接送',
                price: '¥3,480'
            },
            {
                name: '5天4晚微距巡礼',
                includes: '5次精选潜点 + 微距向导 + 夜潜一次 + 装备冲洗服务',
                price: '¥5,480'
            },
            {
                name: '7天6晚帝汶慢潜假期',
                includes: '7次日潜 + 2次夜潜 + 海岸拍摄日 + 住宿早餐',
                price: '¥7,980'
            }
        ],
        reviews: [
            {
                user: '珊瑚花园巡航员',
                rating: '★★★★★',
                date: '2026-01-27',
                text: '先看见阿陶罗的岛影，再慢慢下到珊瑚坡地里，帝汶的节奏会比很多地方更从容，也更适合把时间放长。'
            },
            {
                user: '夜潜观察笔记',
                rating: '★★★★☆',
                date: '2025-11-19',
                text: '白天看坡地和珊瑚，傍晚回到帝力海边再看一会儿风和水色，整趟行程会有一种慢慢收住的完整感。'
            },
            {
                user: '浅坡漫游者',
                rating: '★★★★★',
                date: '2025-09-02',
                text: 'One Dollar Beach 一带的海岸线和清亮浅水很适合留白，不会一直催着你赶潜点，这点特别难得。'
            }
        ],
        related: [
            {
                id: 5,
                name: '波纳佩岛',
                description: '同样适合慢潜和生态观察，但生物类型更偏微观。',
                image: 'assets/images/pohnpei.jpg',
                price: '¥2,980'
            },
            {
                id: 7,
                name: '科莫多',
                description: '如果想从珊瑚花园切换到高能流潜，可以接科莫多。',
                image: 'assets/images/komodo-hero.jpg',
                price: '¥3,880'
            },
            {
                id: 8,
                name: '图阿莫图',
                description: '图阿莫图更偏开阔蓝水和环礁通道，风格差异明显。',
                image: 'assets/images/tuamotu.jpg',
                price: '¥4,180'
            }
        ]
    },
    5: {
        name: '波纳佩岛',
        tagline: '把注意力收回来以后，细小生命会一层层慢慢浮出来。',
        image: 'assets/images/pohnpei.jpg',
        difficulty: '适合恢复状态',
        depth: '5-24m',
        season: '全年适宜',
        priceFrom: '¥2,980',
        mapLocation: '密克罗尼西亚 · 波纳佩岛',
        coordinates: '北纬 6.9°, 东经 158.2°',
        features: {
            location: '波纳佩岛被热带雨林和环礁包围，海况通常较柔和。这里不以刺激的外海流潜见长，而以微距生态、软珊瑚和轻松的潜水节奏吸引人。',
            wildlife: [
                '海马、鬼龙、裸鳃和豆丁甲壳类',
                '软珊瑚平台上常见幼鱼和清洁站行为',
                '礁区可见小型鳐鱼、海蛇和乌贼',
                '夜潜时常有荧光生物和小型章鱼',
                '浅区海草床中容易遇见海兔与海蛞蝓'
            ],
            warnings: [
                '能见度不追求极致，更适合微距和慢节奏观察',
                '拍摄微距时要留意身体姿态，避免踢起底沙',
                '雨量大时部分岸线出海会受天气影响',
                '虽然整体节奏更轻，仍需注意潜后补水和休息'
            ],
            weather: {
                season: '全年适宜',
                temperature: '27-29°C',
                visibility: '8-18米'
            }
        },
        itineraries: [
            {
                name: '3天2晚微距入门线',
                includes: '3次轻松潜水 + 微距引导 + 夜潜一次 + 岸上简餐',
                price: '¥2,980'
            },
            {
                name: '5天4晚生态观察营',
                includes: '5次日潜 + 2次微距专题潜 + 摄影灯位建议',
                price: '¥4,580'
            },
            {
                name: '7天6晚慢潜记录周',
                includes: '7次潜水 + 夜潜两次 + 生物观察笔记 + 住宿接送',
                price: '¥6,380'
            }
        ],
        reviews: [
            {
                user: '云层下面',
                rating: '★★★★★',
                date: '2026-02-11',
                text: '飞进波纳佩时先看见的是泻湖、礁线和低云，整座岛像被几层海色慢慢托住。'
            },
            {
                user: '岸上还有水声',
                rating: '★★★★☆',
                date: '2025-12-27',
                text: '喜欢它不只是一片潜点，红树林、雨林和南马都把整趟行程继续往更深的地方带。'
            },
            {
                user: '静水记录本',
                rating: '★★★★★',
                date: '2025-10-08',
                text: '这里不是靠刺激取胜的海，而是会让呼吸、低云和慢潜节奏一起慢下来的地方。'
            }
        ],
        related: [
            {
                id: 4,
                name: '帝汶岛',
                description: '同样适合慢潜，但帝汶的坡地和珊瑚覆盖更宏观。',
                image: 'assets/images/timor-hero.jpg',
                price: '¥3,480'
            },
            {
                id: 6,
                name: '布纳肯',
                description: '从微距和慢潜切到海墙、海龟和更开阔的蓝水，是很自然的下一站。',
                image: 'assets/images/bunaken.jpg',
                price: '¥3,680'
            },
            {
                id: 8,
                name: '图阿莫图',
                description: '如果想从静水观察切换到开阔蓝水，可以去图阿莫图。',
                image: 'assets/images/tuamotu.jpg',
                price: '¥4,180'
            }
        ]
    },
    6: {
        name: '布纳肯',
        tagline: '海墙、海龟与清澈蓝水之间，保持刚好的安静',
        image: 'assets/images/bunaken.jpg',
        difficulty: '适合长线观察',
        depth: '6-30m',
        season: '3月-11月',
        priceFrom: '¥3,680',
        mapLocation: '印度尼西亚 · 布纳肯海洋公园',
        coordinates: '北纬 1.6°, 东经 124.8°',
        features: {
            location: '布纳肯位于印度尼西亚北苏拉威西外海，以能见度稳定的海墙、层次鲜明的礁坡和相对从容的热带节奏著称。这里不是最猛烈的海，却很容易让人一潜就慢下来。',
            wildlife: [
                '海墙沿线常见海龟停留、巡游与进食',
                '礁坡与蓝水交界处可见成群笛鲷、鲹鱼与金枪鱼',
                '软珊瑚、海扇与桶状海绵分布密集',
                '浅区珊瑚平台适合慢慢观察礁鱼和小型生物',
                '天气稳定时外侧蓝水区域常有更开阔的远景感'
            ],
            warnings: [
                '海墙边缘深度变化快，拍照时要特别留意中性浮力',
                '部分点位会有中等流速，入水前需明确集合与出水方式',
                '蓝水参照物较少，下潜中要持续关注队友距离',
                '阳光较强时表层温差明显，长时间船潜建议备好防晒与补水'
            ],
            weather: {
                season: '3月-11月',
                temperature: '27-29°C',
                visibility: '18-32米'
            }
        },
        itineraries: [
            {
                name: '4天3晚海墙初见线',
                includes: '4次经典海墙潜水 + 海龟观察位点 + 中文向导 + 船上午餐',
                price: '¥3,680'
            },
            {
                name: '6天5晚布纳肯主线',
                includes: '6次精选潜点 + 2次日落潜 + 海墙摄影支持 + 接送安排',
                price: '¥5,980'
            },
            {
                name: '8天7晚北苏拉威西慢潜周',
                includes: '8次日潜 + 海龟主题位点 + 珊瑚坡地慢潜 + 住宿接驳',
                price: '¥8,680'
            }
        ],
        reviews: [
            {
                user: '海墙停留者',
                rating: '★★★★★',
                date: '2026-01-12',
                text: '布纳肯很容易让人先记住岸边的小船和很静的清水，真正下到海墙外侧以后，那种通透的蓝才慢慢完全展开。'
            },
            {
                user: '海龟观察席',
                rating: '★★★★★',
                date: '2025-11-30',
                text: '海墙外侧的珊瑚层次很完整，不是一直在追刺激，而是会让你把呼吸、光线和鱼都慢慢看清楚。'
            },
            {
                user: '蓝水边界线',
                rating: '★★★★☆',
                date: '2025-10-21',
                text: '潜后回到岛上，沙滩、山体和海风会把整天重新接住。布纳肯最难得的，其实就是这种水下和岸上都很顺的平衡。'
            }
        ],
        related: [
            {
                id: 3,
                name: '大蓝洞',
                description: '如果想从舒展的海墙切到更垂直、更克制的深蓝结构，可以去大蓝洞。',
                image: 'assets/images/blue-hole.jpg',
                price: '¥5,680'
            },
            {
                id: 5,
                name: '波纳佩岛',
                description: '如果想把节奏再放慢一点，波纳佩岛会更偏向微距与静水观察。',
                image: 'assets/images/pohnpei.jpg',
                price: '¥2,980'
            },
            {
                id: 7,
                name: '科莫多',
                description: '如果想从布纳肯继续转向更强洋流和大景流潜，科莫多是自然延伸。',
                image: 'assets/images/komodo-hero.jpg',
                price: '¥3,880'
            }
        ]
    },
    7: {
        name: '科莫多',
        tagline: '流会更明显一些，大景与停顿也因此更有层次。',
        image: 'assets/images/komodo-hero.jpg',
        difficulty: '需要洋流适应',
        depth: '8-34m',
        season: '4月-11月',
        priceFrom: '¥3,880',
        mapLocation: '印度尼西亚 · 科莫多国家公园',
        coordinates: '南纬 8.6°, 东经 119.5°',
        features: {
            location: '科莫多国家公园位于印度尼西亚小巽他群岛之间，冷热海流交汇，带来高生产力和极强的海洋层次，是典型的流潜和大景型潜区。',
            wildlife: [
                '蝠鲼清洁站、礁鲨和大型梭鱼群',
                '大量笛鲷、鲹鱼和金枪鱼巡游',
                '珊瑚坡地上常见海蛞蝓和小型礁鱼',
                '运气好时可遇见海豚和鲸鲨过路',
                '软珊瑚、海扇和火珊瑚色彩鲜明'
            ],
            warnings: [
                '流速变化快，下潜前必须明确集合与出水方式',
                '部分潜点水温分层明显，建议准备适当防寒配置',
                '蝠鲼清洁站禁止追逐和压低高度',
                '拍摄和看大鱼时容易忽略队友距离，需持续观察'
            ],
            weather: {
                season: '4月-11月',
                temperature: '25-28°C',
                visibility: '15-28米'
            }
        },
        itineraries: [
            {
                name: '4天3晚蝠鲼追踪线',
                includes: '蝠鲼清洁站 + 经典流潜 + 中文向导 + 午餐补给',
                price: '¥3,880'
            },
            {
                name: '6天5晚科莫多主线',
                includes: '6次核心潜点 + 2次放流潜 + 海面观景行程',
                price: '¥6,280'
            },
            {
                name: '8天7晚国家公园全景',
                includes: '8次日潜 + 蝠鲼专题 + 岛上徒步 + 住宿接送',
                price: '¥8,980'
            }
        ],
        reviews: [
            {
                user: '流线捕捉者',
                rating: '★★★★★',
                date: '2026-02-07',
                text: '粉沙岸和亮蓝海水会先把科莫多点亮，真正进入流区以后，那种张力才会慢慢从海面以下推上来。'
            },
            {
                user: '蝠鲼旁观席',
                rating: '★★★★★',
                date: '2025-12-14',
                text: '船在干燥山体和开阔水道之间穿过去时，就已经能感到这片海的力量感。它不是急，而是一直在流动。'
            },
            {
                user: '热流边界线',
                rating: '★★★★☆',
                date: '2025-09-26',
                text: '回到拉布安巴霍的傍晚也很难忘，港湾、屋顶和停船的光一起把这片海收住，让科莫多不只剩下“强流”两个字。'
            }
        ],
        related: [
            {
                id: 2,
                name: '帕劳',
                description: '同样强调洋流和大景，但帕劳更偏洞穴与断层。',
                image: 'assets/images/palau.jpg',
                price: '¥4,280'
            },
            {
                id: 4,
                name: '帝汶岛',
                description: '想把节奏放慢时，帝汶岛会更舒服。',
                image: 'assets/images/timor-hero.jpg',
                price: '¥3,480'
            },
            {
                id: 8,
                name: '图阿莫图',
                description: '图阿莫图同样有强流和大鱼，但更偏环礁通道。',
                image: 'assets/images/tuamotu.jpg',
                price: '¥4,180'
            }
        ]
    },
    8: {
        name: '图阿莫图',
        tagline: '环礁通道把开阔蓝水一点点推近，张力却始终安静。',
        image: 'assets/images/tuamotu.jpg',
        difficulty: '适合通道与蓝水经验',
        depth: '10-32m',
        season: '5月-10月',
        priceFrom: '¥4,180',
        mapLocation: '法属波利尼西亚 · 图阿莫图群岛',
        coordinates: '南纬 16.1°, 西经 145.0°',
        features: {
            location: '图阿莫图由大量环礁组成，通道潜水是这里的核心魅力。潮汐带来的进出水流推动大鱼与鲨群活动，也让整片蓝水空间格外开阔。',
            wildlife: [
                '灰礁鲨、白鳍鲨与柠檬鲨',
                '海豚、金枪鱼和大型鲹鱼',
                '环礁边缘常见海龟和鹰鳐',
                '浅区珊瑚平台上密布成群礁鱼',
                '日落时段海面和浅水区色彩非常出众'
            ],
            warnings: [
                '通道流向受潮汐影响大，潜水计划需严格跟随时刻表',
                '下潜窗口明确，迟到或拖延会显著影响体验',
                '蓝水环境参照物少，需保持良好队形意识',
                '远程海岛补给有限，建议提前确认个人装备状态'
            ],
            weather: {
                season: '5月-10月',
                temperature: '25-27°C',
                visibility: '25-40米'
            }
        },
        itineraries: [
            {
                name: '4天3晚环礁通道初探',
                includes: '4次通道潜水 + 鲨鱼观察位点 + 船上简餐',
                price: '¥4,180'
            },
            {
                name: '6天5晚蓝水节奏线',
                includes: '6次潜水 + 潮汐窗口优化 + 水下摄影建议 + 酒店接送',
                price: '¥6,680'
            },
            {
                name: '8天7晚南太平洋环礁周',
                includes: '8次日潜 + 环礁双通道体验 + 海豚海面巡航',
                price: '¥9,580'
            }
        ],
        reviews: [
            {
                user: '通道潮汐表',
                rating: '★★★★★',
                date: '2026-01-31',
                text: '图阿莫图的蓝水很纯粹，能见度和空间感都非常强，鲨鱼是慢慢从远处显出来的，不是突然扑面而来。'
            },
            {
                user: '环礁漂流记',
                rating: '★★★★☆',
                date: '2025-12-20',
                text: '潮汐时间点卡得很准，向导安排很好。虽然不是每一潜都激烈，但整体蓝水氛围非常高级。'
            },
            {
                user: '南太平洋白噪声',
                rating: '★★★★★',
                date: '2025-10-12',
                text: '这里的开阔感让人特别容易放空，抬头是光，侧面是鲨鱼和大鱼，潜感很通透。'
            }
        ],
        related: [
            {
                id: 3,
                name: '大蓝洞',
                description: '同样有强烈的蓝色压迫感，但大蓝洞更偏垂直结构。',
                image: 'assets/images/blue-hole.jpg',
                price: '¥5,680'
            },
            {
                id: 4,
                name: '帝汶岛',
                description: '想从大开大合切换到珊瑚慢潜，可以去帝汶岛。',
                image: 'assets/images/timor-hero.jpg',
                price: '¥3,480'
            },
            {
                id: 7,
                name: '科莫多',
                description: '如果想要更强的流潜和蝠鲼机会，科莫多是自然延伸。',
                image: 'assets/images/komodo-hero.jpg',
                price: '¥3,880'
            }
        ]
    },
    9: {
        name: '马布岛',
        tagline: '把潜水、海风与慢一点的岛上时光，安静地放进同一次抵达。',
        image: 'assets/images/mabulc.jpg',
        difficulty: '入门友好',
        depth: '3-18m',
        season: '3月-10月',
        priceFrom: '¥3,580',
        mapLocation: '马来西亚沙巴州 · 马布岛',
        coordinates: '北纬 4.25°, 东经 118.63°',
        features: {
            location: '马布岛位于仙本那外海，和诗巴丹共享同一片海域气质，但节奏更慢、更贴近日常海岛生活。这里有水屋、木栈道、浅礁与丰富的小型生态，适合把潜水和停驻感放在一起。',
            wildlife: [
                '海龟、狮子鱼与礁栖石斑',
                '海马、裸鳃、鬼龙与小型甲壳类',
                '浅礁和码头下常见密集礁鱼与幼鱼群',
                '夜潜时容易遇见章鱼、海鳗与荧光小生物',
                '天气稳定时外侧蓝水区域也会有更开阔的热带海面感'
            ],
            warnings: [
                '码头和部分岸潜区域船只较多，下潜前需确认入水和集合位置',
                '浅水区生态丰富但更适合慢节奏观察，拍摄时要避免踢沙',
                '若安排与诗巴丹联潜，需要提早确认名额与出海时间',
                '海岛补给条件有限，建议提前准备个人常用药品与防晒用品'
            ],
            weather: {
                season: '3月-10月',
                temperature: '27-30°C',
                visibility: '10-22米'
            }
        },
        itineraries: [
            {
                name: '3天2晚浅礁慢潜线',
                includes: '2次船潜 + 1次码头或岸潜 + 水屋住宿 + 早餐',
                price: '¥3,580'
            },
            {
                name: '4天3晚马布停驻假期',
                includes: '4次潜水 + 1次夜潜 + 码头生态观察 + 欢迎晚餐',
                price: '¥5,180'
            },
            {
                name: '5天4晚马布 × 诗巴丹联潜',
                includes: '马布慢潜 + 诗巴丹名额协助 + 住宿接送 + 潜前 briefing',
                price: '¥7,280'
            }
        ],
        reviews: [
            {
                user: '码头晨光',
                rating: '★★★★★',
                date: '2026-02-14',
                text: '马布岛最打动人的不是某一个“必须去”的点，而是整座岛把潜水和生活放得很近。清晨走到码头边，海水就已经蓝得很安静。'
            },
            {
                user: '浅礁留白',
                rating: '★★★★☆',
                date: '2025-12-09',
                text: '这里很适合第一次把潜水和度假真正放在一起。海况不会一下子把人推深，回到岸上还能慢慢吃饭、看海，不会一直赶。'
            },
            {
                user: '水屋晚风',
                rating: '★★★★★',
                date: '2025-10-25',
                text: '潜完回到水屋，坐在阳台看海面颜色慢慢变暗，会觉得这趟旅行不是为了打卡，而是真的在海边停了下来。'
            }
        ],
        related: [
            {
                id: 1,
                name: '诗巴丹',
                description: '如果想从温柔浅礁走向更完整的大景和鱼群风暴，诗巴丹是最自然的下一站。',
                image: 'assets/images/sipadan.jpg',
                price: '¥3,980'
            },
            {
                id: 4,
                name: '帝汶岛',
                description: '同样适合慢节奏停驻，但帝汶会更偏向珊瑚坡地和更舒展的岸线。',
                image: 'assets/images/timor-hero.jpg',
                price: '¥3,480'
            },
            {
                id: 5,
                name: '波纳佩岛',
                description: '如果你喜欢把注意力收回到更细微的生命，波纳佩会更偏微距和静水观察。',
                image: 'assets/images/pohnpei.jpg',
                price: '¥2,980'
            }
        ]
    },
    10: {
        name: '马尔代夫船宿',
        tagline: '把环礁、蓝水与在船上醒来的清晨，安静地放进同一段航线。',
        image: 'assets/images/maldives-liveaboard.jpg',
        difficulty: '适合初次船宿',
        depth: '8-30m',
        season: '11月-次年4月',
        priceFrom: '¥6,880',
        mapLocation: '马尔代夫 · 北马累环礁至阿里环礁',
        coordinates: '北纬 4.3°, 东经 73.5°',
        features: {
            location: '这条船宿线通常从马累附近登船，在北马累、南马累和阿里环礁之间慢慢展开。和固定住在某一座岛不同，船宿会把潜点、海面和夜里的停泊感连成同一段海上节奏。',
            wildlife: [
                '护士鲨、灰礁鲨与成群杰克鱼',
                '海龟、鹰鳐与清洁站附近的蝠鲼机会',
                '环礁边缘常见拿破仑、梭鱼和大群笛鲷',
                '浅礁与沙地之间有丰富的小型礁鱼和甲壳类',
                '天气稳定时，海面与日出日落本身也会成为整段航线的重要记忆'
            ],
            warnings: [
                '船宿作息会比海岛酒店更集中，需适应连续出海和船上生活节奏',
                '不同航段流速和能见度变化明显，下潜前要认真听 brief',
                '对晕船敏感的潜水员建议提前准备药物并留意休息',
                '部分航线会根据海况临时调整顺序，船宿体验更依赖整体窗口判断'
            ],
            weather: {
                season: '11月-次年4月',
                temperature: '27-30°C',
                visibility: '18-30米'
            }
        },
        itineraries: [
            {
                name: '5天4晚环礁初识线',
                includes: '6次潜水 + 1次黄昏潜 + 船宿住宿 + 每日三餐',
                price: '¥6,880'
            },
            {
                name: '7天6晚马尔代夫船宿主线',
                includes: '10次潜水 + 环礁航线安排 + 中文向导 + 机场接送',
                price: '¥9,680'
            },
            {
                name: '8天7晚蓝水与航迹',
                includes: '12次潜水 + 日出甲板时段 + 潜前 briefing + 船宿全餐',
                price: '¥11,280'
            }
        ],
        reviews: [
            {
                user: '航迹记录者',
                rating: '★★★★★',
                date: '2026-02-26',
                text: '船宿最迷人的地方，是每天醒来都在另一片海面上。白天看环礁和蓝水，晚上回到甲板吹风，会觉得整趟旅程一直在往前慢慢展开。'
            },
            {
                user: '环礁之间',
                rating: '★★★★★',
                date: '2025-12-17',
                text: '这不是把潜点一个个勾掉的路线，而是把几片海连成同一段节奏。潜后 brief、甲板上的风和下一站的期待会自然接在一起。'
            },
            {
                user: '清晨在船上',
                rating: '★★★★☆',
                date: '2025-10-08',
                text: '如果喜欢醒来就已经离岸很远的感觉，马尔代夫船宿会非常对味。节奏比海岛驻留更完整，但也更依赖和船上作息对齐。'
            }
        ],
        related: [
            {
                id: 8,
                name: '图阿莫图',
                description: '如果你喜欢通透蓝水与航道之间的等待感，图阿莫图会是更安静也更开阔的延伸。',
                image: 'assets/images/tuamotu.jpg',
                price: '¥4,180'
            },
            {
                id: 9,
                name: '马布岛',
                description: '如果想把节奏收慢一点，让潜前潜后都更贴近岛上生活，马布岛会更温柔。',
                image: 'assets/images/mabul.jpg',
                price: '¥3,580'
            },
            {
                id: 2,
                name: '帕劳',
                description: '如果想把蓝洞、断层和更明确的洋流层次排进行程，帕劳会是另一种完整海况。',
                image: 'assets/images/palau.jpg',
                price: '¥4,280'
            }
        ]
    },
    11: {
        name: '科隆',
        tagline: '把黑色石灰岩、玻璃水与沉船的安静轮廓，一层层排进同一次靠近。',
        image: 'assets/images/coron-review-1-island-chain.jpg',
        difficulty: '适合沉船初体验',
        depth: '5-30m',
        season: '11月-次年5月',
        priceFrom: '¥4,980',
        mapLocation: '菲律宾巴拉望 · 科隆湾 Coron Bay',
        coordinates: '北纬 11.99°, 东经 120.20°',
        features: {
            location: '科隆的海不是单一一层蓝。黑色石灰岩、浅色礁缘、静水海湾与沉船线索会交替出现，很多人是为了 wreck 而来，但真正留在记忆里的，往往是船慢慢切进岛湾时，海面以上也一样有层次。',
            wildlife: [
                '海龟、梭鱼与礁坡上的笛鲷群',
                '沉船结构周围常见蝙蝠鱼、石斑与狮子鱼',
                '浅区有海鳗、裸鳃与更细碎的小型礁鱼',
                '静水海湾和石灰岩岸线本身就是整段行程的重要风景',
                '天气稳定时，海面颜色和礁缘层次会非常清楚'
            ],
            warnings: [
                '部分沉船点位深度和结构更复杂，进舱或更深路线需按证照与经验安排',
                '上岛、换船和靠岸常会踩到石灰岩或湿滑船沿，动作要放慢',
                '日晒、船程与跳岛节奏叠加，补水和防晒都要提前准备',
                '能见度与出海顺序会受风向和降雨影响，行程需要留一点弹性'
            ],
            weather: {
                season: '11月-次年5月',
                temperature: '27-30°C',
                visibility: '10-25米'
            }
        },
        itineraries: [
            {
                name: '4天3晚黑石与玻璃水初识线',
                includes: '2次沉船潜 + 1次礁坡 + 海湾巡游 + 中文向导',
                price: '¥4,980'
            },
            {
                name: '6天5晚科隆沉船主线',
                includes: '4次核心 wreck + 岛湾停驻 + 潜前 briefing + 机场接送',
                price: '¥7,280'
            },
            {
                name: '7天6晚科隆海湾与沉船线',
                includes: '6次潜水 + 跳岛水面日 + 酒店接送 + 每日早餐',
                price: '¥9,980'
            }
        ],
        reviews: [
            {
                user: '飞进群岛时',
                rating: '★★★★★',
                date: '2026-03-04',
                text: '很多人记住科隆是因为沉船，但我先记住的是从空中看见黑色岛影被浅色礁缘轻轻托住的那一下。'
            },
            {
                user: '黑石之间',
                rating: '★★★★★',
                date: '2025-12-18',
                text: '这里的好看不只在水下。白沙、浅水和石灰岩靠得很近，人刚靠岸就会自然慢下来。'
            },
            {
                user: '回到码头以后',
                rating: '★★★★☆',
                date: '2025-10-06',
                text: '整好装备、再看一眼镇边的山和水色，会觉得科隆是一片从海面以上就开始讲故事的海。'
            }
        ],
        related: [
            {
                id: 2,
                name: '帕劳',
                description: '同样有石灰岩岛屿与通透蓝色，但帕劳会更偏断层、蓝洞和更清楚的流线。',
                image: 'assets/images/palau.jpg',
                price: '¥4,280'
            },
            {
                id: 7,
                name: '科莫多',
                description: '如果想把地形张力继续往更完整的海况里推深，科莫多会更强一些。',
                image: 'assets/images/komodo-hero.jpg',
                price: '¥3,880'
            },
            {
                id: 9,
                name: '马布岛',
                description: '如果想把节奏收得更慢，让海面以上也更贴近日常停驻，马布岛会更柔和。',
                image: 'assets/images/mabul.jpg',
                price: '¥3,580'
            }
        ]
    },
    12: {
        name: '薄荷岛',
        tagline: '把白沙岸线、浅礁色带和轻船潜的出发线，安静地排进同一次停驻。',
        image: 'assets/images/bohol.jpg',
        difficulty: '适合轻船潜入门',
        depth: '5-25m',
        season: '11月-次年6月',
        priceFrom: '¥3,980',
        mapLocation: '菲律宾薄荷 · 邦劳 / 巴里卡萨 Bohol / Balicasag',
        coordinates: '北纬 9.53°, 东经 123.68°',
        features: {
            location: '薄荷岛不是先用强烈海况把人抓住的海。白沙岸线、浅礁色带和停在外侧的小船会先把节奏放轻，很多人从邦劳或巴里卡萨一带开始认识它，真正留在记忆里的，常常是那条从浅青慢慢过渡到深蓝的岸线。',
            wildlife: [
                '海龟、杰克鱼群与浅礁鱼类更常在光线好的时段出现',
                '岸线外侧的浅礁与 drop-off 过渡清楚，适合先把节奏读懂',
                '晴天时海色会从白沙边一路过渡到更稳的外海深蓝',
                '短船程和近岸出发让整天的潜旅体感更轻',
                '水面平静时，停船线和浅礁纹理本身就是很完整的风景'
            ],
            warnings: [
                '中午前后日晒很强，防晒和补水都要提前准备',
                '小船上下和背滚入水时要注意脚下和器材摆放',
                '风浪变化时，外侧点位和出海顺序可能会调整',
                '浅礁区拍照或观察时要更留意中性浮力和踢蹼距离'
            ],
            weather: {
                season: '11月-次年6月',
                temperature: '27-30°C',
                visibility: '12-22米'
            }
        },
        itineraries: [
            {
                name: '4天3晚薄荷岛轻潜假期',
                includes: '2次船潜 + 巴里卡萨外侧巡游 + 机场接送 + 中文协助',
                price: '¥3,980'
            },
            {
                name: '5天4晚薄荷岛岸线与浅礁线',
                includes: '4次船潜 + 邦劳住店 + 每日早餐 + 潜店接送',
                price: '¥5,680'
            },
            {
                name: '6天5晚薄荷岛海岸停驻线',
                includes: '6次潜水 + 船上 briefing + 酒店接送 + 中文向导',
                price: '¥7,580'
            }
        ],
        reviews: [
            {
                user: '先看见岸线',
                rating: '★★★★★',
                date: '2026-03-09',
                text: '薄荷岛先让人记住的，是白沙、浅礁和外侧深蓝排得很清楚的那条边。'
            },
            {
                user: '船停在外侧',
                rating: '★★★★★',
                date: '2025-12-14',
                text: '小船就停在浅水边，岸上房子和树线都还看得见，整趟出海会自然轻下来。'
            },
            {
                user: 'briefing 开始前',
                rating: '★★★★☆',
                date: '2025-10-02',
                text: '大家围坐在船上听 brief 的时候，薄荷岛那种轻一点的日常感就已经开始了。'
            }
        ],
        related: [
            {
                id: 9,
                name: '马布岛',
                description: '如果想把岸边停驻感再放慢一点，让潜前潜后都更贴近岛上日常，马布岛会更柔和。',
                image: 'assets/images/mabul.jpg',
                price: '¥3,580'
            },
            {
                id: 6,
                name: '布纳肯',
                description: '如果想把薄荷岛的轻船潜再往更清澈的海墙层次里延伸，布纳肯会更开阔。',
                image: 'assets/images/bunaken.jpg',
                price: '¥3,680'
            },
            {
                id: 11,
                name: '科隆',
                description: '如果想把菲律宾这一段继续往更明显的海湾层次和岸线记忆里推深，科隆会更有画面感。',
                image: 'assets/images/coron-review-1-island-chain.jpg',
                price: '¥4,980'
            }
        ]
    },
    13: {
        name: '皇帝岛',
        tagline: '把白沙海湾、清水坡地与更轻一点的泰国船潜，安静排进同一次靠近。',
        image: 'assets/images/racha.jpg',
        difficulty: '适合 OW / AOW 轻船潜',
        depth: '5-28m',
        season: '11月-次年4月',
        priceFrom: '¥3,680',
        mapLocation: '泰国普吉 · 皇帝岛 Racha Yai / Racha Noi',
        coordinates: '北纬 7.60°, 东经 98.37°',
        features: {
            location: '皇帝岛不是一上来就把海况推深的那种海。白沙海湾、明亮水色和外侧慢慢加深的礁坡，会先让身体放松下来，再把真正值得记住的蓝一点点打开。很多人从普吉出发来这里，并不是为了“最强刺激”，而是为了这种更清楚、更轻一点的进入方式。',
            wildlife: [
                '热带礁鱼、沙地鱼群与浅礁边的细小生态更容易在好光线里被看清',
                '外侧蓝水过渡层常把整片海的通透感与坡地结构一起推出来',
                '白沙海湾与外侧礁坡离得近，适合先把节奏读懂再继续往外',
                '天气稳定时，海面以上的岸线、停船点和水色本身就很完整',
                '对想把船潜、海岛风景和较轻海况放在一起的人来说，这里很顺'
            ],
            warnings: [
                '冬季窗口整体更稳，但风向变化时外侧点位和上下船顺序仍可能调整',
                '白沙和浅坡让体感很轻，越是这样越要留意中性浮力与踢蹼距离',
                '日晒、船程和连续潜水叠加后补水会很关键，尤其是普吉往返日',
                '若安排更外侧或更深一点的点位，仍要按当天海况和近期状态判断'
            ],
            weather: {
                season: '11月-次年4月',
                temperature: '27-30°C',
                visibility: '12-25米'
            }
        },
        itineraries: [
            {
                name: '4天3晚皇帝岛轻船潜假期',
                includes: '2次船潜 + 白沙海湾线 + 普吉接送 + 中文协助',
                price: '¥3,680'
            },
            {
                name: '5天4晚皇帝岛礁坡与外侧线',
                includes: '4次船潜 + 潜前 briefing + 酒店早餐 + 码头接送',
                price: '¥5,280'
            },
            {
                name: '6天5晚皇帝岛安达曼停驻线',
                includes: '6次潜水 + 外侧点位安排 + 每日接送 + 中文向导',
                price: '¥6,980'
            }
        ],
        reviews: [
            {
                user: '住处先把节奏放轻',
                rating: '★★★★★',
                date: '2026-03-12',
                text: '大厅、花园步道和潜前那顿安静早餐，会先把皇帝岛这一程收进更从容的节奏里。'
            },
            {
                user: '甲板先读云线',
                rating: '★★★★★',
                date: '2025-12-11',
                text: '从甲板到外海，云墙、海面和船行方向都很清楚，皇帝岛会先让人读懂今天的海。'
            },
            {
                user: '水下再把蓝慢慢放深',
                rating: '★★★★☆',
                date: '2025-10-04',
                text: '珊瑚、鱼群和沉船舱里的蓝会把这片海真正收深，但回忆留下来的仍然是层次清楚。'
            }
        ],
        related: [
            {
                id: 12,
                name: '薄荷岛',
                description: '如果你喜欢白沙、浅礁和较轻一点的出海节奏，薄荷岛会是很顺的菲律宾延伸。',
                image: 'assets/images/bohol.jpg',
                price: '¥3,980'
            },
            {
                id: 6,
                name: '布纳肯',
                description: '如果想把明亮蓝水和墙潜层次再往外推一点，布纳肯会更开阔。',
                image: 'assets/images/bunaken.jpg',
                price: '¥3,680'
            },
            {
                id: 9,
                name: '马布岛',
                description: '如果想把潜前潜后的海岛停驻感再放慢一点，马布岛会更柔和。',
                image: 'assets/images/mabul.jpg',
                price: '¥3,580'
            }
        ]
    },
    14: {
        name: '热浪岛',
        tagline: '把清透蓝水、白沙海湾和更安静的岸线呼吸，慢慢排进同一次马来西亚停驻。',
        image: 'assets/images/redang.jpg',
        difficulty: 'OW / AOW 友好',
        depth: '6-30m',
        season: '3月-9月',
        priceFrom: '¥3,680',
        mapLocation: '马来西亚登嘉楼州 · 热浪岛 Redang Island',
        coordinates: '北纬 5.78°, 东经 103.03°',
        features: {
            location: '热浪岛位于马来西亚半岛东岸外海，属于登嘉楼外侧群岛。这里的海不会用强张力先把人推深，而是先用通透浅蓝、白沙湾和外侧礁坡把节奏放稳，再慢慢打开更完整的海底层次。',
            wildlife: [
                '热带礁鱼群、蝶鱼和笛鲷在浅礁光带里更容易被看清',
                '海龟与蓝点魟常在礁坡和沙地过渡区慢慢巡游',
                '晴天时外侧蓝水与近岸浅礁对比会非常清楚',
                '浅坡和珊瑚块地形友好，适合把潜旅节奏收得更稳',
                '海面以上的白沙岸线与船停点本身就很有停驻感'
            ],
            warnings: [
                '旺季船次密集，热门点位建议提前排好出海窗口',
                '中午日晒和连续潜水叠加后，补水与防晒都要跟上',
                '浅礁区拍摄时要特别留意中性浮力，避免触碰珊瑚',
                '风向变化时外侧点位和回船顺序可能临时调整'
            ],
            weather: {
                season: '3月-9月',
                temperature: '27-30°C',
                visibility: '12-25米'
            }
        },
        itineraries: [
            {
                name: '4天3晚热浪岛轻船潜线',
                includes: '2次船潜 + 白沙海湾线 + 岛上接送 + 中文协助',
                price: '¥3,680'
            },
            {
                name: '5天4晚热浪岛礁坡停驻线',
                includes: '4次潜水 + 潜前 briefing + 酒店早餐 + 码头往返',
                price: '¥3,680'
            },
            {
                name: '6天5晚热浪岛外侧蓝水线',
                includes: '6次潜水 + 点位安排优化 + 每日接送 + 中文向导',
                price: '¥3,680'
            }
        ],
        reviews: [
            {
                user: '先在飞机和补给之间靠近',
                rating: '★★★★★',
                date: '2026-03-16',
                text: '热浪岛这趟路不是一落地就急着入海，便利店、转机和第一顿热食会先把身体慢慢接住。'
            },
            {
                user: '白沙先把一天点亮',
                rating: '★★★★★',
                date: '2025-12-02',
                text: '真正把热浪岛留下来的，是沙滩椅、餐桌边的海风和那片一眼就看懂的浅蓝。'
            },
            {
                user: '回岸以后还会继续停一会儿',
                rating: '★★★★☆',
                date: '2025-09-28',
                text: '潜具上船、栏杆外的深蓝、夜里海边餐桌和最后一段岛上路，会把热浪岛这程收得很慢。'
            }
        ],
        related: [
            {
                id: 13,
                name: '皇帝岛',
                description: '如果你喜欢白沙湾和轻船潜节奏，皇帝岛会是很顺的安达曼延伸。',
                image: 'assets/images/racha.jpg',
                price: '¥3,680'
            },
            {
                id: 12,
                name: '薄荷岛',
                description: '如果想把浅礁色带和明亮岸线继续留在假期里，薄荷岛会更轻一些。',
                image: 'assets/images/bohol.jpg',
                price: '¥3,680'
            },
            {
                id: 9,
                name: '马布岛',
                description: '如果想把潜前潜后的海岛停驻感继续放慢，马布岛会更柔和。',
                image: 'assets/images/mabul.jpg',
                price: '¥3,680'
            }
        ]
    }
});

// 评论图片区命名规则：为每个潜点分配固定英文前缀，便于后续补齐独立评论照片文件。
const REVIEW_IMAGE_PREFIX = Object.freeze({
    1: 'sipadan',
    2: 'palau',
    3: 'blue-hole',
    4: 'timor',
    5: 'pohnpei',
    6: 'bunaken',
    7: 'komodo',
    8: 'tuamotu',
    9: 'mabul',
    10: 'maldives-liveaboard',
    11: 'coron',
    12: 'bohol',
    13: 'racha',
    14: 'redang'
});

// 相关推荐切换配置：控制详情页之间的卡片式切页时长、状态存储和方向 class。
/**
 * navigateWithDepth(url) - 带深度切换效果地跳转到目标页面
 * @param {string} url - 目标页面地址
 * @param {Object} options - 可选导航配置
 * @returns {void} - 无返回值，直接执行页面跳转
 */
function navigateWithDepth(url, options = {}) {
    if (window.DepthManager && typeof window.DepthManager.navigateTo === 'function') {
        window.DepthManager.navigateTo(url, options);
        return;
    }

    window.location.href = url;
}

const RELATED_SPOT_PROFILES = Object.freeze({
    1: {
        englishName: 'Sipadan',
        mood: '鱼群风暴与海龟共游，更适合把第一次真正的心动留在海里的那类人。',
        fitTags: ['OW / AOW', '鱼群 / 大景', '中洋流'],
        why: '适合愿意把呼吸、流向和更深一点的蓝放进同一种节奏里的人。'
    },
    2: {
        englishName: 'Palau',
        mood: '蓝色大门与断层一起展开，光线、洋流和空间感都更有层次。',
        fitTags: ['AOW 推荐', '蓝洞 / 断层', '完整海况'],
        why: '更适合已经有一些经验，想把视线放进更完整海况层次的人。'
    },
    3: {
        englishName: 'Blue Hole',
        mood: '更深的结构感和垂直蓝色，会让这片海先以轮廓、再以安静留下来。',
        fitTags: ['AOW 推荐', '地形潜水', '深蓝结构'],
        why: '适合对地形、深度和更集中的注意力都有所期待的人。'
    },
    4: {
        englishName: 'Timor',
        mood: '珊瑚坡地和热带光线更轻一些，适合把风景与潜水放在同一种呼吸里。',
        fitTags: ['OW 适合', '风景体验', '珊瑚坡地'],
        why: '更适合希望水色、节奏和停驻感都平衡一点的人。'
    },
    5: {
        englishName: 'Pohnpei',
        mood: '礁湖、遗迹和更安静的水层，会把注意力慢慢带回到细节和停留里。',
        fitTags: ['OW / 慢节奏', '礁湖 / 光线', '恢复状态'],
        why: '适合久未下潜、或想先找回和海重新对齐节奏的人。'
    },
    6: {
        englishName: 'Bunaken',
        mood: '海墙与清澈水色更适合长线观察，不急着赶路，反而更容易看见层次。',
        fitTags: ['OW / AOW', '海墙 / 清澈', '长线观察'],
        why: '适合把速度放慢一点，让海洋生物自己慢慢靠近视线的人。'
    },
    7: {
        englishName: 'Komodo',
        mood: '流更明显，蓝更深，也更适合愿意进入完整海况层次的人。',
        fitTags: ['AOW / 进阶', '洋流 / 大景', '更深层次'],
        why: '如果你希望海况本身也成为记忆的一部分，这片海会更适合继续往前一步。'
    },
    8: {
        englishName: 'Tuamotu',
        mood: '玻璃一样的海面和通道流区并存，适合把耐心和惊喜放进同一段等待里。',
        fitTags: ['AOW 推荐', '通道 / 海流', '玻璃海色'],
        why: '更适合愿意沿着海流去等待下一次相遇，而不是急着把一切看完的人。'
    },
    9: {
        englishName: 'Mabul',
        mood: '把潜水和海岛停驻放进同一段时间，更适合慢慢靠近海的人。',
        fitTags: ['入门新手', '慢节奏', '海岛停驻'],
        why: '如果你希望潜前潜后都能安静停下来，它会是更温和也更完整的一种靠近方式。'
    },
    10: {
        englishName: 'Maldives Liveaboard',
        mood: '把好几片蓝收进同一段航线里，更适合愿意在船上慢慢进入海的人。',
        fitTags: ['OW / AOW', '船宿', '环礁巡航'],
        why: '如果你想把潜点与海面上的停泊感一起记住，船宿会是一种更完整也更流动的靠近方式。'
    },
    11: {
        englishName: 'Coron',
        mood: '黑色石灰岩、玻璃水与沉船轮廓会一起展开，更适合把海面以上也记进潜旅的人。',
        fitTags: ['OW / AOW', '沉船线索', '风景体验'],
        why: '如果你希望一片海从空中、海湾到下潜前的准备都有层次，它会是更完整也更安静的一种靠近方式。'
    },
    12: {
        englishName: 'Bohol',
        mood: '白沙岸线、浅礁色带和轻船潜一起铺开，更适合把潜水放进轻一些假期的人。',
        fitTags: ['入门 / OW', '风景体验', '轻船潜'],
        why: '如果你想先让海岸线、briefing 和短船程把身体放松下来，它会是更明亮也更从容的一种靠近方式。'
    },
    13: {
        englishName: 'Racha Island',
        mood: '白沙海湾、清水坡地和更轻一点的船潜节奏，会把进入海的方式放得更从容。',
        fitTags: ['OW / AOW', '轻船潜', '白沙海湾'],
        why: '如果你希望一片海既明亮、好靠近，又保留一点外侧蓝水层次，它会是很顺的一种泰国靠近方式。'
    },
    14: {
        englishName: 'Redang Island',
        mood: '清透蓝水、白沙岸线和更安静的礁坡过渡，会把整趟潜旅的呼吸轻轻放慢。',
        fitTags: ['OW / AOW', '轻船潜', '白沙岸线'],
        why: '如果你想把潜水和停驻感放进同一种舒缓节奏，热浪岛会是一片很顺的马来西亚蓝。'
    }
});

/**
 * getRelatedSpotProfile(spot) - 获取相邻海域舞台所需的补充文案和标签
 * @param {Object} spot - 相关推荐潜点对象
 * @returns {Object} - 包含英文名、气质文案、标签和推荐理由的展示数据
 */
function getRelatedSpotProfile(spot) {
    return RELATED_SPOT_PROFILES[spot.id] || {
        englishName: spot.name,
        mood: spot.description,
        fitTags: ['继续看看', '相邻海域'],
        why: '也许会是此刻更适合你继续停下来的那片海。'
    };
}

const DETAIL_SWAP_STORAGE_KEY = 'yanqi_detail_swap_transition';
const DETAIL_SWAP_MAX_AGE_MS = 12000;
const DETAIL_SWAP_DURATION_MS = 760;
const DETAIL_SWAP_NAVIGATE_DELAY_MS = 460;
const DETAIL_SWAP_CLASSES = [
    'detail-swap-active',
    'detail-swap-exit',
    'detail-swap-enter',
    'detail-swap-back-enter',
    'detail-swap-flow-forward',
    'detail-swap-flow-backward'
];

function normalizeDetailSwapDirection(direction) {
    return direction === 'backward' ? 'backward' : 'forward';
}

function reverseDetailSwapDirection(direction) {
    return normalizeDetailSwapDirection(direction) === 'forward' ? 'backward' : 'forward';
}

const HOME_DIVE_MATCH_LINK_MAP = Object.freeze({
    '入门新手': 'beginner',
    'OW 友好': 'ow',
    'OW 适合': 'ow',
    'OW / AOW': 'ow',
    'OW / 慢节奏': 'slow-pace',
    'AOW 推荐': 'aow',
    'AOW / 进阶': 'advanced-conditions',
    '慢节奏': 'slow-pace',
    '舒适度优先': 'comfort-first',
    '风景体验': 'scenery-first',
    '风景体验偏好': 'scenery-first',
    '鱼群 / 大景': 'big-scene',
    '鱼群 / 大景偏好': 'big-scene',
    '海况适应力': 'advanced-conditions',
    '海况适应力较弱': 'gentle-conditions',
    '近期有潜水记录': 'recent-dives',
    '中洋流': 'current-friendly',
    '完整海况': 'advanced-conditions',
    '洋流经验更友好': 'current-friendly',
    '进阶海况': 'advanced-conditions'
});

/**
 * buildHomeDiveMatchUrl(matchKey) - 构建跳回首页潜水匹配模块的目标地址
 * @param {string} matchKey - 首页匹配分类键名
 * @returns {string} - 带分类状态的首页地址
 */
function buildHomeDiveMatchUrl(matchKey) {
    return `home.html?match=${encodeURIComponent(matchKey)}#dive-match`;
}

/**
 * resolveDiveMatchKey(tag) - 把详情页里的能力标签映射到首页潜水匹配分类
 * @param {string} tag - 当前展示的标签文案
 * @returns {string} - 可跳转的首页匹配分类键名
 */
function resolveDiveMatchKey(tag) {
    const normalizedTag = typeof tag === 'string' ? tag.trim() : '';

    if (!normalizedTag) {
        return '';
    }

    if (HOME_DIVE_MATCH_LINK_MAP[normalizedTag]) {
        return HOME_DIVE_MATCH_LINK_MAP[normalizedTag];
    }

    // 详情页里有些标签是组合表达，这里按语义兜底到最接近的匹配分类。
    if (normalizedTag.includes('入门新手')) {
        return 'beginner';
    }

    if (normalizedTag.includes('AOW')) {
        return normalizedTag.includes('进阶') ? 'advanced-conditions' : 'aow';
    }

    if (normalizedTag.includes('OW')) {
        return normalizedTag.includes('慢节奏') ? 'slow-pace' : 'ow';
    }

    if (normalizedTag.includes('慢节奏')) {
        return 'slow-pace';
    }

    if (normalizedTag.includes('舒适')) {
        return 'comfort-first';
    }

    if (normalizedTag.includes('风景')) {
        return 'scenery-first';
    }

    if (normalizedTag.includes('鱼群') || normalizedTag.includes('大景')) {
        return 'big-scene';
    }

    if (normalizedTag.includes('近期')) {
        return 'recent-dives';
    }

    if (normalizedTag.includes('洋流') || normalizedTag.includes('中洋流')) {
        return 'current-friendly';
    }

    if (normalizedTag.includes('海况适应力较弱')) {
        return 'gentle-conditions';
    }

    if (normalizedTag.includes('海况') || normalizedTag.includes('完整海况')) {
        return 'advanced-conditions';
    }

    return '';
}

/**
 * createBookingMatchChipMarkup(tag) - 生成可跳转或纯展示的能力匹配芯片
 * @param {string} tag - 标签文案
 * @returns {string} - 芯片 HTML 字符串
 */
function createBookingMatchChipMarkup(tag) {
    const label = typeof tag === 'string' ? tag.trim() : '';
    const matchKey = resolveDiveMatchKey(label);

    if (!label) {
        return '';
    }

    if (!matchKey) {
        return `<span class="booking-match-chip">${label}</span>`;
    }

    return `
        <button type="button" class="booking-match-chip booking-match-link" data-match-key="${matchKey}">
            ${label}
        </button>
    `;
}

/**
 * parsePriceValue(priceText) - 解析价格文本中的数值部分
 * @param {string} priceText - 价格文本
 * @returns {number} - 解析出的数值金额
 */
function parsePriceValue(priceText) {
    return extractCurrencyAmount(priceText);
}

/**
 * getLeadingSentence(text) - 提取一段文案里最适合作为卡片短句的首句
 * @param {string} text - 原始文案
 * @returns {string} - 处理后的首句
 */
function getLeadingSentence(text) {
    const normalized = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
    if (!normalized) {
        return '';
    }

    const sentenceMatch = normalized.match(/^[^。！？!?]+[。！？!?]?/);
    return sentenceMatch ? sentenceMatch[0].trim() : normalized;
}

/**
 * buildPackageRhythmTags(pkg) - 为套餐卡生成“节奏标记”标签
 * @param {Object} pkg - 套餐对象
 * @returns {string[]} - 节奏标签数组
 */
function buildPackageRhythmTags(pkg) {
    const duration = typeof pkg?.duration === 'string' ? pkg.duration.trim() : '';
    const diveSummary = typeof pkg?.diveSummary === 'string' ? pkg.diveSummary.trim() : '';
    const staySummary = typeof pkg?.staySummary === 'string' ? pkg.staySummary.trim() : '';
    const tags = [];

    if (duration) {
        tags.push(duration);
    }

    const diveTagRules = [
        { pattern: /船宿/, label: '船宿' },
        { pattern: /\d+次船潜/, label: (match) => match[0] },
        { pattern: /黄昏轻潜/, label: '黄昏轻潜' },
        { pattern: /体验潜/, label: '体验潜' },
        { pattern: /岸潜/, label: '岸潜' },
        { pattern: /进阶点位安排/, label: '进阶点位' },
        { pattern: /重点窗口追踪/, label: '窗口追踪' }
    ];

    diveTagRules.some((rule) => {
        const match = diveSummary.match(rule.pattern);
        if (!match) {
            return false;
        }

        tags.push(typeof rule.label === 'function' ? rule.label(match) : rule.label);
        return true;
    });

    if (staySummary.includes('船宿')) {
        tags.push('船宿');
    } else if (staySummary.includes('岛上')) {
        tags.push('岛住');
    } else if (staySummary.includes('海边')) {
        tags.push('海边慢住');
    } else if (staySummary.includes('度假酒店')) {
        tags.push('度假停住');
    } else if (staySummary.includes('向导型酒店')) {
        tags.push('向导型住处');
    } else if (staySummary.includes('安静酒店')) {
        tags.push('安静停住');
    } else if (staySummary.includes('酒店')) {
        tags.push('酒店停住');
    }

    return Array.from(new Set(tags.filter(Boolean))).slice(0, 3);
}

/**
 * createPackagePlateMarkup(label, variant) - 生成套餐卡内的细分铭牌标签
 * @param {string} label - 标签文字
 * @param {string} variant - fit 或 rhythm
 * @returns {string} - 标签 HTML
 */
function createPackagePlateMarkup(label, variant = 'fit') {
    const text = typeof label === 'string' ? label.trim() : '';
    if (!text) {
        return '';
    }

    return `<span class="package-plate package-plate-${variant}">${text}</span>`;
}

/**
 * formatPriceValue(value) - 将金额数值格式化为详情页展示价格
 * @param {number} value - 金额数值
 * @returns {string} - 格式化后的价格文本
 */
function formatPriceValue(value) {
    return formatDisplayPriceValue(value);
}

/**
 * easeOutDrift(progress) - 生成更柔和的价格滚动缓动曲线
 * @param {number} progress - 当前动画进度（0 到 1）
 * @returns {number} - 缓动后的进度值
 */
function easeOutDrift(progress) {
    return 1 - ((1 - progress) ** 4);
}

/**
 * animateRollingPrice(element, priceText, options) - 让详情页顶部价格从个位开始平滑滚动到目标值
 * @param {HTMLElement|null} element - 需要更新价格文本的元素
 * @param {string} priceText - 目标价格文本
 * @param {Object} options - 动画配置（duration、delay）
 * @returns {void} - 无返回值，直接执行价格滚动动画
 */
function animateRollingPrice(element, priceText, options = {}) {
    if (!element) {
        return;
    }

    if (element.dataset.priceAnimated === 'true') {
        return;
    }

    const targetValue = parsePriceValue(priceText);
    if (!Number.isFinite(targetValue) || targetValue <= 0) {
        element.textContent = priceText;
        element.dataset.priceAnimated = 'true';
        return;
    }

    const { duration = 1680, delay = 120 } = options;

    if (element._priceRollFrameId) {
        window.cancelAnimationFrame(element._priceRollFrameId);
        element._priceRollFrameId = 0;
    }

    if (element._priceRollTimerId) {
        window.clearTimeout(element._priceRollTimerId);
        element._priceRollTimerId = 0;
    }

    element.textContent = formatPriceValue(0);

    const startAnimation = () => {
        const startTime = performance.now();

        const tick = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            const easedProgress = easeOutDrift(progress);
            let displayValue = Math.round(targetValue * easedProgress);

            if (progress > 0 && displayValue < 1) {
                displayValue = 1;
            }

            element.textContent = formatPriceValue(displayValue);

            if (progress < 1) {
                element._priceRollFrameId = window.requestAnimationFrame(tick);
                return;
            }

            element.textContent = formatPriceValue(targetValue);
            element.dataset.priceAnimated = 'true';
            element._priceRollFrameId = 0;
        };

        element._priceRollFrameId = window.requestAnimationFrame(tick);
    };

    element._priceRollTimerId = window.setTimeout(() => {
        element._priceRollTimerId = 0;
        startAnimation();
    }, delay);
}

/**
 * isElementNearViewport(element, offset) - 判断元素是否已经进入或接近当前视口
 * @param {Element|null} element - 需要判断的目标元素
 * @param {number} offset - 额外的提前触发距离
 * @returns {boolean} - 是否已经接近当前视口
 */
function isElementNearViewport(element, offset = 0) {
    if (!element) {
        return false;
    }

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    return rect.top <= viewportHeight + offset && rect.bottom >= -offset;
}

/**
 * getNavigationType() - 获取当前页面的导航进入类型
 * @returns {string} - 浏览器导航类型
 */
function getNavigationType() {
    const [navigationEntry] = performance.getEntriesByType('navigation');
    return navigationEntry && navigationEntry.type ? navigationEntry.type : 'navigate';
}

/**
 * readDetailSwapState() - 读取详情页相关推荐切换的暂存状态
 * @returns {Object|null} - 读取到的切换状态对象或空值
 */
function readDetailSwapState() {
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
        const direction = normalizeDetailSwapDirection(parsed.direction);

        if (!Number.isFinite(fromId) || !Number.isFinite(toId) || !Number.isFinite(at)) {
            sessionStorage.removeItem(DETAIL_SWAP_STORAGE_KEY);
            return null;
        }

        if (Date.now() - at > DETAIL_SWAP_MAX_AGE_MS) {
            sessionStorage.removeItem(DETAIL_SWAP_STORAGE_KEY);
            return null;
        }

        return { fromId, toId, at, forwardConsumed, direction };
    } catch (error) {
        sessionStorage.removeItem(DETAIL_SWAP_STORAGE_KEY);
        return null;
    }
}

/**
 * writeDetailSwapState(fromId, toId) - 写入相关推荐切换的来源和目标潜点状态
 * @param {number} fromId - 当前潜点 ID
 * @param {number} toId - 目标潜点 ID
 * @returns {void} - 无返回值，直接写入 sessionStorage
 */
function writeDetailSwapState(fromId, toId, direction = 'forward') {
    sessionStorage.setItem(DETAIL_SWAP_STORAGE_KEY, JSON.stringify({
        fromId,
        toId,
        at: Date.now(),
        forwardConsumed: false,
        direction: normalizeDetailSwapDirection(direction)
    }));
}

/**
 * markDetailSwapForwardConsumed(state) - 标记相关推荐前进动画状态已被消费
 * @param {Object} state - 当前切换状态对象
 * @returns {void} - 无返回值，直接更新 sessionStorage
 */
function markDetailSwapForwardConsumed(state) {
    sessionStorage.setItem(DETAIL_SWAP_STORAGE_KEY, JSON.stringify({
        fromId: state.fromId,
        toId: state.toId,
        at: state.at,
        forwardConsumed: true,
        direction: normalizeDetailSwapDirection(state.direction)
    }));
}

// 详情页主类：统一管理当前潜点的数据渲染、交互事件、弹窗、评论和地图三态视图。
class DetailPage {
    /**
     * constructor() - 初始化详情页状态、DOM 引用与默认数据容器
     */
    constructor() {
        this.body = document.body;
        this.pageStage = document.getElementById('pageStage');
        this.detailHero = document.getElementById('detailHero');
        this.spotId = this.getSpotIdFromUrl();
        this.spotData = divingSpotDetails[this.spotId] || divingSpotDetails[1];
        this.packageData = [];
        this.reviewData = [];
        this.reviewDataCache = new Map();
        this.activeReviewFilter = 'all';
        this.selectedPackageId = null;
        this.tripStore = window.YanqiTripStore || null;
        this.bookedPackageIds = new Set();
        this.navigationType = getNavigationType();
        this.relatedTransitionTimer = 0;
        this.relatedTransitionCleanupTimer = 0;
        this.relatedStageSwitchTimer = 0;
        this.relatedStageCleanupTimer = 0;
        this.relatedEntryRevealTimer = 0;
        this.inDocumentDetailSwapTimer = 0;
        this.isInDocumentDetailSwapping = false;
        this.relatedStageStableHeight = 0;
        this.pressedRelatedCard = null;
        this.activeRelatedSpotId = this.spotData.related?.[0]?.id || null;
        this.relatedSection = document.getElementById('relatedSpots');
        this.relatedGrid = document.getElementById('relatedGrid');
        this.itineraryList = document.getElementById('itineraryList');
        this.packageMatchTags = document.getElementById('packageMatchTags');
        this.bookingNote = document.getElementById('bookingNote');
        this.reviewsFilters = document.getElementById('reviewsFilters');
        this.reviewsSection = document.getElementById('reviewsSection');
        this.reviewsLiveSummary = document.getElementById('reviewsLiveSummary');
        this.spotReviewsHeading = document.getElementById('spotReviews');
        this.spotMapHeading = document.getElementById('spotMapSection');
        this.reviewsStage = document.querySelector('.reviews-stage');
        this.bookingSticky = document.querySelector('.booking-sticky');
        this.bookingModal = document.getElementById('bookingModal');
        this.bookingModalBody = document.getElementById('bookingModalBody');
        this.bookingModalCloseTimer = 0;
        this.bookingModalMorphRevealTimer = 0;
        this.bookingModalMorphCleanupTimer = 0;
        this.bookingModalMorphGhost = null;
        this.bookingModalDrafts = new Map();
        this.activeBookingSourceCard = null;
        this.bookingConfirmFeedback = document.getElementById('bookingConfirmFeedback');
        this.bookingConfirmCopy = document.getElementById('bookingConfirmCopy');
        this.bookingConfirmMeta = document.getElementById('bookingConfirmMeta');
        this.bookingConfirmGoTrip = document.getElementById('bookingConfirmGoTrip');
        this.bookingConfirmStay = document.getElementById('bookingConfirmStay');
        this.bookingCopy = document.getElementById('bookingCopy');
        this.bookingFocusPanel = document.getElementById('bookingFocusPanel');
        this.bookingFocusState = document.getElementById('bookingFocusState');
        this.bookingFocusOverline = document.getElementById('bookingFocusOverline');
        this.bookingFocusTitle = document.getElementById('bookingFocusTitle');
        this.bookingFocusMeta = document.getElementById('bookingFocusMeta');
        this.bookingFocusPrice = document.getElementById('bookingFocusPrice');
        this.bookingFocusSummary = document.getElementById('bookingFocusSummary');
        this.bookingFocusAction = document.getElementById('bookingFocusAction');
        this.reviewDetailModal = document.getElementById('reviewDetailModal');
        this.reviewDetailBody = document.getElementById('reviewDetailBody');
        this.reviewLightbox = document.getElementById('reviewLightbox');
        this.reviewLightboxImage = document.getElementById('reviewLightboxImage');
        this.reviewLightboxCaption = document.getElementById('reviewLightboxCaption');
        this.mapContainer = document.getElementById('mapContainer');
        this.seaGuide = document.getElementById('seaGuide');
        this.seaGuideTrigger = document.getElementById('seaGuideTrigger');
        this.seaGuidePanel = document.getElementById('seaGuidePanel');
        this.seaGuideEntries = Array.from(document.querySelectorAll('.sea-guide-entry'));
        this.detailScrollMetricRaf = 0;
        this.detailSeaGuideOffset = Number.NaN;
        this.bookingReadingGuideMetrics = [];
        this.bookingReadingGuideSpecialMetrics = {
            reviews: null,
            firstReview: null
        };
        this.seaGuideMetrics = [];
        this.reviewCardMetrics = [];
        this.introSection = document.getElementById('spotOverview');
        this.detailReadingSections = Array.from(document.querySelectorAll('[data-detail-reading-section]'));
        this.detailFooter = document.getElementById('detailFooter');
        this.detailFooterSpotName = document.getElementById('detailFooterSpotName');
        this.detailFooterLead = document.getElementById('detailFooterLead');
        this.detailFooterMurmur = document.getElementById('detailFooterMurmur');
        this.detailFooterClosing = document.getElementById('detailFooterClosing');
        this.detailFooterNextLink = document.getElementById('detailFooterNextLink');
        this.detailFooterNextName = document.getElementById('detailFooterNextName');
        this.detailFooterNextCopy = document.getElementById('detailFooterNextCopy');
        this.relatedLiveSummary = document.getElementById('relatedLiveSummary');
        this.activeSeaView = 'location';
        this.routeAnimationPlayed = false;
        this.seaAtlasResizeStorageKey = 'yanqi_sea_atlas_size';
        this.seaAtlasResizeCleanup = null;
        this.reviewDetailCloseTimer = 0;
        this.reviewLightboxCloseTimer = 0;
        this.bookingConfirmCloseTimer = 0;
        this.packagePriceObserver = null;
        this.relatedTextLayoutController = null;
        this.bookingFeedbackTimer = 0;
        this.seaGuideOpen = false;
        this.seaGuideUpdateRaf = 0;
        this.detailScrollMetricsResizeObserver = null;
        this.footerRevealObserver = null;
        this.relatedRevealObserver = null;
        this.introRevealObserver = null;
        this.reviewsRevealObserver = null;
        this.reviewGalleryPhotoObserver = null;
        this.reviewGalleryPhotoRevealRafId = 0;
        this.bookingCopyObserver = null;
        this.packageTitleObserver = null;
        this.bookingCopyTypeTimers = [];
        this.bookingCopyTypingActive = false;
        this.bookingCopySwapTimers = [];
        this.bookingCopySwapVersion = 0;
        this.bookingCopyResizeObserver = null;
        this.activeBookingGuideKey = this.bookingCopy?.dataset.readingGuideKey || 'overview';
        this.activeBookingFocusPackageId = '';
        this.activeBookingFocusContextKey = '';
        this.bookingFocusSwapTimers = [];
        this.bookingFocusSwapVersion = 0;
        this.bookingFocusPulseTimer = 0;
        this.bookingFocusContextPhaseTimer = 0;
        this.activeReviewLinkedPackageId = null;
        this.bookingStickyScrollTargetTop = 0;
        this.bookingStickyScrollRaf = 0;
        this.hasRenderedReviews = false;
        this.seaGuideInitialized = false;
        this.deferredReviewsHydration = null;
        this.deferredRelatedHydration = null;
        this.deferredFooterHydration = null;
        this.reviewsHydrated = false;
        this.relatedHydrated = false;
        this.footerHydrated = false;
        this.postRenderSyncRaf = 0;
        this.cancelPostRenderIdleSync = () => {};
        this.announceReviewsSummary = createBufferedLiveAnnouncer(this.reviewsLiveSummary);
        this.announceRelatedSummary = createBufferedLiveAnnouncer(this.relatedLiveSummary);
        this.init();
    }

    /**
     * getSpotIdFromUrl() - 从当前地址参数中解析潜点 ID
     * @returns {number} - 当前潜点 ID
     */
    getSpotIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return parseInt(params.get('id'), 10) || 1;
    }

    /**
     * init() - 启动详情页首轮渲染、事件绑定和切换恢复逻辑
     * @returns {void} - 无返回值，直接初始化详情页
     */
    init() {
        this.renderSpotData();
        this.applyIncomingRelatedTransition();
        this.setupEventListeners();
        this.setupSeaGuide();
        this.setupBookingStickyStack();
        this.setupBookingCopyReveal();
        this.setupIntroReveal();
        this.setupReviewsReveal();
        this.setupFooterReveal();
        this.setupFooterNavigation();
        this.setupNavigation();
        this.setupRelatedTransitionLifecycle();
        this.setupRelatedReveal();
    }

    /**
     * destroyDeferredSecondaryHydration() - 清理详情页下半段延迟渲染观察器和空闲任务
     * @returns {void}
     */
    destroyDeferredSecondaryHydration() {
        this.deferredReviewsHydration?.destroy?.();
        this.deferredRelatedHydration?.destroy?.();
        this.deferredFooterHydration?.destroy?.();
        this.deferredReviewsHydration = null;
        this.deferredRelatedHydration = null;
        this.deferredFooterHydration = null;

        if (this.postRenderSyncRaf) {
            window.cancelAnimationFrame(this.postRenderSyncRaf);
            this.postRenderSyncRaf = 0;
        }
        this.cancelPostRenderIdleSync();
        this.cancelPostRenderIdleSync = () => {};
    }

    /**
     * shouldHydrateDeferredSectionImmediately(target, leadRatio) - 判断某个详情页区块是否应立刻完成渲染
     * @param {Element|null} target - 目标区块锚点
     * @param {number} leadRatio - 视口前置比例
     * @returns {boolean}
     */
    shouldHydrateDeferredSectionImmediately(target, leadRatio = 1.2) {
        if (!target) {
            return true;
        }

        const currentHash = window.location.hash || '';
        if (currentHash) {
            try {
                if (target.matches(currentHash) || target.querySelector(currentHash)) {
                    return true;
                }
            } catch (error) {
                // hash 非法时静默降级，继续按视口位置判断。
            }
        }

        const rect = target.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return rect.top <= viewportHeight * leadRatio && rect.bottom >= -viewportHeight * 0.18;
    }

    /**
     * schedulePostRenderSync() - 把详情页首轮测量和阅读联动放到首屏绘制之后
     * @param {{ immediate?: boolean }} options - 是否立即执行
     * @returns {void}
     */
    schedulePostRenderSync(options = {}) {
        const { immediate = false } = options;
        const runSync = () => {
            this.measureDetailScrollMetrics();

            if (this.seaGuideInitialized) {
                this.updateSeaGuideState();
                return;
            }

            this.syncBookingReadingGuide({ force: true, immediate: true });
            this.syncBookingCopyDepthState();
        };

        if (immediate) {
            runSync();
            return;
        }

        if (this.postRenderSyncRaf) {
            window.cancelAnimationFrame(this.postRenderSyncRaf);
        }
        this.cancelPostRenderIdleSync();

        this.postRenderSyncRaf = window.requestAnimationFrame(() => {
            this.postRenderSyncRaf = 0;
            runSync();
        });
        this.cancelPostRenderIdleSync = scheduleIdleTask(() => {
            if (this.postRenderSyncRaf) {
                return;
            }
            runSync();
        }, 1100);
    }

    /**
     * ensureReviewDataReady() - 在真正进入评论区前再构建评论数据，并按潜点做实例内缓存
     * @returns {Array<Object>}
     */
    ensureReviewDataReady() {
        if (this.reviewDataCache.has(this.spotId)) {
            const cachedReviewData = this.reviewDataCache.get(this.spotId);
            this.reviewData = Array.isArray(cachedReviewData) ? cachedReviewData : [];
            return this.reviewData;
        }

        const nextReviewData = this.buildReviewData();
        this.reviewData = Array.isArray(nextReviewData) ? nextReviewData : [];
        this.reviewDataCache.set(this.spotId, this.reviewData);
        return this.reviewData;
    }

    /**
     * ensureReviewsHydrated() - 真正渲染评论区，并在渲染后刷新阅读与导览度量
     * @returns {void}
     */
    ensureReviewsHydrated() {
        if (this.reviewsHydrated) {
            return;
        }

        this.ensureReviewDataReady();
        this.reviewsHydrated = true;
        this.renderReviews();
        this.scheduleDetailScrollMetricsMeasure();
        window.requestAnimationFrame(() => {
            if (this.seaGuideInitialized) {
                this.updateSeaGuideState();
            }
        });
    }

    /**
     * ensureRelatedHydrated() - 真正渲染相关推荐舞台
     * @returns {void}
     */
    ensureRelatedHydrated() {
        if (this.relatedHydrated) {
            return;
        }

        this.relatedHydrated = true;
        this.renderRelatedSpots();
    }

    /**
     * ensureFooterHydrated() - 更新详情页 footer 文案与下一片海入口
     * @returns {void}
     */
    ensureFooterHydrated() {
        if (this.footerHydrated) {
            return;
        }

        this.footerHydrated = true;
        this.renderFooter();
    }

    /**
     * primeDeferredSection(selector) - 在程序化滚动前预热对应的延迟区块
     * @param {string} selector - 目标区块选择器
     * @returns {void}
     */
    primeDeferredSection(selector) {
        if (selector === '#spotReviews' || selector === '#reviewsSection') {
            this.deferredReviewsHydration?.run?.();
            return;
        }

        if (selector === '#relatedSpots') {
            this.deferredRelatedHydration?.run?.();
            return;
        }

        if (selector === '#detailFooter') {
            this.deferredFooterHydration?.run?.();
        }
    }

    /**
     * setupDeferredSecondaryHydration() - 为评论、相关推荐和 footer 建立延迟渲染入口
     * @returns {void}
     */
    setupDeferredSecondaryHydration() {
        const reviewsTarget = this.spotReviewsHeading || this.reviewsStage || this.reviewsSection;
        const relatedTarget = this.relatedSection;
        const footerTarget = this.detailFooter;

        this.deferredReviewsHydration = createDeferredSectionBootstrap(reviewsTarget, () => {
            this.ensureReviewsHydrated();
        }, {
            immediate: this.shouldHydrateDeferredSectionImmediately(reviewsTarget, 1.08),
            rootMargin: '0px 0px 28% 0px',
            threshold: 0.01
        });

        this.deferredRelatedHydration = createDeferredSectionBootstrap(relatedTarget, () => {
            this.ensureRelatedHydrated();
        }, {
            immediate: this.shouldHydrateDeferredSectionImmediately(relatedTarget, 1.14),
            rootMargin: '0px 0px 30% 0px',
            threshold: 0.01
        });

        if (!this.footerHydrated) {
            this.deferredFooterHydration = createDeferredSectionBootstrap(footerTarget, () => {
                this.ensureFooterHydrated();
            }, {
                immediate: this.shouldHydrateDeferredSectionImmediately(footerTarget, 1.08),
                rootMargin: '0px 0px 18% 0px',
                threshold: 0.01,
                enableIdleBootstrap: true,
                idleTimeoutMs: 1800
            });
        }
    }

    /**
     * shouldInterceptDetailAnchorClick(event, anchor) - 判断当前点击是否应由详情页内换海逻辑接管
     * @param {MouseEvent} event - 当前点击事件
     * @param {HTMLAnchorElement|null} anchor - 目标链接
     * @returns {boolean} - 是否应拦截为同页换海
     */
    shouldInterceptDetailAnchorClick(event, anchor) {
        if (
            !anchor ||
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            anchor.target === '_blank' ||
            anchor.hasAttribute('download') ||
            anchor.closest('.related-feature-card')
        ) {
            return false;
        }

        let parsedUrl = null;
        try {
            parsedUrl = new URL(anchor.href, window.location.href);
        } catch (error) {
            return false;
        }

        if (parsedUrl.origin !== window.location.origin) {
            return false;
        }

        const samePath = parsedUrl.pathname === window.location.pathname;
        const targetId = Number(parsedUrl.searchParams.get('id'));
        return samePath && Number.isFinite(targetId) && targetId !== this.spotId;
    }

    /**
     * primeDetailHistoryState() - 给当前详情页 history entry 写入 spotId，方便同页换海时回退
     * @returns {void}
     */
    primeDetailHistoryState() {
        try {
            const currentState = window.history.state && typeof window.history.state === 'object'
                ? window.history.state
                : {};
            window.history.replaceState({
                ...currentState,
                yanqiDetailSpotId: this.spotId
            }, '', window.location.href);
        } catch (error) {
            // 忽略 history 不可写的极少数情况，保留默认浏览器行为。
        }
    }

    /**
     * syncDepthManagerAfterSpotSwap() - 同页换海后让深度计按新页面顶部位置重新接管
     * @returns {void}
     */
    syncDepthManagerAfterSpotSwap() {
        window.requestAnimationFrame(() => {
            if (window.DepthManager && typeof window.DepthManager.queuePageScrollDepthUpdate === 'function') {
                window.DepthManager.queuePageScrollDepthUpdate();
            }
        });
    }

    /**
     * swapSpotContentInDocument(targetId, options) - 在当前详情页文档内切到另一片海，避免整页重载空白帧
     * @param {number} targetId - 目标潜点 ID
     * @param {{ direction?: string, updateHistory?: 'push'|'replace'|'skip', entryClass?: string }} [options={}] - 切换配置
     * @returns {void}
     */
    swapSpotContentInDocument(targetId, options = {}) {
        if (!Number.isFinite(targetId) || targetId === this.spotId) {
            return;
        }

        const {
            direction = targetId > this.spotId ? 'forward' : 'backward',
            updateHistory = 'push',
            entryClass = 'detail-swap-enter'
        } = options;

        const nextSpotData = divingSpotDetails[targetId];
        if (!nextSpotData) {
            window.location.href = `detail.html?id=${targetId}`;
            return;
        }

        if (updateHistory === 'push') {
            try {
                const nextUrl = new URL(window.location.href);
                nextUrl.searchParams.set('id', String(targetId));
                window.history.pushState({
                    yanqiDetailSpotId: targetId
                }, '', nextUrl);
            } catch (error) {
                // history 写入失败时继续更新页面内容，不阻断当前切换。
            }
        } else if (updateHistory === 'replace') {
            this.primeDetailHistoryState();
        }

        if (this.bookingModal?.classList.contains('active')) {
            this.closeBookingModal();
        }
        if (this.reviewDetailModal?.classList.contains('active')) {
            this.closeReviewDetail();
        }
        if (this.reviewLightbox?.classList.contains('active')) {
            this.closeReviewLightbox();
        }
        this.hideBookingConfirmedFeedback({ immediate: true });
        this.clearBookingModalMorph();
        this.clearPressedRelatedCard();
        this.clearBookingCopySwapTimers();
        this.clearBookingFocusSwapTimers();
        this.resetBookingCopySwapState();
        this.resetBookingFocusSwapState();
        this.resetRelatedSwapClasses();
        sessionStorage.removeItem(DETAIL_SWAP_STORAGE_KEY);
        if (this.pageStage) {
            this.pageStage.style.opacity = '0';
            this.pageStage.style.filter = 'blur(0px)';
            this.pageStage.style.willChange = 'transform, opacity, filter';
        }

        this.spotId = targetId;
        this.spotData = nextSpotData;
        this.packageData = [];
        this.reviewData = [];
        this.activeReviewFilter = 'all';
        this.activeReviewLinkedPackageId = null;
        this.selectedPackageId = null;
        this.bookedPackageIds = new Set();
        this.activeRelatedSpotId = nextSpotData.related?.[0]?.id || null;
        this.activeBookingGuideKey = 'overview';
        this.activeBookingFocusPackageId = '';
        this.activeBookingFocusContextKey = '';
        this.bookingModalDrafts = new Map();
        this.relatedStageStableHeight = 0;
        this.relatedGrid?.style.removeProperty('--related-stage-height');
        this.relatedGrid?.style.removeProperty('min-height');

        window.scrollTo(0, 0);
        this.renderSpotData();
        this.updateSeaGuideState?.();
        this.primeDetailHistoryState();
        this.syncDepthManagerAfterSpotSwap();

        this.playRelatedSwapAnimation(entryClass, direction);
        window.requestAnimationFrame(() => {
            if (!this.pageStage) {
                return;
            }

            this.pageStage.style.removeProperty('opacity');
            this.pageStage.style.removeProperty('filter');
            this.pageStage.style.removeProperty('will-change');
        });
    }

    /**
     * startInDocumentDetailSwap(targetId, options) - 以同页换海方式切到另一片详情，减少整页重载带来的断裂
     * @param {number} targetId - 目标潜点 ID
     * @param {{ direction?: string, skipSourceAnimation?: boolean, updateHistory?: 'push'|'replace'|'skip', entryClass?: string }} [options={}] - 切换配置
     * @returns {boolean} - 是否已接管此次切换
     */
    startInDocumentDetailSwap(targetId, options = {}) {
        if (!Number.isFinite(targetId) || targetId === this.spotId || this.isInDocumentDetailSwapping) {
            return false;
        }

        const {
            direction = targetId > this.spotId ? 'forward' : 'backward',
            skipSourceAnimation = false,
            updateHistory = 'push',
            entryClass = 'detail-swap-enter'
        } = options;

        this.isInDocumentDetailSwapping = true;

        const commitSwap = () => {
            this.inDocumentDetailSwapTimer = 0;
            this.swapSpotContentInDocument(targetId, {
                direction,
                updateHistory,
                entryClass
            });

            window.setTimeout(() => {
                this.isInDocumentDetailSwapping = false;
            }, DETAIL_SWAP_DURATION_MS + 80);
        };

        if (skipSourceAnimation) {
            commitSwap();
            return true;
        }

        this.resetRelatedSwapClasses();
        this.playRelatedSwapAnimation('detail-swap-exit', direction);

        this.inDocumentDetailSwapTimer = window.setTimeout(() => {
            commitSwap();
        }, DETAIL_SWAP_NAVIGATE_DELAY_MS);

        return true;
    }

    /**
     * setupInDocumentDetailNavigation() - 让详情页之间的跳转优先在当前文档内完成，减少重载闪烁
     * @returns {void}
     */
    setupInDocumentDetailNavigation() {
        this.primeDetailHistoryState();

        document.addEventListener('click', (event) => {
            const anchor = event.target.closest('a[href]');
            if (!this.shouldInterceptDetailAnchorClick(event, anchor)) {
                return;
            }

            event.preventDefault();
            const targetUrl = new URL(anchor.href, window.location.href);
            const targetId = Number(targetUrl.searchParams.get('id'));
            this.startInDocumentDetailSwap(targetId, {
                direction: targetId > this.spotId ? 'forward' : 'backward'
            });
        }, true);

        window.addEventListener('popstate', () => {
            const targetId = this.getSpotIdFromUrl();
            if (!Number.isFinite(targetId) || targetId === this.spotId || this.isInDocumentDetailSwapping) {
                return;
            }

            this.startInDocumentDetailSwap(targetId, {
                direction: targetId > this.spotId ? 'forward' : 'backward',
                skipSourceAnimation: true,
                updateHistory: 'skip',
                entryClass: 'detail-swap-back-enter'
            });
        });
    }

    // 套餐数据构建：根据当前潜点生成休闲/进阶两组能力匹配套餐及其详情内容。
    /**
     * buildPackageData() - 为当前潜点构建套餐卡和弹层使用的完整套餐数据
     * @returns {Array<Object>} - 套餐数据数组
     */
    buildPackageData() {
        const basePrice = parsePriceValue(this.spotData.priceFrom) || 3980;
        const { name, season, features } = this.spotData;
        const firstWarning = features.warnings[0] || `进入 ${name} 前，请根据当天海况与个人经验调整节奏。`;
        const leisureReentryNote = '若距离上一次下潜已超过 6 个月，首潜会先安排为 check dive / 复习回水，在较浅、友好的点位确认配重、耳压、浮力和基本应急动作；状态稳定后，再决定是否把当天第二潜完整排进去。';
        const advancedReentryNote = '若距离上一次下潜已超过 6 个月，即使证书等级足够，首潜也会先做 check dive，不直接进入代表性流区或主潜线；状态稳定后，再把更完整的点位顺延到后续窗口。';

        return [
            {
                id: 'leisure-1',
                group: '休闲套餐',
                audience: '入门新手 / OW',
                fitTags: ['入门新手', 'OW 友好'],
                name: `温柔下潜 · ${name}的第一眼蓝`,
                mood: `把第一次海底心动，留给更安静、更友好的蓝。`,
                duration: '3天2晚',
                diveSummary: '2次船潜 + 1次体验潜 / 岸潜',
                staySummary: '安静海边酒店',
                mealSummary: '含早餐与欢迎晚餐',
                price: formatPriceValue(basePrice),
                highlights: [
                    `更适合第一次来 ${name} 的潜水者，节奏留得更松一些。`,
                    '酒店与出海之间的切换更轻，潜后有充足休息时间。',
                    '把海底体验和海岛停留感放在同一套节奏里。'
                ],
                reentryNote: leisureReentryNote,
                schedule: [
                    { day: 'Day 1', text: '抵达、入住、装备确认与简短 logbook 核对，傍晚做一次轻量 briefing，让身体和海况都慢慢进入状态。' },
                    { day: 'Day 2', text: `上午先从更友好的点位入水；如果距离上次下潜超过 6 个月，这一潜会作为 check dive / warm-up，状态稳定后再衔接当天第二潜。下午回酒店休息，或视海况补一次轻岸潜。` },
                    { day: 'Day 3', text: '清晨看海面光线，悠闲早餐后返程；若航班时间宽松，可安排短程海边停留。' }
                ],
                includes: ['机场或码头接送', '2次船潜与1次体验潜/岸潜', '双人入住海边酒店', '每日早餐与欢迎晚餐', '基础装备协助与潜前 briefing'],
                excludes: ['潜水保险', '个人升级装备租借', '酒类饮品与个性化餐食', '节假日附加房型升级'],
                lodging: '优先安排安静、干净、离码头不远的海边酒店，房间更偏舒缓与休息感，适合潜后快速回到放松状态。',
                dining: '早餐以热食、热带水果和基础咖啡茶饮为主，欢迎晚餐会安排海鲜或当地风味，也可以提前备注忌口。',
                pace: '每次出海之间都留出明显的休息和回气空间，不追求密集下潜，更在意第一次进入这片海时是否从容。',
                risk: `风险提示：${firstWarning} 若距离上一次下潜超过 6 个月，首潜需先做 check dive / 复习回水。`,
                fitReason: `${name} 的代表性体验并不一定要靠高密度行程完成。对于第一次来的人，更舒展的节奏通常能让海龟、鱼群和光线留下更完整的记忆。`
            },
            {
                id: 'leisure-2',
                group: '休闲套餐',
                audience: 'OW / 度假型潜水者',
                fitTags: ['OW 友好', '慢节奏'],
                name: `慢潜停驻 · ${name}的舒展节奏`,
                mood: '把潜水和度假放在一起，让每一潜之间都能留出呼吸感。',
                duration: '4天3晚',
                diveSummary: '3次船潜 + 1次黄昏轻潜',
                staySummary: '岛上度假酒店',
                mealSummary: '含早餐与两次晚餐',
                price: formatPriceValue(basePrice * 1.18),
                highlights: [
                    '适合已经有 OW，但不想把行程排得太满的人。',
                    `会把 ${season} 的较稳窗口优先用在体验更完整的蓝水和海面时段。`,
                    '酒店舒适度、餐食节奏和潜后恢复感会被放在更前面。'
                ],
                reentryNote: leisureReentryNote,
                schedule: [
                    { day: 'Day 1', text: '抵达入住，潜店做装备确认与路线说明，晚上安排欢迎晚餐。' },
                    { day: 'Day 2', text: `上午第一潜先放在更友好的点位；如果距离上次下潜超过 6 个月，会先做 check dive，再决定是否接第二潜。下午回酒店休息；傍晚视天气安排一趟黄昏轻潜，感受 ${name} 的另一层光线。` },
                    { day: 'Day 3', text: '安排当天状态更好的主潜点，潜后保留完整午后，让潜水和休息保持平衡。' },
                    { day: 'Day 4', text: '早餐后返程，若时间允许可加一段码头散步或短程海景停留。' }
                ],
                includes: ['3次船潜与1次黄昏轻潜', '3晚度假酒店', '每日早餐与2次晚餐', '当地潜导与水面补给', '潜后装备基础清洗'],
                excludes: ['高级相机与摄影向导', '额外房型升级', '未注明正餐', '个人消费与小费'],
                lodging: '住宿更偏度假酒店质感，房间安静、床品舒适，适合上午潜完回来午休，也适合傍晚慢慢看海。',
                dining: '除早餐外，会安排两顿节奏较慢的晚餐，通常包含海鲜和当地口味，适合潜后慢慢补充体力。',
                pace: '潜水密度比入门款略高，但仍保留完整的午后休息和海面停留感，不会把每一天推得过满。',
                risk: `风险提示：${firstWarning} 若距离上一次下潜超过 6 个月，首潜需先做 check dive / 复习回水。`,
                fitReason: `如果你已经有基本经验，但更在意舒适度、海岛停驻感和慢潜节奏，这一档通常比密集潜水更适合把 ${name} 记住。`
            },
            {
                id: 'advanced-1',
                group: '进阶套餐',
                audience: 'AOW / 有近期潜水记录',
                fitTags: ['AOW 推荐', '近期有潜水记录'],
                name: `深蓝进阶 · ${name}主潜线`,
                mood: '把更完整的海况、更深一点的蓝和更成熟的下潜节奏，安排进一次更充实的潜行。',
                duration: '4天3晚',
                diveSummary: '4次船潜 + 进阶点位安排',
                staySummary: '高效潜水向导型酒店',
                mealSummary: '含早餐与船上午餐',
                price: formatPriceValue(basePrice * 1.36),
                highlights: [
                    '更适合已经有 AOW，且近 12 个月有下潜记录的潜水员。',
                    '会优先安排更能体现当地海况和水下层次的主潜点。',
                    '潜水密度更高，回到岸上后的休息时间会比休闲档更紧凑。'
                ],
                reentryNote: advancedReentryNote,
                schedule: [
                    { day: 'Day 1', text: '抵达后做装备、证书和近期记录确认；若 logbook 有明显空档，会先把第二天首潜改成 check dive。傍晚进行更完整的海况 briefing。' },
                    { day: 'Day 2', text: `上午先做节奏确认潜；如果距离上次下潜超过 6 个月，这一潜按 check dive 执行，不直接下 ${name} 的代表性流区。状态稳定后再接第二潜，下午根据体感补一潜或做更深入的路线说明。` },
                    { day: 'Day 3', text: '安排当天窗口更好的主潜线，若海况允许，会把更有层次的点位排进当天。' },
                    { day: 'Day 4', text: '早餐后返程，预留足够水面间隔；若行程允许，可安排短时设备整理与影像备份。' }
                ],
                includes: ['4次进阶船潜', '3晚潜水向导型酒店', '每日早餐与船上午餐', '潜导路线 briefing', '行李与装备搬运协助'],
                excludes: ['高氧、私人向导与摄影位服务', '深潜/高氧专项课程', '航班及保险', '未注明晚餐'],
                lodging: '住宿选择更偏高效出海动线，房间重点是安静、整洁、潜后恢复快，不强调奢华但强调节奏顺畅。',
                dining: '早餐与出海午餐会安排得更贴合潜水节奏，通常以易消化、补充体力和含蛋白食物为主。',
                pace: '这是一条更偏成熟潜水员的主线，行程密度和起潜窗口都会更紧，适合已经熟悉自己节奏的人。',
                risk: `风险提示：${firstWarning} 若距离上一次下潜超过 6 个月，首潜需先做 check dive，不建议直接进入主潜线。`,
                fitReason: `${name} 的核心魅力往往不止停留在第一层蓝水。若你已经有 AOW 和近期经验，这一档更能把当地更完整的海况层次潜出来。`
            },
            {
                id: 'advanced-2',
                group: '进阶套餐',
                audience: 'AOW / 进阶潜水员',
                fitTags: ['AOW 推荐', '海况适应力'],
                name: `更深一层 · ${name}海况延展`,
                mood: '把更成熟的判断、更灵活的窗口和更完整的海底记忆，交给一次真正准备好的下潜。',
                duration: '5天4晚',
                diveSummary: '5次船潜 + 重点窗口追踪',
                staySummary: '靠近出海点的安静酒店',
                mealSummary: '含早餐、欢迎晚餐与潜后补给',
                price: formatPriceValue(basePrice * 1.58),
                highlights: [
                    '给已经熟悉自身用气、节奏和海况应对的人准备。',
                    '会根据当天窗口灵活调整点位，把更值得下去的时段留给主潜。',
                    '更适合把鱼群、大景、流区或更深层次的海况都安排进一次行程。'
                ],
                reentryNote: advancedReentryNote,
                schedule: [
                    { day: 'Day 1', text: '抵达、入住、装备检查与证书确认，潜导会结合近期记录判断是否需要把 Day 2 第一潜改成 check dive。' },
                    { day: 'Day 2', text: `先用一潜把配重、耳压和 ${name} 的水下节奏对齐；若距离上次下潜超过 6 个月，则这一潜按 check dive 执行，状态稳定后再决定是否衔接第二潜与后续窗口。傍晚总结当天海况表现。` },
                    { day: 'Day 3', text: '根据当天能见度、流速和光线窗口安排更深入的主潜点，潜后保留简短恢复期。' },
                    { day: 'Day 4', text: '继续追窗口，必要时替换到更适合当天状态的点位，让行程保持弹性。' },
                    { day: 'Day 5', text: '潜水结束后返程，预留足够水面间隔和缓冲，避免匆忙离开。' }
                ],
                includes: ['5次重点船潜', '4晚安静酒店', '每日早餐、欢迎晚餐与潜后补给', '更细化的海况说明', '视情况调整的点位窗口安排'],
                excludes: ['酒精饮品、专项课程升级费', '摄影灯光与额外设备', '签证、机票与个人保险', '未注明午晚餐'],
                lodging: '住宿仍保持安静和恢复优先，重点是方便第二天早出海，并让潜后洗漱、晾装备和休息更顺手。',
                dining: '早餐稳定，欢迎晚餐会偏当地风味；潜后补给则更注重快速恢复体力，也可提前备注饮食禁忌。',
                pace: '相比其他档位，这一套行程会更依赖天气与海况窗口，也需要潜水员有更好的自我节奏和体能管理。',
                risk: `风险提示：${firstWarning} 若距离上一次下潜超过 6 个月，首潜需先做 check dive；若对流速、深度或连续出海恢复没有把握，也不建议直接选择这一档。`,
                fitReason: `如果你想认真决定怎样更深入地进入 ${name}，而不是只把这里当作一次打卡，这一档会更像一份真正为成熟潜水员准备的海域档案。`
            }
        ];
    }

    /**
     * getPackageFlowPackages() - 按右侧侧栏更适合阅读推进的顺序组织套餐。
     * 不再把同组套餐完全堆在一起，而是按“较浅一层 / 更深一层”交错展开，
     * 让阅读、评论与侧栏联动时更像继续下潜，而不是在两组卡片之间来回折返。
     * @returns {Array<Object>} - 按展示流向排好的套餐数组
     */
    getPackageFlowPackages() {
        if (!Array.isArray(this.packageData) || !this.packageData.length) {
            return [];
        }

        const leisurePackages = this.packageData.filter((pkg) => pkg.group === '休闲套餐');
        const advancedPackages = this.packageData.filter((pkg) => pkg.group === '进阶套餐');
        const maxLength = Math.max(leisurePackages.length, advancedPackages.length);
        const flowPackages = [];

        for (let index = 0; index < maxLength; index += 1) {
            if (leisurePackages[index]) {
                flowPackages.push(leisurePackages[index]);
            }

            if (advancedPackages[index]) {
                flowPackages.push(advancedPackages[index]);
            }
        }

        const usedPackageIds = new Set(flowPackages.map((pkg) => pkg.id));
        return flowPackages.concat(
            this.packageData.filter((pkg) => !usedPackageIds.has(pkg.id))
        );
    }

    /**
     * getReviewPackageFlowIndex() - 根据评论总数与套餐总数，把评论均匀切分到右侧套餐流中。
     * 这样当评论数量多于套餐数量时，不会前三条就把套餐切完，后面一直停在最后一套；
     * 例如 8 条评论对应 4 套套餐时，会自然形成“2 条评论切一次套餐”的节奏。
     * @param {number} reviewIndex - 当前评论索引
     * @param {number} reviewCount - 当前参与映射的评论总数
     * @param {number} packageCount - 当前套餐总数
     * @returns {number} - 当前评论应落到的套餐流索引
     */
    getReviewPackageFlowIndex(reviewIndex, reviewCount, packageCount) {
        const safeReviewIndex = Math.max(0, Number(reviewIndex) || 0);
        const safeReviewCount = Math.max(1, Number(reviewCount) || 0);
        const safePackageCount = Math.max(1, Number(packageCount) || 0);

        if (safeReviewCount <= safePackageCount) {
            return Math.min(safeReviewIndex, safePackageCount - 1);
        }

        return Math.min(
            Math.floor((safeReviewIndex * safePackageCount) / safeReviewCount),
            safePackageCount - 1
        );
    }

    // 评论数据构建：为当前潜点生成评论卡、详情弹层和图片查看所需的完整数据。
    /**
     * attachReviewPackageLinks() - 按评论数量和套餐数量，把评论映射到当前详情页的对应套餐。
     * 评论少时保持“一条评论对应一套套餐”的顺序；评论变多时自动按区间均分，
     * 让右侧焦点舱在长评论流里仍然会持续换挡，而不是过早停在最后一套。
     * @param {Array<Object>} reviews - 原始评论数组
     * @returns {Array<Object>} - 补齐 linkedPackageId 等字段后的评论数组
     */
    attachReviewPackageLinks(reviews) {
        const safeReviews = Array.isArray(reviews) ? reviews : [];
        const flowPackages = this.getPackageFlowPackages();

        if (!safeReviews.length || !flowPackages.length) {
            return safeReviews;
        }

        return safeReviews.map((review, reviewIndex) => {
            const flowIndex = this.getReviewPackageFlowIndex(
                reviewIndex,
                safeReviews.length,
                flowPackages.length
            );
            const linkedPackage = flowPackages[flowIndex] || flowPackages[flowPackages.length - 1] || null;

            return {
                ...review,
                linkedPackageId: linkedPackage?.id || '',
                linkedPackageName: linkedPackage?.name || '',
                linkedPackageGroup: linkedPackage?.group || ''
            };
        });
    }

    /**
     * buildReviewData() - 为当前潜点构建评论区、详情层和图片查看使用的数据
     * @returns {Array<Object>} - 评论数据数组
     */
    buildReviewData() {
        const { name } = this.spotData;
        const finalizeReviews = (reviews) => this.applyReviewRatingVariation(this.attachReviewPackageLinks(reviews));
        const imagePrefix = REVIEW_IMAGE_PREFIX[this.spotId] || 'spot';
        const createReviewPhoto = (reviewNumber, photoKey, caption, position) => ({
            src: `assets/images/${imagePrefix}-review-${reviewNumber}-${photoKey}.jpg`,
            caption,
            position
        });
        const makeReviewPhotos = (reviewNumber, photoDefs) => photoDefs.map((photo) => (
            createReviewPhoto(reviewNumber, photo.key, photo.caption, photo.position)
        ));
        const reviewOnePhotoDefs = this.spotId === 1
            ? [
                { key: 'departure', caption: '诗巴丹 · 龟洞入口', position: '50% 40%' },
                { key: 'return', caption: '诗巴丹 · 鲨鱼', position: '50% 58%' },
                { key: 'sea-at-dusk', caption: '诗巴丹 · 鱼群风暴', position: '50% 32%' }
            ]
            : [
                { key: 'departure', caption: `${name} · 清晨出海`, position: '50% 40%' },
                { key: 'return', caption: `${name} · 午后回船`, position: '50% 58%' },
                { key: 'sea-at-dusk', caption: `${name} · 傍晚海面`, position: '50% 32%' }
            ];

        if (this.spotId === 1) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '先经过那道蓝',
                    date: '2026年3月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['diving', 'scenery'],
                    title: '诗巴丹 · 龟洞入口',
                    subtitle: '真正让人记住诗巴丹的，不只是热闹，而是先被龟洞入口那道忽然亮起来的蓝收住。',
                    summary: '这组图把诗巴丹的开场拍得很准。一边是洞口里被光拉开的水层，一边是鲨鱼贴着沙地慢慢过去。它不是直接把最大声的部分砸过来，而是先让海安静一下，再让你看见压迫感从侧面靠近。',
                    diving: '先经过这种洞口和结构，再遇到鲨鱼，会更能感觉诗巴丹的层次感。不是单点刺激，而是明暗、地形和生物一起把节奏铺开。',
                    stay: '诗巴丹真正舒服的地方，在于岸上准备通常很直接，出海以后很快就能进入状态，不会把精力浪费在多余折返里。',
                    food: '潜后热食和补水会显得格外重要，因为水下记忆太强，身体反而需要被慢慢接回来。',
                    scenery: '洞口那一下的蓝和沙地上的鲨鱼放在一起，会让人明白诗巴丹不是只靠“多”好看，而是靠空间突然被打开。',
                    featurePhoto: createReviewPhoto(1, 'feature', '诗巴丹 · 龟洞入口', '50% 42%'),
                    photos: makeReviewPhotos(1, [
                        { key: 'reef-shark', caption: '诗巴丹 · 鲨鱼从沙地过去', position: '50% 52%' }
                    ])
                },
                {
                    id: 'review-2',
                    user: '鱼群贴得很近',
                    date: '2025年12月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['diving', 'scenery'],
                    title: '诗巴丹 · 鱼群风暴贴到身边',
                    subtitle: '等鱼群不再只是一面墙，而是直接从潜水员身边合拢过来，诗巴丹才真正开始变大。',
                    summary: '这组图最动人的地方，是水下和海面以上的尺度被连在了一起。一边是潜水员几乎被整个鱼群包进去，另一边从空中看见外礁和深蓝一起把这片海围成很清楚的边。诗巴丹那种“海忽然变大”的感觉，就是这样同时发生的。',
                    diving: '比起远远看见鱼墙，更难忘的是自己在里面时仍然能保持节奏。诗巴丹的鱼群不是背景，而是会主动把空间改写掉。',
                    stay: '回到岸上以后，你会需要一点真正安静的时间，把这种高密度的蓝慢慢从身体里放下来。',
                    food: '潜后坐下来喝水、吃点热的东西，反而更能感到刚刚那种鱼群贴脸而过的场面有多强。',
                    scenery: '一张把潜水员留在鱼群正中，一张把鱼墙真正立起来的密度留下来，另一张则从上面把外礁、深蓝和浅色边界一起摊开。它让“鱼群风暴”不只是一堵墙，也是一整片海的轮廓。',
                    featurePhoto: createReviewPhoto(2, 'feature', '诗巴丹 · 鱼群从身边合拢', '50% 48%'),
                    photos: makeReviewPhotos(2, [
                        { key: 'jack-wall', caption: '诗巴丹 · 鱼墙慢慢立起来', position: '42% 52%' },
                        { key: 'atoll-rim', caption: '诗巴丹 · 从空中看见外礁边界', position: '50% 52%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: '风暴还没散',
                    date: '2025年10月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['diving', 'stay', 'scenery'],
                    title: '诗巴丹 · 在鱼墙边继续前进',
                    subtitle: '当鱼群没有立刻散开，而是一路陪着潜水员往前，诗巴丹最著名的那种推力就会一直跟着你。',
                    summary: '最后这组图更像风暴的后半段。一张把珊瑚平台、潜水员和鱼群同时留住，另一张从更远的海面上把浅色礁盘和岛影轻轻托出来。它提醒人，诗巴丹不是只有某一个瞬间最强，而是整段下潜和整片海的形状都会一起留下来。',
                    diving: '这种连续感是诗巴丹最难替代的部分。鱼群、礁坡和人的移动不会被切成几段，而是一直在同一口呼吸里进行。',
                    stay: '真正好的安排，是让人出水以后能马上有地方收拾设备、把刚刚那片海慢慢消化完。',
                    food: '等情绪慢慢落下来以后，再去吃饭和复盘这一潜，记忆反而会更清楚。',
                    scenery: '鱼群、珊瑚平台和潜水员一起入镜，会让诗巴丹的推力变得很具体；而从上面看出去时，浅色礁盘像一道安静的弧线把深蓝切开，又把这股力量重新收回到整片海里。',
                    featurePhoto: createReviewPhoto(3, 'feature', '诗巴丹 · 鱼墙边继续前进', '50% 58%'),
                    photos: makeReviewPhotos(3, [
                        { key: 'school-close', caption: '诗巴丹 · 风暴贴到呼吸边', position: '50% 46%' },
                        { key: 'lagoon-window', caption: '诗巴丹 · 浅色礁盘把深蓝切开', position: '50% 52%' }
                    ])
                }
            ]);
        }

        if (this.spotId === 2) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '先看见第一层蓝',
                    date: '2026年2月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['scenery', 'diving'],
                    title: '帕劳 · 从第一层蓝开始',
                    subtitle: '真正把人带进帕劳的，常常不是下水那一下，而是船先停在一片浅蓝和深蓝交界里。',
                    summary: '这组图很像帕劳的开场：俯拍时小船先被放进珊瑚纹理里，靠岸时白船又停在绿色山体和清水前，最后日落把码头、人影和海面一起收住。它不是急着把蓝洞和转角一次讲完，而是先让你知道这片海连海面以上都很有层次。',
                    diving: '帕劳当然有更强的水下名场面，但真正让人放松下来的是这种进海方式。先在干净的浅蓝里找回节奏，再去理解洞穴、断层和流线，会比一上来就追刺激更完整。',
                    stay: '如果第一天住处和码头离得顺，整趟体验会轻很多。看完这种靠山的停船画面，再在傍晚从栈桥慢慢走回去，身体会比较容易进入帕劳的节奏。',
                    food: '这种海上天色一落下去，晚餐反而会变成很重要的一环。不是因为要吃得多隆重，而是热食、海鲜和一顿安静坐下来的时间，能把出海后的兴奋慢慢收回来。',
                    scenery: '最好看的不是单独哪一张，而是三张之间的关系：珊瑚纹理里的小船、靠山停着的白船、以及橙色晚霞下的栈桥。它们一起把帕劳从“潜点目的地”拉回成一片真正可以进入的海。',
                    featurePhoto: createReviewPhoto(1, 'departure', '帕劳 · 船先停在第一层蓝里', '50% 56%'),
                    photos: makeReviewPhotos(1, [
                        { key: 'return', caption: '帕劳 · 绿山前停着的白船', position: '50% 58%' },
                        { key: 'sea-at-dusk', caption: '帕劳 · 日落把码头慢慢收住', position: '50% 58%' }
                    ])
                },
                {
                    id: 'review-2',
                    user: '住在海湾里面',
                    date: '2025年12月',
                    level: 'OW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['stay', 'scenery', 'diving'],
                    title: '帕劳 · 海湾里的住处',
                    subtitle: '帕劳不是每一眼都往外海推，有些记忆反而发生在近岸这层静水里。',
                    summary: '这组图把帕劳较少被说到的柔和部分拍出来了：一边是棕榈树和白沙围住的翠色海湾，另一边是两条小船停在白沙外侧的浅礁边。比起“刺激”，它更像在告诉你，帕劳的岸线和浅滩本身就已经很完整。',
                    diving: '住在这种海湾边，最大的好处是出海和回程都会很顺。即使主潜点在更外海，回到近岸时看见浅滩和白沙，整个人也会一下子从流线里缓下来。',
                    stay: '房间正对这种被群岛围住的水色，其实会很影响整趟体感。它不是夸张的度假村展示，而是真正让人愿意在潜前潜后多停一会儿的住处。',
                    food: '这种近水的住处很适合把早餐和潜后简餐吃得慢一点。看着海湾颜色一点点变亮或变深，吃什么反而会变成次要的，节奏才是重点。',
                    scenery: '白沙、棕榈、浅礁和停船线离得很近，是这组最迷人的地方。帕劳当然有著名的蓝洞和转角，但这些近岸的浅色层次，会让整趟旅行不只有“下去看海”，也有“回到海边”的感觉。',
                    featurePhoto: createReviewPhoto(2, 'pier-morning', '帕劳 · 住处前是一整片翠色海湾', '50% 50%'),
                    photos: makeReviewPhotos(2, [
                        { key: 'boat-return', caption: '帕劳 · 白沙外侧停着两条小船', position: '48% 52%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: '岛影把风慢下来',
                    date: '2025年10月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['scenery', 'stay'],
                    title: '帕劳 · 群岛和石门之间',
                    subtitle: '真正的帕劳不只是一道蓝洞入口，很多时候，它先用岛影和石灰岩把视线慢慢排开。',
                    summary: '这一组几乎把帕劳的地貌气质说明白了：远处是一连串圆润的石灰岩群岛，近一点又出现一座像被海风掏开的天然石门，最后连住处也贴着安静水面排开。它让人明白，帕劳的“结构感”不只在水下，也在海面以上持续存在。',
                    diving: '如果水下看的是洞穴和断层，那么海面上这组地貌就是最自然的前情提要。你会更容易理解为什么帕劳的潜点总带着一种被切开的空间感。',
                    stay: '房间直接朝水展开这件事很重要。潜完回来，不需要再找一个“补景点”，岸边这层安静反射和成排屋顶就已经能把人慢慢接住。',
                    food: '这类行程最适合把晚餐放在天快暗的时候。白天看过群岛和石门以后，再在靠水的位置坐下来吃一顿热的，整片海会从大景慢慢变成很私人的记忆。',
                    scenery: '我最喜欢的是这组三张图都在讲“轮廓”：群岛的起伏、石门中间被掏空的那道弧线、还有屋檐和棕榈在水面的倒影。帕劳的好看并不喧哗，它总是靠形状先留下来。',
                    featurePhoto: createReviewPhoto(3, 'before-dinner', '帕劳 · 群岛把海面一层层排开', '50% 52%'),
                    photos: makeReviewPhotos(3, [
                        { key: 'pier-breeze', caption: '帕劳 · 石门把海风穿过去', position: '50% 54%' },
                        { key: 'room-view', caption: '帕劳 · 房间朝着安静水面', position: '50% 54%' }
                    ])
                },
                {
                    id: 'review-4',
                    user: '早上的浅滩很轻',
                    date: '2025年8月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['scenery', 'diving', 'stay'],
                    title: '帕劳 · 清晨浅滩与靠岸前后',
                    subtitle: '有些记忆不在主潜点，而在船靠岸前那层亮起来的浅水和椰影下突然打开的蓝。',
                    summary: '最后这组图更像帕劳每天最轻的一段时间：高处看见浅滩和短码头把深蓝切开，靠岸时白船停在草绿山体前，另一张又把椰影、云和开阔水面一起放得很松。比起强调动作，它更像是在说，帕劳连休息和移动的空档都很值得被记住。',
                    diving: '真正好的外海行程，不会只有主潜线好看。回程时看见这种浅滩和岸线，反而会更清楚地感觉自己刚刚从另一层更深的蓝里回来。',
                    stay: '如果住处附近就能看见这种清透浅水，潜后恢复会很自然。你不需要再做什么安排，只要站在岸边看一会儿，身体就会慢慢松下来。',
                    food: '清晨出海前或下午回来后，这样的海景很适合配一顿简单但稳的餐。比起热闹，它更像让人把体力和情绪都轻轻放回原位。',
                    scenery: '这组三张图几乎把帕劳的蓝拆成了三层：浅滩的奶蓝、岛边的青蓝、外侧更深的海。再加上白船、短码头和椰影，帕劳那种“既开阔又被群岛轻轻收住”的感觉就很完整了。',
                    featurePhoto: createReviewPhoto(4, 'morning-sea', '帕劳 · 清晨浅滩把深蓝切开', '64% 48%'),
                    photos: makeReviewPhotos(4, [
                        { key: 'after-dive-pier', caption: '帕劳 · 靠岸前的白船和山体', position: '50% 56%' },
                        { key: 'bow-blue', caption: '帕劳 · 椰影下突然打开的蓝', position: '50% 52%' }
                    ])
                }
            ]);
        }

        if (this.spotId === 3) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '先去那圈深蓝',
                    date: '2026年2月',
                    level: 'AOW / 进阶',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['diving', 'scenery'],
                    title: '大蓝洞 · 先从长航程出海开始',
                    subtitle: '真正把人带进这条伯利兹航线的，不是入水那一下，而是天还没全亮时，木栈桥、平水面和那段慢慢离岸的时间。',
                    summary: '这组图最像去大蓝洞那天的完整开场。海面还很平，栈桥和天光都压得很低；等真正到外海，看见那一圈深蓝终于被浅礁衬出来，整趟出海才会忽然有了中心。回程不是立刻结束，而是又经过椰影、浅水和傍晚码头，把这段很长的海路慢慢收住。',
                    diving: '大蓝洞当然是为了那一下垂直深蓝去的，但真正舒服的节奏，反而靠岸上的前后段把它托住。先在安静的海面里把状态调稳，再去面对深井结构，整个人会更从容。',
                    stay: '如果前一晚就住在离出海口很近的地方，这条线会轻很多。清晨不用被交通和换点打断，回来以后也能把那片深蓝顺顺地带回岸上。',
                    food: '这种长航程日子，早餐和回程后的热食都比平时重要。它们不是行程装饰，而是把身体从早起、日晒和深潜里重新接回来的那一段。',
                    scenery: '最动人的其实是两层蓝的关系：一层是蓝洞那种近乎纯色的深蓝，一层是码头、浅滩和傍晚海面的低饱和亮蓝。它们放在一起，大蓝洞才不只是一个点，而是一整条慢慢潜进去又慢慢浮回来的海线。',
                    featurePhoto: {
                        src: 'assets/images/blue-hole.jpg',
                        caption: '大蓝洞 · 外海那一圈深蓝终于显出来',
                        position: '50% 68%'
                    },
                    photos: makeReviewPhotos(1, [
                        { key: 'departure', caption: '伯利兹 · 出海前的平静栈桥', position: '50% 58%' },
                        { key: 'return', caption: '伯利兹 · 回到浅水和椰影边', position: '50% 54%' },
                        { key: 'sea-at-dusk', caption: '伯利兹 · 傍晚把长航程慢慢收住', position: '50% 56%' }
                    ])
                },
                {
                    id: 'review-2',
                    user: '浅水先把人接住',
                    date: '2025年12月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['stay', 'diving', 'scenery'],
                    title: '大蓝洞 · 靠岸前后的浅水',
                    subtitle: '真正让这条深潜线不显得过于绷紧的，是返程时那些奶蓝色浅水、短栈桥和停得很近的小船。',
                    summary: '第二组图没有去强调蓝洞主体，而是在讲它回来以后为什么还会让人记很久。船停在很浅的水边，码头不大，风也不急，身体会在这种近岸层次里慢慢把刚才那段更深的压力卸掉。它会提醒你，大蓝洞不是只在外海突然发生的一下，返程这段浅水也属于这次体验。',
                    diving: '对大蓝洞来说，这种近岸段很重要。因为主潜点本身偏深、偏克制，回到浅水时你会更清楚地感觉自己刚刚经历的是另一种完全不同的蓝。',
                    stay: '住处如果就在这种码头和小船旁边，整趟行程会有一种被轻轻接住的感觉，不会只剩下“今天完成了一个著名潜点”的用力感。',
                    food: '这种画面很适合接一顿不着急的午后餐或回程简餐。海风不大，光线又亮，整个人会愿意把节奏放下来，而不是急着进入下一个安排。',
                    scenery: '我喜欢的是小船、短栈桥和浅水之间没有被拉得很远。它让大蓝洞这条线不只是外海地标，也有伯利兹近岸那种很轻、很通透的余白。',
                    featurePhoto: createReviewPhoto(2, 'boat-return', '伯利兹 · 小船停在浅水回程边', '50% 54%'),
                    photos: makeReviewPhotos(2, [
                        { key: 'pier-morning', caption: '伯利兹 · 码头晨光还没完全亮起来', position: '50% 58%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: '岸上那段风',
                    date: '2025年10月',
                    level: 'OW / 同行不潜',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.7 / 5',
                    focus: ['stay', 'food', 'scenery'],
                    title: '大蓝洞 · 回来以后住在海边',
                    subtitle: '这条线如果只记蓝洞本身，会少掉一半。排椅、木桥和房间外那层风，才是把深蓝慢慢收回日常里的地方。',
                    summary: '第三组图更像回到伯利兹岸上之后的后半天。白色排椅和棕榈把午后的光放得很亮，另一张木栈桥又把风和水面拉得很直，最后连房间外的小路都直接通向海边。大蓝洞这类长航程深潜，真正珍贵的不是一直保持兴奋，而是回来以后还有地方可以慢慢坐下。',
                    diving: '潜水本身当然有强烈的地貌记忆，但如果岸上没有这样一段缓冲，整趟体验会显得过于陡。蓝洞舒服的地方，是它允许人从深蓝再慢慢回到更松的海边生活。',
                    stay: '这组图把住处的重要性拍得很准。不是豪华感，而是潜后真的能走回一个有树影、步道和海风的位置，让身体慢慢回稳。',
                    food: '潜后那顿饭往往就发生在这样的光线里。不是热闹庆祝，而是海风从排椅和木桥边穿过去，你吃得慢一点，整天的记忆才会真正沉下来。',
                    scenery: '如果蓝洞本身像一个突然向下打开的句号，那岸上这几张图就是它后面的留白。它们不抢戏，却会把这片海留得更久。',
                    featurePhoto: createReviewPhoto(3, 'room-view', '伯利兹 · 房间外直接通向海边', '50% 50%'),
                    photos: makeReviewPhotos(3, [
                        { key: 'before-dinner', caption: '伯利兹 · 午后排椅和海风', position: '50% 56%' },
                        { key: 'pier-breeze', caption: '伯利兹 · 木桥把晚风慢慢拉长', position: '50% 58%' }
                    ])
                },
                {
                    id: 'review-4',
                    user: '回程里的蓝',
                    date: '2025年8月',
                    level: 'AOW / 摄影',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['scenery', 'diving'],
                    title: '大蓝洞 · 蓝不会只停在井口',
                    subtitle: '真正留下来的，常常不是那一个圆，而是回程途中那些被船尾、水纹和近岸小船继续拆开的蓝。',
                    summary: '最后这组图很适合做大蓝洞的收尾：一张从高处看，小船像被放进一整片通透浅蓝里；一张是红色小船靠在岸边，海和沙都静下来；最后只剩水纹本身，把颜色推到很近。看完这组会更明白，大蓝洞的记忆不会只停在“那个圆”，它会继续留在整片伯利兹海面的纹理里。',
                    diving: '真正好的蓝洞行程，不会让深潜体验在出水后立刻断掉。回程看见这种浅蓝和水纹时，你会觉得自己还没有完全离开那片海，只是从更深的一层慢慢浮回来。',
                    stay: '这种回到岸边的小船和空水面，会让人很想在潜后把时间再留一点给自己。哪怕只是回酒店冲洗完、重新走到海边看一会儿，也会比匆忙结束更像这条线真正的收尾。',
                    food: '这组更适合放在潜后傍晚或第二天清晨的节奏里。吃不需要很重，重要的是让海的颜色继续停一会儿，不要太快把自己从这趟出海里抽离。',
                    scenery: '最喜欢的是颜色被拆成了三种方式：俯拍时像一整片玻璃蓝，岸边时又变成更轻的灰蓝，最后只剩水纹本身在发亮。它们比“著名景点”更安静，却更像真正会留在身体里的海。',
                    featurePhoto: createReviewPhoto(4, 'bow-blue', '伯利兹 · 回程里的整片玻璃蓝', '50% 50%'),
                    photos: makeReviewPhotos(4, [
                        { key: 'after-dive-pier', caption: '伯利兹 · 小船把潜后时间停在岸边', position: '50% 54%' },
                        { key: 'morning-sea', caption: '伯利兹 · 水纹把蓝继续轻轻推开', position: '50% 54%' }
                    ])
                }
            ]);
        }

        if (this.spotId === 5) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '云层下面',
                    date: '2026年3月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['scenery', 'diving'],
                    title: '波纳佩岛 · 从机窗开始下潜',
                    subtitle: '先看见泻湖、礁线和低云，身体才会慢慢跟上这片海的节奏。',
                    summary: `这组三张图把 ${name} 的开场讲得很准: 先从机窗看见泻湖把岛体轻轻托住，再看到礁线把深浅蓝慢慢分开，最后连低云和雨都压到海面上。它不会一上来就用最热闹的潜点抓人，而是先让你知道，这是一座海、岛和天气一直缠在一起的地方。`,
                    diving: `${name} 不太像那种一入水就要立刻追着大场面跑的海。先在这种泻湖和礁线关系里把呼吸放稳，再去看静水、微距和浅礁细节，整个人会更容易对上它的节奏。`,
                    stay: '如果抵达后的住处离海湾不远，第一天会很舒服。看完这种低云压海的画面，再慢慢去休息、整理装备、等身体跟上岛上的湿热，旅程会显得特别顺。',
                    food: '这组最适合接一顿热的简餐。不是为了丰盛，而是让人从航程、潮湿空气和海色里慢慢落下来，不要太快把自己从刚进入这片海的感觉里抽离。',
                    scenery: `最喜欢的是三张图把 ${name} 的海拆成了三种方式: 泻湖像一整片亮开的留白，礁线把深浅蓝轻轻推开，雨云又把海面压回更安静的一层。`,
                    photos: makeReviewPhotos(1, [
                        { key: 'lagoon-arrival', caption: `${name} · 从机窗看见第一层泻湖`, position: '50% 52%' },
                        { key: 'reef-band', caption: `${name} · 礁线把深浅蓝慢慢推开`, position: '50% 50%' },
                        { key: 'rainy-sea', caption: `${name} · 低云把海面压得更安静`, position: '50% 52%' }
                    ])
                },
                {
                    id: 'review-2',
                    user: '岛体慢慢靠近',
                    date: '2025年12月',
                    level: 'OW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['stay', 'scenery', 'diving'],
                    title: '波纳佩岛 · 靠近岛体的时候',
                    subtitle: '从外海回望和真正靠岸，是两种不同的安静。',
                    summary: `第二组图更像 ${name} 真正把人留住的方式: 一张是在外海远远看见岛体自己浮出来，另一张则已经靠到岸线边，山、树和海水都贴得很近。你会发现这里最动人的不是某一个潜点名字，而是岛一直带着很厚的陆地感和潮湿感。`,
                    diving: `${name} 的潜水不会把人一下扔进最深的节奏里。很多时候，先看到岛影从远处慢慢靠近，反而更容易理解这里为什么适合慢潜和静水观察，因为整片海本来就不是急着往外推的类型。`,
                    stay: '如果住处离这种岸线和海湾很近，潜前潜后都会轻很多。你不会觉得自己只是去一个码头上下船，而是真的住在一座被海和雨林包围的岛上。',
                    food: '这种靠岸感很适合接早餐或者潜后热汤。坐下来时，山体和海面还留在眼前，吃什么会变得次要，真正留下来的是整个人被轻轻接住的感觉。',
                    scenery: `我最喜欢的是这组把“远”和“近”放在了一起: 远处看岛像一整块安静的深色轮廓，靠岸以后又变成树影、岸线和低饱和海水慢慢贴近身体。`,
                    photos: makeReviewPhotos(2, [
                        { key: 'island-outline', caption: `${name} · 从外海回望整座岛体`, position: '50% 54%' },
                        { key: 'shoreline-rest', caption: `${name} · 靠岸以后海和树都压得很近`, position: '50% 48%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: '岸上还有水声',
                    date: '2025年10月',
                    level: '同行不潜',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.7 / 5',
                    focus: ['stay', 'food', 'scenery'],
                    title: '波纳佩岛 · 红树林与雨林的后半天',
                    subtitle: '这座岛不会把海停在海边，红树林、水道和瀑布会把潮湿感继续往里带。',
                    summary: `第三组图把 ${name} 和普通海岛潜旅区分开了: 先是红树林边的静水通道，再是雨林里的瀑布，最后石墙和水道把时间压得更慢。你会发现这趟行程并不只有下潜，岸上的潮湿空气、淡水和石头也一直在参与。`,
                    diving: `如果白天做的是慢潜、微距或比较轻的静水观察，岸上这层安静会把节奏托得更稳。不是每一刻都要往海里更深处去，${name} 很特别的一点，就是你回到陆地以后，旅程也没有立刻断掉。`,
                    stay: '住处最好离海湾和绿意近一点。潜后回来，哪怕只是沿着红树林边走一段，或者在雨林气味还很重的傍晚坐一会儿，身体都会比匆忙回房更容易松下来。',
                    food: '这种气候特别适合把潜后热汤、热茶和简单晚餐吃得慢一点。外面有水声，空气里又带着雨林湿气，整个人会自然愿意把当天的节奏收长一点。',
                    scenery: `红树林的静水、瀑布边的白水和石墙间的水道，把 ${name} 从一片海扩成了一整座岛。它不只是蓝，也有绿色、灰黑石头和一直没停过的潮湿空气。`,
                    photos: makeReviewPhotos(3, [
                        { key: 'mangrove-channel', caption: `${name} · 红树林边的静水通道`, position: '50% 52%' },
                        { key: 'forest-fall', caption: `${name} · 雨林把淡水慢慢送下来`, position: '50% 50%' },
                        { key: 'stone-water', caption: `${name} · 石墙和水道把时间压低`, position: '50% 48%' }
                    ])
                },
                {
                    id: 'review-4',
                    user: '石墙之间的潮水',
                    date: '2025年8月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['scenery', 'diving', 'stay'],
                    title: '波纳佩岛 · 南马都把海留得更深',
                    subtitle: '真正让波纳佩在记忆里沉下去的，往往不是一潜，而是石墙和潮水之间那种更古老的安静。',
                    summary: `最后这组图把 ${name} 最深的一层留给了南马都: 一张是低而静的水道，一张是树影压在石墙上的遗址内部，最后一张把巨石结构本身慢慢展开。看到这里会明白，波纳佩真正留下来的，不只是海水颜色，而是海和时间一起沉下去的感觉。`,
                    diving: `${name} 的潜水本来就更适合放慢呼吸，所以回到这种石墙与潮水之间的空间时，会特别容易把水下那种安静继续带上来。它不靠强刺激收尾，而是让整趟旅程往更深的停驻里落。`,
                    stay: '如果把南马都排进休息日或潜后较轻的时段，整趟体验会更完整。你不会觉得自己在补一个景点，而是像从海的表层继续往下潜到另一种更古老的水域里。',
                    food: '这组最适合接潜后傍晚或休息日的热食。不是要热闹庆祝，而是让石头、水道和树影留下来的那种安静，继续陪你把一天慢慢收住。',
                    scenery: `我最喜欢的是这三张图几乎都没有在用力展示什么: 水很浅，石头很重，树影也不喧哗，但它们会把 ${name} 变成一片真的有余韵的海，而不只是一个潜水目的地。`,
                    photos: makeReviewPhotos(4, [
                        { key: 'quiet-canal', caption: `${name} · 南马都的低水道先把声音放轻`, position: '50% 52%' },
                        { key: 'ruins-shadow', caption: `${name} · 树影压在石墙上的那一层静`, position: '50% 46%' },
                        { key: 'basalt-echo', caption: `${name} · 巨石结构把海留得更深`, position: '50% 50%' }
                    ])
                }
            ]);
        }

        if (this.spotId === 8) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '海面以下',
                    date: '2026年2月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['scenery', 'diving'],
                    summary: `这组三张图更像 ${name} 真正的开场：先从贴着蓝水的船头离岸，回程再落回白沙和浅滩边，最后傍晚海面把整天慢慢收平。它不是一上来就用最热闹的场面抓人，而是先让你知道，这片海连出发和回来的空档都很有层次。`,
                    diving: `${name} 真正迷人的地方，不只是某一潜看见了什么，而是你会先被这种出海尺度带进去。船先往通道外的蓝里走，再从近岸浅水慢慢回来，水下那种等流、等光、等鱼群靠近的心态，也会自然很多。`,
                    stay: '如果住处离这种近岸浅水和回船点不远，整趟体验会轻很多。潜完回来不用再赶，冲洗、休息、坐一会儿看海，都像是同一段节奏里的延续。',
                    food: '最适合接这组图的，反而是一顿安静的潜后晚餐。不是为了隆重，而是让热食和海风一起把白天那层亮蓝慢慢收住。',
                    scenery: `最动人的是三张图之间的关系：船头先把人推向外海，白沙和低水位又把视线收回近岸，最后只剩日落压在平静海面上。${name} 的美不是喧哗型的，它总是慢慢排开，再慢慢收住。`,
                    photos: makeReviewPhotos(1, [
                        { key: 'departure', caption: `${name} · 船头先往亮蓝里去`, position: '50% 40%' },
                        { key: 'return', caption: `${name} · 回到白沙和浅滩边`, position: '50% 58%' },
                        { key: 'sea-at-dusk', caption: `${name} · 日落把海面慢慢收平`, position: '50% 32%' }
                    ])
                },
                {
                    id: 'review-2',
                    user: '礁线记录员',
                    date: '2025年12月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['stay', 'scenery', 'diving'],
                    summary: `第二组图把 ${name} 更私人的一面拍出来了：住处和泻湖离得很近，水面一直很平，另一张小船就停在一层通透的浅蓝里。整趟体验不像只是在赶去潜点，更像先住进海边，再从这里慢慢出发。`,
                    diving: `通道和海流当然是这片海的重点，但每天真正让人状态对上的，反而是这种从住处前的静水到出海小船之间的过渡。不是一上来就紧，而是先被干净的浅蓝轻轻接住。`,
                    stay: '这组最能说明住处的重要性。屋檐、棕榈和水边靠得很近，不像为了展示而摆出来的度假村，更像潜水员真会在这里慢慢住上几晚。',
                    food: '早餐或潜后简单吃点热的，如果就在这种贴着水边的位置，会比餐食本身更容易留下来。因为光线和海面一直在眼前，人不需要从海里抽离得太快。',
                    scenery: `一张是屋檐贴着泻湖展开，一张是小船停在玻璃蓝里。它们一起把 ${name} 从“远一点的海域”拉回成可以真正住进去的海边日常。`,
                    photos: makeReviewPhotos(2, [
                        { key: 'pier-morning', caption: `${name} · 住处前的静水`, position: '50% 40%' },
                        { key: 'boat-return', caption: `${name} · 小船停在浅蓝里`, position: '50% 58%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: '晚风里的海',
                    date: '2025年10月',
                    level: '同行不潜',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.7 / 5',
                    focus: ['stay', 'scenery', 'food'],
                    summary: `第三组没有去强调出海动作，而是在讲 ${name} 怎么把人慢慢留在岸上：浅滩边的鸟、靠着防波堤停住的小船、还有从房间里直接看见的海。这种安静比很多“著名场面”更像真正住在这里的记忆。`,
                    diving: `如果同行的人安排去通道潜，这种岸上的安静反而会把整趟节奏托得更稳。不是每一刻都要在海里往前冲，${name} 难得的地方，是有人在外海下潜，也有人能在岸上慢慢等那阵风和光回来。`,
                    stay: '房间最好的地方，是海一直没有被关在外面。窗帘一拉开就是水面，潜后回来坐一会儿，不需要额外安排，整个人就会慢慢松下来。',
                    food: '晚餐前先去浅滩边走一会儿，再回到房间附近吃一顿热的，这种节奏会比菜单本身更让人记得住。因为这片海不是催着你前进，而是一直让你慢下来。',
                    scenery: `我最喜欢的是这组三张图都不喧哗：岸边的鸟、小船停住的防波堤、窗帘拉开后那一整片浅蓝。它们不像景点打卡，更像真正住在 ${name} 的后半天。`,
                    photos: makeReviewPhotos(3, [
                        { key: 'before-dinner', caption: `${name} · 浅滩边的晚光`, position: '50% 40%' },
                        { key: 'pier-breeze', caption: `${name} · 防波堤外停着的小船`, position: '50% 58%' },
                        { key: 'room-view', caption: `${name} · 拉开窗帘就是海`, position: '50% 32%' }
                    ])
                },
                {
                    id: 'review-4',
                    user: '深蓝留白',
                    date: '2025年8月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['scenery', 'diving', 'stay'],
                    summary: `最后这组更像把 ${name} 的蓝拆开来看：一张是在船头贴着外海走，一张是回到树影和浅水边，另一张从高处把整片泻湖的亮蓝摊开。它会让人明白，这里真正留下来的不只是某一潜，而是你一整天都在不同深浅之间来回移动。`,
                    diving: `${name} 的潜水确实有通道和流，但真正舒服的方式不是一直绷着，而是让自己跟着船和水色慢慢进入状态。看见这种外海蓝、近岸浅蓝和高处的环礁层次时，会更明白为什么这片海需要耐心。`,
                    stay: '如果住处能让你在回程后很快重新走到水边，这种蓝就不会在出水那一刻断掉。树影、浅滩和很短的回岸路，会让整趟体验显得特别完整。',
                    food: '这种海很适合把早餐和潜后简餐都吃得慢一点。不是为了丰盛，而是因为每次抬头都还能看见不同层次的蓝，节奏自然就会放下来。',
                    scenery: `我最喜欢的是这组三张图把 ${name} 的空间关系讲清楚了：船头在深蓝边推进，岸边把人接回树影和浅水里，高处又把整片环礁重新展开。它不是单点风景，而是一整片海的呼吸。`,
                    photos: makeReviewPhotos(4, [
                        { key: 'bow-blue', caption: `${name} · 船头先往亮蓝里去`, position: '50% 40%' },
                        { key: 'after-dive-pier', caption: `${name} · 回到树影和浅水边`, position: '50% 58%' },
                        { key: 'morning-sea', caption: `${name} · 高处看见一整片浅蓝`, position: '50% 32%' }
                    ])
                }
            ]);
        }

        if (this.spotId === 10) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '和蝠鲼擦身而过',
                    date: '2026年2月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['diving', 'stay', 'scenery'],
                    title: '马尔代夫船宿 · 与蝠鲼同潜',
                    subtitle: '真正把人拉进这条船宿线里的，往往不是登船那一刻，而是第一次在蓝水里看见它从身边掠过去。',
                    summary: '这组图里最直接的一张，就是蝠鲼从潜水员头顶掠过去的那一刻。马尔代夫船宿当然会先用水下把人打动，但真正让这趟旅程变完整的，是你回到船上以后没有立刻从海里掉出来，而是继续在一条会移动的船上住下、休息、再准备下一潜。',
                    diving: '马代这条线最难忘的，往往就是这种和大体型生物同处一片蓝水里的时刻。不是一直追着刺激跑，而是在沙地和清水里慢慢等它靠近，那种压迫感和安静感会一起留下来。',
                    stay: '客舱比我原本想象得更舒展，床、木地板和窗边留白都很完整。潜完回来以后能直接回到一个像真正房间一样的空间里，这件事会让船宿的体感从“连续出海”变成“真的住在海上”。',
                    food: '船上的三餐还是偏照顾潜水员节奏的路线，热食、水果和汤都来得很及时。它不是华丽型的用餐记忆，但会把身体接得很稳，让人有力气继续下一段海况。',
                    scenery: '最打动我的反而是两种画面靠得很近: 一张是蓝水里巨大的蝠鲼，另一张是回到船舱后安静下来的木色和床。船宿真正迷人的地方，就是海下和海上的生活不会被切断。',
                    featurePhoto: createReviewPhoto(1, 'feature', '马尔代夫船宿 · 与蝠鲼同潜', '56% 36%'),
                    photos: makeReviewPhotos(1, [
                        { key: 'deck-first-light', caption: '马尔代夫船宿 · 船上的客舱', position: '54% 48%' }
                    ])
                },
                {
                    id: 'review-2',
                    user: '船上的白天',
                    date: '2025年12月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['stay', 'food', 'scenery'],
                    title: '马尔代夫船宿 · 白天的公共区',
                    subtitle: '真正把节奏拉顺的，不只是潜导和航线，还有这些潜前潜后可以慢慢停一下的公共空间。',
                    summary: '这两张图把船上的白天拍得很准确: 一边是半露天的船尾休息区，大家可以坐着等风、说话、看海；另一边是室内公共沙龙，光线很亮，沙发也足够松弛。船宿不像一直在赶潜点，更像在同一条海上生活线里来回进出。',
                    diving: '有这些公共区以后，潜水前后的状态会被照顾得更完整。brief 不会显得仓促，回船以后也不是马上散掉，而是自然地在船尾或室内继续把这一潜消化完。',
                    stay: '很多人会以为船宿公共区只是“能坐一下”，但这条船看起来更像真的把日常停驻考虑进去了。半露天区和室内沙龙都不局促，所以连续住几天也不会觉得被空间压住。',
                    food: '餐和茶点大概率也会在这些区域前后接上。对船宿来说，真正舒服的不是某一道菜，而是潜完以后有地方慢慢坐下、喝点东西、把身体收回来。',
                    scenery: '这类空间最好的地方，是海不会被关在外面。船尾的风、室内窗边的亮光、坐着时还能看见的海平线，都会让船宿比普通酒店更有“海一直在旁边”的感觉。',
                    photos: makeReviewPhotos(2, [
                        { key: 'dhoni-boarding', caption: '马尔代夫船宿 · 半露天船尾休息区', position: '52% 50%' },
                        { key: 'blue-channel', caption: '马尔代夫船宿 · 白天的公共沙龙', position: '50% 48%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: '风从上层来',
                    date: '2025年10月',
                    level: 'OW',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.7 / 5',
                    focus: ['stay', 'scenery'],
                    title: '马尔代夫船宿 · 上层甲板',
                    subtitle: '白色甲板、泡池和离水面更远一点的风，会把船宿的停驻感慢慢托出来。',
                    summary: '这张图不是水下，也不是房间，而是船最松弛的一层。上到顶层以后，视线会一下子打开，白色甲板和泡池把整条船变得很轻，潜后那种还没完全收住的身体，也会在这里慢慢回到平稳。',
                    diving: '真正好的船宿，不会让潜水只剩下“下去、上来、换下一站”。像这样的上层甲板，会把每一潜之间留出呼吸，让整天的节奏更像慢慢排开的海流，而不是被行程推着走。',
                    stay: '船上有这种完全朝海打开的空间，其实很重要。它让人不会总被关在舱内，而是能在白天风平的时候走上去，把目光重新放远，住起来就会轻很多。',
                    food: '哪怕只是带一杯水或者潜后简单吃点东西上来坐一会儿，也会比一直待在室内舒服很多。船宿里很多真正放松的瞬间，反而都发生在这种没有太多安排的甲板空档里。',
                    scenery: '这张图里最动人的不是设施本身，而是白色、海面和远处岛影靠在一起的那种开阔感。它会让人记住，船宿不只是“住在船上”，而是真的一直漂在海中间。',
                    photos: makeReviewPhotos(3, [
                        { key: 'sundeck-tea', caption: '马尔代夫船宿 · 上层甲板的泡池', position: '50% 56%' }
                    ])
                },
                {
                    id: 'review-4',
                    user: '夜里回到船里',
                    date: '2025年8月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['stay', 'scenery'],
                    title: '马尔代夫船宿 · 傍晚以后',
                    subtitle: '等光线慢慢退下去，船上的白色甲板会安静下来，室内的木色和灯光再把一天收住。',
                    summary: '这一组更像船宿真正的后半段: 天还没完全黑时，上层甲板对着海先留下一片安静的白；再晚一点回到室内，灯光、走道和休息区会把白天那些下潜记忆慢慢收拢。马代船宿真正让人留恋的，往往就是这种“海和生活一起慢下来”的收尾方式。',
                    diving: '船宿厉害的地方，是水下强烈的部分不会在出水后立刻断掉。到了傍晚，你还会带着白天那片蓝回到甲板和室内区，所以整天不会被切成零碎的几潜。',
                    stay: '夜里的室内区看起来安静、稳定，而且有很明显的木色温度。对连续住在船上的人来说，这种从海风切回灯光的落差，会让休息变得特别具体，也更容易真正放松下来。',
                    food: '晚饭后的记忆通常也会留在这个时段。不是热闹型的夜生活，而是吃完以后慢慢走回室内、坐一会儿、听见船和水声还在外面，整个人就自然收住了。',
                    scenery: '如果白天的马代船宿是清亮的蓝，那傍晚以后的好看就在于它不再往外推，而是慢慢往里收。甲板的白和室内灯光一起，让整条船像一片被夜色轻轻包住的海面。',
                    photos: [
                        createReviewPhoto(4, 'lagoon-dusk', '马尔代夫船宿 · 靠海的上层甲板', '50% 54%'),
                        createReviewPhoto(1, 'cabin-window', '马尔代夫船宿 · 夜里回到室内区', '50% 46%')
                    ]
                }
            ]);
        }

        if (this.spotId === 9) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '潮汐边的房间',
                    date: '2026年2月',
                    level: 'OW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['diving', 'stay', 'scenery'],
                    title: '马布岛 · 潜前慢住',
                    subtitle: '先在海风里安静下来，再把身体慢慢交给这片蓝。',
                    summary: '马布岛最舒服的地方，是它不会把潜水和生活切开。我们住在离码头不远的房间里，清晨先听见风，再看见海。出发前不需要太赶，回到岸上也不会立刻被推着走，整个人会自然慢下来。',
                    diving: '潜水本身比想象中更温柔，浅礁和码头外侧的水下层次很适合慢慢进入状态。不是每一潜都追求冲击力，但你会记得自己是怎么慢慢喜欢上这片海的。',
                    stay: '房间不夸张，但干净、安静，潜后回来冲澡、晾装备、在门口坐一会儿都很顺。那种离海很近、离喧闹很远的松弛感，很适合住上几晚。',
                    food: '早餐是温热、简单但舒服的那种，潜后补给也照顾得很细。晚餐的海鲜和汤都不复杂，却刚好能把人从一整天的海风里慢慢收回来。',
                    scenery: '最喜欢木栈道和海面之间那一层很轻的蓝。天色亮起来以后，海风、树影和远处的人声都很轻，像整座岛在提醒你先慢一点，再下去看海。',
                    featurePhoto: createReviewPhoto(1, 'feature', '马布岛 · 潜前慢住', '50% 52%'),
                    photos: makeReviewPhotos(1, [
                        { key: 'boardwalk-breeze', caption: '马布岛 · 木栈道海风', position: '50% 48%' },
                        { key: 'before-return', caption: '马布岛 · 回房之前', position: '50% 60%' }
                    ])
                },
                {
                    id: 'review-2',
                    user: '树影下的人',
                    date: '2025年12月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['stay', 'scenery'],
                    title: '马布岛 · 沙滩游走',
                    subtitle: '沿着细白沙和浅浅树影慢慢走，岛上的风把时间放得比海更轻一些。',
                    summary: '这次在马布岛最常做的事不是赶行程，而是在潜前或潜后沿着沙滩慢慢走。树影压下来一点，海面就会显得更安静。那种不用急着去下一个地方的感觉，反而让整趟旅程更完整。',
                    diving: '潜点本身不压迫人，适合已经有一点经验、但不想把整天都放在强节奏里的潜水员。回来以后还有余裕继续散步、吹风、坐着发会儿呆。',
                    stay: '住处离海边很近，回房放下装备后很快就能重新走到树影和沙地之间。房间本身安静，午后休息和夜里入睡都很舒服。',
                    food: '餐食不是铺张的路线，但热食和海鲜都让人安心，吃完不会觉得仓促，反而更愿意慢慢把岛上的节奏留长一点。',
                    scenery: '比起“打卡视角”，我更喜欢脚下沙子和风从树间穿过去的声音。马布岛的好看，不是某一秒，而是你愿意在这里多停一会儿。',
                    photos: makeReviewPhotos(2, [
                        { key: 'beach-walk', caption: '马布岛 · 沙滩游走', position: '48% 56%' },
                        { key: 'green-shade-walk', caption: '马布岛 · 绿荫漫步', position: '52% 44%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: '饭后的风',
                    date: '2025年10月',
                    level: '入门新手',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.7 / 5',
                    focus: ['food', 'stay', 'scenery'],
                    title: '马布岛 · 饭后茶歇',
                    subtitle: '潜后不急着回房，海风、茶饮和码头边缓下来的说话声，会把这一天安静地收住。',
                    summary: '我是第一次把潜水和海岛停驻感真正放在一起。傍晚吃完饭后，大家没有立刻散掉，而是在码头边继续坐一会儿。风不大，海面很平，讲话声也慢下来，整个人会觉得这一天刚刚好。',
                    diving: '对新手来说，这里的安排有安全感，不会一上来就把节奏推得太深。潜后还能留得住力气去吹海风、喝点热茶，这点很加分。',
                    stay: '房间适合潜后短休，收拾装备和洗漱动线也顺。饭后再走回去时，整座岛已经安静下来，不会有被行程推着走的感觉。',
                    food: '晚餐偏本地海鲜和热菜，潜完回来吃会觉得身体慢慢热起来。后面再来一杯茶或简单饮品，很自然就把一天收住了。',
                    scenery: '马布岛傍晚最迷人的不是颜色有多夸张，而是海风和人声都会一点点降下来，让你愿意在码头边多坐几分钟。',
                    photos: makeReviewPhotos(3, [
                        { key: 'tea-break', caption: '马布岛 · 饭后茶歇', position: '50% 54%' },
                        { key: 'pier-sit', caption: '马布岛 · 码头边坐一会儿', position: '54% 46%' }
                    ])
                },
                {
                    id: 'review-4',
                    user: '午后还很长',
                    date: '2025年8月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['diving', 'stay', 'scenery'],
                    title: '马布岛 · 岛上日常',
                    subtitle: '潜水之外，小卖部桌边打盹的猫和岛上的学校，会把马布岛更贴近生活的一面慢慢露出来。',
                    summary: '马布岛最打动我的，不只是海里的那部分。午后从码头回来，经过岛上的小卖部，看见猫安静地睡在桌上，再路过当地学校，听见孩子们放学时的声音，你会突然明白，这片海真正迷人的地方，是潜水和日常一直靠得很近。',
                    diving: '这里的下潜体验不会把人和岸上生活切开。上午在海里看见蓝和鱼群，午后回到岛上，又能很自然地接上另一种节奏，整趟旅程不会被硬生生分成“潜水”和“非潜水”。',
                    stay: '住处和公共空间之间保留着很自然的岛上距离。你不会被困在某一个观景点里，而是能走进真正有人生活的路径，看见这座岛安静、松弛的一面。',
                    food: '比起专门去找某一道菜，我更喜欢这种走进小卖部、顺手买点饮料和零食的日常感。它让马布岛不是被安排好的度假场景，而是更真实地被住进了一会儿。',
                    scenery: '这组照片里最动人的不是海面，而是桌边睡着的猫和岛上的学校。它们让人记住，马布岛不只是一片蓝，也是一座正在慢慢生活着的岛。',
                    photos: makeReviewPhotos(4, [
                        { key: 'afternoon-chat', caption: '马布岛 · 桌边午睡', position: '50% 48%' },
                        { key: 'sea-under-shade', caption: '马布岛 · 岛上学校', position: '52% 42%' }
                    ])
                }
            ]);
        }

        if (this.spotId === 11) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '飞进群岛时',
                    date: '2026年3月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['scenery', 'diving'],
                    title: '科隆 · 先从海面以上开始',
                    subtitle: '很多人因为沉船记住科隆，但真正让人进入状态的，往往是机窗外那圈一层层亮起来的礁缘。',
                    summary: '这组图最能说明科隆为什么会让人一到就安静下来。它先从机窗外的深蓝和浅礁边界开始，再把视线慢慢压低到黑色石灰岩贴近海面的那一下。还没下水，就已经知道这里不会只有单一的“潜点感”，而是海面以上也有很完整的过渡。',
                    diving: '如果先从空中看见这些浅礁边界，再去下沉船或礁坡，会更容易理解科隆的节奏: 深的、浅的、开的、收住的，都挨得很近。它不是一上来就把强度推满，而是先让人把这一片海的层次看懂。',
                    stay: '抵达科隆前，身体会先被这种群岛和海湾的密度提醒“节奏要慢一点”。这对后面的上船、换港、出海其实很重要，因为这里舒服的方式从来不是赶。',
                    food: '科隆不是靠餐桌先打动人的地方。抵达日真正重要的，反而是把水补够、把身体从飞行和日晒里收回来，让第二天出海时人已经稳住。',
                    scenery: '这组图的顺序很像科隆真正的开场: 先从空中看见更完整的岛群轮廓和浅礁边界，再在靠近海面时看见黑色石灰岩把一小片清水轻轻收住。很多人后来记住 wreck，其实是从这种海面以上的层次开始的。',
                    featurePhoto: createReviewPhoto(1, 'feature', '科隆 · 飞进群岛时', '50% 52%'),
                    photos: [
                        createReviewPhoto(1, 'reef-rim', '科隆 · 礁缘先亮起来', '50% 54%'),
                        {
                            src: 'assets/images/coron.jpg',
                            caption: '科隆 · 黑石把海湾轻轻收住',
                            position: '50% 52%'
                        }
                    ]
                },
                {
                    id: 'review-2',
                    user: '黑石之间',
                    date: '2025年12月',
                    level: 'OW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['diving', 'stay', 'scenery'],
                    title: '科隆 · 黑石与白沙',
                    subtitle: '真正靠近岸边时，才会发现这里的黑色石灰岩、白沙和玻璃水离得非常近。',
                    summary: '科隆岸边最动人的不是“大景”，而是这些很近的关系: 黑色石灰岩把空间收住，脚下却是很白的沙，水浅得能直接看见底。人从船边走到岸上，动作会自然放慢，因为这里的好看不需要追，停一下就已经够完整。',
                    diving: '哪怕这些照片拍的是海面以上，也能看见科隆为什么适合沉船初体验和节奏型潜旅。石灰岩海湾会先把人带进一种更安静的状态，真正下水时反而不容易慌，呼吸也会更稳。',
                    stay: '跳岛或住在镇上时，这种黑石、浅湾和短暂停靠的节奏会一直跟着你。它不是那种被酒店完全包起来的海，而是一片需要你自己慢慢走近的海。',
                    food: '岛上简餐和船上午餐通常都不会喧宾夺主，反而和这种轻一点的海况很合。吃完再看一眼浅水和石壁，会觉得科隆适合把一整天排得留白一些。',
                    scenery: '这一组最准确的地方，是它把科隆的“近景美感”拍出来了: 岩石的黑、沙的白、玻璃水下那层淡青色，以及被海湾收住后的安静。它不是只靠远处好看，而是靠近以后更好看。',
                    featurePhoto: createReviewPhoto(2, 'white-sand-cove', '科隆 · 白沙与黑石之间', '50% 56%'),
                    photos: makeReviewPhotos(2, [
                        { key: 'lagoon-glasswater', caption: '科隆 · 海湾里更静的一层水', position: '50% 54%' },
                        { key: 'limestone-shallows', caption: '科隆 · 玻璃水下的石灰岩', position: '50% 48%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: '船切进海湾时',
                    date: '2025年10月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['diving', 'stay', 'scenery'],
                    title: '科隆 · 船切进石灰岩海湾',
                    subtitle: '船一慢下来，阴影、岩壁和水色会一起把声音压低，像在靠近另一层更静的海。',
                    summary: '这组图把科隆最像“进入”的时刻拍出来了。不是站上观景台，而是船慢慢切进石灰岩海湾，黑色岩壁把四周收住，水色一下子从亮青变深，再在船边变得几乎透明。人在这种地方会很自然地把动作放轻，连说话都变慢。',
                    diving: '如果科隆的沉船是水下的骨架，那这些海湾就是整段旅程的呼吸区。潜前经过这样的入口，潜后再从这里出来，旅程不会只剩一个个点位，而会被海湾之间的移动慢慢连起来。',
                    stay: '科隆舒服的地方，是船程本身也算体验的一部分。坐在 bangka 上看岩壁和阴影移过去，不会觉得自己只是在被运去下一个点，而是真的在同一片海里平移。',
                    food: '这种海湾里最合适的通常不是丰盛的东西，而是潜前潜后的一点水、果和热量补给。它把身体接住就够了，剩下的让海自己说。',
                    scenery: '一张是绿船停在高耸岩壁前，一张是阴影压下来的海湾入口，一张是紧贴岩壁的透明水线。它们一起把科隆最迷人的张力说明白了: 既有石头的重量，也有水的轻。',
                    featurePhoto: createReviewPhoto(3, 'feature', '科隆 · 船切进石灰岩海湾', '50% 50%'),
                    photos: makeReviewPhotos(3, [
                        { key: 'boat-under-cliffs', caption: '科隆 · 阴影里的绿船', position: '50% 48%' },
                        { key: 'cliffside-water', caption: '科隆 · 岩壁边的透明水线', position: '50% 58%' }
                    ])
                },
                {
                    id: 'review-4',
                    user: '回到岸边以后',
                    date: '2025年8月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.7 / 5',
                    focus: ['diving', 'stay', 'food', 'scenery'],
                    title: '科隆 · 靠岸后的节奏',
                    subtitle: '看见岸线、装备和镇边的山以后，才会发现科隆不是只用水下记住人的地方。',
                    summary: '很多地方的评论会把“岸上”写成过场，但科隆不是。你会记得回港前那片宽一点的海湾、岸边低低的房子和码头边排好的装备。它们会把整天从风景收回到生活里，让这趟旅程不只剩几潜，而是真的有开始、有准备、也有回来的落点。',
                    diving: '装备摆出来的那张照片很能说明科隆潜旅的质感: 没有过分用力的华丽感，但动线清楚、准备直接，下水之前人会很容易进入状态。对想试 wreck 或者把潜旅排得更完整的人，这种岸上节奏很重要。',
                    stay: '科隆镇边的岸线和小码头不会把自己包装得很夸张，但正因为如此，潜后回去会有一种很具体的落地感。洗完澡、整理器材、再看一眼山和水色，整个人会慢慢收住。',
                    food: '回到镇上以后，真正让人舒服的往往也不是“吃到什么名菜”，而是热的、咸的、能把海风和日晒慢慢接住的一顿饭。科隆适合这种不吵的收尾。',
                    scenery: '这一组从回程海湾、岸边小屋到装备台，刚好把科隆的后半段串起来。它提醒人，这里之所以耐看，不只是因为某一潜，而是因为海和岸一直贴得很近。',
                    featurePhoto: createReviewPhoto(4, 'bay-return', '科隆 · 回港前的海湾', '50% 52%'),
                    photos: makeReviewPhotos(4, [
                        { key: 'shore-village', caption: '科隆 · 岸线慢慢出现', position: '50% 54%' },
                        { key: 'dock-gear', caption: '科隆 · 下水前的装备台', position: '52% 50%' }
                    ])
                }
            ]);
        }

        if (this.spotId === 12) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '先看见岸线',
                    date: '2026年3月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['scenery', 'diving'],
                    title: '薄荷岛 · 白沙外侧的第一条浅礁线',
                    subtitle: '很多人对薄荷岛的第一印象，不是某一潜，而是先看见深蓝、浅礁和白沙排成一条很轻的边。',
                    summary: '这些航拍最能说明薄荷岛为什么适合把潜水放进更轻一点的假期。岸线不夸张，浅礁贴着白沙慢慢往外过渡，外侧才是更深的蓝。海还没真正开始，呼吸已经先被放慢。',
                    diving: '这种岸线和浅礁的过渡会让人对当天水况很有感觉。不是先追强度，而是先把海读清楚，再慢慢下去。',
                    stay: '如果住在近岸一带，很多出海日都会从这种看得见白沙和树线的节奏开始，身体很容易放松。',
                    food: '薄荷岛更适合吃完早一点的早餐就出海，回来再把热食和水果慢慢接上，整天不会被推得太满。',
                    scenery: '三张图放在一起刚好把它的气质说明白了：岸线是白的，浅礁是亮的，外海的蓝却很稳。它不是喧闹型的美，而是一直轻轻展开。',
                    featurePhoto: createReviewPhoto(1, 'feature', '薄荷岛 · 白沙外侧的第一条浅礁线', '52% 52%'),
                    photos: makeReviewPhotos(1, [
                        { key: 'reef-line', caption: '薄荷岛 · 岸线慢慢弯进去', position: '50% 52%' },
                        { key: 'coast-boats', caption: '薄荷岛 · 岸边停着几条小船', position: '52% 54%' }
                    ])
                },
                {
                    id: 'review-2',
                    user: '船停在外侧',
                    date: '2025年12月',
                    level: 'OW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['diving', 'stay', 'scenery'],
                    title: '薄荷岛 · 船停在浅水边',
                    subtitle: '船离岸不远，脚下已经是清透的蓝和浅礁，真正的船潜会从这种不太用力的靠近开始。',
                    summary: '这几张图把薄荷岛最舒服的地方拍得很直接：bangka 没有开到很远的外海，而是先停在白沙外侧的清水里。你能看见岸线，还能看见船下浅礁和色带，整个人不会被突然扔进完全陌生的节奏里。',
                    diving: '这种轻船潜很适合作为入门或恢复状态。上船、brief、下水都很清楚，海况再复杂也会先被拆成更好读的几步。',
                    stay: '住在岸边潜店附近时，来回动线通常很短，潜后不会有太强的奔波感，这对想把假期放轻的人很重要。',
                    food: '这种日程通常会把午餐和简单补给安排得比较顺，你出水之后不需要再被推着走，很容易慢慢收回来。',
                    scenery: '船停在清透浅水上的那一下，其实就已经解释了为什么薄荷岛会让人放松：岸线近，水色浅，外侧深蓝又没有压得太重。',
                    featurePhoto: createReviewPhoto(2, 'feature', '薄荷岛 · 船停在浅水边', '50% 54%'),
                    photos: makeReviewPhotos(2, [
                        { key: 'bangka-close', caption: '薄荷岛 · 跳下去前的停靠', position: '50% 56%' },
                        { key: 'topdown-boat', caption: '薄荷岛 · 浅礁和深蓝之间', position: '50% 52%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: 'briefing 开始前',
                    date: '2025年10月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['diving', 'stay', 'food', 'scenery'],
                    title: '薄荷岛 · briefing 在船上开始',
                    subtitle: '大家围坐在船上听 brief 的时候，岸边的房子、树线和器材会一起把这趟出海收进一种很日常的节奏里。',
                    summary: '薄荷岛这组图和很多“只拍海”的地方不一样。大家坐在船上，器材堆在脚边，岸上房子和水面都还很近，这种普通又松弛的出海感，反而很容易让人记住。它不装成冒险，也不急着制造压迫感，就是把一整天慢慢展开。',
                    diving: 'briefing 清楚、上船节奏稳，对轻船潜来说非常重要。它会让整天的呼吸从一开始就是顺的，而不是到了水里才临时适应。',
                    stay: '能从住的地方很自然地接到这条出海线，是薄荷岛的一大优点。你不会觉得自己被硬切进“景点”，更像从岸边生活慢慢走进海里。',
                    food: '这种出海日最舒服的部分，往往也是船上那些简单的水、零食和回去以后的一顿正餐。它不会抢戏，但会把身体接得很稳。',
                    scenery: '一张是人和器材在船上围成一圈，一张是船刚离开岸边后还停在浅礁上方。它们让薄荷岛的海不是只有风景，也有很真实的出发感。',
                    featurePhoto: createReviewPhoto(3, 'feature', '薄荷岛 · briefing 在船上开始', '50% 48%'),
                    photos: makeReviewPhotos(3, [
                        { key: 'briefing-circle', caption: '薄荷岛 · 先把这一潜说清楚', position: '50% 46%' },
                        { key: 'topdown-glasswater', caption: '薄荷岛 · 刚离岸不久的清水', position: '50% 52%' }
                    ])
                },
                {
                    id: 'review-4',
                    user: '再往外看一点',
                    date: '2025年8月',
                    level: 'OW',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.7 / 5',
                    focus: ['scenery', 'diving'],
                    title: '薄荷岛 · 岸线慢慢弯过去',
                    subtitle: '从上面看时，才会发现这片海不是一块平蓝，而是白沙、浅礁、停船线和云影一层层往外排开。',
                    summary: '最后这组更像薄荷岛真正留在记忆里的方式：岸线在下面慢慢弯过去，浅礁颜色一块块散开，停在外侧的船把尺度变得更轻。就算云压下来一点，这片海也不会显得沉，反而更有呼吸感。',
                    diving: '这样的海况很适合把潜水安排得从容一些。你知道船会从哪里出去，也知道浅礁和深水的边界在哪里，下去时心里会更稳。',
                    stay: '回到岸边以后再看这种海岸线，会觉得整趟旅程不是围着某一个点转，而是围着一整条海边生活慢慢展开。',
                    food: '薄荷岛很适合把晚饭留给潜后那段慢下来的时间，海风、盐分和疲惫一起退下去以后，整天才真正收住。',
                    scenery: '一张是云影压下来的岸线，一张是白沙和浅礁继续往前铺开。它们把薄荷岛最舒服的地方留得很具体：轻、亮，而且不急。',
                    featurePhoto: createReviewPhoto(4, 'feature', '薄荷岛 · 岸线慢慢弯过去', '50% 52%'),
                    photos: makeReviewPhotos(4, [
                        { key: 'cloudline', caption: '薄荷岛 · 云影压下来时的岸线', position: '50% 50%' },
                        { key: 'reef-curve', caption: '薄荷岛 · 白沙外侧的浅礁带', position: '52% 54%' }
                    ])
                }
            ]);
        }


        if (this.spotId === 13) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '先在花园里慢下来',
                    date: '2026年3月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['stay', 'scenery'],
                    title: '皇帝岛 · 住处先把节奏放轻',
                    subtitle: '大厅、花园步道和夜里安静的回程，会先把这片海的进入方式说清楚。',
                    summary: '皇帝岛很舒服的一点，是你还没真正出海，身体就已经慢慢放松下来。大厅干净、步道安静、树影把风压得很低，整段靠近不是突然切换，而是轻轻下潜。',
                    diving: '这种岸上节奏会让第二天的船潜更顺。你不是仓促下水，而是先把呼吸和注意力都整理好。',
                    stay: '住处本身就像这片海的浅层入口：白色大厅、花园步道和低饱和的绿，会把整趟假期先收成一种更从容的状态。',
                    food: '这类海域适合把早餐和潜前补给做得清楚一点，不需要复杂，但要稳稳接住身体。',
                    scenery: '真正打动人的不是大场面，而是大厅的白、步道的绿和还没完全亮开的海一起出现。',
                    featurePhoto: createReviewPhoto(1, 'feature', '皇帝岛 · 花园步道把心跳慢慢放轻', '50% 54%'),
                    photos: makeReviewPhotos(1, [
                        { key: 'lobby-night', caption: '皇帝岛 · 夜里回到大厅也还是很安静', position: '50% 48%' },
                        { key: 'garden-path', caption: '皇帝岛 · 另一条步道把海风留在树影里', position: '50% 54%' }
                    ])
                },
                {
                    id: 'review-2',
                    user: '早餐之后再去码头',
                    date: '2025年12月',
                    level: 'OW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.7 / 5',
                    focus: ['food', 'stay'],
                    title: '皇帝岛 · 餐桌会把潜前节奏接住',
                    subtitle: '先吃水果、热食，再在木椅和餐桌之间慢慢醒过来，皇帝岛很适合这样的开场。',
                    summary: '皇帝岛这一程不会急着把你推到最重的海况里。早餐盘、热菜和餐厅里那种不需要大声说话的气氛，会让人觉得今天的潜水已经被妥帖安放。',
                    diving: '潜前节奏被照顾好以后，下水会轻很多，判断压力也会小很多。',
                    stay: '餐厅和住处的距离不远，回到岸上以后也能自然续上，不会一直被切换感打断。',
                    food: '水果、热饮和一顿像样的餐桌，是皇帝岛轻船潜体验的重要一部分。',
                    scenery: '连餐桌上的光都像海的前奏：不夸张，却把之后那层更亮的蓝提前说给你听。',
                    featurePhoto: createReviewPhoto(2, 'feature', '皇帝岛 · 潜前的餐厅会先把身体接住', '50% 50%'),
                    photos: makeReviewPhotos(2, [
                        { key: 'breakfast-fruit', caption: '皇帝岛 · 水果和热饮把清晨慢慢拉开', position: '50% 56%' },
                        { key: 'dinner-table', caption: '皇帝岛 · 潜后那顿饭也不需要很赶', position: '50% 56%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: '甲板先读今天的云',
                    date: '2025年10月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['diving', 'scenery'],
                    title: '皇帝岛 · 出海前先把风向看清楚',
                    subtitle: '豆袋甲板、上层甲板和远处的云线排在一起，会让人知道今天的海会怎样展开。',
                    summary: '从船面到外海，皇帝岛很少一下子把张力拉满。你会先在甲板上看见今天的风、云和海面怎么连起来，再慢慢驶进真正该下水的那片蓝里。',
                    diving: '这种“先读懂再下去”的海很适合恢复状态，也适合 OW / AOW 把连续几潜排得更安心。',
                    stay: '哪怕只是坐在甲板上等 briefing，那种不慌的感觉都很重要，出海本身也成了旅程的一部分。',
                    food: '这种海最适合把餐食和补水节点排得清楚：出海前轻一点，回船以后热一点。',
                    scenery: '皇帝岛的画面感常常来自明暗边界：甲板黑得克制，外海蓝得很开，云墙又把层次一下拉出来。',
                    featurePhoto: createReviewPhoto(3, 'feature', '皇帝岛 · 上层甲板先把云和海摆出来', '50% 50%'),
                    photos: makeReviewPhotos(3, [
                        { key: 'open-deck', caption: '皇帝岛 · 豆袋甲板上的第一层海风', position: '50% 48%' },
                        { key: 'storm-wall', caption: '皇帝岛 · 远处云墙会把今天的海说得更清楚', position: '50% 54%' },
                        { key: 'sea-window', caption: '皇帝岛 · 离岸以后海会一点点安静下来', position: '50% 48%' }
                    ])
                },
                {
                    id: 'review-4',
                    user: '回到岸上也不急',
                    date: '2025年8月',
                    level: 'OW',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.6 / 5',
                    focus: ['stay', 'food', 'scenery'],
                    title: '皇帝岛 · 回到陆地也还是慢慢上浮',
                    subtitle: '夜里的小猫、车窗外的街道和坡路，会把皇帝岛这程从海上轻轻接回日常。',
                    summary: '很多人只记得皇帝岛的海，但真正让人想再来一次的，常常是岸上收得也很舒服。你会在回程路上看见街道、坡路和晚一点才出现的小猫，整趟旅程像缓慢上浮，而不是突然结束。',
                    diving: '有了这样的回岸段，前面的潜水会留得更久，因为你不是一下从海里跳回现实。',
                    stay: '普吉一带的住处和岸上动线，让皇帝岛很适合排成轻一点的假期：潜水之后，生活感仍然能继续。',
                    food: '回到岸上再找一顿热的，或者在车上慢慢喝掉一瓶水，都比急着赶路更像皇帝岛的收尾。',
                    scenery: '街道、坡路和夜里的小动物，让这片海的回忆不只停在蓝水，也停在一整段温柔的陆地时间里。',
                    featurePhoto: createReviewPhoto(4, 'feature', '皇帝岛 · 岸上的慢路会把这程轻轻接住', '50% 54%'),
                    photos: makeReviewPhotos(4, [
                        { key: 'night-cat', caption: '皇帝岛 · 夜里还有一只猫把路口守得很安静', position: '50% 46%' },
                        { key: 'road-window', caption: '皇帝岛 · 车窗外的街道把这程慢慢收住', position: '50% 48%' },
                        { key: 'town-slope', caption: '皇帝岛 · 坡路和树影会把海边时间继续拉长', position: '50% 50%' }
                    ])
                },
                {
                    id: 'review-5',
                    user: '第一眼先给珊瑚',
                    date: '2025年7月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['diving', 'scenery'],
                    title: '皇帝岛 · 水下先是珊瑚和明亮蓝',
                    subtitle: '它不会先拿压迫感说话，而是先给你珊瑚、礁块和一层很清楚的亮蓝。',
                    summary: '皇帝岛最舒服的地方，是它把水下层次摆得很开。你先看见软珊瑚、礁块和明亮的蓝，再看见潜水员慢慢进入这层海里，整片水下结构既轻，又很完整。',
                    diving: '对想恢复状态、或想把一天里的几潜都做得更从容的人来说，这种亮、清楚、边界分明的结构非常友好。',
                    stay: '因为海不会一上来就过度消耗人，所以潜后回到岸上时还能保留不少余地。',
                    food: '潜后只需要一顿热的和一点盐分，身体就能慢慢接回来，它不会让你只剩疲惫。',
                    scenery: '真正动人的是蓝不是整片砸过来，而是被珊瑚和礁块拆成很多层，每一层都很清楚。',
                    featurePhoto: createReviewPhoto(5, 'feature', '皇帝岛 · 先看见一层很亮的珊瑚蓝', '50% 50%'),
                    photos: makeReviewPhotos(5, [
                        { key: 'reef-fan', caption: '皇帝岛 · 软珊瑚会先把视线留下来', position: '50% 50%' },
                        { key: 'blue-reef', caption: '皇帝岛 · 明亮蓝水把礁坡慢慢推开', position: '50% 50%' },
                        { key: 'coral-diver', caption: '皇帝岛 · 人一进去，海的层次就更清楚了', position: '50% 54%' }
                    ])
                },
                {
                    id: 'review-6',
                    user: '再往里一点是更深的蓝',
                    date: '2025年7月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['diving', 'scenery'],
                    title: '皇帝岛 · 礁坡往后，还有鱼群和船舱的蓝',
                    subtitle: '当珊瑚和亮蓝都已经读懂，再往里一点，鱼群和船舱会把这片海真正收深。',
                    summary: '皇帝岛不是只有白沙和缓坡。等你把外层亮蓝读熟以后，鱼群会先把坡面铺开，再由船舱里的冷蓝把这片海真正收深。它不会突然变得粗暴，却会让人觉得这片海比想象里更完整。',
                    diving: '这就是皇帝岛适合 OW / AOW 逐步往前走的原因：你先在轻一点的层里找到节奏，再往更有结构的地方延展。',
                    stay: '因为前面的铺垫够温和，走到这一层时不会只剩紧张，回到岸上以后也更容易慢慢回味。',
                    food: '这种潜点最适合在潜后把餐食安排得简单但稳，让身体从更深一点的蓝里慢慢浮回来。',
                    scenery: '最好的地方在于明暗衔接：鱼群的蓝、礁坡的蓝、再到船舱窗边那层更深的蓝，是一层层递进去的。',
                    featurePhoto: createReviewPhoto(6, 'feature', '皇帝岛 · 外层亮蓝往后，还有一层更深的礁坡蓝', '50% 50%'),
                    photos: makeReviewPhotos(6, [
                        { key: 'reef-fish', caption: '皇帝岛 · 礁石和鱼会把这一潜继续往前推', position: '50% 48%' },
                        { key: 'reef-slope', caption: '皇帝岛 · 礁坡会先把鱼和蓝一起摆出来', position: '50% 50%' },
                        { key: 'schooling-fish', caption: '皇帝岛 · 再往前一点，鱼群开始把空间填满', position: '50% 52%' },
                        { key: 'wreck-window', caption: '皇帝岛 · 船舱窗边那一格光会把人留下来', position: '50% 50%' },
                        { key: 'wreck-inside', caption: '皇帝岛 · 里面的蓝很安静，也很完整', position: '50% 54%' }
                    ])
                }
            ]);
        }

        if (this.spotId === 14) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '先经过转机和热食',
                    date: '2026年3月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['stay', 'food', 'scenery'],
                    title: '热浪岛 · 先把路上的盐分收好',
                    subtitle: '热浪岛这一程不是一落地就急着入海，小飞机、夜里的住处和第一顿热食，会先把身体接住。',
                    summary: '真正的旅程不是从到达潜点的那一刻开始的，而是从你开始离开日常、进入假期的那一刻开始的。酒店的入住，路上的转机，都会让你感受到不一样的体验。在市中心的繁忙中体验喧闹，在热浪岛的夜晚体验安静，体验各种不同的节奏，都是这趟旅程的一部分。它不会让你一下子就被丢进很重的海里，而是先把路上的盐分和疲惫慢慢收好。',
                    diving: '这种进入方式会让后面的船潜轻很多，因为你不是带着一路的疲惫直接下水。',
                    stay: '夜里抵达也不会显得慌。只要住处和动线够稳，热浪岛就会从第一晚开始变得柔和。',
                    food: '第一顿热食特别重要。它不抢戏，却决定你接下来几天是不是能舒服地跟上海。',
                    scenery: '连路上的画面都很有热浪岛气质：灯光不大声，夜色很松，假期已经慢慢开始。',
                    featurePhoto: createReviewPhoto(1, 'feature', '热浪岛 · 小飞机落下来以后，这程才真正开始', '50% 58%'),
                    photos: makeReviewPhotos(1, [
                        { key: 'arrival-night', caption: '热浪岛 · 夜里到住处，灯光也还是轻的', position: '50% 52%' },
                        { key: 'plane-window', caption: '热浪岛 · 转机时先在城里停一会儿', position: '50% 42%' },
                        { key: 'first-meal', caption: '热浪岛 · 第一顿热食把人稳稳接住', position: '50% 56%' }
                    ])
                },
                {
                    id: 'review-2',
                    user: '白沙先把一天点亮',
                    date: '2025年12月',
                    level: 'OW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.7 / 5',
                    focus: ['scenery', 'stay'],
                    title: '热浪岛 · 沙滩椅和餐桌边的第一层海',
                    subtitle: '白沙、椅子、餐桌和一眼就能看懂的浅蓝，会先把整天点亮。',
                    summary: '经过旅途的奔波后，站在柔软洁净的白沙上，迎面吹来的海风，远处的海浪，让我在忙碌的生活中脱离出来，丢下一切包袱，真正的享受到了热浪岛的美好。它不会一下子把你丢进很重的海里，而是先把这片海的亮度和层次说得很清楚，整个人就已经先放松了。',
                    diving: '这种岸边层次会让后面的船潜更顺，因为在下水之前，你已经先把这片海的亮度和方向读懂了。',
                    stay: '如果住处和海边真的离得很近，热浪岛会特别完整，靠近沙滩的过程本身就是旅程的一部分。',
                    food: '面海的餐桌很适合潜前早餐和潜后补水，它们会把海风稳稳接进身体里。',
                    scenery: '最喜欢的是白沙和桌椅没有被做得很热闹，反而把整片海留得更安静。',
                    featurePhoto: createReviewPhoto(2, 'feature', '热浪岛 · 面海的餐桌会先把这一天点亮', '50% 52%'),
                    photos: makeReviewPhotos(2, [
                        { key: 'deck-chairs', caption: '热浪岛 · 沙滩椅还空着，海已经亮起来了', position: '50% 50%' },
                        { key: 'white-sand', caption: '热浪岛 · 白沙会先把呼吸放轻', position: '50% 52%' },
                        { key: 'beachline', caption: '热浪岛 · 靠近岸线时海是很好读的', position: '50% 52%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: '住处外面就是海风',
                    date: '2025年10月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['stay', 'scenery'],
                    title: '热浪岛 · 阳台、棕榈和停在海上的船',
                    subtitle: '房间外、阳台边和树影底下，都还能继续看见海没有结束。',
                    summary: '如果说白沙把热浪岛先点亮，那么住处会把这种亮慢慢留下来。阳台边有木纹和风，棕榈把海面分成几层，船停在湾里不急着动，整段停驻感会比“只去一个潜点”完整得多。',
                    diving: '住得离海近，会让出海变成一种自然延伸，而不是每天重新启动一次。',
                    stay: '这组图几乎把热浪岛为什么适合轻假期说清楚了：房间外就有海，走到阳台边就知道今天不需要太赶。',
                    food: '这种住处最适合把潜后的水果和热饮留在房间外慢慢喝掉，让海风把一整天再往后放一会儿。',
                    scenery: '真正好看的不是某一个打卡角度，而是棕榈、屋顶和海上的船一起把空间轻轻排开。',
                    featurePhoto: createReviewPhoto(3, 'feature', '热浪岛 · 从住处望出去，整片湾还在呼吸', '50% 54%'),
                    photos: makeReviewPhotos(3, [
                        { key: 'balcony', caption: '热浪岛 · 阳台边的木纹和风都很轻', position: '50% 50%' },
                        { key: 'palm-bay', caption: '热浪岛 · 棕榈会把海湾切成很多层浅蓝', position: '50% 50%' },
                        { key: 'boat-between-palms', caption: '热浪岛 · 船停在树影之间，整片海显得更安静', position: '50% 50%' }
                    ])
                },
                {
                    id: 'review-4',
                    user: '天气会把海再改一遍',
                    date: '2025年9月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.7 / 5',
                    focus: ['scenery', 'diving'],
                    title: '热浪岛 · 云一压下来，海还是清楚的',
                    subtitle: '就算云层压低、浪线起一点，这片海的层次仍然很好读。',
                    summary: '同一片岸线，在天气换了一层之后会显出另一种安静。云墙压过来时，海边的人变得很小，浪线更明显，高一点的位置又能看见白沙仍然把蓝水稳稳托住。',
                    diving: '这种天气变化会提醒人把节奏放稳：先读浪线，再决定今天往哪一层去。',
                    stay: '当住处、岸线和海之间足够近时，天气变化本身也会变成旅程的一部分，而不是计划被打断。',
                    food: '风大一点的时候，潜后回去喝热的、吃热的会更舒服，也更像热浪岛这种慢慢收住的节奏。',
                    scenery: '我很喜欢这组里那种灰下来以后仍然很透的蓝，它让白沙和浪线都变得更清楚。',
                    featurePhoto: createReviewPhoto(4, 'feature', '热浪岛 · 岸线和礁石会先把今天的海说清楚', '50% 52%'),
                    photos: makeReviewPhotos(4, [
                        { key: 'storm-front', caption: '热浪岛 · 云压下来的时候，海还是有层次的', position: '50% 54%' },
                        { key: 'shore-swell', caption: '热浪岛 · 浪线把近岸的呼吸再说一遍', position: '50% 52%' },
                        { key: 'high-view', caption: '热浪岛 · 从高一点看，白沙会把蓝稳稳托住', position: '50% 50%' }
                    ])
                },
                {
                    id: 'review-5',
                    user: '岛上的慢路也很重要',
                    date: '2025年9月',
                    level: 'OW',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.6 / 5',
                    focus: ['stay', 'scenery'],
                    title: '热浪岛 · 路边的猴子会让人再慢一点',
                    subtitle: '本来没把告示牌当回事，结果猴子真的突然跳上来，把衣服也弄脏了。',
                    summary: '这是我在酒店附近遇到的一段小插曲。先碰到一只小松鼠，我还分了一点面包给它；看到旁边提醒有猴子的告示时，我并没有太在意，结果没过多久，真的有一只猴子突然跳到我衣服上，把衣服弄脏了。回头再想，这种带点狼狈的意外，反而让热浪岛更容易被记住。',
                    diving: '热浪岛不只是下水时才有记忆点，连潜前潜后在住处附近遇到的小意外，都会把整段行程留得更深。',
                    stay: '住在岛上的感觉，就是你不会只记住房间和海，还会记住酒店门口的小路、告示牌，还有那些突然闯进生活里的小动物。',
                    food: '岛上连拿着面包停一下都会变成故事，所以节奏真的不用赶，慢一点，很多细节自己就会出现。',
                    scenery: '这片海最特别的地方，是海景之外还带着一点野性，树影、告示和突然出现的猴子，都会把风景变得更真。',
                    featurePhoto: createReviewPhoto(5, 'feature', '热浪岛 · 那张猴子警告牌，后来想起来很准', '50% 48%'),
                    photos: makeReviewPhotos(5, [
                        { key: 'island-path', caption: '热浪岛 · 酒店外面这段小路，后来也成了记忆的一部分', position: '50% 54%' },
                        { key: 'monkey-warning', caption: '热浪岛 · 当时没太在意的提醒，后来全都应验了', position: '50% 48%' },
                        { key: 'balcony-late', caption: '热浪岛 · 被猴子踩脏的衣服，也把这一天留得更牢', position: '50% 52%' }
                    ])
                },
                {
                    id: 'review-6',
                    user: '潜前 briefing 到蓝水栏杆',
                    date: '2025年8月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['diving', 'stay'],
                    title: '热浪岛 · 出海这件事本身也很顺',
                    subtitle: 'briefing、船尾白浪、潜具和栏杆外的深蓝，会把热浪岛的轻船潜节奏解释得很清楚。',
                    summary: '热浪岛让人愿意把连续几潜排进去，是因为出海本身就不太消耗人。你会先在 briefing 里把今天读清楚，再看见船尾把白浪拉开，潜具安静地靠在船边，最后栏杆外只剩一整片深一点的蓝。',
                    diving: '对 OW / AOW 来说，这种有秩序、好理解的出海方式非常重要，注意力可以更多留给海。',
                    stay: '当船潜日被安排得清楚，回到岸上也不会有那种被彻底掏空的感觉，假期节奏能继续保持轻。',
                    food: '这类轻船潜很适合把补水和热食排在节点上，不需要大张旗鼓，却能让身体一直在舒服区间里。',
                    scenery: '我很喜欢这组图里蓝是怎么慢慢加深的：先是人、再是船、再是栏杆外整片安静下来的海。',
                    featurePhoto: createReviewPhoto(6, 'feature', '热浪岛 · briefing 结束以后，今天这片海就很清楚了', '50% 48%'),
                    photos: makeReviewPhotos(6, [
                        { key: 'boat-wake', caption: '热浪岛 · 船尾白浪会先把节奏拉开', position: '50% 52%' },
                        { key: 'dive-gears', caption: '热浪岛 · 潜具靠在船边，整天都显得很稳', position: '50% 48%' },
                        { key: 'blue-rail', caption: '热浪岛 · 栏杆外那层深蓝会把人继续往前带', position: '50% 52%' }
                    ])
                },
                {
                    id: 'review-7',
                    user: '夜里回到海边还不想散',
                    date: '2025年8月',
                    level: 'OW',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.6 / 5',
                    focus: ['food', 'stay', 'scenery'],
                    title: '热浪岛 · 潜后还有一段夜色在等你',
                    subtitle: '夜里的餐桌、靠海的小屋和很浅的一层水光，会把这一天再轻轻往后延一点。',
                    summary: '热浪岛很适合把潜后时间留给海边。你会在夜色里看见桌椅和灯光，也会在更安静的位置再看见一点点仍然发亮的浅水，它不会用很强烈的夜生活把人拽走。',
                    diving: '因为白天的船潜已经足够顺，晚上反而更愿意把潜水留在身体里，而不是马上切走。',
                    stay: '热浪岛的晚上不是过度热闹的那种，它更像让你在饭后和海边之间再轻轻走一会儿。',
                    food: '夜里的餐桌是这组图最重要的部分，它把潜后盐分、海风和一天的疲惫一起接回来。',
                    scenery: '最动人的是夜色并没有把海吞掉，水边那层浅光还在，让人知道这片海并没有真正结束。',
                    featurePhoto: createReviewPhoto(7, 'feature', '热浪岛 · 夜里的餐桌会把潜后余韵留住', '50% 52%'),
                    photos: makeReviewPhotos(7, [
                        { key: 'sunset-corner', caption: '热浪岛 · 夜色刚压下来时，角落里的海还是蓝的', position: '50% 52%' },
                        { key: 'night-beach', caption: '热浪岛 · 小屋和沙地会把晚上留得很轻', position: '50% 52%' },
                        { key: 'shallow-light', caption: '热浪岛 · 清澈见底的海水', position: '50% 52%' }
                    ])
                },
                {
                    id: 'review-8',
                    user: '最后一晚也不急着告别',
                    date: '2025年8月',
                    level: 'OW',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.6 / 5',
                    focus: ['stay', 'food', 'scenery'],
                    title: '热浪岛 · 最后留下来的反而是这些普通时刻',
                    subtitle: '夜里的小路、便利店货架和岸边那间安静的小屋，会让人明白热浪岛真正留下来的不是单点刺激。',
                    summary: '离开热浪岛之前，最容易反复想起的，往往不是某一次下水，而是这些再普通不过的画面：夜里拐过弯的小路、便利店里临时买的零食、海边那间小屋和到达时那种并不喧闹的夜色。',
                    diving: '正因为海不需要一直靠高张力维持存在感，离开时你才会发现，真正留下来的其实是整段潜前潜后的呼吸。',
                    stay: '最后一晚还愿意在岛上再走一段路，本身就说明热浪岛适合停下来住，而不只是匆匆来回。',
                    food: '便利店和零食这种很小的节点，反而会让人记住旅途是怎么被一口一口接住的。',
                    scenery: '我喜欢这组图里那种不刻意的安静：不是大场面，却很像真正会留在记忆里的海岛。',
                    featurePhoto: createReviewPhoto(8, 'feature', '热浪岛 · 最后一晚的小路把这程慢慢收住', '50% 52%'),
                    photos: makeReviewPhotos(8, [
                        { key: 'night-arrival', caption: '热浪岛 · 初到时那层夜色其实很轻', position: '50% 52%' },
                        { key: 'resort-path', caption: '热浪岛 · 靠海的小屋会把最后的画面留住', position: '50% 52%' },
                        { key: 'convenience-stop', caption: '热浪岛 · 离开前买的零食也会变成回忆的一部分', position: '50% 50%' }
                    ])
                }
            ]);
        }

        if (this.spotId === 4) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '阿陶罗在远处',
                    date: '2026年3月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['scenery', 'diving'],
                    title: '帝汶岛 · 先看见远处那层岛影',
                    subtitle: '帝汶不会急着把人推进海里，它往往先用阿陶罗的轮廓和海平线，把呼吸放慢一点。',
                    summary: '这组图很像帝汶真正的开场。风向袋旁边那片深一点的海，远处隐着阿陶罗的山体；另一张里岛影更低、更安静，岸边的线条也被拉得很长。还没下水，帝汶就先把“慢慢进入”这件事说清楚了。',
                    diving: '这种靠近方式很适合帝汶。你会先看见海面怎么展开，再慢慢下到珊瑚坡地里，整个人比较不容易被节奏打断。',
                    stay: '如果住处离岸边不远，第一天哪怕只是站着看一会儿远处岛影，也会很快进入这片海的状态。',
                    food: '这类海最适合接一顿简单、热的潜前早餐。身体被接稳以后，后面的慢潜节奏才会更舒服。',
                    scenery: '最动人的是帝汶的远近关系。远处是低低的岛体，近处是被风和光线压得很轻的岸线，它们把这片海留得很舒展。',
                    featurePhoto: createReviewPhoto(1, 'feature', '帝汶岛 · 阿陶罗会先在海平线后面出现', '50% 48%'),
                    photos: makeReviewPhotos(1, [
                        { key: 'atauro-line', caption: '帝汶岛 · 更安静的一层阿陶罗轮廓', position: '50% 52%' },
                        { key: 'cristo-rei', caption: '帝汶岛 · 岸线回头看时，岛影还留在后面', position: '50% 54%' }
                    ])
                },
                {
                    id: 'review-2',
                    user: '珊瑚坡地记录本',
                    date: '2025年12月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['diving', 'scenery'],
                    title: '帝汶岛 · 珊瑚坡地会把颜色慢慢铺开',
                    subtitle: '真正让帝汶留下来的，不只是“适合慢潜”，而是珊瑚、浅水和干燥岸线会一起把层次排得很清楚。',
                    summary: '第二组图把帝汶的水下和岸上接在了一起。一张是珊瑚坡地本身，颜色不是炸开的那种，而是很完整地一层层摊开；另外两张里的 One Dollar Beach 让浅水、白沙和更干一点的岸线靠得很近，节奏一下就出来了。',
                    diving: '帝汶的舒服，在于你不会一直被强流或过度密集的点位拉着走。珊瑚坡地很好读，适合把时间真的花在观察里。',
                    stay: '住在这种浅水和岸线关系很近的位置，潜前潜后都不会显得仓促，体感会比只盯着潜点完整很多。',
                    food: '这种行程很适合把午后补给和晚一点的热食吃得慢一点，因为岸上的风景本身就会把节奏再放长。',
                    scenery: '最喜欢的是颜色被拆成了两层: 一层在水下，是珊瑚坡地的细节；一层在岸上，是白沙和低饱和海水把岛体轻轻托住。',
                    featurePhoto: createReviewPhoto(2, 'feature', '帝汶岛 · 珊瑚坡地会先把海的颜色说明白', '50% 42%'),
                    photos: makeReviewPhotos(2, [
                        { key: 'dollar-road', caption: '帝汶岛 · One Dollar Beach 的岸线很长', position: '52% 52%' },
                        { key: 'dollar-bay', caption: '帝汶岛 · 浅水会把白沙慢慢推开', position: '50% 56%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: '傍晚回到帝力',
                    date: '2025年10月',
                    level: '同行不潜',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.7 / 5',
                    focus: ['stay', 'food', 'scenery'],
                    title: '帝汶岛 · 傍晚会把这程轻轻收住',
                    subtitle: '帝汶不只适合白天下潜，回到帝力海边以后，那层傍晚的风和水色也会把整趟旅程留得更久。',
                    summary: '最后这组图更像帝汶的收尾。傍晚海边的光线不急，水面和天色都压得很平；另一张里 Mota Bidau 一带把岸线和城市边缘轻轻接起来。看完会更明白，帝汶之所以适合停留，是因为回岸以后也不会突然断掉。',
                    diving: '对白天下过几潜的人来说，这样的傍晚很重要。它会把水下那种缓慢、完整的节奏继续保留下来。',
                    stay: '帝汶的住处不需要夸张，只要离海近、能让人潜后走回这层晚光里，整趟体感就会很稳。',
                    food: '热食和海风会在这个时段一起发挥作用。不是热闹型的晚餐，而是让人把盐分和疲惫慢慢放回岸上的那种收尾。',
                    scenery: '我最喜欢帝汶这种不吵的傍晚。海边、城市边缘和一层很轻的晚光靠在一起，会让人想把时间再留一点。',
                    featurePhoto: createReviewPhoto(3, 'feature', '帝汶岛 · 帝力海边会把傍晚慢慢压平', '50% 54%'),
                    photos: makeReviewPhotos(3, [
                        { key: 'mota-bidau', caption: '帝汶岛 · 回岸以后，岸线和城市会慢慢连起来', position: '50% 52%' }
                    ])
                }
            ]);
        }

        if (this.spotId === 6) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '先停在清水边',
                    date: '2026年3月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['stay', 'scenery', 'diving'],
                    title: '布纳肯 · 岸边的小船会先把人接住',
                    subtitle: '布纳肯不是一开始就把海墙的张力推到眼前，它会先用很静的清水、岸边小船和群岛轮廓让人慢下来。',
                    summary: '这组图很像刚到布纳肯那天的状态。黄色小船停在很静的浅水边，回头又能看见马纳多湾和远处岛体慢慢展开。它让人先理解这片海为什么会显得通透，而不是一上来就去强调强度。',
                    diving: '这样的开场很适合布纳肯。海墙当然重要，但真正舒服的是先把呼吸放稳，再慢慢下到蓝水和礁坡交界处去。',
                    stay: '如果住处就在这种海湾和岸边附近，潜前潜后都会被轻轻接住，不会只有“上下船”的工具感。',
                    food: '这类海域最适合把早餐和潜后热汤都做得清楚一点，让身体和节奏一起慢下来。',
                    scenery: '最好的地方在于近和远都不喧哗。近处是几乎不动的浅水，远处是低低的岛影和山线，整片海显得特别松。',
                    featurePhoto: createReviewPhoto(1, 'feature', '布纳肯 · 小船停在很静的清水边', '50% 56%'),
                    photos: makeReviewPhotos(1, [
                        { key: 'ridge-view', caption: '布纳肯 · 回头看马纳多湾时，层次会慢慢排开', position: '50% 52%' },
                        { key: 'island-outline', caption: '布纳肯 · 离岸以后，岛的轮廓还留在海面上', position: '50% 52%' }
                    ])
                },
                {
                    id: 'review-2',
                    user: '海墙外侧的光',
                    date: '2025年12月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['diving', 'scenery'],
                    title: '布纳肯 · 真正难忘的是海墙外侧那层蓝',
                    subtitle: '等身体已经被岸上的安静接住，再下到海墙边时，布纳肯那种通透感才会真正完整。',
                    summary: '第二组图把布纳肯的核心说明白了。海墙边的珊瑚没有被拍得很躁，而是和深一点的蓝一起慢慢推开；另一张里的珊瑚花园更像把颜色稳稳铺在坡地上。你会发现布纳肯的好看，是完整，而不是用力。',
                    diving: '对喜欢墙潜和长线观察的人来说，这里很友好。你能清楚地读到坡地、蓝水和珊瑚层次，不会总被节奏催着往前冲。',
                    stay: '因为水下不会把人一下掏空，回到岸上以后还会留有很多余裕，这也是布纳肯适合住几晚的原因。',
                    food: '潜后吃点热的、补够水，再去回想水下那片蓝，会比匆匆赶下一站更像布纳肯的方式。',
                    scenery: '最喜欢的是这里的蓝不会直接压下来，而是被珊瑚、坡地和光一点点拆开，所以看得越久越舒服。',
                    featurePhoto: createReviewPhoto(2, 'feature', '布纳肯 · 海墙外侧的蓝会慢慢完全展开', '50% 46%'),
                    photos: makeReviewPhotos(2, [
                        { key: 'coral-garden', caption: '布纳肯 · 珊瑚会把坡地安静地铺满', position: '50% 50%' },
                        { key: 'wall-light', caption: '布纳肯 · 光线落到海墙边时，层次会更清楚', position: '50% 50%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: '回到岛上的风',
                    date: '2025年10月',
                    level: '同行不潜',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.7 / 5',
                    focus: ['stay', 'food', 'scenery'],
                    title: '布纳肯 · 岛上的风会把这程再放轻一点',
                    subtitle: '潜后回到梁海滩和山体之间，才会发现布纳肯真正好的地方，是水下和岸上的节奏都很顺。',
                    summary: '最后这组更像布纳肯的后半天。梁海滩把岸线拉得很长，云和山体又把海面轻轻收住；另一张里两座岛彼此相望，像把这片海的呼吸拉得更开。它让布纳肯不只是一个潜点，而是一整段可以停住的海边时间。',
                    diving: '这种回岸段会把白天的墙潜重新接起来，让布纳肯的记忆不只停在水下那一下。',
                    stay: '住在岛上最大的好处，就是潜完以后真的还能回到风、树影和沙滩之间，而不是直接被行程切断。',
                    food: '这组图最适合接一顿潜后晚餐。不是为了庆祝，而是让海风和岸上的安静把整天慢慢收平。',
                    scenery: '我很喜欢布纳肯这种克制的热带感。海滩、山线和云都不喧哗，但会让人愿意在这里多留一会儿。',
                    featurePhoto: createReviewPhoto(3, 'feature', '布纳肯 · 梁海滩会把潜后的时间轻轻接住', '50% 56%'),
                    photos: makeReviewPhotos(3, [
                        { key: 'cloud-bay', caption: '布纳肯 · 云和山体会把海面慢慢收低', position: '50% 50%' },
                        { key: 'island-pair', caption: '布纳肯 · 两座岛把海的呼吸继续拉开', position: '50% 52%' }
                    ])
                }
            ]);
        }

        if (this.spotId === 7) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '粉沙岸边',
                    date: '2026年3月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['scenery', 'diving'],
                    title: '科莫多 · 粉沙岸会先把这片海点亮',
                    subtitle: '很多人先记住的是强流和蝠鲼，但科莫多真正的开场，常常是从粉沙岸和亮蓝海水开始的。',
                    summary: '这组图把科莫多的第一层气质拍得很准。粉沙岸边的海亮得很直接，可山体还是干燥、克制的；另一张近岸水色更通透，像在提醒你这里的张力从来都来自“轻”和“重”同时出现。',
                    diving: '先看见这样明亮的一层海，再去理解科莫多的流区和大景，会更容易对上它的节奏。',
                    stay: '科莫多舒服的地方，不是把人一直推在船和潜点之间，而是允许你在这种浅水边先把状态放稳。',
                    food: '这类海很适合把潜前简餐和午后补给做得清楚，让人有力气继续往更深的窗口走。',
                    scenery: '最迷人的就是对比。粉色岸线、绿山和亮蓝水面都很轻，但放在一起以后，科莫多的张力已经出来了。',
                    featurePhoto: createReviewPhoto(1, 'feature', '科莫多 · 粉沙岸会先把海点亮', '50% 52%'),
                    photos: makeReviewPhotos(1, [
                        { key: 'pink-beach-wide', caption: '科莫多 · 离岸一点看，粉沙和海会更开阔', position: '50% 54%' },
                        { key: 'pink-beach-shore', caption: '科莫多 · 靠近岸边以后，水色会变得更轻', position: '50% 54%' }
                    ])
                },
                {
                    id: 'review-2',
                    user: '海流之间',
                    date: '2025年12月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['diving', 'scenery', 'stay'],
                    title: '科莫多 · 船在干燥山体和水道之间穿过去',
                    subtitle: '真正让科莫多变得有力量感的，不只是水下那一下，而是船在岛屿、水道和风之间移动时，整片海就已经开始发力了。',
                    summary: '第二组图更像科莫多最典型的白天。船贴着海走，左右是干燥山体和开阔水道；另一张里海面更深，陆地也更硬朗。你会发现这里的“动感”不是热闹，而是水和地形一直在推着剧情往前。',
                    diving: '这就是科莫多和很多慢海不同的地方。哪怕还没下去，你已经能感到窗口、流向和地形在同时工作。',
                    stay: '如果把住处、船程和潜点安排顺，科莫多会很完整，因为它的移动过程本身就值得被留进记忆。',
                    food: '这种海况会消耗人，所以补水和潜后热食都特别重要。身体被接稳，才有力气继续读这片海。',
                    scenery: '我最喜欢的是海和陆地都带着硬朗边界。不是柔软地铺开，而是一层层切出来，这很科莫多。',
                    featurePhoto: createReviewPhoto(2, 'feature', '科莫多 · 开阔水道会先把力量感摆出来', '50% 52%'),
                    photos: makeReviewPhotos(2, [
                        { key: 'boat-channel', caption: '科莫多 · 船在水道里推进时，节奏会一下变明显', position: '50% 54%' },
                        { key: 'dry-coast', caption: '科莫多 · 海和干燥山体之间有很强的边界感', position: '50% 52%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: '傍晚靠回港里',
                    date: '2025年10月',
                    level: '同行不潜',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.7 / 5',
                    focus: ['stay', 'food', 'scenery'],
                    title: '科莫多 · 回到拉布安巴霍以后，海还没有结束',
                    subtitle: '傍晚的港湾、停船和屋顶，会把科莫多从大景流潜慢慢收回到一个更能停留的地方。',
                    summary: '最后这组是科莫多最容易被忽略的一层。回到拉布安巴霍以后，天空变粉，船停在港里，屋顶和海面一起安静下来；另一张岸线又把白天的亮蓝重新接回来。看完会觉得，科莫多不只是一整天被海流推进去，也有很好看的回岸时刻。',
                    diving: '对潜水员来说，这样的回港很重要。它会把白天那些强张力的片段重新收顺，让记忆不只剩下刺激。',
                    stay: '住在港湾附近会特别容易理解科莫多的完整性。白天出海，傍晚回来，海并没有真的被关在外面。',
                    food: '潜后最适合接一顿热的、安静的晚餐。看着港湾里的船灯一点点亮起来，整天才算真正收住。',
                    scenery: '我很喜欢这片海在傍晚的样子。白天它很有推力，到了港里又忽然放轻，这种反差会让人记很久。',
                    featurePhoto: createReviewPhoto(3, 'feature', '科莫多 · 傍晚回到拉布安巴霍，海还会继续发亮', '50% 50%'),
                    photos: makeReviewPhotos(3, [
                        { key: 'harbor-view', caption: '科莫多 · 港湾和群岛会把傍晚慢慢收平', position: '50% 50%' },
                        { key: 'shoreline', caption: '科莫多 · 回到更轻的岸线时，这片海还留在身边', position: '50% 54%' }
                    ])
                }
            ]);
        }

        return finalizeReviews([
            {
                id: 'review-1',
                user: '海面以下',
                date: '2026年2月',
                level: 'OW',
                ratingStars: '★★★★★',
                ratingScore: '4.9 / 5',
                focus: ['diving', 'scenery'],
                summary: this.spotId === 1
                    ? '第一次在诗巴丹下去的时候，最先记住的不是“我潜了多久”，而是龟洞入口那种突然安静下来的蓝。再往前，鲨鱼会从侧面的水层里慢慢出来，最后鱼群风暴真正把整片视线填满。它不是一上来就把你推到最热闹的那一刻，而是让海一层一层地往你面前打开。'
                    : `第一次在 ${name} 下去的时候，真的会一下子忘记自己在数呼吸。水下并不是那种一上来就很吵的热闹，而是越往里看越有层次。我们住的酒店不算特别奢华，但潜完回来能很快安静下来，这一点比想象中重要得多。`,
                diving: this.spotId === 1
                    ? '这次最打动我的不是单一的大景，而是节奏被铺开的方式。先是龟洞入口的结构和光线把人带进去，再是鲨鱼贴着蓝水经过时那种很克制的压迫感，最后鱼群风暴把整片海彻底推满。诗巴丹真正厉害的地方，是它会让你一步一步走进那种“海忽然变得很大”的感觉。'
                    : `水下体验最打动我的是节奏感。前半段先让你慢慢适应，后面才会看到真正让人心动的部分，能见度和海洋生物的出现都很自然。`,
                stay: '房间安静、清洁度好，回到酒店冲完澡就能直接休息，离码头也不远，没有那种奔波感。',
                food: '早餐偏简洁但够用，欢迎晚餐里的海鲜很新鲜，潜后补给也比较细致，不会让人饿着去赶下一段安排。',
                scenery: this.spotId === 1
                    ? '这组三张图比起“出海前后”的时间顺序，更像诗巴丹真正留在脑子里的三个瞬间：龟洞入口的光线、鲨鱼贴着蓝水经过的压迫感，还有鱼群风暴真正合拢时，整片海突然被填满的那一下。'
                    : `最喜欢的是清晨出海前的海面，天刚亮的时候，${name} 的蓝是很安静的，像整天的节奏都先被放慢了。`,
                photos: makeReviewPhotos(1, reviewOnePhotoDefs)
            },
            {
                id: 'review-2',
                user: '礁线记录员',
                date: '2025年12月',
                level: 'AOW',
                ratingStars: '★★★★★',
                ratingScore: '4.8 / 5',
                focus: ['diving', 'stay'],
                summary: `这次来 ${name} 更像是认真给自己排了一次海底假期。潜导会先判断当天状态再安排节奏，不会硬把所有重点都塞进同一天。住处不喧闹，晚上回房能明显感觉身体在慢慢放松下来。`,
                diving: `潜点安排比较成熟，不是单纯堆次数，而是会看当天的窗口、流速和光线，把更值得下去的一潜放在状态更好的时段。`,
                stay: '酒店不强调夸张度假感，但对潜水员非常友好，晾装备、冲洗、午后短休都顺手，住起来很轻松。',
                food: '餐食偏本地风味，海鲜和热食都不错，潜后有热汤和水果会让体感好很多。',
                scenery: '码头和房间外的海面都很干净，傍晚光线落下来时，会觉得这趟旅行不只是去潜水，也是在海边真正停了一会儿。',
                photos: makeReviewPhotos(2, [
                    { key: 'pier-morning', caption: `${name} · 码头晨光`, position: '50% 40%' },
                    { key: 'boat-return', caption: `${name} · 船潜回程`, position: '50% 58%' }
                ])
            },
            {
                id: 'review-3',
                user: '晚风里的海',
                date: '2025年10月',
                level: '入门新手',
                ratingStars: '★★★★☆',
                ratingScore: '4.7 / 5',
                focus: ['food', 'scenery'],
                summary: `原本担心自己经验不够，会不会把这趟行程弄得很紧张，但实际体验比想象中温柔很多。岸上安排不会一直催着赶路，吃饭、休息、看海的时间都有保留下来，所以整个人不会一直处于紧绷状态。`,
                diving: `对入门用户来说，这里的安排算友好，会先让你把身体放进海里，再慢慢往更完整的体验靠，不会一开始就把海况一下子推深。`,
                stay: '住宿最让我满意的是安静度，晚上几乎没有嘈杂声，潜完回来睡一会儿就能恢复很多。',
                food: '早餐比较稳，欢迎晚餐和海鲜做得比预期好，口味不是特别重，潜后吃也舒服；忌口提前备注后也能照顾到。',
                scenery: `我最喜欢的是傍晚码头那段时间，海水颜色会从亮蓝慢慢变深，风一吹过来，整个人会觉得这趟 ${name} 来对了。`,
                photos: makeReviewPhotos(3, [
                    { key: 'before-dinner', caption: `${name} · 潜后晚餐前`, position: '50% 40%' },
                    { key: 'pier-breeze', caption: `${name} · 码头晚风`, position: '50% 58%' },
                    { key: 'room-view', caption: `${name} · 房间外的海`, position: '50% 32%' }
                ])
            },
            {
                id: 'review-4',
                user: '深蓝留白',
                date: '2025年8月',
                level: 'AOW',
                ratingStars: '★★★★★',
                ratingScore: '4.9 / 5',
                focus: ['diving', 'food', 'scenery'],
                summary: `如果你喜欢的是完整的旅行感，不只是看完一个潜点就走，那 ${name} 会很适合。白天的海底、午后的休息、晚上的餐桌和海风，其实都连在一起。这里最好的部分，不是某一秒的刺激，而是整趟行程都没有断掉。`,
                diving: '水下层次很完整，既有让人记得住的生物和海况，也有足够时间把心态放稳，不会只剩“赶紧看完下一个点”的疲惫感。',
                stay: '酒店不张扬，但空间干净，潜后晒装备、洗澡、休息都很顺，像是潜水员真正会需要的那种舒服。',
                food: '晚上的餐桌氛围很好，海鲜和当地热菜都比较新鲜，潜后补充体力这件事被认真对待了，而不是随便解决。',
                scenery: `最难忘的是每天出海和回来的海面颜色变化。${name} 的风景不是特别喧哗的那种美，但会慢慢留在心里。`,
                photos: makeReviewPhotos(4, [
                    { key: 'bow-blue', caption: `${name} · 船头蓝水`, position: '50% 40%' },
                    { key: 'after-dive-pier', caption: `${name} · 潜后码头`, position: '50% 58%' },
                    { key: 'morning-sea', caption: `${name} · 清晨海色`, position: '50% 32%' }
                ])
            }
        ]);
    }

    /**
     * createReviewRatingValues(reviewCount) - 为当前评论列表生成一组轻微浮动的高分评分
     * @param {number} reviewCount - 当前评论数量
     * @returns {number[]} - 一组 0 到 5 之间、保留一位小数的评分值
     */
    createReviewRatingValues(reviewCount) {
        const baseRatings = [4.9, 4.8, 4.7, 4.9];
        const offsets = [-0.1, 0, 0.1];
        const ratingValues = Array.from({ length: reviewCount }, (_, index) => {
            const baseRating = baseRatings[index % baseRatings.length];
            const offset = offsets[Math.floor(Math.random() * offsets.length)];
            return Math.min(5, Math.max(4.6, Number((baseRating + offset).toFixed(1))));
        });

        if (
            reviewCount === baseRatings.length &&
            ratingValues.every((ratingValue, index) => ratingValue === baseRatings[index])
        ) {
            ratingValues[ratingValues.length - 1] = 5.0;
        }

        return ratingValues;
    }

    /**
     * applyReviewRatingVariation(reviews) - 为评论数据补上随机评分数值与展示文案
     * @param {Array<Object>} reviews - 原始评论数据数组
     * @returns {Array<Object>} - 带动态评分的新评论数据数组
     */
    applyReviewRatingVariation(reviews) {
        const ratingValues = this.createReviewRatingValues(reviews.length);
        return reviews.map((review, index) => ({
            ...review,
            ratingValue: ratingValues[index],
            ratingScore: `${ratingValues[index].toFixed(1)} / 5`
        }));
    }

    /**
     * getReviewRatingValue(review) - 从评论数据里提取并钳制实际评分数值
     * @param {Object} review - 当前评论数据对象
     * @returns {number} - 0 到 5 之间的评分数值
     */
    getReviewRatingValue(review) {
        const numericScore = Number.parseFloat(review?.ratingValue ?? review?.ratingScore);
        if (Number.isFinite(numericScore)) {
            return Math.min(Math.max(numericScore, 0), 5);
        }

        const fallbackStars = typeof review?.ratingStars === 'string'
            ? (review.ratingStars.match(/★/g) || []).length
            : 0;

        return Math.min(Math.max(fallbackStars || 0, 0), 5);
    }

    /**
     * createReviewRatingStarsMarkup(review, className) - 按实际评分生成支持小数填充的星级标记
     * @param {Object} review - 当前评论数据对象
     * @param {string} className - 星级容器类名
     * @returns {string} - 星级 HTML 字符串
     */
    createReviewRatingStarsMarkup(review, className) {
        const ratingValue = this.getReviewRatingValue(review);
        const fillPercentage = ((ratingValue / 5) * 100).toFixed(2);

        return `<span class="${className}" aria-hidden="true" style="--rating-fill: ${fillPercentage}%;">★★★★★</span>`;
    }

    // 页面主渲染：把当前潜点的标题、标签、介绍、地图、套餐和评论一次性同步到页面。
    /**
     * renderSpotData() - 将当前潜点的核心内容整体渲染到页面
     * @returns {void} - 无返回值，直接更新页面 DOM
     */
    renderSpotData(options = {}) {
        const {
            measureImmediately = false
        } = options;

        this.destroyDeferredSecondaryHydration();
        this.reviewData = [];
        this.activeReviewLinkedPackageId = null;
        this.hasRenderedReviews = false;
        this.reviewsHydrated = false;
        this.relatedHydrated = false;
        this.footerHydrated = false;
        document.title = `盐憩 - ${this.spotData.name}`;

        document.getElementById('spotName').textContent = this.spotData.name;
        document.getElementById('spotTagline').textContent = this.spotData.tagline;
        this.renderTag('difficultyTag', '进入节奏', this.spotData.difficulty);
        this.renderTag('depthTag', '深度', this.spotData.depth);
        this.renderTag('seasonTag', '最佳季节', this.spotData.season);
        this.syncDepthGaugeProfile();

        const heroImage = document.querySelector('.hero-image');
        if (heroImage) {
            heroImage.src = this.spotData.image;
            heroImage.alt = `${this.spotData.name}潜点风景`;
            heroImage.onerror = () => {
                heroImage.onerror = null;
                heroImage.src = `https://via.placeholder.com/1600x900?text=${encodeURIComponent(this.spotData.name)}`;
            };
        }

        this.body.classList.toggle('spot-mabul', this.spotId === 9);
        this.applyHeroEnvironmentProfile();

        this.packageData = this.buildPackageData();
        this.bookedPackageIds = this.getBookedPackageIdsForCurrentSpot();
        this.selectedPackageId = this.selectedPackageId
            || this.getLatestBookedPackageIdForCurrentSpot()
            || this.getPackageFlowPackages()[0]?.id
            || this.packageData[0]?.id
            || null;

        const minPackagePrice = this.packageData.reduce((lowestPrice, pkg) => {
            const packagePrice = parsePriceValue(pkg.price);
            if (!Number.isFinite(packagePrice)) {
                return lowestPrice;
            }
            return Math.min(lowestPrice, packagePrice);
        }, Number.POSITIVE_INFINITY);

        const priceAmountElement = document.getElementById('priceAmount');
        const heroPriceText = Number.isFinite(minPackagePrice)
            ? formatPriceValue(minPackagePrice)
            : this.spotData.priceFrom;

        window.requestAnimationFrame(() => {
            animateRollingPrice(priceAmountElement, heroPriceText, {
                duration: 2000,
                delay: 180
            });
        });

        this.renderIntroText();
        this.renderMapInfo();
        this.renderItineraries();
        if (this.reviewsFilters) {
            this.reviewsFilters.innerHTML = '';
        }
        if (this.reviewsSection) {
            this.reviewsSection.innerHTML = '';
        }
        if (this.relatedGrid) {
            this.relatedGrid.innerHTML = '';
            this.relatedGrid.style.removeProperty('--related-stage-height');
            this.relatedGrid.style.removeProperty('min-height');
        }
        this.relatedStageStableHeight = 0;
        this.relatedTextLayoutController?.disconnect?.();
        this.relatedTextLayoutController = null;
        this.renderFooter();
        this.footerHydrated = true;
        this.setupDeferredSecondaryHydration();
        this.schedulePostRenderSync({
            immediate: measureImmediately
        });
        this.setupHeroCopyReveal();
        this.resetBookingCopyReveal();
        this.resetIntroReveal();
        this.resetReviewsReveal();
    }

    /**
     * syncDepthGaugeProfile() - 把当前潜点的深度范围同步给详情页深度计
     * @returns {void} - 无返回值，直接刷新详情页深度计显示档位
     */
    syncDepthGaugeProfile() {
        if (!window.DepthManager || typeof window.DepthManager.setDetailGaugeProfile !== 'function') {
            return;
        }

        window.DepthManager.setDetailGaugeProfile(this.spotData.depth);
    }

    /**
     * getHeroEnvironmentProfile() - 根据当前海域返回首屏环境运动 profile。
     * @returns {{ key: string, scrollMood: string }} - 当前海域的环境 profile 与默认滚动情绪
     */
    getHeroEnvironmentProfile() {
        const profileMap = {
            1: { key: 'surge', scrollMood: 'deep' },
            2: { key: 'surge', scrollMood: 'deep' },
            3: { key: 'abyss', scrollMood: 'trench' },
            4: { key: 'garden', scrollMood: 'buoyant' },
            5: { key: 'garden', scrollMood: 'buoyant' },
            6: { key: 'lagoon', scrollMood: 'midwater' },
            7: { key: 'surge', scrollMood: 'deep' },
            8: { key: 'garden', scrollMood: 'midwater' },
            9: { key: 'lagoon', scrollMood: 'buoyant' }
        };

        return profileMap[this.spotId] || { key: 'surge', scrollMood: 'midwater' };
    }

    /**
     * applyHeroEnvironmentProfile() - 把当前海域的环境 profile 写入 body / hero，供首屏和滚动系统共用。
     * @returns {void} - 无返回值，直接同步 data attribute
     */
    applyHeroEnvironmentProfile() {
        if (!this.body) {
            return;
        }

        const heroProfile = this.getHeroEnvironmentProfile();
        this.body.dataset.detailHeroProfile = heroProfile.key;
        this.body.dataset.detailBaseScrollMood = heroProfile.scrollMood;
        this.body.dataset.scrollMood = heroProfile.scrollMood;

        if (this.detailHero) {
            this.detailHero.dataset.heroProfile = heroProfile.key;
        }
    }

    /**
     * queueBookingCopyTimeout() - 把当前这组文案打字动画用到的定时器统一登记起来，方便后面整批取消。
     * @param {Function} callback - 定时结束后要执行的逻辑
     * @param {number} delay - 延迟毫秒数
     * @returns {number} - 当前定时器 id
     */
    queueBookingCopyTimeout(callback, delay) {
        const timer = window.setTimeout(() => {
            this.bookingCopyTypeTimers = this.bookingCopyTypeTimers.filter((id) => id !== timer);
            callback();
        }, delay);

        this.bookingCopyTypeTimers.push(timer);
        return timer;
    }

    /**
     * clearBookingCopyTypeTimers() - 中断正在进行的逐字动画，避免重复播放时旧定时器继续往后跑。
     * @returns {void} - 无返回值，直接清空内部计时状态
     */
    clearBookingCopyTypeTimers() {
        this.bookingCopyTypeTimers.forEach((timer) => window.clearTimeout(timer));
        this.bookingCopyTypeTimers = [];
    }

    /**
     * prepareBookingCopyTypeTargets() - 记录文案原文，并把当前节点清空，为后续逐字敲出做准备。
     * @returns {HTMLElement[]} - 需要执行逐字动画的目标节点数组
     */
    prepareBookingCopyTypeTargets() {
        if (!this.bookingCopy) {
            return [];
        }

        const lineElements = Array.from(this.bookingCopy.querySelectorAll(
            '.booking-kicker-line, .booking-title-line, .booking-intro-line'
        ));

        lineElements.forEach((element) => {
            if (!element.dataset.text) {
                element.dataset.text = element.textContent.trim();
            }

            element.textContent = '';
            element.classList.remove('is-typed');
            element.dataset.typingActive = 'false';
        });

        return lineElements;
    }

    /**
     * preparePackageCardTitleTargets() - 记录套餐标题原文并先清空当前文字，等待进入视口后再逐字敲出。
     * @returns {HTMLElement[]} - 当前页面里所有套餐标题行节点
     */
    preparePackageCardTitleTargets() {
        if (!this.itineraryList) {
            return [];
        }

        const titleLines = Array.from(this.itineraryList.querySelectorAll('.package-card-title-line'));
        titleLines.forEach((line) => {
            if (!line.dataset.text) {
                line.dataset.text = line.textContent.trim();
            }

            line.textContent = '';
            line.classList.remove('is-typed');
        });

        return titleLines;
    }

    /**
     * clearPackageCardTitleTimers() - 中断单个套餐标题当前还没执行完的逐字定时器。
     * @param {HTMLElement} line - 当前标题行节点
     * @returns {void} - 无返回值，直接清空该标题绑定的定时器
     */
    clearPackageCardTitleTimers(line) {
        if (!line || !Array.isArray(line._typeTimers)) {
            return;
        }

        line._typeTimers.forEach((timer) => window.clearTimeout(timer));
        line._typeTimers = [];
    }

    /**
     * queuePackageCardTitleTimeout() - 把单个套餐标题用到的定时器挂到元素上，方便重复渲染时回收。
     * @param {HTMLElement} line - 当前标题行节点
     * @param {Function} callback - 定时结束后要执行的逻辑
     * @param {number} delay - 延迟毫秒数
     * @returns {number} - 当前定时器 id
     */
    queuePackageCardTitleTimeout(line, callback, delay) {
        const timer = window.setTimeout(() => {
            if (Array.isArray(line._typeTimers)) {
                line._typeTimers = line._typeTimers.filter((id) => id !== timer);
            }

            callback();
        }, delay);

        if (!Array.isArray(line._typeTimers)) {
            line._typeTimers = [];
        }

        line._typeTimers.push(timer);
        return timer;
    }

    /**
     * typePackageCardTitleLine() - 把单个套餐标题按字符慢慢敲出来，形成和侧栏一致的安静打字感。
     * @param {HTMLElement} line - 当前标题行节点
     * @returns {Promise<void>} - 当前标题完全显示后结束
     */
    typePackageCardTitleLine(line) {
        return new Promise((resolve) => {
            if (!line || line.dataset.typingActive === 'true' || line.classList.contains('is-typed')) {
                resolve();
                return;
            }

            const text = line.dataset.text || '';
            const characters = Array.from(text);
            if (!characters.length) {
                line.classList.add('is-typed');
                resolve();
                return;
            }

            this.clearPackageCardTitleTimers(line);
            line.dataset.typingActive = 'true';
            line.textContent = '';

            let index = 0;
            const appendNextCharacter = () => {
                const char = characters[index];
                const charNode = document.createElement('span');
                charNode.className = 'package-title-char';
                charNode.textContent = char;

                if (/\s/.test(char)) {
                    charNode.classList.add('is-space');
                }

                line.appendChild(charNode);

                window.requestAnimationFrame(() => {
                    charNode.classList.add('is-visible');
                });

                index += 1;
                if (index >= characters.length) {
                    line.dataset.typingActive = 'false';
                    line.classList.add('is-typed');
                    this.queuePackageCardTitleTimeout(line, resolve, 90);
                    return;
                }

                const extraPause = /[·，。！？,.!?：:]/.test(char) ? 72 : 0;
                this.queuePackageCardTitleTimeout(line, appendNextCharacter, 26 + extraPause);
            };

            appendNextCharacter();
        });
    }

    /**
     * setupPackageCardTitleReveal() - 让套餐卡标题在卡片进入视口后再逐字显现，避免一整屏同时闪出来。
     * @returns {void} - 无返回值，直接注册观察器或降级显示
     */
    setupPackageCardTitleReveal() {
        if (!this.itineraryList) {
            return;
        }

        const titleLines = this.preparePackageCardTitleTargets();
        if (!titleLines.length) {
            return;
        }

        if (this.packageTitleObserver) {
            this.packageTitleObserver.disconnect();
            this.packageTitleObserver = null;
        }

        if (!('IntersectionObserver' in window)) {
            titleLines.forEach((line) => {
                this.typePackageCardTitleLine(line);
            });
            return;
        }

        this.packageTitleObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                this.typePackageCardTitleLine(entry.target);
                this.packageTitleObserver?.unobserve(entry.target);
            });
        }, {
            threshold: 0.36,
            rootMargin: '0px 0px -10% 0px'
        });

        titleLines.forEach((line) => {
            this.packageTitleObserver.observe(line);
        });
    }

    /**
     * typeBookingLine() - 按字符把某一行文案慢慢敲出来。
     * 这里不做机械光标，而是让每个字符带一点模糊解除和轻微上浮，更像海里慢慢显形。
     * @param {HTMLElement} element - 当前行的目标节点
     * @param {string} text - 需要敲出的完整文字
     * @param {number} baseDelay - 常规字符之间的延迟
     * @returns {Promise<void>} - 当前一行全部敲完后结束
     */
    typeBookingLine(element, text, baseDelay) {
        return new Promise((resolve) => {
            const characters = Array.from(String(text || ''));
            if (!element || !characters.length) {
                resolve();
                return;
            }

            element.textContent = '';
            element.classList.remove('is-typed');
            element.dataset.typingActive = 'true';
            let index = 0;

            const appendNextCharacter = () => {
                if (!this.bookingCopyTypingActive) {
                    element.dataset.typingActive = 'false';
                    resolve();
                    return;
                }

                const char = characters[index];
                const charNode = document.createElement('span');
                charNode.className = 'booking-type-char';
                charNode.textContent = char;

                if (/\s/.test(char)) {
                    charNode.classList.add('is-space');
                }

                element.appendChild(charNode);

                window.requestAnimationFrame(() => {
                    charNode.classList.add('is-visible');
                });

                index += 1;
                if (index >= characters.length) {
                    element.dataset.typingActive = 'false';
                    element.classList.add('is-typed');
                    this.queueBookingCopyTimeout(resolve, 220);
                    return;
                }

                const extraPause = /[，。！？,.!?：:]/.test(char) ? 160 : 0;
                this.queueBookingCopyTimeout(appendNextCharacter, baseDelay + extraPause);
            };

            appendNextCharacter();
        });
    }

    /**
     * runBookingCopyTypewriter() - 依次触发潜水匹配文案的逐字敲出。
     * 顺序是：kicker -> 标题 -> 说明文案。
     * @returns {Promise<void>} - 所有文案敲完后结束
     */
    async runBookingCopyTypewriter() {
        if (
            !this.bookingCopy ||
            this.bookingCopyTypingActive ||
            this.bookingCopy.classList.contains('is-typed')
        ) {
            return;
        }

        this.clearBookingCopyTypeTimers();
        this.bookingCopyTypingActive = true;
        this.bookingCopy.classList.remove('is-typed');
        this.bookingCopy.classList.add('is-awakened');

        const kickerLine = this.bookingCopy.querySelector('.booking-kicker-line');
        const titleLines = Array.from(this.bookingCopy.querySelectorAll('.booking-title-line'));
        const introLine = this.bookingCopy.querySelector('.booking-intro-line');

        if (kickerLine) {
            await this.typeBookingLine(kickerLine, kickerLine.dataset.text || '', 42);
        }

        for (const titleLine of titleLines) {
            await this.typeBookingLine(titleLine, titleLine.dataset.text || '', 64);
        }

        if (introLine) {
            await this.typeBookingLine(introLine, introLine.dataset.text || '', 34);
        }

        this.bookingCopyTypingActive = false;
        this.bookingCopy.classList.add('is-typed');
    }

    /**
     * setupBookingCopyReveal() - 让套餐侧栏里的潜水匹配文案在进入视口时以逐字敲出的方式建立。
     * @returns {void} - 无返回值，直接注册观察器或降级显示
     */
    setupBookingCopyReveal() {
        if (!this.bookingCopy) {
            return;
        }

        this.prepareBookingCopyTypeTargets();

        if (!('IntersectionObserver' in window)) {
            this.runBookingCopyTypewriter();
            return;
        }

        this.bookingCopyObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                this.runBookingCopyTypewriter();
                this.bookingCopyObserver?.disconnect();
                this.bookingCopyObserver = null;
            });
        }, {
            threshold: 0.28,
            rootMargin: '0px 0px -10% 0px'
        });

        this.bookingCopyObserver.observe(this.bookingCopy);
    }

    /**
     * resetBookingCopyReveal() - 详情内容重渲染后重置潜水匹配文案显形状态，并在当前视口条件下重新触发
     * @returns {void} - 无返回值，直接更新当前显形状态
     */
    resetBookingCopyReveal() {
        if (!this.bookingCopy) {
            return;
        }

        this.clearBookingCopyTypeTimers();
        this.bookingCopyTypingActive = false;
        this.bookingCopy.classList.remove('is-awakened', 'is-typed');
        this.prepareBookingCopyTypeTargets();

        const rect = this.bookingCopy.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        if (rect.top < viewportHeight * 0.82 && rect.bottom > viewportHeight * 0.1) {
            window.requestAnimationFrame(() => {
                this.runBookingCopyTypewriter();
            });
        }
    }

    /**
     * queueBookingCopySwapTimeout() - 统一登记侧栏陪读文案切换时用到的定时器，便于快速滚动时整批取消。
     * @param {Function} callback - 到时后要执行的回调
     * @param {number} delay - 延迟毫秒数
     * @returns {number} - 当前定时器 id
     */
    queueBookingCopySwapTimeout(callback, delay) {
        const timer = window.setTimeout(() => {
            this.bookingCopySwapTimers = this.bookingCopySwapTimers.filter((id) => id !== timer);
            callback();
        }, delay);

        this.bookingCopySwapTimers.push(timer);
        return timer;
    }

    /**
     * clearBookingCopySwapTimers() - 清空陪读文案切换过程中遗留的定时器，避免边界滚动时出现旧状态回写。
     * @returns {void} - 无返回值，直接清理定时器
     */
    clearBookingCopySwapTimers() {
        this.bookingCopySwapTimers.forEach((timer) => window.clearTimeout(timer));
        this.bookingCopySwapTimers = [];
    }

    /**
     * queueBookingFocusSwapTimeout() - 统一登记套餐焦点舱切换时用到的定时器。
     * @param {Function} callback - 到时后要执行的回调
     * @param {number} delay - 延迟毫秒数
     * @returns {number} - 当前定时器 id
     */
    queueBookingFocusSwapTimeout(callback, delay) {
        const timer = window.setTimeout(() => {
            this.bookingFocusSwapTimers = this.bookingFocusSwapTimers.filter((id) => id !== timer);
            callback();
        }, delay);

        this.bookingFocusSwapTimers.push(timer);
        return timer;
    }

    /**
     * clearBookingFocusSwapTimers() - 清空套餐焦点舱切换过程中遗留的定时器。
     * @returns {void} - 无返回值，直接清理定时器
     */
    clearBookingFocusSwapTimers() {
        this.bookingFocusSwapTimers.forEach((timer) => window.clearTimeout(timer));
        this.bookingFocusSwapTimers = [];
    }

    /**
     * resetBookingCopySwapState() - 清理陪读文案切换时挂上的动画 class 和临时样式。
     * @returns {void} - 无返回值，直接恢复文案容器的稳定状态
     */
    resetBookingCopySwapState() {
        if (!this.bookingCopy) {
            return;
        }

        this.bookingCopy.classList.remove('is-swapping-out', 'is-swapping-in');
        this.bookingCopy.style.removeProperty('transition');
        this.bookingCopy.style.removeProperty('opacity');
        this.bookingCopy.style.removeProperty('transform');
        this.bookingCopy.style.removeProperty('filter');
        this.bookingCopy.style.removeProperty('will-change');
    }

    /**
     * resetBookingFocusSwapState() - 清理套餐焦点舱切换时挂上的动画 class 和临时样式。
     * @returns {void} - 无返回值，直接恢复焦点舱稳定状态
     */
    resetBookingFocusSwapState() {
        if (!this.bookingFocusPanel) {
            return;
        }

        this.bookingFocusPanel.classList.remove('is-swapping-out', 'is-swapping-in');
        this.bookingFocusPanel.style.removeProperty('will-change');
    }

    /**
     * setBookingStickyFocusContextPhase() - 设置 booking-sticky 的聚焦阶段标识，帮助 CSS 过渡。
     * @param {string} phase - 取值 "entering" / "leaving" / "" 。
     * @returns {void}
     */
    setBookingStickyFocusContextPhase(phase) {
        if (!this.bookingSticky) {
            return;
        }

        const normalizedPhase = phase === 'entering' || phase === 'leaving' ? phase : '';
        if (normalizedPhase) {
            this.bookingSticky.dataset.focusContextPhase = normalizedPhase;
        } else {
            delete this.bookingSticky.dataset.focusContextPhase;
        }

        if (this.bookingFocusContextPhaseTimer) {
            window.clearTimeout(this.bookingFocusContextPhaseTimer);
            this.bookingFocusContextPhaseTimer = 0;
        }

        if (!normalizedPhase) {
            return;
        }

        this.bookingFocusContextPhaseTimer = window.setTimeout(() => {
            if (this.bookingSticky) {
                delete this.bookingSticky.dataset.focusContextPhase;
            }
            this.bookingFocusContextPhaseTimer = 0;
        }, 380);
    }

    /**
     * updateBookingStickyStackOffsets() - 根据当前陪读文案高度，更新侧栏双层停驻所需的偏移量。
     * 这样 booking-copy 和 booking-focus-panel 可以一起停住，而不是后者把前者顶掉。
     * @returns {void} - 无返回值，直接写入 sticky 容器 CSS 变量
     */
    updateBookingStickyStackOffsets() {
        if (!this.bookingSticky || !this.bookingCopy) {
            return;
        }

        const copyHeight = Math.ceil(this.bookingCopy.getBoundingClientRect().height || this.bookingCopy.offsetHeight || 0);
        this.bookingSticky.style.setProperty('--booking-copy-stick-top', '0px');
        this.bookingSticky.style.setProperty('--booking-copy-stick-height', `${copyHeight}px`);
        this.bookingSticky.style.setProperty('--booking-sticky-stack-gap', '18px');
    }

    /**
     * shouldCollapseBookingCopy() - 判断陪读文案是否该在更深阅读位置暂时收起。
     * 早段评论仍保留 booking-copy 与焦点舱并行，滑到更深层后再把空间让给套餐焦点舱。
     * @returns {boolean} - 是否应该折叠 booking-copy
     */
    shouldCollapseBookingCopy() {
        const currentKey = this.activeBookingGuideKey || this.getCurrentBookingReadingGuideKey();
        if (currentKey !== 'reviews' && currentKey !== 'related') {
            return false;
        }

        if (currentKey === 'related') {
            return true;
        }

        const reviewsMetric = this.bookingReadingGuideSpecialMetrics.reviews;
        if (!reviewsMetric) {
            return false;
        }

        const scrollY = window.scrollY || window.pageYOffset || 0;
        const probeY = scrollY + this.getSeaGuideOffset() + Math.min(window.innerHeight * 0.28, 240);
        const firstReviewMetric = this.bookingReadingGuideSpecialMetrics.firstReview;
        if (firstReviewMetric) {
            const collapseStart = firstReviewMetric.top + (
                firstReviewMetric.height * (firstReviewMetric.hasFeaturePhoto ? 0.82 : 0.92)
            );
            return probeY >= collapseStart;
        }

        return probeY >= (reviewsMetric.top + reviewsMetric.height * 0.42);
    }

    /**
     * syncBookingCopyDepthState() - 根据当前阅读深度决定 booking-copy 是停留还是退场。
     * @returns {void} - 无返回值，直接切换 booking-copy 折叠状态
     */
    syncBookingCopyDepthState() {
        if (!this.bookingCopy) {
            return;
        }

        this.bookingCopy.classList.toggle('is-collapsed-for-focus', this.shouldCollapseBookingCopy());
    }

    /**
     * setupBookingStickyStack() - 让右侧陪读文案和套餐焦点舱共享同一套 sticky 停驻栈。
     * @returns {void} - 无返回值，直接注册尺寸同步逻辑
     */
    setupBookingStickyStack() {
        if (!this.bookingSticky || !this.bookingCopy) {
            return;
        }

        this.updateBookingStickyStackOffsets();

        if ('ResizeObserver' in window) {
            this.bookingCopyResizeObserver?.disconnect();
            this.bookingCopyResizeObserver = new ResizeObserver(() => {
                this.updateBookingStickyStackOffsets();
            });
            this.bookingCopyResizeObserver.observe(this.bookingCopy);
        } else {
            window.addEventListener('resize', () => {
                this.updateBookingStickyStackOffsets();
            });
        }
    }

    /**
     * getBookingReadingGuideCopy() - 为当前阅读区块生成右侧 sticky 文案。
     * @param {string} sectionKey - 当前左侧正文所在区块 key
     * @returns {{ key: string, kicker: string, title: string, intro: string }} - 对应的陪读引导文案
     */
    getBookingReadingGuideCopy(sectionKey) {
        const spotName = this.spotData?.name || '这片海';
        const guideCopyMap = {
            overview: {
                key: 'overview',
                kicker: 'Sea Dossier',
                title: '海域档案',
                intro: `先把${spotName}的流向、海况与进入方式读清，再决定要用怎样的节奏靠近。`
            },
            map: {
                key: 'map',
                kicker: 'Sea Bearing',
                title: '地图',
                intro: `先沿着地图确认${spotName}落在海上的哪一侧，再想象这一次会从哪一道海流慢慢进入。`
            },
            reviews: {
                key: 'reviews',
                kicker: 'Travel Echoes',
                title: '评价',
                intro: `先听听去过的人怎样记住${spotName}，再判断这片海是不是此刻更适合你的那一片蓝。`
            },
            related: {
                key: 'related',
                kicker: 'Neighboring Waters',
                title: '相邻海域',
                intro: '如果这片蓝还没有收住，就顺着相邻海域继续平移，看看哪一段水色更贴近你现在的呼吸。'
            }
        };

        return guideCopyMap[sectionKey] || guideCopyMap.overview;
    }

    /**
     * getBookingReadingGuideSections() - 收集会驱动右侧陪读文案切换的正文区块。
     * @returns {Array<{ key: string, element: Element }>} - 当前可参与联动的区块定义
     */
    getBookingReadingGuideSections() {
        return [
            { key: 'overview', element: this.introSection },
            { key: 'map', element: this.spotMapHeading || this.mapContainer },
            { key: 'reviews', element: this.spotReviewsHeading || this.reviewsStage || this.reviewsSection },
            { key: 'related', element: this.relatedSection }
        ].filter(({ element }) => element);
    }

    /**
     * measureDetailScrollMetrics() - 统一缓存详情页阅读引导、评论联动和海图导览所需的布局信息。
     * @returns {void}
     */
    measureDetailScrollMetrics() {
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const offset = this.getSeaGuideOffset(true);
        const readingSections = this.getBookingReadingGuideSections();

        this.bookingReadingGuideMetrics = readingSections
            .map(({ key, element }) => {
                if (!element) {
                    return null;
                }

                const rect = element.getBoundingClientRect();
                return {
                    key,
                    top: rect.top + scrollY - offset,
                    height: rect.height
                };
            })
            .filter(Boolean);

        const sectionMetricMap = new Map(
            this.bookingReadingGuideMetrics.map((metric) => [metric.key, metric])
        );
        const reviewsMetric = sectionMetricMap.get('reviews') || null;
        const relatedMetric = sectionMetricMap.get('related') || null;
        const firstReviewCard = this.reviewsSection?.querySelector('.review-card');
        const firstReviewRect = firstReviewCard?.getBoundingClientRect();

        this.bookingReadingGuideSpecialMetrics = {
            reviews: reviewsMetric,
            related: relatedMetric,
            firstReview: firstReviewCard && firstReviewRect ? {
                top: firstReviewRect.top + scrollY,
                height: firstReviewRect.height,
                hasFeaturePhoto: firstReviewCard.classList.contains('has-feature-photo')
            } : null
        };

        this.reviewCardMetrics = this.reviewsSection
            ? Array.from(this.reviewsSection.querySelectorAll('.review-card[data-linked-package-id]'))
                .map((card) => {
                    const rect = card.getBoundingClientRect();
                    return {
                        packageId: card.dataset.linkedPackageId || '',
                        top: rect.top + scrollY,
                        height: rect.height,
                        hasFeaturePhoto: card.classList.contains('has-feature-photo')
                    };
                })
            : [];

        this.seaGuideMetrics = this.seaGuideEntries
            .map((entry) => {
                const selector = entry.dataset.target;
                const target = selector ? document.querySelector(selector) : null;
                if (!selector || !target) {
                    return null;
                }

                const rect = target.getBoundingClientRect();
                return {
                    key: entry.dataset.key || '',
                    selector,
                    top: rect.top + scrollY - offset
                };
            })
            .filter(Boolean);

        this.detailSeaGuideOffset = offset;
    }

    /**
     * scheduleDetailScrollMetricsMeasure() - 把阅读与导览的重测压到下一帧，避免滚动中重复读布局。
     * @returns {void}
     */
    scheduleDetailScrollMetricsMeasure() {
        if (this.detailScrollMetricRaf) {
            return;
        }

        this.detailScrollMetricRaf = window.requestAnimationFrame(() => {
            this.detailScrollMetricRaf = 0;
            this.measureDetailScrollMetrics();
        });
    }

    /**
     * updateDetailReadingAtmosphere() - 同步当前阅读章节，让正文与右侧 sticky 共用一套安静的区块状态。
     * @param {string} sectionKey - 当前阅读区块 key
     * @returns {void} - 无返回值，直接更新页面状态
     */
    updateDetailReadingAtmosphere(sectionKey) {
        if (!this.body) {
            return;
        }

        const nextZone = ['overview', 'map', 'reviews', 'related'].includes(sectionKey)
            ? sectionKey
            : 'overview';
        const baseMood = this.body.dataset.detailBaseScrollMood || 'midwater';
        const zoneMoodMap = {
            overview: baseMood,
            map: 'midwater',
            reviews: 'deep',
            related: 'buoyant'
        };

        this.body.dataset.detailReadingZone = nextZone;
        this.body.dataset.scrollMood = zoneMoodMap[nextZone] || baseMood;

        this.detailReadingSections.forEach((section) => {
            const isCurrent = section.dataset.detailReadingSection === nextZone;
            section.classList.toggle('is-reading-current', isCurrent);
        });

        if (this.bookingSticky) {
            this.bookingSticky.dataset.readingZone = nextZone;
        }

        if (this.bookingCopy) {
            this.bookingCopy.dataset.readingZone = nextZone;
            this.bookingCopy.classList.toggle('is-reading-current', nextZone !== 'related');
        }

        if (this.bookingFocusPanel) {
            this.bookingFocusPanel.dataset.readingZone = nextZone;
            this.bookingFocusPanel.classList.add('is-reading-current');
        }
    }

    /**
     * getCurrentBookingReadingGuideKey() - 根据当前滚动位置判断正文更接近哪一个区块。
     * @returns {string} - 当前应在右侧显示的陪读区块 key
     */
    getCurrentBookingReadingGuideKey() {
        const sections = this.bookingReadingGuideMetrics;
        if (!sections.length) {
            return 'overview';
        }

        const scrollY = window.scrollY || window.pageYOffset || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const offset = this.getSeaGuideOffset();
        const probeY = scrollY + offset + Math.min(viewportHeight * 0.24, 220);
        const relatedMetric = this.bookingReadingGuideSpecialMetrics.related;
        const firstReviewMetric = this.bookingReadingGuideSpecialMetrics.firstReview;
        const relatedEnterThreshold = viewportHeight * 0.52;
        const relatedHoldThreshold = viewportHeight * 0.84;
        if (
            relatedMetric &&
            relatedMetric.top + relatedMetric.height > scrollY + Math.max(viewportHeight * 0.12, 72) &&
            relatedMetric.top <= (
                this.activeBookingGuideKey === 'related'
                    ? scrollY + relatedHoldThreshold
                    : scrollY + relatedEnterThreshold
            )
        ) {
            return 'related';
        }

        const reviewsMetric = this.bookingReadingGuideSpecialMetrics.reviews;
        const reviewAnchorThreshold = viewportHeight * (
            this.activeBookingGuideKey === 'reviews' || this.activeBookingGuideKey === 'related' ? 0.92 : 0.8
        );
        if (
            reviewsMetric &&
            reviewsMetric.top - scrollY <= reviewAnchorThreshold &&
            reviewsMetric.top + reviewsMetric.height > Math.max(viewportHeight * 0.12, 72)
        ) {
            return 'reviews';
        }

        if (
            firstReviewMetric &&
            firstReviewMetric.top - scrollY <= viewportHeight * 0.82 &&
            firstReviewMetric.top + firstReviewMetric.height > Math.max(viewportHeight * 0.12, 72)
        ) {
            return 'reviews';
        }

        let currentKey = sections[0].key;

        sections.forEach(({ key, top }) => {
            if (probeY >= top - 42) {
                currentKey = key;
            }
        });

        return currentKey;
    }

    /**
     * setBookingCopyLineText() - 同步某一行陪读文案的展示文本和后续逐字显形用到的原文缓存。
     * @param {string} selector - 目标行的选择器
     * @param {string} text - 需要显示的文本
     * @returns {void} - 无返回值，直接写回 DOM
     */
    setBookingCopyLineText(selector, text) {
        if (!this.bookingCopy) {
            return;
        }

        const line = this.bookingCopy.querySelector(selector);
        if (!line) {
            return;
        }

        const nextText = String(text ?? '').trim();
        line.dataset.text = nextText;
        line.textContent = nextText;
    }

    /**
     * writeBookingReadingGuideCopy() - 把当前区块对应的陪读文案写入右侧 sticky 侧栏。
     * @param {{ key: string, kicker: string, title: string, intro: string }} guideCopy - 需要写入的文案对象
     * @returns {void} - 无返回值，直接更新侧栏文本
     */
    writeBookingReadingGuideCopy(guideCopy) {
        if (!this.bookingCopy || !guideCopy) {
            return;
        }

        this.bookingCopy.dataset.readingGuideKey = guideCopy.key;
        this.setBookingCopyLineText('.booking-kicker-line', guideCopy.kicker);
        this.setBookingCopyLineText('.booking-title-line', guideCopy.title);
        this.setBookingCopyLineText('.booking-intro-line', guideCopy.intro);
        this.bookingCopy.querySelectorAll('.booking-kicker-line, .booking-title-line, .booking-intro-line').forEach((line) => {
            line.classList.remove('is-typed');
            line.dataset.typingActive = 'false';
        });

        const bookingTitle = this.bookingCopy.querySelector('.booking-title');
        if (bookingTitle) {
            bookingTitle.setAttribute('aria-label', `当前阅读区块：${guideCopy.title}`);
        }

        window.requestAnimationFrame(() => {
            this.updateBookingStickyStackOffsets();
        });
    }

    /**
     * getBookingFocusContextContent() - 根据当前阅读区块，返回右侧套餐焦点舱应显示的陪读语气。
     * @param {string} sectionKey - 当前阅读区块 key
     * @returns {{ state: string, overline: string }} - 当前套餐焦点舱的状态文案
     */
    getBookingFocusContextContent(sectionKey) {
        const contextMap = {
            overview: {
                state: '当前可以一起对照看的安排',
                overline: 'Current Package'
            },
            map: {
                state: '从海图回到进入方式',
                overline: 'Sea Entry'
            },
            reviews: {
                state: '这段评价正在对照下面这套安排',
                overline: 'Review Companion'
            },
            related: {
                state: '继续看别的海时，这一程仍停在这里',
                overline: 'Still Holding'
            }
        };

        return contextMap[sectionKey] || contextMap.overview;
    }

    /**
     * buildBookingFocusMetaMarkup() - 生成右侧套餐焦点舱里的简短信息芯片。
     * @param {Object} pkg - 当前套餐对象
     * @returns {string} - 芯片 HTML 字符串
     */
    buildBookingFocusMetaMarkup(pkg, options = {}) {
        const { isBooked = false } = options;
        const metaItems = [
            isBooked ? '已收进行程' : '',
            pkg?.group,
            pkg?.duration,
            Array.isArray(pkg?.fitTags) ? pkg.fitTags[0] : ''
        ].filter(Boolean);

        return metaItems.map((item) => `
            <span class="booking-focus-chip ${item === '已收进行程' ? 'booking-focus-chip-booked' : ''}">${escapeHtml(item)}</span>
        `).join('');
    }

    /**
     * getBookingFocusSummary() - 生成右侧套餐焦点舱里的摘要句。
     * @param {Object} pkg - 当前套餐对象
     * @param {string} sectionKey - 当前阅读区块 key
     * @returns {string} - 对应的摘要文案
     */
    getBookingFocusSummary(pkg, sectionKey, options = {}) {
        const { isBooked = false } = options;
        const summaryParts = [
            pkg?.audience ? `适合 ${pkg.audience}` : '',
            pkg?.diveSummary || '',
            pkg?.staySummary || ''
        ].filter(Boolean);

        const leadMap = {
            overview: '先把适合自己的节奏停在旁边',
            map: '从位置回到安排时，可以先记住这一程',
            reviews: '现在读到的这段体验，更接近这一套安排',
            related: '就算继续往相邻海域平移，这一程也还留在这里'
        };

        const lead = leadMap[sectionKey] || leadMap.overview;
        const bookedLead = isBooked ? '这套安排已经轻轻收进你的行程里' : lead;
        return `${bookedLead}：${summaryParts.join(' · ')}`;
    }

    /**
     * isBookingFocusOnlyContext() - 判断当前阅读语境是否应该切换到更安静的单焦点侧栏。
     * 评论区和相邻海域区都优先只保留焦点舱，不再让右侧成为第二条滚动时间线。
     * @param {string} [sectionKey=this.activeBookingGuideKey || 'overview'] - 当前阅读区块 key
     * @returns {boolean} - 是否进入单焦点侧栏模式
     */
    isBookingFocusOnlyContext(sectionKey = this.activeBookingGuideKey || 'overview') {
        return sectionKey === 'reviews' || sectionKey === 'related';
    }

    /**
     * updateBookingFocusPrice() - 同步焦点舱价格，并在需要时触发滚动数字动画。
     * @param {string} priceText - 目标价格文本
     * @param {{ animate?: boolean }} [options={}] - 是否播放数字滚动动画
     * @returns {void} - 无返回值，直接更新焦点舱价格
     */
    updateBookingFocusPrice(priceText, options = {}) {
        if (!this.bookingFocusPrice) {
            return;
        }

        const { animate = false } = options;
        this.bookingFocusPrice.dataset.priceTarget = priceText;

        if (!animate) {
            this.bookingFocusPrice.textContent = priceText;
            this.bookingFocusPrice.dataset.priceAnimated = 'true';
            return;
        }

        delete this.bookingFocusPrice.dataset.priceAnimated;
        animateRollingPrice(this.bookingFocusPrice, priceText, {
            duration: 1460,
            delay: 70
        });
    }

    /**
     * writeBookingFocusPanelContent() - 把当前套餐焦点舱的文字、价格和侧栏状态写回 DOM。
     * @param {{ packageId: string, pkg: Object, contextKey: string, contextContent: Object, isReviewContext: boolean, isFocusOnlyContext: boolean, animatePrice?: boolean }} payload - 焦点舱更新所需数据
     * @returns {void} - 无返回值，直接更新套餐焦点舱
     */
    writeBookingFocusPanelContent(payload) {
        if (
            !payload ||
            !this.bookingFocusPanel ||
            !this.bookingFocusState ||
            !this.bookingFocusOverline ||
            !this.bookingFocusTitle ||
            !this.bookingFocusMeta ||
            !this.bookingFocusSummary
        ) {
            return;
        }

        const {
            packageId,
            pkg,
            contextKey,
            contextContent,
            isReviewContext,
            isFocusOnlyContext,
            animatePrice = false
        } = payload;
        const isBooked = this.bookedPackageIds.has(pkg.id);

        this.bookingFocusState.textContent = isBooked ? '这套安排已经收进行程' : contextContent.state;
        this.bookingFocusOverline.textContent = contextContent.overline;
        this.bookingFocusTitle.textContent = pkg.name;
        this.bookingFocusMeta.innerHTML = this.buildBookingFocusMetaMarkup(pkg, { isBooked });
        this.updateBookingFocusPrice(pkg.price, { animate: animatePrice });
        this.bookingFocusSummary.textContent = this.getBookingFocusSummary(pkg, contextKey, { isBooked });
        const hadFocusOnlyContext = this.bookingSticky?.classList.contains('is-focus-only-context') || false;
        if (hadFocusOnlyContext !== isFocusOnlyContext) {
            this.setBookingStickyFocusContextPhase(isFocusOnlyContext ? 'entering' : 'leaving');
        }
        this.bookingSticky?.classList.toggle('is-focus-only-context', isFocusOnlyContext);
        this.bookingSticky?.classList.toggle('has-booked-focus-package', isBooked);
        this.bookingFocusPanel.classList.toggle('is-booked', isBooked);
        this.bookingFocusPanel.classList.toggle('is-review-context', isReviewContext);
        this.itineraryList?.classList.toggle('is-focus-only-context', isFocusOnlyContext);
        if (this.itineraryList) {
            if ('inert' in this.itineraryList) {
                this.itineraryList.inert = isFocusOnlyContext;
            }
            this.itineraryList.setAttribute('aria-hidden', String(isFocusOnlyContext));
        }
        this.applyPackageCardSelectionState(packageId);

        if (isFocusOnlyContext && this.bookingSticky) {
            this.bookingStickyScrollTargetTop = 0;
            this.bookingSticky.scrollTop = 0;
        }

        if (this.bookingFocusAction) {
            this.bookingFocusAction.dataset.packageId = pkg.id;
            this.bookingFocusAction.textContent = isBooked ? '再看这套安排' : '展开这套安排';
            const actionIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            actionIcon.setAttribute('viewBox', '0 0 24 24');
            actionIcon.setAttribute('aria-hidden', 'true');
            actionIcon.innerHTML = `
                <path
                    d="M5 12h14M13 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            `;
            this.bookingFocusAction.appendChild(actionIcon);
        }
        if (this.bookingFocusPanel) {
            this.bookingFocusPanel.dataset.packageId = pkg.id;
        }
    }

    /**
     * pulseBookingFocusPanel() - 给右侧套餐焦点舱一次轻微的更新呼吸感。
     * @returns {void} - 无返回值，直接刷新状态 class
     */
    pulseBookingFocusPanel() {
        if (!this.bookingFocusPanel) {
            return;
        }

        window.clearTimeout(this.bookingFocusPulseTimer);
        restartTransientClassAnimation(this.bookingFocusPanel, 'is-pulsing');

        this.bookingFocusPulseTimer = window.setTimeout(() => {
            this.bookingFocusPanel?.classList.remove('is-pulsing');
            this.bookingFocusPulseTimer = 0;
        }, 820);
    }

    /**
     * syncBookingFocusPanel() - 同步右侧套餐焦点舱，让价格与当前套餐在阅读评论时仍清晰停留。
     * @param {{ force?: boolean, immediate?: boolean, animatePrice?: boolean|null }} [options={}] - 是否强制刷新、是否跳过焦点舱切换、是否自定义价格动效
     * @returns {void} - 无返回值，直接更新焦点舱内容
     */
    syncBookingFocusPanel(options = {}) {
        if (
            !this.bookingFocusPanel ||
            !this.bookingFocusState ||
            !this.bookingFocusOverline ||
            !this.bookingFocusTitle ||
            !this.bookingFocusMeta ||
            !this.bookingFocusPrice ||
            !this.bookingFocusSummary
        ) {
            return;
        }

        const { force = false, immediate = false, animatePrice = null } = options;
        const packageId = this.selectedPackageId || this.getPackageFlowPackages()[0]?.id || this.packageData[0]?.id || '';
        if (!packageId) {
            return;
        }

        const pkg = this.getPackageById(packageId);
        if (!pkg) {
            return;
        }

        const contextKey = this.activeBookingGuideKey || 'overview';
        if (
            !force &&
            packageId === this.activeBookingFocusPackageId &&
            contextKey === this.activeBookingFocusContextKey
        ) {
            return;
        }

        const contextContent = this.getBookingFocusContextContent(contextKey);
        const isReviewContext = contextKey === 'reviews';
        const isFocusOnlyContext = this.isBookingFocusOnlyContext(contextKey);
        const previousPackageId = this.activeBookingFocusPackageId;
        const isFirstFocusPaint = !previousPackageId;
        const shouldAnimateSwap = !isFirstFocusPaint && packageId !== previousPackageId;
        const shouldAnimatePrice = animatePrice == null
            ? (isFirstFocusPaint || packageId !== previousPackageId)
            : Boolean(animatePrice);
        this.activeBookingFocusPackageId = packageId;
        this.activeBookingFocusContextKey = contextKey;

        const focusPanelPayload = {
            packageId,
            pkg,
            contextKey,
            contextContent,
            isReviewContext,
            isFocusOnlyContext,
            animatePrice: shouldAnimatePrice
        };

        this.clearBookingFocusSwapTimers();
        this.resetBookingFocusSwapState();

        if (immediate || !shouldAnimateSwap) {
            this.writeBookingFocusPanelContent(focusPanelPayload);
            return;
        }

        this.bookingFocusSwapVersion += 1;
        const transitionVersion = this.bookingFocusSwapVersion;
        this.bookingFocusPanel.style.willChange = 'transform, opacity, filter';
        this.bookingFocusPanel.classList.add('is-swapping-out');

        this.queueBookingFocusSwapTimeout(() => {
            if (!this.bookingFocusPanel || transitionVersion !== this.bookingFocusSwapVersion) {
                return;
            }

            this.writeBookingFocusPanelContent(focusPanelPayload);
            this.bookingFocusPanel.classList.remove('is-swapping-out');
            window.requestAnimationFrame(() => {
                if (this.bookingFocusPanel && transitionVersion === this.bookingFocusSwapVersion) {
                    this.bookingFocusPanel.classList.add('is-swapping-in');
                }
            });

            this.queueBookingFocusSwapTimeout(() => {
                if (!this.bookingFocusPanel || transitionVersion !== this.bookingFocusSwapVersion) {
                    return;
                }

                this.resetBookingFocusSwapState();
            }, 860);
        }, 180);
    }

    /**
     * syncBookingReadingGuide() - 让右侧 sticky 侧栏随着左侧阅读区块更新引导文案。
     * 首次进入保持当前逐字显形，后续区块切换改成更明显的分行漂移与浮现，避免阅读中生硬换字。
     * @param {{ force?: boolean, immediate?: boolean }} [options={}] - 是否强制刷新、是否跳过过渡
     * @returns {void} - 无返回值，直接同步侧栏文案
     */
    syncBookingReadingGuide(options = {}) {
        if (!this.bookingCopy) {
            return;
        }

        const { force = false, immediate = false } = options;
        const nextKey = this.getCurrentBookingReadingGuideKey();
        if (!force && nextKey === this.activeBookingGuideKey) {
            this.updateDetailReadingAtmosphere(nextKey);
            return;
        }

        const nextGuideCopy = this.getBookingReadingGuideCopy(nextKey);

        this.activeBookingGuideKey = nextGuideCopy.key;
        this.updateDetailReadingAtmosphere(nextGuideCopy.key);
        this.syncBookingFocusPanel({ force: true });
        this.clearBookingCopySwapTimers();
        this.bookingCopySwapVersion += 1;
        const transitionVersion = this.bookingCopySwapVersion;
        this.resetBookingCopySwapState();

        if (this.bookingCopyTypingActive) {
            this.clearBookingCopyTypeTimers();
            this.bookingCopyTypingActive = false;
        }

        if (immediate) {
            this.writeBookingReadingGuideCopy(nextGuideCopy);
            return;
        }

        this.bookingCopy.classList.add('is-typed');
        this.bookingCopy.style.willChange = 'opacity, transform, filter';
        this.bookingCopy.classList.add('is-swapping-out');

        this.queueBookingCopySwapTimeout(() => {
            if (!this.bookingCopy || transitionVersion !== this.bookingCopySwapVersion) {
                return;
            }

            this.writeBookingReadingGuideCopy(nextGuideCopy);
            this.bookingCopy.classList.remove('is-swapping-out');
            window.requestAnimationFrame(() => {
                if (this.bookingCopy && transitionVersion === this.bookingCopySwapVersion) {
                    this.bookingCopy.classList.add('is-swapping-in');
                }
            });

            this.queueBookingCopySwapTimeout(() => {
                if (!this.bookingCopy || transitionVersion !== this.bookingCopySwapVersion) {
                    return;
                }

                this.resetBookingCopySwapState();
            }, 860);
        }, 240);
    }

    /**
     * getDetailHeroTitleUnits(titleText) - 把详情页主标题拆成适合缓慢显形的最小片段
     * @param {string} titleText - 当前潜点标题
     * @returns {string[]} - 用于逐段显现的标题单元
     */
    getDetailHeroTitleUnits(titleText) {
        const safeTitle = String(titleText || '').trim();
        if (!safeTitle) {
            return [];
        }

        if (/\s/.test(safeTitle)) {
            return safeTitle.split(/\s+/).filter(Boolean);
        }

        return Array.from(safeTitle);
    }

    /**
     * setupHeroCopyReveal() - 把详情页首屏文案做成“被海慢慢照亮”的缓慢显形
     * @returns {void} - 无返回值，直接重写首屏标题结构并触发显形状态
     */
    setupHeroCopyReveal() {
        const hero = document.getElementById('detailHero');
        const titleEl = document.getElementById('spotName');
        const subtitleEl = document.getElementById('spotTagline');

        if (!hero || !titleEl || !subtitleEl) {
            return;
        }

        const titleText = this.spotData.name || titleEl.textContent.trim();
        const subtitleText = this.spotData.tagline || subtitleEl.textContent.trim();
        const titleUnits = this.getDetailHeroTitleUnits(titleText);

        titleEl.setAttribute('aria-label', titleText);
        titleEl.innerHTML = titleUnits.map((unit, index) => `
            <span class="detail-title-unit" style="--detail-unit-delay: ${index * 120}ms" aria-hidden="true">${escapeHtml(unit)}</span>
        `).join('');

        subtitleEl.innerHTML = `<span class="detail-subtitle-line">${escapeHtml(subtitleText)}</span>`;

        hero.classList.remove('detail-hero-awakened');

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                hero.classList.add('detail-hero-awakened');
            });
        });
    }

    /**
     * renderTag(elementId, label, value) - 渲染英雄区的单个信息标签
     * @param {string} elementId - 标签容器元素 ID
     * @param {string} label - 标签标题
     * @param {string} value - 标签内容
     * @returns {void} - 无返回值，直接更新标签 DOM
     */
    renderTag(elementId, label, value) {
        const element = document.getElementById(elementId);
        if (!element) {
            return;
        }

        element.innerHTML = `<strong>${label}</strong> ${value}`;
    }

    // 介绍区渲染：将当前潜点的地理位置、生物、注意事项和天气信息写入正文区域。
    /**
     * renderIntroText() - 渲染潜点介绍正文内容
     * @returns {void} - 无返回值，直接更新介绍区 DOM
     */
    renderIntroText() {
        const introText = document.getElementById('introText');
        if (!introText) {
            return;
        }

        const { features, name } = this.spotData;
        const wildlifeItems = features.wildlife.map((item, index) => `
            <li class="intro-bullet-item" style="--intro-item-delay:${index * 70}ms;">
                <span class="intro-bullet-dot" aria-hidden="true"></span>
                <span>${escapeHtml(item)}</span>
            </li>
        `).join('');
        const warningItems = features.warnings.map((item, index) => `
            <li class="intro-bullet-item intro-bullet-item-warning" style="--intro-item-delay:${index * 70}ms;">
                <span class="intro-bullet-dot" aria-hidden="true"></span>
                <span>${escapeHtml(item)}</span>
            </li>
        `).join('');

        introText.innerHTML = `
            <div class="intro-archive-grid">
                <section class="intro-archive-card intro-card-location" style="--intro-card-order:0;">
                    <div class="intro-card-head">
                        <span class="intro-card-index">01</span>
                        <h3 class="intro-card-title">地理位置</h3>
                    </div>
                    <div class="intro-card-body">
                        <p class="intro-card-paragraph" style="--intro-item-delay:0ms;">
                            ${escapeHtml(features.location)}
                        </p>
                    </div>
                </section>

                <section class="intro-archive-card intro-card-wildlife" style="--intro-card-order:1;">
                    <div class="intro-card-head">
                        <span class="intro-card-index">02</span>
                        <h3 class="intro-card-title">水下生物</h3>
                    </div>
                    <div class="intro-card-body">
                        <p class="intro-card-paragraph" style="--intro-item-delay:0ms;">
                            在${escapeHtml(name)}，你更可能先遇见层层推进的鱼群、巡游的大型海洋生物，以及让整片海忽然安静下来的那种蓝。
                        </p>
                        <ul class="intro-bullet-list">
                            ${wildlifeItems}
                        </ul>
                    </div>
                </section>

                <section class="intro-archive-card intro-card-warnings" style="--intro-card-order:2;">
                    <div class="intro-card-head">
                        <span class="intro-card-index">03</span>
                        <h3 class="intro-card-title">潜水注意事项</h3>
                    </div>
                    <div class="intro-card-body">
                        <p class="intro-card-paragraph" style="--intro-item-delay:0ms;">
                            进入这片海之前，先把呼吸、经验和当天海况对齐，往往比一味追求多看一两个点位更重要。
                        </p>
                        <ul class="intro-bullet-list intro-bullet-list-calm">
                            ${warningItems}
                        </ul>
                    </div>
                </section>

                <section class="intro-archive-card intro-card-weather" style="--intro-card-order:3;">
                    <div class="intro-card-head">
                        <span class="intro-card-index">04</span>
                        <h3 class="intro-card-title">天气与水温</h3>
                    </div>
                    <div class="intro-card-body">
                        <p class="intro-card-paragraph" style="--intro-item-delay:0ms;">
                            如果想更从容地靠近这片海，通常可以先从季节、水温和能见度这三件事开始判断它当下的语气。
                        </p>
                        <div class="intro-weather-grid">
                            <article class="intro-weather-card" style="--intro-item-delay:80ms;">
                                <span class="intro-weather-label">最佳季节</span>
                                <strong class="intro-weather-value">${escapeHtml(features.weather.season)}</strong>
                            </article>
                            <article class="intro-weather-card" style="--intro-item-delay:140ms;">
                                <span class="intro-weather-label">平均水温</span>
                                <strong class="intro-weather-value">${escapeHtml(features.weather.temperature)}</strong>
                            </article>
                            <article class="intro-weather-card" style="--intro-item-delay:200ms;">
                                <span class="intro-weather-label">能见度</span>
                                <strong class="intro-weather-value">${escapeHtml(features.weather.visibility)}</strong>
                            </article>
                        </div>
                    </div>
                </section>
            </div>
        `;
    }

    /**
     * setupIntroReveal() - 监听“潜点介绍”进入视口后，再把章节标题和四张档案卡按层次唤醒。
     * 这里不做逐字效果，而是让整块内容像海域档案一样一层层被打开。
     * @returns {void} - 无返回值，直接注册介绍区显现逻辑
     */
    setupIntroReveal() {
        if (!this.introSection) {
            return;
        }

        this.introRevealObserver?.disconnect();

        if (!('IntersectionObserver' in window)) {
            this.introSection.classList.add('is-visible');
            return;
        }

        this.introRevealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add('is-visible');
                this.introRevealObserver?.unobserve(entry.target);
            });
        }, {
            // 介绍区本身比较高，如果用太高的 threshold，
            // 用户明明已经先看到章节头了，整块档案卡却还没被唤醒。
            // 这里把触发条件前提到“刚进入阅读区”就开始显形，
            // 这样一进到这层海，文字和卡片就会更早把用户接住。
            threshold: 0.04,
            rootMargin: '0px 0px -4% 0px'
        });

        this.introRevealObserver.observe(this.introSection);
    }

    /**
     * resetIntroReveal() - 详情内容重新渲染后，重置介绍区显现状态，并在当前已接近视口时重新触发。
     * 这样切换潜点或二次渲染时，不会出现内容已换但动画状态还停留在旧节点上的情况。
     * @returns {void} - 无返回值，直接更新介绍区的可见状态
     */
    resetIntroReveal() {
        if (!this.introSection) {
            return;
        }

        this.introSection.classList.remove('is-visible');

        if (!('IntersectionObserver' in window)) {
            this.introSection.classList.add('is-visible');
            return;
        }

        this.setupIntroReveal();

        const rect = this.introSection.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        // 详情页进入时，“潜点介绍”这一层经常已经贴近首屏下缘。
        // 如果这里判断太保守，用户会先看到一片空的正文区域，
        // 等再多滚一点才突然出现。把可见范围放宽后，
        // 章节头和档案卡会在用户刚准备阅读时就开始动画。
        if (rect.top < viewportHeight * 1.02 && rect.bottom > viewportHeight * 0.04) {
            window.requestAnimationFrame(() => {
                this.introSection.classList.add('is-visible');
                this.introRevealObserver?.unobserve(this.introSection);
            });
        }
    }

    // 海域定位台数据：组织“海域位置 / 到达方式 / 水下结构”三态视图所需内容。
    /**
     * buildSeaAtlasData() - 生成海域定位台三种视图所需的数据结构
     * @returns {Object} - 海域定位台数据对象
     */
    buildSeaAtlasData() {
        const presets = {
            1: {
                country: '马来西亚',
                region: '沙巴州 · 仙本那外海',
                sea: '苏禄海',
                positionNote: '潜点位于外海深蓝断层边缘，真正的魅力在于海墙落差、蓝水通透感和大型鱼群在同一条线上同时发生。',
                current: '中强流，沿海墙推进',
                levelSummary: 'AOW 推荐，OW 需保守点位',
                route: {
                    hotel: '仙本那海边酒店',
                    harbor: '仙本那码头',
                    boatTime: '45–60 分钟',
                    routeCopy: '从仙本那外海出发，快艇会先离开近岸平台，再进入更通透的深蓝水域。',
                    journey: [
                        '清晨从酒店集合，确认装备、电脑表和当天海况。',
                        '经仙本那码头登船，沿外海平台推进到诗巴丹名额点位。',
                        '靠近主潜线后再做一次 briefing，确认流向、集合深度和出水方式。'
                    ]
                },
                underwater: {
                    title: '海墙与蓝水交界',
                    copy: '这片海的核心不是单一景观，而是海墙、流线和鱼群在不同深度层里接力出现。',
                    layers: [
                        { depth: '0–8m', title: '表层光带', note: '下水适应、集合与光线最明亮的一层。' },
                        { depth: '8–18m', title: '礁顶与龟道', note: '海龟、礁鱼和第一层蓝水在这里变得清楚。' },
                        { depth: '18–40m', title: '海墙与鱼群线', note: '梭鱼风暴、海狼与更强流场集中在这一层。' }
                    ],
                    hotspots: [
                        { title: '海墙边缘', text: '适合观察大景和鱼群流向，也是 AOW 更能潜出层次的位置。' },
                        { title: '龟道与礁顶', text: 'OW 在更保守的点位能先进入这片海的节奏。' }
                    ],
                    levels: [
                        { title: 'OW 友好区', text: '更适合停留在礁顶和更稳的集合深度，重点放在适应节奏。' },
                        { title: 'AOW 推荐区', text: '能更完整进入海墙边缘与蓝水交界，理解诗巴丹真正的张力。' }
                    ]
                }
            },
            2: {
                country: '帕劳共和国',
                region: '科罗尔外海',
                sea: '西太平洋外海',
                positionNote: '这里不是一张单独的点位地图，而是一组由蓝洞、蓝角和大断层串起来的海域剧场。',
                current: '中强流，外海转角明显',
                levelSummary: 'AOW 推荐',
                route: {
                    hotel: '科罗尔潜水酒店',
                    harbor: '马拉卡尔港',
                    boatTime: '40–70 分钟',
                    routeCopy: '从科罗尔一带出海，快艇会根据当日窗口在蓝洞、蓝角或断层之间调度主潜线。',
                    journey: [
                        '酒店集合后前往马拉卡尔港，确认 SMB 和放流节奏。',
                        '根据潮汐和流向决定先去洞穴光线还是外海转角。',
                        '到达主潜点前会再次确认下潜方式、转角集合和出水位置。'
                    ]
                },
                underwater: {
                    title: '洞穴光柱与外海转角',
                    copy: '帕劳的结构像被海流切开的地形剧场，洞穴、断层和转角各有不同节奏。',
                    layers: [
                        { depth: '0–10m', title: '表层台地', note: '阳光稳定，适合整理队形和确认转角流向。' },
                        { depth: '10–22m', title: '蓝洞与断层窗', note: '光柱、地形和视野层次在这一带最完整。' },
                        { depth: '22–35m', title: '蓝角主流线', note: '更开阔，也更考验对外海流潜的判断。' }
                    ],
                    hotspots: [
                        { title: '蓝洞光线层', text: '适合光线与洞穴感，节奏比转角更内敛。' },
                        { title: '蓝角流线区', text: '更成熟的潜水员会把真正的帕劳记忆留在这里。' }
                    ],
                    levels: [
                        { title: 'OW 保守体验', text: '更适合风平的浅层点位，不建议盲目追高流速主线。' },
                        { title: 'AOW 主线', text: '能更完整处理洞穴、断层和外海流向之间的切换。' }
                    ]
                }
            },
            3: {
                country: '伯利兹',
                region: '灯塔礁外海',
                sea: '加勒比海',
                positionNote: '大蓝洞的核心不是海面上的圆，而是垂直向下的结构张力和它与环礁浅区之间的强烈反差。',
                current: '中弱流，深度管理优先',
                levelSummary: 'AOW / 深潜经验更合适',
                route: {
                    hotel: '伯利兹城或外岛酒店',
                    harbor: '伯利兹出海码头',
                    boatTime: '2–3 小时',
                    routeCopy: '这是一条更长的外海航线，出发本身就像在慢慢离开岸线，接近一片更克制、更深的蓝。',
                    journey: [
                        '清晨很早从酒店出发，前往伯利兹外海出海点。',
                        '长船程进入灯塔礁区域，先在外圈浅区做状态调整。',
                        '正式接近蓝洞主体前，会再次确认深度、返程气量与上升节奏。'
                    ]
                },
                underwater: {
                    title: '垂直井口与环礁浅区',
                    copy: '大蓝洞的看点在于结构感本身，深蓝井口、洞顶钟乳石与外圈浅礁共同构成这片海。',
                    layers: [
                        { depth: '0–12m', title: '环礁浅光带', note: '适合先完成热身，也保留更热带的色彩和光。' },
                        { depth: '12–26m', title: '井口过渡层', note: '从浅礁色彩切入深蓝压迫感，是心理落差最大的一段。' },
                        { depth: '26–40m', title: '洞顶结构层', note: '真正的地貌记忆发生在这里，但也需要更严格的深度管理。' }
                    ],
                    hotspots: [
                        { title: '井口边缘', text: '是“看见深蓝”最强的一条线，适合成熟潜水员停留感受。' },
                        { title: '外圈浅礁', text: '回到浅区后，整个海域的色彩和呼吸感会重新变得轻盈。' }
                    ],
                    levels: [
                        { title: 'OW 观察层', text: '更适合留在外圈浅礁和环礁区，不建议把蓝洞主体当入门深潜。' },
                        { title: 'AOW / 进阶层', text: '更能完整理解井口、洞顶和返程节奏之间的关系。' }
                    ]
                }
            },
            4: {
                country: '印度尼西亚',
                region: '帝汶岛海岸线',
                sea: '萨武海',
                positionNote: '帝汶的定位不是猛烈，而是舒展。坡地、珊瑚和更慢的海岸节奏，让这片海更适合长时间停驻。',
                current: '缓流到中流',
                levelSummary: 'OW 友好',
                route: {
                    hotel: '海边潜水酒店',
                    harbor: '潜店小码头',
                    boatTime: '15–45 分钟',
                    routeCopy: '从岸边出发的距离通常不长，更多时间会留给你在海面上看清这片海的层次。',
                    journey: [
                        '酒店集合，按当天海况选择岸潜或短船程点位。',
                        '离开码头后很快就能到达珊瑚坡地与外海交界区。',
                        '主潜点前 briefing 会更强调节奏、微距观察和潜后恢复。'
                    ]
                },
                underwater: {
                    title: '坡地珊瑚与慢潜线',
                    copy: '这片海更适合把注意力放在层次和停留上，而不是急着追逐某个瞬间。',
                    layers: [
                        { depth: '0–6m', title: '浅礁与日光层', note: '光线稳定，适合初次适应和更轻松的观察。' },
                        { depth: '6–18m', title: '珊瑚坡地', note: '大部分生态与色彩在这一层展开，也是帝汶最舒服的节奏区。' },
                        { depth: '18–32m', title: '外坡过渡带', note: '更成熟的潜水员可以在这里看到更开阔的海底层次。' }
                    ],
                    hotspots: [
                        { title: '珊瑚坡地', text: '适合慢慢看、慢慢拍，整片海不会催着你往前赶。' },
                        { title: '夜潜边界', text: '傍晚或夜潜时，小生物和软体动物会让体验更完整。' }
                    ],
                    levels: [
                        { title: 'OW 推荐区', text: '浅层与中层都很友好，适合把潜水和度假放在一起。' },
                        { title: 'AOW 延展区', text: '可往外坡带延伸，看更开阔的蓝水和坡地落差。' }
                    ]
                }
            },
            5: {
                country: '密克罗尼西亚',
                region: '波纳佩环礁',
                sea: '西太平洋静水海域',
                positionNote: '波纳佩不是一片用“气势”征服人的海，它更像放慢后的显微镜，让细节自己浮现出来。',
                current: '静水到缓流',
                levelSummary: '入门 / OW 友好',
                route: {
                    hotel: '波纳佩海湾酒店',
                    harbor: '科洛尼亚码头',
                    boatTime: '10–35 分钟',
                    routeCopy: '从海湾和环礁边缘出发，通常不用很久就能到达更适合慢潜和微距观察的区域。',
                    journey: [
                        '从酒店集合后前往科洛尼亚码头，节奏通常比较轻。',
                        '根据天气和能见度决定今天更偏微距、夜潜还是浅礁观察。',
                        '到点前会先提醒队伍压低动作和保持底沙控制。'
                    ]
                },
                underwater: {
                    title: '微距生态与静水观察',
                    copy: '这里的海底更像一页页被翻开的观察笔记，真正的惊喜常常来自更小的尺度。',
                    layers: [
                        { depth: '0–5m', title: '海草与浅礁层', note: '适合轻松热身，也容易先看到幼鱼和小型生物。' },
                        { depth: '5–14m', title: '微距主观察层', note: '大多数细节都在这个深度段慢慢出现。' },
                        { depth: '14–24m', title: '静水延展层', note: '适合经验更稳的人继续做微距或夜潜延伸。' }
                    ],
                    hotspots: [
                        { title: '软珊瑚平台', text: '适合耐心观察，很多小型生物会在这里反复出现。' },
                        { title: '夜潜带', text: '到了夜里，这片海会从安静变成细节密集。' }
                    ],
                    levels: [
                        { title: '入门 / OW 区', text: '整片海的节奏本来就比较友好，非常适合把潜水放慢。' },
                        { title: 'AOW 延展区', text: '更适合做长时间观察、夜潜和更细致的摄影练习。' }
                    ]
                }
            },
            6: {
                country: '印度尼西亚',
                region: '北苏拉威西外海',
                sea: '苏拉威西海',
                positionNote: '布纳肯的定位像一条明亮的海墙线，海龟、清澈蓝水和更从容的墙潜节奏在这里取得了很好的平衡。',
                current: '缓流到中流',
                levelSummary: 'OW / AOW 都适合',
                route: {
                    hotel: '布纳肯岛度假村',
                    harbor: '马纳多码头',
                    boatTime: '30–45 分钟',
                    routeCopy: '从马纳多一带出发后不久，海水就会变得更通透，墙潜线会在靠近海洋公园时逐渐打开。',
                    journey: [
                        '酒店或度假村集合，先确认当天更适合海墙、海龟还是浅礁点位。',
                        '从马纳多码头或岛上码头登船，进入布纳肯海洋公园主线。',
                        '靠近海墙边缘后会先做一轮更轻的适应，再进入更深一点的蓝。'
                    ]
                },
                underwater: {
                    title: '海墙、海龟与明亮蓝水',
                    copy: '布纳肯的魅力来自平衡感，既有海墙的落差，也不会把整趟潜水推得太紧。',
                    layers: [
                        { depth: '0–6m', title: '表层亮带', note: '阳光感很强，适合轻松热身和集合。' },
                        { depth: '6–18m', title: '海龟巡游层', note: '海龟和礁鱼常在这一层停留，节奏很舒服。' },
                        { depth: '18–30m', title: '墙潜延展层', note: 'AOW 更能在这里看出海墙、蓝水和外坡的关系。' }
                    ],
                    hotspots: [
                        { title: '海墙边缘', text: '适合看通透蓝水和更完整的墙潜线条。' },
                        { title: '珊瑚平台', text: 'OW 也能在更舒适的深度里把这片海看得很完整。' }
                    ],
                    levels: [
                        { title: 'OW 友好区', text: '中浅层就足够漂亮，也不会因为海况被压得太紧。' },
                        { title: 'AOW 延展区', text: '可继续往海墙边缘移动，看更开阔的蓝水和落差。' }
                    ]
                }
            },
            7: {
                country: '印度尼西亚',
                region: '科莫多国家公园',
                sea: '科莫多海峡',
                positionNote: '这是一片被潮汐和海流写出骨架的海域，真正决定体验的，不只是潜点名，而是当天流向和窗口。',
                current: '中强流，窗口变化快',
                levelSummary: 'AOW 推荐',
                route: {
                    hotel: '拉布安巴霍海景酒店',
                    harbor: '拉布安巴霍码头',
                    boatTime: '45–90 分钟',
                    routeCopy: '出海后的推进感很明显，海峡之间的潮汐和外海风向会直接决定今天该往哪一片水走。',
                    journey: [
                        '从拉布安巴霍出发，先按潮汐和风向确认主潜线。',
                        '快艇进入国家公园后，会根据窗口灵活切换蝠鲼、流区或大景点位。',
                        '正式入水前会反复强调集合方式、放流和出水回收。'
                    ]
                },
                underwater: {
                    title: '海峡流线与大景潜',
                    copy: '科莫多不是单一结构，而是一整片由海流驱动的海底剧场，蝠鲼、大鱼和外坡会在不同窗口轮流出现。',
                    layers: [
                        { depth: '0–8m', title: '表层准备带', note: '先判断能见度、温差和水流强度。' },
                        { depth: '8–20m', title: '主观景层', note: '蝠鲼、大鱼和流线最常在这一层交会。' },
                        { depth: '20–34m', title: '外坡延展层', note: '更成熟的潜水员能在这里理解科莫多的真正张力。' }
                    ],
                    hotspots: [
                        { title: '流区转角', text: '决定这片海“有多科莫多”的往往就是这里。' },
                        { title: '蝠鲼清洁站', text: '适合耐心停留，而不是追逐。' }
                    ],
                    levels: [
                        { title: 'OW 保守区', text: '只建议在更温和窗口和更友好点位保守体验。' },
                        { title: 'AOW 主线', text: '更能理解流线、点位切换和大景潜的节奏。' }
                    ]
                }
            },
            8: {
                country: '法属波利尼西亚',
                region: '图阿莫图群岛',
                sea: '南太平洋环礁通道',
                positionNote: '图阿莫图更像一整套被潮汐定义的蓝水结构，通道决定方向，大鱼决定记忆，开阔感决定它的气质。',
                current: '通道流，受潮汐影响明显',
                levelSummary: 'AOW 推荐',
                route: {
                    hotel: '环礁旅馆或船宿',
                    harbor: '主码头 / 环礁泊位',
                    boatTime: '20–60 分钟',
                    routeCopy: '真正的出发点是潮汐窗口。路线会围绕进出水流与通道节奏来设计，而不是按固定顺序打卡。',
                    journey: [
                        '从旅馆或船宿出发，先按潮汐时刻表确认当天窗口。',
                        '进入环礁通道前会更细致地说明集合、漂流和出水时机。',
                        '到达主潜线后，通常会先让你看懂水是怎么走的，再真正开始下去。'
                    ]
                },
                underwater: {
                    title: '环礁通道与鲨鱼蓝水',
                    copy: '这片海的结构是横向展开的，潮汐像把整片蓝水推成一条有方向感的海底通道。',
                    layers: [
                        { depth: '0–8m', title: '表层光窗', note: '光线开阔，也是观察潮流最直接的一层。' },
                        { depth: '8–18m', title: '通道主线', note: '鲨鱼、大鱼和通透蓝水在这一层最完整。' },
                        { depth: '18–32m', title: '深一点的通道边', note: '更成熟的潜水员能在这里看见更强的空间张力。' }
                    ],
                    hotspots: [
                        { title: '通道中央线', text: '决定今天是更激烈还是更平稳的关键位置。' },
                        { title: '环礁边缘', text: '适合看清浅区色彩与外海蓝水的反差。' }
                    ],
                    levels: [
                        { title: 'OW 保守区', text: '只适合在很稳的窗口靠浅层边缘体验，不适合追主流线。' },
                        { title: 'AOW 主线', text: '更能在通道中心和边缘之间做判断，理解图阿莫图的价值。' }
                    ]
                }
            },
            9: {
                country: '马来西亚',
                region: '沙巴州 · 仙本那外海',
                sea: '西里伯斯海',
                positionNote: '马布岛的价值不在“最猛烈”，而在它把海岛生活、浅礁生态和轻松停驻感自然地缝在了一起。',
                current: '缓流到中流',
                levelSummary: '入门 / OW 友好',
                route: {
                    hotel: '马布水屋或岛上海景酒店',
                    harbor: '仙本那码头',
                    boatTime: '35–50 分钟',
                    routeCopy: '从仙本那出海后，海面会慢慢从近岸日常过渡到更清透的热带蓝，像是在靠近一个更慢的海岛节奏。',
                    journey: [
                        '在仙本那集合后登船，出发前先确认装备与当天海况。',
                        '快艇驶向马布岛时，码头、水屋和浅礁会逐渐进入视野。',
                        '若当天安排联潜或夜潜，briefing 会提前说明码头区和浅礁带的节奏差异。'
                    ]
                },
                underwater: {
                    title: '浅礁、码头生态与慢节奏海岛线',
                    copy: '马布岛的海底结构更贴近生活感，浅礁、码头和轻蓝色海面把潜水变成一件更柔和的事。',
                    layers: [
                        { depth: '0–5m', title: '表层与码头光带', note: '适合轻松集合，也最能感受到这片海的生活气息。' },
                        { depth: '5–12m', title: '浅礁生态层', note: 'OW 和入门体验最舒服的一层，小型生态很丰富。' },
                        { depth: '12–18m', title: '外侧蓝水过渡层', note: '更成熟的潜水员可在这里把浅礁和外海感连起来。' }
                    ],
                    hotspots: [
                        { title: '码头生态带', text: '适合夜潜、小生物和更有日常气息的海底观察。' },
                        { title: '浅礁外侧', text: '适合第一次把“度假和潜水”真正放在一起的人。' }
                    ],
                    levels: [
                        { title: '入门 / OW 区', text: '更友好、更慢，也更容易让第一次海底心动发生。' },
                        { title: 'AOW 延展区', text: '可以在外侧蓝水层看见更完整的热带海层次。' }
                    ]
                }
            },
            13: {
                country: '泰国',
                region: '普吉南部 · 皇帝岛',
                sea: '安达曼海',
                positionNote: '皇帝岛更像一片把白沙海湾、清水坡地和轻船潜节奏安静缝在一起的海。它不是靠压迫感留下你，而是靠层次清楚、进入方式舒缓，让人很自然地往更深一点的蓝靠近。',
                current: '中弱流，外侧窗口更明显',
                levelSummary: 'OW / AOW 友好',
                route: {
                    hotel: '普吉南部海边酒店',
                    harbor: '查龙码头',
                    boatTime: '35–60 分钟',
                    routeCopy: '从普吉南部出发后，船不会很久才进入状态。海会先把白沙湾、明亮浅水和外侧更深一点的蓝层次慢慢排开，再决定今天往哪条线靠近。',
                    journey: [
                        '酒店集合后前往查龙码头，先确认装备、配重和当天海况。',
                        '出海后会先判断今天更适合白沙湾、礁坡还是外侧蓝水窗口。',
                        '到主潜线前再做一次 briefing，确认下水顺序、集合深度和回船方式。'
                    ]
                },
                underwater: {
                    title: '白沙海湾、礁坡与外侧蓝水',
                    copy: '皇帝岛的价值不在“最猛”，而在它会先把海底结构摆清楚，让潜水员更容易在放松里读懂这片海。',
                    layers: [
                        { depth: '0–6m', title: '白沙光带', note: '适合适应、集合和把第一口呼吸慢慢放稳。' },
                        { depth: '6–16m', title: '礁坡主体验层', note: '大多数热带生态和这片海的舒服节奏会在这里展开。' },
                        { depth: '16–28m', title: '外侧蓝水过渡层', note: 'AOW 更能在这里看见礁坡和外侧更深蓝之间的关系。' }
                    ],
                    hotspots: [
                        { title: '白沙湾内侧', text: '适合先把身体和海况对齐，也是第一次靠近这片海最友好的入口。' },
                        { title: '外侧坡地线', text: '更适合状态稳定以后，把这片海的通透感和结构一起读清楚。' }
                    ],
                    levels: [
                        { title: 'OW 建议区', text: '优先安排在更稳的海湾与礁坡层，先把节奏真正找回来。' },
                        { title: 'AOW 建议区', text: '可根据当天窗口延展到更外侧一点的蓝水过渡层。' }
                    ]
                }
            },
            14: {
                country: '马来西亚',
                region: '登嘉楼州 · 热浪岛',
                sea: '南中国海',
                positionNote: '热浪岛更像一片先把身体安放好的海。白沙、清透浅蓝和外侧礁坡会先把节奏放轻，再让你慢慢进入更完整的海底层次。',
                current: '中弱流，午后窗口更敏感',
                levelSummary: 'OW / AOW 友好',
                route: {
                    hotel: '热浪岛海边度假酒店',
                    harbor: '墨浪码头 / 岛上接驳点',
                    boatTime: '30–55 分钟',
                    routeCopy: '从码头离岸后不久，海色会先从浅蓝慢慢加深。真正的重点不是“最快到点”，而是让人先把海况读懂，再往外侧推进。',
                    journey: [
                        '酒店集合后确认装备、防晒补水和当天风浪窗口。',
                        '登船离岸后先观察浅礁与外侧水色变化，确认当日主潜线。',
                        '到点前进行 briefing，统一集合深度、回船方式和安全停留节奏。'
                    ]
                },
                underwater: {
                    title: '白沙浅礁、坡地过渡与外侧蓝水',
                    copy: '热浪岛的层次是从轻到深展开的。它先让人把呼吸放慢，再把海底结构一点点交给你。',
                    layers: [
                        { depth: '0–6m', title: '白沙浅蓝光带', note: '适合集合、适应和把节奏先稳住。' },
                        { depth: '6–18m', title: '礁坡主体验层', note: '大多数热带生态和通透蓝感会在这里出现。' },
                        { depth: '18–30m', title: '外侧蓝水延展层', note: 'AOW 更能在这一层理解热浪岛的结构过渡。' }
                    ],
                    hotspots: [
                        { title: '白沙湾外侧线', text: '适合先读懂浅礁和外侧蓝水边界的入口区域。' },
                        { title: '礁坡转折位', text: '最容易看见这片海从轻到深的层次变化。' }
                    ],
                    levels: [
                        { title: 'OW 建议区', text: '优先停在浅礁和主体验层，先让身体与节奏对齐。' },
                        { title: 'AOW 建议区', text: '可在稳定窗口延展到外侧蓝水层，保持安全停留余量。' }
                    ]
                }
            }
        };

        const preset = presets[this.spotId] || {
            country: this.spotData.mapLocation.split('·')[0]?.trim() || '海域定位',
            region: this.spotData.mapLocation.split('·')[1]?.trim() || this.spotData.mapLocation,
            sea: '外海海域',
            positionNote: '这片海的进入方式、深度层次与潜水节奏，会决定你最终如何记住它。',
            current: '以当天海况为准',
            levelSummary: '按证书等级与近期经验安排',
            route: {
                hotel: '海边酒店',
                harbor: '出发码头',
                boatTime: '30–60 分钟',
                routeCopy: '从酒店到码头，再到主潜线，真正重要的是让身体和海况一起进入状态。',
                journey: [
                    '酒店集合后确认装备与海况。',
                    '码头登船，沿当天窗口进入主潜线。',
                    '到点前再次确认集合深度和出水方式。'
                ]
            },
            underwater: {
                title: '海底结构与进入节奏',
                copy: '这片海更适合先看懂层次，再决定往哪一层继续下去。',
                layers: [
                    { depth: '0–6m', title: '表层光带', note: '适合适应、集合和热身。' },
                    { depth: '6–18m', title: '主体验层', note: '大多数体验会在这一层发生。' },
                    { depth: '18m+', title: '更深延展层', note: '更适合成熟潜水员继续向下理解这片海。' }
                ],
                hotspots: [
                    { title: '主潜线', text: '最能代表这片海气质的位置。' }
                ],
                levels: [
                    { title: 'OW 建议', text: '优先选择更稳、更浅的点位进入节奏。' },
                    { title: 'AOW 建议', text: '可根据海况延展到更深一层。' }
                ]
            }
        };

        return {
            ...preset,
            coordinates: this.spotData.coordinates,
            season: this.spotData.season,
            depth: this.spotData.depth,
            difficulty: this.spotData.difficulty,
            spotName: this.spotData.name,
            mapLocation: this.spotData.mapLocation
        };
    }

    // 海域定位台视图：负责生成三态切换按钮、深海地图舞台和信息档案结构。
    /**
     * buildSeaRoutePath(routeNodes) - 根据到达方式节点生成一条经过所有锚点的 SVG 路线
     * @param {Array<Object>} routeNodes - 路线节点数组，节点需要提供 x / y 锚点坐标
     * @returns {string} - 可直接写入 SVG path 的 d 属性
     */
    buildSeaRoutePath(routeNodes) {
        if (!Array.isArray(routeNodes) || routeNodes.length < 2) {
            return '';
        }

        const pathSegments = [`M ${routeNodes[0].x} ${routeNodes[0].y}`];
        const segmentProfiles = [
            { midShift: -24, skew: -0.08, startNormal: -8, endNormal: 6, spread: 0.3 },
            { midShift: -34, skew: 0.05, startNormal: 6, endNormal: -10, spread: 0.28 },
            { midShift: 18, skew: 0.08, startNormal: -6, endNormal: 10, spread: 0.32 }
        ];

        for (let index = 0; index < routeNodes.length - 1; index += 1) {
            const startNode = routeNodes[index];
            const endNode = routeNodes[index + 1];
            const profile = segmentProfiles[index] || segmentProfiles[segmentProfiles.length - 1];

            const segmentDeltaX = endNode.x - startNode.x;
            const segmentDeltaY = endNode.y - startNode.y;
            const segmentLength = Math.max(Math.hypot(segmentDeltaX, segmentDeltaY), 1);
            const tangentX = segmentDeltaX / segmentLength;
            const tangentY = segmentDeltaY / segmentLength;
            const normalX = -tangentY;
            const normalY = tangentX;

            // 每一段都先向海流方向轻轻漂出去一点，再回到下一个锚点。
            // ·Ȼе㣬һߵĳڵϡĵߡ
            const midpointX = startNode.x + segmentDeltaX * (0.5 + profile.skew) + normalX * profile.midShift;
            const midpointY = startNode.y + segmentDeltaY * (0.5 + profile.skew) + normalY * profile.midShift;

            const startControlX = startNode.x + tangentX * segmentLength * profile.spread + normalX * profile.startNormal;
            const startControlY = startNode.y + tangentY * segmentLength * profile.spread + normalY * profile.startNormal;

            const midControlInX = midpointX - tangentX * segmentLength * 0.16 + normalX * profile.midShift * 0.18;
            const midControlInY = midpointY - tangentY * segmentLength * 0.16 + normalY * profile.midShift * 0.18;

            const midControlOutX = midpointX + tangentX * segmentLength * 0.16 + normalX * profile.midShift * 0.08;
            const midControlOutY = midpointY + tangentY * segmentLength * 0.16 + normalY * profile.midShift * 0.08;

            const endControlX = endNode.x - tangentX * segmentLength * profile.spread + normalX * profile.endNormal;
            const endControlY = endNode.y - tangentY * segmentLength * profile.spread + normalY * profile.endNormal;

            pathSegments.push(
                `C ${startControlX.toFixed(1)} ${startControlY.toFixed(1)}, `
                + `${midControlInX.toFixed(1)} ${midControlInY.toFixed(1)}, `
                + `${midpointX.toFixed(1)} ${midpointY.toFixed(1)} `
                + `C ${midControlOutX.toFixed(1)} ${midControlOutY.toFixed(1)}, `
                + `${endControlX.toFixed(1)} ${endControlY.toFixed(1)}, `
                + `${endNode.x} ${endNode.y}`
            );
        }

        return pathSegments.join(' ');
    }
    /**
     * createSeaAtlasMarkup(atlas) - 生成海域定位台的完整 HTML 结构
     * @param {Object} atlas - 海域定位台数据对象
     * @returns {string} - 地图区域 HTML 字符串
     */
    createSeaAtlasMarkup(atlas) {
        const tabs = [
            { key: 'location', label: '海域位置' },
            { key: 'route', label: '到达方式' },
            { key: 'underwater', label: '水下结构' }
        ];

        const locationNodes = [
            { label: 'Country', value: atlas.country, top: '22%', left: '21%' },
            { label: 'Region', value: atlas.region, top: '41%', left: '34%' },
            { label: 'Sea', value: atlas.sea, top: '35%', left: '64%' },
            { label: 'Site', value: atlas.spotName, top: '62%', left: '78%' }
        ];

        const routeNodes = [
            {
                label: '岸边集合',
                value: atlas.route.hotel,
                note: '从岸上开始，慢慢把呼吸交给这片海。',
                x: 84,
                y: 254,
                shiftX: 34,
                width: 156
            },
            {
                label: '码头离岸',
                value: atlas.route.harbor,
                note: '在这里，陆地的节奏开始退到后面。',
                x: 236,
                y: 182,
                shiftX: 8,
                width: 152
            },
            {
                label: '船行渐深',
                value: atlas.route.boatTime,
                note: '再往前一点，就是更完整的蓝。',
                x: 428,
                y: 118,
                shiftX: -18,
                width: 154
            },
            {
                label: '入海点',
                value: atlas.spotName,
                note: '从这里下去，海会真正安静下来。',
                x: 562,
                y: 204,
                shiftX: -58,
                width: 176,
                placement: 'below',
                final: true
            }
        ];
        const routePath = this.buildSeaRoutePath(routeNodes);

        return `
            <div class="sea-atlas-shell" id="seaAtlasShell">
                <div class="sea-atlas-resize-layer" aria-hidden="true">
                    <button type="button" class="sea-atlas-resize-handle is-east" data-sea-atlas-resize="e" tabindex="-1" aria-hidden="true"></button>
                    <button type="button" class="sea-atlas-resize-handle is-south" data-sea-atlas-resize="s" tabindex="-1" aria-hidden="true"></button>
                    <button type="button" class="sea-atlas-resize-handle is-west" data-sea-atlas-resize="w" tabindex="-1" aria-hidden="true"></button>
                    <button type="button" class="sea-atlas-resize-handle is-south-east" data-sea-atlas-resize="se" tabindex="-1" aria-hidden="true"></button>
                    <button type="button" class="sea-atlas-resize-handle is-south-west" data-sea-atlas-resize="sw" tabindex="-1" aria-hidden="true"></button>
                </div>
                <div class="sea-atlas" data-sea-view="${this.activeSeaView}">
                <div class="sea-atlas-head">
                    <p class="sea-atlas-kicker">Sea Atlas</p>
                    <p class="sea-atlas-lead">不是在看一张地图，而是在读一片海的进入方式、水下结构，以及它为什么适合你下去。</p>
                    <div class="sea-atlas-tabs" role="tablist" aria-label="海域定位台视图切换">
                        ${tabs.map((tab) => `
                            <button
                                type="button"
                                class="sea-atlas-tab ${this.activeSeaView === tab.key ? 'is-active' : ''}"
                                data-sea-view="${tab.key}"
                                role="tab"
                                aria-selected="${this.activeSeaView === tab.key ? 'true' : 'false'}"
                            >
                                ${tab.label}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div class="sea-atlas-stage">
                    <section class="sea-atlas-panel ${this.activeSeaView === 'location' ? 'is-active' : ''}" data-sea-panel="location">
                        <div class="sea-atlas-visual">
                            <div class="sea-atlas-map">
                                <svg class="sea-atlas-flowline" viewBox="0 0 640 360" aria-hidden="true">
                                    <path d="M24 78 C122 28, 198 28, 272 82 S442 162, 616 104" />
                                    <path d="M18 228 C118 182, 214 204, 286 246 S470 318, 620 264" />
                                </svg>
                                ${locationNodes.map((node) => `
                                    <div class="sea-atlas-node" style="top:${node.top};left:${node.left};">
                                        <span class="sea-atlas-node-label">${node.label}</span>
                                        <span class="sea-atlas-node-value">${node.value}</span>
                                    </div>
                                `).join('')}
                                <div class="sea-atlas-position-note">${atlas.positionNote}</div>
                            </div>
                        </div>

                        <div class="sea-atlas-dossier">
                            <h3 class="sea-atlas-card-title">海域位置</h3>
                            <p class="sea-atlas-card-copy">${atlas.mapLocation} 位于 ${atlas.sea} 的主潜线之中。对盐憩来说，位置不是一个点，而是这片海如何开始显露性格。</p>
                            <div class="sea-atlas-meta-grid">
                                <div class="sea-atlas-meta-item">
                                    <span class="sea-atlas-meta-label">国家 / 地区</span>
                                    <span class="sea-atlas-meta-value">${atlas.country} · ${atlas.region}</span>
                                </div>
                                <div class="sea-atlas-meta-item">
                                    <span class="sea-atlas-meta-label">坐标</span>
                                    <span class="sea-atlas-meta-value">${atlas.coordinates}</span>
                                </div>
                                <div class="sea-atlas-meta-item">
                                    <span class="sea-atlas-meta-label">最佳季节</span>
                                    <span class="sea-atlas-meta-value">${atlas.season}</span>
                                </div>
                                <div class="sea-atlas-meta-item">
                                    <span class="sea-atlas-meta-label">深度 / 节奏</span>
                                    <span class="sea-atlas-meta-value">${atlas.depth} · ${atlas.difficulty}</span>
                                </div>
                            </div>
                            <div class="sea-atlas-tags">
                                <span class="sea-atlas-tag">${atlas.current}</span>
                                <span class="sea-atlas-tag">${atlas.levelSummary}</span>
                                <span class="sea-atlas-tag">适合在 ${atlas.season} 进入</span>
                            </div>
                        </div>
                    </section>

                    <section class="sea-atlas-panel ${this.activeSeaView === 'route' ? 'is-active' : ''}" data-sea-panel="route">
                        <div class="sea-atlas-visual">
                            <div class="sea-route-map">
                                <div class="sea-route-heading">
                                    <span class="sea-route-kicker">Approach Line</span>
                                    <p class="sea-route-murmur">从岸边到入海点，这不是交通说明，而是一段慢慢靠近这片海的过程。</p>
                                </div>
                                <svg class="sea-route-svg" viewBox="0 0 640 360" preserveAspectRatio="none" aria-hidden="true">
                                    <path class="sea-route-line-glow" d="${routePath}" />
                                    <path class="sea-route-line-wake" d="${routePath}" />
                                    <path class="sea-route-line" pathLength="100" d="${routePath}" />
                                    <path class="sea-route-line-sheen" pathLength="100" d="${routePath}" />
                                </svg>
                                ${routeNodes.map((node, index) => `
                                    <span
                                        class="sea-route-anchor-dot ${node.final ? 'is-final' : ''}"
                                        style="--route-x:${node.x};--route-y:${node.y};--route-index:${index};"
                                        aria-hidden="true"
                                    ></span>
                                `).join('')}
                                ${routeNodes.map((node, index) => `
                                    <div
                                        class="sea-route-node ${node.final ? 'is-final' : ''} ${node.placement === 'below' ? 'is-below' : ''}"
                                        style="--route-x:${node.x};--route-y:${node.y};--route-shift-x:${node.shiftX || 0}px;--route-node-width:${node.width || 132}px;--route-index:${index};"
                                    >
                                        <span class="sea-route-step">${node.label}</span>
                                        <span class="sea-route-value">${node.value}</span>
                                        <span class="sea-route-note">${node.note}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div class="sea-atlas-dossier">
                            <h3 class="sea-atlas-card-title">到达方式</h3>
                            <p class="sea-atlas-card-copy">${atlas.route.routeCopy}</p>
                            <div class="sea-atlas-meta-grid">
                                <div class="sea-atlas-meta-item">
                                    <span class="sea-atlas-meta-label">出发酒店</span>
                                    <span class="sea-atlas-meta-value">${atlas.route.hotel}</span>
                                </div>
                                <div class="sea-atlas-meta-item">
                                    <span class="sea-atlas-meta-label">出发码头</span>
                                    <span class="sea-atlas-meta-value">${atlas.route.harbor}</span>
                                </div>
                                <div class="sea-atlas-meta-item">
                                    <span class="sea-atlas-meta-label">船程</span>
                                    <span class="sea-atlas-meta-value">${atlas.route.boatTime}</span>
                                </div>
                                <div class="sea-atlas-meta-item">
                                    <span class="sea-atlas-meta-label">抵达节奏</span>
                                    <span class="sea-atlas-meta-value">先确认海况，再决定如何靠近这片海。</span>
                                </div>
                            </div>
                            <div class="sea-route-journey">
                                ${atlas.route.journey.map((item) => `<div class="sea-route-journey-item">${item}</div>`).join('')}
                            </div>
                        </div>
                    </section>

                    <section class="sea-atlas-panel ${this.activeSeaView === 'underwater' ? 'is-active' : ''}" data-sea-panel="underwater">
                        <div class="sea-atlas-visual">
                            <div class="sea-profile">
                                <div class="sea-profile-surface"></div>
                                <div class="sea-profile-arrow">
                                    <span>${atlas.current}</span>
                                    <svg viewBox="0 0 74 16" aria-hidden="true">
                                        <path d="M2 8h60M52 2l10 6-10 6" />
                                    </svg>
                                </div>
                                <div class="sea-profile-layers">
                                    ${atlas.underwater.layers.map((layer) => `
                                        <div class="sea-profile-layer">
                                            <div class="sea-profile-depth">${layer.depth}</div>
                                            <div class="sea-profile-band">
                                                <strong>${layer.title}</strong>
                                                <span>${layer.note}</span>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>

                        <div class="sea-atlas-dossier">
                            <h3 class="sea-atlas-card-title">${atlas.underwater.title}</h3>
                            <p class="sea-atlas-card-copy">${atlas.underwater.copy}</p>
                            <div class="sea-profile-hotspots">
                                ${atlas.underwater.hotspots.map((spot) => `
                                    <div class="sea-profile-hotspot">
                                        <strong>${spot.title}</strong>
                                        <span>${spot.text}</span>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="sea-atlas-levels">
                                ${atlas.underwater.levels.map((level) => `
                                    <div class="sea-atlas-level">
                                        <strong>${level.title}</strong>
                                        <span>${level.text}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </section>
                </div>
                </div>
            </div>
        `;
    }

    // 海域定位台切换：在三种视图间切换激活态和内容层级。
    /**
     * setSeaAtlasView(view) - 切换当前海域定位台的显示视图
     * @param {string} view - 目标视图名称
     * @returns {void} - 无返回值，直接更新视图状态
     */
    setSeaAtlasView(view) {
        if (!this.mapContainer || !['location', 'route', 'underwater'].includes(view)) {
            return;
        }

        this.activeSeaView = view;
        this.mapContainer.querySelectorAll('.sea-atlas-tab').forEach((button) => {
            const isActive = button.dataset.seaView === view;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        this.mapContainer.querySelectorAll('.sea-atlas-panel').forEach((panel) => {
            panel.classList.toggle('is-active', panel.dataset.seaPanel === view);
        });

        if (view === 'route') {
            this.playSeaRouteAnimation();
        } else {
            this.syncSeaRouteLineState();
        }
    }

    // 到达方式动画：只在第一次进入路线视图时播放一次描线，之后保持静态完成状态。
    /**
     * playSeaRouteAnimation() - 在路线面板中播放一次性描线动画
     * @returns {void} - 无返回值，直接更新路线 SVG 的类名状态
     */
    playSeaRouteAnimation() {
        if (!this.mapContainer) {
            return;
        }

        const routeMap = this.mapContainer.querySelector('.sea-route-map');
        const routeLine = this.mapContainer.querySelector('.sea-route-line');
        if (!routeLine || !routeMap) {
            return;
        }

        routeLine.classList.remove('is-route-animating');
        routeMap.classList.remove('is-route-drawn');

        if (this.routeAnimationPlayed) {
            routeLine.classList.add('is-route-drawn');
            routeMap.classList.add('is-route-drawn');
            return;
        }

        routeLine.classList.remove('is-route-drawn');
        routeMap.classList.remove('is-route-awakened');
        routeLine.getBoundingClientRect();
        routeMap.classList.add('is-route-awakened');
        routeLine.classList.add('is-route-animating');
        routeLine.addEventListener('animationend', () => {
            routeLine.classList.remove('is-route-animating');
            routeLine.classList.add('is-route-drawn');
            routeMap.classList.add('is-route-drawn');
        }, { once: true });
        this.routeAnimationPlayed = true;
    }

    // 路线面板静态态：当动画已经播过或当前不在路线页签时，保持路线完整可见。
    /**
     * syncSeaRouteLineState() - 同步路线描边的静态完成状态
     * @returns {void} - 无返回值，直接更新路线线条类名
     */
    syncSeaRouteLineState() {
        if (!this.mapContainer) {
            return;
        }

        const routeMap = this.mapContainer.querySelector('.sea-route-map');
        const routeLine = this.mapContainer.querySelector('.sea-route-line');
        if (!routeLine || !routeMap) {
            return;
        }

        routeLine.classList.remove('is-route-animating');
        if (this.routeAnimationPlayed) {
            routeLine.classList.add('is-route-drawn');
            routeMap.classList.add('is-route-drawn');
        }
    }

    // 地图区渲染入口：把当前潜点的海域定位台整体注入页面容器。
    /**
     * renderMapInfo() - 渲染当前潜点的海域定位台
     * @returns {void} - 无返回值，直接更新地图容器
     */
    renderMapInfo() {
        if (!this.mapContainer) {
            return;
        }

        const atlas = this.buildSeaAtlasData();
        this.routeAnimationPlayed = false;
        this.mapContainer.innerHTML = this.createSeaAtlasMarkup(atlas);
        this.syncSeaRouteLineState();
        this.setupSeaAtlasResize();
    }

    /**
     * safeReadSeaAtlasSize() - 读取用户上次拖拽后保存的海域定位台尺寸
     * @returns {{width:number,height:number}|null} - 有效尺寸对象；没有或损坏时返回 null
     */
    safeReadSeaAtlasSize() {
        try {
            const raw = localStorage.getItem(this.seaAtlasResizeStorageKey);
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
     * safeSaveSeaAtlasSize(size) - 把当前海域定位台的拖拽尺寸写入本地存储
     * @param {{width:number,height:number}} size - 最新宽高
     * @returns {void}
     */
    safeSaveSeaAtlasSize(size) {
        try {
            localStorage.setItem(this.seaAtlasResizeStorageKey, JSON.stringify({
                width: size.width,
                height: size.height,
                shiftX: size.shiftX || 0
            }));
        } catch (error) {
            // 本地存储失败时静默降级，不影响详情页阅读与切换。
        }
    }

    /**
     * clearSeaAtlasSize(shell) - 清除自定义尺寸，回到默认海域定位台大小
     * @param {HTMLElement|null} shell - 海域定位台外壳
     * @returns {void}
     */
    clearSeaAtlasSize(shell) {
        if (!shell) {
            return;
        }

        try {
            localStorage.removeItem(this.seaAtlasResizeStorageKey);
        } catch (error) {
            // 忽略本地存储清理失败，至少保证当前页面能回到默认尺寸。
        }

        shell.style.removeProperty('width');
        shell.style.removeProperty('height');
        shell.style.removeProperty('--sea-atlas-shell-shift-x');
    }

    /**
     * clampSeaAtlasSize(shell, width, height) - 把拖拽后的尺寸限制在合理区间
     * @param {HTMLElement} shell - 海域定位台外壳
     * @param {number} width - 候选宽度
     * @param {number} height - 候选高度
     * @returns {{width:number,height:number}} - 被限制后的安全尺寸
     */
    clampSeaAtlasSize(shell, width, height, shiftX = 0) {
        const containerRect = this.mapContainer?.getBoundingClientRect() || shell.getBoundingClientRect();
        // 原来的最小宽度几乎贴着容器宽度，很多桌面尺寸下会把宽度“锁死”，
        // 用户拖边缘时看起来就像完全拉不动。这里放宽可调区间，让海域定位台能真正在桌面端缩放。
        const maxWidth = Math.max(820, Math.floor(containerRect.width));
        const minWidth = Math.min(760, maxWidth);
        const minHeight = 720;
        const maxHeight = Math.max(980, Math.floor(window.innerHeight * 0.92));
        const clampedWidth = Math.min(Math.max(width, minWidth), maxWidth);
        const clampedHeight = Math.min(Math.max(height, minHeight), maxHeight);
        const availableShift = Math.max((containerRect.width - clampedWidth) * 0.5, 0);

        return {
            width: clampedWidth,
            height: clampedHeight,
            shiftX: Math.min(Math.max(shiftX, -availableShift), availableShift)
        };
    }

    /**
     * applySeaAtlasSize(shell, size) - 把计算后的尺寸应用到海域定位台外壳
     * @param {HTMLElement} shell - 海域定位台外壳
     * @param {{width:number,height:number}} size - 需要应用的宽高
     * @returns {void}
     */
    applySeaAtlasSize(shell, size) {
        if (!shell || !size) {
            return;
        }

        shell.style.width = `${Math.round(size.width)}px`;
        shell.style.height = `${Math.round(size.height)}px`;
        shell.style.setProperty('--sea-atlas-shell-shift-x', `${Math.round(size.shiftX || 0)}px`);
    }

    /**
     * setupSeaAtlasResize() - 给桌面端海域定位台添加鼠标拖拽调尺寸的能力
     * @returns {void}
     */
    setupSeaAtlasResize() {
        if (typeof this.seaAtlasResizeCleanup === 'function') {
            this.seaAtlasResizeCleanup();
            this.seaAtlasResizeCleanup = null;
        }

        const shell = this.mapContainer?.querySelector('#seaAtlasShell');
        const handles = Array.from(this.mapContainer?.querySelectorAll('[data-sea-atlas-resize]') || []);
        if (!shell || !handles.length) {
            return;
        }

        if (!isStageDebugModeEnabled) {
            shell.classList.remove('is-resizing');
            shell.style.removeProperty('width');
            shell.style.removeProperty('height');
            shell.style.removeProperty('--sea-atlas-shell-shift-x');
            this.body?.classList.remove('is-resizing-sea-atlas');
            return;
        }

        const desktopQuery = window.matchMedia('(min-width: 1180px)');
        let resizeState = null;

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
                nextShiftX += dx * 0.5;
            }
            if (direction.includes('w')) {
                nextWidth -= dx;
                nextShiftX += dx * 0.5;
            }
            if (direction.includes('s')) {
                nextHeight += dy;
            }

            const clamped = this.clampSeaAtlasSize(shell, nextWidth, nextHeight, nextShiftX);
            resizeState.width = clamped.width;
            resizeState.height = clamped.height;
            resizeState.shiftX = clamped.shiftX;
            this.applySeaAtlasSize(shell, clamped);
        };

        const stopResize = () => {
            if (!resizeState) {
                return;
            }

            if (
                resizeState.handle &&
                typeof resizeState.handle.releasePointerCapture === 'function' &&
                resizeState.pointerId != null &&
                resizeState.handle.hasPointerCapture?.(resizeState.pointerId)
            ) {
                resizeState.handle.releasePointerCapture(resizeState.pointerId);
            }

            const finalSize = {
                width: resizeState.width,
                height: resizeState.height,
                shiftX: resizeState.shiftX || 0
            };

            resizeState = null;
            shell.classList.remove('is-resizing');
            this.body.classList.remove('is-resizing-sea-atlas');
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', stopResize);
            window.removeEventListener('pointercancel', stopResize);
            this.safeSaveSeaAtlasSize(finalSize);
        };

        const syncDesktopState = () => {
            if (desktopQuery.matches) {
                const saved = this.safeReadSeaAtlasSize();
                if (saved) {
                    this.applySeaAtlasSize(shell, this.clampSeaAtlasSize(shell, saved.width, saved.height, saved.shiftX || 0));
                }
                return;
            }

            shell.classList.remove('is-resizing');
            this.body.classList.remove('is-resizing-sea-atlas');
            shell.style.removeProperty('width');
            shell.style.removeProperty('height');
            shell.style.removeProperty('--sea-atlas-shell-shift-x');
        };

        handles.forEach((handle) => {
            handle.addEventListener('pointerdown', (event) => {
                if (!desktopQuery.matches) {
                    return;
                }

                event.preventDefault();
                if (typeof handle.setPointerCapture === 'function') {
                    handle.setPointerCapture(event.pointerId);
                }
                const rect = shell.getBoundingClientRect();
                resizeState = {
                    handle,
                    pointerId: event.pointerId,
                    direction: handle.dataset.seaAtlasResize || 'se',
                    startX: event.clientX,
                    startY: event.clientY,
                    startWidth: rect.width,
                    startHeight: rect.height,
                    startShiftX: parseFloat(getComputedStyle(shell).getPropertyValue('--sea-atlas-shell-shift-x')) || 0,
                    width: rect.width,
                    height: rect.height,
                    shiftX: parseFloat(getComputedStyle(shell).getPropertyValue('--sea-atlas-shell-shift-x')) || 0
                };

                shell.classList.add('is-resizing');
                this.body.classList.add('is-resizing-sea-atlas');
                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', stopResize);
                window.addEventListener('pointercancel', stopResize);
            });

            handle.addEventListener('dblclick', (event) => {
                if (!desktopQuery.matches) {
                    return;
                }

                event.preventDefault();
                this.clearSeaAtlasSize(shell);
            });
        });

        const onWindowResize = () => {
            if (!desktopQuery.matches) {
                return;
            }

            const saved = this.safeReadSeaAtlasSize();
            if (saved) {
                this.applySeaAtlasSize(shell, this.clampSeaAtlasSize(shell, saved.width, saved.height, saved.shiftX || 0));
            }
        };

        desktopQuery.addEventListener('change', syncDesktopState);
        window.addEventListener('resize', onWindowResize);
        syncDesktopState();

        this.seaAtlasResizeCleanup = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', stopResize);
            window.removeEventListener('pointercancel', stopResize);
            window.removeEventListener('resize', onWindowResize);
            desktopQuery.removeEventListener('change', syncDesktopState);
            resizeState = null;
            shell.classList.remove('is-resizing');
            this.body.classList.remove('is-resizing-sea-atlas');
        };
    }

    /**
     * getPackageById(packageId) - 按 ID 获取指定套餐数据
     * @param {string} packageId - 套餐 ID
     * @returns {Object|null} - 对应套餐对象或空值
     */
    getPackageById(packageId) {
        return this.packageData.find((pkg) => pkg.id === packageId) || null;
    }

    /**
     * getReviewById(reviewId) - 按 ID 获取指定评论数据
     * @param {string} reviewId - 评论 ID
     * @returns {Object|null} - 对应评论对象或空值
     */
    getReviewById(reviewId) {
        this.ensureReviewDataReady();
        return this.reviewData.find((review) => review.id === reviewId) || null;
    }

    // 套餐匹配区渲染：生成顶部能力标签和右侧“海层式”套餐流向列表。
    /**
     * renderPackageMatchTags() - 渲染顶部能力匹配标签组
     * @returns {void} - 无返回值，直接更新标签容器
     */
    renderPackageMatchTags() {
        if (!this.packageMatchTags) {
            return;
        }

        const tags = Array.from(new Set(this.packageData.flatMap((pkg) => pkg.fitTags)));

        this.packageMatchTags.innerHTML = tags.map((tag) => createBookingMatchChipMarkup(tag)).join('');
    }

    /**
     * renderItineraries() - 渲染右侧按海层推进的连续套餐卡片列表
     * @returns {void} - 无返回值，直接更新套餐列表 DOM
     */
    renderItineraries() {
        if (!this.itineraryList) {
            return;
        }

        this.renderPackageMatchTags();

        const bookedPackageIds = this.getBookedPackageIdsForCurrentSpot();
        const flowPackages = this.getPackageFlowPackages();

        this.itineraryList.innerHTML = flowPackages.map((pkg, index) => {
            const isActive = pkg.id === this.selectedPackageId;
            const isBooked = bookedPackageIds.has(pkg.id);
            const stateMarkup = isBooked
                ? '<div class="package-card-state-stack"><span class="package-card-state package-card-state-booked">已收进行程</span></div>'
                : '';
            const fitPlates = Array.isArray(pkg.fitTags)
                ? pkg.fitTags.map((tag) => createPackagePlateMarkup(tag, 'fit')).join('')
                : '';
            const rhythmPlates = buildPackageRhythmTags(pkg)
                .map((tag) => createPackagePlateMarkup(tag, 'rhythm'))
                .join('');
            const cadenceStayCopy = this.getPackageCadenceStayCopy(pkg);
            const focusCopy = this.getPackageFocusCopy(pkg);
            const guidanceCopy = getLeadingSentence(pkg.pace || pkg.mood || pkg.fitReason);
            const actionCopy = isBooked ? '再看这套安排' : '继续了解';
            const stageLabel = `Sea Layer ${String(index + 1).padStart(2, '0')}`;

            return `
                <article
                    class="package-card ${isActive ? 'is-active' : ''} ${isBooked ? 'is-booked' : ''}"
                    data-package-id="${pkg.id}"
                    data-package-flow-index="${index + 1}"
                    tabindex="0"
                    aria-label="${pkg.name}，查看详情"
                    style="animation-delay: ${index * 0.08}s"
                >
                    <div class="package-card-head">
                        <div class="package-card-topline">
                            <div class="package-card-topline-main">
                                <span class="package-card-index">${stageLabel}</span>
                                <span class="package-card-badge">${pkg.group}</span>
                            </div>
                            ${stateMarkup}
                        </div>

                        <div class="package-card-audience">
                            <span class="package-card-section-label">适合谁</span>
                            <p class="package-card-audience-copy">${pkg.audience}</p>
                            <div class="package-tag-cluster package-tag-cluster-fit">
                                ${fitPlates}
                            </div>
                        </div>
                    </div>

                    <div class="package-card-archive">
                        <div class="package-card-title-wrap">
                            <h4 class="package-card-title" aria-label="${pkg.name}">
                                <span class="package-card-title-line">${pkg.name}</span>
                            </h4>
                            <p class="package-card-mood">${pkg.mood}</p>
                        </div>

                        <div class="package-tag-cluster package-tag-cluster-rhythm">
                            ${rhythmPlates}
                        </div>

                        <div class="package-card-signal">
                            <div class="package-price-wrap">
                                <span class="package-price-label">这一程起于</span>
                                <span class="package-price-value" data-price-target="${pkg.price}">¥0</span>
                            </div>

                            <div class="package-cadence-stack">
                                <span class="package-card-section-label">进入方式</span>
                                <p class="package-cadence-primary">${pkg.diveSummary}</p>
                                <p class="package-cadence-secondary">${cadenceStayCopy}</p>
                            </div>
                        </div>
                    </div>

                    <div class="package-card-focus">
                        <span class="package-card-section-label">当前海流</span>
                        <p class="package-card-focus-copy">${focusCopy}</p>
                    </div>

                    <div class="package-card-footer">
                        <p class="package-card-guidance">${guidanceCopy}</p>
                        <button class="package-card-action ${isBooked ? 'is-booked' : ''}" type="button" data-package-id="${pkg.id}">
                            ${actionCopy}
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    d="M5 12h14M13 6l6 6-6 6"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        </button>
                    </div>
                </article>
            `;
        }).join('');

        this.setupPackageCardTitleReveal();
        this.setupPackagePriceObserver();
        this.syncPackageCardSelection();

        if (this.bookingNote && !this.bookingNote.classList.contains('is-success')) {
            this.bookingNote.innerHTML = `
                <p>先打开套餐详情，再决定是否预订。盐憩更在意你是否适合这一次下潜，而不是让你仓促下单。</p>
            `;
        }
    }

    /**
     * syncPackageCardSelection(packageId) - 只更新套餐卡的当前激活态，不重渲染整组卡片
     * @param {string|null} packageId - 当前需要高亮的套餐 ID
     * @returns {void} - 无返回值，直接切换卡片 class
     */
    syncPackageCardSelection(packageId = this.selectedPackageId) {
        if (!this.itineraryList) {
            return;
        }

        const targetId = packageId || this.selectedPackageId;
        if (!targetId) {
            return;
        }

        this.selectedPackageId = targetId;
        this.applyPackageCardSelectionState(targetId);
        this.syncBookingFocusPanel();
    }

    /**
     * applyPackageCardSelectionState() - 根据当前阅读语境决定是否保留套餐卡的旧版高亮。
     * 评论态由上方焦点舱接管当前套餐提示，因此这里仅保留选中数据，不再把旧卡片继续点亮。
     * @param {string|null} packageId - 当前选中的套餐 ID
     * @returns {void} - 无返回值，直接同步套餐卡 class
     */
    applyPackageCardSelectionState(packageId = this.selectedPackageId) {
        if (!this.itineraryList) {
            return;
        }

        const targetId = packageId || this.selectedPackageId || '';
        const shouldHighlightCard = Boolean(targetId) && (this.activeBookingGuideKey || 'overview') !== 'reviews';
        this.itineraryList.querySelectorAll('.package-card').forEach((card) => {
            const isCurrent = shouldHighlightCard && card.dataset.packageId === targetId;
            card.classList.toggle('is-active', isCurrent);
            card.setAttribute('aria-current', isCurrent ? 'true' : 'false');
        });
    }

    /**
     * getPackageCardById() - 根据套餐 ID 找到右侧侧栏中的对应套餐卡 DOM。
     * @param {string} packageId - 套餐 ID
     * @returns {HTMLElement|null} - 对应套餐卡或空值
     */
    getPackageCardById(packageId) {
        if (!this.itineraryList || !packageId) {
            return null;
        }

        return Array.from(this.itineraryList.querySelectorAll('.package-card'))
            .find((card) => card.dataset.packageId === packageId) || null;
    }

    /**
     * getBookingStickyMaxScrollTop() - 读取右侧 sticky 侧栏当前允许的最大内部滚动距离。
     * @returns {number} - 当前最大 scrollTop
     */
    getBookingStickyMaxScrollTop() {
        if (!this.bookingSticky) {
            return 0;
        }

        return Math.max(0, this.bookingSticky.scrollHeight - this.bookingSticky.clientHeight);
    }

    /**
     * getAbsoluteOffsetTop() - 读取元素基于文档流的绝对 offsetTop，避免 transform 参与侧栏滚动计算。
     * @param {HTMLElement|null} element - 需要读取位置的元素
     * @returns {number} - 文档流里的绝对 offsetTop
     */
    getAbsoluteOffsetTop(element) {
        let current = element;
        let offsetTop = 0;

        while (current) {
            offsetTop += current.offsetTop || 0;
            current = current.offsetParent;
        }

        return offsetTop;
    }

    /**
     * getBookingStickyTargetTopForPackage() - 计算某张套餐卡在右侧 sticky 侧栏内的理想停留位置。
     * @param {string} packageId - 需要对齐的套餐 ID
     * @returns {number} - 对应的 scrollTop 目标值
     */
    getBookingStickyTargetTopForPackage(packageId) {
        if (!this.bookingSticky) {
            return 0;
        }

        const targetCard = this.getPackageCardById(packageId);
        if (!targetCard) {
            return 0;
        }

        const stickyTop = this.getAbsoluteOffsetTop(this.bookingSticky);
        const cardTop = this.getAbsoluteOffsetTop(targetCard);
        const visualOffset = Math.max((this.bookingSticky.clientHeight - targetCard.offsetHeight) * 0.24, 26);
        const rawTargetTop = (cardTop - stickyTop) - visualOffset;
        const maxScrollTop = this.getBookingStickyMaxScrollTop();

        return Math.max(0, Math.min(rawTargetTop, maxScrollTop));
    }

    /**
     * getElementReadingAnchorY() - 取一个区块在页面里的绝对阅读锚点位置。
     * @param {Element|null} element - 需要读取位置的区块元素
     * @param {number} [ratio=0] - 取元素内部相对高度比例
     * @returns {number} - 绝对页面 Y 值
     */
    getElementReadingAnchorY(element, ratio = 0) {
        if (!element) {
            return 0;
        }

        const rect = element.getBoundingClientRect();
        return window.scrollY + rect.top + (rect.height * ratio);
    }

    /**
     * getBookingStickyScrollAnchors() - 建立左侧阅读进度与右侧侧栏内部滚动之间的连续映射锚点。
     * 顶部档案区保持在侧栏上部，进入评论区后再逐步把套餐卡推到视口焦点位置。
     * @returns {Array<{ sourceY: number, targetTop: number }>} - 已按页面顺序排好的锚点数组
     */
    getBookingStickyScrollAnchors() {
        if (!this.bookingSticky) {
            return [];
        }

        const anchors = [];
        const pushAnchor = (element, targetTop, ratio = 0) => {
            if (!element) {
                return;
            }

            anchors.push({
                sourceY: this.getElementReadingAnchorY(element, ratio),
                targetTop: Math.max(0, Math.min(targetTop, this.getBookingStickyMaxScrollTop()))
            });
        };

        pushAnchor(this.introSection, 0, 0.04);
        pushAnchor(this.spotMapHeading || this.mapContainer, 0, 0.2);

        const reviewCards = this.reviewsSection
            ? Array.from(this.reviewsSection.querySelectorAll('.review-card[data-linked-package-id]'))
            : [];

        if (reviewCards.length) {
            const firstReviewTarget = this.getBookingStickyTargetTopForPackage(
                reviewCards[0].dataset.linkedPackageId || ''
            );

            pushAnchor(this.spotReviewsHeading || this.reviewsStage, firstReviewTarget * 0.18, 0.3);

            reviewCards.forEach((card) => {
                const linkedPackageId = card.dataset.linkedPackageId || '';
                const targetTop = this.getBookingStickyTargetTopForPackage(linkedPackageId);
                pushAnchor(card, targetTop, card.classList.contains('has-feature-photo') ? 0.28 : 0.38);
            });
        }

        const tailTarget = anchors.length ? anchors[anchors.length - 1].targetTop : 0;
        pushAnchor(this.relatedSection || this.detailFooter, tailTarget, 0.14);

        return anchors
            .filter((anchor) => Number.isFinite(anchor.sourceY) && Number.isFinite(anchor.targetTop))
            .sort((a, b) => a.sourceY - b.sourceY);
    }

    /**
     * getInterpolatedBookingStickyTop() - 按当前阅读位置在锚点之间插值，得到右侧侧栏应处于的内部滚动位置。
     * @returns {number} - 当前应同步到的 scrollTop
     */
    getInterpolatedBookingStickyTop() {
        const anchors = this.getBookingStickyScrollAnchors();
        if (!anchors.length) {
            return 0;
        }

        const readingProbeY = window.scrollY + this.getSeaGuideOffset() + Math.min(window.innerHeight * 0.3, 250);

        if (readingProbeY <= anchors[0].sourceY) {
            return anchors[0].targetTop;
        }

        for (let index = 1; index < anchors.length; index += 1) {
            const previousAnchor = anchors[index - 1];
            const nextAnchor = anchors[index];

            if (readingProbeY > nextAnchor.sourceY) {
                continue;
            }

            const distance = Math.max(1, nextAnchor.sourceY - previousAnchor.sourceY);
            const progress = Math.max(0, Math.min((readingProbeY - previousAnchor.sourceY) / distance, 1));
            return previousAnchor.targetTop + ((nextAnchor.targetTop - previousAnchor.targetTop) * progress);
        }

        return anchors[anchors.length - 1].targetTop;
    }

    /**
     * syncBookingStickyScrollWithReading() - 静态版侧栏里不再让右侧内部滚动跟随正文。
     * 保留这个方法作为兼容入口，只负责停止旧的滚动追随动画。
     * @returns {void} - 无返回值，直接清理旧的滚动跟随状态
     */
    syncBookingStickyScrollWithReading() {
        if (this.bookingStickyScrollRaf) {
            window.cancelAnimationFrame(this.bookingStickyScrollRaf);
            this.bookingStickyScrollRaf = 0;
        }

        if (!this.bookingSticky) {
            this.bookingStickyScrollTargetTop = 0;
            return;
        }

        this.bookingStickyScrollTargetTop = this.bookingSticky.scrollTop || 0;
    }

    /**
     * startBookingStickyScrollFollow() - 用轻缓追随的方式把右侧侧栏内部滚动带向目标位置。
     * @returns {void} - 无返回值，直接启动或续接滚动跟随动画
     */
    startBookingStickyScrollFollow() {
        if (!this.bookingSticky || this.bookingStickyScrollRaf) {
            return;
        }

        const follow = () => {
            this.bookingStickyScrollRaf = 0;
            if (!this.bookingSticky) {
                return;
            }

            const currentTop = this.bookingSticky.scrollTop;
            const targetTop = Math.max(0, Math.min(
                this.bookingStickyScrollTargetTop,
                this.getBookingStickyMaxScrollTop()
            ));
            const delta = targetTop - currentTop;

            if (Math.abs(delta) < 0.6) {
                this.bookingSticky.scrollTop = targetTop;
                return;
            }

            const easedStep = delta * 0.16;
            const stepMagnitude = Math.min(
                Math.abs(delta),
                Math.max(Math.abs(delta) * 0.12, 0.9),
                7.5
            );
            const guidedStep = Math.sign(delta) * stepMagnitude;
            this.bookingSticky.scrollTop = currentTop + (
                Math.abs(easedStep) > Math.abs(guidedStep) ? easedStep : guidedStep
            );
            this.bookingStickyScrollRaf = window.requestAnimationFrame(follow);
        };

        this.bookingStickyScrollRaf = window.requestAnimationFrame(follow);
    }

    /**
     * getCurrentReviewLinkedPackageId() - 根据当前阅读位置找出更接近视口焦点的评论卡对应套餐。
     * 带大图的评论卡会略微提高权重，让“主评论”在可视区时更容易主导右侧同步。
     * @returns {string} - 当前评论对应的套餐 ID
     */
    getCurrentReviewLinkedPackageId() {
        if (!this.reviewCardMetrics.length) {
            return '';
        }

        const scrollY = window.scrollY || window.pageYOffset || 0;
        const focusLine = scrollY + Math.min(window.innerHeight * 0.42, 320);
        let currentCard = null;
        let bestScore = Number.POSITIVE_INFINITY;
        let activeCardScore = Number.POSITIVE_INFINITY;

        this.reviewCardMetrics.forEach((card) => {
            const intersectsViewport = card.top + card.height > scrollY && card.top < scrollY + window.innerHeight;
            if (!intersectsViewport) {
                return;
            }

            const cardCenter = card.top + (card.height / 2);
            const featureBias = card.hasFeaturePhoto ? -70 : 0;
            const score = Math.abs(cardCenter - focusLine) + featureBias;

            if (score < bestScore) {
                bestScore = score;
                currentCard = card;
            }

            if (card.packageId === this.activeReviewLinkedPackageId && score < activeCardScore) {
                activeCardScore = score;
            }
        });

        if (
            this.activeReviewLinkedPackageId &&
            Number.isFinite(activeCardScore) &&
            activeCardScore <= bestScore + 72
        ) {
            return this.activeReviewLinkedPackageId;
        }

        if (!currentCard) {
            return '';
        }

        return currentCard.packageId || '';
    }

    /**
     * syncPackageSelectionFromCurrentReview() - 当评论区进入当前阅读焦点时，同步右侧套餐高亮和内部滚动。
     * @returns {void} - 无返回值，直接更新右侧套餐侧栏
     */
    syncPackageSelectionFromCurrentReview() {
        if (!this.reviewsSection || !this.itineraryList || !this.bookingSticky) {
            return;
        }

        const currentContextKey = this.activeBookingGuideKey || this.getCurrentBookingReadingGuideKey();
        if (currentContextKey !== 'reviews') {
            this.activeReviewLinkedPackageId = null;
            return;
        }

        const hasOverlayOpen =
            (this.reviewLightbox && this.reviewLightbox.classList.contains('active')) ||
            (this.reviewDetailModal && this.reviewDetailModal.classList.contains('active')) ||
            (this.bookingConfirmFeedback && this.bookingConfirmFeedback.classList.contains('active')) ||
            (this.bookingModal && this.bookingModal.classList.contains('active'));

        if (hasOverlayOpen) {
            return;
        }

        const linkedPackageId = this.getCurrentReviewLinkedPackageId();
        if (!linkedPackageId || linkedPackageId === this.activeReviewLinkedPackageId) {
            return;
        }

        this.activeReviewLinkedPackageId = linkedPackageId;
        this.syncPackageCardSelection(linkedPackageId);
    }

    // 评论区渲染：根据当前筛选项输出评论卡、图片组和查看详情入口。
    /**
     * renderReviews() - 根据当前筛选条件渲染评论区卡片
     * @returns {void} - 无返回值，直接更新评论区 DOM
     */
    /**
     * setupPackagePriceObserver() - 监听套餐价格进入视口后再触发一次性数字滚动动画
     * @returns {void} - 无返回值，直接注册或降级执行套餐价格动画
     */
    setupPackagePriceObserver() {
        if (!this.itineraryList) {
            return;
        }

        const priceElements = Array.from(this.itineraryList.querySelectorAll('.package-price-value[data-price-target]'));
        if (priceElements.length === 0) {
            return;
        }

        if (this.packagePriceObserver) {
            this.packagePriceObserver.disconnect();
            this.packagePriceObserver = null;
        }

        if (!('IntersectionObserver' in window)) {
            priceElements.forEach((element, index) => {
                animateRollingPrice(element, element.dataset.priceTarget || element.textContent, {
                    duration: 1500,
                    delay: 120 + (index * 90)
                });
            });
            return;
        }

        this.packagePriceObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                const priceElement = entry.target.querySelector('.package-price-value[data-price-target]') || entry.target;
                animateRollingPrice(priceElement, priceElement.dataset.priceTarget || priceElement.textContent, {
                    duration: 1500,
                    delay: 80
                });
                observer.unobserve(entry.target);
            });
        }, {
            threshold: 0.55,
            rootMargin: '0px 0px -24px 0px'
        });

        priceElements.forEach((element) => {
            if (element.dataset.priceAnimated === 'true') {
                return;
            }

            const priceRegion = element.closest('.package-price-wrap') || element;
            this.packagePriceObserver.observe(priceRegion);
        });
    }

    renderReviews() {
        if (!this.reviewsSection) {
            return;
        }

        const filters = [
            { key: 'all', label: '全部' },
            { key: 'diving', label: '潜水体验' },
            { key: 'stay', label: '住宿' },
            { key: 'food', label: '饮食' },
            { key: 'scenery', label: '风景' }
        ];

        if (this.reviewsFilters) {
            this.reviewsFilters.innerHTML = filters.map((filter) => `
                <button
                    type="button"
                    class="review-filter ${this.activeReviewFilter === filter.key ? 'is-active' : ''}"
                    data-filter="${filter.key}"
                >
                    ${filter.label}
                </button>
            `).join('');
        }

        const avatarSrc = 'assets/images/avatar.png';
        const filteredReviews = this.reviewData.filter((review) => (
            this.activeReviewFilter === 'all' || review.focus.includes(this.activeReviewFilter)
        ));
        const visibleReviews = this.attachReviewPackageLinks(filteredReviews);

        this.reviewsSection.innerHTML = visibleReviews.map((review) => {
            const reviewPhotos = review.photos || [];
            const galleryPhotoCount = reviewPhotos.length + (review.featurePhoto ? 1 : 0);
            const galleryClasses = ['review-gallery'];

            if (review.featurePhoto) {
                galleryClasses.push('has-featured-photo');
            } else if (galleryPhotoCount === 1) {
                galleryClasses.push('review-gallery-solo');
            } else if (galleryPhotoCount === 2) {
                galleryClasses.push('review-gallery-pair');
            } else if (galleryPhotoCount === 3) {
                galleryClasses.push('review-gallery-trio');
            }

            return `
            <article
                class="review-card${review.featurePhoto ? ' has-feature-photo' : ''}"
                data-review-id="${review.id}"
                data-review-primary-focus="${escapeHtml(review.focus?.[0] || 'diving')}"
                data-linked-package-id="${escapeHtml(review.linkedPackageId || '')}"
                data-linked-package-name="${escapeHtml(review.linkedPackageName || '')}"
            >
                <div class="review-body">
                    <header class="review-header">
                        <div class="review-author">
                            <img
                                src="${avatarSrc}"
                                alt="${review.user}头像"
                                class="review-avatar"
                                loading="lazy"
                                decoding="async"
                                fetchpriority="low"
                            >
                            <div class="review-meta">
                                <div class="review-user">${review.user}</div>
                                <div class="review-subline">
                                    <span class="review-date">${review.date}</span>
                                    <span class="review-level">${review.level}</span>
                                </div>
                            </div>
                        </div>
                        <div class="review-rating">
                            ${this.createReviewRatingStarsMarkup(review, 'review-rating-stars')}
                            <span class="review-rating-score">${review.ratingScore}</span>
                        </div>
                    </header>

                    ${review.title ? `
                        <div class="review-scene">
                            <p class="review-scene-kicker">Island Note</p>
                            <h3 class="review-scene-title">${review.title}</h3>
                            ${review.subtitle ? `<p class="review-scene-subtitle">${review.subtitle}</p>` : ''}
                        </div>
                    ` : ''}

                    <p class="review-summary">${review.summary}</p>
                    <div class="review-actions">
                        <button type="button" class="review-expand">展开全文</button>
                        <button type="button" class="review-detail-trigger" data-review-id="${review.id}">查看详情</button>
                    </div>

                    <div class="review-dimensions">
                        <div class="review-dimension">
                            <span class="review-dimension-title">潜水</span>
                            <p class="review-dimension-text">${review.diving}</p>
                        </div>
                        <div class="review-dimension">
                            <span class="review-dimension-title">酒店住宿</span>
                            <p class="review-dimension-text">${review.stay}</p>
                        </div>
                        <div class="review-dimension">
                            <span class="review-dimension-title">饮食</span>
                            <p class="review-dimension-text">${review.food}</p>
                        </div>
                        <div class="review-dimension">
                            <span class="review-dimension-title">风景感受</span>
                            <p class="review-dimension-text">${review.scenery}</p>
                        </div>
                    </div>
                </div>

                <div class="${galleryClasses.join(' ')}">
                    ${review.featurePhoto ? `
                        <button
                            type="button"
                            class="review-photo-button review-featured-photo-button"
                            data-lightbox-src="${review.featurePhoto.src}"
                            data-lightbox-alt="${review.user}在${this.spotData.name}的旅行照片"
                            data-lightbox-caption="${review.featurePhoto.caption}"
                        >
                            <img
                                src="${review.featurePhoto.src}"
                                alt="${review.featurePhoto.caption}"
                                class="review-photo review-featured-photo"
                                loading="lazy"
                                decoding="async"
                                fetchpriority="low"
                                onerror="this.onerror=null;this.src='https://via.placeholder.com/1200x900?text=${encodeURIComponent(review.featurePhoto.caption)}';"
                                style="object-position: ${review.featurePhoto.position};"
                            >
                            <span class="review-photo-caption review-photo-caption-featured">${review.featurePhoto.caption}</span>
                        </button>
                    ` : ''}
                    ${reviewPhotos.map((photo) => `
                        <button
                            type="button"
                            class="review-photo-button"
                            data-lightbox-src="${photo.src}"
                            data-lightbox-alt="${review.user}在${this.spotData.name}的旅行照片"
                            data-lightbox-caption="${photo.caption}"
                        >
                            <img
                                src="${photo.src}"
                                alt="${photo.caption}"
                                class="review-photo"
                                loading="lazy"
                                decoding="async"
                                fetchpriority="low"
                                onerror="this.onerror=null;this.src='https://via.placeholder.com/960x720?text=${encodeURIComponent(photo.caption)}';"
                                style="object-position: ${photo.position};"
                            >
                            <span class="review-photo-caption">${photo.caption}</span>
                        </button>
                    `).join('')}
                </div>
            </article>
        `;
        }).join('');

        this.activeReviewLinkedPackageId = null;
        this.syncReviewExpandButtons();
        const shouldReplayReviewsSectionReveal = (
            !this.hasRenderedReviews
            && this.reviewsSection.classList.contains('is-visible')
        );

        this.resetReviewGalleryPhotoReveal();

        if (shouldReplayReviewsSectionReveal) {
            this.reviewsSection.classList.remove('is-visible');
        }

        this.setupReviewGalleryPhotoReveal();

        if (shouldReplayReviewsSectionReveal) {
            window.requestAnimationFrame(() => {
                if (!this.reviewsSection?.isConnected) {
                    return;
                }

                this.reviewsSection.classList.add('is-visible');
                this.revealReviewGalleryPhotos();
            });
        }

        this.measureDetailScrollMetrics();
        window.requestAnimationFrame(() => {
            this.syncBookingReadingGuide({ force: true, immediate: true });
            this.syncBookingCopyDepthState();
            this.syncBookingStickyScrollWithReading();
            this.syncPackageSelectionFromCurrentReview();
        });

        const activeFilter = filters.find((filter) => filter.key === this.activeReviewFilter) || filters[0];
        if (this.hasRenderedReviews) {
            const summary = visibleReviews.length
                ? `已切换到${activeFilter.label}，共${visibleReviews.length}条评价。`
                : `已切换到${activeFilter.label}，暂无可见评价。`;
            this.announceReviewsSummary(summary);
        } else {
            this.hasRenderedReviews = true;
        }
    }

    /**
     * syncReviewExpandButtons() - 根据摘要是否真的溢出决定是否显示“展开全文”
     * @returns {void} - 无返回值，直接同步评论卡按钮状态
     */
    syncReviewExpandButtons() {
        if (!this.reviewsSection) {
            return;
        }

        const reviewCards = Array.from(this.reviewsSection.querySelectorAll('.review-card'));
        if (reviewCards.length === 0) {
            return;
        }

        reviewCards.forEach((card) => {
            const summary = card.querySelector('.review-summary');
            const expandButton = card.querySelector('.review-expand');
            if (!summary || !expandButton) {
                return;
            }

            const wasExpanded = card.classList.contains('is-expanded');
            if (wasExpanded) {
                card.classList.remove('is-expanded');
            }

            const isOverflowing = this.isReviewSummaryOverflowing(summary);
            expandButton.hidden = !isOverflowing;
            expandButton.setAttribute('aria-hidden', String(!isOverflowing));

            if (!isOverflowing) {
                card.classList.remove('is-expanded');
                expandButton.textContent = '展开全文';
                return;
            }

            if (wasExpanded) {
                card.classList.add('is-expanded');
            }
            expandButton.textContent = card.classList.contains('is-expanded') ? '收起全文' : '展开全文';
        });
    }

    /**
     * isReviewSummaryOverflowing(summaryElement) - 用未截断副本测量评论摘要是否真的超过折叠高度
     * @param {HTMLElement} summaryElement - 当前评论摘要元素
     * @returns {boolean} - 是否需要显示“展开全文”
     */
    isReviewSummaryOverflowing(summaryElement) {
        if (!summaryElement) {
            return false;
        }

        const computedStyle = window.getComputedStyle(summaryElement);
        const lineHeight = Number.parseFloat(computedStyle.lineHeight);
        const clampLineCount = Number.parseInt(computedStyle.getPropertyValue('-webkit-line-clamp'), 10) || 4;
        const clampedHeight = lineHeight > 0
            ? lineHeight * clampLineCount
            : summaryElement.getBoundingClientRect().height;

        if (!clampedHeight) {
            return false;
        }

        const clone = summaryElement.cloneNode(true);
        clone.removeAttribute('id');
        clone.style.position = 'absolute';
        clone.style.visibility = 'hidden';
        clone.style.pointerEvents = 'none';
        clone.style.zIndex = '-1';
        clone.style.left = '0';
        clone.style.top = '0';
        clone.style.height = 'auto';
        clone.style.minHeight = '0';
        clone.style.maxHeight = 'none';
        clone.style.overflow = 'visible';
        clone.style.display = 'block';
        clone.style.webkitLineClamp = 'unset';
        clone.style.webkitBoxOrient = 'initial';
        clone.style.width = `${summaryElement.getBoundingClientRect().width}px`;

        document.body.appendChild(clone);
        const naturalHeight = clone.getBoundingClientRect().height;
        clone.remove();

        return naturalHeight - clampedHeight > 2;
    }

    /**
     * getReviewsRevealTargets() - 收集评论区可用于触发显现的关键节点
     * @returns {HTMLElement[]} - 去重后的评论区触发节点列表
     */
    getReviewsRevealTargets() {
        return [this.spotReviewsHeading, this.reviewsStage, this.reviewsSection]
            .filter((node, index, list) => node && list.indexOf(node) === index);
    }

    /**
     * getReviewPhotoButtons() - 收集评论卡里需要跟随显现节奏的照片按钮
     * @returns {HTMLElement[]} - 评论图库按钮列表
     */
    getReviewPhotoButtons() {
        if (!this.reviewsSection) {
            return [];
        }

        return Array.from(
            this.reviewsSection.querySelectorAll('.review-gallery .review-photo-button')
        );
    }

    /**
     * getReviewPhotoGalleries() - 收集评论区里的图库容器
     * @returns {HTMLElement[]} - 评论图库节点列表
     */
    getReviewPhotoGalleries() {
        if (!this.reviewsSection) {
            return [];
        }

        return Array.from(
            this.reviewsSection.querySelectorAll('.review-gallery')
        );
    }

    /**
     * resetReviewGalleryPhotoReveal() - 重置评论图片区照片的显现状态，确保后续能重新触发动画
     * @returns {void}
     */
    resetReviewGalleryPhotoReveal() {
        this.reviewGalleryPhotoObserver?.disconnect();

        if (this.reviewGalleryPhotoRevealRafId) {
            window.cancelAnimationFrame(this.reviewGalleryPhotoRevealRafId);
            this.reviewGalleryPhotoRevealRafId = 0;
        }

        this.getReviewPhotoButtons().forEach((button) => {
            button.classList.remove('is-photo-visible');
        });
    }

    /**
     * markReviewGalleryPhotosVisible(gallery) - 将指定评论图库中的照片切换到已显现状态
     * @param {HTMLElement|null} gallery - 目标图库节点
     * @returns {void}
     */
    markReviewGalleryPhotosVisible(gallery) {
        if (!gallery) {
            return;
        }

        gallery.querySelectorAll('.review-photo-button').forEach((button) => {
            if (button.isConnected) {
                button.classList.add('is-photo-visible');
            }
        });
    }

    /**
     * isReviewGalleryInView(gallery) - 判断评论图库是否已经进入当前视口带
     * @param {HTMLElement|null} gallery - 待检查的评论图库
     * @returns {boolean} - 当前图库是否已进入用户可见区域
     */
    isReviewGalleryInView(gallery) {
        if (!gallery) {
            return false;
        }

        const rect = gallery.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return rect.top < viewportHeight * 0.9 && rect.bottom > viewportHeight * 0.14;
    }

    /**
     * revealReviewGalleryPhotos() - 仅唤醒当前已进入视口的评论图库照片，避免离屏时提前播完
     * @returns {void}
     */
    revealReviewGalleryPhotos() {
        const galleries = this.getReviewPhotoGalleries();
        if (
            galleries.length === 0 ||
            !this.reviewsSection?.classList.contains('is-visible')
        ) {
            return;
        }

        if (!this.reviewsSection.querySelector('.review-photo-button:not(.is-photo-visible)')) {
            return;
        }

        if (this.reviewGalleryPhotoRevealRafId) {
            window.cancelAnimationFrame(this.reviewGalleryPhotoRevealRafId);
            this.reviewGalleryPhotoRevealRafId = 0;
        }

        this.reviewGalleryPhotoRevealRafId = window.requestAnimationFrame(() => {
            this.reviewGalleryPhotoRevealRafId = window.requestAnimationFrame(() => {
                galleries.forEach((gallery) => {
                    if (gallery.isConnected && this.isReviewGalleryInView(gallery)) {
                        this.markReviewGalleryPhotosVisible(gallery);
                        this.reviewGalleryPhotoObserver?.unobserve(gallery);
                    }
                });
                this.reviewGalleryPhotoRevealRafId = 0;
            });
        });
    }

    /**
     * setupReviewGalleryPhotoReveal() - 为评论图库建立逐个进入视口的照片显现逻辑
     * @returns {void}
     */
    setupReviewGalleryPhotoReveal() {
        const galleries = this.getReviewPhotoGalleries();
        if (galleries.length === 0) {
            return;
        }

        this.reviewGalleryPhotoObserver?.disconnect();

        if (!('IntersectionObserver' in window)) {
            if (this.reviewsSection?.classList.contains('is-visible')) {
                galleries.forEach((gallery) => this.markReviewGalleryPhotosVisible(gallery));
            }
            return;
        }

        this.reviewGalleryPhotoObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (
                    (!entry.isIntersecting && entry.intersectionRatio <= 0)
                    || !this.reviewsSection?.classList.contains('is-visible')
                ) {
                    return;
                }

                this.markReviewGalleryPhotosVisible(entry.target);
                this.reviewGalleryPhotoObserver?.unobserve(entry.target);
            });
        }, {
            threshold: 0.22,
            rootMargin: '0px 0px -8% 0px'
        });

        galleries.forEach((gallery) => {
            this.reviewGalleryPhotoObserver?.observe(gallery);
        });

        this.revealReviewGalleryPhotos();
    }

    /**
     * markReviewsVisible() - 把评论标题、引导区和评论列表统一切到已显现状态
     * @returns {void} - 无返回值，直接更新评论区 class
     */
    markReviewsVisible() {
        this.spotReviewsHeading?.classList.add('is-visible');
        this.reviewsStage?.classList.add('is-visible');
        this.reviewsSection?.classList.add('is-visible');
        this.revealReviewGalleryPhotos();
    }

    /**
     * isReviewsRevealTargetInView(target) - 判断某个评论区触发节点是否已经进入当前视口带
     * @param {HTMLElement|null} target - 待检查的评论区节点
     * @returns {boolean} - 当前节点是否应立即显示
     */
    isReviewsRevealTargetInView(target) {
        if (!target) {
            return false;
        }

        const rect = target.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return rect.top < viewportHeight * 0.9 && rect.bottom > viewportHeight * 0.12;
    }

    /**
     * setupReviewsReveal() - 监听评论区进入视口后，再让“用户评价”标题、引导区和评论卡按层次显现。
     * 这样用户先知道自己在读别人的回声，再进入具体评论，而不是一整段内容同时挤出来。
     * @returns {void} - 无返回值，直接注册评论区显现逻辑
     */
    setupReviewsReveal() {
        const targets = this.getReviewsRevealTargets();
        if (targets.length === 0) {
            return;
        }

        this.reviewsRevealObserver?.disconnect();

        if (!('IntersectionObserver' in window)) {
            this.markReviewsVisible();
            return;
        }

        this.reviewsRevealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                this.markReviewsVisible();
                this.reviewsRevealObserver?.disconnect();
            });
        }, {
            threshold: 0.08,
            rootMargin: '0px 0px -6% 0px'
        });

        targets.forEach((target) => {
            this.reviewsRevealObserver?.observe(target);
        });
    }

    /**
     * resetReviewsReveal() - 评论区重新渲染后重置显现状态，并在当前已进入视口时立即恢复为可见。
     * 这样切换评论筛选或切换潜点时，不会出现标题和卡片状态不同步的问题。
     * @returns {void} - 无返回值，直接更新评论区显现状态
     */
    resetReviewsReveal() {
        this.spotReviewsHeading?.classList.remove('is-visible');
        this.reviewsStage?.classList.remove('is-visible');
        this.reviewsSection?.classList.remove('is-visible');
        this.resetReviewGalleryPhotoReveal();

        this.setupReviewsReveal();

        if (this.getReviewsRevealTargets().some((target) => this.isReviewsRevealTargetInView(target))) {
            window.requestAnimationFrame(() => {
                this.markReviewsVisible();
                this.reviewsRevealObserver?.disconnect();
            });
        }
    }

    // 详情弹层模板：分别生成评论详情层和套餐详情层的完整 DOM 字符串。
    /**
     * createReviewDetailMarkup(review) - 生成评论详情弹层的 HTML 内容
     * @param {Object} review - 当前评论数据对象
     * @returns {string} - 评论详情层 HTML 字符串
     */
    createReviewDetailMarkup(review) {
        const detailPhotos = [review.featurePhoto, ...(review.photos || [])].filter(Boolean);

        return `
            <article class="review-detail-shell" data-review-id="${review.id}">
                <header class="review-detail-header">
                    <div class="review-detail-author">
                        <img
                            src="assets/images/avatar.png"
                            alt="${review.user}头像"
                            class="review-detail-avatar"
                            decoding="async"
                        >
                        <div class="review-detail-meta">
                            <p class="review-detail-kicker">Dive Memory · ${this.spotData.name}</p>
                            <h2 class="review-detail-title" id="reviewDetailTitle">${review.title || `${review.user}的下潜回声`}</h2>
                            ${review.subtitle ? `<p class="review-detail-subtitle">${review.subtitle}</p>` : ''}
                            <div class="review-detail-subline">
                                <span>${review.date}</span>
                                <span>${review.level}</span>
                                <span>${review.ratingScore}</span>
                            </div>
                        </div>
                    </div>
                    <div class="review-detail-rating">
                        ${this.createReviewRatingStarsMarkup(review, 'review-detail-rating-stars')}
                        <span class="review-detail-rating-copy">真实体验记录</span>
                    </div>
                </header>

                <div class="review-detail-scroll">
                    <section class="review-detail-lead">
                        <p class="review-detail-summary">${review.summary}</p>
                        <p class="review-detail-note">这一段记忆不只是关于潜点，也关于酒店、餐桌、码头和海面光线如何一起构成一趟完整的下潜。</p>
                    </section>

                    <section class="review-detail-gallery-wrap">
                        <div class="review-detail-gallery">
                            ${detailPhotos.map((photo, index) => `
                                <button
                                    type="button"
                                    class="review-detail-photo-button${index === 0 && review.featurePhoto ? ' is-featured' : ''}"
                                    data-lightbox-src="${photo.src}"
                                    data-lightbox-alt="${review.user}在${this.spotData.name}的旅行照片"
                                    data-lightbox-caption="${photo.caption}"
                                >
                                    <img
                                        src="${photo.src}"
                                        alt="${photo.caption}"
                                        class="review-detail-photo"
                                        loading="lazy"
                                        decoding="async"
                                        fetchpriority="low"
                                        onerror="this.onerror=null;this.src='https://via.placeholder.com/1200x900?text=${encodeURIComponent(photo.caption)}';"
                                        style="object-position: ${photo.position};"
                                    >
                                    <span class="review-detail-photo-caption">${photo.caption}</span>
                                </button>
                            `).join('')}
                        </div>
                    </section>

                    <section class="review-detail-grid">
                        <article class="review-detail-section">
                            <span class="review-detail-section-title">潜水</span>
                            <p>${review.diving}</p>
                        </article>
                        <article class="review-detail-section">
                            <span class="review-detail-section-title">酒店住宿</span>
                            <p>${review.stay}</p>
                        </article>
                        <article class="review-detail-section">
                            <span class="review-detail-section-title">饮食</span>
                            <p>${review.food}</p>
                        </article>
                        <article class="review-detail-section">
                            <span class="review-detail-section-title">风景感受</span>
                            <p>${review.scenery}</p>
                        </article>
                    </section>
                </div>
            </article>
        `;
    }

    getPackageCadenceStayCopy(pkg) {
        return [pkg?.staySummary, pkg?.mealSummary].filter(Boolean).join(' · ');
    }

    getPackageFocusCopy(pkg) {
        return getLeadingSentence(pkg?.fitReason || pkg?.pace || pkg?.mood);
    }

    parsePackageDurationLabel(durationText) {
        const normalized = typeof durationText === 'string'
            ? durationText.replace(/\s+/g, '')
            : '';
        const match = normalized.match(/(\d+)天(\d+)晚/);
        const days = Number.parseInt(match?.[1] || '', 10);
        const nights = Number.parseInt(match?.[2] || '', 10);
        const safeDays = Number.isFinite(days) ? Math.max(2, days) : 3;
        const safeNights = Number.isFinite(nights) ? Math.max(1, nights) : Math.max(safeDays - 1, 1);

        return {
            days: safeDays,
            nights: safeNights,
            label: `${safeDays}天${safeNights}晚`
        };
    }

    getPackageModalDefaultWindowKey(pkg) {
        const summary = `${pkg?.group || ''} ${pkg?.name || ''} ${pkg?.diveSummary || ''} ${pkg?.mood || ''}`;
        if (/黄昏/.test(summary)) {
            return 'afterglow';
        }

        if (/慢潜|停驻|舒展|度假/.test(summary)) {
            return 'arrival';
        }

        return 'dawn';
    }

    getPackageModalWindowOptions(pkg) {
        const defaultKey = this.getPackageModalDefaultWindowKey(pkg);

        return [
            {
                key: 'dawn',
                label: '清晨入海',
                hint: '把更轻的第一束蓝，留给刚刚开始的下潜。'
            },
            {
                key: 'arrival',
                label: '午后抵达',
                hint: '把抵达、适应和海边慢住留得更松一点。'
            },
            {
                key: 'afterglow',
                label: '黄昏慢住',
                hint: '把傍晚的风、潜后停驻和海面余光一起留下。'
            }
        ].map((option) => ({
            ...option,
            isDefault: option.key === defaultKey
        }));
    }

    getPackageModalDurationClampMaxDays(pkg) {
        const baseDuration = this.parsePackageDurationLabel(pkg?.duration);
        return Math.max(PACKAGE_MODAL_CUSTOM_DURATION_MAX_DAYS, baseDuration.days);
    }

    clampPackageModalDurationDays(value, maxDays = PACKAGE_MODAL_CUSTOM_DURATION_MAX_DAYS) {
        const safeMaxDays = Math.max(
            PACKAGE_MODAL_DURATION_MIN_DAYS,
            Number.isFinite(Number(maxDays)) ? Math.round(Number(maxDays)) : PACKAGE_MODAL_CUSTOM_DURATION_MAX_DAYS
        );
        const numericValue = Number(value);

        if (!Number.isFinite(numericValue)) {
            return PACKAGE_MODAL_DURATION_MIN_DAYS;
        }

        return Math.max(
            PACKAGE_MODAL_DURATION_MIN_DAYS,
            Math.min(safeMaxDays, Math.round(numericValue))
        );
    }

    parsePackageModalDurationDays(value, maxDays = PACKAGE_MODAL_CUSTOM_DURATION_MAX_DAYS) {
        const parsed = Number.parseInt(String(value || '').trim(), 10);
        return Number.isFinite(parsed)
            ? this.clampPackageModalDurationDays(parsed, maxDays)
            : null;
    }

    getPackageModalDurationOptions(pkg) {
        const baseDuration = this.parsePackageDurationLabel(pkg?.duration);
        const presetMaxDays = Math.max(PACKAGE_MODAL_PRESET_DURATION_MAX_DAYS, baseDuration.days);
        const optionDays = Array.from(new Set(
            [baseDuration.days - 1, baseDuration.days, baseDuration.days + 1, baseDuration.days + 2]
                .filter((day) => day >= PACKAGE_MODAL_DURATION_MIN_DAYS && day <= presetMaxDays)
        ));

        return optionDays.map((days) => ({
            days,
            nights: days === baseDuration.days ? baseDuration.nights : Math.max(days - 1, 1),
            label: days === baseDuration.days
                ? baseDuration.label
                : `${days}天${Math.max(days - 1, 1)}晚`
        }));
    }

    getPackageModalDraft(packageOrId) {
        const pkg = typeof packageOrId === 'object'
            ? packageOrId
            : this.getPackageById(packageOrId);
        if (!pkg) {
            return null;
        }

        const baseDuration = this.parsePackageDurationLabel(pkg.duration);
        const durationClampMaxDays = this.getPackageModalDurationClampMaxDays(pkg);
        const defaultWindowKey = this.getPackageModalDefaultWindowKey(pkg);
        const existingDraft = this.bookingModalDrafts.get(pkg.id) || {};
        const normalizedDraft = {
            days: Number.isFinite(Number(existingDraft.days))
                ? this.clampPackageModalDurationDays(existingDraft.days, durationClampMaxDays)
                : baseDuration.days,
            windowKey: this.getPackageModalWindowOptions(pkg).some((option) => option.key === existingDraft.windowKey)
                ? existingDraft.windowKey
                : defaultWindowKey,
            isEditorOpen: Boolean(existingDraft.isEditorOpen),
            isCustomDurationOpen: Boolean(existingDraft.isCustomDurationOpen)
        };

        this.bookingModalDrafts.set(pkg.id, normalizedDraft);
        return normalizedDraft;
    }

    updatePackageModalDraft(packageId, patch = {}) {
        const pkg = this.getPackageById(packageId);
        if (!pkg) {
            return null;
        }

        const currentDraft = this.getPackageModalDraft(pkg);
        const durationClampMaxDays = this.getPackageModalDurationClampMaxDays(pkg);
        const allowedWindowKeys = new Set(this.getPackageModalWindowOptions(pkg).map((option) => option.key));
        const nextDraft = {
            ...currentDraft,
            ...patch
        };

        this.bookingModalDrafts.set(pkg.id, {
            days: Number.isFinite(Number(nextDraft.days))
                ? this.clampPackageModalDurationDays(nextDraft.days, durationClampMaxDays)
                : currentDraft.days,
            windowKey: allowedWindowKeys.has(nextDraft.windowKey) ? nextDraft.windowKey : currentDraft.windowKey,
            isEditorOpen: Boolean(nextDraft.isEditorOpen),
            isCustomDurationOpen: Boolean(nextDraft.isCustomDurationOpen)
        });

        return this.bookingModalDrafts.get(pkg.id);
    }

    getPackageModalCustomDurationInput(packageId) {
        if (!this.bookingModal) {
            return null;
        }

        return Array.from(this.bookingModal.querySelectorAll('[data-package-custom-duration-input][data-package-id]'))
            .find((input) => input.dataset.packageId === String(packageId)) || null;
    }

    focusPackageModalCustomDurationInput(packageId) {
        const input = this.getPackageModalCustomDurationInput(packageId);
        if (!input) {
            return;
        }

        input.focus();
        input.select();
    }

    applyPackageModalCustomDuration(packageId, rawValue = null) {
        const pkg = this.getPackageById(packageId);
        if (!pkg) {
            return;
        }

        const input = this.getPackageModalCustomDurationInput(pkg.id);
        const durationClampMaxDays = this.getPackageModalDurationClampMaxDays(pkg);
        const nextDays = this.parsePackageModalDurationDays(
            rawValue == null ? input?.value : rawValue,
            durationClampMaxDays
        );

        if (!Number.isFinite(nextDays)) {
            input?.focus();
            input?.select();
            return;
        }

        const hasPresetMatch = this.getPackageModalDurationOptions(pkg).some((option) => option.days === nextDays);
        this.updatePackageModalDraft(pkg.id, {
            days: nextDays,
            isEditorOpen: true,
            isCustomDurationOpen: !hasPresetMatch
        });
        this.renderBookingModalMarkup(pkg.id, { preserveBodyScroll: true });

        if (!hasPresetMatch) {
            window.requestAnimationFrame(() => {
                this.focusPackageModalCustomDurationInput(pkg.id);
            });
        }
    }

    estimatePackageModalPrice(pkg, selectedDays) {
        const basePrice = parsePriceValue(pkg?.price);
        const baseDuration = this.parsePackageDurationLabel(pkg?.duration);
        if (!Number.isFinite(basePrice)) {
            return null;
        }

        const deltaDays = selectedDays - baseDuration.days;
        const longStayStep = Math.max(
            680,
            Math.round((basePrice / Math.max(baseDuration.days, 1)) * 0.82 / 100) * 100
        );
        const shortStayStep = Math.max(
            480,
            Math.round(longStayStep * 0.72 / 100) * 100
        );
        const nextValue = deltaDays >= 0
            ? basePrice + (deltaDays * longStayStep)
            : basePrice + (deltaDays * shortStayStep);

        return Math.max(1600, Math.round(nextValue / 100) * 100);
    }

    getPackageModalViewState(packageOrId) {
        const pkg = typeof packageOrId === 'object'
            ? packageOrId
            : this.getPackageById(packageOrId);
        if (!pkg) {
            return null;
        }

        const baseDuration = this.parsePackageDurationLabel(pkg.duration);
        const draft = this.getPackageModalDraft(pkg);
        const durationOptions = this.getPackageModalDurationOptions(pkg);
        const customDurationMaxDays = this.getPackageModalDurationClampMaxDays(pkg);
        const windowOptions = this.getPackageModalWindowOptions(pkg);
        const selectedWindow = windowOptions.find((option) => option.key === draft.windowKey) || windowOptions[0];
        const selectedDays = draft.days;
        const selectedNights = selectedDays === baseDuration.days
            ? baseDuration.nights
            : Math.max(selectedDays - 1, 1);
        const durationLabel = `${selectedDays}天${selectedNights}晚`;
        const estimatedPriceValue = this.estimatePackageModalPrice(pkg, selectedDays);
        const priceLabel = Number.isFinite(estimatedPriceValue) ? formatPriceValue(estimatedPriceValue) : pkg.price;
        const isCustomDurationSelected = !durationOptions.some((option) => option.days === selectedDays);
        const isCustomDurationOpen = Boolean(draft.isCustomDurationOpen) || isCustomDurationSelected;
        const isCustomized =
            selectedDays !== baseDuration.days ||
            selectedWindow.key !== this.getPackageModalDefaultWindowKey(pkg);

        return {
            ...draft,
            selectedDays,
            selectedNights,
            durationLabel,
            durationOptions,
            customDurationMaxDays,
            isCustomDurationSelected,
            isCustomDurationOpen,
            customDurationValue: selectedDays,
            windowOptions,
            windowKey: selectedWindow.key,
            windowLabel: selectedWindow.label,
            windowHint: selectedWindow.hint,
            priceValue: estimatedPriceValue,
            priceLabel,
            priceHint: isCustomized
                ? `此刻先按 ${durationLabel} · ${selectedWindow.label} 估算`
                : '点开，换一换停留天数、入海时段，或写下自己的停留节奏',
            isCustomized
        };
    }

    renderBookingModalMarkup(packageId, options = {}) {
        const pkg = this.getPackageById(packageId);
        if (!pkg || !this.bookingModalBody) {
            return;
        }

        const { preserveBodyScroll = false } = options;
        const modalContent = this.bookingModal?.querySelector('.booking-modal-content');
        const bodyScrollTop = preserveBodyScroll && modalContent
            ? modalContent.scrollTop
            : 0;

        this.bookingModalBody.innerHTML = this.createPackageModalMarkup(pkg);

        const nextModalContent = this.bookingModal?.querySelector('.booking-modal-content');
        if (nextModalContent) {
            nextModalContent.scrollTop = preserveBodyScroll ? bodyScrollTop : 0;
        }
    }

    /**
     * createPackageModalMarkup(pkg) - 生成套餐详情弹层的 HTML 内容
     * @param {Object} pkg - 当前套餐数据对象
     * @returns {string} - 套餐弹层 HTML 字符串
     */
    createPackageModalMarkup(pkg) {
        const isBooked = this.bookedPackageIds.has(pkg.id);
        const modalState = this.getPackageModalViewState(pkg);
        const cadenceStayCopy = this.getPackageCadenceStayCopy(pkg);
        const focusCopy = this.getPackageFocusCopy(pkg);
        const rhythmTags = buildPackageRhythmTags({
            ...pkg,
            duration: modalState?.durationLabel || pkg.duration
        });
        const durationOptions = modalState?.durationOptions || [];
        const windowOptions = modalState?.windowOptions || [];
        const matchTags = Array.from(new Set([
            ...(Array.isArray(pkg.fitTags) ? pkg.fitTags : []),
            pkg.audience
        ].filter(Boolean)));

        let layoutOrder = 0;
        const nextLayoutOrder = () => layoutOrder++;
        const matchOrder = nextLayoutOrder();
        const highlightsOrder = nextLayoutOrder();
        const fitReasonOrder = nextLayoutOrder();
        const reentryOrder = pkg.reentryNote ? nextLayoutOrder() : null;
        const scheduleOrder = nextLayoutOrder();
        const includesOrder = nextLayoutOrder();
        const excludesOrder = nextLayoutOrder();
        const lodgingOrder = nextLayoutOrder();
        const diningOrder = nextLayoutOrder();
        const paceOrder = nextLayoutOrder();
        const riskOrder = nextLayoutOrder();
        const actionsOrder = nextLayoutOrder();

        return `
            <div class="package-modal-shell">
                <header class="package-modal-head">
                    <div class="package-modal-archive">
                        <div class="package-modal-head-copy">
                            <div class="package-modal-overline">
                                ${isBooked ? '<span class="package-modal-state">已收进行程</span>' : ''}
                                <p class="package-modal-kicker">${escapeHtml(pkg.group)}</p>
                            </div>
                            <h2 class="package-modal-title">${escapeHtml(pkg.name)}</h2>
                            <p class="package-modal-subtitle">${escapeHtml(pkg.mood)}</p>
                        </div>

                        <div class="package-modal-rhythm">
                            ${rhythmTags.map((tag) => createPackagePlateMarkup(escapeHtml(tag), 'rhythm')).join('')}
                        </div>

                        <div class="package-modal-signal">
                            <section class="package-modal-price">
                                <div class="package-modal-price-core">
                                    <div class="package-modal-price-copy">
                                        <span class="package-modal-price-label">这一程起于</span>
                                        <strong class="package-modal-price-amount">${escapeHtml(modalState?.priceLabel || pkg.price)}</strong>
                                        <p class="package-modal-price-note package-modal-extra-fragment" style="--package-modal-extra-order: 0">${escapeHtml(modalState?.priceHint || '')}</p>
                                    </div>
                                    <button
                                        type="button"
                                        class="package-modal-price-toggle package-modal-extra-fragment"
                                        style="--package-modal-extra-order: 1"
                                        data-package-price-editor-toggle="${escapeHtml(pkg.id)}"
                                        aria-expanded="${String(Boolean(modalState?.isEditorOpen))}"
                                    >
                                        ${modalState?.isEditorOpen ? '先收住这一下' : '改一改节奏'}
                                    </button>
                                </div>

                                <div class="package-modal-price-editor package-modal-extra-fragment ${modalState?.isEditorOpen ? 'is-open' : ''}" style="--package-modal-extra-order: 2" aria-hidden="${String(!modalState?.isEditorOpen)}">
                                    <div class="package-modal-option-group">
                                        <span class="package-modal-option-label">停留天数</span>
                                        <div class="package-modal-option-list">
                                            ${durationOptions.map((option) => `
                                                <button
                                                    type="button"
                                                    class="package-modal-option ${option.label === modalState?.durationLabel ? 'is-selected' : ''}"
                                                    data-package-duration-days="${option.days}"
                                                    data-package-id="${escapeHtml(pkg.id)}"
                                                    aria-pressed="${String(option.label === modalState?.durationLabel)}"
                                                >
                                                    ${escapeHtml(option.label)}
                                                </button>
                                            `).join('')}
                                            <button
                                                type="button"
                                                class="package-modal-option ${(modalState?.isCustomDurationOpen || modalState?.isCustomDurationSelected) ? 'is-selected' : ''}"
                                                data-package-custom-duration-toggle="${escapeHtml(pkg.id)}"
                                                aria-pressed="${String(Boolean(modalState?.isCustomDurationOpen || modalState?.isCustomDurationSelected))}"
                                            >
                                                自定义
                                            </button>
                                        </div>
                                        ${modalState?.isCustomDurationOpen ? `
                                            <div class="package-modal-custom-duration">
                                                <div class="package-modal-custom-duration-copy">
                                                    <span class="package-modal-custom-duration-kicker">把停留写进这一层</span>
                                                    <p class="package-modal-custom-duration-note">天数支持 ${PACKAGE_MODAL_DURATION_MIN_DAYS} 到 ${modalState?.customDurationMaxDays || PACKAGE_MODAL_CUSTOM_DURATION_MAX_DAYS} 天，价格会先按当前海流轻轻估算。</p>
                                                </div>
                                                <div class="package-modal-custom-duration-controls">
                                                    <label class="package-modal-custom-duration-field">
                                                        <input
                                                            type="number"
                                                            min="${PACKAGE_MODAL_DURATION_MIN_DAYS}"
                                                            max="${modalState?.customDurationMaxDays || PACKAGE_MODAL_CUSTOM_DURATION_MAX_DAYS}"
                                                            step="1"
                                                            value="${escapeHtml(String(modalState?.customDurationValue || modalState?.selectedDays || ''))}"
                                                            inputmode="numeric"
                                                            aria-label="自定义停留天数"
                                                            data-package-custom-duration-input
                                                            data-package-id="${escapeHtml(pkg.id)}"
                                                        >
                                                        <span>天</span>
                                                    </label>
                                                    <button
                                                        type="button"
                                                        class="package-modal-custom-duration-apply"
                                                        data-package-custom-duration-apply="${escapeHtml(pkg.id)}"
                                                    >
                                                        带入这一程
                                                    </button>
                                                </div>
                                            </div>
                                        ` : ''}
                                    </div>

                                    <div class="package-modal-option-group">
                                        <span class="package-modal-option-label">入海时段</span>
                                        <div class="package-modal-option-list">
                                            ${windowOptions.map((option) => `
                                                <button
                                                    type="button"
                                                    class="package-modal-option ${option.key === modalState?.windowKey ? 'is-selected' : ''}"
                                                    data-package-window-key="${escapeHtml(option.key)}"
                                                    data-package-id="${escapeHtml(pkg.id)}"
                                                    aria-pressed="${String(option.key === modalState?.windowKey)}"
                                                >
                                                    ${escapeHtml(option.label)}
                                                </button>
                                            `).join('')}
                                        </div>
                                    </div>

                                    <p class="package-modal-price-support">
                                        ${escapeHtml(modalState?.windowHint || '确认之后，也还能继续把这片海的节奏慢慢往下调。')}
                                    </p>
                                </div>
                            </section>

                            <section class="package-modal-summary-block package-modal-journey">
                                <span class="package-modal-summary-label package-modal-journey-label">进入方式</span>
                                <p class="package-modal-journey-primary">${escapeHtml(pkg.diveSummary)}</p>
                                <p class="package-modal-journey-secondary">${escapeHtml(cadenceStayCopy)}</p>
                            </section>
                        </div>

                        <section class="package-modal-summary-block package-modal-current">
                            <span class="package-modal-summary-label package-modal-current-label">当前海流</span>
                            <p class="package-modal-current-copy">${escapeHtml(focusCopy)}</p>
                        </section>
                    </div>
                </header>

                <div class="package-modal-match package-modal-motion" style="--package-modal-enter-order: ${matchOrder}">
                    ${matchTags.map((tag) => createBookingMatchChipMarkup(tag)).join('')}
                </div>

                <div class="package-modal-body">
                    <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${highlightsOrder}">
                        <h3>套餐亮点</h3>
                        <ul>
                            ${pkg.highlights.map((highlight) => `<li>${highlight}</li>`).join('')}
                        </ul>
                    </section>

                    <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${fitReasonOrder}">
                        <h3>为什么适合这片海</h3>
                        <p>${pkg.fitReason}</p>
                    </section>

                    ${pkg.reentryNote ? `
                    <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${reentryOrder}">
                        <h3>半年未潜水时</h3>
                        <p>${pkg.reentryNote}</p>
                    </section>
                    ` : ''}

                    <section class="package-modal-section is-full package-modal-motion" style="--package-modal-enter-order: ${scheduleOrder}">
                        <h3>每日安排</h3>
                        <div class="package-modal-schedule">
                            ${pkg.schedule.map((item) => `
                                <div class="package-modal-day">
                                    <strong>${item.day}</strong>
                                    <span>${item.text}</span>
                                </div>
                            `).join('')}
                        </div>
                    </section>

                    <div class="package-modal-grid">
                        <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${includesOrder}">
                            <h3>包含内容</h3>
                            <ul>
                                ${pkg.includes.map((item) => `<li>${item}</li>`).join('')}
                            </ul>
                        </section>

                        <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${excludesOrder}">
                            <h3>不包含内容</h3>
                            <ul>
                                ${pkg.excludes.map((item) => `<li>${item}</li>`).join('')}
                            </ul>
                        </section>

                        <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${lodgingOrder}">
                            <h3>住宿说明</h3>
                            <p>${pkg.lodging}</p>
                        </section>

                        <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${diningOrder}">
                            <h3>餐饮说明</h3>
                            <p>${pkg.dining}</p>
                        </section>

                        <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${paceOrder}">
                            <h3>潜水节奏说明</h3>
                            <p>${pkg.pace}</p>
                        </section>

                        <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${riskOrder}">
                            <h3>能力与风险提示</h3>
                            <p><strong>适合人群：</strong>${pkg.audience}</p>
                            <p>${pkg.risk}</p>
                        </section>
                    </div>
                </div>

                <div class="package-modal-actions package-modal-motion" style="--package-modal-enter-order: ${actionsOrder}">
                    <button type="button" class="package-modal-secondary">再想想</button>
                    <button type="button" class="package-modal-primary" data-package-id="${pkg.id}">确认预订</button>
                </div>
            </div>
        `;
    }

    /**
     * getPackageSourceCard(packageId, sourceCard) - 找到当前被展开的来源舱体 DOM
     * @param {string} packageId - 套餐 ID
     * @param {HTMLElement|null} sourceCard - 点击来源节点，可能是套餐卡、焦点舱或它们内部按钮
     * @returns {HTMLElement|null} - 对应的套餐卡或焦点舱 DOM
     */
    getPackageSourceCard(packageId, sourceCard = null) {
        if (sourceCard instanceof HTMLElement) {
            if (
                sourceCard.classList.contains('package-card') ||
                sourceCard.classList.contains('booking-focus-panel')
            ) {
                return sourceCard;
            }

            const focusPanel = sourceCard.closest('.booking-focus-panel');
            if (focusPanel) {
                return focusPanel;
            }

            const closestCard = sourceCard.closest('.package-card');
            if (closestCard) {
                return closestCard;
            }
        }

        if (
            this.bookingFocusPanel &&
            this.isBookingFocusOnlyContext() &&
            this.bookingFocusPanel.dataset.packageId === packageId
        ) {
            return this.bookingFocusPanel;
        }

        if (!this.itineraryList) {
            return null;
        }

        return Array.from(this.itineraryList.querySelectorAll('.package-card'))
            .find((card) => card.dataset.packageId === packageId) || null;
    }

    /**
     * getElementVisibleState(element) - 计算元素当前在视口中的真实可见区域
     * @param {HTMLElement|null} element - 目标元素
     * @returns {Object|null} - 包含原始矩形、可见矩形和是否完整可见
     */
    getElementVisibleState(element) {
        if (!(element instanceof HTMLElement)) {
            return null;
        }

        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) {
            return null;
        }

        const navbar = document.querySelector('.navbar');
        const navbarBottom = navbar ? navbar.getBoundingClientRect().bottom : 0;
        const visibleTop = Math.max(rect.top, navbarBottom);
        const visibleLeft = Math.max(rect.left, 0);
        const visibleRight = Math.min(rect.right, window.innerWidth);
        const visibleBottom = Math.min(rect.bottom, window.innerHeight);
        const visibleWidth = Math.max(0, visibleRight - visibleLeft);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);

        return {
            rect,
            visibleRect: {
                top: visibleTop,
                left: visibleLeft,
                right: visibleRight,
                bottom: visibleBottom,
                width: visibleWidth,
                height: visibleHeight
            },
            isFullyVisible:
                Math.abs(visibleTop - rect.top) < 0.5 &&
                Math.abs(visibleLeft - rect.left) < 0.5 &&
                Math.abs(visibleRight - rect.right) < 0.5 &&
                Math.abs(visibleBottom - rect.bottom) < 0.5
        };
    }

    /**
     * capturePackageSourceState(packageId, sourceCard) - 在列表重渲染前记录来源卡片的几何信息和外观快照
     * @param {string} packageId - 当前展开的套餐 ID
     * @param {HTMLElement|null} sourceCard - 点击来源的套餐卡
     * @returns {Object|null} - 包含矩形信息和 ghost 克隆的快照
     */
    capturePackageSourceState(packageId, sourceCard = null) {
        const originCard = this.getPackageSourceCard(packageId, sourceCard);
        if (!originCard) {
            return null;
        }

        const visibility = this.getElementVisibleState(originCard);
        if (!visibility || visibility.rect.width < 40 || visibility.rect.height < 40) {
            return null;
        }

        const { rect, visibleRect } = visibility;
        const visibleTop = visibleRect.top;
        const visibleLeft = visibleRect.left;
        const visibleRight = visibleRect.right;
        const visibleBottom = visibleRect.bottom;
        const visibleWidth = visibleRect.width;
        const visibleHeight = visibleRect.height;

        if (visibleWidth < 24 || visibleHeight < 24) {
            return null;
        }

        const ghost = originCard.cloneNode(true);
        ghost.classList.add('booking-card-morph-ghost');
        ghost.removeAttribute('tabindex');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.querySelectorAll('button, a, [tabindex]').forEach((node) => {
            node.setAttribute('tabindex', '-1');
        });

        return {
            packageId,
            sourceElement: originCard,
            rect: {
                top: visibleTop,
                left: visibleLeft,
                width: visibleWidth,
                height: visibleHeight
            },
            ghost,
            isFullyVisible: visibility.isFullyVisible,
            sourceClip: {
                top: visibleTop - rect.top,
                right: rect.right - visibleRight,
                bottom: rect.bottom - visibleBottom,
                left: visibleLeft - rect.left
            }
        };
    }

    /**
     * clearBookingModalMorph() - 清理套餐卡到弹层的共享元素过渡状态
     * @returns {void} - 无返回值，直接移除 ghost 和临时 class
     */
    clearBookingModalMorph() {
        if (this.bookingModalMorphRevealTimer) {
            window.clearTimeout(this.bookingModalMorphRevealTimer);
            this.bookingModalMorphRevealTimer = 0;
        }

        if (this.bookingModalMorphCleanupTimer) {
            window.clearTimeout(this.bookingModalMorphCleanupTimer);
            this.bookingModalMorphCleanupTimer = 0;
        }

        if (this.bookingModalMorphGhost) {
            this.bookingModalMorphGhost.remove();
            this.bookingModalMorphGhost = null;
        }

        if (this.activeBookingSourceCard) {
            this.activeBookingSourceCard.classList.remove('is-originating');
            this.activeBookingSourceCard = null;
        }

        const modalContent = this.bookingModal?.querySelector('.booking-modal-content');
        if (modalContent) {
            modalContent.classList.remove('is-morphing');
            modalContent.style.transition = '';
            modalContent.style.transformOrigin = '';
            modalContent.style.transform = '';
            modalContent.style.opacity = '';
            modalContent.style.filter = '';
        }
    }

    /**
     * startBookingModalMorph(packageId, sourceState) - 让套餐卡像被展开一样放大到屏幕中间
     * @param {string} packageId - 当前展开的套餐 ID
     * @param {Object|null} sourceState - 点击来源卡片的布局快照
     * @returns {void} - 无返回值，直接驱动共享元素动画
     */
    startBookingModalMorph(packageId, sourceState = null) {
        const modalContent = this.bookingModal?.querySelector('.booking-modal-content');
        const originCard = sourceState?.sourceElement || this.getPackageSourceCard(packageId);

        if (!modalContent || window.innerWidth < 920) {
            modalContent?.classList.remove('is-morphing');
            return;
        }

        const sourceRect = sourceState?.rect || originCard?.getBoundingClientRect();
        const targetRect = modalContent.getBoundingClientRect();

        if (!sourceRect || sourceRect.width < 40 || sourceRect.height < 40 || targetRect.width < 120 || targetRect.height < 120) {
            modalContent.classList.remove('is-morphing');
            return;
        }

        this.clearBookingModalMorph();
        this.activeBookingSourceCard = originCard || null;
        this.activeBookingSourceCard?.classList.add('is-originating');
        modalContent.classList.add('is-morphing');

        const invertX = sourceRect.left - targetRect.left;
        const invertY = sourceRect.top - targetRect.top;
        const invertScaleX = sourceRect.width / targetRect.width;
        const invertScaleY = sourceRect.height / targetRect.height;

        modalContent.style.transition = 'none';
        modalContent.style.transformOrigin = 'top left';
        modalContent.style.transform = `translate3d(${invertX}px, ${invertY}px, 0) scale(${invertScaleX}, ${invertScaleY})`;
        modalContent.style.opacity = '1';
        modalContent.style.filter = 'blur(0px)';

        window.requestAnimationFrame(() => {
            modalContent.style.transition =
                'transform 880ms cubic-bezier(0.18, 0.84, 0.18, 1), opacity 520ms ease, filter 520ms ease';
            modalContent.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
            modalContent.style.opacity = '1';
            modalContent.style.filter = 'blur(0px)';
        });

        this.bookingModalMorphRevealTimer = window.setTimeout(() => {
            modalContent.classList.remove('is-morphing');
            modalContent.style.transition = '';
            modalContent.style.transformOrigin = '';
            modalContent.style.transform = '';
            modalContent.style.opacity = '';
            modalContent.style.filter = '';
            this.bookingModalMorphRevealTimer = 0;
        }, 920);

        this.bookingModalMorphCleanupTimer = window.setTimeout(() => {
            modalContent.classList.remove('is-morphing');
            modalContent.style.transition = '';
            modalContent.style.transformOrigin = '';
            modalContent.style.transform = '';
            modalContent.style.opacity = '';
            modalContent.style.filter = '';
            this.bookingModalMorphCleanupTimer = 0;
        }, 960);
    }

    // 遮罩锁定：在套餐弹窗、评论详情、图片放大层打开时统一锁住背景滚动。
    /**
     * syncOverlayLock() - 根据弹层状态同步页面滚动锁定状态
     * @returns {void} - 无返回值，直接切换页面锁定 class
     */
    syncOverlayLock() {
        const hasActiveOverlay = Boolean(
            (this.bookingModal && this.bookingModal.classList.contains('active')) ||
            (this.bookingConfirmFeedback && this.bookingConfirmFeedback.classList.contains('active')) ||
            (this.reviewDetailModal && this.reviewDetailModal.classList.contains('active')) ||
            (this.reviewLightbox && this.reviewLightbox.classList.contains('active'))
        );
        const hasBookingModalOpen = Boolean(
            this.bookingModal &&
            (this.bookingModal.classList.contains('active') || this.bookingModal.classList.contains('is-closing'))
        );

        document.documentElement.classList.toggle('has-overlay-lock', hasActiveOverlay);
        document.body.classList.toggle('has-overlay-lock', hasActiveOverlay);
        document.body.classList.toggle('has-booking-modal-open', hasBookingModalOpen);
        this.itineraryList?.classList.toggle('is-modal-open', hasBookingModalOpen);
        // 同时锁 html 和 body，是为了兼容不同浏览器对滚动容器的处理，
        // 避免弹层打开后背景还能继续偷偷滚动。
    }

    /**
     * closeBookingModal() - 关闭套餐详情弹层
     * @returns {void} - 无返回值，直接更新弹层状态
     */
    closeBookingModal() {
        if (!this.bookingModal) {
            return;
        }

        if (this.bookingModalCloseTimer) {
            window.clearTimeout(this.bookingModalCloseTimer);
            this.bookingModalCloseTimer = 0;
        }

        if (!this.bookingModal.classList.contains('active') && !this.bookingModal.classList.contains('is-closing')) {
            this.bookingModal.setAttribute('aria-hidden', 'true');
            this.syncOverlayLock();
            return;
        }

        const modalContent = this.bookingModal.querySelector('.booking-modal-content');
        const sourceCard = this.activeBookingSourceCard;
        const canReverseMorph = Boolean(
            modalContent &&
            sourceCard &&
            window.innerWidth >= 920 &&
            this.bookingModal.classList.contains('active')
        );

        if (canReverseMorph) {
            const sourceVisibility = this.getElementVisibleState(sourceCard);
            const sourceRect = sourceVisibility?.isFullyVisible
                ? sourceVisibility.rect
                : sourceVisibility?.visibleRect;
            const targetRect = modalContent.getBoundingClientRect();

            if (
                sourceRect &&
                sourceRect.width >= 40 &&
                sourceRect.height >= 40 &&
                targetRect.width >= 120 &&
                targetRect.height >= 120
            ) {
                const invertX = sourceRect.left - targetRect.left;
                const invertY = sourceRect.top - targetRect.top;
                const invertScaleX = sourceRect.width / targetRect.width;
                const invertScaleY = sourceRect.height / targetRect.height;

                this.bookingModal.classList.remove('active');
                this.bookingModal.classList.add('is-closing');

                modalContent.classList.add('is-morphing');
                modalContent.style.transition = 'none';
                modalContent.style.transformOrigin = 'top left';
                modalContent.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
                modalContent.style.opacity = '1';
                modalContent.style.filter = 'blur(0px)';

                window.requestAnimationFrame(() => {
                    modalContent.style.transition =
                        'transform 720ms cubic-bezier(0.22, 0.78, 0.2, 1), opacity 360ms ease, filter 360ms ease';
                    modalContent.style.transform = `translate3d(${invertX}px, ${invertY}px, 0) scale(${invertScaleX}, ${invertScaleY})`;
                    modalContent.style.opacity = sourceVisibility?.isFullyVisible ? '0.12' : '0.18';
                    modalContent.style.filter = sourceVisibility?.isFullyVisible ? 'blur(10px)' : 'blur(7px)';
                });

                this.bookingModalCloseTimer = window.setTimeout(() => {
                    if (!this.bookingModal) {
                        return;
                    }

                    this.activeBookingSourceCard?.classList.remove('is-originating');
                    this.bookingModal.setAttribute('aria-hidden', 'true');
                    this.bookingModal.classList.remove('is-closing');
                    this.clearBookingModalMorph();
                    this.bookingModalCloseTimer = 0;
                    this.syncOverlayLock();
                }, 760);

                this.syncOverlayLock();
                return;
            }
        }

        this.clearBookingModalMorph();

        this.bookingModal.classList.remove('active');
        this.bookingModal.classList.add('is-closing');

        this.bookingModalCloseTimer = window.setTimeout(() => {
            if (!this.bookingModal) {
                return;
            }

            this.bookingModal.classList.remove('is-closing');
            this.bookingModal.setAttribute('aria-hidden', 'true');
            this.bookingModalCloseTimer = 0;
            this.syncOverlayLock();
        }, 420);

        this.syncOverlayLock();
    }

    /**
     * getBookedPackageIdsForCurrentSpot() - 读取当前潜点已收进行程的套餐 ID 集合
     * @returns {Set<string>} - 当前潜点已收进 storage 的套餐 ID 集合
     */
    getBookedPackageIdsForCurrentSpot() {
        if (!this.tripStore || typeof this.tripStore.getConfirmedBookings !== 'function') {
            return new Set();
        }

        const currentSpotKey = String(this.spotId);
        return new Set(
            this.tripStore.getConfirmedBookings()
                .filter((booking) => String(booking.spotKey) === currentSpotKey)
                .map((booking) => booking.packageId)
                .filter(Boolean)
        );
    }

    /**
     * getLatestBookedPackageIdForCurrentSpot() - 找出当前潜点最近一次被收进行程的套餐
     * @returns {string} - 最近一次确认的套餐 ID；若不存在则返回空字符串
     */
    getLatestBookedPackageIdForCurrentSpot() {
        if (!this.tripStore || typeof this.tripStore.getConfirmedBookings !== 'function') {
            return '';
        }

        const currentSpotKey = String(this.spotId);
        const confirmedBookings = this.tripStore.getConfirmedBookings()
            .filter((booking) => String(booking.spotKey) === currentSpotKey);

        for (let index = confirmedBookings.length - 1; index >= 0; index -= 1) {
            const packageId = confirmedBookings[index]?.packageId;
            if (packageId && this.packageData.some((pkg) => pkg.id === packageId)) {
                return packageId;
            }
        }

        return '';
    }

    /**
     * buildConfirmedBooking(pkg) - 用当前潜点数据生成一条已确认行程
     * 新加入的套餐不继承既有同行人数，避免上一份安排把新的套餐直接预设掉。
     * @param {Object} pkg - 当前套餐对象
     * @returns {Object} - 可写入共享 storage 的标准套餐记录
     */
    buildConfirmedBooking(pkg) {
        const draft = this.tripStore && typeof this.tripStore.getPlannerDraft === 'function'
            ? this.tripStore.getPlannerDraft()
            : {};
        const modalState = this.getPackageModalViewState(pkg);
        const packageTags = modalState?.isCustomized
            ? Array.from(new Set([
                modalState.durationLabel,
                modalState.windowLabel,
                ...(Array.isArray(pkg.fitTags) ? pkg.fitTags : [])
            ])).filter(Boolean)
            : (Array.isArray(pkg.fitTags) ? pkg.fitTags.slice() : []);
        const packageNote = modalState?.isCustomized
            ? `${pkg.mood} 此刻先收作 ${modalState.durationLabel}，${modalState.windowLabel}。`
            : pkg.mood;

        return {
            spotKey: String(this.spotId),
            spotName: this.spotData.name || document.getElementById('spotName')?.textContent || '',
            spotTagline: this.spotData.tagline || document.getElementById('spotTagline')?.textContent || '',
            detailHref: `detail.html?id=${this.spotId}`,
            packageId: pkg.id,
            packageTitle: pkg.name,
            packageTier: pkg.group,
            packageDuration: modalState?.durationLabel || pkg.duration || '',
            packagePrice: modalState?.priceLabel || pkg.price,
            packageNote,
            packageTags,
            selectedDate: draft.dateValue || '',
            selectedDateLabel: draft.dateLabel || '',
            selectedPeople: '',
            selectedPeopleLabel: '',
            priceDisplayVersion: PRICE_DISPLAY_VERSION
        };
    }

    /**
     * showBookingConfirmation(booking) - 在套餐区下方给出柔和的“已收进行程”反馈
     * @param {Object} booking - 刚写入 storage 的套餐对象
     * @returns {void} - 无返回值，直接刷新提示区
     */
    showBookingConfirmation(booking) {
        if (!this.bookingNote) {
            return;
        }

        const dateCopy = booking.selectedDateLabel || '仍在等一段合适的潮汐';
        const peopleCopy = booking.selectedPeopleLabel || '同行节奏还没写进这一潜';

        this.bookingNote.classList.add('is-success');
        this.bookingNote.innerHTML = `
            <div class="booking-note-feedback">
                <div class="booking-note-feedback-inner">
                    <span class="booking-note-state">这片海已经慢慢收进行程了</span>
                    <p>${booking.packageTitle} 已替你停进这次安排里。接下来，可以去“我的行程”里继续整理日期与同行节奏。</p>
                    <div class="booking-note-meta">
                        <span>日期：${dateCopy}</span>
                        <span>同行：${peopleCopy}</span>
                    </div>
                </div>
                <a class="booking-note-link" href="trip.html#confirmedBookingsStage">去我的行程继续往下排</a>
            </div>
        `;
    }

    /**
     * renderBookingConfirmedMeta(booking) - 渲染确认反馈层中的套餐与行程摘要信息
     * @param {Object} booking - 刚写入 storage 的套餐对象
     * @returns {string} - 反馈层元信息 HTML
     */
    renderBookingConfirmedMeta(booking) {
        const dateCopy = booking.selectedDateLabel || '仍在等一段合适的潮汐';
        const peopleCopy = booking.selectedPeopleLabel || '同行节奏还没写进这一潜';

        return `
            <span class="booking-confirm-chip">${escapeHtml(booking.spotName || '未命名海域')}</span>
            <span class="booking-confirm-chip">${escapeHtml(booking.packageTitle || '未命名套餐')}</span>
            ${booking.packageTier ? `<span class="booking-confirm-chip">${escapeHtml(booking.packageTier)}</span>` : ''}
            <span class="booking-confirm-chip">潮汐：${escapeHtml(dateCopy)}</span>
            <span class="booking-confirm-chip">同行：${escapeHtml(peopleCopy)}</span>
        `;
    }

    /**
     * showBookingConfirmedFeedback(savedBooking) - 在页面高层显示“已收进行程”的安静反馈层
     * @param {Object} savedBooking - 已经写入共享存储的套餐对象
     * @returns {void} - 无返回值，直接打开反馈层
     */
    showBookingConfirmedFeedback(savedBooking) {
        if (!this.bookingConfirmFeedback || !this.bookingConfirmCopy || !this.bookingConfirmMeta) {
            return;
        }

        window.clearTimeout(this.bookingConfirmCloseTimer);
        this.bookingConfirmFeedback.classList.remove('is-closing');
        this.bookingConfirmCopy.textContent = '你可以继续留在这里看这片海，也可以去“我的行程”整理出发时间与同行节奏。';
        this.bookingConfirmMeta.innerHTML = this.renderBookingConfirmedMeta(savedBooking);
        this.bookingConfirmFeedback.classList.add('active');
        this.bookingConfirmFeedback.setAttribute('aria-hidden', 'false');
        this.syncOverlayLock();
    }

    /**
     * hideBookingConfirmedFeedback() - 关闭“已收进行程”反馈层并恢复页面浏览
     * @param {Object} options - 关闭选项，支持 immediate 直接收起不播放退场动画
     * @returns {void} - 无返回值，直接执行关闭动画
     */
    hideBookingConfirmedFeedback(options = {}) {
        if (!this.bookingConfirmFeedback) {
            return;
        }

        this.bookingConfirmFeedback.setAttribute('aria-hidden', 'true');
        window.clearTimeout(this.bookingConfirmCloseTimer);

        if (options.immediate) {
            this.bookingConfirmFeedback.classList.remove('active', 'is-closing');
            this.syncOverlayLock();
            return;
        }

        if (
            !this.bookingConfirmFeedback.classList.contains('active') ||
            this.bookingConfirmFeedback.classList.contains('is-closing')
        ) {
            this.syncOverlayLock();
            return;
        }

        this.bookingConfirmFeedback.classList.add('is-closing');
        this.bookingConfirmCloseTimer = window.setTimeout(() => {
            if (!this.bookingConfirmFeedback) {
                return;
            }

            this.bookingConfirmFeedback.classList.remove('active', 'is-closing');
            this.syncOverlayLock();
        }, 340);
    }

    /**
     * confirmBooking(packageId) - 确认当前套餐并写入共享行程存储
     * @param {string|Object} packageId - 套餐 ID 或套餐对象
     * @returns {void} - 无返回值，直接更新页面状态
     */
    confirmBooking(packageId) {
        const pkg = typeof packageId === 'object' ? packageId : this.getPackageById(packageId);
        if (!pkg || !this.bookingNote || !this.tripStore || typeof this.tripStore.upsertConfirmedBooking !== 'function') {
            return;
        }

        const booking = this.tripStore.upsertConfirmedBooking(this.buildConfirmedBooking(pkg));
        this.selectedPackageId = pkg.id;
        this.bookedPackageIds = this.getBookedPackageIdsForCurrentSpot();
        this.applyPackageCardSelectionState(pkg.id);
        this.syncBookingFocusPanel({
            force: true,
            immediate: true,
            animatePrice: false
        });
        this.showBookingConfirmation(booking);
        this.closeBookingModal();
        window.setTimeout(() => {
            this.renderItineraries();
        }, 780);
        this.showBookingConfirmedFeedback(booking);
    }

    // 弹层控制：统一管理评论详情和图片放大层的打开、关闭、动画和清理时机。
    /**
     * openReviewDetail(reviewId) - 打开指定评论的详情弹层
     * @param {string} reviewId - 评论 ID
     * @returns {void} - 无返回值，直接显示评论详情
     */
    openReviewDetail(reviewId) {
        const review = this.getReviewById(reviewId);
        if (!review || !this.reviewDetailModal || !this.reviewDetailBody) {
            return;
        }

        window.clearTimeout(this.reviewDetailCloseTimer);
        this.reviewDetailBody.innerHTML = this.createReviewDetailMarkup(review);
        this.reviewDetailModal.classList.remove('is-closing');
        this.reviewDetailModal.classList.add('active');
        this.reviewDetailModal.setAttribute('aria-hidden', 'false');
        this.syncOverlayLock();
        this.reviewDetailModal.scrollTop = 0;
        const detailPanel = this.reviewDetailModal.querySelector('.review-detail-panel');
        if (detailPanel) {
            detailPanel.scrollTop = 0;
        }
        const detailScroll = this.reviewDetailBody.querySelector('.review-detail-scroll');
        if (detailScroll) {
            detailScroll.scrollTop = 0;
        }
        // 先把详情内容写进去再显示弹层，
        // 可以避免弹层先亮出来、内容后补上的“空壳闪一下”问题。
    }

    /**
     * closeReviewDetail() - 关闭评论详情弹层
     * @returns {void} - 无返回值，直接执行关闭动画和清理
     */
    closeReviewDetail() {
        if (
            !this.reviewDetailModal ||
            !this.reviewDetailModal.classList.contains('active') ||
            this.reviewDetailModal.classList.contains('is-closing')
        ) {
            return;
        }

        this.reviewDetailModal.classList.add('is-closing');
        this.reviewDetailModal.setAttribute('aria-hidden', 'true');

        window.clearTimeout(this.reviewDetailCloseTimer);
        this.reviewDetailCloseTimer = window.setTimeout(() => {
            if (!this.reviewDetailModal) {
                return;
            }

            this.reviewDetailModal.classList.remove('active', 'is-closing');
            if (this.reviewDetailBody) {
                this.reviewDetailBody.innerHTML = '';
            }
            this.syncOverlayLock();
        }, 360);
        // 不立刻移除 active，而是等关闭动画播完后再清空内容，
        // 用户会感觉评论卡是被慢慢收回去，而不是突然被抹掉。
    }

    /**
     * openReviewLightbox(src, alt, caption) - 打开评论图片区放大查看层
     * @param {string} src - 大图地址
     * @param {string} alt - 图片替代文本
     * @param {string} caption - 图片说明文案
     * @returns {void} - 无返回值，直接显示放大层
     */
    openReviewLightbox(src, alt, caption) {
        if (!this.reviewLightbox || !this.reviewLightboxImage) {
            return;
        }

        window.clearTimeout(this.reviewLightboxCloseTimer);
        this.reviewLightbox.classList.remove('is-closing');
        this.reviewLightboxImage.decoding = 'async';
        this.reviewLightboxImage.src = src;
        this.reviewLightboxImage.alt = alt;
        this.reviewLightboxImage.onerror = () => {
            this.reviewLightboxImage.onerror = null;
            this.reviewLightboxImage.src = `https://via.placeholder.com/1200x900?text=${encodeURIComponent(caption || this.spotData.name)}`;
        };
        if (this.reviewLightboxCaption) {
            this.reviewLightboxCaption.textContent = caption;
        }

        this.reviewLightbox.classList.add('active');
        this.reviewLightbox.setAttribute('aria-hidden', 'false');
        this.syncOverlayLock();
        // 看图层和评论详情层共用同一套背景锁定逻辑，
        // 这样不管用户是看文字还是看照片，页面主体都不会抢走焦点。
    }

    /**
     * closeReviewLightbox() - 关闭评论图片区放大查看层
     * @returns {void} - 无返回值，直接执行关闭动画和清理
     */
    closeReviewLightbox() {
        if (
            !this.reviewLightbox ||
            !this.reviewLightboxImage ||
            !this.reviewLightbox.classList.contains('active') ||
            this.reviewLightbox.classList.contains('is-closing')
        ) {
            return;
        }

        this.reviewLightbox.classList.add('is-closing');
        this.reviewLightbox.setAttribute('aria-hidden', 'true');

        window.clearTimeout(this.reviewLightboxCloseTimer);
        this.reviewLightboxCloseTimer = window.setTimeout(() => {
            if (!this.reviewLightbox || !this.reviewLightboxImage) {
                return;
            }

            this.reviewLightbox.classList.remove('active', 'is-closing');
            this.reviewLightboxImage.src = '';
            this.reviewLightboxImage.alt = '';
            if (this.reviewLightboxCaption) {
                this.reviewLightboxCaption.textContent = '';
            }

            this.syncOverlayLock();
        }, 380);
    }

    // 相关推荐舞台：
    // 这里不是简单把 related 数组循环出来，
    // 而是把“当前主卡 + 两张相邻卡”组织成一个可切换的小型海域舞台。
    /**
     * buildRelatedStageMarkup(direction) - 生成相邻海域舞台的主卡和相邻卡结构
     * @param {string} direction - 当前切换方向，用于控制入场动画方向
     * @returns {string} - 相邻海域舞台的 HTML 字符串
     */
    buildRelatedStageMarkup(direction = '') {
        const relatedSpots = Array.isArray(this.spotData.related) ? this.spotData.related : [];
        if (relatedSpots.length === 0) {
            return '';
        }

        const activeSpot = relatedSpots.find((spot) => spot.id === this.activeRelatedSpotId) || relatedSpots[0];
        const activeProfile = getRelatedSpotProfile(activeSpot);
        const activeImage = divingSpotDetails[activeSpot.id]?.image || activeSpot.image;
        const sideSpots = relatedSpots.filter((spot) => spot.id !== activeSpot.id).slice(0, 2);
        const directionClass = direction ? ` ${direction}` : '';
        // 只把一张作为主卡，其余两张做邻近海域。
        // 这样切换时用户感受到的是“在附近海域之间潜游”，不是在列表里换筛选条件。

        return `
            <div class="related-stage-shell${directionClass}">
                <article class="related-feature-card" data-id="${activeSpot.id}" tabindex="0" aria-label="继续查看 ${activeSpot.name} 的详情">
                    <div class="related-feature-media">
                        <img
                            src="${activeImage}"
                            alt="${activeSpot.name}"
                            class="related-feature-image"
                            onerror="this.src='https://via.placeholder.com/960x620?text=${encodeURIComponent(activeSpot.name)}'"
                        >
                        <div class="related-feature-overlay"></div>
                    </div>

                    <div class="related-feature-copy">
                        <p class="related-feature-kicker">Featured Water</p>
                        <h3 class="related-feature-title">
                            <span>${activeSpot.name}</span>
                            <small>${activeProfile.englishName}</small>
                        </h3>
                        <p class="related-feature-desc">${activeProfile.mood}</p>
                        <div class="related-feature-tags">
                            ${activeProfile.fitTags.map((tag) => `<span class="related-feature-tag">${tag}</span>`).join('')}
                        </div>
                        <p class="related-feature-why">${activeProfile.why}</p>
                        <button type="button" class="related-feature-action" data-id="${activeSpot.id}">
                            继续看这片海
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    d="M5 12h14M13 6l6 6-6 6"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        </button>
                    </div>
                </article>

                <div class="related-neighbor-stack">
                    ${sideSpots.map((spot, index) => {
                        const profile = getRelatedSpotProfile(spot);
                        const spotImage = divingSpotDetails[spot.id]?.image || spot.image;
                        return `
                            <button
                                type="button"
                                class="related-neighbor-card"
                                data-id="${spot.id}"
                                data-neighbor-index="${index}"
                                aria-label="切换到 ${spot.name}"
                                style="animation-delay: ${index * 0.12}s; --related-neighbor-delay: ${index * 120}ms;"
                            >
                                <div class="related-neighbor-media">
                                    <img
                                        src="${spotImage}"
                                        alt="${spot.name}"
                                        class="related-neighbor-image"
                                        onerror="this.src='https://via.placeholder.com/420x320?text=${encodeURIComponent(spot.name)}'"
                                    >
                                </div>
                                <div class="related-neighbor-copy">
                                    <p class="related-neighbor-name">${spot.name} <span>${profile.englishName}</span></p>
                                    <p class="related-neighbor-desc">${spot.description}</p>
                                    <div class="related-neighbor-tags">
                                        ${profile.fitTags.slice(0, 2).map((tag) => `<span class="related-neighbor-tag">${tag}</span>`).join('')}
                                    </div>
                                    <p class="related-neighbor-why">${profile.why}</p>
                                </div>
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    /**
     * bindRelatedStageInteractions() - 为主海域卡和相邻海域卡绑定切换与进入详情交互
     * @returns {void} - 无返回值，直接注册相关推荐舞台事件
     */
    bindRelatedStageInteractions(stageRoot = null) {
        const scope = stageRoot || this.relatedGrid;
        if (!scope) {
            return;
        }

        const featureCard = scope.querySelector('.related-feature-card');
        const featureAction = scope.querySelector('.related-feature-action');
        const neighborCards = Array.from(scope.querySelectorAll('.related-neighbor-card'));

        if (featureCard) {
            featureCard.addEventListener('pointerdown', () => {
                this.setPressedRelatedCard(featureCard);
            });

            featureCard.addEventListener('pointerup', () => {
                if (!this.relatedTransitionTimer) {
                    this.clearPressedRelatedCard(featureCard);
                }
            });

            featureCard.addEventListener('pointercancel', () => {
                if (!this.relatedTransitionTimer) {
                    this.clearPressedRelatedCard(featureCard);
                }
            });

            featureCard.addEventListener('pointerleave', () => {
                if (!this.relatedTransitionTimer) {
                    this.clearPressedRelatedCard(featureCard);
                }
            });

            featureCard.addEventListener('click', (event) => {
                if (event.target.closest('.related-feature-action')) {
                    return;
                }

                event.preventDefault();
                this.startRelatedSpotTransition(featureCard);
            });

            featureCard.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                event.preventDefault();
                this.startRelatedSpotTransition(featureCard);
            });
        }

        if (featureAction) {
            featureAction.addEventListener('click', (event) => {
                event.preventDefault();
                this.startRelatedSpotTransition(featureCard);
            });
        }

        neighborCards.forEach((card) => {
            card.addEventListener('click', (event) => {
                event.preventDefault();
                this.switchRelatedStage(Number(card.dataset.id));
            });
        });
    }

    /**
     * switchRelatedStage(targetId) - 在相邻海域之间切换主卡焦点，模拟视线缓慢移向另一片海
     * @param {number} targetId - 目标潜点 ID
     * @returns {void} - 无返回值，直接更新相关推荐舞台状态
     */
    switchRelatedStage(targetId) {
        if (
            !this.relatedGrid ||
            !Number.isFinite(targetId) ||
            targetId === this.activeRelatedSpotId ||
            this.relatedTransitionTimer
        ) {
            return;
        }

        const relatedSpots = Array.isArray(this.spotData.related) ? this.spotData.related : [];
        const currentIndex = relatedSpots.findIndex((spot) => spot.id === this.activeRelatedSpotId);
        const targetIndex = relatedSpots.findIndex((spot) => spot.id === targetId);
        const currentStage = this.relatedGrid.querySelector('.related-stage-shell:not(.is-stage-outgoing)')
            || this.relatedGrid.querySelector('.related-stage-shell');
        if (targetIndex === -1 || this.relatedStageSwitchTimer || !currentStage) {
            return;
        }

        const flowClass = targetIndex > currentIndex ? 'is-flow-forward' : 'is-flow-backward';
        const featureCard = currentStage.querySelector('.related-feature-card');
        const currentStageHeight = currentStage.offsetHeight || this.relatedGrid.offsetHeight || 0;
        if (currentStageHeight > 0) {
            this.relatedStageStableHeight = Math.max(this.relatedStageStableHeight, currentStageHeight);
            this.relatedGrid.style.setProperty('--related-stage-height', `${this.relatedStageStableHeight}px`);
        }
        if (currentStageHeight > 0) {
            this.relatedGrid.style.minHeight = `${currentStageHeight}px`;
        }

        this.relatedGrid.classList.add('is-stage-switching');
        currentStage.classList.remove('is-entry-reveal');
        currentStage.classList.remove('is-stage-active');
        currentStage.classList.add('is-stage-outgoing', 'is-stacked-stage', flowClass);
        currentStage.setAttribute('aria-hidden', 'true');
        featureCard?.classList.add('is-leaving');

        this.activeRelatedSpotId = targetId;
        currentStage.insertAdjacentHTML('afterend', this.buildRelatedStageMarkup(flowClass));
        const stageShells = Array.from(this.relatedGrid.querySelectorAll('.related-stage-shell'));
        const incomingStage = stageShells[stageShells.length - 1] || null;

        if (incomingStage) {
            const incomingStageHeight = incomingStage.offsetHeight || 0;
            if (incomingStageHeight > currentStageHeight) {
                this.relatedGrid.style.minHeight = `${incomingStageHeight}px`;
            }
            if (incomingStageHeight > 0) {
                this.relatedStageStableHeight = Math.max(this.relatedStageStableHeight, incomingStageHeight);
                this.relatedGrid.style.setProperty('--related-stage-height', `${this.relatedStageStableHeight}px`);
                this.relatedGrid.style.minHeight = `${this.relatedStageStableHeight}px`;
            }

            incomingStage.classList.add('is-stage-incoming', 'is-stacked-stage');
            incomingStage.setAttribute('aria-hidden', 'true');
            this.bindRelatedStageInteractions(incomingStage);
        }

        this.syncRelatedTextLayout();
        this.announceRelatedSummary(`已切换到相邻海域${relatedSpots[targetIndex].name}。`);

        this.relatedStageSwitchTimer = window.setTimeout(() => {
            window.requestAnimationFrame(() => {
                incomingStage?.classList.add('is-stage-active');
                this.relatedStageSwitchTimer = 0;
            });
        }, 24);

        if (this.relatedStageCleanupTimer) {
            window.clearTimeout(this.relatedStageCleanupTimer);
        }

        this.relatedStageCleanupTimer = window.setTimeout(() => {
            currentStage.remove();
            incomingStage?.classList.remove(
                'is-stage-incoming',
                'is-stacked-stage',
                'is-flow-forward',
                'is-flow-backward'
            );
            incomingStage?.removeAttribute('aria-hidden');
            this.relatedGrid?.classList.remove('is-stage-switching');
            this.relatedGrid?.style.removeProperty('min-height');
            this.relatedStageCleanupTimer = 0;
        }, 780);
    }

    /**
     * renderRelatedSpots() - 渲染相邻海域舞台，并预加载后续详情页资源
     * @returns {void} - 无返回值，直接更新相关推荐区域 DOM
     */
    renderRelatedSpots() {
        if (!this.relatedGrid) {
            this.relatedGrid = document.getElementById('relatedGrid');
        }

        if (!this.relatedGrid) {
            return;
        }

        const relatedSpots = Array.isArray(this.spotData.related) ? this.spotData.related : [];
        if (relatedSpots.length === 0) {
            this.relatedGrid.innerHTML = '';
            if (this.relatedEntryRevealTimer) {
                window.clearTimeout(this.relatedEntryRevealTimer);
                this.relatedEntryRevealTimer = 0;
            }
            this.relatedStageStableHeight = 0;
            this.relatedGrid.style.removeProperty('--related-stage-height');
            this.relatedTextLayoutController?.disconnect?.();
            this.relatedTextLayoutController = null;
            return;
        }

        if (!relatedSpots.some((spot) => spot.id === this.activeRelatedSpotId)) {
            this.activeRelatedSpotId = relatedSpots[0].id;
        }

        this.relatedGrid.innerHTML = this.buildRelatedStageMarkup();
        const initialStage = this.relatedGrid.querySelector('.related-stage-shell');
        initialStage?.classList.add('is-entry-reveal');
        this.bindRelatedStageInteractions(initialStage);
        this.syncRelatedTextLayout();
        const initialStageHeight = initialStage?.offsetHeight || 0;
        if (initialStageHeight > 0) {
            this.relatedStageStableHeight = Math.max(this.relatedStageStableHeight, initialStageHeight);
            this.relatedGrid.style.setProperty('--related-stage-height', `${this.relatedStageStableHeight}px`);
        }
        if (this.relatedSection?.classList.contains('is-visible')) {
            this.activateRelatedInitialStage();
        }
        this.preloadRelatedAssets(relatedSpots);
    }

    /**
     * activateRelatedInitialStage() - 在相关推荐首次进入视口时激活舞台显现，并在显现完成后清理首屏 reveal 类
     * @returns {void} - 无返回值，直接更新相关推荐首屏舞台状态
     */
    activateRelatedInitialStage() {
        const initialStage = this.relatedGrid?.querySelector('.related-stage-shell');
        if (!initialStage) {
            return;
        }

        initialStage.classList.add('is-stage-active');

        if (!initialStage.classList.contains('is-entry-reveal')) {
            return;
        }

        if (this.relatedEntryRevealTimer) {
            window.clearTimeout(this.relatedEntryRevealTimer);
        }

        this.relatedEntryRevealTimer = window.setTimeout(() => {
            initialStage.classList.remove('is-entry-reveal');
            this.relatedEntryRevealTimer = 0;
        }, 1100);
    }

    /**
     * syncRelatedTextLayout() - 用 pretext 预测相关推荐舞台里的多行文本高度。
     * 这里优先稳定主推荐卡和相邻海域卡片的标题 / 描述文本，避免切换主卡或窗口宽度变化时，
     * 卡片因为重新换行而产生明显跳动。
     *
     * 当前只接到相关推荐区，是因为：
     * 1. 它会频繁切换主卡与相邻卡；
     * 2. 多行标题和说明文案长度差异大；
     * 3. 这里的布局抖动会直接影响“在相邻海域之间潜游”的舞台感。
     *
     * @returns {void} - 无返回值，直接给相关推荐文本块应用预测高度。
     */
    syncRelatedTextLayout() {
        const textLayout = window.YanqiTextLayout;

        this.relatedTextLayoutController?.disconnect?.();
        this.relatedTextLayoutController = null;

        if (!this.relatedGrid || !textLayout || typeof textLayout.mountResponsiveBatch !== 'function') {
            return;
        }

        this.relatedTextLayoutController = textLayout.mountResponsiveBatch(this.relatedGrid, [
            {
                selector: '.related-feature-title'
            },
            {
                selector: '.related-feature-desc'
            },
            {
                selector: '.related-neighbor-name'
            },
            {
                selector: '.related-neighbor-desc'
            }
        ]);
    }

    /**
     * setupRelatedReveal() - 监听相邻海域区域进入视口后再激活整体显现动画
     * @returns {void} - 无返回值，直接注册相关推荐区域的显现逻辑
     */
    setupRelatedReveal() {
        if (!this.relatedSection) {
            return;
        }

        if (!('IntersectionObserver' in window)) {
            this.relatedSection.classList.add('is-visible');
            this.relatedSection.classList.add('is-sea-shift-awake');
            this.activateRelatedInitialStage();
            return;
        }

        this.relatedRevealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add('is-visible', 'is-sea-shift-awake');
                this.activateRelatedInitialStage();
                this.relatedRevealObserver?.unobserve(entry.target);
            });
        }, {
            threshold: 0.18,
            rootMargin: '0px 0px -10% 0px'
        });

        this.relatedRevealObserver.observe(this.relatedSection);
    }

    buildFooterContent() {
        const { name, related = [] } = this.spotData;
        const nextSpot = related[0] || null;
        const leadMap = {
            1: `${name} 不会在离开页面时结束。真正留下来的，往往是鱼群经过时，海忽然安静下来的那一瞬。`,
            2: `${name} 留下来的，不只是蓝色大门的张力，而是光线、洋流与呼吸终于慢慢对齐的那一刻。`,
            3: `${name} 不只是一处地貌奇观，更像一次向更深处安静下落的停留。`,
            4: `${name} 留住人的，常常不是某一次偶然相遇，而是珊瑚坡地与热带海水一起把节奏放慢。`,
            5: `${name} 真正留下来的，往往是那些需要你更耐心去看的细节，它们会在离开之后慢慢浮回来。`,
            6: `${name} 不会用剧烈的方式留下你，它更像一片始终清澈、愿意让人多停一会儿的海。`,
            7: `${name} 留下来的，不只是大景与洋流，而是整片海在更强的张力里依然保持完整的秩序感。`,
            8: `${name} 更像一片有余韵的蓝，真正留在记忆里的，是那种通道被海流轻轻推开的感觉。`,
            9: `${name} 不会在离开页面时结束。真正留下来的，往往是海风、木栈道和潜后慢下来的那段岛上时光。`,
            13: `${name} 留下来的，往往不是某一个最强的瞬间，而是白沙、清水和呼吸终于一起慢下来的那一刻。`,
            14: `${name} 留下来的，常常是海先把你安放好，再把那层更深一点的蓝慢慢交到眼前的过程。`
        };
        const murmurMap = {
            1: '你可以继续把它排进行程，或再看看另一片与你此刻节奏更接近的蓝。',
            2: '如果还想继续往下潜，这片海之后，也许还有另一处更适合你此刻层级的水域。',
            3: '看完这片更深的蓝以后，或许可以再去一片节奏不同的海，把这次下潜慢慢接续下去。',
            4: '它适合被排进行程，也适合被留在心里，作为下一次再往前一步的起点。',
            5: '你可以继续寻找更微小、更安静的海，也可以先把这次潜入收进行程。',
            6: '如果想继续向海而行，也许下一片更深一点、或更静一点的蓝，已经在前面等着你。',
            7: '看完这片更有张力的海以后，也可以回到一处更适合此刻呼吸节奏的蓝。',
            8: '把这片海留在呼吸里以后，或许还能去看另一处同样值得慢慢下潜的环礁通道。',
            9: '你可以继续把它排进行程，或再看看另一片更适合此刻停驻节奏的海。',
            13: '如果你想继续把潜旅排进更明亮、更轻一点的海，也许下一片相邻水域已经在前面等你。',
            14: '如果你愿意继续沿着这段舒缓节奏往前，也许下一片海会在更深一点的蓝里等你。'
        };

        return {
            spotName: name,
            lead: leadMap[this.spotId] || `${name} 不会在离开页面时结束。真正留下来的，往往是海忽然安静下来、呼吸也跟着放慢的那一瞬。`,
            murmur: murmurMap[this.spotId] || '你可以继续把它排进行程，或再看看另一片更适合此刻的蓝。',
            closing: this.spotId === 9 ? '把海留在呼吸里，也留在归程里。' : '为每一次下潜，留一处安静停靠。',
            nextSpot
        };
    }

    /**
     * renderFooter() - 用当前潜点数据更新详情页 footer 的收束文案与“下一片海”入口
     * @returns {void} - 无返回值，直接同步 footer DOM
     */
    renderFooter() {
        if (!this.detailFooter) {
            return;
        }

        const footerContent = this.buildFooterContent();

        if (this.detailFooterSpotName) {
            this.detailFooterSpotName.textContent = footerContent.spotName;
        }

        if (this.detailFooterLead) {
            this.detailFooterLead.textContent = footerContent.lead;
        }

        if (this.detailFooterMurmur) {
            this.detailFooterMurmur.textContent = footerContent.murmur;
        }

        if (this.detailFooterClosing) {
            this.detailFooterClosing.textContent = footerContent.closing;
        }

        if (!this.detailFooterNextLink || !this.detailFooterNextName || !this.detailFooterNextCopy) {
            return;
        }

        if (!footerContent.nextSpot) {
            this.detailFooterNextLink.removeAttribute('href');
            this.detailFooterNextLink.removeAttribute('data-related-id');
            this.detailFooterNextName.textContent = '再去看一片更适合的海';
            this.detailFooterNextCopy.textContent = '从这片海离开以后，还可以回到首页，继续慢慢挑一片更适合此刻的蓝。';
            return;
        }

        this.detailFooterNextLink.href = `detail.html?id=${footerContent.nextSpot.id}`;
        this.detailFooterNextLink.dataset.relatedId = String(footerContent.nextSpot.id);
        this.detailFooterNextName.textContent = footerContent.nextSpot.name;
        this.detailFooterNextCopy.textContent = footerContent.nextSpot.description || '再往前一点，去看另一片与你此刻节奏更接近的蓝。';
    }

    /**
     * setupFooterReveal() - 监听 footer 进入视口，为三层收束内容添加缓慢显现动画
     * @returns {void} - 无返回值，直接注册 footer 的显现逻辑
     */
    setupFooterReveal() {
        if (!this.detailFooter) {
            return;
        }

        if (!('IntersectionObserver' in window)) {
            this.detailFooter.classList.add('is-visible', 'is-harbor-awake');
            return;
        }

        this.footerRevealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add('is-visible', 'is-harbor-awake');
                this.footerRevealObserver?.unobserve(entry.target);
            });
        }, {
            threshold: 0.2,
            rootMargin: '0px 0px -8% 0px'
        });

        this.footerRevealObserver.observe(this.detailFooter);
    }

    /**
     * setupFooterNavigation() - 绑定 footer 内部的页内跳转入口和“下一片海”相关推荐入口
     * @returns {void} - 无返回值，直接注册 footer 交互事件
     */
    setupFooterNavigation() {
        if (!this.detailFooter) {
            return;
        }

        this.detailFooter.addEventListener('click', (event) => {
            if (event.defaultPrevented) {
                return;
            }

            const scrollTrigger = event.target.closest('[data-detail-scroll]');
            if (scrollTrigger) {
                event.preventDefault();
                const selector = scrollTrigger.dataset.detailScroll;
                if (!selector) {
                    return;
                }

                this.scrollToSeaGuideTarget(selector);
                return;
            }

            const nextSpotCard = event.target.closest('#detailFooterNextLink[data-related-id]');
            if (!nextSpotCard) {
                return;
            }

            const relatedId = Number(nextSpotCard.dataset.relatedId);
            if (!Number.isFinite(relatedId) || relatedId === this.spotId) {
                return;
            }

            event.preventDefault();
            this.startRelatedSpotTransitionById(relatedId, nextSpotCard);
        });
    }

    // 页面事件总线：集中监听套餐、评论、地图切换、弹窗关闭和相关推荐点击。
    /**
     * setupEventListeners() - 绑定详情页所有主要交互事件
     * @returns {void} - 无返回值，直接注册事件监听
     */
    setupEventListeners() {
        if (this.mapContainer) {
            this.mapContainer.addEventListener('click', (event) => {
                const tabButton = event.target.closest('.sea-atlas-tab');
                if (!tabButton) {
                    return;
                }

                this.setSeaAtlasView(tabButton.dataset.seaView);
            });
        }

        if (this.itineraryList) {
            this.itineraryList.addEventListener('click', (event) => {
                if (event.defaultPrevented) {
                    return;
                }

                const packageButton = event.target.closest('.package-card-action');
                if (packageButton) {
                    event.preventDefault();
                    this.openBookingModal(packageButton.dataset.packageId, packageButton.closest('.package-card'));
                    return;
                }

                const packageCard = event.target.closest('.package-card');
                if (!packageCard) {
                    return;
                }

                this.openBookingModal(packageCard.dataset.packageId, packageCard);
            });

            this.itineraryList.addEventListener('keydown', (event) => {
                if (event.defaultPrevented) {
                    return;
                }

                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                const packageCard = event.target.closest('.package-card');
                if (!packageCard) {
                    return;
                }

                event.preventDefault();
                this.openBookingModal(packageCard.dataset.packageId, packageCard);
            });
        }

        if (this.bookingFocusAction) {
            this.bookingFocusAction.addEventListener('click', () => {
                const packageId = this.bookingFocusAction.dataset.packageId || this.selectedPackageId;
                if (!packageId) {
                    return;
                }

                const sourceCard = this.isBookingFocusOnlyContext()
                    ? this.bookingFocusPanel
                    : this.getPackageCardById(packageId);
                this.openBookingModal(packageId, sourceCard);
            });
        }

        if (this.reviewsFilters) {
            this.reviewsFilters.addEventListener('click', (event) => {
                const filterButton = event.target.closest('.review-filter');
                if (!filterButton) {
                    return;
                }

                const nextFilter = filterButton.dataset.filter || 'all';
                if (nextFilter === this.activeReviewFilter) {
                    return;
                }

                this.activeReviewFilter = nextFilter;
                this.renderReviews();
            });
        }

        if (this.reviewsSection) {
            this.reviewsSection.addEventListener('click', (event) => {
                const detailButton = event.target.closest('.review-detail-trigger');
                if (detailButton) {
                    this.openReviewDetail(detailButton.dataset.reviewId);
                    return;
                }

                const expandButton = event.target.closest('.review-expand');
                if (expandButton) {
                    const reviewCard = expandButton.closest('.review-card');
                    if (!reviewCard) {
                        return;
                    }

                    const isExpanded = reviewCard.classList.toggle('is-expanded');
                    expandButton.textContent = isExpanded ? '收起全文' : '展开全文';
                    return;
                }

                const photoButton = event.target.closest('.review-photo-button');
                if (!photoButton) {
                    return;
                }

                this.openReviewLightbox(
                    photoButton.dataset.lightboxSrc,
                    photoButton.dataset.lightboxAlt,
                    photoButton.dataset.lightboxCaption
                );
            });
        }

        if (this.packageMatchTags) {
            this.packageMatchTags.addEventListener('click', (event) => {
                const matchLink = event.target.closest('.booking-match-link[data-match-key]');
                if (!matchLink) {
                    return;
                }

                const matchKey = matchLink.dataset.matchKey;
                if (!matchKey) {
                    return;
                }

                navigateWithDepth(buildHomeDiveMatchUrl(matchKey));
            });
        }

        if (this.bookingNote) {
            this.bookingNote.addEventListener('click', (event) => {
                const confirmLink = event.target.closest('.booking-note-link[href]');
                if (!confirmLink) {
                    return;
                }

                event.preventDefault();
                navigateWithDepth(confirmLink.getAttribute('href'));
            });
        }

        if (this.bookingConfirmFeedback) {
            this.bookingConfirmFeedback.addEventListener('click', (event) => {
                const goTripLink = event.target.closest('#bookingConfirmGoTrip[href]');
                if (goTripLink) {
                    event.preventDefault();
                    this.hideBookingConfirmedFeedback({ immediate: true });
                    window.requestAnimationFrame(() => {
                        navigateWithDepth(goTripLink.getAttribute('href'));
                    });
                    return;
                }

                if (
                    event.target === this.bookingConfirmFeedback ||
                    event.target.closest('[data-close-booking-feedback]') ||
                    event.target.closest('#bookingConfirmStay')
                ) {
                    this.hideBookingConfirmedFeedback();
                }
            });
        }

        if (this.bookingModal) {
            this.bookingModal.addEventListener('click', (event) => {
                if (event.target === this.bookingModal || event.target.closest('.modal-close') || event.target.closest('.package-modal-secondary')) {
                    this.closeBookingModal();
                    return;
                }

                const matchLink = event.target.closest('.booking-match-link[data-match-key]');
                if (matchLink) {
                    const matchKey = matchLink.dataset.matchKey;
                    if (!matchKey) {
                        return;
                    }

                    navigateWithDepth(buildHomeDiveMatchUrl(matchKey));
                    return;
                }

                const priceToggle = event.target.closest('[data-package-price-editor-toggle]');
                if (priceToggle) {
                    const packageId = priceToggle.dataset.packagePriceEditorToggle || this.selectedPackageId;
                    if (!packageId) {
                        return;
                    }

                    const currentState = this.getPackageModalViewState(packageId);
                    this.updatePackageModalDraft(packageId, {
                        isEditorOpen: !currentState?.isEditorOpen
                    });
                    this.renderBookingModalMarkup(packageId, { preserveBodyScroll: true });
                    return;
                }

                const customDurationToggle = event.target.closest('[data-package-custom-duration-toggle]');
                if (customDurationToggle) {
                    const packageId = customDurationToggle.dataset.packageCustomDurationToggle || this.selectedPackageId;
                    if (!packageId) {
                        return;
                    }

                    this.updatePackageModalDraft(packageId, {
                        isEditorOpen: true,
                        isCustomDurationOpen: true
                    });
                    this.renderBookingModalMarkup(packageId, { preserveBodyScroll: true });
                    window.requestAnimationFrame(() => {
                        this.focusPackageModalCustomDurationInput(packageId);
                    });
                    return;
                }

                const durationOption = event.target.closest('[data-package-duration-days][data-package-id]');
                if (durationOption) {
                    const packageId = durationOption.dataset.packageId;
                    const nextDays = Number(durationOption.dataset.packageDurationDays);
                    if (!packageId || !Number.isFinite(nextDays)) {
                        return;
                    }

                    this.updatePackageModalDraft(packageId, {
                        days: nextDays,
                        isEditorOpen: true,
                        isCustomDurationOpen: false
                    });
                    this.renderBookingModalMarkup(packageId, { preserveBodyScroll: true });
                    return;
                }

                const customDurationApply = event.target.closest('[data-package-custom-duration-apply]');
                if (customDurationApply) {
                    const packageId = customDurationApply.dataset.packageCustomDurationApply || this.selectedPackageId;
                    if (!packageId) {
                        return;
                    }

                    this.applyPackageModalCustomDuration(packageId);
                    return;
                }

                const windowOption = event.target.closest('[data-package-window-key][data-package-id]');
                if (windowOption) {
                    const packageId = windowOption.dataset.packageId;
                    const windowKey = windowOption.dataset.packageWindowKey;
                    if (!packageId || !windowKey) {
                        return;
                    }

                    this.updatePackageModalDraft(packageId, {
                        windowKey,
                        isEditorOpen: true
                    });
                    this.renderBookingModalMarkup(packageId, { preserveBodyScroll: true });
                    return;
                }

                const confirmButton = event.target.closest('.package-modal-primary');
                if (confirmButton) {
                    this.confirmBooking(confirmButton.dataset.packageId);
                }
            });

            this.bookingModal.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') {
                    return;
                }

                const customDurationInput = event.target.closest('[data-package-custom-duration-input][data-package-id]');
                if (!customDurationInput) {
                    return;
                }

                event.preventDefault();
                this.applyPackageModalCustomDuration(customDurationInput.dataset.packageId, customDurationInput.value);
            });
        }

        if (this.reviewDetailModal) {
            this.reviewDetailModal.addEventListener('click', (event) => {
                if (event.target === this.reviewDetailModal || event.target.closest('.review-detail-close')) {
                    this.closeReviewDetail();
                    return;
                }

                const photoButton = event.target.closest('.review-detail-photo-button');
                if (!photoButton) {
                    return;
                }

                this.openReviewLightbox(
                    photoButton.dataset.lightboxSrc,
                    photoButton.dataset.lightboxAlt,
                    photoButton.dataset.lightboxCaption
                );
            });
        }

        if (this.reviewLightbox) {
            this.reviewLightbox.addEventListener('click', (event) => {
                if (event.target === this.reviewLightbox || event.target.closest('.review-lightbox-close')) {
                    this.closeReviewLightbox();
                }
            });
        }

        window.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') {
                return;
            }

            if (this.reviewLightbox && this.reviewLightbox.classList.contains('active')) {
                this.closeReviewLightbox();
                return;
            }

            if (this.bookingConfirmFeedback && this.bookingConfirmFeedback.classList.contains('active')) {
                this.hideBookingConfirmedFeedback();
                return;
            }

            if (this.reviewDetailModal && this.reviewDetailModal.classList.contains('active')) {
                this.closeReviewDetail();
                return;
            }

            if (this.bookingModal && this.bookingModal.classList.contains('active')) {
                this.closeBookingModal();
            }
        });

        let reviewExpandSyncFrame = 0;
        const requestReviewExpandSync = () => {
            if (reviewExpandSyncFrame) {
                return;
            }

            reviewExpandSyncFrame = window.requestAnimationFrame(() => {
                reviewExpandSyncFrame = 0;
                this.syncReviewExpandButtons();
            });
        };

        window.addEventListener('resize', requestReviewExpandSync);
        if (document.fonts?.ready) {
            document.fonts.ready.then(() => {
                requestReviewExpandSync();
            }).catch(() => {});
        }
        window.setTimeout(() => {
            requestReviewExpandSync();
        }, 180);
    }

    /**
     * openBookingModal(packageId) - 打开指定套餐的详情弹层
     * @param {string} packageId - 套餐 ID
     * @returns {void} - 无返回值，直接显示套餐弹层
     */
    openBookingModal(packageId, sourceCard = null) {
        const pkg = this.getPackageById(packageId);
        if (!pkg || !this.bookingModal || !this.bookingModalBody) {
            return;
        }

        const sourceState = this.capturePackageSourceState(packageId, sourceCard);
        this.clearBookingModalMorph();

        if (this.bookingModalCloseTimer) {
            window.clearTimeout(this.bookingModalCloseTimer);
            this.bookingModalCloseTimer = 0;
        }

        this.selectedPackageId = pkg.id;
        this.syncPackageCardSelection(pkg.id);
        const currentModalState = this.getPackageModalViewState(pkg.id);
        this.updatePackageModalDraft(pkg.id, {
            isEditorOpen: false,
            isCustomDurationOpen: Boolean(currentModalState?.isCustomDurationSelected)
        });
        this.renderBookingModalMarkup(pkg.id);
        this.bookingModal.classList.remove('is-closing');
        this.bookingModal.setAttribute('aria-hidden', 'false');
        this.bookingModal.querySelector('.booking-modal-content')?.classList.add('is-morphing');

        window.requestAnimationFrame(() => {
            if (!this.bookingModal) {
                return;
            }

            this.bookingModal.classList.add('active');
            this.syncOverlayLock();

            window.requestAnimationFrame(() => {
                this.startBookingModalMorph(pkg.id, sourceState);
            });
        });
    }

    // 详情页海图导览：
    // 负责悬浮导览、正文区块同步高亮，以及在不同内容层之间做平缓移动。
    /**
     * getSeaGuideOffset() - 计算海图导览滚动定位时需要避开的顶部导航偏移量
     * @returns {number} - 用于滚动定位的顶部偏移值
     */
    getSeaGuideOffset(forceMeasure = false) {
        if (!forceMeasure && Number.isFinite(this.detailSeaGuideOffset)) {
            return this.detailSeaGuideOffset;
        }

        const navbar = document.querySelector('.navbar');
        this.detailSeaGuideOffset = (navbar ? navbar.offsetHeight : 72) + 18;
        return this.detailSeaGuideOffset;
    }

    /**
     * setSeaGuideOpen(isOpen) - 切换详情页海图导览的展开或收起状态
     * @param {boolean} isOpen - 是否展开海图导览
     * @returns {void} - 无返回值，直接更新面板状态
     */
    setSeaGuideOpen(isOpen) {
        if (!this.seaGuide || !this.seaGuideTrigger || !this.seaGuidePanel) {
            return;
        }

        this.seaGuideOpen = Boolean(isOpen);
        this.seaGuide.classList.toggle('is-open', this.seaGuideOpen);
        this.seaGuideTrigger.setAttribute('aria-expanded', String(this.seaGuideOpen));
        this.seaGuidePanel.setAttribute('aria-hidden', String(!this.seaGuideOpen));
    }

    /**
     * scrollToSeaGuideTarget(selector) - 平滑滚动到海图导览选中的目标区块
     * @param {string} selector - 目标区块的 CSS 选择器
     * @returns {Promise<void>} - 滚动完成时返回的 Promise
     */
    scrollToSeaGuideTarget(selector) {
        this.primeDeferredSection(selector);
        const target = document.querySelector(selector);
        if (!target) {
            return Promise.resolve();
        }

        const targetY = target.getBoundingClientRect().top + window.scrollY - this.getSeaGuideOffset();

        if (window.OceanScroll && typeof window.OceanScroll.animateTo === 'function') {
            return window.OceanScroll.animateTo(targetY, {
                duration: selector === '#detailHero' ? 1700 : 1520
            });
        }

        window.scrollTo({
            top: targetY,
            behavior: 'smooth'
        });
        return Promise.resolve();
    }

    /**
     * getCurrentSeaGuideKey() - 计算当前阅读位置更接近哪一个海图导览区块
     * @returns {string} - 当前应高亮的海图导览 key
     */
    getCurrentSeaGuideKey() {
        if (!this.seaGuideMetrics.length) {
            return '';
        }

        const scrollY = window.scrollY || window.pageYOffset || 0;
        const probeY = scrollY + this.getSeaGuideOffset() + Math.min(window.innerHeight * 0.24, 220);
        let currentKey = this.seaGuideMetrics[0].key || '';

        this.seaGuideMetrics.forEach((metric) => {
            if (probeY >= metric.top - 24) {
                currentKey = metric.key || currentKey;
            }
        });

        return currentKey;
    }

    /**
     * updateSeaGuideState() - 同步海图导览的显隐、深层状态和当前区块高亮
     * @returns {void} - 无返回值，直接更新导览状态
     */
    updateSeaGuideState() {
        this.syncBookingReadingGuide();
        this.syncBookingCopyDepthState();
        this.syncBookingStickyScrollWithReading();
        this.syncPackageSelectionFromCurrentReview();
        this.revealReviewGalleryPhotos();

        if (!this.seaGuide || !this.seaGuideEntries.length) {
            return;
        }

        const scrollTop = window.scrollY || window.pageYOffset || 0;
        const isVisible = scrollTop > 180;
        const isDeep = scrollTop > Math.max(window.innerHeight * 0.85, 760);
        const currentKey = this.getCurrentSeaGuideKey();

        this.seaGuide.classList.toggle('is-visible', isVisible);
        this.seaGuide.classList.toggle('is-deep', isDeep);
        this.seaGuide.setAttribute('aria-hidden', String(!isVisible));

        this.seaGuideEntries.forEach((entry) => {
            const isCurrent = entry.dataset.key === currentKey;
            entry.classList.toggle('is-current', isCurrent);
            entry.setAttribute('aria-current', isCurrent ? 'true' : 'false');
        });
    }

    /**
     * setupSeaGuide() - 初始化详情页海图导览的展开、关闭和滚动高亮逻辑
     * @returns {void} - 无返回值，直接注册详情页海图导览事件
     */
    setupSeaGuide() {
        if (!this.seaGuide || !this.seaGuideTrigger || !this.seaGuideEntries.length) {
            return;
        }

        this.seaGuideInitialized = true;

        const requestStateUpdate = () => {
            if (this.seaGuideUpdateRaf) {
                return;
            }

            this.seaGuideUpdateRaf = window.requestAnimationFrame(() => {
                this.seaGuideUpdateRaf = 0;
                this.updateSeaGuideState();
            });
        };
        const requestLayoutMeasure = () => {
            this.scheduleDetailScrollMetricsMeasure();
            requestStateUpdate();
        };
        // 和首页海图导览一样，这里把滚动状态更新压到动画帧中，
        // 避免滚动过程中连续读布局导致高亮抖动。

        this.seaGuideTrigger.addEventListener('click', (event) => {
            event.preventDefault();
            this.setSeaGuideOpen(!this.seaGuideOpen);
        });

        this.seaGuideEntries.forEach((entry) => {
            entry.addEventListener('click', () => {
                const selector = entry.dataset.target;
                this.setSeaGuideOpen(false);
                if (!selector) {
                    return;
                }

                this.primeDeferredSection(selector);
                this.scrollToSeaGuideTarget(selector);
            });
        });

        document.addEventListener('click', (event) => {
            if (!this.seaGuideOpen || this.seaGuide.contains(event.target)) {
                return;
            }

            this.setSeaGuideOpen(false);
        });

        window.addEventListener('keydown', (event) => {
            const hasOverlayOpen =
                (this.reviewLightbox && this.reviewLightbox.classList.contains('active')) ||
                (this.reviewDetailModal && this.reviewDetailModal.classList.contains('active')) ||
                (this.bookingConfirmFeedback && this.bookingConfirmFeedback.classList.contains('active')) ||
                (this.bookingModal && this.bookingModal.classList.contains('active'));

            if (event.key === 'Escape' && this.seaGuideOpen && !hasOverlayOpen) {
                this.setSeaGuideOpen(false);
            }
        });

        window.addEventListener('scroll', requestStateUpdate, { passive: true });
        window.addEventListener('resize', requestLayoutMeasure);

        if ('ResizeObserver' in window) {
            this.detailScrollMetricsResizeObserver = new ResizeObserver(requestLayoutMeasure);
            [
                this.introSection,
                this.spotMapHeading,
                this.mapContainer,
                this.spotReviewsHeading,
                this.reviewsStage,
                this.reviewsSection,
                this.relatedSection
            ].forEach((element) => {
                if (element) {
                    this.detailScrollMetricsResizeObserver.observe(element);
                }
            });
        }

        window.setTimeout(() => {
            this.measureDetailScrollMetrics();
            this.updateSeaGuideState();
        }, 80);
    }

    /**
     * setupNavigation() - 绑定详情页头像返回登录等页面级导航行为
     * @returns {void} - 无返回值，直接注册导航事件
     */
    setupNavigation() {
        window.YanqiAvatarReturn?.bind({
            targetUrl: 'index.html'
        });
    }

    // 相关推荐切页生命周期：处理进入时接续动画、离场写状态和资源预加载。
    /**
     * setupRelatedTransitionLifecycle() - 初始化相关推荐切页状态恢复与清理逻辑
     * @returns {void} - 无返回值，直接注册页面生命周期事件
     */
    setupRelatedTransitionLifecycle() {
        window.addEventListener('pageshow', (event) => {
            if (!event.persisted) {
                return;
            }

            this.applyIncomingRelatedTransition(true);
        });

        window.addEventListener('pagehide', () => {
            this.setBookingStickyFocusContextPhase('');

            if (this.inDocumentDetailSwapTimer) {
                window.clearTimeout(this.inDocumentDetailSwapTimer);
                this.inDocumentDetailSwapTimer = 0;
            }

            this.isInDocumentDetailSwapping = false;

            if (this.relatedEntryRevealTimer) {
                window.clearTimeout(this.relatedEntryRevealTimer);
                this.relatedEntryRevealTimer = 0;
            }

            if (this.relatedTransitionCleanupTimer) {
                window.clearTimeout(this.relatedTransitionCleanupTimer);
                this.relatedTransitionCleanupTimer = 0;
            }

            if (this.relatedStageSwitchTimer) {
                window.clearTimeout(this.relatedStageSwitchTimer);
                this.relatedStageSwitchTimer = 0;
            }

            if (this.relatedStageCleanupTimer) {
                window.clearTimeout(this.relatedStageCleanupTimer);
                this.relatedStageCleanupTimer = 0;
            }

            if (this.relatedGrid) {
                const stageShells = Array.from(this.relatedGrid.querySelectorAll('.related-stage-shell'));
                const preservedStage = stageShells[stageShells.length - 1]
                    || this.relatedGrid.querySelector('.related-stage-shell');

                this.relatedGrid.classList.remove(
                    'is-navigating',
                    'is-entering',
                    'is-flow-forward',
                    'is-flow-backward',
                    'is-switching',
                    'is-stage-switching'
                );
                this.relatedGrid.style.removeProperty('min-height');
                this.relatedGrid.querySelectorAll('.is-leaving').forEach((card) => card.classList.remove('is-leaving'));

                stageShells.forEach((stage) => {
                    if (preservedStage && stage !== preservedStage) {
                        stage.remove();
                        return;
                    }

                    stage.classList.remove(
                        'is-stage-outgoing',
                        'is-stage-incoming',
                        'is-stage-active',
                        'is-stacked-stage',
                        'is-flow-forward',
                        'is-flow-backward'
                    );
                    stage.removeAttribute('aria-hidden');
                });
            }

            this.resetRelatedSwapClasses();
            this.clearPressedRelatedCard();
        });
    }

    /**
     * getFreshDetailSwapState() - 读取当前仍然有效的相关推荐切页状态
     * @returns {Object|null} - 切页状态对象或空值
     */
    getFreshDetailSwapState() {
        return readDetailSwapState();
    }

    // 相关推荐过渡恢复：根据 sessionStorage 状态决定前进进入还是后退返回动画。
    /**
     * applyIncomingRelatedTransition(fromPageShow) - 根据暂存状态恢复相关推荐切页动画
     * @param {boolean} fromPageShow - 是否由 pageshow 事件触发
     * @returns {void} - 无返回值，直接播放对应动画
     */
    applyIncomingRelatedTransition(fromPageShow = false) {
        const state = this.getFreshDetailSwapState();
        if (!state) {
            return;
        }

        if (state.toId === this.spotId) {
            if (!state.forwardConsumed) {
                this.playRelatedSwapAnimation('detail-swap-enter', state.direction);
                markDetailSwapForwardConsumed(state);
            }
            return;
        }

        if ((fromPageShow || this.navigationType === 'back_forward') && state.fromId === this.spotId) {
            this.playRelatedSwapAnimation('detail-swap-back-enter', reverseDetailSwapDirection(state.direction));
        }
    }

    /**
     * playRelatedSwapAnimation(className) - 播放相关推荐详情页切换动画
     * @param {string} className - 需要应用的动画 class
     * @returns {void} - 无返回值，直接更新页面状态
     */
    playRelatedSwapAnimation(className, direction = 'forward') {
        if (!this.body || !this.pageStage) {
            return;
        }

        this.resetRelatedSwapClasses();

        window.requestAnimationFrame(() => {
            this.body.classList.add(
                'detail-swap-active',
                className,
                normalizeDetailSwapDirection(direction) === 'backward' ? 'detail-swap-flow-backward' : 'detail-swap-flow-forward'
            );
        });

        if (this.relatedTransitionCleanupTimer) {
            window.clearTimeout(this.relatedTransitionCleanupTimer);
        }

        this.relatedTransitionCleanupTimer = window.setTimeout(() => {
            this.resetRelatedSwapClasses();
            this.relatedTransitionCleanupTimer = 0;
        }, DETAIL_SWAP_DURATION_MS + 60);
    }

    /**
     * resetRelatedSwapClasses() - 清理相关推荐切页相关的页面状态 class
     * @returns {void} - 无返回值，直接移除动画 class
     */
    resetRelatedSwapClasses() {
        if (!this.body) {
            return;
        }

        this.body.classList.remove(...DETAIL_SWAP_CLASSES);
    }

    // 相关推荐点击态：管理卡片按下反馈和最终跳转前的视觉状态。
    /**
     * setPressedRelatedCard(card) - 记录当前按下的相关推荐卡片并更新其按压态
     * @param {Element|null} card - 当前按下的卡片元素
     * @returns {void} - 无返回值，直接更新卡片状态
     */
    setPressedRelatedCard(card) {
        if (this.pressedRelatedCard && this.pressedRelatedCard !== card) {
            this.pressedRelatedCard.classList.remove('is-pressed');
        }

        this.pressedRelatedCard = card;

        if (this.pressedRelatedCard) {
            this.pressedRelatedCard.classList.add('is-pressed');
        }
    }

    /**
     * clearPressedRelatedCard(card) - 清理相关推荐卡片的按压状态
     * @param {Element|null} card - 需要清理的卡片元素
     * @returns {void} - 无返回值，直接移除按压态
     */
    clearPressedRelatedCard(card = null) {
        const targetCard = card || this.pressedRelatedCard;
        if (!targetCard) {
            return;
        }

        targetCard.classList.remove('is-pressed');

        if (!card || this.pressedRelatedCard === card) {
            this.pressedRelatedCard = null;
        }
    }

    /**
     * startRelatedSpotTransition(card) - 从当前详情页切换到点击的相关推荐详情页
     * @param {Element} card - 被点击的相关推荐卡片元素
     * @returns {void} - 无返回值，直接启动切页流程
     */
    /**
     * startRelatedSpotTransitionById(targetId, sourceElement) - 以统一的跨详情页转场逻辑跳往目标潜点
     * @param {number} targetId - 目标潜点 ID
     * @param {Element|null} sourceElement - 触发本次切换的来源元素
     * @returns {void} - 无返回值，直接启动切页动画和导航
     */
    startRelatedSpotTransitionById(targetId, sourceElement = null) {
        if (!Number.isFinite(targetId) || targetId === this.spotId) {
            if (sourceElement) {
                sourceElement.classList.remove('is-pressed');
            }
            return;
        }

        if (this.relatedTransitionTimer) {
            window.clearTimeout(this.relatedTransitionTimer);
            this.relatedTransitionTimer = 0;
        }

        if (this.relatedTransitionCleanupTimer) {
            window.clearTimeout(this.relatedTransitionCleanupTimer);
            this.relatedTransitionCleanupTimer = 0;
        }

        if (sourceElement) {
            sourceElement.classList.add('is-pressed');
        }

        const sourceCard = sourceElement?.closest('.related-feature-card') || null;
        if (this.relatedGrid && sourceCard && this.relatedGrid.contains(sourceCard)) {
            this.relatedGrid.classList.add('is-navigating');
            sourceCard.classList.add('is-leaving');
        }

        const direction = targetId > this.spotId ? 'forward' : 'backward';
        this.resetRelatedSwapClasses();
        writeDetailSwapState(this.spotId, targetId, direction);
        sessionStorage.setItem('yanqi_depth_current', '-50');
        this.playRelatedSwapAnimation('detail-swap-exit', direction);

        this.relatedTransitionTimer = window.setTimeout(() => {
            this.relatedTransitionTimer = 0;
            window.location.href = `detail.html?id=${targetId}`;
        }, DETAIL_SWAP_NAVIGATE_DELAY_MS);

        this.relatedTransitionCleanupTimer = window.setTimeout(() => {
            this.relatedTransitionCleanupTimer = 0;
            if (sourceElement) {
                sourceElement.classList.remove('is-pressed');
            }
            if (this.relatedGrid) {
                this.relatedGrid.classList.remove('is-navigating');
            }
            sourceCard?.classList.remove('is-leaving');
            this.resetRelatedSwapClasses();
        }, DETAIL_SWAP_DURATION_MS + 60);
    }

    startRelatedSpotTransition(card) {
        const targetId = Number(card.dataset.id);
        this.setPressedRelatedCard(card);
        this.startRelatedSpotTransitionById(targetId, card);
    }

    // 资源预加载：提前请求相关推荐详情页和首图，减少详情之间切换的等待感。
    /**
     * preloadRelatedAssets(relatedSpots) - 预加载相关推荐的图片和详情页资源
     * @param {Array<Object>} relatedSpots - 推荐潜点数据数组
     * @returns {void} - 无返回值，直接触发资源预取
     */
    preloadRelatedAssets(relatedSpots) {
        relatedSpots.forEach((spot) => {
            const preloadImage = new Image();
            preloadImage.decoding = 'async';
            preloadImage.src = divingSpotDetails[spot.id]?.image || spot.image;

            const href = new URL(`detail.html?id=${spot.id}`, window.location.href).href;
            if (document.head.querySelector(`link[data-detail-prefetch="${spot.id}"]`)) {
                return;
            }

            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = href;
            link.setAttribute('data-detail-prefetch', String(spot.id));
            document.head.appendChild(link);
        });
    }
}

// 详情页初始化入口：页面加载后创建单例实例，启动整页渲染与交互。
/**
 * document DOMContentLoaded 回调 - 初始化详情页主控制器
 * @returns {void} - 无返回值，直接启动详情页逻辑
 */
document.addEventListener('DOMContentLoaded', function () {
    setupStageDebugToggle();
    new DetailPage();
});



