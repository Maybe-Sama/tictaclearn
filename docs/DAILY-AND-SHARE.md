# WORLD BEAT · Reto diario, compartir y creadores

Especificación de producto para la **fase 3** del [PLAN.md](../PLAN.md). Está escrita para
implementarse sin preguntas: donde hay una decisión, está tomada y justificada.

Se apoya en lo que ya existe en el repositorio a 25/09/2026:

- `src/util/rng.ts` — `Rng` (mulberry32) con `fork(label)` para subflujos independientes,
  `parseSeed()` para semillas por URL. **Ya está.**
- `src/game/Difficulty.ts` — `DifficultyDirector(settings, frozen)`. El flag `frozen` ya
  existe y es exactamente lo que el Diario necesita. **Ya está.**
- `src/game/Progress.ts` — cajas Leitner por país y estrellas por concierto en
  `worldbeat.progress.v1`. El Diario **no toca esta clave**; escribe en la suya.
- `src/game/SessionStats.ts` — `perfect`, `good`, `miss`, `combo`, `maxCombo`, `score`,
  `bestPerfectStreak`, `feverCount`, `knowledgeErrors`, `rhythmErrors`, `noResponse`,
  `stray`, `timingPct`. **Todo lo que el resultado compartible necesita ya se mide.**

> Antes de leer: la sección **10. Disidencia** dice qué parte de este documento creo que
> no deberíamos construir todavía y por qué. Si solo vas a leer dos secciones, lee la 2 y
> la 10.

---

## 1. Reto diario

### 1.1 Semilla del día

Un solo número por día, derivado de la fecha UTC, sin estado y sin servidor.

```ts
// src/game/Daily.ts
import { Rng } from '../util/rng';

/** Reto #1 = 2026-01-01. No se cambia nunca: la numeración pública depende de esto. */
export const DAILY_EPOCH = Date.UTC(2026, 0, 1);

/** Versión del algoritmo. Se sube SOLO si cambia la generación (ver 1.8). */
export const DAILY_ALGO = 'WB-D1';

/** Número de reto público. Los días UTC duran 86 400 000 ms exactos en el reloj de JS. */
export function dailyNumber(now = Date.now()): number {
  return Math.floor((now - DAILY_EPOCH) / 86_400_000) + 1;
}

/** Clave canónica del reto. La asignatura entra aquí (ver 1.3). */
export function dailyKey(n: number, subject = 'banderas'): string {
  return `${DAILY_ALGO}|${n}|${subject}`;
}

/** FNV-1a de 32 bits sobre la clave. Determinista en cualquier navegador. */
export function seedOf(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const dailySeed = (n: number): number => seedOf(dailyKey(n));
```

**Subflujos.** Del `Rng` raíz se sacan hijos con `fork`, nunca se comparte el estado:

| Subflujo | `fork(label)` | Qué decide |
|---|---|---|
| Países | `'daily.items'` | Los 10 países y su orden |
| Distractores | `'daily.decoys'` | Qué nombres falsos cruzan el carril |
| Ritmo | `'daily.rhythm'` | Plantilla rítmica y patrón de tambor dentro del tier fijado |
| Música | `'daily.music'` | Banda, progresión y tonalidad |

Esto importa: si mañana añadimos una ronda 11, el subflujo de música no se desplaza y la
canción del reto #128 sigue siendo la misma. Sin `fork`, cualquier retoque invalidaría el
archivo entero.

**Por qué UTC y no la fecha local.** Wordle usa fecha local, así que dos amigos en husos
distintos juegan "el mismo número" en momentos distintos. Nuestro caso de uso principal es
un streamer jugando **en directo con su chat a la vez**: ahí la fecha local rompe el
producto (medio chat tendría otro reto). Se paga un precio: en la península el reto cambia
a la 01:00/02:00 de la madrugada, y en la costa oeste de EE. UU. a las 17:00. Mitigación
obligatoria: en la pantalla de resultados, un contador **"nuevo reto en 7 h 12 min"** en
hora local, y la fecha del reto siempre visible.

### 1.2 Estructura exacta

| Parámetro | Valor | Fijo / variable |
|---|---|---|
| Países | **10** | Fijo |
| Compases por país | 2 (8 beats) | Fijo |
| Duración de juego | 8 beats de entrada + 80 de retos + 8 de cierre = **96 beats ≈ 52 s** | Fijo |
| Puerta a puerta | carga + cuenta atrás (4 beats) + juego + resultados ≈ **75 s** | Fijo |
| BPM | `104 + round(12 * (r - 1) / 9)` para la ronda `r` → 104 … 116 | Fijo |
| Asignatura | Banderas | Fijo (ver 1.3) |
| Qué países | Sorteo con semilla, cupos por dificultad | Variable por día |
| Canción | Banda × progresión × tonalidad del subflujo `daily.music` | Variable por día |
| Plantilla rítmica | Del subflujo `daily.rhythm`, dentro del tier de la tabla | Variable por día |

**Tabla de rondas (idéntica todos los días).** Es la columna vertebral: la curva no la
decide el azar, la decide esta tabla, para que un 8/10 de hoy signifique lo mismo que un
8/10 de la semana que viene.

| Ronda | Cubo `difficulty` | `maxTier` | Mecánica añadida |
|---|---|---|---|
| 1 | 1 (famoso) | 0 | — |
| 2 | 1 | 0 | — |
| 3 | 1 | 1 | — |
| 4 | 2 (conocido) | 1 | contratiempos |
| 5 | 2 | 1 | contratiempos |
| 6 | 2 | 1 | flash (la bandera se tapa) |
| 7 | 2 | 2 | flash |
| 8 | 3 (raro) | 2 | doble golpe |
| 9 | 3 | 2 | flash + doble |
| 10 | 3 | 2 | ráfaga (`quick`) |

