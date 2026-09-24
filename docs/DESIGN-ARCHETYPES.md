# DESIGN · Primitivas y arquetipos de concierto

Documento de diseño implementable. Todo lo que hay aquí está escrito contra el código real:
`src/game/ChallengeGenerator.ts`, `src/game/Setlist.ts`, `src/game/Tour.ts`, `src/rhythm/types.ts`,
`src/rhythm/Judge.ts`, `src/rhythm/RhythmEngine.ts`, `src/ui/Stage.ts`, `src/input/Input.ts`,
`src/audio/AudioEngine.ts`, `src/game/Difficulty.ts`, `src/game/SessionStats.ts`.

**Problema que resuelve:** los 60 conciertos del Beat Tour comparten una sola forma
(`Setlist.planned()`: título → enseñar de dos en dos → adaptativo → finale). La variedad actual
vive dentro de `adaptive()` —qué plantilla, qué patrón de tambor— y eso el jugador no lo percibe
como variedad, lo percibe como ruido dentro de la misma canción. La repetición es **estructural**,
no de plantillas.

**Solución:** dos verbos nuevos (HOLD, ECHO) y seis formas de concierto (arquetipos) que se reparten
por el Tour de manera autoral, no aleatoria.

---

## 0. Vocabulario y estado actual (para no inventar nada)

| Concepto | Dónde vive | Valores hoy |
|---|---|---|
| Plantilla rítmica | `ChallengeGenerator.TEMPLATES` | `four` (8 beats, nombres en 4-7), `gap` (8, nombres 3,4,6,7, `dropBeats:[5]`), `eight` (12, nombres 4-11), `tension` (8, nombres 4-7, `dropBeats:[1,2,3]`, `crashAt:[4]`), `rapid` (8, nombres 3-7), `double` (12, nombres 4-11, 2 dianas), `quick` (4, nombres 2-3) |
| Patrón de tambor | `ChallengeGenerator.DRUMS` | `none` `[]`, `basic` `[-2,-1]`, `pickup` `[-4,-2,-1]`, `sync` `[-4,-2.5,-2,-1]`, `gallop` `[-4,-3,-2.5,-2,-1]`, `offbeats` `[-4,-3.5,-2.5,-1.5,-1]`, `triple` `[-2,-1.5,-1]` (relativos al **primer nombre**) |
| Tipo de ficha | `rhythm/types.ts` `OptionKind` | `'answer'` \| `'drum'` |
| Estado de ficha | `OptionState` | `pending` \| `hit` \| `wrong` \| `missed` \| `passed` |
| Error | `ErrorKind` | `knowledge` \| `rhythm` \| `noResponse` \| `stray` |
| Ventanas | `Judge.WINDOWS` | `perfect 0.08 s`, `good 0.16 s` (escaladas por dificultad) |
| Input | `input/Input.ts` | Solo `'hit'` (keydown Space / pointerdown). **No existe ningún evento de suelta.** |
| Parámetros de concierto | `Tour.ConcertParams` | `bpm, groove, maxTier, quick, flash, double, ghost, budget` |

Dos hechos del motor de los que depende todo lo que sigue:

1. **Una frase `demo: true` la toca la banda sola.** `Judge.update()` auto-acierta cada opción
   `correct` de un `demo` (grade `perfect`) y `RhythmEngine.buildChallenge()` programa su sonido a
   volumen completo (`const v = spec.demo ? 1 : this.prePlay(opt)`). Además `judgeInput()` excluye
   los `demo` de `live`, así que pulsar durante una demo no penaliza (cae en `whiff`). Esto hace
   que ECHO sea casi gratis.
2. **Todo se pre-agenda en el reloj de audio.** Los tambores suenan en su beat exacto aunque no los
   pulses (`prePlay`). Cualquier sonido nuevo debe seguir la misma política o sonará tarde en móvil.

---

## 1. Primitivas nuevas

### 1.A — HOLD (sostén)

**Qué es:** una ficha larga que cruza el carril; se pulsa en su cabeza, se mantiene pulsado mientras
el cuerpo atraviesa el pad, y se suelta en su cola.

#### 1.A.1 Qué significa en contenido — y por qué

**Decisión: HOLD es una ficha de la familia del tambor. Nunca es una decisión de conocimiento.**

Justificación, en tres pasos:

1. Con **un solo input** no se puede pedir a la vez "elige" y "sostén". Si la ficha larga fuera un
   nombre de país, el jugador tendría que decidir *en el aire* si esta ficha se sostiene o se
   golpea, y un fallo mezclaría error de conocimiento con error de ritmo.
2. Esa mezcla rompe lo más valioso del juego: `ErrorKind` separa `knowledge` de `rhythm`, y esa
   separación es literalmente el modelo de aprendizaje (`Game.onResolved()` → `LearningTracker.record()`
   → `Progress.recordOutcomes()` → cajas de Leitner). Contaminarla degrada la repetición espaciada.
3. Por lo tanto el HOLD tiene que ocupar el espacio que **hoy está vacío**: los beats de entradilla,
   entre que aparece la bandera (beat 0) y cae el primer nombre. Hoy ahí sólo hay tambores de adorno
   (`pickup`, `sync`, `gallop`) y el jugador los toca de memoria mientras lee la bandera.

**Regla de contenido, en una frase: el HOLD es el tiempo de lectura, convertido en acción.**

El sostén empieza en el beat de la bandera y termina **un beat antes del primer nombre**. Aparece
cuando leer cuesta más:

| Condición sobre la diana | Por qué | Comprobación |
|---|---|---|
| `pack.answerLabel(target).length > 14` | Capitales largas (`CIUDAD DEL VATICANO`, `ANDORRA LA VIEJA`, `SRI JAYAWARDENAPURA KOTTE`). El `Stage` ya usa este umbral: `len-xl` a >15, `len-l` a >10. | `ChallengeGenerator.challengePhrase()` |
| `target.difficulty === 3` | Banderas/países raros (`COUNTRIES.difficulty: 3 = rare`). | ídem |
| `(target.lookalikes ?? []).length >= 4` | Racimos de parecidas: hay que mirar dos veces. Cubre toda la Gira Mundial. | ídem |

Si no se cumple ninguna, la frase lleva su patrón de tambor normal. Esto hace que el HOLD **signifique
algo** cada vez que aparece: "esta te va a costar, tómate el compás".

#### 1.A.2 Duración

El sostén va de `flagBeat` a `firstAnswerBeat - 1`. Longitud resultante por plantilla:

| Plantilla | `flagBeat` | 1.er nombre | `lenBeats` | ¿Admite HOLD? |
|---|---|---|---|---|
| `four` | 0 | 4 | **3** | Sí |
| `eight` | 0 | 4 | **3** | Sí |
| `double` | 0 | 4 | **3** | Sí |
| `rapid` | 0 | 3 | **2** | Sí |
| `gap` | 0 | 3 | **2** | Sí |
| `tension` | 0 | 4 | **3** | Sí (y el mejor: `dropBeats:[1,2,3]` calla a la banda, el sostén *es* la banda) |
| `quick` | 0 | 2 | 1 | **No** (1 beat no se distingue de un toque) |

Mínimo 2 beats, máximo 3. **Nada de sostenes de 4+ beats ni encadenados**: cansan la mano, y con el
sonido pre-agendado un sostén largo tapa la banda.

**Invariante duro (test unitario obligatorio):** ninguna otra ficha cae dentro de
`(holdBeat, holdBeat + lenBeats]`. Como el HOLD sustituye por completo al patrón de tambor de esa
frase, se cumple por construcción, pero hay que afirmarlo en test porque con un input no se puede
sostener y golpear a la vez.

#### 1.A.3 Representación visual en el carril

`Stage.makeToken()` gana una rama `o.kind === 'hold'`:

