import type { ContentPack, LearningItem } from './types';

/** Simplified, locally drawn flags. Every render gets unique clip-path ids. */
let uid = 0;
const S = 'preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"';

const FLAG_SVGS: Record<string, (u: number) => string> = {
  es: () => `<svg viewBox="0 0 750 500" ${S}>
    <rect width="750" height="500" fill="#AA151B"/><rect y="125" width="750" height="250" fill="#F1BF00"/>
    <g transform="translate(250 250)" stroke="#7a5400" stroke-width="5">
      <rect x="-92" y="-64" width="22" height="124" rx="5" fill="#E9E9E9"/>
      <rect x="70" y="-64" width="22" height="124" rx="5" fill="#E9E9E9"/>
      <path d="M-50 -58 H50 V18 Q50 68 0 74 Q-50 68 -50 18 Z" fill="#C8102E"/>
      <path d="M0 -58 V74 M-50 8 H50" stroke="#F1BF00" stroke-width="8" fill="none"/>
      <path d="M-44 -64 Q0 -108 44 -64 Z" fill="#E4A800"/>
    </g></svg>`,
  jp: () => `<svg viewBox="0 0 900 600" ${S}><rect width="900" height="600" fill="#fff"/><circle cx="450" cy="300" r="180" fill="#BC002D"/></svg>`,
  fr: () => `<svg viewBox="0 0 900 600" ${S}><rect width="300" height="600" fill="#002395"/><rect x="300" width="300" height="600" fill="#fff"/><rect x="600" width="300" height="600" fill="#ED2939"/></svg>`,
  it: () => `<svg viewBox="0 0 900 600" ${S}><rect width="300" height="600" fill="#009246"/><rect x="300" width="300" height="600" fill="#fff"/><rect x="600" width="300" height="600" fill="#CE2B37"/></svg>`,
  de: () => `<svg viewBox="0 0 1000 600" ${S}><rect width="1000" height="200" fill="#000"/><rect y="200" width="1000" height="200" fill="#DD0000"/><rect y="400" width="1000" height="200" fill="#FFCE00"/></svg>`,
  pt: () => `<svg viewBox="0 0 600 400" ${S}>
    <rect width="600" height="400" fill="#FF0000"/><rect width="240" height="400" fill="#006600"/>
    <circle cx="240" cy="200" r="80" fill="none" stroke="#FFE000" stroke-width="16"/>
    <path d="M160 200 H320 M240 120 V280" stroke="#FFE000" stroke-width="7"/>
    <path d="M198 148 H282 V212 Q282 262 240 270 Q198 262 198 212 Z" fill="#fff" stroke="#FF0000" stroke-width="16"/>
    <g fill="#003399"><rect x="232" y="168" width="16" height="20" rx="3"/><rect x="232" y="198" width="16" height="20" rx="3"/><rect x="232" y="228" width="16" height="20" rx="3"/><rect x="211" y="198" width="16" height="20" rx="3"/><rect x="253" y="198" width="16" height="20" rx="3"/></g>
  </svg>`,
  gb: (u) => `<svg viewBox="0 0 60 30" ${S}>
    <clipPath id="gbs${u}"><path d="M0,0 v30 h60 v-30 z"/></clipPath>
    <clipPath id="gbt${u}"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath>
    <g clip-path="url(#gbs${u})">
      <path d="M0,0 v30 h60 v-30 z" fill="#012169"/>
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/>
      <path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#gbt${u})" stroke="#C8102E" stroke-width="4"/>
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/>
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/>
    </g></svg>`,
  br: (u) => `<svg viewBox="0 0 720 504" ${S}>
    <rect width="720" height="504" fill="#009C3B"/>
    <polygon points="62,252 360,44 658,252 360,460" fill="#FFDF00"/>
    <clipPath id="brc${u}"><circle cx="360" cy="252" r="126"/></clipPath>
    <circle cx="360" cy="252" r="126" fill="#002776"/>
    <path d="M222 226 Q360 176 504 284" stroke="#fff" stroke-width="22" fill="none" clip-path="url(#brc${u})"/>
    <g fill="#fff"><circle cx="300" cy="300" r="7"/><circle cx="332" cy="332" r="6"/><circle cx="372" cy="306" r="7"/><circle cx="410" cy="334" r="6"/><circle cx="388" cy="362" r="5"/><circle cx="346" cy="282" r="5"/><circle cx="432" cy="300" r="5"/><circle cx="360" cy="352" r="4"/></g>
  </svg>`,
  mx: () => `<svg viewBox="0 0 900 600" ${S}>
    <rect width="300" height="600" fill="#006847"/><rect x="300" width="300" height="600" fill="#fff"/><rect x="600" width="300" height="600" fill="#CE1126"/>
    <path d="M388 336 Q450 400 512 336" fill="none" stroke="#2f7d32" stroke-width="16" stroke-linecap="round"/>
    <ellipse cx="450" cy="300" rx="58" ry="52" fill="#8C5A2B"/>
    <path d="M404 276 Q430 230 468 252 L500 232 Q492 272 470 286 Z" fill="#6b3f1a"/>
    <circle cx="486" cy="250" r="16" fill="#6b3f1a"/><path d="M500 248 L516 254 L500 258 Z" fill="#E4A800"/>
    <path d="M420 330 Q450 350 480 330" stroke="#4a8fc0" stroke-width="8" fill="none"/>
  </svg>`,
  ie: () => `<svg viewBox="0 0 900 600" ${S}><rect width="300" height="600" fill="#169B62"/><rect x="300" width="300" height="600" fill="#fff"/><rect x="600" width="300" height="600" fill="#FF883E"/></svg>`,
  be: () => `<svg viewBox="0 0 900 600" ${S}><rect width="300" height="600" fill="#000"/><rect x="300" width="300" height="600" fill="#FDDA24"/><rect x="600" width="300" height="600" fill="#EF3340"/></svg>`,
  pl: () => `<svg viewBox="0 0 900 600" ${S}><rect width="900" height="300" fill="#fff"/><rect y="300" width="900" height="300" fill="#DC143C"/></svg>`,
  id: () => `<svg viewBox="0 0 900 600" ${S}><rect width="900" height="300" fill="#CE1126"/><rect y="300" width="900" height="300" fill="#fff"/></svg>`,
  nl: () => `<svg viewBox="0 0 900 600" ${S}><rect width="900" height="200" fill="#AE1C28"/><rect y="200" width="900" height="200" fill="#fff"/><rect y="400" width="900" height="200" fill="#21468B"/></svg>`,
};

