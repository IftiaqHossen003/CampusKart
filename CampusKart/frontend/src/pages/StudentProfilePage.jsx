import { useEffect, useState } from "react";
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
  const [formState, setFormState] = useState({
    full_name: "",
    phone: "",
  });

  const profileQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMyProfile,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (!profileQuery.data) {
      return;
    }

    setFormState({
      full_name: profileQuery.data.full_name || "",
      phone: profileQuery.data.phone || "",
    });
  }, [profileQuery.data]);

  const updateProfileMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: (updatedProfile) => {
      queryClient.setQueryData(["auth", "me"], updatedProfile);
      updateUser(updatedProfile);
      showSuccess("Profile updated successfully.");
    },
    onError: (error) => {
      showError(getApiErrorMessage(error, "Could not update your profile."));
    },
  });

  const onSubmit = (event) => {
    event.preventDefault();

    updateProfileMutation.mutate({
      full_name: formState.full_name.trim(),
      phone: formState.phone.trim(),
    });
  };

  const studentProfile = profileQuery.data?.student_profile;

  return (
    <section className="space-y-5">
      <article className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-2xl font-bold text-primary">Student Profile</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your account details and campus identity information.
        </p>
      </article>

      <article className="rounded-xl border border-slate-200 bg-white p-5">
        {profileQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`student-profile-skeleton-${index}`}
                className="h-10 animate-pulse rounded bg-slate-100"
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
                value={formState.full_name}
                onChange={(event) =>
                  setFormState((current) => ({
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
                value={formState.phone}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </label>

            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Student ID
                </p>
                <p className="mt-1 text-slate-700">
                  {studentProfile?.student_id || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  University
                </p>
                <p className="mt-1 text-slate-700">
                  {studentProfile?.university || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Department
                </p>
                <p className="mt-1 text-slate-700">
                  {studentProfile?.department || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  ID verification
                </p>
                <p className="mt-1 text-slate-700">
                  {studentProfile?.is_id_verified ? "Verified" : "Pending"}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={updateProfileMutation.isPending}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-primary disabled:cursor-not-allowed disabled:opacity-60"
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
