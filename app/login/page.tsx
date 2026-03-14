import { LoginPanel } from "@/components/login-panel";

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = (await searchParams) ?? {};
  return <LoginPanel nextPath={params.next} />;
}
