(function () {
    var strategyRoot = window.YanqiHomeGuideJumpStrategies || (window.YanqiHomeGuideJumpStrategies = {});

    function toFiniteNumber(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function getScrollY() {
        return window.scrollY || window.pageYOffset || 0;
    }

    function isInterruptKey(event) {
        if (!event) {
            return false;
        }

        return event.key === 'ArrowUp'
            || event.key === 'ArrowDown'
            || event.key === 'PageUp'
            || event.key === 'PageDown'
            || event.key === 'Home'
            || event.key === 'End'
            || event.key === ' '
            || event.key === 'Spacebar';
    }

    function run(context) {
        var options = context || {};
        var top = Math.max(0, toFiniteNumber(options.top, 0));
        var travelDistance = Math.abs(toFiniteNumber(options.travelDistance, Math.abs(top - getScrollY())));
        var adaptiveDuration = Math.max(0, toFiniteNumber(options.adaptiveDuration, 1320));
        var proximityThreshold = Math.max(0, toFiniteNumber(options.proximityThreshold, 12));
        var beginManagedScroll = options.beginManagedScroll;
        var finishManagedScroll = options.finishManagedScroll;
        var requestFrame = typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame.bind(window)
            : function (callback) {
                return window.setTimeout(function () {
                    callback(Date.now());
                }, 16);
            };
        var cancelFrame = typeof window.cancelAnimationFrame === 'function'
            ? window.cancelAnimationFrame.bind(window)
            : window.clearTimeout.bind(window);
        var resolved = false;
        var frameId = 0;
        var timeoutId = 0;
        var managedScrollStarted = false;
        var listenerOptions = { passive: true };
        var handleScrollEnd = null;
        var handleUserInterrupt = null;
        var handleKeydownInterrupt = null;
        var deadline = performance.now() + clamp(
            adaptiveDuration + Math.round(travelDistance * 0.45) + 900,
            2200,
            7000
        );

        function safeCall(fn) {
            if (typeof fn !== 'function') {
                return;
            }

            try {
                fn();
            } catch (error) {
                // Swallow cleanup errors so the promise can still finish safely.
            }
        }

        function cleanup() {
            if (handleScrollEnd) {
                window.removeEventListener('scrollend', handleScrollEnd, false);
            }

            if (handleUserInterrupt) {
                window.removeEventListener('wheel', handleUserInterrupt, listenerOptions);
                window.removeEventListener('touchstart', handleUserInterrupt, listenerOptions);
                window.removeEventListener('pointerdown', handleUserInterrupt, listenerOptions);
            }

            if (handleKeydownInterrupt) {
                window.removeEventListener('keydown', handleKeydownInterrupt, false);
            }

            if (frameId) {
                cancelFrame(frameId);
                frameId = 0;
            }

            if (timeoutId) {
                window.clearTimeout(timeoutId);
                timeoutId = 0;
            }

            if (managedScrollStarted) {
                managedScrollStarted = false;
                safeCall(finishManagedScroll);
            }
        }

        function settle(resolve) {
            if (resolved) {
                return;
            }

            resolved = true;
            cleanup();
            resolve();
        }

        function isSettledAtTarget() {
            return Math.abs(getScrollY() - top) <= proximityThreshold;
        }

        function poll(resolve) {
            if (resolved) {
                return;
            }

            if (isSettledAtTarget() || performance.now() >= deadline) {
                settle(resolve);
                return;
            }

            frameId = requestFrame(function () {
                poll(resolve);
            });
        }

        function onScrollEnd(resolve) {
            settle(resolve);
        }

        function onUserInterrupt(resolve) {
            settle(resolve);
        }

        function onKeydownInterrupt(event, resolve) {
            if (!isInterruptKey(event)) {
                return;
            }

            settle(resolve);
        }

        function startSmoothScroll() {
            try {
                window.scrollTo({
                    top: top,
                    behavior: 'smooth'
                });
            } catch (error) {
                window.scrollTo(0, top);
            }
        }

        return new Promise(function (resolve) {
            handleScrollEnd = function () {
                onScrollEnd(resolve);
            };

            handleUserInterrupt = function () {
                onUserInterrupt(resolve);
            };

            handleKeydownInterrupt = function (event) {
                onKeydownInterrupt(event, resolve);
            };

            if (typeof beginManagedScroll === 'function') {
                try {
                    beginManagedScroll(adaptiveDuration + 220);
                    managedScrollStarted = true;
                } catch (error) {
                    // Ignore begin errors and continue with native scrolling.
                }
            }

            window.addEventListener('scrollend', handleScrollEnd, false);
            window.addEventListener('wheel', handleUserInterrupt, listenerOptions);
            window.addEventListener('touchstart', handleUserInterrupt, listenerOptions);
            window.addEventListener('pointerdown', handleUserInterrupt, listenerOptions);
            window.addEventListener('keydown', handleKeydownInterrupt, false);

            startSmoothScroll();

            frameId = requestFrame(function () {
                poll(resolve);
            });

            timeoutId = window.setTimeout(function () {
                settle(resolve);
            }, Math.max(0, deadline - performance.now()));
        });
    }

    strategyRoot.native = {
        run: run
    };
})();
