(function attachYanqiSpotWindowConfig(window) {
    function createWindow(key, label, hint) {
        return Object.freeze({ key, label, hint });
    }

    function createConfig(data) {
        return Object.freeze({
            recommendedMonths: Object.freeze((data.recommendedMonths || []).slice()),
            cautionMonths: Object.freeze((data.cautionMonths || []).slice()),
            dayWindows: Object.freeze([
                createWindow('dawn', '清晨入海', data.dawnHint || ''),
                createWindow('arrival', '午后抵达', data.arrivalHint || ''),
                createWindow('afterglow', '黄昏慢住', data.afterglowHint || '')
            ]),
            reentryNote: String(data.reentryNote || '').trim(),
            advancedNote: String(data.advancedNote || '').trim()
        });
    }

    const CONFIG = Object.freeze({
        1: createConfig({
            recommendedMonths: [4, 5, 6, 7, 8],
            cautionMonths: [11, 12, 1, 2],
            dawnHint: '更适合把鱼群线和第一束蓝水留给状态最稳的时段。',
            arrivalHint: '先安顿酒店、装备和耳压状态，再把节奏慢慢放进这片海。',
            afterglowHint: '把潜后 brief、码头回程和傍晚海面一起收进记忆里。',
            reentryNote: '如果距离上一次下潜已经有一段时间，先在更友好的点位做 check dive 会更稳。',
            advancedNote: '诗巴丹更适合 AOW 以上、近期仍在下潜的人，把大景和流区完整接住。'
        }),
        2: createConfig({
            recommendedMonths: [12, 1, 2, 3],
            cautionMonths: [7, 8, 9],
            dawnHint: '蓝洞光线和第一段流线更容易在清晨读懂。',
            arrivalHint: '适合把长途抵达后的恢复、briefing 和更轻一点的岸边节奏排在同一天。',
            afterglowHint: '把回到岸上的风、甲板光线和下一潜的期待留在傍晚。',
            reentryNote: '如果近半年没有下潜，帕劳的第一潜更建议先放在更友好的点位，先做一次海况确认。',
            advancedNote: '帕劳的断层与流区更适合把近期记录、深度习惯和海流判断一起确认后再往下排。'
        }),
        3: createConfig({
            recommendedMonths: [4, 5, 6],
            cautionMonths: [9, 10, 11, 12],
            dawnHint: '更适合把深蓝结构和垂降节奏放进状态最稳的时段。',
            arrivalHint: '先完成简报与深度适应，再决定是否往更核心的点位推进。',
            afterglowHint: '把深潜后的恢复、补水与 brief 安排在更安静的傍晚。',
            reentryNote: '大蓝洞不适合久未下潜后直接进入深潜节奏，先做 check dive 会更安全。',
            advancedNote: '更适合 AOW 及以上，而且近期仍有深潜或结构潜记录的人。'
        }),
        4: createConfig({
            recommendedMonths: [5, 6, 7, 8, 9],
            cautionMonths: [12, 1, 2],
            dawnHint: '清晨的水色和珊瑚坡会更平稳，也更适合作为恢复型开场。',
            arrivalHint: '帝汶岛更适合把光线、岸线和舒缓的第一天放在午后展开。',
            afterglowHint: '更适合把岸线风景和潜后停驻感一起留下。',
            reentryNote: '适合久未下潜的人把第一潜排得更轻一些，先找回与海重新对齐的感觉。',
            advancedNote: '如果状态稳定，第二天再往更外侧的点位推进，会比第一天就拉满更稳。'
        }),
        5: createConfig({
            recommendedMonths: [1, 2, 3, 4, 11, 12],
            cautionMonths: [7, 8, 9],
            dawnHint: '清晨能让能见度和微距观察都更稳定。',
            arrivalHint: '更适合把静水、微距和慢慢进入的节奏排在同一段轻潮里。',
            afterglowHint: '把静水、短 brief 和潜后的岛上回声一起留到傍晚。',
            reentryNote: '这片海很适合作为恢复状态的起点，check dive 可以更温柔地排进去。',
            advancedNote: '就算证书足够，也更建议把注意力留给节奏和观察，而不是急着把强度拉高。'
        }),
        6: createConfig({
            recommendedMonths: [4, 5, 6, 7, 8, 9, 10],
            cautionMonths: [12, 1, 2],
            dawnHint: '布纳肯的清透度和海墙层次更适合在清晨展开。',
            arrivalHint: '先把酒店、码头和更轻的一潜慢慢安顿下来。',
            afterglowHint: '适合把海墙外的光线、潜后 brief 和岛边风一起收住。',
            reentryNote: '如果最近状态不稳，先从更亮、更友好的墙潜线回水，会更容易把整体节奏收齐。',
            advancedNote: '近期仍在下潜的人，更容易把布纳肯的海墙结构和长线观察完整看出来。'
        }),
        7: createConfig({
            recommendedMonths: [5, 6, 7, 8, 9, 10],
            cautionMonths: [1, 2, 12],
            dawnHint: '科莫多更适合把第一潜放在清晨，把流区判断留给状态最稳的时候。',
            arrivalHint: '先完成 brief、装备复核和海况判断，再把代表性点位放到第二天。',
            afterglowHint: '把甲板 brief、潜后恢复和对下一天流区的判断留到傍晚。',
            reentryNote: '如果距离上次下潜超过 6 个月，科莫多更建议先用一潜做 check dive，不直接进入主流区。',
            advancedNote: '更适合 AOW 以上、近期仍在外海下潜的人，把流场和大景一起排进行程。'
        }),
        8: createConfig({
            recommendedMonths: [5, 6, 7, 8, 9],
            cautionMonths: [1, 2, 12],
            dawnHint: '图阿莫图的通道流和玻璃蓝更适合放在清晨。',
            arrivalHint: '更适合先把船宿节奏和入海窗口慢慢对齐。',
            afterglowHint: '把船宿日落、brief 和第二天窗口一起留在傍晚。',
            reentryNote: '如果近期没有稳定船潜记录，先从更友好的通道或外侧点位做回水会更稳。',
            advancedNote: '更适合有蓝水、通道流和连续船宿经验的人。'
        }),
        9: createConfig({
            recommendedMonths: [3, 4, 5, 6, 7, 8, 9],
            cautionMonths: [12, 1],
            dawnHint: '清晨的浅潜和玻璃海会让第一潜更温柔。',
            arrivalHint: '马布岛更适合让码头、浅潜和岛上停驻在午后慢慢展开。',
            afterglowHint: '把码头回程、喝茶和海风一起留在一天的尾声。',
            reentryNote: '很适合作为恢复节奏的起点，check dive 可以轻轻排在第一潜。',
            advancedNote: '就算想多潜，也更建议把马布岛的慢节奏和停驻感一起算进行程。'
        }),
        10: createConfig({
            recommendedMonths: [12, 1, 2, 3],
            cautionMonths: [6, 7, 8, 9],
            dawnHint: '船宿节奏最适合把第一潜和最关键的窗口留在清晨。',
            arrivalHint: '更适合把上船、分配装备和 brief 放在抵达当天。',
            afterglowHint: '让船宿甲板、回程 brief 和傍晚海面一起把这一天收住。',
            reentryNote: '初次船宿或近期未潜时，第一潜更建议当作节奏确认潜，不直接进主窗口。',
            advancedNote: '更适合 AOW 以上，而且能够适应连续出海与多潜节奏的人。'
        }),
        11: createConfig({
            recommendedMonths: [12, 1, 2, 3, 4, 5],
            cautionMonths: [8, 9],
            dawnHint: '清晨更适合把沉船和玻璃水的层次都读清楚。',
            arrivalHint: '适合把黑石海湾和轻一点的第一天安放在抵达日。',
            afterglowHint: '把海湾回程、装备整理和傍晚岩壁线一起留住。',
            reentryNote: '如果最近状态不稳，先从更浅的沉船或海湾回水，会更容易把节奏收稳。',
            advancedNote: '虽然整体可读性较高，但若想潜得更完整，仍建议有稳定的 OW/AOW 状态。'
        }),
        12: createConfig({
            recommendedMonths: [11, 12, 1, 2, 3, 4, 5],
            cautionMonths: [8, 9],
            dawnHint: '让白沙海湾和清透浅蓝在更平静的早晨打开。',
            arrivalHint: '适合先把白沙岸线、短船程和更轻的第一天排进午后。',
            afterglowHint: '把海边散步、brief 和回到岸上的放松感放在傍晚。',
            reentryNote: '很适合久未下潜后重新进入状态，第一潜可以安排得更轻、更稳。',
            advancedNote: '即使整体友好，也建议把天气窗口和身体恢复一起算进行程里。'
        }),
        13: createConfig({
            recommendedMonths: [11, 12, 1, 2, 3, 4],
            cautionMonths: [7, 8, 9],
            dawnHint: '清晨更适合让缓坡和水色一起变得更干净。',
            arrivalHint: '把海岛风、岸边停驻和第一眼玻璃蓝排在午后会更顺。',
            afterglowHint: '让海边晚餐、brief 和白沙海湾的余光一起收住。',
            reentryNote: '如果只是想找回状态，皇帝岛很适合把 check dive 融进第一潜的节奏里。',
            advancedNote: '更适合把泰国海域的轻船潜和舒适停驻一起慢慢读完。'
        }),
        14: createConfig({
            recommendedMonths: [4, 5, 6, 7, 8],
            cautionMonths: [11, 12, 1],
            dawnHint: '让清透礁坡和更友好的轻船潜在早晨慢慢打开。',
            arrivalHint: '适合先把岸线、房间和海岛风慢慢排进第一天。',
            afterglowHint: '把夜色、散步和海风一起收进回程前的余韵里。',
            reentryNote: '热浪岛很适合作为重新进入海的起点，第一潜可以收得更轻一点。',
            advancedNote: '若想把更多船潜排进去，也建议优先选推荐月份与更稳的清晨窗口。'
        })
    });

    function getBySpotId(spotId) {
        return CONFIG[Number(spotId)] || CONFIG[1];
    }

    function getMonthStatus(spotId, monthNumber) {
        const config = getBySpotId(spotId);
        const month = Number(monthNumber);
        if (!Number.isFinite(month) || month < 1 || month > 12) {
            return 'available';
        }

        if (config.cautionMonths.includes(month)) {
            return 'caution';
        }

        if (config.recommendedMonths.includes(month)) {
            return 'recommended';
        }

        return 'available';
    }

    function getStatusLabel(status) {
        if (status === 'recommended') {
            return '推荐窗口';
        }
        if (status === 'caution') {
            return '谨慎窗口';
        }
        return '可行窗口';
    }

    function getDateStatus(spotId, date) {
        const targetDate = date instanceof Date ? date : new Date(date);
        if (Number.isNaN(targetDate.getTime())) {
            return 'available';
        }

        return getMonthStatus(spotId, targetDate.getMonth() + 1);
    }

    function getWindowByKey(spotId, key) {
        const config = getBySpotId(spotId);
        const normalizedKey = String(key || '').trim();
        return config.dayWindows.find((windowEntry) => windowEntry.key === normalizedKey) || config.dayWindows[0];
    }

    function getPrimaryWindow(spotId) {
        return getBySpotId(spotId).dayWindows[0];
    }

    window.YanqiSpotWindowConfig = Object.freeze({
        CONFIG,
        getBySpotId,
        getMonthStatus,
        getStatusLabel,
        getDateStatus,
        getWindowByKey,
        getPrimaryWindow
    });
}(window));
