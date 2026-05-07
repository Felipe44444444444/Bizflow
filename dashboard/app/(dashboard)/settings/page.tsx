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
import { formatDate } from "@/lib/utils";
import { Loader2, CreditCard, Users, Building, Check, ExternalLink, Zap, TrendingUp, ShoppingCart, Shield, Lock, Eye, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

// Plans are fetched from /api/plans at runtime
interface PlanRow {
  id: string;
  name: string;
  price_mxn: number;
  price_mxn_bimonthly: number;
  messages_limit: number;
  features: string[];
  is_popular: boolean;
}

function formatMXN(centavos: number): string {
  if (!centavos) return "Personalizado";
  return "$" + (centavos / 100).toLocaleString("es-MX");
}

function savingsPercent(monthly: number, bimonthly: number): string | null {
  if (!monthly || !bimonthly) return null;
  const saved = monthly * 2 - bimonthly;
  return Math.round((saved / (monthly * 2)) * 100) + "%";
}

function messagesLabel(limit: number): string {
  if (limit < 0) return "Mensajes ilimitados";
  return limit.toLocaleString("es-MX") + " mensajes/mes";
}

const CREDIT_PACKS = [
  { credits: "1,000", price: "$9", value: 1000 },
  { credits: "5,000", price: "$39", value: 5000 },
  { credits: "20,000", price: "$129", value: 20000 },
];

const TRANSACTION_LABELS: Record<string, string> = {
  plan_grant: "Créditos del plan",
  message: "Mensaje procesado",
  document: "Documento procesado",
  purchase: "Compra de créditos",
  refund: "Reembolso",
};

export default function SettingsPage() {
  const supabase = createClient();
  const [orgId, setOrgId] = useState("");
  const [org, setOrg] = useState<any>(null);
  const [sub, setSub] = useState<any>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [closingSession, setClosingSession] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: m } = await supabase
        .from("organization_members")
        .select("organization_id, role, organizations(*)")
        .eq("user_id", session.user.id)
        .limit(1)
        .single();
      if (!m) return;
      setOrgId(m.organization_id);
      setOrg(m.organizations);

      const [subData, membersData, txData, plansData] = await Promise.all([
        api.get("/api/billing/subscription", m.organization_id).catch(() => null),
        supabase.from("organization_members").select("*, profiles:user_id(email)").eq("organization_id", m.organization_id),
        supabase
          .from("credit_transactions")
          .select("*")
          .eq("organization_id", m.organization_id)
          .order("created_at", { ascending: false })
          .limit(30),
        api.get("/api/billing/plans", m.organization_id).catch(() => []),
      ]);

      setSub(subData);
      setMembers(membersData.data || []);
      setTransactions(txData.data || []);
      if (Array.isArray(plansData) && plansData.length > 0) setPlans(plansData);

      // Security audit log
      const { data: auditData } = await supabase
        .from("security_audit_log")
        .select("*")
        .eq("organization_id", m.organization_id)
        .order("created_at", { ascending: false })
        .limit(10);
      setAuditLog(auditData || []);

      setLoading(false);
    }
    load();
  }, []);

  async function openPortal() {
    setLoadingPortal(true);
    try {
      const { url } = await api.post("/api/billing/portal", {}, orgId);
      window.open(url, "_blank");
    } finally {
      setLoadingPortal(false);
    }
  }

  async function checkout(plan: string) {
    setLoadingCheckout(plan);
    try {
      const { url } = await api.post("/api/billing/checkout", { plan }, orgId);
      window.location.href = url;
    } finally {
      setLoadingCheckout(null);
    }
  }

  const currentPlan = sub?.plan ?? org?.plan ?? "starter";
  const creditsBalance = org?.credits_balance ?? 0;
  const creditsUsed = org?.credits_used ?? 0;
  const creditsLimit = org?.plan_credits_limit ?? 1000;
  const creditsPercent = creditsLimit > 0 ? Math.min(100, Math.round((creditsUsed / creditsLimit) * 100)) : 0;

  return (
    <div>
      <Header title="Configuración" description="Plan, créditos, equipo y organización" />

      <div className="p-6">
        <Tabs defaultValue="credits">
          <TabsList className="bg-space-el rounded-xl p-1 border border-neon-cyan/[0.08] mb-6">
            <TabsTrigger
              value="credits"
              className="data-[state=active]:bg-space-card data-[state=active]:text-neon-cyan data-[state=active]:shadow-sm rounded-lg text-[#4A5568] hover:text-[#A0AEC0] gap-1.5"
            >
              <Zap className="h-3.5 w-3.5" />Créditos
            </TabsTrigger>
            <TabsTrigger
              value="billing"
              className="data-[state=active]:bg-space-card data-[state=active]:text-neon-cyan data-[state=active]:shadow-sm rounded-lg text-[#4A5568] hover:text-[#A0AEC0] gap-1.5"
            >
              <CreditCard className="h-3.5 w-3.5" />Suscripción
            </TabsTrigger>
            <TabsTrigger
              value="team"
              className="data-[state=active]:bg-space-card data-[state=active]:text-neon-cyan data-[state=active]:shadow-sm rounded-lg text-[#4A5568] hover:text-[#A0AEC0] gap-1.5"
            >
              <Users className="h-3.5 w-3.5" />Equipo
            </TabsTrigger>
            <TabsTrigger
              value="org"
              className="data-[state=active]:bg-space-card data-[state=active]:text-neon-cyan data-[state=active]:shadow-sm rounded-lg text-[#4A5568] hover:text-[#A0AEC0] gap-1.5"
            >
              <Building className="h-3.5 w-3.5" />Organización
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="data-[state=active]:bg-space-card data-[state=active]:text-neon-cyan data-[state=active]:shadow-sm rounded-lg text-[#4A5568] hover:text-[#A0AEC0] gap-1.5"
            >
              <Shield className="h-3.5 w-3.5" />Seguridad
            </TabsTrigger>
          </TabsList>

          {/* ── CRÉDITOS ───────────────────────────────────────────────── */}
          <TabsContent value="credits" className="space-y-6">

            {/* Credit balance card */}
            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <p className="text-sm text-[#4A5568]">Créditos disponibles</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <p className="font-display text-5xl font-bold text-white">{creditsBalance.toLocaleString()}</p>
                    <p className="text-sm text-[#4A5568]">/ {creditsLimit.toLocaleString()}</p>
                  </div>
                  <p className="text-xs text-[#4A5568] mt-1">
                    {creditsUsed.toLocaleString()} créditos usados este período
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-neon-cyan/10 border border-neon-cyan/20">
                  <TrendingUp className="h-6 w-6 text-neon-cyan" />
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="h-2 w-full bg-space-el rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${creditsPercent}%`,
                      background: creditsPercent > 80
                        ? "linear-gradient(90deg, #FFB800, #FF3860)"
                        : "linear-gradient(90deg, #00F5FF, #7B2FFF)",
                    }}
                  />
                </div>
                <p className="text-xs text-[#4A5568] text-right">{creditsPercent}% utilizado</p>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <div className="bg-space-el rounded-xl p-3 border border-neon-cyan/[0.06]">
                  <p className="font-display text-lg font-bold text-white">{creditsUsed.toLocaleString()}</p>
                  <p className="text-[10px] text-[#4A5568] uppercase tracking-wide">Usados</p>
                </div>
                <div className="bg-space-el rounded-xl p-3 border border-neon-cyan/[0.06]">
                  <p className="font-display text-lg font-bold text-white">{creditsBalance.toLocaleString()}</p>
                  <p className="text-[10px] text-[#4A5568] uppercase tracking-wide">Restantes</p>
                </div>
                <div className="bg-space-el rounded-xl p-3 border border-neon-cyan/[0.06]">
                  <p className="font-display text-lg font-bold text-neon-cyan capitalize">{currentPlan}</p>
                  <p className="text-[10px] text-[#4A5568] uppercase tracking-wide">Plan</p>
                </div>
              </div>
            </div>

            {/* Credit packs */}
            <div>
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-[#4A5568]" />
                Comprar créditos adicionales
              </h2>
              <div className="grid md:grid-cols-3 gap-4">
                {CREDIT_PACKS.map((pack) => (
                  <div
                    key={pack.value}
                    className="rounded-xl border border-neon-cyan/[0.08] bg-space-card hover:border-neon-cyan/25 transition-all cursor-pointer card-hover p-5 text-center space-y-3"
                  >
                    <p className="font-display text-2xl font-bold text-white">{pack.credits}</p>
                    <p className="text-xs text-[#4A5568]">créditos</p>
                    <p className="font-display text-3xl font-bold text-neon-cyan">{pack.price}</p>
                    <p className="text-[11px] text-[#4A5568]">
                      {pack.value >= 5000
                        ? `$${(parseInt(pack.price.slice(1)) / pack.value * 1000).toFixed(2)}/1k créditos`
                        : "$9.00/1k créditos"}
                    </p>
                    <Button
                      size="sm"
                      className="w-full bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 hover:border-neon-cyan/50 font-semibold"
                      onClick={() => checkout(`credits_${pack.value}`)}
                      disabled={!!loadingCheckout}
                    >
                      {loadingCheckout === `credits_${pack.value}` && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      Comprar
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Transaction history */}
            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
              <div className="p-5 border-b border-neon-cyan/[0.06]">
                <h3 className="text-sm font-semibold text-white">Historial de transacciones</h3>
                <p className="text-xs text-[#4A5568] mt-0.5">Últimas 30 transacciones</p>
              </div>
              <div className="p-5">
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-neon-cyan" />
                  </div>
                ) : transactions.length === 0 ? (
                  <p className="text-sm text-[#4A5568] text-center py-8">Sin transacciones aún</p>
                ) : (
                  <div className="space-y-0">
                    {transactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between py-3 border-b border-neon-cyan/[0.06] last:border-0"
                      >
                        <div>
                          <p className="text-sm text-white">{TRANSACTION_LABELS[tx.type] ?? tx.type}</p>
                          {tx.description && (
                            <p className="text-xs text-[#4A5568]">{tx.description}</p>
                          )}
                          <p className="text-[10px] text-[#4A5568] mt-0.5">
                            {formatDate(tx.created_at)}
                          </p>
                        </div>
                        <span className={`text-sm font-semibold tabular-nums ${tx.amount > 0 ? "text-neon-green" : "text-[#A0AEC0]"}`}>
                          {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── SUSCRIPCIÓN ────────────────────────────────────────────── */}
          <TabsContent value="billing" className="space-y-6">
            <div className="rounded-xl border border-neon-cyan/20 bg-neon-cyan/5 p-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-[#4A5568]">Plan actual</p>
                <p className="font-display text-2xl font-bold text-white capitalize mt-1">{currentPlan}</p>
                {sub?.current_period_end && (
                  <p className="text-xs text-[#4A5568] mt-1">
                    Próxima facturación: {new Date(sub.current_period_end).toLocaleDateString("es-ES")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                  sub?.status === "active"
                    ? "bg-neon-green/10 text-neon-green border-neon-green/20"
                    : "bg-neon-yellow/10 text-neon-yellow border-neon-yellow/20"
                }`}>
                  {sub?.status ?? "Activo"}
                </span>
                {currentPlan !== "free" && currentPlan !== "starter" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/10 gap-1.5"
                    onClick={openPortal}
                    disabled={loadingPortal}
                  >
                    {loadingPortal ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                    Gestionar
                  </Button>
                )}
              </div>
            </div>

            {plans.length === 0 ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-neon-cyan" />
              </div>
            ) : (
              <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
                {plans.map((plan) => {
                  const isCurrent  = plan.id === currentPlan;
                  const priceLabel = plan.price_mxn ? formatMXN(plan.price_mxn) : "Personalizado";
                  const bimLabel   = plan.price_mxn_bimonthly ? formatMXN(plan.price_mxn_bimonthly) : null;
                  const savePct    = savingsPercent(plan.price_mxn, plan.price_mxn_bimonthly);
                  const features   = Array.isArray(plan.features) ? plan.features : [];

                  return (
                    <div
                      key={plan.id}
                      className={`relative rounded-xl border bg-space-card p-5 space-y-4 flex flex-col ${
                        plan.is_popular
                          ? "border-neon-cyan/40 bg-neon-cyan/[0.03]"
                          : isCurrent
                          ? "border-neon-cyan/30 bg-neon-cyan/5"
                          : "border-neon-cyan/[0.08]"
                      }`}
                    >
                      {plan.is_popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <span className="bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40 text-[10px] rounded-full px-3 py-0.5 font-semibold">
                            ⭐ Popular
                          </span>
                        </div>
                      )}
                      {isCurrent && !plan.is_popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <span className="bg-space-el text-[#A0AEC0] border border-neon-cyan/20 text-[10px] rounded-full px-3 py-0.5 font-medium">
                            Plan actual
                          </span>
                        </div>
                      )}

                      <div className="pt-1">
                        <p className="text-sm font-semibold text-white">{plan.name}</p>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="font-display text-2xl font-bold text-white">{priceLabel}</span>
                          {plan.price_mxn > 0 && (
                            <span className="text-xs text-[#4A5568] font-normal">MXN/mes</span>
                          )}
                        </div>
                        {bimLabel && savePct && (
                          <p className="text-xs text-[#4A5568] mt-0.5">
                            {bimLabel} MXN bimestral —{" "}
                            <span className="text-neon-cyan font-medium">ahorra {savePct}</span>
                          </p>
                        )}
                        <p className="text-xs text-[#A0AEC0] font-medium mt-1">
                          {messagesLabel(plan.messages_limit)}
                        </p>
                      </div>

                      <ul className="space-y-1.5 flex-1">
                        {features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-xs text-[#4A5568]">
                            <Check className="h-3 w-3 text-neon-cyan shrink-0 mt-0.5" />{f}
                          </li>
                        ))}
                      </ul>

                      {!isCurrent && (
                        <Button
                          size="sm"
                          className={`w-full font-semibold mt-auto ${
                            plan.is_popular
                              ? "bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 hover:border-neon-cyan/50"
                              : plan.id === "enterprise"
                              ? "border border-neon-cyan/[0.08] bg-space-el text-[#A0AEC0] hover:border-neon-cyan/20 hover:text-white"
                              : "border border-neon-cyan/[0.08] bg-space-el text-[#A0AEC0] hover:border-neon-cyan/20 hover:text-white"
                          }`}
                          onClick={() => plan.id !== "enterprise" && checkout(plan.id)}
                          disabled={!!loadingCheckout}
                        >
                          {loadingCheckout === plan.id && <Loader2 className="h-3 w-3 animate-spin" />}
                          {plan.id === "enterprise" ? "Contactar ventas" : "Seleccionar plan"}
                        </Button>
                      )}
                      {isCurrent && (
                        <div className="text-center text-xs text-neon-cyan font-medium py-1">✓ Plan actual</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── EQUIPO ─────────────────────────────────────────────────── */}
          <TabsContent value="team" className="space-y-4">
            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
              <div className="p-5 border-b border-neon-cyan/[0.06]">
                <h3 className="text-sm font-semibold text-white">Miembros del equipo ({members.length})</h3>
              </div>
              <div className="p-5 space-y-2">
                {members.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-space-el border border-neon-cyan/[0.06]">
                    <div>
                      <p className="text-sm font-medium text-white">{m.profiles?.email ?? "—"}</p>
                      <p className="text-xs text-[#4A5568] capitalize">{m.role}</p>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full border bg-space-el text-[#A0AEC0] border-neon-cyan/[0.08] capitalize">
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
              <div className="p-5 border-b border-neon-cyan/[0.06]">
                <h3 className="text-sm font-semibold text-white">Invitar miembro</h3>
                <p className="text-xs text-[#4A5568] mt-0.5">El usuario debe crear su cuenta primero</p>
              </div>
              <div className="p-5 flex gap-2">
                <Input
                  placeholder="email@empresa.com"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] h-9 focus:border-neon-cyan/40"
                />
                <Button
                  size="sm"
                  className="bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 hover:border-neon-cyan/50 font-semibold shrink-0"
                  disabled={!inviteEmail}
                >
                  Invitar
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── ORGANIZACIÓN ───────────────────────────────────────────── */}
          <TabsContent value="org" className="space-y-4">
            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card">
              <div className="p-5 border-b border-neon-cyan/[0.06]">
                <h3 className="text-sm font-semibold text-white">Datos de la organización</h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#A0AEC0]">Nombre</Label>
                  <Input
                    defaultValue={org?.name ?? ""}
                    className="bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] h-9 focus:border-neon-cyan/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-[#A0AEC0]">Slug</Label>
                  <Input
                    defaultValue={org?.slug ?? ""}
                    disabled
                    className="bg-space-el border-neon-cyan/[0.08] text-[#4A5568] h-9 font-mono text-xs opacity-60"
                  />
                  <p className="text-xs text-[#4A5568]">El slug no puede modificarse</p>
                </div>
                <Button
                  size="sm"
                  className="bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 hover:border-neon-cyan/50 font-semibold"
                >
                  Guardar cambios
                </Button>
              </div>
            </div>

            <div className="border-t border-neon-cyan/[0.06]" />

            <div className="rounded-xl border border-neon-red/20 bg-neon-red/5">
              <div className="p-5 border-b border-neon-red/10">
                <h3 className="text-sm font-semibold text-neon-red">Zona de peligro</h3>
                <p className="text-xs text-[#4A5568] mt-0.5">Estas acciones son irreversibles</p>
              </div>
              <div className="p-5">
                <Button
                  size="sm"
                  className="bg-neon-red/10 border border-neon-red/30 text-neon-red hover:bg-neon-red/20 hover:border-neon-red/50 font-semibold"
                >
                  Eliminar organización
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* ── SEGURIDAD ─────────────────────────────────────────────────── */}
          <TabsContent value="security" className="space-y-6">

            {/* Security status */}
            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-neon-green/10 border border-neon-green/20">
                  <Shield className="h-5 w-5 text-neon-green" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Estado de seguridad</h3>
                  <p className="text-xs text-[#4A5568]">Resumen de protecciones activas en tu cuenta</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Lock,         label: "Autenticación JWT",          ok: true,  detail: "Tokens verificados en cada request" },
                  { icon: CheckCircle2, label: "Firmas de webhooks",         ok: true,  detail: "Meta + Slack verificados (HMAC-SHA256)" },
                  { icon: Eye,          label: "Rate limiting activo",       ok: true,  detail: "30 req/min chat · 200 req/15min API" },
                  { icon: Shield,       label: "Sanitización de inputs",     ok: true,  detail: "HTML strips en todos los mensajes" },
                  { icon: Lock,         label: "CORS estricto",              ok: true,  detail: "Whitelist de dominios configurada" },
                  { icon: CheckCircle2, label: "Headers de seguridad",       ok: true,  detail: "Helmet.js activo en producción" },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-3 p-3 rounded-lg bg-space-el border border-neon-cyan/[0.06]">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${item.ok ? "bg-neon-green/10" : "bg-red-500/10"}`}>
                      <item.icon className={`h-3.5 w-3.5 ${item.ok ? "text-neon-green" : "text-red-400"}`} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-white">{item.label}</p>
                      <p className="text-[10px] text-[#4A5568]">{item.detail}</p>
                    </div>
                    <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${item.ok ? "bg-neon-green/10 text-neon-green" : "bg-red-500/10 text-red-400"}`}>
                      {item.ok ? "OK" : "Revisar"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-neon-cyan/[0.08]">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#4A5568]" />
                  <h3 className="text-sm font-semibold text-white">Actividad reciente</h3>
                </div>
                <span className="text-[10px] text-[#4A5568]">Últimos 10 eventos de seguridad</span>
              </div>
              {auditLog.length === 0 ? (
                <div className="py-10 text-center">
                  <Shield className="h-8 w-8 text-[#4A5568] mx-auto mb-2" />
                  <p className="text-xs text-[#4A5568]">Sin eventos registrados aún</p>
                </div>
              ) : (
                <div className="divide-y divide-neon-cyan/[0.04]">
                  {auditLog.map((e: any) => (
                    <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${e.success ? "bg-neon-green/10" : "bg-red-500/10"}`}>
                        {e.success
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-neon-green" />
                          : <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white">{e.action}</p>
                        <p className="text-[10px] text-[#4A5568] truncate">{e.resource} {e.ip_address ? `· ${e.ip_address}` : ""}</p>
                      </div>
                      <span className="text-[10px] text-[#4A5568] shrink-0">
                        {new Date(e.created_at).toLocaleString("es-MX", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Session management */}
            <div className="rounded-xl border border-neon-cyan/[0.08] bg-space-card p-5">
              <h3 className="text-sm font-semibold text-white mb-1">Gestión de sesiones</h3>
              <p className="text-xs text-[#4A5568] mb-4">Cierra todas las sesiones activas en otros dispositivos</p>
              <Button
                size="sm"
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
                disabled={closingSession}
                onClick={async () => {
                  setClosingSession(true);
                  await supabase.auth.signOut({ scope: "global" });
                  setClosingSession(false);
                  window.location.href = "/login";
                }}
              >
                {closingSession && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
                Cerrar todas las sesiones
              </Button>
            </div>

          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
