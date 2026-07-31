import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function writePng(filePath, size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
}

function distSeg(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = px - x1;
  const wy = py - y1;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - x1, py - y1);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - x2, py - y2);
  const t = c1 / c2;
  return Math.hypot(px - (x1 + t * vx), py - (y1 + t * vy));
}

function paintIcon(x, y, size) {
  const s = size / 512;
  const px = x / s;
  const py = y / s;
  const rr = 116;
  const cx = Math.min(Math.max(px, rr), 512 - rr);
  const cy = Math.min(Math.max(py, rr), 512 - rr);
  const dx = px - cx;
  const dy = py - cy;
  const outsideCorner =
    dx * dx + dy * dy > rr * rr && (px < rr || px > 512 - rr || py < rr || py > 512 - rr);
  if (outsideCorner) return [0, 0, 0, 0];

  const t = (px * 0.35 + py * 0.65) / 512;
  let r;
  let g;
  let b;
  if (t <= 0.55) {
    const u = t / 0.55;
    r = Math.round(79 + (37 - 79) * u);
    g = Math.round(70 + (99 - 70) * u);
    b = Math.round(229 + (235 - 229) * u);
  } else {
    const u = (t - 0.55) / 0.45;
    r = Math.round(37 + (14 - 37) * u);
    g = Math.round(99 + (165 - 99) * u);
    b = Math.round(235 + (233 - 235) * u);
  }

  const hx = px - 150;
  const hy = py - 120;
  if (hx * hx + hy * hy < 140 * 140) {
    r = Math.min(255, r + 18);
    g = Math.min(255, g + 18);
    b = Math.min(255, b + 18);
  }

  const cardRr = 40;
  const left = 128;
  const top = 112;
  const right = 384;
  const bottom = 400;
  const inBounds = px >= left && px <= right && py >= top && py <= bottom;
  if (inBounds) {
    const ccx = Math.min(Math.max(px, left + cardRr), right - cardRr);
    const ccy = Math.min(Math.max(py, top + cardRr), bottom - cardRr);
    const cdx = px - ccx;
    const cdy = py - ccy;
    const inCard =
      cdx * cdx + cdy * cdy <= cardRr * cardRr ||
      (px > left + cardRr && px < right - cardRr) ||
      (py > top + cardRr && py < bottom - cardRr);
    if (inCard) {
      const ct = (py - top) / (bottom - top);
      r = Math.round(255 - 17 * ct);
      g = Math.round(255 - 13 * ct);
      b = 255;

      const rows = [
        { ry: 168, w: 120, checked: true },
        { ry: 230, w: 96, checked: true },
        { ry: 292, w: 108, checked: false },
      ];
      for (const row of rows) {
        if (px >= 176 && px <= 204 && py >= row.ry && py <= row.ry + 28) {
          if (row.checked) {
            r = 37;
            g = 99;
            b = 235;
          } else {
            r = 226;
            g = 232;
            b = 240;
          }
        }
        if (px >= 220 && px <= 220 + row.w && py >= row.ry + 6 && py <= row.ry + 22) {
          if (row.checked) {
            r = 203;
            g = 213;
            b = 225;
          } else {
            r = 226;
            g = 232;
            b = 240;
          }
        }
        if (row.checked) {
          const d = Math.min(
            distSeg(px, py, 183, row.ry + 14, 188, row.ry + 19),
            distSeg(px, py, 188, row.ry + 19, 199, row.ry + 8)
          );
          if (d < 2.4) {
            r = 255;
            g = 255;
            b = 255;
          }
        }
      }
    }
  }

  const bx = px - 340;
  const by = py - 340;
  if (bx * bx + by * by <= 46 * 46) {
    r = 16;
    g = 185;
    b = 129;
    const d = Math.min(
      distSeg(px, py, 318, 340, 332, 354),
      distSeg(px, py, 332, 354, 364, 322)
    );
    if (d < 7) {
      r = 255;
      g = 255;
      b = 255;
    }
  }

  return [r, g, b, 255];
}

const publicDir = path.resolve('public');
const outputs = [
  { size: 180, name: 'apple-touch-icon.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
];

for (const { size, name } of outputs) {
  const filePath = path.join(publicDir, name);
  writePng(filePath, size, paintIcon);
  console.log('wrote', name);
}
