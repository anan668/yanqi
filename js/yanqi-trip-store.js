/* ============================================
   Shared Trip Store - yanqi-trip-store.js
   ============================================
   ?????
   1. ?? detail ?? trip ????????????? Planner ?????????
   2. ?????????????????????????
   3. ????storage key -> ???? -> ???? -> upsert / remove??????
*/

(function attachYanqiTripStore(window) {
    const STORAGE_KEYS = Object.freeze({
        plannerDraft: 'YANQI_PLANNER_DRAFT',
        confirmedBookings: 'YANQI_CONFIRMED_BOOKINGS'
    });
    const PRICE_DISPLAY_VERSION = '2026-03-16-rate-1451-v2.84';
    const CURRENT_USD_SCALE = 0.1451 * 2.84;
    const LEGACY_PRICE_REBALANCE_RATIO_RATE1451 = CURRENT_USD_SCALE / (0.1451 * 1);
    const LEGACY_PRICE_REBALANCE_RATIO_V28 = CURRENT_USD_SCALE / (0.14 * 2.8);
    const LEGACY_PRICE_REBALANCE_RATIO_V5 = CURRENT_USD_SCALE / (0.14 * 5);

    /**
     * getSafeStorage() - 安全获取 localStorage，避免隐私模式或权限限制导致脚本报错
     * @returns {Storage|null} - 可用的 localStorage 实例或空值
     */
    function getSafeStorage() {
        try {
            return window.localStorage;
        } catch (error) {
            return null;
        }
    }

    /**
     * readJson(key, fallbackValue) - 从本地存储读取 JSON，并在异常时返回兜底值
     * @param {string} key - 存储键名
     * @param {*} fallbackValue - 读取失败时返回的默认值
     * @returns {*} - 解析后的数据或默认值
     */
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

    /**
     * writeJson(key, value) - 将 JSON 数据安全写入本地存储
     * @param {string} key - 存储键名
     * @param {*} value - 需要写入的数据
     * @returns {boolean} - 是否写入成功
     */
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

    /**
     * normalizeText(value) - 把任意值整理成稳定的字符串
     * @param {*} value - 原始输入值
     * @returns {string} - 去掉首尾空白后的字符串
     */
    function normalizeText(value) {
        return String(value || '').trim();
    }

    /**
     * looksLikeMojibake(text) - 粗略判断文本是否出现了常见的编码乱码
     * @param {string} text - 待判断的文本
     * @returns {boolean} - 是否像是错误编码后的乱码
     */
    function looksLikeMojibake(text) {
        const safeText = normalizeText(text);
        if (!safeText) {
            return false;
        }

        if (/[\uE000-\uF8FF]/.test(safeText)) {
            return true;
        }

        const markers = ['鍚', '杩', '涓', '灏', '绋', '鐨', '鏃', '鍐', '鎶', '琛', '闂', '璁', '璇', '钀', '鑺'];
        const hitCount = markers.reduce((count, marker) => count + (safeText.includes(marker) ? 1 : 0), 0);
        return hitCount >= 2;
    }

    /**
     * sanitizeReadableText(value, fallbackValue) - 清洗读出来的显示文案，遇到乱码时退回兜底文案
     * @param {*} value - 原始文本值
     * @param {string} fallbackValue - 发现乱码时使用的兜底文案
     * @returns {string} - 可安全展示的文本
     */
    function sanitizeReadableText(value, fallbackValue) {
        const safeValue = normalizeText(value);
        if (!safeValue) {
            return normalizeText(fallbackValue);
        }

        return looksLikeMojibake(safeValue)
            ? normalizeText(fallbackValue)
            : safeValue;
    }

    function normalizePlannerDateValue(value) {
        const safeValue = normalizeText(value);
        if (!safeValue || !/^\d{4}-\d{2}-\d{2}$/.test(safeValue)) {
            return '';
        }

        const parsed = new Date(`${safeValue}T00:00:00`);
        if (Number.isNaN(parsed.getTime())) {
            return '';
        }

        const normalized = [
            parsed.getFullYear(),
            String(parsed.getMonth() + 1).padStart(2, '0'),
            String(parsed.getDate()).padStart(2, '0')
        ].join('-');

        return normalized === safeValue ? safeValue : '';
    }

    function normalizePlannerPeopleValue(value) {
        const safeValue = normalizeText(value);
        if (!safeValue) {
            return '';
        }

        const exactMatch = safeValue.match(/^(\d+)$/);
        if (exactMatch) {
            const count = Number.parseInt(exactMatch[1], 10);
            return Number.isFinite(count) && count > 0 ? String(count) : '';
        }

        const rangeMatch = safeValue.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
        if (rangeMatch) {
            const start = Number.parseInt(rangeMatch[1], 10);
            const end = Number.parseInt(rangeMatch[2], 10);
            return Number.isFinite(start) && Number.isFinite(end) && start > 0 && end >= start
                ? `${start}-${end}`
                : '';
        }

        const plusMatch = safeValue.match(/^(\d+)\s*\+$/);
        if (plusMatch) {
            const count = Number.parseInt(plusMatch[1], 10);
            return Number.isFinite(count) && count > 0 ? `${count}+` : '';
        }

        return '';
    }

    function pickPlannerDraftValue(source, primaryKey, legacyKey, normalizer) {
        const normalize = typeof normalizer === 'function' ? normalizer : normalizeText;
        const primaryValue = normalize(source?.[primaryKey]);
        if (primaryValue) {
            return primaryValue;
        }

        return normalize(source?.[legacyKey]);
    }

    /**
     * normalizePlannerDraft(draft) - 统一 Planner Desk 草稿数据结构
     * @param {Object} draft - 原始草稿对象
     * @returns {Object} - 标准化后的草稿对象
     */
    function normalizePlannerDraft(draft) {
        const source = draft && typeof draft === 'object' ? draft : {};
        const spot = pickPlannerDraftValue(source, 'spot', 'spotValue', normalizeText);
        const date = pickPlannerDraftValue(source, 'date', 'dateValue', normalizePlannerDateValue);
        const people = pickPlannerDraftValue(source, 'people', 'peopleValue', normalizePlannerPeopleValue);

        return {
            spot,
            spotValue: spot,
            spotLabel: sanitizeReadableText(source.spotLabel, ''),
            spotNote: sanitizeReadableText(source.spotNote, ''),
            date,
            dateValue: date,
            dateLabel: sanitizeReadableText(source.dateLabel, ''),
            dateNote: sanitizeReadableText(source.dateNote, ''),
            people,
            peopleValue: people,
            peopleLabel: sanitizeReadableText(source.peopleLabel, ''),
            peopleNote: sanitizeReadableText(source.peopleNote, ''),
            updatedAt: normalizeText(source.updatedAt)
        };
    }

    /**
     * buildBookingIdentityParts(booking) - 提取套餐去重所需的关键身份字段
     * @param {Object} booking - 原始套餐对象
     * @returns {Object} - 归一化后的去重字段
     */
    function buildBookingIdentityParts(booking) {
        const spotKey = normalizeText(booking.spotKey);
        const packageId = normalizeText(booking.packageId);
        const selectedDate = normalizeText(booking.selectedDate);
        const selectedPeople = normalizeText(booking.selectedPeople);

        return {
            spotKey,
            packageId,
            selectedDate,
            selectedPeople
        };
    }

    /**
     * createBookingId(booking) - 按海域、套餐、日期和人数生成稳定的 bookingId
     * @param {Object} booking - 原始套餐对象
     * @returns {string} - 稳定且可去重的 bookingId
     */
    function createBookingId(booking) {
        const identity = buildBookingIdentityParts(booking);
        const datePart = identity.selectedDate || 'open-date';
        const peoplePart = identity.selectedPeople || 'open-people';

        return `yanqi-booking:${identity.spotKey}:${identity.packageId}:${datePart}:${peoplePart}`;
    }

    /**
     * rebalanceLegacyPackagePrice(priceText, version) - 把旧倍率写进去的美元价格拉回当前统一尺度
     * @param {string} priceText - 已存储的价格文本
     * @param {string} version - 当前条目的价格版本
     * @returns {string} - 归一化后的价格文本
     */
    function rebalanceLegacyPackagePrice(priceText, version) {
        const safePriceText = sanitizeReadableText(priceText, '');
        if (!safePriceText || version === PRICE_DISPLAY_VERSION) {
            return safePriceText;
        }

        const amountMatch = safePriceText.match(/[\d,.]+/);
        if (!amountMatch) {
            return safePriceText;
        }

        const numericText = amountMatch[0].replace(/,/g, '');
        const amount = Number.parseFloat(numericText);
        if (!Number.isFinite(amount)) {
            return safePriceText;
        }

        const fractionDigits = numericText.includes('.') ? Math.min(numericText.split('.')[1].length, 2) : 0;
        const currency = safePriceText.replace(amountMatch[0], '').trim();
        const ratio = version === '2026-03-16-rate-1451'
            ? LEGACY_PRICE_REBALANCE_RATIO_RATE1451
            : version === '2026-03-16-v2.8'
                ? LEGACY_PRICE_REBALANCE_RATIO_V28
                : LEGACY_PRICE_REBALANCE_RATIO_V5;
        const nextAmount = amount * ratio;
        const formatted = nextAmount.toLocaleString('en-US', {
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits
        });

        return `${currency}${formatted}`;
    }

    /**
     * normalizeConfirmedBooking(booking) - 统一已确认套餐的数据结构
     * @param {Object} booking - 原始套餐对象
     * @returns {Object} - 标准化后的套餐对象
     */
    function normalizeConfirmedBooking(booking) {
        const source = booking && typeof booking === 'object' ? booking : {};
        const now = new Date().toISOString();
        const bookingId = normalizeText(source.bookingId) || createBookingId(source);
        const priceDisplayVersion = normalizeText(source.priceDisplayVersion);

        return {
            bookingId,
            spotKey: normalizeText(source.spotKey),
            spotName: sanitizeReadableText(source.spotName, ''),
            spotTagline: sanitizeReadableText(source.spotTagline, ''),
            detailHref: normalizeText(source.detailHref),
            packageId: normalizeText(source.packageId),
            packageTitle: sanitizeReadableText(source.packageTitle, ''),
            packageTier: sanitizeReadableText(source.packageTier, ''),
            packagePrice: rebalanceLegacyPackagePrice(source.packagePrice, priceDisplayVersion),
            packageNote: sanitizeReadableText(source.packageNote, ''),
            packageTags: Array.isArray(source.packageTags)
                ? source.packageTags.map((item) => sanitizeReadableText(item, '')).filter(Boolean)
                : [],
            selectedDate: normalizeText(source.selectedDate),
            selectedDateLabel: sanitizeReadableText(source.selectedDateLabel, ''),
            selectedPeople: normalizeText(source.selectedPeople),
            selectedPeopleLabel: sanitizeReadableText(source.selectedPeopleLabel, ''),
            priceDisplayVersion: PRICE_DISPLAY_VERSION,
            createdAt: normalizeText(source.createdAt) || now,
            updatedAt: normalizeText(source.updatedAt) || now
        };
    }

    /**
     * getPlannerDraft() - 读取当前 Planner Desk 草稿
     * @returns {Object} - 标准化后的草稿对象
     */
    function getPlannerDraft() {
        return normalizePlannerDraft(readJson(STORAGE_KEYS.plannerDraft, {}));
    }

    /**
     * savePlannerDraft(draft) - 保存当前 Planner Desk 草稿
     * @param {Object} draft - 需要保存的草稿对象
     * @returns {Object} - 标准化并已写入的草稿对象
     */
    function savePlannerDraft(draft) {
        const normalized = normalizePlannerDraft({
            ...draft,
            updatedAt: new Date().toISOString()
        });

        writeJson(STORAGE_KEYS.plannerDraft, normalized);
        return normalized;
    }

    /**
     * getConfirmedBookings() - 读取已收进行程的套餐列表
     * @returns {Array<Object>} - 标准化并按更新时间倒序排列的套餐数组
     */
    function getConfirmedBookings() {
        const rawList = readJson(STORAGE_KEYS.confirmedBookings, []);
        if (!Array.isArray(rawList)) {
            return [];
        }

        return rawList
            .map((item) => normalizeConfirmedBooking(item))
            .sort((left, right) => Date.parse(right.updatedAt || '') - Date.parse(left.updatedAt || ''));
    }

    /**
     * saveConfirmedBookings(list) - 覆盖保存整份已确认套餐列表
     * @param {Array<Object>} list - 套餐数组
     * @returns {Array<Object>} - 标准化并已写入的套餐数组
     */
    function saveConfirmedBookings(list) {
        const safeList = Array.isArray(list) ? list : [];
        const normalized = safeList.map((item) => normalizeConfirmedBooking(item));
        writeJson(STORAGE_KEYS.confirmedBookings, normalized);
        return normalized;
    }

    /**
     * upsertConfirmedBooking(booking) - 按稳定 ID 更新或新增一条已确认套餐
     * @param {Object} booking - 待写入的套餐对象
     * @returns {Object} - 最终写入的套餐对象
     */
    function upsertConfirmedBooking(booking) {
        const normalized = normalizeConfirmedBooking({
            ...booking,
            bookingId: createBookingId(booking),
            updatedAt: new Date().toISOString()
        });
        const currentList = getConfirmedBookings();
        const existingIndex = currentList.findIndex((item) => item.bookingId === normalized.bookingId);

        if (existingIndex >= 0) {
            const existing = currentList[existingIndex];
            currentList[existingIndex] = normalizeConfirmedBooking({
                ...existing,
                ...normalized,
                createdAt: existing.createdAt,
                updatedAt: normalized.updatedAt
            });
        } else {
            currentList.unshift(normalized);
        }

        saveConfirmedBookings(currentList);
        return normalized;
    }

    /**
     * removeConfirmedBooking(bookingId) - 从已确认套餐列表里移除指定条目
     * @param {string} bookingId - 需要移除的 bookingId
     * @returns {Array<Object>} - 删除后的套餐数组
     */
    function removeConfirmedBooking(bookingId) {
        const safeBookingId = normalizeText(bookingId);
        const currentList = getConfirmedBookings();
        const nextList = currentList.filter((item) => item.bookingId !== safeBookingId);
        saveConfirmedBookings(nextList);
        return nextList;
    }

    window.YanqiTripStore = Object.freeze({
        STORAGE_KEYS,
        getPlannerDraft,
        savePlannerDraft,
        getConfirmedBookings,
        saveConfirmedBookings,
        upsertConfirmedBooking,
        removeConfirmedBooking
    });
}(window));
