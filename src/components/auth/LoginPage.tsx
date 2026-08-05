import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { describeAuthError, useAuth, EMAIL_NOT_CONFIRMED_MESSAGE } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Set by /auth/confirm after a successful email confirmation.
  const confirmed = (location.state as { confirmed?: boolean } | null)?.confirmed === true
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [resend, setResend] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  // Offer a resend action when Supabase blocked the login because the email
  // was never confirmed (see EMAIL_NOT_CONFIRMED_MESSAGE in AuthContext).
  const needsConfirmation = error === EMAIL_NOT_CONFIRMED_MESSAGE

  // Already signed in? Send them straight to the app.
  if (!loading && user) return <Navigate to="/" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const err = await login(email.trim(), password)
      if (err) setError(err)
      else navigate('/', { replace: true })
    } catch (e: any) {
      // Supabase can throw too — surface the real message, not "{}".
      console.error('[login] threw:', e)
      setError(describeAuthError(e))
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async () => {
    const address = email.trim()
    if (!address) {
      setResend({ kind: 'error', text: 'Enter your email address above, then resend.' })
      return
    }
    setResending(true)
    setResend(null)
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: address,
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
      })
      if (error) throw error
      setResend({ kind: 'ok', text: 'Confirmation email sent — check your inbox.' })
    } catch (e: any) {
      console.error('[login] resend confirmation error:', e)
      setResend({ kind: 'error', text: describeAuthError(e) })
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center mb-3">
            <span className="text-white text-xl font-black">T</span>
          </div>
          <h1 className="text-white font-bold text-xl">TelecomERP</h1>
          <p className="text-slate-400 text-sm">Sign in to continue</p>
        </div>

        {confirmed && (
          <p className="text-sm text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400 rounded-lg p-2.5 mb-4">
            Email confirmed! You can now sign in.
          </p>
        )}

        <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 space-y-4">
          <Input
            label="Email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.mg"
          />
          <Input
            label="Password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-2.5">{error}</p>}
          {needsConfirmation && (
            <div className="text-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50"
              >
                {resending ? 'Sending…' : "Didn't get it? Resend confirmation email"}
              </button>
              {resend && (
                <p className={`text-xs mt-1.5 ${resend.kind === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                  {resend.text}
                </p>
              )}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-4">
          Access is managed by the administrator (Supabase Auth).
        </p>
      </div>
    </div>
  )
}
