/* ============================================
   登录页脚本逻辑 - auth.js
   ============================================
   职责：
   1. 处理登录 / 注册切换、表单验证和前端演示账号逻辑。
   2. 管理登录门厅里的轻交互、反馈提示和本地记忆状态。
   3. 在用户进入首页前，把认证流程维持在“潜前门厅”的节奏里。
   阅读顺序：
   1. 常量与存储 key
   2. 表单状态与切换逻辑
   3. 提交与反馈
   4. 页面初始化
*/
const TAB_SWITCH_MS = 560;
const TAB_LEAVE_MS = 320;
const FEEDBACK_RESET_MS = 4200;
const MAINLAND_CHINA_PHONE_PATTERN = /^1[3-9]\d{9}$/;
const LOGIN_STORAGE_KEYS = Object.freeze({
    phone: 'yanqi_phone',
    password: 'yanqi_password',
    accounts: 'yanqi_accounts'
});
const LOGIN_STAGE_STORAGE_KEY = 'yanqi_login_stage_size';
const STAGE_DEBUG_STORAGE_KEY = 'YANQI_STAGE_DEBUG_MODE';
const STAGE_DEBUG_QUERY_KEY = 'stageDebug';
const STAGE_DEBUG_EXIT_DELAY_MS = 180;
const ENTRANCE_PROGRESS_READY_SETTLE_MS = 620;
let isNavigatingToHome = false;

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
 * setupStageDebugToggle() - 给登录页的舞台调试按钮绑定状态和切换逻辑
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

/**
 * getDepthManager() - 安全获取全局深度计管理器
 * @returns {object|null} - 可用的 DepthManager 实例；没有则返回 null
 */
function getDepthManager() {
    return window.DepthManager && typeof window.DepthManager === 'object'
        ? window.DepthManager
        : null;
}

/**
 * triggerDepthResponse(intensity) - 触发登录门厅里深度计的一次轻微波动
 * @param {number} intensity - 波动强度，数值越大反馈越明显
 * @returns {void}
 */
function triggerDepthResponse(intensity = 1) {
    const manager = getDepthManager();
    if (manager && typeof manager.triggerInteractiveWobble === 'function') {
        manager.triggerInteractiveWobble(intensity);
    }
}

/**
 * setGaugeInteractiveState(isActive) - 切换深度计的交互高亮状态
 * @param {boolean} isActive - 当前是否处于字段聚焦或门厅交互状态
 * @returns {void}
 */
function setGaugeInteractiveState(isActive) {
    const manager = getDepthManager();
    if (manager && typeof manager.setInteractiveGaugeState === 'function') {
        manager.setInteractiveGaugeState(Boolean(isActive));
    }
}

/**
 * navigateToPage(url) - 统一从登录门厅进入目标页，复用已有潜浮式跳转逻辑
 * @param {string} [url] - 目标页面地址
 * @returns {void}
 */
function navigateToPage(url = 'home.html') {
    if (isNavigatingToHome) {
        return;
    }

    isNavigatingToHome = true;
    const toggle = document.querySelector('[data-stage-debug-toggle]');
    toggle?.classList.add('is-leaving');

    const manager = getDepthManager();
    window.setTimeout(() => {
        if (manager && typeof manager.navigateTo === 'function') {
            manager.navigateTo(url);
            return;
        }

        window.location.href = url;
    }, STAGE_DEBUG_EXIT_DELAY_MS);
}

function navigateToHome() {
    navigateToPage('home.html');
}

function seedProfilePreset(presetKey) {
    const profilePreset = window.YanqiDiverProfile?.getPreset?.(presetKey);
    if (!profilePreset?.profile) {
        return null;
    }

    return window.YanqiDiverProfile?.saveProfile?.(profilePreset.profile) || profilePreset.profile;
}

function resetGuestBrowsingState() {
    if (typeof window.YanqiShowcaseState?.clearShowcaseState === 'function') {
        window.YanqiShowcaseState.clearShowcaseState();
        return;
    }

    try {
        localStorage.removeItem(window.YanqiShowcaseState?.SHOWCASE_STORAGE_KEY || 'YANQI_SHOWCASE_MODE');
    } catch (error) {
        // localStorage 不可用时静默降级。
    }

    window.YanqiDiverProfile?.clearProfile?.();
    document.documentElement?.classList.remove('yanqi-showcase-mode');
    document.body?.classList.remove('yanqi-showcase-mode');
    window.dispatchEvent(new CustomEvent('yanqi:showcase-mode-updated', {
        detail: {
            mode: {
                enabled: false,
                presetKey: '',
                seededAt: ''
            }
        }
    }));
}

function startDemoVoyage(feedbackNode, sourceLabel = '展示航线') {
    const result = window.YanqiShowcaseState?.seedShowcaseState?.({
        presetKey: 'desktop-full'
    });
    const preset = window.YanqiShowcaseState?.getPreset?.('desktop-full');
    const booking = result?.booking || preset?.booking || null;
    const loadedSpot = booking?.spotName || '示范海域';
    const loadedPackage = booking?.packageTitle || '示范套餐';
    showFeedback(
        feedbackNode,
        `${sourceLabel} 已装载潜水者档案、${loadedSpot} 的示范行程，以及「${loadedPackage}」对应的 Sea Brief 回执，接下来会直接进入首页主线。`,
        'success'
    );
    window.setTimeout(() => {
        navigateToHome();
    }, 420);
}

function startGuestVoyage(feedbackNode, sourceLabel = '游客入口', options = {}) {
    resetGuestBrowsingState();

    const isSocialMode = options.mode === 'social';
    const message = isSocialMode
        ? `${sourceLabel} 当前只演示进入方式，不会绑定真实账号；这次会以空白浏览态进入首页，不装载展示航线里的示范回执。`
        : `${sourceLabel} 会先以空白浏览态进入首页，不装载展示航线里的示范行程与回执；推荐会从更舒缓的默认档案慢慢展开。`;

    showFeedback(feedbackNode, message, 'info');
    window.setTimeout(() => {
        navigateToHome();
    }, 420);
}

function safeReadAccounts() {
    try {
        const raw = localStorage.getItem(LOGIN_STORAGE_KEYS.accounts);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function safeSaveAccounts(accounts) {
    try {
        localStorage.setItem(LOGIN_STORAGE_KEYS.accounts, JSON.stringify(accounts));
        return true;
    } catch (error) {
        return false;
    }
}

function normalizePhone(value) {
    return String(value || '').trim().replace(/[\s-]+/g, '');
}

function isValidMainlandChinaPhone(value) {
    return MAINLAND_CHINA_PHONE_PATTERN.test(normalizePhone(value));
}

function sanitizePhoneInputValue(input) {
    if (!(input instanceof HTMLInputElement)) {
        return;
    }

    const digitsOnly = String(input.value || '').replace(/\D+/g, '').slice(0, 11);
    if (input.value !== digitsOnly) {
        input.value = digitsOnly;
    }
}

function findAccountByPhone(accounts, phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return null;
    }

    return accounts.find((account) => normalizePhone(account?.phone) === normalizedPhone) || null;
}

/**
 * safeReadLoginStageSize() - 读取登录舞台上次保存的宽高
 * @returns {{width:number,height:number}|null} - 有效尺寸对象；没有或损坏时返回 null
 */
function safeReadLoginStageSize() {
    try {
        const raw = localStorage.getItem(LOGIN_STAGE_STORAGE_KEY);
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
            shiftX: typeof parsed.shiftX === 'number' ? parsed.shiftX : 0,
            shiftY: typeof parsed.shiftY === 'number' ? parsed.shiftY : 0
        };
    } catch (error) {
        return null;
    }
}

/**
 * safeSaveLoginStageSize(size) - 保存用户拖拽后的舞台宽高
 * @param {{width:number,height:number}} size - 最新尺寸
 * @returns {void}
 */
