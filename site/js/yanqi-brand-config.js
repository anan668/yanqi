(function attachYanqiBrandConfig(window) {
    const CONTACT_STATUS_HREF = 'contact.html#contactStatusSection';

    const CONTACT_METHODS = Object.freeze({
        email: Object.freeze({
            key: 'email',
            label: '联系邮箱',
            value: '暂未开放',
            href: CONTACT_STATUS_HREF,
            note: '联络邮箱还在整理中，目前先不开放直接收件；如果你想留下方向，可以先去演示留言台收住想法。',
            status: '未开放'
        }),
        wechat: Object.freeze({
            key: 'wechat',
            label: '微信 / 公众号',
            value: '暂未开放',
            href: CONTACT_STATUS_HREF,
            note: '微信与公众号入口还没有正式整理好，这一层会先停在联络状态说明里。',
            status: '未开放'
        }),
        xiaohongshu: Object.freeze({
            key: 'xiaohongshu',
            label: '小红书',
            value: '暂未开放',
            href: CONTACT_STATUS_HREF,
            note: '品牌展示入口还在慢慢整理，这里暂时不放真实账号，先保留为未开放。',
            status: '未开放'
        }),
        weibo: Object.freeze({
            key: 'weibo',
            label: '微博',
            value: '暂未开放',
            href: CONTACT_STATUS_HREF,
            note: '微博联络路径也还没有启用，当前只保留一层更安静的状态说明。',
            status: '未开放'
        })
    });

    const BRAND_LINKS = Object.freeze({
        email: Object.freeze({
            key: 'email',
            href: CONTACT_STATUS_HREF,
            value: '暂未开放',
            label: '联系邮箱',
            external: false
        }),
        wechat: Object.freeze({
            key: 'wechat',
            href: CONTACT_STATUS_HREF,
            value: '暂未开放',
            label: '微信 / 公众号',
            external: false
        }),
        xiaohongshu: Object.freeze({
            key: 'xiaohongshu',
            href: CONTACT_STATUS_HREF,
            value: '暂未开放',
            label: '小红书',
            external: false
        }),
        weibo: Object.freeze({
            key: 'weibo',
            href: CONTACT_STATUS_HREF,
            value: '暂未开放',
            label: '微博',
            external: false
        }),
        contact: Object.freeze({
            key: 'contact',
            href: CONTACT_STATUS_HREF,
            value: '联络状态说明',
            label: '联系我们',
            external: false
        }),
        forgot: Object.freeze({
            key: 'forgot',
            href: CONTACT_STATUS_HREF,
            value: '联络状态与演示留言台',
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

            const title = config.value ? `${config.label} · ${config.value}` : config.label;
            link.setAttribute('href', config.href);
            link.setAttribute('title', title);
            link.setAttribute('aria-label', title);

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