```
<div class="token hold" style="--len: 3">
  <div class="tk hold">
    <i class="hold-head"></i>
    <b class="hold-body"></b>     <!-- width: calc(var(--spacing) * var(--len)) -->
    <i class="hold-tail"></i>
  </div>
</div>
```

- **Cabeza**: círculo del mismo diámetro que un `.tk.drum`, para que se lea como "aquí se pulsa".
- **Cuerpo**: cápsula de ancho `L.spacing * lenBeats`, con textura de rayas diagonales lentas
  (animación CSS infinita) que dice "esto dura".
- **Cola**: media cápsula con un bisel, para que se lea como "aquí se suelta".
- **Movimiento lineal, no salto.** En `Stage.render()`, si `o.kind === 'hold'` usar `pos = b`
  (la rama `reduced` de `hop()`). Razón de diseño: una nota sostenida *se desliza*; una barra de
  3 beats dando botes se lee como un error de renderizado. Además el contraste con las fichas que
  botan es señalización gratis.
- **Durante el sostén** (`state === 'holding'`): el cuerpo se rellena de color de acierto desde la
  cabeza con `--fill = clamp01((now - o.time) / (o.endTime - o.time))`, actualizado en `render()`.
  El `.keycap` mantiene la clase `.down` todo el sostén (hoy se quita a los 120 ms). Chispas:
  `fx.burst(L.padX, L.laneY - 10, { n: 1, shape: 'dot', speed: 220, size: 8, life: 0.3 })` cada
  ~0.12 s.
- **Al romperse**: `.tk.hold.broken`, el tramo restante vira a gris y se cizalla (`scaleX` a 0 desde
  la cabeza) en 180 ms.
- **Al completarse**: la cola hace el mismo pop que `tokenHit()` y
  `fx.burst(L.padX, L.laneY - 20, { n: 14, shape: 'star', speed: 620, size: 16 })`.
- **Variante fantasma** (`spec.ghost`): solo contorno, igual que `.tk.drum.ghost`.
- **Recorte de tokens**: `Stage.render()` hoy descarta con `b < -2.3`. Con holds hay que descartar
  con `b + (o.lenBeats ?? 0) < -2.3`, o la cola desaparece mientras aún se está sosteniendo.

#### 1.A.4 Juicio

**Tipos nuevos** (`rhythm/types.ts`):

```
OptionKind   += 'hold'
OptionSpec   += lenBeats?: number
OptionState  += 'holding' | 'broken'
ChallengeOption += lenBeats: number, endTime: number, releaseJudgement?: Judgement
ChallengeSpec   += (sin cambios)
```

**Input** (`input/Input.ts`) — esto es obligatorio y hoy no existe:

```
Action += 'release'
keyup Space  → emit('release', e.timeStamp)   (hoy solo hace preventDefault)
pointerup / pointercancel / pointerleave sobre pointerArea → emit('release', e.timeStamp)
```

`Game` mantiene `private keyDown = false`, puesto a `true` en `'hit'` y a `false` en `'release'`.
`'release'` se convierte al reloj oído igual que `onHit()`:
`audio.heardTime(evTs) - audio.inputOffsetMs / 1000`.

**Inicio.** Lo resuelve `Judge.judgeInput()` sin cambios: el HOLD es la ficha pendiente más cercana
y gana la pulsación. Luego:

| Caso | Resultado |
|---|---|
| `\|Δ\| ≤ w.good` | `state = 'holding'`, `judgement = graded(...)`, `drum: true`. Suma combo ya (feedback inmediato). |
| `w.good < \|Δ\| ≤ min(beatDur*0.5, 0.45)` | `state = 'broken'`, `{ grade:'miss', errorKind:'rhythm', drum:true }`. Fallaste el ataque: la nota se pierde, no se ofrece sostén. |
| Nunca se pulsa | `Judge.update()` a `now > time + w.good` → `state = 'missed'`, `errorKind:'rhythm'`, `drum:true` (idéntico a un tambor perdido hoy). |

**Sostenimiento.** Método nuevo `Judge.updateHold(now: number, keyDown: boolean): Judgement[]`,
llamado desde `Game.frame()` justo después de `judge.update(now)` (ya tiene `now` y el estado de
tecla). Para cada opción en `'holding'`:

| Caso | Resultado |
|---|---|
| `!keyDown` y `now < endTime - releaseWindow` | **Soltaste pronto** → `state='broken'`, `{ grade:'miss', errorKind:'rhythm', drum:true }` |
| `keyDown` y `now > endTime + releaseWindow` | **Te pasaste** → `state='broken'`, mismo juicio |

**Suelta.** Acción `'release'` en tiempo `t`, con la opción en `'holding'`:

| Caso | Resultado |
|---|---|
| `\|t - endTime\| ≤ releaseWindow` | `state='hit'`, `releaseJudgement = graded(t - endTime, ...)` |
| Fuera | ya lo habrá capturado `updateHold` como `broken` |

`releaseWindow = w.good * 1.5` → 0.30 s en FÁCIL, **0.24 s en NORMAL**, 0.195 en DIFÍCIL,
0.157 en EXPERTO. Justificación: soltar es motoramente menos preciso que pulsar; si la ventana de
suelta fuera igual que la de golpe, el HOLD se leería como injusto. El sostén se gana en la cabeza
y se disfruta en el cuerpo; la cola es generosa a propósito.

`'release'` **nunca pasa por `judgeInput()`**, así que no puede consumir otra ficha. Y la pulsación
que inició el sostén ya dejó la opción fuera de `'pending'`, así que tampoco se rejuzga.

**Dos ajustes en `Judge` que hay que hacer sí o sí** (hoy asumen que la última ficha acaba en su
`time`):

- `judgeInput()` línea ~29: la ventana viva del challenge debe ser
  `t <= last.time + last.lenBeats * c.beatDur + c.beatDur * 0.5`.
- `update()` línea ~111: la resolución debe esperar a
  `now > last.time + last.lenBeats * c.beatDur + w.good + 0.02`.

**`Setlist.adjust()` no necesita cambios**: su filtro de contratiempos empieza con
`if (o.kind !== 'drum') return true`, así que los holds pasan intactos en FÁCIL. (Verificar en test.)

#### 1.A.5 Puntuación

Reutiliza `SessionStats` sin tocar su API:

- Inicio válido → `stats.hit(grade, /* drum */ true)` → 30 (perfect) / 15 (good) + combo.
- Suelta válida → `stats.hit(gradeDeSuelta, true)` + bonus de sostén: `stats.score += 20 * lenBeats`.
- Rotura → **un solo** `stats.fail('rhythm')`. Nunca dos penalizaciones por el mismo sostén.

#### 1.A.6 Sonido (todo sintetizado, pre-agendado)

Método nuevo en `AudioEngine`:

```
holdNote(t: number, dur: number, midi: number): { cut(at: number): void }
```

Construcción con las piezas que ya existen en el fichero:

- Voz: `osc('sawtooth', mtof(midi))` + `osc('sine', mtof(midi - 12))`, ambos a un `BiquadFilterNode`
  lowpass: `400 Hz` en `t` → `2200 Hz` en `t + 0.12` → `900 Hz` en `t + dur`.
- Envolvente **con meseta real** (esto es lo que `vca()` no sabe hacer, que siempre decae):
  `gain.setValueAtTime(0.0001, t)` →
  `exponentialRampToValueAtTime(0.22, t + 0.02)` →
  `setValueAtTime(0.22, t + dur - 0.06)` →
  `exponentialRampToValueAtTime(0.0001, t + dur)`.
- Textura: `shaker(t + k * beatDur/4, 0.05)` en cada semicorchea del sostén. Es lo que hace que el
  oído oiga "estoy sosteniendo" y no "hay un pitido".
