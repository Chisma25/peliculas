import { notFound } from "next/navigation";

import { ProfileOverview } from "@/components/profile-overview";
import { getProfileDataHydrated, getUserByUsername } from "@/lib/store";

type GroupMemberPageProps = {
  params: Promise<{
    username: string;
  }>;
};

export default async function GroupMemberPage({ params }: GroupMemberPageProps) {
  const { username } = await params;
  const user = await getUserByUsername(username);
  if (!user) {
    notFound();
  }

  const profile = await getProfileDataHydrated(user.id);
  if (!profile) {
    notFound();
  }

  return <ProfileOverview profile={profile} mode="group" />;
}
