/**
 * Genera los íconos PWA a partir de los SVG fuente.
 *
 * Uso: node scripts/generate-pwa-icons.js
 *
 * Produce en public/icons/:
 *   - icon-{size}.png        (any)      : 72,96,128,144,152,192,384,512
 *   - maskable-{size}.png    (maskable) : 192, 512
 *   - apple-touch-icon.png   (180)
 * Y en public/:
 *   - favicon-32x32.png, favicon-16x16.png
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(__dirname, 'icon-source.svg');
const SRC_MASKABLE = path.join(__dirname, 'icon-maskable.svg');
const ICONS_DIR = path.join(ROOT, 'public', 'icons');
const PUBLIC_DIR = path.join(ROOT, 'public');

const ANY_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const MASKABLE_SIZES = [192, 512];

async function main() {
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  const srcBuf = fs.readFileSync(SRC);
  const maskBuf = fs.readFileSync(SRC_MASKABLE);

  // Íconos estándar (purpose any)
  for (const size of ANY_SIZES) {
    const out = path.join(ICONS_DIR, `icon-${size}.png`);
    await sharp(srcBuf).resize(size, size).png().toFile(out);
    console.log('✓', path.relative(ROOT, out));
  }

  // Íconos maskable
  for (const size of MASKABLE_SIZES) {
    const out = path.join(ICONS_DIR, `maskable-${size}.png`);
    await sharp(maskBuf).resize(size, size).png().toFile(out);
    console.log('✓', path.relative(ROOT, out));
  }

  // Apple touch icon (180x180)
  const apple = path.join(ICONS_DIR, 'apple-touch-icon.png');
  await sharp(srcBuf).resize(180, 180).png().toFile(apple);
  console.log('✓', path.relative(ROOT, apple));

  // Favicons PNG
  for (const size of [16, 32]) {
    const out = path.join(PUBLIC_DIR, `favicon-${size}x${size}.png`);
    await sharp(srcBuf).resize(size, size).png().toFile(out);
    console.log('✓', path.relative(ROOT, out));
  }

  console.log('\nÍconos PWA generados correctamente.');
}

main().catch((err) => {
  console.error('Error generando íconos:', err);
  process.exit(1);
});