- Salida: bus `sfx` (es la voz del jugador, no de la banda).
- `midi = 36 + mix.transpose + 12`. Una nota larga fuera de tono es la diferencia entre instrumento
  y zumbido; `mix.transpose` ya está disponible en `RhythmEngine` (lo recibe en el constructor).
- `cut(at)`: `gain.cancelScheduledValues(at); gain.setTargetAtTime(0.0001, at, 0.01)`.

**Dónde se programa:** en `RhythmEngine.buildChallenge()`, junto a los tambores, bajo la misma
política `prePlay(opt)`. El handle devuelto se guarda en la opción (`o.audio`) para poder cortarlo.

**Sonidos de reacción:**

| Evento | Sonido |
|---|---|
| Rotura | `o.audio.cut(now)` + `a.drumMiss(now)` + `a.dip()` |
| Suelta perfecta | `a.perfect(at, step)` |
| Suelta good | `a.good(at, step)` |
| Suelta de un hold de 3 beats | además `a.crash(at, 0.12)` |

#### 1.A.7 Cómo se enseña la primera vez (regla de oro)

Frase `holdIntro()` en `Setlist`, gemela de `doubleIntro()`, 8 beats, anunciada:

```
{ type:'text', beat:0, text:'¡SOSTÉN!', sub:'mantén ESPACIO mientras cruza', style:'top', beats:7.6 }
```

- beats 0-1: dos tambores `basic`.
- beat 2: un HOLD de 2 beats **en `demo: true`** → la banda lo toca sola, el jugador *ve* la barra
  rellenarse y *oye* la nota larga. Cero riesgo de fallo.
- beats 4-5: dos tambores.
- beat 6: el mismo HOLD de 2 beats, ahora `scored: true`, con `hint: true`.

Después, `banner('AHORA TÚ', bpm, groove, 'go')`. Se registra en el `Setlist.introduced` (que ya
existe) con la clave `'hold'`, y en `Progress` con `seenArchetypes`/`seenPrimitives` para que no se
repita entre sesiones.

**Texto táctil:** `layout.inputWord()` hoy sólo hace `ESPACIO → TOCA`, lo que convertiría
"mantén ESPACIO" en "mantén TOCA". Añadir una segunda regla: `mantén ESPACIO → mantén el dedo`,
aplicada **antes** que la primera.

#### 1.A.8 Veredicto sobre HOLD

HOLD es, con diferencia, la adición más cara del documento: acción de input nueva, `OptionKind`
nuevo, dos `OptionState` nuevos, una rama de juicio nueva con estado entre frames, una voz sintética
sostenida con handle de corte, un renderizador de ficha con movimiento distinto, una frase tutorial,
y un caso límite táctil real (`pointercancel` en iOS al mover mínimamente el dedo).

**Merece la pena, pero sólo con este alcance reducido:** una sola regla de longitud (beat de la
bandera → un beat antes del primer nombre), un solo sitio (el compás de lectura) y dos arquetipos
(DESFILE y JEFE) más el tutorial. Un juego de un solo input necesita un segundo verbo o los 60
conciertos se sentirán idénticos por mucho que se barajen las frases.

**Si hay que recortar, se recortan las variantes de HOLD, no el HOLD.** Lo que no se debe hacer es
la versión "rica" (holds de longitud libre, encadenados, sobre nombres): ver §4.

---

### 1.B — ECHO (llamada y respuesta)

**Qué es:** la banda toca un patrón de 4 tiempos; el jugador lo repite en los 4 siguientes.

#### 1.B.1 Longitud

**4 beats de llamada + 4 beats de respuesta = 8 beats = 2 compases por ronda.** Un bloque de ECO son
**2 rondas = 16 beats**.

Por qué no más: 4 beats es el límite de lo que se repite en frío sin memoria de trabajo entrenada
(el público objetivo es infantil), y 2 compases es lo máximo que la bandera puede estar fuera de
pantalla sin que el concierto se sienta parado.

#### 1.B.2 Patrones (rejilla de semicorcheas, 3-5 golpes dentro de 4 beats)

| Id | Golpes | Nivel |
|---|---|---|
| `E1` | `[0, 1, 2, 3]` | tier 0 — el pulso liso; **siempre es la primera ronda que ve el jugador** |
| `E2` | `[0, 1, 1.5, 3]` | tier 0-1 |
| `E3` | `[0, 0.5, 2, 3]` | tier 1 |
| `E4` | `[0, 1, 2, 2.5, 3]` | tier 1-2 |
| `E5` | `[0, 1.5, 2, 3.5]` | tier 2 |
| `E6` | `[0, 0.5, 1, 2, 3]` | tier 2 |

En FÁCIL, `Setlist.adjust()` redondea los contratiempos y deduplica. La transformación es
determinista e idéntica para llamada y respuesta (ambas son `drumPhrase`, sin opciones `answer`),
así que **el patrón sigue casando**. Esto hay que afirmarlo en test (§5).

#### 1.B.3 Cómo se muestra

**Llamada:** `cg.drumPhrase(4, pattern, { demo: true, ghost: true, ... })`.

Esto funciona **con el código que ya existe**: `demo` hace que `Judge.update()` auto-acierte cada
golpe en su tiempo y que `RhythmEngine` programe `drumHit` a volumen 1. Las fichas cruzan el carril
como contornos (`.tk.drum.ghost`, ya implementado) y revientan solas al llegar al pad. La banda
toca, literalmente, sin una línea de juicio nueva.

Añadidos:

- `{ type:'text', beat:0, text:'¡ESCUCHA!', style:'top', beats:3.6 }`
- Evento nuevo `{ type:'call'; beat:number; on:boolean }` → `Stage` hace
  `this.dj.classList.toggle('calling', ev.on)`. Con eso el planeta se mueve marcando el patrón: es
  **él** quien toca. (2 líneas en `Game.onVisual()`, 2 en `Stage`.)
- `dropBeats: [1, 2, 3]` en la llamada para que la banda se adelgace y el patrón se oiga limpio.
  Esto requiere que `drumPhrase()` acepte `dropBeats` (hoy no lo expone; `Phrase` sí lo soporta).

**Respuesta:** `cg.drumPhrase(4, mismoPattern, { scored: true, ghost: false })` precedida de
`{ type:'text', beat:0, text:'¡TÚ!', style:'top', beats:3.6 }`. Fichas sólidas.

#### 1.B.4 Juicio de cada golpe

**Cero código nuevo.** Cada golpe de la respuesta es una opción `kind:'drum', correct:true` normal:

| Situación | Qué pasa hoy, sin tocar nada |
|---|---|
| Golpe en ventana | `graded()` → `perfect`/`good`, combo, `drumHit` sonando en el beat exacto |
| Golpe fuera de ventana | `state='missed'`, `errorKind:'rhythm'` |
| **Golpes de sobra** | `judgeInput()` no encuentra ficha pendiente cerca → `errorKind:'stray'` (o `whiff` si está fuera de toda ventana de challenge). Rompe el combo. **No añadir penalización extra.** |
| **Golpes de menos** | `Judge.update()` auto-falla cada uno: `kind:'auto'`, `errorKind:'rhythm'` |

#### 1.B.5 Por qué vale la pena

1. **Respiro.** Sin bandera no hay carga de conocimiento. Cae exactamente donde el concierto
   fatigaría (mitad del cuerpo) y donde hoy sólo hay un `drumPhrase` genérico de "¡SOLO DE TAMBOR!".
2. **Enseña el compás.** Es el único momento del juego en el que el ritmo es el **contenido** y no
   el envoltorio. El jugador oye un compás y lo devuelve: eso es alfabetización rítmica real, y
   transfiere directamente a los patrones `sync`/`gallop`/`offbeats` del resto del concierto.
3. **Lucimiento.** Un eco limpio es lo más "músico" que se siente el jugador, y es 100% alcanzable
   (no hay nada que saber). Es el latido de confianza fiable del concierto.

