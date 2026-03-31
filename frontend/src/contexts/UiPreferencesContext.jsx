import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { resolveTranslation } from '../i18n/translations.js'

const STORAGE_LOCALE = 'keefoo_locale'
const STORAGE_THEME = 'keefoo_theme'

const UiPreferencesContext = createContext(null)

function readLocale() {
  const v = localStorage.getItem(STORAGE_LOCALE)
  return v === 'en' ? 'en' : 'zh'
}

function readTheme() {
  const v = localStorage.getItem(STORAGE_THEME)
  if (v === 'dark' || v === 'light') return v
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

export function UiPreferencesProvider({ children }) {
  const [locale, setLocaleState] = useState(() => readLocale())
  const [theme, setThemeState] = useState(() => readTheme())

  const setLocale = useCallback((next) => {
    const v = next === 'en' ? 'en' : 'zh'
    localStorage.setItem(STORAGE_LOCALE, v)
    setLocaleState(v)
  }, [])

  const setTheme = useCallback((next) => {
    const v = next === 'dark' ? 'dark' : 'light'
    localStorage.setItem(STORAGE_THEME, v)
    setThemeState(v)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      root.style.colorScheme = 'dark'
    } else {
      root.classList.remove('dark')
      root.style.colorScheme = 'light'
    }
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'
  }, [locale])

  const t = useCallback(
    (path) => resolveTranslation(locale, path),
    [locale],
  )

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      theme,
      setTheme,
      t,
      /** BCP-47-ish for date/time */
      dateLocale: locale === 'en' ? 'en-US' : 'zh-CN',
    }),
    [locale, setLocale, theme, setTheme, t],
  )

  return (
    <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>
  )
}

export function useUiPreferences() {
  const ctx = useContext(UiPreferencesContext)
  if (!ctx) {
    throw new Error('useUiPreferences must be used within UiPreferencesProvider')
  }
  return ctx
}
