"""Prompts for the Islands of challenges of 5° (art/prompts.md §2), one per island.

Usage: python3 islas_5b.py              (writes art/mapa/<image>.txt for every island below)
       python3 islas_5b.py layout [image ...]   (adds the drawn islands to shared/world/5b.json)

Each subject crosses Chile from north to south. Matemática was written by hand (u1–u4).
Lenguaje and Inglés go by eje, at most 8 levels per island (2026-10-12); Historia keeps each
OA in the first unit where it appears, so no level repeats.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
NUMBERS = {3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight'}

# (image, number of levels, landscape, landmark on top)
ISLANDS = [
    ('ciencias-5b-u1', 3, "the El Tatio geysers in Chile's high Andes: steaming geyser vents and bubbling hot pools with mineral crusts in white, orange and turquoise, a frosty plain, snowy volcanoes behind, a few vicunas", 'a small wooden viewing deck with a railing over the biggest geyser'),
    ('ciencias-5b-u2', 4, "the sclerophyll forest of central Chile: groves of tall Chilean wine palms, quillay and peumo trees, dry golden hills, wildflowers and a small stream", 'a small rustic wooden ranger hut with a green roof'),
    ('ciencias-5b-u3', 3, "the Valdivian temperate rainforest of southern Chile: giant ancient alerce trees, ferns, moss, red copihue flowers hanging from the trees, a small waterfall and a shy pudu deer", 'a small wooden forest station with a round window'),
    ('ciencias-5b-u4', 4, "the Chilean Antarctic: snow and ice, blue icebergs, a colony of gentoo penguins, a couple of seals, wind turbines and solar panels", 'a small red scientific base with an antenna and a weather station'),
    ('historia-5b-u1', 6, "the Atacama pampa and the old Humberstone saltpeter works: ochre desert ground, rusty iron sheds, a tall chimney, a small rail wagon on narrow tracks, distant mountains", 'a small old wooden clock tower from the saltpeter town'),
    ('historia-5b-u2', 4, "Santiago's Santa Lucía hill in colonial times: a green rocky hill with stone stairways and terraces, native trees, the snowy Andes behind and a small river at its foot", 'a small stone fort terrace with a flagless flagpole and a little bell'),
    ('historia-5b-u3', 5, "the Spanish colonial forts of Valdivia on the river mouth in southern Chile: stone fort walls with old bronze cannons, a calm river meeting the sea, green forested hills and a small wooden boat", 'a small stone fort tower with a lookout'),
    ('historia-5b-u4', 7, "Valparaíso's hills: colorful wooden houses stacked on steep hills, funicular elevators climbing the slopes, stairways painted in bright colors, the Pacific bay with small boats", 'a small elegant building with columns and a dome, like the National Congress in Valparaíso'),
    ('lenguaje-5b-lectura-1', 6, "the flowering desert of northern Chile: a dry desert carpeted with purple, pink and yellow wildflowers after a rare rain, cacti and soft sandy dunes", 'a small reading pavilion with a striped awning and open books on a table'),
    ('lenguaje-5b-lectura-2', 6, "La Serena on the coast of northern Chile: a long sandy beach, gentle waves, palm trees along a promenade and colonial white houses", 'a white and red striped lighthouse'),
    ('lenguaje-5b-escritura-1', 5, "the rocky Pacific coast of Isla Negra in central Chile: dark rocks, crashing white waves, a small sandy cove, coastal pines and seashells", 'a small stone seaside house with a ship anchor and a bell at its door'),
    ('lenguaje-5b-escritura-2', 5, "the island of Chiloé in southern Chile: colorful wooden stilt houses over the water, a wooden church covered with shingles, small fishing boats, green rolling hills and drizzle clouds", 'a small wooden Chilote church with a shingled tower'),
    ('lenguaje-5b-oral', 8, "Caleta Tortel in Chilean Patagonia: cypress wooden boardwalks and stairways over a turquoise fjord, small wooden houses on stilts, evergreen forest and misty mountains", 'a small wooden town square with a covered gazebo'),
    ('ingles-5b-auditiva', 4, "Rapa Nui, Easter Island: green grassy volcanic slopes, a white sand beach with coconut palms, turquoise sea and a row of moai statues standing on a stone platform", 'a small wooden lookout with a thatched roof facing the moai'),
    ('ingles-5b-lectura', 5, "the Juan Fernández archipelago: steep green volcanic peaks, a deep blue bay with a small wooden fishing boat and lobster traps, red hummingbirds among the flowers", 'a small cave entrance with a wooden sign post and a hanging lantern, like Robinson Crusoe\'s cave'),
    ('ingles-5b-oral', 4, "Puerto Montt and the Angelmó market in southern Chile: a busy wooden market with colorful stalls of fish, shellfish and woolen crafts, small boats at a pier, seagulls and a calm sound", 'a small wooden market hall with a red roof and a bell'),
    ('ingles-5b-escrita', 3, "Cape Horn at the southern tip of Chile: windswept green cliffs, dark stormy sea, an albatross gliding over the waves", 'a small lighthouse with a red roof and a wind vane'),
]
LAST = {'ciencias-5b-u4', 'historia-5b-u4', 'lenguaje-5b-oral', 'ingles-5b-escrita'}

# image -> (subject, label shown instead of «Unidad N» or None, island name, challenge name, which OAs)
# Which OAs: ('unit', n) takes the unit's OAs not used by an earlier island of the subject;
# ('eje', name, first, last) a slice of the eje, in curriculum order.
META = {
    'ciencias-5b-u1': ('ciencias', None, 'Isla de los Géiseres', 'Desafío de los Géiseres', ('unit', 1)),
    'ciencias-5b-u2': ('ciencias', None, 'Isla de las Palmas', 'Desafío del Bosque', ('unit', 2)),
    'ciencias-5b-u3': ('ciencias', None, 'Isla de los Alerces', 'Desafío de la Selva', ('unit', 3)),
    'ciencias-5b-u4': ('ciencias', None, 'Isla Antártica', 'Desafío de la Base', ('unit', 4)),
    'historia-5b-u1': ('historia', None, 'Isla de la Pampa', 'Desafío de la Oficina Salitrera', ('unit', 1)),
    'historia-5b-u2': ('historia', None, 'Isla del Cerro Santa Lucía', 'Desafío del Cerro', ('unit', 2)),
    'historia-5b-u3': ('historia', None, 'Isla de los Fuertes', 'Desafío del Fuerte', ('unit', 3)),
    'historia-5b-u4': ('historia', None, 'Isla de Valparaíso', 'Desafío del Congreso', ('unit', 4)),
    'lenguaje-5b-lectura-1': ('lenguaje', 'Lectura I', 'Isla del Desierto Florido', 'Desafío del Desierto', ('eje', 'Lectura', 0, 6)),
    'lenguaje-5b-lectura-2': ('lenguaje', 'Lectura II', 'Isla del Faro', 'Desafío del Faro', ('eje', 'Lectura', 6, 12)),
    'lenguaje-5b-escritura-1': ('lenguaje', 'Escritura I', 'Isla Negra', 'Desafío de la Casa de Piedra', ('eje', 'Escritura', 0, 5)),
    'lenguaje-5b-escritura-2': ('lenguaje', 'Escritura II', 'Isla de Chiloé', 'Desafío de la Iglesia', ('eje', 'Escritura', 5, 10)),
    'lenguaje-5b-oral': ('lenguaje', 'Comunicación oral', 'Isla de las Pasarelas', 'Desafío de Tortel', ('eje', 'Comunicación oral', 0, 8)),
    'ingles-5b-auditiva': ('ingles', 'Comprensión auditiva', 'Isla de Rapa Nui', 'Desafío de los Moái', ('eje', 'Comprensión auditiva', 0, 8)),
    'ingles-5b-lectura': ('ingles', 'Comprensión de lectura', 'Isla Robinson Crusoe', 'Desafío de la Cueva', ('eje', 'Comprensión de lectura', 0, 8)),
    'ingles-5b-oral': ('ingles', 'Expresión oral', 'Isla de Angelmó', 'Desafío del Mercado', ('eje', 'Expresión oral', 0, 8)),
    'ingles-5b-escrita': ('ingles', 'Expresión escrita', 'Isla del Cabo de Hornos', 'Desafío del Faro del Fin del Mundo', ('eje', 'Expresión escrita', 0, 8)),
}


def prompt(image, n, landscape, landmark):
    style = (HERE / 'matematica-5b-u1.txt').read_text().splitlines()[0]
    top = ('This is the last island: above it there is only open blue sky, with no bridge.' if image in LAST else
           'From the plaza a rope bridge rises out of the top edge of the frame toward a second island whose '
           'underside is barely visible, half hidden in clouds.')
    return (f"{style}\n"
            'Match exactly the art style, camera angle, island scale, outline weight and lighting of the attached '
            'reference island. Portrait game level map for a phone screen. A single floating island diorama hovering '
            'over a soft sea of clouds, seen from a high three-quarter angle, chunky and toy-like, like a tiny '
            f'handcrafted world. The island is inspired by {landscape}, with rock layers and a few glowing crystals '
            f'visible on its sides, and on its highest point {landmark}. A sandy path winds across the island from a '
            f'wooden dock at the bottom up to the landmark; along it, exactly {NUMBERS[n]} empty round stone pads '
            '(no more, no fewer), evenly spaced, plain and unmarked, the same light beige-grey stone as the reference, '
            f'and a bigger round plaza in front of the landmark for the final challenge. {top} Bright, saturated, '
            'cheerful, readable at small size. No characters, no text, no numbers.\n')


def levels(oas, which, used):
    if which[0] == 'unit':
        codes = [o['code'] for o in oas if which[1] in (o.get('units') or []) and o['code'] not in used]
    else:
        _, eje, first, last = which
        codes = [o['code'] for o in oas if o['eje'] == eje][first:last]
    used.update(codes)
    return codes


def layout(images):
    """Adds (or refreshes) each drawn island in shared/world/5b.json, with its dock and crystals
    found by art/pipeline/muelle.py; build_world.py then places the levels."""
    import json
    import sys
    import numpy as np
    from PIL import Image
    root = HERE.parents[1]
    sys.path.insert(0, str(root / 'art/pipeline'))
    from build_world import estimate_pad_color, find_pads
    from muelle import dock, sparkles
    from quitar_disco import cover_pad
    curriculum = {s['subject']: s['oas'] for s in json.loads((root / 'shared/curriculum/5b.json').read_text())['subjects']}
    path = root / 'shared/world/5b.json'
    world = json.loads(path.read_text())
    used = {}
    for image, n, *_ in ISLANDS:
        subject, label, name, boss, which = META[image]
        codes = levels(curriculum[subject], which, used.setdefault(subject, set()))
        assert len(codes) == n, (image, codes)
        if image not in images:
            continue
        maps = world['maps']
        world_map = next((m for m in maps if m['subject'] == subject), None)
        if world_map is None:
            world_map = {'subject': subject, 'islands': []}
            if label:
                world_map['by'] = 'eje'
            maps.append(world_map)
        islands = world_map['islands']
        old = next((i for i in islands if i['image'] == image), None)
        # Its place on the subject's route, so an island drawn late still stacks where it belongs.
        unit = [i[0] for i in ISLANDS if META[i[0]][0] == subject].index(image) + 1
        src = root / 'art/incoming/mundo' / f'{image}.png'
        rgb = np.asarray(Image.open(src).convert('RGB')).astype(int)
        pad = (old or {}).get('pad') or estimate_pad_color(rgb.astype(float))
        pads = find_pads(rgb.astype(float), pad)
        if len(pads) < n + 1:
            print(f'{image}: {len(pads)} discos para {n} niveles + plaza: hay que regenerarla')
            continue
        # The model often draws a pad or two too many: cover the ones nearest the dock.
        for x, y in pads[:len(pads) - n - 1]:
            cover_pad(src, x, y, pad)
        if len(pads) > n + 1:
            rgb = np.asarray(Image.open(src).convert('RGB')).astype(int)
            pads = find_pads(rgb.astype(float), pad)
        polygon, entry = dock(rgb, pads[0])
        island = {'unit': unit, **({'label': label} if label else {}), 'name': name, 'image': image,
                  'width': rgb.shape[1], 'height': rgb.shape[0], 'pad': pad,
                  'levels': codes, 'boss': {'name': boss}, 'entry': entry, 'dock': polygon,
                  'sparkles': sparkles(rgb)}
        # Hand corrections of an island already in the layout win over the detection.
        for key in ('entry', 'dock', 'sparkles'):
            if old and old.get(f'{key}_manual'):
                island[key] = old[key]
                island[f'{key}_manual'] = True
        if old:
            islands[islands.index(old)] = island
        else:
            islands.append(island)
        islands.sort(key=lambda i: i['unit'])
        print(f'{image}: unidad {unit}, {len(codes)} niveles, {len(pads)} discos detectados')
    path.write_text(json.dumps(world, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    import sys
    if sys.argv[1:2] == ['layout']:
        layout(set(sys.argv[2:]) or {i[0] for i in ISLANDS})
    else:
        for island in ISLANDS:
            (HERE / f'{island[0]}.txt').write_text(prompt(*island))
        print(f'{len(ISLANDS)} prompts')
