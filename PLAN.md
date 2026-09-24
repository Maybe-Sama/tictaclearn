# WORLD BEAT · Plan revisado (Design & Architecture Review)

Revisión del plan anterior aplicando criterio de dirección de juego. Estado real del
prototipo a 25/09/2026, medido sobre el código, no sobre intenciones:

- Motor de ritmo con el `AudioContext` como reloj, planificación con lookahead y
  compensación de latencia de salida. **Funciona y está medido** (tambores a 0 ms del
  beat, 0 notas tardías con CPU ×6).
- 195 países, 2 asignaturas, Beat Tour (7 zonas / 60 conciertos), Beat Libre,
  4 dificultades, repaso espaciado persistente, 6 bandas × 8 progresiones × 7 tonos.
- `Game.ts` 886 líneas, `Stage.ts` 737 líneas. Sin tests en el repositorio.
  `Math.random` en 8 archivos, sin semilla. El tutorial y el Beat 2 (gemelas/trampas)
  solo son alcanzables con la tecla de depuración: **contenido huérfano**.

---

## 1. Diagnóstico

### Lo que está bien y NO se toca
- **El reloj y el juicio de timing.** Es el corazón y está resuelto con criterio:
  reloj de audio, lookahead, `heardTime`, ventanas por dificultad, distinción entre
  fallo de conocimiento y fallo de ritmo. Tocarlo ahora sería destruir valor.
- **La separación motor / contenido.** `ContentPack` + `LearningItem` ya permite una
  asignatura nueva sin tocar el motor. Lo hemos probado dos veces (banderas, capitales).
- **El Tour generado por datos.** 60 conciertos salen de una lista de países y una
  función de rampa. Añadir "monumentos" son datos, no código.
- **La honestidad pedagógica.** Aprobar por conocimiento y no por ritmo es la decisión
  de diseño más importante del proyecto. Se queda.

### Lo que está mal
- **El plan anterior era un plan de marketing disfrazado de plan de producto.** Ponía
  el reto diario y lo compartible en la fase 1, cuando el problema real es que **60
  conciertos son la misma mecánica cambiando la bandera**. Si traemos tráfico a un
  juego que aburre al tercer nivel, quemamos la única primera impresión que tenemos.
- **Una sola primitiva de gameplay.** Todo el juego es TAP. Rhythm Heaven no es genial
  por tener buen timing: es genial porque cada minijuego tiene un *verbo* distinto.
- **El criterio de aprobado no mide lo que dice medir.** Cuenta todos los intentos,
  incluidos los de repaso, así que se puede superar un concierto sin aprender ninguno
  de los países nuevos que ese concierto enseña.
- **Nada es determinista.** Sin semilla no hay reto diario justo, ni repeticiones, ni
  duelos, ni reproducir un bug. Es la dependencia oculta de media hoja de ruta.
- **Sin red de seguridad.** Los scripts con los que he verificado ritmo, rendimiento y
  desbordes viven en una carpeta temporal fuera del repositorio. Una regresión de
  timing es invisible a ojo y ahora mismo nada la detiene.

### Lo que falta
- Arquetipos de concierto (variedad percibida), identidad sonora propia, tutorial
  reincorporado al flujo real, exportar/importar progreso, inglés.

### Lo que sobra
- El duelo local a dos manos tal y como lo planteé, el ranking global en fase 3 (sin
  validación es folclore), y cualquier sistema de cuentas.

---

## 2. Riesgos

| | Riesgo | Detalle |
|---|---|---|
| 🔴 | **Repetición del core loop** | 60 conciertos con la misma estructura: título → enseñar → 4 retos → mezcla → final. Es el riesgo número uno del proyecto y el plan anterior no lo atacaba |
| 🔴 | **No determinismo** | `Math.random` sin semilla en generador, setlist, música y partículas. Bloquea reto diario, duelos, repeticiones y depuración de bugs reportados |
| 🔴 | **Sin pruebas automáticas en el repo** | El timing se rompe en silencio. Ya me ha pasado una vez en este proyecto (el tempo que se movía) y solo se vio midiendo |
| 🟠 | **Criterio de aprobado difuso** | Se aprueba un concierto sin dominar sus países nuevos; las estrellas mienten y el repaso espaciado recibe datos sesgados |
| 🟠 | **Contenido huérfano** | Tutorial y Beat 2 (gemelas/trampas) inalcanzables: ~200 líneas de contenido bueno que nadie ve, y un onboarding inexistente para quien entra por primera vez |
| 🟠 | **Dos clases-dios** | `Game.ts` (886) mezcla navegación, sesión, calibración, resultados y bot; `Stage.ts` (737) mezcla HUD, carril, lienzo y feedback. Todavía manejable, peligroso al añadir modos |
| 🟠 | **Latencia en móvil/Bluetooth** | Mitigada (tambores anclados, calibración manual), pero el usuario nuevo no sabe que existe *Ajustar ritmo* |
| 🟠 | **Ranking sin validación** | Puntuación cliente: trivial de falsear. Un ranking público con premios sería insostenible |
| 🟡 | **Solo español** | Los strings viven en el código y las respuestas en los datos. Cada semana que pasa es más caro. El público streamer internacional es 10× |
| 🟡 | **Progreso atado al navegador** | Sin export/import, quien cambia de móvil pierde su gira |
| 🟡 | **Datos sin validar** | Capitales escritas a mano, sin comprobación de duplicados, señuelos que colisionen o etiquetas demasiado largas |
| 🟢 | **Timing, audio y motor rítmico** | Medido y correcto. Es el activo del proyecto |
| 🟢 | **Escalado de contenido** | `ContentPack` aguanta 10× contenido sin rehacer el motor |

