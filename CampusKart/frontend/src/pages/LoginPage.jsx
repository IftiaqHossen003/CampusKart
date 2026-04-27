import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useToast } from "../hooks/useToast";
import { useAuthStore } from "../store/authStore";
import { useCartStore } from "../store/cartStore";

const roleRedirects = {
  student: "/shop",
  vendor: "/vendor/dashboard",
  admin: "/admin",
};

function isUnverifiedEmailError(detail) {
  return (
    typeof detail === "string" && /not verified|verify your email/i.test(detail)
  );
}

function LoginPage() {
  const login = useAuthStore((state) => state.login);
  const mergeGuestCartOnLogin = useCartStore(
    (state) => state.mergeGuestCartOnLogin,
  );
  const navigate = useNavigate();
  const location = useLocation();
  const { showError } = useToast();
  const fromPath = location.state?.from?.pathname;

  const {
    register,
    getValues,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      email: location.state?.email || "",
      password: "",
    },
  });

  const onSubmit = async (values) => {
    try {
      const response = await apiClient.post("/auth/login/", {
        email: values.email,
        password: values.password,
      });

      const { access, user } = response.data;

      login({
        token: access,
        user,
      });

      const mergeResult = await mergeGuestCartOnLogin().catch(() => ({
        mergedCount: 0,
        failedCount: 0,
      }));

      if (mergeResult.failedCount > 0) {
        showError(
          "Some guest cart items could not be merged. Please review your cart.",
        );
      }

      navigate(fromPath || roleRedirects[user?.role] || "/", { replace: true });
    } catch (error) {
      const detail = error?.response?.data?.detail;
      const message = detail || "Invalid email or password.";

      showError(message);

      if (isUnverifiedEmailError(detail)) {
        const email = values.email.trim().toLowerCase();
        navigate(`/verify-email?email=${encodeURIComponent(email)}`, {
          replace: true,
          state: { email },
        });
      }
    }
  };

  return (
    <section className="relative min-h-[calc(100vh-150px)] overflow-hidden bg-[var(--ck-bg)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_5%,rgba(255,255,255,0.2),transparent_45%)]" />

      <div className="relative mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Welcome to <span className="text-[var(--ck-accent)]">CampusKart</span>
        </h1>
        <p className="mt-2 text-base text-[#d9d9d9]">
          Sign in to your student account
        </p>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="mx-auto mt-8 w-full max-w-xl rounded-2xl border border-white/10 bg-[var(--ck-surface)] p-6 text-left shadow-[0_20px_45px_rgba(0,0,0,0.25)] sm:p-8"
        >
          <label className="block">
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

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-semibold text-white">
              Password
            </span>
            <input
              type="password"
              className="w-full rounded-xl border border-white/15 bg-[var(--ck-surface-deep)] px-4 py-3 text-base text-white outline-none transition placeholder:text-[#9b9b9b] focus:border-[var(--ck-accent)]"
              placeholder="Enter your password"
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

          <div className="mt-4 flex items-center justify-between gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-[#d9d9d9]">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-white/20 bg-transparent accent-[var(--ck-accent)]"
              />
              Remember me
            </label>
            <button
              type="button"
              className="text-sm font-semibold text-[var(--ck-accent)] hover:underline"
              onClick={() => {
                const email = getValues("email").trim().toLowerCase();
                navigate(
                  email
                    ? `/forgot-password?email=${encodeURIComponent(email)}`
                    : "/forgot-password",
                  {
                    state: email ? { email } : undefined,
                  },
                );
              }}
            >
              Forgot password?
            </button>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 w-full rounded-xl bg-[var(--ck-accent)] px-4 py-3 text-xl font-bold text-[#111111] transition hover:bg-[var(--ck-accent-hover)] disabled:cursor-not-allowed disabled:bg-[#8ea35a]"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#111111] border-t-transparent" />
                Signing in...
              </span>
            ) : (
              "Sign In"
            )}
          </button>

          <p className="mt-4 text-center text-sm text-[#d9d9d9]">
            New here?{" "}
            <Link to="/register" className="font-semibold text-[var(--ck-accent)] hover:underline">
              Create account
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}

export default LoginPage;
