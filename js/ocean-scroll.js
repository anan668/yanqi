/* ============================================
   Ocean Scroll Utilities - ocean-scroll.js
   ============================================
   ?????
   1. ?????????????????????
   2. ?????????????????????????????
   3. ???????? -> animateTo -> toSelector -> ??????????
*/

(function () {
    let activeScrollAnimation = null;

    /**
     * clamp(value, min, max) - 将数值限制在指定区间内
     * @param {number} value - 需要约束的原始数值
     * @param {number} min - 区间最小值
     * @param {number} max - 区间最大值
     * @returns {number} - 落在区间内的结果
     */
    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * easeBuoyant(value) - 计算带一点“浮游感”的缓动进度
     * @param {number} value - 0 到 1 之间的原始进度
     * @returns {number} - 处理后的缓动进度
     */
    function easeBuoyant(value) {
        const t = clamp(value, 0, 1);
        return 1 - Math.pow(1 - t, 4);
    }

    /**
     * isScrollInterruptKey(event) - 判断当前按键是否属于用户主动打断滚动的输入
     * @param {KeyboardEvent} event - 键盘事件对象
     * @returns {boolean} - 是否应终止当前滚动动画
     */
    function isScrollInterruptKey(event) {
        const interruptKeys = new Set([
            'ArrowUp',
            'ArrowDown',
            'PageUp',
            'PageDown',
            'Home',
            'End',
            ' ',
            'Spacebar'
        ]);

        return interruptKeys.has(event.key);
    }

    /**
     * teardownAnimation(animation, shouldResolve) - 解除当前滚动动画绑定的帧和事件监听
     * @param {Object|null} animation - 当前动画状态对象
     * @param {boolean} shouldResolve - 是否在清理后结束 Promise
     * @returns {void} - 无返回值，直接清理动画副作用
     */
    function teardownAnimation(animation, shouldResolve) {
        if (!animation) {
            return;
        }

        if (animation.frameId) {
            cancelAnimationFrame(animation.frameId);
        }

        if (Array.isArray(animation.cleanupHandlers)) {
            animation.cleanupHandlers.forEach((cleanup) => cleanup());
        }

        if (activeScrollAnimation === animation) {
            activeScrollAnimation = null;
        }

        if (shouldResolve && typeof animation.resolve === 'function') {
            animation.resolve();
        }
    }

    /**
     * cancelActiveAnimation() - 主动终止当前正在执行的滚动动画
     * @returns {void} - 无返回值，直接取消当前滚动
     */
    function cancelActiveAnimation() {
        teardownAnimation(activeScrollAnimation, true);
    }

    /**
     * createInterruptHandlers(animation) - 给当前滚动动画挂载用户输入中断逻辑
     * @param {Object} animation - 当前滚动动画状态对象
     * @returns {void} - 无返回值，直接向 animation 注入清理函数
     */
    function createInterruptHandlers(animation) {
        const cleanupHandlers = [];

        function bind(target, type, handler, options) {
            target.addEventListener(type, handler, options);
            cleanupHandlers.push(() => target.removeEventListener(type, handler, options));
        }

        // 只要用户开始滚轮、触摸、点击滚动条或使用键盘滚动，
        // 就认为他要接管滚动，不再强制把页面“带到终点”。
        bind(window, 'wheel', () => cancelActiveAnimation(), { passive: true });
        bind(window, 'touchstart', () => cancelActiveAnimation(), { passive: true });
        bind(window, 'pointerdown', () => cancelActiveAnimation(), { passive: true });
        bind(window, 'keydown', (event) => {
            if (!isScrollInterruptKey(event)) {
                return;
            }

            cancelActiveAnimation();
        });

        animation.cleanupHandlers = cleanupHandlers;
    }

    /**
     * animateTo(targetY, options) - 平滑滚动到指定纵向位置
     * @param {number} targetY - 目标 Y 轴坐标
     * @param {Object} options - 滚动配置参数
     * @returns {Promise<void>} - 滚动结束或被用户打断后完成的 Promise
     */
    function animateTo(targetY, options) {
        const settings = options || {};
        const startY = window.scrollY || window.pageYOffset || 0;
        const destination = Math.max(0, Number(targetY) || 0);
        const distance = destination - startY;
        const duration = clamp(Number(settings.duration) || 1600, 420, 3200);

        // 同一时间只允许一个平滑滚动动画存在；新的动画开始时，旧动画立即让位。
        cancelActiveAnimation();

        if (Math.abs(distance) < 1) {
            window.scrollTo(0, destination);
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const animation = {
                frameId: 0,
                resolve,
                cleanupHandlers: []
            };

            activeScrollAnimation = animation;
            createInterruptHandlers(animation);

            const startedAt = performance.now();

            /**
             * step(timestamp) - 按动画帧推进滚动位置，直到抵达目标或被用户打断
             * @param {number} timestamp - 当前帧时间戳
             * @returns {void} - 无返回值，直接更新页面滚动位置
             */
            function step(timestamp) {
                if (activeScrollAnimation !== animation) {
                    return;
                }

                const progress = clamp((timestamp - startedAt) / duration, 0, 1);
                const eased = easeBuoyant(progress);
                const nextY = startY + distance * eased;

                window.scrollTo(0, nextY);

                if (progress < 1) {
                    animation.frameId = requestAnimationFrame(step);
                    return;
                }

                window.scrollTo(0, destination);
                teardownAnimation(animation, true);
            }

            animation.frameId = requestAnimationFrame(step);
        });
    }

    /**
     * toSelector(selector, options) - 平滑滚动到指定选择器对应的元素位置
     * @param {string} selector - 目标元素的 CSS 选择器
     * @param {Object} options - 滚动配置参数
     * @returns {Promise<void>} - 滚动结束或被打断后完成的 Promise
     */
    function toSelector(selector, options) {
        if (!selector) {
            return Promise.resolve();
        }

        const target = document.querySelector(selector);
        if (!target) {
            return Promise.resolve();
        }

        const settings = options || {};
        const offset = Number(settings.offset) || 0;
        const targetY = target.getBoundingClientRect().top + window.scrollY - offset;
        return animateTo(targetY, settings);
    }

    window.OceanScroll = {
        animateTo,
        toSelector,
        cancelActiveAnimation
    };
})();