#### 1.B.6 Qué hay que añadir

| Cambio | Fichero | Tamaño |
|---|---|---|
| `ChallengeSpec.echo?: boolean` | `rhythm/types.ts` | 1 línea |
| `PhraseEvent` variante `{ type:'call'; beat; on: boolean }` | `rhythm/types.ts` | 1 línea |
| `drumPhrase()` acepta `dropBeats` | `ChallengeGenerator.ts` | 2 líneas |
| `echoPair(pattern, o): [Phrase, Phrase]` | `ChallengeGenerator.ts` | ~15 líneas |
| `SessionStats.echoRounds` / `echoClean` | `SessionStats.ts` | 2 campos |
| Contar ronda limpia en `Game.onResolved()` | `Game.ts` | 3 líneas |
| `.dj.calling` | `style.css` | CSS |

**Nada en `Judge.ts`.** ECHO es barato y debe implementarse **primero**.

---

## 2. Los seis arquetipos

### 2.0 Esqueleto común

Todo concierto conserva la forma de `Setlist.planned()`:

```
TÍTULO (4 beats)
  → PRESENTACIÓN  (sólo si plan.newItems.length > 0)
  → CUERPO        (← esto es lo que define el arquetipo)
  → FINALE (8 beats)
```

**PRESENTACIÓN** = el bloque actual, sin tocar: por cada pareja de ítems nuevos, `teach(pair)` (4
beats) y una frase `four` por ítem (8 beats cada una).

- 4 ítems nuevos → 2 × (4 + 8 + 8) = **40 beats**
- 5 ítems nuevos → 4+8+8, 4+8+8, 4+8 = **48 beats**

Esto es crítico para el reparto: **41 de los 60 conciertos introducen países nuevos**, así que
*todos* los arquetipos (menos los de la Gira Mundial y los finales) llevan presentación. El
arquetipo gobierna **lo que viene después**. ESCUELA es el arquetipo en el que la presentación *es*
casi todo el concierto.

**Presupuesto de cuerpo**: `corto` = 48 beats (conciertos con presentación), `largo` = 96 beats
(conciertos sin ítems nuevos: Gira Mundial y GRAN FINAL).

**Cómo se anuncia un arquetipo** — tres capas, y las tres son obligatorias:

1. **En el mapa del Tour** (`ui/Hubs.ts`), antes de pulsar jugar: cada nodo de concierto lleva una
   insignia con el nombre del arquetipo y su regla en una línea. El jugador elige sabiendo.
2. **En el título del concierto**: `title(pl.title, pl.sub, ...)` ya existe; `sub` pasa a ser
   `'ECO · repite el patrón'`, `'CARRERA · una bandera por compás'`, etc.
3. **La primera vez que aparece su primitiva**: frase demo + banner, exactamente como
   `doubleIntro()` hoy (`holdIntro()`, `echoIntro()`), registrada en `Setlist.introduced` y
   persistida en `Progress`.

Segundos objetivo por beat: 100 BPM → 0.600 s · 104 → 0.577 · 108 → 0.556 · 112 → 0.536 · 115 → 0.522.

---

### 2.1 ESCUELA

**Fantasía:** *la banda te presenta a sus nuevos miembros y no pasas al siguiente hasta que los
reconoces.*

**Estructura exacta**

| Bloque | Beats | Detalle |
|---|---|---|
| Título | 4 | `title(stage.name, 'ESCUELA · dos nuevos cada vez', ...)`, `crashAt:[0]`, jingle `section` |
| Presentación **extendida** | 56 | Por pareja: `teach(pair)` 4 + `four`/`pickup` 8 + `four`/`sync` 8 + `gap`/`pickup` 8 = 28. Dos parejas = 56. La tercera frase por pareja mezcla los dos ítems recién enseñados como distractores mutuos (`prefer: pair`). |
| Cuerpo adaptativo | 40 | `adaptive({ maxTier: 1, allowQuick: false, allowFlash: false, allowDouble: false, ghostChance: 0, drumBreak: false })` → plantillas `four`/`gap`/`rapid`, tambores `basic`/`pickup`/`sync`/`gallop` |
| Finale | 8 | `finale(bpm)` |
| **Total** | **108** | **62.3 s a 104 BPM** |

**Primitivas:** TAP solamente. ESCUELA es la línea base y tiene que quedarse limpia: es el concierto
donde el jugador aprende **países**, no mecánicas.

**Criterio de superación:** el actual (`starsFor`): `accuracy ≥ 0.7`. 3 estrellas con `≥ 0.9` +
`timingPct ≥ 80`. **Mide:** reconocimiento de ítems nuevos. Criterio adicional propuesto para la
insignia del mapa: los 4-5 ítems nuevos deben terminar en `Progress.level() !== 'nuevo'`.

**Anuncio:** insignia ESCUELA en el mapa + subtítulo + los textos que ya existen
(`'¡NUEVOS EN LA GIRA!'`, `'¡Y AHORA ESTOS!'`).

**Dónde aparece:** siempre en el concierto 1 de cada etapa y en la mayoría de los impares. 18 de 60.

---

### 2.2 CARRERA

**Fantasía:** *el tren no para: una bandera por compás y no te da tiempo a dudar.*

**Estructura exacta — cuerpo corto (48 beats)**

| Bloque | Beats | Detalle |
|---|---|---|
| Aviso + ráfaga 1 | 16 | `announce('quick')` → `'¡RÁFAGA!' / 'una bandera por compás'` (ya existe) + 4 × `quick`/`basic` |
| Respiro | 8 | `drumPhrase(8, [0,1,1.5,2,3,4,4.5,5,6,6.5,7])` + `'¡SOLO DE TAMBOR!'` (ya existe en `adaptive`) |
| Ráfaga 2 | 16 | 4 × `quick`/`basic` |
| Cierre | 8 | 1 × `rapid`/`gallop` (5 nombres, menos tiempo de lectura) |

**Cuerpo largo (96 beats):** ráfaga 6 (24) + respiro 8 + ráfaga 6 (24) + `rapid`×2 (16) +
respiro 8 + ráfaga 4 (16).

**Duración total (con presentación de 4):** 4 + 40 + 48 + 8 = 100 beats → **53.6 s a 112 BPM**.

**Primitivas:** TAP. Nada más: la fantasía es la densidad, y cualquier verbo extra la diluye.

**Plantilla nueva necesaria:** ninguna. `quick` ya existe y `adaptive()` ya sabe encadenarla.

**Criterio de superación:** `accuracy ≥ 0.75` **y** `noResponse ≤ 2`. **Mide:** velocidad de
reconocimiento, no precisión rítmica (por eso el umbral de conocimiento sube y el de timing no
cuenta para pasar).

**Anuncio:** insignia CARRERA + subtítulo `'CARRERA · una bandera por compás'` + el banner
`¡RÁFAGA!` que ya existe la primera vez.

**Nota de implementación:** hoy `adaptive()` bloquea `quick` tras `tier >= 1 && n >= 2`, y
`Tour.params()` sólo activa `quick` con `p >= 0.25` (o sea, **nunca en Europa**). CARRERA no pasa por
`adaptive()`: emite sus `quick` directamente, así que puede aparecer desde Europa-5. Ver §3.

---

### 2.3 ECO

**Fantasía:** *la banda te reta con un compás y tú se lo devuelves.*

**Estructura exacta — cuerpo corto (48 beats)**

| Bloque | Beats | Detalle |
|---|---|---|
| Bloque de eco A | 16 | 2 rondas: (llamada 4 + respuesta 4) × 2. Patrones por tier: 0 → `E1`,`E2`; 1 → `E2`,`E3`,`E4`; 2 → `E4`,`E5`,`E6`. **La primera ronda de la vida del jugador es siempre `E1`.** |
| Juego normal | 16 | 2 × `four`/`gap` con tambores del tier (`pickup`/`sync`/`gallop`) — devuelve al jugador al contrato principal |
| Bloque de eco B | 16 | 2 rondas, un escalón por encima de A |

