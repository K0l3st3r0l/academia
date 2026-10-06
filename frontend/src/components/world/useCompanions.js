import { useEffect, useState } from 'react';
import { getCharacterCatalog, getCharacterMe, getPetCatalog, getPetMe } from '../../api/client';
import { layersToLook } from '../character/look';

// The student's character and pet, to walk the map and cheer during levels. Either can be
// missing (not created yet): the world still works without them.
export default function useCompanions() {
  const [state, setState] = useState({ look: null, pet: null, petCatalog: null, ready: false });

  useEffect(() => {
    let alive = true;
    Promise.allSettled([getCharacterCatalog(), getCharacterMe(), getPetCatalog(), getPetMe()]).then(
      ([catalog, character, petCatalog, petMe]) => {
        if (!alive) return;
        const value = r => (r.status === 'fulfilled' ? r.value.data : null);
        const pet = value(petMe);
        setState({
          look: layersToLook(value(character)?.character?.layers, value(catalog)),
          pet: pet?.pet ? { species: pet.pet.species, name: pet.pet.name, stage: pet.growth?.stage ?? 1 } : null,
          petCatalog: value(petCatalog),
          ready: true,
        });
      }
    );
    return () => { alive = false; };
  }, []);

  return state;
}
