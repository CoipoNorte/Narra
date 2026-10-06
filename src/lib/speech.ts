/* ============================================================================
 * speech.ts — MOTOR DE TEXTO A VOZ (Web Speech API, 100 % navegador)
 * ----------------------------------------------------------------------------
 * La Web Speech API no permite "adelantar" dentro de una locución, así que
 * el truco profesional es TROCEAR el texto en frases y reproducir cada una
 * como un utterance independiente en cola. Con eso conseguimos:
 *   · adelante / atrás por frase   · barra de progreso clicable
 *   · resaltado de frase y palabra (onboundary)   · evita el bug de Chrome
 *     que corta utterances largos (~15 s) con voces remotas.
 * ==========================================================================*/

export interface Sentence { text: string; start: number; end: number }

const LIMITE = 220 // caracteres máximos por utterance

interface SegRaw { index: number; segment: string }

/** Segmentación por frases con Intl.Segmenter (fallback a regex). */
export function splitSentences(full: string): Sentence[] {
  const text = full.replace(/\r/g, '')
  if (!text.trim()) return []

  const brutos: Sentence[] = []
  const IntlSeg = (Intl as unknown as { Segmenter?: new (l: string, o: object) => { segment: (t: string) => Iterable<SegRaw> } }).Segmenter

  if (IntlSeg) {
    const seg = new IntlSeg(navigator.language || 'es', { granularity: 'sentence' })
    for (const s of seg.segment(text)) {
      const end = s.index + s.segment.length
      if (s.segment.trim()) brutos.push({ text: text.slice(s.index, end).trim(), start: s.index, end })
    }
  } else {
    const re = /[^.!?…\n]+[.!?…"')\]]*\s*/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (m[0].trim()) brutos.push({ text: m[0].trim(), start: m.index, end: m.index + m[0].length })
    }
  }

  // Divide frases excesivamente largas por comas / punto y coma / guiones
  const out: Sentence[] = []
  for (const s of brutos) {
    if (s.text.length <= LIMITE) { out.push(s); continue }
    let resto = s.text
    let offset = s.start
    while (resto.length > LIMITE) {
      let corte = Math.max(
        resto.lastIndexOf(', ', LIMITE), resto.lastIndexOf('; ', LIMITE),
        resto.lastIndexOf(': ', LIMITE), resto.lastIndexOf('— ', LIMITE),
        resto.lastIndexOf(' ', LIMITE),
      )
      if (corte < LIMITE * 0.4) corte = LIMITE
      const trozo = resto.slice(0, corte + 1).trim()
      if (trozo) out.push({ text: trozo, start: offset, end: offset + corte })
      resto = resto.slice(corte + 1)
      offset += corte + 1
    }
    if (resto.trim()) out.push({ text: resto.trim(), start: offset, end: offset + resto.length })
  }
  return out
}

/* --------------------------------- VOZ ----------------------------------- */
export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window
export const TASA_PALABRAS_MIN = 150 // ritmo natural de lectura en español

/** Voces disponibles (se cargan de forma asíncrona en la mayoría de browsers). */
export function getVoices(): SpeechSynthesisVoice[] {
  return speechSupported ? window.speechSynthesis.getVoices() : []
}

/** Español primero (todas sus variantes), luego el resto por idioma. */
export function voiceGroups(voices: SpeechSynthesisVoice[]) {
  const es = voices.filter((v) => /^es([-_]|$)/i.test(v.lang))
  const resto = voices
    .filter((v) => !/^es([-_]|$)/i.test(v.lang))
    .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name))
  return { espanol: es, otras: resto }
}

/** Voz por defecto: español (ES) > cualquier español > voz por defecto del SO. */
export function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return (
    voices.find((v) => /^es[-_]es/i.test(v.lang)) ??
    voices.find((v) => /^es([-_]|$)/i.test(v.lang)) ??
    voices.find((v) => v.default) ??
    voices[0] ??
    null
  )
}

/* ------------------------------- ESTIMACIÓN ------------------------------- */
export const countWords = (t: string) => t.trim().split(/\s+/).filter(Boolean).length

/** Duración estimada en segundos ajustada por la velocidad. */
export function estimateSeconds(text: string, rate: number): number {
  if (!text.trim()) return 0
  return (countWords(text) / (TASA_PALABRAS_MIN * rate)) * 60
}

export function formatSecs(total: number): string {
  const s = Math.max(0, Math.round(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/* ------------------------------- TEXTOS DEMO ------------------------------ */
export const SAMPLES: { id: string; nombre: string; texto: string }[] = [
  {
    id: 'poema',
    nombre: 'Poema',
    texto: 'La voz sale del papel como el humo de una lámpara. Cada palabra, una brasa pequeña; cada pausa, un lugar donde se apoya la mirada. Leer en voz alta es devolverle al texto su cuerpo: el aire que le faltaba, el pulso que esperaba. La página se queda quieta, pero la habitación entera empieza a moverse.',
  },
  {
    id: 'noticia',
    nombre: 'Noticia',
    texto: 'La biblioteca municipal abrirá sus puertas durante toda la noche del próximo viernes. La programación incluye lecturas dramatizadas, un taller de podcast para principiantes y una maratón de relatos cortos que comenzará a medianoche. La entrada es gratuita y no requiere inscripción previa. Los asistentes podrán traer sus propios textos y grabarlos en la cabina de voz instalada en la planta baja.',
  },
  {
    id: 'guia',
    nombre: 'Guía exprés',
    texto: 'Pega cualquier texto en el guion de la izquierda. Elige una voz del panel de la derecha y ajusta la velocidad a tu gusto. Pulsa reproducir y la lectura comenzará la frase. Puedes adelantar o retroceder con las flechas, tocar cualquier punto de la barra de progreso, o hacer clic directamente sobre una frase resaltada. El botón detener devuelve el guion a su estado editable.',
  },
]
