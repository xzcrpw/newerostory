// js/i18n.js

// Імпортуємо всі локалізації
import uk from '../locales/uk.js';
import en from '../locales/en.js';
import de from '../locales/de.js';
import it from '../locales/it.js';
import ru from '../locales/ru.js';

// Додаємо обробку помилок та кешування для перекладів
document.addEventListener('alpine:init', () => {
    console.log('Initializing i18n store...');

    const supportedLanguages = { uk, en, de, it, ru }; // Словник доступних мов
    const translationCache = {}; // Кеш для перекладів
    
    // Покращена функція для глибокого вкладеного доступу до перекладів
    function getTranslation(langStrings, key, params = {}) {
        try {
            // Розділяємо ключ на частини (наприклад, "general.login")
            const parts = key.split('.');
            let current = langStrings;
            
            // Проходимося по частинах ключа, щоб отримати переклад
            for (const part of parts) {
                if (current[part] === undefined) {
                    console.warn(`Translation key part not found: "${part}" in "${key}"`);
                    return key; // Повертаємо оригінальний ключ, якщо переклад не знайдено
                }
                current = current[part];
            }
            
            // Якщо результат - рядок, підставляємо параметри
            if (typeof current === 'string') {
                // Заміна плейсхолдерів вигляду {paramName}
                return current.replace(/{([^{}]*)}/g, (match, paramName) => {
                    const replacement = params[paramName];
                    return replacement !== undefined ? replacement : match;
                });
            }
            
            console.warn(`Translation key does not resolve to a string: "${key}"`);
            return key;
        } catch (e) {
            console.error(`Error getting translation for key: "${key}"`, e);
            return key;
        }
    }

    // Динамічне завантаження мовних файлів
    async function loadLanguage(langCode) {
        try {
            const storedVersion = localStorage.getItem('i18n_version') || '1.0';
            const response = await fetch(`/translations/${langCode}.json?v=${storedVersion}`);
            
            if (!response.ok) {
                throw new Error(`Failed to load language ${langCode}: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`Error loading language ${langCode}:`, error);
            throw error;
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
            return localStorage.getItem('selectedLanguage') || null;
        } catch (e) {
            console.warn('Failed to read language preference:', e);
            return null;
        }
    }

    // Функція для визначення початкової мови з покращеною обробкою помилок
    function getInitialLanguage() {
        try {
            const storedLang = localStorage.getItem('selectedLanguage');
            if (storedLang && supportedLanguages[storedLang]) {
                return storedLang;
            }
            
            // Визначаємо мову браузера (беремо перші 2 символи)
            const browserLang = (navigator.language || navigator.userLanguage || 'uk').split('-')[0];
            if (supportedLanguages[browserLang]) {
                return browserLang;
            }
        } catch (e) {
            console.warn('Error determining initial language:', e);
        }
        
        return 'uk'; // Мова за замовчуванням
    }

    Alpine.store('i18n', {
        // Список доступних мов для випадаючого списку
        available: [
            { code: 'uk', name: 'Українська' },
            { code: 'en', name: 'English' },
            { code: 'de', name: 'Deutsch' },
            { code: 'it', name: 'Italiano' },
            { code: 'ru', name: 'Русский' },
        ],
        selectedLang: getInitialLanguage(), // Поточна вибрана мова
        strings: supportedLanguages[getInitialLanguage()] || supportedLanguages['uk'], // Об'єкт з текстами
        
        // Метод для отримання перекладу з параметрами
        t(key, params = {}) {
            return getTranslation(this.strings, key, params);
        },
        
        // Метод для зміни мови з обробкою помилок
        async setLanguage(langCode) {
            try {
                if (supportedLanguages[langCode]) {
                    console.log(`Setting language to: ${langCode}`);
                    this.selectedLang = langCode;
                    this.strings = await loadLanguage(langCode);
                    saveSelectedLanguage(langCode);
                    // Оновлюємо атрибут lang у тега <html>
                    document.documentElement.setAttribute('lang', langCode);
                    
                    // Очищаємо кеш для перекладів
                    Object.keys(translationCache).forEach(key => {
                        if (key.startsWith(`${Object.keys(this.strings)[0]}.`)) {
                            delete translationCache[key];
                        }
                    });
                    
                    // Сповіщаємо про зміну мови
                    const event = new CustomEvent('languageChanged', {
                        detail: { language: langCode }
                    });
                    document.dispatchEvent(event);
                    
                    return true;
                } else {
                    console.warn(`Language "${langCode}" is not supported.`);
                    return false;
                }
            } catch (e) {
                console.error('Error changing language:', e);
                return false;
            }
        },
        
        // Безпечний метод отримання назви мови
        getLanguageName(code) {
            try {
                const lang = this.available.find(l => l.code === code);
                return lang ? lang.name : code.toUpperCase();
            } catch (e) {
                return code ? code.toUpperCase() : 'UK';
            }
        }
    });

    // Встановлюємо атрибут lang при першому завантаженні
    try {
        document.documentElement.setAttribute('lang', Alpine.store('i18n').selectedLang);
        console.log('i18n store initialized. Language:', Alpine.store('i18n').selectedLang);
    } catch (e) {
        console.error('Error setting lang attribute:', e);
    }
});