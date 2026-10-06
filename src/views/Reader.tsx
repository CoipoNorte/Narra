/* ============================================================================
 * Reader.tsx — NARRA · Lector de texto a voz (vista única)
 * ----------------------------------------------------------------------------
 * Motor: Web Speech API (speechSynthesis) — gratis, offline y sin backend.
 * La API no permite "buscar" dentro de una locución; por eso troceamos el
 * texto en frases (src/lib/speech.ts) y encadenamos utterances:
 *   ▸ play/pausa ▸ anterior/siguiente ▸ saltar por barra o por clic en frase
 *   ▸ resaltado de frase + palabra (onboundary) ▸ velocidad/tono/volumen
 * ==========================================================================*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Play, Pause, Square, SkipBack, SkipForward, ClipboardPaste, Eraser,
  AudioLines, ChevronDown, Gauge, Mic, Volume2, Waves, Newspaper, Feather,
  Compass, TriangleAlert, CircleCheck,
} from 'lucide-react'
import {
  splitSentences, getVoices, voiceGroups, pickDefaultVoice,
  speechSupported, countWords, estimateSeconds, formatSecs, SAMPLES,
} from '@/lib/speech'
import type { Sentence } from '@/lib/speech'
import { cn } from '@/utils/cn'

type Status = 'idle' | 'playing' | 'paused'
const MAX_CHARS = 24000
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/* ============================== Ecualizador ================================ */
function Eq({ active, rate }: { active: boolean; rate: number }) {
  return (
    <div className={cn('hidden h-8 items-end gap-[3px] sm:flex', active && 'eq-activo')} aria-hidden>
      {[...Array(16)].map((_, i) => (
        <span
          key={i}
          className="eq-bar bg-signal"
          style={{
            height: `${22 + Math.sin(i * 1.1) * 26 + (i % 3) * 14}%`,
            animationDuration: `${(0.55 + (i % 5) * 0.12) / rate}s`,
            animationDelay: `${(i * 0.07) % 0.6}s`,
            opacity: 0.45 + ((i * 13) % 40) / 100,
          }}
        />
      ))}
    </div>
  )
}