**Sorteo de países** (subflujo `daily.items`), sobre los 195 de `src/content/countries.ts`:

1. Se parten en tres cubos por el campo `difficulty` (1 / 2 / 3).
2. Se excluyen los países que salieron en **los 30 retos anteriores**. Para saber cuáles
   sin guardar nada: se generan los días `n-1 … n-30` con el sorteo **sin filtro**
   (paso 3) y se unen sus resultados. Es determinista, idéntico en todos los
   dispositivos y cuesta 30 sorteos de 10 elementos (microsegundos). **No se recurre**:
   el histórico se calcula siempre con la versión sin filtro, nunca con la filtrada.
3. Sorteo base: `rng.shuffle(cubo)` y se toman 3 del cubo 1, 4 del cubo 2, 3 del cubo 3.
4. **Diversidad de continente**: si algún continente aporta más de 3 de los 10, se
   descarta el excedente (el de índice más alto) y se sigue tomando del mismo cubo.
   Máximo 8 reintentos; si se agotan, vale el sorteo tal cual (nunca puede colgarse).
5. Orden final: cubo 1 (3), cubo 2 (4), cubo 3 (3), barajando **dentro** de cada tramo.

**Distractores** (subflujo `daily.decoys`): los nombres que cruzan el carril salen, por
orden de preferencia, de `lookalikes` del país, luego del mismo continente, luego del mismo
cubo. **Regla crítica: en el Diario, `LearningTracker` y `Progress` NO influyen en nada.**
Hoy el generador reinyecta a propósito las confusiones previas del jugador; eso es
excelente en el Tour y **fatal** aquí, porque dos personas verían carriles distintos. En
modo diario, el generador se construye con el historial vacío.

### 1.3 Asignatura: Banderas, fija

**Decisión: el Diario es siempre Banderas.** Responde a la pregunta abierta 2 de PLAN.md §7.

Por qué: (a) el público que ya existe consume vídeos de *adivina la bandera*, no de
capitales; (b) un único reto diario = una única conversación, y alternar asignaturas parte
la comparación en dos mitades que no se pueden comparar; (c) Capitales excluye Israel y
Palestina y arrastra el problema de las capitales en disputa, que no quiero gestionando un
reto público todos los días.

Capitales tendrá su propio diario **cuando** el diario de banderas demuestre retención
(criterio en §5). La variante tentadora de "domingo de capitales" queda descartada para la
v1 por la misma razón que (b).

### 1.4 Dificultad: congelada y única

**Una sola dificultad para todo el mundo**, equivalente a NORMAL:

```ts
const DAILY_SETTINGS: DifficultySettings = {
  ...DIFFICULTIES.normal,
  id: 'normal',
  skipTutorial: true,   // el Diario no enseña; para eso está el Tour
  hints: 0,             // nadie recibe el nombre escrito
  ghost: 0,             // los tambores fantasma dependerían del azar personal
  feverAt: 30,
  scoreMult: 1,
};
// minTier / maxTier los fija la tabla de rondas, no el rendimiento del jugador.
const director = new DifficultyDirector(DAILY_SETTINGS, /* frozen */ true);
```

**La dificultad adaptativa va congelada** (`frozen = true`, que ya existe en
`Difficulty.ts`). No es un detalle: `DifficultyDirector` mueve `skill` con cada respuesta y
de ahí sale el `tier` que elige plantilla rítmica. Sin congelar, quien acierta recibe
frases más difíciles y quien falla más fáciles: el reto dejaría de ser el mismo reto y la
puntuación compartida no significaría nada.

**Las 4 dificultades existentes siguen siendo del Beat Libre.** No se ofrecen en el
Diario. Lo que sí se ofrece es un **Modo asistido**:

- Solo amplía las ventanas de timing a las de FÁCIL (`perfect 0.10 / good 0.20`). Nada
  más: mismos países, mismo orden, mismo BPM, mismas mecánicas.
- Existe porque el reto se aprueba **por conocimiento**, y no quiero que una pantalla táctil
  barata o una discapacidad motriz decidan si alguien puede jugar el reto del día.
- **Mantiene la racha** y cuenta como jugado.
- El texto compartido lleva la marca `(asistido)` y sus puntuaciones se excluyen de las
  métricas de distribución (§5). Se declara al empezar, no se puede activar a mitad.

### 1.5 Jugar dos veces

- **Cuenta el primer intento.** El resultado se sella y no se sobrescribe jamás.
- El intento queda **sellado en la primera pulsación** de la ronda 1. Antes de eso se puede
  salir sin consecuencias.
- **Práctica ilimitada**: al terminar, el botón `REPETIR` está disponible desde el primer
  segundo, sin límite. Las repeticiones **no** cambian el resultado guardado, **no**
  cambian el texto compartible del día y **sí** se cuentan en la métrica `replays` (§5),
  que es precisamente la señal de que el juego engancha.
- Compartir una repetición es posible, pero el texto lo dice: `práctica · no cuenta`. No
  quiero que nadie publique un 10/10 de la quinta vuelta como si fuera del primer intento.
- **Interrupción**: el resultado se escribe ronda a ronda mientras juegas. Si se cierra la
  pestaña, al volver **el mismo día UTC** se reanuda donde estaba. Reanudar no da ventaja
  real (los países que faltan siguen sin conocerse) salvo más tiempo para pensar, que es un
  precio justo a cambio de no castigar una llamada entrante.
- Si el día termina sin llegar a resultados: **no hay resultado** y la racha se rompe (con
  escudo si lo hay). Se registra como `abandoned`.
- **No hay defensa anticopia.** Sin servidor y sin ranking, quien quiera falsear su
  captura lo hará. Diseñamos para la honestidad por defecto, no contra el tramposo:
  no existe nada que ganar mintiendo.

