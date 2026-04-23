"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { formatDate } from "@/lib/utils";
import { Loader2, Users, Mail, Phone } from "lucide-react";

const STATUS_VARIANTS: Record<string, any> = {
  new: "info", contacted: "warning", qualified: "success", lost: "secondary",
};
const STATUS_LABELS: Record<string, string> = {
  new: "Nuevo", contacted: "Contactado", qualified: "Calificado", lost: "Perdido",
};
const CHANNEL_EMOJI: Record<string, string> = {
  whatsapp: "💬", instagram: "📸", facebook: "👍", slack: "💼", web_widget: "🌐", api: "⚡",
};

export default function LeadsPage() {
  const supabase = createClient();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [_orgId, setOrgId] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: m } = await supabase.from("organization_members").select("organization_id").eq("user_id", session.user.id).limit(1).single();
      if (!m) return;
      setOrgId(m.organization_id);

      const { data } = await supabase
        .from("leads")
        .select("*, agents(name)")
        .eq("organization_id", m.organization_id)
        .order("created_at", { ascending: false });

      setLeads(data || []);
      setLoading(false);
    }
    load();
  }, []);

  async function updateStatus(leadId: string, status: string) {
    await supabase.from("leads").update({ status }).eq("id", leadId);
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, status } : l));
  }

  return (
    <div>
      <Header title="Leads" description="Contactos capturados por tus agentes" />
      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Users className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">Aún no hay leads capturados</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr>
                  {["Contacto", "Canal", "Agente", "Estado", "Fecha"].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-muted-foreground px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">{lead.name || "—"}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {lead.email && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />{lead.email}
                            </span>
                          )}
                          {lead.phone && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />{lead.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-lg">{CHANNEL_EMOJI[lead.source_channel ?? ""] ?? "📡"}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {(lead.agents as { name: string } | null)?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Select value={lead.status} onValueChange={(v) => updateStatus(lead.id, v)}>
                        <SelectTrigger className="h-7 text-xs w-32 border-0 bg-transparent p-0 focus:ring-0">
                          <Badge variant={STATUS_VARIANTS[lead.status] ?? "secondary"}>
                            {STATUS_LABELS[lead.status] ?? lead.status}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABELS).map(([v, l]) => (
                            <SelectItem key={v} value={v}>{l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(lead.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
