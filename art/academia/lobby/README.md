# AcademIA · Academia jugable

Abre `academia.html` directamente o pega su contenido en un artefacto HTML. Todo el arte, el mapa y los desafíos están incluidos: el juego no necesita servidor ni `fetch`. La única carga externa opcional es Google Fonts; hay fuentes de sistema de respaldo.

## Archivos

- `academia.json`: salón de 60 × 9 CH, colisiones, capas, objetos, entidades, diálogos, compañeros, catálogo y textos.
- `plantilla.html`: motor, renderizador Canvas 2D y paneles. Los seis marcadores `__…_JSON__` se sustituyen al compilar.
- `build.py`: empaqueta las piezas del salón y los cuadros del niño y del zorro. Conserva el formato `SRC`, `KID_SPRITES` y `PET_SPRITES` de `ref/rig-build.py`: cuadros WebP q90 a mitad de tamaño, cuerpos sin cabeza, anclajes, pivotes, expresiones, máscaras de oclusión y mariquita.
- `test.js`: ejecuta el bloque `CORE_BEGIN` / `CORE_END` de la plantilla con Node, sin DOM ni dependencias npm.
- `test-ui.js`: comprueba el JavaScript compilado, temporizadores, objetivos, controles y redimensionado con un DOM/Canvas simulado, sin dependencias npm.
- `academia.html`: página compilada lista para compartir, menor de 12,5 MB.

El `StoryEngine` y las seis tarjetas de desafíos vienen de `ref/historia-plantilla.html`. `MapDialogue` conecta las secuencias del mapa con el mismo estado que usan tienda, banco, inventario y recompensas. La selección de cuadros, la capa de cabeza y las transiciones de reposo del niño, y los giros, descansos y poses del zorro, reutilizan `ref/rig-plantilla.html`. La física añade colisiones laterales y de techo, peldaños y descenso por plataformas.

## Compilar y probar

Desde esta carpeta:

```sh
/tmp/claude-0/-root-apps/16c59e03-9029-41f5-bb9a-460bf85adb99/scratchpad/venv/bin/python build.py academia.html
node test.js
node test-ui.js
```

`build.py <out.html>` también funciona desde otro directorio. Sus entradas de arte están en `/root/apps/academia/art/academia/piezas/` y `/root/apps/academia/art/incoming/cuadros/`. Incluye también `/root/apps/academia/art/academia/v2/piezas/` y `estela-cuadros/`. Usa Pillow y numpy del venv indicado en `TASK3.md`. La compilación falla si faltan marcadores, archivos o si la página alcanza 12.500.000 bytes.

## Jugar

- Flechas o A/D: caminar. Shift o doble toque de una dirección: correr.
- Espacio, W o ↑: saltar. Soltar antes reduce la altura. En el aire, saltar otra vez da un **doble salto** más bajo (1 CH) con una voltereta; uno por salto, y no después del súper salto. Correr durante dos segundos a velocidad completa carga el súper salto; una barra llena activa ese salto automáticamente.
- ↓ o S: bajar a través de una plataforma. Los pisos sólidos no se atraviesan.
- E o Enter: hablar, leer o usar el objeto cercano. El portal se usa únicamente con E / Enter o el botón táctil; pasar delante no abre nada.
- Esc o Q: cerrar una ventana. Tab navega sus controles; el foco vuelve al mapa al cerrar. En casillas y postales, flechas o WASD seleccionan; E / Enter activan.
- En pantallas táctiles hay botones de dirección, carrera, salto, descenso y acción. Se pueden activar también desde Ajustes.

El HUD, el mapa y la barra táctil ocupan filas separadas: los controles dejan libre el piso y la energía aparece como un pequeño tubo de bronce dentro del HUD. En vertical, la cámara muestra menos ancho y sigue al niño, cuya altura es aproximadamente un quinto del área de juego. Redimensionar, girar el dispositivo o activar controles táctiles vuelve a medir el espacio real del mapa.

La bienvenida se desvanece y desaparece en unos cinco segundos. Al hablar por primera vez con Estela, los objetivos se pliegan; «Objetivos» en el HUD abre el pergamino de tareas y permite mostrar u ocultar el objetivo en el mapa. El cartel de guía conserva su interacción y se dibuja como una tabla de madera con una estrella.

