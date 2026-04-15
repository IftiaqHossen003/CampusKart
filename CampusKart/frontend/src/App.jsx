import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import apiClient from "./api/client";
import MainLayout from "./components/layout/MainLayout";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import ToastViewport from "./components/ui/ToastViewport";
import { useAuthStore } from "./store/authStore";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminBannersPage from "./pages/AdminBannersPage";
import AdminOrdersPage from "./pages/AdminOrdersPage";
import AdminProductsPage from "./pages/AdminProductsPage";
import AdminPayoutsPage from "./pages/AdminPayoutsPage";
import AdminSettingsPage from "./pages/AdminSettingsPage";
import AdminVendorsPage from "./pages/AdminVendorsPage";
import CheckoutPage from "./pages/CheckoutPage";
import OrderDetailPage from "./pages/OrderDetailPage";
import OrdersPage from "./pages/OrdersPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import ProductListingPage from "./pages/ProductListingPage";
import RegisterPage from "./pages/RegisterPage";
import CartPage from "./pages/CartPage";
import RoutePlaceholderPage from "./pages/RoutePlaceholderPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import VendorOrdersPage from "./pages/VendorOrdersPage";
import VendorPayoutsPage from "./pages/VendorPayoutsPage";
import VendorProductsPage from "./pages/VendorProductsPage";

const queryClient = new QueryClient();

function App() {
  const startAuthBootstrap = useAuthStore((state) => state.startAuthBootstrap);
  const completeAuthBootstrap = useAuthStore(
    (state) => state.completeAuthBootstrap,
  );

  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      startAuthBootstrap();

      try {
        await apiClient.get("/auth/csrf/");
        const response = await apiClient.post("/auth/bootstrap/", {});

        if (cancelled) {
          return;
        }

        const { access, user } = response.data || {};
        if (access && user) {
          completeAuthBootstrap({ token: access, user });
          return;
        }
      } catch {
        // No active cookie session; continue as unauthenticated.
      }

      if (!cancelled) {
        completeAuthBootstrap();
      }
    };

    bootstrapAuth();

    return () => {
      cancelled = true;
    };
  }, [startAuthBootstrap, completeAuthBootstrap]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastViewport />
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/shop" element={<ProductListingPage />} />
            <Route
              path="/shop/products/:slug"
              element={<ProductDetailPage />}
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />

            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <Navigate to="/admin/dashboard" replace />
                </ProtectedRoute>
              }
            />

            <Route path="/cart" element={<CartPage />} />

            <Route
              path="/checkout"
              element={
                <ProtectedRoute allowedRoles={["student"]}>
                  <CheckoutPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/orders"
              element={
                <ProtectedRoute allowedRoles={["student"]}>
                  <OrdersPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/orders/:orderNumber"
              element={
                <ProtectedRoute allowedRoles={["student"]}>
                  <OrderDetailPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/wishlist"
              element={
                <ProtectedRoute allowedRoles={["student"]}>
                  <RoutePlaceholderPage title="Wishlist" />
                </ProtectedRoute>
              }
            />

            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <RoutePlaceholderPage title="Chat" />
                </ProtectedRoute>
              }
            />

            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <RoutePlaceholderPage title="Notifications" />
                </ProtectedRoute>
              }
            />

            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <RoutePlaceholderPage title="Profile" />
                </ProtectedRoute>
              }
            />

            <Route
              path="/profile/verify"
              element={
                <ProtectedRoute>
                  <RoutePlaceholderPage title="Student Verification" />
                </ProtectedRoute>
              }
            />

            <Route
              path="/profile/referral"
              element={
                <ProtectedRoute>
                  <RoutePlaceholderPage title="Referral" />
                </ProtectedRoute>
              }
            />

            <Route
              path="/vendor/dashboard"
              element={
                <ProtectedRoute allowedRoles={["vendor"]}>
                  <RoutePlaceholderPage title="Vendor Dashboard" />
                </ProtectedRoute>
              }
            />

            <Route
              path="/vendor/products"
              element={
                <ProtectedRoute allowedRoles={["vendor"]}>
                  <VendorProductsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/vendor/orders"
              element={
                <ProtectedRoute allowedRoles={["vendor"]}>
                  <VendorOrdersPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/vendor/analytics"
              element={
                <ProtectedRoute allowedRoles={["vendor"]}>
                  <RoutePlaceholderPage title="Vendor Analytics" />
                </ProtectedRoute>
              }
            />

            <Route
              path="/vendor/payouts"
              element={
                <ProtectedRoute allowedRoles={["vendor"]}>
                  <VendorPayoutsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/vendor/settings"
              element={
                <ProtectedRoute allowedRoles={["vendor"]}>
                  <RoutePlaceholderPage title="Vendor Settings" />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/vendors"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminVendorsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/products"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminProductsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/banners"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminBannersPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/orders"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminOrdersPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/payouts"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminPayoutsPage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/settings"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminSettingsPage />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