function safeSaveLoginStageSize(size) {
    try {
        localStorage.setItem(LOGIN_STAGE_STORAGE_KEY, JSON.stringify(size));
    } catch (error) {
        // 本地存储失败时不打断登录页主流程，静默降级为“本次会话可调整，但不记住”。
    }
}

/**
 * clearLoginStageSize(shell) - 清除登录舞台的自定义尺寸，回到默认布局
 * @param {HTMLElement|null} shell - 登录舞台外壳
 * @returns {void}
 */
function clearLoginStageSize(shell) {
    if (!shell) {
        return;
    }

    shell.style.removeProperty('--login-stage-width');
    shell.style.removeProperty('--login-stage-height');
    shell.style.removeProperty('--login-stage-shift-x');
    shell.style.removeProperty('--login-stage-shift-y');

    try {
        localStorage.removeItem(LOGIN_STAGE_STORAGE_KEY);
    } catch (error) {
        // 忽略本地存储异常，保持页面可用。
    }
}

/**
 * clampLoginStageSize(shell, width, height, shiftX, shiftY) - 按当前视口限制登录舞台的尺寸与位移
 * @param {HTMLElement} shell - 登录舞台外壳
 * @param {number} width - 目标宽度
 * @param {number} height - 目标高度
 * @param {number} shiftX - 目标横向位移
 * @param {number} shiftY - 目标纵向位移
 * @returns {{width:number,height:number,shiftX:number,shiftY:number}} - 经过限制后的尺寸
 */
function clampLoginStageSize(shell, width, height, shiftX = 0, shiftY = 0) {
    const sidePadding = Math.max(120, Math.min(window.innerWidth * 0.16, 320));
    const minWidth = window.innerWidth >= 1180
        ? Math.min(980, window.innerWidth - sidePadding)
        : 760;
    const preferredMaxWidth = window.innerWidth >= 1600
        ? 1240
        : Math.max(minWidth, window.innerWidth * 0.78);
    const maxWidth = Math.max(minWidth, Math.min(1240, preferredMaxWidth, window.innerWidth - sidePadding));
    const safeGap = Math.max(10, Math.min(window.innerHeight * 0.018, 18));
    const viewportHeightCap = Math.max(460, window.innerHeight - 118);
    const minHeightCap = window.innerWidth <= 980 ? 520 : 600;
    const minHeight = Math.max(460, Math.min(minHeightCap, viewportHeightCap));
    const maxHeight = Math.max(minHeight, Math.min(650, viewportHeightCap));
    const clampedWidth = Math.min(Math.max(width, minWidth), maxWidth);
    const clampedHeight = Math.min(Math.max(height, minHeight), maxHeight);
    const availableWidth = Math.max(clampedWidth, window.innerWidth - sidePadding);
    const availableHeight = Math.max(clampedHeight, window.innerHeight - safeGap * 2);
    const maxShiftX = Math.max(0, (availableWidth - clampedWidth) / 2);
    const maxShiftY = Math.max(0, (availableHeight - clampedHeight) / 2);

    return {
        width: clampedWidth,
        height: clampedHeight,
        shiftX: Math.min(Math.max(shiftX, -maxShiftX), maxShiftX),
        shiftY: Math.min(Math.max(shiftY, -maxShiftY), maxShiftY)
    };
}

/**
 * applyLoginStageSize(shell, size) - 把计算好的宽高写回舞台 CSS 变量
 * @param {HTMLElement|null} shell - 登录舞台外壳
 * @param {{width:number,height:number}|null} size - 要应用的尺寸
 * @returns {void}
 */
function applyLoginStageSize(shell, size) {
    if (!shell) {
        return;
    }

    if (!size) {
        shell.style.removeProperty('--login-stage-width');
        shell.style.removeProperty('--login-stage-height');
        shell.style.removeProperty('--login-stage-shift-x');
        shell.style.removeProperty('--login-stage-shift-y');
        return;
    }

    const nextSize = clampLoginStageSize(
        shell,
        size.width,
        size.height,
        size.shiftX || 0,
        size.shiftY || 0
    );
    shell.style.setProperty('--login-stage-width', `${Math.round(nextSize.width)}px`);
    shell.style.setProperty('--login-stage-height', `${Math.round(nextSize.height)}px`);
    shell.style.setProperty('--login-stage-shift-x', `${Math.round(nextSize.shiftX)}px`);
    shell.style.setProperty('--login-stage-shift-y', `${Math.round(nextSize.shiftY)}px`);
}

/**
 * ensureFeedbackNode(panelInner) - 在表单面板内创建或复用安静反馈条
 * @param {HTMLElement|null} panelInner - 表单面板主体容器
 * @returns {HTMLElement|null} - 反馈节点；创建失败时返回 null
 */
function ensureFeedbackNode(panelInner) {
    if (!panelInner) {
        return null;
    }

    let feedback = panelInner.querySelector('#authFeedback');
    if (feedback) {
        return feedback;
    }

    feedback = document.createElement('div');
    feedback.className = 'auth-feedback';
    feedback.id = 'authFeedback';
    feedback.setAttribute('aria-live', 'polite');
    feedback.setAttribute('aria-atomic', 'true');
    feedback.setAttribute('role', 'status');

    const form = panelInner.querySelector('#authForm');
    if (form && form.parentNode === panelInner) {
        panelInner.insertBefore(feedback, form);
    } else {
        panelInner.appendChild(feedback);
    }

    return feedback;
}

/**
 * showFeedback(feedbackNode, message, type) - 在门厅内显示柔和反馈文案
 * @param {HTMLElement|null} feedbackNode - 反馈节点
 * @param {string} message - 反馈内容
 * @param {'error'|'success'|'info'} type - 反馈类型
 * @returns {void}
 */
function showFeedback(feedbackNode, message, type = 'info') {
    if (!feedbackNode) {
        return;
    }

    feedbackNode.textContent = message;
    feedbackNode.classList.remove('is-error', 'is-success', 'is-visible');
    feedbackNode.setAttribute('role', type === 'error' ? 'alert' : 'status');

    if (type === 'error') {
        feedbackNode.classList.add('is-error');
    }

    if (type === 'success') {
        feedbackNode.classList.add('is-success');
    }

    feedbackNode.classList.add('is-visible');

    if (feedbackNode.hideTimerId) {
        window.clearTimeout(feedbackNode.hideTimerId);
    }

    if (type !== 'error') {
        feedbackNode.hideTimerId = window.setTimeout(() => {
            feedbackNode.classList.remove('is-visible', 'is-success');
            feedbackNode.hideTimerId = 0;
        }, FEEDBACK_RESET_MS);
    }
}

/**
 * clearFeedback(feedbackNode) - 收起当前反馈条并清理成功态样式
 * @param {HTMLElement|null} feedbackNode - 反馈节点
 * @returns {void}
 */
function clearFeedback(feedbackNode) {
    if (!feedbackNode) {
        return;
    }

    if (feedbackNode.hideTimerId) {
        window.clearTimeout(feedbackNode.hideTimerId);
        feedbackNode.hideTimerId = 0;
    }

    feedbackNode.classList.remove('is-visible', 'is-error', 'is-success');
    feedbackNode.setAttribute('role', 'status');
}

/**
 * restartFadeIn(element, delaySeconds) - 重新触发指定元素的缓慢浮现动画
 * @param {HTMLElement|null} element - 需要重新播放动画的元素
 * @param {number} delaySeconds - 动画延迟秒数
 * @returns {void}
 */
function restartFadeIn(element, delaySeconds) {
    if (!element) {
        return;
    }

    element.classList.remove('fade-in-up');
    element.style.animation = 'none';
    element.style.animationDelay = `${delaySeconds}s`;
    void element.offsetWidth;
    element.style.animation = '';
    element.classList.add('fade-in-up');
}

/**
 * updateInvalidState(input, isInvalid) - 切换输入框的校验错误样式
 * @param {HTMLInputElement|null} input - 目标输入框
 * @param {boolean} isInvalid - 是否标记为错误
 * @returns {void}
 */
