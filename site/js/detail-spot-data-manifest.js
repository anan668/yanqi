(function attachYanqiDetailSpotDataManifest(global) {
    const entries = Object.freeze([
        Object.freeze({ id: 1, key: 'sipadan', src: 'js/detail-spot-data/sipadan.js' }),
        Object.freeze({ id: 2, key: 'palau', src: 'js/detail-spot-data/palau.js' }),
        Object.freeze({ id: 3, key: 'blue-hole', src: 'js/detail-spot-data/blue-hole.js' }),
        Object.freeze({ id: 4, key: 'timor', src: 'js/detail-spot-data/timor.js' }),
        Object.freeze({ id: 5, key: 'pohnpei', src: 'js/detail-spot-data/pohnpei.js' }),
        Object.freeze({ id: 6, key: 'bunaken', src: 'js/detail-spot-data/bunaken.js' }),
        Object.freeze({ id: 7, key: 'komodo', src: 'js/detail-spot-data/komodo.js' }),
        Object.freeze({ id: 8, key: 'tuamotu', src: 'js/detail-spot-data/tuamotu.js' }),
        Object.freeze({ id: 9, key: 'mabul', src: 'js/detail-spot-data/mabul.js' }),
        Object.freeze({ id: 10, key: 'maldives-liveaboard', src: 'js/detail-spot-data/maldives-liveaboard.js' }),
        Object.freeze({ id: 11, key: 'coron', src: 'js/detail-spot-data/coron.js' }),
        Object.freeze({ id: 12, key: 'bohol', src: 'js/detail-spot-data/bohol.js' }),
        Object.freeze({ id: 13, key: 'racha', src: 'js/detail-spot-data/racha.js' }),
        Object.freeze({ id: 14, key: 'redang', src: 'js/detail-spot-data/redang.js' })
    ]);

    const entryById = new Map(entries.map((entry) => [entry.id, entry]));

    function getById(id) {
        const spotId = Number(id);
        if (!Number.isFinite(spotId)) {
            return null;
        }

        return entryById.get(spotId) || null;
    }

    global.YanqiDetailSpotDataManifest = Object.freeze({
        version: '2026-04-12',
        list: entries,
        getById
    });
})(window);
