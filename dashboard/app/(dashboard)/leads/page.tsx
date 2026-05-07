"use client";
import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { api, getAuthHeaders } from "@/lib/api";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, Users, Search, Download, Mail, Phone, X,
  TrendingUp, TrendingDown, Megaphone, Globe,
  MessageSquare, ChevronRight, LayoutGrid, List, ArrowRight,
} from "lucide-react";
import { formatDate, formatRelative } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  canal: string | null;
  canal_username: string | null;
  canal_user_id: string | null;
  primer_mensaje: string | null;
  ad_name: string | null;
  ad_source: string | null;
  campaign_name: string | null;
  status: string;
  created_at: string;
  first_seen_at: string | null;
  last_seen_at?: string | null;
  notes: string | null;
  agents?: { name: string } | null;
}

interface Metrics {
  total_this_month: number;
  variation_pct: number | null;
  by_canal: Record<string, number>;
  total_ads: number;
  total_organic: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "nuevo",      label: "Nuevo",      color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { value: "contactado", label: "Contactado", color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
  { value: "interesado", label: "Interesado", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  { value: "propuesta",  label: "Propuesta",  color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  { value: "cliente",    label: "Cliente",    color: "bg-green-500/10 text-green-400 border-green-500/20" },
  { value: "descartado", label: "Descartado", color: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
];

const KANBAN_COLUMNS = [
  { status: "nuevo",      label: "NUEVO",      emoji: "🆕" },
  { status: "contactado", label: "CONTACTADO",  emoji: "📞" },
  { status: "interesado", label: "INTERESADO",  emoji: "⭐" },
  { status: "propuesta",  label: "PROPUESTA",   emoji: "🤝" },
  { status: "cliente",    label: "CLIENTE",     emoji: "✅" },
];

const KANBAN_NEXT: Record<string, string> = {
  nuevo:      "contactado",
  contactado: "interesado",
  interesado: "propuesta",
  propuesta:  "cliente",
};

const CANAL_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  whatsapp:  { icon: "💬", label: "WhatsApp",  color: "text-green-400" },
  facebook:  { icon: "👤", label: "Facebook",  color: "text-blue-400" },
  instagram: { icon: "📸", label: "Instagram", color: "text-pink-400" },
  slack:     { icon: "💼", label: "Slack",     color: "text-purple-400" },
  widget:    { icon: "🌐", label: "Widget",    color: "text-cyan-400" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function hashColor(str: string): number {
  let hash = 0;
  for (const c of str) hash = (hash * 31 + c.charCodeAt(0)) & 0xfffff;
  return hash % 360;
}

function statusBadgeClass(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color
    ?? "bg-gray-500/10 text-gray-400 border-gray-500/20";
}

function statusLabel(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.label ?? status;
}

function isStale(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const diff = Date.now() - new Date(dateStr).getTime();
  return diff > 3 * 24 * 60 * 60 * 1000; // 3 days
}

// ── Kanban Card ────────────────────────────────────────────────────────────────

function KanbanCard({
  lead,
  onSelect,
  onMoveNext,
}: {
  lead: Lead;
  onSelect: (lead: Lead) => void;
  onMoveNext: (leadId: string, nextStatus: string) => void;
}) {
  const canalCfg = CANAL_CONFIG[lead.canal || ""] || { icon: "📡", label: lead.canal || "?" };
  const nextStatus = KANBAN_NEXT[lead.status];
  const nextLabel = nextStatus ? STATUS_OPTIONS.find(s => s.value === nextStatus)?.label : null;
  const avatarLetter = (lead.name || lead.canal_username || "?")[0].toUpperCase();
  const hue = hashColor(lead.name || lead.canal_username || "?");
  const stale = isStale(lead.last_seen_at || lead.first_seen_at);

  return (
    <div
      className="bg-space-card border border-neon-cyan/[0.08] rounded-xl p-3.5 mb-2 cursor-pointer hover:border-neon-cyan/20 transition-all group"
      onClick={() => onSelect(lead)}
    >
      {/* Row 1: Avatar + Name */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 relative"
          style={{ background: `hsl(${hue}, 70%, 35%)` }}
        >
          {avatarLetter}
          {stale && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-neon-red border border-space-card" title="Sin actividad +3 días" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {lead.name || ("@" + (lead.canal_username || "?"))}
          </p>
          <p className="text-[10px] text-[#4A5568]">
            {canalCfg.icon} {canalCfg.label} · {formatRelative(lead.first_seen_at || lead.created_at)}
          </p>
        </div>
      </div>

      {/* Row 2: First message preview */}
      {lead.primer_mensaje && (
        <p className="text-xs text-[#4A5568] line-clamp-2 mb-2">{lead.primer_mensaje}</p>
      )}

      {/* Row 3: Campaign badge */}
      {lead.campaign_name && (
        <span className="text-[10px] bg-neon-purple/10 border border-neon-purple/20 text-neon-purple px-2 py-0.5 rounded-full inline-block mb-2">
          📢 {lead.campaign_name.slice(0, 20)}
        </span>
      )}

      {/* Row 4: Move to next stage */}
      {nextLabel && (
        <div className="mt-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            className="flex items-center gap-1 text-[10px] text-neon-cyan bg-neon-cyan/10 border border-neon-cyan/20 rounded-full px-2 py-0.5 hover:bg-neon-cyan/20 transition-colors"
            onClick={e => { e.stopPropagation(); onMoveNext(lead.id, nextStatus!); }}
          >
            <ArrowRight className="h-2.5 w-2.5" />
            → {nextLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const supabase = createClient();
  const [orgId,    setOrgId]    = useState("");
  const [leads,    setLeads]    = useState<Lead[]>([]);
  const [metrics,  setMetrics]  = useState<Metrics | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [notes,    setNotes]    = useState("");
  const [exporting, setExporting] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");

  // Filters
  const [search,   setSearch]   = useState("");
  const [canal,    setCanal]    = useState("all");
  const [status,   setStatus]   = useState("all");
  const [period,   setPeriod]   = useState("30d");

  const loadData = useCallback(async (currentOrgId: string) => {
    const [leadsRes, metricsRes] = await Promise.all([
      api.get(`/api/leads?canal=${canal}&status=${status}&period=${period}&search=${encodeURIComponent(search)}`, currentOrgId).catch(() => ({ leads: [] })),
      api.get("/api/leads/metrics", currentOrgId).catch(() => null),
    ]);
    setLeads(leadsRes?.leads || leadsRes || []);
    setMetrics(metricsRes);
  }, [canal, status, period, search]);

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: m } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", session.user.id)
        .limit(1).single();
      if (!m) return;
      setOrgId(m.organization_id);
      await loadData(m.organization_id);
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => {
    if (orgId) loadData(orgId);
  }, [canal, status, period, search, orgId, loadData]);

  async function loadMessages(lead: Lead) {
    setSelected(lead);
    setNotes(lead.notes || "");
    const msgs = await api.get(`/api/leads/${lead.id}/messages`, orgId).catch(() => []);
    setMessages(msgs || []);
  }

  async function updateStatus(leadId: string, newStatus: string) {
    await api.patch(`/api/leads/${leadId}`, { status: newStatus }, orgId).catch(() => {});
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
    if (selected?.id === leadId) setSelected(prev => prev ? { ...prev, status: newStatus } : prev);
  }

  async function saveNotes() {
    if (!selected) return;
    setSaving(true);
    await api.patch(`/api/leads/${selected.id}`, { notes }, orgId).catch(() => {});
    setLeads(prev => prev.map(l => l.id === selected.id ? { ...l, notes } : l));
    setSelected(prev => prev ? { ...prev, notes } : prev);
    setSaving(false);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ canal, status, period, search });
      const BACKEND = process.env.NEXT_PUBLIC_API_URL || "https://api.conectaachat.com";
      const response = await fetch(
        `${BACKEND}/api/leads/export.csv?${params}`,
        { headers: await getAuthHeaders(orgId) }
      );
      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `leads_${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  // ── Kanban data ──────────────────────────────────────────────────────────────
  // Filter out 'descartado' for kanban; group by status
  const kanbanLeads = leads.filter(l => l.status !== "descartado");
  const byStatus: Record<string, Lead[]> = {};
  for (const col of KANBAN_COLUMNS) byStatus[col.status] = [];
  for (const lead of kanbanLeads) {
    if (byStatus[lead.status]) byStatus[lead.status].push(lead);
  }

  // ── Total counts for metric cards ───────────────────────────────────────────
  const totalLeads    = leads.length;
  const weekAgo       = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const thisWeek      = leads.filter(l => new Date(l.created_at).getTime() > weekAgo).length;
  const inProcess     = leads.filter(l => ["contactado", "interesado", "propuesta"].includes(l.status)).length;
  const converted     = leads.filter(l => l.status === "cliente").length;

  return (
    <div className="flex flex-col h-full">
      <Header title="Leads" description="Contactos capturados automáticamente por tus agentes" />

      <div className="flex-1 p-6 space-y-6 overflow-auto">

        {/* ── Metric Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card p-4">
            <p className="text-xs text-[#4A5568] mb-1">Total leads</p>
            <div className="flex items-end gap-2">
              <p className="font-display text-2xl font-bold text-white">{totalLeads}</p>
              {metrics?.variation_pct !== null && metrics?.variation_pct !== undefined && (
                <span className={`text-xs mb-0.5 flex items-center gap-0.5 ${(metrics.variation_pct ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {(metrics.variation_pct ?? 0) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(metrics.variation_pct ?? 0)}%
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card p-4">
            <p className="text-xs text-[#4A5568] mb-1">Esta semana</p>
            <p className="font-display text-2xl font-bold text-neon-cyan">{thisWeek}</p>
          </div>

          <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card p-4">
            <p className="text-xs text-[#4A5568] mb-1">En proceso</p>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-neon-purple" />
              <p className="font-display text-2xl font-bold text-neon-purple">{inProcess}</p>
            </div>
          </div>

          <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card p-4">
            <p className="text-xs text-[#4A5568] mb-1">Convertidos</p>
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-neon-green" />
              <p className="font-display text-2xl font-bold text-neon-green">{converted}</p>
            </div>
          </div>
        </div>

        {/* ── Filters + View Toggle ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#4A5568]" />
            <Input
              placeholder="Buscar nombre, email, teléfono..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 bg-space-el border-neon-cyan/15 text-white text-sm placeholder-[#4A5568] focus:border-neon-cyan/40"
            />
          </div>

          <Select value={canal} onValueChange={setCanal}>
            <SelectTrigger className="h-9 w-36 bg-space-el border-neon-cyan/15 text-sm text-[#A0AEC0]">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los canales</SelectItem>
              {Object.entries(CANAL_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-36 bg-space-el border-neon-cyan/15 text-sm text-[#A0AEC0]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-9 w-32 bg-space-el border-neon-cyan/15 text-sm text-[#A0AEC0]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="7d">7 días</SelectItem>
              <SelectItem value="30d">30 días</SelectItem>
              <SelectItem value="all">Todo</SelectItem>
            </SelectContent>
          </Select>

          {/* View toggle */}
          <div className="flex items-center gap-1 bg-space-el border border-neon-cyan/15 rounded-lg p-1">
            <button
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "list" ? "bg-neon-cyan/15 text-neon-cyan" : "text-[#4A5568] hover:text-[#A0AEC0]"}`}
              onClick={() => setViewMode("list")}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </button>
            <button
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "kanban" ? "bg-neon-cyan/15 text-neon-cyan" : "text-[#4A5568] hover:text-[#A0AEC0]"}`}
              onClick={() => setViewMode("kanban")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Kanban
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-9 border-neon-cyan/15 text-[#A0AEC0] hover:border-neon-cyan/30 hover:text-white gap-1.5"
            onClick={exportCsv}
            disabled={exporting}
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Exportar CSV
          </Button>
        </div>

        {/* ── Loading state ── */}
        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-[#4A5568]" />
          </div>
        )}

        {!loading && (
          <>
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* KANBAN VIEW                                                    */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {viewMode === "kanban" && (
              <div className="flex gap-4 overflow-x-auto pb-4">
                {KANBAN_COLUMNS.map(col => {
                  const colLeads = byStatus[col.status] || [];
                  return (
                    <div key={col.status} className="flex flex-col min-h-0 w-[220px] shrink-0">
                      <div className="flex items-center justify-between mb-3 px-1">
                        <span className="text-xs font-bold text-[#A0AEC0] uppercase tracking-wider">
                          {col.emoji} {col.label}
                        </span>
                        <span className="text-xs bg-space-el px-2 py-0.5 rounded-full text-[#4A5568]">
                          {colLeads.length}
                        </span>
                      </div>
                      <div className="flex-1 min-h-[200px] bg-space-el/30 rounded-xl border border-neon-cyan/[0.05] p-2">
                        {colLeads.length === 0 ? (
                          <div className="flex items-center justify-center h-20">
                            <p className="text-[10px] text-[#4A5568]">Sin leads</p>
                          </div>
                        ) : (
                          colLeads.map(lead => (
                            <KanbanCard
                              key={lead.id}
                              lead={lead}
                              onSelect={loadMessages}
                              onMoveNext={updateStatus}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* LIST VIEW                                                      */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {viewMode === "list" && (
              <div className="flex gap-4">
                {/* Table */}
                <div className="flex-1 rounded-xl border border-neon-cyan/[0.08] overflow-hidden">
                  {leads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-3">
                      <Users className="h-10 w-10 text-[#4A5568]/40" />
                      <p className="text-sm text-[#4A5568]">No hay leads con estos filtros</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-space-el/50 border-b border-neon-cyan/[0.06]">
                        <tr>
                          {["Canal", "Nombre / Username", "Contacto", "Primer mensaje", "Fuente", "Status", "Fecha"].map(h => (
                            <th key={h} className="text-left text-[11px] font-medium text-[#4A5568] px-4 py-3 uppercase tracking-wide">{h}</th>
                          ))}
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neon-cyan/[0.04]">
                        {leads.map(lead => {
                          const stale = isStale(lead.last_seen_at || lead.first_seen_at);
                          return (
                            <tr
                              key={lead.id}
                              className={`hover:bg-space-el/50 cursor-pointer transition-colors ${selected?.id === lead.id ? "bg-neon-cyan/[0.05]" : ""}`}
                              onClick={() => loadMessages(lead)}
                            >
                              {/* Canal */}
                              <td className="px-4 py-3">
                                <span className="text-lg" title={CANAL_CONFIG[lead.canal || ""]?.label}>
                                  {CANAL_CONFIG[lead.canal || ""]?.icon || "📡"}
                                </span>
                              </td>

                              {/* Nombre */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {stale && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-neon-red shrink-0" title="Sin actividad +3 días" />
                                  )}
                                  <div>
                                    <p className="font-medium text-white text-sm">{lead.name || lead.canal_username || "—"}</p>
                                    {lead.canal_username && lead.name && (
                                      <p className="text-xs text-[#4A5568]">{lead.canal_username}</p>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* Contacto */}
                              <td className="px-4 py-3">
                                <div className="space-y-0.5">
                                  {lead.email && (
                                    <p className="flex items-center gap-1 text-xs text-[#4A5568]">
                                      <Mail className="h-3 w-3" />{lead.email}
                                    </p>
                                  )}
                                  {lead.phone && (
                                    <p className="flex items-center gap-1 text-xs text-[#4A5568]">
                                      <Phone className="h-3 w-3" />{lead.phone}
                                    </p>
                                  )}
                                  {!lead.email && !lead.phone && <span className="text-xs text-[#4A5568]">—</span>}
                                </div>
                              </td>

                              {/* Primer mensaje */}
                              <td className="px-4 py-3 max-w-[180px]">
                                <p className="text-xs text-[#A0AEC0] truncate">{lead.primer_mensaje || "—"}</p>
                              </td>

                              {/* Fuente */}
                              <td className="px-4 py-3">
                                {lead.ad_name ? (
                                  <div>
                                    <p className="text-xs text-neon-cyan font-medium truncate max-w-[120px]">{lead.ad_name}</p>
                                    {lead.campaign_name && <p className="text-[10px] text-[#4A5568] truncate max-w-[120px]">{lead.campaign_name}</p>}
                                  </div>
                                ) : (
                                  <span className="text-xs text-[#4A5568]">Orgánico</span>
                                )}
                              </td>

                              {/* Status */}
                              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                <Select value={lead.status} onValueChange={v => updateStatus(lead.id, v)}>
                                  <SelectTrigger className="h-7 text-xs w-[130px] border-0 bg-transparent p-0 focus:ring-0">
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium border ${statusBadgeClass(lead.status)}`}>
                                      {statusLabel(lead.status)}
                                    </span>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {STATUS_OPTIONS.map(s => (
                                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>

                              {/* Fecha */}
                              <td className="px-4 py-3 text-xs text-[#4A5568] whitespace-nowrap">
                                {formatDate(lead.created_at)}
                              </td>

                              <td className="px-3 py-3 text-[#4A5568]">
                                <ChevronRight className="h-4 w-4" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* ── Side Panel ── */}
                {selected && (
                  <div className="w-80 shrink-0 rounded-xl border border-neon-cyan/[0.08] bg-space-card overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-neon-cyan/[0.06]">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                          style={{ background: `hsl(${hashColor(selected.name || selected.canal_username || "?")}, 70%, 35%)` }}
                        >
                          {(selected.name || selected.canal_username || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-white text-sm">
                            {selected.name || selected.canal_username || "Lead desconocido"}
                          </p>
                          <p className="text-xs text-[#4A5568]">
                            {CANAL_CONFIG[selected.canal || ""]?.icon} {CANAL_CONFIG[selected.canal || ""]?.label}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => setSelected(null)} className="text-[#4A5568] hover:text-white p-1 rounded-lg hover:bg-space-el transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {/* Status */}
                      <div>
                        <p className="text-[10px] text-[#4A5568] uppercase tracking-wide mb-1.5">Estado</p>
                        <Select value={selected.status} onValueChange={v => updateStatus(selected.id, v)}>
                          <SelectTrigger className="h-8 text-xs bg-space-el border-neon-cyan/15">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map(s => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Quick move buttons */}
                      {KANBAN_NEXT[selected.status] && (
                        <Button
                          size="sm"
                          className="w-full bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/20 text-xs font-semibold gap-1.5"
                          onClick={() => updateStatus(selected.id, KANBAN_NEXT[selected.status]!)}
                        >
                          <ArrowRight className="h-3 w-3" />
                          Mover a {statusLabel(KANBAN_NEXT[selected.status]!)}
                        </Button>
                      )}

                      {/* Contact data */}
                      <div className="space-y-1.5">
                        <p className="text-[10px] text-[#4A5568] uppercase tracking-wide">Contacto</p>
                        {selected.email && (
                          <p className="flex items-center gap-1.5 text-xs text-[#A0AEC0]">
                            <Mail className="h-3 w-3 shrink-0" />{selected.email}
                          </p>
                        )}
                        {selected.phone && (
                          <p className="flex items-center gap-1.5 text-xs text-[#A0AEC0]">
                            <Phone className="h-3 w-3 shrink-0" />{selected.phone}
                          </p>
                        )}
                        {!selected.email && !selected.phone && <p className="text-xs text-[#4A5568]">Sin datos de contacto</p>}
                      </div>

                      {/* Ad data */}
                      {(selected.ad_name || selected.campaign_name) && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-[#4A5568] uppercase tracking-wide">Anuncio</p>
                          {selected.ad_name && <p className="text-xs text-neon-cyan">{selected.ad_name}</p>}
                          {selected.campaign_name && (
                            <span className="text-[10px] bg-neon-purple/10 border border-neon-purple/20 text-neon-purple px-2 py-0.5 rounded-full inline-block">
                              📢 {selected.campaign_name}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Primer mensaje */}
                      {selected.primer_mensaje && (
                        <div>
                          <p className="text-[10px] text-[#4A5568] uppercase tracking-wide mb-1.5">Primer mensaje</p>
                          <p className="text-xs text-[#A0AEC0] bg-space-el rounded-lg p-2.5 border border-neon-cyan/[0.06]">
                            {selected.primer_mensaje}
                          </p>
                        </div>
                      )}

                      <Separator className="bg-neon-cyan/[0.06]" />

                      {/* Messages */}
                      <div>
                        <p className="text-[10px] text-[#4A5568] uppercase tracking-wide mb-2 flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />Historial ({messages.length})
                        </p>
                        {messages.length === 0 ? (
                          <p className="text-xs text-[#4A5568]">Sin mensajes registrados</p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {messages.map(msg => (
                              <div
                                key={msg.id}
                                className={`text-xs rounded-lg p-2 ${msg.direction === "inbound" ? "bg-space-el text-[#A0AEC0]" : "bg-neon-cyan/10 text-neon-cyan"}`}
                              >
                                <p className="mb-0.5">{msg.content}</p>
                                {msg.created_at && (
                                  <p className="text-[9px] opacity-50 text-right">{formatRelative(msg.created_at)}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <Separator className="bg-neon-cyan/[0.06]" />

                      {/* Notes */}
                      <div>
                        <p className="text-[10px] text-[#4A5568] uppercase tracking-wide mb-1.5">Notas internas</p>
                        <Textarea
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          placeholder="Agrega notas sobre este lead..."
                          className="bg-space-el border-neon-cyan/15 text-white text-xs placeholder-[#4A5568] h-20 resize-none focus:border-neon-cyan/40"
                        />
                        <Button
                          size="sm"
                          className="w-full mt-2 bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 text-xs font-semibold"
                          onClick={saveNotes}
                          disabled={saving}
                        >
                          {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                          Guardar notas
                        </Button>
                      </div>

                      {/* Action buttons */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {selected.phone && (
                          <a
                            href={`https://wa.me/${selected.phone.replace(/\D/g, "")}`}
                            target="_blank" rel="noopener noreferrer"
                          >
                            <Button size="sm" className="w-full bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 text-xs font-semibold">
                              💬 WhatsApp
                            </Button>
                          </a>
                        )}
                        {selected.email && (
                          <a href={`mailto:${selected.email}`}>
                            <Button size="sm" className="w-full bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 text-xs font-semibold">
                              <Mail className="h-3 w-3 mr-1" /> Email
                            </Button>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Kanban side panel (shown separately when kanban view is active) */}
            {viewMode === "kanban" && selected && (
              <div className="fixed inset-y-0 right-0 z-40 w-80 bg-space-card border-l border-neon-cyan/[0.08] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-neon-cyan/[0.06]">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ background: `hsl(${hashColor(selected.name || selected.canal_username || "?")}, 70%, 35%)` }}
                    >
                      {(selected.name || selected.canal_username || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm">
                        {selected.name || selected.canal_username || "Lead desconocido"}
                      </p>
                      <p className="text-xs text-[#4A5568]">
                        {CANAL_CONFIG[selected.canal || ""]?.icon} {CANAL_CONFIG[selected.canal || ""]?.label}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-[#4A5568] hover:text-white p-1 rounded-lg hover:bg-space-el transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Status */}
                  <div>
                    <p className="text-[10px] text-[#4A5568] uppercase tracking-wide mb-1.5">Estado</p>
                    <Select value={selected.status} onValueChange={v => updateStatus(selected.id, v)}>
                      <SelectTrigger className="h-8 text-xs bg-space-el border-neon-cyan/15">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {KANBAN_NEXT[selected.status] && (
                    <Button
                      size="sm"
                      className="w-full bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/20 text-xs font-semibold gap-1.5"
                      onClick={() => updateStatus(selected.id, KANBAN_NEXT[selected.status]!)}
                    >
                      <ArrowRight className="h-3 w-3" />
                      Mover a {statusLabel(KANBAN_NEXT[selected.status]!)}
                    </Button>
                  )}

                  {/* Contact data */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-[#4A5568] uppercase tracking-wide">Contacto</p>
                    {selected.email && (
                      <p className="flex items-center gap-1.5 text-xs text-[#A0AEC0]">
                        <Mail className="h-3 w-3 shrink-0" />{selected.email}
                      </p>
                    )}
                    {selected.phone && (
                      <p className="flex items-center gap-1.5 text-xs text-[#A0AEC0]">
                        <Phone className="h-3 w-3 shrink-0" />{selected.phone}
                      </p>
                    )}
                    {!selected.email && !selected.phone && <p className="text-xs text-[#4A5568]">Sin datos de contacto</p>}
                  </div>

                  {(selected.ad_name || selected.campaign_name) && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] text-[#4A5568] uppercase tracking-wide">Anuncio</p>
                      {selected.ad_name && <p className="text-xs text-neon-cyan">{selected.ad_name}</p>}
                      {selected.campaign_name && (
                        <span className="text-[10px] bg-neon-purple/10 border border-neon-purple/20 text-neon-purple px-2 py-0.5 rounded-full inline-block">
                          📢 {selected.campaign_name}
                        </span>
                      )}
                    </div>
                  )}

                  {selected.primer_mensaje && (
                    <div>
                      <p className="text-[10px] text-[#4A5568] uppercase tracking-wide mb-1.5">Primer mensaje</p>
                      <p className="text-xs text-[#A0AEC0] bg-space-el rounded-lg p-2.5 border border-neon-cyan/[0.06]">
                        {selected.primer_mensaje}
                      </p>
                    </div>
                  )}

                  <Separator className="bg-neon-cyan/[0.06]" />

                  <div>
                    <p className="text-[10px] text-[#4A5568] uppercase tracking-wide mb-2 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />Historial ({messages.length})
                    </p>
                    {messages.length === 0 ? (
                      <p className="text-xs text-[#4A5568]">Sin mensajes registrados</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {messages.map(msg => (
                          <div
                            key={msg.id}
                            className={`text-xs rounded-lg p-2 ${msg.direction === "inbound" ? "bg-space-el text-[#A0AEC0]" : "bg-neon-cyan/10 text-neon-cyan"}`}
                          >
                            <p className="mb-0.5">{msg.content}</p>
                            {msg.created_at && (
                              <p className="text-[9px] opacity-50 text-right">{formatRelative(msg.created_at)}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Separator className="bg-neon-cyan/[0.06]" />

                  <div>
                    <p className="text-[10px] text-[#4A5568] uppercase tracking-wide mb-1.5">Notas internas</p>
                    <Textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Agrega notas sobre este lead..."
                      className="bg-space-el border-neon-cyan/15 text-white text-xs placeholder-[#4A5568] h-20 resize-none focus:border-neon-cyan/40"
                    />
                    <Button
                      size="sm"
                      className="w-full mt-2 bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 text-xs font-semibold"
                      onClick={saveNotes}
                      disabled={saving}
                    >
                      {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                      Guardar notas
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {selected.phone && (
                      <a
                        href={`https://wa.me/${selected.phone.replace(/\D/g, "")}`}
                        target="_blank" rel="noopener noreferrer"
                      >
                        <Button size="sm" className="w-full bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 text-xs font-semibold">
                          💬 WhatsApp
                        </Button>
                      </a>
                    )}
                    {selected.email && (
                      <a href={`mailto:${selected.email}`}>
                        <Button size="sm" className="w-full bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 text-xs font-semibold">
                          <Mail className="h-3 w-3 mr-1" /> Email
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