function updateInvalidState(input, isInvalid) {
    if (!input) {
        return;
    }

    const group = input.closest('.input-group, .checkbox-group');
    const nextInvalid = Boolean(isInvalid);
    input.classList.toggle('is-invalid', nextInvalid);
    group?.classList.toggle('is-invalid', nextInvalid);

    if (nextInvalid) {
        group?.classList.remove('is-complete');
        input.classList.remove('is-complete');
        return;
    }

    input.classList.remove('is-invaliding');
    group?.classList.remove('is-invaliding');
}

/**
 * shakeEmptyField(input) - 给当前错误字段触发一次轻量错误回摆
 * @param {HTMLInputElement|null} input - 当前未填写的输入框或复选框
 * @returns {void}
 */
function shakeEmptyField(input) {
    if (!input) {
        return;
    }

    const group = input.closest('.input-group, .checkbox-group');
    if (group) {
        group.classList.remove('is-invaliding');
        input.classList.remove('is-invaliding');
        void input.offsetWidth;
        group.classList.add('is-invaliding');
        input.classList.add('is-invaliding');

        window.setTimeout(() => {
            group.classList.remove('is-invaliding');
            input.classList.remove('is-invaliding');
        }, 420);
    }
}

/**
 * validateRequiredInputs(inputs) - 校验当前表单里必填字段是否完整
 * @param {NodeListOf<HTMLInputElement>|HTMLInputElement[]} inputs - 需要校验的输入集合
 * @returns {{isValid:boolean, firstEmptyInput:HTMLInputElement|null}} - 校验结果与首个未填字段
 */
function validateRequiredInputs(inputs) {
    let isValid = true;
    let firstEmptyInput = null;

    Array.from(inputs).forEach((input) => {
        const empty = input.type === 'checkbox' ? !input.checked : !input.value.trim();
        updateInvalidState(input, empty);
        if (empty) {
            isValid = false;
            if (!firstEmptyInput) {
                firstEmptyInput = input;
            }
        }
    });

    return { isValid, firstEmptyInput };
}

function syncPhoneValidationOnSubmit(phoneInput) {
    if (!(phoneInput instanceof HTMLInputElement)) {
        return {
            hasValue: false,
            isValid: false
        };
    }

    const hasValue = Boolean(phoneInput.value.trim());
    const isValid = isValidMainlandChinaPhone(phoneInput.value);

    updateInvalidState(phoneInput, hasValue && !isValid);

    return {
        hasValue,
        isValid
    };
}

function getFirstIncompleteFieldMessage(input) {
    if (!(input instanceof HTMLInputElement)) {
        return '';
    }

    if (input.id === 'login-phone' || input.id === 'register-phone') {
        return '先把手机号写稳，让这层静水先认出你。';
    }

    if (input.id === 'login-password') {
        return '还差一把通行密钥，入口才会继续向前打开。';
    }

    if (input.id === 'register-password') {
        return '还差一把进入这片海的钥匙，先轻轻写下来。';
    }

    if (input.id === 'register-confirm') {
        return '再确认一次密钥，让这条入口慢慢收稳。';
    }

    if (input.id === 'agree-terms') {
        return '在继续之前，请先看看这份约定。还差一步：请先阅读并同意用户协议与隐私政策。';
    }

    return '';
}

function formatTabAnimationDelays(tabName) {
    return tabName === 'login'
        ? [0.16, 0.3, 0.42, 0.56]
        : [0.16, 0.3, 0.44, 0.58, 0.72];
}

function replayTabAnimations(tabName, refs) {
    const { formBrand, tabSection, footerLinks, activeContent } = refs;
    const delays = formatTabAnimationDelays(tabName);

    restartFadeIn(formBrand, 0.06);
    restartFadeIn(tabSection, 0.1);

    activeContent.querySelectorAll('.fade-in-up').forEach((item, index) => {
        restartFadeIn(item, delays[index] ?? (0.16 + index * 0.14));
    });

    restartFadeIn(footerLinks, tabName === 'login' ? 0.72 : 0.92);
}

function updateFormHeight(targetContent, authForm, immediate = false, fromContent = null) {
    if (!targetContent || !authForm) {
        return;
    }

    const formStyle = window.getComputedStyle(authForm);
    const verticalPadding = (parseFloat(formStyle.paddingTop) || 0)
        + (parseFloat(formStyle.paddingBottom) || 0);
    const nextHeight = targetContent.scrollHeight + verticalPadding;
    if (immediate) {
        authForm.style.minHeight = `${nextHeight}px`;
        return;
    }

    const currentHeight = fromContent
        ? fromContent.scrollHeight + verticalPadding
        : (authForm.getBoundingClientRect().height || nextHeight);

    authForm.style.minHeight = `${currentHeight}px`;
    requestAnimationFrame(() => {
        authForm.style.minHeight = `${nextHeight}px`;
    });
}

function switchToTab(tabName, options, refs) {
    const { immediate = false } = options || {};
    const { authForm, tabBtns, tabContents, feedbackNode, glassCard, formBrand, tabSection, footerLinks, nodes } = refs;

    const targetContent = document.getElementById(tabName);
    const currentContent = document.querySelector('.tab-content.active');
    if (!targetContent) {
        return;
    }

    document.body.dataset.authMode = tabName;
    document.body.classList.toggle('is-auth-login', tabName === 'login');
    document.body.classList.toggle('is-auth-register', tabName === 'register');
    document.body.classList.toggle('is-switching', !immediate);
    authForm?.setAttribute(
        'aria-describedby',
        tabName === 'login' ? 'authModeSummaryLogin' : 'authModeSummaryRegister'
    );
    clearFeedback(feedbackNode);

    tabBtns.forEach((btn) => {
        const isActive = btn.getAttribute('data-tab') === tabName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
        btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    tabContents.forEach((content) => {
        const isTarget = content === targetContent;
        const isLeaving = !isTarget && content === currentContent && !immediate;
        const shouldBeVisible = isTarget || isLeaving;

        content.hidden = !shouldBeVisible;
        content.setAttribute('aria-hidden', String(!isTarget));

        content.querySelectorAll('input').forEach((input) => {
            input.disabled = !isTarget;
            if (!isTarget) {
                updateInvalidState(input, false);
            }
        });

        if (!isTarget && !isLeaving) {
            content.classList.remove('active', 'is-entering', 'is-leaving');
        }
    });

    if (immediate || !currentContent || currentContent === targetContent) {
        targetContent.classList.remove('is-leaving');
        targetContent.classList.add('active', 'is-entering');
        targetContent.hidden = false;
        targetContent.setAttribute('aria-hidden', 'false');
        updateFormHeight(targetContent, authForm, true);

        requestAnimationFrame(() => {
            targetContent.classList.remove('is-entering');
            document.body.classList.remove('is-switching');
        });

        replayTabAnimations(tabName, { formBrand, tabSection, footerLinks, activeContent: targetContent });
        triggerDepthResponse(0.86);
        updateEntranceProgress(nodes);
        if (glassCard) {
            glassCard.classList.remove('is-rippled');
        }
        return;
    }

    currentContent.classList.remove('active');
    currentContent.classList.add('is-leaving');
    if (currentContent.leaveTimerId) {
        window.clearTimeout(currentContent.leaveTimerId);
    }

    currentContent.leaveTimerId = window.setTimeout(() => {
        currentContent.classList.remove('is-leaving');
        if (!currentContent.classList.contains('active')) {
            currentContent.hidden = true;
            currentContent.setAttribute('aria-hidden', 'true');
        }
        currentContent.leaveTimerId = 0;
    }, TAB_LEAVE_MS + 40);

    targetContent.classList.remove('is-leaving');
    targetContent.classList.add('active', 'is-entering');
    targetContent.hidden = false;
    targetContent.setAttribute('aria-hidden', 'false');
    updateFormHeight(targetContent, authForm, false, currentContent);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            targetContent.classList.remove('is-entering');
        });
    });

    window.setTimeout(() => {
        document.body.classList.remove('is-switching');
    }, TAB_SWITCH_MS);

    replayTabAnimations(tabName, { formBrand, tabSection, footerLinks, activeContent: targetContent });
    triggerDepthResponse(1.06);
    updateEntranceProgress(nodes);

    const firstInput = targetContent.querySelector('input:not([disabled])');
    if (firstInput instanceof HTMLInputElement) {
        window.setTimeout(() => {
            if (document.activeElement && document.activeElement.classList?.contains('tab-btn')) {
                firstInput.focus({ preventScroll: true });
            }
        }, 140);
    }
}

