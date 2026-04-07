export type DemoLanguage = 'ru' | 'kg';

export const DEMO_LANGUAGE_STORAGE_KEY = 'demo-language';

export function getStoredDemoLanguage(): DemoLanguage | null {
  const savedLanguage = window.localStorage.getItem(DEMO_LANGUAGE_STORAGE_KEY);
  return savedLanguage === 'kg' || savedLanguage === 'ru' ? savedLanguage : null;
}

export function setStoredDemoLanguage(language: DemoLanguage) {
  window.localStorage.setItem(DEMO_LANGUAGE_STORAGE_KEY, language);
}

export function localizeUi(language: DemoLanguage, ruText: string, kgText: string) {
  return language === 'kg' ? kgText : ruText;
}
