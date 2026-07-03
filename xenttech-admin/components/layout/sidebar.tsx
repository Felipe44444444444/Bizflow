"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Bot, FileText, CheckSquare,
  Megaphone, Palette, BookOpen, TrendingUp, Video, LogOut, Table2, MessageSquare,
} from "lucide-react";

const NAV = [
  {
    label: "OPERACIONES",
    items: [
      { href: "/agency/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/agency/crm",      label: "CRM",       icon: Table2 },
      { href: "/agency/clients",  label: "Clientes",  icon: Users },
      { href: "/agency/agents",   label: "Agentes",   icon: Bot },
    ],
  },
  {
    label: "MARKETING",
    items: [
      { href: "/agency/docs",           label: "Documentos",   icon: FileText },
      { href: "/agency/onboarding",     label: "Onboarding",   icon: CheckSquare },
      { href: "/agency/ads",            label: "Anuncios",     icon: Megaphone },
      { href: "/agency/design",         label: "Diseño",       icon: Palette },
      { href: "/agency/comentarista",   label: "Comentarista", icon: MessageSquare },
    ],
  },
  {
    label: "CONTENIDO",
    items: [
      { href: "/agency/brand-manual", label: "Manual de Marca", icon: BookOpen },
      { href: "/agency/strategy",     label: "Estrategia",      icon: TrendingUp },
      { href: "/agency/clips",        label: "Clips",           icon: Video },
    ],
  },
];

export function Sidebar() {
  const path = usePathname();

  return (
    <nav className="flex flex-col w-60 shrink-0 h-screen bg-[#02020A] border-r border-[#1A1A35] overflow-hidden">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-[#1A1A35]">
        <div
          className="font-display text-xl leading-none"
          style={{ background: "linear-gradient(135deg, #00D4AA, #7C3AED)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
        >
          XENTTECH
        </div>
        <p className="text-[10px] font-semibold tracking-[0.14em] text-[#334155] uppercase mt-1.5">
          Panel de Control
        </p>
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto py-3">
        {NAV.map(group => (
          <div key={group.label} className="mb-1">
            <p className="px-5 pt-3 pb-1.5 text-[10px] font-semibold tracking-[0.13em] text-[#334155] uppercase">
              {group.label}
            </p>
            {group.items.map(item => {
              const active = path === item.href || path.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 mx-2 h-11 rounded-lg text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-[#00D4AA]/[0.09] text-[#00D4AA] border-l-[3px] border-[#00D4AA] px-[calc(0.75rem-3px)]"
                      : "text-[#64748B] hover:bg-[#0D0D1F] hover:text-[#F1F5F9] px-3"
                  )}
                >
                  <item.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "stroke-[2]" : "stroke-[1.5]")} />
                  <span className="flex-1">{item.label}</span>
                  {item.href === '/agency/comentarista' && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-500 border border-yellow-500/20">
                      🧪 Beta
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bottom user strip */}
      <div className="p-3 border-t border-[#1A1A35]">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-[#0D0D1F] transition-colors group">
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-black shrink-0"
            style={{ background: "linear-gradient(135deg, #00D4AA, #7C3AED)" }}
          >
            X
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#F1F5F9] truncate">XENTTECH</p>
            <p className="text-[10px] text-[#334155] truncate">Admin</p>
          </div>
          <button className="h-7 w-7 flex items-center justify-center rounded-md text-[#334155] hover:text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors opacity-0 group-hover:opacity-100">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </nav>
  );
}
