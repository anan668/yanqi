/* ============================================
   旧版过渡兼容桥 - transition.js
   ============================================
   职责：
   1. 保留旧版全局入口，避免历史模板或内联调用直接失效。
   2. 把旧入口统一转发给 `DepthManager`。
   3. 让新旧页面都走同一套“海层切换”导航逻辑。
   阅读顺序：
   1. `getDepthManager`
   2. `navigateWithDepthManager`
   3. 兼容类与旧函数入口
*/
(function attachLegacyTransitionBridge(window) {
    const DEFAULT_TARGET_URL = 'home.html';

    /**
     * getDepthManager() - 安全读取当前页面已经挂载的 DepthManager 实例
     * @returns {Object|null} - 可用的深度导航管理器；没有则返回 null
     */
    function getDepthManager() {
        return window.DepthManager && typeof window.DepthManager.navigateTo === 'function'
            ? window.DepthManager
            : null;
    }

    /**
     * navigateWithDepthManager(targetUrl) - 优先复用 DepthManager 执行站内跳转
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
     * LegacyDepthGaugeTransitionCompat - 旧类名兼容外壳，仅保留转发能力
     */
    class LegacyDepthGaugeTransitionCompat {
        /**
         * constructor() - 初始化兼容壳的简单状态位
         */
        constructor() {
            this.isTransitioning = false;
        }

        /**
         * startTransition(targetUrl) - 兼容旧调用方式，统一交给 DepthManager
         * @param {string} targetUrl - 目标页面地址；省略时默认回首页
         * @returns {void} - 无返回值，直接触发统一过渡
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
     * transitionToPage(pageUrl) - 旧版页面过渡入口，现统一交给 DepthManager
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

    // 继续向 window 暴露旧名称，这样历史模板和旧 onclick 不需要一起重写。
    window.DepthGaugeTransition = LegacyDepthGaugeTransitionCompat;
    window.transitionToPage = transitionToPage;
    window.triggerDepthGaugeTransition = triggerDepthGaugeTransition;
}(window));
