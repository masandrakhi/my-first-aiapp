import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import type { ZodType } from 'zod'
import { ApiError } from '../../auth/apiClient'
import { logError, refSuffix } from '../../lib/log'
import { useAuth, type SignInNotice } from '../../auth/authContext'
import { emailSchema, displayNameSchema, passwordSchema, PASSWORD_MIN } from '../../shared/schemas'
import { BrandMark } from '../BrandMark'

type Mode = 'signin' | 'register' | 'forgot' | 'reset'

const NOTICES: Record<SignInNotice, string> = {
  inactive: 'You were signed out after 15 minutes of inactivity. Sign in to continue.',
  expired: 'Your session ended. Please sign in again.',
  signed_out: "You're signed out.",
  password_changed: 'Password changed, and you were signed out everywhere. Sign in with your new password.',
}

const TITLES: Record<Mode, string> = {
  signin: 'Welcome back',
  register: 'Create your account',
  forgot: 'Reset your password',
  reset: 'Choose a new password',
}

/** Reads a reset token from the link (#reset=…) once, and removes it from the address bar right away. */
function takeResetToken(): string | null {
  const match = /^#reset=([\w-]{16,256})$/.exec(window.location.hash)
  if (!match) return null
  history.replaceState(null, '', window.location.pathname + window.location.search)
  return match[1] ?? null
}

