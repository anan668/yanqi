/* ============================================
   Shared Price Config - price-config.js
   ============================================
   Responsibilities:
   1. Keep Home and Detail pages on the same RMB display system.
   2. Centralize price version, amount parsing, and RMB formatting.
   3. Hold the current destination base prices used by cards and package builders.
   4. Expose one stable global API for any page that needs price rendering.
*/
(function attachYanqiPriceConfig(window) {
    const PRICE_CONFIG = Object.freeze({
        currency: 'CNY',
        priceDisplayVersion: '2026-04-03-cny-native-v1'
    });
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
     * extractCurrencyAmount(priceText) - Read the numeric amount from a price string.
     * @param {string} priceText - Source price text such as "¥3,980"
     * @returns {number} - Parsed positive amount, or 0 when parsing fails
     */
    function extractCurrencyAmount(priceText) {
        const numeric = Number(String(priceText || '').replace(/[^\d.]/g, ''));
        return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
    }

    /**
     * formatPrice(value) - Format a numeric amount into the shared RMB display style.
     * @param {number} value - Raw amount
     * @returns {string} - Formatted RMB text
     */
    function formatPrice(value) {
        const safeValue = Math.max(0, Math.round(Number(value) || 0));
        return `¥${safeValue.toLocaleString('zh-CN')}`;
    }

    /**
     * normalizePriceText(priceText) - Normalize any supported source price text into shared RMB text.
     * @param {string} priceText - Source price text
     * @returns {string} - Shared RMB display text, or original text when unavailable
     */
    function normalizePriceText(priceText) {
        const amount = extractCurrencyAmount(priceText);
        return amount > 0
            ? formatPrice(amount)
            : String(priceText || '');
    }

    /**
     * getDestinationBasePrice(spotId) - Read the configured base price for a destination.
     * @param {number|string} spotId - Destination id
     * @returns {number} - Base RMB amount, or 0 when unavailable
     */
    function getDestinationBasePrice(spotId) {
        const normalizedId = Number.parseInt(spotId, 10);
        return Number.isFinite(normalizedId) && DESTINATION_BASE_PRICES[normalizedId]
            ? DESTINATION_BASE_PRICES[normalizedId]
            : 0;
    }

    /**
     * getDestinationPriceText(spotId, fallbackPriceText) - Format the configured destination base price as RMB text.
     * @param {number|string} spotId - Destination id
     * @param {string} fallbackPriceText - Fallback text when the id is not configured
     * @returns {string} - Formatted RMB price text
     */
    function getDestinationPriceText(spotId, fallbackPriceText = '') {
        const basePrice = getDestinationBasePrice(spotId);
        return basePrice > 0
            ? formatPrice(basePrice)
            : normalizePriceText(fallbackPriceText);
    }

    window.YanqiPriceConfig = Object.freeze({
        PRICE_CONFIG,
        PRICE_DISPLAY_VERSION: PRICE_CONFIG.priceDisplayVersion,
        DESTINATION_BASE_PRICES,
        extractCurrencyAmount,
        formatPrice,
        normalizePriceText,
        getDestinationBasePrice,
        getDestinationPriceText
    });
}(window));
