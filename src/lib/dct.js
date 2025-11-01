// src/lib/dct.js
// 8x8 block DCT/IDCT-based watermark embed + extract
// - embedDCTWatermark(imgData, bitsString)
// - extractDCTWatermark(imgData, expectedBitsLen = 64)
//
// Notes:
//  - We convert RGB -> Y (luminance), operate on Y only (imperceptible).
//  - We modify one mid-frequency DCT coefficient (u=3, v=2) per block by +/- alpha.
//  - bitsString is an arbitrary JS string; embed converts it to bytes (8 bits/char).
//  - extractor returns an object: { bits, approxString, confidence }.

const BLOCK = 8;

// precompute DCT basis (cosines) and alpha scaling
const C = new Array(BLOCK);
for (let i = 0; i < BLOCK; i++) {
  C[i] = new Array(BLOCK);
  for (let j = 0; j < BLOCK; j++) {
    C[i][j] = Math.cos(((2 * i + 1) * j * Math.PI) / (2 * BLOCK));
  }
}

// normalization factor
function alphaCoef(u) { return u === 0 ? 1 / Math.sqrt(2) : 1; }

// DCT-II on an 8x8 block (input array of length 64)
function dct8(block) {
  // block is array indexed by y*8 + x
  const out = new Float32Array(64);
  for (let v = 0; v < BLOCK; v++) {
    for (let u = 0; u < BLOCK; u++) {
      let sum = 0;
      for (let y = 0; y < BLOCK; y++) {
        for (let x = 0; x < BLOCK; x++) {
          const val = block[y * BLOCK + x];
          sum += val * C[y][u] * C[x][v];
        }
      }
      const scale = 0.25 * alphaCoef(u) * alphaCoef(v);
      out[v * BLOCK + u] = scale * sum;
    }
  }
  return out;
}

// IDCT (inverse DCT) on 8x8 block
function idct8(coefs) {
  const out = new Float32Array(64);
  for (let y = 0; y < BLOCK; y++) {
    for (let x = 0; x < BLOCK; x++) {
      let sum = 0;
      for (let v = 0; v < BLOCK; v++) {
        for (let u = 0; u < BLOCK; u++) {
          const scale = alphaCoef(u) * alphaCoef(v);
          sum += scale * coefs[v * BLOCK + u] * C[y][u] * C[x][v];
        }
      }
      out[y * BLOCK + x] = 0.25 * sum;
    }
  }
  return out;
}

function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function rgbToY(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function yToRgbDelta(origR, origG, origB, deltaY) {
  // We approximate adding delta to luminance by adding it equally to R,G,B channels
  // (not exact but simple and imperceptible for small deltas)
  return [
    clamp(origR + deltaY),
    clamp(origG + deltaY),
    clamp(origB + deltaY)
  ];
}

function stringToBitArray(s) {
  const bits = [];
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    for (let b = 7; b >= 0; b--) bits.push((code >> b) & 1);
  }
  return bits;
}

function bitsToString(bits) {
  let chars = [];
  for (let i = 0; i + 7 < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] & 1);
    if (byte === 0) break; // stop on NUL
    chars.push(String.fromCharCode(byte));
  }
  return chars.join('');
}

