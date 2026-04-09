import { Languages, Moon, Sun } from 'lucide-react'
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'

/** Matches Layout logout button */
const sidebarBtnClass =
  'flex w-full items-center justify-center gap-2 rounded-lg border border-[#E5E5E5] bg-white py-2 text-[12px] font-medium text-[#555] transition-colors hover:border-[#CCC] hover:bg-[#FAFAFA] hover:text-[#1A1A1A] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-white'

/** Login header: one track + segments — same classes as former Feed / Report / Graph tabs */
const loginTabActive =
  'bg-[#E4E4E4] text-[#333333] dark:bg-zinc-600 dark:text-white'
const loginTabInactive =
  'bg-transparent text-[#888888] hover:text-[#555555] dark:text-zinc-400 dark:hover:text-zinc-200'

export function UiChromeBar({ variant = 'compact', className = '' }) {
  const { locale, setLocale, theme, setTheme, t } = useUiPreferences()

  const toggleLocale = () => setLocale(locale === 'zh' ? 'en' : 'zh')
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  if (variant === 'loginPills') {
    const segments = [
      { key: 'zh', label: '中文', active: locale === 'zh', onSelect: () => setLocale('zh') },
      { key: 'en', label: 'EN', active: locale === 'en', onSelect: () => setLocale('en') },
      {
        key: 'light',
        label: t('ui.light'),
        active: theme === 'light',
        onSelect: () => setTheme('light'),
      },
      {
        key: 'dark',
        label: t('ui.dark'),
        active: theme === 'dark',
        onSelect: () => setTheme('dark'),
      },
    ]
    return (
      <div
        className={[
          'inline-flex w-fit shrink-0 rounded-full bg-[#EFEFEF] p-[3px] dark:bg-zinc-800',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        role="group"
        aria-label={`${t('ui.language')}, ${t('ui.theme')}`}
      >
        {segments.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onSelect}
            className={[
              'flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-semibold transition-colors duration-200',
              item.active ? loginTabActive : loginTabInactive,
            ].join(' ')}
          >
            {item.active ? (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: '#FF5722' }}
                aria-hidden
              />
            ) : (
              <span className="w-1.5 shrink-0" aria-hidden />
            )}
            {item.label}
          </button>
        ))}
      </div>
    )
  }

  if (variant === 'sidebar') {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        <button
          type="button"
          onClick={toggleLocale}
          className={sidebarBtnClass}
          aria-label={locale === 'zh' ? 'Switch to English' : '切换到中文'}
        >
          <Languages className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          <span>{locale === 'zh' ? '中文' : 'English'}</span>
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          className={sidebarBtnClass}
          aria-label={theme === 'dark' ? t('ui.light') : t('ui.dark')}
        >
          {theme === 'dark' ? (
            <Moon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          ) : (
            <Sun className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          )}
          <span>{theme === 'dark' ? t('ui.dark') : t('ui.light')}</span>
        </button>
      </div>
    )
  }

  /* compact: login corner — two equal buttons, same chrome as sidebar */
  return (
    <div className={`flex gap-2 ${className}`}>
      <button
        type="button"
        onClick={toggleLocale}
        className={`${sidebarBtnClass} flex-1`}
        aria-label={locale === 'zh' ? 'Switch to English' : '切换到中文'}
      >
        <Languages className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
        <span className="truncate">{locale === 'zh' ? '中文' : 'EN'}</span>
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        className={`${sidebarBtnClass} flex-1`}
        aria-label={theme === 'dark' ? t('ui.light') : t('ui.dark')}
      >
        {theme === 'dark' ? (
          <Moon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
        ) : (
          <Sun className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
        )}
        <span className="truncate">{theme === 'dark' ? t('ui.dark') : t('ui.light')}</span>
      </button>
    </div>
  )
}