### 1.6 Archivo y enlaces

- `/d/128` → reto #128. Si es el de hoy, cuenta. Si es pasado, se juega como **archivo**
  (práctica, no afecta a la racha) con un aviso: *"Esta es la partida del 25 de septiembre.
  El reto de hoy es el #129."* y un botón al de hoy.
- `/d/999` en el futuro → 404 amable. No se puede adelantar el reto.
- `/s/<semilla>` → partida libre con semilla arbitraria (duelos, sets de streamer,
  reproducción de bugs). `parseSeed()` ya acepta decimal y hexadecimal.
- El archivo es la razón por la que `DAILY_EPOCH` y `DAILY_ALGO` no se tocan nunca.

### 1.7 Qué se guarda (localStorage)

Clave nueva, independiente de `worldbeat.progress.v1`:

```jsonc
// worldbeat.daily.v1
{
  "v": 1,
  "last": 128,          // último reto COMPLETADO
  "streak": 7,
  "bestStreak": 12,
  "shields": 1,         // escudos disponibles (0..2)
  "sinceShield": 3,     // días completados desde el último escudo ganado
  "played": 23,         // retos completados en total
  "started": 25,        // retos iniciados en total (para la tasa de finalización)
  "replays": 14,        // partidas de práctica tras completar el diario
  "shares": 4,          // veces que se pulsó compartir/copiar
  "cards": 1,           // veces que se generó la tarjeta en imagen
  "runs": {             // SOLO los últimos 30 retos; lo anterior se poda al guardar
    "128": {
      "grid": "PPGBPRPPGB",   // 10 caracteres, uno por ronda (ver leyenda)
      "hits": 8,
      "score": 14230,
      "maxCombo": 27,
      "timing": 86,
      "fever": 1,
      "ms": 61200,            // tiempo de juego real
      "assist": false,
      "worst": { "id": "dz", "kind": "rhythm", "deltaMs": 210 },
      "sealed": true
    }
  }
}
```

Leyenda de `grid` (1 carácter por ronda, en orden):

| Char | Significado | Origen en el código |
|---|---|---|
| `P` | Perfecto | `Judgement.grade === 'perfect'` |
| `G` | Bueno | `grade === 'good'` |
| `B` | Sabías, pero fuera de compás | `errorKind === 'rhythm'` |
| `R` | País equivocado | `errorKind === 'knowledge'` |
| `.` | Lo dejaste pasar | `errorKind === 'noResponse'` |

`hits = cuenta(P) + cuenta(G)`. Los tambores **no** entran en la cuadrícula: la
cuadrícula habla de conocimiento y de compás en los 10 países, que es lo comparable. Los
tambores viven en `timing` y en `score`.

Presupuesto de tamaño: ~180 bytes por run × 30 = **~6 KB**. Sin riesgo de cuota.

`worst` es el fallo más "contable" para el texto compartible, elegido por prioridad:
1) el `rhythm` con mayor `|deltaMs|`; 2) si no hay, el `knowledge` de ronda más baja
(fallar un país fácil es más gracioso); 3) si no hay, el `noResponse`; 4) si el jugador
hizo pleno, el `P` con menor `|deltaMs|` (el más clavado), que se presenta como alarde.

### 1.8 Versionado

Si alguna vez cambia el sorteo, se sube `DAILY_ALGO` a `WB-D2`. Consecuencia: los retos
futuros cambian y **los pasados dejan de ser reproducibles**. Por eso el archivo guarda el
`grid` ya calculado y no intenta regenerar la partida. Subir la versión es una decisión de
dirección, no de implementación.

---

## 2. Resultado compartible (texto)

### 2.1 El vocabulario de emojis, y por qué

| Emoji | Estado | Razón |
|---|---|---|
| 🟩 | Perfecto | Gramática heredada de Wordle: verde = bien, cero explicación necesaria. |
| 🟨 | Bueno | Íd. Amarillo = casi. |
| 🟦 | Sabías la respuesta y fallaste el compás | **Nuestro.** Wordle no tiene azul, así que un azul en la cuadrícula ya dice "esto no es Wordle". Y semánticamente necesitamos un tercer estado que no es ni acierto ni ignorancia: es *el* estado del juego, el que produce la risa y el clip. |
| 🟥 | País equivocado | Rojo = error, universal. |
| ⬛ | Lo dejaste pasar | La ausencia. Un agujero en la cuadrícula. |
| 🥁 | Marca del juego | Un solo emoji de marca por mensaje, y es el objeto del juego, no decoración. Nada de 🌍 (genérico y el juego no va del planeta). |
| 🔥 | Racha | Solo en la variante que la incluye y solo si `streak ≥ 3`. |

Advertencias de implementación, las dos importantes:

- **Nunca usar emojis de bandera de los países jugados.** Tienta muchísimo, y está mal:
  (a) revela las respuestas a quien no ha jugado; (b) Windows no tiene glifos de bandera y
  muestra pares de letras (`ES`, `FR`), así que la cuadrícula se rompe en el 30 % de los
  escritorios.
- **⬛ se ve mal en clientes con tema oscuro.** Hay que probarlo en X, Discord, WhatsApp y
  Telegram, en claro y en oscuro, antes de lanzar. Si desaparece, el sustituto es `🔳`, no
  `⬜` (el blanco desaparece en tema claro y además se lee como "vacío neutro" tipo Wordle).

Además, la cuadrícula **no revela qué países salieron**. La línea de chiste sí revela uno:
es un intercambio deliberado (estropea 1 de 10 a cambio de ser la única línea que da ganas
de pinchar). Hay un interruptor **"sin spoilers"** que la sustituye por la versión genérica:
`🟦 medio compás tarde en una bandera de África (0,21 s)`.

### 2.2 Tres variantes

**Variante A — Mínima (4 líneas)**

