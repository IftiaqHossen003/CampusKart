import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMyProfile, updateMyProfile } from "../api/auth";
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

function StudentProfilePage() {
  const queryClient = useQueryClient();
  const { showError, showSuccess } = useToast();
  const updateUser = useAuthStore((state) => state.updateUser);
  const [formState, setFormState] = useState(null);

  const profileQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMyProfile,
    staleTime: 30 * 1000,
  });

  const hydratedFormState = useMemo(
    () => ({
      full_name: profileQuery.data?.full_name || "",
      phone: profileQuery.data?.phone || "",
    }),
    [profileQuery.data?.full_name, profileQuery.data?.phone],
  );

  const resolvedFormState = formState || hydratedFormState;

  const updateProfileMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(["auth", "me"], updatedProfile);
      updateUser(updatedProfile);
      setFormState({
        full_name: updatedProfile.full_name || "",
        phone: updatedProfile.phone || "",
      });
      showSuccess("Profile updated successfully.");
    },
    onError: (error) => {
      showError(getApiErrorMessage(error, "Could not update your profile."));
    },
  });

  const onSubmit = (event) => {
    event.preventDefault();

    updateProfileMutation.mutate({
      full_name: resolvedFormState.full_name.trim(),
      phone: resolvedFormState.phone.trim(),
    });
  };

  const studentProfile = profileQuery.data?.student_profile;

  return (
    <section className="space-y-5">
      <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
        <h1 className="text-2xl font-bold text-white">Student Profile</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage your account details and academic information.
        </p>
      </article>

      <article className="rounded-xl border border-white/10 bg-[var(--ck-surface)] p-5">
        {profileQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`student-profile-skeleton-${index}`}
                className="h-10 animate-pulse rounded bg-white/5"
              />
            ))}
          </div>
        ) : profileQuery.isError ? (
          <p className="rounded-md bg-error/10 px-3 py-2 text-sm text-error">
            {getApiErrorMessage(
              profileQuery.error,
              "Could not load your profile.",
            )}
          </p>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit}>
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
                value={resolvedFormState.full_name}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...(current || resolvedFormState),
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
                value={resolvedFormState.phone}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...(current || resolvedFormState),
                    phone: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-white/20 px-3 py-2 text-sm focus:border-[var(--ck-accent)] focus:outline-none"
              />
            </label>

            <div className="grid gap-3 rounded-lg border border-white/10 bg-[var(--ck-surface-deep)] p-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Student ID
                </p>
                <p className="mt-1 text-slate-400">
                  {studentProfile?.student_id || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Department
                </p>
                <p className="mt-1 text-slate-400">
                  {studentProfile?.department || "-"}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={updateProfileMutation.isPending}
                className="rounded-md bg-[var(--ck-accent)] px-4 py-2 text-sm font-semibold text-[#111111] hover:bg-[var(--ck-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}
      </article>
    </section>
  );
}

export default StudentProfilePage;




