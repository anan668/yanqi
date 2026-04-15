/* ============================================
   信息页脚本逻辑 - info-pages.js
   ============================================
   职责：
   1. 管理联系页、协议页、隐私页的轻交互和段落导航。
   2. 负责联系页演示版留言的校验、本地保存和反馈提示。
   3. 让信息页保持柔和、安静、可继续回到主站的阅读节奏。
   阅读顺序：
   1. 本地存储工具
   2. 滚动与导航高亮
   3. 联系方式与表单逻辑
   4. 初始化入口
*/
(function () {
    const CONTACT_STORAGE_KEY = 'YANQI_CONTACT_MESSAGES';
    const CONTACT_DRAFT_STORAGE_KEY = 'YANQI_CONTACT_DRAFT';
    const contactTimeFormatter = typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'
        ? new Intl.DateTimeFormat('zh-CN', {
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
        : null;

    const brandConfig = window.YanqiBrandConfig || null;
    const fallbackContactMethods = Object.freeze([
        Object.freeze({
            key: 'email',
            label: '联系邮箱',
            value: '暂未开放',
            href: 'contact.html#contactStatusSection',
            note: '联络邮箱还在整理中，目前先不开放直接收件；如果你想留下方向，可以先去演示留言台收住想法。',
            status: '未开放'
        }),
        Object.freeze({
            key: 'wechat',
            label: '微信 / 公众号',
            value: '暂未开放',
            href: 'contact.html#contactStatusSection',
            note: '微信与公众号入口还没有正式整理好，这一层会先保留为未开放状态。',
            status: '未开放'
        }),
        Object.freeze({
            key: 'xiaohongshu',
            label: '小红书',
            value: '暂未开放',
            href: 'contact.html#contactStatusSection',
            note: '品牌展示入口还在慢慢整理，这里暂时不放真实账号，先保留为未开放。',
            status: '未开放'
        }),
        Object.freeze({
            key: 'weibo',
            label: '微博',
            value: '暂未开放',
            href: 'contact.html#contactStatusSection',
            note: '微博联络路径也还没有启用，当前只保留一个安静的占位说明。',
            status: '未开放'
        })
    ]);

    function getContactMethodEntries() {
        const methods = brandConfig?.getContactMethods?.();
        return Array.isArray(methods) && methods.length ? methods : fallbackContactMethods;
    }

    /**
     * escapeHtml(value) - 转义用户输入，避免把本地留言直接当成 HTML 渲染
     * @param {string} value - 原始字符串
     * @returns {string} - 转义后的字符串
     */
    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char] || char));
    }

    /**
     * sanitizeContactText(value) - 规范化联系页中存储的文本字段
     * @param {unknown} value - 原始值
     * @returns {string} - 去除首尾空白后的字符串
     */
    function sanitizeContactText(value) {
        return String(value ?? '').trim();
    }

    /**
     * isValidIsoDate(value) - 判断字符串能否被解析成有效时间
     * @param {string} value - 待检查的时间字符串
     * @returns {boolean} - 是否有效
     */
    function isValidIsoDate(value) {
        return Boolean(value) && !Number.isNaN(new Date(value).getTime());
    }

    /**
     * createEmptyContactDraft() - 生成空的留言草稿结构
     * @returns {{name: string, contact: string, topic: string, message: string, updatedAt: string}}
     */
    function createEmptyContactDraft() {
        return {
            name: '',
            contact: '',
            topic: '',
            message: '',
            updatedAt: ''
        };
    }

    /**
     * normalizeContactDraft(source) - 规范化本地草稿结构
     * @param {unknown} source - 原始草稿
     * @returns {{name: string, contact: string, topic: string, message: string, updatedAt: string}}
     */
    function normalizeContactDraft(source) {
        if (!source || typeof source !== 'object') {
            return createEmptyContactDraft();
        }

        return {
            name: sanitizeContactText(source.name),
            contact: sanitizeContactText(source.contact),
            topic: sanitizeContactText(source.topic),
            message: sanitizeContactText(source.message),
            updatedAt: sanitizeContactText(source.updatedAt)
        };
    }

    /**
     * hasContactDraftContent(draft) - 判断草稿里是否已经写入了内容
     * @param {{name: string, contact: string, topic: string, message: string}} draft - 草稿对象
     * @returns {boolean} - 是否存在任一非空字段
     */
    function hasContactDraftContent(draft) {
        return Boolean(draft && (draft.name || draft.contact || draft.topic || draft.message));
    }

    /**
     * safeReadContactDraft() - 读取当前浏览器中的联系页草稿
     * @returns {{name: string, contact: string, topic: string, message: string, updatedAt: string}}
     */
    function safeReadContactDraft() {
        try {
            const raw = localStorage.getItem(CONTACT_DRAFT_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return normalizeContactDraft(parsed);
        } catch (error) {
            return createEmptyContactDraft();
        }
    }

    /**
     * safeSaveContactDraft(draft) - 保存联系页草稿到本地
     * @param {{name: string, contact: string, topic: string, message: string, updatedAt: string}} draft - 草稿对象
     * @returns {boolean} - 是否保存成功
     */
    function safeSaveContactDraft(draft) {
        try {
            localStorage.setItem(CONTACT_DRAFT_STORAGE_KEY, JSON.stringify(normalizeContactDraft(draft)));
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * clearContactDraft() - 清除本地草稿
     * @returns {boolean} - 是否清除成功
     */
    function clearContactDraft() {
        try {
            localStorage.removeItem(CONTACT_DRAFT_STORAGE_KEY);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * normalizeContactMessage(source) - 规范化单条留言结构
     * @param {unknown} source - 原始留言
     * @returns {{name: string, contact: string, topic: string, message: string, createdAt: string}|null}
     */
    function normalizeContactMessage(source) {
        if (!source || typeof source !== 'object') {
            return null;
        }

        const name = sanitizeContactText(source.name);
        const contact = sanitizeContactText(source.contact);
        const topic = sanitizeContactText(source.topic);
        const message = sanitizeContactText(source.message);
        const createdAt = sanitizeContactText(source.createdAt);

        if (!name && !contact && !topic && !message) {
            return null;
        }

        return {
            name: name || '未署名',
            contact: contact || '仅停在当前浏览器',
            topic: topic || '未说明主题',
            message,
            createdAt: isValidIsoDate(createdAt) ? createdAt : new Date().toISOString()
        };
    }

    /**
     * safeReadContactMessages() - 读取本地暂存的留言记录
     * @returns {Array<object>} - 已保存的留言数组
     */
    function safeReadContactMessages() {
        try {
            const raw = localStorage.getItem(CONTACT_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed)
                ? parsed.map((item) => normalizeContactMessage(item)).filter(Boolean)
                : [];
        } catch (error) {
            return [];
        }
    }

    /**
     * safeSaveContactMessages(messages) - 保存本地留言记录
     * @param {Array<object>} messages - 待保存的留言数组
     * @returns {boolean} - 是否保存成功
     */
    function safeSaveContactMessages(messages) {
        try {
            const normalizedMessages = Array.isArray(messages)
                ? messages.map((item) => normalizeContactMessage(item)).filter(Boolean)
                : [];
            localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(normalizedMessages));
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * clearContactMessages() - 清空已经保存的本地留言
     * @returns {boolean} - 是否清空成功
     */
    function clearContactMessages() {
        try {
            localStorage.removeItem(CONTACT_STORAGE_KEY);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * formatContactTimestamp(value) - 将 ISO 时间整理成更柔和的本地时间文案
     * @param {string} value - ISO 时间字符串
     * @returns {string} - 可展示的时间文本
     */
    function formatContactTimestamp(value) {
        if (!isValidIsoDate(value)) {
            return '刚刚收下';
        }

        const date = new Date(value);

        if (contactTimeFormatter) {
            return contactTimeFormatter.format(date);
        }

        return date.toLocaleString('zh-CN');
    }

    /**
     * updateContactDraftState(draft) - 更新联系页草稿状态提示
     * @param {{name: string, contact: string, topic: string, message: string, updatedAt: string}} draft - 草稿对象
     * @returns {void}
     */
    function updateContactDraftState(draft) {
        const state = document.getElementById('contactDraftState');
        if (!state) {
            return;
        }

        const normalizedDraft = normalizeContactDraft(draft);

        if (!hasContactDraftContent(normalizedDraft)) {
            state.textContent = '这段草稿会先停在当前浏览器里，等你决定什么时候把它轻轻留下。';
            return;
        }

        state.textContent = isValidIsoDate(normalizedDraft.updatedAt)
            ? `草稿已在当前浏览器暂存于 ${formatContactTimestamp(normalizedDraft.updatedAt)}，刷新回来也还会留在这里。`
            : '草稿已经先替你留在当前浏览器里，刷新回来也不会散掉。';
    }

    /**
     * renderStoredContactMessages() - 渲染本地暂存的留言回看区
     * @returns {void}
     */
    function renderStoredContactMessages() {
        const list = document.getElementById('contactMessagesList');
        const meta = document.getElementById('contactMessagesMeta');
        const clearButton = document.getElementById('contactMemoryClear');

        if (!list || !meta) {
            return;
        }

        const messages = safeReadContactMessages();

        if (!messages.length) {
            meta.textContent = '这里还没有已经靠岸的演示回声。写下的草稿会先被本地收住，真正留下以后，它也会继续停在这里。';
            list.innerHTML = `
                <article class="contact-memory-item is-empty">
                    <p class="contact-memory-empty-title">这片回看水域暂时还是安静的</p>
                    <p class="contact-memory-empty-copy">当你真正留下第一条演示回声以后，它会继续停在当前浏览器里。哪怕刷新回来，也还能从这里重新看见。</p>
                </article>
            `;

            if (clearButton) {
                clearButton.disabled = true;
            }
            return;
        }

        meta.textContent = `当前浏览器里已经安静收着 ${messages.length} 条演示回声。刷新回来时，它们也会继续停在这里。`;
        list.innerHTML = messages.map((entry) => `
            <article class="contact-memory-item">
                <div class="contact-memory-item-top">
                    <div>
                        <p class="contact-memory-item-name">${escapeHtml(entry.name)}</p>
                        <p class="contact-memory-item-topic">${escapeHtml(entry.topic)}</p>
                    </div>
                    <time class="contact-memory-time" datetime="${escapeHtml(entry.createdAt)}">${escapeHtml(formatContactTimestamp(entry.createdAt))}</time>
                </div>
                <p class="contact-memory-contact">联系方式 · ${escapeHtml(entry.contact)}</p>
                <p class="contact-memory-message">${escapeHtml(entry.message)}</p>
            </article>
        `).join('');

        if (clearButton) {
            clearButton.disabled = false;
        }
    }

    /**
     * scrollToSelector(selector) - 平滑滚动到指定信息页区块
     * @param {string} selector - 目标元素选择器
     * @returns {void}
     */
    function scrollToSelector(selector) {
        if (!selector) {
            return;
        }

        if (window.OceanScroll && typeof window.OceanScroll.toSelector === 'function') {
            window.OceanScroll.toSelector(selector, { duration: 1320, offset: 92 });
            return;
        }

        const target = document.querySelector(selector);
        if (!target) {
            return;
        }

        window.scrollTo(0, Math.max(0, target.getBoundingClientRect().top + window.scrollY - 92));
    }

    /**
     * updateActiveInfoNav() - 根据当前滚动位置更新信息页导航高亮
     * @returns {void}
     */
    function updateActiveInfoNav() {
        const links = Array.from(document.querySelectorAll('.info-nav-link[data-target]'));
        if (!links.length) {
            return;
        }

        const scrollTop = window.scrollY || window.pageYOffset || 0;
        let activeTarget = links[0].dataset.target;

        links.forEach((link) => {
            const target = document.querySelector(link.dataset.target || '');
            if (!target) {
                return;
            }

            const top = target.getBoundingClientRect().top + window.scrollY - 140;
            if (scrollTop >= top) {
                activeTarget = link.dataset.target;
            }
        });

        links.forEach((link) => {
            link.classList.toggle('is-active', link.dataset.target === activeTarget);
        });
    }

    /**
     * bindInfoNavigation() - 绑定信息页内的段落导航与回退入口
     * @returns {void}
     */
    function bindInfoNavigation() {
        document.addEventListener('click', (event) => {
            const trigger = event.target.closest('[data-info-scroll]');
            if (!trigger) {
                return;
            }

            event.preventDefault();
            scrollToSelector(trigger.getAttribute('data-info-scroll'));
        });

        window.addEventListener('scroll', updateActiveInfoNav, { passive: true });
        updateActiveInfoNav();
    }

    /**
     * renderContactMethods() - 渲染“联系我们”页面中的联系渠道说明
     * @returns {void}
     */
    function renderContactMethods() {
        const container = document.getElementById('contactMethods');
        if (!container) {
            return;
        }

        const items = getContactMethodEntries().map((meta) => {
            const value = String(meta?.value || '').trim();
            const href = String(meta?.href || '').trim();
            const status = String(meta?.status || '未开放').trim() || '未开放';
            const isAvailable = status === '已开放';
            const valueClassName = `contact-method-value${isAvailable ? '' : ' is-unavailable'}`;
            return `
                <article class="contact-method info-reveal info-reveal-delay-2">
                    <p class="contact-method-label">${escapeHtml(meta.label || '')}</p>
                    <p class="${valueClassName}">
                        ${isAvailable && href
        ? `<a href="${escapeHtml(href)}" class="policy-link">${escapeHtml(value)}</a>`
        : escapeHtml(value)}
                    </p>
                    <p class="contact-method-note">${escapeHtml(meta.note || '')}</p>
                    <span class="contact-method-status${isAvailable ? '' : ' is-unavailable'}">${escapeHtml(status)}</span>
                </article>
            `;
        });

        container.innerHTML = items.join('');
    }

    /**
     * renderContactStatusBoard() - 渲染联系页顶部的联络状态总览
     * @returns {void}
     */
    function renderContactStatusBoard() {
        const container = document.getElementById('contactStatusBoard');
        if (!container) {
            return;
        }

        const items = getContactMethodEntries();
        const availableCount = items.filter((meta) => String(meta?.status || '').trim() === '已开放').length;
        const totalCount = items.length;
        const title = availableCount
            ? `目前已有 ${availableCount} 条联络渠道慢慢打开`
            : '这一层现在先只展示联络状态，不开放真实渠道';
        const copy = availableCount
            ? '已经开放的渠道会继续留在这里，尚未开放的入口仍会停在状态说明里，不会突然把你带去站外。'
            : `当前展示的 ${totalCount} 条联络入口都还在整理中，所以这里先不伪装成真实联络系统，只保留一层更清楚的状态说明。`;

        container.innerHTML = `
            <article class="contact-status-primary">
                <p class="contact-status-kicker">Channel Status</p>
                <h3 class="contact-status-title">${escapeHtml(title)}</h3>
                <p class="contact-status-copy">${escapeHtml(copy)}</p>
            </article>
            <div class="contact-status-list">
                ${items.map((meta) => {
        const status = String(meta?.status || '未开放').trim() || '未开放';
        const isAvailable = status === '已开放';
        return `
                        <article class="contact-status-item${isAvailable ? ' is-available' : ''}">
                            <p class="contact-status-item-label">${escapeHtml(meta?.label || '')}</p>
                            <div class="contact-status-item-row">
                                <strong class="contact-status-item-value">${escapeHtml(meta?.value || status)}</strong>
                                <span class="contact-status-item-badge">${escapeHtml(status)}</span>
                            </div>
                            <p class="contact-status-item-note">${escapeHtml(meta?.note || '')}</p>
                        </article>
                    `;
    }).join('')}
            </div>
        `;
    }

    /**
     * showContactFeedback(message, type) - 在联系我们页面展示柔和反馈
     * @param {string} message - 反馈内容
     * @param {'error'|'info'} type - 反馈类型
     * @returns {void}
     */
    function showContactFeedback(message, type = 'info') {
        const feedback = document.getElementById('contactFeedback');
        if (!feedback) {
            return;
        }

        feedback.textContent = message;
        feedback.classList.remove('is-error');

        if (type === 'error') {
            feedback.classList.add('is-error');
        }

        feedback.classList.add('is-visible');
    }

    /**
     * markInvalidField(field, isInvalid) - 切换联系表单字段的错误样式
     * @param {HTMLElement|null} field - 字段容器
     * @param {boolean} isInvalid - 是否标记为无效
     * @returns {void}
     */
    function markInvalidField(field, isInvalid) {
        if (!field) {
            return;
        }

        field.classList.toggle('is-invalid', Boolean(isInvalid));
    }

    /**
     * bindContactForm() - 绑定联系我们页面的留言演示版表单
     * @returns {void}
     */
    function bindContactForm() {
        const form = document.getElementById('contactForm');
        if (!form) {
            return;
        }

        const nameInput = document.getElementById('contactName');
        const contactInput = document.getElementById('contactMethodValue');
        const topicInput = document.getElementById('contactTopic');
        const messageInput = document.getElementById('contactMessage');
        const clearButton = document.getElementById('contactMemoryClear');

        const fields = [
            { input: nameInput, field: nameInput?.closest('.contact-field') },
            { input: contactInput, field: contactInput?.closest('.contact-field') },
            { input: topicInput, field: topicInput?.closest('.contact-field') },
            { input: messageInput, field: messageInput?.closest('.contact-field') }
        ];

        // 每次输入都先收成一份“可存储的草稿对象”，后面恢复和保存都复用这个结构。
        function buildDraftFromForm() {
            return {
                name: nameInput?.value || '',
                contact: contactInput?.value || '',
                topic: topicInput?.value || '',
                message: messageInput?.value || '',
                updatedAt: new Date().toISOString()
            };
        }

        // 页面再次打开时，把上次尚未提交的内容轻轻放回表单。
        function restoreDraftIntoForm() {
            const draft = safeReadContactDraft();

            if (nameInput) {
                nameInput.value = draft.name;
            }

            if (contactInput) {
                contactInput.value = draft.contact;
            }

            if (topicInput) {
                topicInput.value = draft.topic;
            }

            if (messageInput) {
                messageInput.value = draft.message;
            }

            updateContactDraftState(draft);
        }

        // 只要表单里还有内容，就持续更新本地草稿；
        // 如果用户已经全部删空，就把草稿一起清掉，避免留下一份“空壳记录”。
        function persistDraftFromForm() {
            const draft = normalizeContactDraft(buildDraftFromForm());

            if (!hasContactDraftContent(draft)) {
                clearContactDraft();
                updateContactDraftState(draft);
                return;
            }

            safeSaveContactDraft(draft);
            updateContactDraftState(draft);
        }

        function handleFieldInput(event) {
            markInvalidField(event.target.closest('.contact-field'), false);
            persistDraftFromForm();
        }

        [nameInput, contactInput, messageInput].forEach((input) => {
            if (!input) {
                return;
            }

            input.addEventListener('input', handleFieldInput);
        });

        if (topicInput) {
            topicInput.addEventListener('change', handleFieldInput);
        }

        if (clearButton) {
            clearButton.addEventListener('click', () => {
                // 这里清的是“已暂存留言列表”，不是当前输入框里的未发草稿。
                if (!safeReadContactMessages().length) {
                    renderStoredContactMessages();
                    return;
                }

                clearContactMessages();
                renderStoredContactMessages();
                showContactFeedback('本地暂存的演示回声已经轻轻收起，这片回看水域暂时安静下来了。');
            });
        }

        restoreDraftIntoForm();
        renderStoredContactMessages();

        form.addEventListener('submit', (event) => {
            event.preventDefault();

            let hasError = false;
            fields.forEach(({ input, field }) => {
                const empty = !input || !String(input.value || '').trim();
                markInvalidField(field, empty);
                hasError = hasError || empty;
            });

            if (hasError) {
                showContactFeedback('在继续之前，还有几格演示回声没有写完整。慢一点补齐也没关系。', 'error');
                return;
            }

            const messages = safeReadContactMessages();
            messages.unshift({
                name: nameInput.value.trim(),
                contact: contactInput.value.trim(),
                topic: topicInput.value.trim(),
                message: messageInput.value.trim(),
                createdAt: new Date().toISOString()
            });

            if (!safeSaveContactMessages(messages)) {
                showContactFeedback('这条演示回声暂时没能写进当前浏览器的本地存储。可以先复制一下文字，再重新试一次。', 'error');
                return;
            }

            form.reset();
            fields.forEach(({ field }) => markInvalidField(field, false));
            clearContactDraft();
            updateContactDraftState(createEmptyContactDraft());
            renderStoredContactMessages();
            showContactFeedback('这条演示回声已经先替你留在当前浏览器里，不会发往真实渠道；刷新回来也还能继续看见。');
        });
    }

    /**
     * initializeInfoPages() - 初始化盐憩信息页的通用进入状态与交互
     * @returns {void}
     */
    function initializeInfoPages() {
        brandConfig?.applyBrandLinks?.(document);
        renderContactStatusBoard();
        renderContactMethods();
        bindInfoNavigation();
        bindContactForm();
        window.YanqiAvatarReturn?.bind({
            targetUrl: 'index.html'
        });

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.body.classList.add('is-entered');
            });
        });
    }

    document.addEventListener('DOMContentLoaded', initializeInfoPages);
})();
