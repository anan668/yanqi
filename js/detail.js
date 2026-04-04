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
                image: 'assets/images/timor.jpg',
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
                image: 'assets/images/komodo.jpg',
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
                image: 'assets/images/timor.jpg',
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
        image: 'assets/images/timor.jpg',
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
                text: '帝汶岛的舒服，在于你可以一直潜、一直看，不会被过度紧张的节奏打断。色彩层次很适合拍照。'
            },
            {
                user: '夜潜观察笔记',
                rating: '★★★★☆',
                date: '2025-11-19',
                text: '夜潜内容非常丰富，章鱼和小型甲壳类特别多，微距潜水员会很开心。'
            },
            {
                user: '浅坡漫游者',
                rating: '★★★★★',
                date: '2025-09-02',
                text: '如果想找一个适合休息和认真看珊瑚生态的地方，帝汶岛的节奏非常对味。'
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
                image: 'assets/images/komodo.jpg',
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
                user: '微距慢门',
                rating: '★★★★★',
                date: '2026-02-11',
                text: '这里不是那种一下水就被大鱼包围的地方，但每一趟都能找到新小东西，非常适合认真观察。'
            },
            {
                user: '海蛞蝓采样员',
                rating: '★★★★☆',
                date: '2025-12-27',
                text: '向导找生物的能力很强，很多平时根本不会注意到的小型生物都能被指出来。'
            },
            {
                user: '静水记录本',
                rating: '★★★★★',
                date: '2025-10-08',
                text: '如果你想把潜水节奏放慢，真正看清一块珊瑚上的生态关系，波纳佩岛很适合。'
            }
        ],
        related: [
            {
                id: 4,
                name: '帝汶岛',
                description: '同样适合慢潜，但帝汶的坡地和珊瑚覆盖更宏观。',
                image: 'assets/images/timor.jpg',
                price: '¥3,480'
            },
            {
                id: 6,
                name: '布纳肯',
                description: '从微距和慢潜切到海墙、海龟和更开阔的蓝水，是很自然的下一站。',
                image: 'assets/images/timor.jpg',
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
        image: 'assets/images/timor.jpg',
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
                text: '布纳肯最舒服的是那种通透感，海墙很开阔，海龟又一直在身边，整趟潜水像被安静地托住。'
            },
            {
                user: '海龟观察席',
                rating: '★★★★★',
                date: '2025-11-30',
                text: '这里不是那种节奏很猛的海，但海墙、光线和海龟之间的平衡特别好，很适合慢慢拍、慢慢看。'
            },
            {
                user: '蓝水边界线',
                rating: '★★★★☆',
                date: '2025-10-21',
                text: '如果你想找一片不那么紧张、但依旧足够漂亮和完整的热带海，布纳肯会是很稳妥的选择。'
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
                image: 'assets/images/komodo.jpg',
                price: '¥3,880'
            }
        ]
    },
    7: {
        name: '科莫多',
        tagline: '流会更明显一些，大景与停顿也因此更有层次。',
        image: 'assets/images/komodo.jpg',
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
                text: '科莫多的魅力在于能量感，海水一直在动，鱼群也一直在动，整趟潜水像被海流推进剧情。'
            },
            {
                user: '蝠鲼旁观席',
                rating: '★★★★★',
                date: '2025-12-14',
                text: '蝠鲼从头顶掠过去的时候非常近，但又不需要追它，只要守好位置，它自然会来。'
            },
            {
                user: '热流边界线',
                rating: '★★★★☆',
                date: '2025-09-26',
                text: '水温层变化确实明显，不过地形和鱼群都很值回票价，是非常典型的印尼风格潜点。'
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
                image: 'assets/images/timor.jpg',
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
                image: 'assets/images/timor.jpg',
                price: '¥3,480'
            },
            {
                id: 7,
                name: '科莫多',
                description: '如果想要更强的流潜和蝠鲼机会，科莫多是自然延伸。',
                image: 'assets/images/komodo.jpg',
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
                image: 'assets/images/timor.jpg',
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
    10: 'maldives-liveaboard'
});

