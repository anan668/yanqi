(function () {
    var strategyRoot = window.YanqiHomeGuideJumpStrategies || (window.YanqiHomeGuideJumpStrategies = {});

    function toFiniteNumber(value, fallback) {
        var number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function normalizeMood(mood) {
        var normalized = String(mood || '').trim();
        return normalized || 'buoyant';
    }

    function run(context) {
        var options = context || {};
        var top = Math.max(0, toFiniteNumber(options.top, 0));
        var adaptiveDuration = toFiniteNumber(options.adaptiveDuration, 1320);
        var mood = normalizeMood(options.mood);
        var animateTo = options.animateTo;

        if (typeof animateTo !== 'function') {
            window.scrollTo(0, top);
            return Promise.resolve();
        }

        return Promise.resolve(
            animateTo(top, {
                duration: adaptiveDuration,
                mood: mood
            })
        );
    }

    strategyRoot.custom = {
        run: run
    };
})();
