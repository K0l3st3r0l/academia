# AcademIA — prompts de arte (GPT Image 6.1)

Cómo se usa: copia el prompt en GPT Image, genera, y guarda la imagen en
`academia/art/incoming/` con el nombre de archivo indicado. Si una variante te gusta más
que otra, guárdala igual: se compara en pantalla antes de decidir.

Estilo base (va al inicio de todos los prompts, para que todo el juego se vea igual):

> Flat vector illustration for a children's educational game. Rounded, friendly shapes,
> thick dark navy outlines (#1A1A2E), soft cel shading with a single shadow tone, clean
> solid colors, no gradients, no texture. Palette anchored on purple #6C3CE1, gold #F5C842,
> teal #14B8A6, coral #F87171 and warm skin tones. No text, no letters, no logos, no watermark.

---

## 1. Hoja de personaje (referencia de estilo)

Sirve para decidir cómo se ve el personaje. No va al juego tal cual: a partir de la que
elijas se redibuja el personaje en capas SVG (piel, pelo, ropa y accesorios
intercambiables y recoloreables).

Genera **tres variantes**, una con cada proporción, y guárdalas como:

- `personaje-hoja-a.png` — proporción **chibi** (cabeza ≈ 40% de la altura)
- `personaje-hoja-b.png` — proporción **cartoon** (cabeza ≈ 30% de la altura)
- `personaje-hoja-c.png` — proporción **juvenil** (cabeza ≈ 22% de la altura)

Prompt (cambia solo la línea de proporción):

> [Estilo base]
> Character design sheet on a plain white background. A friendly 10-year-old student
> character, gender-neutral base body, shown front-facing in a neutral standing pose,
> arms relaxed slightly away from the body, legs slightly apart, feet visible, so that
> clothes and hair could be swapped as separate layers.
> PROPORTION: chibi, the head is about 40% of the total height.
> Around the main figure, show the same character with variations, all in the same pose
> and scale: six hairstyles (short, long straight, curly, afro, two braids, ponytail);
> four outfits (school polo shirt with shorts, hoodie with jeans, simple dress,
> tracksuit); five accessories (round glasses, cap, headphones, small backpack,
> hearing aid). Include one variation using a wheelchair, drawn in the same style.
> Show three different skin tones across the variations. Expressive, kind eyes;
> simple mouth. Wide layout, generous spacing between figures.

**Resultado (2026-10-02):** A y B aprobadas por el usuario; C descartada (cabeza muy chica,
cuerpo muy grande).

---

## 1b. Referencias grandes para redibujar el personaje en capas

Las hojas de arriba tienen 18 figuras de ~170 px de alto: sirven para elegir estilo, pero los
detalles (ojos, mechones, costuras) son muy chicos para copiarlos. Estas cuatro imágenes dan
las mismas piezas en grande y **todas sobre la misma figura y en la misma posición**, que es lo
que permite separarlas en capas que calcen entre sí.

En cada una: **adjunta la hoja elegida (`personaje-hoja-a.png` o `personaje-hoja-b.png`) como
imagen de referencia** y antepone el estilo base. Guarda con el sufijo de la hoja elegida
(por ejemplo `personaje-base-b.png`).

### `personaje-base-<a|b>.png` — figura base, grande

> [Estilo base]
> Match exactly the art style, proportions and line weight of the attached reference sheet.
> A single character, large, centered, filling most of the image height, on a plain white
> background: a 10-year-old student, front-facing, neutral standing pose, arms relaxed
> slightly away from the body, legs slightly apart, feet visible. Short dark-brown hair,
> medium skin tone, plain white t-shirt and teal shorts, white socks, purple sneakers.
> Every color region is a single flat fill plus at most one darker shadow tone.

### `personaje-caras-<a|b>.png` — caras

> [Estilo base]
> Match exactly the art style of the attached reference sheet. A grid of eight large heads
> of the same character (same head shape, same skin tone, short dark-brown hair), front view,
> on a plain white background: happy smile, wink, surprised, calm closed-mouth smile,
> determined, laughing, with round glasses, with a small hearing aid behind the ear.
> Same size and alignment for every head.

### `personaje-peinados-<a|b>.png` — peinados

> [Estilo base]
> Match exactly the art style of the attached reference sheet. A grid of eight large
> head-and-shoulders portraits of the same character, same face, same skin tone, same
> position and scale, only the hairstyle changes: short, long straight, long curly, afro,
> two braids, ponytail, buzz cut, shoulder-length bob. All in the same dark-brown color,
> plain white background. Draw the full hair volume including the parts behind the
> shoulders.

### `personaje-ropa-<a|b>.png` — ropa

> [Estilo base]
> Match exactly the art style of the attached reference sheet. A row of six full-body
> figures of the same character, identical pose, position and scale, short dark-brown hair,
> only the outfit changes: school polo with shorts, raglan t-shirt with shorts, hoodie with
> jeans, simple dress, tracksuit, overalls. Plain white background, generous spacing.
> Every color region is a single flat fill plus at most one darker shadow tone.

---

## 2. Mundo: una isla flotante por unidad (decidido 2026-10-06)

Cada unidad de una asignatura es **una isla** (1024×1536, vertical) que flota sobre un mar
de nubes. Las islas se apilan en el mapa: la Unidad 1 abajo y las siguientes encima, unidas
por puentes. Temática: **regiones y paisajes de Chile**, como las mascotas y las monedas.
Los niveles y el desafío los dibuja la app encima; la imagen solo trae los discos vacíos.

Se generan con `art/gen.sh`, se dejan en `art/incoming/mundo/<asignatura>-<curso>-u<unidad>.png`
y se procesan con `art/pipeline/build_world.py`: encuentra los discos por su color y escribe
sus posiciones en `shared/world/<curso>.json`. Por eso las reglas de composición no se tocan.

**Reglas de composición (toda isla):**

- Una sola isla flotante tipo diorama, vista 3/4 desde arriba, gruesa y de juguete.
- Arriba, cielo azul abierto; abajo, mar de nubes suave. Así empalman al apilarlas.
- Abajo al centro, un **muelle de madera** (entrada). Arriba, un **puente colgante** que sale
  por el borde superior hacia la isla siguiente (la última unidad no lo lleva).
- Un camino de arena serpentea del muelle a la cima con **N discos de piedra redondos,
  lisos, sin marcas** (N = OA de la unidad) y, en la cima, una **plaza redonda más grande**
  para el desafío. Los discos son de piedra clara beige grisácea: `build_world.py` los
  detecta por ese color.
- Sin personajes, sin texto, sin números.

**Plantilla** (con la Isla 1 adjunta como referencia, para que todas se vean iguales):

> [Estilo base]
> Match exactly the art style, camera angle, island scale, outline weight and lighting of the
> attached reference island. Portrait game level map for a phone screen. A single floating
> island diorama hovering over a soft sea of clouds, seen from a high three-quarter angle,
> chunky and toy-like. The island is inspired by {paisaje de Chile y sus elementos}. A sandy path
> winds across the island from a wooden dock at the bottom up to {hito de la cima}; along it,
> {N} empty round stone pads evenly spaced (plain and unmarked, the same light beige-grey stone
> as the reference), and a bigger round plaza in front of {hito} for the final challenge. From
> the plaza a rope bridge rises out of the top edge of the frame toward a second island whose
> underside is barely visible, half hidden in clouds. Bright, saturated, cheerful, readable at
> small size. No characters, no text, no numbers.

### Islas hechas

| Archivo | Unidad | Prompt |
|---|---|---|
| `matematica-5b-u1.png` | Matemática 5° · Unidad 1 · Isla del Observatorio (Atacama: salar con flamencos, vicuñas, cardones, observatorio) | `art/mapa/matematica-5b-u1.txt` |

`art/mapa/concepto-a-saga.txt` es el boceto descartado de mapa continuo estilo saga.

---

## 3. Portada: pantalla de título (2026-10-06)

Fondo de `games.laravas.com`: la Isla 1 **de noche**, con la Vía Láctea sobre el observatorio.
Noche y no día como el mapa porque la portada es oscura y el texto blanco tiene que leerse.
Dos encuadres de la misma escena, generados con la Isla 1 adjunta como referencia:

| Archivo | Uso | Regla de composición |
|---|---|---|
| `art/incoming/portada/fondo-ancho.png` (1536×1024) | Pantallas horizontales | Islas a los lados; el tercio central libre para el menú |
| `art/incoming/portada/fondo-alto.png` (1024×1536) | Celulares y tablets verticales | Mitad de arriba libre para el logo; isla abajo |

Prompts en `art/portada/`. `art/pipeline/build_portada.py` las pasa a WebP en
`frontend/public/portada/`. Lo que se anima (estrellas, cristales, ventanas del observatorio,
destellos de la laguna, estrellas fugaces) se dibuja encima en `TitleBackdrop.jsx`, en puntos
**elegidos a mano sobre los píxeles de estas imágenes**: si se regenera una, hay que volver a
ubicarlos.

---

## 4. Mascotas animadas: cuadro a cuadro desde videos de Grok (2026-10-06)

Las mascotas no usan el esqueleto del personaje: se animan **cuadro a cuadro** con poses sacadas
de videos cortos en el estilo del juego, hechos con Grok. El esqueleto de recortes para mascotas
quedó descartado: se veía rígido y las patas no calzaban al sentarse. Los accesorios de mascota
(colección de copihues) no se redibujan por pose: irán pegados a un punto de anclaje por cuadro
(pendiente de diseño).

**Ciclos (caminar, correr): un video por ciclo**, como propone la guía de animación del CLI de
Grok (`~/.grok/bundled/skills/game-assets/animation.md`):

1. **Base:** la mascota en una pose del ciclo, de perfil mirando a la derecha y con la cabeza
   hacia quien mira, sobre **verde plano** (`#00B140`) de 1280×720, con las patas cerca de
   y = 600. El verde no aparece en ningún pelaje, así que los huecos entre las patas se recortan
   sin tocar el blanco de los ojos (con fondo crema no se podía: el blanco de los ojos es del
   mismo crema). Del zorro: `art/incoming/animaciones/zorro-base-{caminar,correr}.png`, armadas
   con los recortes del primer video. Para caminar sirve una pose con las cuatro patas en el
   suelo; para correr, la pose estirada.
2. **Video:** la base como primer **y** último cuadro, para que el ciclo se cierre solo. Movimiento
   en el lugar, cámara fija, 6 s a 720p:
   `bash /root/apps/tools/grok-media/grok-media.sh video <salida.mp4> art/rig/mascotas/zorro-caminar.txt --first <base.png> --last <base.png> --duration 6 --res 720p`
   (y `zorro-correr.txt`). Los prompts piden las cuatro patas al mismo nivel y nunca erguida en dos
   patas; el de correr describe las dos fases del galope: estirado, y recogido (las delanteras
   atrás bajo el pecho, las traseras adelante bajo la panza) antes del impulso de las traseras.
3. **Elegir un período:** se busca el tramo que cierra mejor comparando las siluetas de los
   cuadros entre sí. Se evitan tramos con parpadeo, porque se repetirían en cada vuelta. Zorro:
   caminar 74–102 (29 cuadros a 24 fps, una zancada) y correr 98–120 (23). Se toma uno de cada
   dos: 15 y 12 dibujos.
4. **Zancada:** cuánto avanza un ciclo, para que los dibujos avancen con la distancia y las patas
   no patinen. Se mide con cuánto se corren hacia atrás las patas apoyadas entre cuadros. Caminar
   midió 174 px por ciclo a tamaño completo, y el prototipo usa ×1,25 para que la mascota no
   pedalee al seguir al niño. En el galope la medida sale con ruido, así que se fijó en ~1,5
   cuerpos.

**Poses sueltas (sentado, rascarse):** salen del primer video,
`art/incoming/animaciones/zorro_caminar_limpio.mp4`, sobre crema con franja de suelo y rótulos.
Su «paso 4» se descartó, porque muestra al zorro erguido en dos patas. Para las demás mascotas
conviene hacerlas también sobre verde: sentado como ciclo, con la base como primer y último
cuadro, y rascarse como acción de una vez, con la base solo como primer cuadro.

**Recortar:**

```
art/rig/mascotas/video_a_sprites.py <carpeta> \
  sit=art/incoming/animaciones/zorro_caminar_limpio.mp4@1 \
  walk=art/incoming/animaciones/zorro-caminar-ciclo.mp4@74-102:2 \
  run=art/incoming/animaciones/zorro-correr-ciclo.mp4@98-120:2 \
  scratch=art/incoming/animaciones/zorro_caminar_limpio.mp4@196,201
```

Los números de cuadro parten en 1, y `a-b:2` toma uno de cada dos. El script deja una imagen por
pose, todas del mismo tamaño, y `sprites.json` con `ground`, la fila de la línea de suelo. Cada
acción conserva su posición dentro del video, así que el sube y baja del galope queda en los
dibujos.

Con fondo verde, quita todo el verde, también los huecos entre las patas y el reflejo en los
bordes. Con fondo crema, quita el fondo, los rótulos, la sombra del suelo y los huecos que quedan
bajo los ojos. Con verde no hacen falta franja de suelo ni rótulos: la línea de suelo se toma de
las patas del primer cuadro, que es la base.

**Costo por mascota y etapa:** unos 4 videos (caminar, correr, sentado y rascarse), es decir ~72
para 6 especies × 3 etapas. Cada uno toma unos minutos y se pueden pedir dos en paralelo.

## 5. Personaje en modo plataformas: cuadro a cuadro desde videos de Grok (2026-10-06)

Igual que las mascotas (§4), pero con recolor. El personaje se dibuja con cuadros sacados de
videos; ropa (magenta) y piel se repintan con los colores del alumno, como en el editor. El rig de
recortes queda en el prototipo solo para comparar (chip «Rig»).

1. **Bases** (`art/incoming/animaciones/nino-base-*.png`):
   - Perfil de pie y pose de carrera: Grok `image` con `art/rig/personaje/base-perfil.txt` y
     `base-correr.txt`, usando como referencias la plantilla de ropa
     (`art/piezas/plantilla-ropa-nino.png`), `art/incoming/rig/cabeza-perfil.png` y
     `art/incoming/rig/partes-cuerpo.png`.
   - Frente: la misma plantilla del editor.
   - `art/rig/personaje/normalizar_bases.py` deja las tres a una escala (500 px de alto), con los
     pies en y = 650, sobre verde plano de 1280×720.
2. **Videos**: `grok-media.sh video`, 720p, prompts en `art/rig/personaje/`:
   - caminar y correr: 6 s, con la misma base como `--first` y `--last`;
   - girar: 3 s, de `--first` perfil a `--last` frente.
3. **Cuadros**: `video_a_sprites.py` con `walk=nino-caminar.mp4@44-68`,
   `run=nino-correr.mp4@22-37`, `turn=nino-girar.mp4@7-29:2` e `idle=nino-girar.mp4@29-45:2`.
   - Del giro se descartó el saltito final con los brazos abiertos (cuadros 47–61), por exagerado
     para un reposo.
   - Zancada medida: 0,9 alturas del niño por ciclo caminando y 1,5 corriendo.
4. **Recolor**: la piel de estos cuadros es más saturada que la de las piezas del editor (s 0,5–0,78).
   El pelo se distingue por ser más oscuro (v < 0,5). Una pasada de vecinos rellena las motas sueltas.

**Personalización:** con los cuadros solo cambian el color de la ropa y la piel. El peinado, los
rasgos y las prendas de otra forma están pendientes de decisión (registro de decisiones,
2026-10-06).

### Capa de cabeza y súper salto (2026-10-06, decidido: opción 1)

- **Cuerpo sin cabeza + cabeza del alumno.** `art/rig/personaje/separar_cabeza.py <cuadros> <salida>`
  (escrito por GPT-6.1 Sol @ xhigh y revisado) deja, para cada cuadro:
  - `body/<cuadro>.png`, el cuadro sin pelo ni cara, con el cuello;
  - las cabezas de referencia `heads/{profile,front}.png`, con su pivote bajo la mandíbula;
  - `anchors.json`, con vista, posición del pivote y ángulo de cada cuadro;
  - máscaras `occlusion` para lo que va delante de la cara: manos, brazos, rodillas en la bolita.

  Las hojas de `check/` muestran original | reconstrucción | diferencia.
- **Otro peinado = otra cabeza con el mismo pivote.** Grok `image` edita la cabeza de referencia
  (×3 sobre verde) con el peinado del catálogo como segunda referencia
  (`art/rig/personaje/cabeza-<peinado>-<vista>.txt`, `art/piezas/pelo-<peinado>.png`).
  `alinear_cabeza.py` la recorta y la mueve y escala hasta que la cara (la piel) calce con la de
  referencia. Probado con `cola` y `afro`.
- **Súper salto** (`nino-super-1.mp4` y `nino-super-2.mp4`, una toma con solo `--first`; prompt
  `super-salto.txt`). Los cuadros se eligen según la velocidad vertical:
  - subida: `superUp` (2:31, 2:33);
  - arriba: `superTop` (1:73, 1:76);
  - caída: `superDown` (1:85, 2:88);
  - aterrizaje: `superLand` (1:100, 2:103).

  Se descartaron los cuadros con manchas amarillas en el brazo y con polvo verde. Sin voltereta:
  el usuario la rechazó.

### Reposo por etapas, expresiones y zorro panza arriba (2026-10-06)

- **Etapas** (tiempo quieto, el prototipo las maneja en `stepKid`):
  - 0,35 s: gira hacia ti;
  - 2,5 s: silba;
  - 9 s: una actividad al azar (leer, lupa o pintar);
  - 24 s: se levanta y se aburre;
  - 31 s: bosteza, se sienta y se duerme, con «z» al lado de la cabeza.

  Al moverse, la entrada de la actividad se reproduce al revés y luego vuelve a perfil.
- **Videos** (base: `nino-base-frente.png`; prompts en `art/rig/personaje/`):
  - silbar y aburrido son ciclos (`--first` y `--last` en la base);
  - leer, lupa, pintar y dormir son de una vez (solo `--first`, 8 s).

  Cuadros: whistle 31–62:2, bored 29–107:3, readIn 1–64:3 + read 148–179:2,
  lupaIn 1–58:3 + lupa 61–193:4 (toma `lupa-3.txt`, «nino-lupa.mp4»; el lazo va y vuelve), paintIn 1–60:3 + paint 123–186:3,
  sleepIn 1–102:3 + sleep 103–126:2.
- **Grok acerca la cámara al sentarse**, aunque se le pida cámara fija: hasta 1,43×.
  `normalizar_zoom.py <cuadros> 164 readIn read lupaIn lupa paintIn paint` lo deshace midiendo el
  ancho del pelo de frente.
- **Cabeza en estos cuadros:** vienen de la plantilla del editor, cuya cabeza es más chica que la del
  video del giro. Por eso `separar_cabeza.py` se corre aparte para ellos con
  `--front whistle-0.png --profile turn-0.png`. El anclaje marca el cuello, así que la cabeza del
  alumno calza igual.
- **Expresiones** de frente (dormido, silbando, aburrido, abajo) por peinado: Grok `image` sobre la
  cabeza de frente de cada peinado (`expresion-<cara>.txt`), alineadas con `alinear_cabeza.py`.
  `caras.json` dice qué cara usa cada cuadro.
- **Zorro panza arriba:** `zorro-panza-2.txt` desde `zorro-base-sentado.png`. Hay que pedir
  «side view» explícito: la primera toma lo dibujó visto desde arriba y en un juego de perfil
  parecía flotar. Cuadros: bellyIn 13–67:3, belly 70–109:2, restIn 151–169:3, rest 170–192:4.
- **Build:** los dibujos van en WebP q90 (un cuarto del PNG). Con unos 400 dibujos la página
  pesa 5,5 MB.
- **Apoyo en el suelo:** `normalizar_zoom.py` apoya cada cuadro por su piel más baja (pies o
  piernas), dejando el borde de 3 px en la línea de suelo, no por el píxel más bajo. Con la primera
  lupa, el lente, más bajo que los pies, dejaba al niño flotando. El tramo en que se sienta a
  dormir, que en su video quedó 13 px alto, se baja en rampa.
- **Utilería suelta:** sobre verde, `video_a_sprites.py` conserva las figuras de al menos 0,15% del
  tamaño del personaje, como la chinita que camina por el suelo. Antes solo quedaba la figura más
  grande.
- **Lupa, segunda versión** (`lupa-2.txt`): arrodillado de frente, con la lupa siempre cerca del
  suelo siguiendo una chinita y nunca delante de la cara, porque la cara es la capa del alumno.
  Se descartó la toma que giraba de tres cuartos a la izquierda.
- **Lupa, tercera versión** (`lupa-3.txt`, pedido del usuario): arrodillado de lado, con ambas piernas
  recogidas hacia el mismo costado, el cuerpo derecho y la cabeza derecha mirando al frente; solo los
  ojos siguen a la chinita. En la segunda versión el niño giraba e inclinaba la cabeza hacia el suelo.
  Una cabeza de frente solo puede rotar en el plano, así que esa inclinación se veía como una cabeza
  desalineada con el cuerpo. Regla para los próximos videos: **la cabeza siempre derecha, de frente
  o de perfil; la mirada se mueve con los ojos**.
- **Lienzo del niño:** se ensanchó de 562 a 812 px para que entre la chinita, que llega caminando
  desde lejos.
- **Zorro sentado que respira** (`art/rig/mascotas/zorro-respirar.txt`, ciclo con la base sentada como
  primer y último cuadro, «zorro-respirar.mp4», cuadros 1–144:3). Respira, parpadea, mueve una oreja
  y la cola. Reemplaza al dibujo fijo, que «parecía una foto»: la respiración por código que tenía
  movía apenas un 0,14%. Los dibujos sentado y rascarse del primer video se bajaron 5 px para
  calzar con este.
- **La mariquita se dibuja aparte** (`kid-heads/bug.png` y `bug.json`, con posición, dirección por
  cuadro y hacia dónde mira el dibujo). Con el lazo que va y vuelve, en la vuelta caminaba
  retrocediendo. Ahora se da vuelta y mira hacia donde camina. Solo se dibuja sobre suelo firme,
  para que no camine en el aire si el niño se arrodilla al borde de una plataforma.

## 6. Academia v2: salón, galería, cofres y Estela animada (2026-10-07)

Prompts en `art/academia/v2/prompts/`, originales en `v2/raw/` y piezas recortadas en `v2/piezas/` (`v2/cortar.py`).
Todo lo estático lo hizo GPT (`art/gen.sh`, con `raw/stations.png` como referencia de estilo). Grok se usó solo para el video de Estela.

- **Muro y atrio:**
  - Pared vista de frente que termina en el zócalo, sin piso dibujado. Si la imagen trae piso, los objetos parecen flotar delante de él.
  - Paleta cálida (arenisca, madera, bronce) con cielo azul verdoso y «absolutely no purple».
  - El muro se repite en espejo, así los bordes calzan solos.
- **Arquitectura:**
  - Una hoja sobre chroma con la viga de la galería, la baranda, las columnas y la plataforma colgante.
  - La baranda se dibuja delante de los personajes: así se leen parados en la pasarela.
- **Suelo:** la franja tiene la superficie superior visible y el frente debajo.
- **Escalera:** de perfil, con poste en el piso. Se voltea para el lado derecho.
- **Cofres:**
  - Primero el cerrado. El abierto es una edición del cerrado («same chest… now OPEN»), así ambos calzan en el mismo lienzo.
  - El forro turquesa del interior se borra con el chroma. `cortar.py` conserva lo que el cofre encierra: solo es fondo el verde conectado al borde.
- **Íconos de objetos:** una hoja de 4 × 2, recortada por celdas.
- **Estela animada:**
  - Base nueva (GPT, editando `historia/estela/estela.png`) con el pelo y la capa cayendo por gravedad, sobre chroma. Antes el pelo «volaba» y se veía como una foto.
  - Video de Grok (`estela-idle.txt`): el mismo cuadro al inicio y al final, 9:16, 720p, 6 s.
  - Para que la figura llene el video vertical, la base se recentra en un lienzo de 900 × 1600.
  - Cuadros: `video_a_sprites.py … idle=estela-idle.mp4@1-145:2`. Son 73 cuadros a 12 fps.
  - Ojo: `ground` salió a media altura porque la capa ocupa más de la mitad del ancho. Se corrigió a la suela de las botas: fila 994.
