# WORLD BEAT · Banderas y Capitales

Prototipo jugable de un juego de ritmo educativo: **golpea los tambores… y el país de la bandera**, todo con una tecla y al ritmo.

- **Flujo**: inicio con dos opciones (**Beat Tour** o **Beat Libre**) → asignatura (**Banderas** o **Capitales**) → en Tour eliges **zona del mundo** (todas abiertas) y concierto; en Libre eliges **dificultad** y luego los países (o **aleatorio**).
- **Beat 1** (JUGAR): tutorial → Easy → Nuevo → Mix → Final, 8 países.
- **Beat 2** (tecla `2`): en Banderas, *Gemelas* (Italia/México/Irlanda, Alemania/Bélgica, Polonia/Indonesia, Francia/Países Bajos); en Capitales, *Trampas*: la capital no es la ciudad famosa, y la famosa pasa por el carril como señuelo (Canberra/Sídney, Ottawa/Toronto, Ankara/Estambul, Berna/Zúrich, Rabat/Casablanca, Washington/Nueva York, Ámsterdam/La Haya, Nueva Delhi/Bombay).
- **Dificultad** (solo Beat Libre; el Tour usa su propia rampa): FÁCIL · NORMAL · DIFÍCIL · EXPERTO. Cambia BPM (−12 % … +12 %), ventanas de timing (±200 ms … ±105 ms para GOOD), límites de la dificultad adaptativa, contratiempos/flash/doble/a ciegas, umbral de FEVER, tutorial y multiplicador de puntos. Récord separado por groove y dificultad. Todo en `src/game/Difficulty.ts`.
- **Ajustar ritmo** (tecla `C`): 12 clics, pulsa con cada uno y guarda tu latencia.

Mecánicas: tambores (siempre se golpean), tambores «y» a contratiempo, ráfagas (una bandera por compás), bandera flash (se tapa), tambores a ciegas, doble golpe. La banda suma capas con tu combo (8 / 16 / 30 = FEVER, puntos ×2) y se apaga un momento cuando fallas. Una dificultad dinámica invisible elige las plantillas del Mix y el Final según cómo juegas.

## Beat Tour (modo historia)

Una gira mundial por asignatura: **7 etapas** (Europa, América del Sur, América del Norte y Caribe, África, Asia, Oceanía y Gira Mundial) y **60 conciertos**. Cada concierto enseña 4–5 países en orden de familiaridad y repasa los anteriores; cada etapa acaba en una **Gran Final**. La Gira Mundial son conciertos temáticos de banderas o capitales que se confunden.

- **Se supera por conocimiento** (≥ 70 % reconocido). ⭐⭐ con ≥ 90 %; ⭐⭐⭐ además con timing ≥ 80 %. La dificultad de ritmo (Fácil…Experto) va aparte.
- La dificultad crece con la posición en la gira: tempo 98→116 BPM, plantillas rítmicas, ráfagas, flash, doble y banderas/capitales parecidas como distractores.
- El siguiente continente se abre al superar la mitad del anterior; la Gira Mundial, tras 3 Grandes Finales.
- **Progreso y dominio de cada país se guardan** (localStorage, cajas de repaso espaciado): lo que fallas vuelve antes, también días después.

**Beat Libre**: elige dificultad y luego continente, países sueltos, "los que fallo" o **10 aleatorios**. La lista muestra tu dominio (nuevo / aprendiendo / dominado).

