/** Small original SVG characters/props. */

export const PLANET_SVG = `<svg viewBox="0 0 220 220" class="planet-svg" aria-hidden="true">
  <path d="M6 124 A104 30 0 0 1 214 124" fill="none" stroke="#241643" stroke-width="13"/>
  <path d="M6 124 A104 30 0 0 1 214 124" fill="none" stroke="#FFD23F" stroke-width="5"/>
  <circle cx="110" cy="112" r="70" fill="var(--planet, #FF8C42)" stroke="#241643" stroke-width="9"/>
  <circle cx="80" cy="80" r="11" fill="#fff" opacity=".35"/>
  <circle cx="145" cy="150" r="7" fill="#241643" opacity=".15"/>
  <circle cx="70" cy="140" r="5" fill="#241643" opacity=".15"/>
  <g class="pl-face">
    <circle cx="88" cy="108" r="9" fill="#241643"/><circle cx="132" cy="108" r="9" fill="#241643"/>
    <circle cx="91" cy="105" r="3" fill="#fff"/><circle cx="135" cy="105" r="3" fill="#fff"/>
    <path d="M92 130 Q110 148 128 130" fill="none" stroke="#241643" stroke-width="7" stroke-linecap="round"/>
    <ellipse cx="72" cy="128" rx="9" ry="6" fill="#FF5D8F" opacity=".75"/><ellipse cx="148" cy="128" rx="9" ry="6" fill="#FF5D8F" opacity=".75"/>
  </g>
  <g class="pl-shades">
    <path d="M66 96 H106 L102 118 Q86 126 70 118 Z" fill="#241643"/>
    <path d="M114 96 H154 L150 118 Q134 126 118 118 Z" fill="#241643"/>
    <rect x="100" y="97" width="20" height="6" fill="#241643"/>
    <path d="M74 101 L84 101" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
    <path d="M122 101 L132 101" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
  </g>
  <path d="M6 124 A104 30 0 0 0 214 124" fill="none" stroke="#241643" stroke-width="13"/>
  <path d="M6 124 A104 30 0 0 0 214 124" fill="none" stroke="#FFD23F" stroke-width="5"/>
  <path d="M46 104 Q110 8 174 104" fill="none" stroke="#241643" stroke-width="12" stroke-linecap="round"/>
  <rect x="30" y="92" width="26" height="44" rx="12" fill="#FF5D8F" stroke="#241643" stroke-width="7"/>
  <rect x="164" y="92" width="26" height="44" rx="12" fill="#FF5D8F" stroke="#241643" stroke-width="7"/>
</svg>`;

export const STAMP_SVG = `<svg viewBox="0 0 150 170" aria-hidden="true">
  <ellipse cx="75" cy="30" rx="31" ry="25" fill="#FF5D8F" stroke="#241643" stroke-width="7"/>
  <ellipse cx="66" cy="22" rx="9" ry="6" fill="#fff" opacity=".5"/>
  <rect x="61" y="48" width="28" height="48" rx="9" fill="#FFD23F" stroke="#241643" stroke-width="7"/>
  <rect x="16" y="90" width="118" height="44" rx="15" fill="#16C2A3" stroke="#241643" stroke-width="7"/>
  <rect x="10" y="128" width="130" height="28" rx="9" fill="#241643"/>
</svg>`;

export const GLOBE_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <circle cx="50" cy="50" r="42" fill="#4FB3FF" stroke="#241643" stroke-width="8"/>
  <path d="M30 24 Q44 30 38 44 Q30 52 36 64 Q40 74 30 78 M60 16 Q54 30 66 36 Q80 40 74 56 Q66 66 72 82" fill="none" stroke="#A7E05A" stroke-width="10" stroke-linecap="round"/>
  <ellipse cx="50" cy="50" rx="18" ry="42" fill="none" stroke="#241643" stroke-width="4" opacity=".35"/>
  <path d="M8 50 H92" stroke="#241643" stroke-width="4" opacity=".35"/>
</svg>`;