La primera visita comienza con 60 fichas. Hay **10 chispas en el mapa, una por leer y una por descubrir el telescopio**: 12 en total. Lectura y telescopio solo dan su chispa la primera vez. Las escaleras llegan a la galería desde ambos extremos. Para llegar al cofre alto, corre por la galería izquierda para cargar energía y salta desde su extremo derecho hacia la plataforma colgante alta (x 21,5–24, y 1,5: fuera del alcance del doble salto, que llega a 2,65 CH sobre la galería). Los cofres dan fichas y recuerdos una vez; no conceden piezas del Reloj.

El banco paga una vez por cada semana real completa, el 5% del saldo redondeado hacia abajo, con máximo 10 fichas por semana. El primer depósito en una cuenta vacía inicia una semana completa. Se calculan semanas pendientes al abrir el banco y al restaurar la partida. En modo prueba, «Avanzar una semana» mueve el último cálculo una semana hacia atrás y aplica las mismas reglas.

La práctica escoge tres desafíos distintos de `cap1.json` y paga exactamente 2 fichas por desafío finalizado, incluyendo los resueltos con explicación. Tras un error hay pista; tras el segundo se explica. La dificultad cambia por asignatura como en la historia original.

Los compañeros son simulados. Usan los cuadros del mismo niño, distintos peinados y colores, paseos y actividades de reposo; sus mensajes muestran nombre, piezas y un recuerdo. Los gestos usan frases predefinidas. El reposo sentado se representa con las actividades de lectura y descanso disponibles en los cuadros originales. El jardín hace que el zorro vaya, juegue boca arriba y regrese.

## Lobby v2: arquitectura y animación

El muro se dibuja en el mismo plano de mundo que el suelo, alternando piezas reflejadas. Su zócalo termina en y 7,3; las tablas llegan a y 7,95 y la línea de pies está en 7,8. El fondo se empaqueta con brillo 85 % y saturación 86 %. `atrio` se coloca una sola vez centrado detrás del portal en x 31.

Las galerías ocupan x 6,6–19,5 y 40,5–53,4, con pies en y 4,4, columnas y baranda dibujada **después** de personajes y objetos. Las escaleras usan 18 huellas medidas y un peldaño de entrada en cada lado; la tapa superior coincide con la galería. Las tres plataformas del atrio cuelgan de dos cadenas hasta el techo. Los cuatro compañeros tienen rutas limitadas a su nivel y ala. El minimapa representa ambos pisos.

`build.py` mide la última fila opaca de cada pieza y exporta `ART_META`; el renderizador compensa el padding y dibuja sombras de contacto. También normaliza el cofre cerrado 36 px hacia abajo para compartir la base del abierto. Las regiones de animación están en `academia.json → animations`, en píxeles de las fuentes originales. El build produce imágenes de diagnóstico y `measurements.json` en `shots3/`. Las partes que oscilan se separan al compilar; los engranajes usan pequeñas cachés recortadas y el vórtice usa una sola superficie reutilizada con una máscara extraída del portal.

Estela tiene 72 cuadros WebP de 320 × 454, calidad 74, a 12 fps, conservando la proporción y el anclaje de las botas; se omite el cuadro 72 que repite el inicio. Mercader y Tempo conservan su dibujo sin estiramientos. Los tonos violetas de las estaciones se remapean preservando luminosidad HSL, croma y alfa. Estela conserva su pelo y capa.

Al abrir un cofre, se concede y guarda el premio una sola vez. La secuencia bloquea controles, anticipa durante 0,5 s, abre la tapa con luz y chispas, eleva el objeto desde 1,05 s y muestra la banda a los 2,7 s. E / Enter o un toque permiten cerrar desde que aparece el objeto; la cámara vuelve gradualmente. El movimiento reducido cambia directamente al cofre abierto y la banda. La fanfarria usa cinco notas suaves y solo crea WebAudio después de la interacción. La mochila y el catálogo muestran los iconos reales.

La clave nueva `academia:map:v2` inicia una visita segura y conserva los guardados v1 bajo su clave anterior.

## Lobby v2.1: menús de juego

Todas las ventanas usan madera oscura, esquinas de bronce, cinta teal, pergamino y botones del kit, con Baloo 2 para títulos y Nunito para texto. La plantilla mantiene HTML/CSS/JS y el único loop Canvas; no añade paquetes. Las imágenes se obtienen de `SRC` y se asignan a propiedades CSS al iniciar. El marco original de 856 × 597 se empaqueta a 640 × 446; sus esquinas de unos 112 px se cortan a **84 px**, sin rellenar el centro. Los botones se cortan horizontalmente a 40 px y el pergamino a 24 px. Los iconos y objetos se limitan a 128 px, la postal de Palos a 640 × 400.

