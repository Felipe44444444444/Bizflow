// Shared prompts and types for onboarding documents
// Used by: app/(dashboard)/agency/docs/page.tsx
//          app/(dashboard)/agency/onboarding/page.tsx

export interface ProjectConfig {
  razon_social: string; rfc: string; domicilio: string; ciudad: string;
  representante_legal: string; telefono_contacto: string; email_contacto: string;
  servicios_seleccionados: string[];
  setup_fee: string; monthly_fee: string; payment_method: string;
  payment_day: string; contract_duration: string; penalty_clause: string;
  fecha_inicio: string;
  agencia_nombre: string; agencia_rfc: string; agencia_domicilio: string;
  agencia_ciudad: string; agencia_representante: string; agencia_email: string;
  agencia_banco: string; agencia_cuenta: string; agencia_clabe: string; agencia_titular: string;
}

export interface ClientBasic {
  id: string; name: string; email?: string | null; phone?: string | null;
  company?: string | null; industry?: string | null; plan?: string | null;
  monthly_revenue?: number | null; notes?: string | null;
}

export interface DiscoveryData {
  descripcion_negocio: string;
  producto_estrella: string;
  cliente_ideal: string;
  competidores: string;
  diferenciador: string;
  objetivo_principal: string;
  presupuesto_ads: string;
  canales_actuales: string;
  resultados_30_dias: string;
  resultados_90_dias: string;
}

export const ONBOARDING_STEPS = [
  { number: 1, name: "Contrato",            description: "Contrato de prestación de servicios profesional",  icon: "📄", clientVisible: true  },
  { number: 2, name: "Factura",             description: "Factura inicial con IVA desglosado",                icon: "🧾", clientVisible: true  },
  { number: 3, name: "Welcome Document",    description: "Bienvenida y acceso al portal del cliente",         icon: "👋", clientVisible: true  },
  { number: 4, name: "Discovery Form",      description: "Cuestionario de descubrimiento del negocio",        icon: "🔍", clientVisible: false },
  { number: 5, name: "Setup de Estrategia", description: "Diagnóstico y plan de acción digital",              icon: "⚙️", clientVisible: true  },
  { number: 6, name: "Kickoff",             description: "Agenda para la llamada de activación",              icon: "🚀", clientVisible: true  },
] as const;

export type OnboardingStep = typeof ONBOARDING_STEPS[number];

export function parseConfig(notes: string | null | undefined): ProjectConfig | null {
  if (!notes) return null;
  try {
    const p = JSON.parse(notes);
    if (p?.razon_social) return p as ProjectConfig;
  } catch {}
  return null;
}

const FORMAT_INST = `

FORMATO OBLIGATORIO: Escribe en texto corrido profesional. NO uses markdown, hashtags (#), asteriscos (*), backticks (\`), code blocks (\`\`\`), viñetas con guion (-), ni emojis. Para titulos usa MAYUSCULAS. Para listas usa letras: a), b), c). Para separar secciones usa una linea en blanco. El documento debe leerse como si lo redacto un profesional, no una inteligencia artificial.

PROHIBIDO: corchetes [], campos sin llenar, texto placeholder como "[especificar]", "[banco]", "[nombre]" o similares. Si falta un dato, omite esa linea en lugar de dejarla con placeholder. Usa UNICAMENTE los datos proporcionados arriba, completos y sin modificar.`;

