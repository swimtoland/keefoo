import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Check, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useUiPreferences } from '../contexts/UiPreferencesContext.jsx'
import { UiChromeBar } from '../components/UiChromeBar.jsx'

function mapRegisterError(detail, t) {
  if (typeof detail !== 'string') return t('login.errRegister')
  if (detail.includes('already') || detail.includes('registered')) return t('login.errEmailTaken')
  return detail
}

function mapLoginError(detail, t) {
  if (typeof detail !== 'string') return t('login.errInvalidCreds')
  if (detail.toLowerCase().includes('invalid')) return t('login.errInvalidCreds')
  return detail
}

const inputDark =
  'w-full border-0 border-b border-white/20 bg-transparent px-0 py-2.5 text-[14px] font-normal text-white placeholder:text-white/35 outline-none transition-colors duration-200 focus:border-white/60'

export default function Login() {
  const { isAuthenticated, login, register } = useAuth()
  const { t } = useUiPreferences()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
  }, [mode])

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const em = email.trim()
    const pw = password
    if (!em) {
      setError(t('login.errEmail'))
      return
    }
    if (!pw) {
      setError(t('login.errPassword'))
      return
    }
    if (mode === 'register' && pw.length < 6) {
      setError(t('login.errPwdLen'))
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(em, pw)
      } else {
        await register(em, pw, nickname.trim() || undefined)
      }
    } catch (err) {
      if (!err.response) {
        setError(t('login.errNetwork'))
        return
      }
      const status = err.response?.status
      const detail = err.response?.data?.detail
      if (status === 502 || status === 503 || status === 504) {
        setError(t('login.errGateway'))
        return
      }
      if (mode === 'login') {
        setError(mapLoginError(detail, t))
      } else if (status === 409) {
        setError(t('login.errEmailTaken'))
      } else {
        setError(mapRegisterError(detail, t))
      }
    } finally {
      setSubmitting(false)
    }
  }

  function fillDemo() {
    setEmail('demo@keefoo.cn')
    setPassword('demo123456')
  }

  const isRegister = mode === 'register'

  return (
    <div className="login-screen-fade relative flex min-h-screen items-center justify-center bg-[#F0F0F0] px-4 py-10 dark:bg-[#0c0c0c] md:px-6 md:py-14">
      <div
        className="w-full max-w-[920px] rounded-[28px] bg-white p-8 dark:border dark:border-zinc-800 dark:bg-zinc-900 md:p-10"
        style={{
          boxShadow:
            '0 4px 24px -4px rgba(0,0,0,0.06), 0 12px 48px -12px rgba(0,0,0,0.08)',
        }}
      >
        <header className="mb-8 flex flex-col gap-6 md:mb-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-[440px]">
            <p className="text-[15px] font-normal leading-snug tracking-tight text-[#666666] dark:text-zinc-400 md:text-[17px]">
              {t('login.headline1')}
            </p>
            <p className="mt-1 text-[22px] font-bold leading-tight tracking-tight text-[#1A1A1A] dark:text-white md:text-[26px]">
              {t('login.headline2')}
            </p>
          </div>

          <UiChromeBar variant="loginPills" />
        </header>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-0">
          <section className="flex flex-1 flex-col rounded-[16px] bg-[#F9F9F9] p-6 dark:bg-zinc-800/80 md:min-h-[300px] md:p-8">
            <h2 className="text-[15px] font-bold leading-snug text-[#1A1A1A] dark:text-white md:text-[16px]">
              {t('login.introTitle')}
            </h2>
            <p className="mt-3 text-[13px] font-normal leading-relaxed text-[#666666] dark:text-zinc-400 md:text-[14px]">
              {t('login.introBody')}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#EEEEEE] px-2.5 py-1 text-[11px] font-medium text-[#555555] dark:bg-zinc-700 dark:text-zinc-300">
                {t('login.tagFeed')}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEEEEE] px-2.5 py-1 text-[11px] font-medium text-[#555555] dark:bg-zinc-700 dark:text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                {t('login.tagPositions')}
              </span>
              <span className="rounded-full bg-[#EEEEEE] px-2.5 py-1 text-[11px] font-medium text-[#555555] dark:bg-zinc-700 dark:text-zinc-300">
                {t('login.tagShadow')}
              </span>
            </div>

            <div className="mt-auto pt-8 text-[12px] text-[#888888] dark:text-zinc-500">
              {t('login.introFoot')}
            </div>
          </section>

          <div className="relative z-10 flex flex-1 lg:min-w-[380px] lg:-ml-3 lg:mt-1 lg:pl-1">
            <div
              className="flex w-full flex-col rounded-[20px] bg-[#1A1A1A] p-6 md:p-8"
              style={{
                boxShadow:
                  '0 24px 64px -16px rgba(0,0,0,0.45), 0 12px 32px -8px rgba(0,0,0,0.3)',
              }}
            >
              <h3 className="text-[18px] font-semibold tracking-tight text-white md:text-[19px]">
                {t('login.secureTitle')}
              </h3>
              <p className="mt-2 text-[13px] font-normal leading-relaxed text-[#A3A3A3] md:text-[14px]">
                {t('login.secureBody')}
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {error ? (
                  <p className="text-[12px] font-medium leading-relaxed text-red-400">{error}</p>
                ) : null}

                <div>
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('login.emailPh')}
                    className={inputDark}
                  />
                </div>

                {isRegister ? (
                  <div>
                    <input
                      type="text"
                      name="nickname"
                      autoComplete="nickname"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder={t('login.nicknamePh')}
                      className={inputDark}
                    />
                  </div>
                ) : null}

                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    name="password"
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('login.passwordPh')}
                    className={`${inputDark} pr-10`}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-white/40 transition-colors hover:text-white/70"
                    aria-label={t('login.passwordPh')}
                  >
                    {showPwd ? (
                      <EyeOff className="h-[17px] w-[17px]" strokeWidth={1.75} />
                    ) : (
                      <Eye className="h-[17px] w-[17px]" strokeWidth={1.75} />
                    )}
                  </button>
                </div>

                <p className="pt-1 text-[11px] font-medium tracking-wide text-[#737373]">
                  {t('login.encryptedHint')}
                </p>

                <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:gap-3">
                  <button
                    type="button"
                    onClick={fillDemo}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-emerald-800/50 bg-[#14532D] px-4 py-2.5 text-[12px] font-semibold text-emerald-200 transition-colors hover:bg-[#166534]"
                  >
                    <Check className="h-4 w-4 text-emerald-400" strokeWidth={2.5} />
                    {t('login.fillDemo')}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-full bg-white px-5 py-2.5 text-[12px] font-semibold text-[#1A1A1A] shadow-sm transition-colors hover:bg-[#F5F5F5] disabled:opacity-50"
                  >
                    {submitting
                      ? isRegister
                        ? t('login.submittingRegister')
                        : t('login.submittingLogin')
                      : isRegister
                        ? t('login.submitRegister')
                        : t('login.submitLogin')}
                  </button>
                </div>
              </form>

              <p className="mt-6 text-center text-[12px] text-[#737373]">
                {isRegister ? (
                  <>
                    {t('login.hasAccount')}
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="font-semibold text-white/90 underline decoration-white/30 underline-offset-2 hover:decoration-white/60"
                    >
                      {t('login.goLogin')}
                    </button>
                  </>
                ) : (
                  <>
                    {t('login.noAccount')}
                    <button
                      type="button"
                      onClick={() => setMode('register')}
                      className="font-semibold text-white/90 underline decoration-white/30 underline-offset-2 hover:decoration-white/60"
                    >
                      {t('login.goRegister')}
                    </button>
                  </>
                )}
              </p>

              <p className="mt-4 text-center text-[10px] leading-relaxed text-[#555555]">
                {t('login.demoHint')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