La tienda tiene retrato, frase propia por objeto, dos repisas con seis casillas, etiquetas de precio y ficha de compra. Una selección nueva muestra el detalle; otro toque o «Comprar» compra. Las fichas insuficientes desactivan el botón e indican la diferencia. Los objetos comprados muestran «En tu mochila». La venta a mitad de precio sigue disponible al seleccionar el objeto en la mochila. Banco, Reloj, Portal, Mochila, Gestos, Objetivos, Ajustes, libro, cielo y práctica comparten el marco; sus contenidos conservan estructuras propias.

Los diálogos, cartel, cofres, notas «Pronto» y jardín usan mensajes RPG al pie del área de juego, con retrato circular, cinta con el nombre y texto escrito rápidamente. La primera tecla o toque completa el texto y la siguiente avanza; Tab recorre controles y Esc/Q cierran. Las decisiones aparecen encima. El cofre bloqueado muestra doce chispas, encendidas según la partida. En teléfonos, el mensaje queda encima de la barra táctil; «Continuar» también avanza. Las ventanas completas ocultan esa barra.

Las ventanas usan un pop breve; al cerrar, una copia decorativa termina la salida mientras el foco vuelve al canvas de inmediato. La compra hace volar el icono hasta Mochila y baja el contador de la ventana; el banco hace viajar la moneda entre columnas. Los efectos limpian sus temporizadores y animaciones al cerrar o cambiar de vista. «Reducir movimiento» y la preferencia del sistema muestran todos los estados de inmediato. Los sonidos de selección, papel y monedas usan WebAudio a volumen bajo y respetan Ajustes.

Las reglas responsive incluyen ventanas de hasta 1100 px / 92vw y 86dvh; en teléfono vertical son hojas inferiores de ancho completo. Las repisas y la mochila pasan a dos columnas, los retratos se reducen y el contenido tiene scroll interno. Las postales conservan su carrusel horizontal. Los controles tienen objetivos táctiles de al menos 44 px y foco dorado. La rotación también cambia las columnas de navegación.

## Añadir un mapa

Las coordenadas usan **CH = altura del niño**, con origen arriba a la izquierda, x hacia la derecha e y hacia abajo. El motor convierte a 100 píxeles de mundo por CH; redimensionar la ventana solo cambia cámara y escala.

Un mapa mínimo:

```json
{
  "id": "palos", "title": "Puerto de Palos", "unit": "CH", "size": [24, 9],
  "backgrounds": [{"sprite":"muro","x":0,"y":0,"w":10.95,"h":7.3,"parallax":1,"repeat":true,"mirror":true}],
  "floors": [{"id":"palos-floor","x":0,"y":7.8,"w":24,"h":1.2,"sprite":"suelo","back":7.3,"front":7.95}],
  "platforms": [{"id":"palos-ledge","x":6,"y":6.3,"w":2,"h":0.3,"oneWay":true,"sprite":"colgante","support":"chains"}],
  "stairs": [], "props": [],
  "entities": [{"id":"palos-start","type":"spawn","x":2,"y":7.8}],
  "characters": {}, "dialogues": {}
}
```

Puedes reemplazar `academia.json` y recompilar, o cargar datos ya incluidos con `window.Academia.loadMap(datos, "id-del-spawn")`. Para enlaces entre mapas, añade un objeto `maps` al mapa principal, con cada mapa completo como valor, y una entidad `exit` con `map` igual a su clave y `spawn` opcional. No hace falta cargar archivos durante la partida. El motor conserva el estado compartido al cambiar de mapa.

Las superficies sólidas tienen `x,y,w,h` desde la esquina superior izquierda. Las plataformas con `oneWay:true` permiten subir desde abajo. Los peldaños (`stairs`) son de un solo sentido: se suben caminando desde el pie o cayendo encima, y desde el piso se pasa por delante de la escalera (su lado alto daba al salón y funcionaba como muro). Se describen como pequeños bloques de hasta 0,3 CH: la Academia usa alturas de aproximadamente 0,18 CH, medidas en el dibujo de la escalera. Los props tienen un anclaje inferior central `x,y`, tamaño `w,h`, `layer:"back"` o `"front"` y `flip` opcional.

