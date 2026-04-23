"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { Loader2, CreditCard, Users, Building, Check, ExternalLink } from "lucide-react";

const PLANS = [
  { id: "free", name: "Free", price: "$0", features: ["1 agente", "500 mensajes/mes", "1 canal", "Soporte por email"] },
  { id: "starter", name: "Starter", price: "$29", features: ["3 agentes", "5,000 mensajes/mes", "5 canales", "RAG incluido", "Soporte prioritario"] },
  { id: "pro", name: "Pro", price: "$99", features: ["10 agentes", "50,000 mensajes/mes", "Canales ilimitados", "Analytics avanzado", "SLA garantizado"] },
  { id: "enterprise", name: "Enterprise", price: "Custom", features: ["Agentes ilimitados", "Mensajes ilimitados", "Onboarding dedicado", "SSO", "SLA 99.9%"] },
];

export default function SettingsPage() {
  const supabase = createClient();
  const [token, setToken] = useState("");
  const [orgId, setOrgId] = useState("");
  const [org, setOrg] = useState<any>(null);
  const [sub, setSub] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [_loading, setLoading] = useState(true);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setToken(session.access_token);
      const { data: m } = await supabase
        .from("organization_members")
        .select("organization_id, role, organizations(*)")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();
      if (!m) return;
      setOrgId(m.organization_id);
      setOrg(m.organizations);

      const [subData, membersData] = await Promise.all([
        api.get("/api/billing/subscription", session.access_token, m.organization_id),
        supabase.from("organization_members").select("*, profiles:user_id(email)").eq("organization_id", m.organization_id),
      ]);
      setSub(subData);
      setMembers(membersData.data || []);
      setLoading(false);
    }
    load();
  }, []);

  async function openPortal() {
    setLoadingPortal(true);
    const { url } = await api.post("/api/billing/portal", {}, token, orgId);
    window.open(url, "_blank");
    setLoadingPortal(false);
  }

  async function checkout(plan: string) {
    setLoadingCheckout(plan);
    const { url } = await api.post("/api/billing/checkout", { plan }, token, orgId);
    window.location.href = url;
  }

  const currentPlan = sub?.plan ?? org?.plan ?? "free";

  return (
    <div>
      <Header title="Configuración" description="Gestiona tu plan, equipo y organización" />

      <div className="p-6">
        <Tabs defaultValue="billing">
          <TabsList>
            <TabsTrigger value="billing"><CreditCard className="h-3.5 w-3.5 mr-1.5" />Suscripción</TabsTrigger>
            <TabsTrigger value="team"><Users className="h-3.5 w-3.5 mr-1.5" />Equipo</TabsTrigger>
            <TabsTrigger value="org"><Building className="h-3.5 w-3.5 mr-1.5" />Organización</TabsTrigger>
          </TabsList>

          {/* Billing */}
          <TabsContent value="billing" className="space-y-6">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Plan actual</p>
                  <p className="text-2xl font-bold capitalize mt-1">{currentPlan}</p>
                  {sub?.current_period_end && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Próxima facturación: {new Date(sub.current_period_end).toLocaleDateString("es-ES")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={sub?.status === "active" ? "success" : "warning"}>
                    {sub?.status ?? "Activo"}
                  </Badge>
                  {currentPlan !== "free" && (
                    <Button variant="outline" size="sm" onClick={openPortal} disabled={loadingPortal}>
                      {loadingPortal ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                      Gestionar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-4 gap-4">
              {PLANS.map((plan) => {
                const isCurrent = plan.id === currentPlan;
                return (
                  <Card key={plan.id} className={`relative ${isCurrent ? "border-primary/40 bg-primary/5" : ""}`}>
                    {isCurrent && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="text-[10px]">Plan actual</Badge>
                      </div>
                    )}
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">{plan.name}</CardTitle>
                      <p className="text-2xl font-bold">{plan.price}<span className="text-xs text-muted-foreground font-normal">{plan.id !== "enterprise" && "/mes"}</span></p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ul className="space-y-1.5">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Check className="h-3 w-3 text-primary shrink-0" />{f}
                          </li>
                        ))}
                      </ul>
                      {!isCurrent && plan.id !== "free" && (
                        <Button
                          size="sm"
                          className="w-full"
                          variant={plan.id === "pro" ? "default" : "outline"}
                          onClick={() => checkout(plan.id)}
                          disabled={!!loadingCheckout}
                        >
                          {loadingCheckout === plan.id && <Loader2 className="h-3 w-3 animate-spin" />}
                          {plan.id === "enterprise" ? "Contactar" : "Actualizar"}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Team */}
          <TabsContent value="team" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Miembros del equipo ({members.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {members.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/30">
                    <div>
                      <p className="text-sm font-medium">{m.profiles?.email ?? "—"}</p>
                      <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                    </div>
                    <Badge variant="secondary" className="capitalize">{m.role}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Invitar miembro</CardTitle>
                <CardDescription className="text-xs">El usuario debe crear su cuenta primero</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Input
                  placeholder="email@empresa.com"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <Button size="sm" disabled={!inviteEmail}>Invitar</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Org */}
          <TabsContent value="org" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Datos de la organización</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input defaultValue={org?.name ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input defaultValue={org?.slug ?? ""} disabled className="font-mono text-xs" />
                  <p className="text-xs text-muted-foreground">El slug no puede modificarse</p>
                </div>
                <Button size="sm">Guardar cambios</Button>
              </CardContent>
            </Card>

            <Separator />

            <Card className="border-destructive/30">
              <CardHeader>
                <CardTitle className="text-sm text-destructive">Zona de peligro</CardTitle>
                <CardDescription className="text-xs">Estas acciones son irreversibles</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="destructive" size="sm">Eliminar organización</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
