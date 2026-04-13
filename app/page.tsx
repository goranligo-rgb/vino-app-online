import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("auth_user")?.value;

  if (!raw) {
    redirect("/login");
  }

  try {
    const user = JSON.parse(decodeURIComponent(raw));

    if (user) {
      redirect("/dashboard");
    }
  } catch {
    redirect("/login");
  }

  redirect("/login");
}