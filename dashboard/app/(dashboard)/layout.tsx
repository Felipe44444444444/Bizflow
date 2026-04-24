import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

function adminClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function ensureOrganization(userId: string, userEmail: string) {
  const admin = adminClient();

  // Auto-create org for new users
  const orgName = userEmail.split("@")[0]
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim() || "Mi organización";

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: orgName, plan: "free" })
    .select("id")
    .single();

  if (orgErr || !org) return null;

  await admin.from("organization_members").insert({
    organization_id: org.id,
    user_id: userId,
    role: "owner",
  });

  return org.id;
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, plan)")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  // New user — auto-create organization
  if (!membership) {
    const orgId = await ensureOrganization(user.id, user.email ?? "usuario");
    if (orgId) {
      // Re-fetch with newly created org
      const { data: freshMembership } = await supabase
        .from("organization_members")
        .select("organization_id, role, organizations(id, name, plan)")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      membership = freshMembership;
    }
  }

  if (!membership) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold">Sin organización</h2>
          <p className="text-muted-foreground text-sm max-w-sm">
            No pudimos crear tu espacio de trabajo automáticamente.<br />
            Contacta a soporte en{" "}
            <a href="mailto:hola@conectachat.com" className="text-primary underline">
              hola@conectachat.com
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
