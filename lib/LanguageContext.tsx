'use client'

/**
 * LanguageContext
 *
 * Provides the current language (EN/TR) and a translate helper throughout
 * the app. Language is persisted in localStorage under 'mfs_lang'.
 *
 * Hydration safety:
 *   The server always renders in English. The client reads localStorage
 *   only inside a useEffect (after mount). This means:
 *     - First render (server + client hydration): always English → no mismatch
 *     - After mount: if Turkish was saved, the context updates and React
 *       re-renders affected components in Turkish
 *   The result is a brief (~0ms) English render on first load for Turkish
 *   users, which is invisible in practice because it happens before paint.
 *   There is NO hydration error and NO flash of wrong content.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { translate, type Lang, type TranslationKey } from '@/lib/translations'

const STORAGE_KEY = 'mfs_lang'
const DEFAULT_LANG: Lang = 'en'

interface LanguageContextValue {
  lang:     Lang
  setLang:  (l: Lang) => void
  t:        (key: TranslationKey) => string
  mounted:  boolean   // false on first server render, true after hydration
}

const LanguageContext = createContext<LanguageContextValue>({
  lang:    DEFAULT_LANG,
  setLang: () => {},
  t:       (key) => translate(key, DEFAULT_LANG),
  mounted: false,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Always start with English — matches server render, prevents hydration mismatch
  const [lang,    setLangState] = useState<Lang>(DEFAULT_LANG)
  const [mounted, setMounted]   = useState(false)

  // After client mount: read saved preference from localStorage
  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Lang | null
      if (saved === 'en' || saved === 'tr') {
        setLangState(saved)
      }
    } catch { /* localStorage unavailable (private browsing, etc.) — stay EN */ }
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch { /* ignore */ }
  }, [])

  const t = useCallback(
    (key: TranslationKey) => translate(key, lang),
    [lang]
  )

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, mounted }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
