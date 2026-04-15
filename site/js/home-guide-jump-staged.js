(function () {
    var strategyRoot = window.YanqiHomeGuideJumpStrategies || (window.YanqiHomeGuideJumpStrategies = {});

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function toFiniteNumber(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function normalizeMood(mood) {
        if (mood && typeof mood === 'object' && !Array.isArray(mood)) {
            return {
                name: String(mood.name || '').trim() || 'buoyant',
                durationScale: clamp(toFiniteNumber(mood.durationScale, 1), 0.72, 1.6)
            };
        }

        return {
            name: String(mood || '').trim() || 'buoyant',
            durationScale: 1
        };
    }

    function resolveSegmentCount(travelDistance, viewportHeight) {
        var baseHeight = Math.max(1, toFiniteNumber(viewportHeight, window.innerHeight || 1));
        var rawCount = Math.ceil(Math.abs(toFiniteNumber(travelDistance, 0)) / (1.15 * baseHeight));
        return clamp(rawCount, 2, 3);
    }

    function buildWaypoints(startY, top, segmentCount) {
        var waypoints = [];
        for (var index = 1; index <= segmentCount; index += 1) {
            var progress = index / segmentCount;
            waypoints.push(startY + ((top - startY) * progress));
        }

        if (waypoints.length) {
            waypoints[waypoints.length - 1] = top;
        }

        return waypoints;
    }

    function resolveDurationScale(mood) {
        if (mood && typeof mood === 'object' && Number.isFinite(Number(mood.durationScale))) {
            return clamp(Number(mood.durationScale), 0.72, 1.6);
        }

        switch (mood.name) {
            case 'surface':
                return 0.86;
            case 'midwater':
                return 1.02;
            case 'deep':
                return 1.1;
            case 'trench':
                return 1.18;
            case 'buoyant':
            default:
                return 1;
        }
    }

    function buildSegmentDurations(adaptiveDuration, segmentCount, moodScale) {
        var totalBudget = clamp(toFiniteNumber(adaptiveDuration, 1320), 420, 3200) * 1.02;
        var requestedBudget = totalBudget / Math.max(0.72, moodScale);
        var weights = [];
        var weightSum = 0;

        for (var index = 0; index < segmentCount; index += 1) {
            var weight = 1 + (index / Math.max(1, segmentCount - 1)) * 0.22;
            weights.push(weight);
            weightSum += weight;
        }

        var durations = [];
        var used = 0;
        var roundedBudget = Math.max(segmentCount, Math.floor(requestedBudget));

        for (var i = 0; i < segmentCount; i += 1) {
            if (i === segmentCount - 1) {
                durations.push(Math.max(1, roundedBudget - used));
                break;
            }

            var duration = Math.max(1, Math.round(roundedBudget * (weights[i] / weightSum)));
            durations.push(duration);
            used += duration;
        }

        return durations;
    }

    function isPromiseLike(value) {
        return Boolean(value) && typeof value.then === 'function';
    }

    function getCurrentScrollY() {
        return window.scrollY || window.pageYOffset || 0;
    }

    async function run(context) {
        var options = context || {};
        var top = Math.max(0, toFiniteNumber(options.top, 0));
        var currentScrollY = Math.max(0, toFiniteNumber(options.currentScrollY, getCurrentScrollY()));
        var travelDistance = Math.abs(toFiniteNumber(options.travelDistance, Math.abs(top - currentScrollY)));
        var adaptiveDuration = toFiniteNumber(options.adaptiveDuration, 1320);
        var viewportHeight = toFiniteNumber(options.viewportHeight, window.innerHeight || 1);
        var proximityThreshold = Math.max(0, toFiniteNumber(options.proximityThreshold, 12));
        var animateTo = options.animateTo;
        var moodInput = options.mood;
        var mood = normalizeMood(moodInput);
        var segmentCount = resolveSegmentCount(travelDistance, viewportHeight);
        var waypoints = buildWaypoints(currentScrollY, top, segmentCount);
        var segmentDurations = buildSegmentDurations(adaptiveDuration, segmentCount, resolveDurationScale(mood));
        var interruptionThreshold = Math.max(proximityThreshold * 2, 24);
        var interrupted = false;

        if (typeof animateTo !== 'function') {
            window.scrollTo(0, top);
            return;
        }

        for (var index = 0; index < waypoints.length; index += 1) {
            var targetY = index === waypoints.length - 1 ? top : waypoints[index];
            var segmentDuration = segmentDurations[index];
            var result = animateTo(targetY, {
                duration: segmentDuration,
                mood: moodInput || mood.name
            });

            if (isPromiseLike(result)) {
                await result;
            }

            var settledY = getCurrentScrollY();
            if (Math.abs(settledY - targetY) > interruptionThreshold) {
                interrupted = true;
                break;
            }
        }

        if (!interrupted) {
            window.scrollTo(0, top);
        }
    }

    strategyRoot.staged = {
        run: run
    };
})();
