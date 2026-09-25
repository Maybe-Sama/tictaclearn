# ROLLOUT · Capa de producto de los arquetipos

Documento de producto, no de diseño. `docs/DESIGN-ARCHETYPES.md` decide **qué hace** cada
arquetipo; este decide **qué ve y qué lee el jugador**, y cuándo damos el reparto por terminado.

Escrito contra el código real a 25/09: `src/game/Setlist.ts`, `src/game/Tour.ts`
(`ArchetypeId`, `ARCHETYPES`, `archetypeFor`, `params`), `src/game/Game.ts` (`startConcert`,
`startFree`), `src/game/ChallengeGenerator.ts` (`echoPair`, `echoPattern`), `src/ui/Hubs.ts`
(`TourScreen.render`), `src/style.css` (`.stops`, `.stop*`).

Nada de lo que hay aquí cambia una mecánica. Si algo del diseño me parece mal, está en
**§6 Objeciones** con su coste, sin tocarlo.

---

## 0. Dos decisiones de nombre, antes de los textos

**0.1 — El jugador nunca lee la palabra «ESCUELA».** El id interno se queda como está
(`'escuela'` en `ArchetypeId`, la tabla `ARCHETYPES`, `BPM_BIAS`, todo): no hay que tocar una
línea de lógica. Lo que cambia es la etiqueta visible, que pasa a ser **NUEVOS**. Razones, en
orden de peso:

1. Es la única palabra del juego que suena a colegio, y es precisamente el arquetipo que más
   veces aparece (18 de 60). Sería la palabra más repetida del mapa.
2. **NUEVOS** ya es vocabulario del juego: el bloque de presentación dice
   `'¡NUEVOS EN LA GIRA!'` y `'¡Y AHORA ESTOS!'`. La insignia y la frase hablan igual.
3. Un niño de 8 años entiende «nuevos» sin glosa; «escuela» lo entiende y le baja el ánimo.

Descartado **FICHAJES** (8 caracteres, encaja con la fantasía de banda): vocabulario de fútbol,
no lo lee igual todo el público y no reutiliza ningún texto existente.

Lo mismo con los otros dos: **CARRERA → RÁFAGA** y **MEMORIA → FLASH**, porque el banner que el
jugador ya ve en pantalla dice literalmente `'¡RÁFAGA!'` y `'¡FLASH!'`. Si la insignia dice
«CARRERA» y el juego grita «¡RÁFAGA!», hemos inventado dos nombres para lo mismo. ECO, DESFILE y
JEFE se quedan: ya son la palabra que el juego usa.

| Id interno (no se toca) | Etiqueta visible | Largo |
|---|---|---|
| `escuela` | NUEVOS | 6 |
| `carrera` | RÁFAGA | 6 |
| `eco` | ECO | 3 |
| `memoria` | FLASH | 5 |
| `desfile` | DESFILE | 7 |
| `jefe` | JEFE | 4 |

**0.2 — Ningún texto de producto nombra «bandera».** Existen dos packs (`flags` y `capitals`) y
`pack.noun` vale `'banderas'` o `'capitales'`. Hoy ya hay textos rotos por esto: el banner
`'¡RÁFAGA!' / 'una bandera por compás'` miente en el pack de capitales. Regla dura para todo lo
que sigue: **o se usa `${pack.noun}` (femenino plural en los dos packs, así que los adjetivos
concuerdan), o no se nombra el sustantivo.** Casi siempre sale mejor lo segundo, y además es más
corto.

---

## 1. Textos finales

Cuatro ranuras por arquetipo. Copiar y pegar; no hay que redactar nada más.

### 1.1 Tabla maestra

| | Insignia (≤8) | Regla del mapa (≤40) | `sub` del título | Banner 1.ª vez |
|---|---|---|---|---|
| `escuela` | `NUEVOS` | `dos nuevas, y las tocas enseguida` (33) | `NUEVOS · de dos en dos` | **ninguno** (a propósito, §1.3) |
| `carrera` | `RÁFAGA` | `una por compás, sin tiempo a dudar` (34) | `RÁFAGA · una por compás` | `¡RÁFAGA!` / `una por compás` |
| `eco` | `ECO` | `la banda toca, tú lo devuelves` (30) | `ECO · repite el patrón` | `¡ECO!` / `escucha… y repítelo` |
| `memoria` | `FLASH` | `se tapa a media frase; sigue el pulso` (37) | `FLASH · se tapa a media frase` | `¡FLASH!` / `memorízala rápido` |
| `desfile` | `DESFILE` | `notas largas: pulsa y no sueltes` (32) | `DESFILE · sostén la nota larga` | `¡SOSTÉN!` / `mantén ESPACIO mientras cruza` |
| `jefe` | `JEFE` | `todo lo de esta zona, del tirón` (31) | `JEFE · todo junto` | **ninguno** (a propósito, §1.3) |

