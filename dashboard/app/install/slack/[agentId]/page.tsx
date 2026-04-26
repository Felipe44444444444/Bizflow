"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const BACKEND = process.env.NEXT_PUBLIC_API_URL || "https://api.conectaachat.com";

function SlackLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
    </svg>
  );
}

interface InstallData {
  agent_name: string;
  company_name: string | null;
  install_url: string;
}

export default function SlackInstallPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const [data, setData]   = useState<InstallData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BACKEND}/api/integrations/slack/public-install/${agentId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("No se pudo cargar la información del asistente"));
  }, [agentId]);

  if (!data && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
          <p className="text-destructive font-medium">{error}</p>
          <p className="text-xs text-muted-foreground">El link de instalación puede haber expirado o ser inválido.</p>
        </div>
      </div>
    );
  }

  const displayName = data!.company_name || data!.agent_name;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full space-y-8 text-center">

        {/* Brand */}
        <div className="space-y-3">
          <div className="h-16 w-16 rounded-2xl bg-[#4A154B] flex items-center justify-center mx-auto shadow-lg">
            <SlackLogo />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{displayName}</h1>
            {data!.company_name && (
              <p className="text-sm text-muted-foreground mt-1">Asistente IA de {data!.company_name}</p>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="bg-card border border-border rounded-xl p-5 text-left space-y-3">
          <p className="text-sm font-medium">¿Qué podrás hacer?</p>
          <ul className="text-xs text-muted-foreground space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5">•</span>
              Escribe <strong>@{data!.agent_name}</strong> en cualquier canal para obtener respuestas instantáneas
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5">•</span>
              Envía mensajes directos al bot para consultas privadas
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 mt-0.5">•</span>
              Respuestas basadas en la información real de {displayName}
            </li>
          </ul>
        </div>

        {/* CTA */}
        <a href={data!.install_url} className="block">
          <Button
            size="lg"
            className="w-full gap-3 text-base h-12 bg-[#4A154B] hover:bg-[#3d1140] text-white"
          >
            <SlackLogo />
            Agregar a Slack
          </Button>
        </a>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Serás redirigido a Slack para autorizar la instalación.
          Solo se necesitan permisos de administrador del workspace.
        </p>

        {/* Powered by */}
        <p className="text-[10px] text-muted-foreground/50">
          Powered by <span className="font-medium">Conectachat</span>
        </p>
      </div>
    </div>
  );
}
