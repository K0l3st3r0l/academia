const fs = require('fs');
const path = require('path');

// Same two layouts as characterCatalog.js: local checkout or Docker with shared mounted.
const CANDIDATE_PATHS = [
  path.join(__dirname, '../../../shared/pet-catalog.json'),
  path.join(__dirname, '../../shared/pet-catalog.json'),
];

const catalogPath = CANDIDATE_PATHS.find(p => fs.existsSync(p));
if (!catalogPath) {
  throw new Error('No se encontró shared/pet-catalog.json');
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const stages = [...catalog.stages].sort((a, b) => a.fromDays - b.fromDays);

function getPetCatalog() {
  return catalog;
}

function isSpecies(id) {
  return catalog.species.some(s => s.id === id);
}

// Growth depends only on the days played, so it is the same for every species.
function growthFor(days) {
  const current = stages.filter(s => days >= s.fromDays).pop();
  const next = stages.find(s => s.fromDays > days) || null;
  return {
    days,
    stage: current.stage,
    nextStage: next?.stage ?? null,
    nextStageAt: next?.fromDays ?? null,
    daysToNext: next ? next.fromDays - days : 0,
  };
}

module.exports = {
  getPetCatalog,
  isSpecies,
  growthFor,
  petRenameCost: () => catalog.renameCost,
  changeSpeciesCost: () => catalog.changeSpeciesCost,
};
