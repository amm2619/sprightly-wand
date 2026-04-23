import { readFile, writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

const raw = (await readFile(new URL('../assets/logo.svg', import.meta.url), 'utf8')).trim();
const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();

async function render(targetPath, size, { background, padding = 0 } = {}) {
  let svg;
  if (padding > 0 || background) {
    const base = 1024;
    const total = base + padding * 2;
    const bgRect = background
      ? `<rect x="0" y="0" width="${total}" height="${total}" fill="${background}"/>`
      : '';
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}">${bgRect}<g transform="translate(${padding} ${padding})">${inner}</g></svg>`;
  } else {
    svg = raw;
  }
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  const png = resvg.render().asPng();
  await writeFile(new URL(`../assets/${targetPath}`, import.meta.url), png);
  console.log(`wrote ${targetPath} (${size}x${size})`);
}

await render('icon.png', 1024);
await render('adaptive-icon.png', 1024, { padding: 200, background: 'transparent' });
await render('splash-icon.png', 1024, { padding: 200, background: '#0b3d2e' });
await render('favicon.png', 512);

console.log('Done.');