**Cuerpo largo (96 beats):** eco A (16) + `adaptive` 32 + eco B (16) + `adaptive` 32.

**Duración total:** 4 + 40 + 48 + 8 = 100 beats → **56.6 s a 106 BPM** (ECO baja 2 BPM respecto a la
rampa: el respiro necesita aire).

**Primitivas:** ECHO + TAP.

**Criterio de superación:** `accuracy ≥ 0.7` (igual que hoy) **y** al menos **3 de 4 rondas limpias**,
donde limpia = todas las opciones de la frase de respuesta terminan en `state === 'hit'`.
**Mide:** lectura rítmica —si el jugador puede reproducir un compás que acaba de oír.

**Anuncio:** insignia ECO + subtítulo `'ECO · repite el patrón'`. La primera vez, `echoIntro()`:
una ronda `E1` con la respuesta también en `demo: true` (la banda la toca dos veces), banner
`'¡ECO!' / 'escucha… y repítelo'`, y luego la primera ronda real. Cero posibilidad de fallo en el
primer contacto.

---

### 2.4 MEMORIA

**Fantasía:** *la bandera se apaga y el compás sigue: la respuesta está en tu cabeza, no en la
pantalla.*

**Estructura exacta — cuerpo corto (48 beats)**

| Bloque | Beats | Detalle |
|---|---|---|
| Aviso FLASH + 2 frases | 16 | `announce('flash')` → `'¡FLASH!' / 'memoriza la bandera'` (ya existe) + `gap`/`pickup` con `flash:true` + `four`/`sync` con `flash:true`. El evento `cover` ya lo genera `challengePhrase()` cuando `o.flash` |
| Aviso A CIEGAS + 2 frases | 16 | `'¡A CIEGAS!' / 'siente el pulso'` (texto ya usado en `final2()`) + 2 × `tension` con `flash:true, ghost:true`. `tension` calla a la banda en 1-3 y remata con `crashAt:[4]` |
| Adaptativo memoria | 16 | `adaptive({ maxTier: 2, allowFlash: true, ghostChance: 0.6, allowQuick: false, allowDouble: false })` |

**Cuerpo largo (96 beats):** los 48 anteriores + `adaptive` 48 con `ghostChance: 0.6`.

**Duración total:** 4 + 40 + 48 + 8 = 100 beats → **55.6 s a 108 BPM**.

**Primitivas:** TAP + **HOLD opcional**. Cuando la frase lleva `holdRead`, el evento `cover` cae en
el **punto medio del sostén**: sostienes mientras la bandera se apaga. Es la coincidencia temática
perfecta entre las dos mecánicas y sale gratis (`challengePhrase` ya coloca `cover` en
`flagBeat + max(1, (first - flagBeat) / 2)`).

**Criterio de superación:** `accuracy ≥ 0.7` contando **sólo** las frases con `flash`. **Mide:**
retención a corto plazo, que es exactamente la señal que `LearningTracker` necesita para mover un
ítem de "aprendiendo" a "dominado".

**Anuncio:** insignia MEMORIA + subtítulo `'MEMORIA · la bandera se apaga'` + los banners `¡FLASH!`
y `¡A CIEGAS!` que ya existen.

**Restricción:** nunca antes de la etapa 2. Requiere `diff.flash` (falso en FÁCIL) — en FÁCIL,
MEMORIA degrada a `ghost` sin `cover`, que sigue siendo un concierto distinto y honesto.

---

### 2.5 DESFILE

**Fantasía:** *la carroza pasa despacio y ancha: frases largas, notas largas, todo se luce.*

**Estructura exacta — cuerpo corto (48 beats)**

| Bloque | Beats | Detalle |
|---|---|---|
| `holdIntro()` (sólo la 1.ª vez) | 8 | Ver §1.A.7. Si ya se enseñó, este bloque se sustituye por un `four`/`holdRead` normal |
| Pasacalles A | 24 | 2 × `eight`/`holdRead` (12 beats cada una: HOLD de 3 beats en 0-3, 8 nombres en 4-11) |
| Pasacalles B | 12 | 1 × `eight`/`holdRead` |
| Remate | 12 | 1 × `double`/`triple` (dos banderas, dos golpes) — sin HOLD, para que el `cowbell` del `cue:'double'` destaque |

**Cuerpo largo (96 beats):** `eight`/`holdRead` × 4 (48) + respiro `drumPhrase` 8 +
`eight`/`holdRead` × 2 (24) + `double` (12) + un `four`/`holdRead` de cierre (8) — el último HOLD del
concierto cae de forma que su cola coincide con el `crashAt` del finale.

**Duración total:** 4 + 40 + 48 + 8 = 100 beats → **60 s a 100 BPM** (DESFILE baja 4 BPM: la
fantasía es amplitud).

**Primitivas:** HOLD (protagonista) + TAP.

**Criterio de superación:** `accuracy ≥ 0.7` **y** `≥ 80 %` de los holds completados sin romper
(`state === 'hit'` frente a `'broken' | 'missed'`). **Mide:** control sostenido —la única métrica
motora del juego que no es "pulsar en el instante correcto".

**Anuncio:** insignia DESFILE + subtítulo `'DESFILE · sostén la nota larga'` + `holdIntro()` la
primera vez.

**Restricción:** nunca antes de que HOLD esté enseñado. Como DESFILE *es* quien lo enseña, su primera
aparición (Europa-7) lleva el tutorial obligatoriamente.

---

### 2.6 JEFE

**Fantasía:** *todo lo que sabes, a la vez, con público.*

Sustituye a los actuales `GRAN FINAL` (7 conciertos: uno por etapa + la Gira Mundial).

**Estructura exacta — siempre cuerpo largo (96 beats), sin presentación**

| Bloque | Beats | Detalle |
|---|---|---|
| Título + riser | 4 | `title(..., 'JEFE · todo junto')` + `{ type:'riser', beat:0, beats:4 }` (ya existe en `final()`) |
| `doubleIntro()` | 12 | Ya existe. Sólo si `diff.double` |
| Adaptativo 1 | 40 | `adaptive({ maxTier: 2, allowQuick: true, allowFlash: true, allowDouble: true, ghostChance: max(0.2, diff.ghost) })` |
| Bloque de eco | 16 | 2 rondas `E5`/`E6`. **Es el respiro dramático**: el único sitio del concierto donde se puede respirar, y llega justo antes del tramo más duro |
| Adaptativo 2 | 24 | Mismo tier, con `flash` forzado en al menos una frase |
| Sostén final | 4 | Un `tension`/`holdRead` cuyo HOLD de 3 beats acaba justo donde arranca el `finale` — la nota larga se funde con el `crash` del `scheduleFinale()` |
| Finale | 8 | `finale(bpm)` |
| **Total** | **108** | **56.4 s a 115 BPM** |

**Primitivas:** TAP + ECHO + HOLD. Las tres. Es el único concierto donde conviven.

**Criterio de superación:** el actual `starsFor(accuracy, timingPct)` sin cambios —`≥0.7` pasa,
`≥0.9` + `timingPct ≥ 80` son 3 estrellas. **Mide:** todo. Es el examen de la etapa.

**Anuncio:** insignia JEFE (color distinto en el mapa, nodo más grande) + subtítulo + el `riser` que
ya existe. Nunca introduce una mecánica nueva: por definición, todo lo que aparece en un JEFE ya se
enseñó antes en esa etapa.

---

### 2.7 Resumen de arquetipos

