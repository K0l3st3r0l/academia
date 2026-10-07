# AcademIA — motor de capítulos

`plantilla.html` contiene todo el juego: CSS, un motor sin DOM entre los marcadores
`STORY_ENGINE_START` / `STORY_ENGINE_END`, y la interfaz debajo de `UI_START`.
El motor recorre ramas con una pila, registra decisiones, objetos, fichas,
niveles por asignatura y resultados por OA. La interfaz incluye los seis tipos
de desafío, diálogos, reflexión, recompensas, ajustes y guardado al inicio de
cada escena. El formato de contenido está en `SCHEMA.md`.

Para construir un capítulo con Python 3 y Pillow:

```sh
python3 build.py muestra.json muestra-img muestra.html
```

Si tu Python no tiene Pillow, usa el entorno disponible:

```sh
/tmp/claude-0/-root-apps/16c59e03-9029-41f5-bb9a-460bf85adb99/scratchpad/venv/bin/python build.py muestra.json muestra-img muestra.html
```

Abre `muestra.html` directamente. Para otro capítulo, cambia los tres argumentos:
el JSON, la carpeta de imágenes y el HTML de salida. No necesita servidor ni
scripts externos. Las imágenes quedan incrustadas como WebP de calidad 85;
los fondos llegan hasta 1280 px de ancho y los retratos hasta 480 px de alto.
Google Fonts es opcional: hay fuentes del sistema como alternativa.

`muestra.json` tiene dos escenas y ejercita todos los beats y desafíos. Es una
muestra ficticia del motor, no el contenido definitivo del capítulo. Las imágenes
son figuras de colores hechas con Pillow; `estela.png` copia `estela-ref.png`.
Puedes regenerar la muestra con `python3 generar-muestra.py`.

Verificación:

```sh
node test.js
node test-ui.js
python3 test-build.py
```

- `test.js`: ambos caminos, ramas anidadas, los seis desafíos y sus 18 variantes,
  pistas, fichas, adaptación, OA, reflexión y serialización completa o por escena.
- `test-ui.js`: prueba de interfaz con un DOM mínimo, sin dependencias: botones,
  teclado, reintentos, ajustes, reinicio, salto de escena, continuación y fallos
  de almacenamiento. No simula el diseño ni el comportamiento visual del navegador.
- `test-build.py`: ejecución del constructor, dimensiones WebP, transparencia,
  protección de archivos y texto que podría cerrar un `<script>`.

La partida guardada vuelve al **inicio de la escena actual**. Las respuestas
parciales de esa escena se vuelven a jugar. El nivel inicial de ajustes se aplica
al comenzar un viaje nuevo; durante el viaje cada asignatura se adapta por separado.

Verificación visual: DEGRADED
Motivo: Chromium no puede iniciarse en este sandbox; las operaciones de sockets
que necesita están bloqueadas. Falta revisar las capturas y el diseño en navegador
a 400 px, tablet y escritorio.
