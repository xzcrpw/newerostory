// --- START OF FILE js/i18n.js ---
let supportedLanguages = {};
// Шляхи відносні до файлу i18n.js
const availableLangs = [
    { code: 'uk', path: './locales/uk.js', name: 'Українська' },
    { code: 'en', path: './locales/en.js', name: 'English' },
    { code: 'de', path: './locales/de.js', name: 'Deutsch' },
    { code: 'it', path: './locales/it.js', name: 'Italiano' },
    { code: 'ru', path: './locales/ru.js', name: 'Русский' },
];

// --- Глобальний прапорець готовності ---
window.i18nIsReady = false;
console.log('[i18n] Global flag i18nIsReady initialized to false.');

async function loadLanguages() {
    console.log('[i18n] Starting language loading...');
    const loadPromises = availableLangs.map(async (lang) => {
        try {
            console.log(`[i18n] Attempting to import language file: ${lang.path}`);
            // Використовуємо динамічний import() для завантаження ES модулів
            const module = await import(lang.path);
            // Перевіряємо, чи є default export і чи це об'єкт
            if (module.default && typeof module.default === 'object') {
                supportedLanguages[lang.code] = module.default;
                console.log(`[i18n] Language '${lang.code}' loaded successfully via import().`);
            } else {
                // Кидаємо помилку, якщо структура модуля неправильна
                throw new Error(`Invalid module structure in ${lang.path}. Missing default export or not an object.`);
            }
        } catch (e) {
            console.error(`[i18n] Error loading language module ${lang.path} for '${lang.code}':`, e);
            supportedLanguages[lang.code] = {}; // Встановлюємо порожній об'єкт при помилці, щоб уникнути undefined
        }
    });
    // Чекаємо завершення всіх промісів завантаження
    await Promise.all(loadPromises);

    // Перевірка завантаження дефолтної мови (української)
    if (!supportedLanguages.uk || Object.keys(supportedLanguages.uk).length === 0) {
        console.error("[i18n CRITICAL] Default language 'uk' failed to load!");
        // Спробуємо використати англійську як запасний варіант
        supportedLanguages.uk = supportedLanguages.en || {};
        if (Object.keys(supportedLanguages.uk).length === 0) {
            console.error("[i18n CRITICAL] Fallback language 'en' also failed! Using minimal emergency translations.");
            // Якщо і англійська не завантажилась, створюємо мінімальний аварійний набір
            supportedLanguages.uk = {
                general: {
                    siteNamePart1: "Ero",
                    siteNamePart2: "Story",
                    copyright: "EroStory",
                    loading: "Завантаження...",
                    error: "Помилка",
                    login: "Вхід",
                    register: "Реєстрація",
                    home: "Головна",
                    categories: "Категорії",
                    authors: "Автори",
                    // ... додати інші критично важливі переклади
                },
                faq: {
                    title: "Часті запитання",
                    description: "Знайдіть відповіді...",
                    // ...
                }
            };
        }
    }
    console.log('[i18n] Language files loading process completed.');
}

// Запускаємо асинхронне завантаження мов одразу
const languagesPromise = loadLanguages();

// --- Функції для роботи з перекладами та мовою ---

// Функція для глибокого доступу до перекладів
function getTranslation(langStrings, key, params = {}) {
    try {
        if (!langStrings || typeof langStrings !== 'object' || Object.keys(langStrings).length === 0) {
            return formatFallback(key, params);
        }
        const parts = key.split('.');
        let current = langStrings;
        for (const part of parts) {
            if (current === null || current === undefined || typeof current !== 'object' || !Object.hasOwnProperty.call(current, part)) {
                return formatFallback(key, params);
            }
            current = current[part];
        }
        if (typeof current === 'string') {
            return Object.keys(params).reduce((str, pKey) => {
                const regex = new RegExp(`\\{${pKey}\\}`, 'g');
                return str.replace(regex, params[pKey] !== undefined && params[pKey] !== null ? params[pKey] : '');
            }, current);
        }
        return formatFallback(key, params);
    } catch (e) {
        console.error(`[i18n getTranslation] Error processing key "${key}":`, e);
        return formatFallback(key, params);
    }
}

// Форматування fallback значення
function formatFallback(key, params = {}) {
    let fallbackString = key;
    try {
        if (Object.keys(params).length > 0 && typeof fallbackString === 'string') {
            fallbackString = Object.keys(params).reduce((str, pKey) => {
                const regex = new RegExp(`\\{${pKey}\\}`, 'g');
                return str.replace(regex, params[pKey] !== undefined && params[pKey] !== null ? params[pKey] : `{${pKey}}`);
            }, fallbackString);
        }
    } catch (e) { console.error('[i18n] Error formatting fallback string:', e); }
    return fallbackString;
}

