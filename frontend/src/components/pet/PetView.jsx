// The companion pet at one growth stage. Images live in /pets (art/pipeline/build_pets.py);
// each stage draws a little bigger, so growing is visible even at the same box size.
export function petImage(species, stage) {
  return `/pets/${species}-${stage}.webp`;
}

export default function PetView({ species, stage = 1, size = 160, catalog, label, silhouette = false, hop = false, idle = true }) {
  const scale = catalog?.stages?.find(s => s.stage === stage)?.scale ?? 1;
  const motion = hop ? 'animate-hop' : idle && !silhouette ? 'animate-breathe' : '';
  return (
    <div className="flex items-end justify-center" style={{ width: size, height: size }}>
      <img
        src={petImage(species, stage)}
        alt={label ?? ''}
        draggable={false}
        className={`object-contain select-none ${motion}`}
        style={{
          width: size * scale,
          height: size * scale,
          filter: silhouette ? 'brightness(0) opacity(0.35)' : undefined,
        }}
      />
    </div>
  );
}
