(function attachYanqiBrandConfig(window) {
    const CONTACT_METHODS = Object.freeze({
        email: Object.freeze({
            key: 'email',
            label: '联系邮箱',
            value: 'hello@yanqi-sea.com',
            href: 'mailto:hello@yanqi-sea.com',
            note: '更适合把行程轮廓、窗口判断和需要慢慢确认的细节安静地留在这里。'
        }),
        wechat: Object.freeze({
            key: 'wechat',
            label: '微信 / 公众号',
            value: 'YANQI-SEA',
            href: 'contact.html#contactMethodsSection',
            note: '更适合出发前的节奏确认、轻沟通，以及把这一潜慢慢排稳。'
        }),
        xiaohongshu: Object.freeze({
            key: 'xiaohongshu',
            label: '小红书',
            value: '@盐憩 Yanqi Sea Retreat',
            href: 'contact.html#contactMethodsSection',
            note: '更适合先看海的气质、停驻感，以及盐憩正在整理的片段。'
        }),
        weibo: Object.freeze({
            key: 'weibo',
            label: '微博',
            value: '@盐憩 Yanqi',
            href: 'contact.html#contactMethodsSection',
            note: '更适合轻一点的问候、更新提醒和临近出发时的短回声。'
        })
    });

    const BRAND_LINKS = Object.freeze({
        email: Object.freeze({
            key: 'email',
            href: CONTACT_METHODS.email.href,
            value: CONTACT_METHODS.email.value,
            label: CONTACT_METHODS.email.label,
            external: false
        }),
        wechat: Object.freeze({
            key: 'wechat',
            href: CONTACT_METHODS.wechat.href,
            value: CONTACT_METHODS.wechat.value,
            label: CONTACT_METHODS.wechat.label,
            external: false
        }),
        xiaohongshu: Object.freeze({
            key: 'xiaohongshu',
            href: CONTACT_METHODS.xiaohongshu.href,
            value: CONTACT_METHODS.xiaohongshu.value,
            label: CONTACT_METHODS.xiaohongshu.label,
            external: false
        }),
        weibo: Object.freeze({
            key: 'weibo',
            href: CONTACT_METHODS.weibo.href,
            value: CONTACT_METHODS.weibo.value,
            label: CONTACT_METHODS.weibo.label,
            external: false
        }),
        contact: Object.freeze({
            key: 'contact',
            href: 'contact.html#contactMethodsSection',
            value: '联络水域',
            label: '联系我们',
            external: false
        }),
        forgot: Object.freeze({
            key: 'forgot',
            href: 'contact.html#contactFormSection',
            value: '找回入口',
            label: '忘记密码',
            external: false
        }),
        story: Object.freeze({
            key: 'story',
            href: 'home.html#why-yanqi',
            value: '盐憩故事',
            label: '盐憩故事',
            external: false
        })
    });

    function getContactMethod(key) {
        return CONTACT_METHODS[key] || null;
    }

    function getContactMethods() {
        return Object.values(CONTACT_METHODS);
    }

    function getBrandLink(key) {
        return BRAND_LINKS[key] || null;
    }

    function applyBrandLinks(root = document) {
        if (!root || typeof root.querySelectorAll !== 'function') {
            return;
        }

        root.querySelectorAll('[data-brand-link]').forEach((link) => {
            const config = getBrandLink(String(link.dataset.brandLink || '').trim());
            if (!config) {
                return;
            }

            link.setAttribute('href', config.href);
            link.setAttribute('title', `${config.label} · ${config.value}`);
            link.setAttribute('aria-label', `${config.label} · ${config.value}`);

            if (config.external) {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
                return;
            }

            link.removeAttribute('target');
            link.removeAttribute('rel');
        });
    }

    function escapeXml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function createFallbackImageDataUri(label, width = 960, height = 620) {
        const safeLabel = String(label || 'YANQI').trim() || 'YANQI';
        const safeWidth = Math.max(320, Math.round(Number(width) || 960));
        const safeHeight = Math.max(180, Math.round(Number(height) || 620));
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">
                <defs>
                    <linearGradient id="yanqiSeaBg" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#0d2230"/>
                        <stop offset="45%" stop-color="#123d52"/>
                        <stop offset="100%" stop-color="#081821"/>
                    </linearGradient>
                    <radialGradient id="yanqiSeaGlow" cx="0.24" cy="0.18" r="0.76">
                        <stop offset="0%" stop-color="rgba(205,236,248,0.24)"/>
                        <stop offset="100%" stop-color="rgba(205,236,248,0)"/>
                    </radialGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#yanqiSeaBg)"/>
                <rect width="100%" height="100%" fill="url(#yanqiSeaGlow)"/>
                <g opacity="0.38">
                    <path d="M0 ${Math.round(safeHeight * 0.68)} C ${Math.round(safeWidth * 0.18)} ${Math.round(safeHeight * 0.62)}, ${Math.round(safeWidth * 0.34)} ${Math.round(safeHeight * 0.74)}, ${Math.round(safeWidth * 0.5)} ${Math.round(safeHeight * 0.68)} S ${Math.round(safeWidth * 0.84)} ${Math.round(safeHeight * 0.6)}, ${safeWidth} ${Math.round(safeHeight * 0.7)}" stroke="rgba(218,239,247,0.24)" stroke-width="2" fill="none"/>
                    <path d="M0 ${Math.round(safeHeight * 0.78)} C ${Math.round(safeWidth * 0.16)} ${Math.round(safeHeight * 0.74)}, ${Math.round(safeWidth * 0.32)} ${Math.round(safeHeight * 0.84)}, ${Math.round(safeWidth * 0.48)} ${Math.round(safeHeight * 0.79)} S ${Math.round(safeWidth * 0.82)} ${Math.round(safeHeight * 0.72)}, ${safeWidth} ${Math.round(safeHeight * 0.8)}" stroke="rgba(158,214,236,0.18)" stroke-width="1.5" fill="none"/>
                </g>
                <text x="50%" y="46%" text-anchor="middle" fill="rgba(242,249,253,0.92)" font-size="${Math.max(24, Math.round(safeWidth * 0.038))}" font-family="'Times New Roman', 'Noto Serif SC', serif" letter-spacing="2">${escapeXml('盐憩')}</text>
                <text x="50%" y="57%" text-anchor="middle" fill="rgba(214,235,244,0.78)" font-size="${Math.max(15, Math.round(safeWidth * 0.018))}" font-family="'Noto Sans SC', 'Microsoft YaHei', sans-serif">${escapeXml(safeLabel)}</text>
            </svg>
        `.trim();

        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }

    function initBrandLinks() {
        applyBrandLinks(document);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBrandLinks);
    } else {
        initBrandLinks();
    }

    window.YanqiBrandConfig = Object.freeze({
        CONTACT_METHODS,
        BRAND_LINKS,
        getContactMethod,
        getContactMethods,
        getBrandLink,
        applyBrandLinks,
        createFallbackImageDataUri
    });
}(window));