// Збереження/Завантаження обраної мови з localStorage
function saveSelectedLanguage(langCode) {
    try { localStorage.setItem('selectedLanguage', langCode); console.log(`[i18n] Saved language preference: ${langCode}`); }
    catch (e) { console.warn('[i18n] Failed to save language preference to localStorage:', e); }
}
function getStoredLanguage() {
    try { return localStorage.getItem('selectedLanguage'); }
    catch (e) { console.warn('[i18n] Failed to read language preference from localStorage:', e); return null; }
}

// Визначення початкової мови
function getInitialLanguage() {
    let initialLang = 'uk'; // Мова за замовчуванням
    try {
        const storedLang = getStoredLanguage();
        if (storedLang && supportedLanguages[storedLang] && Object.keys(supportedLanguages[storedLang]).length > 0) {
            console.log(`[i18n] Using stored language: ${storedLang}`);
            initialLang = storedLang;
        } else {
            const browserLang = (navigator.language || navigator.userLanguage || 'uk').split('-')[0];
            if (supportedLanguages[browserLang] && Object.keys(supportedLanguages[browserLang]).length > 0) {
                console.log(`[i18n] Using browser language: ${browserLang}`);
                initialLang = browserLang;
            } else {
                console.log(`[i18n] Browser language '${browserLang}' not supported/loaded. Using default: ${initialLang}`);
            }
        }
    } catch (e) {
        console.warn('[i18n] Error determining initial language:', e);
    }
    return initialLang;
}

// --- Реєстрація Alpine Store ПІСЛЯ завантаження мов ---
// Це гарантує, що `supportedLanguages` заповнений до того, як стор буде створено
languagesPromise.then(() => {
    console.log('[i18n] Languages loaded. Checking if Alpine is available...');

    // Перевіряємо наявність Alpine
    if (window.Alpine) {
        console.log('[i18n] Alpine found. Registering i18n store...');
        try {
            const initialLangCode = getInitialLanguage();

            Alpine.store('i18n', {
                available: availableLangs.map(lang => ({ code: lang.code, name: lang.name })),
                selectedLang: initialLangCode,
                strings: supportedLanguages[initialLangCode] || supportedLanguages['uk'] || {},
                initialized: false, // Важливо: починаємо як false

                // Метод для отримання перекладу
                t(key, params = {}, fallback = '') {
                    // Використовуємо актуальні strings зі стору
                    const stringsToUse = this.strings || {};
                    // Перевіряємо initialized
                    if (!this.initialized && Object.keys(stringsToUse).length === 0) {
                        // console.warn(`[i18n.t] Store not initialized. Key: ${key}. Returning fallback.`);
                        return formatFallback(fallback || key, params);
                    }
                    const result = getTranslation(stringsToUse, key, params);
                    if (result === key && fallback !== '') {
                        return formatFallback(fallback, params);
                    }
                    return result;
                },

                // Метод для зміни мови
                async setLanguage(langCode) {
                    console.log(`[i18n] Setting language to: ${langCode}`);
                    if (supportedLanguages[langCode] && Object.keys(supportedLanguages[langCode]).length > 0) {
                        this.selectedLang = langCode;
                        this.strings = supportedLanguages[langCode];
                        saveSelectedLanguage(langCode);
                        document.documentElement.lang = langCode;
                        console.log(`[i18n] Language set successfully to: ${langCode}`);
                        document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: langCode } }));
                        Alpine.nextTick(() => {
                            document.dispatchEvent(new CustomEvent('languageChangedAfterTick', { detail: { lang: langCode } }));
                        });
                        return true;
                    } else {
                        console.warn(`[i18n] Lang "${langCode}" not supported or data empty.`);
                        return false;
                    }
                },

                // Метод отримання повної назви мови за кодом
                getLanguageName(code) {
                    const lang = this.available.find(l => l.code === code);
                    return lang ? lang.name : (code ? code.toUpperCase() : 'UK');
                }
            });

            // Встановлюємо initialized ТІЛЬКИ ПІСЛЯ створення стору та заповнення початкових даних
            const i18nStore = Alpine.store('i18n');
            i18nStore.initialized = true;
            document.documentElement.lang = i18nStore.selectedLang;
            console.log('[i18n] Alpine store registered and initialized successfully. Current language:', i18nStore.selectedLang);

            // Відправляємо подію про готовність i18n
            document.dispatchEvent(new CustomEvent('i18nReady'));
            window.i18nIsReady = true; // Встановлюємо глобальний прапорець
            console.log('[i18n] Global i18nIsReady flag set to true.');

        } catch (e) {
            console.error('[i18n] Error registering or initializing Alpine store:', e);
            window.i18nIsReady = true; // Все одно встановлюємо прапорець
        }
    } else {
        // Якщо Alpine не знайдено після завантаження мов
        console.error('[i18n] Alpine object not found when trying to register store! Alpine might not be loaded or initialized yet.');
        window.i18nIsReady = true; // Встановлюємо прапорець, щоб інші скрипти могли продовжити
    }
}).catch(error => {
    // Помилка при завантаженні мовних файлів
    console.error('[i18n] Error during language loading promise:', error);
    window.i18nIsReady = true; // Встановлюємо прапорець при помилці
});
// --- END OF FILE js/i18n.js ---