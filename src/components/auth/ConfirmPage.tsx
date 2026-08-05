import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { describeAuthError } from '@/contexts/AuthContext'

/**
 * Landing page for Supabase email-confirmation links (configure the project's
 * "Redirect URLs" / SITE_URL, or `emailRedirectTo`, to point at /auth/confirm).
 *
 * The token can arrive three ways, and the Supabase client itself (with
 * detectSessionInUrl: true) already consumes the first two during init:
 *   1. implicit   — #access_token=…   → session saved, hash cleared
 *   2. PKCE       — ?code=…           → exchanged, code removed from URL
 *   3. email link — #token_hash=…&type=… → NOT auto-handled; verifyOtp() below
 *
 * So we first wait for init (getSession) and only manually verify whatever is
 * still in the URL. Every success path redirects to /login with a message.
 */
export function ConfirmPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        // Read the token from the URL — hash and/or query params (query wins,
        // same precedence supabase-js uses).
        const params = new URLSearchParams(window.location.hash.slice(1))
        for (const [key, value] of new URLSearchParams(window.location.search)) {
          params.set(key, value)
        }

        // Rejected/expired link? Supabase puts the reason in the URL. Check it
        // BEFORE trusting any stored session, so a stale "confirmed" flash
        // can't be shown for a link that actually failed.
        const urlError = params.get('error_description') ?? params.get('error')
        if (urlError) throw new Error(urlError)

        // Settle the detectSessionInUrl race: after this, implicit/PKCE tokens
        // are either consumed (session present, URL stripped) or untouched.
        const { data } = await supabase.auth.getSession()
        if (cancelled) return
        if (data.session) {
          navigate('/login', { replace: true, state: { confirmed: true } })
          return
        }

        const code = params.get('code')
        const tokenHash = params.get('token_hash')

        if (code) {
          // PKCE confirmation callback: ?code=…
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
        } else if (tokenHash) {
          // Email-link (OTP) confirmation callback: #token_hash=…&type=…
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: params.get('type') ?? 'email',
          })
          if (otpError) throw otpError
        } else {
          throw new Error('No confirmation token found in the URL.')
        }

        if (!cancelled) navigate('/login', { replace: true, state: { confirmed: true } })
      } catch (e) {
        if (!cancelled) setError(describeAuthError(e))
      }
    }

    void run()
    return () => { cancelled = true }
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-6 text-center">
          {error ? (
            <>
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-2.5">{error}</p>
              <p className="text-xs text-slate-500 mt-4">
                Try opening the confirmation link from your email again, or contact the administrator.
              </p>
              <Link
                to="/login"
                className="inline-block mt-4 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline"
              >
                Back to login
              </Link>
            </>
          ) : (
            <>
              <div className="w-10 h-10 mx-auto mb-3 rounded-full border-2 border-slate-200 dark:border-slate-600 border-t-brand-600 animate-spin" />
              <p className="text-sm text-slate-500">Confirming your email…</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
