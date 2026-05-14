"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Bot, MessageSquare, Users, Key, Settings,
  Zap, LogOut, ChevronRight, Activity, PhoneCall,
  Briefcase, UserCheck, Megaphone, Palette, BarChart3, TrendingUp, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

const NAV_MAIN = [
  { href: "/dashboard",      label: "Dashboard",       icon: LayoutDashboard },
  { href: "/agents",         label: "Agentes",         icon: Bot             },
  { href: "/conversations",  label: "Conversaciones",  icon: MessageSquare   },
  { href: "/leads",          label: "Leads",           icon: Users           },
  { href: "/handoff",        label: "Atención",        icon: PhoneCall       },
];
const NAV_CONFIG = [
  { href: "/api-keys",  label: "API Keys",       icon: Key      },
  { href: "/settings",  label: "Configuración",  icon: Settings },
];

const NAV_AGENCY = [
  { href: "/agency/dashboard",  label: "Dashboard",   icon: BarChart3     },
  { href: "/agency/clients",    label: "Clientes",    icon: Briefcase     },
  { href: "/agency/docs",       label: "Documentos",  icon: FileText      },
  { href: "/agency/onboarding", label: "Onboarding",  icon: UserCheck     },
  { href: "/agency/ads",        label: "Anuncios",    icon: Megaphone     },
  { href: "/agency/design",     label: "Diseño",      icon: Palette       },
  { href: "/agency/strategy",   label: "Estrategia",  icon: TrendingUp    },
];

const PLAN_COLORS: Record<string, string> = {
  starter:    "text-neon-cyan border-neon-cyan/30 bg-neon-cyan/5",
  pro:        "text-neon-purple border-neon-purple/30 bg-neon-purple/5",
  enterprise: "text-neon-yellow border-neon-yellow/30 bg-neon-yellow/5",
};

function NavItem({
  href,
  label,
  icon: Icon,
  badge,
}: {
  href: string;
  label: string;
  icon: any;
  badge?: number;
}) {
  const pathname = usePathname();
  const active = href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 group",
        active
          ? "bg-neon-cyan/10 text-neon-cyan nav-active-bar"
          : "text-[#A0AEC0] hover:bg-white/[0.04] hover:text-white"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-neon-cyan" : "text-[#4A5568] group-hover:text-[#A0AEC0]"
        )}
      />
      <span>{label}</span>
      {badge != null && badge > 0 ? (
        <span
          className={cn(
            "ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
            href === "/handoff"
              ? "bg-neon-red/20 text-neon-red border border-neon-red/30"
              : "bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/25"
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : (
        active && (
          <ChevronRight className="ml-auto h-3 w-3 text-neon-cyan/50" />
        )
      )}
    </Link>
  );
}

function AgencyNavItem({ href, label, icon: Icon }: { href: string; label: string; icon: any }) {
  const pathname = usePathname();
  const active = pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 group",
        active
          ? "text-[#00FF88] bg-[#00FF88]/10"
          : "text-[#A0AEC0] hover:bg-white/[0.04] hover:text-white"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-[#00FF88]" : "text-[#4A5568] group-hover:text-[#A0AEC0]"
        )}
      />
      <span>{label}</span>
      {active && <ChevronRight className="ml-auto h-3 w-3 text-[#00FF88]/50" />}
    </Link>
  );
}

