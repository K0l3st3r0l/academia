// characters.layers stores catalog ids; the renderer needs part ids and hex colors.

const hexOf = (list, id) => list.find(e => e.id === id)?.hex;

export function layersToLook(layers, catalog) {
  if (!layers || !catalog) return null;
  const hairColor = catalog.hairColors.find(c => c.id === layers.hairColor);
  return {
    skinColor: hexOf(catalog.skinTones, layers.skinTone),
    hair: layers.hairStyle,
    hairColor: hairColor?.hex,
    browColor: hairColor?.fantasy ? catalog.fantasyBrowHex : hairColor?.hex,
    eyes: layers.eyes,
    eyeColor: hexOf(catalog.eyeColors, layers.eyeColor),
    brows: layers.brows,
    nose: layers.nose,
    mouth: layers.mouth,
    top: layers.top,
    topColor: hexOf(catalog.topColors, layers.topColor),
    bottom: layers.bottom,
    bottomColor: hexOf(catalog.bottomColors, layers.bottomColor),
    shoes: layers.shoes,
    shoeColor: hexOf(catalog.shoeColors, layers.shoeColor),
  };
}

// A new character starts from free options only, with a little variety so a class
// doesn't begin as thirty identical kids.
export function defaultLayers(catalog) {
  const free = list => list.filter(e => !e.price);
  const pick = list => free(list)[Math.floor(Math.random() * free(list).length)].id;
  const first = list => free(list)[0].id;
  return {
    skinTone: pick(catalog.skinTones),
    hairStyle: pick(catalog.hairStyles),
    hairColor: pick(catalog.hairColors),
    eyes: first(catalog.eyes),
    eyeColor: pick(catalog.eyeColors),
    brows: first(catalog.brows),
    nose: first(catalog.noses),
    mouth: first(catalog.mouths),
    top: first(catalog.tops),
    topColor: pick(catalog.topColors),
    bottom: first(catalog.bottoms),
    bottomColor: pick(catalog.bottomColors),
    shoes: first(catalog.shoes),
    shoeColor: pick(catalog.shoeColors),
  };
}
