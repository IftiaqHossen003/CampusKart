import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const roleRedirects = {
  student: "/student/profile",
  vendor: "/vendor/profile",
  admin: "/admin/profile",
};

function ProfileRedirectPage() {
  const user = useAuthStore((state) => state.user);

  const targetPath = roleRedirects[user?.role] || "/";
  return <Navigate to={targetPath} replace />;
}

export default ProfileRedirectPage;