export function buildPrompt(step: number, cfg: ProjectConfig, client: ClientBasic): string {
  const svcs = cfg.servicios_seleccionados.join(", ") || "servicios de marketing digital";
  const now  = new Date();
  const mes  = now.toLocaleDateString("es-MX", { month: "long", year: "numeric" });

  if (step === 1) return `Genera un Contrato de Prestacion de Servicios Profesionales de Marketing Digital y Tecnologia conforme a la legislacion mexicana vigente (Codigo Civil Federal, Codigo de Comercio, LFPDPPP).

NO uses formato markdown, asteriscos, corchetes ni simbolos especiales. Solo texto corrido con numeracion legal en mayusculas.

DATOS DEL CLIENTE:
Razon Social: ${cfg.razon_social}
RFC: ${cfg.rfc}
Domicilio: ${cfg.domicilio}
Ciudad: ${cfg.ciudad}
Representante Legal: ${cfg.representante_legal}
Email: ${cfg.email_contacto}
Telefono: ${cfg.telefono_contacto}

DATOS DE LA AGENCIA:
Razon Social: ${cfg.agencia_nombre}
RFC: ${cfg.agencia_rfc}
Domicilio: ${cfg.agencia_domicilio}
Ciudad: ${cfg.agencia_ciudad}
Representante Legal: ${cfg.agencia_representante}
Email: ${cfg.agencia_email}

SERVICIOS CONTRATADOS: ${svcs}

CONDICIONES ECONOMICAS:
Fee de implementacion: $${cfg.setup_fee} MXN (pago unico)
Mensualidad: $${cfg.monthly_fee} MXN + IVA
Metodo de pago: ${cfg.payment_method}
Dia de pago: ${cfg.payment_day} de cada mes
Duracion del contrato: ${cfg.contract_duration}
Penalizacion por cancelacion anticipada: ${cfg.penalty_clause}

ESTRUCTURA OBLIGATORIA (clausulas en mayusculas):
DECLARACIONES del Cliente, de la Agencia y conjunta.
PRIMERA. Objeto — SEGUNDA. Alcance (incluye y NO incluye) — TERCERA. Obligaciones de la agencia (SLA 24-48h, reportes mensuales) — CUARTA. Obligaciones del cliente — QUINTA. Contraprestacion y pago (interes moratorio TIIE+6pts) — SEXTA. Vigencia — SEPTIMA. Terminacion anticipada — OCTAVA. Propiedad intelectual — NOVENA. Confidencialidad y LFPDPPP — DECIMA. Limitacion de responsabilidad — DECIMA PRIMERA. Fuerza mayor — DECIMA SEGUNDA. Jurisdiccion Chihuahua — DECIMA TERCERA. Notificaciones — DECIMA CUARTA. Integralidad.

Al final incluye la seccion FIRMAS con campos para nombre, cargo, fecha y firma de ambas partes (Representante del Cliente: ${cfg.representante_legal} y Representante de la Agencia: ${cfg.agencia_representante}).${FORMAT_INST}`;

  if (step === 2) return `Genera una factura profesional de servicios para:

EMISOR: ${cfg.agencia_nombre} | RFC: ${cfg.agencia_rfc} | ${cfg.agencia_domicilio}
RECEPTOR: ${cfg.razon_social} | RFC: ${cfg.rfc} | ${cfg.domicilio}

Numero de factura: XENT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-001
Fecha de emision: ${now.toLocaleDateString("es-MX")}
Fecha de vencimiento: dia ${cfg.payment_day} del mes actual
Metodo de pago: ${cfg.payment_method}

SERVICIOS:
Fee de implementacion: $${cfg.setup_fee} MXN
Mensualidad ${mes}: $${cfg.monthly_fee} MXN
Incluye: ${svcs}

DATOS BANCARIOS PARA TRANSFERENCIA:
Banco: ${cfg.agencia_banco || cfg.agencia_nombre}
Numero de cuenta: ${cfg.agencia_cuenta}
CLABE interbancaria: ${cfg.agencia_clabe}
Titular: ${cfg.agencia_titular || cfg.agencia_representante}

ESTRUCTURA: tabla con columnas Concepto, Cantidad, Precio Unitario, Importe. Luego subtotal, IVA 16%, TOTAL en MXN. Incluye los datos bancarios completos para transferencia. NO dejes ningun campo con corchetes ni placeholder.${FORMAT_INST}`;

  if (step === 3) return `Genera un documento de bienvenida profesional y calido para:

Cliente: ${cfg.razon_social}${client.company ? ` (${client.company})` : ""}
Contacto: ${cfg.representante_legal}
Servicios contratados: ${svcs}
Mensualidad: $${cfg.monthly_fee} MXN/mes

ESTRUCTURA:
1. Bienvenida personalizada de ${cfg.agencia_nombre} a ${cfg.representante_legal}
2. Presentacion del equipo XENTTECH y roles
3. Servicios que recibiras: lista con frecuencias y entregables por servicio
4. Canales de comunicacion: WhatsApp business, email ${cfg.agencia_email}, portal xenttech.com
5. SLA de respuesta por canal y prioridad
6. Tu portal de cliente: acceso a xenttech.com con token personal, secciones disponibles
7. Proceso de onboarding: timeline de los proximos 14 dias paso a paso
8. Primeros pasos: accesos e informacion que necesitamos del cliente para arrancar

Tono profesional y cercano.${FORMAT_INST}`;

  if (step === 5) return `Genera un documento de Setup de Estrategia Digital para:

Cliente: ${cfg.razon_social}${client.company ? ` (${client.company})` : ""}
Industria: ${client.industry ?? "por definir"}
Servicios: ${svcs}
Presupuesto mensual: $${cfg.monthly_fee} MXN

ESTRUCTURA:
1. DIAGNOSTICO INICIAL: analisis de presencia digital, benchmarking 3 competidores, oportunidades inmediatas
2. OBJETIVOS SMART a 30/60/90 dias con KPIs por cada servicio contratado
3. HERRAMIENTAS Y STACK TECNOLOGICO que se utilizara
4. CRONOGRAMA semana a semana (semanas 1-4)
5. ACCESOS REQUERIDOS DEL CLIENTE por servicio contratado
6. METRICAS Y FORMATO DE REPORTE mensual

${FORMAT_INST}`;

  if (step === 6) return `Genera la agenda completa para la Llamada de Kickoff con:

Cliente: ${cfg.razon_social}${client.company ? ` (${client.company})` : ""}
Contacto: ${cfg.representante_legal}
Servicios: ${svcs}

ESTRUCTURA (60 minutos total):
1. APERTURA (5 min): bienvenida, presentacion del equipo, objetivo de la sesion
2. DESCUBRIMIENTO DEL NEGOCIO (15 min): 8 preguntas sobre producto, cliente ideal, diferenciador, ticket promedio, proceso de venta
3. PRESENCIA DIGITAL ACTUAL (10 min): revision de redes sociales, web, campanas previas
4. DEFINICION DE OBJETIVOS (10 min): resultados a 30 y 90 dias, metrica principal
5. PLAN DE ACCION (15 min): estrategia propuesta, timeline, primeros pasos
6. ACUERDOS Y COMPROMISOS (5 min): accesos/materiales requeridos, fechas, proxima reunion

DURACION: 60 minutos — Videollamada
POST-LLAMADA: acciones del equipo XENTTECH en las siguientes 24 horas.${FORMAT_INST}`;

  return `Genera contenido profesional para el paso ${step} del onboarding del cliente ${cfg.razon_social} de ${cfg.agencia_nombre}.${FORMAT_INST}`;
}
