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

function ForgotPasswordPage() {
  const [step, setStep] = useState('request')
  const [requestingOtp, setRequestingOtp] = useState(false)
  const [resendingOtp, setResendingOtp] = useState(false)
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
    setValue,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      email: prefilledEmail,
      code: '',
      new_password: '',
      confirm_password: '',
    },
  })

  const requestResetOtp = async ({ isResend = false } = {}) => {
    const isEmailValid = await trigger('email')
    if (!isEmailValid) {
      return
    }

    const email = getValues('email').trim().toLowerCase()
    setValue('email', email, { shouldValidate: true, shouldDirty: true })

    try {
      if (isResend) {
        setResendingOtp(true)
      } else {
        setRequestingOtp(true)
      }

      const response = await apiClient.post('/auth/forgot-password/', { email })
      showSuccess(response?.data?.detail || 'If that email exists, a reset code has been sent.')
      setStep('reset')
    } catch (error) {
      showError(extractErrorMessage(error, 'Unable to send reset code right now. Please try again.'))
    } finally {
      if (isResend) {
        setResendingOtp(false)
      } else {
        setRequestingOtp(false)
      }
    }
  }

  const onSubmit = async (values) => {
    const email = values.email.trim().toLowerCase()

    try {
      const response = await apiClient.post('/auth/reset-password/', {
        email,
        code: values.code.trim(),
        new_password: values.new_password,
        new_password2: values.confirm_password,
      })

      showSuccess(response?.data?.detail || 'Password reset successful. Please sign in with your new password.')
      navigate('/login', { replace: true, state: { email } })
    } catch (error) {
      showError(extractErrorMessage(error, 'Invalid or expired reset code. Please request a new code.'))
    }
  }

  return (
    <section className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-primary">Forgot password</h1>
      <p className="mt-1 text-sm text-muted">
        {step === 'request'
          ? 'Enter your email and we will send an OTP to reset your password.'
          : 'Enter the OTP from your email and choose a new password.'}
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
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

        {step === 'reset' ? (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">OTP Code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                className="w-full rounded-md border border-slate-300 px-3 py-2 tracking-[0.3em] outline-none focus:border-accent"
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

            <label className="block">
              <span className="mb-1 block text-sm font-medium">New Password</span>
              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent"
                {...register('new_password', {
                  required: 'New password is required.',
                  minLength: {
                    value: 8,
                    message: 'Password must be at least 8 characters.',
                  },
                })}
              />
              {errors.new_password ? (
                <span className="mt-1 block text-xs text-red-600">{errors.new_password.message}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Confirm New Password</span>
              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent"
                {...register('confirm_password', {
                  required: 'Please confirm your new password.',
                  validate: (value) => value === getValues('new_password') || 'Passwords do not match.',
                })}
              />
              {errors.confirm_password ? (
                <span className="mt-1 block text-xs text-red-600">{errors.confirm_password.message}</span>
              ) : null}
            </label>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Resetting password...
                </span>
              ) : (
                'Reset Password'
              )}
            </Button>

            <Button
              type="button"
              disabled={resendingOtp}
              onClick={() => requestResetOtp({ isResend: true })}
              className="w-full bg-slate-700 hover:bg-slate-800"
            >
              {resendingOtp ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Sending new code...
                </span>
              ) : (
                'Resend OTP'
              )}
            </Button>

            <button
              type="button"
              className="w-full text-center text-sm font-medium text-accent hover:underline"
              onClick={() => setStep('request')}
            >
              Use a different email
            </button>
          </>
        ) : (
          <Button
            type="button"
            disabled={requestingOtp}
            onClick={() => requestResetOtp()}
            className="w-full"
          >
            {requestingOtp ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Sending OTP...
              </span>
            ) : (
              'Send Reset OTP'
            )}
          </Button>
        )}
      </form>

      <p className="mt-4 text-center text-sm text-muted">
        Back to{' '}
        <Link to="/login" className="font-semibold text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </section>
  )
}

export default ForgotPasswordPage
