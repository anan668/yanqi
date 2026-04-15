(function attachYanqiDiverProfile(window) {
    const STORAGE_KEY = 'YANQI_DIVER_PROFILE';

    const FIELD_OPTIONS = Object.freeze({
        certificationLevel: Object.freeze({
            beginner: '体验潜 / 刚开始',
            ow: 'OW',
            aow: 'AOW',
            advanced: 'AOW+ / Rescue'
        }),
        recentDiveState: Object.freeze({
            recent: '近 6 个月仍在下潜',
            returning: '近 6-12 个月有下潜',
            rusty: '久未下潜'
        }),
        currentComfort: Object.freeze({
            gentle: '更适合温和海况',
            balanced: '适合稳定外海',
            currentReady: '愿意进入更明显流区'
        }),
        travelPace: Object.freeze({
            slow: '慢慢停驻',
            balanced: '平稳展开',
            deepFocus: '想认真往更深一层去'
        }),
        groupMode: Object.freeze({
            solo: '1 人独行',
            duo: '2 人同行',
            smallGroup: '3-5 人同潜'
        }),
        tripGoal: Object.freeze({
            recovery: '恢复状态',
            comfort: '舒适慢住',
            scenery: '风景体验',
            bigScene: '鱼群 / 大景'
        })
    });

    const PROFILE_PRESETS = Object.freeze([
        Object.freeze({
            key: 'reentry-calm',
            label: '恢复状态',
            description: '先把身体和呼吸重新放回海里，适合从更轻、更稳的一层重新开始。',
            profile: Object.freeze({
                certificationLevel: 'ow',
                recentDiveState: 'rusty',
                currentComfort: 'gentle',
                travelPace: 'slow',
                groupMode: 'solo',
                tripGoal: 'recovery'
            })
        }),
        Object.freeze({
            key: 'comfort-shore',
            label: '舒适慢住',
            description: '更在意海岛停驻、舒适度和整段行程的平稳展开，适合把海放进假期里慢慢看。',
            profile: Object.freeze({
                certificationLevel: 'ow',
                recentDiveState: 'returning',
                currentComfort: 'balanced',
                travelPace: 'slow',
                groupMode: 'duo',
                tripGoal: 'comfort'
            })
        }),
        Object.freeze({
            key: 'showcase-current',
            label: '大景进阶',
            description: '把近期状态、流区判断和更完整的大景海况一起带进这一潜，适合展示满血效果。',
            profile: Object.freeze({
                certificationLevel: 'aow',
                recentDiveState: 'recent',
                currentComfort: 'currentReady',
                travelPace: 'deepFocus',
                groupMode: 'duo',
                tripGoal: 'bigScene'
            })
        })
    ]);

    const DEFAULT_PRESET_KEY = 'comfort-shore';

    const CERTIFICATION_RANK = Object.freeze({
        beginner: 0,
        ow: 1,
        aow: 2,
        advanced: 3
    });

    const SPOT_TRAITS = Object.freeze({
        1: Object.freeze({ minCert: 1, currentDemand: 2, tags: ['bigScene', 'current', 'blueWater'] }),
        2: Object.freeze({ minCert: 2, currentDemand: 2, tags: ['bigScene', 'current', 'scenery'] }),
        3: Object.freeze({ minCert: 2, currentDemand: 2, tags: ['advanced', 'structure', 'bigScene'] }),
        4: Object.freeze({ minCert: 1, currentDemand: 1, tags: ['comfort', 'scenery', 'gentle'] }),
        5: Object.freeze({ minCert: 1, currentDemand: 0, tags: ['recovery', 'slow', 'gentle'] }),
        6: Object.freeze({ minCert: 1, currentDemand: 1, tags: ['scenery', 'bigScene', 'balanced'] }),
        7: Object.freeze({ minCert: 2, currentDemand: 2, tags: ['bigScene', 'current', 'advanced'] }),
        8: Object.freeze({ minCert: 2, currentDemand: 2, tags: ['current', 'blueWater', 'advanced'] }),
        9: Object.freeze({ minCert: 0, currentDemand: 0, tags: ['comfort', 'slow', 'recovery'] }),
        10: Object.freeze({ minCert: 2, currentDemand: 1, tags: ['bigScene', 'comfort', 'advanced'] }),
        11: Object.freeze({ minCert: 1, currentDemand: 1, tags: ['scenery', 'structure', 'balanced'] }),
        12: Object.freeze({ minCert: 0, currentDemand: 0, tags: ['comfort', 'scenery', 'gentle'] }),
        13: Object.freeze({ minCert: 0, currentDemand: 0, tags: ['comfort', 'scenery', 'slow'] }),
        14: Object.freeze({ minCert: 0, currentDemand: 0, tags: ['comfort', 'slow', 'gentle'] })
    });

    function getDefaultPreset() {
        return PROFILE_PRESETS.find((preset) => preset.key === DEFAULT_PRESET_KEY) || PROFILE_PRESETS[0];
    }

    function getSafeStorage() {
        try {
            return window.localStorage;
        } catch (error) {
            return null;
        }
    }

    function pickOption(fieldKey, value, fallbackValue) {
        const options = FIELD_OPTIONS[fieldKey] || {};
        const normalizedValue = String(value || '').trim();
        if (normalizedValue && Object.prototype.hasOwnProperty.call(options, normalizedValue)) {
            return normalizedValue;
        }

        const normalizedFallback = String(fallbackValue || '').trim();
        if (normalizedFallback && Object.prototype.hasOwnProperty.call(options, normalizedFallback)) {
            return normalizedFallback;
        }

        return Object.keys(options)[0] || '';
    }

    function normalizeProfile(source) {
        const safeSource = source && typeof source === 'object' ? source : {};
        const defaults = getDefaultPreset()?.profile || {};

        return {
            certificationLevel: pickOption('certificationLevel', safeSource.certificationLevel, defaults.certificationLevel),
            recentDiveState: pickOption('recentDiveState', safeSource.recentDiveState, defaults.recentDiveState),
            currentComfort: pickOption('currentComfort', safeSource.currentComfort, defaults.currentComfort),
            travelPace: pickOption('travelPace', safeSource.travelPace, defaults.travelPace),
            groupMode: pickOption('groupMode', safeSource.groupMode, defaults.groupMode),
            tripGoal: pickOption('tripGoal', safeSource.tripGoal, defaults.tripGoal),
            updatedAt: String(safeSource.updatedAt || '').trim() || new Date().toISOString()
        };
    }

    function getDefaultProfile() {
        return normalizeProfile(getDefaultPreset()?.profile || {});
    }

    function getProfile() {
        const storage = getSafeStorage();
        if (!storage) {
            return getDefaultProfile();
        }

        try {
            const raw = storage.getItem(STORAGE_KEY);
            return raw ? normalizeProfile(JSON.parse(raw)) : getDefaultProfile();
        } catch (error) {
            return getDefaultProfile();
        }
    }

    function saveProfile(profile) {
        const storage = getSafeStorage();
        const normalized = normalizeProfile({
            ...profile,
            updatedAt: new Date().toISOString()
        });

        if (storage) {
            try {
                storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
            } catch (error) {
                // localStorage 不可用时静默降级。
            }
        }

        return normalized;
    }

    function clearProfile() {
        const storage = getSafeStorage();
        if (!storage) {
            return false;
        }

        try {
            storage.removeItem(STORAGE_KEY);
            return true;
        } catch (error) {
            return false;
        }
    }

    function getPreset(key) {
        return PROFILE_PRESETS.find((preset) => preset.key === key) || null;
    }

    function getPresets() {
        return PROFILE_PRESETS.slice();
    }

    function getCertificationRank(level) {
        return CERTIFICATION_RANK[String(level || '').trim()] ?? 0;
    }

    function getFieldLabel(fieldKey, value) {
        return FIELD_OPTIONS[fieldKey]?.[String(value || '').trim()] || String(value || '').trim();
    }

    function buildProfileChips(profile) {
        const safeProfile = normalizeProfile(profile);
        return [
            getFieldLabel('certificationLevel', safeProfile.certificationLevel),
            getFieldLabel('recentDiveState', safeProfile.recentDiveState),
            getFieldLabel('currentComfort', safeProfile.currentComfort),
            getFieldLabel('tripGoal', safeProfile.tripGoal)
        ].filter(Boolean);
    }

    function getRecommendedMatchKey(profile) {
        const safeProfile = normalizeProfile(profile);
        const certRank = getCertificationRank(safeProfile.certificationLevel);

        if (safeProfile.tripGoal === 'comfort') {
            return 'comfort-first';
        }

        if (safeProfile.tripGoal === 'scenery') {
            return 'scenery-first';
        }

        if (safeProfile.tripGoal === 'recovery') {
            return safeProfile.currentComfort === 'gentle' ? 'gentle-conditions' : 'slow-pace';
        }

        if (safeProfile.travelPace === 'slow') {
            return 'slow-pace';
        }

        if (safeProfile.currentComfort === 'gentle') {
            return 'gentle-conditions';
        }

        if (safeProfile.tripGoal === 'bigScene' && certRank >= 2 && safeProfile.currentComfort === 'currentReady') {
            return safeProfile.recentDiveState === 'recent' ? 'current-friendly' : 'big-scene';
        }

        if (safeProfile.recentDiveState === 'recent' && certRank >= 2) {
            return 'recent-dives';
        }

        if (certRank <= 0) {
            return 'beginner';
        }

        if (certRank === 1) {
            return 'ow';
        }

        if (safeProfile.currentComfort === 'currentReady') {
            return 'current-friendly';
        }

        return 'aow';
    }

    function describeProfile(profile) {
        const safeProfile = normalizeProfile(profile);
        const certificationLabel = getFieldLabel('certificationLevel', safeProfile.certificationLevel);
        const goalLabel = getFieldLabel('tripGoal', safeProfile.tripGoal);
        const recentLabel = getFieldLabel('recentDiveState', safeProfile.recentDiveState);
        const comfortLabel = getFieldLabel('currentComfort', safeProfile.currentComfort);
        const paceLabel = getFieldLabel('travelPace', safeProfile.travelPace);

        return {
            title: [certificationLabel, goalLabel].filter(Boolean).join(' · '),
            summary: `${recentLabel}，更偏向${comfortLabel}，这一次会按「${paceLabel}」的节奏慢慢展开。`,
            chips: buildProfileChips(safeProfile),
            recommendedMatchKey: getRecommendedMatchKey(safeProfile)
        };
    }

    function resolveSpotTraits(spotId) {
        return SPOT_TRAITS[Number(spotId)] || Object.freeze({
            minCert: 1,
            currentDemand: 1,
            tags: ['balanced']
        });
    }

    function scoreSpotForProfile(spotId, profile) {
        const traits = resolveSpotTraits(spotId);
        const safeProfile = normalizeProfile(profile);
        const certRank = getCertificationRank(safeProfile.certificationLevel);
        let score = 0;

        if (safeProfile.tripGoal === 'bigScene' && traits.tags.includes('bigScene')) {
            score += 4;
        }
        if (safeProfile.tripGoal === 'comfort' && traits.tags.includes('comfort')) {
            score += 4;
        }
        if (safeProfile.tripGoal === 'scenery' && traits.tags.includes('scenery')) {
            score += 4;
        }
        if (safeProfile.tripGoal === 'recovery' && traits.tags.includes('recovery')) {
            score += 4;
        }
        if (safeProfile.travelPace === 'slow' && traits.tags.includes('slow')) {
            score += 2;
        }
        if (safeProfile.currentComfort === 'gentle' && traits.tags.includes('gentle')) {
            score += 3;
        }
        if (safeProfile.currentComfort === 'currentReady' && traits.tags.includes('current')) {
            score += 3;
        }
        if (safeProfile.recentDiveState === 'recent' && traits.tags.includes('advanced')) {
            score += 2;
        }

        score -= Math.max(0, traits.minCert - certRank) * 3;
        if (safeProfile.currentComfort === 'gentle') {
            score -= traits.currentDemand * 2;
        }
        if (safeProfile.recentDiveState === 'rusty') {
            score -= traits.currentDemand * 2;
        }

        return score;
    }

    function sortSpotsForProfile(spots, profile) {
        const safeSpots = Array.isArray(spots) ? spots.slice() : [];
        return safeSpots.sort((left, right) => {
            const scoreGap = scoreSpotForProfile(right?.id, profile) - scoreSpotForProfile(left?.id, profile);
            if (scoreGap !== 0) {
                return scoreGap;
            }

            return Number(left?.id || 0) - Number(right?.id || 0);
        });
    }

    function describeSpotRecommendation(spotId, profile) {
        const traits = resolveSpotTraits(spotId);
        const safeProfile = normalizeProfile(profile);
        const reasons = [];

        if (safeProfile.tripGoal === 'bigScene' && traits.tags.includes('bigScene')) {
            reasons.push('这片海更容易把鱼群、大景和外海层次完整接住。');
        }
        if (safeProfile.tripGoal === 'comfort' && traits.tags.includes('comfort')) {
            reasons.push('它会把停驻感、舒适度和整段行程的平稳性放得更靠前。');
        }
        if (safeProfile.tripGoal === 'scenery' && traits.tags.includes('scenery')) {
            reasons.push('它更适合把海墙、结构和光线层次慢慢看清。');
        }
        if (safeProfile.tripGoal === 'recovery' && traits.tags.includes('recovery')) {
            reasons.push('它更像一片适合重新回到海里的海。');
        }
        if (safeProfile.currentComfort === 'gentle' && traits.tags.includes('gentle')) {
            reasons.push('对现在更想要温和海况的状态会更友好。');
        }
        if (safeProfile.currentComfort === 'currentReady' && traits.tags.includes('current')) {
            reasons.push('你愿意进入更明显的流区，这片海会给你更完整的推进感。');
        }
        if (safeProfile.travelPace === 'slow' && traits.tags.includes('slow')) {
            reasons.push('它允许把节奏放慢，而不是急着把海看完。');
        }

        return {
            title: 'Why This Water',
            reason: reasons[0] || '这片海和你当前的证书、节奏与目标更容易对上。',
            chips: buildProfileChips(safeProfile).slice(0, 3)
        };
    }

    function evaluatePackageFit(context = {}) {
        const safeProfile = normalizeProfile(context.profile || getProfile());
        const traits = resolveSpotTraits(context.spotId);
        const certRank = getCertificationRank(safeProfile.certificationLevel);
        const fitTags = Array.isArray(context.pkg?.fitTags) ? context.pkg.fitTags : [];
        const groupText = `${context.pkg?.group || ''} ${context.pkg?.name || ''} ${fitTags.join(' ')}`;
        let targetRank = traits.minCert;

        if (/入门|体验|轻启/.test(groupText)) {
            targetRank = Math.min(targetRank, 0);
        } else if (/\bOW\b/.test(groupText)) {
            targetRank = Math.max(targetRank, 1);
        }

        if (/\bAOW\b|进阶|深流|深蓝|流区|船宿/.test(groupText)) {
            targetRank = Math.max(targetRank, 2);
        }

        if (/Rescue|专业/.test(groupText)) {
            targetRank = Math.max(targetRank, 3);
        }

        const returningRisk = safeProfile.recentDiveState !== 'recent';
        const currentRisk = traits.currentDemand >= 2 && safeProfile.currentComfort !== 'currentReady';
        const shouldCheckDive = returningRisk && (traits.currentDemand >= 1 || targetRank >= 2);
        const tooDeepForProfile = certRank + 1 < targetRank || (traits.currentDemand >= 2 && safeProfile.currentComfort === 'gentle');

        let label = '适合';
        let tone = 'fit';
        let reason = '这套安排和你当前的证书、海况适应度与此刻目标基本对得上。';

        if (tooDeepForProfile) {
            label = '谨慎';
            tone = 'caution';
            reason = context.windowConfig?.advancedNote || '这片海更适合把证书、外海经验和近期状态一起确认后，再继续往下排。';
        } else if (shouldCheckDive || currentRisk) {
            label = '先做 check dive';
            tone = 'check-dive';
            reason = context.windowConfig?.reentryNote || '先用一潜把耳压、浮力和海流判断重新对齐，再决定是否继续推进到更核心的点位。';
        } else if (safeProfile.tripGoal === 'comfort' && traits.tags.includes('comfort')) {
            reason = '这套安排会把舒适度、停留节奏和更靠近海岛的方式一起收得更稳。';
        } else if (safeProfile.tripGoal === 'bigScene' && traits.tags.includes('bigScene')) {
            reason = '这套安排更容易把鱼群、大景和整片蓝水的层次完整接住。';
        }

        const prepFlags = [];
        if (shouldCheckDive) {
            prepFlags.push('check-dive');
        }
        if (traits.currentDemand >= 2) {
            prepFlags.push('current-briefing');
        }
        if (safeProfile.recentDiveState !== 'recent') {
            prepFlags.push('equipment-review');
        }
        if (safeProfile.tripGoal === 'comfort' || safeProfile.travelPace === 'slow') {
            prepFlags.push('rest-window');
        }
        if (safeProfile.currentComfort === 'gentle') {
            prepFlags.push('gentle-window');
        }

        return {
            label,
            tone,
            reason,
            prepFlags: Array.from(new Set(prepFlags)),
            shouldCheckDive,
            recommendedMatchKey: getRecommendedMatchKey(safeProfile)
        };
    }

    window.YanqiDiverProfile = Object.freeze({
        STORAGE_KEY,
        FIELD_OPTIONS,
        PROFILE_PRESETS,
        normalizeProfile,
        getDefaultProfile,
        getProfile,
        saveProfile,
        clearProfile,
        getPreset,
        getPresets,
        getFieldLabel,
        buildProfileChips,
        describeProfile,
        getCertificationRank,
        getRecommendedMatchKey,
        scoreSpotForProfile,
        sortSpotsForProfile,
        describeSpotRecommendation,
        evaluatePackageFit
    });
}(window));
