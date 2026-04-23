import { writeFile, mkdir } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

await mkdir(new URL('../preview', import.meta.url), { recursive: true });

// Prettier palette — more saturated, modern, still high-contrast with white.
const colors = {
  red:    { base: '#e11d48', deep: '#9f1239', highlight: '#ffb4bf' },
  blue:   { base: '#2563eb', deep: '#1e40af', highlight: '#bfdbfe' },
  green:  { base: '#16a34a', deep: '#15803d', highlight: '#bbf7d0' },
  // Warmer, truer yellow — not amber/goldenrod, not screaming neon either.
  yellow: { base: '#e8b923', deep: '#9a7a14', highlight: '#fce58c' },
};

const CARD_W = 68;
const CARD_H = 98;
const STEP = 36;
const FAN_MAX_ROTATION_DEG = 8;
const FAN_ARC_DEPTH = 10;

/**
 * Variant A (polished): solid saturated color card, huge bold white number,
 * center number auto-shrinks for two-digit values so nothing overflows.
 * Small corner labels top-left and bottom-right (rotated).
 */
function variantA({ base, deep, highlight }, value) {
  const twoDigit = String(value).length >= 2;
  const centerSize = twoDigit ? 44 : 58;
  // Nudge "11" / "12" a touch left so it looks optically centered.
  const centerDX = value === 11 ? -1 : 0;
  const cornerSize = twoDigit ? 12 : 14;
  // Shared text style
  const font = 'Helvetica, Arial Black, sans-serif';
  return `
    <rect x="2" y="2" width="${CARD_W - 4}" height="${CARD_H - 4}" rx="9" ry="9"
          fill="${base}" stroke="#ffffff" stroke-width="2"/>
    <rect x="4" y="4" width="${CARD_W - 8}" height="${CARD_H - 8}" rx="7" ry="7"
          fill="none" stroke="${deep}" stroke-width="0.8"/>
    <!-- Subtle top-sheen highlight so the card feels printed / slightly glossy -->
    <rect x="5" y="5" width="${CARD_W - 10}" height="${Math.round(CARD_H * 0.35)}"
          rx="5" ry="5" fill="${highlight}" fill-opacity="0.18"/>
    <!-- Top-left corner number -->
    <text x="7" y="${cornerSize + 5}" font-family="${font}"
          font-size="${cornerSize}" font-weight="900" fill="#ffffff">${value}</text>
    <!-- Big center number -->
    <text x="${CARD_W / 2 + centerDX}" y="${CARD_H / 2 + centerSize * 0.36}"
          font-family="${font}"
          font-size="${centerSize}" font-weight="900" fill="#ffffff"
          text-anchor="middle">${value}</text>
    <!-- Bottom-right corner (rotated 180°) -->
    <g transform="translate(${CARD_W - 7} ${CARD_H - 5 - cornerSize}) rotate(180)">
      <text x="0" y="0" font-family="${font}"
            font-size="${cornerSize}" font-weight="900" fill="#ffffff">${value}</text>
    </g>`;
}

// Sample hand: mix of colors and both single- and two-digit values so we can
// confirm the center number fits in every case.
const sample = [
  { color: 'red', value: 3 },
  { color: 'yellow', value: 7 },
  { color: 'blue', value: 11 },
  { color: 'green', value: 9 },
  { color: 'red', value: 12 },
  { color: 'green', value: 2 },
  { color: 'blue', value: 10 },
];

const N = sample.length;
const handWidth = (N - 1) * STEP + CARD_W;
const rowHeight = CARD_H + FAN_ARC_DEPTH + 40;
const padX = 40;
const totalH = rowHeight + 80;
const totalW = handWidth + padX * 2;

let body = `<defs>
  <linearGradient id="felt" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#21472f"/>
    <stop offset="1" stop-color="#112716"/>
  </linearGradient>
</defs>
<rect x="0" y="0" width="${totalW}" height="${totalH}" fill="url(#felt)"/>
<text x="${padX}" y="40" font-family="Helvetica, Arial, sans-serif"
      font-size="22" font-weight="800" fill="#f5c34b">Variant A — polished</text>`;

const yRow = 60;
for (let i = 0; i < N; i++) {
  const norm = N > 1 ? (i - (N - 1) / 2) / ((N - 1) / 2) : 0;
  const rotation = norm * FAN_MAX_ROTATION_DEG;
  const yFan = norm * norm * FAN_ARC_DEPTH;
  const cx = padX + i * STEP + CARD_W / 2;
  const cy = yRow + yFan + CARD_H / 2;
  const c = colors[sample[i].color];
  const faceInner = variantA(c, sample[i].value);
  body += `<g transform="translate(${cx} ${cy}) rotate(${rotation}) translate(${-CARD_W / 2} ${-CARD_H / 2})">${faceInner}</g>`;
}

// Also render a strip of all 4 colors at one zoomed-up size so you can
// confirm each color reads well on its own.
const zoomScale = 3.2;
const zW = CARD_W * zoomScale;
const zH = CARD_H * zoomScale;
const zGap = 20;
const zY = yRow + CARD_H + 70;
body += `<text x="${padX}" y="${zY - 14}" font-family="Helvetica, Arial, sans-serif"
               font-size="18" font-weight="800" fill="#f5c34b">Color check (zoomed)</text>`;
const zoomSample = [
  { color: 'red', value: 7 },
  { color: 'blue', value: 12 },
  { color: 'green', value: 11 },
  { color: 'yellow', value: 3 },
];
let zX = padX;
for (const s of zoomSample) {
  const c = colors[s.color];
  const inner = variantA(c, s.value);
  body += `<g transform="translate(${zX} ${zY}) scale(${zoomScale})">${inner}</g>`;
  zX += zW + zGap;
}

const fullH = zY + zH + 40;
const fullW = Math.max(totalW, zX + padX);

const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 ${fullW} ${fullH}"
                      width="${fullW}" height="${fullH}">
  <rect x="0" y="0" width="${fullW}" height="${fullH}" fill="#112716"/>
  ${body}
</svg>`;

const resvg = new Resvg(fullSvg, { fitTo: { mode: 'width', value: 1200 } });
const png = resvg.render().asPng();
await writeFile(new URL('../preview/phase10-fan.png', import.meta.url), png);
console.log('wrote preview/phase10-fan.png');
