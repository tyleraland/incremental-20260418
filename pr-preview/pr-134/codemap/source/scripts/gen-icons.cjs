// Generates solid-color PNG app icons (192x192 and 512x512) into public/.
// Pure Node (zlib + manual chunk encoding); no native deps.
const fs   = require('fs')
const path = require('path')
const zlib = require('zlib')

const OUT_DIR = path.join(__dirname, '..', 'public')

// CRC32 (PNG-style)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

// Render a few colored bars on a dark background, mirroring icon.svg.
function makeIcon(size) {
  const bg = [0x0f, 0x17, 0x2a]
  const bars = [
    { y: 0.19, h: 0.11, w: 0.625, color: [0x63, 0x66, 0xf1] },
    { y: 0.36, h: 0.11, w: 0.47,  color: [0x10, 0xb9, 0x81] },
    { y: 0.53, h: 0.11, w: 0.55,  color: [0xf5, 0x9e, 0x0b] },
    { y: 0.70, h: 0.11, w: 0.35,  color: [0xef, 0x44, 0x44] },
  ]
  const xPad = 0.19
  const radius = 0.024 * size

  const raw = Buffer.alloc(size * (1 + size * 3))
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0
    for (let x = 0; x < size; x++) {
      let r = bg[0], g = bg[1], b = bg[2]
      for (const bar of bars) {
        const x0 = xPad * size, x1 = x0 + bar.w * size
        const y0 = bar.y * size, y1 = y0 + bar.h * size
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
          // simple rounded-corner clip
          const dx = Math.min(x - x0, x1 - x), dy = Math.min(y - y0, y1 - y)
          if (dx > radius || dy > radius || (dx * dx + dy * dy) >= ((radius - Math.min(dx, dy)) ** 2 + (radius * 0.6) ** 2)) {
            r = bar.color[0]; g = bar.color[1]; b = bar.color[2]
            break
          }
        }
      }
      raw[p++] = r; raw[p++] = g; raw[p++] = b
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8           // bit depth
  ihdr[9] = 2           // color type: RGB
  ihdr[10] = 0          // compression
  ihdr[11] = 0          // filter
  ihdr[12] = 0          // interlace
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

for (const size of [192, 512]) {
  const out = path.join(OUT_DIR, `icon-${size}.png`)
  fs.writeFileSync(out, makeIcon(size))
  console.log(`wrote ${out} (${fs.statSync(out).size} bytes)`)
}