```
WORLD BEAT #128 · 8/10
🟩🟩🟨🟦🟩
🟥🟩🟩🟨🟦
worldbeat.app/d/128
```

**Variante B — Con el fallo estrella (6 líneas)** ← recomendada

```
WORLD BEAT #128 🥁 8/10 · combo 27
🟩🟩🟨🟦🟩
🟥🟩🟩🟨🟦
🟦 medio compás tarde en ARGELIA (0,21 s)
Racha 7 🔥
worldbeat.app/d/128
```

**Variante C — Ficha técnica (7 líneas)**

```
WORLD BEAT #128 · Banderas
8/10 · 14.230 pts · combo 27 · compás 86 %
🟩🟩🟨🟦🟩
🟥🟩🟩🟨🟦
🟩 4 clavados · 🟨 3 justos · 🟦 2 fuera de compás · 🟥 1 fallo
Racha 7 🔥 · mejor 12
worldbeat.app/d/128
```

### 2.3 Recomendación: la B

- **Seis líneas** entran sin truncarse en una burbuja de WhatsApp, en un mensaje de
  Discord y en un tuit (≈ 120 caracteres contando los emojis como 2, muy por debajo de 280).
- La cuadrícula sola ya es papel pintado: desde 2022 todo el mundo ha visto mil
  cuadrículas y ninguna les hizo pinchar. **La línea del fallo estrella es lo único del
  mensaje que habla de la persona**, y es la que convierte un marcador en una anécdota.
  Es exactamente la baza del producto: fallar por medio compás es gracioso.
- La A es demasiado anónima; la C parece un informe y su quinta línea (el recuento por
  color) es información redundante que ya está dibujada justo encima.
- La C se conserva como **texto de la tarjeta de imagen** (§3), donde el espacio sobra y
  el detalle sí aporta.

Reglas de composición de la B:

- Dos filas de 5, no una de 10: en móvil una fila de 10 emojis se parte de forma
  impredecible según el cliente.
- `· combo 27` solo si `maxCombo ≥ 10`; si no, se omite el fragmento.
- `Racha 7 🔥` solo si `streak ≥ 3`; si no, la línea entera desaparece (5 líneas).
- Si es práctica: primera línea `WORLD BEAT #128 🥁 8/10 · práctica`.
- Si es asistido: primera línea acaba en `· asistido`.
- Números en formato español: `14.230`, `0,21 s`.
- El enlace **siempre en su propia línea y al final**, sin nada detrás, para que todos los
  clientes lo autoenlacen y generen la tarjeta de previsualización.

### 2.4 El enlace

- Forma: `https://worldbeat.app/d/128`. Corto, legible, sin parámetros, memorizable en
  voz alta en un directo ("world beat punto app, barra d, ciento veintiocho").
- **No lleva el resultado**. Nada de `?r=8`: no quiero que el enlace de alguien acabe
  contando su puntuación a un tercero, ni construir la tentación de un ranking por URL.
- `<meta property="og:*">` estático por reto: título `WORLD BEAT · Reto #128`, descripción
  *"10 banderas, 60 segundos, al ritmo. El mismo reto para todo el mundo hoy."* La imagen
  de previsualización es genérica del juego, **nunca** la tarjeta de resultado de nadie.
- Implementación de compartir: `navigator.share({ text, url })` cuando existe; si no,
  `navigator.clipboard.writeText()` y un aviso *"Copiado"*. Ambas rutas cuentan en `shares`.

---

## 3. Tarjeta de resultado en imagen

### 3.1 Qué es

Una imagen generada en el navegador con `<canvas>`, para quien comparte en Instagram,
TikTok o en un tuit con imagen. **La protagonista no es la puntuación: es el fallo.**

### 3.2 Jerarquía visual (de más a menos peso)

1. **Héroe (≈ 40 % del alto)** — la bandera de `worst.id` a tamaño enorme, con un sello
   en diagonal encima: `0,21 s TARDE` (rhythm), `NO ERA ESTA` (knowledge), `NI LO
   INTENTASTE` (noResponse) o `CLAVADA` (pleno). Debajo, el nombre del país en grande.
   Es el único elemento que cambia de tono emocional según lo que pasó, y es lo que hace
   que la tarjeta parezca *tuya* y no una plantilla.
2. **Marcador** — `8/10` gigantesco, alineado a la izquierda.
3. **Cuadrícula** — los 10 cuadros **dibujados** (no emojis: en canvas los emojis
   dependen de la fuente del sistema), 2 filas de 5, con la paleta del escenario.
4. **Píldoras de datos** — `COMBO 27`, `COMPÁS 86 %`, `FEVER ×1`, `RACHA 7`. Solo las que
   apliquen, máximo 4.
5. **Pie** — `WORLD BEAT · RETO #128` + `worldbeat.app/d/128`. En la variante de
   escritorio, además un QR de 120 px en la esquina inferior derecha (sirve para que quien
   ve el directo en la tele salte al móvil).

### 3.3 Proporciones y tamaños

| Uso | Lienzo | Cuándo se genera |
|---|---|---|
| Móvil / stories / WhatsApp | **1080 × 1350 (4:5)** | Por defecto si `pointer: coarse` |
| X/Twitter y escritorio | **1600 × 900 (16:9)** | Por defecto en escritorio |

El 4:5 es el máximo alto que Instagram muestra sin recortar y se ve bien en WhatsApp y
Telegram. El 16:9 es lo que X muestra en línea sin recortar. **Son dos perfiles de la misma
función de dibujo**, no dos diseños: cambian las zonas, no los elementos. En 16:9 el héroe
va a la izquierda y el marcador + cuadrícula a la derecha; en 4:5 van apilados.

Siempre hay un botón para generar la otra proporción.

### 3.4 Qué la hace apetecible

