# Chapter format (shared by the story engine and the chapter content)

A chapter is one JSON file. All player-facing text is in Spanish (Chile), addressed with "tú",
written for 10–11 year olds: short sentences, concrete, warm, no slang from other countries.

```jsonc
{
  "id": "cap1",
  "number": 1,
  "title": "Hacia lo desconocido",
  "year": "1492",
  "goals": ["Que la tripulación cruce el océano con agua y ánimo", "..."],   // story objectives shown in the HUD
  "characters": {                     // portrait = image key (see "Images"); color = name-tag colour
    "estela":   { "name": "Estela",   "portrait": "estela",   "color": "#7C5CFF" },
    "narrador": { "name": "",         "portrait": null }       // narration: no portrait, italic box
  },
  "scenes": [
    {
      "id": "s1",
      "title": "El puerto de Palos",
      "place": "Palos de la Frontera, Castilla",
      "date": "2 de agosto de 1492",
      "background": "bg_palos",        // image key; the engine falls back to a gradient if missing
      "perspective": "Tripulación",    // whose eyes: shown on the scene card
      "beats": [ /* Beat[] (below), played in order */ ]
    }
  ],
  "chronicle": { "title": "Así ocurrió", "paragraphs": ["...", "..."] },   // the real history, after the last scene
  "recap": [                          // "Lo que tú hiciste": lines shown when their condition holds
    { "if": { "flag": "carga", "eq": "agua" }, "text": "Llevaste barriles extra de agua: ..." }
  ],
  "reflection": {                     // Historia OA20–21: pick a solution and justify it; never "wrong"
    "oa": ["HI-OA20", "HI-OA21"],
    "prompt": "...",
    "options": [ { "id": "a", "text": "..." } ],
    "reasons": ["Porque ...", "Porque ...", "Porque ..."],   // the child picks one or writes their own
    "closing": "..."                  // Estela's line after answering
  },
  "rewards": { "piece": { "id": "engranaje_horizonte", "name": "El engranaje del horizonte", "text": "..." } }
}
```

## Beats

```jsonc
{ "type": "line", "who": "diego", "text": "...", "mood": "feliz" }   // mood optional: feliz|serio|sorpresa|preocupado
{ "type": "goal", "text": "..." }                                    // updates the current objective
{ "type": "perspective", "title": "Otra mirada", "text": "..." }      // full-screen card: the view switches sides
{ "type": "item", "id": "catalejo", "name": "Catalejo de grumete", "text": "..." }   // grants a cosmetic item
{ "type": "set", "flag": "confianza", "value": 1 }                   // set a flag without a choice
{ "type": "choice", "id": "d1", "prompt": "...",
  "options": [ { "text": "...", "set": { "carga": "agua" }, "then": [ /* Beat[] */ ] } ] }
{ "type": "if", "cond": { "flag": "carga", "eq": "herramientas" }, "then": [ /* Beat[] */ ], "else": [ /* Beat[] */ ] }
{ "type": "challenge", ... }   // see below
```

Conditions: `{ "flag": "x", "eq": value }` or `{ "flag": "x", "ne": value }` or `{ "flag": "x", "set": true }`.
Choices never change historical facts, only the player's own story (allies, extra lines, items).

## Challenges

```jsonc
{
  "type": "challenge",
  "id": "A",
  "subject": "matematica",            // matematica | lenguaje | ciencias | historia | ingles
  "oa": ["MA-OA4", "MA-OA6"],         // curriculum codes of 5° básico (subject prefix MA LE CN HI IN)
  "kind": "mc",                       // mc | numeric | match | order | grid | reading
  "intro": "...",                     // optional story line said before the task (by "who")
  "who": "diego",
  "variants": {                       // three levels, same story situation, rising difficulty
    "inicial":    { /* kind-specific */ },
    "intermedio": { /* kind-specific */ },
    "avanzado":   { /* kind-specific */ }
  },
  "hint": "...",                      // said by the pet if the first try fails
  "success": "...",                   // story line after solving (by "who")
  "tokens": 5
}
```

Kind-specific variant fields (every variant also has `"explain"`: the worked answer, shown after
two misses or after success, 1–3 sentences):

- `mc`:      `{ "prompt": "...", "options": ["...", "..."], "answer": 0 }`  (3–4 options, index of the right one)
- `numeric`: `{ "prompt": "...", "answer": 12, "unit": "días", "tolerance": 0 }`
- `match`:   `{ "prompt": "...", "pairs": [["timón", "pieza que mueve el rumbo"], ...] }`  (3–5 pairs; shown shuffled)
- `order`:   `{ "prompt": "...", "items": ["first", "second", "..."] }`  (correct order; shown shuffled; 3–5 items)
- `grid`:    `{ "prompt": "...", "size": [10, 8], "marks": [{ "at": [1, 2], "label": "Palos" }], "answer": [7, 3] }`
             (first-quadrant cartesian grid; the child taps the answer point; x right, y up, origin bottom-left)
- `reading`: `{ "passage": "...", "source": "Adaptado de ...", "questions": [ { "prompt": "...", "options": [...], "answer": 1, "explain": "..." } ] }`  (1–2 questions)

## Images (keys)

Backgrounds: `bg_palos`, `bg_canarias`, `bg_altamar`, `bg_noche`, `bg_playa`, `bg_academia`.
Portraits: `estela`, `diego`, `ines`, `nina_lucaya`, `colon`, `triana`, `mascota` (the player's pet, the fox for now).
