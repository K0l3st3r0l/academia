"""Write shared/character-catalog.json (v3) from the parts that have web assets.

Prices follow the rule decided on 2026-10-02: what is identity or accessibility (skin,
hair type, facial features) is always free; only fashion (fantasy hair colors, extra
clothing colors, clothes and accessories) costs tokens.

Usage: build_catalog.py   (after build_assets.py)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARTS = json.loads((ROOT / 'frontend/public/character/parts.json').read_text())['layers']
MANIFEST = json.loads((Path(__file__).parent / 'manifest.json').read_text())

SKIN = ['#FDE3CC', '#F6D0B1', '#EFBE97', '#F49C62', '#D19A6A', '#BF8456', '#A96D44', '#8D5634', '#6E4126', '#4A2A18']
HAIR = [('Negro', '#1E1410', False), ('Castaño oscuro', '#3B2416', False), ('Castaño', '#5C2B1B', False),
        ('Castaño claro', '#8A5A2B', False), ('Colorín', '#B8592A', False), ('Rubio', '#E6BE64', False),
        ('Morado', '#7844E0', True), ('Azul', '#3B82F6', True), ('Rosado', '#EC4899', True),
        ('Turquesa', '#28A096', True), ('Verde', '#22C55E', True), ('Plateado', '#B8C2CC', True)]
EYES = [('Café oscuro', '#3B2416'), ('Café', '#663A22'), ('Avellana', '#8A6A2E'), ('Verde', '#3F6B3A'),
        ('Azul', '#2F5F9E'), ('Gris', '#5B6770')]
CLOTH = [('Blanco', '#FFFFFF', 0), ('Morado', '#6C3CE1', 0), ('Turquesa', '#14B8A6', 0), ('Azul', '#3B82F6', 0),
         ('Amarillo', '#F5C842', 30), ('Coral', '#F87171', 30), ('Verde', '#22C55E', 30), ('Negro', '#1F2937', 30)]
FANTASY_HAIR_PRICE = 40
BY_ID = {p['id']: p for p in MANIFEST['parts']}
NONE = {'id': 'ninguno', 'name': 'Ninguno'}


def parts_of(*kinds, with_none=False):
    out = [NONE] if with_none else []
    for pid, layer in PARTS.items():
        if layer['kind'] not in kinds:
            continue
        part = BY_ID.get(pid, {})
        item = {'id': pid, 'name': part.get('label', pid)}
        if part.get('price'):
            item['price'] = part['price']
        if layer['kind'] == 'dress':
            item['coversBottom'] = True
        out.append(item)
    return out


def colors(prefix, entries):
    out = []
    for i, (name, hexcode, *rest) in enumerate(entries, 1):
        item = {'id': f'{prefix}-{i}', 'name': name, 'hex': hexcode}
        price = rest[0] if rest and isinstance(rest[0], int) else 0
        if price:
            item['price'] = price
        out.append(item)
    return out


def main():
    hair_colors = []
    for i, (name, hexcode, fantasy) in enumerate(HAIR, 1):
        item = {'id': f'pelo-color-{i}', 'name': name, 'hex': hexcode}
        if fantasy:
            item.update(fantasy=True, price=FANTASY_HAIR_PRICE)
        hair_colors.append(item)

    catalog = {
        'version': 3,
        'renameCost': 100,
        # Eyebrows follow a natural hair color; with a fantasy color they stay natural brown.
        'fantasyBrowHex': '#3B2416',
        'skinTones': [{'id': f'piel-{i}', 'hex': h} for i, h in enumerate(SKIN, 1)],
        'hairStyles': parts_of('hair'),
        'hairColors': hair_colors,
        'eyes': parts_of('eyes'),
        'eyeColors': colors('ojos-color', EYES),
        'brows': parts_of('brows'),
        'noses': parts_of('nose'),
        'mouths': parts_of('mouth'),
        'tops': parts_of('top', 'dress'),
        'topColors': colors('arriba-color', CLOTH),
        'bottoms': parts_of('bottom'),
        'bottomColors': colors('abajo-color', CLOTH),
        'shoes': parts_of('shoes'),
        'shoeColors': colors('calzado-color', CLOTH),
        # One optional accessory per slot; 'ninguno' is the empty choice.
        'headwear': parts_of('headwear', with_none=True),
        'eyewear': parts_of('eyewear', with_none=True),
        'neckwear': parts_of('neckwear', with_none=True),
        'backwear': parts_of('backwear', with_none=True),
        'earwear': parts_of('earwear', with_none=True),
    }
    path = ROOT / 'shared/character-catalog.json'
    path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    counts = {k: len(v) for k, v in catalog.items() if isinstance(v, list)}
    print(counts)


if __name__ == '__main__':
    main()
