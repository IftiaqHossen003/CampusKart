import { useMemo, useState } from "react";
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

  const [userForm, setUserForm] = useState(null);

  const [vendorForm, setVendorForm] = useState(null);

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

  const hydratedUserForm = useMemo(
    () => ({
      full_name: profileQuery.data?.full_name || "",
      phone: profileQuery.data?.phone || "",
    }),
    [profileQuery.data?.full_name, profileQuery.data?.phone],
  );

  const hydratedVendorForm = useMemo(
    () => ({
      shop_name: vendorProfileQuery.data?.shop_name || "",
      description: vendorProfileQuery.data?.description || "",
      logo_url: vendorProfileQuery.data?.logo_url || "",
      banner_url: vendorProfileQuery.data?.banner_url || "",
      contact_email: vendorProfileQuery.data?.contact_email || "",
      contact_phone: vendorProfileQuery.data?.contact_phone || "",
      address: vendorProfileQuery.data?.address || "",
    }),
    [
      vendorProfileQuery.data?.shop_name,
      vendorProfileQuery.data?.description,
      vendorProfileQuery.data?.logo_url,
      vendorProfileQuery.data?.banner_url,
      vendorProfileQuery.data?.contact_email,
      vendorProfileQuery.data?.contact_phone,
      vendorProfileQuery.data?.address,
    ],
  );

  const resolvedUserForm = userForm || hydratedUserForm;
  const resolvedVendorForm = vendorForm || hydratedVendorForm;

  const updateUserMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(["auth", "me"], updatedProfile);
      updateUser(updatedProfile);
      setUserForm({
        full_name: updatedProfile.full_name || "",
        phone: updatedProfile.phone || "",
      });
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
      setVendorForm({
        shop_name: updatedVendorProfile.shop_name || "",
        description: updatedVendorProfile.description || "",
        logo_url: updatedVendorProfile.logo_url || "",
        banner_url: updatedVendorProfile.banner_url || "",
        contact_email: updatedVendorProfile.contact_email || "",
        contact_phone: updatedVendorProfile.contact_phone || "",
        address: updatedVendorProfile.address || "",
      });
      showSuccess("Vendor profile updated.");
    },
    onError: (error) => {
      showError(getApiErrorMessage(error, "Could not update vendor profile."));
    },
  });

  const onSubmitUser = (event) => {
    event.preventDefault();
    updateUserMutation.mutate({
      full_name: resolvedUserForm.full_name.trim(),
      phone: resolvedUserForm.phone.trim(),
    });
  };

  const onSubmitVendor = (event) => {
    event.preventDefault();
    updateVendorMutation.mutate({
      shop_name: resolvedVendorForm.shop_name.trim(),
      description: resolvedVendorForm.description.trim(),
      logo_url: resolvedVendorForm.logo_url.trim(),
      banner_url: resolvedVendorForm.banner_url.trim(),
      contact_email: resolvedVendorForm.contact_email.trim(),
      contact_phone: resolvedVendorForm.contact_phone.trim(),
      address: resolvedVendorForm.address.trim(),
    });
  };

  const isLoading = profileQuery.isLoading || vendorProfileQuery.isLoading;
  const isError = profileQuery.isError || vendorProfileQuery.isError;

  return (
    <section className="space-y-5">
      <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
        <h1 className="text-2xl font-bold text-white">Vendor Profile</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage account details and storefront profile information.
        </p>
      </article>

      {isLoading ? (
        <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`vendor-profile-skeleton-${index}`}
                className="h-10 animate-pulse rounded bg-white/5"
              />
            ))}
          </div>
        </article>
      ) : isError ? (
        <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
          <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
            {getApiErrorMessage(
              profileQuery.error || vendorProfileQuery.error,
              "Could not load profile data.",
            )}
          </p>
        </article>
      ) : (
        <>
          <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
            <h2 className="text-lg font-semibold text-white">
              Account Details
            </h2>
            <form className="mt-4 space-y-4" onSubmit={onSubmitUser}>
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Email
                </span>
                <input
                  type="email"
                  value={profileQuery.data?.email || ""}
                  readOnly
                  className="mt-1 w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm text-slate-400"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Full name
                </span>
                <input
                  type="text"
                  required
                  value={resolvedUserForm.full_name}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...(current || resolvedUserForm),
                      full_name: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Phone
                </span>
                <input
                  type="text"
                  value={resolvedUserForm.phone}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...(current || resolvedUserForm),
                      phone: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                />
              </label>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updateUserMutation.isPending ? "Saving..." : "Save Account"}
                </button>
              </div>
            </form>
          </article>

          <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
            <h2 className="text-lg font-semibold text-white">
              Storefront Profile
            </h2>
            <form className="mt-4 space-y-4" onSubmit={onSubmitVendor}>
              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Shop name
                </span>
                <input
                  type="text"
                  required
                  value={resolvedVendorForm.shop_name}
                  onChange={(event) =>
                    setVendorForm((current) => ({
                      ...(current || resolvedVendorForm),
                      shop_name: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Description
                </span>
                <textarea
                  rows={3}
                  value={resolvedVendorForm.description}
                  onChange={(event) =>
                    setVendorForm((current) => ({
                      ...(current || resolvedVendorForm),
                      description: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Contact email
                </span>
                <input
                  type="email"
                  value={resolvedVendorForm.contact_email}
                  onChange={(event) =>
                    setVendorForm((current) => ({
                      ...(current || resolvedVendorForm),
                      contact_email: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Contact phone
                </span>
                <input
                  type="text"
                  value={resolvedVendorForm.contact_phone}
                  onChange={(event) =>
                    setVendorForm((current) => ({
                      ...(current || resolvedVendorForm),
                      contact_phone: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Address
                </span>
                <textarea
                  rows={2}
                  value={resolvedVendorForm.address}
                  onChange={(event) =>
                    setVendorForm((current) => ({
                      ...(current || resolvedVendorForm),
                      address: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Logo URL
                </span>
                <input
                  type="url"
                  value={resolvedVendorForm.logo_url}
                  onChange={(event) =>
                    setVendorForm((current) => ({
                      ...(current || resolvedVendorForm),
                      logo_url: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                />
              </label>

              <label className="block text-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Banner URL
                </span>
                <input
                  type="url"
                  value={resolvedVendorForm.banner_url}
                  onChange={(event) =>
                    setVendorForm((current) => ({
                      ...(current || resolvedVendorForm),
                      banner_url: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
                />
              </label>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={updateVendorMutation.isPending}
                  className="rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
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




