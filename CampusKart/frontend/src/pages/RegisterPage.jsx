import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import apiClient from '../api/client'
import { useToast } from '../hooks/useToast'

function RegisterPage() {
  const [submitError, setSubmitError] = useState('')
  const navigate = useNavigate()
  const { showSuccess } = useToast()

  const {
    register,
    control,
    getValues,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      full_name: '',
      email: '',
      password: '',
      confirm_password: '',
      role: 'student',
      student_id: '',
      university: '',
      shop_name: '',
      contact_phone: '',
    },
  })

  const selectedRole = useWatch({
    control,
    name: 'role',
    defaultValue: 'student',
  })

  const onSubmit = async (values) => {
    setSubmitError('')

    try {
      const payload = {
        full_name: values.full_name,
        email: values.email,
        password: values.password,
        password2: values.confirm_password,
        role: values.role,
      }

      if (values.role === 'student') {
        payload.student_id = values.student_id
        payload.university = values.university
      }

      await apiClient.post('/auth/register/', payload)

      const email = values.email.trim().toLowerCase()
      showSuccess('Account created. Verify your email with the OTP sent to your inbox.')
      navigate(`/verify-email?email=${encodeURIComponent(email)}`, {
        replace: true,
        state: { email },
      })
    } catch (error) {
      const detail = error?.response?.data?.detail
      const fallback = 'Unable to create account. Please review your details and try again.'
      setSubmitError(detail || fallback)
    }
  }

  return (
    <section className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-primary">Create your CampusKart account</h1>
      <p className="mt-1 text-sm text-muted">Student and vendor onboarding in one form.</p>

      {submitError ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {submitError}
        </p>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-800">Full Name</span>
          <input
            type="text"
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent"
            {...register('full_name', { required: 'Full name is required.' })}
          />
          {errors.full_name ? <span className="mt-1 block text-xs text-red-600">{errors.full_name.message}</span> : null}
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-800">Email</span>
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
          <span className="mb-1 block text-sm font-medium text-slate-800">Password</span>
          <input
            type="password"
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent"
            {...register('password', {
              required: 'Password is required.',
              minLength: {
                value: 8,
                message: 'Password must be at least 8 characters.',
              },
            })}
          />
          {errors.password ? <span className="mt-1 block text-xs text-red-600">{errors.password.message}</span> : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-800">Confirm Password</span>
          <input
            type="password"
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent"
            {...register('confirm_password', {
              required: 'Please confirm your password.',
              validate: (value) => value === getValues('password') || 'Passwords do not match.',
            })}
          />
          {errors.confirm_password ? (
            <span className="mt-1 block text-xs text-red-600">{errors.confirm_password.message}</span>
          ) : null}
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-800">Role</span>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent"
            {...register('role', { required: true })}
          >
            <option value="student">Student</option>
            <option value="vendor">Vendor</option>
          </select>
        </label>

        {selectedRole === 'student' ? (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-800">Student ID</span>
              <input
                type="text"
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent"
                {...register('student_id', { required: 'Student ID is required for students.' })}
              />
              {errors.student_id ? (
                <span className="mt-1 block text-xs text-red-600">{errors.student_id.message}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-800">University</span>
              <input
                type="text"
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent"
                {...register('university', { required: 'University is required for students.' })}
              />
              {errors.university ? (
                <span className="mt-1 block text-xs text-red-600">{errors.university.message}</span>
              ) : null}
            </label>
          </>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-800">Shop Name</span>
              <input
                type="text"
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent"
                {...register('shop_name', { required: 'Shop name is required for vendors.' })}
              />
              {errors.shop_name ? (
                <span className="mt-1 block text-xs text-red-600">{errors.shop_name.message}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-800">Contact Phone</span>
              <input
                type="tel"
                className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent"
                {...register('contact_phone', { required: 'Contact phone is required for vendors.' })}
              />
              {errors.contact_phone ? (
                <span className="mt-1 block text-xs text-red-600">{errors.contact_phone.message}</span>
              ) : null}
            </label>
          </>
        )}

        <div className="md:col-span-2">
          <Button type="submit" disabled={isSubmitting} className="w-full bg-primary">
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Creating account...
              </span>
            ) : (
              'Create Account'
            )}
          </Button>

          <p className="mt-3 text-center text-sm text-muted">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </form>
    </section>
  )
}

export default RegisterPage