Las entidades admiten `npc`, `station`, `portal`, `collectible`, `chest`, `secret`, `sign`, `spawn` y `exit`. Usa identificadores únicos entre mapas para las recompensas. Un NPC tiene `sprite`, `w,h`, `dialogue` (clave de `dialogues`) y `after` opcional para abrir un panel. Los secretos y cofres ocultos usan `revealRadius`. Un cofre admite `reward:{tokens,item}`, `requiresSparks` y `lock` opcional con un desafío en formato SCHEMA. Una chispa con `source` solo se entrega desde una interacción, en vez de por contacto.

Las secuencias de diálogo son listas de beats de `ref/SCHEMA.md`: `line`, `choice`, `set`, `if`, `goal`, `item`, `perspective` y `challenge`. Nuevas estaciones se conectan en `station()`; el catálogo y los diálogos de la Academia quedan en JSON. Para incorporar arte nuevo, añádelo al empaquetador `build.py`; el renderizador siempre usa claves de `SRC`.

## Estado y rendimiento

Una partida guarda flags, fichas, inventario, niveles por asignatura, resultados, decisiones, banco, chispas, secretos, cofres y posición en `academia:map:v2`. Los accesos a localStorage están protegidos con `try/catch`: si está bloqueado, la partida funciona en memoria. No se guardan pilas de diálogos a medias; al volver a hablar se inicia esa interacción. El enlace a la historia abre otro artefacto: este prototipo todavía no sincroniza partidas entre artefactos.

Hay un solo `requestAnimationFrame`, física con pasos de 1/60 s, DPR máximo 1,5 y recorte de objetos fuera de cámara. Las cachés LRU tienen presupuestos de **64 MiB para canvases recoloreados** y **24 MiB para datos de máscaras**; los canvases expulsados se liberan. Esto limita las cachés independientemente del tiempo de juego y del número de looks. Los efectos están limitados a 140 partículas. Se pausa el loop en pestañas ocultas. «Reducir movimiento» congela los efectos de las estaciones y Estela, elimina sacudidas, partículas y zoom de tesoros, y conserva las acciones del juego. Se respeta la preferencia del sistema y también se puede activar en Ajustes. El sonido de tesoros y menús comparte un interruptor persistente. Los controles táctiles también se guardan.

## Verificación

42 tests de Node pasan, incluidos el doble salto y llegar al pie de cada escalera desde el salón; incluidos ascenso y descenso de ambas escaleras, plataformas bajas alcanzables y el salto necesario para llegar al cofre alto, la cámara en vertical/horizontal y la persistencia del primer encuentro con Estela. `node test-ui.js` verifica además los tiempos de la bienvenida, la sustitución de un toast, el modo de movimiento reducido, el plegado y la reapertura de objetivos, la restauración de la partida, controles táctiles, rotación, súper salto y paneles sobre el HTML compilado. Añade cruces reales de `tick()` frente a todas las estaciones sin abrir paneles, apertura con eventos E / Enter, bloqueo y tiempos del tesoro, fanfarria, recompensas únicas, persistencia, modo reducido y rutas de compañeros. Las pruebas v2.1 añaden selección y compra de tienda, insuficiencia, sello de propiedad, venta, avance de mensajes, doce chispas, stepper del banco, postales, páginas, navegación y foco. El DOM/Canvas simulado no verifica estilos ni equivale a una revisión de navegador.

**Verificación visual: DEGRADED.** Se inspeccionaron los dos mockups y las piezas del kit. No se obtuvo una captura del juego en navegador. Chromium está instalado, pero este sandbox impide su arranque (`sandbox_host_linux.cc: shutdown: Operation not permitted`). Queda la revisión visual del artefacto en escritorio 1600 × 900, tablet táctil 1024 × 768 y teléfono 400 × 820, incluida su orientación horizontal, y la medición de 60 fps en esos dispositivos.

Referencias de APIs: [Canvas 2D: drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage), [WebAudio: OscillatorNode](https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode), [composición Canvas](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation), [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API), [viewport móvil](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport), [ResizeObserver](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver).

Referencias de menús: [border-image-slice](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/border-image-slice), [Element.animate](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate), [patrón de diálogo modal WAI](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
