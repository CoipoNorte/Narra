# [NARRA · Lector de texto a voz](https://coiponorte.github.io/Narra/)

Pega texto del portapapeles y escúchalo al instante. Una sola vista potente
con motor **Web Speech API**: gratis, sin servidores y —al generarse como un
único `index.html`— lista para GitHub Pages.

## Funciones

- **Pegar 1-clic** (`navigator.clipboard.readText`) + textarea editable con límite de 24.000 caracteres
- **Selector de voces** agrupado (español primero, resto de idiomas después) con buscador
- **Velocidad** 0,5×–2× (fader + atajos rápidos), **tono** y **volumen**
- **Adelante / atrás por frases**: botones ◂ ▸, barra de progreso clicable por segmentos, o **clic directo en cualquier frase**
- **Teleprompter**: frase actual resaltada con auto-scroll y **palabra exacta** marcada (evento `onboundary`)
- Contadores en vivo: palabras · frases · tiempo estimado actualizado con la velocidad
- Textos de muestra (poema, noticia, guía) y atajos de teclado

## Cómo funciona el "seek"

La Web Speech API no permite adelantar dentro de una locución, así que
`src/lib/speech.ts` **trocea el texto en frases** (`Intl.Segmenter` con fallback
regex) y encadena un `SpeechSynthesisUtterance` por frase. Saltar = reproducir
otra frase: exacto, fiable y además evita el bug de Chrome que corta textos
largos con voces remotas. La pausa también es a nivel de frase (cancelar +
reanudar), más robusta que `speechSynthesis.pause()` entre navegadores.

## Atajos

| Tecla | Acción |
|---|---|
| `ESPACIO` | Reproducir / pausar |
| `←` / `→` | Frase anterior / siguiente |
| `ESC` | Detener y volver a editar |

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/index.html autocontenido (sin assets externos)
```
## Estructura

```
├── index.html                # shell + favicon SVG inline
├── src/
│   ├── App.tsx               # vista única
│   ├── views/Reader.tsx      # estudio: guion, consola, reproductor
│   ├── lib/speech.ts         # frases, voces, estimación, muestras
│   └── index.css             # tema cabina (coral/crema), faders, ecualizador
├── .gitignore
└── README.md
```

## Notas

- Las voces dependen del navegador/SO: Chrome y Edge ofrecen muchas (incluidas
  varias en español); Safari, menos. Sin síntesis disponible la app avisa y
  sigue permitiendo editar el guion.
- El acceso al portapapeles requiere HTTPS (GitHub Pages lo da) o `localhost`;
  si se deniega, la app sugiere `Ctrl+V` como alternativa.
- Privacidad total: el texto nunca sale del navegador.
