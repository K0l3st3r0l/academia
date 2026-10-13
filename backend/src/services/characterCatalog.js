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
  headwear: 'headwear',
  eyewear: 'eyewear',
  neckwear: 'neckwear',
  backwear: 'backwear',
  earwear: 'earwear',
  waistwear: 'waistwear',
};
// Accessory slots may be left out: missing means none.
const OPTIONAL_FIELDS = new Set(['headwear', 'eyewear', 'neckwear', 'backwear', 'earwear', 'waistwear']);
// A catalog built before a slot existed simply has no list for it.
const entries = catalogKey => catalog[catalogKey] ?? [];

function getCatalog() {
  return catalog;
}

function validateLayers(layers) {
  const errors = [];
  for (const [field, catalogKey] of Object.entries(CATEGORY_FIELDS)) {
    const value = layers[field];
    if (!value && OPTIONAL_FIELDS.has(field)) continue;
    if (!value) {
      errors.push(`${field} es requerido`);
      continue;
    }
    const valid = entries(catalogKey).some(entry => entry.id === value);
    if (!valid) errors.push(`${field}: "${value}" no existe en el catálogo`);
  }
  return errors;
}

// Items with a price must be bought before they can be worn; the rest are free for everyone.
function itemEntry(itemId) {
  for (const catalogKey of Object.values(CATEGORY_FIELDS)) {
    const entry = entries(catalogKey).find(e => e.id === itemId);
    if (entry) return entry;
  }
  return null;
}

function itemPrice(itemId) {
  const entry = itemEntry(itemId);
  return entry ? entry.price ?? 0 : null;
}

// The copihue collection (sold by the Academy's merchant) costs copihues; everything else, tokens.
function itemCurrency(itemId) {
  return itemEntry(itemId)?.currency === 'copihues' ? 'copihues' : 'tokens';
}

function pricedItemsIn(layers) {
  return Object.keys(CATEGORY_FIELDS)
    .map(field => layers[field])
    .filter(id => (itemPrice(id) ?? 0) > 0);
}

// Test accounts own everything, including items added after they were created.
function allPricedItems() {
  return Object.values(CATEGORY_FIELDS)
    .flatMap(entries)
    .filter(e => (e.price ?? 0) > 0)
    .map(e => e.id);
}

const renameCost = () => catalog.renameCost ?? 100;

module.exports = { getCatalog, validateLayers, itemPrice, itemCurrency, pricedItemsIn, allPricedItems, renameCost };