function restoreRememberedAccount(nodes) {
    const { rememberCheckbox, loginPhoneInput, loginPasswordInput, registerPhoneInput } = nodes;

    try {
        const savedPhone = localStorage.getItem(LOGIN_STORAGE_KEYS.phone) || localStorage.getItem('yanqi_email');
        const savedPassword = localStorage.getItem(LOGIN_STORAGE_KEYS.password);

        if (savedPhone && savedPassword) {
            loginPhoneInput.value = savedPhone;
            loginPasswordInput.value = savedPassword;
            rememberCheckbox.checked = true;
        }
    } catch (error) {
        // 本地存储不可用时静默降级，不阻断登录页使用。
    }

    const accounts = safeReadAccounts();
    if (accounts.length > 0) {
        const lastAccount = accounts[accounts.length - 1];
        registerPhoneInput.value = lastAccount.phone || '';
    }
}

function syncRememberMeStorage(nodes) {
    const { rememberCheckbox, loginPhoneInput, loginPasswordInput } = nodes;

    try {
        if (rememberCheckbox.checked) {
            localStorage.setItem(LOGIN_STORAGE_KEYS.phone, normalizePhone(loginPhoneInput.value));
            localStorage.setItem(LOGIN_STORAGE_KEYS.password, loginPasswordInput.value);
        } else {
            localStorage.removeItem(LOGIN_STORAGE_KEYS.phone);
            localStorage.removeItem('yanqi_email');
            localStorage.removeItem(LOGIN_STORAGE_KEYS.password);
        }
    } catch (error) {
        // 本地存储不可用时静默降级。
    }
}

function bindRememberMe(nodes) {
    const { rememberCheckbox, loginPhoneInput, loginPasswordInput } = nodes;
    restoreRememberedAccount(nodes);
    syncAllFieldStates(nodes);
    updateEntranceProgress(nodes);

    rememberCheckbox.addEventListener('change', () => {
        syncRememberMeStorage(nodes);
    });

    [loginPhoneInput, loginPasswordInput].forEach((input) => {
        input.addEventListener('input', () => {
            if (rememberCheckbox.checked) {
                syncRememberMeStorage(nodes);
            }
        });
    });
}

function bindPhoneInputSanitizer(nodes) {
    const phoneInputs = [nodes.loginPhoneInput, nodes.registerPhoneInput];

    phoneInputs.forEach((input) => {
        if (!(input instanceof HTMLInputElement)) {
            return;
        }

        input.addEventListener('input', () => {
            sanitizePhoneInputValue(input);
        });
    });
}

function getDigitLength(value) {
    return String(value || '').replace(/\D+/g, '').length;
}

function getInputLength(value) {
    return String(value || '').trim().length;
}

function getLinearProgress(length, maxLength) {
    if (maxLength <= 0) {
        return 0;
    }

    return Math.min(Math.max(length / maxLength, 0), 1);
}

function replayTransientClass(node, className, duration) {
    if (!(node instanceof HTMLElement)) {
        return;
    }

    const frameKey = `__${className}FrameId`;
    const timerKey = `__${className}TimerId`;

    if (typeof node[frameKey] === 'number') {
        window.cancelAnimationFrame(node[frameKey]);
    }

    if (typeof node[timerKey] === 'number') {
        window.clearTimeout(node[timerKey]);
    }

    node.classList.remove(className);
    node[frameKey] = window.requestAnimationFrame(() => {
        node.classList.add(className);
        node[timerKey] = window.setTimeout(() => {
            node.classList.remove(className);
            node[timerKey] = 0;
        }, duration);
        node[frameKey] = 0;
    });
}

function getLoginEntranceReadySignature(nodes) {
    return [
        'login',
        normalizePhone(nodes.loginPhoneInput?.value),
        Boolean(nodes.loginPasswordInput?.value.trim()) ? 'keyed' : 'waiting',
        nodes.rememberCheckbox?.checked ? 'remembered' : 'unanchored'
    ].join(':');
}

function isLoginEntranceReady(nodes) {
    return isValidMainlandChinaPhone(nodes.loginPhoneInput?.value)
        && Boolean(nodes.loginPasswordInput?.value.trim());
}

function clearEntranceProgressReadyTimer(nodes) {
    if (!nodes) {
        return;
    }

    if (typeof nodes.entranceProgressReadyTimerId === 'number') {
        window.clearTimeout(nodes.entranceProgressReadyTimerId);
    }

    nodes.entranceProgressReadyTimerId = 0;
    nodes.entranceProgressReadySettled = false;
    nodes.entranceProgressReadySignature = '';
}

function syncEntranceProgressReadyTimer(nodes) {
    if (!nodes) {
        return;
    }

    const activeMode = document.body.dataset.authMode || 'login';
    if (activeMode !== 'login' || !isLoginEntranceReady(nodes)) {
        clearEntranceProgressReadyTimer(nodes);
        return;
    }

    const nextSignature = getLoginEntranceReadySignature(nodes);
    if (nodes.entranceProgressReadySignature === nextSignature) {
        return;
    }

    if (typeof nodes.entranceProgressReadyTimerId === 'number') {
        window.clearTimeout(nodes.entranceProgressReadyTimerId);
    }

    nodes.entranceProgressReadySignature = nextSignature;
    nodes.entranceProgressReadySettled = false;
    nodes.entranceProgressReadyTimerId = window.setTimeout(() => {
        nodes.entranceProgressReadySettled = true;
        nodes.entranceProgressReadyTimerId = 0;
        updateEntranceProgress(nodes);
    }, ENTRANCE_PROGRESS_READY_SETTLE_MS);
}

function easeEntranceProgress(progress) {
    const clamped = Math.min(Math.max(progress, 0), 1);
    return 1 - Math.pow(1 - clamped, 3);
}

function animateEntranceProgressNumber(valueNode, fromPercent, toPercent) {
    if (!(valueNode instanceof HTMLElement)) {
        return;
    }

    const startPercent = Number.isFinite(fromPercent) && fromPercent >= 0
        ? fromPercent
        : toPercent;
    const endPercent = Number.isFinite(toPercent) ? toPercent : startPercent;

    if (typeof valueNode.entranceProgressFrameId === 'number') {
        window.cancelAnimationFrame(valueNode.entranceProgressFrameId);
    }

    if (startPercent === endPercent) {
        valueNode.textContent = `${endPercent}%`;
        valueNode.dataset.renderedPercent = String(endPercent);
        valueNode.entranceProgressFrameId = 0;
        return;
    }

    const startedAt = performance.now();
    const duration = 560;
    const delta = endPercent - startPercent;

    const render = (timestamp) => {
        const elapsed = timestamp - startedAt;
        const progress = easeEntranceProgress(elapsed / duration);
        const current = Math.round(startPercent + delta * progress);

        valueNode.textContent = `${current}%`;
        valueNode.dataset.renderedPercent = String(current);

        if (elapsed < duration) {
            valueNode.entranceProgressFrameId = window.requestAnimationFrame(render);
            return;
        }

        valueNode.textContent = `${endPercent}%`;
        valueNode.dataset.renderedPercent = String(endPercent);
        valueNode.entranceProgressFrameId = 0;
    };

    valueNode.entranceProgressFrameId = window.requestAnimationFrame(render);
}

