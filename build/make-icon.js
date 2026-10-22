// Draws the Tack icon (violet rounded square with a check mark) and writes build/icon.ico.
// No dependencies: rasterizes with 4x4 supersampling and encodes PNGs with zlib.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 4, s = size / 256;
  const r = 56 * s, inset = 8 * s;
  const top = [0x9a, 0x97, 0xff], bot = [0x5b, 0x5b, 0xd6];
  // Check mark polyline in 256-space
  const pts = [[74, 134], [112, 172], [184, 92]].map(([x, y]) => [x * s, y * s]);
  const stroke = 22 * s;
  const distSeg = (x, y, [ax, ay], [bx, by]) => {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
  };
  const inRound = (x, y) => {
    const a = inset, b = size - inset;
    if (x < a || x > b || y < a || y > b) return false;
    const cx = Math.max(a + r, Math.min(b - r, x)), cy = Math.max(a + r, Math.min(b - r, y));
    return Math.hypot(x - cx, y - cy) <= r;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let cover = 0, check = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const fx = x + (sx + .5) / SS, fy = y + (sy + .5) / SS;
      if (!inRound(fx, fy)) continue;
      cover++;
      if (Math.min(distSeg(fx, fy, pts[0], pts[1]), distSeg(fx, fy, pts[1], pts[2])) <= stroke / 2) check++;
    }
    const n = SS * SS, i = (y * size + x) * 4, t = y / size;
    const bg = top.map((c, k) => c + (bot[k] - c) * t);
    const cf = cover ? check / cover : 0;
    for (let k = 0; k < 3; k++) px[i + k] = Math.round(bg[k] * (1 - cf) + 255 * cf);
    px[i + 3] = Math.round(255 * cover / n);
  }
  return px;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map(sz => png(sz, render(sz)));
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = sizes.map((sz, i) => {
  const e = Buffer.alloc(16);
  e[0] = sz % 256; e[1] = sz % 256; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(images[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return e;
});
fs.writeFileSync(path.join(__dirname, 'icon.ico'), Buffer.concat([header, ...dir, ...images]));
fs.writeFileSync(path.join(__dirname, 'icon.png'), images[images.length - 1]);
console.log('wrote build/icon.ico');
