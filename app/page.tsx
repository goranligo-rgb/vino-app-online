import { redirect } from "next/navigation";
import { citajSesiju } from "@/lib/auth-sesija";

export default async function HomePage() {
  const user = await citajSesiju();

  if (!user) {
    redirect("/login");
  }

  redirect("/dashboard");
}
