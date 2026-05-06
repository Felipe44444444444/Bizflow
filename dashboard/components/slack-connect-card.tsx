"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, X } from "lucide-react";

function SlackLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  );
}

interface SlackStatus {
  connected: boolean;
  team_name: string | null;
}

function SlackConnectInner({ orgId }: { orgId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Handle ?slack=connected and ?slack_error=... query params
  useEffect(() => {
    const connected = searchParams.get("slack");
    const errMsg    = searchParams.get("slack_error");

    if (connected === "connected") {
      showToast("Slack conectado correctamente", true);
      router.replace("/dashboard");
    } else if (errMsg) {
      showToast(`Error al conectar Slack: ${errMsg}`, false);
      router.replace("/dashboard");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load connection status
  useEffect(() => {
    api.get("/api/integrations/slack/status", orgId)
      .then((d: SlackStatus) => setStatus(d))
      .catch(() => setStatus({ connected: false, team_name: null }));
  }, [orgId]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function connect() {
    setConnecting(true);
    try {
      const { url } = await api.get("/api/integrations/slack/connect", orgId);
      window.location.href = url;
    } catch (e: any) {
      showToast(e.message ?? "No se pudo iniciar la conexión", false);
      setConnecting(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    try {
      await api.del("/api/integrations/slack", orgId);
      setStatus({ connected: false, team_name: null });
      showToast("Slack desconectado", true);
    } catch (e: any) {
      showToast(e.message ?? "Error al desconectar", false);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg bg-card ${
          toast.ok ? "border-emerald-500/30 text-emerald-400" : "border-destructive/30 text-destructive"
        }`}>
          {toast.ok
            ? <CheckCircle2 className="h-4 w-4 shrink-0" />
            : <X className="h-4 w-4 shrink-0" />}
          {toast.msg}
        </div>
      )}

      <Card className={status?.connected ? "border-emerald-500/30 bg-emerald-500/5" : ""}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <SlackLogo />
              Slack
            </span>
            {status?.connected && (
              <Badge variant="success" className="text-[10px]">Conectado</Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs">
            Recibe y responde mensajes de Slack con tu agente IA
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!status ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : status.connected ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                {status.team_name}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:text-destructive h-7 px-2"
                onClick={disconnect}
                disabled={disconnecting}
              >
                {disconnecting
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <X className="h-3 w-3 mr-1" />}
                Desconectar
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={connect} disabled={connecting} className="gap-2">
              {connecting
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <SlackLogo />}
              Conectar Slack
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function SlackConnectCard({ orgId }: { orgId: string }) {
  return (
    <Suspense fallback={null}>
      <SlackConnectInner orgId={orgId} />
    </Suspense>
  );
}
