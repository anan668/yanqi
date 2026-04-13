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

    // 联系方式配置：
    // 这里不硬编真实品牌联系方式；如果未来补了真实值，页面会自动显示真实渠道。
    const yanqiContactConfig = {
        email: '',
        wechat: '',
        xiaohongshu: '',
        weibo: ''
    };

    const contactMethodMeta = Object.freeze({
        email: {
            label: '联系邮箱',
            placeholder: '联系邮箱正在整理中',
            note: '如果这一条还没靠岸，先把想说的话留在下方，也会被安静收下。'
        },
        wechat: {
            label: '微信',
            placeholder: '这一条联络方式还在靠岸',
            note: '更适合聊行程、节奏和出发前想确认的细节。'
        },
        xiaohongshu: {
            label: '小红书',
            placeholder: '这一条联络方式还在慢慢整理',
            note: '更适合先看海，再决定要不要继续靠近。'
        },
        weibo: {
            label: '微博',
            placeholder: '这一条联络方式还在靠岸',
            note: '如果想先留下一个轻一点的问候，这里会是更柔和的入口。'
        }
    });

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
            contact: contact || '尚未留下联系方式',
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
            meta.textContent = '这里还没有已经靠岸的留言。写下的草稿会先被本地收住，真正发送之后，它也会继续停在这里。';
            list.innerHTML = `
                <article class="contact-memory-item is-empty">
                    <p class="contact-memory-empty-title">这片回看水域暂时还是安静的</p>
                    <p class="contact-memory-empty-copy">当你真正留下第一条留言以后，它会继续停在当前浏览器里。哪怕刷新回来，也还能从这里重新看见。</p>
                </article>
            `;

            if (clearButton) {
                clearButton.disabled = true;
            }
            return;
        }

        meta.textContent = `当前浏览器里已经安静收着 ${messages.length} 条留言。刷新回来时，它们也会继续停在这里。`;
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

        const items = Object.entries(contactMethodMeta).map(([key, meta]) => {
            const value = (yanqiContactConfig[key] || '').trim();
            const hasValue = Boolean(value);

            return `
                <article class="contact-method info-reveal info-reveal-delay-2">
                    <p class="contact-method-label">${meta.label}</p>
                    <p class="contact-method-value">${hasValue ? value : meta.placeholder}</p>
                    <p class="contact-method-note">${meta.note}</p>
                    <span class="contact-method-status">${hasValue ? '已靠岸' : '仍在整理中'}</span>
                </article>
            `;
        });

        container.innerHTML = items.join('');
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
                showContactFeedback('本地暂存的留言已经轻轻收起，这片回看水域暂时安静下来了。');
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
                showContactFeedback('在继续之前，还有几格想法没有写完整。慢一点补齐也没关系。', 'error');
                return;
            }

            // 这里仍然是演示版前端流程：
            // 留言不会发送到服务器，而是暂存在当前浏览器的 localStorage 里。
            const messages = safeReadContactMessages();
            messages.unshift({
                name: nameInput.value.trim(),
                contact: contactInput.value.trim(),
                topic: topicInput.value.trim(),
                message: messageInput.value.trim(),
                createdAt: new Date().toISOString()
            });

            if (!safeSaveContactMessages(messages)) {
                showContactFeedback('这条留言暂时没能写进当前浏览器的本地存储。可以先复制一下文字，再重新试一次。', 'error');
                return;
            }

            form.reset();
            fields.forEach(({ field }) => markInvalidField(field, false));
            clearContactDraft();
            updateContactDraftState(createEmptyContactDraft());
            renderStoredContactMessages();
            showContactFeedback('已为你暂时收下这条留言。它会继续停在当前浏览器里，刷新回来也不会散开。');
        });
    }

    /**
     * initializeInfoPages() - 初始化盐憩信息页的通用进入状态与交互
     * @returns {void}
     */
    function initializeInfoPages() {
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
