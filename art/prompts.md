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
