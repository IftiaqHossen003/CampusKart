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
    <section className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-primary">Verify your email</h1>
      <p className="mt-1 text-sm text-muted">
        Enter the 6-digit OTP sent to your email address to activate your CampusKart account.
      </p>

      <form onSubmit={handleSubmit(handleVerify)} className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input
            type="email"
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent"
            {...register('email', {
              required: 'Email is required.',
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: 'Please enter a valid email address.',
              },
            })}
          />
          {errors.email ? <span className="mt-1 block text-xs text-red-600">{errors.email.message}</span> : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">OTP Code</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="w-full rounded-md border border-slate-300 px-3 py-2 tracking-[0.3em] outline-none focus:border-accent"
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
          {errors.code ? <span className="mt-1 block text-xs text-red-600">{errors.code.message}</span> : null}
        </label>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Verifying...
            </span>
          ) : (
            'Verify Account'
          )}
        </Button>
      </form>

      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
        OTP expired? Click resend to get a fresh code on your email.
      </div>

      <Button
        type="button"
        disabled={resendLoading}
        onClick={handleResend}
        className="mt-3 w-full bg-slate-700 hover:bg-slate-800"
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

      <p className="mt-4 text-center text-sm text-muted">
        Back to{' '}
        <Link to="/login" className="font-semibold text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </section>
  )
}

export default VerifyEmailPage