| Arquetipo | Fantasía | Primitivas | Cuerpo corto / largo | s @ BPM | Mide |
|---|---|---|---|---|---|
| ESCUELA | Te presentan a los nuevos | TAP | 40 / — | 62 @ 104 | Reconocimiento |
| CARRERA | El tren no para | TAP | 48 / 96 | 54 @ 112 | Velocidad |
| ECO | La banda te reta | ECHO, TAP | 48 / 96 | 57 @ 106 | Lectura rítmica |
| MEMORIA | La bandera se apaga | TAP, (HOLD) | 48 / 96 | 56 @ 108 | Retención |
| DESFILE | La carroza pasa | HOLD, TAP | 48 / 96 | 60 @ 100 | Control sostenido |
| JEFE | Todo junto, con público | TAP, ECHO, HOLD | — / 96 | 56 @ 115 | Todo |

Todos caen en **53-62 s**, dentro de la banda objetivo **55 ± 10 s**.

---

## 3. Reparto de los 60 conciertos y cambios en `Tour.ts`

### 3.1 Conciertos reales por etapa (pack `flags`, verificado contra `chunk()`)

`chunk()` hace trozos de 4, 4, y luego de 5; si el último trozo tiene menos de 3, se funde con el
anterior. Más un `GRAN FINAL` por etapa.

| Etapa | Países | Trozos | Conciertos |
|---|---|---|---|
| EUROPA | 45 | 4,4,5,5,5,5,5,5,7 | 9 + final = **10** |
| SUDAMÉRICA | 12 | 4,4,4 | 3 + final = **4** |
| NORTEAMÉRICA | 23 | 4,4,5,5,5 | 5 + final = **6** |
| ÁFRICA | 54 | 4,4,5×8,6 | 11 + final = **12** |
| ASIA | 47 | 4,4,5×7,4 | 10 + final = **11** |
| OCEANÍA | 14 | 4,4,6 | 3 + final = **4** |
| GIRA MUNDIAL | 12 racimos `FLAG_CLUSTERS` (todos con ≥4 ids) | — | 12 + final = **13** |
| | | | **60** |

(En el pack `capitals` hay 8 `CAPITAL_CLUSTERS`, así que la Gira Mundial tiene 9 conciertos y el
total baja. El reparto por posición sigue funcionando porque es una función de `(etapa, índice)`.)

### 3.2 Tabla de reparto

| Etapa | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **EUROPA** | ESC | ESC | **ECO** | ESC | **CAR** | ESC | **DES** | ECO | CAR | **JEFE** | | | |
| **SUDAMÉRICA** | ESC | **MEM** | DES | **JEFE** | | | | | | | | | |
| **NORTEAMÉRICA** | ESC | CAR | ESC | ECO | MEM | **JEFE** | | | | | | | |
| **ÁFRICA** | ESC | ECO | ESC | CAR | ESC | MEM | ESC | DES | ESC | CAR | ECO | **JEFE** | |
| **ASIA** | ESC | DES | ESC | MEM | ESC | CAR | ESC | ECO | ESC | MEM | **JEFE** | | |
| **OCEANÍA** | ESC | CAR | MEM | **JEFE** | | | | | | | | | |
| **GIRA MUNDIAL** | MEM | CAR | ECO | DES | MEM | CAR | DES | ECO | MEM | CAR | DES | ECO | **JEFE** |

En **negrita**, la primera aparición de cada arquetipo (lleva tutorial de su primitiva) y los JEFE.

**Totales:** ESCUELA 18 · CARRERA 10 · ECO 9 · MEMORIA 9 · DESFILE 7 · JEFE 7 = **60**.

ESCUELA es el más numeroso porque 41 conciertos introducen países nuevos y alguien tiene que
enseñarlos con calma; los demás arquetipos también llevan presentación, pero corta.

### 3.3 Regla de variedad y comprobación de los 10 primeros minutos

**Regla autoral (testeable):** en toda ventana de **5 conciertos consecutivos** del recorrido lineal
debe haber **≥ 3 arquetipos distintos**, y nunca dos conciertos seguidos del mismo arquetipo salvo
ESCUELA-ESCUELA en Europa-1/2 (el arranque, donde el jugador aún está aprendiendo el contrato base).

**10 minutos de juego reales** ≈ 8-9 conciertos (55-60 s cada uno + navegación del mapa):

| Min. aprox. | Concierto | Arquetipo | Distintos acumulados |
|---|---|---|---|
| 0-1 | EUR-1 | ESCUELA | 1 |
| 1-2 | EUR-2 | ESCUELA | 1 |
| 2-3 | EUR-3 | **ECO** | **2** |
| 3-4 | EUR-4 | ESCUELA | 2 |
| 4-5 | EUR-5 | **CARRERA** | **3** ✅ |
| 6-7 | EUR-6 | ESCUELA | 3 |
| 7-8 | EUR-7 | **DESFILE** | **4** |
| 8-9 | EUR-8 | ECO | 4 |
| 9-10 | EUR-9 | CARRERA | 4 |

**A los 5 minutos ya hay 3 arquetipos distintos; a los 10, cuatro.** Y la introducción de verbos es
escalonada y en el orden correcto: primero ECHO (no exige input nuevo), después HOLD (sí lo exige).

### 3.4 Cómo cambia `Tour.ts` (conceptualmente, sin código)

**1. `ConcertParams` gana tres campos.**

```
archetype: ArchetypeId   // 'escuela' | 'carrera' | 'eco' | 'memoria' | 'desfile' | 'jefe'
hold: boolean            // ¿este concierto puede colocar fichas HOLD?
echo: boolean            // ¿este concierto puede emitir bloques de eco?
```

y `budget` pasa a llamarse `bodyBeats` (el arquetipo decide cómo se gastan, no `adaptive()` sola).

**2. Nueva función pura `archetypeFor(stageId, index, isFinal): ArchetypeId`.**

Implementada como una **tabla literal por etapa** (la de §3.2), no como una fórmula. Razón: la
variedad tiene que ser autoral y legible de un vistazo; una fórmula módulo N produce el peor
concierto en algunas posiciones y nadie se entera. `isFinal === true` → siempre `'jefe'`.

**3. `params(p, groove, final)` pasa a ser `params(p, groove, arch)`.**

La posición del tour `p` sigue mandando en la dificultad; el arquetipo manda en el carácter:

| Campo | Hoy | Propuesto |
|---|---|---|
| `bpm` | `98 + 18p (+2 si final)` | igual, **más el sesgo del arquetipo**: CARRERA `+4`, ECO `−2`, DESFILE `−4`, JEFE `+2`, resto `0` |
| `maxTier` | `p<0.18 ? 0 : p<0.5 ? 1 : 2` | igual, pero ESCUELA lo capa a `1` y JEFE lo fuerza a `2` |
| `quick` | `p >= 0.25` | `arch === 'carrera' \|\| (p >= 0.25 && arch === 'jefe')` |
| `flash` | `p >= 0.4` | `arch === 'memoria' \|\| (p >= 0.4 && arch === 'jefe')` |
| `double` | `p >= 0.55` | `p >= 0.55 && (arch === 'desfile' \|\| arch === 'jefe')` |
| `ghost` | `p >= 0.8 ? 0.2 : 0` | `arch === 'memoria' ? 0.6 : arch === 'jefe' ? 0.2 : 0` |
| `hold` | — | `arch === 'desfile' \|\| arch === 'jefe' \|\| arch === 'memoria'` |
| `echo` | — | `arch === 'eco' \|\| arch === 'jefe'` |
| `bodyBeats` | `final ? 80 : 56` | `newIds.length ? 48 : 96` |

**Consecuencia importante:** hoy `quick` nunca se activa en Europa (`p ≤ 0.136`) y `flash` tampoco
hasta bien entrado el tour. Con el cambio, el arquetipo abre su mecánica cuando le toca por diseño,
no por aritmética.

