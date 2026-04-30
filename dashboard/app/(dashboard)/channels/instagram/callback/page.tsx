"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

function InstagramCallbackInner() {
  const searchParams = useSearchParams();
  const [status, setStatus]   = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Conectando con Instagram...");

  useEffect(() => {
    const error      = searchParams.get("error");
    const igAccountId = searchParams.get("ig_account_id");
    const igUsername  = searchParams.get("ig_username");
    const agentId     = searchParams.get("agent_id");

    if (error) {
      setStatus("error");
      setMessage(error);
      window.opener?.postMessage({ type: "instagram_error", error }, "*");
      return;
    }

    if (igAccountId) {
      setStatus("success");
      setMessage(`@${igUsername || igAccountId} conectado. Cerrando...`);
      window.opener?.postMessage({ type: "instagram_connected", ig_account_id: igAccountId, ig_username: igUsername, agent_id: agentId }, "*");
      setTimeout(() => window.close(), 1500);
      return;
    }

    setStatus("error");
    setMessage("Parámetros inválidos en la URL de callback.");
    window.opener?.postMessage({ type: "instagram_error", error: "invalid_callback_params" }, "*");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 p-6">
      {status === "loading" && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
      {status === "success" && <CheckCircle2 className="h-10 w-10 text-emerald-500" />}
      {status === "error"   && <XCircle      className="h-10 w-10 text-destructive" />}
      <p className="text-sm text-muted-foreground max-w-xs text-center">{message}</p>
      {status === "error" && (
        <button onClick={() => window.close()} className="text-xs text-primary underline mt-2">
          Cerrar ventana
        </button>
      )}
    </div>
  );
}

export default function InstagramCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    }>
      <InstagramCallbackInner />
    </Suspense>
  );
}