function isFieldComplete(input, nodes) {
    if (!(input instanceof HTMLInputElement)) {
        return false;
    }

    if (input.type === 'checkbox') {
        return input.checked;
    }

    const value = input.value.trim();
    if (!value) {
        return false;
    }

    if (input === nodes.loginPhoneInput || input === nodes.registerPhoneInput) {
        return isValidMainlandChinaPhone(value);
    }

    if (input === nodes.registerConfirmInput) {
        return value === String(nodes.registerPasswordInput?.value || '').trim();
    }

    return !input.classList.contains('is-invalid');
}

function syncAuthFieldState(input, nodes) {
    if (!(input instanceof HTMLInputElement)) {
        return;
    }

    const group = input.closest('.input-group, .checkbox-group');
    if (!group) {
        return;
    }

    const isFilled = input.type === 'checkbox'
        ? input.checked
        : Boolean(input.value.trim());
    const isComplete = isFilled && isFieldComplete(input, nodes);

    group.classList.toggle('is-filled', isFilled);
    group.classList.toggle('is-complete', isComplete);
    input.classList.toggle('is-filled', isFilled);
    input.classList.toggle('is-complete', isComplete);
}

function syncAllFieldStates(nodes) {
    nodes.allInputs.forEach((input) => {
        syncAuthFieldState(input, nodes);
    });
}

function bindFieldStateTracking(nodes) {
    nodes.allInputs.forEach((input) => {
        if (!(input instanceof HTMLInputElement)) {
            return;
        }

        const eventName = input.type === 'checkbox' ? 'change' : 'input';
        input.addEventListener(eventName, () => {
            syncAuthFieldState(input, nodes);

            if (input === nodes.registerPasswordInput) {
                syncAuthFieldState(nodes.registerConfirmInput, nodes);
            }
        });
    });

    syncAllFieldStates(nodes);
}

function getAuthProgressState(nodes) {
    const activeMode = document.body.dataset.authMode || 'login';

    if (activeMode === 'register') {
        const phoneDigits = getDigitLength(nodes.registerPhoneInput?.value);
        const passwordLength = getInputLength(nodes.registerPasswordInput?.value);
        const confirmLength = getInputLength(nodes.registerConfirmInput?.value);
        const confirmTargetLength = Math.max(passwordLength, 8);
        const isPhoneReady = isValidMainlandChinaPhone(nodes.registerPhoneInput?.value);
        const isPasswordReady = passwordLength > 0;
        const isConfirmReady = Boolean(nodes.registerConfirmInput?.value.trim())
            && nodes.registerConfirmInput?.value === nodes.registerPasswordInput?.value;
        const hasAgreed = Boolean(nodes.agreeTermsInput?.checked);
        const registerChecks = [isPhoneReady, isPasswordReady, isConfirmReady, hasAgreed];
        const percent = Math.round(
            getLinearProgress(phoneDigits, 11) * 30
            + getLinearProgress(passwordLength, 8) * 26
            + getLinearProgress(confirmLength, confirmTargetLength) * 26
            + (hasAgreed ? 18 : 0)
        );
        let step = 'idle';
        let statusText = '这一层还在等你慢慢写下第一段登记。';

        if (percent > 0 && !isPhoneReady) {
            step = 'recognizing';
            statusText = phoneDigits > 0
                ? `号码已经写下 ${phoneDigits} 位，还差一点，入口就会浮出水面。`
                : '先从手机号开始，让这条登记入口慢慢出现。';
        } else if (isPhoneReady && !isPasswordReady) {
            step = 'keying';
            statusText = '号码已经落稳，再替自己留下一把进入这片海的钥匙。';
        } else if (isPhoneReady && isPasswordReady && !isConfirmReady) {
            step = 'confirming';
            statusText = confirmLength > 0
                ? '两次密钥还没完全对齐，收一收，再轻轻写一次。'
                : '密钥已经写下了，再确认一次，让入口慢慢收稳。';
        } else if (isPhoneReady && isPasswordReady && isConfirmReady && !hasAgreed) {
            step = 'accord';
            statusText = '这条登记入口已经成形，最后看一眼约定，就能继续进入。';
        } else if (isPhoneReady && isPasswordReady && isConfirmReady && hasAgreed) {
            step = 'ready';
            statusText = '这条登记入口已经写稳了，继续往第一层海面进入。';
        }

        return {
            mode: activeMode,
            percent,
            completed: registerChecks.filter(Boolean).length,
            total: registerChecks.length,
            phoneDigits,
            passwordLength,
            confirmLength,
            isPhoneReady,
            isPasswordReady,
            isConfirmReady,
            hasAgreed,
            isReady: registerChecks.every(Boolean),
            step,
            statusText
        };
    }

    const phoneDigits = getDigitLength(nodes.loginPhoneInput?.value);
    const passwordLength = getInputLength(nodes.loginPasswordInput?.value);
    const hasPhoneInput = phoneDigits > 0;
    const hasPasswordInput = passwordLength > 0;
    const isPhoneReady = isValidMainlandChinaPhone(nodes.loginPhoneInput?.value);
    const isPasswordReady = hasPasswordInput;
    const shouldRemember = Boolean(nodes.rememberCheckbox?.checked);
    const loginChecks = [isPhoneReady, isPasswordReady];
    const completed = loginChecks.filter(Boolean).length;
    const isReadySettled = Boolean(nodes.entranceProgressReadySettled)
        && nodes.entranceProgressReadySignature === getLoginEntranceReadySignature(nodes);
    let percent = 0;
    let step = 'idle';
    let statusText = '这一层还在等你慢慢写下第一个入口。';

    if (isPhoneReady && isPasswordReady && isReadySettled) {
        percent = 100;
        step = 'ready';
        statusText = '可以沿这层静水继续进入首页主线。';
    } else if (hasPasswordInput && shouldRemember) {
        percent = 77;
        step = 'anchored';
        statusText = '这层静水会替你把号码稳稳留住。';
    } else if (hasPasswordInput) {
        percent = 65;
        step = 'opening';
        statusText = '入口正在慢慢成形。';
    } else if (hasPhoneInput) {
        percent = 35;
        step = 'recognizing';
        statusText = isPhoneReady
            ? '静水已经记住你的号码。'
            : '号码正在落进静水，入口会慢慢辨认。';
    }

    return {
        mode: activeMode,
        percent,
        completed,
        total: loginChecks.length,
        phoneDigits,
        passwordLength,
        shouldRemember,
        isPhoneReady,
        isPasswordReady,
        isReady: loginChecks.every(Boolean),
        step,
        statusText
    };
}

function updateEntranceProgress(nodes) {
    const { sideWaterlineTrack, sideWaterlineFill, sideWaterlineValue, sideWaterlineStatus } = nodes;
    if (!sideWaterlineTrack || !sideWaterlineFill || !sideWaterlineValue || !sideWaterlineStatus) {
        return;
    }

    syncEntranceProgressReadyTimer(nodes);

    const progressState = getAuthProgressState(nodes);
    const {
        mode,
        percent,
        isReady,
        step,
        statusText
    } = progressState;
    const waterlineState = step === 'idle' ? 'idle' : (isReady && percent >= 100 ? 'complete' : 'active');
    const nextValue = `${percent}%`;
    const previousPercent = Number(sideWaterlineTrack.dataset.progressPercent || '-1');
    const previousStep = sideWaterlineTrack.dataset.progressStep || '';
    const previousStatus = sideWaterlineStatus.dataset.progressStatus || '';
    const hasMounted = previousPercent >= 0;
    const hasProgressChanged = previousPercent !== percent;
    const hasStepChanged = previousStep !== step;
    const hasStatusChanged = previousStatus !== statusText;

    sideWaterlineFill.style.setProperty('--waterline-progress', `${percent}%`);
    sideWaterlineTrack.setAttribute('aria-valuenow', String(percent));
    sideWaterlineTrack.dataset.progressState = waterlineState;
    sideWaterlineTrack.dataset.progressMode = mode;
    sideWaterlineTrack.dataset.progressStep = step;
    sideWaterlineTrack.dataset.progressPercent = String(percent);
    sideWaterlineValue.dataset.progressStep = step;
    document.body.dataset.authProgressMode = mode;
    document.body.dataset.authProgressState = waterlineState;
    document.body.dataset.authProgressStep = step;
    document.body.dataset.authProgressPercent = String(percent);
    sideWaterlineStatus.textContent = statusText;
    sideWaterlineStatus.dataset.progressStatus = statusText;
    sideWaterlineStatus.dataset.progressStep = step;
    sideWaterlineTrack.setAttribute('aria-valuetext', statusText);

    if (!hasMounted) {
        sideWaterlineValue.textContent = nextValue;
        sideWaterlineValue.dataset.renderedPercent = String(percent);
        return;
    }

    if (hasProgressChanged) {
        const renderedPercent = Number(sideWaterlineValue.dataset.renderedPercent);
        const animationStart = Number.isFinite(renderedPercent) ? renderedPercent : previousPercent;
        animateEntranceProgressNumber(sideWaterlineValue, animationStart, percent);
        replayTransientClass(sideWaterlineTrack, 'is-pulsing', 620);
        replayTransientClass(sideWaterlineValue, 'is-updating', 340);
    } else {
        sideWaterlineValue.textContent = nextValue;
        sideWaterlineValue.dataset.renderedPercent = String(percent);
    }

    if (hasStepChanged || hasStatusChanged) {
        replayTransientClass(sideWaterlineStatus, 'is-updating', 360);
    }
}

