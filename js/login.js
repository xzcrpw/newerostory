// js/login.js
document.addEventListener('alpine:init', () => {
    Alpine.data('authForm', () => ({
        activeTab: 'login',
        showResetPassword: false,
        loginEmail: '',
        loginPassword: '',
        registerName: '',
        registerEmail: '',
        registerPassword: '',
        registerPasswordConfirm: '',
        resetEmail: '',
        errorMessage: '',
        successMessage: '',
        isSubmitting: false,

        // --- Функції ---
        setActiveTab(tab) {
            this.activeTab = tab;
            this.clearMessages();
            this.showResetPassword = false; // Скидаємо форму відновлення при зміні таба
        },

        setShowResetPassword(value) {
            this.showResetPassword = value;
            this.clearMessages();
            if (!value) {
                this.resetEmail = ''; // Очищаємо поле відновлення при поверненні
            }
        },

        clearMessages() {
            this.errorMessage = '';
            this.successMessage = '';
        },

        validateEmail(email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        },

        validatePassword(password) {
            // Мін 8 символів, хоча б одна велика, одна мала, одна цифра
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d\S]{8,}$/;
            return passwordRegex.test(password);
        },

        // --- Обробники відправки ---
        async submitLogin() {
            this.clearMessages();
            if (!this.loginEmail || !this.loginPassword) {
                this.errorMessage = 'Будь ласка, заповніть всі поля.';
                return;
            }
            if (!this.validateEmail(this.loginEmail)) {
                this.errorMessage = 'Будь ласка, введіть коректну адресу електронної пошти.';
                return;
            }

            this.isSubmitting = true;
            try {
                const response = await api.auth.login(this.loginEmail, this.loginPassword);
                // api.utils.setToken вже викликається всередині api.auth.login
                this.successMessage = 'Вхід виконано успішно! Перенаправлення...';
                // Перевіряємо, чи є параметр redirect в URL
                const redirectUrl = new URLSearchParams(window.location.search).get('redirect');
                setTimeout(() => {
                    window.location.href = redirectUrl || 'index.html'; // Перенаправлення на головну або на попередню сторінку
                }, 1500);
            } catch (error) {
                this.errorMessage = error.message || 'Помилка входу. Перевірте дані та спробуйте ще раз.';
                console.error('Login error:', error);
            } finally {
                this.isSubmitting = false;
            }
        },

        async submitRegister() {
            this.clearMessages();
            // Валідація (простіша, можна додати перевірку пароля, як у register-page.html)
            if (!this.registerName || !this.registerEmail || !this.registerPassword || !this.registerPasswordConfirm) {
                this.errorMessage = 'Будь ласка, заповніть всі обов\'язкові поля.';
                return;
            }
            if (!this.validateEmail(this.registerEmail)) {
                this.errorMessage = 'Будь ласка, введіть коректну адресу електронної пошти.';
                return;
            }
            if (!this.validatePassword(this.registerPassword)) {
                this.errorMessage = 'Пароль не відповідає вимогам (мін. 8 символів, велика, мала літери, цифра).';
                return;
            }
            if (this.registerPassword !== this.registerPasswordConfirm) {
                this.errorMessage = 'Паролі не співпадають.';
                return;
            }
            // Перевірка згоди з правилами (якщо чекбокс є)
            const termsCheckbox = document.getElementById('agreeTerms');
            if (termsCheckbox && !termsCheckbox.checked) {
                this.errorMessage = 'Будь ласка, погодьтеся з умовами використання.';
                return;
            }


            this.isSubmitting = true;
            try {
                await api.auth.register(this.registerName, this.registerEmail, this.registerPassword);
                this.successMessage = 'Реєстрація успішна! Перевірте вашу пошту для підтвердження та увійдіть у свій акаунт.';
                // Очистка полів
                this.registerName = '';
                this.registerEmail = '';
                this.registerPassword = '';
                this.registerPasswordConfirm = '';
                if (termsCheckbox) termsCheckbox.checked = false;
                // Можна перемкнути на вкладку входу
                setTimeout(() => { this.setActiveTab('login'); this.clearMessages(); }, 3000);
            } catch (error) {
                this.errorMessage = error.message || 'Помилка реєстрації. Можливо, користувач з такою поштою вже існує.';
                console.error('Register error:', error);
            } finally {
                this.isSubmitting = false;
            }
        },

        async submitResetPassword() {
            this.clearMessages();
            if (!this.resetEmail || !this.validateEmail(this.resetEmail)) {
                this.errorMessage = 'Будь ласка, введіть коректну адресу електронної пошти.';
                return;
            }

            this.isSubmitting = true;
            try {
                await api.auth.forgotPassword(this.resetEmail);
                this.successMessage = 'Інструкції для відновлення паролю надіслано на вашу пошту (якщо такий користувач існує).';
                this.resetEmail = '';
                // Не закриваємо форму автоматично, щоб користувач побачив повідомлення
                // setTimeout(() => { this.setShowResetPassword(false); this.clearMessages(); }, 4000);
            } catch (error) {
                // Навіть при помилці (користувача не знайдено) часто краще показувати однакове повідомлення про успіх
                // щоб не розкривати інформацію про існування email в базі.
                // Тому можна залишити successMessage або показувати загальну помилку.
                // this.errorMessage = error.message || 'Помилка під час відправлення запиту на відновлення.';
                this.successMessage = 'Інструкції для відновлення паролю надіслано на вашу пошту (якщо такий користувач існує).';
                this.resetEmail = '';
                console.error('Reset password error:', error);
            } finally {
                this.isSubmitting = false;
            }
        },

        // --- OAuth ---
        loginWithGoogle() {
            this.clearMessages();
            try {
                api.auth.googleLoginRedirect();
                // Не встановлюємо isSubmitting = true, оскільки відбудеться перенаправлення
                this.successMessage = 'Перенаправлення на Google...';
            } catch (error) {
                this.errorMessage = 'Помилка перенаправлення на Google авторизацію.';
                console.error('Google login error:', error);
            }
        },

        loginWithFacebook() {
            this.clearMessages();
            this.errorMessage = 'Авторизація через Facebook поки не підтримується.';
            // TODO: Аналогічно до Google, але з Facebook ендпоінтом
            // window.location.href = `${apiConfig.baseUrl}${apiConfig.endpoints.facebookLogin}`;
        }
    }));
});