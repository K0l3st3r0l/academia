"""Comprueba cap1.json contra SCHEMA.md y recorre todas sus decisiones."""
import json
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parent
chapter = json.loads((ROOT / "cap1.json").read_text(encoding="utf-8"))
curriculum = json.loads((ROOT / "curriculo-5b.json").read_text(encoding="utf-8"))
prefixes = dict(matematica="MA", lenguaje="LE", ciencias="CN", historia="HI", ingles="IN")
oas = {f"{prefixes[s['subject']]}-{oa['code']}" for s in curriculum["subjects"] for oa in s["oas"]}
levels = {"inicial", "intermedio", "avanzado"}
portraits = {"estela", "diego", "ines", "nina_lucaya", "colon", "triana", "mascota", None}
backgrounds = {"bg_palos", "bg_canarias", "bg_altamar", "bg_noche", "bg_playa", "bg_academia"}
assert sha256((ROOT / "SCHEMA.md").read_bytes()).hexdigest() == "10837ca3a2c3a2e014c91e9cb748f104cb0cf390da79e9a2f8f6621501a1c251", "SCHEMA.md debe conservarse exactamente."


def short_prompt(prompt, level):
    assert isinstance(prompt, str) and prompt.strip()
    limit = {"inicial": 35, "intermedio": 40, "avanzado": 45}[level]
    assert len(prompt.split()) <= limit, f"Consigna larga ({level}): {prompt}"
    assert prompt.count("?") == prompt.count("¿") <= 1, f"Más de una pregunta: {prompt}"


def keys(value, required, optional=""):
    assert isinstance(value, dict), value
    assert set(required.split()) <= value.keys() <= set((required + " " + optional).split()), value


def multiple_choice(value):
    keys(value, "prompt options answer explain")
    assert 3 <= len(value["options"]) <= 4
    assert all(isinstance(o, str) and o.strip() for o in value["options"])
    assert len(set(value["options"])) == len(value["options"])
    assert type(value["answer"]) is int and 0 <= value["answer"] < len(value["options"])


def point(at, size):
    assert len(at) == 2 and all(type(n) is int and 0 <= n <= bound for n, bound in zip(at, size))


def walk(beats):
    for beat in beats:
        yield beat
        if beat["type"] == "if":
            yield from walk(beat["then"])
            yield from walk(beat.get("else", []))
        elif beat["type"] == "choice":
            for option in beat["options"]:
                yield from walk(option["then"])


keys(chapter, "id number title year goals characters scenes chronicle recap reflection rewards")
assert (chapter["id"], chapter["number"], chapter["year"]) == ("cap1", 1, "1492")
assert chapter["goals"] and len(chapter["scenes"]) == 6
for character in chapter["characters"].values():
    keys(character, "name portrait", "color")
    assert character["portrait"] in portraits
for scene in chapter["scenes"]:
    keys(scene, "id title place date background perspective beats")
    assert scene["background"] in backgrounds and isinstance(scene["beats"], list)
assert [s["id"] for s in chapter["scenes"]] == [f"s{i}" for i in range(1, 7)]
sequence = [b for s in chapter["scenes"] for b in s["beats"]]
beats = list(walk(sequence))
assert 70 <= len(beats) <= 110
definitions, conditions, challenges = {}, [], {}
fields = {"line": ("type who text", "mood"), "goal": ("type text", ""),
          "perspective": ("type title text", ""), "item": ("type id name text", ""),
          "set": ("type flag value", ""), "choice": ("type id prompt options", ""),
          "if": ("type cond then", "else"),
          "challenge": ("type id subject oa kind who variants hint success tokens", "intro")}
for b in beats:
    assert b["type"] in fields
    keys(b, *fields[b["type"]])
    if "who" in b:
        assert b["who"] in chapter["characters"] and b["who"] != "jugador"
    if "mood" in b:
        assert b["mood"] in {"feliz", "serio", "sorpresa", "preocupado"}
    if b["type"] == "line":
        assert isinstance(b["text"], str) and 0 < len(b["text"].split()) <= 25, b["text"]
    if b["type"] == "if":
        conditions.append(b["cond"])
    if b["type"] == "set":
        definitions.setdefault(b["flag"], []).append(b["value"])
    if b["type"] == "choice":
        assert 3 <= len(b["options"]) <= 4
        for option in b["options"]:
            keys(option, "text set then")
            for flag, value in option["set"].items():
                definitions.setdefault(flag, []).append(value)
    if b["type"] != "challenge":
        continue
    assert b["id"] not in challenges
    challenges[b["id"]] = b
    assert b["subject"] in prefixes and b["oa"] and set(b["oa"]) <= oas
    assert all(oa.startswith(prefixes[b["subject"]] + "-") for oa in b["oa"])
    assert set(b["variants"]) == levels and type(b["tokens"]) is int and b["tokens"] >= 0
    for level, v in b["variants"].items():
        kind = b["kind"]
        if kind != "reading":
            short_prompt(v["prompt"], level)
        if kind == "mc":
            multiple_choice(v)
        elif kind == "numeric":
            keys(v, "prompt answer unit tolerance explain")
            assert type(v["answer"]) in (int, float) and v["tolerance"] >= 0
        elif kind == "match":
            keys(v, "prompt pairs explain")
            assert 3 <= len(v["pairs"]) <= 5 and all(len(pair) == 2 for pair in v["pairs"])
            assert len({p[0] for p in v["pairs"]}) == len(v["pairs"])
            assert len({p[1] for p in v["pairs"]}) == len(v["pairs"])
        elif kind == "grid":
            keys(v, "prompt size marks answer explain")
            assert len(v["size"]) == 2 and all(type(n) is int and n > 0 for n in v["size"])
            point(v["answer"], v["size"])
            for mark in v["marks"]:
                keys(mark, "at label")
                point(mark["at"], v["size"])
        elif kind == "reading":
            keys(v, "passage source questions explain")
            assert v["source"].startswith("Adaptado de") and 1 <= len(v["questions"]) <= 2
            for question in v["questions"]:
                multiple_choice(question)
                short_prompt(question["prompt"], level)
        else:
            assert kind == "order"
            keys(v, "prompt items explain")
            assert 3 <= len(v["items"]) <= 5
        assert isinstance(v["explain"], str) and v["explain"].strip()
