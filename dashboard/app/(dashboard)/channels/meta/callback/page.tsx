"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

function MetaCallbackInner() {
  const searchParams = useSearchParams();
  const [status, setStatus]   = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Conectando con Meta...");

  useEffect(() => {
    async function handle() {
      const code  = searchParams.get("code");
      const state = searchParams.get("state");
      const err   = searchParams.get("error");

      if (err) {
        const desc = searchParams.get("error_description") || err;
        setStatus("error");
        setMessage(`Meta rechazó la autorización: ${desc}`);
        window.opener?.postMessage({ type: "meta_error", error: desc }, "*");
        return;
      }

      if (!code || !state) {
        setStatus("error");
        setMessage("Parámetros inválidos en la URL de callback.");
        return;
      }

      try {
        const parts = state.split("_");
        const orgId = parts[parts.length - 1];

        const result = await api.get(
          `/api/channels/meta/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
          orgId,
        );

        const savedCount  = result.savedChannels?.length ?? 0;
        const hasFacebook = result.savedChannels?.some((c: any) => c.type === "facebook");
        const noInstagram = result.noInstagram;

        let msg = savedCount > 0
          ? result.savedChannels.map((c: any) => c.type === "facebook" ? "Facebook" : "Instagram").join(" y ") + ` conectado${savedCount > 1 ? "s" : ""} exitosamente. Cerrando...`
          : "Sin canales guardados. Intenta de nuevo.";

        if (noInstagram && hasFacebook) {
          msg += " (Instagram no vinculado a esta página — ve a Configuración de Instagram → Cuenta → Cambiar a cuenta profesional)";
        }

        setStatus("success");
        setMessage(msg);

        window.opener?.postMessage(
          {
            type: "meta_connected",
            savedChannels: result.savedChannels ?? [],
            pages:         result.pages ?? [],
            agentId:       result.agentId,
            noInstagram:   result.noInstagram,
          },
          "*",
        );

        if (savedCount > 0) setTimeout(() => window.close(), 2000);
      } catch (e: any) {
        const msg = e.message || "Error al conectar con Meta";
        setStatus("error");
        setMessage(msg);
        window.opener?.postMessage({ type: "meta_error", error: msg }, "*");
      }
    }

    handle();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6">
      {status === "loading" && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
      {status === "success" && <CheckCircle2 className="h-10 w-10 text-emerald-500" />}
      {status === "error"   && <XCircle      className="h-10 w-10 text-destructive" />}
      <p className="text-sm text-muted-foreground max-w-xs text-center">{message}</p>
      {status === "error" && (
        <button
          onClick={() => window.close()}
          className="text-xs text-primary underline mt-2"
        >
          Cerrar ventana
        </button>
      )}
    </div>
  );
}

export default function MetaCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    }>
      <MetaCallbackInner />
    </Suspense>
  );
}
