"use client";
export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email,         setEmail]         = useState("");
  const [password,      setPassword]      = useState("");
  const [loading,       setLoading]       = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error,         setError]         = useState("");
  const [mode,          setMode]          = useState<"login" | "signup">("login");
  const [success,       setSuccess]       = useState("");
  const router   = useRouter();
  const supabase = createClient();

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(error.message); setLoading(false); return; }
        router.push("/dashboard");
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) { setError(error.message); setLoading(false); return; }
        if (data.session) {
          router.push("/dashboard");
        } else {
          setSuccess("¡Cuenta creada! Revisa tu email para confirmar y luego inicia sesión.");
          setLoading(false);
        }
      }
    } catch {
      setError("Error inesperado. Intenta de nuevo.");
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "https://app.conectaachat.com/auth/callback" },
    });
    if (error) { setError(error.message); setGoogleLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-space">
      {/* Ambient blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-48 -right-48 h-96 w-96 rounded-full bg-neon-cyan/10 blur-[100px]" />
        <div className="absolute -bottom-48 -left-48 h-96 w-96 rounded-full bg-neon-purple/10 blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-neon-pink/5 blur-[80px]" />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: "linear-gradient(rgba(0,245,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative w-full max-w-sm px-4">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-neon-cyan/10 border border-neon-cyan/20">
            <Zap className="h-5 w-5 text-neon-cyan" />
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-neon-cyan animate-pulse-glow border-2 border-space" />
          </div>
          <span className="font-display text-2xl font-bold text-white">Conectachat</span>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-neon-cyan/15 bg-space-card p-7 space-y-5"
          style={{ boxShadow: "0 0 60px rgba(0,245,255,0.04), 0 24px 48px rgba(0,0,0,0.5)" }}>
          <div className="text-center space-y-1">
            <h1 className="font-display text-xl font-bold text-white">
              {mode === "login" ? "Bienvenido de vuelta" : "Crear cuenta gratis"}
            </h1>
            <p className="text-sm text-[#A0AEC0]">
              {mode === "login" ? "Accede a tu dashboard" : "Sin tarjeta de crédito"}
            </p>
          </div>

          {/* Google OAuth */}
          <Button
            variant="outline"
            className="w-full border-neon-cyan/15 bg-space-el hover:bg-space-hover hover:border-neon-cyan/30 text-white h-10 font-medium"
            onClick={handleGoogle}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-neon-cyan" />
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4 mr-2">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            Continuar con Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neon-cyan/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-space-card px-3 text-[#4A5568]">o con email</span>
            </div>
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-[#A0AEC0]">Email</Label>
              <Input
                type="email"
                placeholder="tu@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] h-10 focus:border-neon-cyan/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-[#A0AEC0]">Contraseña</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-space-el border-neon-cyan/15 text-white placeholder-[#4A5568] h-10 focus:border-neon-cyan/40"
              />
            </div>

            {error && (
              <p className="text-xs text-neon-red bg-neon-red/10 border border-neon-red/20 rounded-lg p-3">
                {error}
              </p>
            )}
            {success && (
              <p className="text-xs text-neon-green bg-neon-green/10 border border-neon-green/20 rounded-lg p-3">
                {success}
              </p>
            )}

            <Button
              type="submit"
              className="w-full h-10 bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 hover:border-neon-cyan/50 font-semibold transition-all"
              disabled={loading}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
            </Button>
          </form>

          <p className="text-center text-xs text-[#4A5568]">
            {mode === "login" ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
            <button
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setSuccess(""); }}
              className="text-neon-cyan hover:underline font-medium"
            >
              {mode === "login" ? "Crear cuenta" : "Iniciar sesión"}
            </button>
          </p>
        </div>

        <p className="text-center text-[10px] text-[#4A5568] mt-6">
          Al continuar aceptas nuestros{" "}
          <a href="https://conectaachat.com/terms" className="hover:text-neon-cyan transition-colors">Términos</a>
          {" "}y{" "}
          <a href="https://conectaachat.com/privacy" className="hover:text-neon-cyan transition-colors">Privacidad</a>
        </p>
      </div>
    </div>
  );
}
