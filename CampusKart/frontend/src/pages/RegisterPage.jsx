import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useToast } from "../hooks/useToast";

function getRegisterErrorMessage(error) {
  const data = error?.response?.data;

  if (typeof data?.detail === "string") {
    return data.detail;
  }

  if (Array.isArray(data?.non_field_errors) && data.non_field_errors.length > 0) {
    return String(data.non_field_errors[0]);
  }

  if (Array.isArray(data?.email) && data.email.length > 0) {
    return String(data.email[0]);
  }

  if (data && typeof data === "object") {
    for (const value of Object.values(data)) {
      if (Array.isArray(value) && value.length > 0) {
        return String(value[0]);
      }
      if (typeof value === "string") {
        return value;
      }
    }
  }

  return "Unable to create account. Please review your details and try again.";
}

function RegisterPage() {
  const [submitError, setSubmitError] = useState("");
  const navigate = useNavigate();
  const { showSuccess } = useToast();

  const {
    register,
    control,
    getValues,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      confirm_password: "",
      role: "student",
      student_id: "",
      shop_name: "",
      contact_phone: "",
    },
  });

  const selectedRole = useWatch({
    control,
    name: "role",
    defaultValue: "student",
  });

  const onSubmit = async (values) => {
    setSubmitError("");

    try {
      const payload = {
        full_name: values.full_name,
        email: values.email,
        password: values.password,
        password2: values.confirm_password,
        role: values.role,
      };

      if (values.role === "student") {
        payload.student_id = values.student_id;
      }

      await apiClient.post("/auth/register/", payload);

      const email = values.email.trim().toLowerCase();
      showSuccess(
        "Account created. Verify your email with the OTP sent to your inbox.",
      );
      navigate(`/verify-email?email=${encodeURIComponent(email)}`, {
        replace: true,
        state: { email },
      });
    } catch (error) {
      setSubmitError(getRegisterErrorMessage(error));
    }
  };

  return (
    <section className="relative min-h-[calc(100vh-150px)] overflow-hidden bg-[var(--ck-bg)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_5%,rgba(255,255,255,0.2),transparent_45%)]" />

      <div className="relative mx-auto max-w-4xl">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Create your{" "}
            <span className="text-[var(--ck-accent)]">CampusKart account</span>
          </h1>
          <p className="mt-2 text-base text-[#d9d9d9]">
            Student and vendor onboarding in one place
          </p>
        </div>

        {submitError ? (
          <p className="mx-auto mt-5 max-w-2xl rounded-xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {submitError}
          </p>
        ) : null}

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mt-8 grid gap-4 rounded-2xl border border-white/10 bg-[var(--ck-surface)] p-6 shadow-[0_20px_45px_rgba(0,0,0,0.25)] sm:p-8 md:grid-cols-2"
        >
          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-white">
              Full Name
            </span>
            <input
              type="text"
              className="w-full rounded-xl border border-white/15 bg-[var(--ck-surface-deep)] px-4 py-3 text-base text-white outline-none transition placeholder:text-[#9b9b9b] focus:border-[var(--ck-accent)]"
              placeholder="Your full name"
              {...register("full_name", { required: "Full name is required." })}
            />
            {errors.full_name ? (
              <span className="mt-1.5 block text-xs text-red-300">
                {errors.full_name.message}
              </span>
            ) : null}
          </label>

          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-white">
              Email Address
            </span>
            <input
              type="email"
              className="w-full rounded-xl border border-white/15 bg-[var(--ck-surface-deep)] px-4 py-3 text-base text-white outline-none transition placeholder:text-[#9b9b9b] focus:border-[var(--ck-accent)]"
              placeholder="student@university.edu"
              {...register("email", {
                required: "Email is required.",
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: "Please enter a valid email address.",
                },
              })}
            />
            {errors.email ? (
              <span className="mt-1.5 block text-xs text-red-300">
                {errors.email.message}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-white">
              Password
            </span>
            <input
              type="password"
              className="w-full rounded-xl border border-white/15 bg-[var(--ck-surface-deep)] px-4 py-3 text-base text-white outline-none transition placeholder:text-[#9b9b9b] focus:border-[var(--ck-accent)]"
              placeholder="Minimum 8 characters"
              {...register("password", {
                required: "Password is required.",
                minLength: {
                  value: 8,
                  message: "Password must be at least 8 characters.",
                },
              })}
            />
            {errors.password ? (
              <span className="mt-1.5 block text-xs text-red-300">
                {errors.password.message}
              </span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-white">
              Confirm Password
            </span>
            <input
              type="password"
              className="w-full rounded-xl border border-white/15 bg-[var(--ck-surface-deep)] px-4 py-3 text-base text-white outline-none transition placeholder:text-[#9b9b9b] focus:border-[var(--ck-accent)]"
              placeholder="Re-enter password"
              {...register("confirm_password", {
                required: "Please confirm your password.",
                validate: (value) =>
                  value === getValues("password") || "Passwords do not match.",
              })}
            />
            {errors.confirm_password ? (
              <span className="mt-1.5 block text-xs text-red-300">
                {errors.confirm_password.message}
              </span>
            ) : null}
          </label>

          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-semibold text-white">
              Account Type
            </span>
            <select
              className="w-full rounded-xl border border-white/15 bg-[var(--ck-surface-deep)] px-4 py-3 text-base text-white outline-none transition focus:border-[var(--ck-accent)]"
              {...register("role", { required: true })}
            >
              <option value="student">Student</option>
              <option value="vendor">Vendor</option>
            </select>
          </label>

          {selectedRole === "student" ? (
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-semibold text-white">
                Student ID
              </span>
              <input
                type="text"
                className="w-full rounded-xl border border-white/15 bg-[var(--ck-surface-deep)] px-4 py-3 text-base text-white outline-none transition placeholder:text-[#9b9b9b] focus:border-[var(--ck-accent)]"
                placeholder="Enter your student ID"
                {...register("student_id", {
                  required: "Student ID is required for students.",
                })}
              />
              {errors.student_id ? (
                <span className="mt-1.5 block text-xs text-red-300">
                  {errors.student_id.message}
                </span>
              ) : null}
            </label>
          ) : (
            <>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white">
                  Shop Name
                </span>
                <input
                  type="text"
                  className="w-full rounded-xl border border-white/15 bg-[var(--ck-surface-deep)] px-4 py-3 text-base text-white outline-none transition placeholder:text-[#9b9b9b] focus:border-[var(--ck-accent)]"
                  placeholder="Your shop name"
                  {...register("shop_name", {
                    required: "Shop name is required for vendors.",
                  })}
                />
                {errors.shop_name ? (
                  <span className="mt-1.5 block text-xs text-red-300">
                    {errors.shop_name.message}
                  </span>
                ) : null}
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white">
                  Contact Phone
                </span>
                <input
                  type="tel"
                  className="w-full rounded-xl border border-white/15 bg-[var(--ck-surface-deep)] px-4 py-3 text-base text-white outline-none transition placeholder:text-[#9b9b9b] focus:border-[var(--ck-accent)]"
                  placeholder="+8801XXXXXXXXX"
                  {...register("contact_phone", {
                    required: "Contact phone is required for vendors.",
                  })}
                />
                {errors.contact_phone ? (
                  <span className="mt-1.5 block text-xs text-red-300">
                    {errors.contact_phone.message}
                  </span>
                ) : null}
              </label>
            </>
          )}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-[var(--ck-accent)] px-4 py-3 text-xl font-bold text-[#111111] transition hover:bg-[var(--ck-accent-hover)] disabled:cursor-not-allowed disabled:bg-[#8ea35a]"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#111111] border-t-transparent" />
                  Creating account...
                </span>
              ) : (
                "Create Account"
              )}
            </button>

            <p className="mt-4 text-center text-sm text-[#d9d9d9]">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-semibold text-[var(--ck-accent)] hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </form>
      </div>
    </section>
  );
}

export default RegisterPage;