/* ============================ Selector de voz ============================== */
function VoiceSelect({ voices, value, onChange, disabled }: {
  voices: SpeechSynthesisVoice[]; value: string; onChange: (uri: string) => void; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const { espanol, otras } = voiceGroups(voices)
  const sel = voices.find((v) => v.voiceURI === value)
  const filtradas = query
    ? voices.filter((v) => `${v.name} ${v.lang}`.toLowerCase().includes(query.toLowerCase()))
    : null

  const Row = ({ v }: { v: SpeechSynthesisVoice }) => (
    <button
      key={v.voiceURI + v.name}
      onClick={() => { onChange(v.voiceURI); setOpen(false); setQuery('') }}
      className={cn(
        'flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-left text-[13px] transition-colors hover:bg-raise',
        v.voiceURI === value ? 'text-signal' : 'text-cream/90',
      )}
    >
      <span className="truncate">{v.name.replace(/^Microsoft |^Google /, '')}</span>
      <span className="shrink-0 rounded border border-edge px-1.5 py-0.5 font-mono text-[9px] uppercase text-fog">{v.lang}</span>
    </button>
  )

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-edge bg-raise/60 px-3.5 py-3 text-left transition-colors hover:border-edge2',
          disabled && 'cursor-not-allowed opacity-40',
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Mic className="size-4 shrink-0 text-signal" />
          <span className="truncate text-sm font-medium">{sel ? sel.name.replace(/^Microsoft |^Google /, '') : 'Cargando voces…'}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {sel && <span className="rounded border border-edge px-1.5 py-0.5 font-mono text-[9px] uppercase text-fog">{sel.lang}</span>}
          <ChevronDown className={cn('size-4 text-fog transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-edge bg-coal shadow-2xl shadow-black/60"
          >
            <div className="border-b border-edge p-2.5">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar voz o idioma…"
                className="w-full rounded-lg border border-edge bg-raise/60 px-3 py-2 text-[13px] text-cream outline-none placeholder:text-fog/60 focus:border-signal/50"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filtradas ? (
                filtradas.length ? filtradas.map((v) => <Row key={v.voiceURI + v.name} v={v} />) : (
                  <p className="p-4 text-center font-mono text-[11px] text-fog">Sin resultados</p>
                )
              ) : (
                <>
                  <p className="px-3.5 pb-1 pt-3 font-mono text-[9px] uppercase tracking-[0.24em] text-signal">Español</p>
                  {espanol.map((v) => <Row key={v.voiceURI + v.name} v={v} />)}
                  {espanol.length === 0 && <p className="px-3.5 pb-2 text-[12px] text-fog">Sin voces en español en este navegador</p>}
                  <p className="px-3.5 pb-1 pt-3 font-mono text-[9px] uppercase tracking-[0.24em] text-fog">Otros idiomas</p>
                  {otras.map((v) => <Row key={v.voiceURI + v.name} v={v} />)}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ============================ Fila de fader ================================ */
function Fader({ label, icon: Icon, value, min, max, step, readout, onChange }: {
  label: string; icon: React.ElementType; value: number; min: number; max: number; step: number
  readout: string; onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-fog">
          <Icon className="size-3.5 text-signal" /> {label}
        </span>
        <span className="font-mono text-[13px] font-semibold text-cream">{readout}</span>
      </div>
      <input
        type="range" className="fader" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  )
}

/* ================================ VISTA ==================================== */
export default function Reader() {
  /* ------------------------------ estado base ----------------------------- */
  const [text, setText] = useState('')
  const sentences = useMemo(() => splitSentences(text), [text])
  const [status, setStatus] = useState<Status>('idle')
  const [idx, setIdx] = useState(0)
  const [wordSpan, setWordSpan] = useState<{ s: number; e: number } | null>(null)

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceURI, setVoiceURI] = useState<string>('')
  const [rate, setRate] = useState(1)
  const [pitch, setPitch] = useState(1)
  const [volume, setVolume] = useState(1)
  const [toast, setToast] = useState<{ id: number; msg: string } | null>(null)

  /* refs espejo: los callbacks de speechSynthesis son asíncronos */
  const sentencesRef = useRef<Sentence[]>([]); sentencesRef.current = sentences
  const statusRef = useRef<Status>('idle'); statusRef.current = status
  const idxRef = useRef(0); idxRef.current = idx
  const rateRef = useRef(rate); rateRef.current = rate
  const pitchRef = useRef(pitch); pitchRef.current = pitch
  const volRef = useRef(volume); volRef.current = volume
  const voicesRef = useRef(voices); voicesRef.current = voices
  const voiceURIRef = useRef(voiceURI); voiceURIRef.current = voiceURI
  const genRef = useRef(0)          // invalida callbacks de utterances antiguos
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null) // evita GC de Chrome
  const viewRef = useRef<HTMLDivElement>(null)

  const pushToast = useCallback((msg: string) => {
    const id = Date.now()
    setToast({ id, msg })
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2800)
  }, [])

  /* ------------------------------ cargar voces ---------------------------- */
  useEffect(() => {
    if (!speechSupported) return
    const load = () => {
      const vs = getVoices()
      setVoices(vs)
      setVoiceURI((cur) => (cur && vs.some((v) => v.voiceURI === cur) ? cur : pickDefaultVoice(vs)?.voiceURI ?? ''))
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  /* -------------------------------- motor --------------------------------- */
  const speakFrom = useCallback((i: number) => {
    const sents = sentencesRef.current
    if (!speechSupported || sents.length === 0) return
    const target = clamp(i, 0, sents.length - 1)
    const g = ++genRef.current
    window.speechSynthesis.cancel()
    setIdx(target); idxRef.current = target
    const s = sents[target]

    const u = new SpeechSynthesisUtterance(s.text)
    const v = voicesRef.current.find((x) => x.voiceURI === voiceURIRef.current)
    if (v) { u.voice = v; u.lang = v.lang } else u.lang = 'es-ES'
    u.rate = rateRef.current
    u.pitch = pitchRef.current
    u.volume = volRef.current

    setWordSpan(null)
    u.onboundary = (e) => {
      if (genRef.current !== g) return
      const anyEv = e as SpeechSynthesisEvent & { charLength?: number }
      const rest = s.text.slice(e.charIndex)
      const finPalabra = rest.search(/[\s,.;:!?…"'()]/u)
      const len = anyEv.charLength && anyEv.charLength > 0
        ? anyEv.charLength
        : finPalabra > 0 ? finPalabra : rest.length
      setWordSpan({ s: e.charIndex, e: e.charIndex + len })
    }
    u.onend = () => {
      if (genRef.current !== g) return
      const next = target + 1
      if (next < sents.length) {
        speakFrom(next)
      } else {
        genRef.current++
        statusRef.current = 'idle'; setStatus('idle')
        setIdx(0); idxRef.current = 0; setWordSpan(null)
      }
    }
    u.onerror = (ev) => {
      if (genRef.current !== g) return
      const code = (ev as SpeechSynthesisErrorEvent).error
      if (code === 'interrupted' || code === 'canceled') return
      statusRef.current = 'idle'; setStatus('idle')
      pushToast('Esa voz falló — prueba con otra del selector')
    }

    statusRef.current = 'playing'; setStatus('playing')
    utterRef.current = u
    window.speechSynthesis.speak(u)
  }, [pushToast])

  const play = useCallback(() => {
    if (!speechSupported) { pushToast('Tu navegador no soporta síntesis de voz — usa Chrome o Edge'); return }
    if (sentencesRef.current.length === 0) { pushToast('Pega o escribe un texto primero'); return }
    speakFrom(idxRef.current)
  }, [speakFrom, pushToast])

  const pause = useCallback(() => {
    // Pausa robusta: cancelar y reanudar desde la frase actual (speechSynthesis.
    // pause() es poco fiable con voces remotas; a nivel de frase es exacto).
    genRef.current++
    window.speechSynthesis.cancel()
    statusRef.current = 'paused'; setStatus('paused')
  }, [])

  const stop = useCallback(() => {
    genRef.current++
    window.speechSynthesis.cancel()
    statusRef.current = 'idle'; setStatus('idle')
    setIdx(0); idxRef.current = 0; setWordSpan(null)
  }, [])

  const toggle = useCallback(() => {
    if (statusRef.current === 'playing') pause()
    else play()
  }, [play, pause])

  /** Saltar a una frase (adelante/atrás/barra/clic en el texto). */
  const jump = useCallback((i: number) => {
    const len = sentencesRef.current.length
    if (!len) return
    const ni = clamp(i, 0, len - 1)
    if (statusRef.current === 'playing') { speakFrom(ni); return }
    genRef.current++
    window.speechSynthesis.cancel()
    statusRef.current = statusRef.current === 'paused' ? 'paused' : 'idle'
    setIdx(ni); idxRef.current = ni; setWordSpan(null)
  }, [speakFrom])

  /* cambiar voz/parámetros en caliente → reinicia la frase actual */
  useEffect(() => {
    if (statusRef.current === 'playing') speakFrom(idxRef.current)
  }, [voiceURI, speakFrom])
  useEffect(() => {
    if (statusRef.current !== 'playing') return
    const t = setTimeout(() => { if (statusRef.current === 'playing') speakFrom(idxRef.current) }, 300)
    return () => clearTimeout(t)
  }, [rate, pitch, volume, speakFrom])

  /* auto-scroll del teleprompter */
  useEffect(() => {
    if (status === 'idle') return
    const el = viewRef.current?.querySelector(`[data-s="${idx}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [idx, status])

  /* ---------------------------- atajos de teclado -------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('textarea, input, [contenteditable="true"]')) return
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); toggle() }
      if (e.code === 'ArrowRight') { e.preventDefault(); jump(idxRef.current + 1) }
      if (e.code === 'ArrowLeft') { e.preventDefault(); jump(idxRef.current - 1) }
      if (e.code === 'Escape') stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, jump, stop])

  /* ------------------------------ portapapeles ---------------------------- */
  const pegar = useCallback(async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (!t.trim()) { pushToast('El portapapeles está vacío'); return }
      setText(t.slice(0, MAX_CHARS))
      setIdx(0); idxRef.current = 0
      pushToast(`${countWords(t).toLocaleString('es-ES')} palabras pegadas desde el portapapeles`)
    } catch {
      pushToast('Permiso de portapapeles denegado — usa Ctrl+V en el guion')
    }
  }, [pushToast])

  const limpiar = useCallback(() => { stop(); setText('') }, [stop])

  /* ------------------------------ derivados UI ---------------------------- */
  const totalWords = countWords(text)
  const estTotal = estimateSeconds(text, rate)
  const estHecho = sentences.slice(0, idx + (status === 'idle' ? 0 : 1)).reduce((a, s) => a + countWords(s.text), 0) / (150 * rate) * 60
  const actual = sentences[idx]
  const fmtNum = (n: number) => n.toLocaleString('es-ES')
  const fmtRate = `${rate.toFixed(2).replace('.', ',')}×`

  const renderSentence = (s: Sentence) => {
    if (!wordSpan || wordSpan.e <= wordSpan.s) return s.text
    return (
      <>
        {s.text.slice(0, wordSpan.s)}
        <mark className="rounded bg-signal/45 px-0.5 text-ink">{s.text.slice(wordSpan.s, wordSpan.e)}</mark>
        {s.text.slice(wordSpan.e)}
      </>
    )
  }

  /* ================================== UI ===================================*/
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(70%_50%_at_50%_0%,#16120C_0%,#0C0A08_60%)] text-cream">
      <div className="pointer-events-none fixed inset-0 z-[60] bg-grain" />

      {/* ================================ HEADER ============================ */}
      <header className="flex items-center justify-between border-b border-edge px-4 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <AudioLines className="size-5 text-signal" />
          <h1 className="font-display text-lg font-black uppercase tracking-[0.18em]">Narra</h1>
          <span className="hidden h-px w-8 bg-edge2 sm:block" />
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.28em] text-fog sm:block">texto → voz · web speech</span>
        </div>
        <div className="flex items-center gap-2.5">
          {status === 'playing' ? (
            <span className="flex items-center gap-2 rounded-full border border-signal/40 bg-signal/10 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-signal">
              <span className="dot-live size-1.5 rounded-full bg-signal" /> En vivo
            </span>
          ) : status === 'paused' ? (
            <span className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300">
              <span className="size-1.5 rounded-full bg-amber-300" /> Pausa
            </span>
          ) : (
            <span className="flex items-center gap-2 rounded-full border border-edge px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-fog">
              <span className="size-1.5 rounded-full bg-fog/50" /> Listo
            </span>
          )}
        </div>
      </header>

      {/* ================================ MAIN ============================== */}
      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-4 px-4 pb-44 pt-5 md:px-8 lg:grid-cols-[1fr,350px]">

        {/* ------------------------- GUION (izquierda) ----------------------- */}
        <section className="flex min-h-[62vh] flex-col overflow-hidden rounded-2xl border border-edge bg-panel">
          <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-3">
            <span className="mr-auto font-mono text-[10px] font-semibold uppercase tracking-[0.26em] text-fog">
              Guion <span className="text-fog/50">· es-ES</span>
            </span>
            {SAMPLES.map((s) => {
              const Icon = s.id === 'poema' ? Feather : s.id === 'noticia' ? Newspaper : Compass
              return (
                <button
                  key={s.id}
                  onClick={() => { if (status !== 'idle') stop(); setText(s.texto); setIdx(0); idxRef.current = 0 }}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border border-edge px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-fog transition-colors hover:border-edge2 hover:text-cream"
                >
                  <Icon className="size-3" /> {s.nombre}
                </button>
              )
            })}
            <button
              onClick={() => void pegar()}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-signal/50 bg-signal/10 px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-signal transition-colors hover:bg-signal/20"
            >
              <ClipboardPaste className="size-3" /> Pegar
            </button>
            <button onClick={limpiar} className="icon-btn !size-8" aria-label="Limpiar guion">
              <Eraser className="size-3.5" />
            </button>
          </div>

          <div ref={viewRef} className="relative min-h-0 flex-1 overflow-y-auto">
            {status === 'idle' ? (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                placeholder="Pega aquí tu texto (Ctrl+V) o escríbelo… Después pulsa el botón naranja de reproducir."
                className="absolute inset-0 h-full w-full resize-none bg-transparent p-5 font-serif text-[17px] leading-[1.9] text-cream caret-signal outline-none placeholder:font-sans placeholder:text-sm placeholder:italic placeholder:text-fog/60 md:p-7 md:text-[19px]"
              />
            ) : (
              <div className="space-y-1.5 p-4 md:p-6">
                <p className="mb-4 rounded-lg border border-dashed border-edge px-3 py-2 font-mono text-[9px] uppercase tracking-[0.2em] text-fog/70">
                  Leyendo — toca una frase para saltar a ella · detén para volver a editar
                </p>
                {sentences.map((s, i) => (
                  <button
                    key={s.start}
                    data-s={i}
                    onClick={() => jump(i)}
                    className={cn(
                      'block w-full cursor-pointer rounded-lg border-l-2 px-3 py-2 text-left font-serif text-[16px] leading-[1.8] transition-colors md:text-[18px]',
                      i === idx
                        ? 'border-signal bg-signal/10 text-cream'
                        : i < idx
                          ? 'border-transparent text-fog/45 hover:bg-raise/50'
                          : 'border-transparent text-fog/85 hover:bg-raise/50',
                    )}
                  >
                    {i === idx ? renderSentence(s) : s.text}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-edge px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-fog">
            <span>{fmtNum(totalWords)} palabras · {fmtNum(sentences.length)} frases</span>
            <span>≈ {formatSecs(estTotal)} a {fmtRate} · {fmtNum(text.length)}/{fmtNum(MAX_CHARS)}</span>
          </div>
        </section>

        {/* ------------------------- CONSOLA (derecha) ----------------------- */}
        <aside className="h-fit space-y-4 lg:sticky lg:top-5">
          {!speechSupported && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
              <p className="text-[13px] leading-relaxed text-amber-100/90">
                Este navegador no expone la <strong>Web Speech API</strong>. Usa Chrome, Edge o Safari para escuchar las voces.
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-edge bg-panel p-5">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.26em] text-fog">Voz · {voices.length} disponibles</p>
            <div className="mt-3">
              <VoiceSelect voices={voices} value={voiceURI} onChange={setVoiceURI} disabled={!speechSupported} />
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <Fader label="Velocidad" icon={Gauge} value={rate} min={0.5} max={2} step={0.05} readout={fmtRate} onChange={setRate} />
                <div className="mt-1 flex gap-1.5">
                  {[0.75, 1, 1.25, 1.5, 2].map((r) => (
                    <button
                      key={r}
                      onClick={() => setRate(r)}
                      className={cn(
                        'flex-1 cursor-pointer rounded-md border px-1 py-1.5 font-mono text-[10px] transition-colors',
                        rate === r ? 'border-signal bg-signal/15 text-signal' : 'border-edge text-fog hover:border-edge2 hover:text-cream',
                      )}
                    >
                      {String(r).replace('.', ',')}×
                    </button>
                  ))}
                </div>
              </div>
              <Fader label="Tono" icon={Waves} value={pitch} min={0.5} max={1.5} step={0.05} readout={pitch.toFixed(2).replace('.', ',')} onChange={setPitch} />
              <Fader label="Volumen" icon={Volume2} value={volume} min={0} max={1} step={0.05} readout={`${Math.round(volume * 100)}%`} onChange={setVolume} />
            </div>
          </div>

          <div className="rounded-2xl border border-dashed border-edge p-4">
            <p className="font-mono text-[9px] uppercase leading-relaxed tracking-[0.18em] text-fog/70">
              Voces del navegador y del SO · sin servidores · <span className="text-signal/80">espacio</span> reproduce ·
              <span className="text-signal/80"> ← → </span> cambia de frase · <span className="text-signal/80">esc</span> detiene
            </p>
          </div>
        </aside>
      </main>

      {/* ============================ REPRODUCTOR ============================ */}
      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-edge bg-coal/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3.5 md:gap-6 md:px-8 md:py-4">
          <Eq active={status === 'playing'} rate={rate} />

          {/* transporte */}
          <div className="flex items-center gap-2">
            <button className="icon-btn" onClick={() => jump(idx - 1)} disabled={status === 'idle' && idx === 0} aria-label="Frase anterior">
              <SkipBack className="size-4" />
            </button>
            <button
              onClick={toggle}
              aria-label={status === 'playing' ? 'Pausar' : 'Reproducir'}
              className="grid size-13 cursor-pointer place-items-center rounded-full bg-signal text-ink shadow-[0_0_30px_rgba(255,106,61,0.35)] transition-all hover:brightness-110 active:scale-95"
              style={{ width: 52, height: 52 }}
            >
              {status === 'playing' ? <Pause className="size-6" /> : <Play className="size-6 translate-x-0.5" />}
            </button>
            <button className="icon-btn" onClick={stop} disabled={status === 'idle'} aria-label="Detener">
              <Square className="size-4" />
            </button>
            <button className="icon-btn" onClick={() => jump(idx + 1)} disabled={sentences.length === 0} aria-label="Frase siguiente">
              <SkipForward className="size-4" />
            </button>
          </div>

          {/* progreso */}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate font-mono text-[11px] text-fog">
                {status === 'idle'
                  ? '— pega un texto y pulsa reproducir —'
                  : actual ? `«${actual.text}»` : '…'}
              </p>
              <p className="shrink-0 font-mono text-[10px] tabular-nums text-fog">
                <span className="text-cream">{String(Math.min(idx + 1, sentences.length)).padStart(2, '0')}</span>
                /{String(sentences.length).padStart(2, '0')} · {formatSecs(status === 'idle' ? 0 : estHecho)}/{formatSecs(estTotal)}
              </p>
            </div>
            <div
              className="mt-2 flex h-3 cursor-pointer items-center gap-[2px]"
              onClick={(e) => {
                if (!sentences.length) return
                const r = e.currentTarget.getBoundingClientRect()
                const frac = clamp((e.clientX - r.left) / r.width, 0, 0.999)
                jump(Math.floor(frac * sentences.length))
              }}
              role="slider" aria-label="Progreso de lectura" aria-valuemin={0} aria-valuemax={sentences.length} aria-valuenow={idx}
            >
              {(sentences.length ? sentences : [{ start: -1 } as Sentence]).map((s, i) => (
                <span
                  key={s.start}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-colors',
                    status !== 'idle' && i < idx ? 'bg-signal/80'
                    : status !== 'idle' && i === idx ? 'animate-pulse bg-cream'
                    : 'bg-edge',
                  )}
                />
              ))}
            </div>
          </div>

          {/* velocidad actual */}
          <div className="hidden text-right md:block">
            <p className="font-mono text-lg font-semibold text-cream">{fmtRate}</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-fog">velocidad</p>
          </div>
        </div>
      </footer>

      {/* ============================== TOAST ================================ */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-32 right-4 z-50 flex items-center gap-2.5 rounded-xl border border-edge bg-raise/95 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur md:right-8"
          >
            <CircleCheck className="size-4 shrink-0 text-signal" />
            <p className="text-[13px] text-cream">{toast.msg}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