function bindEntranceProgress(nodes) {
    const watchedInputs = [
        nodes.loginPhoneInput,
        nodes.loginPasswordInput,
        nodes.rememberCheckbox,
        nodes.registerPhoneInput,
        nodes.registerPasswordInput,
        nodes.registerConfirmInput,
        nodes.agreeTermsInput
    ];

    watchedInputs.forEach((input) => {
        if (!(input instanceof HTMLInputElement)) {
            return;
        }

        input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => {
            updateEntranceProgress(nodes);
        });
    });

    updateEntranceProgress(nodes);
}

function buildAccount(nodes) {
    return {
        phone: normalizePhone(nodes.registerPhoneInput.value),
        password: nodes.registerPasswordInput.value,
        registeredAt: new Date().toISOString()
    };
}

function isAccountDuplicated(accounts, nextAccount) {
    const nextPhone = normalizePhone(nextAccount?.phone);
    return accounts.some((account) => nextPhone && normalizePhone(account?.phone) === nextPhone);
}

/**
 * markInteractiveFieldState(isFocused) - 切换页面的字段聚焦状态类，并同步深度计互动态
 * @param {boolean} isFocused - 当前是否有字段处于 focus/hover 交互中
 * @returns {void}
 */
function markInteractiveFieldState(isFocused) {
    document.body.classList.toggle('is-field-focus', Boolean(isFocused));
    setGaugeInteractiveState(Boolean(isFocused));
}

/**
 * syncFieldInteractiveState() - 根据当前 hover/focus 状态重新判断登录门厅是否需要高亮
 * @returns {void}
 */
function syncFieldInteractiveState() {
    const shouldActivate = Boolean(
        document.querySelector('.input-group:focus-within, .checkbox-group:focus-within') ||
        document.querySelector('.glass-card:hover')
    );

    markInteractiveFieldState(shouldActivate);
}

/**
 * bindInteractiveFeedback(nodes, feedbackNode) - 绑定输入框与玻璃舞台的轻反馈行为
 * @param {object} nodes - 页面节点集合
 * @param {HTMLElement|null} feedbackNode - 反馈节点
 * @returns {void}
 */
function bindInteractiveFeedback(nodes, feedbackNode) {
    const { glassCard, allInputs } = nodes;

    allInputs.forEach((input) => {
        input.addEventListener('focus', () => {
            updateInvalidState(input, false);
            clearFeedback(feedbackNode);
            triggerDepthResponse(0.92);
            markInteractiveFieldState(true);
        });

        input.addEventListener('blur', () => {
            window.setTimeout(syncFieldInteractiveState, 0);
        });
    });

    if (glassCard) {
        glassCard.addEventListener('mouseenter', () => {
            triggerDepthResponse(0.82);
            markInteractiveFieldState(true);
        });

        glassCard.addEventListener('mouseleave', () => {
            window.setTimeout(syncFieldInteractiveState, 0);
        });
    }
}

function handleLoginSubmit(nodes, feedbackNode) {
    const { loginPhoneInput, loginPasswordInput } = nodes;
    const requiredInputs = [loginPhoneInput, loginPasswordInput];
    const validation = validateRequiredInputs(requiredInputs);
    const phoneState = syncPhoneValidationOnSubmit(loginPhoneInput);

    if (!validation.isValid) {
        requiredInputs.forEach((input) => {
            const empty = input.type === 'checkbox' ? !input.checked : !input.value.trim();
            if (empty) {
                shakeEmptyField(input);
            }
        });

        if (phoneState.hasValue && !phoneState.isValid) {
            shakeEmptyField(loginPhoneInput);
            showFeedback(feedbackNode, '手机号需要是 11 位中国大陆手机号。', 'error');
            return false;
        }

        const firstMessage = getFirstIncompleteFieldMessage(validation.firstEmptyInput);
        if (firstMessage) {
            showFeedback(feedbackNode, firstMessage, 'error');
        }
        return false;
    }

    if (!phoneState.isValid) {
        updateInvalidState(loginPhoneInput, true);
        updateInvalidState(loginPasswordInput, false);
        shakeEmptyField(loginPhoneInput);
        showFeedback(feedbackNode, '手机号需要是 11 位中国大陆手机号。', 'error');
        return false;
    }

    const accounts = safeReadAccounts();
    if (accounts.length === 0) {
        updateInvalidState(loginPhoneInput, true);
        updateInvalidState(loginPasswordInput, false);
        shakeEmptyField(loginPhoneInput);
        showFeedback(feedbackNode, '这层静水里还没有留下号码记录，先注册，再回来登录。', 'error');
        return false;
    }

    const matchedAccount = findAccountByPhone(accounts, loginPhoneInput.value);
    if (!matchedAccount) {
        updateInvalidState(loginPhoneInput, true);
        updateInvalidState(loginPasswordInput, false);
        shakeEmptyField(loginPhoneInput);
        showFeedback(feedbackNode, '没有找到这串号码对应的入口，检查一下手机号，或者先注册。', 'error');
        return false;
    }

    if (matchedAccount.password !== loginPasswordInput.value) {
        updateInvalidState(loginPhoneInput, false);
        updateInvalidState(loginPasswordInput, true);
        shakeEmptyField(loginPasswordInput);
        showFeedback(feedbackNode, '这把密钥和号码记录还没对上，再轻轻确认一次。', 'error');
        return false;
    }

    updateInvalidState(loginPhoneInput, false);
    updateInvalidState(loginPasswordInput, false);
    syncRememberMeStorage(nodes);
    showFeedback(feedbackNode, '入口已经替你打开，接下来会慢慢回到海面那一层。', 'success');
    return true;
}

