/* ============================================
   文本布局适配器 - text-layout-adapter.js
   ============================================
   职责：
   1. 封装 `pretext` 文本布局预测能力，提前计算多行文本高度。
   2. 减少动态卡片在渲染后因为文案长短不同产生的高度跳动。
   3. 提供批量应用、响应式刷新和缓存清理等通用能力。
   阅读顺序：
   1. 字体与尺寸工具
   2. 模块加载与缓存
   3. 单元素预测
   4. 批量应用与响应式挂载
*/
(function () {
    const PRETEXT_IMPORT_PATH = '../pretext-main/dist/layout.js';
    const PRETEXT_FONT_READY_TIMEOUT = 1200;
    const PREPARE_CACHE = new Map();
    let pretextModulePromise = null;

    function stableStringify(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return JSON.stringify(value ?? null);
        }

        const sorted = {};
        Object.keys(value).sort().forEach((key) => {
            sorted[key] = value[key];
        });

        return JSON.stringify(sorted);
    }

    function roundWidth(width) {
        if (!Number.isFinite(width)) {
            return 0;
        }

        return Math.max(0, Math.round(width * 100) / 100);
    }

    function parsePx(value, fallback) {
        const numeric = Number.parseFloat(String(value || '').replace('px', '').trim());
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    function getElementFont(style) {
        const shorthand = String(style.font || '').trim();
        if (shorthand && shorthand !== 'normal normal 400 16px / normal serif') {
            return shorthand;
        }

        const fontStyle = style.fontStyle || 'normal';
        const fontVariant = style.fontVariant || 'normal';
        const fontWeight = style.fontWeight || '400';
        const fontStretch = style.fontStretch && style.fontStretch !== 'normal' ? `${style.fontStretch} ` : '';
        const fontSize = style.fontSize || '16px';
        const fontFamily = style.fontFamily || 'sans-serif';

        return `${fontStyle} ${fontVariant} ${fontWeight} ${fontStretch}${fontSize} ${fontFamily}`.replace(/\s+/g, ' ').trim();
    }

    function getElementLineHeight(style) {
        const fontSize = parsePx(style.fontSize, 16);
        if (style.lineHeight === 'normal') {
            return Math.round(fontSize * 1.55 * 100) / 100;
        }

        const parsed = parsePx(style.lineHeight, NaN);
        return Number.isFinite(parsed) ? parsed : Math.round(fontSize * 1.55 * 100) / 100;
    }

    function getPrepareCacheKey(text, font, options) {
        return [text, font, stableStringify(options)].join('::');
    }

    function waitForFonts() {
        if (!document.fonts || typeof document.fonts.ready?.then !== 'function') {
            return Promise.resolve();
        }

        return Promise.race([
            document.fonts.ready.catch(() => undefined),
            new Promise((resolve) => window.setTimeout(resolve, PRETEXT_FONT_READY_TIMEOUT))
        ]);
    }

    function loadPretextModule() {
        if (!pretextModulePromise) {
            pretextModulePromise = import(PRETEXT_IMPORT_PATH)
                .then((module) => waitForFonts().then(() => module))
                .catch((error) => {
                    pretextModulePromise = null;
                    throw error;
                });
        }

        return pretextModulePromise;
    }

    async function getPreparedText(text, font, options) {
        const safeText = String(text ?? '');
        const key = getPrepareCacheKey(safeText, font, options);

        if (PREPARE_CACHE.has(key)) {
            return PREPARE_CACHE.get(key);
        }

        const module = await loadPretextModule();
        const prepared = module.prepare(safeText, font, options);
        PREPARE_CACHE.set(key, prepared);
        return prepared;
    }

    async function predictMetrics(config) {
        const text = String(config?.text ?? '');
        const font = String(config?.font || '').trim();
        const maxWidth = roundWidth(config?.width);
        const lineHeight = Number(config?.lineHeight);

        if (!text || !font || !Number.isFinite(maxWidth) || maxWidth <= 0 || !Number.isFinite(lineHeight) || lineHeight <= 0) {
            return {
                lineCount: 0,
                height: 0
            };
        }

        const prepared = await getPreparedText(text, font, config?.prepareOptions || {});
        const module = await loadPretextModule();
        return module.layout(prepared, maxWidth, lineHeight);
    }

    async function predictElementMetrics(element, options = {}) {
        if (!(element instanceof Element)) {
            return {
                lineCount: 0,
                height: 0
            };
        }

        const measurementTarget = options.measureElement instanceof Element ? options.measureElement : element;
        const width = roundWidth(
            Number(options.width) ||
            measurementTarget.clientWidth ||
            measurementTarget.getBoundingClientRect().width
        );

        if (!width) {
            return {
                lineCount: 0,
                height: 0
            };
        }

        const style = window.getComputedStyle(element);
        const text = options.text != null
            ? String(typeof options.text === 'function' ? options.text(element) : options.text)
            : String(element.textContent || '').trim();

        return predictMetrics({
            text,
            width,
            font: options.font || getElementFont(style),
            lineHeight: options.lineHeight || getElementLineHeight(style),
            prepareOptions: options.prepareOptions
        });
    }

    async function applyElementMetrics(element, options = {}) {
        const metrics = await predictElementMetrics(element, options);
        const pixelHeight = Math.ceil(metrics.height);

        if (pixelHeight > 0) {
            if (options.cssVar) {
                element.style.setProperty(options.cssVar, `${pixelHeight}px`);
            }

            if (options.apply !== false) {
                element.style.minHeight = `${pixelHeight}px`;
            }

            if (options.linesAttr !== false) {
                element.dataset.pretextLines = String(metrics.lineCount);
            }
        } else {
            if (options.cssVar) {
                element.style.removeProperty(options.cssVar);
            }

            if (options.apply !== false) {
                element.style.removeProperty('min-height');
            }

            if (options.linesAttr !== false) {
                delete element.dataset.pretextLines;
            }
        }

        return metrics;
    }

    async function applyBatch(root, specs) {
        if (!(root instanceof Element) || !Array.isArray(specs) || specs.length === 0) {
            return [];
        }

        const tasks = [];

        specs.forEach((spec) => {
            if (!spec?.selector) {
                return;
            }

            root.querySelectorAll(spec.selector).forEach((element) => {
                tasks.push(applyElementMetrics(element, spec));
            });
        });

        return Promise.all(tasks);
    }

    function mountResponsiveBatch(root, specs) {
        if (!(root instanceof Element) || !Array.isArray(specs) || specs.length === 0) {
            return null;
        }

        let destroyed = false;
        let rafId = 0;
        let fontListenerBound = false;

        const run = () => {
            if (destroyed) {
                return;
            }

            applyBatch(root, specs).catch(() => {
                // 这里故意静默失败：如果 pretext 尚未构建、或某个模块暂时不可用，
                // 页面仍然应该保持原样，不要打断现有交互。
            });
        };

        const schedule = () => {
            if (destroyed) {
                return;
            }

            if (rafId) {
                window.cancelAnimationFrame(rafId);
            }

            rafId = window.requestAnimationFrame(() => {
                rafId = 0;
                run();
            });
        };

        const resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(() => schedule())
            : null;

        resizeObserver?.observe(root);
        window.addEventListener('resize', schedule, { passive: true });

        if (document.fonts && typeof document.fonts.addEventListener === 'function') {
            document.fonts.addEventListener('loadingdone', schedule);
            fontListenerBound = true;
        }

        schedule();

        return {
            refresh: schedule,
            disconnect() {
                destroyed = true;

                if (rafId) {
                    window.cancelAnimationFrame(rafId);
                    rafId = 0;
                }

                resizeObserver?.disconnect();
                window.removeEventListener('resize', schedule);

                if (fontListenerBound) {
                    document.fonts.removeEventListener('loadingdone', schedule);
                }
            }
        };
    }

    window.YanqiTextLayout = {
        ensureReady: loadPretextModule,
        predictMetrics,
        predictElementMetrics,
        applyElementMetrics,
        applyBatch,
        mountResponsiveBatch,
        clearPrepareCache() {
            PREPARE_CACHE.clear();
        }
    };
})();
