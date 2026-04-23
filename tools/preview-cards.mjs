import { writeFile, mkdir } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

await mkdir(new URL('../preview', import.meta.url), { recursive: true });

const colors = {
  red:    { base: '#c62828', deep: '#8e1b1b', light: '#e84646' },
  blue:   { base: '#1f5db3', deep: '#13408a', light: '#3b7cd1' },
  green:  { base: '#2e8a3e', deep: '#1f6e2d', light: '#41a653' },
  yellow: { base: '#d4a830', deep: '#a98220', light: '#e6bd48' },
};

const CARD_W = 340;
const CARD_H = 480;

function wrap(inner, w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`;
}

function variantA({ base, deep }, value) {
  // Classic Mattel: solid saturated color, huge white number, minimal chrome.
  return wrap(`
    <rect x="8" y="8" width="${CARD_W - 16}" height="${CARD_H - 16}" rx="22" ry="22"
          fill="${base}" stroke="#ffffff" stroke-width="6"/>
    <rect x="14" y="14" width="${CARD_W - 28}" height="${CARD_H - 28}" rx="18" ry="18"
          fill="none" stroke="${deep}" stroke-width="2"/>
    <text x="44" y="76" font-family="Helvetica, Arial Black, sans-serif"
          font-size="54" font-weight="900" fill="#ffffff">${value}</text>
    <text x="${CARD_W / 2}" y="${CARD_H / 2 + 95}"
          font-family="Helvetica, Arial Black, sans-serif"
          font-size="260" font-weight="900" fill="#ffffff" text-anchor="middle">${value}</text>
    <g transform="translate(${CARD_W - 44} ${CARD_H - 76}) rotate(180)">
      <text x="0" y="0" font-family="Helvetica, Arial Black, sans-serif"
            font-size="54" font-weight="900" fill="#ffffff">${value}</text>
    </g>
  `, CARD_W, CARD_H);
}

function variantB({ base, deep, light }, value) {
  // Vertical gradient with soft inner border + subtle embossed feel.
  const gid = `g${Math.random().toString(36).slice(2, 7)}`;
  return wrap(`
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${light}"/>
        <stop offset="1" stop-color="${deep}"/>
      </linearGradient>
    </defs>
    <rect x="8" y="8" width="${CARD_W - 16}" height="${CARD_H - 16}" rx="22" ry="22"
          fill="url(#${gid})" stroke="#ffffff" stroke-width="6"/>
    <text x="44" y="76" font-family="Helvetica, Arial Black, sans-serif"
          font-size="54" font-weight="900" fill="#ffffff"
          stroke="#00000033" stroke-width="1.5">${value}</text>
    <text x="${CARD_W / 2}" y="${CARD_H / 2 + 95}"
          font-family="Helvetica, Arial Black, sans-serif"
          font-size="260" font-weight="900" fill="#ffffff"
          stroke="#00000055" stroke-width="4"
          text-anchor="middle">${value}</text>
    <g transform="translate(${CARD_W - 44} ${CARD_H - 76}) rotate(180)">
      <text x="0" y="0" font-family="Helvetica, Arial Black, sans-serif"
            font-size="54" font-weight="900" fill="#ffffff">${value}</text>
    </g>
  `, CARD_W, CARD_H);
}

function variantC({ base, deep }, value) {
  // White card face with a colored oval/panel (Uno-style) containing the number.
  const panelCx = CARD_W / 2;
  const panelCy = CARD_H / 2;
  return wrap(`
    <rect x="8" y="8" width="${CARD_W - 16}" height="${CARD_H - 16}" rx="22" ry="22"
          fill="#f7f1df" stroke="#1b1b1b" stroke-width="3"/>
    <text x="36" y="70" font-family="Helvetica, Arial Black, sans-serif"
          font-size="52" font-weight="900" fill="${base}">${value}</text>
    <ellipse cx="${panelCx}" cy="${panelCy}" rx="${CARD_W * 0.36}" ry="${CARD_H * 0.32}"
             fill="${base}" stroke="${deep}" stroke-width="4"
             transform="rotate(-18 ${panelCx} ${panelCy})"/>
    <text x="${panelCx}" y="${panelCy + 80}"
          font-family="Helvetica, Arial Black, sans-serif"
          font-size="210" font-weight="900" fill="#ffffff" text-anchor="middle"
          stroke="${deep}" stroke-width="4">${value}</text>
    <g transform="translate(${CARD_W - 36} ${CARD_H - 70}) rotate(180)">
      <text x="0" y="0" font-family="Helvetica, Arial Black, sans-serif"
            font-size="52" font-weight="900" fill="${base}">${value}</text>
    </g>
  `, CARD_W, CARD_H);
}

function variantD({ base, deep, light }, value) {
  // Cream face with bold color bands top+bottom, number centered on a soft
  // color tint. Modern / minimalist feel.
  return wrap(`
    <rect x="8" y="8" width="${CARD_W - 16}" height="${CARD_H - 16}" rx="22" ry="22"
          fill="#fbf4e4" stroke="#1b1b1b" stroke-width="3"/>
    <rect x="8" y="8" width="${CARD_W - 16}" height="60" rx="22" ry="22" fill="${base}"/>
    <rect x="8" y="${CARD_H - 68}" width="${CARD_W - 16}" height="60" rx="22" ry="22" fill="${base}"/>
    <rect x="8" y="58" width="${CARD_W - 16}" height="12" fill="${base}"/>
    <rect x="8" y="${CARD_H - 70}" width="${CARD_W - 16}" height="12" fill="${base}"/>
    <text x="30" y="46" font-family="Helvetica, Arial Black, sans-serif"
          font-size="38" font-weight="900" fill="#ffffff">${value}</text>
    <text x="${CARD_W / 2}" y="${CARD_H / 2 + 85}"
          font-family="Helvetica, Arial Black, sans-serif"
          font-size="240" font-weight="900" fill="${base}" text-anchor="middle"/>
    <text x="${CARD_W / 2}" y="${CARD_H / 2 + 85}"
          font-family="Helvetica, Arial Black, sans-serif"
          font-size="240" font-weight="900" fill="${base}" text-anchor="middle">${value}</text>
    <g transform="translate(${CARD_W - 30} ${CARD_H - 16}) rotate(180)">
      <text x="0" y="0" font-family="Helvetica, Arial Black, sans-serif"
            font-size="38" font-weight="900" fill="#ffffff">${value}</text>
    </g>
  `, CARD_W, CARD_H);
}

const variants = { A: variantA, B: variantB, C: variantC, D: variantD };
const sampleColors = ['red', 'blue', 'green', 'yellow'];

// Build a grid: 4 variants × 4 colors (numbers 7, 3, 11, 2).
const sampleValues = [7, 3, 11, 2];
const rowGap = 24;
const colGap = 16;
const gridW = (CARD_W + colGap) * sampleColors.length - colGap + 40;
const gridH = (CARD_H + rowGap) * 4 + 40 + (4 * 60); // extra for labels

let body = `<rect x="0" y="0" width="${gridW}" height="${gridH}" fill="#143326"/>`;
let yOffset = 20;
for (const [variantKey, fn] of Object.entries(variants)) {
  body += `<text x="20" y="${yOffset + 40}" font-family="Helvetica, Arial, sans-serif"
                 font-size="36" font-weight="800" fill="#f5c34b">Variant ${variantKey}</text>`;
  yOffset += 56;
  let x = 20;
  for (let i = 0; i < sampleColors.length; i++) {
    const c = colors[sampleColors[i]];
    const v = sampleValues[i];
    const cardSvg = fn(c, v);
    // Extract inner svg content for inline nesting
    const inner = cardSvg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
    body += `<g transform="translate(${x} ${yOffset})">
      <svg width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">${inner}</svg>
    </g>`;
    x += CARD_W + colGap;
  }
  yOffset += CARD_H + rowGap;
}

const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${gridW} ${gridH}"
                      width="${gridW}" height="${gridH}">${body}</svg>`;

const resvg = new Resvg(fullSvg, { fitTo: { mode: 'width', value: 1600 } });
const png = resvg.render().asPng();
await writeFile(new URL('../preview/phase10-variants.png', import.meta.url), png);
console.log('wrote preview/phase10-variants.png');
