const VIEWBOX = '0 0 160 200';
const SHOE_COLOR = '#3F3F46';

function resolveHex(list, id) {
  return list?.find(item => item.id === id)?.hex ?? list?.[0]?.hex ?? '#999999';
}

function BodyLayer({ skinHex }) {
  return (
    <g>
      <rect x="58" y="150" width="16" height="38" rx="8" fill={skinHex} />
      <rect x="86" y="150" width="16" height="38" rx="8" fill={skinHex} />
      <rect x="52" y="180" width="24" height="14" rx="7" fill={SHOE_COLOR} />
      <rect x="84" y="180" width="24" height="14" rx="7" fill={SHOE_COLOR} />
      <rect x="24" y="100" width="20" height="55" rx="10" fill={skinHex} />
      <rect x="116" y="100" width="20" height="55" rx="10" fill={skinHex} />
      <circle cx="34" cy="158" r="11" fill={skinHex} />
      <circle cx="126" cy="158" r="11" fill={skinHex} />
      <rect x="40" y="95" width="80" height="70" rx="30" fill={skinHex} />
      <circle cx="44" cy="57" r="7" fill={skinHex} />
      <circle cx="116" cy="57" r="7" fill={skinHex} />
      <circle cx="80" cy="55" r="36" fill={skinHex} />
    </g>
  );
}

function FaceLayer({ face }) {
  switch (face) {
    case 'face_2': // Guiño
      return (
        <g stroke="#1F2937" strokeWidth="3" strokeLinecap="round" fill="none">
          <circle cx="68" cy="52" r="3.5" fill="#1F2937" stroke="none" />
          <path d="M 87 52 q 5 3 10 0" />
          <path d="M 68 66 q 12 10 24 0" />
          <ellipse cx="64" cy="66" rx="7" ry="4" fill="#FCA5A5" stroke="none" opacity="0.6" />
          <ellipse cx="96" cy="66" rx="7" ry="4" fill="#FCA5A5" stroke="none" opacity="0.6" />
        </g>
      );
    case 'face_3': // Sorprendido
      return (
        <g>
          <circle cx="68" cy="52" r="5" fill="#1F2937" />
          <circle cx="92" cy="52" r="5" fill="#1F2937" />
          <circle cx="70" cy="50" r="1.5" fill="#fff" />
          <circle cx="94" cy="50" r="1.5" fill="#fff" />
          <ellipse cx="80" cy="68" rx="6" ry="8" fill="#1F2937" />
        </g>
      );
    case 'face_4': // Tranquilo
      return (
        <g stroke="#1F2937" strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M 62 52 q 6 -5 12 0" />
          <path d="M 86 52 q 6 -5 12 0" />
          <path d="M 72 68 q 8 5 16 0" />
        </g>
      );
    case 'face_1': // Feliz
    default:
      return (
        <g>
          <circle cx="68" cy="52" r="4" fill="#1F2937" />
          <circle cx="92" cy="52" r="4" fill="#1F2937" />
          <path d="M 68 65 q 12 12 24 0" stroke="#1F2937" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <ellipse cx="64" cy="66" rx="7" ry="4" fill="#FCA5A5" opacity="0.6" />
          <ellipse cx="96" cy="66" rx="7" ry="4" fill="#FCA5A5" opacity="0.6" />
        </g>
      );
  }
}

function HairCap({ color }) {
  return <path d="M 44 55 A 36 36 0 0 1 116 55 L 116 38 A 36 28 0 0 0 44 38 Z" fill={color} />;
}

function HairLayer({ style, color }) {
  switch (style) {
    case 'hair_style_2': // Largo
      return (
        <g fill={color}>
          <HairCap color={color} />
          <rect x="38" y="42" width="13" height="68" rx="6.5" />
          <rect x="109" y="42" width="13" height="68" rx="6.5" />
        </g>
      );
    case 'hair_style_3': // Colita
      return (
        <g fill={color}>
          <HairCap color={color} />
          <ellipse cx="122" cy="72" rx="9" ry="20" transform="rotate(25 122 72)" />
        </g>
      );
    case 'hair_style_4': // Rulos
      return (
        <g fill={color}>
          {[-32, -18, -2, 14, 30].map((dx, i) => (
            <circle key={i} cx={80 + dx} cy={i % 2 === 0 ? 32 : 26} r="12" />
          ))}
          <HairCap color={color} />
        </g>
      );
    case 'hair_style_5': // Trenzas
      return (
        <g fill={color}>
          <HairCap color={color} />
          <rect x="39" y="45" width="9" height="55" rx="4.5" />
          <rect x="112" y="45" width="9" height="55" rx="4.5" />
          <circle cx="43.5" cy="102" r="6" />
          <circle cx="116.5" cy="102" r="6" />
        </g>
      );
    case 'hair_style_6': // Puntas
      return (
        <g fill={color}>
          <HairCap color={color} />
          <path d="M 46 40 L 40 24 L 54 36 Z" />
          <path d="M 62 32 L 60 14 L 72 30 Z" />
          <path d="M 80 30 L 80 10 L 90 28 Z" />
          <path d="M 98 32 L 100 14 L 108 30 Z" />
          <path d="M 114 40 L 120 24 L 106 36 Z" />
        </g>
      );
    case 'hair_style_1': // Corto
    default:
      return <HairCap color={color} />;
  }
}

