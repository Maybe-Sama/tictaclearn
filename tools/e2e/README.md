# Red de seguridad (tools/e2e)

Arnés en JavaScript plano (CommonJS) sobre **puppeteer**. Sirve `dist/` con
`vite preview` en el puerto **4317** y conduce el juego con el bot de depuración
(`?debug=1&autoplay=…`). Sin framework de tests: cada script imprime sus
comprobaciones y termina con código ≠ 0 si algo falla.

## Cómo se ejecuta

```bash
npm run verify           # typecheck + build + contenido + navegador (lo que corre CI)
npm run verify:content   # solo datos, sin navegador (~1 s)
npm run verify:e2e       # solo navegador (construye antes)

node tools/e2e/runner.cjs                 # las cuatro pruebas
node tools/e2e/runner.cjs timing          # una sola
node tools/e2e/runner.cjs --no-build flow # reutiliza el dist/ ya construido
node tools/e2e/timing.cjs                 # suelta: construye, sirve y limpia
```

Variables útiles:

| Variable         | Para qué                                                        |
| ---------------- | --------------------------------------------------------------- |
| `E2E_HEADFUL=1`  | Abre el navegador visible para mirar qué hace el bot.            |
| `E2E_NO_BUILD=1` | Salta `npm run build`.                                           |
| `E2E_BASE_URL`   | Usa un servidor ya levantado en vez de arrancar `vite preview`.  |
| `E2E_PORT`       | Cambia el puerto (por defecto 4317).                             |

## Qué garantiza cada prueba

### `content.cjs` — datos válidos (sin navegador)

Transpila `src/content/countries.ts` con esbuild y valida los datos reales:
ids únicos, todos con SVG en `node_modules/flag-icons/flags/4x3`, continentes y
dificultades conocidos, ninguna capital vacía entre los países que entran en
Capitales, ningún señuelo que sea la capital real de otro país, nombres,
capitales y señuelos sin espacios sobrantes, y grupos de parecidos que solo
citan países existentes. Avisa (sin fallar) de etiquetas de más de 26
caracteres y de entradas de `CAPITAL_CLUSTERS` sin capital.

### `flow.cjs` — el recorrido de menús no se rompe

En **móvil vertical (390x844, táctil)** y en **escritorio (1366x768)** recorre
inicio → BEAT TOUR → asignatura → zona → concierto → partida → RESULTADOS,
comprueba que el audio arranca, que el bot `good` puntúa, que la pantalla de
resultados se pinta con sus botones y que no hay errores de consola.

### `timing.cjs` — los tambores caen en su beat

Envuelve `AudioEngine.drumHit` **antes** de que arranque el juego (intercepta la
asignación de `window.__wb` y la del campo `audio`), así que no se escapa ni un
golpe. Cada llamada se compara con el tiempo programado de la ficha de tambor
más cercana. Se juega el GRAN FINAL de una zona (entra directo al groove, sin
sección de enseñanza) con el bot `wrong` —falla respuestas a propósito, así que
se rompe el combo— y con la **CPU emulada al 25 %** (`Emulation.setCPUThrottlingRate`
rate 4).

Falla si:

- alguna desviación supera **1 ms**;
- `window.__wb.engine.lateNotes` no es 0;
- no aparecen los dos sabores de tambor pre-programado: a volumen pleno en groove
  y suave tras un fallo.

### `layout.cjs` — ningún texto desborda su caja

Durante una partida (bot `good`) muestrea cada **100 ms** y compara
`scrollWidth` con `clientWidth` en `.tk:not(.drum)`, `.flag-label.show` y
`.prompt-caption`. Se ejecuta en **vertical (390x844)** y en **horizontal
(844x390)**, porque el escenario cambia de composición. Solo se mira el eje
horizontal: el sello ★ de las fichas está posicionado en absoluto y desborda
en vertical a propósito.

## Comprobar que la red caza de verdad

Introduce un fallo a mano y mira que la prueba lo detecte:

- **Maquetación**: pon un nombre largo **sin espacios** en
  `src/content/countries.ts` (p. ej. `'ESPAÑA'` → `'ESPAÑAESPAÑAESPAÑAESPAÑAESPAÑA'`)
  y ejecuta `npm run verify:e2e` → `layout` falla en vertical y en horizontal.
  Ojo: un nombre largo *con* espacios se reparte en varias líneas y no desborda
  a lo ancho, así que esta prueba no lo marca.
- **Timing**: en `RhythmEngine.buildChallenge`, programa el tambor con un
  desfase (`this.pushAudio(time + 0.005, …)`) → `timing` falla.
- **Contenido**: duplica un id o borra una capital → `content` falla.

Acuérdate de revertir el fallo.
