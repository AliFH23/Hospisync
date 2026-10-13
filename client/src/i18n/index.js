import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import ar from './ar';

let saved = 'en';
try { saved = localStorage.getItem('hs.lang') || 'en'; } catch { /* ignore */ }

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: saved,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
});

export default i18n;