- Cuenta **un momento**, no un balance. "Sabía Argelia y llegué tarde" es una historia;
  "8/10" no lo es.
- La bandera grande da color y reconocimiento instantáneo en un feed.
- El sello en diagonal es autoironía: el que comparte queda de buen perdedor, que es la
  postura más compartible que existe. Nadie comparte una tarjeta que le hace quedar de
  pardillo; todo el mundo comparte una que hace la broma por él.
- Es legible a tamaño de miniatura: el número y la bandera se leen a 200 px de ancho.

### 3.5 Notas de implementación

- Lienzo de tamaño fijo en píxeles (1080×1350), **no** escalado por `devicePixelRatio`:
  la imagen exportada debe ser idéntica en todos los dispositivos.
- Las banderas son SVG de `flag-icons`: `new Blob([svg], { type: 'image/svg+xml' })` →
  `URL.createObjectURL` → `img.decode()` **antes** de dibujar.
- Esperar a `document.fonts.ready` antes del primer `fillText`, o la tipografía saldrá
  sustituida.
- **Gotcha de Safari/iOS**: `navigator.share` debe llamarse **dentro** del gesto del
  usuario. Solución: renderizar la tarjeta y guardar el `Blob` en cuanto se muestra la
  pantalla de resultados, para que el `onclick` de COMPARTIR sea síncrono.
- Compartir: `navigator.canShare({ files })` → `navigator.share({ files: [file], text, url })`.
  Si no hay soporte: descarga `worldbeat-128.png` + copia del texto al portapapeles.
- Peso esperado: 250–450 KB en PNG. Aceptable. Si se pasa de 1 MB, `image/jpeg` a 0,92.
- Presupuesto de tiempo: < 150 ms. Si no, la pantalla de resultados se nota.

---

## 4. Racha diaria

### 4.1 Reglas

- **Mantiene la racha**: completar el Diario del día UTC. Completar = llegar a la pantalla
  de resultados. **Sin mínimo de puntuación**: un 0/10 mantiene la racha.
- **Rompe la racha**: pasar un día UTC sin resultado y sin escudo disponible.
- **Indulgencia (escudo)**: se gana 1 escudo cada **7 días completados**, acumulables
  hasta **2**. Se consume **solo, en silencio y de forma retroactiva** al volver: si
  faltaste un día y tenías escudo, la racha continúa y en la pantalla se lee
  *"Usaste un escudo. Te queda 1."*
- **No hay forma de recuperar una racha perdida.** Ni pagando, ni compartiendo, ni viendo
  nada. La racha se pierde y punto.
- **La racha no da ventaja de juego**: ni puntos, ni multiplicadores, ni desbloqueos. Es
  solo un número que se muestra.
- La racha se muestra como una tira de 7 casillas (la semana) y un número. El fin de semana
  no tiene trato especial.

### 4.2 Por qué estas reglas y no otras

- **Sin mínimo de puntuación**, porque un mínimo convierte el reto en deberes: el día que
  vas mal, abandonas para "no gastar" el día, que es justo el comportamiento contrario al
  que queremos. Que un 0/10 valga también premia al que entra sabiendo que va a sufrir.
- **El escudo se consume solo**, porque preguntar *"¿quieres gastar un escudo?"* crea un
  momento de decisión con pérdida, que es ansiedad fabricada. Eso es un patrón oscuro de
  manual y no lo vamos a hacer.
- **Máximo 2 escudos**, porque con 5 la racha deja de significar nada y el número se
  convierte en decoración.
- **La racha no da poder** porque, si lo diera, el que vuelve tras una ruptura entraría en
  desventaja permanente: exactamente el jugador al que hay que tratar mejor.
- **Sin rescate de rachas** porque la rentabilización de la culpa es el modelo de negocio
  de Duolingo, no el nuestro. Y porque una racha que se puede comprar no se presume.
- **Fragilidad honesta**: la racha vive en `localStorage`. Un borrado de datos, el modo
  privado o cambiar de móvil la matan. Por eso (a) la racha nunca es la única recompensa
  de la pantalla de resultados, y (b) el **código de progreso exportable** (PLAN fase 5,
  punto 23) debe adelantarse a la vez que la racha, o generaremos una frustración que no
  podremos arreglar. Si no entra el export, mi recomendación es no lanzar la racha.

---

## 5. Métricas sin backend

### 5.1 Contadores

Todos en `worldbeat.daily.v1` (§1.7) más un `worldbeat.metrics.v1` para lo que no es
diario. Todos son **enteros que solo suben**, sin marcas de tiempo por evento.

| # | Métrica | Cómo se calcula | Bien | Mal |
|---|---|---|---|---|
| 1 | **Tasa de finalización** | `played / started` | ≥ 0,85 | < 0,65 |
| 2 | **Ronda de abandono** | moda de la última ronda registrada en runs `abandoned` | dispersa | concentrada en 1–3 → el arranque no se entiende |
| 3 | **Tasa de compartir** | `shares / played` | ≥ 0,12 | < 0,03 |
| 4 | **"Una más"** (repetición) | `replays / played` | ≥ 0,5 | < 0,15 |
| 5 | **Retorno al día siguiente** | días consecutivos en `runs` / días con al menos un run | ≥ 0,5 | < 0,25 |
| 6 | **Longitud de racha** | `streak` y `bestStreak` | mediana ≥ 4 | mediana ≤ 1 |
| 7 | **Tiempo hasta el primer input** | `ms` entre carga y primera pulsación | < 25 s | > 45 s → la portada estorba |
| 8 | **Mezcla de errores** | `rhythmErrors / (rhythmErrors + knowledgeErrors)` de `SessionStats` | 0,25–0,45 | > 0,55 → castigamos el ritmo, no enseñamos; < 0,10 → el ritmo es decorativo |
| 9 | **Desvío de calibración** | mediana de `Judgement.deltaMs` de la sesión | \|mediana\| < 20 ms | > 35 ms → ofrecer *Ajustar ritmo* (PLAN fase 2, punto 11) |
| 10 | **Aprendizaje real** | países que suben de caja Leitner por semana, desde `Progress.mastery` | ≥ 5/semana | ≈ 0 → el juego entretiene pero no enseña, y perdemos el argumento educativo |

