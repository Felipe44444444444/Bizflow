"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { Bot, Plus, Settings, Zap, Loader2 } from "lucide-react";

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [token, setToken] = useState("");
  const [form, setForm] = useState({ name: "", language: "es", tone: "professional" });
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setToken(session.access_token);

      const { data: m } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();

      if (!m) return;
      setOrgId(m.organization_id);

      const data = await api.get("/api/agents", session.access_token, m.organization_id);
      setAgents(data);
      setLoading(false);
    }
    load();
  }, []);

  async function createAgent() {
    setSaving(true);
    const agent = await api.post("/api/agents", form, token, orgId);
    setAgents((prev) => [agent, ...prev]);
    setOpen(false);
    setForm({ name: "", language: "es", tone: "professional" });
    setSaving(false);
  }

  return (
    <div>
      <Header
        title="Agentes IA"
        description="Crea y configura tus agentes de atención"
        action={
          <Button onClick={() => setOpen(true)} size="sm">
            <Plus className="h-4 w-4" /> Nuevo agente
          </Button>
        }
      />

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="h-16 w-16 rounded-2xl gradient-primary flex items-center justify-center glow">
              <Bot className="h-8 w-8 text-white" />
            </div>
            <h3 className="text-lg font-semibold">Sin agentes todavía</h3>
            <p className="text-muted-foreground text-sm text-center max-w-xs">
              Crea tu primer agente IA para empezar a atender clientes automáticamente.
            </p>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Crear primer agente
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <Card key={agent.id} className="group hover:border-primary/30 transition-all cursor-pointer" onClick={() => router.push(`/dashboard/agents/${agent.id}`)}>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center">
                        <Bot className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{agent.name}</h3>
                        <p className="text-xs text-muted-foreground capitalize">{agent.tone}</p>
                      </div>
                    </div>
                    <Badge variant={agent.is_active ? "success" : "secondary"}>
                      {agent.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>

                  {agent.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Zap className="h-3 w-3" />
                      <span>{agent.language.toUpperCase()}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs gap-1">
                      <Settings className="h-3 w-3" /> Configurar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo agente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre del agente</Label>
              <Input placeholder="Ej: Soporte Técnico" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Idioma</Label>
              <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="pt">Português</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tono</Label>
              <Select value={form.tone} onValueChange={(v) => setForm({ ...form, tone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Profesional</SelectItem>
                  <SelectItem value="friendly">Amigable</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={createAgent} disabled={!form.name || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear agente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