Forma sugerida en código (una constante, no seis `switch`):

```ts
// Tour.ts o un módulo de textos; una sola fuente para mapa, título y banner.
export const ARCHETYPE_COPY: Record<ArchetypeId, { badge: string; rule: string; sub: string }> = { … };
```

### 1.2 Cambios sobre textos que YA existen

Tres de los seis banners existen y **no hay que escribirlos, hay que corregirlos**:

| Dónde | Hoy | Pasa a ser | Por qué |
|---|---|---|---|
| `Setlist.announce('quick')` | `'¡RÁFAGA!' / 'una bandera por compás'` | `'¡RÁFAGA!' / 'una por compás'` | Miente en el pack de capitales; y 14 caracteres menos entran mejor en móvil |
| `Setlist.announce('flash')` | `'¡FLASH!' / 'memoriza la bandera'` | `'¡FLASH!' / 'memorízala rápido'` | Ídem, y «rápido» dice la urgencia, que es lo que hace el FLASH |
| `Setlist.announce('double')` | `'¡DOBLE!' / 'dos banderas · dos golpes'` | `'¡DOBLE!' / 'dos seguidas · dos golpes'` | Ídem. No es un arquetipo pero aparece en JEFE y DESFILE |

`'¡CONTRATIEMPO!'`, `'¡A CIEGAS!' / 'siente el pulso'`, `'¡ESCUCHA!' / 'el planeta toca…'`,
`'¡OTRA!'`, `'¡TÚ!'`, `'AHORA TÚ'`, `'¡NUEVOS EN LA GIRA!'` y `'¡Y AHORA ESTOS!'` se quedan
exactamente como están. Son buenos y ya están calibrados de largo.

**ECO no tiene banner hoy.** `ChallengeGenerator.echoPair()` emite `'¡ESCUCHA!'` y `'¡TÚ!'` por
ronda, que es la señal *dentro* del bloque, pero el juego nunca pronuncia la palabra «ECO». Si la
insignia del mapa dice ECO y el concierto no lo dice nunca, la insignia no significa nada. Hace
falta **un** `banner('¡ECO!', …)` antes de la primera llamada de la vida del jugador —una frase de
4 beats, el mismo patrón que `banner('AHORA TÚ', …)` ya hace. Coste: ~6 líneas. Ver §6.4.

### 1.3 Los dos arquetipos sin banner, y por qué

- **NUEVOS**: no estrena ninguna mecánica. Un banner que anuncia que no pasa nada nuevo gasta 4
  beats y enseña al jugador a ignorar los banners, que es el activo que protege HOLD y ECO. Su
  presentación ya tiene voz propia (`'¡NUEVOS EN LA GIRA!'`).
- **JEFE**: por definición no estrena nada (todo lo suyo se enseñó antes en la etapa). Y ya tiene
  la señal más fuerte del juego, el `riser` de 4 beats del `title`, que es sonido y no texto.
  Añadirle un banner sería quitarle tensión al riser.

### 1.4 Dónde entra cada texto

1. **Insignia** → `ui/Hubs.ts`, nodo del mapa (§2).
2. **Regla** → `ui/Hubs.ts`, línea de pie del mapa (§2.3). **No va en el nodo.**
3. **`sub`** → `Game.startConcert()`, campo `sub` del `SessionPlan`, que `Setlist.planned()` pasa
   a `title(pl.title, pl.sub, …)`.
   **Conflicto real que hay que resolver aquí:** hoy `sub: c.theme ?? c.title`, o sea «CONCIERTO
   3» o el nombre del racimo de la Gira Mundial. Regla:
   - si `c.theme` existe (los 12 conciertos de la Gira Mundial) → **gana el tema**, que es
     contenido único e irrepetible; el arquetipo lo lleva la insignia del mapa y su banner. A esas
     alturas el jugador conoce los seis.
   - si no → `sub = ARCHETYPE_COPY[arch].sub`. No se pierde nada: el número de concierto sigue en
     la píldora del HUD (`pill`, que dice `EUROPA · 3` durante toda la partida) y en el mapa.