function handleRegisterSubmit(nodes, feedbackNode) {
    const {
        registerPhoneInput,
        registerPasswordInput,
        registerConfirmInput,
        agreeTermsInput
    } = nodes;

    const requiredInputs = [
        registerPhoneInput,
        registerPasswordInput,
        registerConfirmInput,
        agreeTermsInput
    ];

    const validation = validateRequiredInputs(requiredInputs);
    const phoneState = syncPhoneValidationOnSubmit(registerPhoneInput);
    if (!validation.isValid) {
        requiredInputs.forEach((input) => {
            const empty = input.type === 'checkbox' ? !input.checked : !input.value.trim();
            if (empty) {
                shakeEmptyField(input);
            }
        });

        if (phoneState.hasValue && !phoneState.isValid) {
            shakeEmptyField(registerPhoneInput);
            showFeedback(feedbackNode, '手机号需要是 11 位中国大陆手机号。', 'error');
            return false;
        }

        const firstMessage = getFirstIncompleteFieldMessage(validation.firstEmptyInput);
        if (firstMessage) {
            showFeedback(feedbackNode, firstMessage, 'error');
        }

        return false;
    }

    if (!phoneState.isValid) {
        updateInvalidState(registerPhoneInput, true);
        updateInvalidState(registerPasswordInput, false);
        updateInvalidState(registerConfirmInput, false);
        shakeEmptyField(registerPhoneInput);
        showFeedback(feedbackNode, '手机号需要是 11 位中国大陆手机号。', 'error');
        return false;
    }

    if (registerPasswordInput.value !== registerConfirmInput.value) {
        updateInvalidState(registerPasswordInput, true);
        updateInvalidState(registerConfirmInput, true);
        shakeEmptyField(registerConfirmInput);
        showFeedback(feedbackNode, '两次写下的密钥还没有对齐，再确认一次更稳。', 'error');
        return false;
    }

    const nextAccount = buildAccount(nodes);
    const accounts = safeReadAccounts();

    if (isAccountDuplicated(accounts, nextAccount)) {
        showFeedback(feedbackNode, '这层静水已经记住过这串号码了，换一个入口更稳。', 'error');
        return false;
    }

    accounts.push(nextAccount);
    if (!safeSaveAccounts(accounts)) {
        showFeedback(feedbackNode, '这次登记还没能留在本地静水里，请稍后再试一次。', 'error');
        return false;
    }

    showFeedback(feedbackNode, '盐憩已经记住这串号码了，接下来可以慢慢进入第一层海。', 'success');
    return true;
}

/**
 * bindGuestEntries(nodes) - 绑定游客入口与辅助入口的进入行为
 * @param {object} nodes - 页面节点集合
 * @returns {void}
 */
function bindGuestEntries(nodes, feedbackNode) {
    const { guestButton, demoVoyageButton, forgotLink } = nodes;

    demoVoyageButton?.addEventListener('click', (event) => {
        event.preventDefault();
        triggerDepthResponse(1.18);
        startDemoVoyage(feedbackNode);
    });

    if (guestButton) {
        guestButton.addEventListener('click', (event) => {
            event.preventDefault();
            triggerDepthResponse(0.96);
            startGuestVoyage(feedbackNode);
        });
    }

    forgotLink?.addEventListener('click', (event) => {
        event.preventDefault();
        triggerDepthResponse(0.88);
        showFeedback(feedbackNode, '找回入口会先把你带去联络状态说明，再从那里继续进入演示留言台；这次不会伪装成真实找回系统。', 'info');
        window.setTimeout(() => {
            navigateToPage(forgotLink.getAttribute('href') || 'contact.html#contactStatusSection');
        }, 420);
    });
}

function bindFormSubmit(nodes, feedbackNode) {
    const { authForm } = nodes;
    if (!authForm) {
        return;
    }

    authForm.addEventListener('submit', (event) => {
        event.preventDefault();
        clearFeedback(feedbackNode);
        document.body.classList.remove('is-auth-entering-mainline');
        authForm.querySelectorAll('.auth-cta.is-entering-mainline').forEach((button) => {
            button.classList.remove('is-entering-mainline');
        });

        const activeContent = document.querySelector('.tab-content.active');
        if (!activeContent) {
            return;
        }

        const isLogin = activeContent.id === 'login';
        const isSuccess = isLogin
            ? handleLoginSubmit(nodes, feedbackNode)
            : handleRegisterSubmit(nodes, feedbackNode);

        if (!isSuccess) {
            return;
        }

        const submitButton = activeContent.querySelector('.auth-cta');
        if (submitButton) {
            submitButton.classList.add('is-entering-mainline');
        }

        document.body.classList.add('is-auth-entering-mainline');
        if (isLogin) {
            if (typeof nodes.entranceProgressReadyTimerId === 'number') {
                window.clearTimeout(nodes.entranceProgressReadyTimerId);
            }
            nodes.entranceProgressReadyTimerId = 0;
            nodes.entranceProgressReadySignature = getLoginEntranceReadySignature(nodes);
            nodes.entranceProgressReadySettled = true;
            updateEntranceProgress(nodes);
        }
        triggerDepthResponse(1.18);

        window.setTimeout(() => {
            navigateToHome();
        }, 420);
    });
}

function bindTabSwitching(nodes, feedbackNode) {
    const { authForm, tabButtons, tabContents, formBrand, tabSection, footerLinks, glassCard } = nodes;

    const refs = {
        authForm,
        tabBtns: tabButtons,
        tabContents,
        feedbackNode,
        glassCard,
        formBrand,
        tabSection,
        footerLinks,
        nodes
    };

    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            switchToTab(tabName, { immediate: false }, refs);
        });

        button.addEventListener('keydown', (event) => {
            const currentIndex = tabButtons.indexOf(button);
            if (currentIndex < 0) {
                return;
            }

            let nextIndex = currentIndex;

            if (event.key === 'ArrowRight') {
                nextIndex = (currentIndex + 1) % tabButtons.length;
            } else if (event.key === 'ArrowLeft') {
                nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
            } else if (event.key === 'Home') {
                nextIndex = 0;
            } else if (event.key === 'End') {
                nextIndex = tabButtons.length - 1;
            } else {
                return;
            }

            event.preventDefault();
            const nextButton = tabButtons[nextIndex];
            const nextTabName = nextButton?.getAttribute('data-tab');
            if (!nextButton || !nextTabName) {
                return;
            }

            nextButton.focus();
            switchToTab(nextTabName, { immediate: false }, refs);
        });
    });

    const initialTab = document.body.dataset.authMode || 'login';
    switchToTab(initialTab, { immediate: true }, refs);
}

/**
 * setupLoginStageResize(nodes) - 给桌面端登录舞台添加鼠标拖拽缩放
 * @param {object} nodes - 页面节点集合
 * @returns {void}
 */