export const FLAG_ITEMS: LearningItem[] = [
  { id: 'es', country: 'ESPAÑA', flagAsset: 'es', difficulty: 1, group: 1 },
  { id: 'jp', country: 'JAPÓN', flagAsset: 'jp', difficulty: 1, group: 1 },
  { id: 'fr', country: 'FRANCIA', flagAsset: 'fr', difficulty: 1, group: 1 },
  { id: 'it', country: 'ITALIA', flagAsset: 'it', difficulty: 1, group: 1 },
  { id: 'de', country: 'ALEMANIA', flagAsset: 'de', difficulty: 1, group: 2 },
  { id: 'pt', country: 'PORTUGAL', flagAsset: 'pt', difficulty: 2, group: 2 },
  { id: 'gb', country: 'REINO UNIDO', flagAsset: 'gb', difficulty: 2, group: 2 },
  { id: 'br', country: 'BRASIL', flagAsset: 'br', difficulty: 2, group: 2 },
  // Groove 2: "banderas gemelas" (look-alikes of flags from Groove 1)
  { id: 'mx', country: 'MÉXICO', flagAsset: 'mx', difficulty: 3, group: 3 },
  { id: 'ie', country: 'IRLANDA', flagAsset: 'ie', difficulty: 3, group: 3 },
  { id: 'be', country: 'BÉLGICA', flagAsset: 'be', difficulty: 3, group: 3 },
  { id: 'pl', country: 'POLONIA', flagAsset: 'pl', difficulty: 3, group: 3 },
  { id: 'id', country: 'INDONESIA', flagAsset: 'id', difficulty: 3, group: 3 },
  { id: 'nl', country: 'PAÍSES BAJOS', flagAsset: 'nl', difficulty: 3, group: 3 },
];

export const FLAGS_PACK: ContentPack = {
  id: 'flags',
  title: 'WORLD BEAT',
  subtitle: 'Banderas',
  items: FLAG_ITEMS,
  renderPrompt: (item) => FLAG_SVGS[item.flagAsset](++uid),
  answerLabel: (item) => item.country,
  byId(id) {
    const it = FLAG_ITEMS.find((i) => i.id === id);
    if (!it) throw new Error(`Unknown item ${id}`);
    return it;
  },
};
