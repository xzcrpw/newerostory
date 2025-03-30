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
            if (!password || password.length < 8) {
                return { valid: false, message: 'Пароль має містити щонайменше 8 символів.' };
            }
            
            // Підрахунок складності паролю
            let strength = 0;
            if (/[a-z]/.test(password)) strength++; // Малі літери
            if (/[A-Z]/.test(password)) strength++; // Великі літери
            if (/\d/.test(password)) strength++;    // Цифри
            if (/[^A-Za-z0-9]/.test(password)) strength++; // Спецсимволи
            
            // Мінімальні вимоги: 8+ символів і хоча б 2 різних типи символів
            const hasMinRequirements = password.length >= 8 && strength >= 2;
            
            if (!hasMinRequirements) {
                return { 
                    valid: false, 
                    message: 'Пароль має містити щонайменше 8 символів і комбінацію літер та цифр.' 
                };
            }
            
            return { valid: true, strength }; // Повертаємо також рівень складності для відображення
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
            
            try {
                // Валідація імені
                if (!this.registerName || this.registerName.trim().length < 2) {
                    this.errorMessage = 'Ім\'я має містити щонайменше 2 символи.';
                    return;
                }
                
                // Валідація email
                if (!this.registerEmail || !this.validateEmail(this.registerEmail)) {
                    this.errorMessage = 'Будь ласка, введіть коректну адресу електронної пошти.';
                    return;
                }
                
                // Валідація паролю
                const passwordResult = this.validatePassword(this.registerPassword);
                if (!passwordResult.valid) {
                    this.errorMessage = passwordResult.message;
                    return;
                }
                
                // Перевірка паролів
                if (this.registerPassword !== this.registerPasswordConfirm) {
                    this.errorMessage = 'Паролі не співпадають.';
                    return;
                }
                
                // Перевірка згоди з правилами
                const termsCheckbox = document.getElementById('agreeTerms');
                if (termsCheckbox && !termsCheckbox.checked) {
                    this.errorMessage = 'Будь ласка, погодьтеся з умовами використання.';
                    return;
                }

                this.isSubmitting = true;
                
                // Додаємо захист від подвійної відправки форми
                const registerButton = document.querySelector('button[type="submit"]');
                if (registerButton) registerButton.disabled = true;
                
                await api.auth.register(
                    this.registerName.trim(), 
                    this.registerEmail.trim(), 
                    this.registerPassword
                );
                
                this.successMessage = 'Реєстрація успішна! Перевірте вашу пошту для підтвердження та увійдіть у свій акаунт.';
                
                // Очистка полів
                this.registerName = '';
                this.registerEmail = '';
                this.registerPassword = '';
                this.registerPasswordConfirm = '';
                if (termsCheckbox) termsCheckbox.checked = false;
                
                // Перемикання на вкладку входу з затримкою
                setTimeout(() => {
                    this.setActiveTab('login'); 
                    this.showNotification('Будь ласка, перевірте вашу поштову скриньку для підтвердження реєстрації.', true);
                }, 3500);
                
            } catch (error) {
                // Покращена обробка помилок
                console.error('Register error:', error);
                
                if (error.message && error.message.toLowerCase().includes('email') && 
                    error.message.toLowerCase().includes('exist')) {
                    this.errorMessage = 'Користувач з цією електронною поштою вже існує.';
                } else if (error.message && error.message.toLowerCase().includes('validate')) {
                    this.errorMessage = 'Помилка валідації даних. Перевірте правильність форми.';
                } else {
                    this.errorMessage = error.message || 'Помилка реєстрації. Спробуйте пізніше.';
                }
            } finally {
                this.isSubmitting = false;
                // Відновлення кнопки
                const registerButton = document.querySelector('button[type="submit"]');
                if (registerButton) registerButton.disabled = false;
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
        },

        // Додаємо функцію показу сповіщень
        showNotification(message, isSuccess = true) {
            // Перевіряємо чи існує сповіщення в DOM
            let notification = document.querySelector('.notification');
            
            // Якщо елемент не існує, створюємо його
            if (!notification) {
                notification = document.createElement('div');
                notification.classList.add('notification');
                document.body.appendChild(notification);
            }
            
            // Встановлюємо тип і текст сповіщення
            notification.classList.remove('success', 'error');
            notification.classList.add(isSuccess ? 'success' : 'error');
            notification.textContent = message;
            
            // Показуємо сповіщення
            notification.classList.add('show');
            
            // Автоматично ховаємо сповіщення через 4 секунди
            setTimeout(() => {
                notification.classList.remove('show');
            }, 4000);
        }
    }));
});

// Додаємо посилення безпеки та валідації

// Функція для перевірки сили пароля
function checkPasswordStrength(password) {
    let strength = 0;
    // Мінімум 8 символів
    if (password.length >= 8) strength++;
    // Наявність цифр
    if (/\d/.test(password)) strength++;
    // Наявність літер нижнього регістру
    if (/[a-z]/.test(password)) strength++;
    // Наявність літер верхнього регістру
    if (/[A-Z]/.test(password)) strength++;
    // Наявність спеціальних символів
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength++;
    
    return {
        score: strength,
        isValid: strength >= 3, // Мінімально прийнятна сила пароля
        feedback: getPasswordFeedback(strength)
    };
}

// Функція для зворотного зв'язку щодо сили пароля
function getPasswordFeedback(strength) {
    switch(strength) {
        case 0: return { message: 'Дуже слабкий', color: '#ff0000' };
        case 1: return { message: 'Слабкий', color: '#ff3333' };
        case 2: return { message: 'Середній', color: '#ff9900' };
        case 3: return { message: 'Хороший', color: '#99cc00' };
        case 4: return { message: 'Сильний', color: '#33cc33' };
        case 5: return { message: 'Дуже сильний', color: '#009900' };
        default: return { message: 'Невідомо', color: '#666666' };
    }
}

// Удосконалена функція реєстрації
async function submitRegister() {
    this.clearMessages();
    
    // Розширена валідація
    if (!this.registerName.trim()) {
        this.errorMessage = "Будь ласка, вкажіть своє ім'я.";
        return;
    }
    
    if (!this.validateEmail(this.registerEmail)) {
        this.errorMessage = "Будь ласка, вкажіть правильну електронну адресу.";
        return;
    }
    
    // Перевірка сили пароля
    const passwordCheck = checkPasswordStrength(this.registerPassword);
    if (!passwordCheck.isValid) {
        this.errorMessage = "Пароль надто слабкий. Використовуйте мінімум 8 символів, включно з цифрами та літерами різних регістрів.";
        return;
    }
    
    if (this.registerPassword !== this.registerPasswordConfirm) {
        this.errorMessage = "Паролі не співпадають.";
        return;
    }
    
    this.isSubmitting = true;
    try {
        const response = await api.auth.register(
            this.registerName.trim(),
            this.registerEmail.trim().toLowerCase(),
            this.registerPassword
        );
        
        this.successMessage = "Реєстрацію успішно завершено! Тепер ви можете увійти.";
        
        // Очищення форми
        this.registerName = '';
        this.registerEmail = '';
        this.registerPassword = '';
        this.registerPasswordConfirm = '';
        
        // Автоматичний перехід на форму логіну через 3 секунди
        setTimeout(() => {
            this.activeTab = 'login';
            this.loginEmail = this.registerEmail; // Попередньо заповнюємо email
        }, 3000);
    } catch (error) {
        this.errorMessage = error.message || "Помилка при реєстрації. Спробуйте знову.";
    } finally {
        this.isSubmitting = false;
    }
}