La 8 y la 10 son las que de verdad importan y las que nadie mide en un juego así. La 3 es
la que todo el mundo mira y la que más fácil es engañarse mirando.

### 5.2 Cómo las leemos sin invadir a nadie

Seamos claros: **sin backend no tenemos telemetría de la población.** Cualquier otra
afirmación es mentira. Lo que sí tenemos:

1. **Pantalla de diagnóstico** (`?diag=1` o siete toques en el logo): muestra los
   contadores en pantalla y un botón `COPIAR DIAGNÓSTICO` que pone un JSON en el
   portapapeles. El usuario **ve el texto exacto antes de copiarlo** y lo pega donde
   quiera (Discord, un correo). Nada sale del dispositivo por sí solo. Sin identificadores,
   sin huella de navegador, sin cookies, sin terceros.
2. **Pruebas de juego presenciales**: 8–10 personas, mirando, sin ayudar. Para las
   métricas 2 y 7 esto vale más que mil eventos.
3. **Los textos compartidos públicamente son nuestra única telemetría gratuita.** Un
   `#128 8/10` en abierto es una muestra real de la distribución de aciertos y del volumen
   de partidas. Sesgada (solo comparte quien presume) pero real y de coste cero. Vale la
   pena revisarla a mano la primera semana.
4. **Nada de analítica de terceros.** Ni GA, ni Plausible, ni un píxel. Es parte de la
   propuesta: sin cuentas, sin backend, sin rastreo. Si algún día hace falta medir de
   verdad, se hace con el servidor mínimo de la fase 6, anunciado y con opción de no
   participar.

### 5.3 Hipótesis comprobables

Nada de "se hará viral". Esto es lo que creo y lo que lo refutaría:

| # | Hipótesis | Métrica que la valida | Umbral | Si falla |
|---|---|---|---|---|
| H1 | El reto de 75 s se termina | Métrica 1 | ≥ 0,85 en 20 sesiones observadas | El formato es largo o confuso: bajar a 8 países |
| H2 | La gente repite el mismo día | Métrica 4 | ≥ 0,5 | El bucle no engancha; el Diario no es el problema a resolver |
| H3 | La línea del fallo estrella hace compartir | A/B manual: 2 semanas con variante A, 2 con B, métrica 3 | B ≥ 1,5 × A | Volver a la A y dejar de invertir en compartir |
| H4 | El azul (fallo de compás) es el estado más comentado | Conteo manual de menciones en los textos compartidos y en el Discord | ≥ 30 % de los comentarios lo mencionan | La tesis "el ritmo convierte saber en espectáculo" no se sostiene; es un problema de diseño, no de marketing |
| H5 | El Diario trae gente de vuelta | Métrica 5 | ≥ 0,5 | La racha no salva nada; mirar retención del Tour |
| H6 | El juego enseña | Métrica 10 | ≥ 5 países/semana | Quitar la promesa educativa de la comunicación |

**Objetivo de compartir: 6–12 % de quienes completan.** El ≥ 25 % que pone PLAN.md §5
(fase 3) no es realista: los juegos tipo Wordle en su mejor momento andaban por ahí siendo
un fenómeno cultural irrepetible. Recomiendo corregir ese número en PLAN.md a **≥ 8 %**
para no declarar fracaso un resultado bueno.

---

## 6. Plan para creadores de contenido

### 6.1 Funciones necesarias, por impacto

| # | Función | Por qué | Coste |
|---|---|---|---|
| 1 | **Inglés** | Sin esto el mercado es España + LatAm. El público de "guess the flag" es 10× en inglés. Hoy los textos están en el código: cada semana que pasa es más caro (PLAN §2 ya lo dice, y lo coloca en fase 6: **creo que es un error**, ver §10) | Alto |
| 2 | **Enlace con semilla** `/s/<n>` y `/d/<n>` | Es el único mecanismo por el que la audiencia entra a jugar **en el mismo minuto** del directo. Sin esto, el vídeo entretiene y no convierte | Bajo (ya existe `parseSeed`) |
| 3 | **Modo overlay / OBS** | HUD compacto, fondo transparente o chroma, sin escenario animado. < 25 % de pantalla y legible a 720p | Medio |
| 4 | **Mezclador separado** (música / efectos / voz) + aviso de **música libre de derechos** | La música es sintetizada en tiempo real: **no hay reclamación de copyright y no se muta el VOD**. Esto es una ventaja real y concreta frente a cualquier juego de ritmo con licencias, y hay que decirlo en la portada y en la página de prensa | Bajo |
| 5 | **Modo Chat**: pausa de 2–5 s tras revelar la bandera | Convierte al espectador en jugador sin que salga del directo. Es el formato que ya funciona en los vídeos de trivia | Medio |
| 6 | **Sets por código** (10 países en la URL) | "El set imposible que me ha mandado el chat". Genera contenido que no depende de nosotros | Medio |
| 7 | **Legibilidad a 720p** | Tamaños mínimos, contraste; la bandera nunca por debajo de un mínimo. Si no se lee en el vídeo comprimido, el vídeo no existe | Bajo |
| 8 | **Relevo** (duelo por turnos con semilla) | Streamer contra invitado, cero servidor (PLAN §3.7) | Medio |
| 9 | **Atajos que no chocan con OBS** | Evitar las teclas F y combinaciones habituales de emisión | Muy bajo |
| 10 | **Tarjeta del último fallo automática** | Una imagen lista para el tuit del clip, sin editar nada | Bajo (reutiliza §3) |

