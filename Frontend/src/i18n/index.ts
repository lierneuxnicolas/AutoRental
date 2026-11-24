import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import fr from './fr.json'
import nl from './nl.json'
import en from './en.json'

const storageKey = 'getacar:language'
export const supportedLanguages = ['fr', 'nl', 'en'] as const
type Language = (typeof supportedLanguages)[number]

function isSupportedLanguage(value: string | null): value is Language {
  return supportedLanguages.some((language) => value === language)
}

function getInitialLanguage(): Language {
  try {
    const language = localStorage.getItem(storageKey)
    return isSupportedLanguage(language) ? language : 'fr'
  } catch {
    return 'fr'
  }
}

const language = getInitialLanguage()
document.documentElement.lang = language
void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr }, nl: { translation: nl }, en: { translation: en } },
  lng: language,
  fallbackLng: 'fr',
  supportedLngs: supportedLanguages,
  initAsync: false,
  interpolation: { escapeValue: false },
})

i18n.on('languageChanged', (selected) => {
  document.documentElement.lang = selected
  try {
    localStorage.setItem(storageKey, selected)
  } catch {
    // The selected language still applies if browser storage is unavailable.
  }
})
