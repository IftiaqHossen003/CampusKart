import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
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
    <section className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-primary">
        Sign in to CampusKart
      </h1>
      <p className="mt-1 text-sm text-muted">
        Use your backend account credentials to continue.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input
            type="email"
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent"
            {...register("email", {
              required: "Email is required.",
              pattern: {
                value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                message: "Please enter a valid email address.",
              },
            })}
          />
          {errors.email ? (
            <span className="mt-1 block text-xs text-red-600">
              {errors.email.message}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Password</span>
          <input
            type="password"
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-accent"
            {...register("password", {
              required: "Password is required.",
              minLength: {
                value: 8,
                message: "Password must be at least 8 characters.",
              },
            })}
          />
          {errors.password ? (
            <span className="mt-1 block text-xs text-red-600">
              {errors.password.message}
            </span>
          ) : null}

          <button
            type="button"
            className="mt-2 text-xs font-medium text-accent hover:underline"
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
        </label>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Signing in...
            </span>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </section>
  );
}

export default LoginPage;
