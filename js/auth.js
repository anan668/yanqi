/* ============================================
   Login Page Logic - auth.js
   ============================================
   ?????
   1. ???? / ?????????????????????????????????
   2. ???????????????????????????????????????????
   3. ?????? -> ???? -> ???? -> ???? -> ???????????
*/

﻿const TAB_SWITCH_MS = 560;
const TAB_LEAVE_MS = 320;
const FEEDBACK_RESET_MS = 4200;
const LOGIN_STORAGE_KEYS = Object.freeze({
    email: 'yanqi_email',
    password: 'yanqi_password',
    accounts: 'yanqi_accounts'
});
const LOGIN_STAGE_STORAGE_KEY = 'yanqi_login_stage_size';

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
 * navigateToHome() - 统一从登录门厅进入首页，复用已有潜浮式跳转逻辑
 * @returns {void}
 */
function navigateToHome() {
    const manager = getDepthManager();
    if (manager && typeof manager.navigateTo === 'function') {
        manager.navigateTo('home.html');
        return;
    }

    window.location.href = 'home.html';
}

/**
 * safeReadAccounts() - 从本地存储读取已注册账户列表
 * @returns {Array<object>} - 已注册账户数组；读取失败时返回空数组
 */
function safeReadAccounts() {
    try {
        const raw = localStorage.getItem(LOGIN_STORAGE_KEYS.accounts);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

/**
 * safeSaveAccounts(accounts) - 将注册账户列表写回本地存储
 * @param {Array<object>} accounts - 需要保存的账户数组
 * @returns {boolean} - 是否保存成功
 */
function safeSaveAccounts(accounts) {
    try {
        localStorage.setItem(LOGIN_STORAGE_KEYS.accounts, JSON.stringify(accounts));
        return true;
    } catch (error) {
        return false;
    }
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

        return parsed;
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

    try {
        localStorage.removeItem(LOGIN_STAGE_STORAGE_KEY);
    } catch (error) {
        // 忽略本地存储异常，保持页面可用。
    }
}

/**
 * clampLoginStageSize(shell, width, height) - 按当前视口限制登录舞台的最小 / 最大尺寸
 * @param {HTMLElement} shell - 登录舞台外壳
 * @param {number} width - 目标宽度
 * @param {number} height - 目标高度
 * @returns {{width:number,height:number}} - 经过限制后的尺寸
 */
function clampLoginStageSize(shell, width, height) {
    const sidePadding = Math.max(48, Math.min(window.innerWidth * 0.08, 160));
    const minWidth = 760;
    const maxWidth = Math.max(minWidth, Math.min(1240, window.innerWidth - sidePadding));
    const minHeight = 590;
    const maxHeight = Math.max(minHeight, Math.min(860, window.innerHeight - 36));

    return {
        width: Math.min(Math.max(width, minWidth), maxWidth),
        height: Math.min(Math.max(height, minHeight), maxHeight)
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
        return;
    }

    const nextSize = clampLoginStageSize(shell, size.width, size.height);
    shell.style.setProperty('--login-stage-width', `${Math.round(nextSize.width)}px`);
    shell.style.setProperty('--login-stage-height', `${Math.round(nextSize.height)}px`);
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

    input.classList.toggle('is-invalid', Boolean(isInvalid));
}

/**
 * shakeEmptyField(input) - 让未填写字段所在分组左右轻晃
 * @param {HTMLInputElement|null} input - 当前未填写的输入框或复选框
 * @returns {void}
 */
function shakeEmptyField(input) {
    if (!input) {
        return;
    }

    const group = input.closest('.input-group, .checkbox-group');
    if (group) {
        group.classList.remove('is-shaking');
        void group.offsetWidth;
        group.classList.add('is-shaking');

        window.setTimeout(() => {
            group.classList.remove('is-shaking');
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

/**
 * formatTabAnimationDelays(tabName) - 为不同认证模式返回分层出现的延迟节奏
 * @param {string} tabName - 当前认证模式，login 或 register
 * @returns {number[]} - 该模式下字段动画的延迟列表
 */
function formatTabAnimationDelays(tabName) {
    return tabName === 'login'
        ? [0.16, 0.3, 0.42, 0.56]
        : [0.16, 0.3, 0.44, 0.58, 0.72, 0.86];
}

/**
 * replayTabAnimations(tabName, refs) - 按当前模式重播品牌区、表单区和社交区的浮现节奏
 * @param {string} tabName - 当前认证模式
 * @param {object} refs - 页面关键 DOM 引用集合
 * @returns {void}
 */
function replayTabAnimations(tabName, refs) {
    const { formBrand, tabSection, footerLinks, socialLogin, activeContent } = refs;
    const delays = formatTabAnimationDelays(tabName);

    restartFadeIn(formBrand, 0.06);
    restartFadeIn(tabSection, 0.1);

    activeContent.querySelectorAll('.fade-in-up').forEach((item, index) => {
        restartFadeIn(item, delays[index] ?? (0.16 + index * 0.14));
    });

    restartFadeIn(footerLinks, tabName === 'login' ? 0.72 : 0.98);
    restartFadeIn(socialLogin, tabName === 'login' ? 0.84 : 1.1);
}

/**
 * updateFormHeight(targetContent, authForm, immediate, fromContent) - 平滑更新表单容器高度，避免切换时跳动
 * @param {HTMLElement|null} targetContent - 目标内容容器
 * @param {HTMLElement|null} authForm - 表单包裹容器
 * @param {boolean} immediate - 是否立即同步高度
 * @param {HTMLElement|null} fromContent - 离场内容容器
 * @returns {void}
 */
function updateFormHeight(targetContent, authForm, immediate = false, fromContent = null) {
    if (!targetContent || !authForm) {
        return;
    }

    const nextHeight = targetContent.scrollHeight;
    if (immediate) {
        authForm.style.minHeight = `${nextHeight}px`;
        return;
    }

    const currentHeight = fromContent
        ? fromContent.scrollHeight
        : (authForm.getBoundingClientRect().height || nextHeight);

    authForm.style.minHeight = `${currentHeight}px`;
    requestAnimationFrame(() => {
        authForm.style.minHeight = `${nextHeight}px`;
    });
}

/**
 * switchToTab(tabName, options, refs) - 切换登录与注册面板，并同步外层状态类、动画与深度反馈
 * @param {string} tabName - 目标模式，login 或 register
 * @param {object} options - 额外配置，如 immediate
 * @param {object} refs - 需要用到的 DOM 引用集合
 * @returns {void}
 */
function switchToTab(tabName, options, refs) {
    const { immediate = false } = options || {};
    const { authForm, tabBtns, tabContents, feedbackNode, glassCard, formBrand, tabSection, footerLinks, socialLogin } = refs;

    const targetContent = document.getElementById(tabName);
    const currentContent = document.querySelector('.tab-content.active');
    if (!targetContent) {
        return;
    }

    document.body.dataset.authMode = tabName;
    document.body.classList.toggle('is-auth-login', tabName === 'login');
    document.body.classList.toggle('is-auth-register', tabName === 'register');
    document.body.classList.toggle('is-switching', !immediate);
    clearFeedback(feedbackNode);

    tabBtns.forEach((btn) => {
        const isActive = btn.getAttribute('data-tab') === tabName;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', String(isActive));
    });

    tabContents.forEach((content) => {
        const isTarget = content === targetContent;
        const isLeaving = !isTarget && content === currentContent && !immediate;

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
        updateFormHeight(targetContent, authForm, true);

        requestAnimationFrame(() => {
            targetContent.classList.remove('is-entering');
            document.body.classList.remove('is-switching');
        });

        replayTabAnimations(tabName, { formBrand, tabSection, footerLinks, socialLogin, activeContent: targetContent });
        triggerDepthResponse(0.86);
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
        currentContent.leaveTimerId = 0;
    }, TAB_LEAVE_MS + 40);

    targetContent.classList.remove('is-leaving');
    targetContent.classList.add('active', 'is-entering');
    updateFormHeight(targetContent, authForm, false, currentContent);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            targetContent.classList.remove('is-entering');
        });
    });

    window.setTimeout(() => {
        document.body.classList.remove('is-switching');
    }, TAB_SWITCH_MS);

    replayTabAnimations(tabName, { formBrand, tabSection, footerLinks, socialLogin, activeContent: targetContent });
    triggerDepthResponse(1.06);
}

/**
 * restoreRememberedAccount(nodes) - 恢复“记住我”和最近一次注册的账户信息
 * @param {object} nodes - 登录页常用字段节点
 * @returns {void}
 */
function restoreRememberedAccount(nodes) {
    const { rememberCheckbox, loginEmailInput, loginPasswordInput, registerEmailInput, registerPhoneInput } = nodes;

    try {
        const savedEmail = localStorage.getItem(LOGIN_STORAGE_KEYS.email);
        const savedPassword = localStorage.getItem(LOGIN_STORAGE_KEYS.password);

        if (savedEmail && savedPassword) {
            loginEmailInput.value = savedEmail;
            loginPasswordInput.value = savedPassword;
            rememberCheckbox.checked = true;
        }
    } catch (error) {
        // 本地存储不可用时静默降级，不阻断登录页使用。
    }

    const accounts = safeReadAccounts();
    if (accounts.length > 0) {
        const lastAccount = accounts[accounts.length - 1];
        registerEmailInput.value = lastAccount.email || '';
        registerPhoneInput.value = lastAccount.phone || '';
    }
}

/**
 * syncRememberMeStorage(nodes) - 按“记住我”状态同步保存或移除本地登录信息
 * @param {object} nodes - 登录字段与复选框节点集合
 * @returns {void}
 */
function syncRememberMeStorage(nodes) {
    const { rememberCheckbox, loginEmailInput, loginPasswordInput } = nodes;

    try {
        if (rememberCheckbox.checked) {
            localStorage.setItem(LOGIN_STORAGE_KEYS.email, loginEmailInput.value.trim());
            localStorage.setItem(LOGIN_STORAGE_KEYS.password, loginPasswordInput.value);
        } else {
            localStorage.removeItem(LOGIN_STORAGE_KEYS.email);
            localStorage.removeItem(LOGIN_STORAGE_KEYS.password);
        }
    } catch (error) {
        // 本地存储不可用时静默降级。
    }
}

/**
 * bindRememberMe(nodes) - 绑定“记住我”相关的字段更新与初始回填
 * @param {object} nodes - 登录与注册字段节点集合
 * @returns {void}
 */
function bindRememberMe(nodes) {
    const { rememberCheckbox, loginEmailInput, loginPasswordInput } = nodes;
    restoreRememberedAccount(nodes);

    rememberCheckbox.addEventListener('change', () => {
        syncRememberMeStorage(nodes);
    });

    [loginEmailInput, loginPasswordInput].forEach((input) => {
        input.addEventListener('input', () => {
            if (rememberCheckbox.checked) {
                syncRememberMeStorage(nodes);
            }
        });
    });
}

/**
 * buildAccount(nodes) - 从注册表单构建新的账户对象
 * @param {object} nodes - 注册字段节点集合
 * @returns {object} - 用于写入本地存储的新账户数据
 */
function buildAccount(nodes) {
    return {
        email: nodes.registerEmailInput.value.trim(),
        phone: nodes.registerPhoneInput.value.trim(),
        password: nodes.registerPasswordInput.value,
        registeredAt: new Date().toISOString()
    };
}

/**
 * isAccountDuplicated(accounts, nextAccount) - 检查邮箱或手机号是否已经注册过
 * @param {Array<object>} accounts - 当前已注册账户列表
 * @param {object} nextAccount - 待注册的新账户
 * @returns {boolean} - 已存在相同邮箱或手机号时返回 true
 */
function isAccountDuplicated(accounts, nextAccount) {
    return accounts.some((account) => account.email === nextAccount.email || account.phone === nextAccount.phone);
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
        document.querySelector('.input-group:focus-within') ||
        document.querySelector('.social-btn:hover') ||
        document.querySelector('.glass-card:hover')
    );

    markInteractiveFieldState(shouldActivate);
}

/**
 * bindInteractiveFeedback(nodes, feedbackNode) - 绑定输入框、玻璃舞台和社交入口的轻反馈行为
 * @param {object} nodes - 页面节点集合
 * @param {HTMLElement|null} feedbackNode - 反馈节点
 * @returns {void}
 */
function bindInteractiveFeedback(nodes, feedbackNode) {
    const { glassCard, socialButtons, allInputs } = nodes;

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

    socialButtons.forEach((button) => {
        button.addEventListener('mouseenter', () => {
            triggerDepthResponse(1.02);
            markInteractiveFieldState(true);
        });

        button.addEventListener('mouseleave', () => {
            window.setTimeout(syncFieldInteractiveState, 0);
        });

        button.addEventListener('click', (event) => {
            event.preventDefault();
            if (glassCard) {
                glassCard.classList.remove('is-rippled');
                void glassCard.offsetWidth;
                glassCard.classList.add('is-rippled');
                window.setTimeout(() => {
                    glassCard.classList.remove('is-rippled');
                }, 360);
            }
            triggerDepthResponse(1.18);
            navigateToHome();
        });
    });
}

/**
 * handleLoginSubmit(nodes, feedbackNode) - 处理登录模式的表单提交与本地校验
 * @param {object} nodes - 登录页节点集合
 * @param {HTMLElement|null} feedbackNode - 反馈节点
 * @returns {boolean} - 校验通过时返回 true
 */
function handleLoginSubmit(nodes, feedbackNode) {
    const { loginEmailInput, loginPasswordInput, rememberCheckbox } = nodes;
    const requiredInputs = [loginEmailInput, loginPasswordInput];
    const validation = validateRequiredInputs(requiredInputs);

    if (!validation.isValid) {
        requiredInputs.forEach((input) => {
            const empty = input.type === 'checkbox' ? !input.checked : !input.value.trim();
            if (empty) {
                shakeEmptyField(input);
            }
        });
        return false;
    }

    if (rememberCheckbox.checked) {
        syncRememberMeStorage(nodes);
    }

    showFeedback(feedbackNode, '入口已经替你打开，接下来会慢慢回到海面那一层。', 'success');
    return true;
}

/**
 * handleRegisterSubmit(nodes, feedbackNode) - 处理注册模式的本地校验与账户写入
 * @param {object} nodes - 注册页字段集合
 * @param {HTMLElement|null} feedbackNode - 反馈节点
 * @returns {boolean} - 注册成功时返回 true
 */
function handleRegisterSubmit(nodes, feedbackNode) {
    const {
        registerEmailInput,
        registerPhoneInput,
        registerPasswordInput,
        registerConfirmInput,
        agreeTermsInput
    } = nodes;

    const requiredInputs = [
        registerEmailInput,
        registerPhoneInput,
        registerPasswordInput,
        registerConfirmInput,
        agreeTermsInput
    ];

    const validation = validateRequiredInputs(requiredInputs);
    if (!validation.isValid) {
        requiredInputs.forEach((input) => {
            const empty = input.type === 'checkbox' ? !input.checked : !input.value.trim();
            if (empty) {
                shakeEmptyField(input);
            }
        });

        if (!agreeTermsInput.checked) {
            showFeedback(feedbackNode, '在继续之前，请先看看这份约定。还差一步：请先阅读并同意用户协议与隐私政策。', 'error');
        }

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
        showFeedback(feedbackNode, '这层静水已经记住过这个邮箱或手机号了，换一个入口更稳。', 'error');
        return false;
    }

    accounts.push(nextAccount);
    safeSaveAccounts(accounts);
    showFeedback(feedbackNode, '盐憩已经记住你了，接下来可以慢慢进入第一层海。', 'success');
    return true;
}

/**
 * bindGuestEntries(nodes) - 绑定游客入口与辅助入口的进入行为
 * @param {object} nodes - 页面节点集合
 * @returns {void}
 */
function bindGuestEntries(nodes) {
    const { guestButton, guestLoginButton } = nodes;

    if (guestButton) {
        guestButton.addEventListener('click', (event) => {
            event.preventDefault();
            navigateToHome();
        });
    }

    if (guestLoginButton) {
        guestLoginButton.addEventListener('click', (event) => {
            event.preventDefault();
            navigateToHome();
        });
    }
}

/**
 * bindFormSubmit(nodes, feedbackNode) - 绑定登录与注册表单提交逻辑
 * @param {object} nodes - 页面节点集合
 * @param {HTMLElement|null} feedbackNode - 反馈节点
 * @returns {void}
 */
function bindFormSubmit(nodes, feedbackNode) {
    const { authForm } = nodes;
    if (!authForm) {
        return;
    }

    authForm.addEventListener('submit', (event) => {
        event.preventDefault();
        clearFeedback(feedbackNode);

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

        window.setTimeout(() => {
            navigateToHome();
        }, 360);
    });
}

/**
 * bindTabSwitching(nodes, feedbackNode) - 绑定登录/注册模式切换按钮
 * @param {object} nodes - 页面节点集合
 * @param {HTMLElement|null} feedbackNode - 反馈节点
 * @returns {void}
 */
function bindTabSwitching(nodes, feedbackNode) {
    const { authForm, tabButtons, tabContents, formBrand, tabSection, footerLinks, socialLogin, glassCard } = nodes;

    const refs = {
        authForm,
        tabBtns: tabButtons,
        tabContents,
        feedbackNode,
        glassCard,
        formBrand,
        tabSection,
        footerLinks,
        socialLogin
    };

    tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            switchToTab(tabName, { immediate: false }, refs);
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
    let resizeState = null;

    const syncDesktopState = () => {
        if (desktopQuery.matches) {
            const saved = safeReadLoginStageSize();
            if (saved) {
                applyLoginStageSize(loginStageShell, saved);
            }
            return;
        }

        loginStageShell.classList.remove('is-resizing');
        document.body.classList.remove('is-resizing-login-stage');
        loginStageShell.style.removeProperty('--login-stage-width');
        loginStageShell.style.removeProperty('--login-stage-height');
    };

    const stopResize = () => {
        if (!resizeState) {
            return;
        }

        const finalSize = {
            width: resizeState.width,
            height: resizeState.height
        };

        resizeState = null;
        loginStageShell.classList.remove('is-resizing');
        document.body.classList.remove('is-resizing-login-stage');
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', stopResize);
        window.removeEventListener('pointercancel', stopResize);
        safeSaveLoginStageSize(finalSize);
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

        if (direction.includes('e')) {
            nextWidth += dx;
        }
        if (direction.includes('w')) {
            nextWidth -= dx;
        }
        if (direction.includes('s')) {
            nextHeight += dy;
        }
        if (direction.includes('n')) {
            nextHeight -= dy;
        }

        const clamped = clampLoginStageSize(loginStageShell, nextWidth, nextHeight);
        resizeState.width = clamped.width;
        resizeState.height = clamped.height;
        applyLoginStageSize(loginStageShell, clamped);
    };

    resizeHandles.forEach((handle) => {
        handle.addEventListener('pointerdown', (event) => {
            if (!desktopQuery.matches) {
                return;
            }

            event.preventDefault();
            const rect = loginStageShell.getBoundingClientRect();
            resizeState = {
                direction: handle.dataset.resizeDirection || 'se',
                startX: event.clientX,
                startY: event.clientY,
                startWidth: rect.width,
                startHeight: rect.height,
                width: rect.width,
                height: rect.height
            };

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
    });

    desktopQuery.addEventListener('change', syncDesktopState);
    window.addEventListener('resize', () => {
        if (!desktopQuery.matches) {
            return;
        }

        const saved = safeReadLoginStageSize();
        if (saved) {
            applyLoginStageSize(loginStageShell, saved);
        }
    });

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
        socialLogin: document.querySelector('.social-login'),
        socialButtons: Array.from(document.querySelectorAll('.social-btn')),
        glassCard: document.querySelector('.glass-card'),
        panelInner: document.querySelector('.auth-panel-inner'),
        loginStageShell: document.getElementById('loginStageShell'),
        resizeHandles: Array.from(document.querySelectorAll('.login-stage-resize-handle')),
        allInputs: Array.from(document.querySelectorAll('#authForm input')),
        loginEmailInput: document.getElementById('login-email'),
        loginPasswordInput: document.getElementById('login-password'),
        registerEmailInput: document.getElementById('register-email'),
        registerPhoneInput: document.getElementById('register-phone'),
        registerPasswordInput: document.getElementById('register-password'),
        registerConfirmInput: document.getElementById('register-confirm'),
        rememberCheckbox: document.getElementById('remember-me'),
        agreeTermsInput: document.getElementById('agree-terms'),
        guestButton: document.querySelector('.link-guest'),
        guestLoginButton: document.getElementById('guest-login-btn')
    };
}

/**
 * initializeAuthPage() - 初始化潜前门厅的认证交互、反馈和深度计联动
 * @returns {void}
 */
function initializeAuthPage() {
    const nodes = collectAuthNodes();
    const feedbackNode = ensureFeedbackNode(nodes.panelInner);

    setupLoginStageResize(nodes);
    bindTabSwitching(nodes, feedbackNode);
    bindRememberMe(nodes);
    bindInteractiveFeedback(nodes, feedbackNode);
    bindFormSubmit(nodes, feedbackNode);
    bindGuestEntries(nodes);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            document.body.classList.add('is-entered');
        });
    });
}

document.addEventListener('DOMContentLoaded', initializeAuthPage);
