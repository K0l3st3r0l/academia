# Apertura de la Academia

La película que ve el alumno la primera vez que entra a la Academia (diseño en la wiki:
`academia/diseno-narrativo` §3). Se reproduce en `/alumno/apertura` (`frontend/src/pages/AcademyIntro.jsx`)
y termina en el lobby (`/academia/`). La primera vez se ve completa; después se puede saltar y
repetir desde Ajustes del lobby.

## Partes

1. **La historia** (`parte1.mp4`): el reloj en la oscuridad, la Academia, el Reloj de las Épocas,
   la tormenta, las piezas cayendo al mar y a una ciudad colonial, y Estela buscando a alguien.
2. **En vivo**: el juego dibuja el personaje y la mascota del propio alumno, y Estela le entrega la
   Brújula del Tiempo. No es video: así el alumno se ve a sí mismo.
3. **La misión** (`parte2.mp4`): Estela da la misión, el portal se abre y aparece el título.
4. **Qué harás aquí** (`parte3.mp4`): Estela, en un círculo, explica la Academia sobre imágenes
   reales del lobby.

## Archivos

- `guion.json`: la única fuente del texto. Planos, una frase por plano, y los grupos de frases
  que Grok dice en un clip, en orden de prioridad.
- `prompts/`, `cuadros/`: el cuadro fijo de cada plano (Grok `image_edit` sobre el arte del lobby)
  y el prompt de su clip.
- `clips/generar.sh`: los planos sin voz (Grok, de a dos). `clips/` no se versiona.
- `gen-voz.py`: los clips donde Estela dice las frases, todos con la voz `ara` para que suene a
  una sola persona. Se detiene al primer error: la cuota semanal de Grok se acaba a mitad de tanda
  (HTTP 402). `voz/` no se versiona.
- `grabar.cjs`: graba con Playwright las imágenes reales del lobby para la parte 4 (`juego/`).
- `montar.py`: corta la película en `frontend/public/academia/apertura/` (videos, arte de la escena
  en vivo, audio y `apertura.json`). Los tiempos de cada frase salen de Whisper (el contenedor de
  ProsodIA, por stdin). Lo que falta no rompe nada: una frase sin voz queda solo con subtítulo y un
  plano sin clip usa su cuadro fijo con un acercamiento lento. Correrlo bajo la guardia:
  `bash /root/apps/wiki/deploy-guard.sh run academia/apertura-montaje -- <python> montar.py`.
- `noche.sh`: espera la reposición de Grok, hace las voces y el portal, y vuelve a montar.

Los videos finales y las fuentes de Grok viven solo en el VPS (ver `.gitignore`); el deploy desde
el VPS los incluye en la imagen del frontend.
