/* ============================================================================
 * App.tsx — NARRA · lector de texto a voz (vista única)
 * Todo el motor vive en la Web Speech API del navegador: funciona offline,
 * no hay backend y la build single-file va directa a GitHub Pages.
 * ==========================================================================*/
import Reader from '@/views/Reader'

export default function App() {
  return <Reader />
}
