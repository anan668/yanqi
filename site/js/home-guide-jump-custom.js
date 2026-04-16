(function () {
    var strategyRoot = window.YanqiHomeGuideJumpStrategies || (window.YanqiHomeGuideJumpStrategies = {});
    var activeSession = null;

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

    function normalizeMood(mood) {
        var normalized = String(mood || '').trim();
        return normalized || 'buoyant';
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

    function safeCall(fn) {
        if (typeof fn !== 'function') {
            return undefined;
        }

        try {
            return fn.apply(null, Array.prototype.slice.call(arguments, 1));
        } catch (error) {
            return undefined;
        }
    }

    function requestFrame(callback) {
        if (typeof window.requestAnimationFrame === 'function') {
            return window.requestAnimationFrame(callback);
        }

        return window.setTimeout(function () {
            callback(Date.now());
        }, 16);
    }

    function cancelFrame(frameId) {
        if (!frameId) {
            return;
        }

        if (typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(frameId);
            return;
        }

        window.clearTimeout(frameId);
    }

    function clearTravelVisualState(body) {
        if (!body) {
            return;
        }

        body.classList.remove('home-guide-custom-travel-active');
        body.style.removeProperty('--home-guide-travel-offset');
        body.style.removeProperty('--home-guide-travel-progress');
        body.style.removeProperty('--home-guide-travel-direction');
    }

    function clearTravelAnimatedElementStyles(session) {
        if (!session) {
            return;
        }

        if (session.pageStage) {
            session.pageStage.style.removeProperty('transform');
            session.pageStage.style.removeProperty('opacity');
        }

        if (session.navbar) {
            session.navbar.style.removeProperty('transform');
            session.navbar.style.removeProperty('opacity');
        }
    }

    function buildTravelTransformKeyframes(offset, easing, distanceScale) {
        var sampleCount = 9;
        var scale = Number.isFinite(distanceScale) ? distanceScale : 1;
        var keyframes = [];

        for (var index = 0; index <= sampleCount; index += 1) {
            var rawProgress = index / sampleCount;
            var easedProgress = clamp(
                toFiniteNumber(easing(rawProgress), rawProgress),
                0,
                1
            );
            var currentOffset = offset * scale * (1 - easedProgress);
            keyframes.push({
                offset: rawProgress,
                transform: 'translate3d(0, ' + currentOffset.toFixed(2) + 'px, 0)'
            });
        }

        return keyframes;
    }

    function startVisualTravelAnimations(session, easing, duration) {
        if (
            !session
            || !Number.isFinite(duration)
            || duration <= 0
            || typeof Element === 'undefined'
            || !Element.prototype
            || typeof Element.prototype.animate !== 'function'
        ) {
            return false;
        }

        var animations = [];

        if (session.pageStage) {
            animations.push(
                session.pageStage.animate(
                    buildTravelTransformKeyframes(session.travelOffset, easing, 1),
                    {
                        duration: duration,
                        easing: 'linear',
                        fill: 'both'
                    }
                )
            );
        }

        if (session.navbar) {
            animations.push(
                session.navbar.animate(
                    buildTravelTransformKeyframes(session.travelOffset, easing, 0.12),
                    {
                        duration: duration,
                        easing: 'linear',
                        fill: 'both'
                    }
                )
            );
        }

        session.visualAnimations = animations.filter(Boolean);
        return session.visualAnimations.length > 0;
    }

    function applyTravelVisualProgress(session, easedProgress) {
        if (!session) {
            return;
        }

        var progress = clamp(toFiniteNumber(easedProgress, 0), 0, 1);
        var stageOffset = session.travelOffset * (1 - progress);
        var navbarOffset = stageOffset * 0.12;

        if (session.pageStage) {
            session.pageStage.style.transform = 'translate3d(0, ' + stageOffset.toFixed(2) + 'px, 0)';
        }

        if (session.navbar) {
            session.navbar.style.transform = 'translate3d(0, ' + navbarOffset.toFixed(2) + 'px, 0)';
        }
    }

    function resolveMoodConfig(options) {
        var mood = normalizeMood(options.mood);
        var resolver = options.resolveScrollMood;
        var resolved = safeCall(resolver, { mood: mood }) || {};
        var easing = typeof resolved.easing === 'function'
            ? resolved.easing
            : function (value) {
                var t = clamp(toFiniteNumber(value, 0), 0, 1);
                return 1 - Math.pow(1 - t, 4);
            };

        return {
            name: String(resolved.name || mood).trim() || mood,
            durationScale: clamp(toFiniteNumber(resolved.durationScale, 1), 0.72, 1.6),
            easing: easing
        };
    }

    function cleanupSession(session, reason, options) {
        if (!session) {
            return;
        }

        var cleanupOptions = options || {};
        var flush = cleanupOptions.flush !== false;
        var shouldRestoreTarget = reason !== 'replace';
        var body = session.body;
        var depthManager = window.DepthManager;

        if (session.scrollStartFrameId) {
            cancelFrame(session.scrollStartFrameId);
            session.scrollStartFrameId = 0;
        }

        if (session.frameId) {
            cancelFrame(session.frameId);
            session.frameId = 0;
        }

        if (session.timeoutId) {
            window.clearTimeout(session.timeoutId);
            session.timeoutId = 0;
        }

        if (Array.isArray(session.visualAnimations) && session.visualAnimations.length) {
            session.visualAnimations.forEach(function (animation) {
                if (!animation || typeof animation.cancel !== 'function') {
                    return;
                }

                try {
                    animation.cancel();
                } catch (error) {
                    // 浏览器在动画已结束时可能抛错，忽略即可。
                }
            });
            session.visualAnimations = [];
        }

        if (session.handleUserInterrupt) {
            window.removeEventListener('wheel', session.handleUserInterrupt, session.listenerOptions);
            window.removeEventListener('touchstart', session.handleUserInterrupt, session.listenerOptions);
            window.removeEventListener('pointerdown', session.handleUserInterrupt, session.listenerOptions);
        }

        if (session.handleKeydownInterrupt) {
            window.removeEventListener('keydown', session.handleKeydownInterrupt, false);
        }

        if (shouldRestoreTarget) {
            window.scrollTo(0, session.top);
        }

        if (session.virtualTravelStarted && depthManager) {
            if (reason === 'replace' && typeof depthManager.cancelHomeGuideVirtualTravel === 'function') {
                safeCall(depthManager.cancelHomeGuideVirtualTravel.bind(depthManager));
            } else if (typeof depthManager.finishHomeGuideVirtualTravel === 'function') {
                safeCall(depthManager.finishHomeGuideVirtualTravel.bind(depthManager), session.guideTargetDepth);
            }
        }

        clearTravelVisualState(body);
        clearTravelAnimatedElementStyles(session);

        if (session.viewportSuspended) {
            session.viewportSuspended = false;
            safeCall(session.resumeHomeViewportCoordinator, {
                flush: flush,
                deferMeasureMs: flush ? session.resumeMeasureDelayMs : 0
            });
        }

        if (activeSession === session) {
            activeSession = null;
        }
    }

    function run(context) {
        var options = context || {};
        var top = Math.max(0, toFiniteNumber(options.top, 0));
        var currentScrollY = Math.max(0, toFiniteNumber(options.currentScrollY, getScrollY()));
        var travelDistance = Math.abs(toFiniteNumber(options.travelDistance, Math.abs(top - currentScrollY)));
        var adaptiveDuration = toFiniteNumber(options.adaptiveDuration, 1320);
        var proximityThreshold = Math.max(0, toFiniteNumber(options.proximityThreshold, 12));
        var guideTargetDepth = options.guideTargetDepth !== null && options.guideTargetDepth !== undefined
            && Number.isFinite(Number(options.guideTargetDepth))
            ? Number(options.guideTargetDepth)
            : null;
        var body = document.body;
        var pageStage = document.getElementById('pageStage');
        var navbar = document.querySelector('body > .navbar') || document.querySelector('.navbar');
        var moodConfig = resolveMoodConfig(options);
        var duration = clamp(
            adaptiveDuration * moodConfig.durationScale,
            420,
            3200
        );

        if (!body || !pageStage || travelDistance <= proximityThreshold) {
            window.scrollTo(0, top);
            return Promise.resolve();
        }

        if (activeSession && typeof activeSession.cancel === 'function') {
            activeSession.cancel('replace');
        }

        return new Promise(function (resolve) {
            var listenerOptions = { passive: true };
            var depthManager = window.DepthManager;
            var session = {
                body: body,
                top: top,
                pageStage: pageStage,
                navbar: navbar,
                listenerOptions: listenerOptions,
                guideTargetDepth: guideTargetDepth,
                viewportSuspended: false,
                virtualTravelStarted: false,
                resumeHomeViewportCoordinator: options.resumeHomeViewportCoordinator,
                resumeMeasureDelayMs: 96,
                travelOffset: top - currentScrollY,
                scrollCommitGraceMs: clamp(Math.round(duration * 0.14), 96, 180),
                scrollCommitSettled: false,
                scrollCommitSettledAt: -1,
                managedTickMinIntervalMs: 24,
                lastManagedTickAt: 0,
                visualAnimations: [],
                useBrowserAnimations: false,
                resolved: false,
                scrollStartFrameId: 0,
                frameId: 0,
                timeoutId: 0,
                cancel: null,
                handleUserInterrupt: null,
                handleKeydownInterrupt: null
            };
            var startDepth = depthManager && Number.isFinite(depthManager.currentDepth)
                ? depthManager.currentDepth
                : guideTargetDepth;

            activeSession = session;

            function settle(reason, settleOptions) {
                if (session.resolved) {
                    return;
                }

                session.resolved = true;
                cleanupSession(session, reason, settleOptions);
                resolve();
            }

            session.cancel = function (reason) {
                settle(reason || 'interrupt', {
                    flush: reason !== 'replace'
                });
            };

            session.handleUserInterrupt = function () {
                settle('interrupt', { flush: true });
            };

            session.handleKeydownInterrupt = function (event) {
                if (!isInterruptKey(event)) {
                    return;
                }

                settle('interrupt', { flush: true });
            };

            safeCall(options.setHomeScrollTraveling, true);
            safeCall(options.beginHomeInteractionLock, duration + 220);
            safeCall(options.beginManagedScroll, duration + 260);
            safeCall(options.suspendHomeViewportCoordinator);
            session.viewportSuspended = true;

            if (
                depthManager
                && guideTargetDepth !== null
                && typeof depthManager.beginHomeGuideVirtualTravel === 'function'
            ) {
                safeCall(depthManager.beginHomeGuideVirtualTravel.bind(depthManager), {
                    startDepth: startDepth,
                    targetDepth: guideTargetDepth,
                    duration: duration,
                    easing: moodConfig.easing
                });
                session.virtualTravelStarted = true;
            }

            window.addEventListener('wheel', session.handleUserInterrupt, listenerOptions);
            window.addEventListener('touchstart', session.handleUserInterrupt, listenerOptions);
            window.addEventListener('pointerdown', session.handleUserInterrupt, listenerOptions);
            window.addEventListener('keydown', session.handleKeydownInterrupt, false);

            session.scrollStartFrameId = requestFrame(function () {
                if (session.resolved) {
                    return;
                }

                body.classList.add('home-guide-custom-travel-active');

                window.scrollTo(0, top);
                session.useBrowserAnimations = startVisualTravelAnimations(session, moodConfig.easing, duration);
                if (!session.useBrowserAnimations) {
                    applyTravelVisualProgress(session, 0);
                }

                var startedAt = performance.now();
                session.frameId = requestFrame(function step(timestamp) {
                    if (session.resolved) {
                        return;
                    }

                    var elapsed = timestamp - startedAt;
                    var progress = clamp(elapsed / duration, 0, 1);
                    var eased = clamp(toFiniteNumber(moodConfig.easing(progress), progress), 0, 1);
                    var currentScrollDelta = Math.abs(getScrollY() - top);
                    var interruptThreshold = Math.max(proximityThreshold, 24);
                    var shouldThrottleManagedTick = session.useBrowserAnimations
                        && progress < 1
                        && elapsed > Math.max(96, session.scrollCommitGraceMs)
                        && session.lastManagedTickAt > 0
                        && timestamp - session.lastManagedTickAt < session.managedTickMinIntervalMs;

                    if (shouldThrottleManagedTick) {
                        session.frameId = requestFrame(step);
                        return;
                    }

                    session.lastManagedTickAt = timestamp;

                    if (!session.useBrowserAnimations) {
                        applyTravelVisualProgress(session, eased);
                    }

                    if (session.virtualTravelStarted && depthManager && typeof depthManager.updateHomeGuideVirtualTravel === 'function') {
                        safeCall(depthManager.updateHomeGuideVirtualTravel.bind(depthManager), progress);
                    }

                    if (!session.scrollCommitSettled && currentScrollDelta <= interruptThreshold) {
                        session.scrollCommitSettled = true;
                        session.scrollCommitSettledAt = elapsed;
                    }

                    if (
                        session.scrollCommitSettled
                        && elapsed > session.scrollCommitGraceMs
                        && session.scrollCommitSettledAt >= 0
                        && elapsed - session.scrollCommitSettledAt >= 48
                        && currentScrollDelta > interruptThreshold
                    ) {
                        settle('interrupt', { flush: true });
                        return;
                    }

                    if (progress < 1) {
                        session.frameId = requestFrame(step);
                        return;
                    }

                    settle('finish', { flush: true });
                });
            });

            session.timeoutId = window.setTimeout(function () {
                settle('timeout', { flush: true });
            }, Math.max(0, Math.round(duration + 1400)));
        });
    }

    strategyRoot.custom = {
        run: run
    };
})();
