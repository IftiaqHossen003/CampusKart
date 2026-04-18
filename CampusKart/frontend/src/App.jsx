import { Suspense, lazy, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import apiClient from "./api/client";
import MainLayout from "./components/layout/MainLayout";
import ProtectedRoute from "./components/layout/ProtectedRoute";
import ToastViewport from "./components/ui/ToastViewport";
import { useAuthStore } from "./store/authStore";

const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage"));
const AdminBannersPage = lazy(() => import("./pages/AdminBannersPage"));
const AdminOrdersPage = lazy(() => import("./pages/AdminOrdersPage"));
const AdminProductsPage = lazy(() => import("./pages/AdminProductsPage"));
const AdminPayoutsPage = lazy(() => import("./pages/AdminPayoutsPage"));
const AdminSettingsPage = lazy(() => import("./pages/AdminSettingsPage"));
const AdminVendorsPage = lazy(() => import("./pages/AdminVendorsPage"));
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage"));
const OrdersPage = lazy(() => import("./pages/OrdersPage"));
const ProductDetailPage = lazy(() => import("./pages/ProductDetailPage"));
const ProductListingPage = lazy(() => import("./pages/ProductListingPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const CartPage = lazy(() => import("./pages/CartPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const AdminProfilePage = lazy(() => import("./pages/AdminProfilePage"));
const ProfileRedirectPage = lazy(() => import("./pages/ProfileRedirectPage"));
const RoutePlaceholderPage = lazy(() => import("./pages/RoutePlaceholderPage"));
const StudentProfilePage = lazy(() => import("./pages/StudentProfilePage"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage"));
const VendorProfilePage = lazy(() => import("./pages/VendorProfilePage"));
const VendorOrdersPage = lazy(() => import("./pages/VendorOrdersPage"));
const VendorAnalyticsPage = lazy(() => import("./pages/VendorAnalyticsPage"));
const VendorPayoutsPage = lazy(() => import("./pages/VendorPayoutsPage"));
const VendorProductsPage = lazy(() => import("./pages/VendorProductsPage"));
const WishlistPage = lazy(() => import("./pages/WishlistPage"));

const queryClient = new QueryClient();

function RouteLoadingFallback() {
  return (
    <div className="mx-auto mt-10 w-full max-w-7xl px-4">
      <div className="h-40 animate-pulse rounded-xl bg-slate-200" />
    </div>
  );
}

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
        <Suspense fallback={<RouteLoadingFallback />}>
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
                    <WishlistPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/chat"
                element={
                  <ProtectedRoute>
                    <ChatPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/notifications"
                element={
                  <ProtectedRoute>
                    <NotificationsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/profile"
                element={
                  <ProtectedRoute>
                    <ProfileRedirectPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/student/profile"
                element={
                  <ProtectedRoute allowedRoles={["student"]}>
                    <StudentProfilePage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/vendor/profile"
                element={
                  <ProtectedRoute allowedRoles={["vendor"]}>
                    <VendorProfilePage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/admin/profile"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <AdminProfilePage />
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
                    <VendorAnalyticsPage />
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
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
