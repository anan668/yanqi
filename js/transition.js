/* ============================================
   Legacy Transition Logic - transition.js
   ============================================
   职责：
   1. 保留较早版本的深度过渡脚本和兼容入口。
   2. 为旧版登录到首页的完整下潜动画提供可调用逻辑。
   3. 作为 `depth-manager.js` 之外的历史实现参考。
   阅读顺序：
   1. 旧版过渡类
   2. 各阶段动画方法
   3. 全局兼容入口
*/
/**
 * 深度计过渡效果管理
 */
// 旧版深度切换类：负责显示完整深度过渡容器，并在登录后执行一次整体下潜动画。
class DepthGaugeTransition {
    /**
     * constructor() - 初始化旧版深度过渡所需的 DOM 引用和内部状态
     */
    constructor() {
        this.container = document.getElementById('depth-gauge-transition');
        this.gauges = document.querySelectorAll('.depth-gauge');
        this.tickLabels = document.querySelectorAll('.tick-label');
        this.tickGroups = document.querySelectorAll('.tick-group');
        this.bubbles = document.querySelectorAll('.bubble');
        this.loginPage = document.querySelector('.login-page');
        this.isTransitioning = false;
    }

    /**
     * startTransition() - 启动完整的旧版深度过渡动画流程
     * @returns {void} - 无返回值，直接驱动页面动画和跳转
     */
    startTransition() {
        if (this.isTransitioning) return;
        
        this.isTransitioning = true;
        console.log('过渡动画开始...');
        
        try {
            // 第一步：显示深度计并启动数字滚动和背景渐变
            this.showDepthGauge();
            this.animateDepthNumbers();
            this.animateBackgroundGradient();
            
            // 第二步：2.5秒后开始下掉动画
            setTimeout(() => {
                console.log('触发页面下掉动画...');
                this.triggerPageFallDown();
            }, 2500);
            
            // 第三步：3.5秒后跳转页面
            setTimeout(() => {
                console.log('跳转到主页...');
                window.location.href = 'home.html';
            }, 3500);
            // 这里把三个阶段拆开定时，是因为旧版过渡依赖固定时序：
            // 先让视觉完整出现，再下沉离场，最后才真正跳页。
        } catch (error) {
            console.error('过渡动画执行出错:', error);
            // 如果出错，立即跳转
            window.location.href = 'home.html';
        }
    }

    /**
     * showDepthGauge() - 显示深度计过渡容器并触发其入场状态
     * @returns {void} - 无返回值，直接更新 DOM 状态
     */
    showDepthGauge() {
        if (!this.container) {
            console.error('深度计容器未找到');
            return;
        }
        
        // 设置display为block以显示，并添加active类触发CSS动画
        this.container.style.display = 'block';
        // 使用setTimeout确保display改变后再添加active，确保动画顺利执行
        setTimeout(() => {
            this.container.classList.add('active');
        }, 10);
    }

    /**
     * animateDepthNumbers() - 让旧版深度计数字从 0 平滑滚动到目标深度
     * @returns {void} - 无返回值，直接驱动刻度显示动画
     */
    animateDepthNumbers() {
        const duration = 2500; // 2.5秒内从0滚到30
        const startTime = Date.now();
        const startDepth = 0;
        const endDepth = 30;
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const currentDepth = Math.floor(progress * (endDepth - startDepth) + startDepth);
            
            // 更新每个tick-group的显示（每7个为一组，分别代表左右深度计）
            this.tickGroups.forEach((tickGroup, index) => {
                const depthLevel = index % 7; // 0-6对应0m, 5m, 10m, 15m, 20m, 25m, 30m
                const depthAtIndex = depthLevel * 5; // 0, 5, 10, 15, 20, 25, 30
                
                if (depthAtIndex <= currentDepth) {
                    tickGroup.style.opacity = '1';
                    tickGroup.style.transform = 'scale(1)';
                } else {
                    tickGroup.style.opacity = '0.3';
                    tickGroup.style.transform = 'scale(0.8)';
                }
            });
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
    }

    /**
     * animateBackgroundGradient() - 触发或记录背景渐变阶段
     * @returns {void} - 无返回值，当前主要由 CSS 完成视觉表现
     */
    animateBackgroundGradient() {
        // 背景渐变由CSS中的oceanGradientShift动画处理
        // 这个方法保留用于潜在的JavaScript增强
        console.log('背景渐变动画由CSS处理');
    }

    /**
     * triggerPageFallDown() - 触发登录页整体下沉离场动画
     * @returns {void} - 无返回值，直接更新页面 class 状态
     */
    triggerPageFallDown() {
        if (this.container) {
            this.container.classList.add('fade-out');
        }
        
        if (this.loginPage) {
            this.loginPage.classList.add('transition-out');
        }
    }
}

// 初始化深度计过渡
let depthTransition;

/**
 * transitionToPage(pageUrl) - 兼容旧代码调用的备用页面过渡入口
 * @param {string} pageUrl - 目标页面地址
 * @returns {void} - 无返回值，内部复用旧版深度过渡
 */
// 页面加载后初始化旧版过渡控制器，并把触发入口挂到全局给其他脚本调用。
/**
 * document DOMContentLoaded 回调 - 初始化旧版深度过渡控制器并导出全局触发入口
 * @returns {void} - 无返回值，直接挂载兼容接口
 */
document.addEventListener('DOMContentLoaded', function() {
    depthTransition = new DepthGaugeTransition();
    
    // 导出全局函数供其他脚本调用
    window.triggerDepthGaugeTransition = function() {
        if (depthTransition) {
            depthTransition.startTransition();
        }
    };
});

/**
 * transitionToPage(pageUrl) - 兼容旧代码调用的备用页面过渡入口
 * @param {string} pageUrl - 目标页面地址
 * @returns {void} - 无返回值，内部复用旧版深度过渡
 */
function transitionToPage(pageUrl) {
    if (depthTransition) {
        depthTransition.startTransition();
        // 使用全局的跳转会覆盖这个URL，所以这里只是备用
    }
}

window.transitionToPage = transitionToPage;
