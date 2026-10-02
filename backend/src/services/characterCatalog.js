const fs = require('fs');
const path = require('path');

// Dos layouts posibles según dónde corre: local (backend/src/services -> ../../../shared)
// o Docker (WORKDIR /app, shared montado como volumen en /app/shared -> ../../shared).
const CANDIDATE_PATHS = [
  path.join(__dirname, '../../../shared/character-catalog.json'),
  path.join(__dirname, '../../shared/character-catalog.json'),
];

const catalogPath = CANDIDATE_PATHS.find(p => fs.existsSync(p));
if (!catalogPath) {
  throw new Error('No se encontró shared/character-catalog.json');
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

// Field stored in characters.layers -> list in the catalog it must come from.
const CATEGORY_FIELDS = {
  skinTone: 'skinTones',
  hairStyle: 'hairStyles',
  hairColor: 'hairColors',
  eyes: 'eyes',
  eyeColor: 'eyeColors',
  brows: 'brows',
  nose: 'noses',
  mouth: 'mouths',
  top: 'tops',
  topColor: 'topColors',
  bottom: 'bottoms',
  bottomColor: 'bottomColors',
  shoes: 'shoes',
  shoeColor: 'shoeColors',
};

function getCatalog() {
  return catalog;
}

function validateLayers(layers) {
  const errors = [];
  for (const [field, catalogKey] of Object.entries(CATEGORY_FIELDS)) {
    const value = layers[field];
    if (!value) {
      errors.push(`${field} es requerido`);
      continue;
    }
    const valid = catalog[catalogKey].some(entry => entry.id === value);
    if (!valid) errors.push(`${field}: "${value}" no existe en el catálogo`);
  }
  return errors;
}

// Items with a price must be bought before they can be worn; the rest are free for everyone.
function itemPrice(itemId) {
  for (const catalogKey of Object.values(CATEGORY_FIELDS)) {
    const entry = catalog[catalogKey].find(e => e.id === itemId);
    if (entry) return entry.price ?? 0;
  }
  return null;
}

function pricedItemsIn(layers) {
  return Object.keys(CATEGORY_FIELDS)
    .map(field => layers[field])
    .filter(id => (itemPrice(id) ?? 0) > 0);
}

const renameCost = () => catalog.renameCost ?? 100;

module.exports = { getCatalog, validateLayers, itemPrice, pricedItemsIn, renameCost };