Los cuatro primeros son el 80 % del valor. Del 8 al 10 solo si sobra tiempo.

### 6.2 Formatos de vídeo

**Corto (25–45 s, vertical 9:16).** Una sola unidad emocional: un fallo por medio compás,
la reacción, el marcador. Regla dura: **el fallo ocurre en los 3 primeros segundos**. Sin
introducción, sin logotipo al principio. El título en pantalla es una pregunta o una
sentencia, nunca el nombre del juego.

**Largo (12–20 min, horizontal).** Tres plantillas que funcionan:
1. *"El chat elige mis 10 banderas imposibles"* (usa la función 6).
2. *"Reto diario, 5 minutos al día durante una semana"* (usa el Diario y la racha; muestra
   el progreso real, que es el mejor argumento educativo que tenemos).
3. *"La gira entera de Europa"* (el Tour, para el público que quiere aprender de verdad).

### 6.3 Guion de 30 segundos (nuestro primer vídeo)

Vertical, un solo plano de pantalla con cámara pequeña en esquina. Sin música añadida: la
del juego basta y es nuestra.

| Tiempo | Imagen | Audio / texto en pantalla |
|---|---|---|
| 0,0–3,0 | Arranca **ya jugando**. Bandera de Argelia en pantalla, el nombre cruzando el carril. El jugador pulsa tarde: el `🟦` y un sonido de fallo seco. Cara de incredulidad en la cámara. | Voz: *"¡Que me la sabía!"* · Texto: **0,21 s TARDE** |
| 3,0–7,0 | Corte a la misma bandera. Texto grande. | Voz: *"Sabérsela no basta. Hay que decirlo a tiempo."* |
| 7,0–13,0 | Juego a velocidad real, 3 aciertos seguidos, la banda añade capas con el combo. | Sin voz. Solo el juego y la música subiendo. El sonido **es** el argumento. |
| 13,0–18,0 | Se dispara FEVER: el escenario cambia a noche, ×2. | Voz: *"Esto es FEVER."* · Texto: **COMBO 30 · ×2** |
| 18,0–24,0 | Ronda 9: bandera flash (se tapa) + doble golpe. Acierta por los pelos. | Voz: *"La bandera se tapa. Sigues sabiéndotela, ¿no?"* |
| 24,0–28,0 | Pantalla de resultados. La cuadrícula de 10 se rellena de golpe, cuadro a cuadro, al ritmo. | Voz: *"Diez banderas, un minuto, la misma partida para todo el mundo hoy."* |
| 28,0–30,0 | Tarjeta de resultado. URL grande y quieta. | Texto: **worldbeat.app** · Sin voz. |

Notas de rodaje:
- Grabar **fallando de verdad**. Un fallo actuado se nota y arruina la premisa.
- La ronda 9 (flash + doble) es la más espectacular: es la que hay que reservar para el
  clímax, no gastarla al principio.
- Nada de logotipo en el segundo 0. El logotipo va en el 28.
- Subtítulos quemados siempre: la mayoría lo verá sin sonido la primera vez, aunque el
  sonido sea el producto.

---

## 7. Checklist de lanzamiento

**Corrección del reto**
- [ ] Dos dispositivos distintos, misma hora, mismo reto: misma secuencia de países, mismo
      orden, misma canción, mismas plantillas (traza serializada comparada, PLAN fase 0).
- [ ] Prueba automática de 400 días consecutivos: ningún país se repite en ventanas de 30
      retos, ningún continente supera 3 por reto, los cupos 3/4/3 se cumplen siempre, el
      sorteo nunca entra en bucle.
- [ ] `DifficultyDirector` congelado verificado: el bot `autoplay=good` y el bot
      `autoplay=wrong` reciben **la misma secuencia de frases**.
- [ ] `LearningTracker`/`Progress` no influyen: un perfil con 100 partidas y un perfil
      nuevo ven carriles idénticos en el mismo reto.
- [ ] Cambio de día UTC en mitad de una partida: se termina el reto que se empezó.

**Compartir**
- [ ] El texto se ve bien en X, WhatsApp, Telegram, Discord, iMessage y Instagram DM, en
      tema claro y oscuro (el `⬛` es el riesgo).
- [ ] El enlace abre exactamente la misma partida, en móvil y escritorio.
- [ ] El enlace de un reto pasado avisa de que es archivo y ofrece el de hoy.
- [ ] `navigator.share` funciona en iOS (llamada dentro del gesto) y degrada a
      portapapeles en escritorio.
- [ ] La tarjeta se genera en < 150 ms en un móvil de gama media y pesa < 1 MB.
- [ ] La previsualización del enlace (og:image) no contiene el resultado de nadie.

**Producto**
- [ ] El audio arranca solo tras un gesto (política de autoplay) y hay una pantalla de
      "toca para empezar" que no parece un error.
- [ ] Movimiento reducido respetado también en la cuadrícula animada de resultados.
- [ ] Contador local hasta el próximo reto, con la hora local del usuario.
- [ ] Modo asistido accesible desde la portada del Diario, no escondido.
- [ ] **Código de progreso exportable disponible** (o la racha no se lanza; ver §4.2).
- [ ] Pantalla de diagnóstico y texto de privacidad de una línea: *"Todo se guarda en tu
      navegador. No enviamos nada a ningún sitio."*

**Lanzamiento**
- [ ] Página de prensa/creadores: qué es en 2 frases, GIF de 6 s, capturas, y el punto de
      **música libre de derechos**.
- [ ] El vídeo de 30 s de §6.3 grabado.
- [ ] 15–20 personas reales avisadas para jugar el día 1 (un diario sin nadie con quien
      compararse no es un diario).
