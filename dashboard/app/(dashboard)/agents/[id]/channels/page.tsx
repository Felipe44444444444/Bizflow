"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { Plus, Loader2, Plug, Unplug } from "lucide-react";

const CHANNEL_TYPES = [
  { type: "whatsapp", label: "WhatsApp", emoji: "💬", desc: "API de WhatsApp Business" },
  { type: "instagram", label: "Instagram", emoji: "📸", desc: "Mensajes directos de Instagram" },
  { type: "facebook", label: "Facebook", emoji: "👍", desc: "Messenger de Facebook" },
  { type: "slack", label: "Slack", emoji: "💼", desc: "Bot en workspace de Slack" },
  { type: "web_widget", label: "Web Widget", emoji: "🌐", desc: "Chat embebido en tu web" },
  { type: "api", label: "API directa", emoji: "⚡", desc: "Integración via REST API" },
];

export default function ChannelsPage() {
  const { id: agentId } = useParams<{ id: string }>();
  const supabase = createClient();
  const [channels, setChannels] = useState<any[]>([]);
  const [token, setToken] = useState("");
  const [orgId, setOrgId] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [channelName, setChannelName] = useState("");
  const [config, setConfig] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setToken(session.access_token);
      const { data: m } = await supabase.from("organization_members").select("organization_id").eq("user_id", session.user.id).limit(1).single();
      if (!m) return;
      setOrgId(m.organization_id);
      const data = await api.get(`/api/channels?agent_id=${agentId}`, session.access_token, m.organization_id);
      setChannels(data || []);
      setLoading(false);
    }
    load();
  }, [agentId]);

  async function createChannel() {
    if (!selectedType) return;
    setSaving(true);
    let parsedConfig = {};
    try { parsedConfig = config ? JSON.parse(config) : {}; } catch { }
    const ch = await api.post("/api/channels", {
      agent_id: agentId, type: selectedType, name: channelName, config: parsedConfig,
    }, token, orgId);
    setChannels((prev) => [ch, ...prev]);
    setOpen(false);
    setSelectedType(null);
    setChannelName("");
    setConfig("");
    setSaving(false);
  }

  async function toggleChannel(channel: any) {
    const path = channel.is_active ? "disconnect" : "connect";
    const updated = await api.post(`/api/channels/${channel.id}/${path}`, {}, token, orgId);
    setChannels((prev) => prev.map((c) => c.id === channel.id ? updated.channel : c));
  }

  async function deleteChannel(channelId: string) {
    await api.del(`/api/channels/${channelId}`, token, orgId);
    setChannels((prev) => prev.filter((c) => c.id !== channelId));
  }

  return (
    <div>
      <Header
        title="Canales conectados"
        description="Gestiona los canales de comunicación del agente"
        action={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Conectar canal
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Available types */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Canales disponibles</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {CHANNEL_TYPES.map((ct) => {
              const connected = channels.some((c) => c.type === ct.type && c.is_active);
              return (
                <Card key={ct.type} className={`text-center p-4 cursor-default ${connected ? "border-primary/40 bg-primary/5" : ""}`}>
                  <div className="text-2xl mb-2">{ct.emoji}</div>
                  <p className="text-xs font-medium">{ct.label}</p>
                  {connected && <Badge variant="success" className="mt-2 text-[10px]">Conectado</Badge>}
                </Card>
              );
            })}
          </div>
        </div>

        {/* Connected channels */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Canales configurados ({channels.length})</h2>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : channels.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-muted-foreground text-sm">Aún no has conectado ningún canal</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {channels.map((ch) => {
                const meta = CHANNEL_TYPES.find((t) => t.type === ch.type);
                return (
                  <Card key={ch.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">{meta?.emoji ?? "📡"}</span>
                        <div>
                          <p className="font-medium text-sm">{ch.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{ch.type.replace("_", " ")}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={ch.is_active ? "success" : "secondary"}>
                          {ch.is_active ? "Activo" : "Inactivo"}
                        </Badge>
                        <Button variant="outline" size="sm" onClick={() => toggleChannel(ch)}>
                          {ch.is_active ? <Unplug className="h-3 w-3" /> : <Plug className="h-3 w-3" />}
                          {ch.is_active ? "Desconectar" : "Conectar"}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => deleteChannel(ch.id)}>
                          Eliminar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar nuevo canal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Tipo de canal</Label>
              <div className="grid grid-cols-3 gap-2">
                {CHANNEL_TYPES.map((ct) => (
                  <button
                    key={ct.type}
                    onClick={() => setSelectedType(ct.type)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-xs transition-all ${selectedType === ct.type ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"}`}
                  >
                    <span className="text-lg">{ct.emoji}</span>
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nombre del canal</Label>
              <Input placeholder="Ej: WhatsApp Principal" value={channelName} onChange={(e) => setChannelName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Configuración (JSON)</Label>
              <Input placeholder='{"access_token": "...", "page_id": "..."}' value={config} onChange={(e) => setConfig(e.target.value)} />
              <p className="text-xs text-muted-foreground">Opcional: tokens y credenciales específicas del canal</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={createChannel} disabled={!selectedType || !channelName || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Conectar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
