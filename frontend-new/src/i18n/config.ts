import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ru from './locales/ru.json';
import en from './locales/en.json';
import uz from './locales/uz.json';

export const resources = {
  ru: { translation: ru },
  en: { translation: en },
  uz: { translation: uz },
} as const;

export const supportedLanguages = [
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'uz', name: "O'zbekcha", flag: '🇺🇿' },
] as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'ru',
    supportedLngs: ['ru', 'en', 'uz'],
    defaultNS: 'translation',
    
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      // Браузер сообщает «ru-RU», а приложение сравнивает язык с «ru» (тема,
      // таблицы, даты). Без приведения при первом входе подписи пагинации и
      // форматы дат были английскими, хотя интерфейс — русский
      convertDetectedLanguage: (lng: string) => lng.split('-')[0],
    },

    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

export default i18n;
