// The Picture That Tastes of One — a steaming bowl of ramen.
// Pure Node stdlib: own PNG encoder (zlib), own raster primitives.
// Deterministic: fixed-seed PRNG, no Math.random, no network, no image API.
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 1024, H = 1024;

// ---------- deterministic PRNG (mulberry32) ----------
let _s = 0x9e3779b9;
function rnd() {
  _s |= 0; _s = (_s + 0x6d2b79f5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rr(a, b) { return a + rnd() * (b - a); }

// ---------- pixel buffer ----------
const px = new Uint8Array(W * H * 4);
function setPx(x, y, r, g, b, a = 1) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  if (a >= 1) { px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; return; }
  const ia = 1 - a;
  px[i] = Math.round(r * a + px[i] * ia);
  px[i + 1] = Math.round(g * a + px[i + 1] * ia);
  px[i + 2] = Math.round(b * a + px[i + 2] * ia);
  px[i + 3] = 255;
}
function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) {
  const a = hex(c1), b = hex(c2);
  return [lerp(a[0], b[0], t) | 0, lerp(a[1], b[1], t) | 0, lerp(a[2], b[2], t) | 0];
}
function fillRect(x0, y0, x1, y1, c, a = 1) {
  const col = hex(c);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) setPx(x, y, col[0], col[1], col[2], a);
}
function fillCircle(cx, cy, r, c, a = 1) {
  const col = hex(c);
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) setPx(x, y, col[0], col[1], col[2], a);
    }
}
function fillEllipse(cx, cy, rx, ry, c, a = 1) {
  const col = hex(c);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPx(x, y, col[0], col[1], col[2], a);
    }
}
// radial gradient ellipse
function gradEllipse(cx, cy, rx, ry, cIn, cOut, a = 1) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 1) {
        const col = mix(cIn, cOut, Math.sqrt(d));
        setPx(x, y, col[0], col[1], col[2], a);
      }
    }
}
function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}
// thick line via circle stamps
function thickLine(x0, y0, x1, y1, w, c, a = 1) {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.ceil(Math.hypot(dx, dy) / Math.max(1, w * 0.4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    fillCircle(x0 + dx * t, y0 + dy * t, w / 2, c, a);
  }
}
// wavy noodle strand, clipped to broth ellipse
function noodle(x0, y0, x1, y1, amp, w, c, a = 1) {
  const col = hex(c);
  const n = 140;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = lerp(x0, x1, t);
    const y = lerp(y0, y1, t) + Math.sin(t * Math.PI * 3.2 + amp * 6) * amp;
    if (inEllipse(x, y, 512, 512, 300, 96)) {
      for (let oy = -w / 2; oy <= w / 2; oy++)
        for (let ox = -w / 2; ox <= w / 2; ox++)
          if (ox * ox + oy * oy <= (w / 2) * (w / 2) && inEllipse(x + ox, y + oy, 512, 512, 300, 96))
            setPx(Math.round(x + ox), Math.round(y + oy), col[0], col[1], col[2], a);
    }
  }
}
// rounded rect (filled)
function roundRect(x0, y0, x1, y1, r, c, a = 1) {
  const col = hex(c);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    let ok = true;
    const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
    const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > r * r) ok = false;
    if (ok) setPx(x, y, col[0], col[1], col[2], a);
  }
}

// ================= SCENE =================
// 1. warm dark backdrop + wooden table
for (let y = 0; y < H; y++) {
  const t = y / H;
  const col = mix("#2A1A10", "#4A2E1B", t);
  for (let x = 0; x < W; x++) setPx(x, y, col[0], col[1], col[2]);
}
// soft warm light from top-left
gradEllipse(330, 210, 640, 480, "#8A5A2E", "#000000", 0.28);
// wood plank lines + grain noise
for (let i = 0; i < 5; i++) {
  const y = 620 + i * 82;
  thickLine(0, y, W, y + 6, 3, "#1E1209", 0.35);
}
for (let i = 0; i < 2600; i++) {
  const x = rr(0, W), y = rr(560, H);
  setPx(x | 0, y | 0, 30, 18, 8, rr(0.05, 0.22));
  setPx((x + rr(-3, 3)) | 0, y | 0, 150, 100, 55, rr(0.03, 0.12));
}

// 2. steam (behind bowl top, soft white wisps)
for (let s = 0; s < 4; s++) {
  const bx = 400 + s * 78;
  for (let i = 0; i < 260; i++) {
    const t = i / 260;
    const y = 470 - t * 250;
    const x = bx + Math.sin(t * 9 + s * 2.1) * (14 + t * 34) + rr(-4, 4);
    fillCircle(x, y, rr(7, 15), "#FFFFFF", 0.05 + (1 - t) * 0.05);
  }
}

