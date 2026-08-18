/**
 * Draws the app icons straight to PNG — no image library, no binary assets in the repo.
 *
 * A home-screen icon has to be a real PNG (SVG won't install on iOS), so the mark is
 * rasterised here: the brand's gradient tile on the app background, with three bars for
 * the board itself. Everything is drawn into an RGBA buffer and deflated into the one
 * IDAT chunk PNG needs.
 *
 * Run: npm run icons
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const BG = [10, 12, 18]
const FROM = [47, 224, 139] // --accent
const TO = [20, 184, 255]
const BAR = [8, 22, 16]

const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

/** Coverage of a pixel by a rounded rectangle, sampled 3×3 so the edges aren't jagged. */
function roundedCoverage(px, py, x, y, w, h, r) {
  let hits = 0
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const cx = px + (sx + 0.5) / 3
      const cy = py + (sy + 0.5) / 3
      if (cx < x || cy < y || cx > x + w || cy > y + h) continue
      const dx = Math.max(x + r - cx, cx - (x + w - r), 0)
      const dy = Math.max(y + r - cy, cy - (y + h - r), 0)
      if (dx * dx + dy * dy <= r * r) hits++
    }
  }
  return hits / 9
}

function render(size) {
  const px = new Uint8Array(size * size * 4)
  // The mark sits at 64% of the canvas so it survives a maskable crop to the inner 80%.
  const tile = size * 0.64
  const origin = (size - tile) / 2
  const radius = tile * 0.26

  const bars = [
    { w: 0.60, y: 0.26 },
    { w: 0.44, y: 0.46 },
    { w: 0.30, y: 0.66 },
  ]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      let rgb = BG

      const cover = roundedCoverage(x, y, origin, origin, tile, tile, radius)
      if (cover > 0) {
        const t = Math.min(1, Math.max(0, (x - origin + (y - origin)) / (tile * 2)))
        let mark = lerp(FROM, TO, t)

        for (const bar of bars) {
          const bx = origin + tile * 0.2
          const by = origin + tile * bar.y
          const bw = tile * bar.w
          const bh = tile * 0.1
          const c = roundedCoverage(x, y, bx, by, bw, bh, bh / 2)
          if (c > 0) mark = lerp(mark, BAR, c)
        }
        rgb = lerp(rgb, mark, cover)
      }

      px[i] = rgb[0]
      px[i + 1] = rgb[1]
      px[i + 2] = rgb[2]
      px[i + 3] = 255
    }
  }
  return px
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size) {
  const pixels = render(size)
  // PNG stores each scanline behind a filter byte; 0 means "store it as-is".
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512, 180]) {
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`
  const out = resolve(__dirname, '../public', name)
  const buf = png(size)
  writeFileSync(out, buf)
  console.log(`${name.padEnd(22)} ${size}×${size}  ${(buf.length / 1024).toFixed(1)} kB`)
}
