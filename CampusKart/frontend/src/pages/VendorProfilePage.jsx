import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMyProfile, updateMyProfile } from "../api/auth";
import { fetchMyVendorProfile, updateMyVendorProfile } from "../api/vendors";
import { useToast } from "../hooks/useToast";
import { useAuthStore } from "../store/authStore";

function getApiErrorMessage(error, fallbackMessage) {
  const data = error?.response?.data;

  if (typeof data?.detail === "string") {
    return data.detail;
  }

  if (typeof data?.message === "string") {
    return data.message;
  }

  if (data && typeof data === "object") {
    const firstEntry = Object.values(data)[0];
    if (Array.isArray(firstEntry) && firstEntry.length > 0) {
      return String(firstEntry[0]);
    }
    if (typeof firstEntry === "string") {
      return firstEntry;
    }
  }

  return fallbackMessage;
}

function VendorProfilePage() {
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const updateUser = useAuthStore((state) => state.updateUser);

  const [userForm, setUserForm] = useState({
    full_name: "",
    phone: "",
  });

  const [vendorForm, setVendorForm] = useState({
    shop_name: "",
    description: "",
    logo_url: "",
    banner_url: "",
    contact_email: "",
    contact_phone: "",
    address: "",
  });

  const profileQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMyProfile,
    staleTime: 30 * 1000,
  });

  const vendorProfileQuery = useQuery({
    queryKey: ["vendor", "me"],
    queryFn: fetchMyVendorProfile,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    setUserForm({
      full_name: profileQuery.data.full_name || "",
      phone: profileQuery.data.phone || "",
    });
  }, [profileQuery.data]);

  useEffect(() => {
    if (!vendorProfileQuery.data) {
      return;
    }

    setVendorForm({
      shop_name: vendorProfileQuery.data.shop_name || "",
      description: vendorProfileQuery.data.description || "",
      logo_url: vendorProfileQuery.data.logo_url || "",
      banner_url: vendorProfileQuery.data.banner_url || "",
      contact_email: vendorProfileQuery.data.contact_email || "",
      contact_phone: vendorProfileQuery.data.contact_phone || "",
      address: vendorProfileQuery.data.address || "",
    });
  }, [vendorProfileQuery.data]);

  const updateUserMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(["auth", "me"], updatedProfile);
      updateUser(updatedProfile);
      showSuccess("Account details updated.");
    },
    onError: (error) => {
      showError(getApiErrorMessage(error, "Could not update account details."));
    },
  });

  const updateVendorMutation = useMutation({
    mutationFn: updateMyVendorProfile,
    onSuccess: (updatedVendorProfile) => {
      queryClient.setQueryData(["vendor", "me"], updatedVendorProfile);
      showSuccess("Vendor profile updated.");
    },
    onError: (error) => {
      showError(getApiErrorMessage(error, "Could not update vendor profile."));
    },
  });

  const onSubmitUser = (event) => {
    event.preventDefault();
    updateUserMutation.mutate({
      full_name: userForm.full_name.trim(),
      phone: userForm.phone.trim(),
    });
  };

  const onSubmitVendor = (event) => {
    event.preventDefault();
    updateVendorMutation.mutate({
      shop_name: vendorForm.shop_name.trim(),
      description: vendorForm.description.trim(),
      logo_url: vendorForm.logo_url.trim(),
      banner_url: vendorForm.banner_url.trim(),
      contact_email: vendorForm.contact_email.trim(),
      contact_phone: vendorForm.contact_phone.trim(),
      address: vendorForm.address.trim(),
    });
  };

  const isLoading = profileQuery.isLoading || vendorProfileQuery.isLoading;
  const isError = profileQuery.isError || vendorProfileQuery.isError;

  return (
    <section className="space-y-5">
      <article className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-primary">Vendor Profile</h1>
        <p className="mt-1 text-sm text-muted">
          Manage account details and storefront profile information.
        </p>
      </article>

      {isLoading ? (
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`vendor-profile-skeleton-${index}`}
                className="h-10 animate-pulse rounded bg-slate-100"
              />
            ))}
          </div>
        </article>
      ) : isError ? (
        <article className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
            {getApiErrorMessage(
              profileQuery.error || vendorProfileQuery.error,
              "Could not load profile data.",
            )}
          </p>
        </article>
      ) : (
        <>
          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-primary">
              Account Details
            </h2>
            <form className="mt-4 space-y-4" onSubmit={onSubmitUser}>
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Email
                </span>
                <input
                  type="email"
                  value={profileQuery.data?.email || ""}
                  readOnly
                  className="mt-1 w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Full name
                </span>
                <input
                  type="text"
                  required
                  value={userForm.full_name}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...current,
                      full_name: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Phone
                </span>
                <input
                  type="text"
                  value={userForm.phone}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </label>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updateUserMutation.isPending ? "Saving..." : "Save Account"}
                </button>
              </div>
            </form>
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-primary">
              Storefront Profile
            </h2>
            <form className="mt-4 space-y-4" onSubmit={onSubmitVendor}>
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Shop name
                </span>
                <input
                  type="text"
                  required
                  value={vendorForm.shop_name}
                  onChange={(event) =>
                    setVendorForm((current) => ({
                      ...current,
                      shop_name: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Description
                </span>
                <textarea
                  rows={3}
                  value={vendorForm.description}
                  onChange={(event) =>
                    setVendorForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Contact email
                </span>
                <input
                  type="email"
                  value={vendorForm.contact_email}
                  onChange={(event) =>
                    setVendorForm((current) => ({
                      ...current,
                      contact_email: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Contact phone
                </span>
                <input
                  type="text"
                  value={vendorForm.contact_phone}
                  onChange={(event) =>
                    setVendorForm((current) => ({
                      ...current,
                      contact_phone: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Address
                </span>
                <textarea
                  rows={2}
                  value={vendorForm.address}
                  onChange={(event) =>
                    setVendorForm((current) => ({
                      ...current,
                      address: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Logo URL
                </span>
                <input
                  type="url"
                  value={vendorForm.logo_url}
                  onChange={(event) =>
                    setVendorForm((current) => ({
                      ...current,
                      logo_url: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Banner URL
                </span>
                <input
                  type="url"
                  value={vendorForm.banner_url}
                  onChange={(event) =>
                    setVendorForm((current) => ({
                      ...current,
                      banner_url: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
                />
              </label>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updateVendorMutation.isPending}
                  className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updateVendorMutation.isPending
                    ? "Saving..."
                    : "Save Storefront"}
                </button>
              </div>
            </form>
          </article>
        </>
      )}
    </section>
  );
}

export default VendorProfilePage;
