// js/login.js
document.addEventListener('DOMContentLoaded', function() {
    // Перевірка, чи користувач вже авторизований
    if (window.api.utils.isAuthenticated()) {
        // Якщо так, перенаправляємо на головну сторінку
        window.location.href = 'index.html';
    }

    // Alpine.js функції для форм
    window.loginFormFunctions = {
        async submitLogin() {
            this.errorMessage = '';
            this.successMessage = '';

            if (!this.loginEmail || !this.loginPassword) {
                this.errorMessage = 'Будь ласка, заповніть всі поля';
                return;
            }

            this.isSubmitting = true;

            try {
                const response = await window.api.auth.login({
                    email: this.loginEmail,
                    password: this.loginPassword
                });

                this.successMessage = 'Успішний вхід! Перенаправлення...';

                // Перенаправлення на головну сторінку
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            } catch (error) {
                this.errorMessage = error.message || 'Помилка входу. Спробуйте ще раз.';
            } finally {
                this.isSubmitting = false;
            }
        },

        async submitRegister() {
            this.errorMessage = '';
            this.successMessage = '';

            if (!this.registerName || !this.registerEmail || !this.registerPassword || !this.registerPasswordConfirm) {
                this.errorMessage = 'Будь ласка, заповніть всі поля';
                return;
            }

            if (this.registerPassword !== this.registerPasswordConfirm) {
                this.errorMessage = 'Паролі не співпадають';
                return;
            }

            if (!document.getElementById('agreeTerms').checked) {
                this.errorMessage = 'Ви повинні погодитись з умовами використання';
                return;
            }

            this.isSubmitting = true;

            try {
                const response = await window.api.auth.register({
                    username: this.registerName,
                    email: this.registerEmail,
                    password: this.registerPassword
                });

                this.successMessage = 'Реєстрація успішна! Перевірте вашу електронну пошту для підтвердження.';

                // Очищення форми
                this.registerName = '';
                this.registerEmail = '';
                this.registerPassword = '';
                this.registerPasswordConfirm = '';

                // Перехід на вкладку логіну
                setTimeout(() => {
                    this.activeTab = 'login';
                    this.successMessage = '';
                }, 3000);
            } catch (error) {
                this.errorMessage = error.message || 'Помилка реєстрації. Спробуйте ще раз.';
            } finally {
                this.isSubmitting = false;
            }
        },

        async submitResetPassword() {
            this.errorMessage = '';
            this.successMessage = '';

            if (!this.resetEmail) {
                this.errorMessage = 'Будь ласка, введіть електронну пошту';
                return;
            }

            this.isSubmitting = true;

            try {
                // Це заглушка, оскільки в API ще немає функції відновлення пароля
                // В майбутньому буде замінена на реальний API-запит
                setTimeout(() => {
                    this.successMessage = 'Інструкції для відновлення паролю надіслані на вашу електронну пошту.';
                    this.resetEmail = '';
                    this.isSubmitting = false;
                }, 1000);
            } catch (error) {
                this.errorMessage = error.message || 'Помилка відправки запиту. Спробуйте ще раз.';
                this.isSubmitting = false;
            }
        },

        // Функції для соціальних мереж (заглушки, які можна буде замінити реальною логікою)
        loginWithGoogle() {
            this.errorMessage = '';
            this.successMessage = 'Авторизація через Google...';

            setTimeout(() => {
                this.successMessage = 'Функція авторизації через Google буде доступна пізніше.';
            }, 2000);
        },

        loginWithFacebook() {
            this.errorMessage = '';
            this.successMessage = 'Авторизація через Facebook...';

            setTimeout(() => {
                this.successMessage = 'Функція авторизації через Facebook буде доступна пізніше.';
            }, 2000);
        }
    };
});