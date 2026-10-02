"""Stack extracted parts on the template in paint order."""
from PIL import Image

ORDER = ['bottom', 'top', 'shoes', 'face', 'hair']


def compose(template_path, parts):
    """parts: dict kind -> RGBA image path."""
    canvas = Image.open(template_path).convert('RGBA')
    for kind in ORDER:
        if kind in parts:
            canvas.alpha_composite(Image.open(parts[kind]).convert('RGBA'))
    return canvas
