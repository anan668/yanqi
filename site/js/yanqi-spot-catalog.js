(function attachYanqiSpotCatalog(global) {
    const spotCatalogItems = Object.freeze([
        { id: 1, key: 'sipadan', name: '诗巴丹', englishName: 'Sipadan', tagline: '让海狼风暴把呼吸拉长', image: 'assets/images/sipadan.jpg', season: '3月-10月' },
        { id: 2, key: 'palau', name: '帕劳', englishName: 'Palau', tagline: '在光与断层之间把节奏拉长', image: 'assets/images/palau.jpg', season: '11月-次年5月' },
        { id: 3, key: 'blue-hole', name: '大蓝洞', englishName: 'Great Blue Hole', tagline: '把敬畏留在逐渐下压的深蓝', image: 'assets/images/blue-hole.jpg', season: '4月-6月' },
        { id: 4, key: 'timor', name: '帝汶岛', englishName: 'Timor', tagline: '在珊瑚花园与缓流里慢慢停车', image: 'assets/images/timor.jpg', season: '4月-11月' },
        { id: 5, key: 'pohnpei', name: '波纳佩岛', englishName: 'Pohnpei', tagline: '让微距生命把节奏放轻', image: 'assets/images/pohnpei.jpg', season: '全年适宜' },
        { id: 6, key: 'bunaken', name: '布纳肯', englishName: 'Bunaken', tagline: '在海墙与海龟之间整理呼吸', image: 'assets/images/bunaken.jpg', season: '3月-11月' },
        { id: 7, key: 'komodo', name: '科莫多', englishName: 'Komodo', tagline: '用巨龙与大鱼的流线保持平衡', image: 'assets/images/komodo.jpg', season: '4月-11月' },
        { id: 8, key: 'tuamotu', name: '图阿莫图', englishName: 'Tuamotu', tagline: '在环礁静水里让晨光缓走', image: 'assets/images/tuamotu.jpg', season: '5月-10月' },
        { id: 9, key: 'mabul', name: '马布岛', englishName: 'Mabul', tagline: '把码头与玻璃海之间的呼吸留白', image: 'assets/images/mabul.jpg', season: '3月-10月' },
        { id: 10, key: 'maldives-liveaboard', name: '马尔代夫船宿', englishName: 'Maldives Liveaboard', tagline: '把几片蓝连在同一段船宿的呼吸里', image: 'assets/images/maldives-liveaboard.jpg', season: '11月-次年4月' },
        { id: 11, key: 'coron', name: '科隆', englishName: 'Coron', tagline: '把黑石、浅湾与沉船线索慢慢排进同一片蓝', image: 'assets/images/coron-review-1-island-chain.jpg', season: '11月-次年5月' },
        { id: 12, key: 'bohol', name: '薄荷岛', englishName: 'Bohol', tagline: '把白沙岸线和轻船潜排进更轻一点的假期', image: 'assets/images/bohol.jpg', season: '11月-次年6月' },
        { id: 13, key: 'racha', name: '皇帝岛', englishName: 'Racha Island', tagline: '让玻璃蓝和缓坡珊瑚把呼吸慢慢放平', image: 'assets/images/racha.jpg', season: '11月-次年4月' },
        { id: 14, key: 'redang', name: '热浪岛', englishName: 'Redang Island', tagline: '在清透礁坡与海岛风里把节奏慢慢放轻', image: 'assets/images/redang.jpg', season: '3月-10月' }
    ]);

    const spotById = new Map();
    const spotByKey = new Map();

    spotCatalogItems.forEach((item) => {
        const frozenItem = Object.freeze({ ...item });
        spotById.set(frozenItem.id, frozenItem);
        spotByKey.set(frozenItem.key, frozenItem);
    });

    function getById(id) {
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) {
            return null;
        }
        return spotById.get(numericId) || null;
    }

    function getByKey(key) {
        const normalizedKey = String(key || '').trim().toLowerCase();
        if (!normalizedKey) {
            return null;
        }
        return spotByKey.get(normalizedKey) || null;
    }

    global.YanqiSpotCatalog = Object.freeze({
        version: '2026-04-11',
        list: spotCatalogItems,
        getById,
        getByKey
    });
})(window);