function setupLoginStageResize(nodes) {
    const { loginStageShell, resizeHandles } = nodes;
    if (!loginStageShell || !resizeHandles.length) {
        return;
    }

    const desktopQuery = window.matchMedia('(min-width: 981px)');
    const savedSize = safeReadLoginStageSize();

    if (!isStageDebugModeEnabled) {
        if (desktopQuery.matches && savedSize) {
            applyLoginStageSize(loginStageShell, savedSize);
            loginStageShell.dataset.stageSizeMode = 'custom';
        } else {
            loginStageShell.dataset.stageSizeMode = 'default';
            loginStageShell.style.removeProperty('--login-stage-width');
            loginStageShell.style.removeProperty('--login-stage-height');
            loginStageShell.style.removeProperty('--login-stage-shift-x');
            loginStageShell.style.removeProperty('--login-stage-shift-y');
        }

        loginStageShell.classList.remove('is-resizing');
        document.body.classList.remove('is-resizing-login-stage');
        return;
    }

    const hudValue = document.getElementById('loginStageHudValue');
    const hudHint = document.getElementById('loginStageHudHint');
    const resetButton = document.getElementById('loginStageReset');
    let resizeState = null;
    let activeResizeHandle = null;
    let hasCustomSize = Boolean(savedSize);

    const readCurrentStageSize = () => {
        const rect = loginStageShell.getBoundingClientRect();
        return {
            width: rect.width,
            height: rect.height
        };
    };

    const syncStageHud = (size = null) => {
        loginStageShell.dataset.stageSizeMode = hasCustomSize ? 'custom' : 'default';

        if (!hudValue || !hudHint || !resetButton || !desktopQuery.matches) {
            return;
        }

        const nextSize = size || readCurrentStageSize();
        hudValue.textContent = `${Math.round(nextSize.width)} x ${Math.round(nextSize.height)}`;
        hudHint.textContent = hasCustomSize ? '已记住本次门厅尺度' : '当前为默认门厅';
        resetButton.disabled = !hasCustomSize;
    };

    const syncDesktopState = () => {
        if (desktopQuery.matches) {
            const saved = safeReadLoginStageSize();
            hasCustomSize = Boolean(saved);
            if (saved) {
                applyLoginStageSize(loginStageShell, saved);
            }
            syncStageHud();
            return;
        }

        resizeState = null;
        loginStageShell.classList.remove('is-resizing');
        document.body.classList.remove('is-resizing-login-stage');
        loginStageShell.style.removeProperty('--login-stage-width');
        loginStageShell.style.removeProperty('--login-stage-height');
        syncStageHud();
    };

    const stopResize = () => {
        if (!resizeState) {
            return;
        }

        const finalSize = {
            width: resizeState.width,
            height: resizeState.height,
            shiftX: resizeState.shiftX,
            shiftY: resizeState.shiftY
        };
        const state = resizeState;

        resizeState = null;
        activeResizeHandle?.removeEventListener('lostpointercapture', stopResize);
        activeResizeHandle = null;
        loginStageShell.classList.remove('is-resizing');
        document.body.classList.remove('is-resizing-login-stage');
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', stopResize);
        window.removeEventListener('pointercancel', stopResize);

        if (state.hadCustomSize || state.hasMoved) {
            hasCustomSize = true;
            safeSaveLoginStageSize(finalSize);
            syncStageHud(finalSize);
            return;
        }

        hasCustomSize = false;
        syncStageHud();
    };

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
        let nextShiftY = resizeState.startShiftY;

        if (direction.includes('e')) {
            nextWidth += dx;
            nextShiftX += dx / 2;
        }
        if (direction.includes('w')) {
            nextWidth -= dx;
            nextShiftX += dx / 2;
        }
        if (direction.includes('s')) {
            nextHeight += dy;
            nextShiftY += dy / 2;
        }
        if (direction.includes('n')) {
            nextHeight -= dy;
            nextShiftY += dy / 2;
        }

        const clamped = clampLoginStageSize(loginStageShell, nextWidth, nextHeight, nextShiftX, nextShiftY);
        resizeState.hasMoved =
            resizeState.hasMoved ||
            Math.abs(clamped.width - resizeState.startWidth) > 0.5 ||
            Math.abs(clamped.height - resizeState.startHeight) > 0.5 ||
            Math.abs(clamped.shiftX - resizeState.startShiftX) > 0.5 ||
            Math.abs(clamped.shiftY - resizeState.startShiftY) > 0.5;
        resizeState.width = clamped.width;
        resizeState.height = clamped.height;
        resizeState.shiftX = clamped.shiftX;
        resizeState.shiftY = clamped.shiftY;
        hasCustomSize = resizeState.hadCustomSize || resizeState.hasMoved;
        applyLoginStageSize(loginStageShell, clamped);
        syncStageHud(clamped);
    };

    resizeHandles.forEach((handle) => {
        handle.addEventListener('pointerdown', (event) => {
            if (!desktopQuery.matches) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            const rect = loginStageShell.getBoundingClientRect();
            resizeState = {
                direction: handle.dataset.resizeDirection || 'se',
                startX: event.clientX,
                startY: event.clientY,
                startWidth: rect.width,
                startHeight: rect.height,
                startShiftX: parseFloat(getComputedStyle(loginStageShell).getPropertyValue('--login-stage-shift-x')) || 0,
                startShiftY: parseFloat(getComputedStyle(loginStageShell).getPropertyValue('--login-stage-shift-y')) || 0,
                width: rect.width,
                height: rect.height,
                shiftX: parseFloat(getComputedStyle(loginStageShell).getPropertyValue('--login-stage-shift-x')) || 0,
                shiftY: parseFloat(getComputedStyle(loginStageShell).getPropertyValue('--login-stage-shift-y')) || 0,
                hasMoved: false,
                hadCustomSize: hasCustomSize
            };

            activeResizeHandle?.removeEventListener('lostpointercapture', stopResize);
            activeResizeHandle = handle;
            if (typeof handle.setPointerCapture === 'function') {
                try {
                    handle.setPointerCapture(event.pointerId);
                } catch (error) {
                    // 个别浏览器或设备在调试句柄上不支持 capture，这里静默降级到 window 监听。
                }
            }
            activeResizeHandle.addEventListener('lostpointercapture', stopResize);
            loginStageShell.classList.add('is-resizing');
            document.body.classList.add('is-resizing-login-stage');
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', stopResize);
            window.addEventListener('pointercancel', stopResize);
        });
    });

    loginStageShell.addEventListener('dblclick', (event) => {
        if (!desktopQuery.matches || !event.target.closest('.login-stage-resize-handle')) {
            return;
        }

        clearLoginStageSize(loginStageShell);
        hasCustomSize = false;
        syncStageHud();
    });

    if (resetButton) {
        resetButton.addEventListener('click', () => {
            if (!desktopQuery.matches || !hasCustomSize) {
                return;
            }

            clearLoginStageSize(loginStageShell);
            hasCustomSize = false;
            syncStageHud();
        });
    }

    desktopQuery.addEventListener('change', syncDesktopState);
    window.addEventListener('resize', () => {
        if (!desktopQuery.matches) {
            return;
        }

        const saved = safeReadLoginStageSize();
        if (saved) {
            applyLoginStageSize(loginStageShell, saved);
        }

        hasCustomSize = Boolean(saved);
        syncStageHud();
    });

    if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
            if (desktopQuery.matches) {
                syncStageHud();
            }
        });
        resizeObserver.observe(loginStageShell);
    }

    syncDesktopState();
}

/**
 * collectAuthNodes() - 收集登录页需要使用的核心 DOM 节点
 * @returns {object} - 登录页节点引用集合
 */
function collectAuthNodes() {
    return {
        authForm: document.getElementById('authForm'),
        tabButtons: Array.from(document.querySelectorAll('.tab-btn')),
        tabContents: Array.from(document.querySelectorAll('.tab-content')),
        formBrand: document.querySelector('.form-brand'),
        tabSection: document.querySelector('.tab-section'),
        footerLinks: document.querySelector('.footer-links'),
        glassCard: document.querySelector('.glass-card'),
        panelInner: document.querySelector('.auth-panel-inner'),
        loginStageShell: document.getElementById('loginStageShell'),
        resizeHandles: Array.from(document.querySelectorAll('.login-stage-resize-handle')),
        allInputs: Array.from(document.querySelectorAll('#authForm input')),
        loginPhoneInput: document.getElementById('login-phone'),
        loginPasswordInput: document.getElementById('login-password'),
        registerPhoneInput: document.getElementById('register-phone'),
        registerPasswordInput: document.getElementById('register-password'),
        registerConfirmInput: document.getElementById('register-confirm'),
        rememberCheckbox: document.getElementById('remember-me'),
        agreeTermsInput: document.getElementById('agree-terms'),
        guestButton: document.querySelector('[data-guest-entry="soft-browse"]'),
        demoVoyageButton: document.getElementById('demoVoyageButton'),
        forgotLink: document.querySelector('.link-forgot[data-brand-link="forgot"]'),
        sideWaterlineTrack: document.getElementById('sideWaterlineTrack'),
        sideWaterlineFill: document.getElementById('sideWaterlineFill'),
        sideWaterlineValue: document.getElementById('sideWaterlineValue'),
        sideWaterlineStatus: document.getElementById('sideWaterlineStatus')
    };
}

/**
 * initializeAuthPage() - 初始化潜前门厅的认证交互、反馈和深度计联动
 * @returns {void}
 */
function initializeAuthPage() {
    const nodes = collectAuthNodes();
    const feedbackNode = ensureFeedbackNode(nodes.panelInner);

    setupStageDebugToggle();
    setupLoginStageResize(nodes);
    bindTabSwitching(nodes, feedbackNode);
    bindPhoneInputSanitizer(nodes);
    bindFieldStateTracking(nodes);
    bindEntranceProgress(nodes);
    bindRememberMe(nodes);
    bindInteractiveFeedback(nodes, feedbackNode);
    bindFormSubmit(nodes, feedbackNode);
    bindGuestEntries(nodes, feedbackNode);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            document.body.classList.add('is-entered');
        });
    });
}

document.addEventListener('DOMContentLoaded', initializeAuthPage);