4. **Banner** → `Setlist.announce()` / `holdIntro()` / el nuevo `¡ECO!`, gobernado por
   `Progress.seenPrimitives` para que no se repita entre sesiones (§3.4.6 del diseño).

---

## 2. La insignia en el mapa

### 2.1 Qué ve el jugador

Hoy un nodo de `.stops` tiene cuatro piezas, en este orden de lectura: **número** (círculo grande,
color de la zona) → **título** → **estrellas** → **banderas**. Eso responde a «cuál es», «cómo me
fue» y «qué sale». No responde a «cómo es este concierto», que es lo que añadimos.

La insignia es **información terciaria**: no puede competir con el número ni con las estrellas. Va
como pegatina bajo el número, con margen negativo para que **no añada altura de fila** —lo que en
móvil retrato (3 columnas, nodos de 112 px, África con 12 conciertos) es la diferencia entre ver 4
filas y ver 3.

### 2.2 Marcado propuesto

Contra el marcado actual de `TourScreen.render()` (`Hubs.ts:129-134`), una línea nueva y una clase
en el botón:

```html
<button type="button"
        class="stop arch-eco${c.final ? ' final' : ''}${rec?.passed ? ' done' : ''}${i === this.focus ? ' focus' : ''}"
        data-act="concert" data-i="3" style="--sc:#4FB3FF">
  <span class="stop-num">3</span>
  <span class="stop-arch">ECO</span>          <!-- ← lo único nuevo -->
  <span class="stop-title">CONCIERTO 3</span>
  <span class="stars" aria-label="1 de 3 estrellas">★<i>★★</i></span>
  <span class="stop-flags">…</span>
</button>
```

La clase sale de un mapa `ArchetypeId → 'arch-nuevos' | 'arch-rafaga' | …` (nombre visible, no id
interno, para que el CSS se lea igual que el mapa). El texto de la insignia es
`ARCHETYPE_COPY[c.params.archetype].badge`.

**Accesibilidad:** la insignia es una palabra, no un color. El lector de pantalla la lee en orden
natural después del número; no hace falta `aria-label` extra. El color nunca es el único portador
de información, así que daltonismo no es un problema aquí.

### 2.3 CSS propuesto

```css
.stop-arch {
  margin-top: -14px;              /* se apoya en la sombra del nodo: coste de altura ≈ 0 */
  padding: 1px 10px 3px;
  border: 4px solid var(--ink);
  border-radius: 999px;
  background: var(--ac);
  color: var(--ink);
  font-size: 14px;
  line-height: 1.15;
  white-space: nowrap;
  transform: rotate(-3deg);
  box-shadow: 0 3px 0 var(--ink);
}
/* El concierto normal: contorno, sin relleno. No compite con nada. */
.arch-nuevos .stop-arch {
  background: none;
  color: var(--cream);
  border-color: rgba(255, 247, 230, 0.55);
  box-shadow: none;
  transform: none;
}
.arch-rafaga  { --ac: var(--orange); }
.arch-eco     { --ac: var(--teal); }
.arch-flash   { --ac: var(--lilac); }
.arch-desfile { --ac: var(--sky); }
.arch-jefe    { --ac: var(--pink); }

body.portrait .stop-arch { font-size: 17px; padding: 2px 12px 4px; margin-top: -16px; }
```

### 2.4 Criterio de color y de peso

El criterio no es decorativo: **la insignia rellena significa «este concierto no es el normal»**.

| Insignia | Color | Por qué ese |
|---|---|---|
| NUEVOS | ninguno (contorno) | Es la forma base, 18 de 60. Si tuviera relleno, 18 pegatinas de color convertirían el mapa en confeti y las otras cinco dejarían de destacar |
| RÁFAGA | `--orange` | Calor y velocidad. Es el único naranja del mapa |
| ECO | `--teal` | Verde-agua = respiro. Es literalmente el bloque de descanso del concierto |
| FLASH | `--lilac` | El lila es el color de `Results` y de la Gira Mundial: «algo se oscurece» |
| DESFILE | `--sky` | Azul amplio y lento, opuesto exacto al naranja de RÁFAGA |
| JEFE | `--pink` | El rosa del juego es el color de la acción principal (`.btn-free-play`). Es el único rosa del mapa |