/** Sign in, create account, forgot password and set-new-password, styled like the rest of the app. */
export function AuthPage({ notice }: { notice: SignInNotice | null }) {
  const auth = useAuth()
  const [resetToken, setResetToken] = useState(takeResetToken)
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(notice ? NOTICES[notice] : null)
  const [busy, setBusy] = useState(false)

  const switchTo = (next: Mode) => {
    setMode(next)
    setFieldErrors({})
    setFormError(null)
    setInfo(null)
    setPassword('')
  }

  // A reset link opened in a tab where the app is already open only changes the #fragment (no reload).
  useEffect(() => {
    const onHash = () => {
      const token = takeResetToken()
      if (!token) return
      setResetToken(token)
      setMode('reset')
      setFieldErrors({})
      setFormError(null)
      setInfo(null)
      setPassword('')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  /** Friendly, early checks with the same rules the server enforces; the server still decides. */
  const check = (fields: Record<string, [ZodType, unknown]>) => {
    const errors: Record<string, string> = {}
    for (const [key, [schema, value]] of Object.entries(fields)) {
      const result = schema.safeParse(value)
      if (!result.success) errors[key] = result.error.issues[0]?.message ?? 'Invalid value'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setInfo(null)
    const ok =
      mode === 'signin' ? check({ email: [emailSchema, email] })
      : mode === 'register' ? check({ email: [emailSchema, email], password: [passwordSchema, password], ...(name.trim() ? { name: [displayNameSchema, name] } : {}) })
      : mode === 'forgot' ? check({ email: [emailSchema, email] })
      : check({ password: [passwordSchema, password] })
    if (!ok) return

    setBusy(true)
    try {
      if (mode === 'signin') await auth.signIn(email, password)
      else if (mode === 'register') await auth.register(email, password, name.trim() || undefined)
      else if (mode === 'forgot') setInfo(await auth.requestReset(email))
      else if (resetToken) await auth.resetPassword(resetToken, password)
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(err.fields.newPassword ? { password: err.fields.newPassword } : err.fields)
        // Server faults get a reference the user can quote; expected outcomes (wrong password etc.) don't need one.
        setFormError(err.status >= 500 ? `${err.message}${refSuffix(err)}` : err.message)
        if (err.status >= 500) logError(`${mode} failed`, err)
        if (err.code === 'invalid_reset_link') setMode('forgot')
      } else {
        logError(`${mode} failed`, err) // network or code error; errors never contain credentials
        setFormError("Couldn't reach the server. Check your connection and try again.")
      }
    } finally {
      setBusy(false)
    }
  }

  const passwordMode = mode !== 'forgot'
  const newPassword = mode === 'register' || mode === 'reset'

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8 flex justify-center">
        <BrandMark large />
      </div>
      <div className="animate-fade-up rounded-3xl bg-white p-6 shadow-sm ring-1 ring-stone-900/5 dark:bg-stone-900 dark:ring-white/10">
        <h1 className="text-xl font-bold tracking-tight">{TITLES[mode]}</h1>
        {mode === 'forgot' && (
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">Enter your email and we'll send you a link to set a new password.</p>
        )}

        <div aria-live="polite" className="empty:hidden mt-4">
          {info && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">{info}</p>}
        </div>
        <div role="alert" className="empty:hidden mt-4">
          {formError && <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-950/50 dark:text-rose-100">{formError}</p>}
        </div>

        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          {mode === 'register' && (
            <Field label="First name" hint="Optional. Used in your greeting." error={fieldErrors.name}>
              {(props) => <input {...props} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={40} />}
            </Field>
          )}
          {mode !== 'reset' && (
            <Field label="Email" error={fieldErrors.email}>
              {(props) => <input {...props} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" autoFocus />}
            </Field>
          )}
          {passwordMode && (
            <PasswordField
              label={newPassword ? 'New password' : 'Password'}
              value={password}
              onChange={setPassword}
              error={fieldErrors.password}
              autoComplete={newPassword ? 'new-password' : 'current-password'}
              hint={newPassword ? `At least ${PASSWORD_MIN} characters. A short sentence works well.` : undefined}
              autoFocus={mode === 'reset'}
            />
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent-600 font-semibold text-white shadow-lg shadow-accent-600/25 transition hover:bg-accent-700 active:scale-[0.98] disabled:opacity-60"
          >
            {busy && <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {mode === 'signin' ? 'Sign in' : mode === 'register' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Set new password'}
          </button>
        </form>

        <div className="mt-5 space-y-2 text-center text-sm">
          {mode === 'signin' && (
            <>
              <LinkButton onClick={() => switchTo('forgot')}>Forgot password?</LinkButton>
              <p className="text-stone-600 dark:text-stone-400">
                New here? <LinkButton onClick={() => switchTo('register')}>Create an account</LinkButton>
              </p>
            </>
          )}
          {mode !== 'signin' && (
            <p className="text-stone-600 dark:text-stone-400">
              {mode === 'register' ? 'Already have an account? ' : ''}
              <LinkButton onClick={() => switchTo('signin')}>{mode === 'register' ? 'Sign in' : 'Back to sign in'}</LinkButton>
            </p>
          )}
        </div>
      </div>
    </main>
  )
}

const INPUT =
  'h-12 w-full rounded-2xl bg-stone-100 px-4 text-base outline-none placeholder:text-stone-600 focus:ring-2 focus:ring-accent-600 dark:bg-stone-800 dark:placeholder:text-stone-400 dark:focus:ring-accent-400'

interface FieldProps {
  label: string
  hint?: string
  error?: string
  children: (props: { id: string; className: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode
}

function Field({ label, hint, error, children }: FieldProps) {
  const id = useId()
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
        {label}
      </label>
      {children({ id, className: clsx(INPUT, error && 'ring-2 ring-rose-600'), 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-stone-600 dark:text-stone-400">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-rose-700 dark:text-rose-300">{error}</p>}
    </div>
  )
}

interface PasswordFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  error?: string
  hint?: string
  autoFocus?: boolean
}

function PasswordField({ label, value, onChange, autoComplete, error, hint, autoFocus }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <Field label={label} hint={hint} error={error}>
      {(props) => (
        <div className="relative">
          <input
            {...props}
            className={clsx(props.className, 'pr-12')}
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={autoComplete}
            autoFocus={autoFocus}
            maxLength={128}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className="absolute top-1.5 right-1.5 grid size-9 place-items-center rounded-full text-stone-600 hover:bg-stone-200 dark:text-stone-400 dark:hover:bg-stone-700"
          >
            {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
          </button>
        </div>
      )}
    </Field>
  )
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="font-semibold text-accent-700 underline-offset-4 hover:underline dark:text-accent-300">
      {children}
    </button>
  )
}
