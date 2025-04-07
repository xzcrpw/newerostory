// --- START OF FILE js/components/faqPage.js ---
// Чекаємо, доки Alpine.js буде завантажено
if (window.Alpine) {
    initFaqPage();
} else {
    // Якщо не доступний, чекаємо подію alpine:init
    document.addEventListener('alpine:init', initFaqPage);
}
function initFaqPage() {
    console.log('[Alpine] Registering component: faqPage');
    Alpine.data('faqPage', () => ({
        activeCategory: 'all',
        faqData: { // Структура даних FAQ (ключі для i18n)
            account: [
                { qKey: 'faq.accountQ1', aKey: 'faq.accountA1' },
                { qKey: 'faq.accountQ2', aKey: 'faq.accountA2' },
                { qKey: 'faq.accountQ3', aKey: 'faq.accountA3' },
                { qKey: 'faq.accountQ4', aKey: 'faq.accountA4' }
            ],
            content: [
                { qKey: 'faq.contentQ1', aKey: 'faq.contentA1' },
                { qKey: 'faq.contentQ2', aKey: 'faq.contentA2' },
                { qKey: 'faq.contentQ3', aKey: 'faq.contentA3' },
                { qKey: 'faq.contentQ4', aKey: 'faq.contentA4' }
            ],
            premium: [
                { qKey: 'faq.premiumQ1', aKey: 'faq.premiumA1' },
                { qKey: 'faq.premiumQ2', aKey: 'faq.premiumA2' },
                { qKey: 'faq.premiumQ3', aKey: 'faq.premiumA3' },
                { qKey: 'faq.premiumQ4', aKey: 'faq.premiumA4' }
            ],
            technical: [
                { qKey: 'faq.technicalQ1', aKey: 'faq.technicalA1' },
                { qKey: 'faq.technicalQ2', aKey: 'faq.technicalA2' },
                { qKey: 'faq.technicalQ3', aKey: 'faq.technicalA3' },
                { qKey: 'faq.technicalQ4', aKey: 'faq.technicalA4' }
            ]
        },
        openFaqIndex: null,
        isLoggedIn: false,
        currentLang: 'uk',
        componentReady: false, // Прапорець готовності компонента та залежностей
        initError: null, // Повідомлення про помилку ініціалізації

        get faqSections() { return Object.keys(this.faqData); },

        // Безпечний доступ до i18n
        safeT(key, params = {}, fallback = '') {
            try {
                // Перевіряємо глобальний прапорець та наявність стору
                if (window.i18nIsReady && typeof Alpine.store === 'function' && Alpine.store('i18n')?.initialized) {
                    const translation = Alpine.store('i18n').t(key, params);
                    return (translation && translation !== key && translation.trim() !== '') ? translation : fallback;
                }
                // Форматуємо fallback, якщо i18n не готовий
                if (Object.keys(params).length > 0 && typeof fallback === 'string' && fallback !== '') {
                    return Object.keys(params).reduce((str, pKey) => str.replace(new RegExp(`\\{${pKey}\\}`, 'g'), params[pKey] !== undefined && params[pKey] !== null ? params[pKey] : ''), fallback);
                }
                return fallback || key;
            } catch (error) { console.warn(`[faqPage] safeT error for key: ${key}`, error); return fallback || key; }
        },

        // Перемикання питання
        toggleQuestion(globalIndex) {
            this.openFaqIndex = (this.openFaqIndex === globalIndex) ? null : globalIndex;
        },

        // Розрахунок глобального індексу
        calculateGlobalIndex(sectionIndex, localIndex) {
            let globalIdx = 0;
            for (let i = 0; i < sectionIndex; i++) {
                globalIdx += this.faqData[this.faqSections[i]]?.length || 0;
            }
            return globalIdx + localIndex;
        },

        // Обробка хешу URL
        handleHashNavigation() {
            if (!this.componentReady) return; // Не обробляти, якщо не готовий
            this.$nextTick(() => { // Чекаємо оновлення DOM від $watch
                const hash = window.location.hash;
                console.log(`[faqPage] Hash changed to: ${hash}`);
                if (hash) {
                    const questionMatch = hash.match(/^#question-([a-z]+)-(\d+)$/);
                    if (questionMatch) {
                        const section = questionMatch[1];
                        const questionNum = parseInt(questionMatch[2], 10);
                        const sectionIndex = this.faqSections.indexOf(section);

                        if (sectionIndex !== -1 && this.faqData[section] && questionNum >= 1 && questionNum <= this.faqData[section].length) {
                            this.activeCategory = section;
                            const localIndex = questionNum - 1;
                            const globalIndex = this.calculateGlobalIndex(sectionIndex, localIndex);
                            console.log(`[faqPage] Opening question: section=${section}, num=${questionNum}, globalIndex=${globalIndex}`);

                            this.openFaqIndex = globalIndex; // Відкриваємо
                            // Скролимо ПІСЛЯ того, як елемент став видимим завдяки x-collapse
                            setTimeout(() => { // Невелика затримка для анімації x-collapse
                                const questionElement = document.getElementById(`faq-item-${globalIndex}`);
                                if (questionElement) {
                                    questionElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    const button = questionElement.querySelector('.faq-question');
                                    if(button) button.focus({ preventScroll: true });
                                } else {
                                    console.warn(`[faqPage] Element with ID faq-item-${globalIndex} not found.`);
                                }
                            }, 350); // Затримка має бути трохи більшою за тривалість анімації x-collapse

                        } else {
                            console.warn(`[faqPage] Invalid section or question number in hash: ${hash}`);
                        }
                    } else {
                        console.log(`[faqPage] Hash does not match question format: ${hash}`);
                    }
                } else {
                    console.log('[faqPage] Hash is empty, closing questions.');
                    this.openFaqIndex = null; // Закриваємо, якщо хеш порожній
                }
            });
        },

        // Ініціалізація компонента
        async init() {
            console.log('[faqPage.js] init() called. Waiting for dependencies (api & i18nIsReady)...');
            let attempts = 0;
            const maxAttempts = 60; // 6 секунд
            const checkInterval = 100;

            try {
                // Перевіряємо готовність API та i18n
                while ((typeof window.api?.utils === 'undefined' || window.i18nIsReady !== true) && attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, checkInterval));
                    attempts++;
                    if (attempts % 10 === 0) console.log(`[faqPage.js] Waiting... (API: ${typeof window.api?.utils !== 'undefined'}, i18n: ${window.i18nIsReady}) Attempt: ${attempts}`);
                }

                if (typeof window.api?.utils === 'undefined' || window.i18nIsReady !== true) {
                    this.initError = 'Помилка завантаження залежностей. Спробуйте оновити сторінку.';
                    console.error('[faqPage.js] Initialization failed: Dependencies not ready.');
                    this.componentReady = false; // Встановлюємо в false при помилці
                    return;
                }

                // Залежності готові
                console.log('[faqPage.js] Dependencies ready. Proceeding with initialization.');

                // Перевіряємо автентифікацію користувача
                try {
                    this.isLoggedIn = window.api.utils.isAuthenticated();
                } catch (e) {
                    console.warn('[faqPage.js] Error checking authentication:', e);
                    this.isLoggedIn = false;
                }

                // Отримуємо поточну мову
                if (Alpine.store('i18n')) {
                    this.currentLang = Alpine.store('i18n').selectedLang;

                    // Слухач зміни мови
                    this.$watch('$store.i18n.selectedLang', (newLang) => {
                        if (this.currentLang !== newLang) {
                            console.log(`[faqPage.js] Language changed to ${newLang}.`);
                            this.currentLang = newLang;
                            // Оновлюємо title та lang
                            document.title = `${this.safeT('faq.title', 'Часті запитання')} — ${this.safeT('general.copyright', 'Таємний Світ')}`;
                            document.documentElement.lang = newLang;
                        }
                    });
                } else {
                    console.warn('[faqPage.js] i18n store not available for watching.');
                }

                // Обробка URL та хешу
                const urlParams = new URLSearchParams(window.location.search);
                const category = urlParams.get('category');
                if (category && this.faqSections.includes(category)) {
                    this.activeCategory = category;
                }

                // Підключаємо обробник зміни хешу
                window.addEventListener('hashchange', () => this.handleHashNavigation());
                // Обробляємо початковий хеш на сторінці
                this.handleHashNavigation();

                this.componentReady = true; // Встановлюємо готовність в кінці успішної ініціалізації
                console.log('[faqPage.js] Initialization complete.');

            } catch (error) {
                console.error('[faqPage.js] Error during init logic:', error);
                this.initError = `Помилка ініціалізації сторінки FAQ: ${error.message}`;
                this.componentReady = false; // Встановлюємо в false при помилці
            }
        },

        // Метод для виходу
        async logoutUser() {
            try {
                console.log('[faqPage.js] Attempting logout...');
                if (typeof api !== 'undefined' && api.auth && typeof api.auth.logout === 'function') {
                    api.auth.logout();
                    this.isLoggedIn = false;
                } else {
                    throw new Error('API logout function is not available.');
                }
            } catch (error) {
                console.error('[faqPage.js] Logout error:', error);
            }
        },
    }));
}
// --- END OF FILE js/components/faqPage.js ---