// 3. bowl body — blue-white ceramic, big and centred
gradEllipse(512, 640, 352, 205, "#3A5A7E", "#1E3250");          // body
fillEllipse(512, 640, 352, 205, "#2E4A6B", 0);                  // (no-op keep)
// bowl foot
fillEllipse(512, 836, 150, 34, "#1B2E47");
fillEllipse(512, 830, 150, 30, "#27405F");
// blue band pattern on body
for (let i = 0; i < 26; i++) {
  const a = (i / 26) * Math.PI * 2;
  const x = 512 + Math.cos(a) * 300, y = 660 + Math.sin(a) * 150;
  if (y > 560 && y < 800) fillCircle(x, y, 7, "#D8E4F0", 0.5);
}
thickLine(170, 700, 854, 700, 4, "#D8E4F0", 0.35);

// 4. rim — cream ceramic ring
fillEllipse(512, 512, 344, 118, "#F5EFE0");
fillEllipse(512, 512, 330, 108, "#E8DCC2");
// 5. broth — rich amber radial gradient
gradEllipse(512, 512, 300, 96, "#E8A83E", "#8A4A12");
// broth oil sheen
for (let i = 0; i < 46; i++) {
  const a = rr(0, Math.PI * 2), d = rr(0.15, 0.9);
  const x = 512 + Math.cos(a) * 300 * d, y = 512 + Math.sin(a) * 96 * d;
  fillCircle(x, y, rr(3, 9), "#F2C14E", rr(0.15, 0.4));
}

// 6. noodles — golden wavy strands across the broth
const noodleCols = ["#F2C14E", "#E8B13C", "#F7D774", "#DFA52E"];
for (let i = 0; i < 26; i++) {
  const y = 452 + (i / 26) * 118 + rr(-6, 6);
  const x0 = 240 + rr(0, 60), x1 = 790 - rr(0, 60);
  noodle(x0, y, x1, y + rr(-14, 14), rr(4, 9), rr(7, 11), noodleCols[i % 4]);
  // highlight thread on top of each strand
  noodle(x0 + 4, y - 3, x1, y - 3 + rr(-8, 8), rr(3, 6), 3, "#FBE08A", 0.7);
}

// 7. nori — dark sheet, right side, tilted
roundRect(690, 430, 800, 560, 14, "#16241C");
roundRect(696, 436, 794, 554, 10, "#1E3226");
for (let i = 0; i < 60; i++) setPx((rr(700, 790)) | 0, (rr(440, 550)) | 0, 70, 110, 80, 0.35);

// 8. ajitama egg — left of centre, glossy yolk
gradEllipse(392, 478, 92, 58, "#FBF7EC", "#E4D8BC");
gradEllipse(392, 478, 44, 34, "#F6C93A", "#D98E12");
fillEllipse(376, 466, 16, 10, "#FBE08A", 0.85);   // yolk highlight
fillEllipse(360, 452, 26, 12, "#FFFFFF", 0.35);   // white sheen

// 9. green onions — scattered fresh rings
for (let i = 0; i < 34; i++) {
  const a = rr(0, Math.PI * 2), d = rr(0.25, 0.92);
  const x = 512 + Math.cos(a) * 290 * d, y = 512 + Math.sin(a) * 88 * d;
  if (inEllipse(x, y, 392, 478, 96, 62)) continue; // keep off the egg
  if (x > 690 && x < 800 && y > 430 && y < 560) continue; // keep off nori
  fillCircle(x, y, rr(7, 11), "#4E7A3A");
  fillCircle(x - 1, y - 1, rr(3, 5), "#7BAE56");
  fillCircle(x + 2, y + 2, 2, "#DCE8B0", 0.8);
}

// 10. chashu hint — a warm pink-brown slice peeking under noodles, lower right
gradEllipse(600, 556, 66, 30, "#C98A6B", "#8A4A2E");
fillEllipse(600, 556, 66, 30, "#000000", 0);
thickLine(545, 540, 655, 570, 3, "#E8B89A", 0.5);

// 11. chopsticks — wooden, resting on the rim, upper right
thickLine(700, 392, 985, 330, 13, "#8A5A2E");
thickLine(716, 424, 990, 372, 13, "#7A4E26");
thickLine(700, 392, 985, 330, 4, "#C08A4E", 0.6);

// 12. highlights — glossy light on broth + rim
fillEllipse(430, 470, 90, 22, "#FFFFFF", 0.16);
fillEllipse(300, 470, 120, 16, "#FFFFFF", 0.12);
fillEllipse(512, 420, 200, 14, "#FFFFFF", 0.10);

// 13. vignette — darken corners gently
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (x - 512) / 512, dy = (y - 512) / 512;
  const d = dx * dx + dy * dy;
  if (d > 0.72) {
    const a = Math.min(0.32, (d - 0.72) * 0.55);
    const i = (y * W + x) * 4;
    px[i] = Math.round(px[i] * (1 - a));
    px[i + 1] = Math.round(px[i + 1] * (1 - a));
    px[i + 2] = Math.round(px[i + 2] * (1 - a));
  }
}

// ================= PNG ENCODER =================
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // filter none
    raw.set(px.subarray(y * W * 4, (y + 1) * W * 4), y * (1 + W * 4) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "entry.png");
writeFileSync(outPath, encodePNG());
console.log("wrote", outPath);
void dirname; void fileURLToPath;
