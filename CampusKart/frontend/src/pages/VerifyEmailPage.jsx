import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import apiClient from '../api/client'
import Button from '../components/ui/Button'
import { useToast } from '../hooks/useToast'

function extractErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail

  if (typeof detail === 'string') {
    return detail
  }

  const payload = error?.response?.data
  if (payload && typeof payload === 'object') {
    const firstValue = Object.values(payload)[0]

    if (Array.isArray(firstValue) && firstValue.length > 0) {
      return String(firstValue[0])
    }

    if (typeof firstValue === 'string') {
      return firstValue
    }
  }

  return fallback
}

function VerifyEmailPage() {
  const [resendLoading, setResendLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { showError, showSuccess } = useToast()

  const prefilledEmail = useMemo(() => {
    const queryEmail = searchParams.get('email')?.trim().toLowerCase() || ''
    const stateEmail = location.state?.email?.trim().toLowerCase() || ''
    return queryEmail || stateEmail
  }, [location.state, searchParams])

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      email: prefilledEmail,
      code: '',
    },
  })

  const handleVerify = async (values) => {
    const email = values.email.trim().toLowerCase()
    const code = values.code.trim()

    try {
      const response = await apiClient.post('/auth/verify-email/', { email, code })

      showSuccess(response?.data?.detail || 'Email verified successfully. Please sign in.')
      navigate('/login', { replace: true, state: { email } })
    } catch (error) {
      showError(
        extractErrorMessage(error, 'Invalid or expired OTP. Please check your code or request a new one.'),
      )
    }
  }

  const handleResend = async () => {
    const email = getValues('email').trim().toLowerCase()

    if (!email) {
      showError('Enter your email first, then request a new OTP.')
      return
    }

    try {
      setResendLoading(true)
      const response = await apiClient.post('/auth/resend-verification/', { email })
      showSuccess(response?.data?.detail || 'A new verification code was sent to your email.')
    } catch (error) {
      showError(extractErrorMessage(error, 'Could not resend OTP right now. Please try again.'))
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <section className="relative min-h-[calc(100vh-150px)] overflow-hidden bg-[var(--ck-bg)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_5%,rgba(255,255,255,0.2),transparent_45%)]" />
      <div className="relative mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Verify your <span className="text-[var(--ck-accent)]">email</span>
        </h1>
        <p className="mt-2 text-base text-slate-600">
          Enter the 6-digit OTP sent to activate your CampusKart account.
        </p>

        <form
          onSubmit={handleSubmit(handleVerify)}
          className="mx-auto mt-8 w-full max-w-xl rounded-2xl border border-white/10 bg-[var(--ck-surface)] p-6 text-left shadow-[0_20px_45px_rgba(0,0,0,0.25)] sm:p-8"
        >
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-white">Email</span>
            <input
              type="email"
              className="w-full rounded-xl border border-white/20 bg-[var(--ck-surface-deep)] px-4 py-3 text-base text-white outline-none focus:border-[var(--ck-accent)]"
              {...register('email', {
                required: 'Email is required.',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Please enter a valid email address.',
                },
              })}
            />
            {errors.email ? <span className="mt-1 block text-xs text-red-300">{errors.email.message}</span> : null}
          </label>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-semibold text-white">OTP Code</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="w-full rounded-xl border border-white/20 bg-[var(--ck-surface-deep)] px-4 py-3 tracking-[0.3em] text-white outline-none focus:border-[var(--ck-accent)]"
              placeholder="123456"
              {...register('code', {
                required: 'OTP code is required.',
                minLength: {
                  value: 6,
                  message: 'OTP must be exactly 6 digits.',
                },
                maxLength: {
                  value: 6,
                  message: 'OTP must be exactly 6 digits.',
                },
                pattern: {
                  value: /^\d{6}$/,
                  message: 'OTP must contain only numbers.',
                },
              })}
            />
            {errors.code ? <span className="mt-1 block text-xs text-red-300">{errors.code.message}</span> : null}
          </label>

          <Button type="submit" disabled={isSubmitting} className="mt-6 w-full rounded-xl py-3 text-base font-bold">
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#111111] border-t-transparent" />
                Verifying...
              </span>
            ) : (
              'Verify Account'
            )}
          </Button>

          <div className="mt-4 rounded-xl border border-white/10 bg-[var(--ck-surface-deep)] px-4 py-3 text-sm text-slate-600">
            OTP expired? Click resend to get a fresh code on your email.
          </div>

          <Button
            type="button"
            disabled={resendLoading}
            onClick={handleResend}
            className="mt-3 w-full rounded-xl border border-white/20 bg-[var(--ck-surface-deep)] py-3 text-base font-semibold text-white hover:opacity-100"
          >
            {resendLoading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Sending new code...
              </span>
            ) : (
              'Resend Verification OTP'
            )}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600">
          Back to{' '}
          <Link to="/login" className="font-semibold text-[var(--ck-accent)] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </section>
  )
}

export default VerifyEmailPage