- [ ] Un sitio donde hablar (un Discord pequeño basta) enlazado desde resultados.

---

## 8. Qué NO haremos

- **Cuentas, registro o correo electrónico.** Ni "opcional".
- **Ranking global de puntuación.** La puntuación es de cliente: es falsificable en 30
  segundos. Solo con revalidación por repetición en servidor (PLAN fase 6).
- **Notificaciones push de racha.** Ni *"tu racha de 7 días está en peligro"*. Jamás.
- **Compartir para desbloquear.** Nada del juego se abre por compartir.
- **Pedir que se comparta antes de enseñar el resultado.** El resultado primero, siempre.
- **Rescatar rachas** por dinero, por anuncio o por ninguna otra vía.
- **Analítica de terceros, píxeles o huella de navegador.**
- **Dificultad adaptativa en el Diario.** Rompe la comparación, que es el producto entero.
- **Emojis de bandera de los países jugados en el texto.** Revientan en Windows y destripan
  las respuestas.
- **Poner el resultado en la URL compartida.**
- **Publicidad, cosméticos, tienda o cualquier monetización** en esta fase.
- **Tarjeta de imagen con confeti y marca de agua gigante.** Si parece un anuncio, nadie la
  comparte.
- **Un segundo reto diario** (capitales) antes de que el primero demuestre retención.
- **Medir "tiempo de sesión" como objetivo.** Un reto de 75 s que se juega todos los días
  es mejor producto que uno de 20 minutos que se juega una vez.

---

## 9. Orden de implementación sugerido

Dentro de la fase 3, y solo cuando las fases 1 y 2 estén cerradas:

1. `Daily.ts` (semilla, número, sorteo, tabla de rondas) + pruebas de 400 días. **2 días.**
2. Modo Diario en el flujo: portada, sellado, reanudación, guardado. **3 días.**
3. Texto compartible variante B + enlace `/d/<n>` + archivo. **2 días.**
4. Racha y escudos, **junto con** el código de progreso exportable. **3 días.**
5. Contadores de métricas + pantalla de diagnóstico. **1 día.**
6. Tarjeta en imagen (4:5 y 16:9). **3 días.**

El 6 es el único que se puede cortar sin romper nada. Si el reparto aprieta, se corta.

---

## 10. Disidencia

Me han encargado especificar esto y lo he especificado completo y listo para construir.
Dicho eso, estas son mis objeciones, por orden de importancia.

**10.1 El reto diario no es lo más importante, y PLAN.md ya tenía razón.** El Diario
retiene a quien ya disfruta del juego; no hace que a nadie le guste. Sesenta conciertos con
la misma estructura siguen siendo el riesgo número uno. Si traemos tráfico con un vídeo
bueno a un juego que se agota en diez minutos, gastamos la única primera impresión que
tenemos y no hay segunda. El orden del plan revisado (variedad → enseñar de verdad →
difundir) es correcto y no lo cambiaría. Este documento describe la fase 3, no la 1.

**10.2 Para el público de creadores, el inglés vale más que el reto diario.** Es mi
discrepancia más fuerte con PLAN.md, que lo deja en la fase 6. El mercado
hispanohablante de "adivina la bandera" existe pero es pequeño; el inglés lo multiplica por
diez y es la diferencia entre un canal que nos prueba y treinta. Además, cada semana que
pasa con los textos incrustados en el código lo hace más caro. **Recomendación: subir el
inglés a la fase 2**, justo después de los arquetipos, antes del Diario. Métrica que lo
valida: proporción de visitas con `navigator.language` no español, medible el día 1 sin
backend (solo hay que mirarlo, no guardarlo).

**10.3 La tarjeta en imagen es lo de peor rendimiento de las tres.** Cuesta tres veces más
que el texto y viaja mucho menos: el texto se pega en un grupo de WhatsApp en dos segundos
y se lee sin abrir nada; la imagen exige subirla y se pierde en un feed. **Recomendación:
lanzar solo el texto y no construir la tarjeta hasta que la métrica 3 supere el 6 %.** Si
nadie comparte el texto, nadie va a compartir la imagen.

**10.4 La racha es la función con peor relación riesgo/recompensa.** Es frágil por
construcción (un borrado de datos la mata), fabrica culpa con facilidad y es donde más
cerca estamos de convertirnos en lo que no queremos ser. La versión que he especificado
(sin mínimo, escudos silenciosos, sin rescate, sin poder) es la más inofensiva que se me
ocurre. Aun así: **si hay que recortar algo de la fase 3, recorto la racha antes que el
texto compartible**, y desde luego no la lanzo sin el código de progreso exportable.

**10.5 El objetivo de ≥ 25 % de compartidos de PLAN.md está mal calibrado** y conviene
corregirlo antes de que se convierta en el listón por el que se juzga el trabajo. La
referencia honesta es 6–12 %.

**10.6 Lo que sí creo que puede pasar, dicho con honestidad.** No hay viralidad
garantizada. El embudo real es: vídeo → clic → 60 segundos → compartir, y cada escalón
pierde alrededor de un orden de magnitud. Con un vídeo que funcione razonablemente bien,
el resultado esperable es cientos de jugadores, no miles. La forma de que eso no se apague
en una semana no es un mejor texto compartible: es que el segundo día de juego sea tan
bueno como el primero. Ahí es donde está el dinero.

**10.7 Hay una función que no está en este encargo y que colocaría por delante de la
tarjeta de imagen**: el **modo Chat** (§6.1, punto 5). Es la única de la lista que produce
contenido que no depende de que nosotros grabemos nada, y convierte a quien mira en alguien
que juega sin salir del directo. Si el objetivo declarado es crecer por creadores, es la
función con mejor relación coste/impacto de todo el documento.
