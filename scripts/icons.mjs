import sharp from 'sharp'
import { readFileSync } from 'fs'
const svg = readFileSync('public/favicon.svg')
// maskable: full bleed background with smaller mark
const maskSvg = Buffer.from(svg.toString().replace('rx="120"', 'rx="0"').replace('<path d="M150', '<g transform="translate(51 51) scale(0.8)"><path d="M150').replace('fill="#FFE14D"/>', 'fill="#FFE14D"/></g>'))
await sharp(svg).resize(192, 192).png().toFile('public/icon-192.png')
await sharp(svg).resize(512, 512).png().toFile('public/icon-512.png')
await sharp(maskSvg).resize(512, 512).png().toFile('public/icon-maskable-512.png')
await sharp(maskSvg).resize(180, 180).png().toFile('public/apple-touch-icon.png')
console.log('icons ok')