// 相关推荐切换配置：控制详情页之间的卡片式切页时长、状态存储和方向 class。
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
        this.spotId = this.getSpotIdFromUrl();
        this.spotData = divingSpotDetails[this.spotId] || divingSpotDetails[1];
        this.packageData = [];
        this.reviewData = [];
        this.activeReviewFilter = 'all';
        this.selectedPackageId = null;
        this.tripStore = window.YanqiTripStore || null;
        this.bookedPackageIds = new Set();
        this.navigationType = getNavigationType();
        this.relatedTransitionTimer = 0;
        this.relatedTransitionCleanupTimer = 0;
        this.relatedStageSwitchTimer = 0;
        this.relatedStageCleanupTimer = 0;
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
        this.introSection = document.getElementById('spotOverview');
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
        this.footerRevealObserver = null;
        this.relatedRevealObserver = null;
        this.introRevealObserver = null;
        this.reviewsRevealObserver = null;
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
        this.activeReviewLinkedPackageId = null;
        this.bookingStickyScrollTargetTop = 0;
        this.bookingStickyScrollRaf = 0;
        this.hasRenderedReviews = false;
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
     * getReviewPackageIntent() - 把评论里的经验等级整理成更适合侧栏联动的意图类型。
     * 纯 AOW / 进阶评论才强制拉向进阶套餐；像 “OW / AOW” 这种过渡型表达，
     * 会被视作中性层，避免一开始就把侧栏直接拽进更深套餐，后面又折返。
     * @param {string} levelText - 评论上的经验等级文案
     * @returns {'leisure'|'advanced'|'neutral'} - 当前评论更适合靠近的套餐意图
     */
    getReviewPackageIntent(levelText) {
        const normalizedLevel = String(levelText || '').trim().toLowerCase();
        if (!normalizedLevel) {
            return 'neutral';
        }

        const hasOwSignal = /\bow\b|入门|新手/.test(normalizedLevel);
        const hasAdvancedSignal = /\baow\b|进阶/.test(normalizedLevel);

        if (hasAdvancedSignal && !hasOwSignal) {
            return 'advanced';
        }

        if (hasOwSignal && !hasAdvancedSignal) {
            return 'leisure';
        }

        return 'neutral';
    }

    // 评论数据构建：为当前潜点生成评论卡、详情弹层和图片查看所需的完整数据。
    /**
     * attachReviewPackageLinks() - 按评论的潜水等级把评论映射到当前详情页的对应套餐。
     * OW / 入门评论优先对齐休闲套餐，AOW / 进阶评论优先对齐进阶套餐；
     * 这样左侧读到某一段体验时，右侧能顺着同一条节奏滑到更接近的套餐卡。
     * @param {Array<Object>} reviews - 原始评论数组
     * @returns {Array<Object>} - 补齐 linkedPackageId 等字段后的评论数组
     */
    attachReviewPackageLinks(reviews) {
        const safeReviews = Array.isArray(reviews) ? reviews : [];
        const flowPackages = this.getPackageFlowPackages();

        if (!safeReviews.length || !flowPackages.length) {
            return safeReviews;
        }

        let flowCursor = 0;

        return safeReviews.map((review) => {
            const intent = this.getReviewPackageIntent(review?.level);
            const remainingPackages = flowPackages.slice(Math.min(flowCursor, flowPackages.length - 1));

            let matchedOffset = 0;
            if (intent === 'advanced') {
                matchedOffset = remainingPackages.findIndex((pkg) => pkg.group === '进阶套餐');
            } else if (intent === 'leisure') {
                matchedOffset = remainingPackages.findIndex((pkg) => pkg.group === '休闲套餐');
            }

            const safeOffset = matchedOffset >= 0 ? matchedOffset : 0;
            const linkedPackage = remainingPackages[safeOffset] || flowPackages[flowPackages.length - 1] || null;

            if (linkedPackage) {
                const linkedIndex = flowPackages.findIndex((pkg) => pkg.id === linkedPackage.id);
                flowCursor = linkedIndex >= 0
                    ? Math.min(linkedIndex + 1, flowPackages.length - 1)
                    : flowCursor;
            }

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

        if (this.spotId === 10) {
            return finalizeReviews([
                {
                    id: 'review-1',
                    user: '第一夜的甲板',
                    date: '2026年2月',
                    level: 'OW / AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['diving', 'stay', 'scenery'],
                    title: '马尔代夫船宿 · 环礁醒来',
                    subtitle: '在船上醒来的清晨，会把这趟下潜先变成一段更安静的海上生活。',
                    summary: '马尔代夫船宿最打动我的，不是某一潜单独有多强，而是每天醒来时，你已经在另一片海面上了。清晨推开舱门，先看见甲板、风和浅蓝色的海，再慢慢去准备当天第一潜，会觉得整趟旅程像被海一点点往前推开。',
                    diving: '水下体验本身很完整，环礁、航道和蓝水会把每天的节奏拉得很开。不是每一潜都要追求强烈刺激，但那种连续几天都生活在海上的感觉，会让下潜变得更有整体性。',
                    stay: '船舱空间当然不会像海岛酒店那样舒展，但真正住进去以后，反而会喜欢这种“海就在门外”的紧密感。每次潜完回到甲板、冲淡水、坐一会儿，看整条船慢慢安静下来，是船宿里很重要的一部分。',
                    food: '船上的三餐比预期细致，潜后热食和水果会让身体恢复得更快。晚上大家坐在一起吃饭，也会让整趟行程不像连续赶路，而像同一条海上生活线慢慢展开。',
                    scenery: '我最喜欢的是太阳刚升起来时，海面像一层很轻的银蓝色，船体轻轻晃着，但并不让人紧张。那一刻会明白，船宿的风景不只在水下，也在每次醒来时看见的第一片海。',
                    featurePhoto: createReviewPhoto(1, 'feature', '马尔代夫船宿 · 环礁醒来', '50% 52%'),
                    photos: makeReviewPhotos(1, [
                        { key: 'deck-first-light', caption: '马尔代夫船宿 · 甲板第一道光', position: '50% 44%' },
                        { key: 'cabin-window', caption: '马尔代夫船宿 · 舷窗外的清晨', position: '50% 56%' }
                    ])
                },
                {
                    id: 'review-2',
                    user: '航线之间',
                    date: '2025年12月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.8 / 5',
                    focus: ['diving', 'scenery'],
                    title: '马尔代夫船宿 · 环礁之间',
                    subtitle: '不是住在某一座岛上，而是在几片蓝之间慢慢移动。',
                    summary: '船宿最特别的地方，是你不会只记得某一个点位，而会记得整条航线。白天在不同环礁和航道之间下潜，晚上回到船上，再看海图和第二天的 brief，会觉得自己像真的住进了一段海流里。',
                    diving: '这一条线更适合喜欢“连贯体验”的潜水员。你会看到不同海况、不同蓝水和不同节奏，但它们不是零散的，而是被同一条船慢慢串起来。',
                    stay: '住在船上意味着一切都更直接。起床、下潜、回船、再前往下一段水域，都发生在同一个空间里，所以这趟潜旅会有很强的连续感。',
                    food: '餐食节奏会跟着航线走，不夸张，但很实用。潜后回来能马上吃到热的东西，再上甲板吹一会儿风，会让人觉得船宿的体感比想象中轻松。',
                    scenery: '最难忘的是船从一片环礁慢慢离开、另一片海开始显影的过程。不是突然切换，而是真的能感觉自己在海上移动。那种连续的开阔感，是岛宿很难替代的。',
                    photos: makeReviewPhotos(2, [
                        { key: 'dhoni-boarding', caption: '马尔代夫船宿 · 追着第一潜上小艇', position: '50% 52%' },
                        { key: 'blue-channel', caption: '马尔代夫船宿 · 蓝水航道', position: '50% 48%' }
                    ])
                },
                {
                    id: 'review-3',
                    user: '潜后还很长',
                    date: '2025年10月',
                    level: 'OW',
                    ratingStars: '★★★★☆',
                    ratingScore: '4.7 / 5',
                    focus: ['food', 'stay', 'scenery'],
                    title: '马尔代夫船宿 · 潜后甲板',
                    subtitle: '一天的海不会在最后一潜结束，它会继续停在晚饭前的甲板风里。',
                    summary: '很多人会记得水下的大景，但我后来记住的，是潜完之后回到甲板、把毛巾搭好、等太阳慢慢偏下去的那段时间。船宿让潜水和休息之间没有断开，反而会把每一天都收得很完整。',
                    diving: '潜水安排比较紧凑，但节奏并不乱。你知道自己潜完以后不用再赶回酒店，也不用再去适应下一段路，这会让整天的注意力留在海上本身。',
                    stay: '船舱、餐厅和甲板之间的动线很顺，时间久了会有一种很稳定的节奏感。哪怕只是坐着喝一杯热茶，也会觉得自己还在这条航线上，没有突然从海里掉出来。',
                    food: '晚饭前后的甲板最舒服。吃的不是重点，但热汤、甜点和一杯茶，都会让潜后那种稍微空掉的感觉慢慢被收回来。',
                    scenery: '太阳往下落时，整条船和海面会一起安静下来。那种风不大、颜色也不夸张的时刻，反而很像这趟船宿真正留在心里的部分。',
                    photos: makeReviewPhotos(3, [
                        { key: 'sundeck-tea', caption: '马尔代夫船宿 · 甲板茶歇', position: '52% 46%' },
                        { key: 'after-dive-briefing', caption: '马尔代夫船宿 · 潜后 brief', position: '50% 54%' }
                    ])
                },
                {
                    id: 'review-4',
                    user: '停泊在夜里',
                    date: '2025年8月',
                    level: 'AOW',
                    ratingStars: '★★★★★',
                    ratingScore: '4.9 / 5',
                    focus: ['stay', 'scenery'],
                    title: '马尔代夫船宿 · 夜泊之前',
                    subtitle: '最后那一点光线落下去以后，这条船会把整天的海慢慢收住。',
                    summary: '船宿并不只是白天的潜点安排。到了夜里，船停下来，甲板上的灯开得很轻，远处什么都没有，只剩风和水声。那时候会突然觉得，这趟旅程真正特别的地方，是你把自己完整地交给了一段海上的时间。',
                    diving: '白天的海况、环礁和蓝水会给你很多记忆，但到了晚上，那些水下经历会被重新收成更安静的一团，不再只是“我今天潜了几个点”。',
                    stay: '停泊以后，船舱会变得特别安静。那种和海面一起轻轻晃动、但又很稳定的感觉，会让人比住在岸上更快进入另一种休息状态。',
                    food: '夜里不会有太多仪式感很重的安排，反而是简单的一顿饭和餐后留在甲板上的几分钟，更容易让人记住整天的节奏。',
                    scenery: '这一组照片里最重要的，是环礁边的傍晚和停泊前后的夜色。它们不是最热闹的风景，却最能说明船宿为什么会让人留恋：你不是短暂停在某一座岛，而是真的跟着海走了一段。',
                    photos: makeReviewPhotos(4, [
                        { key: 'lagoon-dusk', caption: '马尔代夫船宿 · 环礁傍晚', position: '50% 48%' },
                        { key: 'night-at-anchor', caption: '马尔代夫船宿 · 夜泊之前', position: '50% 52%' }
                    ])
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
    renderSpotData() {
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

        this.packageData = this.buildPackageData();
        this.reviewData = this.buildReviewData();
        this.selectedPackageId = this.selectedPackageId || this.getPackageFlowPackages()[0]?.id || this.packageData[0]?.id || null;

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
        this.renderReviews();
        this.renderRelatedSpots();
        this.renderFooter();
        this.syncBookingReadingGuide({ force: true, immediate: true });
        this.syncBookingCopyDepthState();
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

        const reviewsAnchor = this.spotReviewsHeading || this.reviewsStage || this.reviewsSection;
        if (!reviewsAnchor) {
            return false;
        }

        const probeY = window.scrollY + this.getSeaGuideOffset() + Math.min(window.innerHeight * 0.28, 240);
        const firstReviewCard = this.reviewsSection?.querySelector('.review-card');
        if (firstReviewCard) {
            const collapseStart = this.getElementReadingAnchorY(
                firstReviewCard,
                firstReviewCard.classList.contains('has-feature-photo') ? 0.82 : 0.92
            );
            return probeY >= collapseStart;
        }

        return probeY >= this.getElementReadingAnchorY(reviewsAnchor, 0.42);
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
     * getCurrentBookingReadingGuideKey() - 根据当前滚动位置判断正文更接近哪一个区块。
     * @returns {string} - 当前应在右侧显示的陪读区块 key
     */
    getCurrentBookingReadingGuideKey() {
        const sections = this.getBookingReadingGuideSections();
        if (!sections.length) {
            return 'overview';
        }

        const probeY = window.scrollY + this.getSeaGuideOffset() + Math.min(window.innerHeight * 0.24, 220);
        const relatedRect = this.relatedSection?.getBoundingClientRect();
        const relatedEnterThreshold = window.innerHeight * 0.52;
        const relatedHoldThreshold = window.innerHeight * 0.84;
        if (
            relatedRect &&
            relatedRect.bottom > Math.max(window.innerHeight * 0.12, 72) &&
            relatedRect.top <= (
                this.activeBookingGuideKey === 'related'
                    ? relatedHoldThreshold
                    : relatedEnterThreshold
            )
        ) {
            return 'related';
        }

        const reviewsAnchor = this.spotReviewsHeading || this.reviewsStage || this.reviewsSection;
        const reviewsRect = reviewsAnchor?.getBoundingClientRect();
        const reviewAnchorThreshold = window.innerHeight * (
            this.activeBookingGuideKey === 'reviews' || this.activeBookingGuideKey === 'related' ? 0.92 : 0.8
        );
        if (
            reviewsRect &&
            reviewsRect.top <= reviewAnchorThreshold &&
            reviewsRect.bottom > Math.max(window.innerHeight * 0.12, 72)
        ) {
            return 'reviews';
        }

        const firstReviewCard = this.reviewsSection?.querySelector('.review-card');
        const firstReviewRect = firstReviewCard?.getBoundingClientRect();
        if (
            firstReviewRect &&
            firstReviewRect.top <= window.innerHeight * 0.82 &&
            firstReviewRect.bottom > Math.max(window.innerHeight * 0.12, 72)
        ) {
            return 'reviews';
        }

        let currentKey = sections[0].key;

        sections.forEach(({ key, element }) => {
            const sectionTop = element.getBoundingClientRect().top + window.scrollY - this.getSeaGuideOffset();
            if (probeY >= sectionTop - 42) {
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
    buildBookingFocusMetaMarkup(pkg) {
        const metaItems = [
            pkg?.group,
            pkg?.duration,
            Array.isArray(pkg?.fitTags) ? pkg.fitTags[0] : ''
        ].filter(Boolean);

        return metaItems.map((item) => `
            <span class="booking-focus-chip">${escapeHtml(item)}</span>
        `).join('');
    }

    /**
     * getBookingFocusSummary() - 生成右侧套餐焦点舱里的摘要句。
     * @param {Object} pkg - 当前套餐对象
     * @param {string} sectionKey - 当前阅读区块 key
     * @returns {string} - 对应的摘要文案
     */
    getBookingFocusSummary(pkg, sectionKey) {
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

        return `${leadMap[sectionKey] || leadMap.overview}：${summaryParts.join(' · ')}`;
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

        this.bookingFocusState.textContent = contextContent.state;
        this.bookingFocusOverline.textContent = contextContent.overline;
        this.bookingFocusTitle.textContent = pkg.name;
        this.bookingFocusMeta.innerHTML = this.buildBookingFocusMetaMarkup(pkg);
        this.updateBookingFocusPrice(pkg.price, { animate: animatePrice });
        this.bookingFocusSummary.textContent = this.getBookingFocusSummary(pkg, contextKey);
        this.bookingSticky?.classList.toggle('is-focus-only-context', isFocusOnlyContext);
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
        this.bookingFocusPanel.classList.remove('is-pulsing');
        void this.bookingFocusPanel.offsetWidth;
        this.bookingFocusPanel.classList.add('is-pulsing');

        this.bookingFocusPulseTimer = window.setTimeout(() => {
            this.bookingFocusPanel?.classList.remove('is-pulsing');
            this.bookingFocusPulseTimer = 0;
        }, 820);
    }

    /**
     * syncBookingFocusPanel() - 同步右侧套餐焦点舱，让价格与当前套餐在阅读评论时仍清晰停留。
     * @param {{ force?: boolean }} [options={}] - 是否强制刷新
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

        const { force = false } = options;
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
        const shouldAnimatePrice = isFirstFocusPaint || packageId !== previousPackageId;
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

        if (!shouldAnimateSwap) {
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
            void this.bookingFocusPanel.offsetWidth;
            this.bookingFocusPanel.classList.add('is-swapping-in');

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
            return;
        }

        const nextGuideCopy = this.getBookingReadingGuideCopy(nextKey);

        this.activeBookingGuideKey = nextGuideCopy.key;
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
        void this.bookingCopy.offsetWidth;
        this.bookingCopy.classList.add('is-swapping-out');

        this.queueBookingCopySwapTimeout(() => {
            if (!this.bookingCopy || transitionVersion !== this.bookingCopySwapVersion) {
                return;
            }

            this.writeBookingReadingGuideCopy(nextGuideCopy);
            this.bookingCopy.classList.remove('is-swapping-out');
            void this.bookingCopy.offsetWidth;
            this.bookingCopy.classList.add('is-swapping-in');

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
            const cadenceStayCopy = [pkg.staySummary, pkg.mealSummary].filter(Boolean).join(' · ');
            const focusCopy = getLeadingSentence(pkg.fitReason || pkg.pace || pkg.mood);
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

        this.itineraryList.querySelectorAll('.package-card').forEach((card) => {
            card.addEventListener('click', (event) => {
                if (event.target.closest('.package-card-action')) {
                    return;
                }

                event.stopPropagation();
                this.openBookingModal(card.dataset.packageId, card);
            });

            card.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                if (event.target.closest('.package-card-action')) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();
                this.openBookingModal(card.dataset.packageId, card);
            });
        });

        this.itineraryList.querySelectorAll('.package-card-action').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.openBookingModal(button.dataset.packageId, button.closest('.package-card'));
            });
        });

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
        const shouldHighlightCard = Boolean(targetId) && !this.isBookingFocusOnlyContext();
        this.itineraryList.querySelectorAll('.package-card').forEach((card) => {
            card.classList.toggle('is-active', shouldHighlightCard && card.dataset.packageId === targetId);
        });

        if (!shouldHighlightCard) {
            this.itineraryList.querySelectorAll('.package-card.is-active').forEach((card) => {
                card.classList.remove('is-active');
            });
        }
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
        if (!this.reviewsSection) {
            return '';
        }

        const reviewCards = Array.from(this.reviewsSection.querySelectorAll('.review-card[data-linked-package-id]'));
        if (!reviewCards.length) {
            return '';
        }

        const focusLine = Math.min(window.innerHeight * 0.42, 320);
        let currentCard = null;
        let bestScore = Number.POSITIVE_INFINITY;
        let activeCardScore = Number.POSITIVE_INFINITY;

        reviewCards.forEach((card) => {
            const rect = card.getBoundingClientRect();
            const intersectsViewport = rect.bottom > 0 && rect.top < window.innerHeight;
            if (!intersectsViewport) {
                return;
            }

            const cardCenter = rect.top + (rect.height / 2);
            const featureBias = card.classList.contains('has-feature-photo') ? -70 : 0;
            const score = Math.abs(cardCenter - focusLine) + featureBias;

            if (score < bestScore) {
                bestScore = score;
                currentCard = card;
            }

            if (card.dataset.linkedPackageId === this.activeReviewLinkedPackageId && score < activeCardScore) {
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

        return currentCard.dataset.linkedPackageId || '';
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
        const visibleReviews = this.reviewData.filter((review) => (
            this.activeReviewFilter === 'all' || review.focus.includes(this.activeReviewFilter)
        ));

        this.reviewsSection.innerHTML = visibleReviews.map((review, index) => `
            <article
                class="review-card${review.featurePhoto ? ' has-feature-photo' : ''}"
                data-review-id="${review.id}"
                data-linked-package-id="${escapeHtml(review.linkedPackageId || '')}"
                data-linked-package-name="${escapeHtml(review.linkedPackageName || '')}"
            >
                <div class="review-body">
                    <header class="review-header">
                        <div class="review-author">
                            <img src="${avatarSrc}" alt="${review.user}头像" class="review-avatar">
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

                <div class="review-gallery${review.featurePhoto ? ' has-featured-photo' : ''}">
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
                                onerror="this.onerror=null;this.src='https://via.placeholder.com/1200x900?text=${encodeURIComponent(review.featurePhoto.caption)}';"
                                style="object-position: ${review.featurePhoto.position};"
                            >
                            <span class="review-photo-caption review-photo-caption-featured">${review.featurePhoto.caption}</span>
                        </button>
                    ` : ''}
                    ${review.photos.map((photo) => `
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
                                onerror="this.onerror=null;this.src='https://via.placeholder.com/960x720?text=${encodeURIComponent(photo.caption)}';"
                                style="object-position: ${photo.position};"
                            >
                            <span class="review-photo-caption">${photo.caption}</span>
                        </button>
                    `).join('')}
                </div>
            </article>
        `).join('');

        this.activeReviewLinkedPackageId = null;
        this.syncReviewExpandButtons();
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
     * markReviewsVisible() - 把评论标题、引导区和评论列表统一切到已显现状态
     * @returns {void} - 无返回值，直接更新评论区 class
     */
    markReviewsVisible() {
        this.spotReviewsHeading?.classList.add('is-visible');
        this.reviewsStage?.classList.add('is-visible');
        this.reviewsSection?.classList.add('is-visible');
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
                        <img src="assets/images/avatar.png" alt="${review.user}头像" class="review-detail-avatar">
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

    /**
     * createPackageModalMarkup(pkg) - 生成套餐详情弹层的 HTML 内容
     * @param {Object} pkg - 当前套餐数据对象
     * @returns {string} - 套餐弹层 HTML 字符串
     */
    createPackageModalMarkup(pkg) {
        return `
            <div class="package-modal-shell">
                <header class="package-modal-head">
                    <div>
                        <p class="package-modal-kicker">${pkg.group}</p>
                        <h2 class="package-modal-title">${pkg.name}</h2>
                        <p class="package-modal-subtitle">${pkg.mood}</p>
                    </div>
                    <div class="package-modal-price">
                        <div>
                            <div>${pkg.duration}</div>
                            <strong>${pkg.price}</strong>
                        </div>
                    </div>
                </header>

                <div class="package-modal-match">
                    ${Array.from(new Set([...pkg.fitTags, pkg.audience])).map((tag) => createBookingMatchChipMarkup(tag)).join('')}
                </div>

                <div class="package-modal-body">
                    <section class="package-modal-section">
                        <h3>套餐亮点</h3>
                        <ul>
                            ${pkg.highlights.map((highlight) => `<li>${highlight}</li>`).join('')}
                        </ul>
                    </section>

                    <section class="package-modal-section">
                        <h3>为什么适合这片海</h3>
                        <p>${pkg.fitReason}</p>
                    </section>

                    ${pkg.reentryNote ? `
                    <section class="package-modal-section">
                        <h3>半年未潜水时</h3>
                        <p>${pkg.reentryNote}</p>
                    </section>
                    ` : ''}

                    <section class="package-modal-section is-full">
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
                        <section class="package-modal-section">
                            <h3>包含内容</h3>
                            <ul>
                                ${pkg.includes.map((item) => `<li>${item}</li>`).join('')}
                            </ul>
                        </section>

                        <section class="package-modal-section">
                            <h3>不包含内容</h3>
                            <ul>
                                ${pkg.excludes.map((item) => `<li>${item}</li>`).join('')}
                            </ul>
                        </section>

                        <section class="package-modal-section">
                            <h3>住宿说明</h3>
                            <p>${pkg.lodging}</p>
                        </section>

                        <section class="package-modal-section">
                            <h3>餐饮说明</h3>
                            <p>${pkg.dining}</p>
                        </section>

                        <section class="package-modal-section">
                            <h3>潜水节奏说明</h3>
                            <p>${pkg.pace}</p>
                        </section>

                        <section class="package-modal-section">
                            <h3>能力与风险提示</h3>
                            <p><strong>适合人群：</strong>${pkg.audience}</p>
                            <p>${pkg.risk}</p>
                        </section>
                    </div>
                </div>

                <div class="package-modal-actions">
                    <button type="button" class="package-modal-secondary">再想想</button>
                    <button type="button" class="package-modal-primary" data-package-id="${pkg.id}">确认预订</button>
                </div>
            </div>
        `;
    }

    /**
     * getPackageSourceCard(packageId, sourceCard) - 找到当前被展开的套餐卡 DOM
     * @param {string} packageId - 套餐 ID
     * @param {HTMLElement|null} sourceCard - 点击来源节点，可能是卡片本身，也可能是按钮
     * @returns {HTMLElement|null} - 对应的套餐卡 DOM
     */
    getPackageSourceCard(packageId, sourceCard = null) {
        if (sourceCard instanceof HTMLElement) {
            if (sourceCard.classList.contains('package-card')) {
                return sourceCard;
            }

            const closestCard = sourceCard.closest('.package-card');
            if (closestCard) {
                return closestCard;
            }
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
     * startBookingModalMorph(packageId, sourceCard) - 让套餐卡像被展开一样放大到屏幕中间
     * @param {string} packageId - 当前展开的套餐 ID
     * @param {HTMLElement|null} sourceCard - 点击来源的套餐卡
     * @returns {void} - 无返回值，直接驱动共享元素动画
     */
    startBookingModalMorph(packageId, sourceState = null) {
        const modalContent = this.bookingModal?.querySelector('.booking-modal-content');
        const originCard = this.getPackageSourceCard(packageId);

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

        void modalContent.offsetWidth;

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

                void modalContent.offsetWidth;

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
     * buildConfirmedBooking(pkg) - 用当前潜点数据生成一条已确认行程
     * 新加入的套餐不继承既有同行人数，避免上一份安排把新的套餐直接预设掉。
     * @param {Object} pkg - 当前套餐对象
     * @returns {Object} - 可写入共享 storage 的标准套餐记录
     */
    buildConfirmedBooking(pkg) {
        const draft = this.tripStore && typeof this.tripStore.getPlannerDraft === 'function'
            ? this.tripStore.getPlannerDraft()
            : {};

        return {
            spotKey: String(this.spotId),
            spotName: this.spotData.name || document.getElementById('spotName')?.textContent || '',
            spotTagline: this.spotData.tagline || document.getElementById('spotTagline')?.textContent || '',
            detailHref: `detail.html?id=${this.spotId}`,
            packageId: pkg.id,
            packageTitle: pkg.name,
            packageTier: pkg.group,
            packagePrice: pkg.price,
            packageNote: pkg.mood,
            packageTags: Array.isArray(pkg.fitTags) ? pkg.fitTags.slice() : [],
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
     * @returns {void} - 无返回值，直接执行关闭动画
     */
    hideBookingConfirmedFeedback() {
        if (
            !this.bookingConfirmFeedback ||
            !this.bookingConfirmFeedback.classList.contains('active') ||
            this.bookingConfirmFeedback.classList.contains('is-closing')
        ) {
            return;
        }

        this.bookingConfirmFeedback.classList.add('is-closing');
        this.bookingConfirmFeedback.setAttribute('aria-hidden', 'true');

        window.clearTimeout(this.bookingConfirmCloseTimer);
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
        this.bookedPackageIds = this.getBookedPackageIdsForCurrentSpot();
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
        const sideSpots = relatedSpots.filter((spot) => spot.id !== activeSpot.id).slice(0, 2);
        const directionClass = direction ? ` ${direction}` : '';
        // 只把一张作为主卡，其余两张做邻近海域。
        // 这样切换时用户感受到的是“在附近海域之间潜游”，不是在列表里换筛选条件。

        return `
            <div class="related-stage-shell${directionClass}">
                <article class="related-feature-card" data-id="${activeSpot.id}" tabindex="0" aria-label="继续查看 ${activeSpot.name} 的详情">
                    <div class="related-feature-media">
                        <img
                            src="${activeSpot.image}"
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
                        return `
                            <button
                                type="button"
                                class="related-neighbor-card"
                                data-id="${spot.id}"
                                aria-label="切换到 ${spot.name}"
                                style="animation-delay: ${index * 0.12}s"
                            >
                                <div class="related-neighbor-media">
                                    <img
                                        src="${spot.image}"
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
    bindRelatedStageInteractions() {
        if (!this.relatedGrid) {
            return;
        }

        const featureCard = this.relatedGrid.querySelector('.related-feature-card');
        const featureAction = this.relatedGrid.querySelector('.related-feature-action');
        const neighborCards = Array.from(this.relatedGrid.querySelectorAll('.related-neighbor-card'));

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
        if (!this.relatedGrid || !Number.isFinite(targetId) || targetId === this.activeRelatedSpotId) {
            return;
        }

        const relatedSpots = Array.isArray(this.spotData.related) ? this.spotData.related : [];
        const currentIndex = relatedSpots.findIndex((spot) => spot.id === this.activeRelatedSpotId);
        const targetIndex = relatedSpots.findIndex((spot) => spot.id === targetId);
        if (targetIndex === -1 || this.relatedStageSwitchTimer) {
            return;
        }

        const flowClass = targetIndex > currentIndex ? 'is-flow-forward' : 'is-flow-backward';
        const featureCard = this.relatedGrid.querySelector('.related-feature-card');
        this.relatedGrid.classList.add('is-switching', flowClass);
        featureCard?.classList.add('is-leaving');

        this.relatedStageSwitchTimer = window.setTimeout(() => {
            this.activeRelatedSpotId = targetId;
            this.relatedGrid.innerHTML = this.buildRelatedStageMarkup(flowClass);
            this.relatedGrid.classList.remove('is-switching');
            this.relatedGrid.classList.add('is-entering', flowClass);
            this.bindRelatedStageInteractions();
            this.syncRelatedTextLayout();
            this.announceRelatedSummary(`已切换到相邻海域${relatedSpots[targetIndex].name}。`);

            this.relatedStageSwitchTimer = 0;

            if (this.relatedStageCleanupTimer) {
                window.clearTimeout(this.relatedStageCleanupTimer);
            }

            this.relatedStageCleanupTimer = window.setTimeout(() => {
                this.relatedGrid?.classList.remove('is-entering', 'is-flow-forward', 'is-flow-backward');
                this.relatedStageCleanupTimer = 0;
            }, 760);
        }, 260);
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
            this.relatedTextLayoutController?.disconnect?.();
            this.relatedTextLayoutController = null;
            return;
        }

        if (!relatedSpots.some((spot) => spot.id === this.activeRelatedSpotId)) {
            this.activeRelatedSpotId = relatedSpots[0].id;
        }

        this.relatedGrid.innerHTML = this.buildRelatedStageMarkup();
        this.bindRelatedStageInteractions();
        this.syncRelatedTextLayout();
        this.preloadRelatedAssets(relatedSpots);
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
            return;
        }

        this.relatedRevealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add('is-visible');
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
            9: `${name} 不会在离开页面时结束。真正留下来的，往往是海风、木栈道和潜后慢下来的那段岛上时光。`
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
            9: '你可以继续把它排进行程，或再看看另一片更适合此刻停驻节奏的海。'
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
            this.detailFooter.classList.add('is-visible');
            return;
        }

        this.footerRevealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add('is-visible');
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
                    ? null
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

                const confirmButton = event.target.closest('.package-modal-primary');
                if (confirmButton) {
                    this.confirmBooking(confirmButton.dataset.packageId);
                }
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
        this.bookingModalBody.innerHTML = this.createPackageModalMarkup(pkg);
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
    getSeaGuideOffset() {
        const navbar = document.querySelector('.navbar');
        return (navbar ? navbar.offsetHeight : 72) + 18;
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
        if (!this.seaGuideEntries.length) {
            return '';
        }

        const probeY = window.scrollY + this.getSeaGuideOffset() + Math.min(window.innerHeight * 0.24, 220);
        let currentKey = this.seaGuideEntries[0].dataset.key || '';

        this.seaGuideEntries.forEach((entry) => {
            const selector = entry.dataset.target;
            const target = selector ? document.querySelector(selector) : null;
            if (!target) {
                return;
            }

            const sectionTop = target.getBoundingClientRect().top + window.scrollY - this.getSeaGuideOffset();
            if (probeY >= sectionTop - 24) {
                currentKey = entry.dataset.key || currentKey;
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

        const requestStateUpdate = () => {
            if (this.seaGuideUpdateRaf) {
                return;
            }

            this.seaGuideUpdateRaf = window.requestAnimationFrame(() => {
                this.seaGuideUpdateRaf = 0;
                this.updateSeaGuideState();
            });
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
        window.addEventListener('resize', requestStateUpdate);
        window.setTimeout(() => this.updateSeaGuideState(), 80);
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
                this.relatedGrid.classList.remove('is-navigating', 'is-entering', 'is-flow-forward', 'is-flow-backward', 'is-switching');
                this.relatedGrid.querySelectorAll('.is-leaving').forEach((card) => card.classList.remove('is-leaving'));
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
        void this.pageStage.offsetWidth;

        this.body.classList.add(
            'detail-swap-active',
            className,
            normalizeDetailSwapDirection(direction) === 'backward' ? 'detail-swap-flow-backward' : 'detail-swap-flow-forward'
        );

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
            preloadImage.src = spot.image;

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