export function Sidebar() {
  const router   = useRouter();
  const supabase = createClient();
  const [user,   setUser]   = useState<any>(null);
  const [org,    setOrg]    = useState<any>(null);
  const [orgId,  setOrgId]  = useState<string>("");
  const [badges, setBadges] = useState<Record<string, number>>({});

  const refreshBadges = useCallback(async (currentOrgId: string) => {
    const [
      { count: openConvs },
      { count: newLeads },
      { count: handoffs },
    ] = await Promise.all([
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrgId)
        .eq("status", "open"),
      supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrgId)
        .eq("status", "nuevo"),
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrgId)
        .eq("status", "handed_off"),
    ]);

    setBadges({
      "/conversations": openConvs || 0,
      "/leads":         newLeads  || 0,
      "/handoff":       handoffs  || 0,
    });
  }, [supabase]);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setUser(session.user);
      const { data: m } = await supabase
        .from("organization_members")
        .select("organization_id, role, organizations(name, plan)")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();
      if (!m) return;
      if (m) setOrg(Array.isArray(m.organizations) ? m.organizations[0] : m.organizations);
      const oid = m.organization_id;
      setOrgId(oid);
      await refreshBadges(oid);

      // Real-time subscription to keep badges updated
      const sub = supabase
        .channel("sidebar_counts")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "conversations", filter: `organization_id=eq.${oid}` },
          () => refreshBadges(oid)
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "leads", filter: `organization_id=eq.${oid}` },
          () => refreshBadges(oid)
        )
        .subscribe();

      return () => { supabase.removeChannel(sub); };
    }
    load();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const plan      = org?.plan ?? "starter";
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  const planClass = PLAN_COLORS[plan] ?? PLAN_COLORS.starter;
  const initials  = (user?.email ?? "U").slice(0, 2).toUpperCase();
  const avatarHue = (initials.charCodeAt(0) * 7 + initials.charCodeAt(1) * 13) % 360;

  return (
    <aside className="flex h-screen w-64 flex-col bg-space-card border-r border-neon-cyan/[0.08] relative overflow-hidden shrink-0">
      {/* Ambient top gradient */}
      <div className="pointer-events-none absolute top-0 left-0 w-full h-40 bg-gradient-to-b from-neon-cyan/[0.04] to-transparent" />

      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6 border-b border-neon-cyan/[0.08] shrink-0">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-neon-cyan/10 border border-neon-cyan/20">
          <Zap className="h-4 w-4 text-neon-cyan" />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-neon-cyan animate-pulse-glow" />
        </div>
        <span className="font-display font-bold text-lg tracking-tight text-white">
          Conectachat
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Main */}
        <div>
          <p className="text-[10px] font-semibold text-neon-cyan/40 uppercase tracking-[0.15em] px-3 mb-2">
            Principal
          </p>
          <div className="space-y-0.5">
            {NAV_MAIN.map((item) => (
              <NavItem key={item.href} {...item} badge={badges[item.href]} />
            ))}
          </div>
        </div>

        {/* Config */}
        <div>
          <p className="text-[10px] font-semibold text-neon-cyan/40 uppercase tracking-[0.15em] px-3 mb-2">
            Configuración
          </p>
          <div className="space-y-0.5">
            {NAV_CONFIG.map((item) => (
              <NavItem key={item.href} {...item} />
            ))}
          </div>
        </div>

        {/* XENTTECH Agency */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] px-3 mb-2" style={{ color: '#00FF88' }}>
            XENTTECH
          </p>
          <div className="space-y-0.5">
            {NAV_AGENCY.map((item) => (
              <AgencyNavItem key={item.href} {...item} />
            ))}
          </div>
        </div>
      </nav>

      {/* Status bar */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-neon-green/5 border border-neon-green/10">
          <Activity className="h-3.5 w-3.5 text-neon-green shrink-0" />
          <span className="text-[11px] text-neon-green font-medium">Sistema operativo</span>
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-neon-green animate-pulse" />
        </div>
      </div>

      {/* User footer */}
      <div className="p-4 border-t border-neon-cyan/[0.08] shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{
              background: `linear-gradient(135deg, hsl(${avatarHue},80%,50%), hsl(${(avatarHue + 60) % 360},80%,40%))`,
              boxShadow: `0 0 12px hsla(${avatarHue},80%,50%,0.4)`,
            }}
          >
            {initials}
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-neon-green border-2 border-space-card" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">
              {user?.email?.split("@")[0] ?? "Usuario"}
            </p>
            <p className="text-[10px] text-[#4A5568] truncate">{user?.email ?? ""}</p>
          </div>
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0", planClass)}>
            {planLabel}
          </span>
        </div>

        <button
          onClick={signOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-[#4A5568] hover:bg-neon-red/5 hover:text-neon-red transition-all duration-200 group"
        >
          <LogOut className="h-3.5 w-3.5 shrink-0 transition-colors group-hover:text-neon-red" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
