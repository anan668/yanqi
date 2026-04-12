/* ============================================
   详情页脚本逻辑 - detail.js
   ============================================
   职责：
   1. 驱动详情页首屏、套餐、评论、地图、推荐与反馈层的整体交互。
   2. 管理海域数据渲染、价格展示、详情页内切换和套餐确认流程。
   3. 把“进入一片海”这件事收成一套完整的页面体验。
   阅读顺序：
   1. 价格与文本工具
   2. 海域数据
   3. `DetailPage` 类
   4. 页面初始化与跨页联动
*/
// 共享价格配置：详情页与首页共用同一套人民币展示规则。
const sharedPriceTools = window.YanqiPriceConfig || null;
const sharedSpotCatalog = window.YanqiSpotCatalog || null;
const sharedSpotMapCatalog = window.YanqiSpotMapCatalog || null;
const PRICE_DISPLAY_VERSION = sharedPriceTools?.PRICE_DISPLAY_VERSION || '';
const STAGE_DEBUG_STORAGE_KEY = 'YANQI_STAGE_DEBUG_MODE';
const STAGE_DEBUG_QUERY_KEY = 'stageDebug';
const PACKAGE_MODAL_DURATION_MIN_DAYS = 2;
const PACKAGE_MODAL_PRESET_DURATION_MAX_DAYS = 6;
const PACKAGE_MODAL_CUSTOM_DURATION_MAX_DAYS = 12;
const BOOKING_MATCH_CONFIRM_CLOSE_DURATION = 380;
const SEA_ATLAS_EMPTY_TILE_DATA_URI = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const SEA_ATLAS_FALLBACK_TILE_ERROR_THRESHOLD = 3;
const SEA_ATLAS_MOBILE_PASSIVE_QUERY = '(max-width: 960px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const SEA_ATLAS_ROUTE_VIEWBOX_WIDTH = 640;
const SEA_ATLAS_ROUTE_VIEWBOX_HEIGHT = 360;
const SEA_ATLAS_TILE_ATTRIBUTION = 'Offline Sea Atlas · Natural Earth land data';
const SEA_ATLAS_OFFLINE_TILE_SIZE = 1024;
const SEA_ATLAS_OFFLINE_TILE_ZOOM_OFFSET = -2;
const SEA_ATLAS_TILE_BUFFER_COLUMNS = 2;
const SEA_ATLAS_TILE_BUFFER_ROWS = 2;
const seaAtlasPackCache = new Map();
let SeaAtlasPackedTileLayerClass = null;

/**
 * resolveStageDebugMode() - 读取当前页面是否需要暴露舞台调试能力
 * @returns {boolean} - 当前是否启用舞台调试态
 */
function resolveStageDebugMode() {
    let stageDebugEnabled = false;

    try {
        const queryValue = new URLSearchParams(window.location.search).get(STAGE_DEBUG_QUERY_KEY);
        if (queryValue != null) {
            const normalized = String(queryValue).trim().toLowerCase();
            stageDebugEnabled = ['1', 'true', 'yes', 'on'].includes(normalized);

            if (stageDebugEnabled) {
                localStorage.setItem(STAGE_DEBUG_STORAGE_KEY, '1');
            } else if (['0', 'false', 'no', 'off'].includes(normalized)) {
                localStorage.removeItem(STAGE_DEBUG_STORAGE_KEY);
            }
        } else {
            stageDebugEnabled = localStorage.getItem(STAGE_DEBUG_STORAGE_KEY) === '1';
        }
    } catch (error) {
        stageDebugEnabled = false;
    }

    document.documentElement?.classList.toggle('yanqi-stage-debug', stageDebugEnabled);
    document.body?.classList.toggle('yanqi-stage-debug', stageDebugEnabled);
    return stageDebugEnabled;
}

const isStageDebugModeEnabled = resolveStageDebugMode();

/**
 * persistStageDebugMode(enabled) - 把舞台调试开关写入本地存储，并同步根节点类名
 * @param {boolean} enabled - 是否启用舞台调试
 * @returns {void}
 */
function persistStageDebugMode(enabled) {
    const nextEnabled = Boolean(enabled);

    try {
        if (nextEnabled) {
            localStorage.setItem(STAGE_DEBUG_STORAGE_KEY, '1');
        } else {
            localStorage.removeItem(STAGE_DEBUG_STORAGE_KEY);
        }
    } catch (error) {
        // 本地存储不可用时静默降级，保持按钮仍可点击。
    }

    document.documentElement?.classList.toggle('yanqi-stage-debug', nextEnabled);
    document.body?.classList.toggle('yanqi-stage-debug', nextEnabled);
}

/**
 * stripStageDebugQueryFromUrl() - 移除 stageDebug query，避免按钮切换后被旧 query 覆盖
 * @returns {void}
 */
function stripStageDebugQueryFromUrl() {
    try {
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete(STAGE_DEBUG_QUERY_KEY);
        window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    } catch (error) {
        // URL 处理失败时保留当前地址，不影响主流程。
    }
}

/**
 * setupStageDebugToggle() - 给页面底部的舞台调试按钮绑定状态和切换逻辑
 * @returns {void}
 */
function setupStageDebugToggle() {
    const toggle = document.querySelector('[data-stage-debug-toggle]');
    if (!toggle) {
        return;
    }

    const state = toggle.querySelector('[data-stage-debug-state]');
    const syncState = (enabled) => {
        toggle.classList.toggle('is-active', enabled);
        toggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        toggle.setAttribute('aria-label', enabled ? '关闭舞台调试' : '打开舞台调试');
        toggle.setAttribute('title', enabled ? '关闭舞台调试' : '打开舞台调试');
        if (state) {
            state.textContent = enabled ? '调试中' : '';
        }
    };

    syncState(isStageDebugModeEnabled);

    toggle.addEventListener('click', () => {
        const nextEnabled = !toggle.classList.contains('is-active');
        persistStageDebugMode(nextEnabled);
        syncState(nextEnabled);
        stripStageDebugQueryFromUrl();
        window.location.reload();
    });
}

// 价格工具：负责从原始价格文本里提取数值，并统一转换为当前展示货币格式。
/**
 * extractCurrencyAmount(priceText) - 从价格文本中提取数值部分
 * @param {string} priceText - 原始价格文本
 * @returns {number} - 提取后的金额数值
 */
function extractCurrencyAmount(priceText) {
    return sharedPriceTools && typeof sharedPriceTools.extractCurrencyAmount === 'function'
        ? sharedPriceTools.extractCurrencyAmount(priceText)
        : 0;
}

/**
 * formatDisplayPriceValue(value) - 把金额数值格式化为人民币文本
 * @param {number} value - 需要格式化的金额
 * @returns {string} - 人民币格式价格字符串
 */
function formatDisplayPriceValue(value) {
    return sharedPriceTools && typeof sharedPriceTools.formatPrice === 'function'
        ? sharedPriceTools.formatPrice(value)
        : `¥${Math.max(0, Math.round(Number(value) || 0)).toLocaleString('zh-CN')}`;
}

/**
 * normalizeDisplayPriceText(priceText) - 将原始价格文本整理为共享人民币价格文本
 * @param {string} priceText - 原始价格文本
 * @returns {string} - 转换后的人民币价格文本
 */
function normalizeDisplayPriceText(priceText) {
    return sharedPriceTools && typeof sharedPriceTools.normalizePriceText === 'function'
        ? sharedPriceTools.normalizePriceText(priceText)
        : String(priceText || '');
}

/**
 * getSpotBasePriceText(spotId, fallbackPriceText) - 获取详情页当前海域的统一起价文本
 * @param {number|string} spotId - 潜点 id
 * @param {string} fallbackPriceText - 兜底价格文本
 * @returns {string} - 当前海域起价文本
 */
function getSpotBasePriceText(spotId, fallbackPriceText) {
    return sharedPriceTools && typeof sharedPriceTools.getDestinationPriceText === 'function'
        ? sharedPriceTools.getDestinationPriceText(spotId, fallbackPriceText)
        : normalizeDisplayPriceText(fallbackPriceText);
}

/**
 * convertSpotPriceDisplay(spots) - 批量转换潜点数据中的价格展示字段
 * @param {Object} spots - 原始潜点数据对象
 * @returns {Object} - 转换后的潜点数据对象
 */
function convertSpotPriceDisplay(spots) {
    return Object.fromEntries(
        Object.entries(spots).map(([spotId, spot]) => [
            spotId,
            {
                ...spot,
                priceFrom: getSpotBasePriceText(spotId, spot.priceFrom),
                itineraries: Array.isArray(spot.itineraries)
                    ? spot.itineraries.map((item) => ({
                        ...item,
                        price: normalizeDisplayPriceText(item.price)
                    }))
                    : [],
                related: Array.isArray(spot.related)
                    ? spot.related.map((item) => ({
                        ...item,
                        price: getSpotBasePriceText(item.id, item.price)
                    }))
                    : []
            }
        ])
    );
}

function getCatalogSpotById(spotId) {
    return sharedSpotCatalog && typeof sharedSpotCatalog.getById === 'function'
        ? sharedSpotCatalog.getById(spotId)
        : null;
}

function getMapCatalogSpotById(spotId) {
    return sharedSpotMapCatalog && typeof sharedSpotMapCatalog.getById === 'function'
        ? sharedSpotMapCatalog.getById(spotId)
        : null;
}

function injectCatalogIdentityForDetailItem(record, fallbackId) {
    const normalizedFallbackId = Number(fallbackId);
    const candidateId = Number(record?.id);
    const catalogSpot = getCatalogSpotById(Number.isFinite(candidateId) ? candidateId : normalizedFallbackId);

    if (!catalogSpot) {
        return record;
    }

    return {
        ...record,
        id: Number.isFinite(candidateId) ? candidateId : catalogSpot.id,
        key: catalogSpot.key,
        name: catalogSpot.name,
        englishName: catalogSpot.englishName,
        tagline: catalogSpot.tagline,
        image: record?.image || catalogSpot.image,
        season: catalogSpot.season
    };
}

function injectCatalogIdentityForDetailSpots(spots) {
    return Object.fromEntries(
        Object.entries(spots).map(([spotId, spot]) => {
            const normalizedSpotId = Number(spotId);
            const mergedSpot = injectCatalogIdentityForDetailItem(spot, normalizedSpotId);
            const relatedList = Array.isArray(mergedSpot.related)
                ? mergedSpot.related.map((item) => injectCatalogIdentityForDetailItem(item, item?.id))
                : [];

            return [
                spotId,
                {
                    ...mergedSpot,
                    related: relatedList
                }
            ];
        })
    );
}

function injectSpotMapDataForDetailSpots(spots) {
    return Object.fromEntries(
        Object.entries(spots).map(([spotId, spot]) => {
            const normalizedSpotId = Number(spotId);
            const mapRecord = getMapCatalogSpotById(normalizedSpotId);

            return [
                spotId,
                {
                    ...spot,
                    map: mapRecord ? {
                        ...mapRecord
                    } : null
                }
            ];
        })
    );
}

function formatLatLngDisplay(coords) {
    if (!Array.isArray(coords) || coords.length < 2) {
        return '';
    }

    const [lat, lng] = coords;
    const latDirection = lat >= 0 ? '北纬' : '南纬';
    const lngDirection = lng >= 0 ? '东经' : '西经';
    return `${latDirection} ${Math.abs(lat).toFixed(3)}°, ${lngDirection} ${Math.abs(lng).toFixed(3)}°`;
}

function expandLatLngBounds(bounds, factor = 0.12, lngFactor = factor) {
    if (!Array.isArray(bounds) || bounds.length !== 2) {
        return null;
    }

    const [[south, west], [north, east]] = bounds;
    const latPad = (north - south) * factor;
    const lngPad = (east - west) * lngFactor;
    return [
        [south - latPad, west - lngPad],
        [north + latPad, east + lngPad]
    ];
}

function tileXToLng(x, zoom) {
    return ((Number(x) || 0) / (2 ** zoom)) * 360 - 180;
}

function tileYToLat(y, zoom) {
    const normalizedZoom = Math.max(0, Number(zoom) || 0);
    const n = Math.PI - ((2 * Math.PI * (Number(y) || 0)) / (2 ** normalizedZoom));
    return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

function latToTileY(lat, zoom) {
    const normalizedZoom = Math.max(0, Number(zoom) || 0);
    const maxLat = 85.05112878;
    const clampedLat = Math.max(-maxLat, Math.min(maxLat, Number(lat) || 0));
    const latRad = clampedLat * Math.PI / 180;
    const n = 2 ** normalizedZoom;
    return (
        (1 - (Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI)) / 2
    ) * n;
}

function padLatLngBoundsByTiles(bounds, zoom, latTiles = 0, lngTiles = latTiles) {
    if (!Array.isArray(bounds) || bounds.length !== 2) {
        return null;
    }

    const normalizedZoom = Math.max(0, Number(zoom) || 0);
    const [[south, west], [north, east]] = bounds;
    const latCenter = (south + north) / 2;
    const tileLngSpan = 360 / (2 ** normalizedZoom);
    const tileY = latToTileY(latCenter, normalizedZoom);
    const tileLatSpan = Math.abs(tileYToLat(Math.floor(tileY), normalizedZoom) - tileYToLat(Math.floor(tileY) + 1, normalizedZoom));
    const latPad = tileLatSpan * Math.max(0, Number(latTiles) || 0);
    const lngPad = tileLngSpan * Math.max(0, Number(lngTiles) || 0);

    return [
        [south - latPad, west - lngPad],
        [north + latPad, east + lngPad]
    ];
}

function normalizeSeaAtlasPackEntryPath(value) {
    return String(value || '')
        .replace(/\\/g, '/')
        .replace(/^\.?\//, '');
}

function getSeaAtlasPackRegistry() {
    if (!window.__YANQI_SEA_ATLAS_PACKS__) {
        window.__YANQI_SEA_ATLAS_PACKS__ = Object.create(null);
    }

    return window.__YANQI_SEA_ATLAS_PACKS__;
}

function getSeaAtlasPackRegistryKey(packPath) {
    const normalizedPath = normalizeSeaAtlasPackEntryPath(packPath).split('?')[0];
    const filename = normalizedPath.split('/').pop() || '';
    return filename
        .replace(/\.pack\.js$/i, '')
        .replace(/\.js$/i, '')
        .trim();
}

function buildSeaAtlasScriptPackArchive(packPath, rawPack) {
    const files = new Map();
    Object.entries(rawPack?.tiles || {}).forEach(([entryName, entryData]) => {
        const normalizedEntryName = normalizeSeaAtlasPackEntryPath(entryName);
        if (!normalizedEntryName || typeof entryData !== 'string') {
            return;
        }

        files.set(normalizedEntryName, entryData);
    });

    return {
        packPath,
        manifest: rawPack?.manifest || null,
        files,
        dataUrls: new Map()
    };
}

async function loadSeaAtlasTilePackArchive(packPath, packFormat = 'script') {
    if (!packPath) {
        throw new Error('Missing sea atlas pack path');
    }

    const existingArchive = seaAtlasPackCache.get(packPath);
    if (existingArchive) {
        return existingArchive;
    }

    const archivePromise = (async () => {
        if (packFormat !== 'script') {
            throw new Error(`Unsupported sea atlas pack format: ${packFormat || 'unknown'}`);
        }

        const registryKey = getSeaAtlasPackRegistryKey(packPath);
        const registry = getSeaAtlasPackRegistry();
        if (registry[registryKey]) {
            return buildSeaAtlasScriptPackArchive(packPath, registry[registryKey]);
        }

        await new Promise((resolve, reject) => {
            let script = document.head?.querySelector(`script[data-sea-atlas-pack="${packPath}"]`) || null;
            const handleLoad = () => {
                script?.setAttribute('data-sea-atlas-pack-ready', 'true');
                resolve();
            };
            const handleError = () => {
                script?.remove();
                reject(new Error(`Failed to load sea atlas pack script: ${packPath}`));
            };

            if (!script) {
                script = document.createElement('script');
                script.src = packPath;
                script.async = true;
                script.setAttribute('data-sea-atlas-pack', packPath);
                script.addEventListener('load', handleLoad, {
                    once: true
                });
                script.addEventListener('error', handleError, {
                    once: true
                });
                document.head?.appendChild(script);
                return;
            }

            if (script.getAttribute('data-sea-atlas-pack-ready') === 'true') {
                resolve();
                return;
            }

            script.addEventListener('load', handleLoad, {
                once: true
            });
            script.addEventListener('error', handleError, {
                once: true
            });
        });

        if (!registry[registryKey]) {
            throw new Error(`Sea atlas pack script loaded without registry payload: ${packPath}`);
        }

        return buildSeaAtlasScriptPackArchive(packPath, registry[registryKey]);
    })();

    seaAtlasPackCache.set(packPath, archivePromise);
    return archivePromise;
}

async function resolveSeaAtlasPackedTileUrl(packPath, packFormat, coords) {
    const archive = await loadSeaAtlasTilePackArchive(packPath, packFormat);
    const entryPath = normalizeSeaAtlasPackEntryPath(`${coords.z}/${coords.x}/${coords.y}.webp`);
    const tileData = archive.files.get(entryPath);
    if (!tileData) {
        return null;
    }

    const cachedUrl = archive.dataUrls.get(entryPath);
    if (cachedUrl) {
        return cachedUrl;
    }

    const dataUrl = tileData.startsWith('data:')
        ? tileData
        : `data:image/webp;base64,${tileData}`;
    archive.dataUrls.set(entryPath, dataUrl);
    return dataUrl;
}

function ensureSeaAtlasPackedTileLayerClass() {
    if (SeaAtlasPackedTileLayerClass || !window.L) {
        return SeaAtlasPackedTileLayerClass;
    }

    SeaAtlasPackedTileLayerClass = window.L.TileLayer.extend({
        initialize(packPath, packFormat, options = {}) {
            this._seaAtlasPackPath = packPath;
            this._seaAtlasPackFormat = packFormat || 'script';
            window.L.TileLayer.prototype.initialize.call(this, '', options);
        },

        createTile(coords, done) {
            const tile = document.createElement('img');
            const tileSize = this.getTileSize();
            const urlZoom = typeof this._getZoomForUrl === 'function'
                ? this._getZoomForUrl()
                : coords.z;
            let completed = false;

            const finalize = (error = null) => {
                if (completed) {
                    return;
                }
                completed = true;
                if (typeof done === 'function') {
                    done(error, tile);
                }
            };

            tile.width = tileSize.x;
            tile.height = tileSize.y;
            tile.alt = '';
            tile.decoding = 'async';
            tile.className = 'leaflet-tile';
            tile.setAttribute('role', 'presentation');
            tile.onload = () => finalize(null);
            tile.onerror = () => finalize(new Error('Packed sea atlas tile failed to load'));

            resolveSeaAtlasPackedTileUrl(this._seaAtlasPackPath, this._seaAtlasPackFormat, {
                ...coords,
                z: urlZoom
            })
                .then((tileUrl) => {
                    if (!tileUrl) {
                        tile.onload = null;
                        tile.onerror = null;
                        tile.src = SEA_ATLAS_EMPTY_TILE_DATA_URI;
                        finalize(new Error(`Packed sea atlas tile missing: ${urlZoom}/${coords.x}/${coords.y}`));
                        return;
                    }

                    tile.src = tileUrl;
                })
                .catch((error) => {
                    tile.onload = null;
                    tile.onerror = null;
                    tile.src = SEA_ATLAS_EMPTY_TILE_DATA_URI;
                    finalize(error);
                });

            return tile;
        }
    });

    return SeaAtlasPackedTileLayerClass;
}

function createQuadraticBezierPoint(start, control, end, t) {
    const progress = Math.min(Math.max(Number(t) || 0, 0), 1);
    const inverse = 1 - progress;
    return {
        x: (inverse * inverse * start.x) + (2 * inverse * progress * control.x) + (progress * progress * end.x),
        y: (inverse * inverse * start.y) + (2 * inverse * progress * control.y) + (progress * progress * end.y)
    };
}

/**
 * escapeHtml(value) - 转义文本内容，避免动态字符串写回模板时破坏结构
 * @param {*} value - 任意原始值
 * @returns {string} - 可安全插入 HTML 的字符串
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * createBufferedLiveAnnouncer(target, delay) - 为详情页动态区域创建合并摘要播报器
 * @param {HTMLElement|null} target - 隐藏 live 区域节点
 * @param {number} delay - 合并等待时长
 * @returns {(message: string) => void} - 可重复调用的播报函数
 */
function createBufferedLiveAnnouncer(target, delay = 320) {
    let timer = 0;

    return (message) => {
        if (!target) {
            return;
        }

        const nextMessage = String(message || '').trim();
        if (!nextMessage) {
            return;
        }

        if (timer) {
            window.clearTimeout(timer);
        }

        timer = window.setTimeout(() => {
            target.textContent = '';
            window.requestAnimationFrame(() => {
                target.textContent = nextMessage;
            });
            timer = 0;
        }, delay);
    };
}

/**
 * scheduleIdleTask(callback, timeout) - 在空闲时机安排轻量后置任务，并提供取消句柄
 * @param {Function} callback - 需要执行的回调
 * @param {number} timeout - 最长等待时长
 * @returns {() => void} - 取消当前空闲任务的函数
 */
function scheduleIdleTask(callback, timeout = 1200) {
    if (typeof callback !== 'function') {
        return () => {};
    }

    let settled = false;
    let idleId = 0;
    let timerId = 0;

    const finish = () => {
        if (settled) {
            return;
        }

        settled = true;
        callback();
    };

    if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(finish, {
            timeout: Math.max(0, Math.round(timeout) || 0)
        });
    } else {
        timerId = window.setTimeout(finish, Math.min(Math.max(0, Math.round(timeout) || 0), 640));
    }

    return () => {
        settled = true;
        if (idleId && 'cancelIdleCallback' in window) {
            window.cancelIdleCallback(idleId);
        }
        if (timerId) {
            window.clearTimeout(timerId);
        }
    };
}

/**
 * createDeferredSectionBootstrap(target, bootstrap, options) - 把详情页非首屏区块延后到接近视口时再真正渲染
 * @param {Element|null} target - 需要监听的区块锚点
 * @param {Function} bootstrap - 真正执行渲染的函数
 * @param {{ immediate?: boolean, rootMargin?: string, threshold?: number|number[], enableIdleBootstrap?: boolean, idleTimeoutMs?: number|null }} options - 触发配置
 * @returns {{ run: Function, destroy: Function }} - 手动触发和销毁句柄
 */
function createDeferredSectionBootstrap(target, bootstrap, options = {}) {
    const {
        immediate = false,
        rootMargin = '0px 0px 24% 0px',
        threshold = 0.01,
        enableIdleBootstrap = false,
        idleTimeoutMs = 0
    } = options;

    let settled = false;
    let observer = null;
    let cancelIdle = () => {};

    const cleanup = () => {
        observer?.disconnect();
        observer = null;
        cancelIdle();
        cancelIdle = () => {};
    };

    const run = () => {
        if (settled) {
            return false;
        }

        settled = true;
        cleanup();
        bootstrap();
        return true;
    };

    const destroy = () => {
        settled = true;
        cleanup();
    };

    if (!target) {
        run();
        return { run, destroy };
    }

    if (immediate) {
        run();
        return { run, destroy };
    }

    if (enableIdleBootstrap && idleTimeoutMs !== null) {
        cancelIdle = scheduleIdleTask(run, idleTimeoutMs);
    }

    if (!('IntersectionObserver' in window)) {
        run();
        return { run, destroy };
    }

    observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
            run();
        }
    }, {
        rootMargin,
        threshold
    });
    observer.observe(target);

    return { run, destroy };
}

const DETAIL_REVIEW_CONTENT_SCRIPT_SRC = 'js/detail-review-content.js';
let detailReviewContentPromise = null;

/**
 * loadDetailReviewContent() - 延迟加载详情页评论原始内容模块，并复用同一份 Promise
 * @returns {Promise<{ buildRawReviews: Function }>} - 评论原始内容接口
 */
function loadDetailReviewContent() {
    if (window.YanqiDetailReviewContent?.buildRawReviews) {
        return Promise.resolve(window.YanqiDetailReviewContent);
    }

    if (detailReviewContentPromise) {
        return detailReviewContentPromise;
    }

    detailReviewContentPromise = new Promise((resolve, reject) => {
        const existingScript = document.querySelector('script[data-detail-review-content-script="true"]');
        if (existingScript) {
            existingScript.addEventListener('load', () => {
                if (window.YanqiDetailReviewContent?.buildRawReviews) {
                    resolve(window.YanqiDetailReviewContent);
                    return;
                }

                reject(new Error('Yanqi detail review content loaded without buildRawReviews().'));
            }, { once: true });
            existingScript.addEventListener('error', () => {
                detailReviewContentPromise = null;
                reject(new Error(`Failed to load ${DETAIL_REVIEW_CONTENT_SCRIPT_SRC}.`));
            }, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = DETAIL_REVIEW_CONTENT_SCRIPT_SRC;
        script.async = true;
        script.dataset.detailReviewContentScript = 'true';
        script.addEventListener('load', () => {
            if (window.YanqiDetailReviewContent?.buildRawReviews) {
                resolve(window.YanqiDetailReviewContent);
                return;
            }

            detailReviewContentPromise = null;
            reject(new Error('Yanqi detail review content loaded without buildRawReviews().'));
        }, { once: true });
        script.addEventListener('error', () => {
            detailReviewContentPromise = null;
            reject(new Error(`Failed to load ${DETAIL_REVIEW_CONTENT_SCRIPT_SRC}.`));
        }, { once: true });
        document.head.appendChild(script);
    });

    return detailReviewContentPromise;
}

/**
 * restartTransientClassAnimation(element, className) - 用下一帧重新挂载状态类，避免为了重启动画强制回流。
 * @param {HTMLElement|null} element - 目标节点
 * @param {string} className - 需要重启的状态类
 * @returns {void}
 */
function restartTransientClassAnimation(element, className) {
    if (!element || !className) {
        return;
    }

    element.classList.remove(className);
    window.requestAnimationFrame(() => {
        if (element.isConnected) {
            element.classList.add(className);
        }
    });
}

/**
 * prefersReducedMotion() - 读取系统是否要求弱化复杂动画
 * @returns {boolean} - 当前是否启用 reduced motion
 */
function prefersReducedMotion() {
    return typeof window.matchMedia === 'function'
        && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

// 潜点主数据：这里集中定义每个潜点的文案、图片、套餐、评论与相关推荐信息。
const divingSpotDetails = convertSpotPriceDisplay(injectSpotMapDataForDetailSpots(injectCatalogIdentityForDetailSpots({
    1: {
        name: '诗巴丹',
        tagline: '鱼群会先靠近，海墙随后把整片蓝慢慢放深。',
        image: 'assets/images/sipadan.jpg',
        difficulty: '需要流潜经验',
        depth: '5-40m',
        season: '3-10月',
        priceFrom: '¥3,980',
        mapLocation: '马来西亚沙巴州 · 诗巴丹',
        coordinates: '北纬 4.2°, 东经 118.6°',
        features: {
            location: '诗巴丹位于马来西亚沙巴州外海，坐落在苏禄海深蓝水域之中。这里以陡降海墙、强劲流场和高密度的大型鱼群著称，是许多潜水员心中的朝圣潜点。',
            wildlife: [
                '黑鳍礁鲨、白鳍礁鲨与杰克风暴',
                '绿海龟、玳瑁海龟与鹰鳐',
                '梭鱼风暴与大群隆头鹦哥鱼',
                '海狼、笛鲷、拿破仑与大型石斑',
                '软珊瑚与陡峭海墙上的丰富附着生物'
            ],
            warnings: [
                '洋流变化明显，建议拥有进阶开放水域及以上经验',
                '热门潜点需要提早预约名额，旺季更紧张',
                '海墙潜水深度变化快，需严格控制中性浮力',
                '注意补水和防晒，船程较长时建议备好晕船药'
            ],
            weather: {
                season: '3月-10月',
                temperature: '26-28°C',
                visibility: '15-30米'
            }
        },
        itineraries: [
            {
                name: '3天2晚经典流潜',
                includes: '2次主潜点流潜 + 1次黄昏潜 + 中文向导 + 船上午餐',
                price: '¥3,980'
            },
            {
                name: '5天4晚海狼风暴线',
                includes: '5次核心潜点 + 2次深潜 + 装备协助 + 全程住宿接驳',
                price: '¥6,980'
            },
            {
                name: '7天6晚深蓝进阶营',
                includes: '7次日潜 + 2次夜潜 + 高氧支持 + 海墙技巧训练',
                price: '¥9,280'
            }
        ],
        reviews: [
            {
                user: '海流追踪者',
                rating: '★★★★★',
                date: '2026-01-18',
                text: '第一次在诗巴丹看到梭鱼风暴，整片海水都像在旋转，冲击力非常强。向导对流向判断很准，整趟潜得又稳又过瘾。'
            },
            {
                user: '深蓝旅人',
                rating: '★★★★★',
                date: '2025-12-06',
                text: '海龟数量远超预期，海墙也非常壮观。这里的重点不是慢悠悠拍照，而是投入那种被鱼群包围的气势。'
            },
            {
                user: '盐线记录员',
                rating: '★★★★☆',
                date: '2025-11-22',
                text: '强流确实比一般热带海岛更考验经验，但也正因为这样，整片海域的生命力非常高，值得专门来一次。'
            }
        ],
        related: [
            {
                id: 2,
                name: '帕劳',
                description: '蓝洞、断层与外海光线，会把层次慢慢推开。',
                image: 'assets/images/palau.jpg',
                price: '¥4,280'
            },
            {
                id: 3,
                name: '大蓝洞',
                description: '伯利兹的深蓝之眼，垂直洞穴地貌震撼。',
                image: 'assets/images/blue-hole.jpg',
                price: '¥5,680'
            },
            {
                id: 4,
                name: '帝汶岛',
                description: '珊瑚花园和大坡度海底地形并存，层次丰富。',
                image: 'assets/images/timor-hero.jpg',
                price: '¥3,480'
            }
        ]
    },
    2: {
        name: '帕劳',
        tagline: '让光线、断层与洋流在同一片蓝里慢慢排开。',
        image: 'assets/images/palau.jpg',
        difficulty: '适合已有外海经验',
        depth: '8-35m',
        season: '11月-次年5月',
        priceFrom: '¥4,280',
        mapLocation: '帕劳共和国 · 科罗尔外海',
        coordinates: '北纬 7.3°, 东经 134.5°',
        features: {
            location: '帕劳由众多石灰岩岛屿和外海平台组成，蓝洞、蓝角、大断层等经典潜点分布集中，适合连续多天深度探索。',
            wildlife: [
                '灰礁鲨、白鳍鲨与成群梭鱼',
                '海龟、鹰鳐和大群笛鲷',
                '蓝角常见巨型拿破仑与金枪鱼巡游',
                '蓝洞光柱中可见玻璃鱼与清洁虾',
                '珊瑚台地上软珊瑚与海扇茂盛'
            ],
            warnings: [
                '外海流场强弱变化快，需听从船宿和向导节奏',
                '蓝洞与洞穴地形对下潜节奏和耳压平衡要求较高',
                '拍摄光柱时容易分心，注意队伍距离',
                '部分潜点出水需放流，务必确认 SMB 使用方法'
            ],
            weather: {
                season: '11月-次年5月',
                temperature: '27-29°C',
                visibility: '20-35米'
            }
        },
        itineraries: [
            {
                name: '4天3晚蓝洞经典线',
                includes: '蓝洞 + 蓝角 + 大断层 + 中文向导 + 船上简餐',
                price: '¥4,280'
            },
            {
                name: '6天5晚洋流巡航',
                includes: '6次核心潜点 + 2次漂流潜 + 珊瑚台地拍摄支持',
                price: '¥7,180'
            },
            {
                name: '8天7晚帕劳全景深潜',
                includes: '8次日潜 + 蓝洞专题 + 水下摄影陪潜 + 住宿接送',
                price: '¥10,380'
            }
        ],
        reviews: [
            {
                user: '蓝门观察者',
                rating: '★★★★★',
                date: '2026-02-03',
                text: '蓝洞的光柱像舞台灯光一样从头顶打下来，出洞后直接接上蓝角的鱼群，节奏非常完整。'
            },
            {
                user: '海风校准员',
                rating: '★★★★☆',
                date: '2025-12-18',
                text: '帕劳很适合已经有几次外海经验的潜水员，既能看景，也能体验流潜的速度感。'
            },
            {
                user: '礁墙写作者',
                rating: '★★★★★',
                date: '2025-10-29',
                text: '大断层层次分明，视野特别开阔，向导也很会带位置，几次转身都能撞上惊喜。'
            }
        ],
        related: [
            {
                id: 1,
                name: '诗巴丹',
                description: '海狼风暴密度惊人，是典型的大鱼潜点。',
                image: 'assets/images/sipadan.jpg',
                price: '¥3,980'
            },
            {
                id: 3,
                name: '大蓝洞',
                description: '如果喜欢洞穴感和垂直深井，大蓝洞更极致。',
                image: 'assets/images/blue-hole.jpg',
                price: '¥5,680'
            },
            {
                id: 7,
                name: '科莫多',
                description: '同样是流潜胜地，但地形和鱼群风格完全不同。',
                image: 'assets/images/komodo-review-2-feature.jpg',
                price: '¥3,880'
            }
        ]
    },
    3: {
        name: '大蓝洞',
        tagline: '像从海面缓慢下望，看到一口更深的蓝在安静张开。',
        image: 'assets/images/blue-hole.jpg',
        difficulty: '适合深潜与结构观察',
        depth: '18-40m',
        season: '4月-6月',
        priceFrom: '¥5,680',
        mapLocation: '伯利兹外海 · 大蓝洞',
        coordinates: '北纬 17.3°, 西经 87.5°',
        features: {
            location: '大蓝洞位于伯利兹外海，是一个近乎完美的圆形海底塌陷结构。它以深邃的蓝色井口和巨大的钟乳石洞顶闻名，是经典的世界级地标潜点。',
            wildlife: [
                '加勒比礁鲨、护士鲨与大型梭鱼',
                '洞壁附近常见银鱼和玻璃鱼群',
                '外围珊瑚环礁有鹰鳐和海龟巡游',
                '回程常能遇见海豚或飞鱼',
                '环礁浅区的珊瑚和海扇保存良好'
            ],
            warnings: [
                '整体偏深，适合有深潜经验的潜水员',
                '大蓝洞重点在地貌体验，不是高密度生物型潜点',
                '下潜和返程时间控制严格，需精确管理气体',
                '长航程出海较常见，建议准备防晒与晕船药'
            ],
            weather: {
                season: '4月-6月',
                temperature: '26-28°C',
                visibility: '25-40米'
            }
        },
        itineraries: [
            {
                name: '3天2晚蓝洞首潜',
                includes: '大蓝洞 + 灯塔礁 + 半月岛 + 资深向导',
                price: '¥5,680'
            },
            {
                name: '5天4晚深井结构线',
                includes: '蓝洞双潜 + 环礁外墙 + 洞顶地形讲解 + 住宿早餐',
                price: '¥8,480'
            },
            {
                name: '7天6晚伯利兹大环礁',
                includes: '蓝洞专题 + 7次日潜 + 摄影位点优化 + 机场接送',
                price: '¥11,680'
            }
        ],
        reviews: [
            {
                user: '深井记录员',
                rating: '★★★★★',
                date: '2026-01-09',
                text: '从海面看像一块纯色宝石，下去以后则像进入了另一种地质空间，洞顶结构非常震撼。'
            },
            {
                user: '蓝洞边缘人',
                rating: '★★★★☆',
                date: '2025-12-01',
                text: '这里不是那种鱼群炸裂的路线，但地形体验独一无二，尤其适合把深潜当作一次仪式来完成。'
            },
            {
                user: '环礁回声',
                rating: '★★★★★',
                date: '2025-09-14',
                text: '外围珊瑚环礁和蓝洞主体形成强烈反差，一趟出海里能同时收获热带色彩和深蓝压迫感。'
            }
        ],
        related: [
            {
                id: 2,
                name: '帕劳',
                description: '同样兼具洞穴与外海，但帕劳更强调洋流和大景。',
                image: 'assets/images/palau.jpg',
                price: '¥4,280'
            },
            {
                id: 6,
                name: '布纳肯',
                description: '如果想从地貌压迫感切回墙潜、海龟和更明亮的蓝水，布纳肯会更舒展。',
                image: 'assets/images/bunaken.jpg',
                price: '¥3,680'
            },
            {
                id: 8,
                name: '图阿莫图',
                description: '同样拥有开阔蓝水，但风格更偏环礁通道和鲨鱼。',
                image: 'assets/images/tuamotu.jpg',
                price: '¥4,180'
            }
        ]
    },
    4: {
        name: '帝汶岛',
        tagline: '光线落在珊瑚坡地上，整片海会显得更舒展一些。',
        image: 'assets/images/timor-hero.jpg',
        difficulty: '适合慢慢进入',
        depth: '6-32m',
        season: '4月-11月',
        priceFrom: '¥3,480',
        mapLocation: '印度尼西亚 · 帝汶岛',
        coordinates: '南纬 10.2°, 东经 123.6°',
        features: {
            location: '帝汶岛位于印度尼西亚东努沙登加拉群岛，岸潜和船潜资源都很丰富。这里的海底坡地连绵，珊瑚覆盖度高，整体节奏更从容，适合长时间停留。',
            wildlife: [
                '海龟、海蛇和礁栖石斑',
                '微距爱好者常见裸鳃、海蛞蝓和小型甲壳类',
                '浅区珊瑚花园中鱼群密度高',
                '外坡偶尔可见鹰鳐与金枪鱼巡游',
                '夜潜经常有章鱼和螳螂虾活动'
            ],
            warnings: [
                '部分岸潜入口为碎石或珊瑚沙，需留意脚下',
                '雨季能见度波动较大，行程建议避开高降雨周',
                '长时间微距拍摄容易忽略用气，需定期互相确认',
                '部分海岸线补给点较少，建议提前准备个人用品'
            ],
            weather: {
                season: '4月-11月',
                temperature: '27-29°C',
                visibility: '12-25米'
            }
        },
        itineraries: [
            {
                name: '3天2晚珊瑚花园线',
                includes: '岸潜 + 浅坡珊瑚带 + 夜潜体验 + 酒店接送',
                price: '¥3,480'
            },
            {
                name: '5天4晚微距巡礼',
                includes: '5次精选潜点 + 微距向导 + 夜潜一次 + 装备冲洗服务',
                price: '¥5,480'
            },
            {
                name: '7天6晚帝汶慢潜假期',
                includes: '7次日潜 + 2次夜潜 + 海岸拍摄日 + 住宿早餐',
                price: '¥7,980'
            }
        ],
        reviews: [
            {
                user: '珊瑚花园巡航员',
                rating: '★★★★★',
                date: '2026-01-27',
                text: '先看见阿陶罗的岛影，再慢慢下到珊瑚坡地里，帝汶的节奏会比很多地方更从容，也更适合把时间放长。'
            },
            {
                user: '夜潜观察笔记',
                rating: '★★★★☆',
                date: '2025-11-19',
                text: '白天看坡地和珊瑚，傍晚回到帝力海边再看一会儿风和水色，整趟行程会有一种慢慢收住的完整感。'
            },
            {
                user: '浅坡漫游者',
                rating: '★★★★★',
                date: '2025-09-02',
                text: 'One Dollar Beach 一带的海岸线和清亮浅水很适合留白，不会一直催着你赶潜点，这点特别难得。'
            }
        ],
        related: [
            {
                id: 5,
                name: '波纳佩岛',
                description: '同样适合慢潜和生态观察，但生物类型更偏微观。',
                image: 'assets/images/pohnpei.jpg',
                price: '¥2,980'
            },
            {
                id: 7,
                name: '科莫多',
                description: '如果想从珊瑚花园切换到高能流潜，可以接科莫多。',
                image: 'assets/images/komodo-review-2-feature.jpg',
                price: '¥3,880'
            },
            {
                id: 8,
                name: '图阿莫图',
                description: '图阿莫图更偏开阔蓝水和环礁通道，风格差异明显。',
                image: 'assets/images/tuamotu.jpg',
                price: '¥4,180'
            }
        ]
    },
    5: {
        name: '波纳佩岛',
        tagline: '把注意力收回来以后，细小生命会一层层慢慢浮出来。',
        image: 'assets/images/pohnpei.jpg',
        difficulty: '适合恢复状态',
        depth: '5-24m',
        season: '全年适宜',
        priceFrom: '¥2,980',
        mapLocation: '密克罗尼西亚 · 波纳佩岛',
        coordinates: '北纬 6.9°, 东经 158.2°',
        features: {
            location: '波纳佩岛被热带雨林和环礁包围，海况通常较柔和。这里不以刺激的外海流潜见长，而以微距生态、软珊瑚和轻松的潜水节奏吸引人。',
            wildlife: [
                '海马、鬼龙、裸鳃和豆丁甲壳类',
                '软珊瑚平台上常见幼鱼和清洁站行为',
                '礁区可见小型鳐鱼、海蛇和乌贼',
                '夜潜时常有荧光生物和小型章鱼',
                '浅区海草床中容易遇见海兔与海蛞蝓'
            ],
            warnings: [
                '能见度不追求极致，更适合微距和慢节奏观察',
                '拍摄微距时要留意身体姿态，避免踢起底沙',
                '雨量大时部分岸线出海会受天气影响',
                '虽然整体节奏更轻，仍需注意潜后补水和休息'
            ],
            weather: {
                season: '全年适宜',
                temperature: '27-29°C',
                visibility: '8-18米'
            }
        },
        itineraries: [
            {
                name: '3天2晚微距入门线',
                includes: '3次轻松潜水 + 微距引导 + 夜潜一次 + 岸上简餐',
                price: '¥2,980'
            },
            {
                name: '5天4晚生态观察营',
                includes: '5次日潜 + 2次微距专题潜 + 摄影灯位建议',
                price: '¥4,580'
            },
            {
                name: '7天6晚慢潜记录周',
                includes: '7次潜水 + 夜潜两次 + 生物观察笔记 + 住宿接送',
                price: '¥6,380'
            }
        ],
        reviews: [
            {
                user: '云层下面',
                rating: '★★★★★',
                date: '2026-02-11',
                text: '飞进波纳佩时先看见的是泻湖、礁线和低云，整座岛像被几层海色慢慢托住。'
            },
            {
                user: '岸上还有水声',
                rating: '★★★★☆',
                date: '2025-12-27',
                text: '喜欢它不只是一片潜点，红树林、雨林和南马都把整趟行程继续往更深的地方带。'
            },
            {
                user: '静水记录本',
                rating: '★★★★★',
                date: '2025-10-08',
                text: '这里不是靠刺激取胜的海，而是会让呼吸、低云和慢潜节奏一起慢下来的地方。'
            }
        ],
        related: [
            {
                id: 4,
                name: '帝汶岛',
                description: '同样适合慢潜，但帝汶的坡地和珊瑚覆盖更宏观。',
                image: 'assets/images/timor-hero.jpg',
                price: '¥3,480'
            },
            {
                id: 6,
                name: '布纳肯',
                description: '从微距和慢潜切到海墙、海龟和更开阔的蓝水，是很自然的下一站。',
                image: 'assets/images/bunaken.jpg',
                price: '¥3,680'
            },
            {
                id: 8,
                name: '图阿莫图',
                description: '如果想从静水观察切换到开阔蓝水，可以去图阿莫图。',
                image: 'assets/images/tuamotu.jpg',
                price: '¥4,180'
            }
        ]
    },
    6: {
        name: '布纳肯',
        tagline: '海墙、海龟与清澈蓝水之间，保持刚好的安静',
        image: 'assets/images/bunaken.jpg',
        difficulty: '适合长线观察',
        depth: '6-30m',
        season: '3月-11月',
        priceFrom: '¥3,680',
        mapLocation: '印度尼西亚 · 布纳肯海洋公园',
        coordinates: '北纬 1.6°, 东经 124.8°',
        features: {
            location: '布纳肯位于印度尼西亚北苏拉威西外海，以能见度稳定的海墙、层次鲜明的礁坡和相对从容的热带节奏著称。这里不是最猛烈的海，却很容易让人一潜就慢下来。',
            wildlife: [
                '海墙沿线常见海龟停留、巡游与进食',
                '礁坡与蓝水交界处可见成群笛鲷、鲹鱼与金枪鱼',
                '软珊瑚、海扇与桶状海绵分布密集',
                '浅区珊瑚平台适合慢慢观察礁鱼和小型生物',
                '天气稳定时外侧蓝水区域常有更开阔的远景感'
            ],
            warnings: [
                '海墙边缘深度变化快，拍照时要特别留意中性浮力',
                '部分点位会有中等流速，入水前需明确集合与出水方式',
                '蓝水参照物较少，下潜中要持续关注队友距离',
                '阳光较强时表层温差明显，长时间船潜建议备好防晒与补水'
            ],
            weather: {
                season: '3月-11月',
                temperature: '27-29°C',
                visibility: '18-32米'
            }
        },
        itineraries: [
            {
                name: '4天3晚海墙初见线',
                includes: '4次经典海墙潜水 + 海龟观察位点 + 中文向导 + 船上午餐',
                price: '¥3,680'
            },
            {
                name: '6天5晚布纳肯主线',
                includes: '6次精选潜点 + 2次日落潜 + 海墙摄影支持 + 接送安排',
                price: '¥5,980'
            },
            {
                name: '8天7晚北苏拉威西慢潜周',
                includes: '8次日潜 + 海龟主题位点 + 珊瑚坡地慢潜 + 住宿接驳',
                price: '¥8,680'
            }
        ],
        reviews: [
            {
                user: '海墙停留者',
                rating: '★★★★★',
                date: '2026-01-12',
                text: '布纳肯很容易让人先记住岸边的小船和很静的清水，真正下到海墙外侧以后，那种通透的蓝才慢慢完全展开。'
            },
            {
                user: '海龟观察席',
                rating: '★★★★★',
                date: '2025-11-30',
                text: '海墙外侧的珊瑚层次很完整，不是一直在追刺激，而是会让你把呼吸、光线和鱼都慢慢看清楚。'
            },
            {
                user: '蓝水边界线',
                rating: '★★★★☆',
                date: '2025-10-21',
                text: '潜后回到岛上，沙滩、山体和海风会把整天重新接住。布纳肯最难得的，其实就是这种水下和岸上都很顺的平衡。'
            }
        ],
        related: [
            {
                id: 3,
                name: '大蓝洞',
                description: '如果想从舒展的海墙切到更垂直、更克制的深蓝结构，可以去大蓝洞。',
                image: 'assets/images/blue-hole.jpg',
                price: '¥5,680'
            },
            {
                id: 5,
                name: '波纳佩岛',
                description: '如果想把节奏再放慢一点，波纳佩岛会更偏向微距与静水观察。',
                image: 'assets/images/pohnpei.jpg',
                price: '¥2,980'
            },
            {
                id: 7,
                name: '科莫多',
                description: '如果想从布纳肯继续转向更强洋流和大景流潜，科莫多是自然延伸。',
                image: 'assets/images/komodo-review-2-feature.jpg',
                price: '¥3,880'
            }
        ]
    },
    7: {
        name: '科莫多',
        tagline: '流会更明显一些，大景与停顿也因此更有层次。',
        image: 'assets/images/komodo-review-2-feature.jpg',
        difficulty: '需要洋流适应',
        depth: '8-34m',
        season: '4月-11月',
        priceFrom: '¥3,880',
        mapLocation: '印度尼西亚 · 科莫多国家公园',
        coordinates: '南纬 8.6°, 东经 119.5°',
        features: {
            location: '科莫多国家公园位于印度尼西亚小巽他群岛之间，冷热海流交汇，带来高生产力和极强的海洋层次，是典型的流潜和大景型潜区。',
            wildlife: [
                '蝠鲼清洁站、礁鲨和大型梭鱼群',
                '大量笛鲷、鲹鱼和金枪鱼巡游',
                '珊瑚坡地上常见海蛞蝓和小型礁鱼',
                '运气好时可遇见海豚和鲸鲨过路',
                '软珊瑚、海扇和火珊瑚色彩鲜明'
            ],
            warnings: [
                '流速变化快，下潜前必须明确集合与出水方式',
                '部分潜点水温分层明显，建议准备适当防寒配置',
                '蝠鲼清洁站禁止追逐和压低高度',
                '拍摄和看大鱼时容易忽略队友距离，需持续观察'
            ],
            weather: {
                season: '4月-11月',
                temperature: '25-28°C',
                visibility: '15-28米'
            }
        },
        itineraries: [
            {
                name: '4天3晚蝠鲼追踪线',
                includes: '蝠鲼清洁站 + 经典流潜 + 中文向导 + 午餐补给',
                price: '¥3,880'
            },
            {
                name: '6天5晚科莫多主线',
                includes: '6次核心潜点 + 2次放流潜 + 海面观景行程',
                price: '¥6,280'
            },
            {
                name: '8天7晚国家公园全景',
                includes: '8次日潜 + 蝠鲼专题 + 岛上徒步 + 住宿接送',
                price: '¥8,980'
            }
        ],
        reviews: [
            {
                user: '流线捕捉者',
                rating: '★★★★★',
                date: '2026-02-07',
                text: '粉沙岸和亮蓝海水会先把科莫多点亮，真正进入流区以后，那种张力才会慢慢从海面以下推上来。'
            },
            {
                user: '蝠鲼旁观席',
                rating: '★★★★★',
                date: '2025-12-14',
                text: '船在干燥山体和开阔水道之间穿过去时，就已经能感到这片海的力量感。它不是急，而是一直在流动。'
            },
            {
                user: '热流边界线',
                rating: '★★★★☆',
                date: '2025-09-26',
                text: '回到拉布安巴霍的傍晚也很难忘，港湾、屋顶和停船的光一起把这片海收住，让科莫多不只剩下“强流”两个字。'
            }
        ],
        related: [
            {
                id: 2,
                name: '帕劳',
                description: '同样强调洋流和大景，但帕劳更偏洞穴与断层。',
                image: 'assets/images/palau.jpg',
                price: '¥4,280'
            },
            {
                id: 4,
                name: '帝汶岛',
                description: '想把节奏放慢时，帝汶岛会更舒服。',
                image: 'assets/images/timor-hero.jpg',
                price: '¥3,480'
            },
            {
                id: 8,
                name: '图阿莫图',
                description: '图阿莫图同样有强流和大鱼，但更偏环礁通道。',
                image: 'assets/images/tuamotu.jpg',
                price: '¥4,180'
            }
        ]
    },
    8: {
        name: '图阿莫图',
        tagline: '环礁通道把开阔蓝水一点点推近，张力却始终安静。',
        image: 'assets/images/tuamotu.jpg',
        difficulty: '适合通道与蓝水经验',
        depth: '10-32m',
        season: '5月-10月',
        priceFrom: '¥4,180',
        mapLocation: '法属波利尼西亚 · 图阿莫图群岛',
        coordinates: '南纬 16.1°, 西经 145.0°',
        features: {
            location: '图阿莫图由大量环礁组成，通道潜水是这里的核心魅力。潮汐带来的进出水流推动大鱼与鲨群活动，也让整片蓝水空间格外开阔。',
            wildlife: [
                '灰礁鲨、白鳍鲨与柠檬鲨',
                '海豚、金枪鱼和大型鲹鱼',
                '环礁边缘常见海龟和鹰鳐',
                '浅区珊瑚平台上密布成群礁鱼',
                '日落时段海面和浅水区色彩非常出众'
            ],
            warnings: [
                '通道流向受潮汐影响大，潜水计划需严格跟随时刻表',
                '下潜窗口明确，迟到或拖延会显著影响体验',
                '蓝水环境参照物少，需保持良好队形意识',
                '远程海岛补给有限，建议提前确认个人装备状态'
            ],
            weather: {
                season: '5月-10月',
                temperature: '25-27°C',
                visibility: '25-40米'
            }
        },
        itineraries: [
            {
                name: '4天3晚环礁通道初探',
                includes: '4次通道潜水 + 鲨鱼观察位点 + 船上简餐',
                price: '¥4,180'
            },
            {
                name: '6天5晚蓝水节奏线',
                includes: '6次潜水 + 潮汐窗口优化 + 水下摄影建议 + 酒店接送',
                price: '¥6,680'
            },
            {
                name: '8天7晚南太平洋环礁周',
                includes: '8次日潜 + 环礁双通道体验 + 海豚海面巡航',
                price: '¥9,580'
            }
        ],
        reviews: [
            {
                user: '通道潮汐表',
                rating: '★★★★★',
                date: '2026-01-31',
                text: '图阿莫图的蓝水很纯粹，能见度和空间感都非常强，鲨鱼是慢慢从远处显出来的，不是突然扑面而来。'
            },
            {
                user: '环礁漂流记',
                rating: '★★★★☆',
                date: '2025-12-20',
                text: '潮汐时间点卡得很准，向导安排很好。虽然不是每一潜都激烈，但整体蓝水氛围非常高级。'
            },
            {
                user: '南太平洋白噪声',
                rating: '★★★★★',
                date: '2025-10-12',
                text: '这里的开阔感让人特别容易放空，抬头是光，侧面是鲨鱼和大鱼，潜感很通透。'
            }
        ],
        related: [
            {
                id: 3,
                name: '大蓝洞',
                description: '同样有强烈的蓝色压迫感，但大蓝洞更偏垂直结构。',
                image: 'assets/images/blue-hole.jpg',
                price: '¥5,680'
            },
            {
                id: 4,
                name: '帝汶岛',
                description: '想从大开大合切换到珊瑚慢潜，可以去帝汶岛。',
                image: 'assets/images/timor-hero.jpg',
                price: '¥3,480'
            },
            {
                id: 7,
                name: '科莫多',
                description: '如果想要更强的流潜和蝠鲼机会，科莫多是自然延伸。',
                image: 'assets/images/komodo-review-2-feature.jpg',
                price: '¥3,880'
            }
        ]
    },
    9: {
        name: '马布岛',
        tagline: '把潜水、海风与慢一点的岛上时光，安静地放进同一次抵达。',
        image: 'assets/images/mabulc.jpg',
        difficulty: '入门友好',
        depth: '3-18m',
        season: '3月-10月',
        priceFrom: '¥3,580',
        mapLocation: '马来西亚沙巴州 · 马布岛',
        coordinates: '北纬 4.25°, 东经 118.63°',
        features: {
            location: '马布岛位于仙本那外海，和诗巴丹共享同一片海域气质，但节奏更慢、更贴近日常海岛生活。这里有水屋、木栈道、浅礁与丰富的小型生态，适合把潜水和停驻感放在一起。',
            wildlife: [
                '海龟、狮子鱼与礁栖石斑',
                '海马、裸鳃、鬼龙与小型甲壳类',
                '浅礁和码头下常见密集礁鱼与幼鱼群',
                '夜潜时容易遇见章鱼、海鳗与荧光小生物',
                '天气稳定时外侧蓝水区域也会有更开阔的热带海面感'
            ],
            warnings: [
                '码头和部分岸潜区域船只较多，下潜前需确认入水和集合位置',
                '浅水区生态丰富但更适合慢节奏观察，拍摄时要避免踢沙',
                '若安排与诗巴丹联潜，需要提早确认名额与出海时间',
                '海岛补给条件有限，建议提前准备个人常用药品与防晒用品'
            ],
            weather: {
                season: '3月-10月',
                temperature: '27-30°C',
                visibility: '10-22米'
            }
        },
        itineraries: [
            {
                name: '3天2晚浅礁慢潜线',
                includes: '2次船潜 + 1次码头或岸潜 + 水屋住宿 + 早餐',
                price: '¥3,580'
            },
            {
                name: '4天3晚马布停驻假期',
                includes: '4次潜水 + 1次夜潜 + 码头生态观察 + 欢迎晚餐',
                price: '¥5,180'
            },
            {
                name: '5天4晚马布 × 诗巴丹联潜',
                includes: '马布慢潜 + 诗巴丹名额协助 + 住宿接送 + 潜前 briefing',
                price: '¥7,280'
            }
        ],
        reviews: [
            {
                user: '码头晨光',
                rating: '★★★★★',
                date: '2026-02-14',
                text: '马布岛最打动人的不是某一个“必须去”的点，而是整座岛把潜水和生活放得很近。清晨走到码头边，海水就已经蓝得很安静。'
            },
            {
                user: '浅礁留白',
                rating: '★★★★☆',
                date: '2025-12-09',
                text: '这里很适合第一次把潜水和度假真正放在一起。海况不会一下子把人推深，回到岸上还能慢慢吃饭、看海，不会一直赶。'
            },
            {
                user: '水屋晚风',
                rating: '★★★★★',
                date: '2025-10-25',
                text: '潜完回到水屋，坐在阳台看海面颜色慢慢变暗，会觉得这趟旅行不是为了打卡，而是真的在海边停了下来。'
            }
        ],
        related: [
            {
                id: 1,
                name: '诗巴丹',
                description: '如果想从温柔浅礁走向更完整的大景和鱼群风暴，诗巴丹是最自然的下一站。',
                image: 'assets/images/sipadan.jpg',
                price: '¥3,980'
            },
            {
                id: 4,
                name: '帝汶岛',
                description: '同样适合慢节奏停驻，但帝汶会更偏向珊瑚坡地和更舒展的岸线。',
                image: 'assets/images/timor-hero.jpg',
                price: '¥3,480'
            },
            {
                id: 5,
                name: '波纳佩岛',
                description: '如果你喜欢把注意力收回到更细微的生命，波纳佩会更偏微距和静水观察。',
                image: 'assets/images/pohnpei.jpg',
                price: '¥2,980'
            }
        ]
    },
    10: {
        name: '马尔代夫船宿',
        tagline: '把环礁、蓝水与在船上醒来的清晨，安静地放进同一段航线。',
        image: 'assets/images/maldives-liveaboard.jpg',
        difficulty: '适合初次船宿',
        depth: '8-30m',
        season: '11月-次年4月',
        priceFrom: '¥6,880',
        mapLocation: '马尔代夫 · 北马累环礁至阿里环礁',
        coordinates: '北纬 4.3°, 东经 73.5°',
        features: {
            location: '这条船宿线通常从马累附近登船，在北马累、南马累和阿里环礁之间慢慢展开。和固定住在某一座岛不同，船宿会把潜点、海面和夜里的停泊感连成同一段海上节奏。',
            wildlife: [
                '护士鲨、灰礁鲨与成群杰克鱼',
                '海龟、鹰鳐与清洁站附近的蝠鲼机会',
                '环礁边缘常见拿破仑、梭鱼和大群笛鲷',
                '浅礁与沙地之间有丰富的小型礁鱼和甲壳类',
                '天气稳定时，海面与日出日落本身也会成为整段航线的重要记忆'
            ],
            warnings: [
                '船宿作息会比海岛酒店更集中，需适应连续出海和船上生活节奏',
                '不同航段流速和能见度变化明显，下潜前要认真听 brief',
                '对晕船敏感的潜水员建议提前准备药物并留意休息',
                '部分航线会根据海况临时调整顺序，船宿体验更依赖整体窗口判断'
            ],
            weather: {
                season: '11月-次年4月',
                temperature: '27-30°C',
                visibility: '18-30米'
            }
        },
        itineraries: [
            {
                name: '5天4晚环礁初识线',
                includes: '6次潜水 + 1次黄昏潜 + 船宿住宿 + 每日三餐',
                price: '¥6,880'
            },
            {
                name: '7天6晚马尔代夫船宿主线',
                includes: '10次潜水 + 环礁航线安排 + 中文向导 + 机场接送',
                price: '¥9,680'
            },
            {
                name: '8天7晚蓝水与航迹',
                includes: '12次潜水 + 日出甲板时段 + 潜前 briefing + 船宿全餐',
                price: '¥11,280'
            }
        ],
        reviews: [
            {
                user: '航迹记录者',
                rating: '★★★★★',
                date: '2026-02-26',
                text: '船宿最迷人的地方，是每天醒来都在另一片海面上。白天看环礁和蓝水，晚上回到甲板吹风，会觉得整趟旅程一直在往前慢慢展开。'
            },
            {
                user: '环礁之间',
                rating: '★★★★★',
                date: '2025-12-17',
                text: '这不是把潜点一个个勾掉的路线，而是把几片海连成同一段节奏。潜后 brief、甲板上的风和下一站的期待会自然接在一起。'
            },
            {
                user: '清晨在船上',
                rating: '★★★★☆',
                date: '2025-10-08',
                text: '如果喜欢醒来就已经离岸很远的感觉，马尔代夫船宿会非常对味。节奏比海岛驻留更完整，但也更依赖和船上作息对齐。'
            }
        ],
        related: [
            {
                id: 8,
                name: '图阿莫图',
                description: '如果你喜欢通透蓝水与航道之间的等待感，图阿莫图会是更安静也更开阔的延伸。',
                image: 'assets/images/tuamotu.jpg',
                price: '¥4,180'
            },
            {
                id: 9,
                name: '马布岛',
                description: '如果想把节奏收慢一点，让潜前潜后都更贴近岛上生活，马布岛会更温柔。',
                image: 'assets/images/mabul.jpg',
                price: '¥3,580'
            },
            {
                id: 2,
                name: '帕劳',
                description: '如果想把蓝洞、断层和更明确的洋流层次排进行程，帕劳会是另一种完整海况。',
                image: 'assets/images/palau.jpg',
                price: '¥4,280'
            }
        ]
    },
    11: {
        name: '科隆',
        tagline: '把黑色石灰岩、玻璃水与沉船的安静轮廓，一层层排进同一次靠近。',
        image: 'assets/images/coron-review-1-island-chain.jpg',
        difficulty: '适合沉船初体验',
        depth: '5-30m',
        season: '11月-次年5月',
        priceFrom: '¥4,980',
        mapLocation: '菲律宾巴拉望 · 科隆湾 Coron Bay',
        coordinates: '北纬 11.99°, 东经 120.20°',
        features: {
            location: '科隆的海不是单一一层蓝。黑色石灰岩、浅色礁缘、静水海湾与沉船线索会交替出现，很多人是为了 wreck 而来，但真正留在记忆里的，往往是船慢慢切进岛湾时，海面以上也一样有层次。',
            wildlife: [
                '海龟、梭鱼与礁坡上的笛鲷群',
                '沉船结构周围常见蝙蝠鱼、石斑与狮子鱼',
                '浅区有海鳗、裸鳃与更细碎的小型礁鱼',
                '静水海湾和石灰岩岸线本身就是整段行程的重要风景',
                '天气稳定时，海面颜色和礁缘层次会非常清楚'
            ],
            warnings: [
                '部分沉船点位深度和结构更复杂，进舱或更深路线需按证照与经验安排',
                '上岛、换船和靠岸常会踩到石灰岩或湿滑船沿，动作要放慢',
                '日晒、船程与跳岛节奏叠加，补水和防晒都要提前准备',
                '能见度与出海顺序会受风向和降雨影响，行程需要留一点弹性'
            ],
            weather: {
                season: '11月-次年5月',
                temperature: '27-30°C',
                visibility: '10-25米'
            }
        },
        itineraries: [
            {
                name: '4天3晚黑石与玻璃水初识线',
                includes: '2次沉船潜 + 1次礁坡 + 海湾巡游 + 中文向导',
                price: '¥4,980'
            },
            {
                name: '6天5晚科隆沉船主线',
                includes: '4次核心 wreck + 岛湾停驻 + 潜前 briefing + 机场接送',
                price: '¥7,280'
            },
            {
                name: '7天6晚科隆海湾与沉船线',
                includes: '6次潜水 + 跳岛水面日 + 酒店接送 + 每日早餐',
                price: '¥9,980'
            }
        ],
        reviews: [
            {
                user: '飞进群岛时',
                rating: '★★★★★',
                date: '2026-03-04',
                text: '很多人记住科隆是因为沉船，但我先记住的是从空中看见黑色岛影被浅色礁缘轻轻托住的那一下。'
            },
            {
                user: '黑石之间',
                rating: '★★★★★',
                date: '2025-12-18',
                text: '这里的好看不只在水下。白沙、浅水和石灰岩靠得很近，人刚靠岸就会自然慢下来。'
            },
            {
                user: '回到码头以后',
                rating: '★★★★☆',
                date: '2025-10-06',
                text: '整好装备、再看一眼镇边的山和水色，会觉得科隆是一片从海面以上就开始讲故事的海。'
            }
        ],
        related: [
            {
                id: 2,
                name: '帕劳',
                description: '同样有石灰岩岛屿与通透蓝色，但帕劳会更偏断层、蓝洞和更清楚的流线。',
                image: 'assets/images/palau.jpg',
                price: '¥4,280'
            },
            {
                id: 7,
                name: '科莫多',
                description: '如果想把地形张力继续往更完整的海况里推深，科莫多会更强一些。',
                image: 'assets/images/komodo-review-2-feature.jpg',
                price: '¥3,880'
            },
            {
                id: 9,
                name: '马布岛',
                description: '如果想把节奏收得更慢，让海面以上也更贴近日常停驻，马布岛会更柔和。',
                image: 'assets/images/mabul.jpg',
                price: '¥3,580'
            }
        ]
    },
    12: {
        name: '薄荷岛',
        tagline: '把白沙岸线、浅礁色带和轻船潜的出发线，安静地排进同一次停驻。',
        image: 'assets/images/bohol.jpg',
        difficulty: '适合轻船潜入门',
        depth: '5-25m',
        season: '11月-次年6月',
        priceFrom: '¥3,980',
        mapLocation: '菲律宾薄荷 · 邦劳 / 巴里卡萨 Bohol / Balicasag',
        coordinates: '北纬 9.53°, 东经 123.68°',
        features: {
            location: '薄荷岛不是先用强烈海况把人抓住的海。白沙岸线、浅礁色带和停在外侧的小船会先把节奏放轻，很多人从邦劳或巴里卡萨一带开始认识它，真正留在记忆里的，常常是那条从浅青慢慢过渡到深蓝的岸线。',
            wildlife: [
                '海龟、杰克鱼群与浅礁鱼类更常在光线好的时段出现',
                '岸线外侧的浅礁与 drop-off 过渡清楚，适合先把节奏读懂',
                '晴天时海色会从白沙边一路过渡到更稳的外海深蓝',
                '短船程和近岸出发让整天的潜旅体感更轻',
                '水面平静时，停船线和浅礁纹理本身就是很完整的风景'
            ],
            warnings: [
                '中午前后日晒很强，防晒和补水都要提前准备',
                '小船上下和背滚入水时要注意脚下和器材摆放',
                '风浪变化时，外侧点位和出海顺序可能会调整',
                '浅礁区拍照或观察时要更留意中性浮力和踢蹼距离'
            ],
            weather: {
                season: '11月-次年6月',
                temperature: '27-30°C',
                visibility: '12-22米'
            }
        },
        itineraries: [
            {
                name: '4天3晚薄荷岛轻潜假期',
                includes: '2次船潜 + 巴里卡萨外侧巡游 + 机场接送 + 中文协助',
                price: '¥3,980'
            },
            {
                name: '5天4晚薄荷岛岸线与浅礁线',
                includes: '4次船潜 + 邦劳住店 + 每日早餐 + 潜店接送',
                price: '¥5,680'
            },
            {
                name: '6天5晚薄荷岛海岸停驻线',
                includes: '6次潜水 + 船上 briefing + 酒店接送 + 中文向导',
                price: '¥7,580'
            }
        ],
        reviews: [
            {
                user: '先看见岸线',
                rating: '★★★★★',
                date: '2026-03-09',
                text: '薄荷岛先让人记住的，是白沙、浅礁和外侧深蓝排得很清楚的那条边。'
            },
            {
                user: '船停在外侧',
                rating: '★★★★★',
                date: '2025-12-14',
                text: '小船就停在浅水边，岸上房子和树线都还看得见，整趟出海会自然轻下来。'
            },
            {
                user: 'briefing 开始前',
                rating: '★★★★☆',
                date: '2025-10-02',
                text: '大家围坐在船上听 brief 的时候，薄荷岛那种轻一点的日常感就已经开始了。'
            }
        ],
        related: [
            {
                id: 9,
                name: '马布岛',
                description: '如果想把岸边停驻感再放慢一点，让潜前潜后都更贴近岛上日常，马布岛会更柔和。',
                image: 'assets/images/mabul.jpg',
                price: '¥3,580'
            },
            {
                id: 6,
                name: '布纳肯',
                description: '如果想把薄荷岛的轻船潜再往更清澈的海墙层次里延伸，布纳肯会更开阔。',
                image: 'assets/images/bunaken.jpg',
                price: '¥3,680'
            },
            {
                id: 11,
                name: '科隆',
                description: '如果想把菲律宾这一段继续往更明显的海湾层次和岸线记忆里推深，科隆会更有画面感。',
                image: 'assets/images/coron-review-1-island-chain.jpg',
                price: '¥4,980'
            }
        ]
    },
    13: {
        name: '皇帝岛',
        tagline: '把白沙海湾、清水坡地与更轻一点的泰国船潜，安静排进同一次靠近。',
        image: 'assets/images/racha.jpg',
        difficulty: '适合 OW / AOW 轻船潜',
        depth: '5-28m',
        season: '11月-次年4月',
        priceFrom: '¥3,680',
        mapLocation: '泰国普吉 · 皇帝岛 Racha Yai / Racha Noi',
        coordinates: '北纬 7.60°, 东经 98.37°',
        features: {
            location: '皇帝岛不是一上来就把海况推深的那种海。白沙海湾、明亮水色和外侧慢慢加深的礁坡，会先让身体放松下来，再把真正值得记住的蓝一点点打开。很多人从普吉出发来这里，并不是为了“最强刺激”，而是为了这种更清楚、更轻一点的进入方式。',
            wildlife: [
                '热带礁鱼、沙地鱼群与浅礁边的细小生态更容易在好光线里被看清',
                '外侧蓝水过渡层常把整片海的通透感与坡地结构一起推出来',
                '白沙海湾与外侧礁坡离得近，适合先把节奏读懂再继续往外',
                '天气稳定时，海面以上的岸线、停船点和水色本身就很完整',
                '对想把船潜、海岛风景和较轻海况放在一起的人来说，这里很顺'
            ],
            warnings: [
                '冬季窗口整体更稳，但风向变化时外侧点位和上下船顺序仍可能调整',
                '白沙和浅坡让体感很轻，越是这样越要留意中性浮力与踢蹼距离',
                '日晒、船程和连续潜水叠加后补水会很关键，尤其是普吉往返日',
                '若安排更外侧或更深一点的点位，仍要按当天海况和近期状态判断'
            ],
            weather: {
                season: '11月-次年4月',
                temperature: '27-30°C',
                visibility: '12-25米'
            }
        },
        itineraries: [
            {
                name: '4天3晚皇帝岛轻船潜假期',
                includes: '2次船潜 + 白沙海湾线 + 普吉接送 + 中文协助',
                price: '¥3,680'
            },
            {
                name: '5天4晚皇帝岛礁坡与外侧线',
                includes: '4次船潜 + 潜前 briefing + 酒店早餐 + 码头接送',
                price: '¥5,280'
            },
            {
                name: '6天5晚皇帝岛安达曼停驻线',
                includes: '6次潜水 + 外侧点位安排 + 每日接送 + 中文向导',
                price: '¥6,980'
            }
        ],
        reviews: [
            {
                user: '住处先把节奏放轻',
                rating: '★★★★★',
                date: '2026-03-12',
                text: '大厅、花园步道和潜前那顿安静早餐，会先把皇帝岛这一程收进更从容的节奏里。'
            },
            {
                user: '甲板先读云线',
                rating: '★★★★★',
                date: '2025-12-11',
                text: '从甲板到外海，云墙、海面和船行方向都很清楚，皇帝岛会先让人读懂今天的海。'
            },
            {
                user: '水下再把蓝慢慢放深',
                rating: '★★★★☆',
                date: '2025-10-04',
                text: '珊瑚、鱼群和沉船舱里的蓝会把这片海真正收深，但回忆留下来的仍然是层次清楚。'
            }
        ],
        related: [
            {
                id: 12,
                name: '薄荷岛',
                description: '如果你喜欢白沙、浅礁和较轻一点的出海节奏，薄荷岛会是很顺的菲律宾延伸。',
                image: 'assets/images/bohol.jpg',
                price: '¥3,980'
            },
            {
                id: 6,
                name: '布纳肯',
                description: '如果想把明亮蓝水和墙潜层次再往外推一点，布纳肯会更开阔。',
                image: 'assets/images/bunaken.jpg',
                price: '¥3,680'
            },
            {
                id: 9,
                name: '马布岛',
                description: '如果想把潜前潜后的海岛停驻感再放慢一点，马布岛会更柔和。',
                image: 'assets/images/mabul.jpg',
                price: '¥3,580'
            }
        ]
    },
    14: {
        name: '热浪岛',
        tagline: '把清透蓝水、白沙海湾和更安静的岸线呼吸，慢慢排进同一次马来西亚停驻。',
        image: 'assets/images/redang.jpg',
        difficulty: 'OW / AOW 友好',
        depth: '6-30m',
        season: '3月-9月',
        priceFrom: '¥3,680',
        mapLocation: '马来西亚登嘉楼州 · 热浪岛 Redang Island',
        coordinates: '北纬 5.78°, 东经 103.03°',
        features: {
            location: '热浪岛位于马来西亚半岛东岸外海，属于登嘉楼外侧群岛。这里的海不会用强张力先把人推深，而是先用通透浅蓝、白沙湾和外侧礁坡把节奏放稳，再慢慢打开更完整的海底层次。',
            wildlife: [
                '热带礁鱼群、蝶鱼和笛鲷在浅礁光带里更容易被看清',
                '海龟与蓝点魟常在礁坡和沙地过渡区慢慢巡游',
                '晴天时外侧蓝水与近岸浅礁对比会非常清楚',
                '浅坡和珊瑚块地形友好，适合把潜旅节奏收得更稳',
                '海面以上的白沙岸线与船停点本身就很有停驻感'
            ],
            warnings: [
                '旺季船次密集，热门点位建议提前排好出海窗口',
                '中午日晒和连续潜水叠加后，补水与防晒都要跟上',
                '浅礁区拍摄时要特别留意中性浮力，避免触碰珊瑚',
                '风向变化时外侧点位和回船顺序可能临时调整'
            ],
            weather: {
                season: '3月-9月',
                temperature: '27-30°C',
                visibility: '12-25米'
            }
        },
        itineraries: [
            {
                name: '4天3晚热浪岛轻船潜线',
                includes: '2次船潜 + 白沙海湾线 + 岛上接送 + 中文协助',
                price: '¥3,680'
            },
            {
                name: '5天4晚热浪岛礁坡停驻线',
                includes: '4次潜水 + 潜前 briefing + 酒店早餐 + 码头往返',
                price: '¥3,680'
            },
            {
                name: '6天5晚热浪岛外侧蓝水线',
                includes: '6次潜水 + 点位安排优化 + 每日接送 + 中文向导',
                price: '¥3,680'
            }
        ],
        reviews: [
            {
                user: '先在飞机和补给之间靠近',
                rating: '★★★★★',
                date: '2026-03-16',
                text: '热浪岛这趟路不是一落地就急着入海，便利店、转机和第一顿热食会先把身体慢慢接住。'
            },
            {
                user: '白沙先把一天点亮',
                rating: '★★★★★',
                date: '2025-12-02',
                text: '真正把热浪岛留下来的，是沙滩椅、餐桌边的海风和那片一眼就看懂的浅蓝。'
            },
            {
                user: '回岸以后还会继续停一会儿',
                rating: '★★★★☆',
                date: '2025-09-28',
                text: '潜具上船、栏杆外的深蓝、夜里海边餐桌和最后一段岛上路，会把热浪岛这程收得很慢。'
            }
        ],
        related: [
            {
                id: 13,
                name: '皇帝岛',
                description: '如果你喜欢白沙湾和轻船潜节奏，皇帝岛会是很顺的安达曼延伸。',
                image: 'assets/images/racha.jpg',
                price: '¥3,680'
            },
            {
                id: 12,
                name: '薄荷岛',
                description: '如果想把浅礁色带和明亮岸线继续留在假期里，薄荷岛会更轻一些。',
                image: 'assets/images/bohol.jpg',
                price: '¥3,680'
            },
            {
                id: 9,
                name: '马布岛',
                description: '如果想把潜前潜后的海岛停驻感继续放慢，马布岛会更柔和。',
                image: 'assets/images/mabul.jpg',
                price: '¥3,680'
            }
        ]
    }
})));

// 相关推荐切换配置：控制详情页之间的卡片式切页时长、状态存储和方向 class。
/**
 * navigateWithDepth(url) - 带深度切换效果地跳转到目标页面
 * @param {string} url - 目标页面地址
 * @param {Object} options - 可选导航配置
 * @returns {void} - 无返回值，直接执行页面跳转
 */
function navigateWithDepth(url, options = {}) {
    if (window.DepthManager && typeof window.DepthManager.navigateTo === 'function') {
        window.DepthManager.navigateTo(url, options);
        return;
    }

    window.location.href = url;
}

const RELATED_SPOT_PROFILES = Object.freeze({
    1: {
        englishName: 'Sipadan',
        mood: '鱼群风暴与海龟共游，更适合把第一次真正的心动留在海里的那类人。',
        fitTags: ['OW / AOW', '鱼群 / 大景', '中洋流'],
        why: '适合愿意把呼吸、流向和更深一点的蓝放进同一种节奏里的人。'
    },
    2: {
        englishName: 'Palau',
        mood: '蓝色大门与断层一起展开，光线、洋流和空间感都更有层次。',
        fitTags: ['AOW 推荐', '蓝洞 / 断层', '完整海况'],
        why: '更适合已经有一些经验，想把视线放进更完整海况层次的人。'
    },
    3: {
        englishName: 'Blue Hole',
        mood: '更深的结构感和垂直蓝色，会让这片海先以轮廓、再以安静留下来。',
        fitTags: ['AOW 推荐', '地形潜水', '深蓝结构'],
        why: '适合对地形、深度和更集中的注意力都有所期待的人。'
    },
    4: {
        englishName: 'Timor',
        mood: '珊瑚坡地和热带光线更轻一些，适合把风景与潜水放在同一种呼吸里。',
        fitTags: ['OW 适合', '风景体验', '珊瑚坡地'],
        why: '更适合希望水色、节奏和停驻感都平衡一点的人。'
    },
    5: {
        englishName: 'Pohnpei',
        mood: '礁湖、遗迹和更安静的水层，会把注意力慢慢带回到细节和停留里。',
        fitTags: ['OW / 慢节奏', '礁湖 / 光线', '恢复状态'],
        why: '适合久未下潜、或想先找回和海重新对齐节奏的人。'
    },
    6: {
        englishName: 'Bunaken',
        mood: '海墙与清澈水色更适合长线观察，不急着赶路，反而更容易看见层次。',
        fitTags: ['OW / AOW', '海墙 / 清澈', '长线观察'],
        why: '适合把速度放慢一点，让海洋生物自己慢慢靠近视线的人。'
    },
    7: {
        englishName: 'Komodo',
        mood: '流更明显，蓝更深，也更适合愿意进入完整海况层次的人。',
        fitTags: ['AOW / 进阶', '洋流 / 大景', '更深层次'],
        why: '如果你希望海况本身也成为记忆的一部分，这片海会更适合继续往前一步。'
    },
    8: {
        englishName: 'Tuamotu',
        mood: '玻璃一样的海面和通道流区并存，适合把耐心和惊喜放进同一段等待里。',
        fitTags: ['AOW 推荐', '通道 / 海流', '玻璃海色'],
        why: '更适合愿意沿着海流去等待下一次相遇，而不是急着把一切看完的人。'
    },
    9: {
        englishName: 'Mabul',
        mood: '把潜水和海岛停驻放进同一段时间，更适合慢慢靠近海的人。',
        fitTags: ['入门新手', '慢节奏', '海岛停驻'],
        why: '如果你希望潜前潜后都能安静停下来，它会是更温和也更完整的一种靠近方式。'
    },
    10: {
        englishName: 'Maldives Liveaboard',
        mood: '把好几片蓝收进同一段航线里，更适合愿意在船上慢慢进入海的人。',
        fitTags: ['OW / AOW', '船宿', '环礁巡航'],
        why: '如果你想把潜点与海面上的停泊感一起记住，船宿会是一种更完整也更流动的靠近方式。'
    },
    11: {
        englishName: 'Coron',
        mood: '黑色石灰岩、玻璃水与沉船轮廓会一起展开，更适合把海面以上也记进潜旅的人。',
        fitTags: ['OW / AOW', '沉船线索', '风景体验'],
        why: '如果你希望一片海从空中、海湾到下潜前的准备都有层次，它会是更完整也更安静的一种靠近方式。'
    },
    12: {
        englishName: 'Bohol',
        mood: '白沙岸线、浅礁色带和轻船潜一起铺开，更适合把潜水放进轻一些假期的人。',
        fitTags: ['入门 / OW', '风景体验', '轻船潜'],
        why: '如果你想先让海岸线、briefing 和短船程把身体放松下来，它会是更明亮也更从容的一种靠近方式。'
    },
    13: {
        englishName: 'Racha Island',
        mood: '白沙海湾、清水坡地和更轻一点的船潜节奏，会把进入海的方式放得更从容。',
        fitTags: ['OW / AOW', '轻船潜', '白沙海湾'],
        why: '如果你希望一片海既明亮、好靠近，又保留一点外侧蓝水层次，它会是很顺的一种泰国靠近方式。'
    },
    14: {
        englishName: 'Redang Island',
        mood: '清透蓝水、白沙岸线和更安静的礁坡过渡，会把整趟潜旅的呼吸轻轻放慢。',
        fitTags: ['OW / AOW', '轻船潜', '白沙岸线'],
        why: '如果你想把潜水和停驻感放进同一种舒缓节奏，热浪岛会是一片很顺的马来西亚蓝。'
    }
});

/**
 * getRelatedSpotProfile(spot) - 获取相邻海域舞台所需的补充文案和标签
 * @param {Object} spot - 相关推荐潜点对象
 * @returns {Object} - 包含英文名、气质文案、标签和推荐理由的展示数据
 */
function getRelatedSpotProfile(spot) {
    return RELATED_SPOT_PROFILES[spot.id] || {
        englishName: spot.name,
        mood: spot.description,
        fitTags: ['继续看看', '相邻海域'],
        why: '也许会是此刻更适合你继续停下来的那片海。'
    };
}

const DETAIL_SWAP_STORAGE_KEY = 'yanqi_detail_swap_transition';
const DETAIL_SWAP_MAX_AGE_MS = 12000;
const DETAIL_SWAP_DURATION_MS = 760;
const DETAIL_SWAP_NAVIGATE_DELAY_MS = 460;
const DETAIL_SWAP_CLASSES = [
    'detail-swap-active',
    'detail-swap-exit',
    'detail-swap-enter',
    'detail-swap-back-enter',
    'detail-swap-flow-forward',
    'detail-swap-flow-backward'
];

function normalizeDetailSwapDirection(direction) {
    return direction === 'backward' ? 'backward' : 'forward';
}

function reverseDetailSwapDirection(direction) {
    return normalizeDetailSwapDirection(direction) === 'forward' ? 'backward' : 'forward';
}

const HOME_DIVE_MATCH_LINK_MAP = Object.freeze({
    '入门新手': 'beginner',
    'OW 友好': 'ow',
    'OW 适合': 'ow',
    'OW / AOW': 'ow',
    'OW / 慢节奏': 'slow-pace',
    'AOW 推荐': 'aow',
    'AOW / 进阶': 'advanced-conditions',
    '慢节奏': 'slow-pace',
    '舒适度优先': 'comfort-first',
    '风景体验': 'scenery-first',
    '风景体验偏好': 'scenery-first',
    '鱼群 / 大景': 'big-scene',
    '鱼群 / 大景偏好': 'big-scene',
    '海况适应力': 'advanced-conditions',
    '海况适应力较弱': 'gentle-conditions',
    '近期有潜水记录': 'recent-dives',
    '中洋流': 'current-friendly',
    '完整海况': 'advanced-conditions',
    '洋流经验更友好': 'current-friendly',
    '进阶海况': 'advanced-conditions'
});

/**
 * buildHomeDiveMatchUrl(matchKey) - 构建跳回首页潜水匹配模块的目标地址
 * @param {string} matchKey - 首页匹配分类键名
 * @returns {string} - 带分类状态的首页地址
 */
function buildHomeDiveMatchUrl(matchKey) {
    return `home.html?match=${encodeURIComponent(matchKey)}#dive-match`;
}

/**
 * resolveDiveMatchKey(tag) - 把详情页里的能力标签映射到首页潜水匹配分类
 * @param {string} tag - 当前展示的标签文案
 * @returns {string} - 可跳转的首页匹配分类键名
 */
function resolveDiveMatchKey(tag) {
    const normalizedTag = typeof tag === 'string' ? tag.trim() : '';

    if (!normalizedTag) {
        return '';
    }

    if (HOME_DIVE_MATCH_LINK_MAP[normalizedTag]) {
        return HOME_DIVE_MATCH_LINK_MAP[normalizedTag];
    }

    // 详情页里有些标签是组合表达，这里按语义兜底到最接近的匹配分类。
    if (normalizedTag.includes('入门新手')) {
        return 'beginner';
    }

    if (normalizedTag.includes('AOW')) {
        return normalizedTag.includes('进阶') ? 'advanced-conditions' : 'aow';
    }

    if (normalizedTag.includes('OW')) {
        return normalizedTag.includes('慢节奏') ? 'slow-pace' : 'ow';
    }

    if (normalizedTag.includes('慢节奏')) {
        return 'slow-pace';
    }

    if (normalizedTag.includes('舒适')) {
        return 'comfort-first';
    }

    if (normalizedTag.includes('风景')) {
        return 'scenery-first';
    }

    if (normalizedTag.includes('鱼群') || normalizedTag.includes('大景')) {
        return 'big-scene';
    }

    if (normalizedTag.includes('近期')) {
        return 'recent-dives';
    }

    if (normalizedTag.includes('洋流') || normalizedTag.includes('中洋流')) {
        return 'current-friendly';
    }

    if (normalizedTag.includes('海况适应力较弱')) {
        return 'gentle-conditions';
    }

    if (normalizedTag.includes('海况') || normalizedTag.includes('完整海况')) {
        return 'advanced-conditions';
    }

    return '';
}

/**
 * createBookingMatchChipMarkup(tag) - 生成可跳转或纯展示的能力匹配芯片
 * @param {string} tag - 标签文案
 * @returns {string} - 芯片 HTML 字符串
 */
function createBookingMatchChipMarkup(tag) {
    const label = typeof tag === 'string' ? tag.trim() : '';
    const matchKey = resolveDiveMatchKey(label);

    if (!label) {
        return '';
    }

    if (!matchKey) {
        return `<span class="booking-match-chip">${label}</span>`;
    }

    return `
        <button type="button" class="booking-match-chip booking-match-link" data-match-key="${matchKey}">
            ${label}
        </button>
    `;
}

/**
 * parsePriceValue(priceText) - 解析价格文本中的数值部分
 * @param {string} priceText - 价格文本
 * @returns {number} - 解析出的数值金额
 */
function parsePriceValue(priceText) {
    return extractCurrencyAmount(priceText);
}

/**
 * getLeadingSentence(text) - 提取一段文案里最适合作为卡片短句的首句
 * @param {string} text - 原始文案
 * @returns {string} - 处理后的首句
 */
function getLeadingSentence(text) {
    const normalized = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
    if (!normalized) {
        return '';
    }

    const sentenceMatch = normalized.match(/^[^。！？!?]+[。！？!?]?/);
    return sentenceMatch ? sentenceMatch[0].trim() : normalized;
}

/**
 * buildPackageRhythmTags(pkg) - 为套餐卡生成“节奏标记”标签
 * @param {Object} pkg - 套餐对象
 * @returns {string[]} - 节奏标签数组
 */
function buildPackageRhythmTags(pkg) {
    const duration = typeof pkg?.duration === 'string' ? pkg.duration.trim() : '';
    const diveSummary = typeof pkg?.diveSummary === 'string' ? pkg.diveSummary.trim() : '';
    const staySummary = typeof pkg?.staySummary === 'string' ? pkg.staySummary.trim() : '';
    const tags = [];

    if (duration) {
        tags.push(duration);
    }

    const diveTagRules = [
        { pattern: /船宿/, label: '船宿' },
        { pattern: /\d+次船潜/, label: (match) => match[0] },
        { pattern: /黄昏轻潜/, label: '黄昏轻潜' },
        { pattern: /体验潜/, label: '体验潜' },
        { pattern: /岸潜/, label: '岸潜' },
        { pattern: /进阶点位安排/, label: '进阶点位' },
        { pattern: /重点窗口追踪/, label: '窗口追踪' }
    ];

    diveTagRules.some((rule) => {
        const match = diveSummary.match(rule.pattern);
        if (!match) {
            return false;
        }

        tags.push(typeof rule.label === 'function' ? rule.label(match) : rule.label);
        return true;
    });

    if (staySummary.includes('船宿')) {
        tags.push('船宿');
    } else if (staySummary.includes('岛上')) {
        tags.push('岛住');
    } else if (staySummary.includes('海边')) {
        tags.push('海边慢住');
    } else if (staySummary.includes('度假酒店')) {
        tags.push('度假停住');
    } else if (staySummary.includes('向导型酒店')) {
        tags.push('向导型住处');
    } else if (staySummary.includes('安静酒店')) {
        tags.push('安静停住');
    } else if (staySummary.includes('酒店')) {
        tags.push('酒店停住');
    }

    return Array.from(new Set(tags.filter(Boolean))).slice(0, 3);
}

/**
 * createPackagePlateMarkup(label, variant) - 生成套餐卡内的细分铭牌标签
 * @param {string} label - 标签文字
 * @param {string} variant - fit 或 rhythm
 * @returns {string} - 标签 HTML
 */
function createPackagePlateMarkup(label, variant = 'fit') {
    const text = typeof label === 'string' ? label.trim() : '';
    if (!text) {
        return '';
    }

    return `<span class="package-plate package-plate-${variant}">${text}</span>`;
}

/**
 * formatPriceValue(value) - 将金额数值格式化为详情页展示价格
 * @param {number} value - 金额数值
 * @returns {string} - 格式化后的价格文本
 */
function formatPriceValue(value) {
    return formatDisplayPriceValue(value);
}

/**
 * easeOutDrift(progress) - 生成更柔和的价格滚动缓动曲线
 * @param {number} progress - 当前动画进度（0 到 1）
 * @returns {number} - 缓动后的进度值
 */
function easeOutDrift(progress) {
    return 1 - ((1 - progress) ** 4);
}

/**
 * animateRollingPrice(element, priceText, options) - 让详情页顶部价格从个位开始平滑滚动到目标值
 * @param {HTMLElement|null} element - 需要更新价格文本的元素
 * @param {string} priceText - 目标价格文本
 * @param {Object} options - 动画配置（duration、delay）
 * @returns {void} - 无返回值，直接执行价格滚动动画
 */
function animateRollingPrice(element, priceText, options = {}) {
    if (!element) {
        return;
    }

    if (element.dataset.priceAnimated === 'true') {
        return;
    }

    const targetValue = parsePriceValue(priceText);
    if (!Number.isFinite(targetValue) || targetValue <= 0) {
        element.textContent = priceText;
        element.dataset.priceAnimated = 'true';
        return;
    }

    const { duration = 1680, delay = 120 } = options;

    if (element._priceRollFrameId) {
        window.cancelAnimationFrame(element._priceRollFrameId);
        element._priceRollFrameId = 0;
    }

    if (element._priceRollTimerId) {
        window.clearTimeout(element._priceRollTimerId);
        element._priceRollTimerId = 0;
    }

    element.textContent = formatPriceValue(0);

    const startAnimation = () => {
        const startTime = performance.now();

        const tick = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            const easedProgress = easeOutDrift(progress);
            let displayValue = Math.round(targetValue * easedProgress);

            if (progress > 0 && displayValue < 1) {
                displayValue = 1;
            }

            element.textContent = formatPriceValue(displayValue);

            if (progress < 1) {
                element._priceRollFrameId = window.requestAnimationFrame(tick);
                return;
            }

            element.textContent = formatPriceValue(targetValue);
            element.dataset.priceAnimated = 'true';
            element._priceRollFrameId = 0;
        };

        element._priceRollFrameId = window.requestAnimationFrame(tick);
    };

    element._priceRollTimerId = window.setTimeout(() => {
        element._priceRollTimerId = 0;
        startAnimation();
    }, delay);
}

/**
 * isElementNearViewport(element, offset) - 判断元素是否已经进入或接近当前视口
 * @param {Element|null} element - 需要判断的目标元素
 * @param {number} offset - 额外的提前触发距离
 * @returns {boolean} - 是否已经接近当前视口
 */
function isElementNearViewport(element, offset = 0) {
    if (!element) {
        return false;
    }

    const rect = element.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    return rect.top <= viewportHeight + offset && rect.bottom >= -offset;
}

/**
 * getNavigationType() - 获取当前页面的导航进入类型
 * @returns {string} - 浏览器导航类型
 */
function getNavigationType() {
    const [navigationEntry] = performance.getEntriesByType('navigation');
    return navigationEntry && navigationEntry.type ? navigationEntry.type : 'navigate';
}

/**
 * readDetailSwapState() - 读取详情页相关推荐切换的暂存状态
 * @returns {Object|null} - 读取到的切换状态对象或空值
 */
function readDetailSwapState() {
    const raw = sessionStorage.getItem(DETAIL_SWAP_STORAGE_KEY);
    if (!raw) {
        return null;
    }

    try {
        const parsed = JSON.parse(raw);
        const fromId = Number(parsed.fromId);
        const toId = Number(parsed.toId);
        const at = Number(parsed.at);
        const forwardConsumed = Boolean(parsed.forwardConsumed);
        const direction = normalizeDetailSwapDirection(parsed.direction);

        if (!Number.isFinite(fromId) || !Number.isFinite(toId) || !Number.isFinite(at)) {
            sessionStorage.removeItem(DETAIL_SWAP_STORAGE_KEY);
            return null;
        }

        if (Date.now() - at > DETAIL_SWAP_MAX_AGE_MS) {
            sessionStorage.removeItem(DETAIL_SWAP_STORAGE_KEY);
            return null;
        }

        return { fromId, toId, at, forwardConsumed, direction };
    } catch (error) {
        sessionStorage.removeItem(DETAIL_SWAP_STORAGE_KEY);
        return null;
    }
}

/**
 * writeDetailSwapState(fromId, toId) - 写入相关推荐切换的来源和目标潜点状态
 * @param {number} fromId - 当前潜点 ID
 * @param {number} toId - 目标潜点 ID
 * @returns {void} - 无返回值，直接写入 sessionStorage
 */
function writeDetailSwapState(fromId, toId, direction = 'forward') {
    sessionStorage.setItem(DETAIL_SWAP_STORAGE_KEY, JSON.stringify({
        fromId,
        toId,
        at: Date.now(),
        forwardConsumed: false,
        direction: normalizeDetailSwapDirection(direction)
    }));
}

/**
 * markDetailSwapForwardConsumed(state) - 标记相关推荐前进动画状态已被消费
 * @param {Object} state - 当前切换状态对象
 * @returns {void} - 无返回值，直接更新 sessionStorage
 */
function markDetailSwapForwardConsumed(state) {
    sessionStorage.setItem(DETAIL_SWAP_STORAGE_KEY, JSON.stringify({
        fromId: state.fromId,
        toId: state.toId,
        at: state.at,
        forwardConsumed: true,
        direction: normalizeDetailSwapDirection(state.direction)
    }));
}

// 详情页主类：统一管理当前潜点的数据渲染、交互事件、弹窗、评论和地图三态视图。
class DetailPage {
    /**
     * constructor() - 初始化详情页状态、DOM 引用与默认数据容器
     */
    constructor() {
        this.body = document.body;
        this.pageStage = document.getElementById('pageStage');
        this.detailHero = document.getElementById('detailHero');
        this.spotId = this.getSpotIdFromUrl();
        this.spotData = divingSpotDetails[this.spotId] || divingSpotDetails[1];
        this.packageData = [];
        this.reviewData = [];
        this.reviewDataCache = new Map();
        this.reviewDataPromiseCache = new Map();
        this.activeReviewFilter = 'all';
        this.selectedPackageId = null;
        this.tripStore = window.YanqiTripStore || null;
        this.bookedPackageIds = new Set();
        this.navigationType = getNavigationType();
        this.relatedTransitionTimer = 0;
        this.relatedTransitionCleanupTimer = 0;
        this.relatedStageSwitchTimer = 0;
        this.relatedStageCleanupTimer = 0;
        this.relatedEntryRevealTimer = 0;
        this.inDocumentDetailSwapTimer = 0;
        this.isInDocumentDetailSwapping = false;
        this.relatedStageStableHeight = 0;
        this.pressedRelatedCard = null;
        this.activeRelatedSpotId = this.spotData.related?.[0]?.id || null;
        this.relatedSection = document.getElementById('relatedSpots');
        this.relatedGrid = document.getElementById('relatedGrid');
        this.itineraryList = document.getElementById('itineraryList');
        this.packageMatchTags = document.getElementById('packageMatchTags');
        this.bookingNote = document.getElementById('bookingNote');
        this.reviewsFilters = document.getElementById('reviewsFilters');
        this.reviewsSection = document.getElementById('reviewsSection');
        this.reviewsLiveSummary = document.getElementById('reviewsLiveSummary');
        this.spotReviewsHeading = document.getElementById('spotReviews');
        this.spotMapHeading = document.getElementById('spotMapSection');
        this.reviewsStage = document.querySelector('.reviews-stage');
        this.bookingSticky = document.querySelector('.booking-sticky');
        this.bookingModal = document.getElementById('bookingModal');
        this.bookingModalBody = document.getElementById('bookingModalBody');
        this.bookingModalCloseTimer = 0;
        this.bookingModalMorphRevealTimer = 0;
        this.bookingModalMorphCleanupTimer = 0;
        this.bookingModalSourceRevealTimer = 0;
        this.packageModalPriceOpenTimer = 0;
        this.packageModalEditorStateMotion = [];
        this.packageModalEditorCloseTimer = 0;
        this.packageModalEditorTransitioning = false;
        this.packageModalEditorFocusTimer = 0;
        this.bookingModalMorphGhost = null;
        this.bookingModalDrafts = new Map();
        this.activeBookingSourceCard = null;
        this.activeBookingSourceSnapshot = null;
        this.bookingMatchFloatingRoot = document.getElementById('bookingMatchFloatingRoot');
        this.seaAtlasFullscreen = document.querySelector('[data-sea-atlas-fullscreen]');
        this.seaAtlasFullscreenSlot = document.querySelector('[data-sea-atlas-fullscreen-slot]');
        this.seaAtlasFullscreenTitle = document.querySelector('[data-sea-atlas-fullscreen-title]');
        this.seaAtlasFullscreenMeta = document.querySelector('[data-sea-atlas-fullscreen-meta]');
        this.bookingMatchConfirmState = null;
        this.bookingMatchConfirmCloseTimer = 0;
        this.bookingMatchConfirmFocusRaf = 0;
        this.bookingMatchNavigationTimer = 0;
        this.bookingModalNavigationAway = false;
        this.bookingConfirmFeedback = document.getElementById('bookingConfirmFeedback');
        this.bookingConfirmCopy = document.getElementById('bookingConfirmCopy');
        this.bookingConfirmMeta = document.getElementById('bookingConfirmMeta');
        this.bookingConfirmGoTrip = document.getElementById('bookingConfirmGoTrip');
        this.bookingConfirmStay = document.getElementById('bookingConfirmStay');
        this.bookingCopy = document.getElementById('bookingCopy');
        this.bookingFocusPanel = document.getElementById('bookingFocusPanel');
        this.bookingFocusState = document.getElementById('bookingFocusState');
        this.bookingFocusOverline = document.getElementById('bookingFocusOverline');
        this.bookingFocusTitle = document.getElementById('bookingFocusTitle');
        this.bookingFocusMeta = document.getElementById('bookingFocusMeta');
        this.bookingFocusPrice = document.getElementById('bookingFocusPrice');
        this.bookingFocusSummary = document.getElementById('bookingFocusSummary');
        this.bookingFocusAction = document.getElementById('bookingFocusAction');
        this.reviewDetailModal = document.getElementById('reviewDetailModal');
        this.reviewDetailBody = document.getElementById('reviewDetailBody');
        this.reviewLightbox = document.getElementById('reviewLightbox');
        this.reviewLightboxImage = document.getElementById('reviewLightboxImage');
        this.reviewLightboxCaption = document.getElementById('reviewLightboxCaption');
        this.mapContainer = document.getElementById('mapContainer');
        this.seaGuide = document.getElementById('seaGuide');
        this.seaGuideTrigger = document.getElementById('seaGuideTrigger');
        this.seaGuidePanel = document.getElementById('seaGuidePanel');
        this.seaGuideEntries = Array.from(document.querySelectorAll('.sea-guide-entry'));
        this.detailScrollMetricRaf = 0;
        this.detailSeaGuideOffset = Number.NaN;
        this.bookingReadingGuideMetrics = [];
        this.bookingReadingGuideSpecialMetrics = {
            reviews: null,
            firstReview: null
        };
        this.seaGuideMetrics = [];
        this.reviewCardMetrics = [];
        this.reviewCards = [];
        this.reviewCardsById = new Map();
        this.reviewPhotoGalleries = [];
        this.reviewPhotoButtons = [];
        this.reviewSummaryOverflowCache = new Map();
        this.introSection = document.getElementById('spotOverview');
        this.detailReadingSections = Array.from(document.querySelectorAll('[data-detail-reading-section]'));
        this.detailFooter = document.getElementById('detailFooter');
        this.detailFooterSpotName = document.getElementById('detailFooterSpotName');
        this.detailFooterLead = document.getElementById('detailFooterLead');
        this.detailFooterMurmur = document.getElementById('detailFooterMurmur');
        this.detailFooterClosing = document.getElementById('detailFooterClosing');
        this.detailFooterNextLink = document.getElementById('detailFooterNextLink');
        this.detailFooterNextName = document.getElementById('detailFooterNextName');
        this.detailFooterNextCopy = document.getElementById('detailFooterNextCopy');
        this.relatedLiveSummary = document.getElementById('relatedLiveSummary');
        this.activeSeaView = 'location';
        this.routeAnimationPlayed = false;
        this.seaRouteMotionRafId = 0;
        this.seaRouteMotionDelayId = 0;
        this.seaRouteLayoutKey = '';
        this.seaAtlasMap = null;
        this.seaAtlasTileLayer = null;
        this.seaAtlasMarkerLayer = null;
        this.seaAtlasMapMount = null;
        this.seaRouteBoardMount = null;
        this.seaRouteBoardStage = null;
        this.seaAtlasMapBase = null;
        this.seaAtlasInfoRoot = null;
        this.seaAtlasFallback = null;
        this.seaAtlasRouteOverlay = null;
        this.seaAtlasHeadingKicker = null;
        this.seaAtlasHeadingMurmur = null;
        this.seaAtlasSpotCard = null;
        this.seaAtlasPortCard = null;
        this.seaAtlasSpotMarker = null;
        this.seaAtlasPortMarker = null;
        this.seaAtlasCurrentMapData = null;
        this.seaAtlasCurrentAtlasData = null;
        this.seaAtlasCurrentTileTemplate = '';
        this.seaAtlasTileErrorCount = 0;
        this.seaAtlasTileLoadCount = 0;
        this.seaAtlasOfflineFallbackTimer = 0;
        this.seaAtlasRevealObserver = null;
        this.seaAtlasEntranceTimer = 0;
        this.seaAtlasInvalidateRafId = 0;
        this.seaAtlasOverlaySyncRafId = 0;
        this.seaAtlasSyncNeedsInvalidate = false;
        this.seaAtlasReplayRouteAfterSync = false;
        this.seaProfileEntranceTimer = 0;
        this.seaProfileEntranceDelayId = 0;
        this.seaAtlasPortCardVisible = false;
        this.seaAtlasMapInteractionTimer = 0;
        this.seaAtlasInlineInitialView = null;
        this.seaAtlasFullscreenMap = null;
        this.seaAtlasFullscreenTileLayer = null;
        this.seaAtlasFullscreenMarkerLayer = null;
        this.seaAtlasFullscreenMapMount = null;
        this.seaAtlasFullscreenMapBase = null;
        this.seaAtlasFullscreenInfoRoot = null;
        this.seaAtlasFullscreenFallback = null;
        this.seaAtlasFullscreenRouteOverlay = null;
        this.seaAtlasFullscreenSpotCard = null;
        this.seaAtlasFullscreenPortCard = null;
        this.seaAtlasFullscreenSpotMarker = null;
        this.seaAtlasFullscreenPortMarker = null;
        this.seaAtlasFullscreenCurrentTileTemplate = '';
        this.seaAtlasFullscreenTileErrorCount = 0;
        this.seaAtlasFullscreenTileLoadCount = 0;
        this.seaAtlasFullscreenOverlaySyncRafId = 0;
        this.seaAtlasFullscreenSyncNeedsInvalidate = false;
        this.seaAtlasFullscreenPortCardVisible = false;
        this.seaAtlasFullscreenInteractionTimer = 0;
        this.seaAtlasFullscreenInitialView = null;
        this.seaAtlasFullscreenOpen = false;
        this.seaAtlasResizeStorageKey = 'yanqi_sea_atlas_size';
        this.seaAtlasResizeCleanup = null;
        this.reviewDetailCloseTimer = 0;
        this.reviewLightboxCloseTimer = 0;
        this.bookingConfirmCloseTimer = 0;
        this.packagePriceObserver = null;
        this.relatedTextLayoutController = null;
        this.bookingFeedbackTimer = 0;
        this.seaGuideOpen = false;
        this.seaGuideUpdateRaf = 0;
        this.detailScrollMetricsResizeObserver = null;
        this.footerRevealObserver = null;
        this.relatedRevealObserver = null;
        this.introRevealObserver = null;
        this.introRevealDelayTimer = 0;
        this.introRevealCommitRafId = 0;
        this.introCardShellRevealRafId = 0;
        this.introCardContentRevealRafId = 0;
        this.introCardContentRevealTimers = [];
        this.introCardContentRevealCleanup = new Map();
        this.reviewsRevealObserver = null;
        this.reviewsRevealCommitRafId = 0;
        this.reviewsRevealTimers = [];
        this.reviewGalleryPhotoObserver = null;
        this.reviewGalleryPhotoRevealRafId = 0;
        this.reviewCardShellRevealRafId = 0;
        this.reviewCardContentRevealRafId = 0;
        this.reviewCardContentRevealTimers = [];
        this.reviewCardContentRevealCleanup = new Map();
        this.bookingCopyObserver = null;
        this.packageTitleObserver = null;
        this.bookingCopyTypeTimers = [];
        this.bookingCopyTypingActive = false;
        this.bookingCopySwapTimers = [];
        this.bookingCopySwapVersion = 0;
        this.bookingCopyResizeObserver = null;
        this.activeBookingGuideKey = this.bookingCopy?.dataset.readingGuideKey || 'overview';
        this.activeBookingFocusPackageId = '';
        this.activeBookingFocusContextKey = '';
        this.bookingFocusSwapTimers = [];
        this.bookingFocusSwapVersion = 0;
        this.bookingFocusPulseTimer = 0;
        this.bookingFocusReturnTimer = 0;
        this.detailReadingAwakenTimer = 0;
        this.bookingFocusContextPhaseTimer = 0;
        this.bookingStickyFocusContextCommitTimer = 0;
        this.bookingStickyFocusContextRaf = 0;
        this.handleBookingStickyListScroll = null;
        this.bookingStickyFocusContextState = this.bookingSticky?.classList.contains('is-focus-only-context') ? 'focus' : 'list';
        this.bookingStickyListContextScrollTop = this.bookingSticky?.scrollTop || 0;
        this.activeDetailReadingSectionKey = '';
        this.activeReviewLinkedPackageId = null;
        this.bookingStickyScrollTargetTop = 0;
        this.bookingStickyScrollRaf = 0;
        this.hasRenderedReviews = false;
        this.reviewsHydrationPromise = null;
        this.seaGuideInitialized = false;
        this.deferredReviewsHydration = null;
        this.deferredRelatedHydration = null;
        this.deferredFooterHydration = null;
        this.reviewsHydrated = false;
        this.relatedHydrated = false;
        this.footerHydrated = false;
        this.postRenderSyncRaf = 0;
        this.cancelPostRenderIdleSync = () => {};
        this.announceReviewsSummary = createBufferedLiveAnnouncer(this.reviewsLiveSummary);
        this.announceRelatedSummary = createBufferedLiveAnnouncer(this.relatedLiveSummary);
        this.init();
    }

    /**
     * getSpotIdFromUrl() - 从当前地址参数中解析潜点 ID
     * @returns {number} - 当前潜点 ID
     */
    getSpotIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return parseInt(params.get('id'), 10) || 1;
    }

    /**
     * init() - 启动详情页首轮渲染、事件绑定和切换恢复逻辑
     * @returns {void} - 无返回值，直接初始化详情页
     */
    init() {
        this.renderSpotData();
        this.applyIncomingRelatedTransition();
        this.setupEventListeners();
        this.setupSeaGuide();
        this.setupBookingStickyStack();
        this.setupBookingCopyReveal();
        this.setupIntroReveal();
        this.setupReviewsReveal();
        this.setupFooterReveal();
        this.setupFooterNavigation();
        this.setupNavigation();
        this.setupRelatedTransitionLifecycle();
        this.setupRelatedReveal();
    }

    /**
     * destroyDeferredSecondaryHydration() - 清理详情页下半段延迟渲染观察器和空闲任务
     * @returns {void}
     */
    destroyDeferredSecondaryHydration() {
        this.deferredReviewsHydration?.destroy?.();
        this.deferredRelatedHydration?.destroy?.();
        this.deferredFooterHydration?.destroy?.();
        this.deferredReviewsHydration = null;
        this.deferredRelatedHydration = null;
        this.deferredFooterHydration = null;

        if (this.postRenderSyncRaf) {
            window.cancelAnimationFrame(this.postRenderSyncRaf);
            this.postRenderSyncRaf = 0;
        }
        this.cancelPostRenderIdleSync();
        this.cancelPostRenderIdleSync = () => {};
    }

    /**
     * shouldHydrateDeferredSectionImmediately(target, leadRatio) - 判断某个详情页区块是否应立刻完成渲染
     * @param {Element|null} target - 目标区块锚点
     * @param {number} leadRatio - 视口前置比例
     * @returns {boolean}
     */
    shouldHydrateDeferredSectionImmediately(target, leadRatio = 1.2) {
        if (!target) {
            return true;
        }

        const currentHash = window.location.hash || '';
        if (currentHash) {
            try {
                if (target.matches(currentHash) || target.querySelector(currentHash)) {
                    return true;
                }
            } catch (error) {
                // hash 非法时静默降级，继续按视口位置判断。
            }
        }

        const rect = target.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return rect.top <= viewportHeight * leadRatio && rect.bottom >= -viewportHeight * 0.18;
    }

    /**
     * schedulePostRenderSync() - 把详情页首轮测量和阅读联动放到首屏绘制之后
     * @param {{ immediate?: boolean }} options - 是否立即执行
     * @returns {void}
     */
    schedulePostRenderSync(options = {}) {
        const { immediate = false } = options;
        const runSync = () => {
            this.measureDetailScrollMetrics();

            if (this.seaGuideInitialized) {
                this.updateSeaGuideState();
                return;
            }

            this.syncBookingReadingGuide({ force: true, immediate: true });
            this.syncBookingCopyDepthState();
        };

        if (immediate) {
            runSync();
            return;
        }

        if (this.postRenderSyncRaf) {
            window.cancelAnimationFrame(this.postRenderSyncRaf);
        }
        this.cancelPostRenderIdleSync();

        this.postRenderSyncRaf = window.requestAnimationFrame(() => {
            this.postRenderSyncRaf = 0;
            runSync();
        });
        this.cancelPostRenderIdleSync = scheduleIdleTask(() => {
            if (this.postRenderSyncRaf) {
                return;
            }
            runSync();
        }, 1100);
    }

    /**
     * ensureReviewDataReady() - 在真正进入评论区前再构建评论数据，并按潜点做实例内缓存
     * @returns {Promise<Array<Object>>}
     */
    async ensureReviewDataReady() {
        const requestedSpotId = this.spotId;
        const requestedSpotName = this.spotData?.name || '';

        if (this.reviewDataCache.has(requestedSpotId)) {
            const cachedReviewData = this.reviewDataCache.get(requestedSpotId);
            const safeCachedReviewData = Array.isArray(cachedReviewData) ? cachedReviewData : [];
            if (this.spotId === requestedSpotId) {
                this.reviewData = safeCachedReviewData;
            }
            return safeCachedReviewData;
        }

        if (this.reviewDataPromiseCache.has(requestedSpotId)) {
            return this.reviewDataPromiseCache.get(requestedSpotId);
        }

        const reviewDataPromise = loadDetailReviewContent()
            .then((reviewContentModule) => {
                const rawReviews = reviewContentModule?.buildRawReviews?.({
                    spotId: requestedSpotId,
                    spotName: requestedSpotName
                });
                const nextReviewData = this.applyReviewRatingVariation(
                    this.attachReviewPackageLinks(Array.isArray(rawReviews) ? rawReviews : [])
                );
                this.reviewDataCache.set(requestedSpotId, nextReviewData);
                if (this.spotId === requestedSpotId) {
                    this.reviewData = nextReviewData;
                }
                return nextReviewData;
            })
            .catch((error) => {
                if (this.spotId === requestedSpotId) {
                    this.reviewData = [];
                }
                console.error('[Yanqi detail] Failed to load review content:', error);
                return [];
            })
            .finally(() => {
                this.reviewDataPromiseCache.delete(requestedSpotId);
            });

        this.reviewDataPromiseCache.set(requestedSpotId, reviewDataPromise);
        return reviewDataPromise;
    }

    /**
     * ensureReviewsHydrated() - 真正渲染评论区，并在渲染后刷新阅读与导览度量
     * @returns {Promise<Array<Object>>}
     */
    async ensureReviewsHydrated() {
        if (this.reviewsHydrated) {
            return this.reviewData;
        }

        if (this.reviewsHydrationPromise) {
            return this.reviewsHydrationPromise;
        }

        const requestedSpotId = this.spotId;
        this.reviewsSection?.setAttribute('aria-busy', 'true');
        this.reviewsFilters?.setAttribute('aria-busy', 'true');

        this.reviewsHydrationPromise = this.ensureReviewDataReady()
            .then((reviewData) => {
                if (this.spotId !== requestedSpotId) {
                    return reviewData;
                }

                this.renderReviews();
                this.reviewsHydrated = true;
                this.measureDetailScrollMetrics();
                window.requestAnimationFrame(() => {
                    if (this.seaGuideInitialized) {
                        this.updateSeaGuideState();
                    }
                });
                return reviewData;
            })
            .finally(() => {
                if (this.spotId === requestedSpotId) {
                    this.reviewsSection?.removeAttribute('aria-busy');
                    this.reviewsFilters?.removeAttribute('aria-busy');
                }
                this.reviewsHydrationPromise = null;
            });

        return this.reviewsHydrationPromise;
    }

    /**
     * ensureRelatedHydrated() - 真正渲染相关推荐舞台
     * @returns {void}
     */
    ensureRelatedHydrated() {
        if (this.relatedHydrated) {
            return;
        }

        this.relatedHydrated = true;
        this.renderRelatedSpots();
    }

    /**
     * ensureFooterHydrated() - 更新详情页 footer 文案与下一片海入口
     * @returns {void}
     */
    ensureFooterHydrated() {
        if (this.footerHydrated) {
            return;
        }

        this.footerHydrated = true;
        this.renderFooter();
    }

    /**
     * primeDeferredSection(selector) - 在程序化滚动前预热对应的延迟区块
     * @param {string} selector - 目标区块选择器
     * @returns {void}
     */
    primeDeferredSection(selector) {
        if (selector === '#spotReviews' || selector === '#reviewsSection') {
            this.deferredReviewsHydration?.run?.();
            return;
        }

        if (selector === '#relatedSpots') {
            this.deferredRelatedHydration?.run?.();
            return;
        }

        if (selector === '#detailFooter') {
            this.deferredFooterHydration?.run?.();
        }
    }

    /**
     * setupDeferredSecondaryHydration() - 为评论、相关推荐和 footer 建立延迟渲染入口
     * @returns {void}
     */
    setupDeferredSecondaryHydration() {
        const reviewsTarget = this.spotReviewsHeading || this.reviewsStage || this.reviewsSection;
        const relatedTarget = this.relatedSection;
        const footerTarget = this.detailFooter;

        this.deferredReviewsHydration = createDeferredSectionBootstrap(reviewsTarget, () => {
            this.ensureReviewsHydrated();
        }, {
            immediate: this.shouldHydrateDeferredSectionImmediately(reviewsTarget, 1.08),
            rootMargin: '0px 0px 28% 0px',
            threshold: 0.01
        });

        this.deferredRelatedHydration = createDeferredSectionBootstrap(relatedTarget, () => {
            this.ensureRelatedHydrated();
        }, {
            immediate: this.shouldHydrateDeferredSectionImmediately(relatedTarget, 1.14),
            rootMargin: '0px 0px 30% 0px',
            threshold: 0.01
        });

        if (!this.footerHydrated) {
            this.deferredFooterHydration = createDeferredSectionBootstrap(footerTarget, () => {
                this.ensureFooterHydrated();
            }, {
                immediate: this.shouldHydrateDeferredSectionImmediately(footerTarget, 1.08),
                rootMargin: '0px 0px 18% 0px',
                threshold: 0.01,
                enableIdleBootstrap: true,
                idleTimeoutMs: 1800
            });
        }
    }

    /**
     * shouldInterceptDetailAnchorClick(event, anchor) - 判断当前点击是否应由详情页内换海逻辑接管
     * @param {MouseEvent} event - 当前点击事件
     * @param {HTMLAnchorElement|null} anchor - 目标链接
     * @returns {boolean} - 是否应拦截为同页换海
     */
    shouldInterceptDetailAnchorClick(event, anchor) {
        if (
            !anchor ||
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            anchor.target === '_blank' ||
            anchor.hasAttribute('download') ||
            anchor.closest('.related-feature-card')
        ) {
            return false;
        }

        let parsedUrl = null;
        try {
            parsedUrl = new URL(anchor.href, window.location.href);
        } catch (error) {
            return false;
        }

        if (parsedUrl.origin !== window.location.origin) {
            return false;
        }

        const samePath = parsedUrl.pathname === window.location.pathname;
        const targetId = Number(parsedUrl.searchParams.get('id'));
        return samePath && Number.isFinite(targetId) && targetId !== this.spotId;
    }

    /**
     * primeDetailHistoryState() - 给当前详情页 history entry 写入 spotId，方便同页换海时回退
     * @returns {void}
     */
    primeDetailHistoryState() {
        try {
            const currentState = window.history.state && typeof window.history.state === 'object'
                ? window.history.state
                : {};
            window.history.replaceState({
                ...currentState,
                yanqiDetailSpotId: this.spotId
            }, '', window.location.href);
        } catch (error) {
            // 忽略 history 不可写的极少数情况，保留默认浏览器行为。
        }
    }

    /**
     * syncDepthManagerAfterSpotSwap() - 同页换海后让深度计按新页面顶部位置重新接管
     * @returns {void}
     */
    syncDepthManagerAfterSpotSwap() {
        window.requestAnimationFrame(() => {
            if (window.DepthManager && typeof window.DepthManager.queuePageScrollDepthUpdate === 'function') {
                window.DepthManager.queuePageScrollDepthUpdate();
            }
        });
    }

    /**
     * swapSpotContentInDocument(targetId, options) - 在当前详情页文档内切到另一片海，避免整页重载空白帧
     * @param {number} targetId - 目标潜点 ID
     * @param {{ direction?: string, updateHistory?: 'push'|'replace'|'skip', entryClass?: string }} [options={}] - 切换配置
     * @returns {void}
     */
    swapSpotContentInDocument(targetId, options = {}) {
        if (!Number.isFinite(targetId) || targetId === this.spotId) {
            return;
        }

        const {
            direction = targetId > this.spotId ? 'forward' : 'backward',
            updateHistory = 'push',
            entryClass = 'detail-swap-enter'
        } = options;

        const nextSpotData = divingSpotDetails[targetId];
        if (!nextSpotData) {
            window.location.href = `detail.html?id=${targetId}`;
            return;
        }

        if (updateHistory === 'push') {
            try {
                const nextUrl = new URL(window.location.href);
                nextUrl.searchParams.set('id', String(targetId));
                window.history.pushState({
                    yanqiDetailSpotId: targetId
                }, '', nextUrl);
            } catch (error) {
                // history 写入失败时继续更新页面内容，不阻断当前切换。
            }
        } else if (updateHistory === 'replace') {
            this.primeDetailHistoryState();
        }

        this.clearBookingMatchConfirmationImmediately({
            restoreFocus: false
        });
        this.resetBookingModalNavigateAwayState();
        if (this.bookingModal?.classList.contains('active')) {
            this.closeBookingModal();
        }
        if (this.reviewDetailModal?.classList.contains('active')) {
            this.closeReviewDetail();
        }
        if (this.reviewLightbox?.classList.contains('active')) {
            this.closeReviewLightbox();
        }
        this.hideBookingConfirmedFeedback({ immediate: true });
        this.clearBookingModalMorph();
        this.clearPressedRelatedCard();
        this.clearBookingCopySwapTimers();
        this.clearBookingFocusSwapTimers();
        this.resetBookingCopySwapState();
        this.resetBookingFocusSwapState();
        this.clearBookingStickyFocusContextTransition();
        this.setBookingStickyFocusContextPhase('');
        this.applyBookingStickyFocusOnlyState(false);
        this.bookingStickyFocusContextState = 'list';
        this.bookingStickyListContextScrollTop = this.bookingSticky?.scrollTop || 0;
        this.resetRelatedSwapClasses();
        sessionStorage.removeItem(DETAIL_SWAP_STORAGE_KEY);
        if (this.pageStage) {
            this.pageStage.style.opacity = '0';
            this.pageStage.style.filter = 'blur(0px)';
            this.pageStage.style.willChange = 'transform, opacity, filter';
        }

        this.spotId = targetId;
        this.spotData = nextSpotData;
        this.packageData = [];
        this.reviewData = [];
        this.activeReviewFilter = 'all';
        this.activeReviewLinkedPackageId = null;
        this.selectedPackageId = null;
        this.bookedPackageIds = new Set();
        this.activeRelatedSpotId = nextSpotData.related?.[0]?.id || null;
        this.activeBookingGuideKey = 'overview';
        this.activeBookingFocusPackageId = '';
        this.activeBookingFocusContextKey = '';
        this.bookingModalDrafts = new Map();
        this.relatedStageStableHeight = 0;
        this.relatedGrid?.style.removeProperty('--related-stage-height');
        this.relatedGrid?.style.removeProperty('min-height');

        window.scrollTo(0, 0);
        this.renderSpotData();
        this.updateSeaGuideState?.();
        this.primeDetailHistoryState();
        this.syncDepthManagerAfterSpotSwap();

        this.playRelatedSwapAnimation(entryClass, direction);
        window.requestAnimationFrame(() => {
            if (!this.pageStage) {
                return;
            }

            this.pageStage.style.removeProperty('opacity');
            this.pageStage.style.removeProperty('filter');
            this.pageStage.style.removeProperty('will-change');
        });
    }

    /**
     * startInDocumentDetailSwap(targetId, options) - 以同页换海方式切到另一片详情，减少整页重载带来的断裂
     * @param {number} targetId - 目标潜点 ID
     * @param {{ direction?: string, skipSourceAnimation?: boolean, updateHistory?: 'push'|'replace'|'skip', entryClass?: string }} [options={}] - 切换配置
     * @returns {boolean} - 是否已接管此次切换
     */
    startInDocumentDetailSwap(targetId, options = {}) {
        if (!Number.isFinite(targetId) || targetId === this.spotId || this.isInDocumentDetailSwapping) {
            return false;
        }

        const {
            direction = targetId > this.spotId ? 'forward' : 'backward',
            skipSourceAnimation = false,
            updateHistory = 'push',
            entryClass = 'detail-swap-enter'
        } = options;

        this.isInDocumentDetailSwapping = true;

        const commitSwap = () => {
            this.inDocumentDetailSwapTimer = 0;
            this.swapSpotContentInDocument(targetId, {
                direction,
                updateHistory,
                entryClass
            });

            window.setTimeout(() => {
                this.isInDocumentDetailSwapping = false;
            }, DETAIL_SWAP_DURATION_MS + 80);
        };

        if (skipSourceAnimation) {
            commitSwap();
            return true;
        }

        this.resetRelatedSwapClasses();
        this.playRelatedSwapAnimation('detail-swap-exit', direction);

        this.inDocumentDetailSwapTimer = window.setTimeout(() => {
            commitSwap();
        }, DETAIL_SWAP_NAVIGATE_DELAY_MS);

        return true;
    }

    /**
     * setupInDocumentDetailNavigation() - 让详情页之间的跳转优先在当前文档内完成，减少重载闪烁
     * @returns {void}
     */
    setupInDocumentDetailNavigation() {
        this.primeDetailHistoryState();

        document.addEventListener('click', (event) => {
            const anchor = event.target.closest('a[href]');
            if (!this.shouldInterceptDetailAnchorClick(event, anchor)) {
                return;
            }

            event.preventDefault();
            const targetUrl = new URL(anchor.href, window.location.href);
            const targetId = Number(targetUrl.searchParams.get('id'));
            this.startInDocumentDetailSwap(targetId, {
                direction: targetId > this.spotId ? 'forward' : 'backward'
            });
        }, true);

        window.addEventListener('popstate', () => {
            const targetId = this.getSpotIdFromUrl();
            if (!Number.isFinite(targetId) || targetId === this.spotId || this.isInDocumentDetailSwapping) {
                return;
            }

            this.startInDocumentDetailSwap(targetId, {
                direction: targetId > this.spotId ? 'forward' : 'backward',
                skipSourceAnimation: true,
                updateHistory: 'skip',
                entryClass: 'detail-swap-back-enter'
            });
        });
    }

    // 套餐数据构建：根据当前潜点生成休闲/进阶两组能力匹配套餐及其详情内容。
    /**
     * buildPackageData() - 为当前潜点构建套餐卡和弹层使用的完整套餐数据
     * @returns {Array<Object>} - 套餐数据数组
     */
    buildPackageData() {
        const basePrice = parsePriceValue(this.spotData.priceFrom) || 3980;
        const { name, season, features } = this.spotData;
        const firstWarning = features.warnings[0] || `进入 ${name} 前，请根据当天海况与个人经验调整节奏。`;
        const leisureReentryNote = '若距离上一次下潜已超过 6 个月，首潜会先安排为 check dive / 复习回水，在较浅、友好的点位确认配重、耳压、浮力和基本应急动作；状态稳定后，再决定是否把当天第二潜完整排进去。';
        const advancedReentryNote = '若距离上一次下潜已超过 6 个月，即使证书等级足够，首潜也会先做 check dive，不直接进入代表性流区或主潜线；状态稳定后，再把更完整的点位顺延到后续窗口。';

        return [
            {
                id: 'leisure-1',
                group: '休闲套餐',
                audience: '入门新手 / OW',
                fitTags: ['入门新手', 'OW 友好'],
                name: `温柔下潜 · ${name}的第一眼蓝`,
                mood: `把第一次海底心动，留给更安静、更友好的蓝。`,
                duration: '3天2晚',
                diveSummary: '2次船潜 + 1次体验潜 / 岸潜',
                staySummary: '安静海边酒店',
                mealSummary: '含早餐与欢迎晚餐',
                price: formatPriceValue(basePrice),
                highlights: [
                    `更适合第一次来 ${name} 的潜水者，节奏留得更松一些。`,
                    '酒店与出海之间的切换更轻，潜后有充足休息时间。',
                    '把海底体验和海岛停留感放在同一套节奏里。'
                ],
                reentryNote: leisureReentryNote,
                schedule: [
                    { day: 'Day 1', text: '抵达、入住、装备确认与简短 logbook 核对，傍晚做一次轻量 briefing，让身体和海况都慢慢进入状态。' },
                    { day: 'Day 2', text: `上午先从更友好的点位入水；如果距离上次下潜超过 6 个月，这一潜会作为 check dive / warm-up，状态稳定后再衔接当天第二潜。下午回酒店休息，或视海况补一次轻岸潜。` },
                    { day: 'Day 3', text: '清晨看海面光线，悠闲早餐后返程；若航班时间宽松，可安排短程海边停留。' }
                ],
                includes: ['机场或码头接送', '2次船潜与1次体验潜/岸潜', '双人入住海边酒店', '每日早餐与欢迎晚餐', '基础装备协助与潜前 briefing'],
                excludes: ['潜水保险', '个人升级装备租借', '酒类饮品与个性化餐食', '节假日附加房型升级'],
                lodging: '优先安排安静、干净、离码头不远的海边酒店，房间更偏舒缓与休息感，适合潜后快速回到放松状态。',
                dining: '早餐以热食、热带水果和基础咖啡茶饮为主，欢迎晚餐会安排海鲜或当地风味，也可以提前备注忌口。',
                pace: '每次出海之间都留出明显的休息和回气空间，不追求密集下潜，更在意第一次进入这片海时是否从容。',
                risk: `风险提示：${firstWarning} 若距离上一次下潜超过 6 个月，首潜需先做 check dive / 复习回水。`,
                fitReason: `${name} 的代表性体验并不一定要靠高密度行程完成。对于第一次来的人，更舒展的节奏通常能让海龟、鱼群和光线留下更完整的记忆。`
            },
            {
                id: 'leisure-2',
                group: '休闲套餐',
                audience: 'OW / 度假型潜水者',
                fitTags: ['OW 友好', '慢节奏'],
                name: `慢潜停驻 · ${name}的舒展节奏`,
                mood: '把潜水和度假放在一起，让每一潜之间都能留出呼吸感。',
                duration: '4天3晚',
                diveSummary: '3次船潜 + 1次黄昏轻潜',
                staySummary: '岛上度假酒店',
                mealSummary: '含早餐与两次晚餐',
                price: formatPriceValue(basePrice * 1.18),
                highlights: [
                    '适合已经有 OW，但不想把行程排得太满的人。',
                    `会把 ${season} 的较稳窗口优先用在体验更完整的蓝水和海面时段。`,
                    '酒店舒适度、餐食节奏和潜后恢复感会被放在更前面。'
                ],
                reentryNote: leisureReentryNote,
                schedule: [
                    { day: 'Day 1', text: '抵达入住，潜店做装备确认与路线说明，晚上安排欢迎晚餐。' },
                    { day: 'Day 2', text: `上午第一潜先放在更友好的点位；如果距离上次下潜超过 6 个月，会先做 check dive，再决定是否接第二潜。下午回酒店休息；傍晚视天气安排一趟黄昏轻潜，感受 ${name} 的另一层光线。` },
                    { day: 'Day 3', text: '安排当天状态更好的主潜点，潜后保留完整午后，让潜水和休息保持平衡。' },
                    { day: 'Day 4', text: '早餐后返程，若时间允许可加一段码头散步或短程海景停留。' }
                ],
                includes: ['3次船潜与1次黄昏轻潜', '3晚度假酒店', '每日早餐与2次晚餐', '当地潜导与水面补给', '潜后装备基础清洗'],
                excludes: ['高级相机与摄影向导', '额外房型升级', '未注明正餐', '个人消费与小费'],
                lodging: '住宿更偏度假酒店质感，房间安静、床品舒适，适合上午潜完回来午休，也适合傍晚慢慢看海。',
                dining: '除早餐外，会安排两顿节奏较慢的晚餐，通常包含海鲜和当地口味，适合潜后慢慢补充体力。',
                pace: '潜水密度比入门款略高，但仍保留完整的午后休息和海面停留感，不会把每一天推得过满。',
                risk: `风险提示：${firstWarning} 若距离上一次下潜超过 6 个月，首潜需先做 check dive / 复习回水。`,
                fitReason: `如果你已经有基本经验，但更在意舒适度、海岛停驻感和慢潜节奏，这一档通常比密集潜水更适合把 ${name} 记住。`
            },
            {
                id: 'advanced-1',
                group: '进阶套餐',
                audience: 'AOW / 有近期潜水记录',
                fitTags: ['AOW 推荐', '近期有潜水记录'],
                name: `深蓝进阶 · ${name}主潜线`,
                mood: '把更完整的海况、更深一点的蓝和更成熟的下潜节奏，安排进一次更充实的潜行。',
                duration: '4天3晚',
                diveSummary: '4次船潜 + 进阶点位安排',
                staySummary: '高效潜水向导型酒店',
                mealSummary: '含早餐与船上午餐',
                price: formatPriceValue(basePrice * 1.36),
                highlights: [
                    '更适合已经有 AOW，且近 12 个月有下潜记录的潜水员。',
                    '会优先安排更能体现当地海况和水下层次的主潜点。',
                    '潜水密度更高，回到岸上后的休息时间会比休闲档更紧凑。'
                ],
                reentryNote: advancedReentryNote,
                schedule: [
                    { day: 'Day 1', text: '抵达后做装备、证书和近期记录确认；若 logbook 有明显空档，会先把第二天首潜改成 check dive。傍晚进行更完整的海况 briefing。' },
                    { day: 'Day 2', text: `上午先做节奏确认潜；如果距离上次下潜超过 6 个月，这一潜按 check dive 执行，不直接下 ${name} 的代表性流区。状态稳定后再接第二潜，下午根据体感补一潜或做更深入的路线说明。` },
                    { day: 'Day 3', text: '安排当天窗口更好的主潜线，若海况允许，会把更有层次的点位排进当天。' },
                    { day: 'Day 4', text: '早餐后返程，预留足够水面间隔；若行程允许，可安排短时设备整理与影像备份。' }
                ],
                includes: ['4次进阶船潜', '3晚潜水向导型酒店', '每日早餐与船上午餐', '潜导路线 briefing', '行李与装备搬运协助'],
                excludes: ['高氧、私人向导与摄影位服务', '深潜/高氧专项课程', '航班及保险', '未注明晚餐'],
                lodging: '住宿选择更偏高效出海动线，房间重点是安静、整洁、潜后恢复快，不强调奢华但强调节奏顺畅。',
                dining: '早餐与出海午餐会安排得更贴合潜水节奏，通常以易消化、补充体力和含蛋白食物为主。',
                pace: '这是一条更偏成熟潜水员的主线，行程密度和起潜窗口都会更紧，适合已经熟悉自己节奏的人。',
                risk: `风险提示：${firstWarning} 若距离上一次下潜超过 6 个月，首潜需先做 check dive，不建议直接进入主潜线。`,
                fitReason: `${name} 的核心魅力往往不止停留在第一层蓝水。若你已经有 AOW 和近期经验，这一档更能把当地更完整的海况层次潜出来。`
            },
            {
                id: 'advanced-2',
                group: '进阶套餐',
                audience: 'AOW / 进阶潜水员',
                fitTags: ['AOW 推荐', '海况适应力'],
                name: `更深一层 · ${name}海况延展`,
                mood: '把更成熟的判断、更灵活的窗口和更完整的海底记忆，交给一次真正准备好的下潜。',
                duration: '5天4晚',
                diveSummary: '5次船潜 + 重点窗口追踪',
                staySummary: '靠近出海点的安静酒店',
                mealSummary: '含早餐、欢迎晚餐与潜后补给',
                price: formatPriceValue(basePrice * 1.58),
                highlights: [
                    '给已经熟悉自身用气、节奏和海况应对的人准备。',
                    '会根据当天窗口灵活调整点位，把更值得下去的时段留给主潜。',
                    '更适合把鱼群、大景、流区或更深层次的海况都安排进一次行程。'
                ],
                reentryNote: advancedReentryNote,
                schedule: [
                    { day: 'Day 1', text: '抵达、入住、装备检查与证书确认，潜导会结合近期记录判断是否需要把 Day 2 第一潜改成 check dive。' },
                    { day: 'Day 2', text: `先用一潜把配重、耳压和 ${name} 的水下节奏对齐；若距离上次下潜超过 6 个月，则这一潜按 check dive 执行，状态稳定后再决定是否衔接第二潜与后续窗口。傍晚总结当天海况表现。` },
                    { day: 'Day 3', text: '根据当天能见度、流速和光线窗口安排更深入的主潜点，潜后保留简短恢复期。' },
                    { day: 'Day 4', text: '继续追窗口，必要时替换到更适合当天状态的点位，让行程保持弹性。' },
                    { day: 'Day 5', text: '潜水结束后返程，预留足够水面间隔和缓冲，避免匆忙离开。' }
                ],
                includes: ['5次重点船潜', '4晚安静酒店', '每日早餐、欢迎晚餐与潜后补给', '更细化的海况说明', '视情况调整的点位窗口安排'],
                excludes: ['酒精饮品、专项课程升级费', '摄影灯光与额外设备', '签证、机票与个人保险', '未注明午晚餐'],
                lodging: '住宿仍保持安静和恢复优先，重点是方便第二天早出海，并让潜后洗漱、晾装备和休息更顺手。',
                dining: '早餐稳定，欢迎晚餐会偏当地风味；潜后补给则更注重快速恢复体力，也可提前备注饮食禁忌。',
                pace: '相比其他档位，这一套行程会更依赖天气与海况窗口，也需要潜水员有更好的自我节奏和体能管理。',
                risk: `风险提示：${firstWarning} 若距离上一次下潜超过 6 个月，首潜需先做 check dive；若对流速、深度或连续出海恢复没有把握，也不建议直接选择这一档。`,
                fitReason: `如果你想认真决定怎样更深入地进入 ${name}，而不是只把这里当作一次打卡，这一档会更像一份真正为成熟潜水员准备的海域档案。`
            }
        ];
    }

    /**
     * getPackageFlowPackages() - 按右侧侧栏更适合阅读推进的顺序组织套餐。
     * 不再把同组套餐完全堆在一起，而是按“较浅一层 / 更深一层”交错展开，
     * 让阅读、评论与侧栏联动时更像继续下潜，而不是在两组卡片之间来回折返。
     * @returns {Array<Object>} - 按展示流向排好的套餐数组
     */
    getPackageFlowPackages() {
        if (!Array.isArray(this.packageData) || !this.packageData.length) {
            return [];
        }

        const leisurePackages = this.packageData.filter((pkg) => pkg.group === '休闲套餐');
        const advancedPackages = this.packageData.filter((pkg) => pkg.group === '进阶套餐');
        const maxLength = Math.max(leisurePackages.length, advancedPackages.length);
        const flowPackages = [];

        for (let index = 0; index < maxLength; index += 1) {
            if (leisurePackages[index]) {
                flowPackages.push(leisurePackages[index]);
            }

            if (advancedPackages[index]) {
                flowPackages.push(advancedPackages[index]);
            }
        }

        const usedPackageIds = new Set(flowPackages.map((pkg) => pkg.id));
        return flowPackages.concat(
            this.packageData.filter((pkg) => !usedPackageIds.has(pkg.id))
        );
    }

    /**
     * getReviewPackageFlowIndex() - 根据评论总数与套餐总数，把评论均匀切分到右侧套餐流中。
     * 这样当评论数量多于套餐数量时，不会前三条就把套餐切完，后面一直停在最后一套；
     * 例如 8 条评论对应 4 套套餐时，会自然形成“2 条评论切一次套餐”的节奏。
     * @param {number} reviewIndex - 当前评论索引
     * @param {number} reviewCount - 当前参与映射的评论总数
     * @param {number} packageCount - 当前套餐总数
     * @returns {number} - 当前评论应落到的套餐流索引
     */
    getReviewPackageFlowIndex(reviewIndex, reviewCount, packageCount) {
        const safeReviewIndex = Math.max(0, Number(reviewIndex) || 0);
        const safeReviewCount = Math.max(1, Number(reviewCount) || 0);
        const safePackageCount = Math.max(1, Number(packageCount) || 0);

        if (safeReviewCount <= safePackageCount) {
            return Math.min(safeReviewIndex, safePackageCount - 1);
        }

        return Math.min(
            Math.floor((safeReviewIndex * safePackageCount) / safeReviewCount),
            safePackageCount - 1
        );
    }

    // 评论数据构建：为当前潜点生成评论卡、详情弹层和图片查看所需的完整数据。
    /**
     * attachReviewPackageLinks() - 按评论数量和套餐数量，把评论映射到当前详情页的对应套餐。
     * 评论少时保持“一条评论对应一套套餐”的顺序；评论变多时自动按区间均分，
     * 让右侧焦点舱在长评论流里仍然会持续换挡，而不是过早停在最后一套。
     * @param {Array<Object>} reviews - 原始评论数组
     * @returns {Array<Object>} - 补齐 linkedPackageId 等字段后的评论数组
     */
    attachReviewPackageLinks(reviews) {
        const safeReviews = Array.isArray(reviews) ? reviews : [];
        const flowPackages = this.getPackageFlowPackages();

        if (!safeReviews.length || !flowPackages.length) {
            return safeReviews;
        }

        return safeReviews.map((review, reviewIndex) => {
            const flowIndex = this.getReviewPackageFlowIndex(
                reviewIndex,
                safeReviews.length,
                flowPackages.length
            );
            const linkedPackage = flowPackages[flowIndex] || flowPackages[flowPackages.length - 1] || null;

            return {
                ...review,
                linkedPackageId: linkedPackage?.id || '',
                linkedPackageName: linkedPackage?.name || '',
                linkedPackageGroup: linkedPackage?.group || ''
            };
        });
    }

    /**
     * buildReviewData() - 为当前潜点构建评论区、详情层和图片查看使用的数据
     * @returns {Array<Object>} - 评论数据数组
     */
    buildReviewData() {
        const rawReviewBuilder = window.YanqiDetailReviewContent?.buildRawReviews;
        if (typeof rawReviewBuilder !== 'function') {
            return [];
        }

        const rawReviews = rawReviewBuilder({
            spotId: this.spotId,
            spotName: this.spotData?.name || ''
        });

        return this.applyReviewRatingVariation(
            this.attachReviewPackageLinks(Array.isArray(rawReviews) ? rawReviews : [])
        );
    }

    /**
     * createReviewRatingValues(reviewCount) - 为当前评论列表生成一组轻微浮动的高分评分
     * @param {number} reviewCount - 当前评论数量
     * @returns {number[]} - 一组 0 到 5 之间、保留一位小数的评分值
     */
    createReviewRatingValues(reviewCount) {
        const baseRatings = [4.9, 4.8, 4.7, 4.9];
        const offsets = [-0.1, 0, 0.1];
        const ratingValues = Array.from({ length: reviewCount }, (_, index) => {
            const baseRating = baseRatings[index % baseRatings.length];
            const offset = offsets[Math.floor(Math.random() * offsets.length)];
            return Math.min(5, Math.max(4.6, Number((baseRating + offset).toFixed(1))));
        });

        if (
            reviewCount === baseRatings.length &&
            ratingValues.every((ratingValue, index) => ratingValue === baseRatings[index])
        ) {
            ratingValues[ratingValues.length - 1] = 5.0;
        }

        return ratingValues;
    }

    /**
     * applyReviewRatingVariation(reviews) - 为评论数据补上随机评分数值与展示文案
     * @param {Array<Object>} reviews - 原始评论数据数组
     * @returns {Array<Object>} - 带动态评分的新评论数据数组
     */
    applyReviewRatingVariation(reviews) {
        const ratingValues = this.createReviewRatingValues(reviews.length);
        return reviews.map((review, index) => ({
            ...review,
            ratingValue: ratingValues[index],
            ratingScore: `${ratingValues[index].toFixed(1)} / 5`
        }));
    }

    /**
     * getReviewRatingValue(review) - 从评论数据里提取并钳制实际评分数值
     * @param {Object} review - 当前评论数据对象
     * @returns {number} - 0 到 5 之间的评分数值
     */
    getReviewRatingValue(review) {
        const numericScore = Number.parseFloat(review?.ratingValue ?? review?.ratingScore);
        if (Number.isFinite(numericScore)) {
            return Math.min(Math.max(numericScore, 0), 5);
        }

        const fallbackStars = typeof review?.ratingStars === 'string'
            ? (review.ratingStars.match(/★/g) || []).length
            : 0;

        return Math.min(Math.max(fallbackStars || 0, 0), 5);
    }

    /**
     * createReviewRatingStarsMarkup(review, className) - 按实际评分生成支持小数填充的星级标记
     * @param {Object} review - 当前评论数据对象
     * @param {string} className - 星级容器类名
     * @returns {string} - 星级 HTML 字符串
     */
    createReviewRatingStarsMarkup(review, className) {
        const ratingValue = this.getReviewRatingValue(review);
        const fillPercentage = ((ratingValue / 5) * 100).toFixed(2);

        return `<span class="${className}" aria-hidden="true" style="--rating-fill: ${fillPercentage}%;">★★★★★</span>`;
    }

    // 页面主渲染：把当前潜点的标题、标签、介绍、地图、套餐和评论一次性同步到页面。
    /**
     * renderSpotData() - 将当前潜点的核心内容整体渲染到页面
     * @returns {void} - 无返回值，直接更新页面 DOM
     */
    renderSpotData(options = {}) {
        const {
            measureImmediately = false
        } = options;

        this.destroyDeferredSecondaryHydration();
        this.reviewData = [];
        this.activeReviewLinkedPackageId = null;
        this.hasRenderedReviews = false;
        this.reviewsHydrated = false;
        this.relatedHydrated = false;
        this.footerHydrated = false;
        document.title = `盐憩 - ${this.spotData.name}`;

        document.getElementById('spotName').textContent = this.spotData.name;
        document.getElementById('spotTagline').textContent = this.spotData.tagline;
        this.renderTag('difficultyTag', '进入节奏', this.spotData.difficulty);
        this.renderTag('depthTag', '深度', this.spotData.depth);
        this.renderTag('seasonTag', '最佳季节', this.spotData.season);
        this.syncDepthGaugeProfile();

        const heroImage = document.querySelector('.hero-image');
        if (heroImage) {
            heroImage.src = this.spotData.image;
            heroImage.alt = `${this.spotData.name}潜点风景`;
            heroImage.onerror = () => {
                heroImage.onerror = null;
                heroImage.src = `https://via.placeholder.com/1600x900?text=${encodeURIComponent(this.spotData.name)}`;
            };
        }

        this.body.classList.toggle('spot-mabul', this.spotId === 9);
        this.applyHeroEnvironmentProfile();

        this.packageData = this.buildPackageData();
        this.bookedPackageIds = this.getBookedPackageIdsForCurrentSpot();
        this.selectedPackageId = this.selectedPackageId
            || this.getLatestBookedPackageIdForCurrentSpot()
            || this.getPackageFlowPackages()[0]?.id
            || this.packageData[0]?.id
            || null;

        const minPackagePrice = this.packageData.reduce((lowestPrice, pkg) => {
            const packagePrice = parsePriceValue(pkg.price);
            if (!Number.isFinite(packagePrice)) {
                return lowestPrice;
            }
            return Math.min(lowestPrice, packagePrice);
        }, Number.POSITIVE_INFINITY);

        const priceAmountElement = document.getElementById('priceAmount');
        const heroPriceText = Number.isFinite(minPackagePrice)
            ? formatPriceValue(minPackagePrice)
            : this.spotData.priceFrom;

        window.requestAnimationFrame(() => {
            animateRollingPrice(priceAmountElement, heroPriceText, {
                duration: 2000,
                delay: 180
            });
        });

        this.renderIntroText();
        this.renderMapInfo();
        this.renderItineraries();
        if (this.reviewsFilters) {
            this.reviewsFilters.innerHTML = '';
        }
        if (this.reviewsSection) {
            this.reviewsSection.innerHTML = '';
        }
        if (this.relatedGrid) {
            this.relatedGrid.innerHTML = '';
            this.relatedGrid.style.removeProperty('--related-stage-height');
            this.relatedGrid.style.removeProperty('min-height');
        }
        this.relatedStageStableHeight = 0;
        this.relatedTextLayoutController?.disconnect?.();
        this.relatedTextLayoutController = null;
        this.renderFooter();
        this.footerHydrated = true;
        this.setupDeferredSecondaryHydration();
        this.schedulePostRenderSync({
            immediate: measureImmediately
        });
        this.setupHeroCopyReveal();
        this.resetBookingCopyReveal();
        this.resetIntroReveal();
        this.resetReviewsReveal();
    }

    /**
     * syncDepthGaugeProfile() - 把当前潜点的深度范围同步给详情页深度计
     * @returns {void} - 无返回值，直接刷新详情页深度计显示档位
     */
    syncDepthGaugeProfile() {
        if (!window.DepthManager || typeof window.DepthManager.setDetailGaugeProfile !== 'function') {
            return;
        }

        window.DepthManager.setDetailGaugeProfile(this.spotData.depth);
    }

    /**
     * getHeroEnvironmentProfile() - 根据当前海域返回首屏环境运动 profile。
     * @returns {{ key: string, scrollMood: string }} - 当前海域的环境 profile 与默认滚动情绪
     */
    getHeroEnvironmentProfile() {
        const profileMap = {
            1: { key: 'surge', scrollMood: 'deep' },
            2: { key: 'surge', scrollMood: 'deep' },
            3: { key: 'abyss', scrollMood: 'trench' },
            4: { key: 'garden', scrollMood: 'buoyant' },
            5: { key: 'garden', scrollMood: 'buoyant' },
            6: { key: 'lagoon', scrollMood: 'midwater' },
            7: { key: 'surge', scrollMood: 'deep' },
            8: { key: 'garden', scrollMood: 'midwater' },
            9: { key: 'lagoon', scrollMood: 'buoyant' }
        };

        return profileMap[this.spotId] || { key: 'surge', scrollMood: 'midwater' };
    }

    /**
     * applyHeroEnvironmentProfile() - 把当前海域的环境 profile 写入 body / hero，供首屏和滚动系统共用。
     * @returns {void} - 无返回值，直接同步 data attribute
     */
    applyHeroEnvironmentProfile() {
        if (!this.body) {
            return;
        }

        const heroProfile = this.getHeroEnvironmentProfile();
        this.body.dataset.detailHeroProfile = heroProfile.key;
        this.body.dataset.detailBaseScrollMood = heroProfile.scrollMood;
        this.body.dataset.scrollMood = heroProfile.scrollMood;

        if (this.detailHero) {
            this.detailHero.dataset.heroProfile = heroProfile.key;
        }
    }

    /**
     * queueBookingCopyTimeout() - 把当前这组文案打字动画用到的定时器统一登记起来，方便后面整批取消。
     * @param {Function} callback - 定时结束后要执行的逻辑
     * @param {number} delay - 延迟毫秒数
     * @returns {number} - 当前定时器 id
     */
    queueBookingCopyTimeout(callback, delay) {
        const timer = window.setTimeout(() => {
            this.bookingCopyTypeTimers = this.bookingCopyTypeTimers.filter((id) => id !== timer);
            callback();
        }, delay);

        this.bookingCopyTypeTimers.push(timer);
        return timer;
    }

    /**
     * clearBookingCopyTypeTimers() - 中断正在进行的逐字动画，避免重复播放时旧定时器继续往后跑。
     * @returns {void} - 无返回值，直接清空内部计时状态
     */
    clearBookingCopyTypeTimers() {
        this.bookingCopyTypeTimers.forEach((timer) => window.clearTimeout(timer));
        this.bookingCopyTypeTimers = [];
    }

    /**
     * prepareBookingCopyTypeTargets() - 记录文案原文，并把当前节点清空，为后续逐字敲出做准备。
     * @returns {HTMLElement[]} - 需要执行逐字动画的目标节点数组
     */
    prepareBookingCopyTypeTargets() {
        if (!this.bookingCopy) {
            return [];
        }

        const lineElements = Array.from(this.bookingCopy.querySelectorAll(
            '.booking-kicker-line, .booking-title-line, .booking-intro-line'
        ));

        lineElements.forEach((element) => {
            if (!element.dataset.text) {
                element.dataset.text = element.textContent.trim();
            }

            element.textContent = '';
            element.classList.remove('is-typed');
            element.dataset.typingActive = 'false';
        });

        return lineElements;
    }

    /**
     * preparePackageCardTitleTargets() - 记录套餐标题原文并先清空当前文字，等待进入视口后再逐字敲出。
     * @returns {HTMLElement[]} - 当前页面里所有套餐标题行节点
     */
    preparePackageCardTitleTargets() {
        if (!this.itineraryList) {
            return [];
        }

        const titleLines = Array.from(this.itineraryList.querySelectorAll('.package-card-title-line'));
        titleLines.forEach((line) => {
            if (!line.dataset.text) {
                line.dataset.text = line.textContent.trim();
            }

            line.textContent = '';
            line.classList.remove('is-typed');
        });

        return titleLines;
    }

    /**
     * clearPackageCardTitleTimers() - 中断单个套餐标题当前还没执行完的逐字定时器。
     * @param {HTMLElement} line - 当前标题行节点
     * @returns {void} - 无返回值，直接清空该标题绑定的定时器
     */
    clearPackageCardTitleTimers(line) {
        if (!line || !Array.isArray(line._typeTimers)) {
            return;
        }

        line._typeTimers.forEach((timer) => window.clearTimeout(timer));
        line._typeTimers = [];
    }

    /**
     * queuePackageCardTitleTimeout() - 把单个套餐标题用到的定时器挂到元素上，方便重复渲染时回收。
     * @param {HTMLElement} line - 当前标题行节点
     * @param {Function} callback - 定时结束后要执行的逻辑
     * @param {number} delay - 延迟毫秒数
     * @returns {number} - 当前定时器 id
     */
    queuePackageCardTitleTimeout(line, callback, delay) {
        const timer = window.setTimeout(() => {
            if (Array.isArray(line._typeTimers)) {
                line._typeTimers = line._typeTimers.filter((id) => id !== timer);
            }

            callback();
        }, delay);

        if (!Array.isArray(line._typeTimers)) {
            line._typeTimers = [];
        }

        line._typeTimers.push(timer);
        return timer;
    }

    /**
     * typePackageCardTitleLine() - 把单个套餐标题按字符慢慢敲出来，形成和侧栏一致的安静打字感。
     * @param {HTMLElement} line - 当前标题行节点
     * @returns {Promise<void>} - 当前标题完全显示后结束
     */
    typePackageCardTitleLine(line) {
        return new Promise((resolve) => {
            if (!line || line.dataset.typingActive === 'true' || line.classList.contains('is-typed')) {
                resolve();
                return;
            }

            const text = line.dataset.text || '';
            const characters = Array.from(text);
            if (!characters.length) {
                line.classList.add('is-typed');
                resolve();
                return;
            }

            this.clearPackageCardTitleTimers(line);
            line.dataset.typingActive = 'true';
            line.textContent = '';

            let index = 0;
            const appendNextCharacter = () => {
                const char = characters[index];
                const charNode = document.createElement('span');
                charNode.className = 'package-title-char';
                charNode.textContent = char;

                if (/\s/.test(char)) {
                    charNode.classList.add('is-space');
                }

                line.appendChild(charNode);

                window.requestAnimationFrame(() => {
                    charNode.classList.add('is-visible');
                });

                index += 1;
                if (index >= characters.length) {
                    line.dataset.typingActive = 'false';
                    line.classList.add('is-typed');
                    this.queuePackageCardTitleTimeout(line, resolve, 90);
                    return;
                }

                const extraPause = /[·，。！？,.!?：:]/.test(char) ? 72 : 0;
                this.queuePackageCardTitleTimeout(line, appendNextCharacter, 26 + extraPause);
            };

            appendNextCharacter();
        });
    }

    /**
     * setupPackageCardTitleReveal() - 让套餐卡标题在卡片进入视口后再逐字显现，避免一整屏同时闪出来。
     * @returns {void} - 无返回值，直接注册观察器或降级显示
     */
    setupPackageCardTitleReveal() {
        if (!this.itineraryList) {
            return;
        }

        const titleLines = this.preparePackageCardTitleTargets();
        if (!titleLines.length) {
            return;
        }

        if (this.packageTitleObserver) {
            this.packageTitleObserver.disconnect();
            this.packageTitleObserver = null;
        }

        if (!('IntersectionObserver' in window)) {
            titleLines.forEach((line) => {
                this.typePackageCardTitleLine(line);
            });
            return;
        }

        this.packageTitleObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                this.typePackageCardTitleLine(entry.target);
                this.packageTitleObserver?.unobserve(entry.target);
            });
        }, {
            threshold: 0.36,
            rootMargin: '0px 0px -10% 0px'
        });

        titleLines.forEach((line) => {
            this.packageTitleObserver.observe(line);
        });
    }

    /**
     * typeBookingLine() - 按字符把某一行文案慢慢敲出来。
     * 这里不做机械光标，而是让每个字符带一点模糊解除和轻微上浮，更像海里慢慢显形。
     * @param {HTMLElement} element - 当前行的目标节点
     * @param {string} text - 需要敲出的完整文字
     * @param {number} baseDelay - 常规字符之间的延迟
     * @returns {Promise<void>} - 当前一行全部敲完后结束
     */
    typeBookingLine(element, text, baseDelay) {
        return new Promise((resolve) => {
            const characters = Array.from(String(text || ''));
            if (!element || !characters.length) {
                resolve();
                return;
            }

            element.textContent = '';
            element.classList.remove('is-typed');
            element.dataset.typingActive = 'true';
            let index = 0;

            const appendNextCharacter = () => {
                if (!this.bookingCopyTypingActive) {
                    element.dataset.typingActive = 'false';
                    resolve();
                    return;
                }

                const char = characters[index];
                const charNode = document.createElement('span');
                charNode.className = 'booking-type-char';
                charNode.textContent = char;

                if (/\s/.test(char)) {
                    charNode.classList.add('is-space');
                }

                element.appendChild(charNode);

                window.requestAnimationFrame(() => {
                    charNode.classList.add('is-visible');
                });

                index += 1;
                if (index >= characters.length) {
                    element.dataset.typingActive = 'false';
                    element.classList.add('is-typed');
                    this.queueBookingCopyTimeout(resolve, 220);
                    return;
                }

                const extraPause = /[，。！？,.!?：:]/.test(char) ? 160 : 0;
                this.queueBookingCopyTimeout(appendNextCharacter, baseDelay + extraPause);
            };

            appendNextCharacter();
        });
    }

    /**
     * runBookingCopyTypewriter() - 依次触发潜水匹配文案的逐字敲出。
     * 顺序是：kicker -> 标题 -> 说明文案。
     * @returns {Promise<void>} - 所有文案敲完后结束
     */
    async runBookingCopyTypewriter() {
        if (
            !this.bookingCopy ||
            this.bookingCopyTypingActive ||
            this.bookingCopy.classList.contains('is-typed')
        ) {
            return;
        }

        this.clearBookingCopyTypeTimers();
        this.bookingCopyTypingActive = true;
        this.bookingCopy.classList.remove('is-typed');
        this.bookingCopy.classList.add('is-awakened');

        const kickerLine = this.bookingCopy.querySelector('.booking-kicker-line');
        const titleLines = Array.from(this.bookingCopy.querySelectorAll('.booking-title-line'));
        const introLine = this.bookingCopy.querySelector('.booking-intro-line');

        if (kickerLine) {
            await this.typeBookingLine(kickerLine, kickerLine.dataset.text || '', 42);
        }

        for (const titleLine of titleLines) {
            await this.typeBookingLine(titleLine, titleLine.dataset.text || '', 64);
        }

        if (introLine) {
            await this.typeBookingLine(introLine, introLine.dataset.text || '', 34);
        }

        this.bookingCopyTypingActive = false;
        this.bookingCopy.classList.add('is-typed');
    }

    /**
     * setupBookingCopyReveal() - 让套餐侧栏里的潜水匹配文案在进入视口时以逐字敲出的方式建立。
     * @returns {void} - 无返回值，直接注册观察器或降级显示
     */
    setupBookingCopyReveal() {
        if (!this.bookingCopy) {
            return;
        }

        this.prepareBookingCopyTypeTargets();

        if (!('IntersectionObserver' in window)) {
            this.runBookingCopyTypewriter();
            return;
        }

        this.bookingCopyObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                this.runBookingCopyTypewriter();
                this.bookingCopyObserver?.disconnect();
                this.bookingCopyObserver = null;
            });
        }, {
            threshold: 0.28,
            rootMargin: '0px 0px -10% 0px'
        });

        this.bookingCopyObserver.observe(this.bookingCopy);
    }

    /**
     * resetBookingCopyReveal() - 详情内容重渲染后重置潜水匹配文案显形状态，并在当前视口条件下重新触发
     * @returns {void} - 无返回值，直接更新当前显形状态
     */
    resetBookingCopyReveal() {
        if (!this.bookingCopy) {
            return;
        }

        this.clearBookingCopyTypeTimers();
        this.bookingCopyTypingActive = false;
        this.bookingCopy.classList.remove('is-awakened', 'is-typed');
        this.prepareBookingCopyTypeTargets();

        const rect = this.bookingCopy.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        if (rect.top < viewportHeight * 0.82 && rect.bottom > viewportHeight * 0.1) {
            window.requestAnimationFrame(() => {
                this.runBookingCopyTypewriter();
            });
        }
    }

    /**
     * queueBookingCopySwapTimeout() - 统一登记侧栏陪读文案切换时用到的定时器，便于快速滚动时整批取消。
     * @param {Function} callback - 到时后要执行的回调
     * @param {number} delay - 延迟毫秒数
     * @returns {number} - 当前定时器 id
     */
    queueBookingCopySwapTimeout(callback, delay) {
        const timer = window.setTimeout(() => {
            this.bookingCopySwapTimers = this.bookingCopySwapTimers.filter((id) => id !== timer);
            callback();
        }, delay);

        this.bookingCopySwapTimers.push(timer);
        return timer;
    }

    /**
     * clearBookingCopySwapTimers() - 清空陪读文案切换过程中遗留的定时器，避免边界滚动时出现旧状态回写。
     * @returns {void} - 无返回值，直接清理定时器
     */
    clearBookingCopySwapTimers() {
        this.bookingCopySwapTimers.forEach((timer) => window.clearTimeout(timer));
        this.bookingCopySwapTimers = [];
    }

    /**
     * queueBookingFocusSwapTimeout() - 统一登记套餐焦点舱切换时用到的定时器。
     * @param {Function} callback - 到时后要执行的回调
     * @param {number} delay - 延迟毫秒数
     * @returns {number} - 当前定时器 id
     */
    queueBookingFocusSwapTimeout(callback, delay) {
        const timer = window.setTimeout(() => {
            this.bookingFocusSwapTimers = this.bookingFocusSwapTimers.filter((id) => id !== timer);
            callback();
        }, delay);

        this.bookingFocusSwapTimers.push(timer);
        return timer;
    }

    /**
     * clearBookingFocusSwapTimers() - 清空套餐焦点舱切换过程中遗留的定时器。
     * @returns {void} - 无返回值，直接清理定时器
     */
    clearBookingFocusSwapTimers() {
        this.bookingFocusSwapTimers.forEach((timer) => window.clearTimeout(timer));
        this.bookingFocusSwapTimers = [];
    }

    /**
     * resetBookingCopySwapState() - 清理陪读文案切换时挂上的动画 class 和临时样式。
     * @returns {void} - 无返回值，直接恢复文案容器的稳定状态
     */
    resetBookingCopySwapState() {
        if (!this.bookingCopy) {
            return;
        }

        this.bookingCopy.classList.remove('is-swapping-out', 'is-swapping-in');
        this.bookingCopy.style.removeProperty('transition');
        this.bookingCopy.style.removeProperty('opacity');
        this.bookingCopy.style.removeProperty('transform');
        this.bookingCopy.style.removeProperty('filter');
        this.bookingCopy.style.removeProperty('will-change');
    }

    /**
     * resetBookingFocusSwapState() - 清理套餐焦点舱切换时挂上的动画 class 和临时样式。
     * @returns {void} - 无返回值，直接恢复焦点舱稳定状态
     */
    resetBookingFocusSwapState() {
        if (!this.bookingFocusPanel) {
            return;
        }

        this.clearBookingFocusPanelReturnMotion();
        this.bookingFocusPanel.classList.remove('is-swapping-out', 'is-swapping-in');
        this.bookingFocusPanel.style.removeProperty('will-change');
    }

    /**
     * setBookingFocusReturnPhase() - 标记焦点舱当前是否处于关闭后的回场阶段。
     * @param {string} phase - 仅支持 "returning" 或空字符串
     * @returns {void}
     */
    setBookingFocusReturnPhase(phase) {
        if (!this.bookingSticky) {
            return;
        }

        if (phase === 'returning') {
            this.bookingSticky.dataset.focusReturnPhase = 'returning';
            return;
        }

        delete this.bookingSticky.dataset.focusReturnPhase;
    }

    /**
     * clearBookingFocusPanelReturnMotion() - 清理焦点舱关闭回场动画与阶段标记。
     * @returns {void}
     */
    clearBookingFocusPanelReturnMotion() {
        if (this.bookingFocusReturnTimer) {
            window.clearTimeout(this.bookingFocusReturnTimer);
            this.bookingFocusReturnTimer = 0;
        }

        if (this.bookingFocusPulseTimer) {
            window.clearTimeout(this.bookingFocusPulseTimer);
            this.bookingFocusPulseTimer = 0;
        }

        this.setBookingFocusReturnPhase('');
        this.bookingFocusPanel?.classList.remove('is-returning', 'is-pulsing');
    }

    /**
     * startBookingFocusPanelReturnMotion() - 套餐弹层关闭回收到焦点舱时，让真实舱体先轻轻醒来。
     * @returns {void}
     */
    startBookingFocusPanelReturnMotion() {
        if (!this.bookingFocusPanel) {
            return;
        }

        this.clearBookingFocusPanelReturnMotion();
        this.setBookingFocusReturnPhase('returning');
        restartTransientClassAnimation(this.bookingFocusPanel, 'is-returning');

        this.bookingFocusReturnTimer = window.setTimeout(() => {
            this.bookingFocusPanel?.classList.remove('is-returning');
            this.setBookingFocusReturnPhase('');
            this.bookingFocusReturnTimer = 0;
        }, 620);
    }

    /**
     * setBookingStickyFocusContextPhase() - 设置 booking-sticky 的聚焦阶段标识，帮助 CSS 过渡。
     * @param {string} phase - 取值 "entering" / "leaving" / "" 。
     * @returns {void}
     */
    setBookingStickyFocusContextPhase(phase) {
        if (!this.bookingSticky) {
            return;
        }

        const normalizedPhase = phase === 'entering' || phase === 'leaving' ? phase : '';
        if (normalizedPhase) {
            this.bookingSticky.dataset.focusContextPhase = normalizedPhase;
        } else {
            delete this.bookingSticky.dataset.focusContextPhase;
        }

        if (this.bookingFocusContextPhaseTimer) {
            window.clearTimeout(this.bookingFocusContextPhaseTimer);
            this.bookingFocusContextPhaseTimer = 0;
        }

        if (!normalizedPhase) {
            this.applyPackageCardSelectionState();
            return;
        }

        this.bookingFocusContextPhaseTimer = window.setTimeout(() => {
            if (this.bookingSticky) {
                delete this.bookingSticky.dataset.focusContextPhase;
            }
            this.bookingFocusContextPhaseTimer = 0;
            this.applyPackageCardSelectionState();
        }, 380);
    }

    /**
     * clearBookingStickyFocusContextTransition() - 清理 focus-only 过渡阶段的定时器与 RAF。
     * @returns {void}
     */
    clearBookingStickyFocusContextTransition() {
        if (this.bookingStickyFocusContextCommitTimer) {
            window.clearTimeout(this.bookingStickyFocusContextCommitTimer);
            this.bookingStickyFocusContextCommitTimer = 0;
        }

        if (this.bookingStickyFocusContextRaf) {
            window.cancelAnimationFrame(this.bookingStickyFocusContextRaf);
            this.bookingStickyFocusContextRaf = 0;
        }
    }

    /**
     * applyBookingStickyFocusOnlyState() - 统一写入 booking-sticky 与 itinerary-list 的 focus-only 稳定态。
     * @param {boolean} isFocusOnly - 是否进入单焦点右栏稳定态
     * @returns {void}
     */
    applyBookingStickyFocusOnlyState(isFocusOnly) {
        if (this.bookingSticky) {
            this.bookingSticky.classList.toggle('is-focus-only-context', Boolean(isFocusOnly));
        }

        if (!this.itineraryList) {
            return;
        }

        this.itineraryList.classList.toggle('is-focus-only-context', Boolean(isFocusOnly));
        if ('inert' in this.itineraryList) {
            this.itineraryList.inert = Boolean(isFocusOnly);
        }
        this.itineraryList.setAttribute('aria-hidden', String(Boolean(isFocusOnly)));
    }

    /**
     * syncBookingStickyFocusContext() - 以 entering / stable / leaving 三段时序切换右栏 focus-only 语境。
     * @param {boolean} isFocusOnlyContext - 是否应进入 focus-only 语境
     * @param {string} [packageId=this.selectedPackageId] - 当前套餐 ID，用于同步卡片选中态
     * @returns {void}
     */
    syncBookingStickyFocusContext(isFocusOnlyContext, packageId = this.selectedPackageId) {
        if (!this.bookingSticky) {
            this.applyPackageCardSelectionState(packageId);
            return;
        }

        const shouldFocusOnly = Boolean(isFocusOnlyContext);
        const state = this.bookingStickyFocusContextState || (
            this.bookingSticky.classList.contains('is-focus-only-context') ? 'focus' : 'list'
        );

        if (shouldFocusOnly) {
            if (state === 'focus') {
                this.applyPackageCardSelectionState(packageId);
                return;
            }

            if (state === 'entering') {
                return;
            }

            this.clearBookingStickyFocusContextTransition();
            this.bookingStickyListContextScrollTop = this.bookingSticky.scrollTop || 0;
            this.bookingStickyScrollTargetTop = this.bookingStickyListContextScrollTop;
            this.bookingStickyFocusContextState = 'entering';
            this.setBookingStickyFocusContextPhase('entering');
            this.applyBookingStickyFocusOnlyState(false);

            this.bookingStickyFocusContextCommitTimer = window.setTimeout(() => {
                this.bookingStickyFocusContextCommitTimer = 0;
                if (!this.bookingSticky || this.bookingStickyFocusContextState !== 'entering') {
                    return;
                }

                this.applyBookingStickyFocusOnlyState(true);
                this.bookingStickyFocusContextState = 'focus';
                this.applyPackageCardSelectionState(packageId);
            }, 360);
            return;
        }

        if (state === 'list') {
            this.applyBookingStickyFocusOnlyState(false);
            this.applyPackageCardSelectionState(packageId);
            return;
        }

        if (state === 'entering') {
            this.clearBookingStickyFocusContextTransition();
            this.bookingStickyFocusContextState = 'list';
            this.setBookingStickyFocusContextPhase('');
            this.applyBookingStickyFocusOnlyState(false);
            this.applyPackageCardSelectionState(packageId);
            return;
        }

        if (state === 'leaving') {
            return;
        }

        this.clearBookingStickyFocusContextTransition();
        this.bookingStickyFocusContextState = 'leaving';
        this.setBookingStickyFocusContextPhase('leaving');
        this.applyBookingStickyFocusOnlyState(false);

        const maxScrollTop = this.getBookingStickyMaxScrollTop();
        const restoreTop = Math.max(0, Math.min(this.bookingStickyListContextScrollTop || 0, maxScrollTop));
        this.bookingStickyScrollTargetTop = restoreTop;
        this.bookingSticky.scrollTop = restoreTop;
        this.bookingStickyFocusContextState = 'list';
        this.applyPackageCardSelectionState(packageId);
    }

    /**
     * updateBookingStickyStackOffsets() - 根据当前陪读文案高度，更新侧栏双层停驻所需的偏移量。
     * 这样 booking-copy 和 booking-focus-panel 可以一起停住，而不是后者把前者顶掉。
     * @returns {void} - 无返回值，直接写入 sticky 容器 CSS 变量
     */
    updateBookingStickyStackOffsets() {
        if (!this.bookingSticky || !this.bookingCopy) {
            return;
        }

        const copyHeight = Math.ceil(this.bookingCopy.getBoundingClientRect().height || this.bookingCopy.offsetHeight || 0);
        this.bookingSticky.style.setProperty('--booking-copy-stick-top', '0px');
        this.bookingSticky.style.setProperty('--booking-copy-stick-height', `${copyHeight}px`);
        this.bookingSticky.style.setProperty('--booking-sticky-stack-gap', '18px');
    }

    /**
     * shouldCollapseBookingCopy() - 判断陪读文案是否该在更深阅读位置暂时收起。
     * 早段评论仍保留 booking-copy 与焦点舱并行，滑到更深层后再把空间让给套餐焦点舱。
     * @returns {boolean} - 是否应该折叠 booking-copy
     */
    shouldCollapseBookingCopy() {
        const currentKey = this.activeBookingGuideKey || this.getCurrentBookingReadingGuideKey();
        if (currentKey !== 'reviews' && currentKey !== 'related') {
            return false;
        }

        if (currentKey === 'related') {
            return true;
        }

        const reviewsMetric = this.bookingReadingGuideSpecialMetrics.reviews;
        if (!reviewsMetric) {
            return false;
        }

        const scrollY = window.scrollY || window.pageYOffset || 0;
        const probeY = scrollY + this.getSeaGuideOffset() + Math.min(window.innerHeight * 0.28, 240);
        const firstReviewMetric = this.bookingReadingGuideSpecialMetrics.firstReview;
        if (firstReviewMetric) {
            const collapseStart = firstReviewMetric.top + (
                firstReviewMetric.height * (firstReviewMetric.hasFeaturePhoto ? 0.82 : 0.92)
            );
            return probeY >= collapseStart;
        }

        return probeY >= (reviewsMetric.top + reviewsMetric.height * 0.42);
    }

    /**
     * syncBookingCopyDepthState() - 根据当前阅读深度决定 booking-copy 是停留还是退场。
     * @returns {void} - 无返回值，直接切换 booking-copy 折叠状态
     */
    syncBookingCopyDepthState() {
        if (!this.bookingCopy) {
            return;
        }

        this.bookingCopy.classList.toggle('is-collapsed-for-focus', this.shouldCollapseBookingCopy());
    }

    /**
     * setupBookingStickyStack() - 让右侧陪读文案和套餐焦点舱共享同一套 sticky 停驻栈。
     * @returns {void} - 无返回值，直接注册尺寸同步逻辑
     */
    setupBookingStickyStack() {
        if (!this.bookingSticky || !this.bookingCopy) {
            return;
        }

        this.updateBookingStickyStackOffsets();
        if (typeof this.handleBookingStickyListScroll === 'function') {
            this.bookingSticky.removeEventListener('scroll', this.handleBookingStickyListScroll);
        }

        this.handleBookingStickyListScroll = () => {
            if (!this.bookingSticky) {
                return;
            }

            if (this.isBookingMatchConfirmationVisible('sidebar')) {
                this.closeBookingMatchConfirmation({
                    immediate: true,
                    restoreFocus: false,
                    source: 'sidebar'
                });
            }

            const focusContextState = this.bookingStickyFocusContextState || (
                this.bookingSticky.classList.contains('is-focus-only-context') ? 'focus' : 'list'
            );
            if (focusContextState !== 'list') {
                return;
            }

            this.bookingStickyListContextScrollTop = this.bookingSticky.scrollTop || 0;
            this.bookingStickyScrollTargetTop = this.bookingStickyListContextScrollTop;
        };
        this.bookingSticky.addEventListener('scroll', this.handleBookingStickyListScroll, { passive: true });

        if ('ResizeObserver' in window) {
            this.bookingCopyResizeObserver?.disconnect();
            this.bookingCopyResizeObserver = new ResizeObserver(() => {
                this.updateBookingStickyStackOffsets();
            });
            this.bookingCopyResizeObserver.observe(this.bookingCopy);
        } else {
            window.addEventListener('resize', () => {
                this.updateBookingStickyStackOffsets();
            });
        }
    }

    /**
     * getBookingReadingGuideCopy() - 为当前阅读区块生成右侧 sticky 文案。
     * @param {string} sectionKey - 当前左侧正文所在区块 key
     * @returns {{ key: string, kicker: string, title: string, intro: string }} - 对应的陪读引导文案
     */
    getBookingReadingGuideCopy(sectionKey) {
        const spotName = this.spotData?.name || '这片海';
        const guideCopyMap = {
            overview: {
                key: 'overview',
                kicker: 'Sea Dossier',
                title: '海域档案',
                intro: `先把${spotName}的流向、海况与进入方式读清，再决定要用怎样的节奏靠近。`
            },
            map: {
                key: 'map',
                kicker: 'Sea Bearing',
                title: '地图',
                intro: `先沿着地图确认${spotName}落在海上的哪一侧，再想象这一次会从哪一道海流慢慢进入。`
            },
            reviews: {
                key: 'reviews',
                kicker: 'Travel Echoes',
                title: '评价',
                intro: `先听听去过的人怎样记住${spotName}，再判断这片海是不是此刻更适合你的那一片蓝。`
            },
            related: {
                key: 'related',
                kicker: 'Neighboring Waters',
                title: '相邻海域',
                intro: '如果这片蓝还没有收住，就顺着相邻海域继续平移，看看哪一段水色更贴近你现在的呼吸。'
            }
        };

        return guideCopyMap[sectionKey] || guideCopyMap.overview;
    }

    /**
     * getBookingReadingGuideSections() - 收集会驱动右侧陪读文案切换的正文区块。
     * @returns {Array<{ key: string, element: Element }>} - 当前可参与联动的区块定义
     */
    getBookingReadingGuideSections() {
        return [
            { key: 'overview', element: this.introSection },
            { key: 'map', element: this.spotMapHeading || this.mapContainer },
            { key: 'reviews', element: this.spotReviewsHeading || this.reviewsStage || this.reviewsSection },
            { key: 'related', element: this.relatedSection }
        ].filter(({ element }) => element);
    }

    /**
     * measureDetailScrollMetrics() - 统一缓存详情页阅读引导、评论联动和海图导览所需的布局信息。
     * @returns {void}
     */
    measureDetailScrollMetrics() {
        const scrollY = window.scrollY || window.pageYOffset || 0;
        const offset = this.getSeaGuideOffset(true);
        const readingSections = this.getBookingReadingGuideSections();

        this.bookingReadingGuideMetrics = readingSections
            .map(({ key, element }) => {
                if (!element) {
                    return null;
                }

                const rect = element.getBoundingClientRect();
                return {
                    key,
                    top: rect.top + scrollY - offset,
                    height: rect.height
                };
            })
            .filter(Boolean);

        const sectionMetricMap = new Map(
            this.bookingReadingGuideMetrics.map((metric) => [metric.key, metric])
        );
        const reviewsMetric = sectionMetricMap.get('reviews') || null;
        const relatedMetric = sectionMetricMap.get('related') || null;
        const firstReviewCard = this.reviewsSection?.querySelector('.review-card');
        const firstReviewRect = firstReviewCard?.getBoundingClientRect();

        this.bookingReadingGuideSpecialMetrics = {
            reviews: reviewsMetric,
            related: relatedMetric,
            firstReview: firstReviewCard && firstReviewRect ? {
                top: firstReviewRect.top + scrollY,
                height: firstReviewRect.height,
                hasFeaturePhoto: firstReviewCard.classList.contains('has-feature-photo')
            } : null
        };

        this.reviewCardMetrics = this.reviewsSection
            ? Array.from(this.reviewsSection.querySelectorAll('.review-card[data-linked-package-id]'))
                .map((card) => {
                    const rect = card.getBoundingClientRect();
                    return {
                        packageId: card.dataset.linkedPackageId || '',
                        top: rect.top + scrollY,
                        height: rect.height,
                        hasFeaturePhoto: card.classList.contains('has-feature-photo')
                    };
                })
            : [];

        this.seaGuideMetrics = this.seaGuideEntries
            .map((entry) => {
                const selector = entry.dataset.target;
                const target = selector ? document.querySelector(selector) : null;
                if (!selector || !target) {
                    return null;
                }

                const rect = target.getBoundingClientRect();
                return {
                    key: entry.dataset.key || '',
                    selector,
                    top: rect.top + scrollY - offset
                };
            })
            .filter(Boolean);

        this.detailSeaGuideOffset = offset;
    }

    /**
     * scheduleDetailScrollMetricsMeasure() - 把阅读与导览的重测压到下一帧，避免滚动中重复读布局。
     * @returns {void}
     */
    scheduleDetailScrollMetricsMeasure() {
        if (this.detailScrollMetricRaf) {
            return;
        }

        this.detailScrollMetricRaf = window.requestAnimationFrame(() => {
            this.detailScrollMetricRaf = 0;
            this.measureDetailScrollMetrics();
        });
    }

    /**
     * isDetailSectionInView() - 判断正文区块是否已经进入当前阅读带，便于决定是否应该立刻播放 reveal。
     * @param {HTMLElement|null} target - 目标区块
     * @param {{ topRatio?: number, bottomRatio?: number }} [options={}] - 可见区阈值
     * @returns {boolean} - 当前区块是否已进入阅读带
     */
    isDetailSectionInView(target, options = {}) {
        if (!target) {
            return false;
        }

        const { topRatio = 0.9, bottomRatio = 0.12 } = options;
        const rect = target.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return rect.top < viewportHeight * topRatio && rect.bottom > viewportHeight * bottomRatio;
    }

    /**
     * updateDetailReadingAtmosphere() - 同步当前阅读章节，让正文与右侧 sticky 共用一套安静的区块状态。
     * @param {string} sectionKey - 当前阅读区块 key
     * @returns {void} - 无返回值，直接更新页面状态
     */
    updateDetailReadingAtmosphere(sectionKey) {
        if (!this.body) {
            return;
        }

        const nextZone = ['overview', 'map', 'reviews', 'related'].includes(sectionKey)
            ? sectionKey
            : 'overview';
        const baseMood = this.body.dataset.detailBaseScrollMood || 'midwater';
        const zoneMoodMap = {
            overview: baseMood,
            map: 'midwater',
            reviews: 'deep',
            related: 'buoyant'
        };
        const previousZone = this.activeDetailReadingSectionKey || '';
        const hasZoneChanged = previousZone !== nextZone;

        this.activeDetailReadingSectionKey = nextZone;
        this.body.dataset.detailReadingZone = nextZone;
        this.body.dataset.scrollMood = zoneMoodMap[nextZone] || baseMood;

        this.detailReadingSections.forEach((section) => {
            const isCurrent = section.dataset.detailReadingSection === nextZone;
            section.classList.toggle('is-reading-current', isCurrent);
            if (!isCurrent) {
                section.classList.remove('is-reading-awakened');
            }
        });

        if (hasZoneChanged) {
            const currentSection = this.detailReadingSections.find((section) => (
                section.dataset.detailReadingSection === nextZone
            ));

            window.clearTimeout(this.detailReadingAwakenTimer);
            this.detailReadingAwakenTimer = 0;

            if (currentSection) {
                restartTransientClassAnimation(currentSection, 'is-reading-awakened');
                this.detailReadingAwakenTimer = window.setTimeout(() => {
                    if (
                        currentSection.isConnected
                        && this.activeDetailReadingSectionKey === nextZone
                    ) {
                        currentSection.classList.remove('is-reading-awakened');
                    }
                    this.detailReadingAwakenTimer = 0;
                }, 920);
            }
        }

        if (this.bookingSticky) {
            this.bookingSticky.dataset.readingZone = nextZone;
        }

        if (this.bookingCopy) {
            this.bookingCopy.dataset.readingZone = nextZone;
            this.bookingCopy.classList.toggle('is-reading-current', nextZone !== 'related');
        }

        if (this.bookingFocusPanel) {
            this.bookingFocusPanel.dataset.readingZone = nextZone;
            this.bookingFocusPanel.classList.add('is-reading-current');
        }
    }

    /**
     * getCurrentBookingReadingGuideKey() - 根据当前滚动位置判断正文更接近哪一个区块。
     * @returns {string} - 当前应在右侧显示的陪读区块 key
     */
    getCurrentBookingReadingGuideKey() {
        const sections = this.bookingReadingGuideMetrics;
        if (!sections.length) {
            return 'overview';
        }

        const scrollY = window.scrollY || window.pageYOffset || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const offset = this.getSeaGuideOffset();
        const probeY = scrollY + offset + Math.min(viewportHeight * 0.24, 220);
        const relatedMetric = this.bookingReadingGuideSpecialMetrics.related;
        const firstReviewMetric = this.bookingReadingGuideSpecialMetrics.firstReview;
        const relatedEnterThreshold = viewportHeight * 0.52;
        const relatedHoldThreshold = viewportHeight * 0.84;
        if (
            relatedMetric &&
            relatedMetric.top + relatedMetric.height > scrollY + Math.max(viewportHeight * 0.12, 72) &&
            relatedMetric.top <= (
                this.activeBookingGuideKey === 'related'
                    ? scrollY + relatedHoldThreshold
                    : scrollY + relatedEnterThreshold
            )
        ) {
            return 'related';
        }

        const reviewsMetric = this.bookingReadingGuideSpecialMetrics.reviews;
        const reviewAnchorThreshold = viewportHeight * (
            this.activeBookingGuideKey === 'reviews' || this.activeBookingGuideKey === 'related' ? 0.92 : 0.8
        );
        if (
            reviewsMetric &&
            reviewsMetric.top - scrollY <= reviewAnchorThreshold &&
            reviewsMetric.top + reviewsMetric.height > Math.max(viewportHeight * 0.12, 72)
        ) {
            return 'reviews';
        }

        if (
            firstReviewMetric &&
            firstReviewMetric.top - scrollY <= viewportHeight * 0.82 &&
            firstReviewMetric.top + firstReviewMetric.height > Math.max(viewportHeight * 0.12, 72)
        ) {
            return 'reviews';
        }

        let currentKey = sections[0].key;

        sections.forEach(({ key, top }) => {
            if (probeY >= top - 42) {
                currentKey = key;
            }
        });

        return currentKey;
    }

    /**
     * setBookingCopyLineText() - 同步某一行陪读文案的展示文本和后续逐字显形用到的原文缓存。
     * @param {string} selector - 目标行的选择器
     * @param {string} text - 需要显示的文本
     * @returns {void} - 无返回值，直接写回 DOM
     */
    setBookingCopyLineText(selector, text) {
        if (!this.bookingCopy) {
            return;
        }

        const line = this.bookingCopy.querySelector(selector);
        if (!line) {
            return;
        }

        const nextText = String(text ?? '').trim();
        line.dataset.text = nextText;
        line.textContent = nextText;
    }

    /**
     * writeBookingReadingGuideCopy() - 把当前区块对应的陪读文案写入右侧 sticky 侧栏。
     * @param {{ key: string, kicker: string, title: string, intro: string }} guideCopy - 需要写入的文案对象
     * @returns {void} - 无返回值，直接更新侧栏文本
     */
    writeBookingReadingGuideCopy(guideCopy) {
        if (!this.bookingCopy || !guideCopy) {
            return;
        }

        this.bookingCopy.dataset.readingGuideKey = guideCopy.key;
        this.setBookingCopyLineText('.booking-kicker-line', guideCopy.kicker);
        this.setBookingCopyLineText('.booking-title-line', guideCopy.title);
        this.setBookingCopyLineText('.booking-intro-line', guideCopy.intro);
        this.bookingCopy.querySelectorAll('.booking-kicker-line, .booking-title-line, .booking-intro-line').forEach((line) => {
            line.classList.remove('is-typed');
            line.dataset.typingActive = 'false';
        });

        const bookingTitle = this.bookingCopy.querySelector('.booking-title');
        if (bookingTitle) {
            bookingTitle.setAttribute('aria-label', `当前阅读区块：${guideCopy.title}`);
        }

        window.requestAnimationFrame(() => {
            this.updateBookingStickyStackOffsets();
        });
    }

    /**
     * getBookingFocusContextContent() - 根据当前阅读区块，返回右侧套餐焦点舱应显示的陪读语气。
     * @param {string} sectionKey - 当前阅读区块 key
     * @returns {{ state: string, overline: string }} - 当前套餐焦点舱的状态文案
     */
    getBookingFocusContextContent(sectionKey) {
        const contextMap = {
            overview: {
                state: '当前可以一起对照看的安排',
                overline: 'Current Package'
            },
            map: {
                state: '从海图回到进入方式',
                overline: 'Sea Entry'
            },
            reviews: {
                state: '这段评价正在对照下面这套安排',
                overline: 'Review Companion'
            },
            related: {
                state: '继续看别的海时，这一程仍停在这里',
                overline: 'Still Holding'
            }
        };

        return contextMap[sectionKey] || contextMap.overview;
    }

    /**
     * buildBookingFocusMetaMarkup() - 生成右侧套餐焦点舱里的简短信息芯片。
     * @param {Object} pkg - 当前套餐对象
     * @returns {string} - 芯片 HTML 字符串
     */
    buildBookingFocusMetaMarkup(pkg, options = {}) {
        const { isBooked = false } = options;
        const metaItems = [
            isBooked ? '已收进行程' : '',
            pkg?.group,
            pkg?.duration,
            Array.isArray(pkg?.fitTags) ? pkg.fitTags[0] : ''
        ].filter(Boolean);

        return metaItems.map((item) => `
            <span class="booking-focus-chip ${item === '已收进行程' ? 'booking-focus-chip-booked' : ''}">${escapeHtml(item)}</span>
        `).join('');
    }

    /**
     * getBookingFocusSummary() - 生成右侧套餐焦点舱里的摘要句。
     * @param {Object} pkg - 当前套餐对象
     * @param {string} sectionKey - 当前阅读区块 key
     * @returns {string} - 对应的摘要文案
     */
    getBookingFocusSummary(pkg, sectionKey, options = {}) {
        const { isBooked = false } = options;
        const summaryParts = [
            pkg?.audience ? `适合 ${pkg.audience}` : '',
            pkg?.diveSummary || '',
            pkg?.staySummary || ''
        ].filter(Boolean);

        const leadMap = {
            overview: '先把适合自己的节奏停在旁边',
            map: '从位置回到安排时，可以先记住这一程',
            reviews: '现在读到的这段体验，更接近这一套安排',
            related: '就算继续往相邻海域平移，这一程也还留在这里'
        };

        const lead = leadMap[sectionKey] || leadMap.overview;
        const bookedLead = isBooked ? '这套安排已经轻轻收进你的行程里' : lead;
        return `${bookedLead}：${summaryParts.join(' · ')}`;
    }

    /**
     * isBookingFocusOnlyContext() - 判断当前阅读语境是否应该切换到更安静的单焦点侧栏。
     * 评论区和相邻海域区都优先只保留焦点舱，不再让右侧成为第二条滚动时间线。
     * @param {string} [sectionKey=this.activeBookingGuideKey || 'overview'] - 当前阅读区块 key
     * @returns {boolean} - 是否进入单焦点侧栏模式
     */
    isBookingFocusOnlyContext(sectionKey = this.activeBookingGuideKey || 'overview') {
        return sectionKey === 'reviews' || sectionKey === 'related';
    }

    /**
     * updateBookingFocusPrice() - 同步焦点舱价格，并在需要时触发滚动数字动画。
     * @param {string} priceText - 目标价格文本
     * @param {{ animate?: boolean }} [options={}] - 是否播放数字滚动动画
     * @returns {void} - 无返回值，直接更新焦点舱价格
     */
    updateBookingFocusPrice(priceText, options = {}) {
        if (!this.bookingFocusPrice) {
            return;
        }

        const { animate = false } = options;
        this.bookingFocusPrice.dataset.priceTarget = priceText;

        if (!animate) {
            this.bookingFocusPrice.textContent = priceText;
            this.bookingFocusPrice.dataset.priceAnimated = 'true';
            return;
        }

        delete this.bookingFocusPrice.dataset.priceAnimated;
        animateRollingPrice(this.bookingFocusPrice, priceText, {
            duration: 1460,
            delay: 70
        });
    }

    /**
     * writeBookingFocusPanelContent() - 把当前套餐焦点舱的文字、价格和侧栏状态写回 DOM。
     * @param {{ packageId: string, pkg: Object, contextKey: string, contextContent: Object, isReviewContext: boolean, isFocusOnlyContext: boolean, animatePrice?: boolean }} payload - 焦点舱更新所需数据
     * @returns {void} - 无返回值，直接更新套餐焦点舱
     */
    writeBookingFocusPanelContent(payload) {
        if (
            !payload ||
            !this.bookingFocusPanel ||
            !this.bookingFocusState ||
            !this.bookingFocusOverline ||
            !this.bookingFocusTitle ||
            !this.bookingFocusMeta ||
            !this.bookingFocusSummary
        ) {
            return;
        }

        const {
            packageId,
            pkg,
            contextKey,
            contextContent,
            isReviewContext,
            isFocusOnlyContext,
            animatePrice = false
        } = payload;
        const isBooked = this.bookedPackageIds.has(pkg.id);

        this.bookingFocusState.textContent = isBooked ? '这套安排已经收进行程' : contextContent.state;
        this.bookingFocusOverline.textContent = contextContent.overline;
        this.bookingFocusTitle.textContent = pkg.name;
        this.bookingFocusMeta.innerHTML = this.buildBookingFocusMetaMarkup(pkg, { isBooked });
        this.updateBookingFocusPrice(pkg.price, { animate: animatePrice });
        this.bookingFocusSummary.textContent = this.getBookingFocusSummary(pkg, contextKey, { isBooked });
        this.syncBookingStickyFocusContext(isFocusOnlyContext, packageId);
        this.bookingSticky?.classList.toggle('has-booked-focus-package', isBooked);
        this.bookingFocusPanel.classList.toggle('is-booked', isBooked);
        this.bookingFocusPanel.classList.toggle('is-review-context', isReviewContext);

        if (this.bookingFocusAction) {
            this.bookingFocusAction.dataset.packageId = pkg.id;
            this.bookingFocusAction.textContent = isBooked ? '再看这套安排' : '展开这套安排';
            const actionIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            actionIcon.setAttribute('viewBox', '0 0 24 24');
            actionIcon.setAttribute('aria-hidden', 'true');
            actionIcon.innerHTML = `
                <path
                    d="M5 12h14M13 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            `;
            this.bookingFocusAction.appendChild(actionIcon);
        }
        if (this.bookingFocusPanel) {
            this.bookingFocusPanel.dataset.packageId = pkg.id;
        }
    }

    /**
     * pulseBookingFocusPanel() - 给右侧套餐焦点舱一次轻微的更新呼吸感。
     * @returns {void} - 无返回值，直接刷新状态 class
     */
    pulseBookingFocusPanel() {
        if (!this.bookingFocusPanel) {
            return;
        }

        window.clearTimeout(this.bookingFocusPulseTimer);
        restartTransientClassAnimation(this.bookingFocusPanel, 'is-pulsing');

        this.bookingFocusPulseTimer = window.setTimeout(() => {
            this.bookingFocusPanel?.classList.remove('is-pulsing');
            this.bookingFocusPulseTimer = 0;
        }, 820);
    }

    /**
     * syncBookingFocusPanel() - 同步右侧套餐焦点舱，让价格与当前套餐在阅读评论时仍清晰停留。
     * @param {{ force?: boolean, immediate?: boolean, animatePrice?: boolean|null }} [options={}] - 是否强制刷新、是否跳过焦点舱切换、是否自定义价格动效
     * @returns {void} - 无返回值，直接更新焦点舱内容
     */
    syncBookingFocusPanel(options = {}) {
        if (
            !this.bookingFocusPanel ||
            !this.bookingFocusState ||
            !this.bookingFocusOverline ||
            !this.bookingFocusTitle ||
            !this.bookingFocusMeta ||
            !this.bookingFocusPrice ||
            !this.bookingFocusSummary
        ) {
            return;
        }

        const { force = false, immediate = false, animatePrice = null } = options;
        const packageId = this.selectedPackageId || this.getPackageFlowPackages()[0]?.id || this.packageData[0]?.id || '';
        if (!packageId) {
            return;
        }

        const pkg = this.getPackageById(packageId);
        if (!pkg) {
            return;
        }

        const contextKey = this.activeBookingGuideKey || 'overview';
        if (
            !force &&
            packageId === this.activeBookingFocusPackageId &&
            contextKey === this.activeBookingFocusContextKey
        ) {
            return;
        }

        const contextContent = this.getBookingFocusContextContent(contextKey);
        const isReviewContext = contextKey === 'reviews';
        const isFocusOnlyContext = this.isBookingFocusOnlyContext(contextKey);
        const previousPackageId = this.activeBookingFocusPackageId;
        const isFirstFocusPaint = !previousPackageId;
        const shouldAnimateSwap = !isFirstFocusPaint && packageId !== previousPackageId;
        const shouldAnimatePrice = animatePrice == null
            ? (isFirstFocusPaint || packageId !== previousPackageId)
            : Boolean(animatePrice);
        this.activeBookingFocusPackageId = packageId;
        this.activeBookingFocusContextKey = contextKey;

        const focusPanelPayload = {
            packageId,
            pkg,
            contextKey,
            contextContent,
            isReviewContext,
            isFocusOnlyContext,
            animatePrice: shouldAnimatePrice
        };

        this.clearBookingFocusSwapTimers();
        this.resetBookingFocusSwapState();

        if (immediate || !shouldAnimateSwap) {
            this.writeBookingFocusPanelContent(focusPanelPayload);
            return;
        }

        this.bookingFocusSwapVersion += 1;
        const transitionVersion = this.bookingFocusSwapVersion;
        this.bookingFocusPanel.style.willChange = 'transform, opacity, filter';
        this.bookingFocusPanel.classList.add('is-swapping-out');

        this.queueBookingFocusSwapTimeout(() => {
            if (!this.bookingFocusPanel || transitionVersion !== this.bookingFocusSwapVersion) {
                return;
            }

            this.writeBookingFocusPanelContent(focusPanelPayload);
            this.bookingFocusPanel.classList.remove('is-swapping-out');
            window.requestAnimationFrame(() => {
                if (this.bookingFocusPanel && transitionVersion === this.bookingFocusSwapVersion) {
                    this.bookingFocusPanel.classList.add('is-swapping-in');
                }
            });

            this.queueBookingFocusSwapTimeout(() => {
                if (!this.bookingFocusPanel || transitionVersion !== this.bookingFocusSwapVersion) {
                    return;
                }

                this.resetBookingFocusSwapState();
            }, 860);
        }, 180);
    }

    /**
     * syncBookingReadingGuide() - 让右侧 sticky 侧栏随着左侧阅读区块更新引导文案。
     * 首次进入保持当前逐字显形，后续区块切换改成更明显的分行漂移与浮现，避免阅读中生硬换字。
     * @param {{ force?: boolean, immediate?: boolean }} [options={}] - 是否强制刷新、是否跳过过渡
     * @returns {void} - 无返回值，直接同步侧栏文案
     */
    syncBookingReadingGuide(options = {}) {
        if (!this.bookingCopy) {
            return;
        }

        const { force = false, immediate = false } = options;
        const nextKey = this.getCurrentBookingReadingGuideKey();
        if (!force && nextKey === this.activeBookingGuideKey) {
            this.updateDetailReadingAtmosphere(nextKey);
            return;
        }

        const nextGuideCopy = this.getBookingReadingGuideCopy(nextKey);

        this.activeBookingGuideKey = nextGuideCopy.key;
        this.updateDetailReadingAtmosphere(nextGuideCopy.key);
        this.syncBookingFocusPanel({ force: true });
        this.clearBookingCopySwapTimers();
        this.bookingCopySwapVersion += 1;
        const transitionVersion = this.bookingCopySwapVersion;
        this.resetBookingCopySwapState();

        if (this.bookingCopyTypingActive) {
            this.clearBookingCopyTypeTimers();
            this.bookingCopyTypingActive = false;
        }

        if (immediate) {
            this.writeBookingReadingGuideCopy(nextGuideCopy);
            return;
        }

        this.bookingCopy.classList.add('is-typed');
        this.bookingCopy.style.willChange = 'opacity, transform, filter';
        this.bookingCopy.classList.add('is-swapping-out');

        this.queueBookingCopySwapTimeout(() => {
            if (!this.bookingCopy || transitionVersion !== this.bookingCopySwapVersion) {
                return;
            }

            this.writeBookingReadingGuideCopy(nextGuideCopy);
            this.bookingCopy.classList.remove('is-swapping-out');
            window.requestAnimationFrame(() => {
                if (this.bookingCopy && transitionVersion === this.bookingCopySwapVersion) {
                    this.bookingCopy.classList.add('is-swapping-in');
                }
            });

            this.queueBookingCopySwapTimeout(() => {
                if (!this.bookingCopy || transitionVersion !== this.bookingCopySwapVersion) {
                    return;
                }

                this.resetBookingCopySwapState();
            }, 860);
        }, 240);
    }

    /**
     * getDetailHeroTitleUnits(titleText) - 把详情页主标题拆成适合缓慢显形的最小片段
     * @param {string} titleText - 当前潜点标题
     * @returns {string[]} - 用于逐段显现的标题单元
     */
    getDetailHeroTitleUnits(titleText) {
        const safeTitle = String(titleText || '').trim();
        if (!safeTitle) {
            return [];
        }

        if (/\s/.test(safeTitle)) {
            return safeTitle.split(/\s+/).filter(Boolean);
        }

        return Array.from(safeTitle);
    }

    /**
     * setupHeroCopyReveal() - 把详情页首屏文案做成“被海慢慢照亮”的缓慢显形
     * @returns {void} - 无返回值，直接重写首屏标题结构并触发显形状态
     */
    setupHeroCopyReveal() {
        const hero = document.getElementById('detailHero');
        const titleEl = document.getElementById('spotName');
        const subtitleEl = document.getElementById('spotTagline');

        if (!hero || !titleEl || !subtitleEl) {
            return;
        }

        const titleText = this.spotData.name || titleEl.textContent.trim();
        const subtitleText = this.spotData.tagline || subtitleEl.textContent.trim();
        const titleUnits = this.getDetailHeroTitleUnits(titleText);

        titleEl.setAttribute('aria-label', titleText);
        titleEl.innerHTML = titleUnits.map((unit, index) => `
            <span class="detail-title-unit" style="--detail-unit-delay: ${index * 120}ms" aria-hidden="true">${escapeHtml(unit)}</span>
        `).join('');

        subtitleEl.innerHTML = `<span class="detail-subtitle-line">${escapeHtml(subtitleText)}</span>`;

        hero.classList.remove('detail-hero-awakened');

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                hero.classList.add('detail-hero-awakened');
            });
        });
    }

    /**
     * renderTag(elementId, label, value) - 渲染英雄区的单个信息标签
     * @param {string} elementId - 标签容器元素 ID
     * @param {string} label - 标签标题
     * @param {string} value - 标签内容
     * @returns {void} - 无返回值，直接更新标签 DOM
     */
    renderTag(elementId, label, value) {
        const element = document.getElementById(elementId);
        if (!element) {
            return;
        }

        element.innerHTML = `<strong>${label}</strong> ${value}`;
    }

    // 介绍区渲染：将当前潜点的地理位置、生物、注意事项和天气信息写入正文区域。
    /**
     * renderIntroText() - 渲染潜点介绍正文内容
     * @returns {void} - 无返回值，直接更新介绍区 DOM
     */
    renderIntroText() {
        const introText = document.getElementById('introText');
        if (!introText) {
            return;
        }

        const { features, name } = this.spotData;
        const wildlifeItems = features.wildlife.map((item, index) => `
            <li class="intro-bullet-item" style="--intro-item-delay:${index * 70}ms;">
                <span class="intro-bullet-dot" aria-hidden="true"></span>
                <span>${escapeHtml(item)}</span>
            </li>
        `).join('');
        const warningItems = features.warnings.map((item, index) => `
            <li class="intro-bullet-item intro-bullet-item-warning" style="--intro-item-delay:${index * 70}ms;">
                <span class="intro-bullet-dot" aria-hidden="true"></span>
                <span>${escapeHtml(item)}</span>
            </li>
        `).join('');

        introText.innerHTML = `
            <div class="intro-archive-grid">
                <section class="intro-archive-card intro-card-location" style="--intro-card-order:0;">
                    <div class="intro-card-head">
                        <span class="intro-card-index">01</span>
                        <h3 class="intro-card-title">地理位置</h3>
                    </div>
                    <div class="intro-card-body">
                        <p class="intro-card-paragraph" style="--intro-item-delay:0ms;">
                            ${escapeHtml(features.location)}
                        </p>
                    </div>
                </section>

                <section class="intro-archive-card intro-card-wildlife" style="--intro-card-order:1;">
                    <div class="intro-card-head">
                        <span class="intro-card-index">02</span>
                        <h3 class="intro-card-title">水下生物</h3>
                    </div>
                    <div class="intro-card-body">
                        <p class="intro-card-paragraph" style="--intro-item-delay:0ms;">
                            在${escapeHtml(name)}，你更可能先遇见层层推进的鱼群、巡游的大型海洋生物，以及让整片海忽然安静下来的那种蓝。
                        </p>
                        <ul class="intro-bullet-list">
                            ${wildlifeItems}
                        </ul>
                    </div>
                </section>

                <section class="intro-archive-card intro-card-warnings" style="--intro-card-order:2;">
                    <div class="intro-card-head">
                        <span class="intro-card-index">03</span>
                        <h3 class="intro-card-title">潜水注意事项</h3>
                    </div>
                    <div class="intro-card-body">
                        <p class="intro-card-paragraph" style="--intro-item-delay:0ms;">
                            进入这片海之前，先把呼吸、经验和当天海况对齐，往往比一味追求多看一两个点位更重要。
                        </p>
                        <ul class="intro-bullet-list intro-bullet-list-calm">
                            ${warningItems}
                        </ul>
                    </div>
                </section>

                <section class="intro-archive-card intro-card-weather" style="--intro-card-order:3;">
                    <div class="intro-card-head">
                        <span class="intro-card-index">04</span>
                        <h3 class="intro-card-title">天气与水温</h3>
                    </div>
                    <div class="intro-card-body">
                        <p class="intro-card-paragraph" style="--intro-item-delay:0ms;">
                            如果想更从容地靠近这片海，通常可以先从季节、水温和能见度这三件事开始判断它当下的语气。
                        </p>
                        <div class="intro-weather-grid">
                            <article class="intro-weather-card" style="--intro-item-delay:80ms;">
                                <span class="intro-weather-label">最佳季节</span>
                                <strong class="intro-weather-value">${escapeHtml(features.weather.season)}</strong>
                            </article>
                            <article class="intro-weather-card" style="--intro-item-delay:140ms;">
                                <span class="intro-weather-label">平均水温</span>
                                <strong class="intro-weather-value">${escapeHtml(features.weather.temperature)}</strong>
                            </article>
                            <article class="intro-weather-card" style="--intro-item-delay:200ms;">
                                <span class="intro-weather-label">能见度</span>
                                <strong class="intro-weather-value">${escapeHtml(features.weather.visibility)}</strong>
                            </article>
                        </div>
                    </div>
                </section>
            </div>
        `;
    }

    /**
     * clearPendingIntroReveal() - 清理介绍区待提交的 reveal 帧，避免新一轮重播被旧帧打断。
     * @returns {void}
     */
    clearPendingIntroReveal() {
        if (this.introRevealDelayTimer) {
            window.clearTimeout(this.introRevealDelayTimer);
            this.introRevealDelayTimer = 0;
        }

        if (this.introRevealCommitRafId) {
            window.cancelAnimationFrame(this.introRevealCommitRafId);
            this.introRevealCommitRafId = 0;
        }
    }

    /**
     * getIntroArchiveCards() - 收集“海域档案”区块里需要按层次翻开的卡片
     * @returns {HTMLElement[]} - 介绍区档案卡列表
     */
    getIntroArchiveCards() {
        if (!this.introSection) {
            return [];
        }

        return Array.from(this.introSection.querySelectorAll('.intro-archive-card'));
    }

    /**
     * clearIntroCardShellReveal() - 清理卡片壳体 reveal 的 raf，并移除延迟变量与显现状态
     * @returns {void}
     */
    clearIntroCardShellReveal() {
        if (this.introCardShellRevealRafId) {
            window.cancelAnimationFrame(this.introCardShellRevealRafId);
            this.introCardShellRevealRafId = 0;
        }

        this.getIntroArchiveCards().forEach((card) => {
            card.classList.remove('is-shell-visible');
            card.style.removeProperty('--intro-card-shell-delay');
            card.style.removeProperty('--intro-card-content-delay');
        });
    }

    /**
     * clearIntroCardContentReveal() - 清理卡片正文 reveal 的 raf、定时器与过渡监听
     * @returns {void}
     */
    clearIntroCardContentReveal() {
        if (this.introCardContentRevealRafId) {
            window.cancelAnimationFrame(this.introCardContentRevealRafId);
            this.introCardContentRevealRafId = 0;
        }

        this.introCardContentRevealTimers.forEach((timerId) => {
            window.clearTimeout(timerId);
        });
        this.introCardContentRevealTimers = [];

        this.introCardContentRevealCleanup.forEach((cleanup) => {
            cleanup?.();
        });
        this.introCardContentRevealCleanup.clear();

        this.getIntroArchiveCards().forEach((card) => {
            card.classList.remove('is-content-visible');
            delete card.dataset.introContentRevealState;
        });
    }

    /**
     * queueIntroCardContentRevealTimer() - 为卡片正文 reveal 注册定时器，方便统一回收
     * @param {Function} callback - 定时器触发时执行的逻辑
     * @param {number} delay - 延迟毫秒数
     * @returns {number} - 定时器 ID
     */
    queueIntroCardContentRevealTimer(callback, delay = 0) {
        const timerId = window.setTimeout(() => {
            this.introCardContentRevealTimers = this.introCardContentRevealTimers
                .filter((activeTimerId) => activeTimerId !== timerId);
            callback();
        }, delay);

        this.introCardContentRevealTimers.push(timerId);
        return timerId;
    }

    /**
     * isIntroCardInView() - 判断某张档案卡是否已经进入当前阅读带
     * @param {HTMLElement|null} card - 待检查的档案卡
     * @returns {boolean} - 当前卡片是否已进入用户可见区域
     */
    isIntroCardInView(card) {
        if (!card) {
            return false;
        }

        const rect = card.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return rect.top < viewportHeight * 0.92 && rect.bottom > viewportHeight * 0.12;
    }

    /**
     * markIntroCardShellVisible() - 将档案卡壳体切换到已显现状态，并给同批次卡片轻微错峰
     * @param {HTMLElement|null} card - 当前档案卡节点
     * @param {number} staggerIndex - 当前批次中的序号
     * @returns {boolean} - 是否成功切到壳体显现态
     */
    markIntroCardShellVisible(card, staggerIndex = 0) {
        if (
            !card
            || !card.isConnected
            || card.classList.contains('is-shell-visible')
        ) {
            return false;
        }

        const safeIndex = Math.max(0, Math.min(staggerIndex, 3));
        card.style.setProperty('--intro-card-shell-delay', `${safeIndex * 90}ms`);
        card.style.setProperty('--intro-card-content-delay', `${safeIndex * 30}ms`);
        card.classList.add('is-shell-visible');
        return true;
    }

    /**
     * isIntroCardShellSettled() - 判断档案卡壳体是否已经基本显现完成
     * @param {HTMLElement|null} card - 当前档案卡节点
     * @returns {boolean} - 是否已接近稳定态
     */
    isIntroCardShellSettled(card) {
        if (!card || !card.classList.contains('is-shell-visible')) {
            return false;
        }

        const opacity = Number.parseFloat(window.getComputedStyle(card).opacity);
        return Number.isFinite(opacity) && opacity >= 0.96;
    }

    /**
     * getIntroCardShellTransitionWaitMs() - 读取档案卡壳体 reveal 的等待时间，供事件兜底
     * @param {HTMLElement|null} card - 当前档案卡节点
     * @returns {number} - 毫秒值
     */
    getIntroCardShellTransitionWaitMs(card) {
        if (!card) {
            return 0;
        }

        const styles = window.getComputedStyle(card);
        return (
            this.parseCssTimeToMs(styles.transitionDelay)
            + this.parseCssTimeToMs(styles.transitionDuration)
            + 120
        );
    }

    /**
     * markIntroCardContentVisible() - 将档案卡内部内容切换到已显现状态
     * @param {HTMLElement|null} card - 当前档案卡节点
     * @returns {void}
     */
    markIntroCardContentVisible(card) {
        if (!card || !card.isConnected) {
            return;
        }

        card.classList.add('is-content-visible');
        card.dataset.introContentRevealState = 'revealed';

        const cleanup = this.introCardContentRevealCleanup.get(card);
        if (cleanup) {
            cleanup();
            this.introCardContentRevealCleanup.delete(card);
        }
    }

    /**
     * scheduleSingleIntroCardContentReveal() - 等档案卡壳体稳定后，再把标题和正文分层带出来
     * @param {HTMLElement|null} card - 当前档案卡节点
     * @returns {void}
     */
    scheduleSingleIntroCardContentReveal(card) {
        if (
            !card
            || !card.isConnected
            || !card.classList.contains('is-shell-visible')
        ) {
            return;
        }

        if (card.classList.contains('is-content-visible')) {
            card.dataset.introContentRevealState = 'revealed';
            return;
        }

        if (!this.isIntroCardInView(card)) {
            return;
        }

        if (card.dataset.introContentRevealState === 'scheduled') {
            return;
        }

        const revealCardContent = () => {
            if (!card.isConnected) {
                return;
            }

            this.markIntroCardContentVisible(card);
        };

        const existingCleanup = this.introCardContentRevealCleanup.get(card);
        if (existingCleanup) {
            existingCleanup();
            this.introCardContentRevealCleanup.delete(card);
        }

        if (this.isIntroCardShellSettled(card)) {
            revealCardContent();
            return;
        }

        card.dataset.introContentRevealState = 'scheduled';

        let hasSettled = false;
        let fallbackTimer = 0;

        const cleanup = () => {
            card.removeEventListener('transitionend', onTransitionEnd);
            if (fallbackTimer) {
                window.clearTimeout(fallbackTimer);
                this.introCardContentRevealTimers = this.introCardContentRevealTimers
                    .filter((timerId) => timerId !== fallbackTimer);
                fallbackTimer = 0;
            }
        };

        const finish = () => {
            if (hasSettled) {
                return;
            }

            hasSettled = true;
            cleanup();
            this.introCardContentRevealCleanup.delete(card);
            revealCardContent();
        };

        const onTransitionEnd = (event) => {
            if (event.target !== card || event.propertyName !== 'opacity') {
                return;
            }

            finish();
        };

        card.addEventListener('transitionend', onTransitionEnd);
        fallbackTimer = this.queueIntroCardContentRevealTimer(() => {
            finish();
        }, this.getIntroCardShellTransitionWaitMs(card));
        this.introCardContentRevealCleanup.set(card, cleanup);
    }

    /**
     * scheduleIntroCardShellReveal() - 为当前进入阅读带的档案卡安排壳体翻开效果
     * @returns {void}
     */
    scheduleIntroCardShellReveal() {
        if (!this.introSection?.classList.contains('is-visible')) {
            return;
        }

        if (this.introCardShellRevealRafId) {
            window.cancelAnimationFrame(this.introCardShellRevealRafId);
            this.introCardShellRevealRafId = 0;
        }

        this.introCardShellRevealRafId = window.requestAnimationFrame(() => {
            let visibleBatchIndex = 0;

            this.getIntroArchiveCards().forEach((card) => {
                if (
                    card.isConnected
                    && !card.classList.contains('is-shell-visible')
                    && this.isIntroCardInView(card)
                ) {
                    if (this.markIntroCardShellVisible(card, visibleBatchIndex)) {
                        visibleBatchIndex += 1;
                    }
                }
            });

            this.introCardShellRevealRafId = 0;
            this.scheduleIntroCardContentReveal();
        });
    }

    /**
     * scheduleIntroCardContentReveal() - 为当前已进入阅读带的档案卡安排内部内容 reveal
     * @returns {void}
     */
    scheduleIntroCardContentReveal() {
        if (!this.introSection?.classList.contains('is-visible')) {
            return;
        }

        if (this.introCardContentRevealRafId) {
            window.cancelAnimationFrame(this.introCardContentRevealRafId);
            this.introCardContentRevealRafId = 0;
        }

        this.introCardContentRevealRafId = window.requestAnimationFrame(() => {
            this.getIntroArchiveCards().forEach((card) => {
                if (
                    card.isConnected
                    && card.classList.contains('is-shell-visible')
                    && this.isIntroCardInView(card)
                ) {
                    this.scheduleSingleIntroCardContentReveal(card);
                }
            });

            this.introCardContentRevealRafId = 0;
        });
    }

    /**
     * isIntroSectionInImmediateRevealBand() - 判断介绍区是否已经处于首屏应立即可见的阅读带。
     * 只要用户一进入页面就能看见较完整的 overview，就先给壳体，再补内部 reveal。
     * @returns {boolean}
     */
    isIntroSectionInImmediateRevealBand() {
        if (!this.introSection) {
            return false;
        }

        const rect = this.introSection.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const visibleTop = Math.max(rect.top, 0);
        const visibleBottom = Math.min(rect.bottom, viewportHeight);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const minimumVisibleHeight = Math.min(260, viewportHeight * 0.2);

        return (
            rect.top < viewportHeight * 0.82
            && rect.bottom > viewportHeight * 0.16
            && visibleHeight >= minimumVisibleHeight
        );
    }

    /**
     * scheduleIntroReveal() - 先提交一帧隐藏态，再让介绍区进入显现状态，确保壳体和正文能被肉眼看到。
     * @returns {void}
     */
    scheduleIntroReveal(options = {}) {
        if (!this.introSection) {
            return;
        }

        const { delay = 0 } = options;
        this.clearPendingIntroReveal();
        this.introSection.classList.add('is-shell-visible');

        const commitReveal = () => {
            this.introRevealCommitRafId = window.requestAnimationFrame(() => {
                this.introRevealCommitRafId = window.requestAnimationFrame(() => {
                    if (this.introSection?.isConnected) {
                        this.introSection.classList.add('is-visible');
                        this.scheduleIntroCardShellReveal();
                        this.scheduleIntroCardContentReveal();
                    }
                    this.introRevealCommitRafId = 0;
                });
            });
        };

        if (delay > 0) {
            this.introRevealDelayTimer = window.setTimeout(() => {
                this.introRevealDelayTimer = 0;
                commitReveal();
            }, delay);
            return;
        }

        commitReveal();
    }

    /**
     * setupIntroReveal() - 监听“潜点介绍”进入视口后，再把章节标题和四张档案卡按层次唤醒。
     * 这里不做逐字效果，而是让整块内容像海域档案一样一层层被打开。
     * @returns {void} - 无返回值，直接注册介绍区显现逻辑
     */
    setupIntroReveal() {
        if (!this.introSection) {
            return;
        }

        this.introRevealObserver?.disconnect();

        if (this.isIntroSectionInImmediateRevealBand()) {
            this.introSection.classList.add('is-shell-visible');
            this.scheduleIntroReveal({ delay: 90 });
            return;
        }

        if (!('IntersectionObserver' in window)) {
            this.scheduleIntroReveal();
            return;
        }

        this.introRevealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                this.scheduleIntroReveal();
                this.introRevealObserver?.unobserve(entry.target);
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px 8% 0px'
        });

        this.introRevealObserver.observe(this.introSection);
    }

    /**
     * resetIntroReveal() - 详情内容重新渲染后，重置介绍区显现状态，并在当前已接近视口时重新触发。
     * 这样切换潜点或二次渲染时，不会出现内容已换但动画状态还停留在旧节点上的情况。
     * @returns {void} - 无返回值，直接更新介绍区的可见状态
     */
    resetIntroReveal() {
        if (!this.introSection) {
            return;
        }

        this.clearPendingIntroReveal();
        this.introRevealObserver?.disconnect();
        this.clearIntroCardContentReveal();
        this.clearIntroCardShellReveal();
        this.introSection.classList.remove('is-visible');
        this.introSection.classList.remove('is-shell-visible');

        if (this.isIntroSectionInImmediateRevealBand()) {
            this.introSection.classList.add('is-shell-visible');
            this.scheduleIntroReveal({ delay: 90 });
            return;
        }

        if (!('IntersectionObserver' in window)) {
            this.scheduleIntroReveal();
            return;
        }

        this.setupIntroReveal();
    }

    // 海域定位台数据：组织“海域位置 / 到达方式 / 水下结构”三态视图所需内容。
    /**
     * buildSeaAtlasData() - 生成海域定位台三种视图所需的数据结构
     * @returns {Object} - 海域定位台数据对象
     */
    buildSeaAtlasData() {
        const presets = {
            1: {
                country: '马来西亚',
                region: '沙巴州 · 仙本那外海',
                sea: '苏禄海',
                positionNote: '潜点位于外海深蓝断层边缘，真正的魅力在于海墙落差、蓝水通透感和大型鱼群在同一条线上同时发生。',
                current: '中强流，沿海墙推进',
                levelSummary: 'AOW 推荐，OW 需保守点位',
                route: {
                    hotel: '仙本那海边酒店',
                    harbor: '仙本那码头',
                    boatTime: '45–60 分钟',
                    routeCopy: '从仙本那外海出发，快艇会先离开近岸平台，再进入更通透的深蓝水域。',
                    journey: [
                        '清晨从酒店集合，确认装备、电脑表和当天海况。',
                        '经仙本那码头登船，沿外海平台推进到诗巴丹名额点位。',
                        '靠近主潜线后再做一次 briefing，确认流向、集合深度和出水方式。'
                    ]
                },
                underwater: {
                    title: '海墙与蓝水交界',
                    copy: '这片海的核心不是单一景观，而是海墙、流线和鱼群在不同深度层里接力出现。',
                    layers: [
                        { depth: '0–8m', title: '表层光带', note: '下水适应、集合与光线最明亮的一层。' },
                        { depth: '8–18m', title: '礁顶与龟道', note: '海龟、礁鱼和第一层蓝水在这里变得清楚。' },
                        { depth: '18–40m', title: '海墙与鱼群线', note: '梭鱼风暴、海狼与更强流场集中在这一层。' }
                    ],
                    hotspots: [
                        { title: '海墙边缘', text: '适合观察大景和鱼群流向，也是 AOW 更能潜出层次的位置。' },
                        { title: '龟道与礁顶', text: 'OW 在更保守的点位能先进入这片海的节奏。' }
                    ],
                    levels: [
                        { title: 'OW 友好区', text: '更适合停留在礁顶和更稳的集合深度，重点放在适应节奏。' },
                        { title: 'AOW 推荐区', text: '能更完整进入海墙边缘与蓝水交界，理解诗巴丹真正的张力。' }
                    ]
                }
            },
            2: {
                country: '帕劳共和国',
                region: '科罗尔外海',
                sea: '西太平洋外海',
                positionNote: '这里不是一张单独的点位地图，而是一组由蓝洞、蓝角和大断层串起来的海域剧场。',
                current: '中强流，外海转角明显',
                levelSummary: 'AOW 推荐',
                route: {
                    hotel: '科罗尔潜水酒店',
                    harbor: '马拉卡尔港',
                    boatTime: '40–70 分钟',
                    routeCopy: '从科罗尔一带出海，快艇会根据当日窗口在蓝洞、蓝角或断层之间调度主潜线。',
                    journey: [
                        '酒店集合后前往马拉卡尔港，确认 SMB 和放流节奏。',
                        '根据潮汐和流向决定先去洞穴光线还是外海转角。',
                        '到达主潜点前会再次确认下潜方式、转角集合和出水位置。'
                    ]
                },
                underwater: {
                    title: '洞穴光柱与外海转角',
                    copy: '帕劳的结构像被海流切开的地形剧场，洞穴、断层和转角各有不同节奏。',
                    layers: [
                        { depth: '0–10m', title: '表层台地', note: '阳光稳定，适合整理队形和确认转角流向。' },
                        { depth: '10–22m', title: '蓝洞与断层窗', note: '光柱、地形和视野层次在这一带最完整。' },
                        { depth: '22–35m', title: '蓝角主流线', note: '更开阔，也更考验对外海流潜的判断。' }
                    ],
                    hotspots: [
                        { title: '蓝洞光线层', text: '适合光线与洞穴感，节奏比转角更内敛。' },
                        { title: '蓝角流线区', text: '更成熟的潜水员会把真正的帕劳记忆留在这里。' }
                    ],
                    levels: [
                        { title: 'OW 保守体验', text: '更适合风平的浅层点位，不建议盲目追高流速主线。' },
                        { title: 'AOW 主线', text: '能更完整处理洞穴、断层和外海流向之间的切换。' }
                    ]
                }
            },
            3: {
                country: '伯利兹',
                region: '灯塔礁外海',
                sea: '加勒比海',
                positionNote: '大蓝洞的核心不是海面上的圆，而是垂直向下的结构张力和它与环礁浅区之间的强烈反差。',
                current: '中弱流，深度管理优先',
                levelSummary: 'AOW / 深潜经验更合适',
                route: {
                    hotel: '伯利兹城或外岛酒店',
                    harbor: '伯利兹出海码头',
                    boatTime: '2–3 小时',
                    routeCopy: '这是一条更长的外海航线，出发本身就像在慢慢离开岸线，接近一片更克制、更深的蓝。',
                    journey: [
                        '清晨很早从酒店出发，前往伯利兹外海出海点。',
                        '长船程进入灯塔礁区域，先在外圈浅区做状态调整。',
                        '正式接近蓝洞主体前，会再次确认深度、返程气量与上升节奏。'
                    ]
                },
                underwater: {
                    title: '垂直井口与环礁浅区',
                    copy: '大蓝洞的看点在于结构感本身，深蓝井口、洞顶钟乳石与外圈浅礁共同构成这片海。',
                    layers: [
                        { depth: '0–12m', title: '环礁浅光带', note: '适合先完成热身，也保留更热带的色彩和光。' },
                        { depth: '12–26m', title: '井口过渡层', note: '从浅礁色彩切入深蓝压迫感，是心理落差最大的一段。' },
                        { depth: '26–40m', title: '洞顶结构层', note: '真正的地貌记忆发生在这里，但也需要更严格的深度管理。' }
                    ],
                    hotspots: [
                        { title: '井口边缘', text: '是“看见深蓝”最强的一条线，适合成熟潜水员停留感受。' },
                        { title: '外圈浅礁', text: '回到浅区后，整个海域的色彩和呼吸感会重新变得轻盈。' }
                    ],
                    levels: [
                        { title: 'OW 观察层', text: '更适合留在外圈浅礁和环礁区，不建议把蓝洞主体当入门深潜。' },
                        { title: 'AOW / 进阶层', text: '更能完整理解井口、洞顶和返程节奏之间的关系。' }
                    ]
                }
            },
            4: {
                country: '印度尼西亚',
                region: '帝汶岛海岸线',
                sea: '萨武海',
                positionNote: '帝汶的定位不是猛烈，而是舒展。坡地、珊瑚和更慢的海岸节奏，让这片海更适合长时间停驻。',
                current: '缓流到中流',
                levelSummary: 'OW 友好',
                route: {
                    hotel: '海边潜水酒店',
                    harbor: '潜店小码头',
                    boatTime: '15–45 分钟',
                    routeCopy: '从岸边出发的距离通常不长，更多时间会留给你在海面上看清这片海的层次。',
                    journey: [
                        '酒店集合，按当天海况选择岸潜或短船程点位。',
                        '离开码头后很快就能到达珊瑚坡地与外海交界区。',
                        '主潜点前 briefing 会更强调节奏、微距观察和潜后恢复。'
                    ]
                },
                underwater: {
                    title: '坡地珊瑚与慢潜线',
                    copy: '这片海更适合把注意力放在层次和停留上，而不是急着追逐某个瞬间。',
                    layers: [
                        { depth: '0–6m', title: '浅礁与日光层', note: '光线稳定，适合初次适应和更轻松的观察。' },
                        { depth: '6–18m', title: '珊瑚坡地', note: '大部分生态与色彩在这一层展开，也是帝汶最舒服的节奏区。' },
                        { depth: '18–32m', title: '外坡过渡带', note: '更成熟的潜水员可以在这里看到更开阔的海底层次。' }
                    ],
                    hotspots: [
                        { title: '珊瑚坡地', text: '适合慢慢看、慢慢拍，整片海不会催着你往前赶。' },
                        { title: '夜潜边界', text: '傍晚或夜潜时，小生物和软体动物会让体验更完整。' }
                    ],
                    levels: [
                        { title: 'OW 推荐区', text: '浅层与中层都很友好，适合把潜水和度假放在一起。' },
                        { title: 'AOW 延展区', text: '可往外坡带延伸，看更开阔的蓝水和坡地落差。' }
                    ]
                }
            },
            5: {
                country: '密克罗尼西亚',
                region: '波纳佩环礁',
                sea: '西太平洋静水海域',
                positionNote: '波纳佩不是一片用“气势”征服人的海，它更像放慢后的显微镜，让细节自己浮现出来。',
                current: '静水到缓流',
                levelSummary: '入门 / OW 友好',
                route: {
                    hotel: '波纳佩海湾酒店',
                    harbor: '科洛尼亚码头',
                    boatTime: '10–35 分钟',
                    routeCopy: '从海湾和环礁边缘出发，通常不用很久就能到达更适合慢潜和微距观察的区域。',
                    journey: [
                        '从酒店集合后前往科洛尼亚码头，节奏通常比较轻。',
                        '根据天气和能见度决定今天更偏微距、夜潜还是浅礁观察。',
                        '到点前会先提醒队伍压低动作和保持底沙控制。'
                    ]
                },
                underwater: {
                    title: '微距生态与静水观察',
                    copy: '这里的海底更像一页页被翻开的观察笔记，真正的惊喜常常来自更小的尺度。',
                    layers: [
                        { depth: '0–5m', title: '海草与浅礁层', note: '适合轻松热身，也容易先看到幼鱼和小型生物。' },
                        { depth: '5–14m', title: '微距主观察层', note: '大多数细节都在这个深度段慢慢出现。' },
                        { depth: '14–24m', title: '静水延展层', note: '适合经验更稳的人继续做微距或夜潜延伸。' }
                    ],
                    hotspots: [
                        { title: '软珊瑚平台', text: '适合耐心观察，很多小型生物会在这里反复出现。' },
                        { title: '夜潜带', text: '到了夜里，这片海会从安静变成细节密集。' }
                    ],
                    levels: [
                        { title: '入门 / OW 区', text: '整片海的节奏本来就比较友好，非常适合把潜水放慢。' },
                        { title: 'AOW 延展区', text: '更适合做长时间观察、夜潜和更细致的摄影练习。' }
                    ]
                }
            },
            6: {
                country: '印度尼西亚',
                region: '北苏拉威西外海',
                sea: '苏拉威西海',
                positionNote: '布纳肯的定位像一条明亮的海墙线，海龟、清澈蓝水和更从容的墙潜节奏在这里取得了很好的平衡。',
                current: '缓流到中流',
                levelSummary: 'OW / AOW 都适合',
                route: {
                    hotel: '布纳肯岛度假村',
                    harbor: '马纳多码头',
                    boatTime: '30–45 分钟',
                    routeCopy: '从马纳多一带出发后不久，海水就会变得更通透，墙潜线会在靠近海洋公园时逐渐打开。',
                    journey: [
                        '酒店或度假村集合，先确认当天更适合海墙、海龟还是浅礁点位。',
                        '从马纳多码头或岛上码头登船，进入布纳肯海洋公园主线。',
                        '靠近海墙边缘后会先做一轮更轻的适应，再进入更深一点的蓝。'
                    ]
                },
                underwater: {
                    title: '海墙、海龟与明亮蓝水',
                    copy: '布纳肯的魅力来自平衡感，既有海墙的落差，也不会把整趟潜水推得太紧。',
                    layers: [
                        { depth: '0–6m', title: '表层亮带', note: '阳光感很强，适合轻松热身和集合。' },
                        { depth: '6–18m', title: '海龟巡游层', note: '海龟和礁鱼常在这一层停留，节奏很舒服。' },
                        { depth: '18–30m', title: '墙潜延展层', note: 'AOW 更能在这里看出海墙、蓝水和外坡的关系。' }
                    ],
                    hotspots: [
                        { title: '海墙边缘', text: '适合看通透蓝水和更完整的墙潜线条。' },
                        { title: '珊瑚平台', text: 'OW 也能在更舒适的深度里把这片海看得很完整。' }
                    ],
                    levels: [
                        { title: 'OW 友好区', text: '中浅层就足够漂亮，也不会因为海况被压得太紧。' },
                        { title: 'AOW 延展区', text: '可继续往海墙边缘移动，看更开阔的蓝水和落差。' }
                    ]
                }
            },
            7: {
                country: '印度尼西亚',
                region: '科莫多国家公园',
                sea: '科莫多海峡',
                positionNote: '这是一片被潮汐和海流写出骨架的海域，真正决定体验的，不只是潜点名，而是当天流向和窗口。',
                current: '中强流，窗口变化快',
                levelSummary: 'AOW 推荐',
                route: {
                    hotel: '拉布安巴霍海景酒店',
                    harbor: '拉布安巴霍码头',
                    boatTime: '45–90 分钟',
                    routeCopy: '出海后的推进感很明显，海峡之间的潮汐和外海风向会直接决定今天该往哪一片水走。',
                    journey: [
                        '从拉布安巴霍出发，先按潮汐和风向确认主潜线。',
                        '快艇进入国家公园后，会根据窗口灵活切换蝠鲼、流区或大景点位。',
                        '正式入水前会反复强调集合方式、放流和出水回收。'
                    ]
                },
                underwater: {
                    title: '海峡流线与大景潜',
                    copy: '科莫多不是单一结构，而是一整片由海流驱动的海底剧场，蝠鲼、大鱼和外坡会在不同窗口轮流出现。',
                    layers: [
                        { depth: '0–8m', title: '表层准备带', note: '先判断能见度、温差和水流强度。' },
                        { depth: '8–20m', title: '主观景层', note: '蝠鲼、大鱼和流线最常在这一层交会。' },
                        { depth: '20–34m', title: '外坡延展层', note: '更成熟的潜水员能在这里理解科莫多的真正张力。' }
                    ],
                    hotspots: [
                        { title: '流区转角', text: '决定这片海“有多科莫多”的往往就是这里。' },
                        { title: '蝠鲼清洁站', text: '适合耐心停留，而不是追逐。' }
                    ],
                    levels: [
                        { title: 'OW 保守区', text: '只建议在更温和窗口和更友好点位保守体验。' },
                        { title: 'AOW 主线', text: '更能理解流线、点位切换和大景潜的节奏。' }
                    ]
                }
            },
            8: {
                country: '法属波利尼西亚',
                region: '图阿莫图群岛',
                sea: '南太平洋环礁通道',
                positionNote: '图阿莫图更像一整套被潮汐定义的蓝水结构，通道决定方向，大鱼决定记忆，开阔感决定它的气质。',
                current: '通道流，受潮汐影响明显',
                levelSummary: 'AOW 推荐',
                route: {
                    hotel: '环礁旅馆或船宿',
                    harbor: '主码头 / 环礁泊位',
                    boatTime: '20–60 分钟',
                    routeCopy: '真正的出发点是潮汐窗口。路线会围绕进出水流与通道节奏来设计，而不是按固定顺序打卡。',
                    journey: [
                        '从旅馆或船宿出发，先按潮汐时刻表确认当天窗口。',
                        '进入环礁通道前会更细致地说明集合、漂流和出水时机。',
                        '到达主潜线后，通常会先让你看懂水是怎么走的，再真正开始下去。'
                    ]
                },
                underwater: {
                    title: '环礁通道与鲨鱼蓝水',
                    copy: '这片海的结构是横向展开的，潮汐像把整片蓝水推成一条有方向感的海底通道。',
                    layers: [
                        { depth: '0–8m', title: '表层光窗', note: '光线开阔，也是观察潮流最直接的一层。' },
                        { depth: '8–18m', title: '通道主线', note: '鲨鱼、大鱼和通透蓝水在这一层最完整。' },
                        { depth: '18–32m', title: '深一点的通道边', note: '更成熟的潜水员能在这里看见更强的空间张力。' }
                    ],
                    hotspots: [
                        { title: '通道中央线', text: '决定今天是更激烈还是更平稳的关键位置。' },
                        { title: '环礁边缘', text: '适合看清浅区色彩与外海蓝水的反差。' }
                    ],
                    levels: [
                        { title: 'OW 保守区', text: '只适合在很稳的窗口靠浅层边缘体验，不适合追主流线。' },
                        { title: 'AOW 主线', text: '更能在通道中心和边缘之间做判断，理解图阿莫图的价值。' }
                    ]
                }
            },
            9: {
                country: '马来西亚',
                region: '沙巴州 · 仙本那外海',
                sea: '西里伯斯海',
                positionNote: '马布岛的价值不在“最猛烈”，而在它把海岛生活、浅礁生态和轻松停驻感自然地缝在了一起。',
                current: '缓流到中流',
                levelSummary: '入门 / OW 友好',
                route: {
                    hotel: '马布水屋或岛上海景酒店',
                    harbor: '仙本那码头',
                    boatTime: '35–50 分钟',
                    routeCopy: '从仙本那出海后，海面会慢慢从近岸日常过渡到更清透的热带蓝，像是在靠近一个更慢的海岛节奏。',
                    journey: [
                        '在仙本那集合后登船，出发前先确认装备与当天海况。',
                        '快艇驶向马布岛时，码头、水屋和浅礁会逐渐进入视野。',
                        '若当天安排联潜或夜潜，briefing 会提前说明码头区和浅礁带的节奏差异。'
                    ]
                },
                underwater: {
                    title: '浅礁、码头生态与慢节奏海岛线',
                    copy: '马布岛的海底结构更贴近生活感，浅礁、码头和轻蓝色海面把潜水变成一件更柔和的事。',
                    layers: [
                        { depth: '0–5m', title: '表层与码头光带', note: '适合轻松集合，也最能感受到这片海的生活气息。' },
                        { depth: '5–12m', title: '浅礁生态层', note: 'OW 和入门体验最舒服的一层，小型生态很丰富。' },
                        { depth: '12–18m', title: '外侧蓝水过渡层', note: '更成熟的潜水员可在这里把浅礁和外海感连起来。' }
                    ],
                    hotspots: [
                        { title: '码头生态带', text: '适合夜潜、小生物和更有日常气息的海底观察。' },
                        { title: '浅礁外侧', text: '适合第一次把“度假和潜水”真正放在一起的人。' }
                    ],
                    levels: [
                        { title: '入门 / OW 区', text: '更友好、更慢，也更容易让第一次海底心动发生。' },
                        { title: 'AOW 延展区', text: '可以在外侧蓝水层看见更完整的热带海层次。' }
                    ]
                }
            },
            13: {
                country: '泰国',
                region: '普吉南部 · 皇帝岛',
                sea: '安达曼海',
                positionNote: '皇帝岛更像一片把白沙海湾、清水坡地和轻船潜节奏安静缝在一起的海。它不是靠压迫感留下你，而是靠层次清楚、进入方式舒缓，让人很自然地往更深一点的蓝靠近。',
                current: '中弱流，外侧窗口更明显',
                levelSummary: 'OW / AOW 友好',
                route: {
                    hotel: '普吉南部海边酒店',
                    harbor: '查龙码头',
                    boatTime: '35–60 分钟',
                    routeCopy: '从普吉南部出发后，船不会很久才进入状态。海会先把白沙湾、明亮浅水和外侧更深一点的蓝层次慢慢排开，再决定今天往哪条线靠近。',
                    journey: [
                        '酒店集合后前往查龙码头，先确认装备、配重和当天海况。',
                        '出海后会先判断今天更适合白沙湾、礁坡还是外侧蓝水窗口。',
                        '到主潜线前再做一次 briefing，确认下水顺序、集合深度和回船方式。'
                    ]
                },
                underwater: {
                    title: '白沙海湾、礁坡与外侧蓝水',
                    copy: '皇帝岛的价值不在“最猛”，而在它会先把海底结构摆清楚，让潜水员更容易在放松里读懂这片海。',
                    layers: [
                        { depth: '0–6m', title: '白沙光带', note: '适合适应、集合和把第一口呼吸慢慢放稳。' },
                        { depth: '6–16m', title: '礁坡主体验层', note: '大多数热带生态和这片海的舒服节奏会在这里展开。' },
                        { depth: '16–28m', title: '外侧蓝水过渡层', note: 'AOW 更能在这里看见礁坡和外侧更深蓝之间的关系。' }
                    ],
                    hotspots: [
                        { title: '白沙湾内侧', text: '适合先把身体和海况对齐，也是第一次靠近这片海最友好的入口。' },
                        { title: '外侧坡地线', text: '更适合状态稳定以后，把这片海的通透感和结构一起读清楚。' }
                    ],
                    levels: [
                        { title: 'OW 建议区', text: '优先安排在更稳的海湾与礁坡层，先把节奏真正找回来。' },
                        { title: 'AOW 建议区', text: '可根据当天窗口延展到更外侧一点的蓝水过渡层。' }
                    ]
                }
            },
            14: {
                country: '马来西亚',
                region: '登嘉楼州 · 热浪岛',
                sea: '南中国海',
                positionNote: '热浪岛更像一片先把身体安放好的海。白沙、清透浅蓝和外侧礁坡会先把节奏放轻，再让你慢慢进入更完整的海底层次。',
                current: '中弱流，午后窗口更敏感',
                levelSummary: 'OW / AOW 友好',
                route: {
                    hotel: '热浪岛海边度假酒店',
                    harbor: '墨浪码头 / 岛上接驳点',
                    boatTime: '30–55 分钟',
                    routeCopy: '从码头离岸后不久，海色会先从浅蓝慢慢加深。真正的重点不是“最快到点”，而是让人先把海况读懂，再往外侧推进。',
                    journey: [
                        '酒店集合后确认装备、防晒补水和当天风浪窗口。',
                        '登船离岸后先观察浅礁与外侧水色变化，确认当日主潜线。',
                        '到点前进行 briefing，统一集合深度、回船方式和安全停留节奏。'
                    ]
                },
                underwater: {
                    title: '白沙浅礁、坡地过渡与外侧蓝水',
                    copy: '热浪岛的层次是从轻到深展开的。它先让人把呼吸放慢，再把海底结构一点点交给你。',
                    layers: [
                        { depth: '0–6m', title: '白沙浅蓝光带', note: '适合集合、适应和把节奏先稳住。' },
                        { depth: '6–18m', title: '礁坡主体验层', note: '大多数热带生态和通透蓝感会在这里出现。' },
                        { depth: '18–30m', title: '外侧蓝水延展层', note: 'AOW 更能在这一层理解热浪岛的结构过渡。' }
                    ],
                    hotspots: [
                        { title: '白沙湾外侧线', text: '适合先读懂浅礁和外侧蓝水边界的入口区域。' },
                        { title: '礁坡转折位', text: '最容易看见这片海从轻到深的层次变化。' }
                    ],
                    levels: [
                        { title: 'OW 建议区', text: '优先停在浅礁和主体验层，先让身体与节奏对齐。' },
                        { title: 'AOW 建议区', text: '可在稳定窗口延展到外侧蓝水层，保持安全停留余量。' }
                    ]
                }
            }
        };

        const preset = presets[this.spotId] || {
            country: this.spotData.mapLocation.split('·')[0]?.trim() || '海域定位',
            region: this.spotData.mapLocation.split('·')[1]?.trim() || this.spotData.mapLocation,
            sea: '外海海域',
            positionNote: '这片海的进入方式、深度层次与潜水节奏，会决定你最终如何记住它。',
            current: '以当天海况为准',
            levelSummary: '按证书等级与近期经验安排',
            route: {
                hotel: '海边酒店',
                harbor: '出发码头',
                boatTime: '30–60 分钟',
                routeCopy: '从酒店到码头，再到主潜线，真正重要的是让身体和海况一起进入状态。',
                journey: [
                    '酒店集合后确认装备与海况。',
                    '码头登船，沿当天窗口进入主潜线。',
                    '到点前再次确认集合深度和出水方式。'
                ]
            },
            underwater: {
                title: '海底结构与进入节奏',
                copy: '这片海更适合先看懂层次，再决定往哪一层继续下去。',
                layers: [
                    { depth: '0–6m', title: '表层光带', note: '适合适应、集合和热身。' },
                    { depth: '6–18m', title: '主体验层', note: '大多数体验会在这一层发生。' },
                    { depth: '18m+', title: '更深延展层', note: '更适合成熟潜水员继续向下理解这片海。' }
                ],
                hotspots: [
                    { title: '主潜线', text: '最能代表这片海气质的位置。' }
                ],
                levels: [
                    { title: 'OW 建议', text: '优先选择更稳、更浅的点位进入节奏。' },
                    { title: 'AOW 建议', text: '可根据海况延展到更深一层。' }
                ]
            }
        };

        return {
            ...preset,
            coordinates: this.spotData.coordinates,
            season: this.spotData.season,
            depth: this.spotData.depth,
            difficulty: this.spotData.difficulty,
            spotName: this.spotData.name,
            mapLocation: this.spotData.mapLocation
        };
    }

    // 海域定位台视图：负责生成三态切换按钮、深海地图舞台和信息档案结构。
    /**
     * getSeaRouteLayoutPreset(viewportWidth) - 根据当前视口宽度返回固定路线舞台预设
     * @param {number} viewportWidth - 当前视口宽度
     * @returns {{ key:string, viewBox:{width:number,height:number}, path:string, nodes:Array<Object> }}
     */
    getSeaRouteLayoutPreset(viewportWidth = window.innerWidth) {
        const presets = {
            wide: {
                key: 'wide',
                viewBox: { width: 640, height: 360 },
                path: 'M 88 258 C 126 240 172 214 232 196 C 300 174 360 144 420 134 C 474 132 522 164 548 214',
                nodes: [
                    { x: 88, y: 258, shiftX: 8, width: 156, nodeGap: 56 },
                    { x: 232, y: 196, shiftX: 28, width: 152, nodeGap: 42 },
                    { x: 420, y: 134, shiftX: -18, width: 154, nodeGap: 16 },
                    { x: 548, y: 214, shiftX: -54, width: 176, nodeGap: 18, placement: 'below', final: true }
                ]
            },
            compact: {
                key: 'compact',
                viewBox: { width: 640, height: 360 },
                path: 'M 84 264 C 120 246 162 222 214 198 C 272 174 330 150 388 144 C 446 142 498 170 526 212',
                nodes: [
                    { x: 84, y: 264, shiftX: 6, width: 142, nodeGap: 52 },
                    { x: 214, y: 198, shiftX: 26, width: 142, nodeGap: 40 },
                    { x: 388, y: 144, shiftX: -12, width: 144, nodeGap: 16 },
                    { x: 526, y: 212, shiftX: -46, width: 160, nodeGap: 18, placement: 'below', final: true }
                ]
            }
        };

        const selected = viewportWidth >= 1080 ? presets.wide : presets.compact;
        return {
            ...selected,
            viewBox: { ...selected.viewBox },
            nodes: selected.nodes.map((node) => ({ ...node }))
        };
    }
    /**
     * createSeaAtlasMarkup(atlas, mapData) - 生成海域定位台的完整 HTML 结构
     * @param {Object} atlas - 海域定位台数据对象
     * @param {Object|null} mapData - 当前潜点的真地图数据
     * @returns {string} - 地图区域 HTML 字符串
     */
    createSeaAtlasMarkup(atlas, mapData = null) {
        const tabs = [
            { key: 'location', label: '海域位置' },
            { key: 'route', label: '到达方式' },
            { key: 'underwater', label: '水下结构' }
        ];
        const isUnderwaterView = this.activeSeaView === 'underwater';
        const isRouteView = this.activeSeaView === 'route';
        const isLocationView = !isUnderwaterView && !isRouteView;
        const coordinateText = this.spotData.coordinates || formatLatLngDisplay(mapData?.spotCoords);
        const locationMeta = [
            ['区域海域', mapData?.regionTag || `${atlas.country} · ${atlas.sea}`],
            ['真实坐标', coordinateText || '以当前海域为准'],
            ['出发码头', mapData?.portLabel || atlas.route.harbor],
            ['船程 / 靠近', mapData?.routeLabel || atlas.route.boatTime]
        ];
        const routeMeta = [
            ['出发酒店', atlas.route.hotel],
            ['出发码头', mapData?.portLabel || atlas.route.harbor],
            ['当前季节', mapData?.seasonLabel || atlas.season],
            ['推荐深度', mapData?.depthRange || atlas.depth]
        ];
        const underwaterLayers = Array.isArray(atlas.underwater?.layers) ? atlas.underwater.layers : [];
        const underwaterHotspots = Array.isArray(atlas.underwater?.hotspots) ? atlas.underwater.hotspots : [];
        const underwaterLevels = Array.isArray(atlas.underwater?.levels) ? atlas.underwater.levels : [];
        const visualHotspots = underwaterHotspots.map((spot, index) => {
            const ratio = underwaterHotspots.length <= 1
                ? 0.5
                : index / Math.max(underwaterHotspots.length - 1, 1);

            return {
                ...spot,
                index,
                side: index % 2 === 0 ? 'left' : 'right',
                serial: String(index + 1).padStart(2, '0'),
                top: `${(28 + (ratio * 42)).toFixed(2)}%`
            };
        });

        return `
            <div class="sea-atlas-shell" id="seaAtlasShell">
                <div class="sea-atlas-resize-layer" aria-hidden="true">
                    <button type="button" class="sea-atlas-resize-handle is-east" data-sea-atlas-resize="e" tabindex="-1" aria-hidden="true"></button>
                    <button type="button" class="sea-atlas-resize-handle is-south" data-sea-atlas-resize="s" tabindex="-1" aria-hidden="true"></button>
                    <button type="button" class="sea-atlas-resize-handle is-west" data-sea-atlas-resize="w" tabindex="-1" aria-hidden="true"></button>
                    <button type="button" class="sea-atlas-resize-handle is-south-east" data-sea-atlas-resize="se" tabindex="-1" aria-hidden="true"></button>
                    <button type="button" class="sea-atlas-resize-handle is-south-west" data-sea-atlas-resize="sw" tabindex="-1" aria-hidden="true"></button>
                </div>
                <div class="sea-atlas" data-sea-view="${this.activeSeaView}">
                    <div class="sea-atlas-head">
                        <p class="sea-atlas-kicker">Sea Atlas</p>
                        <p class="sea-atlas-lead">不是在看一张普通地图，而是在读这片海真实的位置、靠近方式，以及它如何慢慢把你带进更深一层。</p>
                        <div class="sea-atlas-controls">
                            <div class="sea-atlas-tabs" role="tablist" aria-label="海域定位台视图切换">
                                ${tabs.map((tab) => `
                                    <button
                                        type="button"
                                        class="sea-atlas-tab ${this.activeSeaView === tab.key ? 'is-active' : ''}"
                                        data-sea-view="${tab.key}"
                                        role="tab"
                                        aria-selected="${this.activeSeaView === tab.key ? 'true' : 'false'}"
                                    >
                                        ${tab.label}
                                    </button>
                                `).join('')}
                            </div>
                            <div class="sea-atlas-actions" ${isUnderwaterView ? 'hidden' : ''}>
                                <button
                                    type="button"
                                    class="sea-atlas-reset-view"
                                    data-sea-atlas-reset-view
                                    data-sea-atlas-target="inline"
                                    aria-label="恢复当前潜点的初始位置"
                                >
                                    恢复初始位置
                                </button>
                                <button
                                    type="button"
                                    class="sea-atlas-open-map"
                                    data-sea-atlas-open-fullscreen
                                    aria-label="展开当前潜点的全屏海图"
                                >
                                    展开全图
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="sea-atlas-stage">
                        <section class="sea-atlas-panel ${!isUnderwaterView ? 'is-active' : ''} sea-atlas-map-panel" data-sea-panel="map">
                            <div class="sea-atlas-visual sea-atlas-visual-map">
                                <div class="sea-atlas-visual-view ${isLocationView ? 'is-active' : ''}" data-sea-visual-view="location">
                                    <div class="sea-atlas-map-slot" data-sea-atlas-map-slot></div>
                                </div>
                                <div class="sea-atlas-visual-view ${isRouteView ? 'is-active' : ''}" data-sea-visual-view="route">
                                    <div class="sea-route-board-slot" data-sea-route-board-slot></div>
                                </div>
                            </div>

                            <div class="sea-atlas-dossier sea-atlas-dossier-map">
                                <div class="sea-atlas-dossier-view ${!isRouteView ? 'is-active' : ''}" data-sea-dossier-view="location">
                                    <h3 class="sea-atlas-card-title">海域位置</h3>
                                    <p class="sea-atlas-card-copy">${atlas.positionNote}</p>
                                    <div class="sea-atlas-meta-grid">
                                        ${locationMeta.map(([label, value]) => `
                                            <div class="sea-atlas-meta-item">
                                                <span class="sea-atlas-meta-label">${label}</span>
                                                <span class="sea-atlas-meta-value">${value}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                    <div class="sea-atlas-tags">
                                        <span class="sea-atlas-tag">${atlas.current}</span>
                                        <span class="sea-atlas-tag">${atlas.levelSummary}</span>
                                        <span class="sea-atlas-tag">${mapData?.seasonLabel || atlas.season}</span>
                                    </div>
                                </div>

                                <div class="sea-atlas-dossier-view ${isRouteView ? 'is-active' : ''}" data-sea-dossier-view="route">
                                    <h3 class="sea-atlas-card-title">到达方式</h3>
                                    <p class="sea-atlas-card-copy">${atlas.route.routeCopy}</p>
                                    <div class="sea-atlas-meta-grid">
                                        ${routeMeta.map(([label, value]) => `
                                            <div class="sea-atlas-meta-item">
                                                <span class="sea-atlas-meta-label">${label}</span>
                                                <span class="sea-atlas-meta-value">${value}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                    <div class="sea-route-journey">
                                        ${atlas.route.journey.map((item) => `<div class="sea-route-journey-item">${item}</div>`).join('')}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section class="sea-atlas-panel ${isUnderwaterView ? 'is-active' : ''}" data-sea-panel="underwater">
                            <div class="sea-atlas-visual">
                                <div class="sea-profile">
                                    <div class="sea-profile-surface"></div>
                                    <div class="sea-profile-grid" aria-hidden="true"></div>
                                    <div class="sea-profile-depth-rail" aria-hidden="true"></div>
                                    <div class="sea-profile-arrow">
                                        <span>${atlas.current}</span>
                                        <svg viewBox="0 0 74 16" aria-hidden="true">
                                            <path d="M2 8h60M52 2l10 6-10 6" />
                                        </svg>
                                    </div>
                                    <div class="sea-profile-layers">
                                        ${underwaterLayers.map((layer, index) => `
                                            <article class="sea-profile-layer" style="--sea-profile-index:${index};">
                                                <div class="sea-profile-depth">${layer.depth}</div>
                                                <div class="sea-profile-band">
                                                    <span class="sea-profile-band-glow" aria-hidden="true"></span>
                                                    <strong>${layer.title}</strong>
                                                    <span>${layer.note}</span>
                                                </div>
                                            </article>
                                        `).join('')}
                                    </div>
                                    <div class="sea-profile-markers" aria-hidden="true">
                                        ${visualHotspots.map((spot) => `
                                            <article
                                                class="sea-profile-marker is-${spot.side}"
                                                style="--sea-profile-index:${spot.index}; --sea-profile-marker-top:${spot.top};"
                                            >
                                                <span class="sea-profile-marker-dot"></span>
                                                <div class="sea-profile-marker-copy">
                                                    <em>${spot.serial}</em>
                                                    <strong>${spot.title}</strong>
                                                </div>
                                            </article>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>

                            <div class="sea-atlas-dossier sea-atlas-dossier-underwater">
                                <h3 class="sea-atlas-card-title">${atlas.underwater.title}</h3>
                                <p class="sea-atlas-card-copy">${atlas.underwater.copy}</p>
                                <div class="sea-profile-hotspots">
                                    ${underwaterHotspots.map((spot, index) => `
                                        <div class="sea-profile-hotspot" style="--sea-profile-copy-index:${index};">
                                            <strong>${spot.title}</strong>
                                            <span>${spot.text}</span>
                                        </div>
                                    `).join('')}
                                </div>
                                <div class="sea-atlas-levels">
                                    ${underwaterLevels.map((level, index) => `
                                        <div class="sea-atlas-level" style="--sea-profile-copy-index:${index};">
                                            <strong>${level.title}</strong>
                                            <span>${level.text}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        `;
    }

    createSeaAtlasStageMarkup({ fullscreen = false } = {}) {
        return `
            <div class="sea-atlas-map is-live-map${fullscreen ? ' is-fullscreen' : ''}" data-sea-atlas-map-stage>
                <div class="sea-atlas-map-base" data-sea-atlas-map-base>
                    <div class="sea-atlas-map-canvas" data-sea-atlas-map-canvas></div>
                    <div class="sea-atlas-map-tint" aria-hidden="true"></div>
                    <div class="sea-atlas-map-fog" aria-hidden="true"></div>
                    <div class="sea-atlas-map-currents" aria-hidden="true"></div>
                    <div class="sea-atlas-map-vignette" aria-hidden="true"></div>
                    <div class="sea-atlas-map-fallback" data-sea-atlas-fallback hidden></div>
                </div>
                <div class="sea-atlas-route-overlay" data-sea-atlas-route-overlay aria-hidden="true">
                    <svg class="sea-atlas-route-svg" data-sea-atlas-route-svg preserveAspectRatio="none">
                        <path class="sea-atlas-route-line-glow sea-route-line-glow" data-sea-atlas-route-layer="glow"></path>
                        <path class="sea-atlas-route-line-base sea-route-line-base" data-sea-atlas-route-layer="base"></path>
                        <path class="sea-atlas-route-line sea-route-line" data-sea-atlas-route-layer="line"></path>
                        <path class="sea-atlas-route-line-sheen sea-route-line-sheen" data-sea-atlas-route-layer="sheen"></path>
                    </svg>
                </div>
                <div class="sea-atlas-info-root" data-sea-atlas-info-root></div>
            </div>
        `.trim();
    }

    getSeaAtlasMapMount() {
        if (this.seaAtlasMapMount) {
            return this.seaAtlasMapMount;
        }

        const template = document.createElement('template');
        template.innerHTML = this.createSeaAtlasStageMarkup();
        this.seaAtlasMapMount = template.content.firstElementChild;
        this.seaAtlasMapBase = this.seaAtlasMapMount?.querySelector('[data-sea-atlas-map-base]') || null;
        this.seaAtlasRouteOverlay = this.seaAtlasMapMount?.querySelector('[data-sea-atlas-route-overlay]') || null;
        this.seaAtlasInfoRoot = this.seaAtlasMapMount?.querySelector('[data-sea-atlas-info-root]') || null;
        this.seaAtlasFallback = this.seaAtlasMapMount?.querySelector('[data-sea-atlas-fallback]') || null;
        return this.seaAtlasMapMount;
    }

    getSeaAtlasFullscreenMapMount() {
        if (this.seaAtlasFullscreenMapMount) {
            return this.seaAtlasFullscreenMapMount;
        }

        const template = document.createElement('template');
        template.innerHTML = this.createSeaAtlasStageMarkup({
            fullscreen: true
        });
        this.seaAtlasFullscreenMapMount = template.content.firstElementChild;
        this.seaAtlasFullscreenMapBase = this.seaAtlasFullscreenMapMount?.querySelector('[data-sea-atlas-map-base]') || null;
        this.seaAtlasFullscreenRouteOverlay = this.seaAtlasFullscreenMapMount?.querySelector('[data-sea-atlas-route-overlay]') || null;
        this.seaAtlasFullscreenInfoRoot = this.seaAtlasFullscreenMapMount?.querySelector('[data-sea-atlas-info-root]') || null;
        this.seaAtlasFullscreenFallback = this.seaAtlasFullscreenMapMount?.querySelector('[data-sea-atlas-fallback]') || null;
        return this.seaAtlasFullscreenMapMount;
    }

    attachSeaAtlasMapMount() {
        const slot = this.mapContainer?.querySelector('[data-sea-atlas-map-slot]') || null;
        const mount = this.getSeaAtlasMapMount();
        if (!slot || !mount) {
            return null;
        }

        if (mount.parentElement !== slot) {
            slot.appendChild(mount);
        }

        return mount;
    }

    attachSeaAtlasFullscreenMapMount() {
        const slot = this.seaAtlasFullscreenSlot;
        const mount = this.getSeaAtlasFullscreenMapMount();
        if (!slot || !mount) {
            return null;
        }

        if (mount.parentElement !== slot) {
            slot.appendChild(mount);
        }

        return mount;
    }

    getSeaRouteBoardMount() {
        if (this.seaRouteBoardMount) {
            return this.seaRouteBoardMount;
        }

        const template = document.createElement('template');
        template.innerHTML = `
            <div class="sea-route-board sea-route-map" data-sea-route-board-stage>
                <div class="sea-route-heading">
                    <span class="sea-route-kicker" data-sea-atlas-heading-kicker>Approach Line</span>
                    <p class="sea-route-murmur" data-sea-atlas-heading-murmur></p>
                </div>
                <div class="sea-route-stage" data-sea-route-stage></div>
            </div>
        `.trim();

        this.seaRouteBoardMount = template.content.firstElementChild;
        this.seaRouteBoardStage = this.seaRouteBoardMount?.querySelector('[data-sea-route-stage]') || null;
        this.seaAtlasHeadingKicker = this.seaRouteBoardMount?.querySelector('[data-sea-atlas-heading-kicker]') || null;
        this.seaAtlasHeadingMurmur = this.seaRouteBoardMount?.querySelector('[data-sea-atlas-heading-murmur]') || null;
        return this.seaRouteBoardMount;
    }

    attachSeaRouteBoardMount() {
        const slot = this.mapContainer?.querySelector('[data-sea-route-board-slot]') || null;
        const mount = this.getSeaRouteBoardMount();
        if (!slot || !mount) {
            return null;
        }

        if (mount.parentElement !== slot) {
            slot.appendChild(mount);
        }

        return mount;
    }

    syncSeaAtlasMapStageCopy() {
        if (!this.mapContainer) {
            return;
        }

        const isRouteView = this.activeSeaView === 'route';
        const isUnderwaterView = this.activeSeaView === 'underwater';
        const actionGroup = this.mapContainer.querySelector('.sea-atlas-actions');
        if (actionGroup) {
            actionGroup.hidden = isUnderwaterView;
        }

        if (this.seaAtlasHeadingKicker) {
            this.seaAtlasHeadingKicker.textContent = 'Approach Line';
        }
        if (this.seaAtlasHeadingMurmur) {
            this.seaAtlasHeadingMurmur.textContent = isRouteView
                ? `${this.seaAtlasCurrentMapData?.portLabel || '出发点'} 到 ${this.seaAtlasCurrentMapData?.spotLabel || this.spotData.name} 的靠近路线，不是导航说明，而是这一程如何慢慢进入这片海。`
                : `${this.seaAtlasCurrentMapData?.portLabel || '出发点'} 到 ${this.seaAtlasCurrentMapData?.spotLabel || this.spotData.name} 的这一程，会先从岸边节奏慢慢离开，再把海色一点点收深。`;
        }

        if (this.seaAtlasFullscreenTitle) {
            this.seaAtlasFullscreenTitle.textContent = `${this.spotData.name} · 全屏海图`;
        }

        if (this.seaAtlasFullscreenMeta) {
            this.seaAtlasFullscreenMeta.textContent = `${this.seaAtlasCurrentMapData?.regionTag || this.spotData.mapLocation || '当前海域'} · ${this.seaAtlasCurrentMapData?.routeLabel || '靠近路线会在这里完整展开'}`;
        }

        this.syncSeaAtlasResetButtonState('inline');
        this.syncSeaAtlasResetButtonState('fullscreen');
    }

    getSeaRouteStageNodes(layout, atlas = this.seaAtlasCurrentAtlasData, mapData = this.seaAtlasCurrentMapData) {
        const route = atlas?.route || {};
        const spotLabel = mapData?.spotLabel || this.spotData.name;
        const nodeCopy = [
            {
                step: '岸边集合',
                value: route.hotel || '海边酒店',
                note: '先把呼吸和海况慢慢对齐'
            },
            {
                step: '码头离岸',
                value: mapData?.portLabel || route.harbor || '出发码头',
                note: '船身从这里离开岸边日常'
            },
            {
                step: '船行渐深',
                value: mapData?.routeLabel || route.boatTime || '30-60 分钟',
                note: '海色会在这一程里慢慢收深'
            },
            {
                step: '入海点',
                value: spotLabel,
                note: '在这里把今天的主潜线打开'
            }
        ];

        return layout.nodes.map((node, index) => ({
            ...node,
            ...(nodeCopy[index] || {})
        }));
    }

    renderSeaRouteStageLayout() {
        const mount = this.seaRouteBoardMount;
        const routeStage = this.seaRouteBoardStage || mount?.querySelector('[data-sea-route-stage]') || null;
        if (!mount || !routeStage) {
            return;
        }

        const routeLayout = this.getSeaRouteLayoutPreset(window.innerWidth);
        const routeNodes = this.getSeaRouteStageNodes(routeLayout);
        const { width, height } = routeLayout.viewBox;
        const routePath = routeLayout.path;

        routeStage.innerHTML = `
            <svg class="sea-route-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
                <path class="sea-route-line-glow" d="${routePath}"></path>
                <path class="sea-route-line-base" d="${routePath}"></path>
                <path class="sea-route-line" d="${routePath}"></path>
                <path class="sea-route-line-sheen" d="${routePath}"></path>
                ${routeNodes.map((node, index) => `
                    <g class="sea-route-anchor-dot${node.final ? ' is-final' : ''}" style="--route-index:${index};" aria-hidden="true">
                        <circle class="sea-route-anchor-dot-halo" cx="${node.x}" cy="${node.y}" r="${node.final ? 12 : 10}"></circle>
                        <circle class="sea-route-anchor-dot-core" cx="${node.x}" cy="${node.y}" r="${node.final ? 5.6 : 4.8}"></circle>
                    </g>
                `).join('')}
            </svg>
            <span class="sea-route-current" aria-hidden="true"></span>
            ${routeNodes.map((node, index) => `
                <article
                    class="sea-route-node${node.placement === 'below' ? ' is-below' : ''}"
                    style="--route-x:${node.x}; --route-y:${node.y}; --route-shift-x:${node.shiftX}px; --route-node-width:${node.width}px; --route-node-gap:${node.nodeGap ?? (node.placement === 'below' ? 18 : 16)}px; --route-index:${index};"
                    aria-hidden="true"
                >
                    <span class="sea-route-step">${escapeHtml(node.step || '')}</span>
                    <strong class="sea-route-value">${escapeHtml(node.value || '')}</strong>
                    <span class="sea-route-note">${escapeHtml(node.note || '')}</span>
                </article>
            `).join('')}
        `;

        mount.dataset.routeLength = '';
        mount.style.setProperty('--sea-route-length', '1');
        mount.style.setProperty('--sea-route-sheen-length', '48');
        mount.classList.remove('is-route-awakened', 'is-route-drawn');

        const routeLine = routeStage.querySelector('.sea-route-line');
        if (routeLine) {
            const routeLength = routeLine.getTotalLength();
            const sheenLength = Math.min(routeLength * 0.12, 72);
            mount.dataset.routeLength = routeLength.toFixed(2);
            mount.style.setProperty('--sea-route-length', `${routeLength}`);
            mount.style.setProperty('--sea-route-sheen-length', `${sheenLength}`);
        }

        this.seaRouteLayoutKey = routeLayout.key;
    }

    createSeaAtlasInfoCardMarkup(kind, target = 'inline') {
        const mapData = this.seaAtlasCurrentMapData;
        if (!mapData) {
            return '';
        }

        const portCardVisible = target === 'fullscreen'
            ? this.seaAtlasFullscreenPortCardVisible
            : this.seaAtlasPortCardVisible;

        if (kind === 'port') {
            return `
                <article class="sea-atlas-info-card is-port-card${portCardVisible ? ' is-visible' : ''}" data-sea-atlas-card="port">
                    <h4 class="sea-atlas-info-title">${mapData.portLabel}</h4>
                    <div class="sea-atlas-info-meta">
                        <span class="sea-atlas-info-pill">Departure</span>
                        <span class="sea-atlas-info-pill">${mapData.regionTag}</span>
                    </div>
                    <p class="sea-atlas-info-route">${mapData.routeLabel}</p>
                </article>
            `;
        }

        return `
            <article class="sea-atlas-info-card" data-sea-atlas-card="spot">
                <h4 class="sea-atlas-info-title">${this.spotData.name}</h4>
                <div class="sea-atlas-info-meta">
                    <span class="sea-atlas-info-pill">${mapData.depthRange}</span>
                    <span class="sea-atlas-info-pill">${mapData.seasonLabel}</span>
                </div>
                <p class="sea-atlas-info-route">${mapData.routeLabel}</p>
            </article>
        `;
    }

    getSeaAtlasInfoRoot(target = 'inline') {
        return target === 'fullscreen'
            ? this.seaAtlasFullscreenInfoRoot
            : this.seaAtlasInfoRoot;
    }

    getSeaAtlasFallbackNode(target = 'inline') {
        return target === 'fullscreen'
            ? this.seaAtlasFullscreenFallback
            : this.seaAtlasFallback;
    }

    getSeaAtlasMountNode(target = 'inline') {
        return target === 'fullscreen'
            ? this.seaAtlasFullscreenMapMount
            : this.seaAtlasMapMount;
    }

    getSeaAtlasBaseNode(target = 'inline') {
        return target === 'fullscreen'
            ? this.seaAtlasFullscreenMapBase
            : this.seaAtlasMapBase;
    }

    getSeaAtlasMapInstance(target = 'inline') {
        return target === 'fullscreen'
            ? this.seaAtlasFullscreenMap
            : this.seaAtlasMap;
    }

    getSeaAtlasMarkerLayer(target = 'inline') {
        return target === 'fullscreen'
            ? this.seaAtlasFullscreenMarkerLayer
            : this.seaAtlasMarkerLayer;
    }

    getSeaAtlasRouteOverlayNode(target = 'inline') {
        return target === 'fullscreen'
            ? this.seaAtlasFullscreenRouteOverlay
            : this.seaAtlasRouteOverlay;
    }

    getSeaAtlasResetButton(target = 'inline') {
        if (target === 'fullscreen') {
            return this.seaAtlasFullscreen?.querySelector('[data-sea-atlas-reset-view][data-sea-atlas-target="fullscreen"]') || null;
        }

        return this.mapContainer?.querySelector('[data-sea-atlas-reset-view][data-sea-atlas-target="inline"]') || null;
    }

    getSeaAtlasViewPadding(target = 'inline') {
        if (target === 'fullscreen') {
            return [84, 84];
        }

        return window.matchMedia(SEA_ATLAS_MOBILE_PASSIVE_QUERY).matches
            ? [44, 44]
            : [78, 78];
    }

    getSeaAtlasExpandedBounds(mapData = this.seaAtlasCurrentMapData) {
        const expanded = expandLatLngBounds(mapData?.mapBounds, 1.8, 4);
        return padLatLngBoundsByTiles(
            expanded,
            Number(mapData?.zoom) || 9,
            SEA_ATLAS_TILE_BUFFER_ROWS,
            SEA_ATLAS_TILE_BUFFER_COLUMNS
        );
    }

    getSeaAtlasDefaultViewDescriptor(mapData = this.seaAtlasCurrentMapData, target = 'inline') {
        if (!mapData) {
            return null;
        }

        const hasBounds = Array.isArray(mapData.mapBounds) && mapData.mapBounds.length === 2 && mapData.initialViewMode !== 'center';
        const displayBounds = hasBounds
            ? expandLatLngBounds(mapData.mapBounds, target === 'fullscreen' ? 0.72 : 0.5)
            : null;
        return {
            mode: hasBounds ? 'bounds' : 'center',
            bounds: displayBounds,
            center: mapData.mapCenter,
            zoom: Number(mapData.zoom) || 9,
            maxBounds: this.getSeaAtlasExpandedBounds(mapData)
        };
    }

    renderSeaAtlasInfoCards(target = 'inline') {
        const infoRoot = this.getSeaAtlasInfoRoot(target);
        if (!infoRoot) {
            return;
        }

        infoRoot.hidden = false;
        infoRoot.innerHTML = `
            ${this.createSeaAtlasInfoCardMarkup('spot', target)}
            ${this.createSeaAtlasInfoCardMarkup('port', target)}
        `;

        if (target === 'fullscreen') {
            this.seaAtlasFullscreenSpotCard = infoRoot.querySelector('[data-sea-atlas-card="spot"]');
            this.seaAtlasFullscreenPortCard = infoRoot.querySelector('[data-sea-atlas-card="port"]');
            return;
        }

        this.seaAtlasSpotCard = infoRoot.querySelector('[data-sea-atlas-card="spot"]');
        this.seaAtlasPortCard = infoRoot.querySelector('[data-sea-atlas-card="port"]');
    }

    setSeaAtlasPortCardVisible(isVisible, target = 'inline') {
        const visible = Boolean(isVisible);
        const card = target === 'fullscreen'
            ? this.seaAtlasFullscreenPortCard
            : this.seaAtlasPortCard;

        if (target === 'fullscreen') {
            this.seaAtlasFullscreenPortCardVisible = visible;
        } else {
            this.seaAtlasPortCardVisible = visible;
        }

        if (card) {
            card.classList.toggle('is-visible', visible);
        }
    }

    bindSeaAtlasControls() {
        this.syncSeaAtlasResetButtonState('inline');
        this.syncSeaAtlasResetButtonState('fullscreen');
    }

    createSeaAtlasMarkerIcon(kind, label, isActive = false) {
        const isSpot = kind === 'spot';
        const size = isSpot ? 56 : 44;
        return window.L.divIcon({
            className: `sea-atlas-marker-shell is-${kind}`,
            html: `
                <div class="sea-atlas-marker is-${kind}${isActive ? ' is-active' : ''}" style="--sea-marker-delay:${isSpot ? 320 : 180}ms;">
                    <span class="sea-atlas-marker-label">${escapeHtml(label)}</span>
                </div>
            `,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
        });
    }

    updateSeaAtlasMarkers(target = 'inline') {
        const map = this.getSeaAtlasMapInstance(target);
        const markerLayer = this.getSeaAtlasMarkerLayer(target);
        if (!map || !markerLayer || !this.seaAtlasCurrentMapData || !window.L) {
            return;
        }

        markerLayer.clearLayers();
        const mapData = this.seaAtlasCurrentMapData;
        const markerOptions = {
            keyboard: false,
            riseOnHover: false
        };

        const spotMarker = window.L.marker(mapData.spotCoords, {
            ...markerOptions,
            icon: this.createSeaAtlasMarkerIcon('spot', mapData.spotLabel || this.spotData.name, true)
        });
        const portMarker = window.L.marker(mapData.portCoords, {
            ...markerOptions,
            icon: this.createSeaAtlasMarkerIcon('port', mapData.portLabel || 'Departure', false)
        });

        portMarker.on('mouseover', () => this.setSeaAtlasPortCardVisible(true, target));
        portMarker.on('mouseout', () => this.setSeaAtlasPortCardVisible(false, target));
        portMarker.on('click', () => {
            const currentVisible = target === 'fullscreen'
                ? this.seaAtlasFullscreenPortCardVisible
                : this.seaAtlasPortCardVisible;
            this.setSeaAtlasPortCardVisible(!currentVisible, target);
        });
        spotMarker.on('click', () => this.setSeaAtlasPortCardVisible(false, target));

        spotMarker.addTo(markerLayer);
        portMarker.addTo(markerLayer);

        if (target === 'fullscreen') {
            this.seaAtlasFullscreenSpotMarker = spotMarker;
            this.seaAtlasFullscreenPortMarker = portMarker;
            return;
        }

        this.seaAtlasSpotMarker = spotMarker;
        this.seaAtlasPortMarker = portMarker;
    }

    buildSeaAtlasTileOptions(mapData = this.seaAtlasCurrentMapData) {
        return {
            attribution: SEA_ATLAS_TILE_ATTRIBUTION,
            minZoom: Number(mapData?.offlineMinZoom) || 4,
            maxZoom: Number(mapData?.offlineMaxZoom) || 13,
            tileSize: Number(mapData?.offlineTileSize) || SEA_ATLAS_OFFLINE_TILE_SIZE,
            zoomOffset: Number.isFinite(Number(mapData?.offlineZoomOffset))
                ? Number(mapData.offlineZoomOffset)
                : SEA_ATLAS_OFFLINE_TILE_ZOOM_OFFSET,
            noWrap: true,
            updateWhenIdle: true,
            keepBuffer: 4,
            bounds: this.getSeaAtlasExpandedBounds(mapData) || undefined,
            errorTileUrl: SEA_ATLAS_EMPTY_TILE_DATA_URI
        };
    }

    showSeaAtlasFallback(reason = 'missing', target = 'inline') {
        const fallbackNode = this.getSeaAtlasFallbackNode(target);
        const infoRoot = this.getSeaAtlasInfoRoot(target);
        const mount = this.getSeaAtlasMountNode(target);
        if (!fallbackNode) {
            return;
        }

        const mapData = this.seaAtlasCurrentMapData;
        let fallbackCopy = `离线海图暂时没有完整显现，但你仍可以先记住 ${mapData?.regionTag || this.spotData.mapLocation || '当前海域'}、${mapData?.portLabel || '出发码头'}，以及 ${mapData?.routeLabel || '这一程的靠近方式'}。`;
        if (reason === 'missing') {
            fallbackCopy = `当前海域的离线海图包还没有随项目一起打包，底图因此没有完整显现。你仍可以先阅读 ${mapData?.regionTag || this.spotData.mapLocation || '这片海'}、${mapData?.portLabel || '出发码头'} 与 ${mapData?.routeLabel || '靠近方式'}。`;
        } else if (reason === 'path') {
            fallbackCopy = `离线海图包路径没有对上，底图暂时无法显现。请检查 ${mapData?.offlineTilePack || '当前海图包路径'} 是否存在。`;
        } else if (reason === 'init') {
            fallbackCopy = '海图舞台正在重新整理，稍后会把这片海的位置重新显现出来。';
        }

        fallbackNode.hidden = false;
        fallbackNode.innerHTML = `
            <p class="sea-atlas-map-fallback-title">这片海暂时没有完整显影</p>
            <p class="sea-atlas-map-fallback-copy">${fallbackCopy}</p>
        `;

        if (infoRoot) {
            infoRoot.hidden = true;
        }
        mount?.classList.add('is-fallback-active');
    }

    hideSeaAtlasFallback(target = 'inline') {
        const fallbackNode = this.getSeaAtlasFallbackNode(target);
        const infoRoot = this.getSeaAtlasInfoRoot(target);
        const mount = this.getSeaAtlasMountNode(target);
        if (!fallbackNode) {
            return;
        }

        fallbackNode.hidden = true;
        fallbackNode.innerHTML = '';
        if (infoRoot) {
            infoRoot.hidden = false;
        }
        mount?.classList.remove('is-fallback-active');
    }

    syncSeaAtlasTileLayerForSpot(target = 'inline') {
        const map = this.getSeaAtlasMapInstance(target);
        const mapData = this.seaAtlasCurrentMapData;
        if (!map || !window.L) {
            this.showSeaAtlasFallback('init', target);
            return false;
        }

        if (!mapData?.offlineTilePack) {
            this.showSeaAtlasFallback('path', target);
            return false;
        }

        const nextTemplate = mapData.offlineTilePack;
        const isFullscreen = target === 'fullscreen';
        const activeTemplate = isFullscreen
            ? this.seaAtlasFullscreenCurrentTileTemplate
            : this.seaAtlasCurrentTileTemplate;
        let tileLayer = isFullscreen
            ? this.seaAtlasFullscreenTileLayer
            : this.seaAtlasTileLayer;

        if (tileLayer && activeTemplate === nextTemplate) {
            return true;
        }

        if (tileLayer) {
            map.removeLayer(tileLayer);
        }

        const SeaAtlasPackedTileLayer = ensureSeaAtlasPackedTileLayerClass();
        tileLayer = new SeaAtlasPackedTileLayer(nextTemplate, mapData.offlineTilePackFormat || 'script', this.buildSeaAtlasTileOptions(mapData));
        tileLayer.on('tileload', () => {
            if (isFullscreen) {
                this.seaAtlasFullscreenTileLoadCount += 1;
            } else {
                this.seaAtlasTileLoadCount += 1;
            }
            this.hideSeaAtlasFallback(target);
        });
        tileLayer.on('tileerror', () => {
            if (isFullscreen) {
                this.seaAtlasFullscreenTileErrorCount += 1;
                if (this.seaAtlasFullscreenTileErrorCount >= SEA_ATLAS_FALLBACK_TILE_ERROR_THRESHOLD) {
                    this.showSeaAtlasFallback('missing', target);
                }
            } else {
                this.seaAtlasTileErrorCount += 1;
                if (this.seaAtlasTileErrorCount >= SEA_ATLAS_FALLBACK_TILE_ERROR_THRESHOLD) {
                    this.showSeaAtlasFallback('missing', target);
                }
            }
        });
        tileLayer.addTo(map);

        if (isFullscreen) {
            this.seaAtlasFullscreenTileLayer = tileLayer;
            this.seaAtlasFullscreenCurrentTileTemplate = nextTemplate;
        } else {
            this.seaAtlasTileLayer = tileLayer;
            this.seaAtlasCurrentTileTemplate = nextTemplate;
        }

        return true;
    }

    ensureSeaAtlasMapReady(target = 'inline') {
        const mount = target === 'fullscreen'
            ? this.attachSeaAtlasFullscreenMapMount()
            : this.attachSeaAtlasMapMount();
        if (target === 'inline') {
            this.syncSeaAtlasMapStageCopy();
        }

        if (!mount || !this.seaAtlasCurrentMapData) {
            this.showSeaAtlasFallback('init', target);
            return false;
        }

        const baseNode = this.getSeaAtlasBaseNode(target);
        if (!window.L || !baseNode) {
            this.showSeaAtlasFallback('init', target);
            return false;
        }

        const canvas = baseNode.querySelector('[data-sea-atlas-map-canvas]');
        if (!canvas) {
            this.showSeaAtlasFallback('init', target);
            return false;
        }

        const isFullscreen = target === 'fullscreen';
        let map = this.getSeaAtlasMapInstance(target);
        const allowDragging = isFullscreen || !window.matchMedia(SEA_ATLAS_MOBILE_PASSIVE_QUERY).matches;

        if (!map) {
            map = window.L.map(canvas, {
                zoomControl: false,
                scrollWheelZoom: false,
                doubleClickZoom: false,
                boxZoom: false,
                keyboard: false,
                tap: false,
                touchZoom: false,
                dragging: allowDragging,
                attributionControl: true,
                maxBoundsViscosity: 0.72
            });
            map.attributionControl.setPrefix('');

            const markerLayer = window.L.layerGroup().addTo(map);
            if (isFullscreen) {
                this.seaAtlasFullscreenMap = map;
                this.seaAtlasFullscreenMarkerLayer = markerLayer;
            } else {
                this.seaAtlasMap = map;
                this.seaAtlasMarkerLayer = markerLayer;
            }

            map.on('move zoom resize moveend zoomend', () => this.scheduleSeaAtlasMapSync({
                invalidateSize: false
            }, target));
            map.on('movestart dragstart zoomstart', () => {
                const timerId = isFullscreen ? this.seaAtlasFullscreenInteractionTimer : this.seaAtlasMapInteractionTimer;
                window.clearTimeout(timerId);
                mount.classList.add('is-map-interacting');
            });
            map.on('moveend dragend zoomend', () => {
                const nextTimer = window.setTimeout(() => {
                    mount.classList.remove('is-map-interacting');
                    this.syncSeaAtlasResetButtonState(target);
                }, 160);

                if (isFullscreen) {
                    window.clearTimeout(this.seaAtlasFullscreenInteractionTimer);
                    this.seaAtlasFullscreenInteractionTimer = nextTimer;
                } else {
                    window.clearTimeout(this.seaAtlasMapInteractionTimer);
                    this.seaAtlasMapInteractionTimer = nextTimer;
                }
            });
        } else if (allowDragging) {
            map.dragging.enable();
        } else {
            map.dragging.disable();
        }

        this.syncSeaAtlasTileLayerForSpot(target);
        return true;
    }

    positionSeaAtlasInfoCard(card, point, target = 'inline') {
        const baseNode = this.getSeaAtlasBaseNode(target);
        if (!card || !baseNode) {
            return;
        }
        
        const cardKind = card.dataset.seaAtlasCard || 'spot';
        const inset = target === 'fullscreen' ? 24 : 18;

        card.style.left = '';
        card.style.right = '';
        card.style.top = '';
        card.style.bottom = '';

        if (cardKind === 'port') {
            card.style.right = `${inset}px`;
            card.style.top = `${inset}px`;
            return;
        }

        card.style.left = `${inset}px`;
        card.style.bottom = `${inset}px`;
    }

    buildSeaAtlasRoutePath(routePoints, controlPoint = null) {
        if (!Array.isArray(routePoints) || routePoints.length < 2) {
            return '';
        }

        if (routePoints.length === 2) {
            const [startPoint, endPoint] = routePoints;
            if (controlPoint) {
                return `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)} Q ${controlPoint.x.toFixed(2)} ${controlPoint.y.toFixed(2)} ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`;
            }
            return `M ${startPoint.x.toFixed(2)} ${startPoint.y.toFixed(2)} L ${endPoint.x.toFixed(2)} ${endPoint.y.toFixed(2)}`;
        }

        const commands = [`M ${routePoints[0].x.toFixed(2)} ${routePoints[0].y.toFixed(2)}`];
        for (let index = 0; index < routePoints.length - 1; index += 1) {
            const p0 = routePoints[index - 1] || routePoints[index];
            const p1 = routePoints[index];
            const p2 = routePoints[index + 1];
            const p3 = routePoints[index + 2] || p2;
            const cp1 = {
                x: p1.x + ((p2.x - p0.x) / 6),
                y: p1.y + ((p2.y - p0.y) / 6)
            };
            const cp2 = {
                x: p2.x - ((p3.x - p1.x) / 6),
                y: p2.y - ((p3.y - p1.y) / 6)
            };
            commands.push(`C ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)}, ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);
        }
        return commands.join(' ');
    }

    syncSeaAtlasRouteOverlay(target = 'inline') {
        const map = this.getSeaAtlasMapInstance(target);
        const baseNode = this.getSeaAtlasBaseNode(target);
        const routeOverlay = this.getSeaAtlasRouteOverlayNode(target);
        const mapData = this.seaAtlasCurrentMapData;
        if (!map || !baseNode || !routeOverlay || !mapData) {
            return;
        }

        const svg = routeOverlay.querySelector('[data-sea-atlas-route-svg]');
        const glowPath = routeOverlay.querySelector('[data-sea-atlas-route-layer="glow"]');
        const basePath = routeOverlay.querySelector('[data-sea-atlas-route-layer="base"]');
        const linePath = routeOverlay.querySelector('[data-sea-atlas-route-layer="line"]');
        const sheenPath = routeOverlay.querySelector('[data-sea-atlas-route-layer="sheen"]');
        if (!svg || !glowPath || !basePath || !linePath || !sheenPath) {
            return;
        }

        const frameRect = baseNode.getBoundingClientRect();
        const width = Math.max(1, Math.round(frameRect.width || 0));
        const height = Math.max(1, Math.round(frameRect.height || 0));
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

        const latLngPath = Array.isArray(mapData.routePath) && mapData.routePath.length >= 2
            ? mapData.routePath
            : [mapData.portCoords, mapData.spotCoords];
        const routePoints = latLngPath.map((coords) => map.latLngToContainerPoint(coords));
        const controlPoint = latLngPath.length === 2 && Array.isArray(mapData?.routeCurve?.control)
            ? map.latLngToContainerPoint(mapData.routeCurve.control)
            : null;
        const routePath = this.buildSeaAtlasRoutePath(routePoints, controlPoint);

        [glowPath, basePath, linePath, sheenPath].forEach((pathNode) => {
            pathNode.setAttribute('d', routePath || '');
        });

        let routeLength = 0;
        if (routePath) {
            try {
                routeLength = linePath.getTotalLength();
            } catch (error) {
                routeLength = 0;
            }
        }

        routeOverlay.style.setProperty('--sea-route-length', `${Math.max(routeLength, 1)}`);
        routeOverlay.style.setProperty('--sea-route-sheen-length', `${Math.max(Math.min(routeLength * 0.12, 72), 24)}`);
    }

    syncSeaAtlasMapOverlays(target = 'inline') {
        const map = this.getSeaAtlasMapInstance(target);
        const baseNode = this.getSeaAtlasBaseNode(target);
        if (!map || !this.seaAtlasCurrentMapData || !baseNode) {
            return;
        }

        this.syncSeaAtlasRouteOverlay(target);
        if (target === 'fullscreen') {
            this.positionSeaAtlasInfoCard(this.seaAtlasFullscreenSpotCard, null, target);
            this.positionSeaAtlasInfoCard(this.seaAtlasFullscreenPortCard, null, target);
            return;
        }

        this.positionSeaAtlasInfoCard(this.seaAtlasSpotCard, null, target);
        this.positionSeaAtlasInfoCard(this.seaAtlasPortCard, null, target);
    }

    scheduleSeaAtlasMapSync(options = {}, target = 'inline') {
        const isFullscreen = target === 'fullscreen';
        if (isFullscreen) {
            this.seaAtlasFullscreenSyncNeedsInvalidate = this.seaAtlasFullscreenSyncNeedsInvalidate || Boolean(options.invalidateSize);
            if (this.seaAtlasFullscreenOverlaySyncRafId) {
                return;
            }

            this.seaAtlasFullscreenOverlaySyncRafId = requestAnimationFrame(() => {
                this.seaAtlasFullscreenOverlaySyncRafId = 0;
                if (this.seaAtlasFullscreenMap && this.seaAtlasFullscreenSyncNeedsInvalidate) {
                    this.seaAtlasFullscreenMap.invalidateSize({
                        pan: false,
                        animate: false
                    });
                }
                this.seaAtlasFullscreenSyncNeedsInvalidate = false;
                this.renderSeaAtlasInfoCards(target);
                this.syncSeaAtlasMapOverlays(target);
                this.syncSeaAtlasResetButtonState(target);
            });
            return;
        }

        this.seaAtlasSyncNeedsInvalidate = this.seaAtlasSyncNeedsInvalidate || Boolean(options.invalidateSize);
        if (this.seaAtlasOverlaySyncRafId) {
            return;
        }

        this.seaAtlasOverlaySyncRafId = requestAnimationFrame(() => {
            this.seaAtlasOverlaySyncRafId = 0;
            if (this.seaAtlasMap && this.seaAtlasSyncNeedsInvalidate) {
                this.seaAtlasMap.invalidateSize({
                    pan: false,
                    animate: false
                });
            }
            this.seaAtlasSyncNeedsInvalidate = false;
            this.syncSeaAtlasMapStageCopy();
            this.renderSeaAtlasInfoCards(target);
            this.syncSeaAtlasMapOverlays(target);
            this.syncSeaAtlasResetButtonState(target);
        });
    }

    getSeaAtlasCurrentViewState(target = 'inline') {
        const map = this.getSeaAtlasMapInstance(target);
        if (!map) {
            return null;
        }

        const center = map.getCenter();
        return {
            center: [center.lat, center.lng],
            zoom: map.getZoom()
        };
    }

    getSeaAtlasStoredInitialView(target = 'inline') {
        return target === 'fullscreen'
            ? this.seaAtlasFullscreenInitialView
            : this.seaAtlasInlineInitialView;
    }

    storeSeaAtlasInitialView(target = 'inline') {
        const map = this.getSeaAtlasMapInstance(target);
        const mapData = this.seaAtlasCurrentMapData;
        if (!map || !mapData) {
            return;
        }

        const center = map.getCenter();
        const bounds = map.getBounds();
        const snapshot = {
            spotKey: mapData.key || this.spotData?.key || String(this.spotId),
            center: [center.lat, center.lng],
            zoom: map.getZoom(),
            bounds: [
                [bounds.getSouth(), bounds.getWest()],
                [bounds.getNorth(), bounds.getEast()]
            ]
        };

        if (target === 'fullscreen') {
            this.seaAtlasFullscreenInitialView = snapshot;
            return;
        }

        this.seaAtlasInlineInitialView = snapshot;
    }

    applySeaAtlasDefaultView(target = 'inline', options = {}) {
        const map = this.getSeaAtlasMapInstance(target);
        const mapData = this.seaAtlasCurrentMapData;
        if (!map || !mapData) {
            return;
        }

        const {
            animate = false,
            viewState = null
        } = options;
        const descriptor = this.getSeaAtlasDefaultViewDescriptor(mapData, target);
        const padding = this.getSeaAtlasViewPadding(target);
        if (descriptor?.maxBounds) {
            map.setMaxBounds(descriptor.maxBounds);
        } else {
            map.setMaxBounds(null);
        }

        if (viewState?.center?.length === 2 && Number.isFinite(viewState.zoom)) {
            map.setView(viewState.center, viewState.zoom, {
                animate: false
            });
            return;
        }

        if (descriptor?.mode === 'bounds' && descriptor.bounds) {
            if (animate && typeof map.flyToBounds === 'function') {
                map.flyToBounds(descriptor.bounds, {
                    padding,
                    duration: 1.2
                });
            } else {
                map.fitBounds(descriptor.bounds, {
                    padding,
                    animate: false
                });
            }
            if (!animate) {
                this.storeSeaAtlasInitialView(target);
            }
            return;
        }

        if (animate && typeof map.flyTo === 'function') {
            map.flyTo(descriptor.center, descriptor.zoom, {
                duration: 1.2
            });
            return;
        }

        map.setView(descriptor.center, descriptor.zoom, {
            animate: false
        });
        this.storeSeaAtlasInitialView(target);
    }

    isSeaAtlasAtInitialView(target = 'inline') {
        const map = this.getSeaAtlasMapInstance(target);
        const mapData = this.seaAtlasCurrentMapData;
        const descriptor = this.getSeaAtlasDefaultViewDescriptor(mapData, target);
        if (!map || !descriptor || !window.L) {
            return true;
        }

        const storedView = this.getSeaAtlasStoredInitialView(target);
        if (storedView && storedView.spotKey === (mapData?.key || this.spotData?.key || String(this.spotId))) {
            const currentCenter = map.getCenter();
            const targetCenter = window.L.latLng(storedView.center[0], storedView.center[1]);
            const centerDistance = map.project(currentCenter, map.getZoom())
                .distanceTo(map.project(targetCenter, map.getZoom()));
            return centerDistance <= 12 && Math.abs(map.getZoom() - storedView.zoom) <= 0.1;
        }

        const targetCenter = descriptor.center || this.seaAtlasCurrentMapData?.mapCenter;
        if (!Array.isArray(targetCenter) || targetCenter.length < 2) {
            return true;
        }

        const pixelDistance = map.project(map.getCenter(), map.getZoom())
            .distanceTo(map.project(window.L.latLng(targetCenter[0], targetCenter[1]), map.getZoom()));
        return pixelDistance <= 12 && Math.abs(map.getZoom() - descriptor.zoom) <= 0.1;
    }

    syncSeaAtlasResetButtonState(target = 'inline') {
        const resetButton = this.getSeaAtlasResetButton(target);
        if (!resetButton) {
            return;
        }

        const shouldHide = this.activeSeaView === 'underwater' && target === 'inline';
        const hasMap = Boolean(this.getSeaAtlasMapInstance(target) || this.getSeaAtlasMountNode(target));
        resetButton.hidden = shouldHide;
        resetButton.disabled = !hasMap || this.isSeaAtlasAtInitialView(target);
        resetButton.setAttribute('aria-disabled', String(resetButton.disabled));
    }

    resetSeaAtlasViewport(target = 'inline') {
        if (!this.seaAtlasCurrentMapData) {
            return;
        }

        if (target === 'inline' && this.activeSeaView === 'underwater') {
            this.setSeaAtlasView('location');
            return;
        }

        if (!this.ensureSeaAtlasMapReady(target)) {
            return;
        }

        this.setSeaAtlasPortCardVisible(false, target);
        this.applySeaAtlasDefaultView(target, {
            animate: true
        });
        this.scheduleSeaAtlasMapSync({
            invalidateSize: true
        }, target);
    }

    openSeaAtlasFullscreen() {
        if (!this.seaAtlasFullscreen || !this.seaAtlasCurrentMapData) {
            return;
        }

        this.seaAtlasFullscreenOpen = true;
        this.seaAtlasFullscreen.setAttribute('aria-hidden', 'false');
        this.seaAtlasFullscreen.classList.add('is-open');
        this.seaAtlasFullscreenMapMount?.classList.add('is-map-awake');
        this.setSeaAtlasPortCardVisible(false, 'fullscreen');

        const shouldReuseInlineView = !this.isSeaAtlasAtInitialView('inline');
        const currentInlineView = shouldReuseInlineView
            ? this.getSeaAtlasCurrentViewState('inline')
            : null;
        this.updateSeaAtlasMapScene({
            target: 'fullscreen',
            animate: false,
            viewState: currentInlineView
        });
        this.scheduleSeaAtlasMapSync({
            invalidateSize: true
        }, 'fullscreen');
        this.syncOverlayLock();
    }

    closeSeaAtlasFullscreen() {
        if (!this.seaAtlasFullscreen) {
            return;
        }

        this.seaAtlasFullscreenOpen = false;
        this.setSeaAtlasPortCardVisible(false, 'fullscreen');
        this.seaAtlasFullscreen.classList.remove('is-open');
        this.seaAtlasFullscreen.setAttribute('aria-hidden', 'true');
        this.syncOverlayLock();
        this.scheduleSeaAtlasMapSync({
            invalidateSize: true
        }, 'inline');
    }

    updateSeaAtlasMapScene(options = {}) {
        const {
            animate = false,
            target = 'inline',
            viewState = null
        } = options;

        if (!this.ensureSeaAtlasMapReady(target)) {
            return;
        }

        const map = this.getSeaAtlasMapInstance(target);
        const mount = this.getSeaAtlasMountNode(target);
        const isFullscreen = target === 'fullscreen';
        if (!map || !this.seaAtlasCurrentMapData) {
            this.showSeaAtlasFallback('init', target);
            return;
        }

        mount?.classList.toggle('is-route-emphasis', this.activeSeaView === 'route');

        if (isFullscreen) {
            this.seaAtlasFullscreenTileLoadCount = 0;
            this.seaAtlasFullscreenTileErrorCount = 0;
        } else {
            this.seaAtlasTileLoadCount = 0;
            this.seaAtlasTileErrorCount = 0;
        }

        this.hideSeaAtlasFallback(target);
        this.syncSeaAtlasTileLayerForSpot(target);
        this.setSeaAtlasPortCardVisible(false, target);
        this.updateSeaAtlasMarkers(target);
        this.renderSeaAtlasInfoCards(target);
        if (target === 'fullscreen') {
            mount?.classList.add('is-map-awake');
        }
        this.applySeaAtlasDefaultView(target, {
            animate,
            viewState
        });

        mount?.classList.toggle('is-map-switching', animate);
        this.scheduleSeaAtlasMapSync({
            invalidateSize: true
        }, target);

        window.setTimeout(() => {
            mount?.classList.remove('is-map-switching');
            this.scheduleSeaAtlasMapSync({}, target);
        }, animate ? 320 : 120);
    }

    getSeaAtlasViewMotionDelay(shell = null, view = this.activeSeaView) {
        if (prefersReducedMotion()) {
            return 0;
        }

        if (!shell) {
            return 0;
        }

        const isAtlasAwake = shell.classList.contains('is-atlas-awake');
        if (view === 'underwater') {
            return isAtlasAwake ? 0 : 180;
        }

        if (view === 'route') {
            return isAtlasAwake ? 100 : 420;
        }

        return isAtlasAwake ? 80 : 220;
    }

    playSeaAtlasEntrance(shell = null) {
        if (!shell) {
            return;
        }

        window.clearTimeout(this.seaAtlasEntranceTimer);
        this.seaAtlasEntranceTimer = 0;

        if (prefersReducedMotion()) {
            shell.classList.remove('is-atlas-awakening');
            shell.classList.add('is-atlas-awake');
            return;
        }

        shell.classList.remove('is-atlas-awake');
        restartTransientClassAnimation(shell, 'is-atlas-awakening');
        this.seaAtlasEntranceTimer = window.setTimeout(() => {
            if (shell.isConnected) {
                shell.classList.remove('is-atlas-awakening');
                shell.classList.add('is-atlas-awake');
            }
            this.seaAtlasEntranceTimer = 0;
        }, 1280);
    }

    clearSeaProfileEntrance(options = {}) {
        const { clearState = true } = options;

        if (this.seaProfileEntranceDelayId) {
            window.clearTimeout(this.seaProfileEntranceDelayId);
            this.seaProfileEntranceDelayId = 0;
        }

        if (this.seaProfileEntranceTimer) {
            window.clearTimeout(this.seaProfileEntranceTimer);
            this.seaProfileEntranceTimer = 0;
        }

        if (!clearState) {
            return;
        }

        const panel = this.mapContainer?.querySelector('[data-sea-panel="underwater"]');
        panel?.classList.remove('is-profile-awakening', 'is-profile-settled');
    }

    getSeaProfileEntranceDuration(panel = this.mapContainer?.querySelector('[data-sea-panel="underwater"]')) {
        if (!panel || prefersReducedMotion()) {
            return 0;
        }

        const layerCount = panel.querySelectorAll('.sea-profile-layer').length;
        const markerCount = panel.querySelectorAll('.sea-profile-marker').length;
        const copyCount = panel.querySelectorAll('.sea-profile-hotspot, .sea-atlas-level').length;

        const layerDelay = Math.max(layerCount - 1, 0) * 120;
        const markerDelay = Math.max(markerCount - 1, 0) * 120;
        const copyDelay = Math.max(copyCount - 1, 0) * 100;

        return Math.max(
            1220,
            1180,
            80 + 1220,
            90 + 860,
            170 + 900,
            200 + layerDelay + 940,
            260 + layerDelay + 1220,
            520 + markerDelay + 900,
            560 + 760,
            640 + 760,
            760 + copyDelay + 780
        ) + 80;
    }

    playSeaProfileEntrance(delay = 0) {
        const panel = this.mapContainer?.querySelector('[data-sea-panel="underwater"]');
        if (!panel) {
            return;
        }

        this.clearSeaProfileEntrance();

        const start = () => {
            if (!panel.isConnected || this.activeSeaView !== 'underwater') {
                return;
            }

            panel.classList.remove('is-profile-settled');
            if (prefersReducedMotion()) {
                panel.classList.remove('is-profile-awakening');
                panel.classList.add('is-profile-settled');
                return;
            }

            restartTransientClassAnimation(panel, 'is-profile-awakening');
            const entranceDuration = this.getSeaProfileEntranceDuration(panel);
            this.seaProfileEntranceTimer = window.setTimeout(() => {
                if (panel.isConnected && this.activeSeaView === 'underwater') {
                    panel.classList.remove('is-profile-awakening');
                    panel.classList.add('is-profile-settled');
                }
                this.seaProfileEntranceTimer = 0;
            }, entranceDuration);
        };

        if (delay > 0) {
            this.seaProfileEntranceDelayId = window.setTimeout(() => {
                this.seaProfileEntranceDelayId = 0;
                start();
            }, delay);
            return;
        }

        start();
    }

    awakenSeaAtlasShell(shell = null) {
        const targetShell = shell || this.mapContainer?.querySelector('#seaAtlasShell');
        if (!targetShell) {
            return null;
        }

        if (targetShell.classList.contains('is-map-awake')) {
            return targetShell;
        }

        targetShell.classList.add('is-map-awake');
        this.seaAtlasMapMount?.classList.add('is-map-awake');
        this.playSeaAtlasEntrance(targetShell);

        const motionDelay = this.getSeaAtlasViewMotionDelay(targetShell, this.activeSeaView);
        if (this.activeSeaView === 'route') {
            this.clearSeaRouteMotion();
            this.seaRouteMotionDelayId = window.setTimeout(() => {
                this.seaRouteMotionDelayId = 0;
                if (this.activeSeaView === 'route' && targetShell.classList.contains('is-map-awake')) {
                    this.playSeaRouteAnimation();
                }
            }, motionDelay);
            return targetShell;
        }

        this.syncSeaRouteLineState();
        if (this.activeSeaView === 'underwater') {
            this.playSeaProfileEntrance(motionDelay);
        }

        return targetShell;
    }

    setupSeaAtlasReveal() {
        const shell = this.mapContainer?.querySelector('#seaAtlasShell');
        if (!shell) {
            return;
        }

        const awaken = () => this.awakenSeaAtlasShell(shell);

        this.seaAtlasRevealObserver?.disconnect();
        if (!('IntersectionObserver' in window)) {
            awaken();
            return;
        }

        const rect = shell.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.86 && rect.bottom > 0) {
            requestAnimationFrame(awaken);
            return;
        }

        this.seaAtlasRevealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                awaken();
                this.seaAtlasRevealObserver?.disconnect();
            });
        }, {
            threshold: 0.22,
            rootMargin: '0px 0px -8% 0px'
        });
        this.seaAtlasRevealObserver.observe(shell);
    }

    ensureSeaAtlasAwakeState() {
        const shell = this.mapContainer?.querySelector('#seaAtlasShell');
        if (!shell) {
            return null;
        }

        this.seaAtlasRevealObserver?.disconnect();
        return this.awakenSeaAtlasShell(shell);
    }

    syncSeaAtlasMapViewState() {
        const atlas = this.mapContainer?.querySelector('.sea-atlas');
        const shell = this.mapContainer?.querySelector('#seaAtlasShell');
        const mapPanel = this.mapContainer?.querySelector('[data-sea-panel="map"]');
        const underwaterPanel = this.mapContainer?.querySelector('[data-sea-panel="underwater"]');
        const isUnderwaterView = this.activeSeaView === 'underwater';
        const isRouteView = this.activeSeaView === 'route';
        const activeVisualView = isRouteView ? 'route' : 'location';

        atlas?.setAttribute('data-sea-view', this.activeSeaView);
        shell?.setAttribute('data-sea-view', this.activeSeaView);
        mapPanel?.classList.toggle('is-active', !isUnderwaterView);
        underwaterPanel?.classList.toggle('is-active', isUnderwaterView);
        if (!isUnderwaterView) {
            underwaterPanel?.classList.remove('is-profile-awakening', 'is-profile-settled');
        }

        this.mapContainer?.querySelectorAll('[data-sea-visual-view]').forEach((view) => {
            const viewKey = view.dataset.seaVisualView || 'location';
            view.classList.toggle('is-active', !isUnderwaterView && viewKey === activeVisualView);
        });
        this.mapContainer?.querySelectorAll('[data-sea-dossier-view]').forEach((view) => {
            const viewKey = view.dataset.seaDossierView || 'location';
            const shouldShow = !isUnderwaterView && (
                (viewKey === 'route' && isRouteView)
                || (viewKey === 'location' && !isRouteView)
            );
            view.classList.toggle('is-active', shouldShow);
        });

        this.seaAtlasMapMount?.classList.toggle('is-route-emphasis', isRouteView);
        this.seaAtlasFullscreenMapMount?.classList.toggle('is-route-emphasis', isRouteView);
        this.syncSeaAtlasMapStageCopy();
        if (!isUnderwaterView) {
            this.scheduleSeaAtlasMapSync({
                invalidateSize: !isRouteView
            }, 'inline');
            if (this.seaAtlasFullscreenOpen) {
                this.scheduleSeaAtlasMapSync({
                    invalidateSize: false
                }, 'fullscreen');
            }
        }
    }

    // 海域定位台切换：在三种视图间切换激活态和内容层级。
    /**
     * setSeaAtlasView(view) - 切换当前海域定位台的显示视图
     * @param {string} view - 目标视图名称
     * @returns {void} - 无返回值，直接更新视图状态
     */
    setSeaAtlasView(view) {
        if (!this.mapContainer || !['location', 'route', 'underwater'].includes(view)) {
            return;
        }

        const shell = this.mapContainer.querySelector('#seaAtlasShell');
        const wasAtlasAwake = Boolean(shell?.classList.contains('is-map-awake'));
        const motionDelay = this.getSeaAtlasViewMotionDelay(shell, view);
        if (view !== 'underwater') {
            this.clearSeaProfileEntrance();
        }

        this.activeSeaView = view;
        this.mapContainer.querySelectorAll('.sea-atlas-tab').forEach((button) => {
            const isActive = button.dataset.seaView === view;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        this.syncSeaAtlasMapViewState();

        if (view === 'underwater') {
            this.syncSeaRouteLineState();
            this.ensureSeaAtlasAwakeState();
            this.playSeaProfileEntrance(wasAtlasAwake ? 0 : motionDelay);
            return;
        }

        if (view === 'route') {
            const awakenedShell = this.ensureSeaAtlasAwakeState();
            if (wasAtlasAwake && awakenedShell?.classList.contains('is-map-awake')) {
                this.clearSeaRouteMotion();
                this.seaRouteMotionDelayId = window.setTimeout(() => {
                    this.seaRouteMotionDelayId = 0;
                    if (
                        this.activeSeaView === 'route'
                        && awakenedShell?.classList.contains('is-map-awake')
                    ) {
                        this.playSeaRouteAnimation();
                    }
                }, Math.max(motionDelay, 80));
            }
            return;
        }

        this.syncSeaRouteLineState();
        this.scheduleSeaAtlasMapSync({
            invalidateSize: true
        }, 'inline');

        if (this.seaAtlasFullscreenOpen) {
            this.scheduleSeaAtlasMapSync({
                invalidateSize: true
            }, 'fullscreen');
        }
    }

    /**
     * clearSeaRouteMotion() - 停止当前路线光标与描线路径的逐帧动画
     * @returns {void}
     */
    clearSeaRouteMotion() {
        if (this.seaRouteMotionRafId) {
            cancelAnimationFrame(this.seaRouteMotionRafId);
            this.seaRouteMotionRafId = 0;
        }

        if (this.seaRouteMotionDelayId) {
            clearTimeout(this.seaRouteMotionDelayId);
            this.seaRouteMotionDelayId = 0;
        }
    }

    /**
     * getSeaRouteMotionParts() - 获取路线动画所需的 DOM 与路径长度信息
     * @returns {Object|null}
     */
    getSeaRouteMotionParts() {
        if (!this.mapContainer) {
            return null;
        }

        const routeMap = this.mapContainer.querySelector('[data-sea-route-board-stage]');
        const routeLine = routeMap?.querySelector('.sea-route-line');
        const routeSheen = routeMap?.querySelector('.sea-route-line-sheen');
        const routeCurrent = routeMap?.querySelector('.sea-route-current');
        if (!routeMap || !routeLine || !routeSheen || !routeCurrent) {
            return null;
        }

        const svgViewBox = routeLine.ownerSVGElement?.viewBox?.baseVal;
        const viewBoxWidth = svgViewBox?.width || 640;
        const viewBoxHeight = svgViewBox?.height || 360;
        let routeLength = Number(routeMap.dataset.routeLength || 0);
        if (!routeLength) {
            try {
                routeLength = routeLine.getTotalLength();
            } catch (error) {
                routeLength = 0;
            }
        }

        if (!(routeLength > 0)) {
            return null;
        }

        const sheenLength = Math.min(routeLength * 0.12, 72);

        routeMap.dataset.routeLength = routeLength.toFixed(2);
        routeMap.style.setProperty('--sea-route-length', `${routeLength}`);
        routeMap.style.setProperty('--sea-route-sheen-length', `${sheenLength}`);

        return {
            routeMap,
            routeLine,
            routeSheen,
            routeCurrent,
            routeLength,
            sheenLength,
            viewBoxWidth,
            viewBoxHeight
        };
    }

    /**
     * positionSeaRouteCurrent(parts, traceProgress) - 把流动光标放到当前路径进度对应的位置
     * @param {Object} parts - 路线动画所需的 DOM 引用
     * @param {number} traceProgress - 0 到 1 的路径进度
     * @returns {void}
     */
    positionSeaRouteCurrent(parts, traceProgress) {
        const safeProgress = Math.min(Math.max(traceProgress, 0), 1);
        const currentLength = parts.routeLength * safeProgress;
        const sampleSpan = Math.max(parts.routeLength * 0.006, 2);
        const point = parts.routeLine.getPointAtLength(currentLength);
        const previousPoint = parts.routeLine.getPointAtLength(Math.max(currentLength - sampleSpan, 0));
        const nextPoint = parts.routeLine.getPointAtLength(Math.min(currentLength + sampleSpan, parts.routeLength));
        const angle = Math.atan2(nextPoint.y - previousPoint.y, nextPoint.x - previousPoint.x) * (180 / Math.PI);

        parts.routeCurrent.style.left = `${(point.x / parts.viewBoxWidth) * 100}%`;
        parts.routeCurrent.style.top = `${(point.y / parts.viewBoxHeight) * 100}%`;
        parts.routeCurrent.style.setProperty('--sea-route-current-angle', `${angle.toFixed(2)}deg`);
    }

    /**
     * applySeaRouteProgress(parts, state) - 同步路线描边、流光和移动光标的当前进度
     * @param {Object} parts - 路线动画所需的 DOM 引用
     * @param {Object} state - 当前动画状态
     * @returns {void}
     */
    applySeaRouteProgress(parts, state = {}) {
        const lineProgress = Math.min(Math.max(state.lineProgress ?? 1, 0), 1);
        const traceProgress = Math.min(Math.max(state.traceProgress ?? lineProgress, 0), 1);
        const currentOpacity = Math.min(Math.max(state.currentOpacity ?? 0, 0), 0.56);
        const sheenOpacity = Math.min(Math.max(state.sheenOpacity ?? 0, 0), 1);
        const showCurrent = Boolean(state.showCurrent);

        parts.routeLine.style.strokeDasharray = `${parts.routeLength}`;
        parts.routeLine.style.strokeDashoffset = `${(1 - lineProgress) * parts.routeLength}`;
        parts.routeSheen.style.strokeDasharray = `${parts.sheenLength} ${parts.routeLength}`;
        parts.routeSheen.style.strokeDashoffset = `${(1 - traceProgress) * parts.routeLength + (parts.sheenLength * 0.2)}`;
        parts.routeSheen.style.opacity = showCurrent ? `${sheenOpacity}` : '0';

        this.positionSeaRouteCurrent(parts, traceProgress);
        parts.routeCurrent.style.opacity = showCurrent ? `${currentOpacity}` : '0';
    }

    /**
     * runSeaRoutePass(parts, options) - 播放一次沿路径推进的路线光流
     * @param {Object} parts - 路线动画所需的 DOM 引用
     * @param {{revealLine?: boolean}} options - 是否同时执行主线路描边
     * @returns {void}
     */
    runSeaRoutePass(parts, options = {}) {
        const revealLine = Boolean(options.revealLine);
        const routeMap = parts.routeMap;

        this.clearSeaRouteMotion();
        routeMap.classList.add('is-route-passing');
        const duration = revealLine ? 3200 : 1800;
        const startTime = performance.now();

        const step = (timestamp) => {
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const easedProgress = 1 - Math.pow(1 - progress, 2.2);
            const flowOpacity = Math.sin(progress * Math.PI);

            this.applySeaRouteProgress(parts, {
                lineProgress: revealLine ? easedProgress : 1,
                traceProgress: easedProgress,
                showCurrent: true,
                currentOpacity: revealLine
                    ? 0.24 + (flowOpacity * 0.32)
                    : 0.18 + (flowOpacity * 0.3),
                sheenOpacity: revealLine
                    ? 0.2 + (flowOpacity * 0.28)
                    : 0.16 + (flowOpacity * 0.26)
            });

            if (progress < 1) {
                this.seaRouteMotionRafId = requestAnimationFrame(step);
                return;
            }

            this.seaRouteMotionRafId = 0;
            routeMap.classList.remove('is-route-passing');
            routeMap.classList.add('is-route-drawn');
            if (revealLine) {
                this.routeAnimationPlayed = true;
            }
            this.applySeaRouteProgress(parts, {
                lineProgress: 1,
                traceProgress: 1,
                showCurrent: false
            });
        };

        this.seaRouteMotionRafId = requestAnimationFrame(step);
    }

    // 到达方式动画：只在第一次进入路线视图时播放一次描线，之后保持静态完成状态。
    /**
     * playSeaRouteAnimation() - 在路线面板中播放一次性描线动画
     * @returns {void} - 无返回值，直接更新路线 SVG 的类名状态
     */
    playSeaRouteAnimation() {
        if (!this.mapContainer) {
            return;
        }

        if (prefersReducedMotion()) {
            this.routeAnimationPlayed = true;
            this.syncSeaRouteLineState();
            return;
        }

        const parts = this.getSeaRouteMotionParts();
        if (!parts) {
            return;
        }

        const { routeMap } = parts;
        this.clearSeaRouteMotion();
        routeMap.classList.remove('is-route-passing');

        if (this.routeAnimationPlayed) {
            routeMap.classList.remove('is-route-awakened', 'is-route-drawn');
            this.applySeaRouteProgress(parts, {
                lineProgress: 1,
                traceProgress: 0,
                showCurrent: false
            });
            routeMap.getBoundingClientRect();
            routeMap.classList.add('is-route-awakened');
            this.runSeaRoutePass(parts, { revealLine: false });
            return;
        }

        routeMap.classList.remove('is-route-awakened');
        routeMap.classList.remove('is-route-drawn');
        this.applySeaRouteProgress(parts, {
            lineProgress: 0,
            traceProgress: 0,
            showCurrent: false
        });
        routeMap.getBoundingClientRect();
        routeMap.classList.add('is-route-awakened');
        this.runSeaRoutePass(parts, { revealLine: true });
    }

    // 路线面板静态态：当动画已经播过或当前不在路线页签时，保持路线完整可见。
    /**
     * syncSeaRouteLineState() - 同步路线描边的静态完成状态
     * @returns {void} - 无返回值，直接更新路线线条类名
     */
    syncSeaRouteLineState() {
        if (!this.mapContainer) {
            return;
        }

        const parts = this.getSeaRouteMotionParts();
        if (!parts) {
            return;
        }

        const { routeMap } = parts;
        this.clearSeaRouteMotion();
        routeMap.classList.remove('is-route-awakened', 'is-route-drawn', 'is-route-passing');
        if (this.routeAnimationPlayed) {
            if (this.activeSeaView === 'route') {
                routeMap.classList.add('is-route-awakened', 'is-route-drawn');
                this.applySeaRouteProgress(parts, {
                    lineProgress: 1,
                    traceProgress: 1,
                    showCurrent: false
                });
                return;
            }

            this.applySeaRouteProgress(parts, {
                lineProgress: 1,
                traceProgress: 0,
                showCurrent: false
            });
            return;
        }

        this.applySeaRouteProgress(parts, {
            lineProgress: 0,
            traceProgress: 0,
            showCurrent: false
        });
    }

    // 地图区渲染入口：把当前潜点的海域定位台整体注入页面容器。
    /**
     * renderMapInfo() - 渲染当前潜点的海域定位台
     * @param {{ preserveRouteState?: boolean }} [options={}] - 是否在重渲染时保留路线完成态
     * @returns {void} - 无返回值，直接更新地图容器
     */
    renderMapInfo(options = {}) {
        if (!this.mapContainer) {
            return;
        }

        const { preserveRouteState = false } = options;
        const routeLayout = this.getSeaRouteLayoutPreset(window.innerWidth);
        const atlas = this.buildSeaAtlasData();
        const mapData = this.spotData.map || getMapCatalogSpotById(this.spotId) || null;
        const shouldPreserveRouteState = preserveRouteState && this.routeAnimationPlayed;
        const shouldAnimateScene = Boolean(this.seaAtlasMap);

        this.clearSeaRouteMotion();
        this.clearSeaProfileEntrance();
        this.seaAtlasRevealObserver?.disconnect();
        window.clearTimeout(this.seaAtlasEntranceTimer);
        this.seaAtlasEntranceTimer = 0;
        this.routeAnimationPlayed = shouldPreserveRouteState;
        this.seaAtlasPortCardVisible = false;
        this.seaAtlasFullscreenPortCardVisible = false;
        this.seaAtlasCurrentAtlasData = atlas;
        this.seaAtlasCurrentMapData = mapData;
        this.seaRouteLayoutKey = routeLayout.key;
        this.mapContainer.innerHTML = this.createSeaAtlasMarkup(atlas, mapData);
        this.bindSeaAtlasControls();
        this.attachSeaAtlasMapMount();
        this.attachSeaRouteBoardMount();
        this.renderSeaRouteStageLayout();
        this.syncSeaAtlasMapStageCopy();
        this.renderSeaAtlasInfoCards('inline');
        this.setupSeaAtlasResize();
        this.updateSeaAtlasMapScene({
            animate: shouldAnimateScene,
            target: 'inline'
        });
        if (this.seaAtlasFullscreenOpen) {
            this.updateSeaAtlasMapScene({
                animate: Boolean(this.seaAtlasFullscreenMap),
                target: 'fullscreen'
            });
        }
        this.setupSeaAtlasReveal();
        this.syncSeaAtlasMapViewState();

        if (this.activeSeaView === 'underwater') {
            this.syncSeaRouteLineState();
            return;
        }

        if (this.activeSeaView !== 'route' || shouldPreserveRouteState) {
            this.syncSeaRouteLineState();
        }
    }

    /**
     * syncSeaRouteLayoutOnResize() - 在窗口尺寸变化后同步真地图尺寸与航线叠层
     * @returns {void}
     */
    syncSeaRouteLayoutOnResize() {
        if (!this.mapContainer) {
            return;
        }

        const nextLayout = this.getSeaRouteLayoutPreset(window.innerWidth);
        if (this.seaRouteLayoutKey && nextLayout.key !== this.seaRouteLayoutKey) {
            const shell = this.mapContainer.querySelector('#seaAtlasShell');
            const shouldReplayRoute = this.activeSeaView === 'route' && !this.routeAnimationPlayed && shell?.classList.contains('is-map-awake');

            this.seaRouteLayoutKey = nextLayout.key;
            this.renderSeaRouteStageLayout();
            this.syncSeaAtlasMapStageCopy();

            if (this.routeAnimationPlayed) {
                this.syncSeaRouteLineState();
            } else if (shouldReplayRoute) {
                this.playSeaRouteAnimation();
            } else {
                this.syncSeaRouteLineState();
            }
        }

        this.scheduleSeaAtlasMapSync({
            invalidateSize: true
        });
    }

    /**
     * safeReadSeaAtlasSize() - 读取用户上次拖拽后保存的海域定位台尺寸
     * @returns {{width:number,height:number}|null} - 有效尺寸对象；没有或损坏时返回 null
     */
    safeReadSeaAtlasSize() {
        try {
            const raw = localStorage.getItem(this.seaAtlasResizeStorageKey);
            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed.width !== 'number' || typeof parsed.height !== 'number') {
                return null;
            }

            return {
                width: parsed.width,
                height: parsed.height,
                shiftX: typeof parsed.shiftX === 'number' ? parsed.shiftX : 0
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * safeSaveSeaAtlasSize(size) - 把当前海域定位台的拖拽尺寸写入本地存储
     * @param {{width:number,height:number}} size - 最新宽高
     * @returns {void}
     */
    safeSaveSeaAtlasSize(size) {
        try {
            localStorage.setItem(this.seaAtlasResizeStorageKey, JSON.stringify({
                width: size.width,
                height: size.height,
                shiftX: size.shiftX || 0
            }));
        } catch (error) {
            // 本地存储失败时静默降级，不影响详情页阅读与切换。
        }
    }

    /**
     * clearSeaAtlasSize(shell) - 清除自定义尺寸，回到默认海域定位台大小
     * @param {HTMLElement|null} shell - 海域定位台外壳
     * @returns {void}
     */
    clearSeaAtlasSize(shell) {
        if (!shell) {
            return;
        }

        try {
            localStorage.removeItem(this.seaAtlasResizeStorageKey);
        } catch (error) {
            // 忽略本地存储清理失败，至少保证当前页面能回到默认尺寸。
        }

        shell.style.removeProperty('width');
        shell.style.removeProperty('height');
        shell.style.removeProperty('--sea-atlas-shell-shift-x');
        this.scheduleSeaAtlasMapSync({
            invalidateSize: true
        });
    }

    /**
     * clampSeaAtlasSize(shell, width, height) - 把拖拽后的尺寸限制在合理区间
     * @param {HTMLElement} shell - 海域定位台外壳
     * @param {number} width - 候选宽度
     * @param {number} height - 候选高度
     * @returns {{width:number,height:number}} - 被限制后的安全尺寸
     */
    clampSeaAtlasSize(shell, width, height, shiftX = 0) {
        const containerRect = this.mapContainer?.getBoundingClientRect() || shell.getBoundingClientRect();
        // 原来的最小宽度几乎贴着容器宽度，很多桌面尺寸下会把宽度“锁死”，
        // 用户拖边缘时看起来就像完全拉不动。这里放宽可调区间，让海域定位台能真正在桌面端缩放。
        const maxWidth = Math.max(820, Math.floor(containerRect.width));
        const minWidth = Math.min(760, maxWidth);
        const minHeight = 720;
        const maxHeight = Math.max(980, Math.floor(window.innerHeight * 0.92));
        const clampedWidth = Math.min(Math.max(width, minWidth), maxWidth);
        const clampedHeight = Math.min(Math.max(height, minHeight), maxHeight);
        const availableShift = Math.max((containerRect.width - clampedWidth) * 0.5, 0);

        return {
            width: clampedWidth,
            height: clampedHeight,
            shiftX: Math.min(Math.max(shiftX, -availableShift), availableShift)
        };
    }

    /**
     * applySeaAtlasSize(shell, size) - 把计算后的尺寸应用到海域定位台外壳
     * @param {HTMLElement} shell - 海域定位台外壳
     * @param {{width:number,height:number}} size - 需要应用的宽高
     * @returns {void}
     */
    applySeaAtlasSize(shell, size) {
        if (!shell || !size) {
            return;
        }

        shell.style.width = `${Math.round(size.width)}px`;
        shell.style.height = `${Math.round(size.height)}px`;
        shell.style.setProperty('--sea-atlas-shell-shift-x', `${Math.round(size.shiftX || 0)}px`);
        this.scheduleSeaAtlasMapSync({
            invalidateSize: true
        });
    }

    /**
     * setupSeaAtlasResize() - 给桌面端海域定位台添加鼠标拖拽调尺寸的能力
     * @returns {void}
     */
    setupSeaAtlasResize() {
        if (typeof this.seaAtlasResizeCleanup === 'function') {
            this.seaAtlasResizeCleanup();
            this.seaAtlasResizeCleanup = null;
        }

        const shell = this.mapContainer?.querySelector('#seaAtlasShell');
        const handles = Array.from(this.mapContainer?.querySelectorAll('[data-sea-atlas-resize]') || []);
        if (!shell || !handles.length) {
            return;
        }

        if (!isStageDebugModeEnabled) {
            shell.classList.remove('is-resizing');
            shell.style.removeProperty('width');
            shell.style.removeProperty('height');
            shell.style.removeProperty('--sea-atlas-shell-shift-x');
            this.body?.classList.remove('is-resizing-sea-atlas');
            return;
        }

        const desktopQuery = window.matchMedia('(min-width: 1180px)');
        let resizeState = null;

        const onPointerMove = (event) => {
            if (!resizeState) {
                return;
            }

            const dx = event.clientX - resizeState.startX;
            const dy = event.clientY - resizeState.startY;
            const direction = resizeState.direction;
            let nextWidth = resizeState.startWidth;
            let nextHeight = resizeState.startHeight;
            let nextShiftX = resizeState.startShiftX;

            if (direction.includes('e')) {
                nextWidth += dx;
                nextShiftX += dx * 0.5;
            }
            if (direction.includes('w')) {
                nextWidth -= dx;
                nextShiftX += dx * 0.5;
            }
            if (direction.includes('s')) {
                nextHeight += dy;
            }

            const clamped = this.clampSeaAtlasSize(shell, nextWidth, nextHeight, nextShiftX);
            resizeState.width = clamped.width;
            resizeState.height = clamped.height;
            resizeState.shiftX = clamped.shiftX;
            this.applySeaAtlasSize(shell, clamped);
        };

        const stopResize = () => {
            if (!resizeState) {
                return;
            }

            if (
                resizeState.handle &&
                typeof resizeState.handle.releasePointerCapture === 'function' &&
                resizeState.pointerId != null &&
                resizeState.handle.hasPointerCapture?.(resizeState.pointerId)
            ) {
                resizeState.handle.releasePointerCapture(resizeState.pointerId);
            }

            const finalSize = {
                width: resizeState.width,
                height: resizeState.height,
                shiftX: resizeState.shiftX || 0
            };

            resizeState = null;
            shell.classList.remove('is-resizing');
            this.body.classList.remove('is-resizing-sea-atlas');
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', stopResize);
            window.removeEventListener('pointercancel', stopResize);
            this.safeSaveSeaAtlasSize(finalSize);
            this.scheduleSeaAtlasMapSync({
                invalidateSize: true
            });
        };

        const syncDesktopState = () => {
            if (desktopQuery.matches) {
                const saved = this.safeReadSeaAtlasSize();
                if (saved) {
                    this.applySeaAtlasSize(shell, this.clampSeaAtlasSize(shell, saved.width, saved.height, saved.shiftX || 0));
                }
                return;
            }

            shell.classList.remove('is-resizing');
            this.body.classList.remove('is-resizing-sea-atlas');
            shell.style.removeProperty('width');
            shell.style.removeProperty('height');
            shell.style.removeProperty('--sea-atlas-shell-shift-x');
            this.scheduleSeaAtlasMapSync({
                invalidateSize: true
            });
        };

        handles.forEach((handle) => {
            handle.addEventListener('pointerdown', (event) => {
                if (!desktopQuery.matches) {
                    return;
                }

                event.preventDefault();
                if (typeof handle.setPointerCapture === 'function') {
                    handle.setPointerCapture(event.pointerId);
                }
                const rect = shell.getBoundingClientRect();
                resizeState = {
                    handle,
                    pointerId: event.pointerId,
                    direction: handle.dataset.seaAtlasResize || 'se',
                    startX: event.clientX,
                    startY: event.clientY,
                    startWidth: rect.width,
                    startHeight: rect.height,
                    startShiftX: parseFloat(getComputedStyle(shell).getPropertyValue('--sea-atlas-shell-shift-x')) || 0,
                    width: rect.width,
                    height: rect.height,
                    shiftX: parseFloat(getComputedStyle(shell).getPropertyValue('--sea-atlas-shell-shift-x')) || 0
                };

                shell.classList.add('is-resizing');
                this.body.classList.add('is-resizing-sea-atlas');
                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', stopResize);
                window.addEventListener('pointercancel', stopResize);
            });

            handle.addEventListener('dblclick', (event) => {
                if (!desktopQuery.matches) {
                    return;
                }

                event.preventDefault();
                this.clearSeaAtlasSize(shell);
            });
        });

        const onWindowResize = () => {
            if (!desktopQuery.matches) {
                return;
            }

            const saved = this.safeReadSeaAtlasSize();
            if (saved) {
                this.applySeaAtlasSize(shell, this.clampSeaAtlasSize(shell, saved.width, saved.height, saved.shiftX || 0));
            } else {
                this.scheduleSeaAtlasMapSync({
                    invalidateSize: true
                });
            }
        };

        desktopQuery.addEventListener('change', syncDesktopState);
        window.addEventListener('resize', onWindowResize);
        syncDesktopState();

        this.seaAtlasResizeCleanup = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', stopResize);
            window.removeEventListener('pointercancel', stopResize);
            window.removeEventListener('resize', onWindowResize);
            desktopQuery.removeEventListener('change', syncDesktopState);
            resizeState = null;
            shell.classList.remove('is-resizing');
            this.body.classList.remove('is-resizing-sea-atlas');
        };
    }

    /**
     * getPackageById(packageId) - 按 ID 获取指定套餐数据
     * @param {string} packageId - 套餐 ID
     * @returns {Object|null} - 对应套餐对象或空值
     */
    getPackageById(packageId) {
        return this.packageData.find((pkg) => pkg.id === packageId) || null;
    }

    /**
     * getReviewById(reviewId) - 按 ID 获取指定评论数据
     * @param {string} reviewId - 评论 ID
     * @returns {Object|null} - 对应评论对象或空值
     */
    getReviewById(reviewId) {
        return this.reviewData.find((review) => review.id === reviewId) || null;
    }

    // 套餐匹配区渲染：生成顶部能力标签和右侧“海层式”套餐流向列表。
    /**
     * renderPackageMatchTags() - 渲染顶部能力匹配标签组
     * @returns {void} - 无返回值，直接更新标签容器
     */
    renderPackageMatchTags() {
        if (!this.packageMatchTags) {
            return;
        }

        const tags = Array.from(new Set(this.packageData.flatMap((pkg) => pkg.fitTags)));

        this.packageMatchTags.innerHTML = tags.map((tag) => createBookingMatchChipMarkup(tag)).join('');
    }

    /**
     * renderItineraries() - 渲染右侧按海层推进的连续套餐卡片列表
     * @returns {void} - 无返回值，直接更新套餐列表 DOM
     */
    renderItineraries() {
        if (!this.itineraryList) {
            return;
        }

        this.renderPackageMatchTags();

        const bookedPackageIds = this.getBookedPackageIdsForCurrentSpot();
        const flowPackages = this.getPackageFlowPackages();

        this.itineraryList.innerHTML = flowPackages.map((pkg, index) => {
            const isActive = pkg.id === this.selectedPackageId;
            const isBooked = bookedPackageIds.has(pkg.id);
            const stateMarkup = isBooked
                ? '<div class="package-card-state-stack"><span class="package-card-state package-card-state-booked">已收进行程</span></div>'
                : '';
            const fitPlates = Array.isArray(pkg.fitTags)
                ? pkg.fitTags.map((tag) => createPackagePlateMarkup(tag, 'fit')).join('')
                : '';
            const rhythmPlates = buildPackageRhythmTags(pkg)
                .map((tag) => createPackagePlateMarkup(tag, 'rhythm'))
                .join('');
            const cadenceStayCopy = this.getPackageCadenceStayCopy(pkg);
            const focusCopy = this.getPackageFocusCopy(pkg);
            const guidanceCopy = getLeadingSentence(pkg.pace || pkg.mood || pkg.fitReason);
            const actionCopy = isBooked ? '再看这套安排' : '继续了解';
            const stageLabel = `Sea Layer ${String(index + 1).padStart(2, '0')}`;

            return `
                <article
                    class="package-card ${isActive ? 'is-active' : ''} ${isBooked ? 'is-booked' : ''}"
                    data-package-id="${pkg.id}"
                    data-package-flow-index="${index + 1}"
                    tabindex="0"
                    aria-label="${pkg.name}，查看详情"
                    style="animation-delay: ${index * 0.08}s"
                >
                    <div class="package-card-head">
                        <div class="package-card-topline">
                            <div class="package-card-topline-main">
                                <span class="package-card-index">${stageLabel}</span>
                                <span class="package-card-badge">${pkg.group}</span>
                            </div>
                            ${stateMarkup}
                        </div>

                        <div class="package-card-audience">
                            <span class="package-card-section-label">适合谁</span>
                            <p class="package-card-audience-copy">${pkg.audience}</p>
                            <div class="package-tag-cluster package-tag-cluster-fit">
                                ${fitPlates}
                            </div>
                        </div>
                    </div>

                    <div class="package-card-archive">
                        <div class="package-card-title-wrap">
                            <h4 class="package-card-title" aria-label="${pkg.name}">
                                <span class="package-card-title-line">${pkg.name}</span>
                            </h4>
                            <p class="package-card-mood">${pkg.mood}</p>
                        </div>

                        <div class="package-tag-cluster package-tag-cluster-rhythm">
                            ${rhythmPlates}
                        </div>

                        <div class="package-card-signal">
                            <div class="package-price-wrap">
                                <span class="package-price-label">这一程起于</span>
                                <span class="package-price-value" data-price-target="${pkg.price}">¥0</span>
                            </div>

                            <div class="package-cadence-stack">
                                <span class="package-card-section-label">进入方式</span>
                                <p class="package-cadence-primary">${pkg.diveSummary}</p>
                                <p class="package-cadence-secondary">${cadenceStayCopy}</p>
                            </div>
                        </div>
                    </div>

                    <div class="package-card-focus">
                        <span class="package-card-section-label">当前海流</span>
                        <p class="package-card-focus-copy">${focusCopy}</p>
                    </div>

                    <div class="package-card-footer">
                        <p class="package-card-guidance">${guidanceCopy}</p>
                        <button class="package-card-action ${isBooked ? 'is-booked' : ''}" type="button" data-package-id="${pkg.id}">
                            ${actionCopy}
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    d="M5 12h14M13 6l6 6-6 6"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        </button>
                    </div>
                </article>
            `;
        }).join('');

        this.setupPackageCardTitleReveal();
        this.setupPackagePriceObserver();
        this.syncPackageCardSelection();

        if (this.bookingNote && !this.bookingNote.classList.contains('is-success')) {
            this.bookingNote.innerHTML = `
                <p>先打开套餐详情，再决定是否预订。盐憩更在意你是否适合这一次下潜，而不是让你仓促下单。</p>
            `;
        }
    }

    /**
     * syncPackageCardSelection(packageId) - 只更新套餐卡的当前激活态，不重渲染整组卡片
     * @param {string|null} packageId - 当前需要高亮的套餐 ID
     * @returns {void} - 无返回值，直接切换卡片 class
     */
    syncPackageCardSelection(packageId = this.selectedPackageId) {
        if (!this.itineraryList) {
            return;
        }

        const targetId = packageId || this.selectedPackageId;
        if (!targetId) {
            return;
        }

        this.selectedPackageId = targetId;
        this.applyPackageCardSelectionState(targetId);
        this.syncBookingFocusPanel();
    }

    /**
     * applyPackageCardSelectionState() - 根据当前阅读语境决定是否保留套餐卡的旧版高亮。
     * focus-only 稳定态由上方焦点舱接管当前套餐提示，进入阶段保留旧高亮，稳定后再收起。
     * @param {string|null} packageId - 当前选中的套餐 ID
     * @returns {void} - 无返回值，直接同步套餐卡 class
     */
    applyPackageCardSelectionState(packageId = this.selectedPackageId) {
        if (!this.itineraryList) {
            return;
        }

        const targetId = packageId || this.selectedPackageId || '';
        const isFocusOnlyStable = this.bookingSticky?.classList.contains('is-focus-only-context') || false;
        const focusContextPhase = this.bookingSticky?.dataset.focusContextPhase || '';
        const shouldHighlightCard = Boolean(targetId) && (!isFocusOnlyStable || focusContextPhase === 'entering');
        this.itineraryList.querySelectorAll('.package-card').forEach((card) => {
            const isCurrent = shouldHighlightCard && card.dataset.packageId === targetId;
            card.classList.toggle('is-active', isCurrent);
            card.setAttribute('aria-current', isCurrent ? 'true' : 'false');
        });
    }

    /**
     * getPackageCardById() - 根据套餐 ID 找到右侧侧栏中的对应套餐卡 DOM。
     * @param {string} packageId - 套餐 ID
     * @returns {HTMLElement|null} - 对应套餐卡或空值
     */
    getPackageCardById(packageId) {
        if (!this.itineraryList || !packageId) {
            return null;
        }

        return Array.from(this.itineraryList.querySelectorAll('.package-card'))
            .find((card) => card.dataset.packageId === packageId) || null;
    }

    /**
     * getBookingStickyMaxScrollTop() - 读取右侧 sticky 侧栏当前允许的最大内部滚动距离。
     * @returns {number} - 当前最大 scrollTop
     */
    getBookingStickyMaxScrollTop() {
        if (!this.bookingSticky) {
            return 0;
        }

        return Math.max(0, this.bookingSticky.scrollHeight - this.bookingSticky.clientHeight);
    }

    /**
     * getAbsoluteOffsetTop() - 读取元素基于文档流的绝对 offsetTop，避免 transform 参与侧栏滚动计算。
     * @param {HTMLElement|null} element - 需要读取位置的元素
     * @returns {number} - 文档流里的绝对 offsetTop
     */
    getAbsoluteOffsetTop(element) {
        let current = element;
        let offsetTop = 0;

        while (current) {
            offsetTop += current.offsetTop || 0;
            current = current.offsetParent;
        }

        return offsetTop;
    }

    /**
     * getBookingStickyTargetTopForPackage() - 计算某张套餐卡在右侧 sticky 侧栏内的理想停留位置。
     * @param {string} packageId - 需要对齐的套餐 ID
     * @returns {number} - 对应的 scrollTop 目标值
     */
    getBookingStickyTargetTopForPackage(packageId) {
        if (!this.bookingSticky) {
            return 0;
        }

        const targetCard = this.getPackageCardById(packageId);
        if (!targetCard) {
            return 0;
        }

        const stickyTop = this.getAbsoluteOffsetTop(this.bookingSticky);
        const cardTop = this.getAbsoluteOffsetTop(targetCard);
        const visualOffset = Math.max((this.bookingSticky.clientHeight - targetCard.offsetHeight) * 0.24, 26);
        const rawTargetTop = (cardTop - stickyTop) - visualOffset;
        const maxScrollTop = this.getBookingStickyMaxScrollTop();

        return Math.max(0, Math.min(rawTargetTop, maxScrollTop));
    }

    /**
     * getElementReadingAnchorY() - 取一个区块在页面里的绝对阅读锚点位置。
     * @param {Element|null} element - 需要读取位置的区块元素
     * @param {number} [ratio=0] - 取元素内部相对高度比例
     * @returns {number} - 绝对页面 Y 值
     */
    getElementReadingAnchorY(element, ratio = 0) {
        if (!element) {
            return 0;
        }

        const rect = element.getBoundingClientRect();
        return window.scrollY + rect.top + (rect.height * ratio);
    }

    /**
     * getBookingStickyScrollAnchors() - 建立左侧阅读进度与右侧侧栏内部滚动之间的连续映射锚点。
     * 顶部档案区保持在侧栏上部，进入评论区后再逐步把套餐卡推到视口焦点位置。
     * @returns {Array<{ sourceY: number, targetTop: number }>} - 已按页面顺序排好的锚点数组
     */
    getBookingStickyScrollAnchors() {
        if (!this.bookingSticky) {
            return [];
        }

        const anchors = [];
        const pushAnchor = (element, targetTop, ratio = 0) => {
            if (!element) {
                return;
            }

            anchors.push({
                sourceY: this.getElementReadingAnchorY(element, ratio),
                targetTop: Math.max(0, Math.min(targetTop, this.getBookingStickyMaxScrollTop()))
            });
        };

        pushAnchor(this.introSection, 0, 0.04);
        pushAnchor(this.spotMapHeading || this.mapContainer, 0, 0.2);

        const reviewCards = this.reviewsSection
            ? Array.from(this.reviewsSection.querySelectorAll('.review-card[data-linked-package-id]'))
            : [];

        if (reviewCards.length) {
            const firstReviewTarget = this.getBookingStickyTargetTopForPackage(
                reviewCards[0].dataset.linkedPackageId || ''
            );

            pushAnchor(this.spotReviewsHeading || this.reviewsStage, firstReviewTarget * 0.18, 0.3);

            reviewCards.forEach((card) => {
                const linkedPackageId = card.dataset.linkedPackageId || '';
                const targetTop = this.getBookingStickyTargetTopForPackage(linkedPackageId);
                pushAnchor(card, targetTop, card.classList.contains('has-feature-photo') ? 0.28 : 0.38);
            });
        }

        const tailTarget = anchors.length ? anchors[anchors.length - 1].targetTop : 0;
        pushAnchor(this.relatedSection || this.detailFooter, tailTarget, 0.14);

        return anchors
            .filter((anchor) => Number.isFinite(anchor.sourceY) && Number.isFinite(anchor.targetTop))
            .sort((a, b) => a.sourceY - b.sourceY);
    }

    /**
     * getInterpolatedBookingStickyTop() - 按当前阅读位置在锚点之间插值，得到右侧侧栏应处于的内部滚动位置。
     * @returns {number} - 当前应同步到的 scrollTop
     */
    getInterpolatedBookingStickyTop() {
        const anchors = this.getBookingStickyScrollAnchors();
        if (!anchors.length) {
            return 0;
        }

        const readingProbeY = window.scrollY + this.getSeaGuideOffset() + Math.min(window.innerHeight * 0.3, 250);

        if (readingProbeY <= anchors[0].sourceY) {
            return anchors[0].targetTop;
        }

        for (let index = 1; index < anchors.length; index += 1) {
            const previousAnchor = anchors[index - 1];
            const nextAnchor = anchors[index];

            if (readingProbeY > nextAnchor.sourceY) {
                continue;
            }

            const distance = Math.max(1, nextAnchor.sourceY - previousAnchor.sourceY);
            const progress = Math.max(0, Math.min((readingProbeY - previousAnchor.sourceY) / distance, 1));
            return previousAnchor.targetTop + ((nextAnchor.targetTop - previousAnchor.targetTop) * progress);
        }

        return anchors[anchors.length - 1].targetTop;
    }

    /**
     * syncBookingStickyScrollWithReading() - 静态版侧栏里不再让右侧内部滚动跟随正文。
     * 保留这个方法作为兼容入口，只负责停止旧的滚动追随动画。
     * @returns {void} - 无返回值，直接清理旧的滚动跟随状态
     */
    syncBookingStickyScrollWithReading() {
        if (this.bookingStickyScrollRaf) {
            window.cancelAnimationFrame(this.bookingStickyScrollRaf);
            this.bookingStickyScrollRaf = 0;
        }

        if (!this.bookingSticky) {
            this.bookingStickyScrollTargetTop = 0;
            return;
        }

        this.bookingStickyScrollTargetTop = this.bookingSticky.scrollTop || 0;
    }

    /**
     * startBookingStickyScrollFollow() - 用轻缓追随的方式把右侧侧栏内部滚动带向目标位置。
     * @returns {void} - 无返回值，直接启动或续接滚动跟随动画
     */
    startBookingStickyScrollFollow() {
        if (!this.bookingSticky || this.bookingStickyScrollRaf) {
            return;
        }

        const follow = () => {
            this.bookingStickyScrollRaf = 0;
            if (!this.bookingSticky) {
                return;
            }

            const currentTop = this.bookingSticky.scrollTop;
            const targetTop = Math.max(0, Math.min(
                this.bookingStickyScrollTargetTop,
                this.getBookingStickyMaxScrollTop()
            ));
            const delta = targetTop - currentTop;

            if (Math.abs(delta) < 0.6) {
                this.bookingSticky.scrollTop = targetTop;
                return;
            }

            const easedStep = delta * 0.16;
            const stepMagnitude = Math.min(
                Math.abs(delta),
                Math.max(Math.abs(delta) * 0.12, 0.9),
                7.5
            );
            const guidedStep = Math.sign(delta) * stepMagnitude;
            this.bookingSticky.scrollTop = currentTop + (
                Math.abs(easedStep) > Math.abs(guidedStep) ? easedStep : guidedStep
            );
            this.bookingStickyScrollRaf = window.requestAnimationFrame(follow);
        };

        this.bookingStickyScrollRaf = window.requestAnimationFrame(follow);
    }

    /**
     * getCurrentReviewLinkedPackageId() - 根据当前阅读位置找出更接近视口焦点的评论卡对应套餐。
     * 带大图的评论卡会略微提高权重，让“主评论”在可视区时更容易主导右侧同步。
     * @returns {string} - 当前评论对应的套餐 ID
     */
    getCurrentReviewLinkedPackageId() {
        if (!this.reviewCardMetrics.length) {
            return '';
        }

        const scrollY = window.scrollY || window.pageYOffset || 0;
        const focusLine = scrollY + Math.min(window.innerHeight * 0.42, 320);
        let currentCard = null;
        let bestScore = Number.POSITIVE_INFINITY;
        let activeCardScore = Number.POSITIVE_INFINITY;

        this.reviewCardMetrics.forEach((card) => {
            const intersectsViewport = card.top + card.height > scrollY && card.top < scrollY + window.innerHeight;
            if (!intersectsViewport) {
                return;
            }

            const cardCenter = card.top + (card.height / 2);
            const featureBias = card.hasFeaturePhoto ? -70 : 0;
            const score = Math.abs(cardCenter - focusLine) + featureBias;

            if (score < bestScore) {
                bestScore = score;
                currentCard = card;
            }

            if (card.packageId === this.activeReviewLinkedPackageId && score < activeCardScore) {
                activeCardScore = score;
            }
        });

        if (
            this.activeReviewLinkedPackageId &&
            Number.isFinite(activeCardScore) &&
            activeCardScore <= bestScore + 72
        ) {
            return this.activeReviewLinkedPackageId;
        }

        if (!currentCard) {
            return '';
        }

        return currentCard.packageId || '';
    }

    /**
     * syncPackageSelectionFromCurrentReview() - 当评论区进入当前阅读焦点时，同步右侧套餐高亮和内部滚动。
     * @returns {void} - 无返回值，直接更新右侧套餐侧栏
     */
    syncPackageSelectionFromCurrentReview() {
        if (!this.reviewsSection || !this.itineraryList || !this.bookingSticky) {
            return;
        }

        const currentContextKey = this.activeBookingGuideKey || this.getCurrentBookingReadingGuideKey();
        if (currentContextKey !== 'reviews') {
            this.activeReviewLinkedPackageId = null;
            return;
        }

        const hasOverlayOpen =
            (this.reviewLightbox && this.reviewLightbox.classList.contains('active')) ||
            (this.reviewDetailModal && this.reviewDetailModal.classList.contains('active')) ||
            (this.bookingConfirmFeedback && this.bookingConfirmFeedback.classList.contains('active')) ||
            (this.bookingModal && this.bookingModal.classList.contains('active'));

        if (hasOverlayOpen) {
            return;
        }

        const linkedPackageId = this.getCurrentReviewLinkedPackageId();
        if (!linkedPackageId || linkedPackageId === this.activeReviewLinkedPackageId) {
            return;
        }

        this.activeReviewLinkedPackageId = linkedPackageId;
        this.syncPackageCardSelection(linkedPackageId);
    }

    // 评论区渲染：根据当前筛选项输出评论卡、图片组和查看详情入口。
    /**
     * renderReviews() - 根据当前筛选条件渲染评论区卡片
     * @returns {void} - 无返回值，直接更新评论区 DOM
     */
    /**
     * setupPackagePriceObserver() - 监听套餐价格进入视口后再触发一次性数字滚动动画
     * @returns {void} - 无返回值，直接注册或降级执行套餐价格动画
     */
    setupPackagePriceObserver() {
        if (!this.itineraryList) {
            return;
        }

        const priceElements = Array.from(this.itineraryList.querySelectorAll('.package-price-value[data-price-target]'));
        if (priceElements.length === 0) {
            return;
        }

        if (this.packagePriceObserver) {
            this.packagePriceObserver.disconnect();
            this.packagePriceObserver = null;
        }

        if (!('IntersectionObserver' in window)) {
            priceElements.forEach((element, index) => {
                animateRollingPrice(element, element.dataset.priceTarget || element.textContent, {
                    duration: 1500,
                    delay: 120 + (index * 90)
                });
            });
            return;
        }

        this.packagePriceObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                const priceElement = entry.target.querySelector('.package-price-value[data-price-target]') || entry.target;
                animateRollingPrice(priceElement, priceElement.dataset.priceTarget || priceElement.textContent, {
                    duration: 1500,
                    delay: 80
                });
                observer.unobserve(entry.target);
            });
        }, {
            threshold: 0.55,
            rootMargin: '0px 0px -24px 0px'
        });

        priceElements.forEach((element) => {
            if (element.dataset.priceAnimated === 'true') {
                return;
            }

            const priceRegion = element.closest('.package-price-wrap') || element;
            this.packagePriceObserver.observe(priceRegion);
        });
    }

    renderReviews() {
        if (!this.reviewsSection) {
            return;
        }

        const filters = [
            { key: 'all', label: '全部' },
            { key: 'diving', label: '潜水体验' },
            { key: 'stay', label: '住宿' },
            { key: 'food', label: '饮食' },
            { key: 'scenery', label: '风景' }
        ];

        if (this.reviewsFilters) {
            this.reviewsFilters.innerHTML = filters.map((filter) => `
                <button
                    type="button"
                    class="review-filter ${this.activeReviewFilter === filter.key ? 'is-active' : ''}"
                    data-filter="${filter.key}"
                >
                    ${filter.label}
                </button>
            `).join('');
        }

        const avatarSrc = 'assets/images/avatar.png';
        const filteredReviews = this.reviewData.filter((review) => (
            this.activeReviewFilter === 'all' || review.focus.includes(this.activeReviewFilter)
        ));
        const visibleReviews = this.attachReviewPackageLinks(filteredReviews);

        this.reviewsSection.innerHTML = visibleReviews.map((review) => {
            const reviewPhotos = review.photos || [];
            const galleryPhotoCount = reviewPhotos.length + (review.featurePhoto ? 1 : 0);
            const galleryClasses = ['review-gallery'];

            if (review.featurePhoto) {
                galleryClasses.push('has-featured-photo');
            } else if (galleryPhotoCount === 1) {
                galleryClasses.push('review-gallery-solo');
            } else if (galleryPhotoCount === 2) {
                galleryClasses.push('review-gallery-pair');
            } else if (galleryPhotoCount === 3) {
                galleryClasses.push('review-gallery-trio');
            }

            return `
            <article
                class="review-card${review.featurePhoto ? ' has-feature-photo' : ''}"
                data-review-id="${review.id}"
                data-review-primary-focus="${escapeHtml(review.focus?.[0] || 'diving')}"
                data-linked-package-id="${escapeHtml(review.linkedPackageId || '')}"
                data-linked-package-name="${escapeHtml(review.linkedPackageName || '')}"
            >
                <div class="review-body">
                    <header class="review-header">
                        <div class="review-author">
                            <img
                                src="${avatarSrc}"
                                alt="${review.user}头像"
                                class="review-avatar"
                                loading="lazy"
                                decoding="async"
                                fetchpriority="low"
                            >
                            <div class="review-meta">
                                <div class="review-user">${review.user}</div>
                                <div class="review-subline">
                                    <span class="review-date">${review.date}</span>
                                    <span class="review-level">${review.level}</span>
                                </div>
                            </div>
                        </div>
                        <div class="review-rating">
                            ${this.createReviewRatingStarsMarkup(review, 'review-rating-stars')}
                            <span class="review-rating-score">${review.ratingScore}</span>
                        </div>
                    </header>

                    ${review.title ? `
                        <div class="review-scene">
                            <p class="review-scene-kicker">Island Note</p>
                            <h3 class="review-scene-title">${review.title}</h3>
                            ${review.subtitle ? `<p class="review-scene-subtitle">${review.subtitle}</p>` : ''}
                        </div>
                    ` : ''}

                    <p class="review-summary">${review.summary}</p>
                    <div class="review-actions">
                        <button type="button" class="review-expand">展开全文</button>
                        <button type="button" class="review-detail-trigger" data-review-id="${review.id}">查看详情</button>
                    </div>

                    <div class="review-dimensions">
                        <div class="review-dimension">
                            <span class="review-dimension-title">潜水</span>
                            <p class="review-dimension-text">${review.diving}</p>
                        </div>
                        <div class="review-dimension">
                            <span class="review-dimension-title">酒店住宿</span>
                            <p class="review-dimension-text">${review.stay}</p>
                        </div>
                        <div class="review-dimension">
                            <span class="review-dimension-title">饮食</span>
                            <p class="review-dimension-text">${review.food}</p>
                        </div>
                        <div class="review-dimension">
                            <span class="review-dimension-title">风景感受</span>
                            <p class="review-dimension-text">${review.scenery}</p>
                        </div>
                    </div>
                </div>

                <div class="${galleryClasses.join(' ')}">
                    ${review.featurePhoto ? `
                        <button
                            type="button"
                            class="review-photo-button review-featured-photo-button"
                            data-lightbox-src="${review.featurePhoto.src}"
                            data-lightbox-alt="${review.user}在${this.spotData.name}的旅行照片"
                            data-lightbox-caption="${review.featurePhoto.caption}"
                        >
                            <img
                                src="${review.featurePhoto.src}"
                                alt="${review.featurePhoto.caption}"
                                class="review-photo review-featured-photo"
                                loading="lazy"
                                decoding="async"
                                fetchpriority="low"
                                onerror="this.onerror=null;this.src='https://via.placeholder.com/1200x900?text=${encodeURIComponent(review.featurePhoto.caption)}';"
                                style="object-position: ${review.featurePhoto.position};"
                            >
                            <span class="review-photo-caption review-photo-caption-featured">${review.featurePhoto.caption}</span>
                        </button>
                    ` : ''}
                    ${reviewPhotos.map((photo) => `
                        <button
                            type="button"
                            class="review-photo-button"
                            data-lightbox-src="${photo.src}"
                            data-lightbox-alt="${review.user}在${this.spotData.name}的旅行照片"
                            data-lightbox-caption="${photo.caption}"
                        >
                            <img
                                src="${photo.src}"
                                alt="${photo.caption}"
                                class="review-photo"
                                loading="lazy"
                                decoding="async"
                                fetchpriority="low"
                                onerror="this.onerror=null;this.src='https://via.placeholder.com/960x720?text=${encodeURIComponent(photo.caption)}';"
                                style="object-position: ${photo.position};"
                            >
                            <span class="review-photo-caption">${photo.caption}</span>
                        </button>
                    `).join('')}
                </div>
            </article>
        `;
        }).join('');

        this.activeReviewLinkedPackageId = null;
        const shouldReplayReviewsSectionReveal = this.getReviewsRevealTargets().some((target) => (
            target?.classList.contains('is-visible')
        ));
        this.clearPendingReviewsReveal();
        this.spotReviewsHeading?.classList.remove('is-visible');
        this.reviewsStage?.classList.remove('is-visible');
        this.reviewsSection.classList.remove('is-visible');
        this.syncReviewExpandButtons();
        this.clearReviewCardShellReveal();
        this.clearReviewCardContentReveal();
        this.resetReviewGalleryPhotoReveal();
        this.setupReviewGalleryPhotoReveal();

        if (
            shouldReplayReviewsSectionReveal
            && this.getReviewsRevealTargets().some((target) => this.isReviewsRevealTargetInView(target))
        ) {
            this.markReviewsVisible();
        }

        this.measureDetailScrollMetrics();
        window.requestAnimationFrame(() => {
            this.syncBookingReadingGuide({ force: true, immediate: true });
            this.syncBookingCopyDepthState();
            this.syncBookingStickyScrollWithReading();
            this.syncPackageSelectionFromCurrentReview();
        });

        const activeFilter = filters.find((filter) => filter.key === this.activeReviewFilter) || filters[0];
        if (this.hasRenderedReviews) {
            const summary = visibleReviews.length
                ? `已切换到${activeFilter.label}，共${visibleReviews.length}条评价。`
                : `已切换到${activeFilter.label}，暂无可见评价。`;
            this.announceReviewsSummary(summary);
        } else {
            this.hasRenderedReviews = true;
        }
    }

    /**
     * syncReviewExpandButtons() - 根据摘要是否真的溢出决定是否显示“展开全文”
     * @returns {void} - 无返回值，直接同步评论卡按钮状态
     */
    syncReviewExpandButtons() {
        if (!this.reviewsSection) {
            return;
        }

        const reviewCards = Array.from(this.reviewsSection.querySelectorAll('.review-card'));
        if (reviewCards.length === 0) {
            return;
        }

        reviewCards.forEach((card) => {
            const summary = card.querySelector('.review-summary');
            const expandButton = card.querySelector('.review-expand');
            if (!summary || !expandButton) {
                return;
            }

            const wasExpanded = card.classList.contains('is-expanded');
            if (wasExpanded) {
                card.classList.remove('is-expanded');
            }

            const isOverflowing = this.isReviewSummaryOverflowing(summary);
            expandButton.hidden = !isOverflowing;
            expandButton.setAttribute('aria-hidden', String(!isOverflowing));

            if (!isOverflowing) {
                card.classList.remove('is-expanded');
                expandButton.textContent = '展开全文';
                return;
            }

            if (wasExpanded) {
                card.classList.add('is-expanded');
            }
            expandButton.textContent = card.classList.contains('is-expanded') ? '收起全文' : '展开全文';
        });
    }

    /**
     * isReviewSummaryOverflowing(summaryElement) - 用未截断副本测量评论摘要是否真的超过折叠高度
     * @param {HTMLElement} summaryElement - 当前评论摘要元素
     * @returns {boolean} - 是否需要显示“展开全文”
     */
    isReviewSummaryOverflowing(summaryElement) {
        if (!summaryElement) {
            return false;
        }

        const computedStyle = window.getComputedStyle(summaryElement);
        const lineHeight = Number.parseFloat(computedStyle.lineHeight);
        const clampLineCount = Number.parseInt(computedStyle.getPropertyValue('-webkit-line-clamp'), 10) || 4;
        const clampedHeight = lineHeight > 0
            ? lineHeight * clampLineCount
            : summaryElement.getBoundingClientRect().height;

        if (!clampedHeight) {
            return false;
        }

        const clone = summaryElement.cloneNode(true);
        clone.removeAttribute('id');
        clone.style.position = 'absolute';
        clone.style.visibility = 'hidden';
        clone.style.pointerEvents = 'none';
        clone.style.zIndex = '-1';
        clone.style.left = '0';
        clone.style.top = '0';
        clone.style.height = 'auto';
        clone.style.minHeight = '0';
        clone.style.maxHeight = 'none';
        clone.style.overflow = 'visible';
        clone.style.display = 'block';
        clone.style.webkitLineClamp = 'unset';
        clone.style.webkitBoxOrient = 'initial';
        clone.style.width = `${summaryElement.getBoundingClientRect().width}px`;

        document.body.appendChild(clone);
        const naturalHeight = clone.getBoundingClientRect().height;
        clone.remove();

        return naturalHeight - clampedHeight > 2;
    }

    /**
     * getReviewsRevealTargets() - 收集评论区可用于触发显现的关键节点
     * @returns {HTMLElement[]} - 去重后的评论区触发节点列表
     */
    getReviewsRevealTargets() {
        return [this.spotReviewsHeading, this.reviewsStage, this.reviewsSection]
            .filter((node, index, list) => node && list.indexOf(node) === index);
    }

    /**
     * getReviewCards() - 收集评论区里当前渲染出的评论卡
     * @returns {HTMLElement[]} - 评论卡节点列表
     */
    getReviewCards() {
        if (!this.reviewsSection) {
            return [];
        }

        return Array.from(
            this.reviewsSection.querySelectorAll('.review-card')
        );
    }

    /**
     * clearPendingReviewsReveal() - 清理评论区外层 reveal 的 raf 与定时器，避免旧时序残留。
     * @returns {void}
     */
    clearPendingReviewsReveal() {
        if (this.reviewsRevealCommitRafId) {
            window.cancelAnimationFrame(this.reviewsRevealCommitRafId);
            this.reviewsRevealCommitRafId = 0;
        }

        this.reviewsRevealTimers.forEach((timerId) => {
            window.clearTimeout(timerId);
        });
        this.reviewsRevealTimers = [];
    }

    /**
     * queueReviewsRevealTimer() - 注册评论区外层 reveal 使用的定时器，方便统一回收。
     * @param {Function} callback - 定时器触发时执行的逻辑
     * @param {number} delay - 延迟毫秒数
     * @returns {number} - 定时器 ID
     */
    queueReviewsRevealTimer(callback, delay = 0) {
        const timerId = window.setTimeout(() => {
            this.reviewsRevealTimers = this.reviewsRevealTimers
                .filter((activeTimerId) => activeTimerId !== timerId);
            callback();
        }, delay);

        this.reviewsRevealTimers.push(timerId);
        return timerId;
    }

    /**
     * clearReviewCardShellReveal() - 清理评论卡壳体 reveal 的 raf，并重置壳体显现状态
     * @returns {void}
     */
    clearReviewCardShellReveal() {
        if (this.reviewCardShellRevealRafId) {
            window.cancelAnimationFrame(this.reviewCardShellRevealRafId);
            this.reviewCardShellRevealRafId = 0;
        }

        this.getReviewCards().forEach((card) => {
            card.classList.remove('is-shell-visible');
            card.style.removeProperty('--review-card-shell-delay');
        });
    }

    /**
     * markReviewCardShellVisible(card, staggerIndex) - 将评论卡壳体切换到已显现状态，并给同批次卡片轻微错峰
     * @param {HTMLElement|null} card - 当前评论卡节点
     * @param {number} staggerIndex - 当前批次中的序号
     * @returns {boolean} - 是否成功切到显现态
     */
    markReviewCardShellVisible(card, staggerIndex = 0) {
        if (
            !card
            || !card.isConnected
            || card.classList.contains('is-hidden')
            || card.classList.contains('is-shell-visible')
        ) {
            return false;
        }

        const safeIndex = Math.max(0, Math.min(staggerIndex, 3));
        card.style.setProperty('--review-card-shell-delay', `${safeIndex * 80}ms`);
        card.classList.add('is-shell-visible');
        return true;
    }

    /**
     * scheduleReviewCardShellReveal() - 为当前进入视口带的评论卡壳体安排 reveal，避免动画在视口外提前播完
     * @returns {void}
     */
    scheduleReviewCardShellReveal() {
        if (!this.reviewsSection?.classList.contains('is-visible')) {
            return;
        }

        if (this.reviewCardShellRevealRafId) {
            window.cancelAnimationFrame(this.reviewCardShellRevealRafId);
            this.reviewCardShellRevealRafId = 0;
        }

        this.reviewCardShellRevealRafId = window.requestAnimationFrame(() => {
            let visibleBatchIndex = 0;

            this.getReviewCards().forEach((card) => {
                if (
                    card.isConnected
                    && !card.classList.contains('is-hidden')
                    && !card.classList.contains('is-shell-visible')
                    && this.isReviewCardInView(card)
                ) {
                    if (this.markReviewCardShellVisible(card, visibleBatchIndex)) {
                        visibleBatchIndex += 1;
                    }
                }
            });

            this.reviewCardShellRevealRafId = 0;
        });
    }

    /**
     * clearReviewCardContentReveal() - 清理评论卡内部内容 reveal 的 raf、定时器和监听，并重置 copy 显现状态
     * @returns {void}
     */
    clearReviewCardContentReveal() {
        if (this.reviewCardContentRevealRafId) {
            window.cancelAnimationFrame(this.reviewCardContentRevealRafId);
            this.reviewCardContentRevealRafId = 0;
        }

        this.reviewCardContentRevealTimers.forEach((timerId) => {
            window.clearTimeout(timerId);
        });
        this.reviewCardContentRevealTimers = [];

        this.reviewCardContentRevealCleanup.forEach((cleanup) => {
            cleanup?.();
        });
        this.reviewCardContentRevealCleanup.clear();

        this.getReviewCards().forEach((card) => {
            card.classList.remove('is-copy-visible');
            delete card.dataset.reviewContentRevealState;
        });
    }

    /**
     * queueReviewCardContentRevealTimer(callback, delay) - 注册评论卡内容 reveal 使用的定时器，方便统一回收
     * @param {Function} callback - 定时器触发时执行的逻辑
     * @param {number} delay - 延迟毫秒数
     * @returns {number} - 定时器 ID
     */
    queueReviewCardContentRevealTimer(callback, delay = 0) {
        const timerId = window.setTimeout(() => {
            this.reviewCardContentRevealTimers = this.reviewCardContentRevealTimers
                .filter((activeTimerId) => activeTimerId !== timerId);
            callback();
        }, delay);

        this.reviewCardContentRevealTimers.push(timerId);
        return timerId;
    }

    /**
     * isReviewCardInView(card) - 判断评论卡是否已经进入当前视口带
     * @param {HTMLElement|null} card - 待检查的评论卡
     * @returns {boolean} - 当前评论卡是否已进入用户可见区域
     */
    isReviewCardInView(card) {
        if (!card) {
            return false;
        }

        const rect = card.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return rect.top < viewportHeight * 0.92 && rect.bottom > viewportHeight * 0.12;
    }

    /**
     * parseCssTimeToMs(value) - 将 CSS transition 时间解析为毫秒，仅取首个时间片段
     * @param {string} value - CSS 时间字符串
     * @returns {number} - 毫秒值
     */
    parseCssTimeToMs(value) {
        const firstSegment = String(value || '')
            .split(',')[0]
            ?.trim() || '';

        if (firstSegment.endsWith('ms')) {
            return Number.parseFloat(firstSegment) || 0;
        }

        if (firstSegment.endsWith('s')) {
            return (Number.parseFloat(firstSegment) || 0) * 1000;
        }

        return 0;
    }

    /**
     * getReviewCardTransitionDelayMs(card) - 读取评论卡 reveal 的 transition delay，用于事件丢失时的兜底等待
     * @param {HTMLElement|null} card - 当前评论卡节点
     * @returns {number} - 毫秒值
     */
    getReviewCardTransitionDelayMs(card) {
        if (!card) {
            return 0;
        }

        return this.parseCssTimeToMs(window.getComputedStyle(card).transitionDelay);
    }

    /**
     * isReviewCardShellSettled(card) - 判断评论卡壳体是否已经基本显现完成
     * @param {HTMLElement|null} card - 当前评论卡节点
     * @returns {boolean} - 是否已接近稳定态
     */
    isReviewCardShellSettled(card) {
        if (!card) {
            return false;
        }

        const opacity = Number.parseFloat(window.getComputedStyle(card).opacity);
        return Number.isFinite(opacity) && opacity >= 0.96;
    }

    /**
     * markReviewCardCopyVisible(card) - 将评论卡内部文字切换到已显现状态
     * @param {HTMLElement|null} card - 当前评论卡节点
     * @returns {void}
     */
    markReviewCardCopyVisible(card) {
        if (!card || !card.isConnected || card.classList.contains('is-hidden')) {
            return;
        }

        card.classList.add('is-copy-visible');
        card.dataset.reviewContentRevealState = 'revealed';

        const cleanup = this.reviewCardContentRevealCleanup.get(card);
        if (cleanup) {
            cleanup();
            this.reviewCardContentRevealCleanup.delete(card);
        }
    }

    /**
     * scheduleSingleReviewCardContentReveal(card) - 等评论卡壳体稳定后，再按“图片先、文字后”的节奏播放内部 reveal
     * @param {HTMLElement|null} card - 当前评论卡节点
     * @returns {void}
     */
    scheduleSingleReviewCardContentReveal(card) {
        if (!card || !card.isConnected || card.classList.contains('is-hidden')) {
            return;
        }

        const readyGalleries = Array.from(
            card.querySelectorAll('.review-gallery[data-photo-reveal-ready="true"]')
        );
        const hasPhotoButtons = Boolean(card.querySelector('.review-photo-button'));
        const needsPhotoReveal = readyGalleries.some((gallery) => (
            Boolean(gallery.querySelector('.review-photo-button:not(.is-photo-visible)'))
        ));
        const needsCopyReveal = !card.classList.contains('is-copy-visible');

        if (!needsPhotoReveal && !needsCopyReveal) {
            card.dataset.reviewContentRevealState = 'revealed';
            return;
        }

        if (!readyGalleries.length && hasPhotoButtons) {
            return;
        }

        if (!this.isReviewCardInView(card) && needsCopyReveal) {
            return;
        }

        if (card.dataset.reviewContentRevealState === 'scheduled') {
            return;
        }

        const revealCardContent = () => {
            if (!card.isConnected) {
                return;
            }

            readyGalleries.forEach((gallery) => {
                this.markReviewGalleryPhotosVisible(gallery);
            });

            if (!needsCopyReveal || card.classList.contains('is-copy-visible')) {
                card.dataset.reviewContentRevealState = 'revealed';
                return;
            }

            card.dataset.reviewContentRevealState = 'copy-pending';
            this.queueReviewCardContentRevealTimer(() => {
                this.markReviewCardCopyVisible(card);
            }, 120);
        };

        const existingCleanup = this.reviewCardContentRevealCleanup.get(card);
        if (existingCleanup) {
            existingCleanup();
            this.reviewCardContentRevealCleanup.delete(card);
        }

        if (this.isReviewCardShellSettled(card)) {
            revealCardContent();
            return;
        }

        card.dataset.reviewContentRevealState = 'scheduled';

        let hasSettled = false;
        let fallbackTimer = 0;

        const cleanup = () => {
            card.removeEventListener('transitionend', onTransitionEnd);
            if (fallbackTimer) {
                window.clearTimeout(fallbackTimer);
                this.reviewCardContentRevealTimers = this.reviewCardContentRevealTimers
                    .filter((timerId) => timerId !== fallbackTimer);
                fallbackTimer = 0;
            }
        };

        const finish = () => {
            if (hasSettled) {
                return;
            }

            hasSettled = true;
            cleanup();
            this.reviewCardContentRevealCleanup.delete(card);
            revealCardContent();
        };

        const onTransitionEnd = (event) => {
            if (event.target !== card || event.propertyName !== 'opacity') {
                return;
            }

            finish();
        };

        card.addEventListener('transitionend', onTransitionEnd);
        fallbackTimer = this.queueReviewCardContentRevealTimer(() => {
            finish();
        }, this.getReviewCardTransitionDelayMs(card) + 420);
        this.reviewCardContentRevealCleanup.set(card, cleanup);
    }

    /**
     * scheduleReviewCardContentReveal() - 为当前已进入视口带的评论卡安排内部内容 reveal
     * @returns {void}
     */
    scheduleReviewCardContentReveal() {
        if (!this.reviewsSection?.classList.contains('is-visible')) {
            return;
        }

        if (this.reviewCardContentRevealRafId) {
            window.cancelAnimationFrame(this.reviewCardContentRevealRafId);
            this.reviewCardContentRevealRafId = 0;
        }

        this.reviewCardContentRevealRafId = window.requestAnimationFrame(() => {
            this.getReviewCards().forEach((card) => {
                if (
                    card.isConnected
                    && !card.classList.contains('is-hidden')
                    && this.isReviewCardInView(card)
                ) {
                    this.scheduleSingleReviewCardContentReveal(card);
                }
            });

            this.reviewCardContentRevealRafId = 0;
        });
    }

    /**
     * getReviewPhotoButtons() - 收集评论卡里需要跟随显现节奏的照片按钮
     * @returns {HTMLElement[]} - 评论图库按钮列表
     */
    getReviewPhotoButtons() {
        if (!this.reviewsSection) {
            return [];
        }

        return Array.from(
            this.reviewsSection.querySelectorAll('.review-gallery .review-photo-button')
        );
    }

    /**
     * getReviewPhotoGalleries() - 收集评论区里的图库容器
     * @returns {HTMLElement[]} - 评论图库节点列表
     */
    getReviewPhotoGalleries() {
        if (!this.reviewsSection) {
            return [];
        }

        return Array.from(
            this.reviewsSection.querySelectorAll('.review-gallery')
        );
    }

    /**
     * flagReviewGalleryReady(gallery) - 标记评论图库已经满足播放条件，等待对应评论卡接续 reveal
     * @param {HTMLElement|null} gallery - 目标图库节点
     * @returns {boolean} - 本次是否首次标记为 ready
     */
    flagReviewGalleryReady(gallery) {
        if (!gallery || !gallery.isConnected || gallery.dataset.photoRevealReady === 'true') {
            return false;
        }

        gallery.dataset.photoRevealReady = 'true';
        return true;
    }

    /**
     * resetReviewGalleryReadyFlag(gallery) - 清空评论图库的 ready 标记
     * @param {HTMLElement|null} gallery - 目标图库节点
     * @returns {void}
     */
    resetReviewGalleryReadyFlag(gallery) {
        if (!gallery) {
            return;
        }

        delete gallery.dataset.photoRevealReady;
    }

    /**
     * resetReviewGalleryPhotoReveal() - 重置评论图片区照片的显现状态，确保后续能重新触发动画
     * @returns {void}
     */
    resetReviewGalleryPhotoReveal() {
        this.reviewGalleryPhotoObserver?.disconnect();

        if (this.reviewGalleryPhotoRevealRafId) {
            window.cancelAnimationFrame(this.reviewGalleryPhotoRevealRafId);
            this.reviewGalleryPhotoRevealRafId = 0;
        }

        this.getReviewPhotoGalleries().forEach((gallery) => {
            this.resetReviewGalleryReadyFlag(gallery);
        });

        this.getReviewPhotoButtons().forEach((button) => {
            button.classList.remove('is-photo-visible');
        });
    }

    /**
     * markReviewGalleryPhotosVisible(gallery) - 将指定评论图库中的照片切换到已显现状态
     * @param {HTMLElement|null} gallery - 目标图库节点
     * @returns {void}
     */
    markReviewGalleryPhotosVisible(gallery) {
        if (!gallery) {
            return;
        }

        gallery.querySelectorAll('.review-photo-button').forEach((button) => {
            if (button.isConnected) {
                button.classList.add('is-photo-visible');
            }
        });
    }

    /**
     * isReviewGalleryInView(gallery) - 判断评论图库是否已经进入当前视口带
     * @param {HTMLElement|null} gallery - 待检查的评论图库
     * @returns {boolean} - 当前图库是否已进入用户可见区域
     */
    isReviewGalleryInView(gallery) {
        if (!gallery) {
            return false;
        }

        const rect = gallery.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return rect.top < viewportHeight * 0.9 && rect.bottom > viewportHeight * 0.14;
    }

    /**
     * revealReviewGalleryPhotos() - 仅唤醒当前已进入视口的评论图库照片，避免离屏时提前播完
     * @returns {void}
     */
    revealReviewGalleryPhotos() {
        const galleries = this.getReviewPhotoGalleries();
        if (
            galleries.length === 0 ||
            !this.reviewsSection?.classList.contains('is-visible')
        ) {
            return;
        }

        if (!this.reviewsSection.querySelector('.review-photo-button:not(.is-photo-visible)')) {
            return;
        }

        if (this.reviewGalleryPhotoRevealRafId) {
            window.cancelAnimationFrame(this.reviewGalleryPhotoRevealRafId);
            this.reviewGalleryPhotoRevealRafId = 0;
        }

        this.reviewGalleryPhotoRevealRafId = window.requestAnimationFrame(() => {
            this.reviewGalleryPhotoRevealRafId = window.requestAnimationFrame(() => {
                const readyGalleries = [];
                galleries.forEach((gallery) => {
                    if (gallery.isConnected && this.isReviewGalleryInView(gallery)) {
                        if (this.flagReviewGalleryReady(gallery)) {
                            readyGalleries.push(gallery);
                        }
                        this.reviewGalleryPhotoObserver?.unobserve(gallery);
                    }
                });
                if (readyGalleries.length) {
                    this.scheduleReviewCardContentReveal();
                }
                this.reviewGalleryPhotoRevealRafId = 0;
            });
        });
    }

    /**
     * setupReviewGalleryPhotoReveal() - 为评论图库建立逐个进入视口的照片显现逻辑
     * @returns {void}
     */
    setupReviewGalleryPhotoReveal() {
        const galleries = this.getReviewPhotoGalleries();
        if (galleries.length === 0) {
            return;
        }

        this.reviewGalleryPhotoObserver?.disconnect();

        if (!('IntersectionObserver' in window)) {
            if (this.reviewsSection?.classList.contains('is-visible')) {
                galleries.forEach((gallery) => {
                    this.flagReviewGalleryReady(gallery);
                });
                this.scheduleReviewCardContentReveal();
            }
            return;
        }

        this.reviewGalleryPhotoObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (
                    (!entry.isIntersecting && entry.intersectionRatio <= 0)
                    || !this.reviewsSection?.classList.contains('is-visible')
                ) {
                    return;
                }

                if (this.flagReviewGalleryReady(entry.target)) {
                    this.scheduleSingleReviewCardContentReveal(
                        entry.target.closest('.review-card')
                    );
                }
                this.reviewGalleryPhotoObserver?.unobserve(entry.target);
            });
        }, {
            threshold: 0.22,
            rootMargin: '0px 0px -8% 0px'
        });

        galleries.forEach((gallery) => {
            this.reviewGalleryPhotoObserver?.observe(gallery);
        });

        this.revealReviewGalleryPhotos();
    }

    /**
     * markReviewsVisible() - 把评论标题、引导区和评论列表统一切到已显现状态
     * @returns {void} - 无返回值，直接更新评论区 class
     */
    markReviewsVisible() {
        this.clearPendingReviewsReveal();
        this.reviewsRevealCommitRafId = window.requestAnimationFrame(() => {
            this.reviewsRevealCommitRafId = window.requestAnimationFrame(() => {
                this.spotReviewsHeading?.classList.add('is-visible');
                this.queueReviewsRevealTimer(() => {
                    this.reviewsStage?.classList.add('is-visible');
                }, 120);
                this.queueReviewsRevealTimer(() => {
                    this.reviewsSection?.classList.add('is-visible');
                    this.scheduleReviewCardShellReveal();
                    this.revealReviewGalleryPhotos();
                    this.scheduleReviewCardContentReveal();
                }, 240);
                this.reviewsRevealCommitRafId = 0;
            });
        });
    }

    /**
     * isReviewsRevealTargetInView(target) - 判断某个评论区触发节点是否已经进入当前视口带
     * @param {HTMLElement|null} target - 待检查的评论区节点
     * @returns {boolean} - 当前节点是否应立即显示
     */
    isReviewsRevealTargetInView(target) {
        if (!target) {
            return false;
        }

        const rect = target.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return rect.top < viewportHeight * 0.9 && rect.bottom > viewportHeight * 0.12;
    }

    /**
     * setupReviewsReveal() - 监听评论区进入视口后，再让“用户评价”标题、引导区和评论卡按层次显现。
     * 这样用户先知道自己在读别人的回声，再进入具体评论，而不是一整段内容同时挤出来。
     * @returns {void} - 无返回值，直接注册评论区显现逻辑
     */
    setupReviewsReveal() {
        const targets = this.getReviewsRevealTargets();
        if (targets.length === 0) {
            return;
        }

        this.reviewsRevealObserver?.disconnect();

        if (!('IntersectionObserver' in window)) {
            this.markReviewsVisible();
            return;
        }

        this.reviewsRevealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                this.markReviewsVisible();
                this.reviewsRevealObserver?.disconnect();
            });
        }, {
            threshold: 0.08,
            rootMargin: '0px 0px -6% 0px'
        });

        targets.forEach((target) => {
            this.reviewsRevealObserver?.observe(target);
        });
    }

    /**
     * resetReviewsReveal() - 评论区重新渲染后重置显现状态，并在当前已进入视口时立即恢复为可见。
     * 这样切换评论筛选或切换潜点时，不会出现标题和卡片状态不同步的问题。
     * @returns {void} - 无返回值，直接更新评论区显现状态
     */
    resetReviewsReveal() {
        this.clearPendingReviewsReveal();
        this.spotReviewsHeading?.classList.remove('is-visible');
        this.reviewsStage?.classList.remove('is-visible');
        this.reviewsSection?.classList.remove('is-visible');
        this.clearReviewCardShellReveal();
        this.clearReviewCardContentReveal();
        this.resetReviewGalleryPhotoReveal();

        this.setupReviewsReveal();

        if (this.getReviewsRevealTargets().some((target) => this.isReviewsRevealTargetInView(target))) {
            this.markReviewsVisible();
            this.reviewsRevealObserver?.disconnect();
        }
    }

    // 详情弹层模板：分别生成评论详情层和套餐详情层的完整 DOM 字符串。
    /**
     * createReviewDetailMarkup(review) - 生成评论详情弹层的 HTML 内容
     * @param {Object} review - 当前评论数据对象
     * @returns {string} - 评论详情层 HTML 字符串
     */
    createReviewDetailMarkup(review) {
        const detailPhotos = [review.featurePhoto, ...(review.photos || [])].filter(Boolean);

        return `
            <article class="review-detail-shell" data-review-id="${review.id}">
                <header class="review-detail-header">
                    <div class="review-detail-author">
                        <img
                            src="assets/images/avatar.png"
                            alt="${review.user}头像"
                            class="review-detail-avatar"
                            decoding="async"
                        >
                        <div class="review-detail-meta">
                            <p class="review-detail-kicker">Dive Memory · ${this.spotData.name}</p>
                            <h2 class="review-detail-title" id="reviewDetailTitle">${review.title || `${review.user}的下潜回声`}</h2>
                            ${review.subtitle ? `<p class="review-detail-subtitle">${review.subtitle}</p>` : ''}
                            <div class="review-detail-subline">
                                <span>${review.date}</span>
                                <span>${review.level}</span>
                                <span>${review.ratingScore}</span>
                            </div>
                        </div>
                    </div>
                    <div class="review-detail-rating">
                        ${this.createReviewRatingStarsMarkup(review, 'review-detail-rating-stars')}
                        <span class="review-detail-rating-copy">真实体验记录</span>
                    </div>
                </header>

                <div class="review-detail-scroll">
                    <section class="review-detail-lead">
                        <p class="review-detail-summary">${review.summary}</p>
                        <p class="review-detail-note">这一段记忆不只是关于潜点，也关于酒店、餐桌、码头和海面光线如何一起构成一趟完整的下潜。</p>
                    </section>

                    <section class="review-detail-gallery-wrap">
                        <div class="review-detail-gallery">
                            ${detailPhotos.map((photo, index) => `
                                <button
                                    type="button"
                                    class="review-detail-photo-button${index === 0 && review.featurePhoto ? ' is-featured' : ''}"
                                    data-lightbox-src="${photo.src}"
                                    data-lightbox-alt="${review.user}在${this.spotData.name}的旅行照片"
                                    data-lightbox-caption="${photo.caption}"
                                >
                                    <img
                                        src="${photo.src}"
                                        alt="${photo.caption}"
                                        class="review-detail-photo"
                                        loading="lazy"
                                        decoding="async"
                                        fetchpriority="low"
                                        onerror="this.onerror=null;this.src='https://via.placeholder.com/1200x900?text=${encodeURIComponent(photo.caption)}';"
                                        style="object-position: ${photo.position};"
                                    >
                                    <span class="review-detail-photo-caption">${photo.caption}</span>
                                </button>
                            `).join('')}
                        </div>
                    </section>

                    <section class="review-detail-grid">
                        <article class="review-detail-section">
                            <span class="review-detail-section-title">潜水</span>
                            <p>${review.diving}</p>
                        </article>
                        <article class="review-detail-section">
                            <span class="review-detail-section-title">酒店住宿</span>
                            <p>${review.stay}</p>
                        </article>
                        <article class="review-detail-section">
                            <span class="review-detail-section-title">饮食</span>
                            <p>${review.food}</p>
                        </article>
                        <article class="review-detail-section">
                            <span class="review-detail-section-title">风景感受</span>
                            <p>${review.scenery}</p>
                        </article>
                    </section>
                </div>
            </article>
        `;
    }

    getPackageCadenceStayCopy(pkg) {
        return [pkg?.staySummary, pkg?.mealSummary].filter(Boolean).join(' · ');
    }

    getPackageFocusCopy(pkg) {
        return getLeadingSentence(pkg?.fitReason || pkg?.pace || pkg?.mood);
    }

    parsePackageDurationLabel(durationText) {
        const normalized = typeof durationText === 'string'
            ? durationText.replace(/\s+/g, '')
            : '';
        const match = normalized.match(/(\d+)天(\d+)晚/);
        const days = Number.parseInt(match?.[1] || '', 10);
        const nights = Number.parseInt(match?.[2] || '', 10);
        const safeDays = Number.isFinite(days) ? Math.max(2, days) : 3;
        const safeNights = Number.isFinite(nights) ? Math.max(1, nights) : Math.max(safeDays - 1, 1);

        return {
            days: safeDays,
            nights: safeNights,
            label: `${safeDays}天${safeNights}晚`
        };
    }

    getPackageModalDefaultWindowKey(pkg) {
        const summary = `${pkg?.group || ''} ${pkg?.name || ''} ${pkg?.diveSummary || ''} ${pkg?.mood || ''}`;
        if (/黄昏/.test(summary)) {
            return 'afterglow';
        }

        if (/慢潜|停驻|舒展|度假/.test(summary)) {
            return 'arrival';
        }

        return 'dawn';
    }

    getPackageModalWindowOptions(pkg) {
        const defaultKey = this.getPackageModalDefaultWindowKey(pkg);

        return [
            {
                key: 'dawn',
                label: '清晨入海',
                hint: '把更轻的第一束蓝，留给刚刚开始的下潜。'
            },
            {
                key: 'arrival',
                label: '午后抵达',
                hint: '把抵达、适应和海边慢住留得更松一点。'
            },
            {
                key: 'afterglow',
                label: '黄昏慢住',
                hint: '把傍晚的风、潜后停驻和海面余光一起留下。'
            }
        ].map((option) => ({
            ...option,
            isDefault: option.key === defaultKey
        }));
    }

    getPackageModalDurationClampMaxDays(pkg) {
        const baseDuration = this.parsePackageDurationLabel(pkg?.duration);
        return Math.max(PACKAGE_MODAL_CUSTOM_DURATION_MAX_DAYS, baseDuration.days);
    }

    clampPackageModalDurationDays(value, maxDays = PACKAGE_MODAL_CUSTOM_DURATION_MAX_DAYS) {
        const safeMaxDays = Math.max(
            PACKAGE_MODAL_DURATION_MIN_DAYS,
            Number.isFinite(Number(maxDays)) ? Math.round(Number(maxDays)) : PACKAGE_MODAL_CUSTOM_DURATION_MAX_DAYS
        );
        const numericValue = Number(value);

        if (!Number.isFinite(numericValue)) {
            return PACKAGE_MODAL_DURATION_MIN_DAYS;
        }

        return Math.max(
            PACKAGE_MODAL_DURATION_MIN_DAYS,
            Math.min(safeMaxDays, Math.round(numericValue))
        );
    }

    parsePackageModalDurationDays(value, maxDays = PACKAGE_MODAL_CUSTOM_DURATION_MAX_DAYS) {
        const parsed = Number.parseInt(String(value || '').trim(), 10);
        return Number.isFinite(parsed)
            ? this.clampPackageModalDurationDays(parsed, maxDays)
            : null;
    }

    normalizePackageModalPeopleValue(value) {
        const safeValue = String(value || '').trim();
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

    getPackageModalPeopleOptions() {
        return [
            {
                value: '',
                label: '先留白'
            },
            {
                value: '1',
                label: '1 人独行'
            },
            {
                value: '2',
                label: '2 人同行'
            },
            {
                value: '3-5',
                label: '3-5 人同潜'
            },
            {
                value: '6+',
                label: '6 人以上'
            }
        ];
    }

    formatPackageModalPeopleLabel(value) {
        const normalizedValue = this.normalizePackageModalPeopleValue(value);
        if (!normalizedValue) {
            return '';
        }

        const presetOption = this.getPackageModalPeopleOptions()
            .find((option) => option.value && option.value === normalizedValue);
        if (presetOption) {
            return presetOption.label;
        }

        return `${normalizedValue} 人同行`;
    }

    getPackageModalMiniWindowLabel(windowKey) {
        switch (windowKey) {
            case 'dawn':
                return '清晨';
            case 'arrival':
                return '午后';
            case 'afterglow':
                return '黄昏';
            default:
                return '待定';
        }
    }

    formatPackageModalMiniPeopleLabel(value) {
        const normalizedValue = this.normalizePackageModalPeopleValue(value);
        if (!normalizedValue) {
            return '待回声';
        }

        if (normalizedValue === '1') {
            return '1人';
        }

        if (normalizedValue === '2') {
            return '2人';
        }

        if (normalizedValue === '3-5') {
            return '3-5人';
        }

        if (normalizedValue === '6+') {
            return '6人以上';
        }

        const exactMatch = normalizedValue.match(/^(\d+)$/);
        if (exactMatch) {
            return `${exactMatch[1]}人`;
        }

        const rangeMatch = normalizedValue.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
            return `${rangeMatch[1]}-${rangeMatch[2]}人`;
        }

        const plusMatch = normalizedValue.match(/^(\d+)\+$/);
        if (plusMatch) {
            return `${plusMatch[1]}人以上`;
        }

        return '待回声';
    }

    isPackageModalCustomPeopleValue(value) {
        const normalizedValue = this.normalizePackageModalPeopleValue(value);
        if (!normalizedValue) {
            return false;
        }

        return !this.getPackageModalPeopleOptions()
            .some((option) => option.value && option.value === normalizedValue);
    }

    resolvePackageModalPeopleEstimateCount(value) {
        const PEOPLE_ESTIMATE_CAP = 12;
        const normalizedValue = this.normalizePackageModalPeopleValue(value);
        if (!normalizedValue) {
            return null;
        }

        const exactMatch = normalizedValue.match(/^(\d+)$/);
        if (exactMatch) {
            const count = Number.parseInt(exactMatch[1], 10);
            return Number.isFinite(count) && count > 0 ? Math.min(count, PEOPLE_ESTIMATE_CAP) : null;
        }

        const rangeMatch = normalizedValue.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rangeMatch) {
            const start = Number.parseInt(rangeMatch[1], 10);
            const end = Number.parseInt(rangeMatch[2], 10);
            if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) {
                return null;
            }

            return Math.min(PEOPLE_ESTIMATE_CAP, Math.max(1, Math.round((start + end) / 2)));
        }

        const plusMatch = normalizedValue.match(/^(\d+)\+$/);
        if (plusMatch) {
            const count = Number.parseInt(plusMatch[1], 10);
            return Number.isFinite(count) && count > 0
                ? Math.min(PEOPLE_ESTIMATE_CAP, count + 1)
                : null;
        }

        return null;
    }

    getPackageModalDurationOptions(pkg) {
        const baseDuration = this.parsePackageDurationLabel(pkg?.duration);
        const presetMaxDays = Math.max(PACKAGE_MODAL_PRESET_DURATION_MAX_DAYS, baseDuration.days);
        const optionDays = Array.from(new Set(
            [baseDuration.days - 1, baseDuration.days, baseDuration.days + 1, baseDuration.days + 2]
                .filter((day) => day >= PACKAGE_MODAL_DURATION_MIN_DAYS && day <= presetMaxDays)
        ));

        return optionDays.map((days) => ({
            days,
            nights: days === baseDuration.days ? baseDuration.nights : Math.max(days - 1, 1),
            label: days === baseDuration.days
                ? baseDuration.label
                : `${days}天${Math.max(days - 1, 1)}晚`
        }));
    }

    getPackageModalDraft(packageOrId) {
        const pkg = typeof packageOrId === 'object'
            ? packageOrId
            : this.getPackageById(packageOrId);
        if (!pkg) {
            return null;
        }

        const baseDuration = this.parsePackageDurationLabel(pkg.duration);
        const durationClampMaxDays = this.getPackageModalDurationClampMaxDays(pkg);
        const defaultWindowKey = this.getPackageModalDefaultWindowKey(pkg);
        const existingDraft = this.bookingModalDrafts.get(pkg.id) || {};
        const normalizedDraft = {
            days: Number.isFinite(Number(existingDraft.days))
                ? this.clampPackageModalDurationDays(existingDraft.days, durationClampMaxDays)
                : baseDuration.days,
            windowKey: this.getPackageModalWindowOptions(pkg).some((option) => option.key === existingDraft.windowKey)
                ? existingDraft.windowKey
                : defaultWindowKey,
            peopleValue: this.normalizePackageModalPeopleValue(existingDraft.peopleValue),
            focusField: this.normalizePackageModalEditorFocusField(existingDraft.focusField),
            isEditorOpen: Boolean(existingDraft.isEditorOpen),
            isCustomDurationOpen: Boolean(existingDraft.isCustomDurationOpen),
            isCustomPeopleOpen: Boolean(existingDraft.isCustomPeopleOpen)
        };

        this.bookingModalDrafts.set(pkg.id, normalizedDraft);
        return normalizedDraft;
    }

    updatePackageModalDraft(packageId, patch = {}) {
        const pkg = this.getPackageById(packageId);
        if (!pkg) {
            return null;
        }

        const currentDraft = this.getPackageModalDraft(pkg);
        const durationClampMaxDays = this.getPackageModalDurationClampMaxDays(pkg);
        const allowedWindowKeys = new Set(this.getPackageModalWindowOptions(pkg).map((option) => option.key));
        const nextDraft = {
            ...currentDraft,
            ...patch
        };

        this.bookingModalDrafts.set(pkg.id, {
            days: Number.isFinite(Number(nextDraft.days))
                ? this.clampPackageModalDurationDays(nextDraft.days, durationClampMaxDays)
                : currentDraft.days,
            windowKey: allowedWindowKeys.has(nextDraft.windowKey) ? nextDraft.windowKey : currentDraft.windowKey,
            peopleValue: this.normalizePackageModalPeopleValue(nextDraft.peopleValue) || '',
            focusField: this.normalizePackageModalEditorFocusField(nextDraft.focusField),
            isEditorOpen: Boolean(nextDraft.isEditorOpen),
            isCustomDurationOpen: Boolean(nextDraft.isCustomDurationOpen),
            isCustomPeopleOpen: Boolean(nextDraft.isCustomPeopleOpen)
        });

        return this.bookingModalDrafts.get(pkg.id);
    }

    normalizePackageModalEditorFocusField(field) {
        return ['duration', 'window', 'people'].includes(field) ? field : '';
    }

    getPackageModalCustomDurationInput(packageId) {
        if (!this.bookingModal) {
            return null;
        }

        return Array.from(this.bookingModal.querySelectorAll('[data-package-custom-duration-input][data-package-id]'))
            .find((input) => input.dataset.packageId === String(packageId)) || null;
    }

    focusPackageModalCustomDurationInput(packageId) {
        const input = this.getPackageModalCustomDurationInput(packageId);
        if (!input) {
            return;
        }

        input.focus();
        input.select();
    }

    getPackageModalCustomPeopleInput(packageId) {
        if (!this.bookingModal) {
            return null;
        }

        return Array.from(this.bookingModal.querySelectorAll('[data-package-custom-people-input][data-package-id]'))
            .find((input) => input.dataset.packageId === String(packageId)) || null;
    }

    focusPackageModalCustomPeopleInput(packageId) {
        const input = this.getPackageModalCustomPeopleInput(packageId);
        if (!input) {
            return;
        }

        input.focus();
        input.select();
    }

    getPackageModalEditorFieldElement(packageId, fieldKey) {
        if (!this.bookingModal) {
            return null;
        }

        const normalizedField = this.normalizePackageModalEditorFocusField(fieldKey);
        if (!normalizedField) {
            return null;
        }

        return Array.from(this.bookingModal.querySelectorAll('[data-package-editor-fragment]'))
            .find((element) => (
                element.dataset.packageEditorFragment === normalizedField &&
                element.closest('[data-package-price-editor]')?.dataset.packagePriceEditor === String(packageId)
            )) || null;
    }

    focusPackageModalEditorField(packageId, fieldKey) {
        const normalizedField = this.normalizePackageModalEditorFocusField(fieldKey);
        const fieldElement = this.getPackageModalEditorFieldElement(packageId, normalizedField);
        if (!fieldElement) {
            return;
        }

        window.clearTimeout(this.packageModalEditorFocusTimer);

        this.bookingModal
            ?.querySelectorAll('.package-modal-option-group.is-editor-focus-target')
            .forEach((element) => element.classList.remove('is-editor-focus-target'));

        fieldElement.classList.add('is-editor-focus-target');
        fieldElement.setAttribute('tabindex', '-1');
        fieldElement.focus({ preventScroll: true });
        fieldElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
        });

        this.packageModalEditorFocusTimer = window.setTimeout(() => {
            fieldElement.classList.remove('is-editor-focus-target');
        }, 1500);
    }

    getPackageModalEditorDomParts(packageId) {
        if (!this.bookingModal) {
            return null;
        }

        const packageKey = String(packageId || this.selectedPackageId || '');
        if (!packageKey) {
            return null;
        }

        const modalContent = this.bookingModal.querySelector('.booking-modal-content');
        const signal = this.bookingModal.querySelector('.package-modal-signal');
        const price = this.bookingModal.querySelector('.package-modal-price');
        const toggle = this.bookingModal.querySelector(`[data-package-price-editor-toggle="${packageKey}"]`);
        const editor = this.bookingModal.querySelector(`[data-package-price-editor="${packageKey}"]`);

        if (!modalContent || !signal || !price || !toggle || !editor) {
            return null;
        }

        return {
            modalContent,
            signal,
            price,
            toggle,
            editor,
            aside: signal.querySelector('.package-modal-signal-aside')
        };
    }

    cancelPackageModalEditorStateMotion() {
        if (!Array.isArray(this.packageModalEditorStateMotion) || !this.packageModalEditorStateMotion.length) {
            this.packageModalEditorStateMotion = [];
            return;
        }

        this.packageModalEditorStateMotion.forEach((animation) => {
            if (animation && typeof animation.cancel === 'function') {
                animation.cancel();
            }
        });
        this.packageModalEditorStateMotion = [];
    }

    syncPackageModalEditorMotionClasses(domParts, motionState = '') {
        if (!domParts) {
            return;
        }

        const isOpening = motionState === 'opening';
        const isClosing = motionState === 'closing';

        [domParts.signal, domParts.price, domParts.editor].forEach((element) => {
            if (!element) {
                return;
            }

            element.classList.toggle('is-editor-opening', isOpening);
            element.classList.toggle('is-editor-closing', isClosing);
        });

        domParts.signal?.classList.toggle('is-closing', isClosing);
        domParts.price?.classList.toggle('is-closing', isClosing);

        if (isOpening) {
            this.syncPackageModalPriceToggleState(domParts.toggle, 'opening');
            return;
        }

        if (isClosing) {
            this.syncPackageModalPriceToggleState(domParts.toggle, 'closing');
            return;
        }

        const isOpen = domParts.editor?.classList.contains('is-open');
        this.syncPackageModalPriceToggleState(domParts.toggle, isOpen ? 'open' : 'closed');
    }

    syncPackageModalPriceToggleState(toggleButton, state = 'closed') {
        if (!toggleButton) {
            return;
        }

        const normalizedState = ['closed', 'opening', 'open', 'closing'].includes(state)
            ? state
            : 'closed';
        const isOpenLike = normalizedState === 'open' || normalizedState === 'opening';
        const rail = toggleButton.querySelector('[data-package-price-toggle-rail]');

        toggleButton.dataset.packagePriceToggleState = normalizedState;
        toggleButton.setAttribute('aria-expanded', String(isOpenLike));
        toggleButton.setAttribute(
            'aria-label',
            isOpenLike ? '收住这一下，关闭节奏调整面板' : '改一改节奏，打开节奏调整面板'
        );

        if (rail) {
            rail.dataset.packagePriceToggleRailState = normalizedState;
        }
    }

    syncPackageModalEditorDomState(packageId, isEditorOpen) {
        const domParts = this.getPackageModalEditorDomParts(packageId);
        if (!domParts) {
            return false;
        }

        const {
            modalContent,
            signal,
            price,
            toggle,
            editor
        } = domParts;
        const editorState = isEditorOpen ? 'open' : 'closed';
        const layoutState = isEditorOpen ? 'expanded' : 'compact';

        this.syncPackageModalEditorMotionClasses(domParts);

        signal.classList.toggle('is-editor-open', Boolean(isEditorOpen));
        signal.classList.toggle('is-editor-closed', !isEditorOpen);
        signal.dataset.packageSignalState = layoutState;

        price.classList.toggle('is-editor-open', Boolean(isEditorOpen));
        price.classList.toggle('is-editor-closed', !isEditorOpen);
        price.dataset.packagePriceEditorState = editorState;
        price.dataset.packagePriceLayout = layoutState;
        price.querySelector('[data-package-price-layout-frame]')?.setAttribute('data-package-price-layout-frame', layoutState);

        this.syncPackageModalPriceToggleState(toggle, isEditorOpen ? 'open' : 'closed');

        editor.classList.toggle('is-open', Boolean(isEditorOpen));
        editor.classList.toggle('is-closed', !isEditorOpen);
        editor.setAttribute('aria-hidden', String(!isEditorOpen));
        editor.dataset.packagePriceEditorState = editorState;

        modalContent.dataset.packagePriceEditorState = editorState;
        modalContent.classList.toggle('has-package-price-editor-open', Boolean(isEditorOpen));

        return true;
    }

    runPackageModalEditorOpenMotion(packageId) {
        const domParts = this.getPackageModalEditorDomParts(packageId);
        if (!domParts) {
            return;
        }

        this.cancelPackageModalEditorStateMotion();
        if (this.packageModalPriceOpenTimer) {
            window.clearTimeout(this.packageModalPriceOpenTimer);
            this.packageModalPriceOpenTimer = 0;
        }

        const {
            signal,
            price,
            editor,
            aside
        } = domParts;
        const motion = [];

        this.syncPackageModalEditorMotionClasses(domParts, 'opening');

        if (signal?.animate) {
            motion.push(signal.animate([
                { opacity: 0.96, transform: 'translate3d(0, 6px, 0)' },
                { opacity: 1, transform: 'translate3d(0, 0, 0)' }
            ], {
                duration: 440,
                easing: 'cubic-bezier(0.18, 0.82, 0.22, 1)',
                fill: 'both'
            }));
        }

        if (price?.animate) {
            motion.push(price.animate([
                { opacity: 0.97, transform: 'translate3d(0, 4px, 0)' },
                { opacity: 1, transform: 'translate3d(0, 0, 0)' }
            ], {
                duration: 420,
                easing: 'cubic-bezier(0.18, 0.82, 0.22, 1)',
                fill: 'both'
            }));
        }

        if (editor?.animate) {
            motion.push(editor.animate([
                { opacity: 0.82, transform: 'translate3d(0, 10px, 0)' },
                { opacity: 1, transform: 'translate3d(0, 0, 0)' }
            ], {
                duration: 420,
                delay: 18,
                easing: 'cubic-bezier(0.18, 0.8, 0.22, 1)',
                fill: 'both'
            }));
        }

        const asideBlocks = aside
            ? Array.from(aside.querySelectorAll('.package-modal-extra-fragment'))
            : [];
        asideBlocks.forEach((block, index) => {
            if (!block?.animate) {
                return;
            }

            motion.push(block.animate([
                { opacity: 0.9, transform: 'translate3d(0, 8px, 0)', filter: 'blur(1px)' },
                { opacity: 1, transform: 'translate3d(0, 0, 0)', filter: 'blur(0px)' }
            ], {
                duration: 360,
                delay: 52 + (index * 34),
                easing: 'cubic-bezier(0.18, 0.8, 0.22, 1)',
                fill: 'both'
            }));
        });

        this.packageModalEditorStateMotion = motion;
        this.packageModalPriceOpenTimer = window.setTimeout(() => {
            this.syncPackageModalEditorMotionClasses(domParts);
            this.packageModalEditorStateMotion = [];
            this.packageModalPriceOpenTimer = 0;
        }, 620);
    }

    closePackageModalEditorWithMotion(packageId) {
        const domParts = this.getPackageModalEditorDomParts(packageId);
        if (!domParts) {
            const currentState = this.getPackageModalViewState(packageId);
            this.updatePackageModalDraft(packageId, {
                isEditorOpen: false,
                focusField: currentState?.focusField || ''
            });
            this.renderBookingModalMarkup(packageId, { preserveBodyScroll: true });
            return;
        }

        if (this.packageModalEditorTransitioning) {
            return;
        }

        const currentState = this.getPackageModalViewState(packageId);
        const focusField = currentState?.focusField || '';
        this.packageModalEditorTransitioning = true;
        this.cancelPackageModalEditorStateMotion();

        if (this.packageModalEditorCloseTimer) {
            window.clearTimeout(this.packageModalEditorCloseTimer);
            this.packageModalEditorCloseTimer = 0;
        }

        this.syncPackageModalEditorMotionClasses(domParts, 'closing');
        const {
            editor,
            aside
        } = domParts;
        const closeMotion = [];

        if (editor?.animate) {
            closeMotion.push(editor.animate([
                { opacity: 1, transform: 'translate3d(0, 0, 0)' },
                { opacity: 0.8, transform: 'translate3d(0, 6px, 0)' }
            ], {
                duration: 300,
                easing: 'cubic-bezier(0.22, 0.76, 0.2, 1)',
                fill: 'both'
            }));
        }

        const asideBlocks = aside
            ? Array.from(aside.querySelectorAll('.package-modal-extra-fragment'))
            : [];
        asideBlocks.forEach((block, index) => {
            if (!block?.animate) {
                return;
            }
            closeMotion.push(block.animate([
                { opacity: 1, transform: 'translate3d(0, 0, 0)' },
                { opacity: 0.86, transform: 'translate3d(0, 5px, 0)' }
            ], {
                duration: 240,
                delay: index * 18,
                easing: 'cubic-bezier(0.3, 0.72, 0.26, 1)',
                fill: 'both'
            }));
        });

        this.packageModalEditorStateMotion = closeMotion;

        this.packageModalEditorCloseTimer = window.setTimeout(() => {
            this.updatePackageModalDraft(packageId, {
                isEditorOpen: false,
                focusField
            });
            this.syncPackageModalEditorDomState(packageId, false);
            this.syncPackageModalEditorMotionClasses(domParts);
            this.cancelPackageModalEditorStateMotion();
            this.packageModalEditorTransitioning = false;
            this.packageModalEditorCloseTimer = 0;
        }, 300);
    }

    applyPackageModalCustomDuration(packageId, rawValue = null) {
        const pkg = this.getPackageById(packageId);
        if (!pkg) {
            return;
        }

        const input = this.getPackageModalCustomDurationInput(pkg.id);
        const durationClampMaxDays = this.getPackageModalDurationClampMaxDays(pkg);
        const nextDays = this.parsePackageModalDurationDays(
            rawValue == null ? input?.value : rawValue,
            durationClampMaxDays
        );

        if (!Number.isFinite(nextDays)) {
            input?.focus();
            input?.select();
            return;
        }

        const hasPresetMatch = this.getPackageModalDurationOptions(pkg).some((option) => option.days === nextDays);
        this.updatePackageModalDraft(pkg.id, {
            days: nextDays,
            isEditorOpen: true,
            focusField: 'duration',
            isCustomDurationOpen: !hasPresetMatch
        });
        this.renderBookingModalMarkup(pkg.id, { preserveBodyScroll: true });

        if (!hasPresetMatch) {
            window.requestAnimationFrame(() => {
                this.focusPackageModalCustomDurationInput(pkg.id);
            });
        }
    }

    applyPackageModalCustomPeople(packageId, rawValue = null) {
        const pkg = this.getPackageById(packageId);
        if (!pkg) {
            return;
        }

        const input = this.getPackageModalCustomPeopleInput(pkg.id);
        const nextPeopleValue = this.normalizePackageModalPeopleValue(
            rawValue == null ? input?.value : rawValue
        );

        if (!nextPeopleValue) {
            input?.focus();
            input?.select();
            return;
        }

        const hasPresetMatch = this.getPackageModalPeopleOptions()
            .some((option) => option.value && option.value === nextPeopleValue);
        this.updatePackageModalDraft(pkg.id, {
            peopleValue: nextPeopleValue,
            isEditorOpen: true,
            focusField: 'people',
            isCustomPeopleOpen: !hasPresetMatch
        });
        this.renderBookingModalMarkup(pkg.id, { preserveBodyScroll: true });

        if (!hasPresetMatch) {
            window.requestAnimationFrame(() => {
                this.focusPackageModalCustomPeopleInput(pkg.id);
            });
        }
    }

    estimatePackageModalPrice(pkg, selectedDays, selectedPeopleValue = '') {
        const basePrice = parsePriceValue(pkg?.price);
        const baseDuration = this.parsePackageDurationLabel(pkg?.duration);
        if (!Number.isFinite(basePrice)) {
            return null;
        }

        const deltaDays = selectedDays - baseDuration.days;
        const longStayStep = Math.max(
            680,
            Math.round((basePrice / Math.max(baseDuration.days, 1)) * 0.82 / 100) * 100
        );
        const shortStayStep = Math.max(
            480,
            Math.round(longStayStep * 0.72 / 100) * 100
        );
        let nextValue = deltaDays >= 0
            ? basePrice + (deltaDays * longStayStep)
            : basePrice + (deltaDays * shortStayStep);

        const peopleCount = this.resolvePackageModalPeopleEstimateCount(selectedPeopleValue);
        if (Number.isFinite(peopleCount) && peopleCount > 0) {
            const durationWeight = Math.max(0.85, selectedDays / Math.max(baseDuration.days, 1));
            if (peopleCount === 1) {
                const soloAddon = Math.max(
                    220,
                    Math.round((basePrice * 0.045) / 100) * 100
                );
                nextValue += soloAddon * durationWeight;
            } else {
                const extraPeople = peopleCount - 1;
                const crewStep = Math.max(
                    260,
                    Math.round(((basePrice / Math.max(baseDuration.days, 1)) * 0.26) / 100) * 100
                );
                nextValue += extraPeople * crewStep * durationWeight;
            }
        }

        return Math.max(1600, Math.round(nextValue / 100) * 100);
    }

    getPackageModalViewState(packageOrId) {
        const pkg = typeof packageOrId === 'object'
            ? packageOrId
            : this.getPackageById(packageOrId);
        if (!pkg) {
            return null;
        }

        const baseDuration = this.parsePackageDurationLabel(pkg.duration);
        const draft = this.getPackageModalDraft(pkg);
        const durationOptions = this.getPackageModalDurationOptions(pkg);
        const customDurationMaxDays = this.getPackageModalDurationClampMaxDays(pkg);
        const windowOptions = this.getPackageModalWindowOptions(pkg);
        const peopleOptions = this.getPackageModalPeopleOptions();
        const selectedWindow = windowOptions.find((option) => option.key === draft.windowKey) || windowOptions[0];
        const defaultWindowKey = this.getPackageModalDefaultWindowKey(pkg);
        const selectedDays = draft.days;
        const selectedNights = selectedDays === baseDuration.days
            ? baseDuration.nights
            : Math.max(selectedDays - 1, 1);
        const selectedPeopleValue = this.normalizePackageModalPeopleValue(draft.peopleValue);
        const selectedPeopleLabel = this.formatPackageModalPeopleLabel(selectedPeopleValue);
        const customPeopleInputValue = /^\d+$/.test(selectedPeopleValue) ? selectedPeopleValue : '';
        const durationLabel = `${selectedDays}天${selectedNights}晚`;
        const estimatedPriceValue = this.estimatePackageModalPrice(pkg, selectedDays, selectedPeopleValue);
        const priceLabel = Number.isFinite(estimatedPriceValue) ? formatPriceValue(estimatedPriceValue) : pkg.price;
        const isCustomDurationSelected = !durationOptions.some((option) => option.days === selectedDays);
        const isCustomDurationOpen = Boolean(draft.isCustomDurationOpen) || isCustomDurationSelected;
        const isCustomPeopleSelected = this.isPackageModalCustomPeopleValue(selectedPeopleValue);
        const isCustomPeopleOpen = Boolean(draft.isCustomPeopleOpen) || isCustomPeopleSelected;
        const editorState = Boolean(draft.isEditorOpen) ? 'open' : 'closed';
        const focusField = this.normalizePackageModalEditorFocusField(draft.focusField);
        const durationTone = selectedDays === baseDuration.days ? 'base' : 'shifted';
        const windowTone = selectedWindow.key === defaultWindowKey ? 'base' : 'shifted';
        const peopleTone = selectedPeopleLabel
            ? (isCustomPeopleSelected ? 'custom' : 'set')
            : 'empty';
        const summarySentence = `这一程先停留 ${durationLabel}，${selectedWindow.label} 入海，${selectedPeopleLabel || '同行待回声'}。`;
        const isCustomized =
            selectedDays !== baseDuration.days ||
            selectedWindow.key !== defaultWindowKey ||
            Boolean(selectedPeopleValue);

        return {
            ...draft,
            selectedDays,
            selectedNights,
            durationLabel,
            durationOptions,
            customDurationMaxDays,
            isCustomDurationSelected,
            isCustomDurationOpen,
            customDurationValue: selectedDays,
            windowOptions,
            windowKey: selectedWindow.key,
            windowLabel: selectedWindow.label,
            windowHint: selectedWindow.hint,
            peopleOptions,
            peopleValue: selectedPeopleValue,
            peopleLabel: selectedPeopleLabel,
            customPeopleInputValue,
            focusField,
            peopleHint: selectedPeopleLabel
                ? `会先按 ${selectedPeopleLabel} 的同行节奏写进这一程，后面还可以继续调整。`
                : '同行可以先留白，等海流更清晰再慢慢写进这一程。',
            isCustomPeopleSelected,
            isCustomPeopleOpen,
            durationTone,
            windowTone,
            peopleTone,
            summarySentence,
            editorState,
            priceValue: estimatedPriceValue,
            priceLabel,
            priceHint: isCustomized
                ? `此刻先按 ${durationLabel} · ${selectedWindow.label}${selectedPeopleLabel ? ` · ${selectedPeopleLabel}` : ''} 收住这一程`
                : '点开，换一换停留天数、入海时段，或写下自己的停留节奏',
            isCustomized
        };
    }

    renderBookingModalMarkup(packageId, options = {}) {
        const pkg = this.getPackageById(packageId);
        if (!pkg || !this.bookingModalBody) {
            return;
        }
        const modalState = this.getPackageModalViewState(pkg);

        const {
            preserveBodyScroll = false,
            animatePriceEditor = ''
        } = options;
        const modalContent = this.bookingModal?.querySelector('.booking-modal-content');
        const bodyScrollTop = preserveBodyScroll && modalContent
            ? modalContent.scrollTop
            : 0;

        this.bookingModalBody.innerHTML = this.createPackageModalMarkup(pkg);

        const nextModalContent = this.bookingModal?.querySelector('.booking-modal-content');
        if (nextModalContent) {
            nextModalContent.scrollTop = preserveBodyScroll ? bodyScrollTop : 0;
            nextModalContent.dataset.packagePriceEditorState = modalState?.editorState || 'closed';
            nextModalContent.dataset.packagePriceCustomState = modalState?.isCustomized ? 'customized' : 'default';
            nextModalContent.classList.toggle('has-package-price-editor-open', Boolean(modalState?.isEditorOpen));
            nextModalContent.classList.toggle('has-package-price-customized', Boolean(modalState?.isCustomized));
        }

        if (animatePriceEditor === 'open' && modalState?.isEditorOpen) {
            window.requestAnimationFrame(() => {
                this.runPackageModalEditorOpenMotion(pkg.id);
            });
        }
    }

    /**
     * getBookingMatchConfirmationState() - 读取当前能力匹配二次确认状态。
     * @returns {Object|null}
     */
    getBookingMatchConfirmationState() {
        return this.bookingMatchConfirmState && typeof this.bookingMatchConfirmState === 'object'
            ? this.bookingMatchConfirmState
            : null;
    }

    /**
     * isBookingMatchConfirmationVisible() - 判断匹配确认层是否处于可见或退场中状态。
     * @param {'modal'|'sidebar'|''} [source=''] - 可选来源过滤
     * @returns {boolean}
     */
    isBookingMatchConfirmationVisible(source = '') {
        const state = this.getBookingMatchConfirmationState();
        if (!state) {
            return false;
        }

        if (source && state.source !== source) {
            return false;
        }

        return state.phase === 'open' || state.phase === 'closing';
    }

    /**
     * buildBookingMatchConfirmationCopy() - 为当前匹配确认层生成统一文案。
     * @param {string} label - 当前标签文案
     * @returns {{ title: string, copy: string, confirm: string, cancel: string }}
     */
    buildBookingMatchConfirmationCopy(label) {
        const safeLabel = label || '这类海';
        return {
            title: 'Match Echo',
            copy: `要回到首页，再对照“${safeLabel}”这一类海吗？会带你进入「适合自己的海」，继续慢慢排开更接近此刻节奏的蓝。`,
            confirm: '去对照看看',
            cancel: '先留在这里'
        };
    }

    /**
     * createBookingMatchConfirmMarkup() - 生成套餐弹层里的匹配确认舱。
     * @param {string} packageId - 当前套餐 ID
     * @returns {string}
     */
    createBookingMatchConfirmMarkup(packageId) {
        const state = this.getBookingMatchConfirmationState();
        if (!state || state.source !== 'modal' || state.packageId !== packageId) {
            return '';
        }

        const copy = this.buildBookingMatchConfirmationCopy(state.label);
        const phaseClass = state.phase === 'closing' ? ' is-closing' : ' is-active';
        return `
            <section class="booking-match-confirm${phaseClass}" data-booking-match-confirm-source="modal" aria-live="polite">
                <p class="booking-match-confirm-heading">${escapeHtml(copy.title)}</p>
                <p class="booking-match-confirm-copy">${escapeHtml(copy.copy)}</p>
                <div class="booking-match-confirm-actions">
                    <button
                        type="button"
                        class="booking-match-confirm-secondary"
                        data-booking-match-confirm-action="cancel"
                    >
                        ${escapeHtml(copy.cancel)}
                    </button>
                    <button
                        type="button"
                        class="booking-match-confirm-primary"
                        data-booking-match-confirm-action="confirm"
                    >
                        ${escapeHtml(copy.confirm)}
                    </button>
                </div>
            </section>
        `;
    }

    /**
     * findBookingMatchTrigger() - 根据来源和 matchKey 找回最合适的触发标签。
     * @param {'modal'|'sidebar'} source - 来源语境
     * @param {string} matchKey - 匹配键
     * @returns {HTMLElement|null}
     */
    findBookingMatchTrigger(source, matchKey) {
        const containers = source === 'modal'
            ? [this.bookingModal]
            : [this.packageMatchTags];

        for (const container of containers) {
            if (!container) {
                continue;
            }

            const trigger = Array.from(container.querySelectorAll('.booking-match-link[data-match-key]'))
                .find((element) => element.dataset.matchKey === matchKey);
            if (trigger instanceof HTMLElement) {
                return trigger;
            }
        }

        return null;
    }

    /**
     * restoreBookingMatchTriggerFocus() - 在确认层关闭后把焦点送回原来的标签。
     * @param {Object|null} state - 关闭前的确认状态
     * @returns {void}
     */
    restoreBookingMatchTriggerFocus(state) {
        if (!state) {
            return;
        }

        const trigger = this.findBookingMatchTrigger(state.source, state.matchKey);
        trigger?.focus?.();
    }

    /**
     * focusBookingMatchConfirmationPrimary() - 把焦点送到当前确认层的主按钮。
     * @param {'modal'|'sidebar'} source - 当前确认层来源
     * @returns {void}
     */
    focusBookingMatchConfirmationPrimary(source) {
        if (this.bookingMatchConfirmFocusRaf) {
            window.cancelAnimationFrame(this.bookingMatchConfirmFocusRaf);
            this.bookingMatchConfirmFocusRaf = 0;
        }

        this.bookingMatchConfirmFocusRaf = window.requestAnimationFrame(() => {
            this.bookingMatchConfirmFocusRaf = 0;
            const primaryButton = source === 'modal'
                ? this.bookingModal?.querySelector('.booking-match-confirm-primary')
                : this.bookingMatchFloatingRoot?.querySelector('[data-booking-match-confirm-action="confirm"]');
            primaryButton?.focus?.();
        });
    }

    /**
     * clearBookingMatchConfirmationTimers() - 清理确认层开关与导航延时。
     * @returns {void}
     */
    clearBookingMatchConfirmationTimers() {
        if (this.bookingMatchConfirmCloseTimer) {
            window.clearTimeout(this.bookingMatchConfirmCloseTimer);
            this.bookingMatchConfirmCloseTimer = 0;
        }

        if (this.bookingMatchNavigationTimer) {
            window.clearTimeout(this.bookingMatchNavigationTimer);
            this.bookingMatchNavigationTimer = 0;
        }

        if (this.bookingMatchConfirmFocusRaf) {
            window.cancelAnimationFrame(this.bookingMatchConfirmFocusRaf);
            this.bookingMatchConfirmFocusRaf = 0;
        }
    }

    /**
     * clearBookingMatchConfirmationImmediately() - 立即清空确认层状态，不播放关闭动画。
     * @param {{ restoreFocus?: boolean, state?: Object|null, rerenderModal?: boolean }} [options={}] - 清理选项
     * @returns {void}
     */
    clearBookingMatchConfirmationImmediately(options = {}) {
        const {
            restoreFocus = false,
            state = this.getBookingMatchConfirmationState(),
            rerenderModal = false
        } = options;
        this.clearBookingMatchConfirmationTimers();

        if (!state) {
            if (this.bookingMatchFloatingRoot) {
                this.bookingMatchFloatingRoot.innerHTML = '';
                this.bookingMatchFloatingRoot.setAttribute('aria-hidden', 'true');
            }
            return;
        }
        this.bookingMatchConfirmState = null;

        if (this.bookingMatchFloatingRoot) {
            this.bookingMatchFloatingRoot.innerHTML = '';
            this.bookingMatchFloatingRoot.setAttribute('aria-hidden', 'true');
        }

        if (
            rerenderModal &&
            state.source === 'modal' &&
            this.bookingModal?.classList.contains('active') &&
            !this.bookingModal.classList.contains('is-navigating-away')
        ) {
            this.renderBookingModalMarkup(state.packageId || this.selectedPackageId, {
                preserveBodyScroll: true
            });
        }

        if (restoreFocus) {
            window.requestAnimationFrame(() => {
                this.restoreBookingMatchTriggerFocus(state);
            });
        }
    }

    /**
     * buildBookingMatchFloatingConfirmMarkup() - 生成右侧标签贴边确认浮片。
     * @param {Object} state - 当前确认状态
     * @returns {string}
     */
    buildBookingMatchFloatingConfirmMarkup(state) {
        const copy = this.buildBookingMatchConfirmationCopy(state.label);
        const phaseClass = state.phase === 'closing'
            ? ' is-closing'
            : (state.phase === 'open' ? ' is-active' : '');
        return `
            <section
                class="booking-match-floating-confirm${phaseClass}"
                data-placement="${escapeHtml(state.placement || 'bottom')}"
                role="dialog"
                aria-live="polite"
            >
                <p class="booking-match-floating-title">${escapeHtml(copy.title)}</p>
                <p>${escapeHtml(copy.copy)}</p>
                <div class="booking-match-floating-actions">
                    <button type="button" data-booking-match-confirm-action="cancel">
                        ${escapeHtml(copy.cancel)}
                    </button>
                    <button type="button" data-booking-match-confirm-action="confirm">
                        ${escapeHtml(copy.confirm)}
                    </button>
                </div>
            </section>
        `;
    }

    /**
     * renderBookingMatchFloatingConfirm() - 把侧栏贴边确认浮片挂到页面高层。
     * @returns {void}
     */
    renderBookingMatchFloatingConfirm() {
        const state = this.getBookingMatchConfirmationState();
        if (!this.bookingMatchFloatingRoot || !state || state.source !== 'sidebar') {
            return;
        }

        const root = this.bookingMatchFloatingRoot;
        root.innerHTML = this.buildBookingMatchFloatingConfirmMarkup(state);
        root.setAttribute('aria-hidden', 'false');

        const panel = root.querySelector('.booking-match-floating-confirm');
        if (!(panel instanceof HTMLElement)) {
            return;
        }

        const trigger = this.findBookingMatchTrigger('sidebar', state.matchKey);
        const rect = trigger?.getBoundingClientRect?.() || state.anchorRect;
        const viewportPadding = 16;
        const offset = 16;
        const panelRect = panel.getBoundingClientRect();
        const nextPlacement = rect && (rect.bottom + offset + panelRect.height > (window.innerHeight - viewportPadding))
            ? 'top'
            : 'bottom';
        const left = rect
            ? Math.max(
                viewportPadding,
                Math.min(
                    rect.left + ((rect.width - panelRect.width) / 2),
                    window.innerWidth - panelRect.width - viewportPadding
                )
            )
            : (window.innerWidth - panelRect.width - viewportPadding);
        const top = rect
            ? (nextPlacement === 'top'
                ? Math.max(viewportPadding, rect.top - panelRect.height - offset)
                : Math.min(window.innerHeight - panelRect.height - viewportPadding, rect.bottom + offset))
            : viewportPadding;

        panel.dataset.placement = nextPlacement;
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
    }

    /**
     * playBookingMatchConfirmationClosingMotion() - 在现有确认层 DOM 上触发关闭动画，避免重渲染瞬切。
     * @param {{ source: 'modal'|'sidebar' }} state - 当前确认状态
     * @returns {boolean}
     */
    playBookingMatchConfirmationClosingMotion(state) {
        const panel = state?.source === 'modal'
            ? this.bookingModal?.querySelector('.booking-match-confirm[data-booking-match-confirm-source="modal"]')
            : this.bookingMatchFloatingRoot?.querySelector('.booking-match-floating-confirm');

        if (!(panel instanceof HTMLElement)) {
            return false;
        }

        panel.classList.remove('is-active');
        panel.classList.add('is-closing');
        panel.setAttribute('aria-hidden', 'true');
        return true;
    }

    /**
     * openBookingMatchConfirmation() - 打开能力匹配标签的二次确认。
     * @param {string} matchKey - 首页匹配键
     * @param {{ source: 'modal'|'sidebar', triggerElement?: HTMLElement|null, label?: string, packageId?: string }} options - 打开配置
     * @returns {void}
     */
    openBookingMatchConfirmation(matchKey, options = {}) {
        if (!matchKey) {
            return;
        }

        const source = options.source === 'modal' ? 'modal' : 'sidebar';
        const label = (options.label || options.triggerElement?.textContent || '').trim() || '这类海';
        const packageId = source === 'modal'
            ? (options.packageId || this.selectedPackageId || this.getActiveBookingModalPackageId())
            : '';

        this.clearBookingMatchConfirmationImmediately({ restoreFocus: false });

        this.bookingMatchConfirmState = {
            source,
            phase: 'open',
            matchKey,
            url: buildHomeDiveMatchUrl(matchKey),
            label,
            packageId,
            anchorRect: source === 'sidebar' ? options.triggerElement?.getBoundingClientRect?.() || null : null
        };

        if (source === 'modal') {
            this.renderBookingModalMarkup(packageId, {
                preserveBodyScroll: true
            });
            this.focusBookingMatchConfirmationPrimary('modal');
            return;
        }

        this.renderBookingMatchFloatingConfirm();
        window.requestAnimationFrame(() => {
            this.renderBookingMatchFloatingConfirm();
            this.focusBookingMatchConfirmationPrimary('sidebar');
        });
    }

    /**
     * closeBookingMatchConfirmation() - 关闭当前能力匹配确认层。
     * @param {{ immediate?: boolean, restoreFocus?: boolean, source?: 'modal'|'sidebar'|'' }} [options={}] - 关闭选项
     * @returns {void}
     */
    closeBookingMatchConfirmation(options = {}) {
        const {
            immediate = false,
            restoreFocus = true,
            source = ''
        } = options;
        const state = this.getBookingMatchConfirmationState();
        if (!state || (source && state.source !== source)) {
            return;
        }

        if (immediate) {
            this.clearBookingMatchConfirmationImmediately({
                restoreFocus,
                state
            });
            return;
        }

        this.clearBookingMatchConfirmationTimers();
        const closingState = { ...state, phase: 'closing' };
        this.bookingMatchConfirmState = closingState;
        const isClosingMotionPlaying = this.playBookingMatchConfirmationClosingMotion(closingState);

        if (!isClosingMotionPlaying) {
            if (closingState.source === 'modal') {
                this.renderBookingModalMarkup(closingState.packageId || this.selectedPackageId, {
                    preserveBodyScroll: true
                });
            } else {
                this.renderBookingMatchFloatingConfirm();
            }
        }

        this.bookingMatchConfirmCloseTimer = window.setTimeout(() => {
            this.clearBookingMatchConfirmationImmediately({
                restoreFocus,
                state: closingState,
                rerenderModal: closingState.source === 'modal'
            });
        }, BOOKING_MATCH_CONFIRM_CLOSE_DURATION);
    }

    /**
     * handleBookingMatchConfirmationAction() - 响应确认层里的继续/取消动作。
     * @param {'confirm'|'cancel'} action - 用户动作
     * @returns {void}
     */
    handleBookingMatchConfirmationAction(action) {
        const state = this.getBookingMatchConfirmationState();
        if (!state) {
            return;
        }

        if (action !== 'confirm') {
            this.closeBookingMatchConfirmation({
                restoreFocus: true
            });
            return;
        }

        const targetUrl = state.url;
        this.clearBookingMatchConfirmationImmediately({
            restoreFocus: false,
            state
        });

        if (state.source === 'modal' && this.bookingModal?.classList.contains('active')) {
            this.startBookingModalNavigateAway(targetUrl);
            return;
        }

        navigateWithDepth(targetUrl);
    }

    /**
     * resetBookingModalNavigateAwayState() - 清理套餐弹层外跳中的过渡状态。
     * @returns {void}
     */
    resetBookingModalNavigateAwayState() {
        this.bookingModalNavigationAway = false;
        this.clearBookingModalSourceRevealTimer();
        this.clearBookingFocusPanelReturnMotion();

        if (this.bookingMatchNavigationTimer) {
            window.clearTimeout(this.bookingMatchNavigationTimer);
            this.bookingMatchNavigationTimer = 0;
        }

        this.bookingModal?.classList.remove('is-navigating-away', 'is-returning-to-focus-panel');
    }

    /**
     * startBookingModalNavigateAway() - 在跳出 detail 前先把套餐弹层轻轻收住。
     * @param {string} targetUrl - 即将跳转的目标地址
     * @returns {void}
     */
    startBookingModalNavigateAway(targetUrl) {
        if (!targetUrl) {
            return;
        }

        if (!this.bookingModal || !this.bookingModal.classList.contains('active')) {
            navigateWithDepth(targetUrl);
            return;
        }

        this.clearBookingMatchConfirmationTimers();
        this.resetBookingModalNavigateAwayState();
        this.clearBookingModalMorph();
        this.bookingModalNavigationAway = true;
        this.bookingModal.classList.remove('is-closing');
        this.bookingModal.classList.add('is-navigating-away', 'active');
        this.bookingModal.setAttribute('aria-hidden', 'false');
        this.syncOverlayLock();

        this.bookingMatchNavigationTimer = window.setTimeout(() => {
            this.bookingMatchNavigationTimer = 0;
            navigateWithDepth(targetUrl);
        }, 260);
    }

    /**
     * teardownBookingModalForPageExit() - 在跨页切走前清理套餐弹层和匹配确认层残留。
     * @returns {void}
     */
    teardownBookingModalForPageExit() {
        this.clearBookingMatchConfirmationImmediately({
            restoreFocus: false
        });
        this.resetBookingModalNavigateAwayState();

        if (this.bookingModalCloseTimer) {
            window.clearTimeout(this.bookingModalCloseTimer);
            this.bookingModalCloseTimer = 0;
        }
        this.clearBookingModalSourceRevealTimer();
        if (this.packageModalEditorCloseTimer) {
            window.clearTimeout(this.packageModalEditorCloseTimer);
            this.packageModalEditorCloseTimer = 0;
        }

        this.packageModalEditorTransitioning = false;
        this.cancelPackageModalEditorStateMotion();
        this.clearBookingModalMorph();

        if (this.bookingModal) {
            this.bookingModal.classList.remove('active', 'is-closing', 'is-navigating-away');
            this.bookingModal.setAttribute('aria-hidden', 'true');
        }

        this.syncOverlayLock();
    }

    /**
     * createPackageModalMarkup(pkg) - 生成套餐详情弹层的 HTML 内容
     * @param {Object} pkg - 当前套餐数据对象
     * @returns {string} - 套餐弹层 HTML 字符串
     */
    createPackageModalMarkup(pkg) {
        const isBooked = this.bookedPackageIds.has(pkg.id);
        const modalState = this.getPackageModalViewState(pkg);
        const cadenceStayCopy = this.getPackageCadenceStayCopy(pkg);
        const focusCopy = this.getPackageFocusCopy(pkg);
        const rhythmTags = buildPackageRhythmTags({
            ...pkg,
            duration: modalState?.durationLabel || pkg.duration
        });
        const durationOptions = modalState?.durationOptions || [];
        const windowOptions = modalState?.windowOptions || [];
        const peopleOptions = modalState?.peopleOptions || [];
        const matchTags = Array.from(new Set([
            ...(Array.isArray(pkg.fitTags) ? pkg.fitTags : []),
            pkg.audience
        ].filter(Boolean)));
        const priceEditorState = modalState?.editorState || 'closed';
        const priceCustomState = modalState?.isCustomized ? 'customized' : 'default';
        const priceLayoutState = modalState?.isEditorOpen ? 'expanded' : 'compact';
        const priceToggleState = modalState?.isEditorOpen ? 'open' : 'closed';
        const priceToggleAriaLabel = modalState?.isEditorOpen
            ? '收住这一下，关闭节奏调整面板'
            : '改一改节奏，打开节奏调整面板';
        const sanitizedPackageId = String(pkg.id || 'package').replace(/[^a-zA-Z0-9_-]/g, '');
        const priceEditorId = `packageModalPriceEditor-${sanitizedPackageId || 'current'}`;
        const priceSummaryFootnote = focusCopy || '';
        const priceSummaryItems = [
            {
                key: 'duration',
                label: '停留',
                miniValue: modalState?.durationLabel || pkg.duration,
                summaryValue: modalState?.durationLabel || pkg.duration,
                routeValue: modalState?.durationLabel || pkg.duration,
                sentenceValue: `停留 ${modalState?.durationLabel || pkg.duration}`,
                tone: modalState?.durationTone || 'base'
            },
            {
                key: 'window',
                label: '时段',
                miniValue: this.getPackageModalMiniWindowLabel(modalState?.windowKey),
                summaryValue: modalState?.windowLabel || '时段待定',
                routeValue: modalState?.windowLabel || '时段待定',
                sentenceValue: `${modalState?.windowLabel || '时段待定'}入海`,
                tone: modalState?.windowTone || 'base'
            },
            {
                key: 'people',
                label: '同行',
                miniValue: this.formatPackageModalMiniPeopleLabel(modalState?.peopleValue),
                summaryValue: modalState?.peopleLabel || '同行待回声',
                routeValue: modalState?.peopleLabel || '待回声',
                sentenceValue: modalState?.peopleLabel ? `同行 ${modalState.peopleLabel}` : '同行待回声',
                tone: modalState?.peopleTone || 'empty'
            }
        ];
        const summarySentence = `这一程先${priceSummaryItems.map((item) => item.sentenceValue).join('，')}。`;
        const routeEchoRouteLabel = [pkg?.group, pkg?.name].filter(Boolean).join(' · ') || '当前这片海';
        const routeEchoNote = modalState?.windowHint || focusCopy || '这程先安静收住，下面再继续把细节往下排。';
        const routeEchoTail = modalState?.peopleLabel
            ? `这一程先按 ${modalState.peopleLabel} 的同行节奏留存。`
            : '同行待回声也没关系，先把停留和入海时段稳稳收住。';

        let layoutOrder = 0;
        const nextLayoutOrder = () => layoutOrder++;
        const matchOrder = nextLayoutOrder();
        const highlightsOrder = nextLayoutOrder();
        const fitReasonOrder = nextLayoutOrder();
        const reentryOrder = pkg.reentryNote ? nextLayoutOrder() : null;
        const scheduleOrder = nextLayoutOrder();
        const includesOrder = nextLayoutOrder();
        const excludesOrder = nextLayoutOrder();
        const lodgingOrder = nextLayoutOrder();
        const diningOrder = nextLayoutOrder();
        const paceOrder = nextLayoutOrder();
        const riskOrder = nextLayoutOrder();
        const actionsOrder = nextLayoutOrder();

        return `
            <div class="package-modal-shell">
                <header class="package-modal-head">
                    <div class="package-modal-archive">
                        <div class="package-modal-head-copy">
                            <div class="package-modal-overline">
                                ${isBooked ? '<span class="package-modal-state">已收进行程</span>' : ''}
                                <p class="package-modal-kicker">${escapeHtml(pkg.group)}</p>
                            </div>
                            <h2 class="package-modal-title">${escapeHtml(pkg.name)}</h2>
                            <p class="package-modal-subtitle">${escapeHtml(pkg.mood)}</p>
                        </div>

                        <div class="package-modal-rhythm">
                            ${rhythmTags.map((tag) => createPackagePlateMarkup(escapeHtml(tag), 'rhythm')).join('')}
                        </div>

                        <div
                            class="package-modal-signal ${modalState?.isEditorOpen ? 'is-editor-open' : 'is-editor-closed'}"
                            data-package-signal-state="${escapeHtml(priceLayoutState)}"
                        >
                            <section
                                class="package-modal-price ${modalState?.isEditorOpen ? 'is-editor-open' : 'is-editor-closed'} ${modalState?.isCustomized ? 'is-customized' : 'is-pristine'}"
                                data-package-price-editor-state="${escapeHtml(priceEditorState)}"
                                data-package-price-custom-state="${escapeHtml(priceCustomState)}"
                                data-package-price-layout="${escapeHtml(priceLayoutState)}"
                            >
                                <div class="package-modal-price-layout" data-package-price-layout-frame="${escapeHtml(priceLayoutState)}">
                                    <div class="package-modal-price-main" data-package-price-column="main">
                                        <div class="package-modal-price-core" data-package-price-fragment="core">
                                            <div class="package-modal-price-copy">
                                                <span class="package-modal-price-label">这一程起于</span>
                                                <strong class="package-modal-price-amount">${escapeHtml(modalState?.priceLabel || pkg.price)}</strong>
                                                <p class="package-modal-price-note package-modal-extra-fragment" style="--package-modal-extra-order: 0" data-package-price-fragment="note">${escapeHtml(modalState?.priceHint || '')}</p>
                                            </div>
                                            <button
                                                type="button"
                                                class="package-modal-price-toggle package-modal-extra-fragment"
                                                style="--package-modal-extra-order: 1"
                                                data-package-price-editor-toggle="${escapeHtml(pkg.id)}"
                                                data-package-price-toggle-state="${escapeHtml(priceToggleState)}"
                                                aria-expanded="${String(Boolean(modalState?.isEditorOpen))}"
                                                aria-label="${escapeHtml(priceToggleAriaLabel)}"
                                                aria-controls="${escapeHtml(priceEditorId)}"
                                            >
                                                <span class="package-modal-price-toggle-shell">
                                                    <span
                                                        class="package-modal-price-toggle-label"
                                                        data-package-price-toggle-label="closed"
                                                        aria-hidden="true"
                                                    >改一改节奏</span>
                                                    <span
                                                        class="package-modal-price-toggle-label"
                                                        data-package-price-toggle-label="open"
                                                        aria-hidden="true"
                                                    >先收住这一下</span>
                                                    <span
                                                        class="package-modal-price-toggle-rail"
                                                        data-package-price-toggle-rail
                                                        data-package-price-toggle-rail-state="${escapeHtml(priceToggleState)}"
                                                        aria-hidden="true"
                                                    ></span>
                                                </span>
                                            </button>
                                        </div>

                                        <div
                                            class="package-modal-price-mini-summary package-modal-extra-fragment"
                                            style="--package-modal-extra-order: 2"
                                            data-package-price-fragment="mini-summary"
                                        >
                                            ${priceSummaryItems.map((item) => `
                                                <button
                                                    type="button"
                                                    class="package-modal-price-mini-chip is-${escapeHtml(item.tone)}"
                                                    data-package-editor-focus="${escapeHtml(item.key)}"
                                                    data-package-id="${escapeHtml(pkg.id)}"
                                                    data-package-mini-summary-item="${escapeHtml(item.key)}"
                                                    data-summary-tone="${escapeHtml(item.tone)}"
                                                    aria-label="调整${escapeHtml(item.label)}，当前为${escapeHtml(item.miniValue)}"
                                                >
                                                    <span class="package-modal-price-mini-label">${escapeHtml(item.label)}</span>
                                                    <strong class="package-modal-price-mini-value">${escapeHtml(item.miniValue)}</strong>
                                                </button>
                                            `).join('')}
                                        </div>

                                        <div
                                            id="${escapeHtml(priceEditorId)}"
                                            class="package-modal-price-editor package-modal-extra-fragment package-modal-editor-layer ${modalState?.isEditorOpen ? 'is-open' : 'is-closed'}"
                                            style="--package-modal-extra-order: 3"
                                            aria-hidden="${String(!modalState?.isEditorOpen)}"
                                            data-package-price-editor-state="${escapeHtml(priceEditorState)}"
                                            data-package-price-editor="${escapeHtml(pkg.id)}"
                                        >
                                            <div class="package-modal-price-editor-track" data-package-price-editor-track>
                                                <div class="package-modal-option-group package-modal-editor-fragment ${modalState?.focusField === 'duration' ? 'is-focus-target' : ''}" style="--package-modal-editor-order: 0" data-package-editor-fragment="duration">
                                        <span class="package-modal-option-label">停留天数</span>
                                        <div class="package-modal-option-list">
                                            ${durationOptions.map((option) => `
                                                <button
                                                    type="button"
                                                    class="package-modal-option ${option.label === modalState?.durationLabel ? 'is-selected' : ''}"
                                                    data-package-duration-days="${option.days}"
                                                    data-package-id="${escapeHtml(pkg.id)}"
                                                    aria-pressed="${String(option.label === modalState?.durationLabel)}"
                                                >
                                                    ${escapeHtml(option.label)}
                                                </button>
                                            `).join('')}
                                            <button
                                                type="button"
                                                class="package-modal-option ${(modalState?.isCustomDurationOpen || modalState?.isCustomDurationSelected) ? 'is-selected' : ''}"
                                                data-package-custom-duration-toggle="${escapeHtml(pkg.id)}"
                                                aria-pressed="${String(Boolean(modalState?.isCustomDurationOpen || modalState?.isCustomDurationSelected))}"
                                            >
                                                自定义
                                            </button>
                                        </div>
                                        ${modalState?.isCustomDurationOpen ? `
                                            <div class="package-modal-custom-duration package-modal-editor-subfragment" data-package-editor-subfragment="duration-custom">
                                                <div class="package-modal-custom-duration-copy">
                                                    <span class="package-modal-custom-duration-kicker">把停留写进这一层</span>
                                                    <p class="package-modal-custom-duration-note">天数支持 ${PACKAGE_MODAL_DURATION_MIN_DAYS} 到 ${modalState?.customDurationMaxDays || PACKAGE_MODAL_CUSTOM_DURATION_MAX_DAYS} 天，价格会先按当前海流轻轻估算。</p>
                                                </div>
                                                <div class="package-modal-custom-duration-controls">
                                                    <label class="package-modal-custom-duration-field">
                                                        <input
                                                            type="number"
                                                            min="${PACKAGE_MODAL_DURATION_MIN_DAYS}"
                                                            max="${modalState?.customDurationMaxDays || PACKAGE_MODAL_CUSTOM_DURATION_MAX_DAYS}"
                                                            step="1"
                                                            value="${escapeHtml(String(modalState?.customDurationValue || modalState?.selectedDays || ''))}"
                                                            inputmode="numeric"
                                                            aria-label="自定义停留天数"
                                                            data-package-custom-duration-input
                                                            data-package-id="${escapeHtml(pkg.id)}"
                                                        >
                                                        <span>天</span>
                                                    </label>
                                                    <button
                                                        type="button"
                                                        class="package-modal-custom-duration-apply"
                                                        data-package-custom-duration-apply="${escapeHtml(pkg.id)}"
                                                    >
                                                        带入这一程
                                                    </button>
                                                </div>
                                            </div>
                                        ` : ''}
                                    </div>

                                    <div class="package-modal-option-group package-modal-editor-fragment ${modalState?.focusField === 'window' ? 'is-focus-target' : ''}" style="--package-modal-editor-order: 1" data-package-editor-fragment="window">
                                        <span class="package-modal-option-label">入海时段</span>
                                        <div class="package-modal-option-list">
                                            ${windowOptions.map((option) => `
                                                <button
                                                    type="button"
                                                    class="package-modal-option ${option.key === modalState?.windowKey ? 'is-selected' : ''}"
                                                    data-package-window-key="${escapeHtml(option.key)}"
                                                    data-package-id="${escapeHtml(pkg.id)}"
                                                    aria-pressed="${String(option.key === modalState?.windowKey)}"
                                                >
                                                    ${escapeHtml(option.label)}
                                                </button>
                                            `).join('')}
                                        </div>
                                    </div>

                                    <div class="package-modal-option-group package-modal-editor-fragment ${modalState?.focusField === 'people' ? 'is-focus-target' : ''}" style="--package-modal-editor-order: 2" data-package-editor-fragment="people">
                                        <span class="package-modal-option-label">同行人数</span>
                                        <div class="package-modal-option-list">
                                            ${peopleOptions.map((option) => `
                                                <button
                                                    type="button"
                                                    class="package-modal-option ${option.value === modalState?.peopleValue ? 'is-selected' : ''}"
                                                    data-package-people-value="${escapeHtml(option.value)}"
                                                    data-package-id="${escapeHtml(pkg.id)}"
                                                    aria-pressed="${String(option.value === modalState?.peopleValue)}"
                                                >
                                                    ${escapeHtml(option.label)}
                                                </button>
                                            `).join('')}
                                            <button
                                                type="button"
                                                class="package-modal-option ${(modalState?.isCustomPeopleOpen || modalState?.isCustomPeopleSelected) ? 'is-selected' : ''}"
                                                data-package-custom-people-toggle="${escapeHtml(pkg.id)}"
                                                aria-pressed="${String(Boolean(modalState?.isCustomPeopleOpen || modalState?.isCustomPeopleSelected))}"
                                            >
                                                自定义
                                            </button>
                                        </div>
                                        ${modalState?.isCustomPeopleOpen ? `
                                            <div class="package-modal-custom-duration package-modal-custom-people package-modal-editor-subfragment" data-package-editor-subfragment="people-custom">
                                                <div class="package-modal-custom-duration-copy">
                                                    <span class="package-modal-custom-duration-kicker">把同行写进这一层</span>
                                                    <p class="package-modal-custom-duration-note">可以输入精确人数，比如 4、8 或 12。确认后会一起带到“我的行程”。</p>
                                                </div>
                                                <div class="package-modal-custom-duration-controls">
                                                    <label class="package-modal-custom-duration-field">
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="99"
                                                            step="1"
                                                            value="${escapeHtml(String(modalState?.customPeopleInputValue || ''))}"
                                                            inputmode="numeric"
                                                            aria-label="自定义同行人数"
                                                            data-package-custom-people-input
                                                            data-package-id="${escapeHtml(pkg.id)}"
                                                        >
                                                        <span>人</span>
                                                    </label>
                                                    <button
                                                        type="button"
                                                        class="package-modal-custom-duration-apply"
                                                        data-package-custom-people-apply="${escapeHtml(pkg.id)}"
                                                    >
                                                        带入同行
                                                    </button>
                                                </div>
                                            </div>
                                        ` : ''}
                                        <p class="package-modal-price-support package-modal-editor-subfragment" data-package-editor-subfragment="people-hint">
                                            ${escapeHtml(modalState?.peopleHint || '如果同行节奏已经确定，也可以在这里先写进这一程。')}
                                        </p>
                                    </div>

                                    <p class="package-modal-price-support package-modal-editor-fragment" style="--package-modal-editor-order: 3" data-package-editor-fragment="support">
                                        ${escapeHtml(modalState?.windowHint || '确认之后，也还能继续把这片海的节奏慢慢往下调。')}
                                    </p>
                                </div>
                                            </div>
                                        </div>
                                    </div>
                            </section>

                            <div class="package-modal-signal-aside" data-package-signal-column="aside">
                                <aside
                                    class="package-modal-price-summary package-modal-extra-fragment"
                                    style="--package-modal-extra-order: 0"
                                    data-package-price-column="summary"
                                    data-package-price-summary-state="${escapeHtml(priceCustomState)}"
                                    data-package-price-editor-state="${escapeHtml(priceEditorState)}"
                                    aria-live="polite"
                                >
                                    <p class="package-modal-price-summary-kicker" data-package-summary-fragment="kicker">当前收束</p>
                                    <ul class="package-modal-price-summary-list" data-package-summary-fragment="list">
                                        ${priceSummaryItems.map((item) => `
                                            <li
                                                class="package-modal-price-summary-item is-${escapeHtml(item.tone)}"
                                                data-package-summary-item="${escapeHtml(item.key)}"
                                                data-summary-tone="${escapeHtml(item.tone)}"
                                            >
                                                <span class="package-modal-price-summary-label">${escapeHtml(item.label)}</span>
                                                <strong class="package-modal-price-summary-value">${escapeHtml(item.summaryValue)}</strong>
                                            </li>
                                        `).join('')}
                                    </ul>
                                    <p class="package-modal-price-summary-note" data-package-summary-fragment="note">
                                        ${escapeHtml(summarySentence)}
                                    </p>
                                    ${priceSummaryFootnote ? `
                                        <div class="package-modal-price-summary-footnote" data-package-summary-fragment="footnote">
                                            <span class="package-modal-slip-meta">潮汐注记</span>
                                            <p class="package-modal-slip-text">${escapeHtml(priceSummaryFootnote)}</p>
                                        </div>
                                    ` : ''}
                                </aside>

                                <section
                                    class="package-modal-summary-block package-modal-route-echo package-modal-extra-fragment"
                                    style="--package-modal-extra-order: 1"
                                    data-package-route-echo-state="${escapeHtml(priceCustomState)}"
                                    aria-live="polite"
                                >
                                    <span class="package-modal-summary-label package-modal-route-echo-label">Route Echo</span>
                                    <p class="package-modal-route-echo-route">${escapeHtml(routeEchoRouteLabel)}</p>
                                    <p class="package-modal-route-echo-note">${escapeHtml(routeEchoNote)}</p>
                                    <div class="package-modal-route-echo-chips">
                                        ${priceSummaryItems.map((item) => `
                                            <span
                                                class="package-modal-route-echo-chip is-${escapeHtml(item.tone)}"
                                                data-package-route-echo-chip="${escapeHtml(item.key)}"
                                                data-summary-tone="${escapeHtml(item.tone)}"
                                            >
                                                <span class="package-modal-route-echo-chip-label">${escapeHtml(item.label)}</span>
                                                <strong class="package-modal-route-echo-chip-value">${escapeHtml(item.routeValue)}</strong>
                                            </span>
                                        `).join('')}
                                    </div>
                                    <div class="package-modal-route-echo-tail">
                                        <span class="package-modal-slip-meta">回响尾流</span>
                                        <p class="package-modal-slip-text">${escapeHtml(routeEchoTail)}</p>
                                    </div>
                                </section>

                                <section class="package-modal-summary-block package-modal-journey package-modal-extra-fragment" style="--package-modal-extra-order: 2">
                                    <span class="package-modal-summary-label package-modal-journey-label">进入方式</span>
                                    <p class="package-modal-journey-primary">${escapeHtml(pkg.diveSummary)}</p>
                                    <div class="package-modal-journey-secondary">
                                        <span class="package-modal-slip-meta">停驻余韵</span>
                                        <p class="package-modal-slip-text" title="${escapeHtml(cadenceStayCopy)}">${escapeHtml(cadenceStayCopy)}</p>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>
                </header>

                <div class="package-modal-match package-modal-motion" style="--package-modal-enter-order: ${matchOrder}">
                    ${matchTags.map((tag) => createBookingMatchChipMarkup(tag)).join('')}
                </div>
                ${this.createBookingMatchConfirmMarkup(pkg.id)}

                <div class="package-modal-body">
                    <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${highlightsOrder}">
                        <h3>套餐亮点</h3>
                        <ul>
                            ${pkg.highlights.map((highlight) => `<li>${highlight}</li>`).join('')}
                        </ul>
                    </section>

                    <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${fitReasonOrder}">
                        <h3>为什么适合这片海</h3>
                        <p>${pkg.fitReason}</p>
                    </section>

                    ${pkg.reentryNote ? `
                    <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${reentryOrder}">
                        <h3>半年未潜水时</h3>
                        <p>${pkg.reentryNote}</p>
                    </section>
                    ` : ''}

                    <section class="package-modal-section is-full package-modal-motion" style="--package-modal-enter-order: ${scheduleOrder}">
                        <h3>每日安排</h3>
                        <div class="package-modal-schedule">
                            ${pkg.schedule.map((item) => `
                                <div class="package-modal-day">
                                    <strong>${item.day}</strong>
                                    <span>${item.text}</span>
                                </div>
                            `).join('')}
                        </div>
                    </section>

                    <div class="package-modal-grid">
                        <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${includesOrder}">
                            <h3>包含内容</h3>
                            <ul>
                                ${pkg.includes.map((item) => `<li>${item}</li>`).join('')}
                            </ul>
                        </section>

                        <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${excludesOrder}">
                            <h3>不包含内容</h3>
                            <ul>
                                ${pkg.excludes.map((item) => `<li>${item}</li>`).join('')}
                            </ul>
                        </section>

                        <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${lodgingOrder}">
                            <h3>住宿说明</h3>
                            <p>${pkg.lodging}</p>
                        </section>

                        <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${diningOrder}">
                            <h3>餐饮说明</h3>
                            <p>${pkg.dining}</p>
                        </section>

                        <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${paceOrder}">
                            <h3>潜水节奏说明</h3>
                            <p>${pkg.pace}</p>
                        </section>

                        <section class="package-modal-section package-modal-motion" style="--package-modal-enter-order: ${riskOrder}">
                            <h3>能力与风险提示</h3>
                            <p><strong>适合人群：</strong>${pkg.audience}</p>
                            <p>${pkg.risk}</p>
                        </section>
                    </div>
                </div>

                <div class="package-modal-actions package-modal-motion" style="--package-modal-enter-order: ${actionsOrder}">
                    <button type="button" class="package-modal-secondary">再想想</button>
                    <button type="button" class="package-modal-primary" data-package-id="${pkg.id}">确认预订</button>
                </div>
            </div>
        `;
    }

    /**
     * getPackageSourceCard(packageId, sourceCard) - 找到当前被展开的来源舱体 DOM
     * @param {string} packageId - 套餐 ID
     * @param {HTMLElement|null} sourceCard - 点击来源节点，可能是套餐卡、焦点舱或它们内部按钮
     * @returns {HTMLElement|null} - 对应的套餐卡或焦点舱 DOM
     */
    getPackageSourceCard(packageId, sourceCard = null) {
        if (sourceCard instanceof HTMLElement) {
            if (
                sourceCard.classList.contains('package-card') ||
                sourceCard.classList.contains('booking-focus-panel')
            ) {
                return sourceCard;
            }

            const focusPanel = sourceCard.closest('.booking-focus-panel');
            if (focusPanel) {
                return focusPanel;
            }

            const closestCard = sourceCard.closest('.package-card');
            if (closestCard) {
                return closestCard;
            }
        }

        if (
            this.bookingFocusPanel &&
            this.isBookingFocusOnlyContext() &&
            this.bookingFocusPanel.dataset.packageId === packageId
        ) {
            return this.bookingFocusPanel;
        }

        if (!this.itineraryList) {
            return null;
        }

        return Array.from(this.itineraryList.querySelectorAll('.package-card'))
            .find((card) => card.dataset.packageId === packageId) || null;
    }

    /**
     * getElementVisibleState(element) - 计算元素当前在视口中的真实可见区域
     * @param {HTMLElement|null} element - 目标元素
     * @returns {Object|null} - 包含原始矩形、可见矩形和是否完整可见
     */
    getElementVisibleState(element) {
        if (!(element instanceof HTMLElement)) {
            return null;
        }

        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) {
            return null;
        }

        const navbar = document.querySelector('.navbar');
        const navbarBottom = navbar ? navbar.getBoundingClientRect().bottom : 0;
        const visibleTop = Math.max(rect.top, navbarBottom);
        const visibleLeft = Math.max(rect.left, 0);
        const visibleRight = Math.min(rect.right, window.innerWidth);
        const visibleBottom = Math.min(rect.bottom, window.innerHeight);
        const visibleWidth = Math.max(0, visibleRight - visibleLeft);
        const visibleHeight = Math.max(0, visibleBottom - visibleTop);

        return {
            rect,
            visibleRect: {
                top: visibleTop,
                left: visibleLeft,
                right: visibleRight,
                bottom: visibleBottom,
                width: visibleWidth,
                height: visibleHeight
            },
            isFullyVisible:
                Math.abs(visibleTop - rect.top) < 0.5 &&
                Math.abs(visibleLeft - rect.left) < 0.5 &&
                Math.abs(visibleRight - rect.right) < 0.5 &&
                Math.abs(visibleBottom - rect.bottom) < 0.5
        };
    }

    /**
     * capturePackageSourceState(packageId, sourceCard) - 在列表重渲染前记录来源卡片的几何信息和外观快照
     * @param {string} packageId - 当前展开的套餐 ID
     * @param {HTMLElement|null} sourceCard - 点击来源的套餐卡
     * @returns {Object|null} - 包含矩形信息和 ghost 克隆的快照
     */
    capturePackageSourceState(packageId, sourceCard = null) {
        const originCard = this.getPackageSourceCard(packageId, sourceCard);
        if (!originCard) {
            return null;
        }

        const visibility = this.getElementVisibleState(originCard);
        if (!visibility || visibility.rect.width < 40 || visibility.rect.height < 40) {
            return null;
        }

        const { rect, visibleRect } = visibility;
        const visibleTop = visibleRect.top;
        const visibleLeft = visibleRect.left;
        const visibleRight = visibleRect.right;
        const visibleBottom = visibleRect.bottom;
        const visibleWidth = visibleRect.width;
        const visibleHeight = visibleRect.height;

        if (visibleWidth < 24 || visibleHeight < 24) {
            return null;
        }

        const ghost = originCard.cloneNode(true);
        ghost.classList.add('booking-card-morph-ghost');
        ghost.removeAttribute('tabindex');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.querySelectorAll('button, a, [tabindex]').forEach((node) => {
            node.setAttribute('tabindex', '-1');
        });

        return {
            packageId,
            sourceElement: originCard,
            rect: {
                top: visibleTop,
                left: visibleLeft,
                width: visibleWidth,
                height: visibleHeight
            },
            ghost,
            isFullyVisible: visibility.isFullyVisible,
            sourceClip: {
                top: visibleTop - rect.top,
                right: rect.right - visibleRight,
                bottom: rect.bottom - visibleBottom,
                left: visibleLeft - rect.left
            }
        };
    }

    /**
     * cacheBookingModalSourceSnapshot() - 缓存弹层打开来源的几何快照，供关闭时兜底回收。
     * @param {string} packageId - 套餐 ID
     * @param {Object|null} sourceState - 打开时捕获到的来源状态
     * @returns {void}
     */
    cacheBookingModalSourceSnapshot(packageId, sourceState = null) {
        const persistSnapshot = (rect, isFullyVisible = false) => {
            this.activeBookingSourceSnapshot = {
                packageId,
                rect: {
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height
                },
                isFullyVisible: Boolean(isFullyVisible)
            };
        };
        const sourceRect = sourceState?.rect;
        if (
            sourceRect &&
            Number.isFinite(sourceRect.top) &&
            Number.isFinite(sourceRect.left) &&
            Number.isFinite(sourceRect.width) &&
            Number.isFinite(sourceRect.height) &&
            sourceRect.width >= 24 &&
            sourceRect.height >= 24
        ) {
            persistSnapshot(sourceRect, sourceState?.isFullyVisible);
            return;
        }

        const fallbackTarget = this.getMorphTargetFromElement(
            sourceState?.sourceElement || this.getPackageSourceCard(packageId)
        );
        const fallbackRect = fallbackTarget?.sourceRect;
        if (
            fallbackRect &&
            Number.isFinite(fallbackRect.top) &&
            Number.isFinite(fallbackRect.left) &&
            Number.isFinite(fallbackRect.width) &&
            Number.isFinite(fallbackRect.height) &&
            fallbackRect.width >= 24 &&
            fallbackRect.height >= 24
        ) {
            persistSnapshot(fallbackRect, fallbackTarget?.sourceVisibility?.isFullyVisible);
            return;
        }

        this.activeBookingSourceSnapshot = null;
    }

    /**
     * getActiveBookingModalPackageId() - 读取当前弹层里的套餐 ID。
     * @returns {string} - 当前弹层套餐 ID
     */
    getActiveBookingModalPackageId() {
        const modalPackageId = this.bookingModal
            ?.querySelector('.package-modal[data-package-id]')
            ?.dataset
            ?.packageId;
        return modalPackageId || this.selectedPackageId || this.activeBookingFocusPackageId || '';
    }

    /**
     * getSnapshotRectForPackage() - 把缓存快照转换成可用于关闭回收动画的安全矩形。
     * @param {string} packageId - 当前弹层套餐 ID
     * @returns {Object|null} - 安全矩形或空值
     */
    getSnapshotRectForPackage(packageId) {
        const snapshot = this.activeBookingSourceSnapshot;
        if (!snapshot || !snapshot.rect) {
            return null;
        }

        if (packageId && snapshot.packageId && snapshot.packageId !== packageId) {
            return null;
        }

        const { top, left, width, height } = snapshot.rect;
        if (
            !Number.isFinite(top) ||
            !Number.isFinite(left) ||
            !Number.isFinite(width) ||
            !Number.isFinite(height) ||
            width < 24 ||
            height < 24
        ) {
            return null;
        }

        return { top, left, width, height };
    }

    /**
     * getMorphTargetFromElement() - 从目标元素提取可用于 morph 回收的矩形信息。
     * @param {HTMLElement|null} element - 目标元素
     * @returns {{ sourceRect: Object, sourceElement: HTMLElement, sourceVisibility: Object }|null}
     */
    getMorphTargetFromElement(element) {
        if (!(element instanceof HTMLElement)) {
            return null;
        }

        const visibility = this.getElementVisibleState(element);
        if (!visibility) {
            return null;
        }

        const sourceRect = visibility.isFullyVisible ? visibility.rect : visibility.visibleRect;
        if (!sourceRect || sourceRect.width < 24 || sourceRect.height < 24) {
            return null;
        }

        return {
            sourceRect,
            sourceElement: element,
            sourceVisibility: visibility
        };
    }

    /**
     * resolveBookingModalCloseMorphTarget() - 关闭弹层时优先回收到当前套餐语境，再回退到快照。
     * @param {string} packageId - 当前弹层套餐 ID
     * @returns {{ sourceRect: Object, sourceElement: HTMLElement|null, sourceVisibility: Object|null }|null}
     */
    resolveBookingModalCloseMorphTarget(packageId) {
        const focusOnlyContext = (
            this.bookingSticky?.classList.contains('is-focus-only-context') ||
            this.bookingStickyFocusContextState === 'entering' ||
            this.bookingStickyFocusContextState === 'focus'
        );

        if (focusOnlyContext) {
            const focusPanelTarget = this.getMorphTargetFromElement(this.bookingFocusPanel);
            if (focusPanelTarget) {
                return focusPanelTarget;
            }
        } else {
            const listCardTarget = this.getMorphTargetFromElement(this.getPackageCardById(packageId));
            if (listCardTarget) {
                return listCardTarget;
            }
        }

        const snapshotRect = this.getSnapshotRectForPackage(packageId);
        if (!snapshotRect) {
            return null;
        }

        return {
            sourceRect: snapshotRect,
            sourceElement: null,
            sourceVisibility: this.activeBookingSourceSnapshot
                ? { isFullyVisible: Boolean(this.activeBookingSourceSnapshot.isFullyVisible) }
                : null
        };
    }

    /**
     * clearBookingModalSourceRevealTimer() - 清理套餐弹层关闭时的来源回显定时器。
     * @returns {void}
     */
    clearBookingModalSourceRevealTimer() {
        if (this.bookingModalSourceRevealTimer) {
            window.clearTimeout(this.bookingModalSourceRevealTimer);
            this.bookingModalSourceRevealTimer = 0;
        }
    }

    /**
     * releaseBookingModalSourceVisualState() - 提前释放来源卡片的压暗态，但保留共享元素引用。
     * @param {HTMLElement|null} [sourceElement=this.activeBookingSourceCard] - 要恢复显示的来源节点
     * @returns {void}
     */
    releaseBookingModalSourceVisualState(sourceElement = this.activeBookingSourceCard) {
        sourceElement?.classList.remove('is-originating');
    }

    /**
     * clearBookingModalMorph() - 清理套餐卡到弹层的共享元素过渡状态
     * @param {{ preserveSourceSnapshot?: boolean, preserveFocusReturnMotion?: boolean }} [options={}] - 是否保留打开时缓存的来源快照、是否保留焦点舱回场动画
     * @returns {void} - 无返回值，直接移除 ghost 和临时 class
     */
    clearBookingModalMorph(options = {}) {
        const {
            preserveSourceSnapshot = false,
            preserveFocusReturnMotion = false
        } = options;
        this.clearBookingModalSourceRevealTimer();
        if (!preserveFocusReturnMotion) {
            this.clearBookingFocusPanelReturnMotion();
        }

        if (this.bookingModalMorphRevealTimer) {
            window.clearTimeout(this.bookingModalMorphRevealTimer);
            this.bookingModalMorphRevealTimer = 0;
        }

        if (this.bookingModalMorphCleanupTimer) {
            window.clearTimeout(this.bookingModalMorphCleanupTimer);
            this.bookingModalMorphCleanupTimer = 0;
        }

        if (this.bookingModalMorphGhost) {
            this.bookingModalMorphGhost.remove();
            this.bookingModalMorphGhost = null;
        }

        if (this.activeBookingSourceCard) {
            this.activeBookingSourceCard.classList.remove('is-originating');
            this.activeBookingSourceCard = null;
        }

        if (!preserveSourceSnapshot) {
            this.activeBookingSourceSnapshot = null;
        }

        const modalContent = this.bookingModal?.querySelector('.booking-modal-content');
        if (modalContent) {
            modalContent.classList.remove('is-morphing');
            modalContent.style.transition = '';
            modalContent.style.transformOrigin = '';
            modalContent.style.transform = '';
            modalContent.style.opacity = '';
            modalContent.style.filter = '';
        }
    }

    /**
     * startBookingModalMorph(packageId, sourceState) - 让套餐卡像被展开一样放大到屏幕中间
     * @param {string} packageId - 当前展开的套餐 ID
     * @param {Object|null} sourceState - 点击来源卡片的布局快照
     * @returns {void} - 无返回值，直接驱动共享元素动画
     */
    startBookingModalMorph(packageId, sourceState = null) {
        const modalContent = this.bookingModal?.querySelector('.booking-modal-content');
        const originCard = sourceState?.sourceElement || this.getPackageSourceCard(packageId);

        if (!modalContent || window.innerWidth < 920) {
            modalContent?.classList.remove('is-morphing');
            return;
        }

        const sourceRect = sourceState?.rect || originCard?.getBoundingClientRect();
        const targetRect = modalContent.getBoundingClientRect();

        if (!sourceRect || sourceRect.width < 40 || sourceRect.height < 40 || targetRect.width < 120 || targetRect.height < 120) {
            modalContent.classList.remove('is-morphing');
            return;
        }

        this.clearBookingModalMorph({ preserveSourceSnapshot: true });
        this.activeBookingSourceCard = originCard || null;
        this.activeBookingSourceCard?.classList.add('is-originating');
        modalContent.classList.add('is-morphing');

        const invertX = sourceRect.left - targetRect.left;
        const invertY = sourceRect.top - targetRect.top;
        const invertScaleX = sourceRect.width / targetRect.width;
        const invertScaleY = sourceRect.height / targetRect.height;

        modalContent.style.transition = 'none';
        modalContent.style.transformOrigin = 'top left';
        modalContent.style.transform = `translate3d(${invertX}px, ${invertY}px, 0) scale(${invertScaleX}, ${invertScaleY})`;
        modalContent.style.opacity = '1';
        modalContent.style.filter = 'blur(0px)';

        window.requestAnimationFrame(() => {
            modalContent.style.transition =
                'transform 880ms cubic-bezier(0.18, 0.84, 0.18, 1), opacity 520ms ease, filter 520ms ease';
            modalContent.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
            modalContent.style.opacity = '1';
            modalContent.style.filter = 'blur(0px)';
        });

        this.bookingModalMorphRevealTimer = window.setTimeout(() => {
            modalContent.classList.remove('is-morphing');
            modalContent.style.transition = '';
            modalContent.style.transformOrigin = '';
            modalContent.style.transform = '';
            modalContent.style.opacity = '';
            modalContent.style.filter = '';
            this.bookingModalMorphRevealTimer = 0;
        }, 920);

        this.bookingModalMorphCleanupTimer = window.setTimeout(() => {
            modalContent.classList.remove('is-morphing');
            modalContent.style.transition = '';
            modalContent.style.transformOrigin = '';
            modalContent.style.transform = '';
            modalContent.style.opacity = '';
            modalContent.style.filter = '';
            this.bookingModalMorphCleanupTimer = 0;
        }, 960);
    }

    // 遮罩锁定：在套餐弹窗、评论详情、图片放大层打开时统一锁住背景滚动。
    /**
     * syncOverlayLock() - 根据弹层状态同步页面滚动锁定状态
     * @returns {void} - 无返回值，直接切换页面锁定 class
     */
    syncOverlayLock() {
        const hasActiveBookingModal = Boolean(
            this.bookingModal &&
            this.bookingModal.classList.contains('active') &&
            !this.bookingModalNavigationAway
        );
        const hasClosingBookingModal = Boolean(
            this.bookingModal &&
            this.bookingModal.classList.contains('is-closing')
        );
        const hasActiveOverlay = Boolean(
            hasActiveBookingModal ||
            hasClosingBookingModal ||
            (this.bookingConfirmFeedback && this.bookingConfirmFeedback.classList.contains('active')) ||
            (this.reviewDetailModal && this.reviewDetailModal.classList.contains('active')) ||
            (this.reviewLightbox && this.reviewLightbox.classList.contains('active')) ||
            this.seaAtlasFullscreenOpen
        );
        const hasBookingModalOpen = Boolean(
            hasActiveBookingModal || hasClosingBookingModal
        );
        const hasBookingModalListContext = Boolean(hasActiveBookingModal);

        document.documentElement.classList.toggle('has-overlay-lock', hasActiveOverlay);
        document.body.classList.toggle('has-overlay-lock', hasActiveOverlay);
        document.body.classList.toggle('has-booking-modal-open', hasBookingModalOpen);
        this.itineraryList?.classList.toggle('is-modal-open', hasBookingModalListContext);
        // 同时锁 html 和 body，是为了兼容不同浏览器对滚动容器的处理，
        // 避免弹层打开后背景还能继续偷偷滚动。
    }

    /**
     * closeBookingModal() - 关闭套餐详情弹层
     * @returns {void} - 无返回值，直接更新弹层状态
     */
    closeBookingModal() {
        if (!this.bookingModal) {
            return;
        }

        this.clearBookingMatchConfirmationImmediately({
            restoreFocus: false
        });
        this.resetBookingModalNavigateAwayState();

        if (this.bookingModalCloseTimer) {
            window.clearTimeout(this.bookingModalCloseTimer);
            this.bookingModalCloseTimer = 0;
        }
        if (this.packageModalEditorCloseTimer) {
            window.clearTimeout(this.packageModalEditorCloseTimer);
            this.packageModalEditorCloseTimer = 0;
        }
        this.packageModalEditorTransitioning = false;
        this.cancelPackageModalEditorStateMotion();

        if (!this.bookingModal.classList.contains('active') && !this.bookingModal.classList.contains('is-closing')) {
            this.bookingModal.setAttribute('aria-hidden', 'true');
            this.syncOverlayLock();
            return;
        }

        const modalContent = this.bookingModal.querySelector('.booking-modal-content');
        const packageId = this.getActiveBookingModalPackageId();
        const isFocusOnlyContext = Boolean(
            this.bookingSticky?.classList.contains('is-focus-only-context') ||
            this.bookingStickyFocusContextState === 'entering' ||
            this.bookingStickyFocusContextState === 'focus'
        );
        const focusPanelPackageId = this.bookingFocusPanel?.dataset?.packageId
            || this.activeBookingFocusPackageId
            || this.selectedPackageId
            || '';
        const canHandoffToFocusPanel = Boolean(
            modalContent &&
            window.innerWidth >= 920 &&
            this.bookingModal.classList.contains('active') &&
            this.bookingFocusPanel &&
            isFocusOnlyContext &&
            focusPanelPackageId === packageId
        );

        if (canHandoffToFocusPanel) {
            const focusPanelTarget = this.getMorphTargetFromElement(this.bookingFocusPanel);
            const focusPanelRect = focusPanelTarget?.sourceRect || this.bookingFocusPanel.getBoundingClientRect();
            const modalRect = modalContent.getBoundingClientRect();
            const canAnimateTowardFocusPanel = Boolean(
                focusPanelRect &&
                focusPanelRect.width >= 40 &&
                focusPanelRect.height >= 40 &&
                modalRect.width >= 120 &&
                modalRect.height >= 120
            );

            if (this.activeBookingSourceCard && this.activeBookingSourceCard !== this.bookingFocusPanel) {
                this.activeBookingSourceCard.classList.remove('is-originating');
            }

            this.activeBookingSourceCard = this.bookingFocusPanel;
            this.activeBookingSourceCard.classList.add('is-originating');

            this.bookingModal.classList.remove('active');
            this.bookingModal.classList.add('is-closing', 'is-returning-to-focus-panel');

            modalContent.classList.add('is-morphing');
            modalContent.style.transition = 'none';
            modalContent.style.transformOrigin = canAnimateTowardFocusPanel ? 'top left' : 'center center';
            modalContent.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
            modalContent.style.opacity = '1';
            modalContent.style.filter = 'blur(0px)';

            window.requestAnimationFrame(() => {
                if (canAnimateTowardFocusPanel) {
                    const handoffX = focusPanelRect.left - modalRect.left;
                    const handoffY = focusPanelRect.top - modalRect.top;
                    const handoffScaleX = focusPanelRect.width / modalRect.width;
                    const handoffScaleY = focusPanelRect.height / modalRect.height;
                    modalContent.style.transition =
                        'transform 260ms cubic-bezier(0.18, 0.84, 0.2, 1), opacity 220ms ease, filter 220ms ease';
                    modalContent.style.transform = `translate3d(${handoffX}px, ${handoffY}px, 0) scale(${handoffScaleX}, ${handoffScaleY})`;
                    modalContent.style.opacity = '0.16';
                    modalContent.style.filter = 'blur(8px)';
                    return;
                }

                modalContent.style.transition =
                    'transform 240ms cubic-bezier(0.22, 0.78, 0.3, 1), opacity 200ms ease, filter 200ms ease';
                modalContent.style.transform = 'translate3d(0, 14px, 0) scale(0.986)';
                modalContent.style.opacity = '0';
                modalContent.style.filter = 'blur(10px)';
            });

            this.clearBookingModalSourceRevealTimer();
            this.bookingModalSourceRevealTimer = window.setTimeout(() => {
                this.releaseBookingModalSourceVisualState(this.bookingFocusPanel);
                this.startBookingFocusPanelReturnMotion();
                this.bookingModalSourceRevealTimer = 0;
            }, canAnimateTowardFocusPanel ? 96 : 72);

            this.bookingModalCloseTimer = window.setTimeout(() => {
                if (!this.bookingModal) {
                    return;
                }

                this.releaseBookingModalSourceVisualState(this.bookingFocusPanel);
                this.bookingModal.setAttribute('aria-hidden', 'true');
                this.bookingModal.classList.remove('is-closing', 'is-returning-to-focus-panel');
                this.clearBookingModalMorph({
                    preserveFocusReturnMotion: true
                });
                this.bookingModalCloseTimer = 0;
                this.syncOverlayLock();
            }, canAnimateTowardFocusPanel ? 260 : 220);

            this.syncOverlayLock();
            return;
        }

        const morphTarget = this.resolveBookingModalCloseMorphTarget(packageId);
        const canReverseMorph = Boolean(
            modalContent &&
            morphTarget?.sourceRect &&
            window.innerWidth >= 920 &&
            this.bookingModal.classList.contains('active')
        );

        if (canReverseMorph) {
            const sourceRect = morphTarget.sourceRect;
            const sourceVisibility = morphTarget.sourceVisibility || null;
            const targetRect = modalContent.getBoundingClientRect();

            if (
                sourceRect &&
                sourceRect.width >= 40 &&
                sourceRect.height >= 40 &&
                targetRect.width >= 120 &&
                targetRect.height >= 120
            ) {
                const invertX = sourceRect.left - targetRect.left;
                const invertY = sourceRect.top - targetRect.top;
                const invertScaleX = sourceRect.width / targetRect.width;
                const invertScaleY = sourceRect.height / targetRect.height;
                const targetElement = morphTarget.sourceElement || null;
                const sourceElement = targetElement;

                if (this.activeBookingSourceCard && this.activeBookingSourceCard !== sourceElement) {
                    this.activeBookingSourceCard.classList.remove('is-originating');
                }
                this.activeBookingSourceCard = sourceElement;
                this.activeBookingSourceCard?.classList.add('is-originating');

                this.bookingModal.classList.remove('active');
                this.bookingModal.classList.add('is-closing');
                this.bookingModal.classList.remove('is-returning-to-focus-panel');

                modalContent.classList.add('is-morphing');
                modalContent.style.transition = 'none';
                modalContent.style.transformOrigin = 'top left';
                modalContent.style.transform = 'translate3d(0, 0, 0) scale(1, 1)';
                modalContent.style.opacity = '1';
                modalContent.style.filter = 'blur(0px)';

                window.requestAnimationFrame(() => {
                    modalContent.style.transition =
                        'transform 760ms cubic-bezier(0.18, 0.84, 0.18, 1), opacity 420ms ease, filter 420ms ease';
                    modalContent.style.transform = `translate3d(${invertX}px, ${invertY}px, 0) scale(${invertScaleX}, ${invertScaleY})`;
                    modalContent.style.opacity = sourceVisibility?.isFullyVisible ? '0.12' : '0.18';
                    modalContent.style.filter = sourceVisibility?.isFullyVisible ? 'blur(10px)' : 'blur(7px)';
                });

                this.clearBookingModalSourceRevealTimer();
                this.bookingModalSourceRevealTimer = window.setTimeout(() => {
                    this.releaseBookingModalSourceVisualState(sourceElement);
                    this.bookingModalSourceRevealTimer = 0;
                }, 140);

                this.bookingModalCloseTimer = window.setTimeout(() => {
                    if (!this.bookingModal) {
                        return;
                    }

                    this.releaseBookingModalSourceVisualState();
                    this.bookingModal.setAttribute('aria-hidden', 'true');
                    this.bookingModal.classList.remove('is-closing', 'is-returning-to-focus-panel');
                    this.clearBookingModalMorph();
                    this.bookingModalCloseTimer = 0;
                    this.syncOverlayLock();
                }, 760);

                this.syncOverlayLock();
                return;
            }
        }

        this.clearBookingModalMorph();

        this.bookingModal.classList.remove('active');
        this.bookingModal.classList.add('is-closing');
        this.bookingModal.classList.remove('is-returning-to-focus-panel');

        this.bookingModalCloseTimer = window.setTimeout(() => {
            if (!this.bookingModal) {
                return;
            }

            this.bookingModal.classList.remove('is-closing', 'is-returning-to-focus-panel');
            this.bookingModal.setAttribute('aria-hidden', 'true');
            this.bookingModalCloseTimer = 0;
            this.syncOverlayLock();
        }, 420);

        this.syncOverlayLock();
    }

    /**
     * getBookedPackageIdsForCurrentSpot() - 读取当前潜点已收进行程的套餐 ID 集合
     * @returns {Set<string>} - 当前潜点已收进 storage 的套餐 ID 集合
     */
    getBookedPackageIdsForCurrentSpot() {
        if (!this.tripStore || typeof this.tripStore.getConfirmedBookings !== 'function') {
            return new Set();
        }

        const currentSpotKey = String(this.spotId);
        return new Set(
            this.tripStore.getConfirmedBookings()
                .filter((booking) => String(booking.spotKey) === currentSpotKey)
                .map((booking) => booking.packageId)
                .filter(Boolean)
        );
    }

    /**
     * getLatestBookedPackageIdForCurrentSpot() - 找出当前潜点最近一次被收进行程的套餐
     * @returns {string} - 最近一次确认的套餐 ID；若不存在则返回空字符串
     */
    getLatestBookedPackageIdForCurrentSpot() {
        if (!this.tripStore || typeof this.tripStore.getConfirmedBookings !== 'function') {
            return '';
        }

        const currentSpotKey = String(this.spotId);
        const confirmedBookings = this.tripStore.getConfirmedBookings()
            .filter((booking) => String(booking.spotKey) === currentSpotKey);

        for (let index = confirmedBookings.length - 1; index >= 0; index -= 1) {
            const packageId = confirmedBookings[index]?.packageId;
            if (packageId && this.packageData.some((pkg) => pkg.id === packageId)) {
                return packageId;
            }
        }

        return '';
    }

    /**
     * buildConfirmedBooking(pkg) - 用当前潜点数据生成一条已确认行程
     * 新加入的套餐不继承既有同行人数，避免上一份安排把新的套餐直接预设掉。
     * @param {Object} pkg - 当前套餐对象
     * @returns {Object} - 可写入共享 storage 的标准套餐记录
     */
    buildConfirmedBooking(pkg) {
        const draft = this.tripStore && typeof this.tripStore.getPlannerDraft === 'function'
            ? this.tripStore.getPlannerDraft()
            : {};
        const modalState = this.getPackageModalViewState(pkg);
        const packageTags = modalState?.isCustomized
            ? Array.from(new Set([
                modalState.durationLabel,
                modalState.windowLabel,
                ...(Array.isArray(pkg.fitTags) ? pkg.fitTags : [])
            ])).filter(Boolean)
            : (Array.isArray(pkg.fitTags) ? pkg.fitTags.slice() : []);
        const packageNote = modalState?.isCustomized
            ? `${pkg.mood} 此刻先收作 ${modalState.durationLabel}，${modalState.windowLabel}。`
            : pkg.mood;

        return {
            spotKey: String(this.spotId),
            spotName: this.spotData.name || document.getElementById('spotName')?.textContent || '',
            spotTagline: this.spotData.tagline || document.getElementById('spotTagline')?.textContent || '',
            detailHref: `detail.html?id=${this.spotId}`,
            packageId: pkg.id,
            packageTitle: pkg.name,
            packageTier: pkg.group,
            packageDuration: modalState?.durationLabel || pkg.duration || '',
            packagePrice: modalState?.priceLabel || pkg.price,
            packageNote,
            packageTags,
            selectedDate: draft.dateValue || '',
            selectedDateLabel: draft.dateLabel || '',
            selectedPeople: modalState?.peopleValue || '',
            selectedPeopleLabel: modalState?.peopleLabel || '',
            priceDisplayVersion: PRICE_DISPLAY_VERSION
        };
    }

    /**
     * showBookingConfirmation(booking) - 在套餐区下方给出柔和的“已收进行程”反馈
     * @param {Object} booking - 刚写入 storage 的套餐对象
     * @returns {void} - 无返回值，直接刷新提示区
     */
    showBookingConfirmation(booking) {
        if (!this.bookingNote) {
            return;
        }

        const dateCopy = booking.selectedDateLabel || '仍在等一段合适的潮汐';
        const peopleCopy = booking.selectedPeopleLabel || '同行节奏还没写进这一潜';

        this.bookingNote.classList.add('is-success');
        this.bookingNote.innerHTML = `
            <div class="booking-note-feedback">
                <div class="booking-note-feedback-inner">
                    <span class="booking-note-state">这片海已经慢慢收进行程了</span>
                    <p>${booking.packageTitle} 已替你停进这次安排里。接下来，可以去“我的行程”里继续整理日期与同行节奏。</p>
                    <div class="booking-note-meta">
                        <span>日期：${dateCopy}</span>
                        <span>同行：${peopleCopy}</span>
                    </div>
                </div>
                <a class="booking-note-link" href="trip.html#confirmedBookingsStage">去我的行程继续往下排</a>
            </div>
        `;
    }

    /**
     * renderBookingConfirmedMeta(booking) - 渲染确认反馈层中的套餐与行程摘要信息
     * @param {Object} booking - 刚写入 storage 的套餐对象
     * @returns {string} - 反馈层元信息 HTML
     */
    renderBookingConfirmedMeta(booking) {
        const dateCopy = booking.selectedDateLabel || '仍在等一段合适的潮汐';
        const peopleCopy = booking.selectedPeopleLabel || '同行节奏还没写进这一潜';

        return `
            <span class="booking-confirm-chip">${escapeHtml(booking.spotName || '未命名海域')}</span>
            <span class="booking-confirm-chip">${escapeHtml(booking.packageTitle || '未命名套餐')}</span>
            ${booking.packageTier ? `<span class="booking-confirm-chip">${escapeHtml(booking.packageTier)}</span>` : ''}
            <span class="booking-confirm-chip">潮汐：${escapeHtml(dateCopy)}</span>
            <span class="booking-confirm-chip">同行：${escapeHtml(peopleCopy)}</span>
        `;
    }

    /**
     * showBookingConfirmedFeedback(savedBooking) - 在页面高层显示“已收进行程”的安静反馈层
     * @param {Object} savedBooking - 已经写入共享存储的套餐对象
     * @returns {void} - 无返回值，直接打开反馈层
     */
    showBookingConfirmedFeedback(savedBooking) {
        if (!this.bookingConfirmFeedback || !this.bookingConfirmCopy || !this.bookingConfirmMeta) {
            return;
        }

        window.clearTimeout(this.bookingConfirmCloseTimer);
        this.bookingConfirmFeedback.classList.remove('is-closing');
        this.bookingConfirmCopy.textContent = '你可以继续留在这里看这片海，也可以去“我的行程”整理出发时间与同行节奏。';
        this.bookingConfirmMeta.innerHTML = this.renderBookingConfirmedMeta(savedBooking);
        this.bookingConfirmFeedback.classList.add('active');
        this.bookingConfirmFeedback.setAttribute('aria-hidden', 'false');
        this.syncOverlayLock();
    }

    /**
     * hideBookingConfirmedFeedback() - 关闭“已收进行程”反馈层并恢复页面浏览
     * @param {Object} options - 关闭选项，支持 immediate 直接收起不播放退场动画
     * @returns {void} - 无返回值，直接执行关闭动画
     */
    hideBookingConfirmedFeedback(options = {}) {
        if (!this.bookingConfirmFeedback) {
            return;
        }

        this.bookingConfirmFeedback.setAttribute('aria-hidden', 'true');
        window.clearTimeout(this.bookingConfirmCloseTimer);

        if (options.immediate) {
            this.bookingConfirmFeedback.classList.remove('active', 'is-closing');
            this.syncOverlayLock();
            return;
        }

        if (
            !this.bookingConfirmFeedback.classList.contains('active') ||
            this.bookingConfirmFeedback.classList.contains('is-closing')
        ) {
            this.syncOverlayLock();
            return;
        }

        this.bookingConfirmFeedback.classList.add('is-closing');
        this.bookingConfirmCloseTimer = window.setTimeout(() => {
            if (!this.bookingConfirmFeedback) {
                return;
            }

            this.bookingConfirmFeedback.classList.remove('active', 'is-closing');
            this.syncOverlayLock();
        }, 340);
    }

    /**
     * confirmBooking(packageId) - 确认当前套餐并写入共享行程存储
     * @param {string|Object} packageId - 套餐 ID 或套餐对象
     * @returns {void} - 无返回值，直接更新页面状态
     */
    confirmBooking(packageId) {
        const pkg = typeof packageId === 'object' ? packageId : this.getPackageById(packageId);
        if (!pkg || !this.bookingNote || !this.tripStore || typeof this.tripStore.upsertConfirmedBooking !== 'function') {
            return;
        }

        const booking = this.tripStore.upsertConfirmedBooking(this.buildConfirmedBooking(pkg));
        if (booking?.entryId && typeof this.tripStore.saveActiveBookingId === 'function') {
            this.tripStore.saveActiveBookingId(booking.entryId);
        }
        this.selectedPackageId = pkg.id;
        this.bookedPackageIds = this.getBookedPackageIdsForCurrentSpot();
        this.applyPackageCardSelectionState(pkg.id);
        this.syncBookingFocusPanel({
            force: true,
            immediate: true,
            animatePrice: false
        });
        this.showBookingConfirmation(booking);
        this.closeBookingModal();
        window.setTimeout(() => {
            this.renderItineraries();
        }, 780);
        this.showBookingConfirmedFeedback(booking);
    }

    // 弹层控制：统一管理评论详情和图片放大层的打开、关闭、动画和清理时机。
    /**
     * openReviewDetail(reviewId) - 打开指定评论的详情弹层
     * @param {string} reviewId - 评论 ID
     * @returns {void} - 无返回值，直接显示评论详情
     */
    openReviewDetail(reviewId) {
        const review = this.getReviewById(reviewId);
        if (!review || !this.reviewDetailModal || !this.reviewDetailBody) {
            return;
        }

        window.clearTimeout(this.reviewDetailCloseTimer);
        this.reviewDetailBody.innerHTML = this.createReviewDetailMarkup(review);
        this.reviewDetailModal.classList.remove('is-closing');
        this.reviewDetailModal.classList.add('active');
        this.reviewDetailModal.setAttribute('aria-hidden', 'false');
        this.syncOverlayLock();
        this.reviewDetailModal.scrollTop = 0;
        const detailPanel = this.reviewDetailModal.querySelector('.review-detail-panel');
        if (detailPanel) {
            detailPanel.scrollTop = 0;
        }
        const detailScroll = this.reviewDetailBody.querySelector('.review-detail-scroll');
        if (detailScroll) {
            detailScroll.scrollTop = 0;
        }
        // 先把详情内容写进去再显示弹层，
        // 可以避免弹层先亮出来、内容后补上的“空壳闪一下”问题。
    }

    /**
     * closeReviewDetail() - 关闭评论详情弹层
     * @returns {void} - 无返回值，直接执行关闭动画和清理
     */
    closeReviewDetail() {
        if (
            !this.reviewDetailModal ||
            !this.reviewDetailModal.classList.contains('active') ||
            this.reviewDetailModal.classList.contains('is-closing')
        ) {
            return;
        }

        this.reviewDetailModal.classList.add('is-closing');
        this.reviewDetailModal.setAttribute('aria-hidden', 'true');

        window.clearTimeout(this.reviewDetailCloseTimer);
        this.reviewDetailCloseTimer = window.setTimeout(() => {
            if (!this.reviewDetailModal) {
                return;
            }

            this.reviewDetailModal.classList.remove('active', 'is-closing');
            if (this.reviewDetailBody) {
                this.reviewDetailBody.innerHTML = '';
            }
            this.syncOverlayLock();
        }, 360);
        // 不立刻移除 active，而是等关闭动画播完后再清空内容，
        // 用户会感觉评论卡是被慢慢收回去，而不是突然被抹掉。
    }

    /**
     * openReviewLightbox(src, alt, caption) - 打开评论图片区放大查看层
     * @param {string} src - 大图地址
     * @param {string} alt - 图片替代文本
     * @param {string} caption - 图片说明文案
     * @returns {void} - 无返回值，直接显示放大层
     */
    openReviewLightbox(src, alt, caption) {
        if (!this.reviewLightbox || !this.reviewLightboxImage) {
            return;
        }

        window.clearTimeout(this.reviewLightboxCloseTimer);
        this.reviewLightbox.classList.remove('is-closing');
        this.reviewLightboxImage.decoding = 'async';
        this.reviewLightboxImage.src = src;
        this.reviewLightboxImage.alt = alt;
        this.reviewLightboxImage.onerror = () => {
            this.reviewLightboxImage.onerror = null;
            this.reviewLightboxImage.src = `https://via.placeholder.com/1200x900?text=${encodeURIComponent(caption || this.spotData.name)}`;
        };
        if (this.reviewLightboxCaption) {
            this.reviewLightboxCaption.textContent = caption;
        }

        this.reviewLightbox.classList.add('active');
        this.reviewLightbox.setAttribute('aria-hidden', 'false');
        this.syncOverlayLock();
        // 看图层和评论详情层共用同一套背景锁定逻辑，
        // 这样不管用户是看文字还是看照片，页面主体都不会抢走焦点。
    }

    /**
     * closeReviewLightbox() - 关闭评论图片区放大查看层
     * @returns {void} - 无返回值，直接执行关闭动画和清理
     */
    closeReviewLightbox() {
        if (
            !this.reviewLightbox ||
            !this.reviewLightboxImage ||
            !this.reviewLightbox.classList.contains('active') ||
            this.reviewLightbox.classList.contains('is-closing')
        ) {
            return;
        }

        this.reviewLightbox.classList.add('is-closing');
        this.reviewLightbox.setAttribute('aria-hidden', 'true');

        window.clearTimeout(this.reviewLightboxCloseTimer);
        this.reviewLightboxCloseTimer = window.setTimeout(() => {
            if (!this.reviewLightbox || !this.reviewLightboxImage) {
                return;
            }

            this.reviewLightbox.classList.remove('active', 'is-closing');
            this.reviewLightboxImage.src = '';
            this.reviewLightboxImage.alt = '';
            if (this.reviewLightboxCaption) {
                this.reviewLightboxCaption.textContent = '';
            }

            this.syncOverlayLock();
        }, 380);
    }

    // 相关推荐舞台：
    // 这里不是简单把 related 数组循环出来，
    // 而是把“当前主卡 + 两张相邻卡”组织成一个可切换的小型海域舞台。
    /**
     * buildRelatedStageMarkup(direction) - 生成相邻海域舞台的主卡和相邻卡结构
     * @param {string} direction - 当前切换方向，用于控制入场动画方向
     * @returns {string} - 相邻海域舞台的 HTML 字符串
     */
    buildRelatedStageMarkup(direction = '') {
        const relatedSpots = Array.isArray(this.spotData.related) ? this.spotData.related : [];
        if (relatedSpots.length === 0) {
            return '';
        }

        const activeSpot = relatedSpots.find((spot) => spot.id === this.activeRelatedSpotId) || relatedSpots[0];
        const activeProfile = getRelatedSpotProfile(activeSpot);
        const activeImage = divingSpotDetails[activeSpot.id]?.image || activeSpot.image;
        const sideSpots = relatedSpots.filter((spot) => spot.id !== activeSpot.id).slice(0, 2);
        const directionClass = direction ? ` ${direction}` : '';
        // 只把一张作为主卡，其余两张做邻近海域。
        // 这样切换时用户感受到的是“在附近海域之间潜游”，不是在列表里换筛选条件。

        return `
            <div class="related-stage-shell${directionClass}">
                <article class="related-feature-card" data-id="${activeSpot.id}" tabindex="0" aria-label="继续查看 ${activeSpot.name} 的详情">
                    <div class="related-feature-media">
                        <img
                            src="${activeImage}"
                            alt="${activeSpot.name}"
                            class="related-feature-image"
                            onerror="this.src='https://via.placeholder.com/960x620?text=${encodeURIComponent(activeSpot.name)}'"
                        >
                        <div class="related-feature-overlay"></div>
                    </div>

                    <div class="related-feature-copy">
                        <p class="related-feature-kicker">Featured Water</p>
                        <h3 class="related-feature-title">
                            <span>${activeSpot.name}</span>
                            <small>${activeProfile.englishName}</small>
                        </h3>
                        <p class="related-feature-desc">${activeProfile.mood}</p>
                        <div class="related-feature-tags">
                            ${activeProfile.fitTags.map((tag) => `<span class="related-feature-tag">${tag}</span>`).join('')}
                        </div>
                        <p class="related-feature-why">${activeProfile.why}</p>
                        <button type="button" class="related-feature-action" data-id="${activeSpot.id}">
                            继续看这片海
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path
                                    d="M5 12h14M13 6l6 6-6 6"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2.2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                            </svg>
                        </button>
                    </div>
                </article>

                <div class="related-neighbor-stack">
                    ${sideSpots.map((spot, index) => {
                        const profile = getRelatedSpotProfile(spot);
                        const spotImage = divingSpotDetails[spot.id]?.image || spot.image;
                        return `
                            <button
                                type="button"
                                class="related-neighbor-card"
                                data-id="${spot.id}"
                                data-neighbor-index="${index}"
                                aria-label="切换到 ${spot.name}"
                                style="animation-delay: ${index * 0.12}s; --related-neighbor-delay: ${index * 120}ms;"
                            >
                                <div class="related-neighbor-media">
                                    <img
                                        src="${spotImage}"
                                        alt="${spot.name}"
                                        class="related-neighbor-image"
                                        onerror="this.src='https://via.placeholder.com/420x320?text=${encodeURIComponent(spot.name)}'"
                                    >
                                </div>
                                <div class="related-neighbor-copy">
                                    <p class="related-neighbor-name">${spot.name} <span>${profile.englishName}</span></p>
                                    <p class="related-neighbor-desc">${spot.description}</p>
                                    <div class="related-neighbor-tags">
                                        ${profile.fitTags.slice(0, 2).map((tag) => `<span class="related-neighbor-tag">${tag}</span>`).join('')}
                                    </div>
                                    <p class="related-neighbor-why">${profile.why}</p>
                                </div>
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    /**
     * bindRelatedStageInteractions() - 为主海域卡和相邻海域卡绑定切换与进入详情交互
     * @returns {void} - 无返回值，直接注册相关推荐舞台事件
     */
    bindRelatedStageInteractions(stageRoot = null) {
        const scope = stageRoot || this.relatedGrid;
        if (!scope) {
            return;
        }

        const featureCard = scope.querySelector('.related-feature-card');
        const featureAction = scope.querySelector('.related-feature-action');
        const neighborCards = Array.from(scope.querySelectorAll('.related-neighbor-card'));

        if (featureCard) {
            featureCard.addEventListener('pointerdown', () => {
                this.setPressedRelatedCard(featureCard);
            });

            featureCard.addEventListener('pointerup', () => {
                if (!this.relatedTransitionTimer) {
                    this.clearPressedRelatedCard(featureCard);
                }
            });

            featureCard.addEventListener('pointercancel', () => {
                if (!this.relatedTransitionTimer) {
                    this.clearPressedRelatedCard(featureCard);
                }
            });

            featureCard.addEventListener('pointerleave', () => {
                if (!this.relatedTransitionTimer) {
                    this.clearPressedRelatedCard(featureCard);
                }
            });

            featureCard.addEventListener('click', (event) => {
                if (event.target.closest('.related-feature-action')) {
                    return;
                }

                event.preventDefault();
                this.startRelatedSpotTransition(featureCard);
            });

            featureCard.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                event.preventDefault();
                this.startRelatedSpotTransition(featureCard);
            });
        }

        if (featureAction) {
            featureAction.addEventListener('click', (event) => {
                event.preventDefault();
                this.startRelatedSpotTransition(featureCard);
            });
        }

        neighborCards.forEach((card) => {
            card.addEventListener('click', (event) => {
                event.preventDefault();
                this.switchRelatedStage(Number(card.dataset.id));
            });
        });
    }

    /**
     * switchRelatedStage(targetId) - 在相邻海域之间切换主卡焦点，模拟视线缓慢移向另一片海
     * @param {number} targetId - 目标潜点 ID
     * @returns {void} - 无返回值，直接更新相关推荐舞台状态
     */
    switchRelatedStage(targetId) {
        if (
            !this.relatedGrid ||
            !Number.isFinite(targetId) ||
            targetId === this.activeRelatedSpotId ||
            this.relatedTransitionTimer
        ) {
            return;
        }

        const relatedSpots = Array.isArray(this.spotData.related) ? this.spotData.related : [];
        const currentIndex = relatedSpots.findIndex((spot) => spot.id === this.activeRelatedSpotId);
        const targetIndex = relatedSpots.findIndex((spot) => spot.id === targetId);
        const currentStage = this.relatedGrid.querySelector('.related-stage-shell:not(.is-stage-outgoing)')
            || this.relatedGrid.querySelector('.related-stage-shell');
        if (targetIndex === -1 || this.relatedStageSwitchTimer || !currentStage) {
            return;
        }

        const flowClass = targetIndex > currentIndex ? 'is-flow-forward' : 'is-flow-backward';
        const featureCard = currentStage.querySelector('.related-feature-card');
        const currentStageHeight = currentStage.offsetHeight || this.relatedGrid.offsetHeight || 0;
        if (currentStageHeight > 0) {
            this.relatedStageStableHeight = Math.max(this.relatedStageStableHeight, currentStageHeight);
            this.relatedGrid.style.setProperty('--related-stage-height', `${this.relatedStageStableHeight}px`);
        }
        if (currentStageHeight > 0) {
            this.relatedGrid.style.minHeight = `${currentStageHeight}px`;
        }

        this.relatedGrid.classList.add('is-stage-switching');
        currentStage.classList.remove('is-entry-reveal');
        currentStage.classList.remove('is-stage-active');
        currentStage.classList.add('is-stage-outgoing', 'is-stacked-stage', flowClass);
        currentStage.setAttribute('aria-hidden', 'true');
        featureCard?.classList.add('is-leaving');

        this.activeRelatedSpotId = targetId;
        currentStage.insertAdjacentHTML('afterend', this.buildRelatedStageMarkup(flowClass));
        const stageShells = Array.from(this.relatedGrid.querySelectorAll('.related-stage-shell'));
        const incomingStage = stageShells[stageShells.length - 1] || null;

        if (incomingStage) {
            const incomingStageHeight = incomingStage.offsetHeight || 0;
            if (incomingStageHeight > currentStageHeight) {
                this.relatedGrid.style.minHeight = `${incomingStageHeight}px`;
            }
            if (incomingStageHeight > 0) {
                this.relatedStageStableHeight = Math.max(this.relatedStageStableHeight, incomingStageHeight);
                this.relatedGrid.style.setProperty('--related-stage-height', `${this.relatedStageStableHeight}px`);
                this.relatedGrid.style.minHeight = `${this.relatedStageStableHeight}px`;
            }

            incomingStage.classList.add('is-stage-incoming', 'is-stacked-stage');
            incomingStage.setAttribute('aria-hidden', 'true');
            this.bindRelatedStageInteractions(incomingStage);
        }

        this.syncRelatedTextLayout();
        this.announceRelatedSummary(`已切换到相邻海域${relatedSpots[targetIndex].name}。`);

        this.relatedStageSwitchTimer = window.setTimeout(() => {
            window.requestAnimationFrame(() => {
                incomingStage?.classList.add('is-stage-active');
                this.relatedStageSwitchTimer = 0;
            });
        }, 24);

        if (this.relatedStageCleanupTimer) {
            window.clearTimeout(this.relatedStageCleanupTimer);
        }

        this.relatedStageCleanupTimer = window.setTimeout(() => {
            currentStage.remove();
            incomingStage?.classList.remove(
                'is-stage-incoming',
                'is-stacked-stage',
                'is-flow-forward',
                'is-flow-backward'
            );
            incomingStage?.removeAttribute('aria-hidden');
            this.relatedGrid?.classList.remove('is-stage-switching');
            this.relatedGrid?.style.removeProperty('min-height');
            this.relatedStageCleanupTimer = 0;
        }, 780);
    }

    /**
     * renderRelatedSpots() - 渲染相邻海域舞台，并预加载后续详情页资源
     * @returns {void} - 无返回值，直接更新相关推荐区域 DOM
     */
    renderRelatedSpots() {
        if (!this.relatedGrid) {
            this.relatedGrid = document.getElementById('relatedGrid');
        }

        if (!this.relatedGrid) {
            return;
        }

        const relatedSpots = Array.isArray(this.spotData.related) ? this.spotData.related : [];
        if (relatedSpots.length === 0) {
            this.relatedGrid.innerHTML = '';
            if (this.relatedEntryRevealTimer) {
                window.clearTimeout(this.relatedEntryRevealTimer);
                this.relatedEntryRevealTimer = 0;
            }
            this.relatedStageStableHeight = 0;
            this.relatedGrid.style.removeProperty('--related-stage-height');
            this.relatedTextLayoutController?.disconnect?.();
            this.relatedTextLayoutController = null;
            return;
        }

        if (!relatedSpots.some((spot) => spot.id === this.activeRelatedSpotId)) {
            this.activeRelatedSpotId = relatedSpots[0].id;
        }

        this.relatedGrid.innerHTML = this.buildRelatedStageMarkup();
        const initialStage = this.relatedGrid.querySelector('.related-stage-shell');
        initialStage?.classList.add('is-entry-reveal');
        this.bindRelatedStageInteractions(initialStage);
        this.syncRelatedTextLayout();
        const initialStageHeight = initialStage?.offsetHeight || 0;
        if (initialStageHeight > 0) {
            this.relatedStageStableHeight = Math.max(this.relatedStageStableHeight, initialStageHeight);
            this.relatedGrid.style.setProperty('--related-stage-height', `${this.relatedStageStableHeight}px`);
        }
        if (this.relatedSection?.classList.contains('is-visible')) {
            this.activateRelatedInitialStage();
        }
        this.preloadRelatedAssets(relatedSpots);
    }

    /**
     * activateRelatedInitialStage() - 在相关推荐首次进入视口时激活舞台显现，并在显现完成后清理首屏 reveal 类
     * @returns {void} - 无返回值，直接更新相关推荐首屏舞台状态
     */
    activateRelatedInitialStage() {
        const initialStage = this.relatedGrid?.querySelector('.related-stage-shell');
        if (!initialStage) {
            return;
        }

        initialStage.classList.add('is-stage-active');

        if (!initialStage.classList.contains('is-entry-reveal')) {
            return;
        }

        if (this.relatedEntryRevealTimer) {
            window.clearTimeout(this.relatedEntryRevealTimer);
        }

        this.relatedEntryRevealTimer = window.setTimeout(() => {
            initialStage.classList.remove('is-entry-reveal');
            this.relatedEntryRevealTimer = 0;
        }, 1100);
    }

    /**
     * syncRelatedTextLayout() - 用 pretext 预测相关推荐舞台里的多行文本高度。
     * 这里优先稳定主推荐卡和相邻海域卡片的标题 / 描述文本，避免切换主卡或窗口宽度变化时，
     * 卡片因为重新换行而产生明显跳动。
     *
     * 当前只接到相关推荐区，是因为：
     * 1. 它会频繁切换主卡与相邻卡；
     * 2. 多行标题和说明文案长度差异大；
     * 3. 这里的布局抖动会直接影响“在相邻海域之间潜游”的舞台感。
     *
     * @returns {void} - 无返回值，直接给相关推荐文本块应用预测高度。
     */
    syncRelatedTextLayout() {
        const textLayout = window.YanqiTextLayout;

        this.relatedTextLayoutController?.disconnect?.();
        this.relatedTextLayoutController = null;

        if (!this.relatedGrid || !textLayout || typeof textLayout.mountResponsiveBatch !== 'function') {
            return;
        }

        this.relatedTextLayoutController = textLayout.mountResponsiveBatch(this.relatedGrid, [
            {
                selector: '.related-feature-title'
            },
            {
                selector: '.related-feature-desc'
            },
            {
                selector: '.related-neighbor-name'
            },
            {
                selector: '.related-neighbor-desc'
            }
        ]);
    }

    /**
     * setupRelatedReveal() - 监听相邻海域区域进入视口后再激活整体显现动画
     * @returns {void} - 无返回值，直接注册相关推荐区域的显现逻辑
     */
    setupRelatedReveal() {
        if (!this.relatedSection) {
            return;
        }

        if (!('IntersectionObserver' in window)) {
            this.relatedSection.classList.add('is-visible');
            this.relatedSection.classList.add('is-sea-shift-awake');
            this.activateRelatedInitialStage();
            return;
        }

        this.relatedRevealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add('is-visible', 'is-sea-shift-awake');
                this.activateRelatedInitialStage();
                this.relatedRevealObserver?.unobserve(entry.target);
            });
        }, {
            threshold: 0.18,
            rootMargin: '0px 0px -10% 0px'
        });

        this.relatedRevealObserver.observe(this.relatedSection);
    }

    buildFooterContent() {
        const { name, related = [] } = this.spotData;
        const nextSpot = related[0] || null;
        const leadMap = {
            1: `${name} 不会在离开页面时结束。真正留下来的，往往是鱼群经过时，海忽然安静下来的那一瞬。`,
            2: `${name} 留下来的，不只是蓝色大门的张力，而是光线、洋流与呼吸终于慢慢对齐的那一刻。`,
            3: `${name} 不只是一处地貌奇观，更像一次向更深处安静下落的停留。`,
            4: `${name} 留住人的，常常不是某一次偶然相遇，而是珊瑚坡地与热带海水一起把节奏放慢。`,
            5: `${name} 真正留下来的，往往是那些需要你更耐心去看的细节，它们会在离开之后慢慢浮回来。`,
            6: `${name} 不会用剧烈的方式留下你，它更像一片始终清澈、愿意让人多停一会儿的海。`,
            7: `${name} 留下来的，不只是大景与洋流，而是整片海在更强的张力里依然保持完整的秩序感。`,
            8: `${name} 更像一片有余韵的蓝，真正留在记忆里的，是那种通道被海流轻轻推开的感觉。`,
            9: `${name} 不会在离开页面时结束。真正留下来的，往往是海风、木栈道和潜后慢下来的那段岛上时光。`,
            13: `${name} 留下来的，往往不是某一个最强的瞬间，而是白沙、清水和呼吸终于一起慢下来的那一刻。`,
            14: `${name} 留下来的，常常是海先把你安放好，再把那层更深一点的蓝慢慢交到眼前的过程。`
        };
        const murmurMap = {
            1: '你可以继续把它排进行程，或再看看另一片与你此刻节奏更接近的蓝。',
            2: '如果还想继续往下潜，这片海之后，也许还有另一处更适合你此刻层级的水域。',
            3: '看完这片更深的蓝以后，或许可以再去一片节奏不同的海，把这次下潜慢慢接续下去。',
            4: '它适合被排进行程，也适合被留在心里，作为下一次再往前一步的起点。',
            5: '你可以继续寻找更微小、更安静的海，也可以先把这次潜入收进行程。',
            6: '如果想继续向海而行，也许下一片更深一点、或更静一点的蓝，已经在前面等着你。',
            7: '看完这片更有张力的海以后，也可以回到一处更适合此刻呼吸节奏的蓝。',
            8: '把这片海留在呼吸里以后，或许还能去看另一处同样值得慢慢下潜的环礁通道。',
            9: '你可以继续把它排进行程，或再看看另一片更适合此刻停驻节奏的海。',
            13: '如果你想继续把潜旅排进更明亮、更轻一点的海，也许下一片相邻水域已经在前面等你。',
            14: '如果你愿意继续沿着这段舒缓节奏往前，也许下一片海会在更深一点的蓝里等你。'
        };

        return {
            spotName: name,
            lead: leadMap[this.spotId] || `${name} 不会在离开页面时结束。真正留下来的，往往是海忽然安静下来、呼吸也跟着放慢的那一瞬。`,
            murmur: murmurMap[this.spotId] || '你可以继续把它排进行程，或再看看另一片更适合此刻的蓝。',
            closing: this.spotId === 9 ? '把海留在呼吸里，也留在归程里。' : '为每一次下潜，留一处安静停靠。',
            nextSpot
        };
    }

    /**
     * renderFooter() - 用当前潜点数据更新详情页 footer 的收束文案与“下一片海”入口
     * @returns {void} - 无返回值，直接同步 footer DOM
     */
    renderFooter() {
        if (!this.detailFooter) {
            return;
        }

        const footerContent = this.buildFooterContent();

        if (this.detailFooterSpotName) {
            this.detailFooterSpotName.textContent = footerContent.spotName;
        }

        if (this.detailFooterLead) {
            this.detailFooterLead.textContent = footerContent.lead;
        }

        if (this.detailFooterMurmur) {
            this.detailFooterMurmur.textContent = footerContent.murmur;
        }

        if (this.detailFooterClosing) {
            this.detailFooterClosing.textContent = footerContent.closing;
        }

        if (!this.detailFooterNextLink || !this.detailFooterNextName || !this.detailFooterNextCopy) {
            return;
        }

        if (!footerContent.nextSpot) {
            this.detailFooterNextLink.removeAttribute('href');
            this.detailFooterNextLink.removeAttribute('data-related-id');
            this.detailFooterNextName.textContent = '再去看一片更适合的海';
            this.detailFooterNextCopy.textContent = '从这片海离开以后，还可以回到首页，继续慢慢挑一片更适合此刻的蓝。';
            return;
        }

        this.detailFooterNextLink.href = `detail.html?id=${footerContent.nextSpot.id}`;
        this.detailFooterNextLink.dataset.relatedId = String(footerContent.nextSpot.id);
        this.detailFooterNextName.textContent = footerContent.nextSpot.name;
        this.detailFooterNextCopy.textContent = footerContent.nextSpot.description || '再往前一点，去看另一片与你此刻节奏更接近的蓝。';
    }

    /**
     * setupFooterReveal() - 监听 footer 进入视口，为三层收束内容添加缓慢显现动画
     * @returns {void} - 无返回值，直接注册 footer 的显现逻辑
     */
    setupFooterReveal() {
        if (!this.detailFooter) {
            return;
        }

        if (!('IntersectionObserver' in window)) {
            this.detailFooter.classList.add('is-visible', 'is-harbor-awake');
            return;
        }

        this.footerRevealObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add('is-visible', 'is-harbor-awake');
                this.footerRevealObserver?.unobserve(entry.target);
            });
        }, {
            threshold: 0.2,
            rootMargin: '0px 0px -8% 0px'
        });

        this.footerRevealObserver.observe(this.detailFooter);
    }

    /**
     * setupFooterNavigation() - 绑定 footer 内部的页内跳转入口和“下一片海”相关推荐入口
     * @returns {void} - 无返回值，直接注册 footer 交互事件
     */
    setupFooterNavigation() {
        if (!this.detailFooter) {
            return;
        }

        this.detailFooter.addEventListener('click', (event) => {
            if (event.defaultPrevented) {
                return;
            }

            const scrollTrigger = event.target.closest('[data-detail-scroll]');
            if (scrollTrigger) {
                event.preventDefault();
                const selector = scrollTrigger.dataset.detailScroll;
                if (!selector) {
                    return;
                }

                this.scrollToSeaGuideTarget(selector);
                return;
            }

            const nextSpotCard = event.target.closest('#detailFooterNextLink[data-related-id]');
            if (!nextSpotCard) {
                return;
            }

            const relatedId = Number(nextSpotCard.dataset.relatedId);
            if (!Number.isFinite(relatedId) || relatedId === this.spotId) {
                return;
            }

            event.preventDefault();
            this.startRelatedSpotTransitionById(relatedId, nextSpotCard);
        });
    }

    // 页面事件总线：集中监听套餐、评论、地图切换、弹窗关闭和相关推荐点击。
    /**
     * setupEventListeners() - 绑定详情页所有主要交互事件
     * @returns {void} - 无返回值，直接注册事件监听
     */
    setupEventListeners() {
        if (this.mapContainer) {
            this.mapContainer.addEventListener('click', (event) => {
                const tabButton = event.target.closest('.sea-atlas-tab');
                if (!tabButton) {
                    const resetViewButton = event.target.closest('[data-sea-atlas-reset-view]');
                    if (resetViewButton) {
                        event.preventDefault();
                        this.resetSeaAtlasViewport(resetViewButton.dataset.seaAtlasTarget || 'inline');
                        return;
                    }

                    const openMapButton = event.target.closest('[data-sea-atlas-open-fullscreen]');
                    if (!openMapButton) {
                        return;
                    }

                    event.preventDefault();
                    this.openSeaAtlasFullscreen();
                    return;
                }

                this.setSeaAtlasView(tabButton.dataset.seaView);
            });
        }

        if (this.seaAtlasFullscreen) {
            this.seaAtlasFullscreen.addEventListener('click', (event) => {
                const closeButton = event.target.closest('[data-sea-atlas-close-fullscreen]');
                if (closeButton) {
                    event.preventDefault();
                    this.closeSeaAtlasFullscreen();
                    return;
                }

                const resetButton = event.target.closest('[data-sea-atlas-reset-view][data-sea-atlas-target="fullscreen"]');
                if (resetButton) {
                    event.preventDefault();
                    this.resetSeaAtlasViewport('fullscreen');
                }
            });
        }

        if (this.itineraryList) {
            this.itineraryList.addEventListener('click', (event) => {
                if (event.defaultPrevented) {
                    return;
                }

                const packageButton = event.target.closest('.package-card-action');
                if (packageButton) {
                    event.preventDefault();
                    this.openBookingModal(packageButton.dataset.packageId, packageButton.closest('.package-card'));
                    return;
                }

                const packageCard = event.target.closest('.package-card');
                if (!packageCard) {
                    return;
                }

                this.openBookingModal(packageCard.dataset.packageId, packageCard);
            });

            this.itineraryList.addEventListener('keydown', (event) => {
                if (event.defaultPrevented) {
                    return;
                }

                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                const packageCard = event.target.closest('.package-card');
                if (!packageCard) {
                    return;
                }

                event.preventDefault();
                this.openBookingModal(packageCard.dataset.packageId, packageCard);
            });
        }

        if (this.bookingFocusAction) {
            this.bookingFocusAction.addEventListener('click', () => {
                const packageId = this.bookingFocusAction.dataset.packageId || this.selectedPackageId;
                if (!packageId) {
                    return;
                }

                const sourceCard = this.isBookingFocusOnlyContext()
                    ? this.bookingFocusPanel
                    : this.getPackageCardById(packageId);
                this.openBookingModal(packageId, sourceCard);
            });
        }

        if (this.reviewsFilters) {
            this.reviewsFilters.addEventListener('click', (event) => {
                const filterButton = event.target.closest('.review-filter');
                if (!filterButton) {
                    return;
                }

                const nextFilter = filterButton.dataset.filter || 'all';
                if (nextFilter === this.activeReviewFilter) {
                    return;
                }

                this.activeReviewFilter = nextFilter;
                this.renderReviews();
            });
        }

        if (this.reviewsSection) {
            this.reviewsSection.addEventListener('click', (event) => {
                const detailButton = event.target.closest('.review-detail-trigger');
                if (detailButton) {
                    this.openReviewDetail(detailButton.dataset.reviewId);
                    return;
                }

                const expandButton = event.target.closest('.review-expand');
                if (expandButton) {
                    const reviewCard = expandButton.closest('.review-card');
                    if (!reviewCard) {
                        return;
                    }

                    const isExpanded = reviewCard.classList.toggle('is-expanded');
                    expandButton.textContent = isExpanded ? '收起全文' : '展开全文';
                    return;
                }

                const photoButton = event.target.closest('.review-photo-button');
                if (!photoButton) {
                    return;
                }

                this.openReviewLightbox(
                    photoButton.dataset.lightboxSrc,
                    photoButton.dataset.lightboxAlt,
                    photoButton.dataset.lightboxCaption
                );
            });
        }

        if (this.packageMatchTags) {
            this.packageMatchTags.addEventListener('click', (event) => {
                const matchLink = event.target.closest('.booking-match-link[data-match-key]');
                if (!matchLink) {
                    return;
                }

                const matchKey = matchLink.dataset.matchKey;
                if (!matchKey) {
                    return;
                }

                event.preventDefault();
                this.openBookingMatchConfirmation(matchKey, {
                    source: 'sidebar',
                    triggerElement: matchLink,
                    label: matchLink.textContent
                });
            });
        }

        if (this.bookingNote) {
            this.bookingNote.addEventListener('click', (event) => {
                const confirmLink = event.target.closest('.booking-note-link[href]');
                if (!confirmLink) {
                    return;
                }

                event.preventDefault();
                navigateWithDepth(confirmLink.getAttribute('href'));
            });
        }

        if (this.bookingConfirmFeedback) {
            this.bookingConfirmFeedback.addEventListener('click', (event) => {
                const goTripLink = event.target.closest('#bookingConfirmGoTrip[href]');
                if (goTripLink) {
                    event.preventDefault();
                    this.hideBookingConfirmedFeedback({ immediate: true });
                    window.requestAnimationFrame(() => {
                        navigateWithDepth(goTripLink.getAttribute('href'));
                    });
                    return;
                }

                if (
                    event.target === this.bookingConfirmFeedback ||
                    event.target.closest('[data-close-booking-feedback]') ||
                    event.target.closest('#bookingConfirmStay')
                ) {
                    this.hideBookingConfirmedFeedback();
                }
            });
        }

        if (this.bookingModal) {
            this.bookingModal.addEventListener('click', (event) => {
                if (event.target === this.bookingModal || event.target.closest('.modal-close') || event.target.closest('.package-modal-secondary')) {
                    this.closeBookingModal();
                    return;
                }

                const matchConfirmAction = event.target.closest('[data-booking-match-confirm-action]');
                if (matchConfirmAction) {
                    event.preventDefault();
                    this.handleBookingMatchConfirmationAction(matchConfirmAction.dataset.bookingMatchConfirmAction);
                    return;
                }

                const matchLink = event.target.closest('.booking-match-link[data-match-key]');
                if (matchLink) {
                    const matchKey = matchLink.dataset.matchKey;
                    if (!matchKey) {
                        return;
                    }

                    event.preventDefault();
                    this.openBookingMatchConfirmation(matchKey, {
                        source: 'modal',
                        triggerElement: matchLink,
                        label: matchLink.textContent,
                        packageId: this.getActiveBookingModalPackageId()
                    });
                    return;
                }

                const priceToggle = event.target.closest('[data-package-price-editor-toggle]');
                if (priceToggle) {
                    const packageId = priceToggle.dataset.packagePriceEditorToggle || this.selectedPackageId;
                    if (!packageId) {
                        return;
                    }

                    const currentState = this.getPackageModalViewState(packageId);
                    const nextEditorOpen = !currentState?.isEditorOpen;
                    if (nextEditorOpen) {
                        this.updatePackageModalDraft(packageId, {
                            isEditorOpen: true,
                            focusField: currentState?.focusField || ''
                        });
                        if (this.syncPackageModalEditorDomState(packageId, true)) {
                            this.runPackageModalEditorOpenMotion(packageId);
                        } else {
                            this.renderBookingModalMarkup(packageId, {
                                preserveBodyScroll: true,
                                animatePriceEditor: 'open'
                            });
                        }
                    } else {
                        this.closePackageModalEditorWithMotion(packageId);
                    }
                    return;
                }

                const editorFocusChip = event.target.closest('[data-package-editor-focus][data-package-id]');
                if (editorFocusChip) {
                    const packageId = editorFocusChip.dataset.packageId;
                    const focusField = this.normalizePackageModalEditorFocusField(editorFocusChip.dataset.packageEditorFocus);
                    if (!packageId || !focusField) {
                        return;
                    }

                    const currentState = this.getPackageModalViewState(packageId);
                    this.updatePackageModalDraft(packageId, {
                        isEditorOpen: true,
                        focusField
                    });
                    if (currentState?.isEditorOpen && this.syncPackageModalEditorDomState(packageId, true)) {
                        window.requestAnimationFrame(() => {
                            this.focusPackageModalEditorField(packageId, focusField);
                        });
                        return;
                    }

                    if (this.syncPackageModalEditorDomState(packageId, true)) {
                        this.runPackageModalEditorOpenMotion(packageId);
                    } else {
                        this.renderBookingModalMarkup(packageId, {
                            preserveBodyScroll: true,
                            animatePriceEditor: 'open'
                        });
                    }
                    window.requestAnimationFrame(() => {
                        this.focusPackageModalEditorField(packageId, focusField);
                    });
                    return;
                }

                const customDurationToggle = event.target.closest('[data-package-custom-duration-toggle]');
                if (customDurationToggle) {
                    const packageId = customDurationToggle.dataset.packageCustomDurationToggle || this.selectedPackageId;
                    if (!packageId) {
                        return;
                    }

                    this.updatePackageModalDraft(packageId, {
                        isEditorOpen: true,
                        focusField: 'duration',
                        isCustomDurationOpen: true
                    });
                    this.renderBookingModalMarkup(packageId, { preserveBodyScroll: true });
                    window.requestAnimationFrame(() => {
                        this.focusPackageModalCustomDurationInput(packageId);
                    });
                    return;
                }

                const durationOption = event.target.closest('[data-package-duration-days][data-package-id]');
                if (durationOption) {
                    const packageId = durationOption.dataset.packageId;
                    const nextDays = Number(durationOption.dataset.packageDurationDays);
                    if (!packageId || !Number.isFinite(nextDays)) {
                        return;
                    }

                    this.updatePackageModalDraft(packageId, {
                        days: nextDays,
                        isEditorOpen: true,
                        focusField: 'duration',
                        isCustomDurationOpen: false
                    });
                    this.renderBookingModalMarkup(packageId, { preserveBodyScroll: true });
                    return;
                }

                const customDurationApply = event.target.closest('[data-package-custom-duration-apply]');
                if (customDurationApply) {
                    const packageId = customDurationApply.dataset.packageCustomDurationApply || this.selectedPackageId;
                    if (!packageId) {
                        return;
                    }

                    this.applyPackageModalCustomDuration(packageId);
                    return;
                }

                const windowOption = event.target.closest('[data-package-window-key][data-package-id]');
                if (windowOption) {
                    const packageId = windowOption.dataset.packageId;
                    const windowKey = windowOption.dataset.packageWindowKey;
                    if (!packageId || !windowKey) {
                        return;
                    }

                    this.updatePackageModalDraft(packageId, {
                        windowKey,
                        isEditorOpen: true,
                        focusField: 'window'
                    });
                    this.renderBookingModalMarkup(packageId, { preserveBodyScroll: true });
                    return;
                }

                const peopleOption = event.target.closest('[data-package-people-value][data-package-id]');
                if (peopleOption) {
                    const packageId = peopleOption.dataset.packageId;
                    const peopleValue = this.normalizePackageModalPeopleValue(peopleOption.dataset.packagePeopleValue);
                    if (!packageId) {
                        return;
                    }

                    this.updatePackageModalDraft(packageId, {
                        peopleValue,
                        isEditorOpen: true,
                        focusField: 'people',
                        isCustomPeopleOpen: false
                    });
                    this.renderBookingModalMarkup(packageId, { preserveBodyScroll: true });
                    return;
                }

                const customPeopleToggle = event.target.closest('[data-package-custom-people-toggle]');
                if (customPeopleToggle) {
                    const packageId = customPeopleToggle.dataset.packageCustomPeopleToggle || this.selectedPackageId;
                    if (!packageId) {
                        return;
                    }

                    this.updatePackageModalDraft(packageId, {
                        isEditorOpen: true,
                        focusField: 'people',
                        isCustomPeopleOpen: true
                    });
                    this.renderBookingModalMarkup(packageId, { preserveBodyScroll: true });
                    window.requestAnimationFrame(() => {
                        this.focusPackageModalCustomPeopleInput(packageId);
                    });
                    return;
                }

                const customPeopleApply = event.target.closest('[data-package-custom-people-apply]');
                if (customPeopleApply) {
                    const packageId = customPeopleApply.dataset.packageCustomPeopleApply || this.selectedPackageId;
                    if (!packageId) {
                        return;
                    }

                    this.applyPackageModalCustomPeople(packageId);
                    return;
                }

                const confirmButton = event.target.closest('.package-modal-primary');
                if (confirmButton) {
                    this.confirmBooking(confirmButton.dataset.packageId);
                }
            });

            this.bookingModal.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') {
                    return;
                }

                const customDurationInput = event.target.closest('[data-package-custom-duration-input][data-package-id]');
                if (customDurationInput) {
                    event.preventDefault();
                    this.applyPackageModalCustomDuration(customDurationInput.dataset.packageId, customDurationInput.value);
                    return;
                }

                const customPeopleInput = event.target.closest('[data-package-custom-people-input][data-package-id]');
                if (!customPeopleInput) {
                    return;
                }

                event.preventDefault();
                this.applyPackageModalCustomPeople(customPeopleInput.dataset.packageId, customPeopleInput.value);
            });
        }

        if (this.reviewDetailModal) {
            this.reviewDetailModal.addEventListener('click', (event) => {
                if (event.target === this.reviewDetailModal || event.target.closest('.review-detail-close')) {
                    this.closeReviewDetail();
                    return;
                }

                const photoButton = event.target.closest('.review-detail-photo-button');
                if (!photoButton) {
                    return;
                }

                this.openReviewLightbox(
                    photoButton.dataset.lightboxSrc,
                    photoButton.dataset.lightboxAlt,
                    photoButton.dataset.lightboxCaption
                );
            });
        }

        if (this.reviewLightbox) {
            this.reviewLightbox.addEventListener('click', (event) => {
                if (event.target === this.reviewLightbox || event.target.closest('.review-lightbox-close')) {
                    this.closeReviewLightbox();
                }
            });
        }

        if (this.bookingMatchFloatingRoot) {
            this.bookingMatchFloatingRoot.addEventListener('click', (event) => {
                const actionButton = event.target.closest('[data-booking-match-confirm-action]');
                if (!actionButton) {
                    return;
                }

                event.preventDefault();
                this.handleBookingMatchConfirmationAction(actionButton.dataset.bookingMatchConfirmAction);
            });
        }

        document.addEventListener('click', (event) => {
            if (!this.isBookingMatchConfirmationVisible('sidebar')) {
                return;
            }

            if (this.bookingMatchFloatingRoot?.contains(event.target)) {
                return;
            }

            if (event.target.closest('.booking-match-link[data-match-key]')) {
                return;
            }

            this.closeBookingMatchConfirmation({
                restoreFocus: false,
                source: 'sidebar'
            });
        });

        window.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') {
                return;
            }

            if (this.seaAtlasFullscreenOpen) {
                this.closeSeaAtlasFullscreen();
                return;
            }

            if (this.reviewLightbox && this.reviewLightbox.classList.contains('active')) {
                this.closeReviewLightbox();
                return;
            }

            if (this.isBookingMatchConfirmationVisible()) {
                this.closeBookingMatchConfirmation({
                    restoreFocus: true
                });
                return;
            }

            if (this.bookingConfirmFeedback && this.bookingConfirmFeedback.classList.contains('active')) {
                this.hideBookingConfirmedFeedback();
                return;
            }

            if (this.reviewDetailModal && this.reviewDetailModal.classList.contains('active')) {
                this.closeReviewDetail();
                return;
            }

            if (this.bookingModal && this.bookingModal.classList.contains('active')) {
                this.closeBookingModal();
            }
        });

        let reviewExpandSyncFrame = 0;
        const requestReviewExpandSync = () => {
            if (reviewExpandSyncFrame) {
                return;
            }

            reviewExpandSyncFrame = window.requestAnimationFrame(() => {
                reviewExpandSyncFrame = 0;
                this.syncReviewExpandButtons();
            });
        };

        let seaRouteLayoutSyncFrame = 0;
        const requestSeaRouteLayoutSync = () => {
            if (seaRouteLayoutSyncFrame) {
                return;
            }

            seaRouteLayoutSyncFrame = window.requestAnimationFrame(() => {
                seaRouteLayoutSyncFrame = 0;
                this.syncSeaRouteLayoutOnResize();
            });
        };

        window.addEventListener('resize', requestReviewExpandSync);
        window.addEventListener('resize', requestSeaRouteLayoutSync);
        window.addEventListener('resize', () => {
            this.closeBookingMatchConfirmation({
                immediate: true,
                restoreFocus: false,
                source: 'sidebar'
            });
        });
        window.addEventListener('scroll', () => {
            this.closeBookingMatchConfirmation({
                immediate: true,
                restoreFocus: false,
                source: 'sidebar'
            });
        }, { passive: true });
        if (document.fonts?.ready) {
            document.fonts.ready.then(() => {
                requestReviewExpandSync();
            }).catch(() => {});
        }
        window.setTimeout(() => {
            requestReviewExpandSync();
        }, 180);
    }

    /**
     * openBookingModal(packageId) - 打开指定套餐的详情弹层
     * @param {string} packageId - 套餐 ID
     * @returns {void} - 无返回值，直接显示套餐弹层
     */
    openBookingModal(packageId, sourceCard = null) {
        const pkg = this.getPackageById(packageId);
        if (!pkg || !this.bookingModal || !this.bookingModalBody) {
            return;
        }

        this.clearBookingMatchConfirmationImmediately({
            restoreFocus: false
        });
        this.resetBookingModalNavigateAwayState();
        const sourceState = this.capturePackageSourceState(packageId, sourceCard);
        this.clearBookingModalMorph();
        this.cacheBookingModalSourceSnapshot(packageId, sourceState);

        if (this.bookingModalCloseTimer) {
            window.clearTimeout(this.bookingModalCloseTimer);
            this.bookingModalCloseTimer = 0;
        }
        if (this.packageModalEditorCloseTimer) {
            window.clearTimeout(this.packageModalEditorCloseTimer);
            this.packageModalEditorCloseTimer = 0;
        }
        this.packageModalEditorTransitioning = false;
        this.cancelPackageModalEditorStateMotion();

        this.selectedPackageId = pkg.id;
        this.syncPackageCardSelection(pkg.id);
        const currentModalState = this.getPackageModalViewState(pkg.id);
        this.updatePackageModalDraft(pkg.id, {
            isEditorOpen: false,
            focusField: '',
            isCustomDurationOpen: Boolean(currentModalState?.isCustomDurationSelected)
        });
        this.renderBookingModalMarkup(pkg.id);
        this.bookingModal.classList.remove('is-closing');
        this.bookingModal.setAttribute('aria-hidden', 'false');
        this.bookingModal.querySelector('.booking-modal-content')?.classList.add('is-morphing');

        window.requestAnimationFrame(() => {
            if (!this.bookingModal) {
                return;
            }

            this.bookingModal.classList.add('active');
            this.syncOverlayLock();

            window.requestAnimationFrame(() => {
                this.startBookingModalMorph(pkg.id, sourceState);
            });
        });
    }

    // 详情页海图导览：
    // 负责悬浮导览、正文区块同步高亮，以及在不同内容层之间做平缓移动。
    /**
     * getSeaGuideOffset() - 计算海图导览滚动定位时需要避开的顶部导航偏移量
     * @returns {number} - 用于滚动定位的顶部偏移值
     */
    getSeaGuideOffset(forceMeasure = false) {
        if (!forceMeasure && Number.isFinite(this.detailSeaGuideOffset)) {
            return this.detailSeaGuideOffset;
        }

        const navbar = document.querySelector('.navbar');
        this.detailSeaGuideOffset = (navbar ? navbar.offsetHeight : 72) + 18;
        return this.detailSeaGuideOffset;
    }

    /**
     * setSeaGuideOpen(isOpen) - 切换详情页海图导览的展开或收起状态
     * @param {boolean} isOpen - 是否展开海图导览
     * @returns {void} - 无返回值，直接更新面板状态
     */
    setSeaGuideOpen(isOpen) {
        if (!this.seaGuide || !this.seaGuideTrigger || !this.seaGuidePanel) {
            return;
        }

        this.seaGuideOpen = Boolean(isOpen);
        this.seaGuide.classList.toggle('is-open', this.seaGuideOpen);
        this.seaGuideTrigger.setAttribute('aria-expanded', String(this.seaGuideOpen));
        this.seaGuidePanel.setAttribute('aria-hidden', String(!this.seaGuideOpen));
    }

    /**
     * scrollToSeaGuideTarget(selector) - 平滑滚动到海图导览选中的目标区块
     * @param {string} selector - 目标区块的 CSS 选择器
     * @returns {Promise<void>} - 滚动完成时返回的 Promise
     */
    scrollToSeaGuideTarget(selector) {
        this.primeDeferredSection(selector);
        const target = document.querySelector(selector);
        if (!target) {
            return Promise.resolve();
        }

        const targetY = target.getBoundingClientRect().top + window.scrollY - this.getSeaGuideOffset();

        if (window.OceanScroll && typeof window.OceanScroll.animateTo === 'function') {
            return window.OceanScroll.animateTo(targetY, {
                duration: selector === '#detailHero' ? 1700 : 1520
            });
        }

        window.scrollTo({
            top: targetY,
            behavior: 'smooth'
        });
        return Promise.resolve();
    }

    /**
     * getCurrentSeaGuideKey() - 计算当前阅读位置更接近哪一个海图导览区块
     * @returns {string} - 当前应高亮的海图导览 key
     */
    getCurrentSeaGuideKey() {
        if (!this.seaGuideMetrics.length) {
            return '';
        }

        const scrollY = window.scrollY || window.pageYOffset || 0;
        const probeY = scrollY + this.getSeaGuideOffset() + Math.min(window.innerHeight * 0.24, 220);
        let currentKey = this.seaGuideMetrics[0].key || '';

        this.seaGuideMetrics.forEach((metric) => {
            if (probeY >= metric.top - 24) {
                currentKey = metric.key || currentKey;
            }
        });

        return currentKey;
    }

    /**
     * updateSeaGuideState() - 同步海图导览的显隐、深层状态和当前区块高亮
     * @returns {void} - 无返回值，直接更新导览状态
     */
    updateSeaGuideState() {
        this.syncBookingReadingGuide();
        this.syncBookingCopyDepthState();
        this.syncBookingStickyScrollWithReading();
        this.syncPackageSelectionFromCurrentReview();
        this.scheduleIntroCardShellReveal();
        this.scheduleIntroCardContentReveal();
        this.scheduleReviewCardShellReveal();
        this.revealReviewGalleryPhotos();
        this.scheduleReviewCardContentReveal();

        if (!this.seaGuide || !this.seaGuideEntries.length) {
            return;
        }

        const scrollTop = window.scrollY || window.pageYOffset || 0;
        const isVisible = scrollTop > 180;
        const isDeep = scrollTop > Math.max(window.innerHeight * 0.85, 760);
        const currentKey = this.getCurrentSeaGuideKey();

        this.seaGuide.classList.toggle('is-visible', isVisible);
        this.seaGuide.classList.toggle('is-deep', isDeep);
        this.seaGuide.setAttribute('aria-hidden', String(!isVisible));

        this.seaGuideEntries.forEach((entry) => {
            const isCurrent = entry.dataset.key === currentKey;
            entry.classList.toggle('is-current', isCurrent);
            entry.setAttribute('aria-current', isCurrent ? 'true' : 'false');
        });
    }

    /**
     * setupSeaGuide() - 初始化详情页海图导览的展开、关闭和滚动高亮逻辑
     * @returns {void} - 无返回值，直接注册详情页海图导览事件
     */
    setupSeaGuide() {
        if (!this.seaGuide || !this.seaGuideTrigger || !this.seaGuideEntries.length) {
            return;
        }

        this.seaGuideInitialized = true;

        const requestStateUpdate = () => {
            if (this.seaGuideUpdateRaf) {
                return;
            }

            this.seaGuideUpdateRaf = window.requestAnimationFrame(() => {
                this.seaGuideUpdateRaf = 0;
                this.updateSeaGuideState();
            });
        };
        const requestLayoutMeasure = () => {
            this.scheduleDetailScrollMetricsMeasure();
            requestStateUpdate();
        };
        // 和首页海图导览一样，这里把滚动状态更新压到动画帧中，
        // 避免滚动过程中连续读布局导致高亮抖动。

        this.seaGuideTrigger.addEventListener('click', (event) => {
            event.preventDefault();
            this.setSeaGuideOpen(!this.seaGuideOpen);
        });

        this.seaGuideEntries.forEach((entry) => {
            entry.addEventListener('click', () => {
                const selector = entry.dataset.target;
                this.setSeaGuideOpen(false);
                if (!selector) {
                    return;
                }

                this.primeDeferredSection(selector);
                this.scrollToSeaGuideTarget(selector);
            });
        });

        document.addEventListener('click', (event) => {
            if (!this.seaGuideOpen || this.seaGuide.contains(event.target)) {
                return;
            }

            this.setSeaGuideOpen(false);
        });

        window.addEventListener('keydown', (event) => {
            const hasOverlayOpen =
                (this.reviewLightbox && this.reviewLightbox.classList.contains('active')) ||
                (this.reviewDetailModal && this.reviewDetailModal.classList.contains('active')) ||
                (this.bookingConfirmFeedback && this.bookingConfirmFeedback.classList.contains('active')) ||
                (this.bookingModal && this.bookingModal.classList.contains('active'));

            if (event.key === 'Escape' && this.seaGuideOpen && !hasOverlayOpen) {
                this.setSeaGuideOpen(false);
            }
        });

        window.addEventListener('scroll', requestStateUpdate, { passive: true });
        window.addEventListener('resize', requestLayoutMeasure);

        if ('ResizeObserver' in window) {
            this.detailScrollMetricsResizeObserver = new ResizeObserver(requestLayoutMeasure);
            [
                this.introSection,
                this.spotMapHeading,
                this.mapContainer,
                this.spotReviewsHeading,
                this.reviewsStage,
                this.reviewsSection,
                this.relatedSection
            ].forEach((element) => {
                if (element) {
                    this.detailScrollMetricsResizeObserver.observe(element);
                }
            });
        }

        window.setTimeout(() => {
            this.measureDetailScrollMetrics();
            this.updateSeaGuideState();
        }, 80);
    }

    /**
     * setupNavigation() - 绑定详情页头像返回登录等页面级导航行为
     * @returns {void} - 无返回值，直接注册导航事件
     */
    setupNavigation() {
        window.YanqiAvatarReturn?.bind({
            targetUrl: 'index.html'
        });
    }

    // 相关推荐切页生命周期：处理进入时接续动画、离场写状态和资源预加载。
    /**
     * setupRelatedTransitionLifecycle() - 初始化相关推荐切页状态恢复与清理逻辑
     * @returns {void} - 无返回值，直接注册页面生命周期事件
     */
    setupRelatedTransitionLifecycle() {
        window.addEventListener('pageshow', (event) => {
            if (!event.persisted) {
                return;
            }

            this.applyIncomingRelatedTransition(true);
        });

        window.addEventListener('pagehide', () => {
            this.teardownBookingModalForPageExit();
            this.setBookingStickyFocusContextPhase('');

            if (this.inDocumentDetailSwapTimer) {
                window.clearTimeout(this.inDocumentDetailSwapTimer);
                this.inDocumentDetailSwapTimer = 0;
            }

            this.isInDocumentDetailSwapping = false;

            if (this.relatedEntryRevealTimer) {
                window.clearTimeout(this.relatedEntryRevealTimer);
                this.relatedEntryRevealTimer = 0;
            }

            if (this.relatedTransitionCleanupTimer) {
                window.clearTimeout(this.relatedTransitionCleanupTimer);
                this.relatedTransitionCleanupTimer = 0;
            }

            if (this.relatedStageSwitchTimer) {
                window.clearTimeout(this.relatedStageSwitchTimer);
                this.relatedStageSwitchTimer = 0;
            }

            if (this.relatedStageCleanupTimer) {
                window.clearTimeout(this.relatedStageCleanupTimer);
                this.relatedStageCleanupTimer = 0;
            }

            if (this.relatedGrid) {
                const stageShells = Array.from(this.relatedGrid.querySelectorAll('.related-stage-shell'));
                const preservedStage = stageShells[stageShells.length - 1]
                    || this.relatedGrid.querySelector('.related-stage-shell');

                this.relatedGrid.classList.remove(
                    'is-navigating',
                    'is-entering',
                    'is-flow-forward',
                    'is-flow-backward',
                    'is-switching',
                    'is-stage-switching'
                );
                this.relatedGrid.style.removeProperty('min-height');
                this.relatedGrid.querySelectorAll('.is-leaving').forEach((card) => card.classList.remove('is-leaving'));

                stageShells.forEach((stage) => {
                    if (preservedStage && stage !== preservedStage) {
                        stage.remove();
                        return;
                    }

                    stage.classList.remove(
                        'is-stage-outgoing',
                        'is-stage-incoming',
                        'is-stage-active',
                        'is-stacked-stage',
                        'is-flow-forward',
                        'is-flow-backward'
                    );
                    stage.removeAttribute('aria-hidden');
                });
            }

            this.resetRelatedSwapClasses();
            this.clearPressedRelatedCard();
        });
    }

    /**
     * getFreshDetailSwapState() - 读取当前仍然有效的相关推荐切页状态
     * @returns {Object|null} - 切页状态对象或空值
     */
    getFreshDetailSwapState() {
        return readDetailSwapState();
    }

    // 相关推荐过渡恢复：根据 sessionStorage 状态决定前进进入还是后退返回动画。
    /**
     * applyIncomingRelatedTransition(fromPageShow) - 根据暂存状态恢复相关推荐切页动画
     * @param {boolean} fromPageShow - 是否由 pageshow 事件触发
     * @returns {void} - 无返回值，直接播放对应动画
     */
    applyIncomingRelatedTransition(fromPageShow = false) {
        const state = this.getFreshDetailSwapState();
        if (!state) {
            return;
        }

        if (state.toId === this.spotId) {
            if (!state.forwardConsumed) {
                this.playRelatedSwapAnimation('detail-swap-enter', state.direction);
                markDetailSwapForwardConsumed(state);
            }
            return;
        }

        if ((fromPageShow || this.navigationType === 'back_forward') && state.fromId === this.spotId) {
            this.playRelatedSwapAnimation('detail-swap-back-enter', reverseDetailSwapDirection(state.direction));
        }
    }

    /**
     * playRelatedSwapAnimation(className) - 播放相关推荐详情页切换动画
     * @param {string} className - 需要应用的动画 class
     * @returns {void} - 无返回值，直接更新页面状态
     */
    playRelatedSwapAnimation(className, direction = 'forward') {
        if (!this.body || !this.pageStage) {
            return;
        }

        this.resetRelatedSwapClasses();

        window.requestAnimationFrame(() => {
            this.body.classList.add(
                'detail-swap-active',
                className,
                normalizeDetailSwapDirection(direction) === 'backward' ? 'detail-swap-flow-backward' : 'detail-swap-flow-forward'
            );
        });

        if (this.relatedTransitionCleanupTimer) {
            window.clearTimeout(this.relatedTransitionCleanupTimer);
        }

        this.relatedTransitionCleanupTimer = window.setTimeout(() => {
            this.resetRelatedSwapClasses();
            this.relatedTransitionCleanupTimer = 0;
        }, DETAIL_SWAP_DURATION_MS + 60);
    }

    /**
     * resetRelatedSwapClasses() - 清理相关推荐切页相关的页面状态 class
     * @returns {void} - 无返回值，直接移除动画 class
     */
    resetRelatedSwapClasses() {
        if (!this.body) {
            return;
        }

        this.body.classList.remove(...DETAIL_SWAP_CLASSES);
    }

    // 相关推荐点击态：管理卡片按下反馈和最终跳转前的视觉状态。
    /**
     * setPressedRelatedCard(card) - 记录当前按下的相关推荐卡片并更新其按压态
     * @param {Element|null} card - 当前按下的卡片元素
     * @returns {void} - 无返回值，直接更新卡片状态
     */
    setPressedRelatedCard(card) {
        if (this.pressedRelatedCard && this.pressedRelatedCard !== card) {
            this.pressedRelatedCard.classList.remove('is-pressed');
        }

        this.pressedRelatedCard = card;

        if (this.pressedRelatedCard) {
            this.pressedRelatedCard.classList.add('is-pressed');
        }
    }

    /**
     * clearPressedRelatedCard(card) - 清理相关推荐卡片的按压状态
     * @param {Element|null} card - 需要清理的卡片元素
     * @returns {void} - 无返回值，直接移除按压态
     */
    clearPressedRelatedCard(card = null) {
        const targetCard = card || this.pressedRelatedCard;
        if (!targetCard) {
            return;
        }

        targetCard.classList.remove('is-pressed');

        if (!card || this.pressedRelatedCard === card) {
            this.pressedRelatedCard = null;
        }
    }

    /**
     * startRelatedSpotTransition(card) - 从当前详情页切换到点击的相关推荐详情页
     * @param {Element} card - 被点击的相关推荐卡片元素
     * @returns {void} - 无返回值，直接启动切页流程
     */
    /**
     * startRelatedSpotTransitionById(targetId, sourceElement) - 以统一的跨详情页转场逻辑跳往目标潜点
     * @param {number} targetId - 目标潜点 ID
     * @param {Element|null} sourceElement - 触发本次切换的来源元素
     * @returns {void} - 无返回值，直接启动切页动画和导航
     */
    startRelatedSpotTransitionById(targetId, sourceElement = null) {
        if (!Number.isFinite(targetId) || targetId === this.spotId) {
            if (sourceElement) {
                sourceElement.classList.remove('is-pressed');
            }
            return;
        }

        if (this.relatedTransitionTimer) {
            window.clearTimeout(this.relatedTransitionTimer);
            this.relatedTransitionTimer = 0;
        }

        if (this.relatedTransitionCleanupTimer) {
            window.clearTimeout(this.relatedTransitionCleanupTimer);
            this.relatedTransitionCleanupTimer = 0;
        }

        if (sourceElement) {
            sourceElement.classList.add('is-pressed');
        }

        const sourceCard = sourceElement?.closest('.related-feature-card') || null;
        if (this.relatedGrid && sourceCard && this.relatedGrid.contains(sourceCard)) {
            this.relatedGrid.classList.add('is-navigating');
            sourceCard.classList.add('is-leaving');
        }

        const direction = targetId > this.spotId ? 'forward' : 'backward';
        this.resetRelatedSwapClasses();
        writeDetailSwapState(this.spotId, targetId, direction);
        sessionStorage.setItem('yanqi_depth_current', '-50');
        this.playRelatedSwapAnimation('detail-swap-exit', direction);

        this.relatedTransitionTimer = window.setTimeout(() => {
            this.relatedTransitionTimer = 0;
            window.location.href = `detail.html?id=${targetId}`;
        }, DETAIL_SWAP_NAVIGATE_DELAY_MS);

        this.relatedTransitionCleanupTimer = window.setTimeout(() => {
            this.relatedTransitionCleanupTimer = 0;
            if (sourceElement) {
                sourceElement.classList.remove('is-pressed');
            }
            if (this.relatedGrid) {
                this.relatedGrid.classList.remove('is-navigating');
            }
            sourceCard?.classList.remove('is-leaving');
            this.resetRelatedSwapClasses();
        }, DETAIL_SWAP_DURATION_MS + 60);
    }

    startRelatedSpotTransition(card) {
        const targetId = Number(card.dataset.id);
        this.setPressedRelatedCard(card);
        this.startRelatedSpotTransitionById(targetId, card);
    }

    // 资源预加载：提前请求相关推荐详情页和首图，减少详情之间切换的等待感。
    /**
     * preloadRelatedAssets(relatedSpots) - 预加载相关推荐的图片和详情页资源
     * @param {Array<Object>} relatedSpots - 推荐潜点数据数组
     * @returns {void} - 无返回值，直接触发资源预取
     */
    preloadRelatedAssets(relatedSpots) {
        relatedSpots.forEach((spot) => {
            const preloadImage = new Image();
            preloadImage.decoding = 'async';
            preloadImage.src = divingSpotDetails[spot.id]?.image || spot.image;

            const href = new URL(`detail.html?id=${spot.id}`, window.location.href).href;
            if (document.head.querySelector(`link[data-detail-prefetch="${spot.id}"]`)) {
                return;
            }

            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = href;
            link.setAttribute('data-detail-prefetch', String(spot.id));
            document.head.appendChild(link);
        });
    }
}

// 详情页初始化入口：页面加载后创建单例实例，启动整页渲染与交互。
/**
 * document DOMContentLoaded 回调 - 初始化详情页主控制器
 * @returns {void} - 无返回值，直接启动详情页逻辑
 */
document.addEventListener('DOMContentLoaded', function () {
    setupStageDebugToggle();
    const detailPage = new DetailPage();
    if (isStageDebugModeEnabled) {
        window.__yanqiDetailPage = detailPage;
    }
});