Contenido: 195 países (193 ONU + Vaticano y Palestina) en `src/content/countries.ts`, con capital, continente, dificultad, señuelos y grupos de parecidas. Israel y Palestina no entran en Capitales (capital en disputa). Banderas: [flag-icons](https://github.com/lipis/flag-icons) (MIT), empaquetadas en local. La voz del navegador pronuncia cada país al presentarlo (tecla `V` para activar o desactivar).

## Música

Seis bandas (POP, FUNK, ROCK, LATINO, ELECTRO, CHIP) × 8 progresiones de acordes × 7 tonalidades: cada partida sortea una combinación (336 posibles), así que repetir un concierto no suena igual. Cada banda toca tres intensidades que se reparten entre las secciones, y las capas suben con tu combo. Todo sintetizado en tiempo real, sin samples ni derechos.

Plan de producto: ver [PLAN.md](PLAN.md).

## Móvil y tablet

Dos composiciones del escenario: horizontal 16:9 y vertical 9:16 (móvil de pie), elegida automáticamente al girar o redimensionar (`src/ui/layout.ts`). En pantallas táctiles se toca en cualquier parte para golpear, hay botón de pausa y los textos dicen TOCA en vez de ESPACIO.

## Ejecutar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + build de producción
```

## Controles

- **ESPACIO** = golpear (también clic/toque en la pantalla)
- **ENTER** = jugar / continuar / otra vez
- Menú: **ENTER** = Beat Tour · **L** = Beat Libre · **C** = ajustar ritmo · **V** = voz
- Pantallas de elección y mapa: **←/→** mover · **ENTER** elegir · **ESC** atrás
- **ESC** = pausa (ENTER sigue, R reinicia)

## Debug

`http://localhost:5173/?debug=1` muestra BPM, songTime, beat, expectedHitTime, delta del último input, estado y latencia del AudioContext.

- `N` salta a la siguiente sección
- `[` / `]` ajustan `inputOffsetMs` en pasos de 5 ms (se guarda en localStorage)
- `&autoplay=good|spam|wrong|drums` activa un bot de prueba (`?debug=1&autoplay=spam`)
- Al llegar a resultados, la consola muestra la tabla de aprendizaje por bandera

## Arquitectura

- **AudioEngine** (`src/audio`): el `AudioContext` es el reloj maestro. Toda la batería, el bajo, los cues y los efectos de sonido se sintetizan en tiempo real. `heardTime()` convierte los timestamps de `performance.now()` al tiempo de audio *que se está oyendo* (compensa la latencia de salida), así que los inputs y los visuales se comparan directamente con los tiempos de beat programados.
- **RhythmEngine** (`src/rhythm`): el director. Pide frases musicales (múltiplos de 4 beats) al setlist, las coloca en la línea de tiempo del AudioContext, programa el audio con 120 ms de lookahead y encola eventos visuales. `setInterval` solo despierta al scheduler, nunca marca el tiempo. **Judge** compara cada input con el tiempo programado (PERFECT ≤ 80 ms, GOOD ≤ 160 ms) y distingue errores de *conocimiento* (país equivocado a tiempo) de errores de *ritmo* (país correcto fuera de tiempo).
- **ChallengeGenerator** (`src/game`): plantillas rítmicas (four, gap, eight, tension, rapid, double, quick) + patrones de tambor (basic, pickup, sync, gallop, offbeats) → bandera en el beat 1, tambores de entrada y un nombre por beat. La posición correcta varía, los distractores nunca se repiten y las confusiones anteriores vuelven a salir a propósito.
- **LearningTracker**: estadísticas por bandera (intentos, aciertos, errores de conocimiento/ritmo/sin respuesta, error medio de timing). Una bandera fallada vuelve con más peso unos 15–30 s después (repetición espaciada oculta).
- **DifficultyDirector**: puntuación de habilidad invisible (países pesan mucho, tambores poco) → tier 0/1/2 → plantillas, patrones de tambor, flash y BPM.
- **GameStateMachine** + **Setlist**: `Menu → RhythmTutorial → GuidedPractice → EasyGroove → TeachNewFlags → MixGroove → FinalGroove → Results`. El setlist es una secuencia de generadores, así que cada frase se construye justo antes de sonar y puede reaccionar a lo que acaba de pasar.
- **Contenido** (`src/content`): `LearningItem` (con `answer` y `decoys` opcionales) + `ContentPack` (`renderPrompt`, `promptCaption`, `answerLabel`, niveles y textos). `flags.ts` y `capitals.ts` son los dos packs; `index.ts` los registra. Una asignatura nueva (palabra→traducción, elemento→símbolo…) es otro pack, sin tocar el motor de ritmo.
