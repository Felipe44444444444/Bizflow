"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Plus, Key, Copy, Trash2, Loader2, Check } from "lucide-react";

export default function ApiKeysPage() {
  const supabase = createClient();
  const [keys, setKeys] = useState<any[]>([]);
  const [orgId, setOrgId] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: m } = await supabase.from("organization_members").select("organization_id").eq("user_id", session.user.id).limit(1).single();
      if (!m) return;
      setOrgId(m.organization_id);
      const data = await api.get("/api/api-keys", m.organization_id);
      setKeys(data || []);
      setLoading(false);
    }
    load();
  }, []);

  async function createKey() {
    setSaving(true);
    const data = await api.post("/api/api-keys", { name: keyName }, orgId);
    setNewKey(data.key);
    setKeys((prev) => [{ ...data, key: undefined }, ...prev]);
    setKeyName("");
    setSaving(false);
  }

  async function revokeKey(keyId: string) {
    await api.del(`/api/api-keys/${keyId}`, orgId);
    setKeys((prev) => prev.map((k) => k.id === keyId ? { ...k, is_active: false } : k));
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <Header
        title="API Keys"
        description="Claves para integrar Conectachat en tus aplicaciones"
        action={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Nueva API key
          </Button>
        }
      />

      <div className="p-6 space-y-4">
        {/* Docs hint */}
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4 flex items-start gap-3">
            <Key className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-primary">Uso de la API</p>
              <p className="text-muted-foreground text-xs mt-1">
                Incluye tu API key en el header <code className="bg-secondary px-1 py-0.5 rounded text-xs">x-api-key: cc_...</code> en tus peticiones a <code className="bg-secondary px-1 py-0.5 rounded text-xs">POST /api/messages/chat</code>
              </p>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Key className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">Sin API keys</p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map((k) => (
              <Card key={k.id} className={!k.is_active ? "opacity-50" : ""}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center">
                      <Key className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{k.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{k.key_prefix}...</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-muted-foreground">Último uso</p>
                      <p className="text-xs">{k.last_used_at ? formatDate(k.last_used_at) : "Nunca"}</p>
                    </div>
                    <Badge variant={k.is_active ? "success" : "secondary"}>
                      {k.is_active ? "Activa" : "Revocada"}
                    </Badge>
                    {k.is_active && (
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => revokeKey(k.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={open && !newKey} onOpenChange={(v) => { setOpen(v); if (!v) setNewKey(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva API key</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input placeholder="Ej: Producción, App móvil..." value={keyName} onChange={(e) => setKeyName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={createKey} disabled={!keyName || saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Generar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show new key dialog */}
      <Dialog open={!!newKey} onOpenChange={() => { setNewKey(null); setOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API key generada</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Copia tu API key ahora. <strong>No podrás verla de nuevo.</strong>
            </p>
            <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg font-mono text-sm break-all">
              <span className="flex-1 text-xs">{newKey}</span>
              <Button variant="ghost" size="icon" onClick={() => copy(newKey!)}>
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { setNewKey(null); setOpen(false); }}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
