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

---

## 2. Mapa piloto (después de elegir el personaje)

Se escribe cuando esté decidida la hoja de personaje, para que el mapa use el mismo
estilo y la hoja elegida vaya como imagen de referencia.
