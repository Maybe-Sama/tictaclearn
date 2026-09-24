# WORLD BEAT · de prototipo a juego viral

Documento de trabajo. Estado a 25/09/2026: prototipo jugable en web con dos asignaturas
(banderas, capitales), 195 países, Beat Tour (7 zonas, 60 conciertos), Beat Libre,
4 dificultades, motor de ritmo propio y música procedural.

---

## 1. La apuesta en una frase

> **El primer juego de trivia que se juega con las manos al ritmo, no con el ratón.**
> Los vídeos de "adivina la bandera" ya funcionan. Lo que no existe es uno donde el
> streamer **falle en directo por medio compás** y el chat lo vea venir.

Dos públicos, un mismo juego:

| | Estudiante | Streamer / espectador |
|---|---|---|
| Quiere | Aprobar geografía sin aburrirse | Contenido con tensión, fallos y risas |
| Sesión | 3–10 min diarios | 20–40 min, o un reto de 60 s |
| Éxito | "Me las sé" | "Qué vergüenza, he fallado Bélgica" |
| Lo que le retiene | Progreso visible, repaso que funciona | Rachas, público, ranking, picarse |

La clave: **el ritmo convierte saber en espectáculo**. Un quiz normal no tiene momento
de tensión; aquí cada respuesta tiene un instante exacto, y fallar por tiempo es
gracioso y compartible.

---

## 2. Qué falta para que sea "jugable por un streamer" (lo mínimo)

Por orden de impacto sobre esfuerzo:

1. **Reto diario con semilla compartida.** Mismos países, mismo orden, misma canción
   para todo el mundo ese día. 60–90 segundos. Un botón de compartir con resultado en
   texto (cuadraditos tipo Wordle: 🟩🟩🟨⬛). Es *el* mecanismo de difusión gratuito.
2. **Tarjeta de resultado bonita** (imagen PNG generada en el propio navegador) lista
   para Twitter/Instagram: puntuación, combo máximo, las banderas falladas.
3. **Modo duelo local (2 jugadores, mismo teclado)**: uno con A, otro con L. Es lo que
   mejor funciona en vídeo, y no necesita servidor.
4. **Modo espectador / overlay**: fondo transparente, HUD compacto en un lado,
   preparado para OBS. Y un modo "sin música" para que el streamer ponga la suya.
5. **Repetición de los 10 últimos segundos** (clip) al fallar algo sonado. Sin vídeo:
   se puede reproducir la secuencia dentro del juego, que es igual de gracioso.

---

## 3. Qué falta para que "de verdad enseñe" (lo que retiene)

1. **Repaso diario inteligente**: hoy la memoria por país ya existe (cajas de repaso).
   Falta la pantalla "hoy toca repasar 12" y un recordatorio.
2. **Mapa de dominio**: un mapamundi coloreado por lo que sabes. Es la imagen que la
   gente comparte ("me falta África entera").
3. **Más asignaturas con el mismo motor**: siluetas de países, idiomas (palabra →
   traducción), símbolos químicos, operaciones, obras de arte. Cada una es un archivo
   de contenido; el motor de ritmo no se toca.
4. **Modo profesor**: crear un set de países y compartirlo con un código de 6 letras.
   Sin cuentas: el código lleva la lista comprimida en la URL.

---

## 4. Riesgos reales (y qué hacer con ellos)

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| **Latencia en móvil** | Si los golpes no cuadran, el juego muere | Ya hay calibración y tambores anclados al beat. Falta: calibración automática silenciosa |
| **La curva se hace repetitiva** | 60 conciertos con la misma estructura cansan | Ya hay 6 bandas y 8 progresiones. Falta: más plantillas rítmicas y "mundos" con reglas propias |
| **Sin cuentas, sin progreso entre dispositivos** | Frustra al que juega en móvil y PC | Código de respaldo exportable; cuentas solo cuando haya demanda |
| **Derechos musicales** | Cero problema hoy (todo sintetizado) | Mantener la música procedural como principio |
| **Banderas y política** | Kosovo, Taiwán, Palestina, capitales en disputa | Lista ONU + observadores, y los casos discutidos fuera de Capitales. Documentado |
| **Un clon con más presupuesto** | La idea es copiable | La ventaja es el motor de ritmo afinado y el contenido; correr rápido y construir comunidad |

---

## 5. Hoja de ruta

### Fase 1 — "Que enganche" (2–3 semanas)
- Reto diario con semilla + resultado compartible (texto y PNG).
- Tarjeta de resultados rediseñada para captura.
- Racha diaria ("llevas 5 días").
- Ajuste fino de la curva de los 60 conciertos con jugadores reales (no bots).
- **Métrica objetivo:** que 3 de cada 10 que empiezan una partida jueguen una segunda.

### Fase 2 — "Que se comparta" (3–4 semanas)
- Duelo local a dos manos.
- Modo overlay para OBS + modo sin música.
- Mapa de dominio compartible.
- Sets por código para clase.
- **Métrica objetivo:** 1 de cada 10 partidas termina en un resultado compartido.

### Fase 3 — "Que crezca" (4–6 semanas)
- Ranking semanal del reto diario (requiere backend mínimo).
- Duelo en línea asíncrono: juegas la partida de otro y comparas.
- 2 asignaturas nuevas (siluetas de países, banderas de comunidades/estados).
- App instalable (PWA) y sonido con latencia baja.
- **Métrica objetivo:** 1.000 jugadores en el reto diario.

### Fase 4 — "Que se sostenga"
- Versión escolar: panel de profesor, seguimiento de alumnos, sets propios.
- Patrocinio de packs temáticos (mundiales, Eurovisión, JJOO).
- Cosmético: bandas y escenarios desbloqueables. Nunca vender ventaja de juego.

---

## 6. Cómo se gana dinero (sin romper el juego)

1. **Gratis siempre el juego base.** Es el motor de difusión.
2. **Packs cosméticos**: bandas musicales, escenarios, mascotas. 2–4 €.
3. **Licencia de centro**: panel de profesor, informes, sets propios. 1–3 €/alumno/año.
4. **Patrocinios temáticos** en fechas señaladas.
5. **Nada de anuncios que interrumpan el ritmo.** Un anuncio a mitad de compás mata el juego.

---

## 7. Lanzamiento

1. **Semilla**: 20–30 personas reales (clase, amigos, familia) durante una semana.
2. **Creadores**: buscar 10 canales medianos de trivia/geografía en español. Darles
   enlace directo a un reto preparado para ellos (su nombre en el reto del día).
3. **Momento**: un reto diario temático que coincida con algo (Eurovisión, un mundial).
4. **Comunidad**: Discord o grupo donde se comparta el resultado del día.

---

## 8. Lo que NO hay que hacer

- No meter cuentas obligatorias antes de tener retención.
- No añadir más asignaturas antes de que una esté realmente pulida.
- No sacrificar la precisión del ritmo por un efecto visual.
- No convertirlo en un quiz con música (la regla de oro del primer día sigue vigente).
