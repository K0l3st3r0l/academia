#!/usr/bin/env python3
"""Build a self-contained AcademIA chapter (Python 3 + Pillow)."""
import argparse
import base64
import io
import json
from pathlib import Path
import sys

from PIL import Image, ImageOps


def script_json(value):
    # JSON lives inside a script element; chapter text must never close that element.
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"))
            .replace("&", "\\u0026").replace("<", "\\u003c")
            .replace(">", "\\u003e").replace("\u2028", "\\u2028")
            .replace("\u2029", "\\u2029"))


def encode_images(directory):
    images = {}
    for path in sorted(directory.iterdir()):
        if not path.is_file() or path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        key = path.stem
        if key in images:
            raise ValueError(f"Clave de imagen duplicada: {key}")
        with Image.open(path) as source:
            image = ImageOps.exif_transpose(source)
            image = image.convert("RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB")
            if key.startswith("bg_"):
                ratio = min(1, 1280 / image.width)
            else:
                ratio = min(1, 480 / image.height)
            if ratio < 1:
                image = image.resize((max(1, round(image.width * ratio)), max(1, round(image.height * ratio))), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            image.save(buffer, "WEBP", quality=85)
            images[key] = "data:image/webp;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    return images


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("chapter", type=Path)
    parser.add_argument("images_dir", type=Path)
    parser.add_argument("out", type=Path)
    args = parser.parse_args()
    try:
        chapter = json.loads(args.chapter.read_text(encoding="utf-8"))
        if not isinstance(chapter, dict) or not chapter.get("id") or not isinstance(chapter.get("scenes"), list) or not chapter["scenes"]:
            raise ValueError("El capítulo necesita id y al menos una escena.")
        if not args.images_dir.is_dir():
            raise ValueError(f"No existe la carpeta de imágenes: {args.images_dir}")
        template_path = Path(__file__).with_name("plantilla.html")
        template = template_path.read_text(encoding="utf-8")
        for marker in ("__CHAPTER__", "__IMAGES__"):
            if template.count(marker) != 1:
                raise ValueError(f"La plantilla debe tener exactamente un marcador {marker}.")
        if args.out.resolve() in {template_path.resolve(), args.chapter.resolve()}:
            raise ValueError("La salida no puede sobrescribir la plantilla ni el capítulo.")
        images = encode_images(args.images_dir)
        # One pass: a literal placeholder in authored text must not be replaced again.
        import re
        payloads = {"__CHAPTER__": script_json(chapter), "__IMAGES__": script_json(images)}
        rendered = re.sub(r"__CHAPTER__|__IMAGES__", lambda match: payloads[match[0]], template)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(rendered, encoding="utf-8")
        print(f"Creado {args.out}: {len(chapter['scenes'])} escenas, {len(images)} imágenes, {len(rendered.encode('utf-8')):,} bytes.")
    except (OSError, ValueError) as error:
        print(f"No se pudo construir el capítulo: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
