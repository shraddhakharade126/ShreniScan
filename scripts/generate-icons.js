import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Master craft SVG: Beautiful artisan Kalash / Diya vessel with handloom shuttle and sun motif
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#b45309" />
      <stop offset="50%" stop-color="#9a3412" />
      <stop offset="100%" stop-color="#78350f" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef3c7" />
      <stop offset="40%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
    <linearGradient id="clayGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fed7aa" />
      <stop offset="100%" stop-color="#ea580c" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.35" />
    </filter>
  </defs>

  <!-- Background rounded rect -->
  <rect width="512" height="512" rx="108" fill="url(#bgGrad)" />
  
  <!-- Subtle mandala / rangoli decorative ring -->
  <circle cx="256" cy="256" r="185" fill="none" stroke="#fef3c7" stroke-width="2.5" stroke-dasharray="7 9" opacity="0.4" />
  <circle cx="256" cy="256" r="215" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="4 6" opacity="0.3" />

  <!-- Central Emblem Container -->
  <g filter="url(#shadow)">
    <!-- Kalash / Artisan Pottery Vessel Base -->
    <path d="M196 380 C 196 408, 316 408, 316 380 L 328 320 C 370 285, 370 215, 320 185 L 320 165 C 335 160, 335 145, 315 145 L 197 145 C 177 145, 177 160, 192 165 L 192 185 C 142 215, 142 285, 184 320 Z" 
          fill="url(#goldGrad)" stroke="#fffbeb" stroke-width="4" stroke-linejoin="round" />

    <!-- Traditional Artisan Handloom Warp & Weft Grid lines across vessel -->
    <path d="M178 245 C 220 270, 292 270, 334 245" fill="none" stroke="#78350f" stroke-width="4" stroke-linecap="round" opacity="0.6" />
    <path d="M184 275 C 224 300, 288 300, 328 275" fill="none" stroke="#78350f" stroke-width="4" stroke-linecap="round" opacity="0.6" />
    <path d="M256 195 L 256 345" fill="none" stroke="#78350f" stroke-width="3" stroke-dasharray="5 5" opacity="0.5" />

    <!-- Sacred Golden Flame / Lotus Leaf sprouting from top (Creativity & Heritage) -->
    <path d="M256 80 C 230 115, 235 145, 256 150 C 277 145, 282 115, 256 80 Z" 
          fill="url(#clayGrad)" stroke="#fef3c7" stroke-width="3" />
    <!-- Left Leaf -->
    <path d="M246 142 C 218 132, 205 110, 215 95 C 225 112, 235 130, 246 142 Z" 
          fill="#fef3c7" opacity="0.9" />
    <!-- Right Leaf -->
    <path d="M266 142 C 294 132, 307 110, 297 95 C 287 112, 277 130, 266 142 Z" 
          fill="#fef3c7" opacity="0.9" />

    <!-- Golden Artisan Star / Bindu at heart -->
    <circle cx="256" cy="256" r="14" fill="#fffbeb" />
    <circle cx="256" cy="256" r="8" fill="#b45309" />
  </g>

  <!-- Letter K monogram in subtle bottom banner -->
  <text x="256" y="455" font-family="'Fraunces', Georgia, serif" font-weight="700" font-size="34" fill="#fef3c7" text-anchor="middle" letter-spacing="4">KALAKART</text>
</svg>`;

// Maskable icon with safe zone (35% margin)
const maskableSvgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#9a3412" />
  <g transform="translate(64, 64) scale(0.75)">
    <!-- Vessel and motifs with generous safe padding -->
    <circle cx="256" cy="256" r="215" fill="none" stroke="#f59e0b" stroke-width="4" stroke-dasharray="8 10" opacity="0.4" />
    <path d="M196 380 C 196 408, 316 408, 316 380 L 328 320 C 370 285, 370 215, 320 185 L 320 165 C 335 160, 335 145, 315 145 L 197 145 C 177 145, 177 160, 192 165 L 192 185 C 142 215, 142 285, 184 320 Z" 
          fill="#f59e0b" stroke="#fffbeb" stroke-width="6" stroke-linejoin="round" />
    <path d="M256 80 C 230 115, 235 145, 256 150 C 277 145, 282 115, 256 80 Z" fill="#fed7aa" stroke="#fef3c7" stroke-width="4" />
    <circle cx="256" cy="256" r="16" fill="#fffbeb" />
  </g>
</svg>`;

async function main() {
  const publicDir = path.resolve('public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Write SVG master
  fs.writeFileSync(path.join(publicDir, 'pwa-icon.svg'), svgContent);
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);

  const svgBuffer = Buffer.from(svgContent);
  const maskableBuffer = Buffer.from(maskableSvgContent);

  // 192x192
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));

  // 512x512
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));

  // Apple touch icon (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // Maskable 512x512
  await sharp(maskableBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'maskable-icon-512x512.png'));

  console.log('PWA icons successfully generated!');
}

main().catch(console.error);
