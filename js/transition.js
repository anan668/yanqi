/* ============================================
   Legacy Transition Bridge - transition.js
   ============================================
   职责：
   1. 保留旧版全局入口，避免历史调用直接失效。
   2. 把所有旧入口统一转发给 `DepthManager`。
   3. 不再维护固定 `setTimeout` 的独立过渡节奏。
   阅读顺序：
   1. DepthManager 获取工具
   2. 兼容导航入口
   3. 旧类兼容壳
*/
(function attachLegacyTransitionBridge(window) {
    const DEFAULT_TARGET_URL = 'home.html';

    /**
     * getDepthManager() - 安全读取当前页面已挂载的 DepthManager 实例
     * @returns {Object|null} - 可用的深度过渡管理器或空值
     */
    function getDepthManager() {
        return window.DepthManager && typeof window.DepthManager.navigateTo === 'function'
            ? window.DepthManager
            : null;
    }

    /**
     * navigateWithDepthManager(targetUrl) - 用当前唯一过渡引擎执行站内跳转
     * @param {string} targetUrl - 目标页面地址
     * @returns {void} - 无返回值，直接执行跳转
     */
    function navigateWithDepthManager(targetUrl) {
        const nextUrl = typeof targetUrl === 'string' && targetUrl.trim()
            ? targetUrl.trim()
            : DEFAULT_TARGET_URL;
        const manager = getDepthManager();

        if (manager) {
            manager.navigateTo(nextUrl);
            return;
        }

        window.location.href = nextUrl;
    }

    /**
     * LegacyDepthGaugeTransitionCompat - 旧类名兼容壳，仅保留转发能力
     */
    class LegacyDepthGaugeTransitionCompat {
        /**
         * constructor() - 初始化兼容壳状态
         */
        constructor() {
            this.isTransitioning = false;
        }

        /**
         * startTransition(targetUrl) - 兼容旧调用方式，统一转发给 DepthManager
         * @param {string} targetUrl - 目标页面地址；省略时默认进入首页
         * @returns {void} - 无返回值，直接执行统一过渡
         */
        startTransition(targetUrl = DEFAULT_TARGET_URL) {
            if (this.isTransitioning) {
                return;
            }

            this.isTransitioning = true;
            navigateWithDepthManager(targetUrl);
        }
    }

    /**
     * transitionToPage(pageUrl) - 旧版备用页面过渡入口，现统一交给 DepthManager
     * @param {string} pageUrl - 目标页面地址
     * @returns {void} - 无返回值，直接执行统一过渡
     */
    function transitionToPage(pageUrl = DEFAULT_TARGET_URL) {
        navigateWithDepthManager(pageUrl);
    }

    /**
     * triggerDepthGaugeTransition(pageUrl) - 旧版登录下潜入口，现统一交给 DepthManager
     * @param {string} pageUrl - 目标页面地址
     * @returns {void} - 无返回值，直接执行统一过渡
     */
    function triggerDepthGaugeTransition(pageUrl = DEFAULT_TARGET_URL) {
        navigateWithDepthManager(pageUrl);
    }

    window.DepthGaugeTransition = LegacyDepthGaugeTransitionCompat;
    window.transitionToPage = transitionToPage;
    window.triggerDepthGaugeTransition = triggerDepthGaugeTransition;
}(window));
