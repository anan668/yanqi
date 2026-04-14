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

    function createContextLabel(nameZh, nameEn, kind, coords, priority) {
        return { nameZh, nameEn, name: nameEn, kind, coords, priority };
    }

    const SEA_ATLAS_CONTEXT_LABELS = deepFreeze({
        sipadan: [
            createContextLabel('马来西亚', 'Malaysia', 'country', [4.53, 118.56], 1),
            createContextLabel('沙巴', 'Sabah', 'region', [4.41, 118.52], 2),
            createContextLabel('仙本那', 'Semporna', 'region', [4.48, 118.61], 3),
            createContextLabel('马布岛', 'Mabul', 'region', [4.246, 118.627], 4),
            createContextLabel('诗巴丹', 'Sipadan', 'region', [4.114, 118.63], 5),
            createContextLabel('婆罗洲', 'Borneo', 'region', [4.59, 118.71], 6),
            createContextLabel('西里伯斯海', 'Celebes Sea', 'sea', [4.22, 118.76], 7),
            createContextLabel('印度尼西亚', 'Indonesia', 'country', [4.33, 118.82], 8)
        ],
        palau: [
            createContextLabel('帕劳', 'Palau', 'country', [7.36, 134.33], 1),
            createContextLabel('科罗尔', 'Koror', 'region', [7.34, 134.47], 2),
            createContextLabel('巴别尔道布岛', 'Babeldaob', 'region', [7.41, 134.36], 3),
            createContextLabel('洛克群岛', 'Rock Islands', 'region', [7.28, 134.38], 4),
            createContextLabel('菲律宾海', 'Philippine Sea', 'sea', [7.12, 134.53], 5)
        ],
        'blue-hole': [
            createContextLabel('伯利兹', 'Belize', 'country', [17.8, -87.92], 1),
            createContextLabel('伯利兹城', 'Belize City', 'region', [17.5, -88.2], 2),
            createContextLabel('圣佩德罗', 'San Pedro', 'region', [17.93, -87.96], 3),
            createContextLabel('安伯格里斯岛', 'Ambergris Caye', 'region', [17.99, -87.91], 4),
            createContextLabel('灯塔礁', 'Lighthouse Reef', 'region', [17.55, -87.76], 5),
            createContextLabel('尤卡坦海峡', 'Yucatan Channel', 'sea', [17.84, -87.62], 6),
            createContextLabel('加勒比海', 'Caribbean Sea', 'sea', [17.47, -87.58], 7)
        ],
        timor: [
            createContextLabel('东帝汶', 'Timor-Leste', 'country', [-8.48, 125.56], 1),
            createContextLabel('帝力', 'Dili', 'region', [-8.56, 125.57], 2),
            createContextLabel('阿陶罗岛', 'Atauro', 'region', [-8.26, 125.57], 3),
            createContextLabel('帝汶岛', 'Timor Island', 'region', [-8.62, 125.75], 4),
            createContextLabel('印度尼西亚', 'Indonesia', 'country', [-8.58, 125.95], 5),
            createContextLabel('韦塔海峡', 'Wetar Strait', 'sea', [-8.31, 125.69], 6),
            createContextLabel('翁拜海峡', 'Ombai Strait', 'sea', [-8.57, 125.7], 7)
        ],
        pohnpei: [
            createContextLabel('密克罗尼西亚', 'Micronesia', 'country', [6.96, 158.2], 1),
            createContextLabel('科洛尼亚', 'Kolonia', 'region', [6.96, 158.21], 2),
            createContextLabel('波纳佩岛', 'Pohnpei', 'region', [6.88, 158.26], 3),
            createContextLabel('波纳佩礁湖', 'Pohnpei Lagoon', 'sea', [6.89, 158.33], 4),
            createContextLabel('太平洋', 'Pacific Ocean', 'sea', [6.84, 158.36], 5)
        ],
        bunaken: [
            createContextLabel('印度尼西亚', 'Indonesia', 'country', [1.49, 124.86], 1),
            createContextLabel('美娜多', 'Manado', 'region', [1.5, 124.84], 2),
            createContextLabel('北苏拉威西', 'North Sulawesi', 'region', [1.61, 124.88], 3),
            createContextLabel('布纳肯', 'Bunaken', 'region', [1.62, 124.75], 4),
            createContextLabel('西里伯斯海', 'Celebes Sea', 'sea', [1.55, 124.68], 5)
        ],
        komodo: [
            createContextLabel('印度尼西亚', 'Indonesia', 'country', [-8.51, 119.86], 1),
            createContextLabel('拉布安巴焦', 'Labuan Bajo', 'region', [-8.5, 119.88], 2),
            createContextLabel('科莫多', 'Komodo', 'region', [-8.55, 119.55], 3),
            createContextLabel('林卡岛', 'Rinca', 'region', [-8.63, 119.72], 4),
            createContextLabel('弗洛勒斯岛', 'Flores', 'region', [-8.59, 120.02], 5),
            createContextLabel('松巴哇岛', 'Sumbawa', 'region', [-8.45, 119.22], 6),
            createContextLabel('东努沙登加拉', 'East Nusa Tenggara', 'region', [-8.72, 119.99], 7),
            createContextLabel('弗洛勒斯海', 'Flores Sea', 'sea', [-8.67, 119.69], 8)
        ],
        tuamotu: [
            createContextLabel('法属波利尼西亚', 'French Polynesia', 'country', [-14.95, -147.68], 1),
            createContextLabel('土阿莫土群岛', 'Tuamotu Archipelago', 'region', [-14.92, -147.59], 2),
            createContextLabel('朗伊罗阿', 'Rangiroa', 'region', [-14.97, -147.62], 3),
            createContextLabel('阿瓦托鲁', 'Avatoru', 'region', [-14.96, -147.64], 4),
            createContextLabel('南太平洋', 'South Pacific', 'sea', [-15.02, -147.7], 5)
        ],
        mabul: [
            createContextLabel('马来西亚', 'Malaysia', 'country', [4.52, 118.56], 1),
            createContextLabel('沙巴', 'Sabah', 'region', [4.43, 118.53], 2),
            createContextLabel('仙本那', 'Semporna', 'region', [4.48, 118.61], 3),
            createContextLabel('马布岛', 'Mabul', 'region', [4.246, 118.627], 4),
            createContextLabel('卡帕莱', 'Kapalai', 'region', [4.222, 118.657], 5),
            createContextLabel('诗巴丹', 'Sipadan', 'region', [4.114, 118.628], 6),
            createContextLabel('婆罗洲', 'Borneo', 'region', [4.58, 118.72], 7),
            createContextLabel('西里伯斯海', 'Celebes Sea', 'sea', [4.3, 118.76], 8),
            createContextLabel('印度尼西亚', 'Indonesia', 'country', [4.31, 118.82], 9)
        ],
        'maldives-liveaboard': [
            createContextLabel('马尔代夫', 'Maldives', 'country', [4.34, 72.76], 1),
            createContextLabel('马累', 'Male', 'region', [4.18, 73.51], 2),
            createContextLabel('北马累环礁', 'North Male Atoll', 'region', [4.32, 73.47], 3),
            createContextLabel('阿里环礁', 'Ari Atoll', 'region', [4.03, 72.86], 4),
            createContextLabel('印度洋', 'Indian Ocean', 'sea', [4.74, 72.66], 5)
        ],
        coron: [
            createContextLabel('菲律宾', 'Philippines', 'country', [12.05, 120.19], 1),
            createContextLabel('布桑加', 'Busuanga', 'region', [12.05, 120.2], 2),
            createContextLabel('巴拉望', 'Palawan', 'region', [12.04, 120.07], 3),
            createContextLabel('科隆岛', 'Coron Island', 'region', [11.98, 120.2], 4),
            createContextLabel('卡拉棉群岛', 'Calamian Islands', 'region', [12.03, 120.25], 5),
            createContextLabel('科隆湾', 'Coron Bay', 'sea', [11.97, 120.11], 6),
            createContextLabel('苏禄海', 'Sulu Sea', 'sea', [11.9, 120.3], 7)
        ],
        bohol: [
            createContextLabel('菲律宾', 'Philippines', 'country', [9.58, 123.79], 1),
            createContextLabel('邦劳岛', 'Panglao', 'region', [9.55, 123.77], 2),
            createContextLabel('薄荷岛', 'Bohol', 'region', [9.59, 123.8], 3),
            createContextLabel('宿务', 'Cebu', 'region', [10.04, 123.9], 4),
            createContextLabel('巴里卡萨岛', 'Balicasag', 'region', [9.52, 123.69], 5),
            createContextLabel('杜马盖地', 'Dumaguete', 'region', [9.31, 123.31], 6),
            createContextLabel('薄荷海', 'Bohol Sea', 'sea', [9.49, 123.64], 7)
        ],
        racha: [
            createContextLabel('泰国', 'Thailand', 'country', [7.84, 98.29], 1),
            createContextLabel('普吉', 'Phuket', 'region', [7.83, 98.34], 2),
            createContextLabel('拉查亚伊岛', 'Racha Yai', 'region', [7.61, 98.38], 3),
            createContextLabel('拉查诺伊岛', 'Racha Noi', 'region', [7.55, 98.36], 4),
            createContextLabel('攀牙湾', 'Phang Nga', 'region', [8.24, 98.53], 5),
            createContextLabel('甲米', 'Krabi', 'region', [8.07, 98.91], 6),
            createContextLabel('安达曼海', 'Andaman Sea', 'sea', [7.59, 98.29], 7)
        ],
        redang: [
            createContextLabel('马来西亚', 'Malaysia', 'country', [5.57, 102.95], 1),
            createContextLabel('登嘉楼', 'Terengganu', 'region', [5.56, 102.97], 2),
            createContextLabel('墨浪', 'Merang', 'region', [5.55, 102.96], 3),
            createContextLabel('热浪岛', 'Redang Island', 'region', [5.78, 103.02], 4),
            createContextLabel('瓜拉丁加奴', 'Kuala Terengganu', 'region', [5.33, 103.14], 5),
            createContextLabel('停泊岛', 'Perhentian Islands', 'region', [5.92, 102.73], 6),
            createContextLabel('南海', 'South China Sea', 'sea', [5.7, 103.11], 7),
            createContextLabel('泰国湾', 'Gulf of Thailand', 'sea', [6.04, 103.42], 8)
        ]
    });

    const PRIMARY_COUNTRY_CODES = deepFreeze({
        sipadan: 'MY',
        palau: 'PW',
        'blue-hole': 'BZ',
        timor: 'TL',
        pohnpei: 'FM',
        bunaken: 'ID',
        komodo: 'ID',
        tuamotu: 'PF',
        mabul: 'MY',
        'maldives-liveaboard': 'MV',
        coron: 'PH',
        bohol: 'PH',
        racha: 'TH',
        redang: 'MY'
    });

    function enrichMapRecord(item) {
        const zoom = Number(item?.zoom) || 9;
        const hasBounds = Array.isArray(item?.mapBounds) && item.mapBounds.length === 2;

        const contextLabels = (SEA_ATLAS_CONTEXT_LABELS[item.key] || []).map((label) => ({
            ...label,
            nameZh: label.nameZh || label.name || '',
            nameEn: label.nameEn || label.name || '',
            name: label.name || label.nameEn || label.nameZh || ''
        }));

        return {
            ...item,
            primaryCountryCode: item.primaryCountryCode || PRIMARY_COUNTRY_CODES[item.key] || '',
            contextLabels,
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