Todos llevan texto `--ink` (#241643) sobre relleno claro: contraste de sobra en los cinco.

**El nodo JEFE, en concreto.** Ya se distingue hoy: `.stop.final .stop-num` es `--sun` con
tipografía mayor y el glifo `♛` en vez del número. La insignia **no puede ser `--sun`**, porque
sería amarillo sobre amarillo. De ahí el rosa: máxima salencia, y es el único sitio del mapa donde
aparece. Un solo añadido:

```css
.stop.final .stop-arch { font-size: 16px; padding: 2px 14px 4px; }
```

Nada de hacer el nodo JEFE más grande ni de que ocupe dos columnas: `.stops` es un grid de 6 (3 en
retrato) y romper la retícula descoloca las filas enteras en la zona más larga (ÁFRICA, 12
conciertos). El JEFE ya gana por corona + color + tamaño de tipo; no necesita geometría propia.

### 2.5 La regla de 40 caracteres: dónde va de verdad

**No va en el nodo.** Sesenta líneas de regla en el mapa son un muro de texto, `.stop-title` ya
está limitado a 190 px, y en retrato no cabe.

Va en la línea de pie, que hoy es una frase fija:

```html
<p class="hub-hint"><b>ECO</b> · la banda toca, tú lo devuelves</p>
```

Se actualiza con el foco (`this.focus`, que ya existe y ya se mueve con teclado y con `openStage()`).
Coste: reemplazar la cadena fija de `render()` por una expresión. Cero estructura nueva.

**Límite honesto en táctil:** ahí no hay foco previo —tocar un nodo lo juega directamente
(`confirm()` → `onPlay`)—, así que el jugador de móvil lee la regla del concierto **que
`openStage()` enfoca por defecto** (el primero sin superar), no necesariamente la del que toca. Es
aceptable porque la regla **nunca es el único portador**: dos segundos después el `sub` del título
la repite dentro del concierto, y la primera vez además hay banner. No se debe arreglar metiendo un
diálogo de confirmación: añadiría un toque a cada concierto de toda la partida para ganar una línea
que el jugador va a ver igual.

---

## 3. Curva de los primeros 10 minutos: corrección

La tabla §3.3 del documento de diseño **da el orden por bueno y la aritmética por mala**. El orden
no lo toco. La aritmética sí, porque la usamos como Definition of Done de la Fase 1 («en una sesión
de 10 minutos el jugador ve al menos 3 arquetipos distintos») y tal como está la damos por
cumplida sin haberla medido.

### 3.1 Qué está mal

1. **Cuenta canción, no reloj.** La tabla asigna un minuto por concierto. Un concierto son 54-62 s
   *de música*, más la pantalla de resultados (que el jugador tiene que leer y despachar con un
   botón: 12-20 s) más volver al mapa y elegir (~8 s). El coste real por concierto es **~80-90 s**,
   más 25-30 s de menú → asignatura → zona → concierto la primera vez.
2. **Le falta una fila.** Salta de «4-5» a «6-7».
3. **Cuenta NUEVOS como variedad.** Desde dentro, ESCUELA/NUEVOS no es *un* arquetipo: es «el
   concierto». Contarlo para llegar a tres es aprobarse el examen uno mismo.
4. **No contempla el reintento.** Se pasa con `accuracy ≥ 0.7`; un jugador nuevo que no sabe
   todavía que hay que pulsar a tiempo suspende EUR-1 o EUR-2 con bastante probabilidad, y
   `OTRA VEZ` es el botón grande de la pantalla de resultados cuando no ha pasado.

### 3.2 La tabla corregida (reloj real, jugador nuevo, sin reintentos)

| Reloj | Qué pasa | Arquetipo | Cosas distintas del concierto base |
|---|---|---|---|
| 0:00-0:30 | Menú → Banderas → EUROPA → concierto 1 | — | 0 |
| 0:30-1:32 | EUR-1 (62 s @104) | NUEVOS | 0 |
| 1:32-2:00 | Resultados + mapa | | |
| 2:00-3:02 | EUR-2 | NUEVOS | 0 |
| 3:02-3:30 | Resultados + mapa | | |
| 3:30-4:27 | EUR-3 (57 s @102) | **ECO** | **1** ← primer momento «no soy un test» |
| 4:27-4:52 | Resultados + mapa | | |
| 4:52-5:54 | EUR-4 | NUEVOS | 1 |
| 5:54-6:20 | Resultados + mapa | | |
| 6:20-7:14 | EUR-5 (54 s @108) | **RÁFAGA** | **2** |
| 7:14-7:40 | Resultados + mapa | | |
| 7:40-8:42 | EUR-6 | NUEVOS | 2 |
| 8:42-9:08 | Resultados + mapa | | |
| 9:08-10:08 | EUR-7 (60 s @98) | **DESFILE** | **3** — *empieza* en el minuto 9, acaba fuera |

**Conclusión: 3 arquetipos distintos al minuto ~6:20; el cuarto arranca en el filo del minuto 9 y
termina fuera de la ventana.** Con **un solo reintento** en cualquier punto (+90 s) DESFILE se cae
entero de la primera sesión: HOLD, que es lo más caro que construimos en la Fase 1, no lo ve un
jugador nuevo en su primera sentada.

### 3.3 ¿Entiende el jugador nuevo qué está pasando?

**Hoy, no — y no es culpa de los arquetipos.** El menú solo ofrece BEAT TOUR y BEAT LIBRE; Beat 1
ya no está en la portada. `Game.startConcert()` lanza con `skipTutorial: true`, así que las
secciones `tutorial()` y `practice()` —las únicas que enseñan «golpea los tambores» y «solo su
nombre»— **no se ejecutan nunca en el Tour**. La primera frase de la vida de un jugador nuevo es el
`teach()` de EUR-1.

Consecuencia para este reparto, y es la única que puedo accionar desde aquí: **el jugador llega a
la insignia del mapa sin saber qué es una ficha de tambor**. Por eso:

- EUR-1 y EUR-2 se quedan en NUEVOS sin banner y sin mecánica: correcto tal como está la tabla.
  No meter nada ahí.
- La insignia de contorno de NUEVOS (§2.4) es también una decisión de curva: los dos primeros
  nodos que ve el jugador nuevo no le gritan una palabra que no significa nada todavía.
- El arreglo de verdad es el «primer compás guiado» (PLAN, Fase 2, punto 9). **La Fase 1 añade
  variedad encima de un juego que todavía no explica sus reglas**, y hay que decirlo al cerrar la
  fase en lugar de descubrirlo con jugadores.

### 3.4 ¿Cuándo aparece lo primero compartible?

Tres candidatos y su reloj real:

| Momento | Cuándo | ¿Se entiende sin sonido en 3 s? |
|---|---|---|
| FEVER (combo 30, escenario de noche, ×2) | posible ya en EUR-1, minuto ~1 | Sí — cambia la pantalla entera |
| ECO (una ronda limpia) | minuto ~4 | **No** — es 100 % auditivo; en un clip mudo no pasa nada |
| RÁFAGA (banderas a una por compás) | minuto ~6:20 | Sí — la densidad se ve |

Lo primero compartible ya existe y es FEVER. De lo que construimos en la Fase 1, **lo primero
compartible es RÁFAGA al minuto 6, y ECO no es compartible en vídeo por mucho que sea el mejor
momento de juego.** Ver §5.

---

## 4. Definition of Done de producto

Comprobaciones observables: cada una se hace mirando la pantalla, no leyendo el código. El reparto
de arquetipos está terminado cuando las doce pasan. Las pruebas automáticas (§5 del documento de
diseño) son requisito previo, no sustituto.

**Mapa**

1. En el mapa de EUROPA, una persona que no ha jugado nunca señala sin ayuda **qué tres conciertos
   no son como los demás**, y acierta los tres (EUR-3, EUR-5, EUR-7).
2. Los seis textos de insignia caben en una línea, sin puntos suspensivos ni salto, en las tres
   zonas más largas (ÁFRICA 12, ASIA 11, GIRA MUNDIAL 13), en horizontal y en retrato.
3. El nodo JEFE se identifica como «el último y el gordo» a primera vista, sin leer la palabra.
4. La línea de pie cambia al mover el foco con teclado y dice siempre la regla del nodo enfocado.
5. Ningún concierto de la Gira Mundial ha perdido el nombre de su racimo en el título.

**Dentro del concierto**

6. En los seis arquetipos, el `sub` del título entra completo en la tarjeta (`fitText` no lo
   encoge por debajo del resto de subtítulos existentes) y se lee entero en los 3,6 beats que dura.
7. Ninguna mecánica aparece sin su banner la primera vez, y **ningún banner se repite** al volver a
   abrir el juego (comprobación: jugar EUR-3, cerrar la pestaña, reabrir, jugar EUR-8 → no sale
   `¡ECO!`).
8. La palabra de la insignia se pronuncia dentro del concierto al menos una vez en los cuatro
   arquetipos que tienen banner: si el mapa dice ECO, el juego dice ECO.

**Contenido y packs**

9. Recorrido completo de los 60 conciertos con el pack **Capitales**: ningún texto de insignia,
   regla, `sub` o banner dice «bandera» ni «país» donde toca «capital».

**Curva**

10. Sesión cronometrada de 10 minutos, jugador nuevo real, sin ayuda: ve **al menos dos bloques
    que no son «imagen → nombre»**. (Restatement honesto del criterio de la Fase 1: «3 arquetipos
    distintos» se cumple contando el concierto base, y eso no mide nada.)
11. Ese mismo jugador, al terminar, sabe decir con sus palabras en qué se diferenciaba el
    concierto 3 del concierto 4.

**Móvil real — no emulador, no DevTools**

12. En un iPhone y un Android de gama media, en **retrato**, con el navegador del sistema:
    - el mapa de ÁFRICA muestra **al menos 3 filas completas de nodos sin hacer scroll**, insignias
      incluidas (medir antes y después del cambio: la insignia no puede costar una fila);
    - la insignia se lee sin acercar el teléfono, a un brazo de distancia;
    - tocar un nodo lo lanza al primer toque, como hoy: la insignia **no** intercepta el toque
      (es `<span>` dentro del `<button>`, pero hay que verlo, no suponerlo);
    - y, si DESFILE está activo, 10 sostenes seguidos sin rotura no intencionada (esta es la
      condición que el director puso para dar HOLD por bueno; si falla, DESFILE no sale y la
      insignia DESFILE tampoco).

---

## 5. Gancho de difusión: una sola idea

**El mejor momento para grabar lo da RÁFAGA**, no ECO. ECO es el mejor momento de *juego* —es
cuando el jugador se siente músico— pero es enteramente auditivo, y los vídeos se ven mudos la
primera vez. RÁFAGA es el único arquetipo cuyo atractivo se entiende en tres segundos y sin sonido
(imágenes pasando a una por compás), y además concentra el chiste del producto: **fallar algo que
te sabías, por medio compás**. Eso es lo que hace que alguien lo cuente.

### La idea: que el juego imprima el retraso en pantalla

Cuando un error es `errorKind === 'rhythm'` sobre una ficha `answer` —es decir, el jugador pulsó la
correcta pero fuera de ventana—, el escenario estampa junto al pad, grande y por 0,6 s:

```
0,21 s TARDE
```

(y `PRONTO` en el otro sentido). Nada más: ni pantalla nueva, ni imagen generada, ni portapapeles,
ni enlace, ni servidor.

**Por qué esta y no otra.** Es el fotograma que el guion de 30 segundos de
`docs/DAILY-AND-SHARE.md` §6.3 ya pide como plano de apertura —ahí el texto **0,21 s TARDE** se
añade en el editor de vídeo. Si lo imprime el juego, el clip sale montado: se recorta y se sube.
Convierte el momento en contenido sin construir nada de difusión, que es la Fase 3.

Y de regalo es la corrección pedagógica más barata que tenemos: el modelo de aprendizaje entero se
apoya en separar `knowledge` de `rhythm`, y hoy el jugador **no ve esa distinción en ningún sitio**
mientras juega. Un niño que falla por 0,21 s y lee «0,21 s TARDE» aprende que se la sabía. Uno que
solo ve la ficha ponerse en rojo aprende que no.

**Coste real, sin adornos:** medio día de ingeniería. El dato ya existe (`Judge` calcula
`deltaMs`, `judge.lastDeltaMs` está expuesto y el `DebugPanel` ya lo pinta); `Stage` ya sabe
estampar texto junto al pad. Más ~1 hora de ajuste, que es donde está el riesgo:

- **solo** en errores de ritmo sobre `answer` (nunca en tambores, nunca en errores de
  conocimiento): si no, es un muro de números y deja de ser el caso simpático;
- **una por frase como máximo**, o un jugador que machaca llena la pantalla;
- no puede tapar el carril ni la siguiente bandera;
- legible a 720p comprimido, que es como se ve en vídeo;
- número en formato español (`0,21`), como el resto del juego (`toLocaleString('es-ES')`).

**Lo que no hace:** no comparte nada. Esto no adelanta la Fase 3 ni la sustituye; hace que, cuando
alguien grabe, el material salga usable. Es lo máximo que se puede conseguir sin construir
difusión.

---

## 6. Objeciones

Cosas que creo que están mal o incompletas. **No he cambiado ninguna.**

### 6.1 — El bloque de ECO suena en conciertos que no son ECO

`Setlist.adaptive()` emite el par llamada/respuesta cuando `drumBreak` está activo y se ha gastado
el 45 % del presupuesto. `planned()` pasa `drumBreak: true` **siempre**. Es decir: hoy todos los
conciertos del Tour tienen eco, y la insignia ECO promete algo que hace también el de al lado. Si
sale así, la primera insignia de color que el jugador ve en el mapa es la que menos significa.

Dos salidas:
- **(a)** El eco solo en `arch === 'eco' | 'jefe'`; en los demás, el descanso vuelve a ser el
  `drumPhrase` genérico de «¡SOLO DE TAMBOR!». Coste: 1-2 líneas en `adaptive()` + rehacer la
  cuenta de beats del descanso (el eco gasta 16, el `drumPhrase` 8) y revisar que los seis
  arquetipos siguen en 50-85 s (prueba A1). **Contra:** RÁFAGA y FLASH se quedan sin el mejor
  respiro que tiene el juego, justo los dos que más lo necesitan.
- **(b)** El eco se queda de descanso general, y ECO se distingue por cantidad y por anuncio: dos
  bloques en vez de uno, y es el único que los presenta. Coste: casi cero.

**Mi recomendación es (b)**, y entonces la regla del mapa debería decirlo de forma que no mienta.
Texto alternativo si se va por (b): `dos rondas de llamada y respuesta` (34). No lo he puesto en la
tabla porque depende de una decisión que no es mía.

### 6.2 — La primera ronda de eco no es siempre `E1`

El diseño (§1.B.2) y su prueba E6 exigen que la primerísima llamada sea el pulso liso `[0,1,2,3]`.
`ChallengeGenerator.echoPattern(0)` hace `rng.pick` entre `[0,1,2,3]` y `[0,1,1.5,3]`, así que la
mitad de los jugadores estrena el eco con un contratiempo. Es el primer contacto con la única
mecánica que se presume «imposible de fallar». **Coste de arreglarlo: ~3 líneas** (forzar el patrón
liso mientras `!progress.seenPrimitives.has('echo')`). Barato y hay que hacerlo.

### 6.3 — `BPM_BIAS.jefe` es 0 y el diseño dice +2

`Tour.ts` tiene `jefe: 0`; el documento de diseño §3.4 y la decisión 3 del director aprobaron `+2`.
Además `params()` ya sube el BPM por `final`, así que puede ser deliberado para no sumar dos veces.
**No lo he tocado**, pero alguien tiene que decidir si es intencionado o un olvido: son 2 BPM en los
7 conciertos que más se recuerdan. Coste de mirarlo: 5 minutos.

### 6.4 — El banner `¡ECO!` no existe y sin él la insignia no cierra

Detallado en §1.2. Coste: ~6 líneas (`banner()` ya existe, y `Progress.seenPrimitives` va a existir
igualmente para HOLD). Sin esto, ECO es el único arquetipo cuyo nombre solo vive fuera del juego.

### 6.5 — DESFILE puede quedarse sin mecánica y con insignia

HOLD va detrás de un flag y con validación en móvil real pendiente. Si no pasa, DESFILE son 7
conciertos con insignia, color, regla («notas largas: pulsa y no sueltes») y `−4` de BPM… y nada
dentro. **Hay que decidir el plan B ahora, no el día del corte.** Mi posición: si HOLD no entra,
DESFILE no sale al mapa —esos 7 conciertos reparten a ECO y FLASH— y la insignia DESFILE se queda
en el cajón. Es preferible tener cinco arquetipos que nombrar uno que no cumple. Coste de dejarlo
decidido: una línea en la tabla `ARCHETYPES` y no publicar cuatro cadenas de texto.

### 6.6 — 18 de 60 conciertos sin nada que anunciar

Aprobado por el director como suelo, y entiendo el motivo (41 conciertos meten países nuevos). Lo
anoto igual porque es el número que más va a doler: **en el mapa, casi un tercio de los nodos lleva
la insignia de contorno, que es la manera elegante de decir «este es el normal»**. Si a los seis
meses la queja es «todos los conciertos se parecen», este es el número al que habrá que volver, no
al reparto de los otros cinco. No propongo cambiarlo: el coste no es de código, es de rehacer la
curva de presentación de países entera.

### 6.7 — Cuatro textos por arquetipo son tres traducciones por arquetipo

El inglés sube a la Fase 2 (PLAN, punto 12). Estos 24 textos nacen ya en castellano dentro del
código, igual que los banners de hoy. No pido cambiar el plan; pido que quien los implemente los
deje **todos en una sola constante** (`ARCHETYPE_COPY`, §1.1) y no repartidos entre `Tour.ts`,
`Hubs.ts` y `Setlist.ts`. Coste: cero si se hace ahora; una tarde de rastreo si se hace después.

---

## 7. Qué le pido al que implemente, en orden

1. `ARCHETYPE_COPY` en un solo sitio, con las cuatro cadenas por arquetipo de §1.1.
2. La corrección de los tres banners existentes (§1.2) — es un `sed`, no cuesta nada y quita tres
   mentiras del pack de capitales.
3. El banner `¡ECO!` (§6.4) y el `E1` forzado en la primera ronda (§6.2).
4. La insignia en `Hubs.ts` + el CSS de §2.3, y la línea de pie viva de §2.5.
5. La regla del `sub` con el tema de la Gira Mundial de §1.4, punto 3.
6. Decidir (a) o (b) de §6.1 **antes** de publicar la insignia ECO, y decidir el plan B de DESFILE
   de §6.5 **antes** de publicar la insignia DESFILE.
7. La comprobación 12 de §4 en un teléfono de verdad, con captura del mapa de ÁFRICA antes y
   después. Si la insignia cuesta una fila, se ajusta el margen negativo, no se acepta.


---

## Resoluciones del director (25/09/2026)

Respuestas a las objeciones de §6. Vinculantes; el documento no se reescribe.

1. **§6.1 — El eco no puede sonar en todos los conciertos: aceptada.** Se toma la salida barata.
   `planned()` deja de pasar `drumBreak: true` a ciegas: el bloque de llamada y respuesta solo lo
   emiten los conciertos con `params.echo` (ECO y JEFE). Los demás recuperan el descanso de solo de
   tambor, que es lo que había antes de ECO. La insignia ECO vuelve a prometer algo que solo ella
   cumple.
2. **§6.2 — `E1` en la primera ronda de la vida del jugador: aceptada.** Con
   `Progress.knows('echo')` ya persistido, la primera ronda de un jugador que no conoce el eco es
   el pulso liso, sin `rng.pick`. Es el invariante E6 del documento de diseño.
3. **§6.3 — `BPM_BIAS.jefe = 0` es deliberado.** El +2 aprobado ya lo pone `params()` por
   `final`; sumarlo dos veces empujaría los últimos conciertos por encima de 120 BPM, donde el
   hueco de lectura de `quick` deja de ser justo. Queda comentado en el código.
4. **§6.4 — Banner `¡ECO!`: aceptada.** Entra en `ARCHETYPE_COPY.eco.banner`, con el resto.
5. **§6.5 — Plan B de DESFILE: decidido.** Si HOLD no pasa la validación táctil, DESFILE **no se
   retira del mapa**: degrada igual que MEMORIA en FÁCIL. Sin sostenes es el concierto de frases
   largas y tempo bajo (`eight` a −4 BPM, remate en `double`), y su regla pasa a
   `'frases largas, sin prisa'`. Retirarlo dejaría un hueco en el reparto 18/10/9/9/7/7 y una
   ventana de 5 conciertos con menos de 3 arquetipos, que es justo lo que el test de variedad
   impide. La insignia DESFILE solo promete amplitud; el sostén es cómo se consigue, no qué es.
6. **§6.7 — Todos los textos en una constante: hecho.** `src/game/archetypes.ts`,
   `ARCHETYPE_COPY`, con insignia, regla, subtítulo, banner y clase CSS. Es el único sitio que
   toca la traducción al inglés de la Fase 2.
7. **El hallazgo del final (`tutorial()` y `practice()` no se ejecutan nunca en el Tour) queda
   anotado para la Fase 2**, punto 9 del PLAN (primer compás guiado). No se arregla dentro de la
   Fase 1: cambiar la entrada del juego mientras se añaden dos verbos mezcla dos riesgos que hay
   que poder medir por separado.