**4. `ConcertDef` gana `archetype`**, y `ui/Hubs.ts` pinta la insignia en el nodo del mapa.

**5. `Setlist.planned(pl)` pasa a ser un despachador.**

```
planned(pl):
  yield title(...)                       // sub = nombre + regla del arquetipo
  if (pl.newItems.length) yield* presentacion(pl)
  yield* body(pl)                        // switch (pl.params.archetype) → 6 generadores
  yield finale(P.bpm)
```

Los seis generadores (`escuela`, `carrera`, `eco`, `memoria`, `desfile`, `jefe`) viven en `Setlist`
junto a `twins()`/`traps()`, que ya son exactamente este patrón. `adaptive()` no cambia: sigue siendo
la herramienta que los arquetipos usan para rellenar sus tramos libres.

**6. `Progress` gana `seenPrimitives: Set<'hold'|'echo'>`** persistido, para que el tutorial de cada
primitiva se emita una sola vez en la vida del jugador y no en cada sesión (hoy `Setlist.introduced`
se reinicia con cada `new Setlist(...)`).

**7. Beat Libre** (`Game.startFree`) elige arquetipo según el tamaño del set: `< 8` ítems → ESCUELA,
`8-15` → alterna ECO/MEMORIA, `> 15` → JEFE. Beat 1 y Beat 2 (`level: 1 | 2`) **no se tocan**: son
la ruta de entrada y tienen sus propias secciones escritas a mano.

---

## 4. Qué NO hacer

Ideas que suenan bien y empeorarían el juego.

**1. HOLD sobre nombres de país ("sostén la capital correcta").**
Suena a la evolución natural. Destruye la separación `knowledge` / `rhythm` de `ErrorKind`, que es el
modelo de aprendizaje entero (`onResolved` → `LearningTracker` → `Progress` → Leitner). Y con un solo
input, "¿esta ficha se sostiene o se golpea?" es una pregunta sin respuesta a mitad de compás.

**2. Un segundo input (dos teclas, dos zonas táctiles, deslizar).**
Rompe la promesa de producto y toda la geometría de `layout.ts`, que tiene **un** `padX`. La variedad
tiene que venir de *cuándo* y *cuánto tiempo* se pulsa, no de *dónde*.

**3. Cambiar el BPM dentro de un concierto.**
`AdaptiveOpts` lo dice explícitamente: *"One tempo per section: the pulse never shifts under the
player's feet"*. Un cambio de tempo desincroniza el espaciado de `hop()` (que asume `L.spacing`
px/beat constante), rompe la comparación honesta de dificultad entre conciertos y marea. El BPM
cambia **entre** conciertos, nunca dentro.

**4. Un arquetipo "aleatorio" o una barajada procedural de bloques.**
Variedad por azar es invariablemente peor: no se puede testear, no se puede equilibrar, y en algunas
semillas produce el peor concierto posible sin que nadie lo vea. La variedad se escribe a mano (§3.2)
y se comprueba con un test (§5).

**5. Añadir más `TemplateId` para combatir la repetición.**
Ya hay siete y el jugador no distingue `four` de `rapid` salvo por la densidad. La repetición es
estructural: todos los conciertos tienen la misma *forma*. Una octava plantilla no cambia nada que el
jugador perciba, y sí añade combinaciones que probar.

**6. Vidas, o fallar el concierto a mitad.**
`starsFor()` pasa con 0.7 de acierto y el objetivo es aprender. Expulsar a un niño a mitad de canción
rompe el bucle de repetición espaciada que depende de que `Progress.recordOutcomes()` reciba la
sesión completa. Un mal concierto debe terminar, dar 1 estrella y seguir.

**7. Un medidor o barra propia para el ECO.**
Un segundo sistema de puntuación en pantalla compite con el combo y el score por la atención justo en
el momento en que el jugador tiene que estar *escuchando*. La recompensa del eco es el sonido y el
`streak()` que ya existe. Nada más.

**8. Holds largos (>4 beats) o encadenados.**
Cansan físicamente, y con el sonido pre-agendado una nota larga tapa a la banda. Además, en táctil un
sostén largo multiplica el riesgo de `pointercancel`.

**9. Que el planeta "hable" con texto durante el eco o el sostén.**
Leer durante un ejercicio rítmico garantiza perder el beat. El planeta se comunica moviéndose
(`.dj.calling`, `sway-left`, `groovy`, `fever`), que es lo que ya hace bien.

**10. Un JEFE con barra de vida del jefe.**
Implica perder, lo que contradice el punto 6, y exige arte y una pantalla nueva. El "jefe" es la
dificultad del setlist, no un personaje.

**11. Colocar HOLD dentro de `quick`.**
`quick` tiene 4 beats y el primer nombre en el 2. Un sostén de 1 beat es indistinguible de un toque y
el jugador lo lee como un bug del motor.

**12. Aplicar el arquetipo a Beat 1 y Beat 2.**
Son la puerta de entrada y tienen secciones escritas a mano (`tutorial`, `practice`, `easy`,
`teachNew`, `twins`, `traps`). Meterles arquetipos añade riesgo al único tramo del juego que ya está
afinado.

---

## 5. Cómo se prueba cada cosa

Criterios verificables. Herramientas ya disponibles: `?debug=1&autoplay=good|spam|wrong|drums`
(la clase `Bot` de `Game.ts`) y el `DebugPanel` (`lateNotes`, `beat`, `phrase`, `lastDelta`, `tier`).

### 5.1 HOLD — juicio

| # | Prueba | Criterio de aprobado |
|---|---|---|
| H1 | Bot pulsa en `o.time` y mantiene hasta `o.endTime` | `state === 'holding'` en el frame siguiente a la pulsación; `state === 'hit'` tras la suelta; exactamente **2** llamadas a `stats.hit(_, true)` y **0** a `stats.fail` |
| H2 | Pulsa en `o.time + w.good + 0.01` | `state === 'broken'`, `errorKind === 'rhythm'`, `drum === true`, **1** `stats.fail` |
| H3 | Suelta en `endTime - releaseWindow - 0.01` | `state === 'broken'`, `errorKind === 'rhythm'`, **exactamente 1** `stats.fail` (nunca 2) |
| H4 | Nunca suelta (mantiene 3 s más) | `state === 'broken'` a `endTime + releaseWindow`; el frame siguiente **no** emite más juicios para esa opción |
| H5 | Nunca pulsa | `Judge.update()` → `state === 'missed'`, `errorKind === 'rhythm'` |
| H6 | Suelta en `endTime ± 0.02` | `grade === 'perfect'`; `score` incluye el bonus `20 * lenBeats` |
| H7 | `'release'` sin hold activo | No produce ningún `Judgement`, no toca el combo, no suena nada |

### 5.2 HOLD — invariantes estructurales

| # | Prueba | Criterio |
|---|---|---|
| H8 | Generar 10 000 frases con `holdRead` sobre las 7 plantillas | **0** opciones con `beat ∈ (holdBeat, holdBeat + lenBeats]` |
| H9 | `holdRead` sobre `quick` | La generación lo rechaza y cae a `basic`; **0** holds con `lenBeats < 2` |
| H10 | `Setlist.adjust()` en FÁCIL sobre una frase con hold | El hold sobrevive intacto (`beat` y `lenBeats` sin cambios) |
| H11 | Resolución del challenge | Un challenge cuya última opción es un hold no se marca `resolved` antes de `holdEnd + w.good` |

### 5.3 HOLD — audio y render