---

## 3. Decisiones que cambiaría

### 3.1 Primero variedad, después difusión
- **ACTUAL:** Fase 1 = reto diario y compartir.
- **PROBLEMA:** Atraemos gente a un juego que se agota en 10 minutos. La retención no
  se arregla con tráfico.
- **PROPUESTA:** Fase 1 = primitivas nuevas y arquetipos de concierto. La difusión pasa
  a la fase 3, cuando haya algo que merezca compartirse.
- **POR QUÉ:** Un juego con un buen primer día y mal segundo día no se vuelve viral; se
  vuelve un vídeo y ya está.
- **COSTE/BENEFICIO:** Retrasa la difusión 3–4 semanas. Es la diferencia entre un pico
  y un producto.

### 3.2 Añadir dos primitivas, no diez
- **ACTUAL:** Solo TAP (tambores + país correcto).
- **PROBLEMA:** Toda la variedad recae en la música y en la plantilla rítmica. El
  jugador percibe siempre el mismo verbo.
- **PROPUESTA:** Añadir exactamente dos:
  1. **HOLD** — mantener pulsado mientras una ficha larga cruza el pad (el país "se
     estira": banderas con nombre largo, capitales con varias palabras). Un solo botón
     sigue bastando; en móvil es mantener el dedo.
  2. **ECHO (llamada y respuesta)** — la banda toca un patrón de 4 tiempos y tú lo
     repites. Es puro ritmo, sin conocimiento, y sirve como respiro entre tandas y como
     tutorial natural del compás.
- **POR QUÉ:** Con TAP + HOLD + ECHO y la capa de conocimiento (MATCH) se construyen
  decenas de retos distintos sin motor nuevo.
- **COSTE/BENEFICIO:** ~1 semana de motor (el juez ya distingue tipos de ficha).
  Multiplica la variedad percibida.

### 3.3 Arquetipos de concierto en vez de una plantilla única
- **ACTUAL:** Todos los conciertos comparten estructura.
- **PROPUESTA:** 6 arquetipos que combinan las mismas piezas con fantasía distinta:
  **Escuela** (enseñar + practicar, el actual), **Sprint** (sin enseñar, densidad alta,
  60 s), **Eco** (mitad ritmo puro), **Memoria** (bandera en flash, responde después),
  **Desfile** (flujo continuo, una bandera por compás), **Jefe** (dobles, a ciegas y
  cambios de tempo entre secciones). El Tour asigna arquetipo por posición y zona.
- **POR QUÉ:** Variedad perceptiva reutilizando sistemas: exactamente lo que pide un
  buen rhythm game.
- **COSTE/BENEFICIO:** ~1 semana. Es el mayor salto de calidad percibida por euro.

### 3.4 Semilla determinista antes que cualquier función social
- **ACTUAL:** `Math.random` disperso.
- **PROPUESTA:** Un módulo `Rng` (mulberry32 o similar) inyectado en generador de
  retos, setlist y música. La partida queda definida por `(semilla, asignatura, plan)`.
  La dificultad adaptativa se **congela** en modos con semilla, o dos jugadores con la
  misma semilla no jugarían lo mismo.
- **POR QUÉ:** Es requisito de reto diario, duelos, repeticiones y reproducción de bugs.
- **COSTE/BENEFICIO:** 1–2 días ahora. Semanas si se hace después, con tres funciones ya
  construidas encima.

### 3.5 Aprobar por lo que enseña el concierto
- **ACTUAL:** Aciertos sobre todos los intentos (nuevos + repaso).
- **PROPUESTA:** Aprobado = ≥ 70 % sobre los **países nuevos** del concierto; el repaso
  aporta a la 2.ª estrella; el ritmo, a la 3.ª.
- **POR QUÉ:** Las estrellas deben significar algo y el repaso espaciado necesita datos
  limpios.
- **COSTE/BENEFICIO:** Media hora de código. Corrige una mentira del sistema.

### 3.6 El tutorial vuelve al juego
- **ACTUAL:** Inalcanzable salvo con teclas de depuración.
- **PROPUESTA:** La primera vez que alguien entra a cualquier concierto, se antepone un
  **primer compás guiado** (los tambores y una demostración). Se borran los guiones
  Beat 1 / Beat 2; sus ideas buenas (gemelas, trampas) ya viven en la Gira Mundial.
- **POR QUÉ:** Menos código muerto, y nadie empieza sin saber qué hacer.
- **COSTE/BENEFICIO:** ~1 día y elimina ~200 líneas.

### 3.7 El duelo, por turnos, no a dos manos
- **ACTUAL:** Dos jugadores en el mismo teclado sobre un único carril.
- **PROBLEMA:** Dos personas pulsando sobre la misma línea temporal es ilegible, y en
  móvil directamente imposible.
- **PROPUESTA:** **Relevo**: turnos de 30 s con la misma semilla, se pasa el teléfono, y
  al final una comparación lado a lado. Cero servidor, funciona en directo y en el sofá.
- **COSTE/BENEFICIO:** Más barato y más divertido que la propuesta anterior.

### 3.8 Ranking sí, pero honesto
- **ACTUAL:** Ranking semanal en fase 3.
- **PROPUESTA:** Fase 3 = ranking **entre amigos por enlace** (sin servidor de verdad).
  Ranking global solo cuando el servidor pueda **revalidar la partida** a partir de la
  semilla y la lista de pulsaciones.
- **POR QUÉ:** Un marcador falseable destruye la confianza en cuanto alguien lo publica.

---

## 4. Plan revisado

### Fase 0 — Cimientos invisibles (3–5 días)
1. Módulo `Rng` con semilla, inyectado en generador, setlist y música. Congelar la
   dificultad adaptativa en modos con semilla.
2. Mover el arnés de pruebas al repositorio (`tools/e2e`) y añadirlo a la CI:
   ritmo en el beat, 0 notas tardías con CPU ×4, 0 textos desbordados, recorrido de
   menús completo, presupuesto de fotogramas.
3. Validador de contenido en la CI: ids únicos, bandera existente, señuelo que no sea
   capital de otro país, longitudes de etiqueta razonables.

### Fase 1 — Que el juego sea variado (2 semanas)
4. Primitiva **HOLD** (motor, juez, ficha larga, sonido sostenido).
5. Primitiva **ECHO** (llamada y respuesta).
6. Los 6 **arquetipos de concierto** y su reparto por el Tour.
7. Ajuste de la curva con jugadores reales, no bots.

### Fase 2 — Que enseñe de verdad + inglés (2 semanas)
8. Aprobado por países nuevos; estrellas coherentes.
9. **Primer compás guiado** para novatos; borrar Beat 1 / Beat 2.
10. Pantalla **"Hoy toca repasar"** con lo que el sistema de cajas ya sabe.
11. Autocalibración silenciosa: si la mediana de desvío supera ~35 ms, ofrecer ajustar.
12. **Inglés** (decisión del director, subido desde la fase 6): extraer los textos a un
    módulo de idioma y las respuestas por idioma en el contenido. Se hace aquí porque
    ya estamos tocando el flujo de enseñanza, y porque el público de creadores en inglés
    es ~10× el hispanohablante. Cada semana de retraso lo encarece.

### Fase 3 — Que se comparta (2 semanas)
13. **Reto diario**: 10 banderas, ~60 s, mismo reto para todos. Especificación completa
    en [docs/DAILY-AND-SHARE.md](docs/DAILY-AND-SHARE.md). Decisiones del director:
    asignatura **siempre Banderas**; dificultad adaptativa **congelada**; el historial de
    confusiones del jugador **no** interviene (rompería la igualdad entre jugadores);
    el número de reto se deriva de la **fecha local** (modelo Wordle: mismo número =
    mismo reto para todos, sin cambios a la 01:00 de la madrugada).
14. **Resultado compartible en texto** (variante B: cuadrícula + la línea del fallo
    estrella, que es lo único que habla de la persona) + enlace corto sin resultado.
15. "Juega la partida de tu amigo" desde el enlace.
16. *Condicionadas, no se construyen de entrada:* la **tarjeta en imagen** solo si el
    texto supera el 6 % de compartidos; la **racha** solo si entra con el código de
    progreso exportable.

### Fase 4 — Identidad (2 semanas)
16. Identidad sonora: logotipo sonoro, voz del planeta, sonidos reconocibles.
17. Mascota con personalidad real (reacciona, se burla, celebra), transiciones propias.
18. **Mapa de dominio** compartible.
19. Accesibilidad: daltonismo, tipografía alternativa, modo de movimiento reducido ya
    existente revisado.

### Fase 5 — Social y aula (2 semanas)
20. **Relevo** (duelo por turnos con semilla).
21. Modo **overlay/OBS**: HUD compacto, fondo transparente, opción sin música.
21b. **Modo Chat**: pausa de 2–5 s tras revelar la bandera para que el público del directo
     responda antes que el streamer. Es la única función que genera contenido sin que
     nosotros grabemos nada; va por delante de la tarjeta de imagen.
22. Sets por **código** (lista comprimida en la URL, sin servidor).
23. Exportar/importar progreso.

### Fase 6 — Escala (cuando haya retención demostrada)
24. PWA instalable.
25. Servidor mínimo: guardar partidas del reto diario con validación por repetición.
26. Ranking global y liga semanal.

---

## 5. Definition of Done por fase

**Fase 0**
- `npm run verify` ejecuta en CI y falla si: algún tambor suena a más de 1 ms de su
  beat; hay una sola nota tardía con CPU ×4; algún texto desborda su caja; el recorrido
  inicio → asignatura → zona → concierto → resultados no llega al final.
- Dos ejecuciones con la misma semilla producen **la misma secuencia de retos y la misma
  canción** (comparación de una traza serializada).

**Fase 1**
- Un concierto de cada arquetipo se completa sin errores en móvil y escritorio.
- En una sesión de 10 minutos, el jugador ve al menos 3 arquetipos distintos.
- 8 de cada 10 jugadores de prueba describen correctamente qué hace HOLD sin que nadie
  se lo explique.

**Fase 2**
- Un jugador que falla todos los países nuevos **no** supera el concierto (prueba
  automática con el bot en modo "wrong").
- 7 de cada 10 novatos superan su primer concierto sin ayuda externa.

**Fase 3**
- Dos dispositivos distintos, mismo día: misma secuencia y misma canción.
- El texto compartido reproduce la partida al abrir el enlace.
- Métrica: **6–12 %** de quienes terminan el reto diario pulsan compartir (el ≥ 25 % del
  plan anterior estaba mal calibrado; no es una referencia honesta).

**Fase 4**
- Prueba a ciegas: 7 de cada 10 personas reconocen el juego solo por el sonido de acierto.

**Fase 5**
- Una partida de Relevo completa entre dos personas en un solo teléfono, sin recargar.
- El overlay ocupa < 25 % de la pantalla y es legible a 720p.

**Fase 6**
- Una partida del reto diario se revalida en el servidor a partir de semilla +
  pulsaciones, y una puntuación manipulada se rechaza.

---

## 6. Lo que NO construyo todavía

- Cuentas de usuario y login.
- Ranking global (hasta que haya validación por repetición).
- Multijugador en tiempo real.
- Editor de niveles.
- Asignaturas nuevas (idiomas, monumentos, química): primero dos pulidas.
- Tienda, cosméticos y cualquier monetización.
- App nativa.
- Backend propio más allá del mínimo de la fase 6.
- Sistema de logros.

---

## 7. Veredicto técnico

**Intacto:** reloj de audio y `heardTime`, juez y ventanas, planificador con lookahead,
música procedural y bandas, `ContentPack`, generación del Tour por datos, repaso
espaciado persistente.

**Refactorizar (moderado, sin reescribir):**
- `Game.ts` → separar `SessionController` (una partida), `FlowController` (navegación)
  y `CalibrationController`. Se hace cuando entren los arquetipos, no antes.
- `Stage.ts` → extraer el carril (`Lane`) y el HUD; el resto se queda.
- `LearningItem.flagAsset` → `asset` antes de la tercera asignatura.

**Eliminar:** guiones Beat 1 / Beat 2 del setlist (contenido huérfano) y las rutas de
depuración asociadas.

**Decidir antes de implementar:**
1. ¿HOLD también en móvil con dedo mantenido, o solo teclado? (Afecta a la ficha larga.)
2. ~~¿Asignatura del reto diario?~~ **Decidido: siempre Banderas.** Es lo que la gente
   ya consume en vídeo, y mezclar asignaturas rompe la comparación entre jugadores.
3. ~~¿Inglés en la fase 6?~~ **Decidido: sube a la fase 2.**
