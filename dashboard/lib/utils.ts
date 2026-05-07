import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function getDisplayName(conv: {
  contact_name?: string | null;
  source_channel?: string | null;
  external_id?: string | null;
}): string {
  if (conv.contact_name) return conv.contact_name;
  const ch = conv.source_channel || "canal";
  const label = ch.charAt(0).toUpperCase() + ch.slice(1);
  if (conv.external_id) return `${label} #${conv.external_id.slice(-4)}`;
  return `Usuario ${label}`;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatRelative(date: string | Date) {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}
