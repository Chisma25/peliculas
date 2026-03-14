import { redirect } from "next/navigation";

import { ProfileForm } from "@/components/profile-form";
import { ProfileOverview } from "@/components/profile-overview";
import { getProfileDataHydrated, getSessionUser } from "@/lib/store";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const profile = await getProfileDataHydrated(user.id);
  if (!profile) {
    redirect("/");
  }

  return (
    <div className="profile-page-stack">
      <ProfileOverview profile={profile} />
      <ProfileForm initialName={user.name} initialUsername={user.username} initialAvatarUrl={user.avatarUrl} />
    </div>
  );
}
