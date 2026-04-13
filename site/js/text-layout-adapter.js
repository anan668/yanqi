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

    /**
     * stableStringify(value) - 用稳定字段顺序序列化对象，保证缓存 key 可复用
     * @param {*} value - 任意待序列化的值
     * @returns {string} - 字段顺序稳定的 JSON 字符串
     */
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

    /**
     * roundWidth(width) - 把宽度整理成稳定的小数值，减少缓存 key 抖动
     * @param {number} width - 原始宽度
     * @returns {number} - 四舍五入后的安全宽度
     */
    function roundWidth(width) {
        if (!Number.isFinite(width)) {
            return 0;
        }

        return Math.max(0, Math.round(width * 100) / 100);
    }

    /**
     * parsePx(value, fallback) - 把 CSS 像素文本转换成数字
     * @param {string|number} value - 原始样式值
     * @param {number} fallback - 解析失败时的兜底值
     * @returns {number} - 可计算的像素数值
     */
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

    /**
     * waitForFonts() - 等待页面字体大致稳定，避免过早测量导致高度偏差
     * @returns {Promise<void>} - 字体 ready 或超时后完成
     */
    function waitForFonts() {
        if (!document.fonts || typeof document.fonts.ready?.then !== 'function') {
            return Promise.resolve();
        }

        return Promise.race([
            document.fonts.ready.catch(() => undefined),
            new Promise((resolve) => window.setTimeout(resolve, PRETEXT_FONT_READY_TIMEOUT))
        ]);
    }

    /**
     * loadPretextModule() - 懒加载 pretext 模块，并把结果缓存成单例 Promise
     * @returns {Promise<object>} - 载入完成的 pretext 模块
     */
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

    /**
     * getPreparedText(text, font, options) - 获取可复用的预处理文本结果
     * @param {string} text - 原始文本
     * @param {string} font - 当前测量所用字体描述
     * @param {object} options - 传给 pretext.prepare 的配置
     * @returns {Promise<object>} - 预处理后的文本对象
     */
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

    /**
     * predictMetrics(config) - 预测一段文本在指定宽度和行高下的行数与高度
     * @param {object} config - 文本测量配置
     * @returns {Promise<{lineCount:number,height:number}>} - 预测后的布局结果
     */
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

    /**
     * predictElementMetrics(element, options) - 从真实 DOM 元素推导文本布局结果
     * @param {Element} element - 需要测量的目标元素
     * @param {object} options - 文本提取与测量配置
     * @returns {Promise<{lineCount:number,height:number}>} - 预测后的布局结果
     */
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

    /**
     * applyElementMetrics(element, options) - 把预测出的高度直接写回元素样式
     * @param {Element} element - 需要应用高度的目标元素
     * @param {object} options - 应用与输出配置
     * @returns {Promise<{lineCount:number,height:number}>} - 本次应用使用的布局结果
     */
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

    /**
     * applyBatch(root, specs) - 按规格批量处理一个区域里的多组文本节点
     * @param {Element} root - 需要扫描的容器节点
     * @param {Array<object>} specs - 每组选择器与测量配置
     * @returns {Promise<Array<object>>} - 所有测量任务完成后的结果数组
     */
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

    /**
     * mountResponsiveBatch(root, specs) - 让一组文本布局在尺寸或字体变化后自动重算
     * @param {Element} root - 要观察的根容器
     * @param {Array<object>} specs - 批量测量规格
     * @returns {{refresh: Function, disconnect: Function}|null} - 可手动刷新或卸载的控制器
     */
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

            // 统一走 applyBatch，让一个区块里所有文本在同一轮里完成重算。
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

            // 尺寸变化可能在一帧里连续触发很多次，合并到下一帧再算更稳定。
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
