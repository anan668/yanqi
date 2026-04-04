(function () {
    const MODAL_ID = 'yanqiAvatarReturnModal';
    const ACTIVE_CLASS = 'active';
    const CLOSING_CLASS = 'is-closing';
    const LOCK_CLASS = 'has-avatar-return-open';
    const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const DEFAULT_CONFIG = Object.freeze({
        selector: '.avatar',
        targetUrl: 'index.html',
        kicker: 'Surface Check',
        title: '\u8981\u6162\u6162\u56de\u5230\u5165\u53e3\u5417\uff1f',
        copy: '\u5982\u679c\u8fd9\u6b21\u6d4f\u89c8\u5148\u505c\u5728\u8fd9\u91cc\uff0c\u76d0\u61a9\u4f1a\u628a\u4f60\u8f7b\u8f7b\u9001\u56de\u767b\u5f55\u95e8\u5385\uff0c\u518d\u4ece\u6d77\u9762\u91cd\u65b0\u8fdb\u5165\u3002',
        confirmLabel: '\u56de\u5230\u5165\u53e3',
        cancelLabel: '\u7ee7\u7eed\u505c\u5728\u8fd9\u91cc',
        triggerLabel: '\u6253\u5f00\u8fd4\u56de\u5165\u53e3\u786e\u8ba4'
    });

    const state = {
        modal: null,
        dialog: null,
        kickerNode: null,
        titleNode: null,
        copyNode: null,
        confirmButton: null,
        cancelButton: null,
        closeTimerId: 0,
        isOpen: false,
        lastActiveElement: null,
        currentConfig: DEFAULT_CONFIG
    };

    function normalizeConfig(config = {}) {
        return {
            ...DEFAULT_CONFIG,
            ...config
        };
    }

    function navigateWithDepth(url) {
        if (window.DepthManager && typeof window.DepthManager.navigateTo === 'function') {
            window.DepthManager.navigateTo(url);
            return;
        }

        window.location.href = url;
    }

    function setLockState(isLocked) {
        document.documentElement.classList.toggle(LOCK_CLASS, isLocked);
        document.body?.classList.toggle(LOCK_CLASS, isLocked);
    }

    function getFocusableElements(container) {
        if (!container) {
            return [];
        }

        return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => {
            if (!(element instanceof HTMLElement)) {
                return false;
            }

            return !element.hasAttribute('disabled') && element.tabIndex !== -1;
        });
    }

    function focusElement(element) {
        if (!element || typeof element.focus !== 'function') {
            return;
        }

        try {
            element.focus({ preventScroll: true });
        } catch (error) {
            element.focus();
        }
    }

    function applyCopy(config) {
        state.kickerNode.textContent = config.kicker;
        state.titleNode.textContent = config.title;
        state.copyNode.textContent = config.copy;
        state.confirmButton.textContent = config.confirmLabel;
        state.confirmButton.setAttribute('aria-label', config.confirmLabel);

        if (state.cancelButton) {
            state.cancelButton.textContent = config.cancelLabel;
            state.cancelButton.setAttribute('aria-label', config.cancelLabel);
        }
    }

    function closeAvatarReturnModal() {
        if (!state.modal || (!state.isOpen && !state.modal.classList.contains(ACTIVE_CLASS))) {
            return;
        }

        state.isOpen = false;
        state.modal.classList.remove(ACTIVE_CLASS);
        state.modal.classList.add(CLOSING_CLASS);
        state.modal.setAttribute('aria-hidden', 'true');
        setLockState(false);

        if (state.closeTimerId) {
            window.clearTimeout(state.closeTimerId);
        }

        state.closeTimerId = window.setTimeout(() => {
            state.modal?.classList.remove(CLOSING_CLASS);
            state.closeTimerId = 0;
        }, 280);

        if (state.lastActiveElement instanceof HTMLElement && state.lastActiveElement.isConnected) {
            window.requestAnimationFrame(() => focusElement(state.lastActiveElement));
        }
    }

    function confirmAvatarReturn() {
        const targetUrl = state.currentConfig?.targetUrl || DEFAULT_CONFIG.targetUrl;
        closeAvatarReturnModal();
        navigateWithDepth(targetUrl);
    }

    function ensureModal() {
        if (state.modal) {
            return state.modal;
        }

        const modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'avatar-return-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="avatar-return-backdrop" data-avatar-return-close></div>
            <div class="avatar-return-dialog" role="dialog" aria-modal="true" aria-labelledby="avatarReturnTitle">
                <div class="avatar-return-inner">
                    <p class="avatar-return-kicker"></p>
                    <h2 class="avatar-return-title" id="avatarReturnTitle"></h2>
                    <p class="avatar-return-copy"></p>
                    <div class="avatar-return-actions">
                        <button type="button" class="avatar-return-primary" data-avatar-return-confirm></button>
                        <button type="button" class="avatar-return-secondary" data-avatar-return-close></button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        state.modal = modal;
        state.dialog = modal.querySelector('.avatar-return-dialog');
        state.kickerNode = modal.querySelector('.avatar-return-kicker');
        state.titleNode = modal.querySelector('.avatar-return-title');
        state.copyNode = modal.querySelector('.avatar-return-copy');
        state.confirmButton = modal.querySelector('[data-avatar-return-confirm]');
        state.cancelButton = modal.querySelector('.avatar-return-secondary');

        modal.addEventListener('click', (event) => {
            if (event.target === modal || event.target.closest('[data-avatar-return-close]')) {
                closeAvatarReturnModal();
            }
        });

        state.confirmButton?.addEventListener('click', confirmAvatarReturn);

        window.addEventListener('keydown', (event) => {
            if (!state.isOpen || !state.modal) {
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                closeAvatarReturnModal();
                return;
            }

            if (event.key !== 'Tab') {
                return;
            }

            const focusables = getFocusableElements(state.dialog);
            if (!focusables.length) {
                return;
            }

            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement;

            if (event.shiftKey && active === first) {
                event.preventDefault();
                focusElement(last);
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                focusElement(first);
            }
        });

        applyCopy(DEFAULT_CONFIG);
        return modal;
    }

    function openAvatarReturnModal(config = {}, trigger = null) {
        ensureModal();

        state.currentConfig = normalizeConfig(config);
        state.lastActiveElement = trigger instanceof HTMLElement ? trigger : document.activeElement;

        applyCopy(state.currentConfig);

        if (state.closeTimerId) {
            window.clearTimeout(state.closeTimerId);
            state.closeTimerId = 0;
        }

        state.modal.classList.remove(CLOSING_CLASS);
        state.modal.classList.add(ACTIVE_CLASS);
        state.modal.setAttribute('aria-hidden', 'false');
        state.isOpen = true;
        setLockState(true);

        window.requestAnimationFrame(() => focusElement(state.confirmButton));
    }

    function bindAvatarReturn(config = {}) {
        const resolvedConfig = normalizeConfig(config);
        const avatars = Array.from(document.querySelectorAll(resolvedConfig.selector)).filter((element) => element instanceof HTMLElement);

        if (!avatars.length) {
            return null;
        }

        ensureModal();

        avatars.forEach((avatar) => {
            if (avatar.dataset.avatarReturnBound === 'true') {
                return;
            }

            avatar.dataset.avatarReturnBound = 'true';

            if (!avatar.hasAttribute('tabindex')) {
                avatar.setAttribute('tabindex', '0');
            }

            avatar.setAttribute('role', 'button');
            avatar.setAttribute('aria-haspopup', 'dialog');
            avatar.setAttribute('aria-controls', MODAL_ID);

            if (!avatar.hasAttribute('aria-label')) {
                avatar.setAttribute('aria-label', resolvedConfig.triggerLabel);
            }

            avatar.addEventListener('click', (event) => {
                event.preventDefault();
                openAvatarReturnModal(resolvedConfig, avatar);
            });

            avatar.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                event.preventDefault();
                openAvatarReturnModal(resolvedConfig, avatar);
            });
        });

        return {
            open(trigger = null) {
                openAvatarReturnModal(resolvedConfig, trigger || avatars[0]);
            },
            close: closeAvatarReturnModal
        };
    }

    window.YanqiAvatarReturn = Object.freeze({
        bind: bindAvatarReturn,
        open: openAvatarReturnModal,
        close: closeAvatarReturnModal,
        navigateWithDepth
    });
})();
