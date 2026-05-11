const fs = require('fs');
let css = fs.readFileSync('site/css/home.css', 'utf-8');

const replaceRegex = /\.scroll-arrow\s+(?:\.button-top|\.button-bottom|\.button-base)[^}]*\{[^}]*\}/g;
css = css.replace(replaceRegex, '');

css = css.replace(/\.scroll-arrow[^}]*::before[^}]*\{[^}]*\}/g, '');
css = css.replace(/\.scroll-arrow[^}]*::after[^}]*\{[^}]*\}/g, '');

css += `
/* Updated modern minimalist scroll arrow */
body.home-page .hero-hotspots-shell .scroll-arrow {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.8);
    transition: all 0.3s ease;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
body.home-page .hero-hotspots-shell .scroll-arrow:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}
body.home-page .hero-hotspots-shell .scroll-arrow:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    transform: none;
}
.scroll-arrow-icon {
    width: 24px;
    height: 24px;
}
`;

fs.writeFileSync('site/css/home.css', css);
console.log('home.css updated.');
