// js/i18n.js

// Імпортуємо всі локалізації
import uk from '../locales/uk.js';
import en from '../locales/en.js';
import de from '../locales/de.js';
import it from '../locales/it.js';
import ru from '../locales/ru.js';

document.addEventListener('alpine:init', () => {
    console.log('Initializing i18n store...');

    const supportedLanguages = { uk, en, de, it, ru }; // Словник доступних мов

    // Функція для отримання тексту за ключем (з можливістю вкладеності)
    function getTranslation(langStrings, key) {
        if (!key || !langStrings) return key;

        try {
            const result = key.split('.').reduce((obj, i) => obj && obj[i], langStrings);
            if (result !== undefined && result !== null) {
                return result;
            }

            // Якщо не знайдено в поточній мові, спробуємо fallback
            const fallbackLang = supportedLanguages['en'] || supportedLanguages['uk'];
            if (fallbackLang) {
                const fallbackResult = key.split('.').reduce((obj, i) => obj && obj[i], fallbackLang);
                if (fallbackResult !== undefined && fallbackResult !== null) {
                    return fallbackResult;
                }
            }

            // Якщо нічого не знайдено, повертаємо ключ
            return key;

        } catch (e) {
            console.warn(`Translation key "${key}" not found.`);
            return key; // Повертаємо ключ у разі помилки
        }
    }

    // Функція для визначення початкової мови
    function getInitialLanguage() {
        const storedLang = localStorage.getItem('selectedLanguage');
        if (storedLang && supportedLanguages[storedLang]) {
            return storedLang;
        }
        // Визначаємо мову браузера (беремо перші 2 символи, напр. 'uk' з 'uk-UA')
        const browserLang = navigator.language.split('-')[0];
        if (supportedLanguages[browserLang]) {
            return browserLang;
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
            // Додайте інші мови сюди
        ],
        selectedLang: getInitialLanguage(), // Поточна вибрана мова
        strings: supportedLanguages[getInitialLanguage()] || supportedLanguages['uk'], // Об'єкт з текстами поточної мови

        // Метод для отримання перекладу
        t(key) {
            return getTranslation(this.strings, key);
        },

        // Метод для зміни мови
        setLanguage(langCode) {
            if (supportedLanguages[langCode]) {
                console.log(`Setting language to: ${langCode}`);
                this.selectedLang = langCode;
                this.strings = supportedLanguages[langCode];
                localStorage.setItem('selectedLanguage', langCode);
                // Оновлюємо атрибут lang у тега <html>
                document.documentElement.setAttribute('lang', langCode);
            } else {
                console.warn(`Language "${langCode}" is not supported.`);
            }
        }
    });

    // Встановлюємо атрибут lang при першому завантаженні
    document.documentElement.setAttribute('lang', Alpine.store('i18n').selectedLang);
    console.log('i18n store initialized. Language:', Alpine.store('i18n').selectedLang);
});