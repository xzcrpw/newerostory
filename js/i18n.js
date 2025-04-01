// js/i18n.js

// Відразу визначаємо глобальну safeT функцію
window.safeT = function(key, params = {}, fallback = '') {
    try {
        // Перевіряємо наявність та ініціалізацію стору
        if (typeof Alpine !== 'undefined' && Alpine.store('i18n')?.initialized) {
            const translation = Alpine.store('i18n').t(key, params);
            // Повертаємо fallback, якщо переклад відсутній, порожній або співпадає з ключем
            return (translation && translation !== key && translation.trim() !== '') ? translation : fallback;
        }
        // Якщо стор ще не готовий, або сталася помилка, повертаємо fallback
        // Додаємо обробку параметрів до fallback, якщо вони є
        if (Object.keys(params).length > 0 && typeof fallback === 'string') {
            return Object.keys(params).reduce((str, pKey) => str.replace(new RegExp(`\\{${pKey}\\}`, 'g'), params[pKey]), fallback);
        }
        return fallback;
    } catch (error) {
        console.warn(`Global safeT error for key ${key}:`, error);
        return fallback; // Повертаємо fallback при помилці
    }
};


// Імпортуємо всі локалізації з обробкою помилок
let supportedLanguages = {};

try {
    const ukModule = await import('../locales/uk.js');
    supportedLanguages.uk = ukModule.default;
} catch (e) {
    console.error('Error importing uk.js:', e);
    supportedLanguages.uk = {}; // Пустий об'єкт як запасний варіант
}

try {
    const enModule = await import('../locales/en.js');
    supportedLanguages.en = enModule.default;
} catch (e) {
    console.error('Error importing en.js:', e);
    supportedLanguages.en = {}; // Пустий об'єкт як запасний варіант
}

try {
    const deModule = await import('../locales/de.js');
    supportedLanguages.de = deModule.default;
} catch (e) {
    console.error('Error importing de.js:', e);
    supportedLanguages.de = {}; // Пустий об'єкт як запасний варіант
}

try {
    const itModule = await import('../locales/it.js');
    supportedLanguages.it = itModule.default;
} catch (e) {
    console.error('Error importing it.js:', e);
    supportedLanguages.it = {}; // Пустий об'єкт як запасний варіант
}

try {
    const ruModule = await import('../locales/ru.js');
    supportedLanguages.ru = ruModule.default;
} catch (e) {
    console.error('Error importing ru.js:', e);
    supportedLanguages.ru = {}; // Пустий об'єкт як запасний варіант
}

// Додаємо обробку помилок та логування
document.addEventListener('alpine:init', () => {
    console.log('Initializing i18n store...');

    // Функція для глибокого вкладеного доступу до перекладів
    function getTranslation(langStrings, key, params = {}) {
        try {
            if (!langStrings) {
                console.warn(`Language strings object is missing for key: "${key}"`);
                return key;
            }
            const parts = key.split('.');
            let current = langStrings;
            for (const part of parts) {
                if (current === null || current === undefined || current[part] === undefined) {
                    console.warn(`Translation key part not found: "${part}" in "${key}"`);
                    return key;
                }
                current = current[part];
            }

            if (typeof current === 'string') {
                let translatedString = current;
                // Ітеруємо по параметрах і робимо заміну
                for (const paramKey in params) {
                    if (Object.prototype.hasOwnProperty.call(params, paramKey)) { // Додано hasOwnProperty
                        // Створюємо регулярний вираз для пошуку {ключ}
                        const regex = new RegExp(`\\{${paramKey}\\}`, 'g'); // Екрануємо дужки
                        translatedString = translatedString.replace(regex, params[paramKey]);
                    }
                }
                return translatedString;
            }

            // Якщо ключ вказує не на рядок (наприклад, на об'єкт), повертаємо ключ
            console.warn(`Translation key "${key}" does not resolve to a string.`);
            return key;
        } catch (e) {
            console.error(`Error getting translation for key: "${key}"`, e);
            return key;
        }
    }

    // Збереження обраної мови
    function saveSelectedLanguage(langCode) {
        try {
            localStorage.setItem('selectedLanguage', langCode);
        } catch (e) {
            console.warn('Failed to save language preference:', e);
        }
    }

    // Завантаження збереженої мови
    function getStoredLanguage() {
        try {
            return localStorage.getItem('selectedLanguage');
        } catch (e) {
            console.warn('Failed to read language preference:', e);
            return null;
        }
    }

    // Визначення початкової мови
    function getInitialLanguage() {
        try {
            const storedLang = getStoredLanguage();
            if (storedLang && supportedLanguages[storedLang]) {
                console.log(`Using stored language: ${storedLang}`);
                return storedLang;
            }

            const browserLang = (navigator.language || navigator.userLanguage || 'uk').split('-')[0];
            if (supportedLanguages[browserLang]) {
                console.log(`Using browser language: ${browserLang}`);
                return browserLang;
            }
        } catch (e) {
            console.warn('Error determining initial language:', e);
        }
        console.log('Using default language: uk');
        return 'uk'; // Мова за замовчуванням
    }

    const initialLangCode = getInitialLanguage();

    Alpine.store('i18n', {
        available: [
            { code: 'uk', name: 'Українська' },
            { code: 'en', name: 'English' },
            { code: 'de', name: 'Deutsch' },
            { code: 'it', name: 'Italiano' },
            { code: 'ru', name: 'Русский' },
        ],
        selectedLang: initialLangCode,
        strings: supportedLanguages[initialLangCode] || supportedLanguages['uk'],
        initialized: false, // <-- ПРАПОРЕЦЬ ІНІЦІАЛІЗАЦІЇ

        // Метод для отримання перекладу
        t(key, params = {}) {
            return getTranslation(this.strings, key, params);
        },

        // Метод для зміни мови
        setLanguage(langCode) {
            console.log(`Attempting to set language to: ${langCode}`);
            if (supportedLanguages[langCode]) {
                this.selectedLang = langCode;
                this.strings = supportedLanguages[langCode] || {};

                try {
                    saveSelectedLanguage(langCode);
                    document.documentElement.setAttribute('lang', langCode);
                    console.log(`Language set successfully to: ${langCode}`);

                    // Сповіщаємо інші компоненти про зміну мови
                    document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: langCode } }));

                    // Переконуємось, що Alpine оновив DOM, перш ніж знову відправляти подію
                    Alpine.nextTick(() => {
                        document.dispatchEvent(new CustomEvent('languageChangedAfterTick', { detail: { lang: langCode } }));
                    });

                    return true;
                } catch (e) {
                    console.error(`Error updating store for language ${langCode}:`, e);
                    return false;
                }
            } else {
                console.warn(`Language "${langCode}" is not supported.`);
                return false;
            }
        },

        // Метод отримання назви мови
        getLanguageName(code) {
            const lang = this.available.find(l => l.code === code);
            return lang ? lang.name : (code ? code.toUpperCase() : 'UK');
        }
    });

    // Встановлюємо атрибут lang та прапорець initialized ПІСЛЯ створення store
    try {
        const i18nStore = Alpine.store('i18n');
        document.documentElement.setAttribute('lang', i18nStore.selectedLang);
        i18nStore.initialized = true; // <--- ВСТАНОВЛЮЄМО ПРАПОРЕЦЬ ТУТ
        console.log('i18n store initialized flag set. Language:', i18nStore.selectedLang);
    } catch (e) {
        console.error('Error setting initial lang attribute or initialized flag:', e);
    }
});

// Глобальна функція safeT тепер визначена на початку файлу
// window.safeT = ...