function OutfitLayer({ outfit, color, skinHex }) {
  switch (outfit) {
    case 'outfit_2': // Polerón
      return (
        <g>
          <path d="M 56 92 A 24 18 0 0 1 104 92 Z" fill={color} />
          <rect x="38" y="96" width="84" height="69" rx="28" fill={color} />
          <rect x="22" y="98" width="22" height="58" rx="11" fill={color} />
          <rect x="116" y="98" width="22" height="58" rx="11" fill={color} />
          <circle cx="33" cy="156" r="10" fill={skinHex} />
          <circle cx="127" cy="156" r="10" fill={skinHex} />
        </g>
      );
    case 'outfit_3': // Vestido
      return (
        <g fill={color}>
          <path d="M 42 96 L 118 96 L 132 172 A 60 10 0 0 1 28 172 Z" />
          <circle cx="30" cy="112" r="9" />
          <circle cx="130" cy="112" r="9" />
        </g>
      );
    case 'outfit_4': // Overol
      return (
        <g>
          <rect x="46" y="118" width="68" height="55" rx="14" fill={color} />
          <rect x="52" y="96" width="56" height="34" rx="10" fill="#E5E7EB" />
          <rect x="58" y="90" width="8" height="26" rx="4" fill={color} />
          <rect x="94" y="90" width="8" height="26" rx="4" fill={color} />
          <circle cx="80" cy="126" r="3" fill="#1F2937" />
        </g>
      );
    case 'outfit_1': // Polera
    default:
      return (
        <g>
          <rect x="40" y="95" width="80" height="70" rx="30" fill={color} />
          <path d="M 40 100 a 16 16 0 0 0 0 30 Z" fill={color} />
          <path d="M 120 100 a 16 16 0 0 1 0 30 Z" fill={color} />
        </g>
      );
  }
}

function AccessoryLayer({ accessory }) {
  switch (accessory) {
    case 'accessory_1': // Lentes
      return (
        <g fill="none" stroke="#1F2937" strokeWidth="3">
          <circle cx="68" cy="52" r="9" />
          <circle cx="92" cy="52" r="9" />
          <path d="M 77 52 L 83 52" />
        </g>
      );
    case 'accessory_2': // Gorro
      return (
        <g>
          <path d="M 42 44 A 38 30 0 0 1 118 44 L 118 34 A 38 24 0 0 0 42 34 Z" fill="#EF4444" />
          <rect x="42" y="38" width="40" height="9" rx="4.5" fill="#EF4444" />
        </g>
      );
    case 'accessory_3': // Mochila
      return (
        <g>
          <rect x="46" y="98" width="10" height="46" rx="5" fill="#78350F" />
          <rect x="104" y="98" width="10" height="46" rx="5" fill="#78350F" />
        </g>
      );
    case 'accessory_4': // Bufanda
      return (
        <g fill="#F5C842">
          <rect x="58" y="88" width="44" height="12" rx="6" />
          <rect x="92" y="96" width="12" height="30" rx="5" />
        </g>
      );
    case 'none':
    default:
      return null;
  }
}

export default function Avatar({ layers = {}, catalog, size = 200, className = '' }) {
  if (!catalog) return null;

  const skinHex = resolveHex(catalog.skinTones, layers.skinTone);
  const hairColorHex = resolveHex(catalog.hairColors, layers.hairColor);
  const outfitColorHex = resolveHex(catalog.outfitColors, layers.outfitColor);

  return (
    <svg viewBox={VIEWBOX} width={size} height={size} className={className} role="img" aria-label="Tu personaje">
      <BodyLayer skinHex={skinHex} />
      <FaceLayer face={layers.face} />
      <HairLayer style={layers.hairStyle} color={hairColorHex} />
      <OutfitLayer outfit={layers.outfit} color={outfitColorHex} skinHex={skinHex} />
      <AccessoryLayer accessory={layers.accessory} />
    </svg>
  );
}
