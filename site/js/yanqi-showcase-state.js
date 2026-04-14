(function attachYanqiShowcaseState(window) {
    const SHOWCASE_STORAGE_KEY = 'YANQI_SHOWCASE_MODE';
    const RECENT_SPOT_STORAGE_KEY = 'YANQI_SHOWCASE_RECENT_SPOT_ID';

    const STORAGE_KEYS = Object.freeze({
        plannerDraft: 'YANQI_PLANNER_DRAFT',
        confirmedBookings: 'YANQI_CONFIRMED_BOOKINGS',
        activeBookingId: 'YANQI_ACTIVE_BOOKING_ID',
        contactMessages: 'YANQI_CONTACT_MESSAGES'
    });

    const PRESETS = Object.freeze({
        'desktop-full': Object.freeze({
            key: 'desktop-full',
            label: '展示航线',
            recentSpotId: 7,
            profilePresetKey: 'showcase-current',
            booking: Object.freeze({
                entryId: 'yanqi-showcase-entry-komodo',
                bookingId: 'yanqi-booking:7:komodo-advanced-ritual:2026-09-18:2',
                spotKey: '7',
                spotName: '科莫多',
                spotTagline: '用巨物与大鱼的流线，慢慢把呼吸拉到更完整的一层海里。',
                detailHref: 'detail.html?id=7',
                packageId: 'komodo-advanced-ritual',
                packageTitle: '深流进阶 · 科莫多完整海境档案',
                packageTier: '进阶海况',
                packageDuration: '5天4晚',
                packagePrice: '¥6,880',
                packageNote: '把流区、大景和船上 brief 一起收成一段更完整的海境记忆。',
                packageTags: Object.freeze(['5天4晚', '清晨入海', 'AOW 推荐']),
                selectedDate: '2026-09-18',
                selectedDateLabel: '2026年9月18日 · 周五',
                selectedPeople: '2',
                selectedPeopleLabel: '2 人同行',
                fitLabel: '先做 check dive',
                windowKey: 'dawn',
                windowLabel: '清晨入海',
                prepFlags: Object.freeze(['check-dive', 'current-briefing', 'equipment-review']),
                briefId: 'yanqi-brief-komodo-showcase',
                priceDisplayVersion: '2026-04-03-cny-native-v1'
            }),
            plannerDraft: Object.freeze({
                spot: 'komodo',
                spotValue: 'komodo',
                spotLabel: '科莫多 Komodo',
                spotNote: '让大景、洋流和更完整的海况层次，慢慢在这一潜里打开。',
                date: '2026-09-18',
                dateValue: '2026-09-18',
                dateLabel: '2026年9月18日 · 周五',
                dateNote: '这个窗口更适合把第一潜和状态确认放在更稳的一天里。',
                people: '2',
                peopleValue: '2',
                peopleLabel: '2 人同行',
                peopleNote: '把彼此的节奏收进同一层海流里。',
                editingMode: 'confirmed-booking',
                editingEntryId: 'yanqi-showcase-entry-komodo',
                editingSpotKey: '7',
                editingPackageId: 'komodo-advanced-ritual'
            }),
            contactMessage: Object.freeze({
                name: '展示航线',
                contact: 'hello@yanqi-sea.com',
                topic: '行程咨询',
                message: '想把近期状态、check dive 和科莫多的清晨窗口一起排稳，希望保留大景进阶，但第一潜先从更稳的节奏开始。'
            })
        })
    });

    function getSafeStorage() {
        try {
            return window.localStorage;
        } catch (error) {
            return null;
        }
    }

    function readJson(key, fallbackValue) {
        const storage = getSafeStorage();
        if (!storage) {
            return fallbackValue;
        }

        try {
            const raw = storage.getItem(key);
            return raw ? JSON.parse(raw) : fallbackValue;
        } catch (error) {
            return fallbackValue;
        }
    }

    function writeJson(key, value) {
        const storage = getSafeStorage();
        if (!storage) {
            return false;
        }

        try {
            storage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            return false;
        }
    }

    function removeKey(key) {
        const storage = getSafeStorage();
        if (!storage) {
            return false;
        }

        try {
            storage.removeItem(key);
            return true;
        } catch (error) {
            return false;
        }
    }

    function getShowcaseMode() {
        const fallback = {
            enabled: false,
            presetKey: '',
            seededAt: ''
        };
        const mode = readJson(SHOWCASE_STORAGE_KEY, fallback);
        return {
            enabled: Boolean(mode?.enabled),
            presetKey: String(mode?.presetKey || '').trim(),
            seededAt: String(mode?.seededAt || '').trim()
        };
    }

    function isEnabled() {
        return getShowcaseMode().enabled;
    }

    function getPreset(key = 'desktop-full') {
        return PRESETS[key] || PRESETS['desktop-full'];
    }

    function dispatchShowcaseChange(detail) {
        window.dispatchEvent(new CustomEvent('yanqi:showcase-mode-updated', {
            detail
        }));
    }

    function recordRecentSpot(spotId) {
        const safeSpotId = Number.parseInt(spotId, 10);
        if (!Number.isFinite(safeSpotId) || safeSpotId <= 0) {
            return 0;
        }

        const storage = getSafeStorage();
        if (storage) {
            try {
                storage.setItem(RECENT_SPOT_STORAGE_KEY, String(safeSpotId));
            } catch (error) {
                // localStorage 不可用时静默降级。
            }
        }

        return safeSpotId;
    }

    function getRecentSpotId() {
        const storage = getSafeStorage();
        if (!storage) {
            return 0;
        }

        try {
            const raw = storage.getItem(RECENT_SPOT_STORAGE_KEY);
            const parsed = Number.parseInt(raw || '', 10);
            return Number.isFinite(parsed) ? parsed : 0;
        } catch (error) {
            return 0;
        }
    }

    function seedShowcaseState(options = {}) {
        const preset = getPreset(options.presetKey || 'desktop-full');
        const seededAt = new Date().toISOString();
        const mode = {
            enabled: true,
            presetKey: preset.key,
            seededAt
        };
        const profilePreset = window.YanqiDiverProfile?.getPreset?.(preset.profilePresetKey) || null;
        const profile = window.YanqiDiverProfile?.saveProfile?.(profilePreset?.profile || {})
            || profilePreset?.profile
            || {};
        const booking = {
            ...preset.booking,
            createdAt: seededAt,
            updatedAt: seededAt
        };
        const plannerDraft = {
            ...preset.plannerDraft,
            updatedAt: seededAt
        };

        writeJson(SHOWCASE_STORAGE_KEY, mode);
        writeJson(STORAGE_KEYS.plannerDraft, plannerDraft);
        writeJson(STORAGE_KEYS.confirmedBookings, [booking]);
        writeJson(STORAGE_KEYS.activeBookingId, booking.entryId);
        writeJson(STORAGE_KEYS.contactMessages, [{
            ...preset.contactMessage,
            createdAt: seededAt
        }]);
        recordRecentSpot(preset.recentSpotId);

        dispatchShowcaseChange({
            mode,
            booking,
            profile
        });

        return {
            mode,
            booking,
            profile
        };
    }

    function resetShowcaseState(options = {}) {
        return seedShowcaseState(options);
    }

    function clearShowcaseState() {
        removeKey(SHOWCASE_STORAGE_KEY);
        removeKey(RECENT_SPOT_STORAGE_KEY);
        Object.values(STORAGE_KEYS).forEach((key) => removeKey(key));
        window.YanqiDiverProfile?.clearProfile?.();
        dispatchShowcaseChange({
            mode: {
                enabled: false,
                presetKey: '',
                seededAt: ''
            }
        });
        return true;
    }

    function syncShowcaseBodyState() {
        const mode = getShowcaseMode();
        document.documentElement?.classList.toggle('yanqi-showcase-mode', mode.enabled);
        document.body?.classList.toggle('yanqi-showcase-mode', mode.enabled);
    }

    function ensureResetButton() {
        const navUser = document.querySelector('.nav-user');
        const mode = getShowcaseMode();
        if (!navUser) {
            return;
        }

        const existing = navUser.querySelector('[data-showcase-reset]');
        if (!mode.enabled) {
            existing?.remove();
            return;
        }

        if (existing) {
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'showcase-reset-btn';
        button.dataset.showcaseReset = 'true';
        button.innerHTML = `
            <span class="showcase-reset-btn-kicker">Demo Voyage</span>
            <span class="showcase-reset-btn-label">重置展示</span>
        `;
        button.addEventListener('click', () => {
            resetShowcaseState({
                presetKey: mode.presetKey || 'desktop-full'
            });
            window.location.reload();
        });

        navUser.insertBefore(button, navUser.firstChild || null);
    }

    function initializeShowcaseUi() {
        syncShowcaseBodyState();
        ensureResetButton();
    }

    window.addEventListener('yanqi:showcase-mode-updated', initializeShowcaseUi);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeShowcaseUi);
    } else {
        initializeShowcaseUi();
    }

    window.YanqiShowcaseState = Object.freeze({
        SHOWCASE_STORAGE_KEY,
        RECENT_SPOT_STORAGE_KEY,
        PRESETS,
        STORAGE_KEYS,
        getShowcaseMode,
        isEnabled,
        getPreset,
        seedShowcaseState,
        resetShowcaseState,
        clearShowcaseState,
        recordRecentSpot,
        getRecentSpotId
    });
}(window));
