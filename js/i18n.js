// js/i18n.js

// Імпортуємо всі локалізації СТАТИЧНО (це надійніше для початку)
import uk from '../locales/uk.js';
import en from '../locales/en.js';
import de from '../locales/de.js';
import it from '../locales/it.js';
import ru from '../locales/ru.js';

// Словник доступних мовних об'єктів
const supportedLanguages = { uk, en, de, it, ru };

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
                    if (params.hasOwnProperty(paramKey)) {
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
        // Одразу завантажуємо потрібний об'єкт перекладів
        strings: supportedLanguages[initialLangCode] || supportedLanguages['uk'],

        // Метод для отримання перекладу
        t(key, params = {}) {
            // Використовуємо внутрішню функцію getTranslation
            return getTranslation(this.strings, key, params);
        },

        // Метод для зміни мови (СПРОЩЕНИЙ для статичних імпортів)
        setLanguage(langCode) {
            console.log(`Attempting to set language to: ${langCode}`);
            if (supportedLanguages[langCode]) {
                try {
                    this.selectedLang = langCode;
                    this.strings = supportedLanguages[langCode]; // Просто присвоюємо імпортований об'єкт
                    saveSelectedLanguage(langCode);
                    document.documentElement.setAttribute('lang', langCode); // Оновлюємо атрибут HTML
                    console.log(`Language set successfully to: ${langCode}`);

                    // Сповіщаємо інші компоненти про зміну мови (опціонально, але може бути корисно)
                    document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: langCode } }));

                    // Примусове оновлення Alpine (використовувати обережно, тільки для відладки)
                    // Якщо простий присвоєння не працює, можна спробувати так:
                    // Alpine.raw(this).strings = supportedLanguages[langCode];
                    // Або оновити компоненти, що використовують store:
                    // Alpine.nextTick(() => { /* Code that depends on updated store */ });

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

    // Встановлюємо атрибут lang при першому завантаженні
    try {
        document.documentElement.setAttribute('lang', Alpine.store('i18n').selectedLang);
        console.log('i18n store initialized. Language:', Alpine.store('i18n').selectedLang);
    } catch (e) {
        console.error('Error setting initial lang attribute:', e);
    }
});

// Додаємо глобальну функцію safeT для зручного використання в x-data інших компонентів
window.safeT = function(key, fallback = '', params = {}) {
    try {
        if (typeof Alpine !== 'undefined' && Alpine.store('i18n')) {
            return Alpine.store('i18n').t(key, params) || fallback;
        }
        return fallback;
    } catch (e) {
        console.warn(`Global safeT error for key ${key}:`, e);
        return fallback;
    }
};