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

const CATEGORY_FIELDS = {
  skinTone: 'skinTones',
  hairStyle: 'hairStyles',
  hairColor: 'hairColors',
  face: 'faces',
  outfit: 'outfits',
  outfitColor: 'outfitColors',
  accessory: 'accessories',
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

module.exports = { getCatalog, validateLayers };
