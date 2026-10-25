import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { getDb } from "@/db/client";
import { ensureSeeded } from "@/db/seed";

/** Liefert DB und userId des angemeldeten Nutzers. Legt beim ersten Aufruf das Startportfolio an. */
export async function requireUser() {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) redirect("/login");
  const email = process.env.ADMIN_EMAIL;
  if (!email || session.email !== email) redirect("/login");
  const db = await getDb();
  const userId = await ensureSeeded(db, email);
  return { db, userId, email };
}
