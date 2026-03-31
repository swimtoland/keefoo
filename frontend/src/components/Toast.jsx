import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const ToastContext = createContext(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

/**
 * @param {'success' | 'error' | 'info'} type
 */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef(null)
  const exitTimerRef = useRef(null)

  const hide = useCallback(() => {
    setExiting(true)
    exitTimerRef.current = window.setTimeout(() => {
      setToast(null)
      setExiting(false)
    }, 300)
  }, [])

  const showToast = useCallback(
    (message, type = 'success') => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current)
      setExiting(false)
      setToast({
        message,
        type: type === 'error' ? 'error' : type === 'info' ? 'info' : 'success',
        id: Date.now(),
      })
      timerRef.current = window.setTimeout(() => {
        hide()
      }, 3000)
    },
    [hide],
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      if (exitTimerRef.current) window.clearTimeout(exitTimerRef.current)
    }
  }, [])

  const leftBar =
    toast?.type === 'error'
      ? '#EF4444'
      : toast?.type === 'info'
        ? '#888888'
        : '#22C55E'

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div
          className="pointer-events-none fixed left-0 right-0 top-0 z-[200] flex justify-center px-4 pt-5"
          role="status"
          aria-live="polite"
        >
          <div
            style={{ borderLeftColor: leftBar }}
            className={`pointer-events-auto max-w-md rounded-xl border border-[#F0F0F0] border-l-[3px] bg-white px-5 py-3.5 text-sm font-normal text-[#1A1A1A] shadow-[0_8px_30px_-8px_rgba(0,0,0,0.12)] ${exiting ? 'toast-exit' : 'toast-enter'}`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
