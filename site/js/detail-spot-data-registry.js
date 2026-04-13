(function attachYanqiDetailSpotDataRegistry(global) {
    const rawSpotDataById = new Map();

    function normalizeSpotId(id) {
        const numericId = Number(id);
        return Number.isFinite(numericId) ? numericId : null;
    }

    function register(id, payload) {
        const spotId = normalizeSpotId(id);
        if (!spotId || !payload || typeof payload !== 'object') {
            return null;
        }

        rawSpotDataById.set(spotId, payload);
        return payload;
    }

    function getById(id) {
        const spotId = normalizeSpotId(id);
        if (!spotId) {
            return null;
        }

        return rawSpotDataById.get(spotId) || null;
    }

    function has(id) {
        const spotId = normalizeSpotId(id);
        return Boolean(spotId && rawSpotDataById.has(spotId));
    }

    function getLoadedIds() {
        return Array.from(rawSpotDataById.keys()).sort((left, right) => left - right);
    }

    global.YanqiDetailSpotDataRegistry = Object.freeze({
        version: '2026-04-12',
        register,
        getById,
        has,
        getLoadedIds
    });
})(window);
