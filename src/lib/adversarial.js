// src/lib/adversarial.js
// Lightweight Adversarial Agent runtime for PixGuard.
// Exports: applyUniversalMask(imageData, mode, options)
//
// Behavior:
//  - Loads mask tile JSON from assets/masks/<mode>.json
//  - Tiles the tile across target image (fast) and adds scaled offsets to RGB channels
//  - Returns a new ImageData with the perturbation applied


async function _getFetchUrl(path) {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL(path);
    }
  } catch (e) {}
  return path;
}

export async function loadMaskForMode(mode) {
  const modeKey = (mode || 'balanced').toLowerCase();
  const relative = `assets/masks/${modeKey}.json`;
  const url = await _getFetchUrl(relative);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load mask ${modeKey} from ${url} (status ${resp.status})`);
  const json = await resp.json();
  if (!json.w || !json.h || !json.channels || !json.data) {
    throw new Error(`Mask JSON ${modeKey} malformed`);
  }
  return json;
}

function generateTiledMask(maskTile, outW, outH) {
  const { w: mw, h: mh, channels, data } = maskTile;
  const out = new Float32Array(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const ty = y % mh;
    for (let x = 0; x < outW; x++) {
      const tx = x % mw;
      const tileIdx = (ty * mw + tx) * channels;
      const outIdx = (y * outW + x) * 4;
      out[outIdx + 0] = data[tileIdx + 0] ?? 0;
      out[outIdx + 1] = data[tileIdx + 1] ?? 0;
      out[outIdx + 2] = data[tileIdx + 2] ?? 0;
      out[outIdx + 3] = 0;
    }
  }
  return out;
}

export async function applyUniversalMask(imageData, mode = 'balanced', options = {}) {
  const { strengthOverride = null } = options;
  const strengths = { light: 0.5, balanced: 1.0, strong: 2.0 };
  const modeKey = (mode || 'balanced').toLowerCase();
  const baseStrength = strengths[modeKey] ?? strengths['balanced'];
  const strength = (typeof strengthOverride === 'number') ? strengthOverride : baseStrength;

  const maskTile = await loadMaskForMode(modeKey);
  const tiled = generateTiledMask(maskTile, imageData.width, imageData.height);

  const inData = imageData.data;
  const out = new ImageData(imageData.width, imageData.height);
  const outData = out.data;

  for (let i = 0, n = inData.length; i < n; i += 4) {
    const mr = tiled[i + 0] * strength;
    const mg = tiled[i + 1] * strength;
    const mb = tiled[i + 2] * strength;

    outData[i + 0] = Math.min(255, Math.max(0, Math.round(inData[i + 0] + mr)));
    outData[i + 1] = Math.min(255, Math.max(0, Math.round(inData[i + 1] + mg)));
    outData[i + 2] = Math.min(255, Math.max(0, Math.round(inData[i + 2] + mb)));
    outData[i + 3] = inData[i + 3];
  }

  return out;
}