assert 9 <= len(challenges) <= 10
assert list(challenges) == list("JABCDEFGHI")
assert {id: b["kind"] for id, b in challenges.items()} == {
    "A": "numeric", "B": "match", "C": "grid", "D": "numeric", "E": "mc",
    "F": "mc", "G": "reading", "H": "match", "I": "numeric", "J": "mc"
}
history = [b for b in challenges.values() if b["subject"] == "historia"]
assert len(history) >= 2 and all("HI-OA1" in b["oa"] for b in history)
keys(chapter["chronicle"], "title paragraphs")
assert chapter["chronicle"]["title"] == "Así ocurrió" and chapter["chronicle"]["paragraphs"]
for recap in chapter["recap"]:
    keys(recap, "if text")
    conditions.append(recap["if"])
for cond in conditions:
    assert set(cond) in ({"flag", "eq"}, {"flag", "ne"}, {"flag", "set"})
    assert cond["flag"] in definitions
    assert "set" not in cond or cond["set"] is True
    assert "eq" not in cond or cond["eq"] in definitions[cond["flag"]]
keys(chapter["reflection"], "oa prompt options reasons closing")
assert chapter["reflection"]["oa"] == ["HI-OA20", "HI-OA21"]
for option in chapter["reflection"]["options"]:
    keys(option, "id text")
assert len(chapter["reflection"]["reasons"]) >= 3
keys(chapter["rewards"], "piece")
keys(chapter["rewards"]["piece"], "id name text")
assert chapter["rewards"]["piece"]["id"] == "engranaje_horizonte"


def holds(cond, flags):
    if "set" in cond:
        return cond["flag"] in flags
    assert cond["flag"] in flags, f"Condición anterior a la definición: {cond}"
    return flags[cond["flag"]] == cond["eq"] if "eq" in cond else flags[cond["flag"]] != cond["ne"]


def routes(sequence, states):
    for b in sequence:
        following = []
        for flags, decisions, items, count, visited in states:
            state = (flags, decisions, items, count + 1, visited)
            if b["type"] == "choice":
                assert b["id"] not in decisions
                for option in b["options"]:
                    following += routes(option["then"], [(flags | option["set"], decisions + [b["id"]], items, count + 1, visited)])
            elif b["type"] == "if":
                branch = b["then"] if holds(b["cond"], flags) else b.get("else", [])
                following += routes(branch, [state])
            elif b["type"] == "set":
                following.append((flags | {b["flag"]: b["value"]}, decisions, items, count + 1, visited))
            elif b["type"] == "item":
                following.append((flags, decisions, items + [b["id"]], count + 1, visited))
            elif b["type"] == "challenge":
                following.append((flags, decisions, items, count + 1, visited + [b["id"]]))
            else:
                following.append(state)
        states = following
    return states


paths = routes(sequence, [({}, [], [], 0, [])])
assert len(paths) == 30  # d3 existe en dos ramas excluyentes: cada recorrido ve una sola.
cosmetics = dict(gestos="collar_conchas", dibujos="catalejo_grumete", comida="panuelo_mascota", regalos="broche_cascabel")
for flags, decisions, items, count, visited in paths:
    assert decisions == ["d1", "d2", "d3"] and 70 <= count <= 110
    assert visited == list(challenges), "Cada recorrido debe incluir todos los desafíos una sola vez."
    assert flags["encuentro"] != "regalos" or flags["carga"] == "regalos"
    assert cosmetics[flags["encuentro"]] in items
    assert ("distintivo_carpinteria" in items) == (flags["carga"] == "herramientas")
    assert len(items) == len(set(items))
    assert sum(holds(r["if"], flags) for r in chapter["recap"]) == 3
answers = {"A": (101 // 9, 128 // 9, (248 - 2 * 13) // 9),
           "D": (144 - 117, (132 + 145) - (120 + 130), 3 * 48 + 2 * 36 - 5 * 30),
           "I": (12 // 3 * 2, 24 // 3 * 2, (36 - 6) // 3 * 2)}
for id, expected in answers.items():
    assert tuple(challenges[id]["variants"][level]["answer"] for level in ("inicial", "intermedio", "avanzado")) == expected
for level, expected in zip(("inicial", "intermedio", "avanzado"), ((6 - 2, 2), (8 - 5, 3 + 2), (10 - 4 - 2, 2 + 3 + 2))):
    assert challenges["C"]["variants"][level]["answer"] == list(expected)
prompts = [q["prompt"] for b in challenges.values() for v in b["variants"].values()
           for q in (v["questions"] if b["kind"] == "reading" else [v])]
print(f"OK: {len(beats)} beats; 6 escenas; {len(challenges)} desafíos y {len(challenges) * 3} variantes; {len(history)} desafíos de historia; 3 decisiones por recorrido; {len(paths)} recorridos.")
print(f"Beats por recorrido: {min(p[3] for p in paths)}–{max(p[3] for p in paths)}. Cálculos, recompensas y condiciones verificados.")
print(f"Lectura: {len(prompts)} consignas breves, una pregunta como máximo; diálogos de hasta 25 palabras. SCHEMA.md sin cambios.")
