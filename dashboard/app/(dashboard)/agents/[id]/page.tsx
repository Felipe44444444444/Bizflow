"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { Save, Loader2, Upload, Trash2, ExternalLink, RefreshCw, FileText, Link, AlignLeft } from "lucide-react";

export default function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [agent, setAgent] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [token, setToken] = useState("");
  const [orgId, setOrgId] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [urlForm, setUrlForm] = useState({ url: "", name: "" });
  const [textForm, setTextForm] = useState({ name: "", content: "" });

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setToken(session.access_token);
      const { data: m } = await supabase.from("organization_members").select("organization_id").eq("user_id", session.user.id).limit(1).single();
      if (!m) return;
      setOrgId(m.organization_id);
      const [agentData, docsData] = await Promise.all([
        api.get(`/api/agents/${id}`, session.access_token, m.organization_id),
        api.get(`/api/documents?agent_id=${id}`, session.access_token, m.organization_id),
      ]);
      setAgent(agentData);
      setDocs(docsData || []);
    }
    load();
  }, [id]);

  async function saveAgent() {
    setSaving(true);
    const updated = await api.put(`/api/agents/${id}`, agent, token, orgId);
    setAgent(updated);
    setSaving(false);
  }

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("agent_id", id);
    const res = await fetch("http://localhost:3000/api/documents/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "x-organization-id": orgId },
      body: formData,
    });
    const doc = await res.json();
    setDocs((prev) => [doc, ...prev]);
    setUploading(false);
  }

  async function addUrl() {
    const doc = await api.post("/api/documents/url", { ...urlForm, agent_id: id }, token, orgId);
    setDocs((prev) => [doc, ...prev]);
    setUrlForm({ url: "", name: "" });
  }

  async function addText() {
    const doc = await api.post("/api/documents/text", { ...textForm, agent_id: id, type: "faq" }, token, orgId);
    setDocs((prev) => [doc, ...prev]);
    setTextForm({ name: "", content: "" });
  }

  async function deleteDoc(docId: string) {
    await api.del(`/api/documents/${docId}`, token, orgId);
    setDocs((prev) => prev.filter((d) => d.id !== docId));
  }

  if (!agent) return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  const statusDocColor: Record<string, string> = {
    ready: "success", processing: "warning", error: "destructive",
  };

  return (
    <div>
      <Header
        title={agent.name}
        description="Configuración del agente"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/agents/${id}/channels`)}>
              <ExternalLink className="h-4 w-4" /> Canales
            </Button>
            <Button size="sm" onClick={saveAgent} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </Button>
          </div>
        }
      />

      <div className="p-6">
        <Tabs defaultValue="config">
          <TabsList>
            <TabsTrigger value="config">Configuración</TabsTrigger>
            <TabsTrigger value="knowledge">Base de conocimiento</TabsTrigger>
          </TabsList>

          {/* Config Tab */}
          <TabsContent value="config" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm">Información básica</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nombre</Label>
                    <Input value={agent.name} onChange={(e) => setAgent({ ...agent, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Descripción</Label>
                    <Input value={agent.description ?? ""} onChange={(e) => setAgent({ ...agent, description: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Idioma</Label>
                      <Select value={agent.language} onValueChange={(v) => setAgent({ ...agent, language: v })}>
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
                      <Select value={agent.tone} onValueChange={(v) => setAgent({ ...agent, tone: v })}>
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
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Activo</Label>
                      <p className="text-xs text-muted-foreground">El agente responde mensajes</p>
                    </div>
                    <Switch checked={agent.is_active} onCheckedChange={(v) => setAgent({ ...agent, is_active: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Escalado a humano</Label>
                      <p className="text-xs text-muted-foreground">Permite derivar conversaciones</p>
                    </div>
                    <Switch checked={agent.handoff_enabled} onCheckedChange={(v) => setAgent({ ...agent, handoff_enabled: v })} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">System Prompt</CardTitle>
                  <CardDescription className="text-xs">Instrucciones de comportamiento para el agente</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    className="min-h-[200px] font-mono text-xs"
                    placeholder="Eres un asistente de soporte para Acme Corp. Tu objetivo es ayudar a los clientes con sus dudas..."
                    value={agent.system_prompt ?? ""}
                    onChange={(e) => setAgent({ ...agent, system_prompt: e.target.value })}
                  />
                  <div className="space-y-2">
                    <Label>Mensaje de fallback</Label>
                    <Input
                      placeholder="Lo siento, no puedo ayudarte con eso. ¿Quieres hablar con un agente?"
                      value={agent.fallback_message ?? ""}
                      onChange={(e) => setAgent({ ...agent, fallback_message: e.target.value })}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Knowledge Tab */}
          <TabsContent value="knowledge" className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              {/* Upload File */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" />Subir archivo</CardTitle>
                  <CardDescription className="text-xs">PDF o TXT, máx 50MB</CardDescription>
                </CardHeader>
                <CardContent>
                  <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:border-primary/50 transition-colors">
                    {uploading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
                    <span className="text-sm text-muted-foreground">{uploading ? "Procesando..." : "Haz clic para subir"}</span>
                    <input type="file" accept=".pdf,.txt" className="hidden" onChange={uploadFile} disabled={uploading} />
                  </label>
                </CardContent>
              </Card>

              {/* Add URL */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2"><Link className="h-4 w-4" />Agregar URL</CardTitle>
                  <CardDescription className="text-xs">Indexa una página web</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input placeholder="Nombre" value={urlForm.name} onChange={(e) => setUrlForm({ ...urlForm, name: e.target.value })} />
                  <Input placeholder="https://..." value={urlForm.url} onChange={(e) => setUrlForm({ ...urlForm, url: e.target.value })} />
                  <Button size="sm" className="w-full" onClick={addUrl} disabled={!urlForm.url || !urlForm.name}>
                    Indexar URL
                  </Button>
                </CardContent>
              </Card>

              {/* Add Text */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2"><AlignLeft className="h-4 w-4" />Texto / FAQ</CardTitle>
                  <CardDescription className="text-xs">Pega contenido directamente</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input placeholder="Nombre" value={textForm.name} onChange={(e) => setTextForm({ ...textForm, name: e.target.value })} />
                  <Textarea className="min-h-[80px] text-xs" placeholder="Pregunta: ...\nRespuesta: ..." value={textForm.content} onChange={(e) => setTextForm({ ...textForm, content: e.target.value })} />
                  <Button size="sm" className="w-full" onClick={addText} disabled={!textForm.content || !textForm.name}>
                    Agregar
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Documents list */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Documentos indexados ({docs.length})</CardTitle></CardHeader>
              <CardContent>
                {docs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">Aún no hay documentos en la base de conocimiento</p>
                ) : (
                  <div className="space-y-2">
                    {docs.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between rounded-lg p-3 bg-accent/30 border border-border">
                        <div className="flex items-center gap-3">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{doc.name}</p>
                            <p className="text-xs text-muted-foreground">{doc.type} · {doc.chunk_count} chunks</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={(statusDocColor[doc.status] as any) ?? "secondary"}>{doc.status}</Badge>
                          {doc.status === "error" && (
                            <Button variant="ghost" size="icon" onClick={() => api.post(`/api/documents/${doc.id}/reprocess`, {}, token, orgId)}>
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => deleteDoc(doc.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
