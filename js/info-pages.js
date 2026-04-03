/* ============================================
   Info Page Logic - info-pages.js
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
     * safeReadContactMessages() - 读取本地暂存的留言记录
     * @returns {Array<object>} - 已保存的留言数组
     */
    function safeReadContactMessages() {
        try {
            const raw = localStorage.getItem(CONTACT_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
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
            localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(messages));
            return true;
        } catch (error) {
            return false;
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

        form.addEventListener('submit', (event) => {
            event.preventDefault();

            const fields = [
                { input: nameInput, field: nameInput?.closest('.contact-field') },
                { input: contactInput, field: contactInput?.closest('.contact-field') },
                { input: topicInput, field: topicInput?.closest('.contact-field') },
                { input: messageInput, field: messageInput?.closest('.contact-field') }
            ];

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

            const messages = safeReadContactMessages();
            messages.unshift({
                name: nameInput.value.trim(),
                contact: contactInput.value.trim(),
                topic: topicInput.value.trim(),
                message: messageInput.value.trim(),
                createdAt: new Date().toISOString()
            });
            safeSaveContactMessages(messages);

            form.reset();
            fields.forEach(({ field }) => markInvalidField(field, false));
            showContactFeedback('已为你暂时收下这条留言。等它靠岸以后，盐憩会从这里继续回应。');
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

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.body.classList.add('is-entered');
            });
        });
    }

    document.addEventListener('DOMContentLoaded', initializeInfoPages);
})();
