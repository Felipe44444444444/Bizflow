"use client";
import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { api } from "@/lib/api";
import { Bell, X, CheckCheck, AlertTriangle, Users, Zap, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  metadata?: any;
}

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  handoff:          { icon: AlertTriangle, color: "text-red-400",    bg: "bg-red-400/10" },
  new_lead:         { icon: Users,         color: "text-green-400",  bg: "bg-green-400/10" },
  retargeting_sent: { icon: Zap,           color: "text-neon-cyan",  bg: "bg-neon-cyan/10" },
  error:            { icon: AlertCircle,   color: "text-yellow-400", bg: "bg-yellow-400/10" },
};

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NotificationBell({ orgId }: { orgId: string }) {
  const supabase = useRef(createClient()).current;
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [orgIdState, setOrgIdState] = useState(orgId);
  const ref = useRef<HTMLDivElement>(null);

  const unread = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!orgId) return;
    setOrgIdState(orgId);

    // Load initial notifications
    api.get("/api/handoff/notifications", orgId).then((data: any) => {
      if (Array.isArray(data)) setNotifications(data);
    }).catch(() => {});

    // Subscribe to realtime
    const channel = supabase
      .channel(`notifications-${orgId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `organization_id=eq.${orgId}`,
      }, (payload) => {
        const n = payload.new as Notification;
        setNotifications(prev => [n, ...prev.slice(0, 29)]);
        // For handoff, show urgent visual cue
        if (n.type === "handoff") {
          document.title = "⚠️ Atención requerida — Conectachat";
          setTimeout(() => { document.title = "Conectachat"; }, 10000);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [orgId]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function markRead(id: string) {
    await api.patch(`/api/handoff/notifications/${id}/read`, {}, orgIdState).catch(() => {});
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    await api.patch("/api/handoff/notifications/read-all", {}, orgIdState).catch(() => {});
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  function handleView(n: Notification) {
    markRead(n.id);
    setOpen(false);
    if (n.type === "handoff") router.push("/handoff");
    else if (n.type === "new_lead") router.push("/leads");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-lg transition-all",
          open ? "bg-neon-cyan/10 text-neon-cyan" : "text-[#4A5568] hover:bg-white/[0.04] hover:text-white",
          unread > 0 && "animate-pulse-glow"
        )}
      >
        <Bell className={cn("h-4 w-4", unread > 0 && "text-neon-cyan")} />
        {unread > 0 && (
          <span className={cn(
            "absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white",
            notifications.some(n => !n.read && n.type === "handoff")
              ? "bg-red-500 animate-pulse"
              : "bg-neon-cyan"
          )}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-80 rounded-xl border border-neon-cyan/[0.12] bg-space-card shadow-2xl shadow-black/40 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neon-cyan/[0.08]">
            <span className="text-sm font-semibold text-white">Notificaciones</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAllRead} className="text-[10px] text-[#4A5568] hover:text-neon-cyan transition-colors flex items-center gap-1">
                  <CheckCheck className="h-3 w-3" /> Todas leídas
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-[#4A5568] hover:text-white transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="h-8 w-8 text-[#4A5568] mx-auto mb-2" />
                <p className="text-xs text-[#4A5568]">Sin notificaciones</p>
              </div>
            ) : (
              notifications.map(n => {
                const tc = TYPE_CONFIG[n.type] || TYPE_CONFIG.error;
                const Icon = tc.icon;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "flex gap-3 px-4 py-3 border-b border-neon-cyan/[0.04] hover:bg-white/[0.02] transition-colors",
                      !n.read && "bg-neon-cyan/[0.02]"
                    )}
                  >
                    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5", tc.bg)}>
                      <Icon className={cn("h-4 w-4", tc.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("text-xs font-medium leading-tight", !n.read ? "text-white" : "text-[#A0AEC0]")}>
                          {n.title}
                        </p>
                        <span className="text-[9px] text-[#4A5568] shrink-0 mt-0.5">{timeAgo(n.created_at)}</span>
                      </div>
                      <p className="text-[10px] text-[#4A5568] mt-0.5 line-clamp-2">{n.body}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <button onClick={() => handleView(n)} className={cn("text-[10px] font-medium hover:underline transition-colors", tc.color)}>
                          Ver →
                        </button>
                        {!n.read && (
                          <button onClick={() => markRead(n.id)} className="text-[9px] text-[#4A5568] hover:text-white transition-colors">
                            Marcar leída
                          </button>
                        )}
                      </div>
                    </div>
                    {!n.read && <span className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", n.type === "handoff" ? "bg-red-400" : "bg-neon-cyan")} />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