| # | Prueba | Criterio |
|---|---|---|
| H12 | Rotura a mitad, renderizado en `OfflineAudioContext` | RMS del bus `sfx` a partir de `tCorte + 0.05 s` por debajo de **−60 dBFS** |
| H13 | Nota completa | La envolvente tiene meseta: gain a `t + dur/2` dentro de ±10 % del gain a `t + 0.1` |
| H14 | Autoplay `good` sobre un DESFILE completo | `engine.lateNotes === 0` y `maxLateMs === 0` |
| H15 | Recorte de tokens | Un hold de 3 beats no desaparece de pantalla mientras `state === 'holding'` (assert sobre `tokens.has(o)`) |

### 5.4 HOLD — táctil (manual, con registro)

| # | Prueba | Criterio |
|---|---|---|
| H16 | 20 sostenes de 3 beats con el dedo quieto, iOS Safari y Android Chrome | **0** `pointercancel` registrados |
| H17 | 20 sostenes con deriva del dedo de hasta 30 px | **0** roturas no intencionadas; si las hay, `pointerleave` deja de emitir `'release'` y sólo lo hace `pointerup`/`pointercancel` |

### 5.5 ECHO

| # | Prueba | Criterio |
|---|---|---|
| E1 | `adjust()` sobre llamada y respuesta, los 6 patrones × 4 dificultades | Los arrays de `beat` resultantes son **idénticos** en los 24 casos |
| E2 | Autoplay `good` sobre una ronda | Las 4-5 opciones de la respuesta terminan en `'hit'`; `echoClean` incrementa en 1 |
| E3 | Autoplay `spam` (pulsa cada 0.09 s) durante la llamada | **0** cambios de combo y **0** `stats.fail` (cae en `whiff`) |
| E4 | Autoplay `spam` durante la respuesta | Se registran `stray` y el combo se rompe — pero no más de un `fail` por pulsación |
| E5 | Bot `drums` (no pulsa nada) en la respuesta | N `auto` misses con `errorKind === 'rhythm'`, uno por golpe |
| E6 | Primera ronda de una partida nueva | El patrón es siempre `E1` |
| E7 | Llamada con `dropBeats: [1,2,3]` | `scheduleMusic` omite los beats 1-3; el patrón de tambor se oye sin banda debajo |

### 5.6 Arquetipos y Tour

| # | Prueba | Criterio |
|---|---|---|
| A1 | Generar la lista de frases de cada arquetipo a 100, 108 y 115 BPM | Duración total ∈ **[50, 85] s** en los 18 casos |
| A2 | Suma de beats de cada arquetipo | Múltiplo de 4 (invariante de `Phrase`: "always a multiple of 4 beats so bars stay aligned") |
| A3 | Recorrido lineal de los 60 conciertos | Para **toda** ventana de 5 consecutivos, `distinct(archetypes) ≥ 3` |
| A4 | Primeros 8 conciertos | `distinct ≥ 3`, y ningún arquetipo aparece dos veces seguidas salvo EUR-1/EUR-2 |
| A5 | Orden de introducción de primitivas | ECHO aparece en un concierto de índice estrictamente menor que el primer HOLD |
| A6 | Cada primera aparición de un arquetipo | Su frase tutorial está presente en la lista generada (assert sobre `Phrase.label`) |
| A7 | `archetypeFor()` sobre los dos packs (`flags` 60, `capitals` menos) | Nunca devuelve `'jefe'` para un concierto con `final === false`, ni `'escuela'` para uno con `newIds.length === 0` |
| A8 | Autoplay `good` de los 60 conciertos, encadenado | 60 de 60 terminan en `Results`; `lateNotes === 0` acumulado; ninguna transición bloqueada (`console.warn` de `GameStateMachine` vacío) |
| A9 | Autoplay `wrong` de un CARRERA | `accuracy < 0.75` → no supera. Autoplay `good` → supera |
| A10 | DESFILE con autoplay que rompe la mitad de los holds | No supera el criterio del 80 % |

### 5.7 No-regresión

| # | Prueba | Criterio |
|---|---|---|
| R1 | Beat 1 y Beat 2 completos con autoplay `good` | Idénticos beat a beat a la versión previa (comparar la secuencia de `Phrase.label`) |
| R2 | Un ESCUELA | **0** fichas `hold`, **0** frases de eco, **0** banners nuevos |
| R3 | `judgeInput()` sobre frases sin holds | Comportamiento byte a byte igual al actual (suite de regresión del `Judge` con fixtures) |

---

## 6. Orden de implementación sugerido

1. **ECHO** (barato, sin tocar `Judge`) + `ChallengeSpec.echo`, `drumPhrase` con `dropBeats`,
   evento `call`, `SessionStats.echoRounds/echoClean`. Da un arquetipo nuevo completo.
2. **Arquetipos sin primitivas nuevas**: ESCUELA, CARRERA, MEMORIA, ECO + `archetypeFor()` +
   `ConcertParams.archetype` + insignia en `Hubs.ts`. **Con esto solo, la repetición ya baja
   muchísimo** y no hay riesgo de input.
3. **HOLD**: `Action 'release'`, `OptionKind 'hold'`, `Judge.updateHold`, `AudioEngine.holdNote`,
   renderizador, `holdIntro()`. Detrás de un flag mientras se prueba en táctil.
4. **DESFILE y JEFE** (los dos que usan HOLD).
5. `Progress.seenPrimitives` y Beat Libre por tamaño de set.

---

## Decisiones del director (25/09/2026)

Respuestas a las preguntas abiertas del documento. Vinculantes para la implementación.

1. **HOLD entra, con el alcance reducido que propone el documento** (ficha de la familia
   del tambor, en el hueco de lectura, regla de longitud única, dos arquetipos). Razón:
   con un solo verbo, 60 conciertos se sienten idénticos por muchas frases que barajemos.
   Pero entra **después de ECO**, detrás de un flag, y **no se compromete DESFILE a usarlo
   hasta validarlo en un móvil real** (riesgo de `pointercancel` en iOS).
2. **ECO se implementa primero.** Si el análisis es correcto y sale casi gratis
   reutilizando las frases `demo`, es la mejor relación variedad/coste del proyecto.
3. **Sesgo de BPM por arquetipo: aprobado** (CARRERA +4, ECO −2, DESFILE −4, JEFE +2).
   No rompe la regla de "un tempo por sección" porque el cambio ocurre entre conciertos.
4. **La insignia del arquetipo se ve en el mapa antes de jugar: sí.** La regla de oro del
   proyecto es que nunca aparece una mecánica sin aviso; saber qué te espera es parte del
   aviso, y además da identidad a la lista de conciertos.
5. **18/60 conciertos ESCUELA: aprobado como suelo**, dado que 41 conciertos introducen
   países nuevos.
6. **`Progress.seenPrimitives` persistido: aprobado.** Un tutorial que se repite cada
   sesión es peor que no tenerlo.
7. **Bug confirmado y prioritario (no estaba en el encargo):** con la rampa actual,
   `Tour.params()` nunca activa `quick` ni `flash` en Europa (p va de 0,000 a 0,129 y los
   umbrales son 0,25 y 0,40). Los diez primeros conciertos —las primeras horas de juego de
   cualquier jugador nuevo— solo ven `four` y `gap` en tier 0-1. **Los flags de mecánica
   pasan a gobernarlos el arquetipo; `p` sigue gobernando bpm y tier.**

### Orden de implementación aprobado (Fase 1)

1. Prerrequisitos de motor: `Action 'release'` en `input/Input.ts`; `lenBeats` en la ficha
   y las dos correcciones de `Judge` (ventana viva y condición de `resolved`); tolerancia
   de la cola del hold en `Stage.render()`.
2. **ECO** + arquetipo ECO.
3. Arquetipos sin HOLD: CARRERA, MEMORIA, JEFE (y ESCUELA, que ya existe).
4. **HOLD** detrás de flag + arquetipo DESFILE, con validación en móvil real antes de
   darlo por bueno.
5. Reparto 18/10/9/9/7/7 en `Tour.ts` + insignia en el mapa.
