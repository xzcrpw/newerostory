// contexts/LanguageContext.js
import React, { createContext, useState, useEffect } from 'react';
import ukLocale from '../locales/uk';
import enLocale from '../locales/en';
import ruLocale from '../locales/ru';
import deLocale from '../locales/de';
import itLocale from '../locales/it';

// Об'єкт з усіма локалями
const locales = {
    uk: ukLocale,
    en: enLocale,
    ru: ruLocale,
    de: deLocale,
    it: itLocale
};

// Створення контексту
export const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
    // Отримання збереженої мови або встановлення української за замовчуванням
    const [language, setLanguage] = useState(localStorage.getItem('language') || 'uk');

    // Оновлення локалізації при зміні мови
    useEffect(() => {
        localStorage.setItem('language', language);
        document.documentElement.lang = language;
    }, [language]);

    // Функція для зміни мови
    const changeLanguage = (lang) => {
        if (locales[lang]) {
            setLanguage(lang);
        }
    };

    // Функція для отримання перекладу
    const t = (key) => {
        // Розділення ключа на частини (наприклад, 'general.welcome')
        const parts = key.split('.');

        // Отримання поточної локалі
        const locale = locales[language];

        // Отримання перекладу
        try {
            let translation = locale;
            for (const part of parts) {
                translation = translation[part];
                if (!translation) break;
            }

            return translation || key;
        } catch (error) {
            console.error(`Translation key "${key}" not found for language "${language}"`);
            return key;
        }
    };

    return (
        <LanguageContext.Provider value={{ language, changeLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};