// Embed bitsString into imageData; returns modified ImageData (in-place)
export function embedDCTWatermark(imgData, bitsString) {
  const w = imgData.width, h = imgData.height;
  const data = imgData.data;
  // convert string -> bits (8 bits per char)
  const bits = stringToBitArray(bitsString);
  if (bits.length === 0) return imgData;

  // choose coefficient position (u,v) mid-frequency
  const uPos = 3, vPos = 2; // mid-frequency
  const alpha = 8.0; // coefficient delta magnitude (tuneable: 4..12)

  let bitIndex = 0;
  // iterate blocks
  for (let by = 0; by < h; by += BLOCK) {
    for (let bx = 0; bx < w; bx += BLOCK) {
      if (bitIndex >= bits.length) break;

      // collect Y channel block
      const block = new Float32Array(64);
      let idx = 0;
      for (let y = 0; y < BLOCK; y++) {
        for (let x = 0; x < BLOCK; x++) {
          const px = bx + x, py = by + y;
          if (px >= w || py >= h) {
            block[idx++] = 0; // pad
            continue;
          }
          const i = (py * w + px) * 4;
          block[idx++] = rgbToY(data[i], data[i + 1], data[i + 2]) - 128; // center around zero
        }
      }

      // DCT
      const coefs = dct8(block);

      // embed: shift chosen coefficient by +/-alpha
      const bit = bits[bitIndex++] ? 1 : 0;
      const sign = bit === 1 ? 1 : -1;
      coefs[vPos * BLOCK + uPos] = coefs[vPos * BLOCK + uPos] + sign * alpha;

      // IDCT
      const modified = idct8(coefs);

      // write back by adding luminance delta to R,G,B
      idx = 0;
      for (let y = 0; y < BLOCK; y++) {
        for (let x = 0; x < BLOCK; x++) {
          const px = bx + x, py = by + y;
          if (px >= w || py >= h) { idx++; continue; }
          const i = (py * w + px) * 4;
          // original luminance (centered) = block[idx]; new luminance = modified[idx]
          const origY = block[idx] + 128;
          const newY = modified[idx] + 128;
          const deltaY = newY - origY;
          const [r2, g2, b2] = yToRgbDelta(data[i], data[i + 1], data[i + 2], deltaY);
          data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
          idx++;
        }
      }
    }
    if (bitIndex >= bits.length) break;
  }

  return imgData;
}


// Extract watermark bits. Returns { bits, approxString, confidence }
// expectedBitsLen: how many bits to try to extract (defaults 64)
export function extractDCTWatermark(imgData, expectedBitsLen = 64) {
  const w = imgData.width, h = imgData.height;
  const data = imgData.data;

  const uPos = 3, vPos = 2;
  const coefsList = [];
  const blockPositions = [];

  // iterate blocks and read the target coefficient
  for (let by = 0; by < h; by += BLOCK) {
    for (let bx = 0; bx < w; bx += BLOCK) {
      // build block (Y centered)
      const block = new Float32Array(64);
      let idx = 0;
      for (let y = 0; y < BLOCK; y++) {
        for (let x = 0; x < BLOCK; x++) {
          const px = bx + x, py = by + y;
          if (px >= w || py >= h) {
            block[idx++] = 0;
            continue;
          }
          const i = (py * w + px) * 4;
          block[idx++] = rgbToY(data[i], data[i + 1], data[i + 2]) - 128;
        }
      }
      const coefs = dct8(block);
      coefsList.push(coefs[vPos * BLOCK + uPos]);
      blockPositions.push([bx, by]);
      if (coefsList.length >= expectedBitsLen) break;
    }
    if (coefsList.length >= expectedBitsLen) break;
  }

  if (coefsList.length === 0) return { bits: [], approxString: '', confidence: 0 };

  // compute median to decide sign threshold
  const sorted = Array.from(coefsList).slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // threshold: look for strong deviations from median (> eps)
  const eps = Math.max(1.0, Math.abs(median) * 0.05); // epsilon adaptive

  const bits = coefsList.map(c => (c - median) > 0 ? 1 : 0);

  // compute confidence: fraction of coefficients with magnitude diff > eps
  let strong = 0;
  for (let i = 0; i < coefsList.length; i++) {
    if (Math.abs(coefsList[i] - median) > eps) strong++;
  }
  const confidence = Math.round((strong / coefsList.length) * 100);

  // convert bits -> approximate string (8-bit ASCII groups)
  const approxString = bitsToString(bits);

  return { bits, approxString, confidence };
}

export default {
  embedDCTWatermark,
  extractDCTWatermark
};
