export const RETARGETING_TEMPLATES = {

  vendedor_suave: {
    name: 'Seguimiento suave',
    description: 'Amigable, sin presión',
    icon: '💬',
    messages: [
      'Hola {nombre}, solo quería saber si tienes alguna duda sobre lo que platicamos. Estoy aquí por si necesitas algo.',
      '¿Todo bien {nombre}? A veces se va el hilo de la conversación. Cuéntame en qué te puedo ayudar.',
      'Oye {nombre}, por si se te fue el mensaje — seguimos aquí cuando quieras retomar.',
    ],
  },

  urgencia_real: {
    name: 'Urgencia real',
    description: 'Crea sentido de oportunidad sin mentir',
    icon: '⏰',
    messages: [
      'Hola {nombre}, te escribo porque los lugares de esta semana ya casi se llenan. ¿Quieres que te aparte uno?',
      '{nombre}, esta semana cerramos los últimos cupos del mes. ¿Seguimos adelante o lo dejamos para después?',
      'Solo para avisarte {nombre} — la oferta que te comenté vence el viernes. ¿Te interesa aprovecharla?',
    ],
  },

  valor_agregado: {
    name: 'Valor agregado',
    description: 'Aporta algo útil antes de pedir',
    icon: '🎁',
    messages: [
      'Hola {nombre}, te mando esto por si te es útil mientras decides: muchos clientes nos preguntan exactamente lo mismo que tú. ¿Te cuento cómo lo resolvieron?',
      '{nombre}, ¿sabías que la mayoría de negocios como el tuyo ven resultados en las primeras 2 semanas? Solo quería compartirte eso.',
      'Oye {nombre}, se me ocurrió algo que podría funcionarte bien según lo que me platicaste. ¿Tienes 2 minutos?',
    ],
  },

  cierre_directo: {
    name: 'Cierre directo',
    description: 'Va al grano, para leads calientes',
    icon: '🎯',
    messages: [
      'Hola {nombre}, ¿seguimos adelante o prefieres que lo dejemos para otra ocasión?',
      '{nombre}, ¿qué necesitas para tomar la decisión? Dime y lo resolvemos.',
      'Solo una pregunta rápida {nombre}: ¿qué te falta saber para dar el siguiente paso?',
    ],
  },

  reactivacion: {
    name: 'Reactivación fría',
    description: 'Para leads que llevan días sin responder',
    icon: '🔥',
    messages: [
      'Hola {nombre}, hace unos días platicamos pero se nos fue el mensaje. ¿Sigue siendo buen momento para retomar?',
      '{nombre}, te escribo porque nuestros números mejoraron desde que hablamos. ¿Te cuento las novedades?',
      'Oye {nombre}, sin compromiso — ¿sigue siendo algo que te interesa o ya no es prioridad? Con que me digas sí o no está bien.',
    ],
  },

  whatsapp_casual: {
    name: 'Estilo WhatsApp',
    description: 'Muy informal, como un conocido',
    icon: '📱',
    messages: [
      'Oye {nombre} 👋 ¿cómo vas?',
      '{nombre} por acá, ¿te quedó alguna duda de lo que hablamos?',
      'Ei {nombre}, ¿qué onda? ¿Pudiste pensarlo?',
    ],
  },

} as const

// ── Closing messages — bot uses these to ask for contact data ─────────────────

export const CLOSING_MESSAGES = [
  '¿Te parece que agendemos una llamada? Solo necesito tu nombre y teléfono.',
  'Para darte más información personalizada, ¿me compartes tu nombre y número?',
  'Si quieres que te llame uno de nuestros asesores, dime tu nombre y teléfono.',
  '¿Agendamos? Dime tu nombre y número y te contactamos hoy mismo.',
  'Para seguir adelante solo necesito tu nombre y teléfono. ¿Me los compartes?',
]

export type TemplateKey = keyof typeof RETARGETING_TEMPLATES

export const DEFAULT_TEMPLATE_KEY: TemplateKey = 'vendedor_suave'

export function getTemplateMessages(templateKey: string): string[] {
  const key = templateKey as TemplateKey
  return key in RETARGETING_TEMPLATES
    ? [...RETARGETING_TEMPLATES[key].messages]
    : [...RETARGETING_TEMPLATES[DEFAULT_TEMPLATE_KEY].messages]
}
