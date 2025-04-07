// js/login.js
document.addEventListener('alpine:init', () => {
    Alpine.data('authForm', () => ({
        // --- Стани UI ---
        activeTab: 'login', // 'login' або 'register'
        showResetPassword: false,
        errorMessage: '',
        successMessage: '',
        isSubmitting: false,
        notificationVisible: false, // Для глобального сповіщення
        notificationType: 'success',
        notificationMessage: '',
        notificationTimeout: null,
        passwordStrength: { score: 0, feedback: { message: '', color: '#666' } },
        isInitialized: false, // Чи був викликаний init()?
        isFullyReady: false, // Чи готові API та i18n?
        currentLang: 'uk', // Поточна мова

        // --- Дані форм ---
        loginEmail: '',
        loginPassword: '',
        registerName: '',
        registerEmail: '',
        registerPassword: '',
        registerPasswordConfirm: '',
        agreeTermsRegister: false,
        resetEmail: '',
        rememberMe: false,

        // --- Безпечний доступ до i18n ---
        safeT(key, params = {}, fallback = '') {
            try {
                // Якщо i18n ще не ініціалізований
                if (!this.isFullyReady || typeof $store === 'undefined' || !$store.i18n?.initialized) {
                    return fallback || key;
                }

                // Тепер можна безпечно викликати i18n
                const translation = $store.i18n.t(key, params);

                // Перевіряємо, чи переклад знайдено і він не дорівнює ключу
                return (translation && translation !== key && translation.trim() !== '') ? translation : fallback || key;
            } catch (error) {
                console.warn(`safeT error for key: ${key}`, error);
                // Форматуємо fallback, якщо він є і є параметри
                if (Object.keys(params).length > 0 && typeof fallback === 'string' && fallback !== '') {
                    return Object.keys(params).reduce(
                        (str, pKey) => str.replace(new RegExp(`\\{${pKey}\\}`, 'g'), params[pKey]),
                        fallback
                    );
                }
                return fallback || key;
            }
        },

        // --- Функція оновлення Title ---
        updateTitle() {
            try {
                // Оновлюємо title тільки якщо isFullyReady
                if (this.isFullyReady) {
                    const title = `${this.safeT('general.login', {}, 'Вхід')} / ${this.safeT('general.register', {}, 'Реєстрація')} — ${this.safeT('general.copyright', {}, 'EroStory')}`;
                    document.title = title;
                    document.documentElement.lang = this.currentLang; // Встановлюємо мову на HTML
                } else {
                    // Встановлюємо fallback title, якщо i18n ще не готовий
                    document.title = 'Вхід / Реєстрація — EroStory';
                }
            } catch (e) {
                console.error("Error updating title:", e);
                document.title = 'Вхід / Реєстрація — EroStory';
            }
        },

        // --- Функції керування UI ---
        setActiveTab(tab) {
            this.activeTab = tab;
            this.clearMessages();
            this.showResetPassword = false;
            try { // Оновлюємо URL без перезавантаження
                const url = new URL(window.location);
                url.searchParams.set('tab', tab);
                window.history.pushState({}, '', url);
            } catch (e) { console.warn('Failed to update URL state:', e); }
        },
        toggleResetPassword() {
            this.showResetPassword = !this.showResetPassword;
            this.clearMessages();
            if (!this.showResetPassword) {
                this.resetEmail = '';
                this.$nextTick(() => {
                    const loginEmailElem = document.getElementById('loginEmail');
                    if (loginEmailElem) loginEmailElem.focus();
                });
            } else {
                this.$nextTick(() => {
                    const resetEmailElem = document.getElementById('resetEmail');
                    if (resetEmailElem) resetEmailElem.focus();
                });
            }
        },
        clearMessages() {
            this.errorMessage = '';
            this.successMessage = '';
        },
        // Глобальне сповіщення
        showNotification(message, isSuccess = true) {
            this.notificationMessage = message;
            this.notificationType = isSuccess ? 'success' : 'error';
            this.notificationVisible = true; // Показуємо сповіщення
            if (this.notificationTimeout) clearTimeout(this.notificationTimeout);
            this.notificationTimeout = setTimeout(() => {
                this.notificationVisible = false; // Ховаємо через 4 секунди
            }, 4000);
        },

        // --- Валідація ---
        validateEmail(email) {
            if (!email) return false;
            const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
            return emailRegex.test(String(email).toLowerCase());
        },
        checkPasswordStrength(password) {
            let score = 0;
            let feedback = { message: '', color: '#666' };
            if (!password) return { score, feedback };
            if (password.length < 8) {
                feedback = { message: this.safeT('auth.passwordMinChars', {}, 'Мінімум 8 символів'), color: '#ff0000' };
                return { score, feedback };
            } else { score++; }
            if (/[a-z]/.test(password)) score++;
            if (/[A-Z]/.test(password)) score++;
            if (/\d/.test(password)) score++;
            if (/[^A-Za-z0-9]/.test(password)) score++;
            switch (score) {
                case 1: case 2: feedback = { message: this.safeT('auth.passwordStrengthWeak', {}, 'Слабкий'), color: '#ff3333' }; break;
                case 3: feedback = { message: this.safeT('auth.passwordStrengthMedium', {}, 'Середній'), color: '#ff9900' }; break;
                case 4: feedback = { message: this.safeT('auth.passwordStrengthGood', {}, 'Хороший'), color: '#99cc00' }; break;
                case 5: feedback = { message: this.safeT('auth.passwordStrengthStrong', {}, 'Сильний'), color: '#33cc33' }; break;
            }
            return { score, feedback };
        },
        updatePasswordStrengthIndicator() {
            this.passwordStrength = this.checkPasswordStrength(this.registerPassword);
        },
        isPasswordValid(password) {
            const strengthCheck = this.checkPasswordStrength(password);
            return password.length >= 8 && strengthCheck.score >= 3; // Вимагаємо середній або кращий
        },

        // --- Обробники відправки ---
        async submitLogin() {
            this.clearMessages();
            if (!this.loginEmail || !this.loginPassword) {
                this.errorMessage = this.safeT('auth.errorRequiredFields', {}, 'Будь ласка, заповніть всі поля');
                return;
            }
            if (!this.validateEmail(this.loginEmail)) {
                this.errorMessage = this.safeT('auth.emailInvalid', {}, 'Введіть правильний email');
                return;
            }

            this.isSubmitting = true;

            try {
                // Перевірка, чи існує API
                if (typeof api === 'undefined' || typeof api.auth === 'undefined' || typeof api.auth.login !== 'function') {
                    throw new Error(this.safeT('auth.apiNotAvailable', {}, 'API сервіс недоступний'));
                }

                await api.auth.login(this.loginEmail, this.loginPassword);
                this.successMessage = this.safeT('notifications.loginSuccess', {}, 'Вхід успішний');
                const redirectUrl = new URLSearchParams(window.location.search).get('redirect') || 'index.html';
                // Перенаправлення після успішного логіну
                setTimeout(() => { window.location.href = redirectUrl; }, 500); // Трохи менша затримка
            } catch (error) {
                this.errorMessage = error.message || this.safeT('auth.invalidCredentials', {}, 'Невірний email або пароль');
                console.error('Login error:', error);
                this.isSubmitting = false;
                this.$nextTick(() => {
                    const loginPassElem = document.getElementById('loginPassword');
                    if (loginPassElem) loginPassElem.focus();
                });
            }
            // Не скидаємо isSubmitting при успіху, бо йде редірект
        },
        async submitRegister() {
            this.clearMessages();
            if (!this.registerName.trim()) {
                this.errorMessage = this.safeT('auth.nameRequired', {}, "Ім'я є обов'язковим");
                return;
            }
            if (!this.registerEmail || !this.validateEmail(this.registerEmail)) {
                this.errorMessage = this.safeT('auth.emailInvalid', {}, 'Введіть правильний email');
                return;
            }
            if (!this.isPasswordValid(this.registerPassword)) {
                this.errorMessage = this.passwordStrength.feedback.message || this.safeT('auth.passwordInvalid', {}, 'Пароль має бути складнішим');
                return;
            }
            if (this.registerPassword !== this.registerPasswordConfirm) {
                this.errorMessage = this.safeT('auth.passwordsDontMatch', {}, 'Паролі не співпадають');
                return;
            }
            if (!this.agreeTermsRegister) {
                this.errorMessage = this.safeT('auth.termsRequired', {}, 'Ви повинні погодитись з умовами використання');
                return;
            }

            this.isSubmitting = true;

            try {
                // Перевірка, чи існує API
                if (typeof api === 'undefined' || typeof api.auth === 'undefined' || typeof api.auth.register !== 'function') {
                    throw new Error(this.safeT('auth.apiNotAvailable', {}, 'API сервіс недоступний'));
                }

                const user = await api.auth.register(this.registerName.trim(), this.registerEmail, this.registerPassword);
                if (user?._id) {
                    this.successMessage = this.safeT('notifications.registerLoginSuccess', {}, 'Реєстрація успішна. Виконується вхід...');
                    const redirectUrl = new URLSearchParams(window.location.search).get('redirect') || 'index.html';
                    setTimeout(() => { window.location.href = redirectUrl; }, 1000);
                } else { // Якщо автологін не відбувся
                    this.successMessage = this.safeT('notifications.registerSuccess', {}, 'Реєстрація успішна. Тепер ви можете увійти.');
                    this.setActiveTab('login');
                    this.registerName = ''; this.registerEmail = ''; this.registerPassword = '';
                    this.registerPasswordConfirm = ''; this.agreeTermsRegister = false; this.passwordStrength = { score: 0, feedback: { message: '', color: '#666' } };
                    this.$nextTick(() => {
                        const loginEmailElem = document.getElementById('loginEmail');
                        if (loginEmailElem) loginEmailElem.focus();
                    });
                    this.isSubmitting = false;
                }
            } catch (error) {
                this.errorMessage = error.message || this.safeT('auth.registerError', {}, 'Помилка при реєстрації');
                console.error('Register error:', error);
                this.isSubmitting = false;
            }
        },
        async submitResetPassword() {
            this.clearMessages();
            if (!this.resetEmail || !this.validateEmail(this.resetEmail)) {
                this.errorMessage = this.safeT('auth.emailInvalid', {}, 'Введіть правильний email');
                return;
            }

            this.isSubmitting = true;

            try {
                // Перевірка, чи існує API
                if (typeof api === 'undefined' || typeof api.auth === 'undefined' || typeof api.auth.forgotPassword !== 'function') {
                    throw new Error(this.safeT('auth.apiNotAvailable', {}, 'API сервіс недоступний'));
                }

                const response = await api.auth.forgotPassword(this.resetEmail);
                this.successMessage = response.message || this.safeT('auth.resetPasswordSuccess', {}, 'Інструкції з відновлення паролю відправлені на ваш email');
                this.resetEmail = '';
            } catch (error) {
                // Навіть в разі помилки показуємо успіх для безпеки (не розкриваємо, існує аккаунт чи ні)
                this.successMessage = this.safeT('auth.resetPasswordSuccess', {}, 'Інструкції з відновлення паролю відправлені на ваш email');
                this.resetEmail = '';
                console.error('Reset password error:', error);
            } finally {
                this.isSubmitting = false;
            }
        },

        // --- OAuth ---
        loginWithGoogle() {
            this.clearMessages();
            this.isSubmitting = true;

            try {
                // Перевірка, чи існує API
                if (typeof api === 'undefined' || typeof api.auth === 'undefined' || typeof api.auth.googleLoginRedirect !== 'function') {
                    throw new Error(this.safeT('auth.apiNotAvailable', {}, 'API сервіс недоступний'));
                }

                this.successMessage = this.safeT('auth.redirectingToGoogle', {}, 'Переадресація на Google...');
                setTimeout(() => {
                    try {
                        api.auth.googleLoginRedirect();
                    } catch (e) {
                        console.error('Google redirect failed:', e);
                        this.errorMessage = this.safeT('auth.googleRedirectError', {}, 'Помилка переадресації на Google');
                        this.successMessage = '';
                        this.isSubmitting = false;
                    }
                }, 300);
            } catch (error) {
                console.error('Google login setup error:', error);
                this.errorMessage = this.safeT('auth.googleRedirectError', {}, 'Помилка переадресації на Google');
                this.isSubmitting = false;
            }
        },
        loginWithFacebook() {
            this.clearMessages();
            this.errorMessage = this.safeT('auth.facebookNotImplemented', {}, 'Вхід через Facebook поки не доступний');
        },

        // --- Ініціалізація ---
        async init() {
            try {
                this.isInitialized = true; // Позначаємо, що Alpine компонент ініціалізовано
                console.log("[login.js] Initializing authForm Alpine component...");

                // Швидка перевірка наявності Alpine.store
                if (typeof Alpine.store !== 'function') {
                    console.error("[login.js] Alpine.store is not available!");
                    this.errorMessage = 'Критична помилка ініціалізації. Спробуйте оновити сторінку.';
                    return;
                }

                let attempts = 0;
                const maxAttempts = 60; // Чекаємо до 6 секунд
                const checkInterval = 100; // 100ms між перевірками

                // Функція для перевірки готовності API та i18n
                const checkDependencies = () => {
                    const apiReady = typeof api !== 'undefined' && typeof api.utils !== 'undefined';
                    const i18nReady = window.i18nIsReady === true &&
                        typeof Alpine.store('i18n') !== 'undefined' &&
                        Alpine.store('i18n').initialized === true;

                    return { apiReady, i18nReady, bothReady: apiReady && i18nReady };
                };

                // Почнемо з моментальної перевірки
                let dependencies = checkDependencies();

                // Якщо все вже готово, переходимо до наступного етапу
                if (dependencies.bothReady) {
                    console.log("[login.js] Dependencies already ready!");
                    await this.completeInitialization(dependencies);
                    return;
                }

                // Якщо не все готово, почнемо очікування з повідомленням
                console.log(`[login.js] Waiting... API ready: ${dependencies.apiReady}, i18n ready: ${dependencies.i18nReady}`);

                // Створюємо функцію опитування
                const pollDependencies = () => {
                    return new Promise((resolve) => {
                        const intervalId = setInterval(() => {
                            attempts++;
                            dependencies = checkDependencies();

                            if (dependencies.bothReady || attempts >= maxAttempts) {
                                clearInterval(intervalId);
                                resolve(dependencies);
                            }

                            if (attempts % 10 === 0) {
                                console.log(`[login.js] Still waiting... API ready: ${dependencies.apiReady}, i18n ready: ${dependencies.i18nReady}, attempts: ${attempts}/${maxAttempts}`);
                            }
                        }, checkInterval);
                    });
                };

                // Запускаємо опитування та очікуємо на результат
                dependencies = await pollDependencies();

                // Далі налаштовуємо компонент на основі результатів
                await this.completeInitialization(dependencies);
            } catch (error) {
                console.error("[login.js] Critical error during initialization:", error);
                this.errorMessage = 'Критична помилка ініціалізації. Спробуйте оновити сторінку.';
            }
        },

        // Друга частина ініціалізації, після перевірки залежностей
        async completeInitialization(dependencies) {
            if (!dependencies.bothReady) {
                console.error("[login.js] Dependencies not ready after timeout! API ready:",
                    dependencies.apiReady, "i18n ready:", dependencies.i18nReady);

                if (!dependencies.apiReady) {
                    this.errorMessage = 'Помилка завантаження API. Спробуйте оновити сторінку.';
                } else if (!dependencies.i18nReady) {
                    this.errorMessage = 'Помилка ініціалізації мови. Спробуйте оновити сторінку.';
                } else {
                    this.errorMessage = 'Помилка завантаження компонентів. Спробуйте оновити сторінку.';
                }

                this.isFullyReady = false;
                return;
            }

            // Залежності готові - встановлюємо повну готовність
            this.isFullyReady = true;
            console.log("[login.js] Dependencies confirmed ready. Finishing initialization...");

            // Встановити поточну мову
            this.currentLang = Alpine.store('i18n').selectedLang || 'uk';
            this.updateTitle(); // Оновити заголовок

            // Прослуховувач змін мови
            Alpine.effect(() => {
                try {
                    // Перевіряємо, чи i18n все ще доступний
                    if (this.isFullyReady && typeof Alpine.store('i18n') !== 'undefined') {
                        const newLang = Alpine.store('i18n').selectedLang;
                        if (this.currentLang !== newLang) {
                            console.log(`Language changed to ${newLang}. Updating title.`);
                            this.currentLang = newLang;
                            this.updateTitle();
                        }
                    }
                } catch (error) {
                    console.warn("Language change effect error:", error);
                }
            });

            await this.finishInit(); // Запускаємо фінальну частину ініціалізації
        },

        async finishInit() {
            // Ця функція викликається ПІСЛЯ того, як API та i18n готові
            if (!this.isFullyReady) {
                console.warn("[login.js] finishInit called before full readiness.");
                return; // Не продовжуємо, якщо не готові
            }

            try {
                // Перевіряємо, чи користувач вже авторизований
                if (typeof api.utils.getCurrentUser !== 'function') {
                    console.warn("[login.js] api.utils.getCurrentUser is not a function");
                    return;
                }

                const user = await api.utils.getCurrentUser();
                if (user) {
                    console.log('User already logged in, redirecting...');
                    const urlParams = new URLSearchParams(window.location.search);
                    const redirectUrl = urlParams.get('redirect') || 'index.html';
                    window.location.href = redirectUrl;
                    return; // Зупиняємо виконання, бо йде редірект
                }

                // Обробка параметрів URL (помилки OAuth, активна вкладка)
                const urlParams = new URLSearchParams(window.location.search);
                const oauthError = urlParams.get('error');
                if (oauthError) {
                    if (oauthError === 'google-auth-failed') this.errorMessage = this.safeT('auth.googleRedirectError', {}, 'Помилка автентифікації через Google');
                    else if (oauthError === 'account-inactive') this.errorMessage = this.safeT('auth.accountInactiveError', {}, 'Обліковий запис не активний');
                    else this.errorMessage = decodeURIComponent(oauthError);

                    // Видалення параметра помилки з URL
                    const cleanUrl = new URL(window.location.href);
                    cleanUrl.searchParams.delete('error');
                    window.history.replaceState({}, '', cleanUrl.toString());
                }

                // Встановлення вкладки з URL-параметра
                const tab = urlParams.get('tab');
                if (tab === 'register') {
                    this.setActiveTab('register');
                }
            } catch (err) {
                console.warn('Error during final initialization steps:', err);
                // Не показуємо помилку користувачу, залишаємось на сторінці логіну
            }
        }
    }));
});