/* ============================================
   旧版过渡兼容桥 - transition.js
   ============================================
   历史兼容层：
   1. 保留旧的全局入口，避免历史模板和旧 onclick 直接失效。
   2. 把旧入口统一转发给当前 `DepthManager`。
   3. 不承担新的过渡编排；新逻辑应直接接入 `DepthManager`。
   阅读顺序：
   1. `getDepthManager`
   2. `warnLegacyTransitionUsage`
   3. `navigateWithDepthManager`
   4. 兼容类与旧函数导出
*/
(function attachLegacyTransitionBridge(window) {
    const DEFAULT_TARGET_URL = 'home.html';
    let hasWarnedLegacyUsage = false;

    function getDepthManager() {
        return window.DepthManager && typeof window.DepthManager.navigateTo === 'function'
            ? window.DepthManager
            : null;
    }

    function warnLegacyTransitionUsage(entryPoint) {
        if (hasWarnedLegacyUsage || !window.console || typeof window.console.warn !== 'function') {
            return;
        }

        hasWarnedLegacyUsage = true;
        window.console.warn(
            '[transition.js] `%s` is a legacy compatibility entry. Prefer wiring new page transitions through DepthManager directly.',
            entryPoint
        );
    }

    function navigateWithDepthManager(targetUrl, entryPoint) {
        const nextUrl = typeof targetUrl === 'string' && targetUrl.trim()
            ? targetUrl.trim()
            : DEFAULT_TARGET_URL;
        const manager = getDepthManager();

        warnLegacyTransitionUsage(entryPoint || 'legacy-transition');

        if (manager) {
            manager.navigateTo(nextUrl);
            return;
        }

        window.location.href = nextUrl;
    }

    class LegacyDepthGaugeTransitionCompat {
        constructor() {
            this.isTransitioning = false;
        }

        startTransition(targetUrl = DEFAULT_TARGET_URL) {
            if (this.isTransitioning) {
                return;
            }

            this.isTransitioning = true;
            navigateWithDepthManager(targetUrl, 'DepthGaugeTransition.startTransition');
        }
    }

    function transitionToPage(pageUrl = DEFAULT_TARGET_URL) {
        navigateWithDepthManager(pageUrl, 'transitionToPage');
    }

    function triggerDepthGaugeTransition(pageUrl = DEFAULT_TARGET_URL) {
        navigateWithDepthManager(pageUrl, 'triggerDepthGaugeTransition');
    }

    window.DepthGaugeTransition = LegacyDepthGaugeTransitionCompat;
    window.transitionToPage = transitionToPage;
    window.triggerDepthGaugeTransition = triggerDepthGaugeTransition;
}(window));
