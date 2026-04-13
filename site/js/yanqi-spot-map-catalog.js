(function attachYanqiSpotMapCatalog(global) {
    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
            return value;
        }

        Object.freeze(value);
        Object.keys(value).forEach((key) => {
            deepFreeze(value[key]);
        });
        return value;
    }

    const SEA_ATLAS_PACK_TILE_SIZE = 1024;
    const SEA_ATLAS_PACK_ZOOM_OFFSET = -2;

    function buildOfflineTilePack(key) {
        return `assets/maps/packs/${key}.pack.js`;
    }

    function enrichMapRecord(item) {
        const zoom = Number(item?.zoom) || 9;
        const hasBounds = Array.isArray(item?.mapBounds) && item.mapBounds.length === 2;

        return {
            ...item,
            offlineTilePack: buildOfflineTilePack(item.key),
            offlineTilePackFormat: 'script',
            offlineMinZoom: Math.max(4, zoom - 4),
            offlineMaxZoom: Math.min(13, zoom + 2),
            offlineTileSize: SEA_ATLAS_PACK_TILE_SIZE,
            offlineZoomOffset: SEA_ATLAS_PACK_ZOOM_OFFSET,
            initialViewMode: hasBounds ? 'bounds' : 'center'
        };
    }

    const mapCatalogItems = [
        {
            id: 1,
            key: 'sipadan',
            name: '诗巴丹',
            mapCenter: [4.2408, 118.6219],
            spotCoords: [4.1149, 118.6288],
            portCoords: [4.4813, 118.6119],
            zoom: 10,
            mapBounds: [[4.0301, 118.5002], [4.5529, 118.7396]],
            routeLabel: '从仙本那码头出发，船行约 45-60 分钟',
            depthRange: '5-40m',
            seasonLabel: '3月-10月',
            regionTag: '沙巴 · 苏禄海',
            portLabel: '仙本那码头',
            spotLabel: 'Barracuda Point',
            routeCurve: {
                type: 'quadratic',
                control: [4.3382, 118.6954]
            }
        },
        {
            id: 2,
            key: 'palau',
            name: '帕劳',
            mapCenter: [7.2101, 134.3419],
            spotCoords: [7.2466, 134.2432],
            portCoords: [7.3428, 134.4783],
            zoom: 9,
            mapBounds: [[7.0122, 134.1712], [7.4331, 134.5516]],
            routeLabel: '从科罗尔码头向西南外海，船行约 50 分钟',
            depthRange: '8-35m',
            seasonLabel: '11月-次年5月',
            regionTag: '科罗尔外海 · 西太平洋',
            portLabel: '科罗尔码头',
            spotLabel: 'Blue Corner',
            routeCurve: {
                type: 'quadratic',
                control: [7.2996, 134.3498]
            }
        },
        {
            id: 3,
            key: 'blue-hole',
            name: '大蓝洞',
            mapCenter: [17.5563, -87.7884],
            spotCoords: [17.3156, -87.5346],
            portCoords: [17.9219, -87.9614],
            zoom: 8,
            mapBounds: [[17.2061, -88.0892], [18.0054, -87.4241]],
            routeLabel: '从圣佩德罗外海出发，船行约 2.5 小时',
            depthRange: '18-40m',
            seasonLabel: '4月-6月',
            regionTag: '伯利兹外海 · 灯塔礁',
            portLabel: '圣佩德罗码头',
            spotLabel: 'Great Blue Hole',
            routeCurve: {
                type: 'quadratic',
                control: [17.6248, -87.6737]
            }
        },
        {
            id: 4,
            key: 'timor',
            name: '帝汶岛',
            mapCenter: [-8.4022, 125.5831],
            spotCoords: [-8.2385, 125.5756],
            portCoords: [-8.5553, 125.5787],
            zoom: 9,
            mapBounds: [[-8.6642, 125.4592], [-8.1588, 125.7194]],
            routeLabel: '从帝力出海向阿陶罗方向，船行约 55 分钟',
            depthRange: '6-32m',
            seasonLabel: '4月-11月',
            regionTag: '帝力外海 · 阿陶罗水道',
            portLabel: '帝力码头',
            spotLabel: 'Atauro Reef',
            routeCurve: {
                type: 'quadratic',
                control: [-8.4075, 125.6634]
            }
        },
        {
            id: 5,
            key: 'pohnpei',
            name: '波纳佩岛',
            mapCenter: [6.9191, 158.2674],
            spotCoords: [6.8824, 158.3142],
            portCoords: [6.9591, 158.2068],
            zoom: 10,
            mapBounds: [[6.7864, 158.0738], [7.0235, 158.3865]],
            routeLabel: '从科洛尼亚码头出发，船行约 25 分钟',
            depthRange: '5-24m',
            seasonLabel: '全年适宜',
            regionTag: '密克罗尼西亚 · 波纳佩礁盘',
            portLabel: '科洛尼亚码头',
            spotLabel: 'Manta Road',
            routeCurve: {
                type: 'quadratic',
                control: [6.9048, 158.2683]
            }
        },
        {
            id: 6,
            key: 'bunaken',
            name: '布纳肯',
            mapCenter: [1.5606, 124.7913],
            spotCoords: [1.6211, 124.7531],
            portCoords: [1.4926, 124.8331],
            zoom: 10,
            mapBounds: [[1.4056, 124.6648], [1.6916, 124.9174]],
            routeLabel: '从马纳多港出发，船行约 35 分钟',
            depthRange: '6-30m',
            seasonLabel: '3月-11月',
            regionTag: '北苏拉威西 · 布纳肯海洋公园',
            portLabel: '马纳多港',
            spotLabel: 'Lekuan Wall',
            routeCurve: {
                type: 'quadratic',
                control: [1.5468, 124.7485]
            }
        },
        {
            id: 7,
            key: 'komodo',
            name: '科莫多',
            mapCenter: [-8.5664, 119.6738],
            spotCoords: [-8.5525, 119.5562],
            portCoords: [-8.4961, 119.8873],
            zoom: 9,
            mapBounds: [[-8.7598, 119.4414], [-8.4022, 119.9536]],
            routeLabel: '从拉布安巴焦港口出海，船行约 80 分钟',
            depthRange: '8-34m',
            seasonLabel: '4月-11月',
            regionTag: '弗洛勒斯海 · 科莫多国家公园',
            portLabel: '拉布安巴焦码头',
            spotLabel: 'Batu Bolong',
            routeCurve: {
                type: 'quadratic',
                control: [-8.5038, 119.6896]
            }
        },
        {
            id: 8,
            key: 'tuamotu',
            name: '图阿莫图',
            mapCenter: [-14.9739, -147.6373],
            spotCoords: [-14.9862, -147.6394],
            portCoords: [-14.9617, -147.6476],
            zoom: 11,
            mapBounds: [[-15.0348, -147.7132], [-14.9008, -147.5604]],
            routeLabel: '从阿瓦托鲁出海到通道口，船行约 20 分钟',
            depthRange: '10-32m',
            seasonLabel: '5月-10月',
            regionTag: '图阿莫图群岛 · 朗伊罗阿环礁',
            portLabel: '阿瓦托鲁码头',
            spotLabel: 'Tiputa Pass',
            routeCurve: {
                type: 'quadratic',
                control: [-14.9716, -147.6181]
            }
        },
        {
            id: 9,
            key: 'mabul',
            name: '马布岛',
            mapCenter: [4.3258, 118.6218],
            spotCoords: [4.2433, 118.6279],
            portCoords: [4.4813, 118.6119],
            zoom: 10,
            mapBounds: [[4.1582, 118.4949], [4.5529, 118.7349]],
            routeLabel: '从仙本那外海航向马布，船行约 35-45 分钟',
            depthRange: '3-18m',
            seasonLabel: '3月-10月',
            regionTag: '沙巴 · 西里伯斯海',
            portLabel: '仙本那码头',
            spotLabel: 'Mabul House Reef',
            routeCurve: {
                type: 'quadratic',
                control: [4.3467, 118.6762]
            }
        },
        {
            id: 10,
            key: 'maldives-liveaboard',
            name: '马尔代夫船宿',
            mapCenter: [4.1592, 73.1167],
            spotCoords: [3.9862, 72.7243],
            portCoords: [4.1764, 73.5108],
            zoom: 8,
            mapBounds: [[3.5458, 72.4188], [4.9112, 73.7564]],
            routeLabel: '从马累上船，沿北马累至阿里环礁航行约半日',
            depthRange: '8-30m',
            seasonLabel: '11月-次年4月',
            regionTag: '北马累环礁 → 阿里环礁',
            portLabel: '马累上船码头',
            spotLabel: 'Maaya Thila',
            routeCurve: {
                type: 'quadratic',
                control: [4.2491, 73.2287]
            },
            routePath: [
                [4.1764, 73.5108],
                [4.3448, 73.5297],
                [4.2613, 73.2046],
                [4.1138, 72.9437],
                [3.9862, 72.7243]
            ]
        },
        {
            id: 11,
            key: 'coron',
            name: '科隆',
            mapCenter: [11.9898, 120.1304],
            spotCoords: [11.9872, 120.0411],
            portCoords: [12.0016, 120.2051],
            zoom: 10,
            mapBounds: [[11.8797, 119.9838], [12.0839, 120.2835]],
            routeLabel: '从科隆镇码头驶入海湾，船行约 30 分钟',
            depthRange: '5-30m',
            seasonLabel: '11月-次年5月',
            regionTag: '巴拉望 · 科隆湾',
            portLabel: '科隆镇码头',
            spotLabel: 'Skeleton Wreck',
            routeCurve: {
                type: 'quadratic',
                control: [12.0151, 120.1268]
            }
        },
        {
            id: 12,
            key: 'bohol',
            name: '薄荷岛',
            mapCenter: [9.5316, 123.7215],
            spotCoords: [9.5141, 123.6836],
            portCoords: [9.5483, 123.7681],
            zoom: 11,
            mapBounds: [[9.4632, 123.6315], [9.6022, 123.8264]],
            routeLabel: '从邦劳海岸出发，船行约 20 分钟',
            depthRange: '5-25m',
            seasonLabel: '11月-次年6月',
            regionTag: '薄荷海 · 邦劳 / 巴里卡萨',
            portLabel: '邦劳出海点',
            spotLabel: 'Balicasag Wall',
            routeCurve: {
                type: 'quadratic',
                control: [9.5563, 123.7112]
            }
        },
        {
            id: 13,
            key: 'racha',
            name: '皇帝岛',
            mapCenter: [7.7029, 98.3524],
            spotCoords: [7.6076, 98.3719],
            portCoords: [7.8263, 98.3364],
            zoom: 10,
            mapBounds: [[7.5428, 98.2672], [7.8654, 98.4306]],
            routeLabel: '从查龙码头南下，船行约 35-45 分钟',
            depthRange: '5-28m',
            seasonLabel: '11月-次年4月',
            regionTag: '普吉南侧 · Racha Yai / Noi',
            portLabel: '查龙码头',
            spotLabel: 'Racha Yai Bay',
            routeCurve: {
                type: 'quadratic',
                control: [7.7152, 98.4143]
            }
        },
        {
            id: 14,
            key: 'redang',
            name: '热浪岛',
            mapCenter: [5.6992, 103.0014],
            spotCoords: [5.7796, 103.0221],
            portCoords: [5.5502, 102.9588],
            zoom: 10,
            mapBounds: [[5.5034, 102.8961], [5.8457, 103.1279]],
            routeLabel: '从墨浪码头出发，船行约 45 分钟',
            depthRange: '6-30m',
            seasonLabel: '3月-9月',
            regionTag: '登嘉楼 · 热浪海域',
            portLabel: '墨浪码头',
            spotLabel: 'Redang Reef Line',
            routeCurve: {
                type: 'quadratic',
                control: [5.6848, 102.9943]
            }
        }
    ].map((item) => deepFreeze(enrichMapRecord(item)));

    const frozenList = deepFreeze(mapCatalogItems.slice());
    const mapById = new Map();
    const mapByKey = new Map();

    frozenList.forEach((item) => {
        mapById.set(item.id, item);
        mapByKey.set(item.key, item);
    });

    function getById(id) {
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) {
            return null;
        }
        return mapById.get(numericId) || null;
    }

    function getByKey(key) {
        const normalizedKey = String(key || '').trim().toLowerCase();
        if (!normalizedKey) {
            return null;
        }
        return mapByKey.get(normalizedKey) || null;
    }

    global.YanqiSpotMapCatalog = deepFreeze({
        version: '2026-04-12',
        list: frozenList,
        getById,
        getByKey
    });
})(window);
