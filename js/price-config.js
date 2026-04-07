/* ============================================
   共享价格配置 - price-config.js
   ============================================
   职责：
   1. 让首页和详情页共用同一套人民币展示规则。
   2. 集中管理价格版本、金额解析和人民币格式化逻辑。
   3. 维护卡片与套餐构建会用到的海域参考起价。
   4. 向需要展示价格的页面暴露一套稳定的全局接口。
*/
(function attachYanqiPriceConfig(window) {
    // 价格配置会被首页、详情页等多个页面共用。
    // 放进 IIFE 里是为了只暴露一组稳定接口，避免内部常量直接散到全局作用域。
    const PRICE_CONFIG = Object.freeze({
        currency: 'CNY',
        priceDisplayVersion: '2026-04-03-cny-native-v1'
    });

    const EXTRA_DESTINATION_BASE_PRICES = Object.freeze({
        11: 4980,
        12: 3980
    });

    // 这里保存的是“盐憩内部统一使用的参考起价”，不是实时价格。
    // 单独收口成一份不可变配置，后续调整海域价格时只需要维护这一处。
    // 起价参考来自 2025-2026 年公开潜水套餐页面的粗略行情，
    // 这里统一收成“盐憩当前使用的参考起价”，方便首页、详情页和关联海域保持一致。
    const DESTINATION_BASE_PRICES = Object.freeze({
        1: 5600,  // 诗巴丹
        2: 6200,  // 帕劳
        3: 4900,  // 大蓝洞
        4: 4800,  // 帝汶岛
        5: 10800, // 波纳佩岛
        6: 4200,  // 布纳肯
        7: 5000,  // 科莫多
        8: 10800, // 图阿莫图
        9: 4200,  // 马布岛
        10: 12800 // 马尔代夫船宿
    });

    /**
     * extractCurrencyAmount(priceText) - 从价格文本里提取可计算的金额数值
     * @param {string} priceText - 原始价格文本，例如 "¥3,980"
     * @returns {number} - 成功时返回正数金额，失败时返回 0
     */
    function extractCurrencyAmount(priceText) {
        // 这里只抽取数字，是为了兼容旧文案、静态 HTML 和 data-* 中混用的价格字符串。
        const numeric = Number(String(priceText || '').replace(/[^\d.]/g, ''));
        return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
    }

    /**
     * formatPrice(value) - 把金额数值格式化为项目统一的人民币展示文案
     * @param {number} value - 原始金额
     * @returns {string} - 格式化后的人民币文本
     */
    function formatPrice(value) {
        const safeValue = Math.max(0, Math.round(Number(value) || 0));
        return `¥${safeValue.toLocaleString('zh-CN')}`;
    }

    /**
     * normalizePriceText(priceText) - 把不同来源的价格文本整理成统一的人民币展示格式
     * @param {string} priceText - 原始价格文本
     * @returns {string} - 转换后的人民币文本；无法识别时返回原文本
     */
    function normalizePriceText(priceText) {
        const amount = extractCurrencyAmount(priceText);
        return amount > 0
            ? formatPrice(amount)
            : String(priceText || '');
    }

    /**
     * getDestinationBasePrice(spotId) - 读取某个海域当前配置的参考起价
     * @param {number|string} spotId - 海域 id
     * @returns {number} - 可用时返回人民币金额；没有配置时返回 0
     */
    function getDestinationBasePrice(spotId) {
        // 外部传入的 spotId 可能来自 URL、dataset 或对象字段，所以先统一转成整数。
        const normalizedId = Number.parseInt(spotId, 10);
        const extraPrice = EXTRA_DESTINATION_BASE_PRICES[normalizedId];
        return Number.isFinite(normalizedId) && (extraPrice || DESTINATION_BASE_PRICES[normalizedId])
            ? (extraPrice || DESTINATION_BASE_PRICES[normalizedId])
            : 0;
    }

    /**
     * getDestinationPriceText(spotId, fallbackPriceText) - 读取海域起价并输出统一的人民币展示文本
     * @param {number|string} spotId - 海域 id
     * @param {string} fallbackPriceText - 当前 id 没有配置时使用的兜底价格文本
     * @returns {string} - 当前海域应展示的人民币价格文本
     */
    function getDestinationPriceText(spotId, fallbackPriceText = '') {
        const basePrice = getDestinationBasePrice(spotId);
        return basePrice > 0
            ? formatPrice(basePrice)
            : normalizePriceText(fallbackPriceText);
    }

    // 对外只暴露冻结后的统一接口：
    // 1. 页面间读到的是同一套规则；
    // 2. 调试或后续扩展时，不会被某个页面意外改写配置本身。
    window.YanqiPriceConfig = Object.freeze({
        PRICE_CONFIG,
        PRICE_DISPLAY_VERSION: PRICE_CONFIG.priceDisplayVersion,
        DESTINATION_BASE_PRICES: Object.freeze({
            ...DESTINATION_BASE_PRICES,
            ...EXTRA_DESTINATION_BASE_PRICES
        }),
        extractCurrencyAmount,
        formatPrice,
        normalizePriceText,
        getDestinationBasePrice,
        getDestinationPriceText
    });
}(window));
