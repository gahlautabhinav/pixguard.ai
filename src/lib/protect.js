// src/lib/protect.js
// ===============================
// PixGuard AI – Core Protection Logic (robust + fallback)
// NOTE: Mask perturbation is applied BEFORE embedding the DCT watermark.
// ===============================

import * as faceapi from 'face-api.js';
import { embedDCTWatermark } from './dct.js';
import { applyUniversalMask } from './adversarial.js'; // new: adversarial runtime
// NOTE: removed direct MASKS usage here in favor of applyUniversalMask

// ---------------------------
// Helpers / config
// ---------------------------
function getModelBaseUrl() {
  // 1) Safe chrome.runtime.getURL usage - falls back to relative ./models/ when not available
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
    // ensure trailing slash
    const u = chrome.runtime.getURL('models/');
    return u.endsWith('/') ? u : (u + '/');
  }
  // fallback for local testing (trial.html served locally)
  return './models/';
}

const CDN_MODEL_BASE = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/';

// ---------------------------
// 1. Load face models (safe + CDN fallback)
// ---------------------------
export async function loadFaceModels() {
  if (window.__pg_face_models_loaded) return;
  const localBase = getModelBaseUrl();

  try {
    console.log('📦 PixGuard: Loading models from (local):', localBase);
    // face-api.js expects the path that has files like ssd_mobilenetv1_model-weights_manifest.json etc.
    await faceapi.nets.ssdMobilenetv1.loadFromUri(localBase);
    await faceapi.nets.faceLandmark68Net.loadFromUri(localBase);
    window.__pg_face_models_loaded = true;
    console.log('✅ PixGuard: Face detection models loaded locally.');
    return;
  } catch (errLocal) {
    console.warn('⚠️ PixGuard: Local model load failed (maybe CSP or files missing). Falling back to CDN. Error:', errLocal);
  }

  // try CDN fallback
  try {
    console.log('📦 PixGuard: Loading models from CDN:', CDN_MODEL_BASE);
    await faceapi.nets.ssdMobilenetv1.loadFromUri(CDN_MODEL_BASE);
    await faceapi.nets.faceLandmark68Net.loadFromUri(CDN_MODEL_BASE);
    window.__pg_face_models_loaded = true;
    console.log('✅ PixGuard: Face detection models loaded from CDN.');
    return;
  } catch (errCdn) {
    console.error('❌ PixGuard: Failed to load face models from CDN too:', errCdn);
    throw new Error('Face model load failed (local & CDN).');
  }
}

// ---------------------------
// 2. Image conversion helpers (createImageBitmap fallback)
// ---------------------------
async function fileToImageBitmap(file) {
  // Accept File/Blob and return HTMLCanvasElement/HTMLImageElement or ImageBitmap depending on usage
  const blob = file instanceof Blob ? file : new Blob([file], { type: file.type || 'image/jpeg' });

  // Prefer createImageBitmap when available
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return bitmap;
    } catch (e) {
      // fallback to image element below
      console.warn('PixGuard: createImageBitmap failed, falling back to Image element:', e);
    }
  }

  // Fallback: load into HTMLImageElement and draw on canvas
  return await new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      res(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      rej(err);
    };
    img.src = url;
  });
}

function canvasFromImageSource(src) {
  // src can be ImageBitmap or HTMLImageElement or HTMLCanvasElement
  if (src instanceof HTMLCanvasElement) return src;
  const c = document.createElement('canvas');
  // for ImageBitmap use width/height, for HTMLImageElement width/height properties too
  c.width = src.width || src.naturalWidth;
  c.height = src.height || src.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  return c;
}

function computeArea(box) {
  if (!box) return 0;
  return (box.width || 0) * (box.height || 0);
}

function policyFromScore(score) {
  if (score < 0.1) return 'Light';
  if (score < 0.4) return 'Balanced';
  return 'Strong';
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

// ---------------------------
// 3. Main: protectImage(file)
// ---------------------------
export async function protectImage(file) {
  if (!file) throw new Error('protectImage: file required');

  console.log('🧠 PixGuard: Protecting image', file.name || '(unnamed)');

  // Ensure models are ready
  await loadFaceModels();

  // Convert file -> ImageBitmap or HTMLImageElement
  const imgSource = await fileToImageBitmap(file);
  const canvas = canvasFromImageSource(imgSource);

  // face-api expects HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | tf.Tensor3D
  // we pass canvas which is supported
  let detections = [];
  try {
    detections = await faceapi.detectAllFaces(canvas);
  } catch (errDetect) {
    console.warn('PixGuard: detectAllFaces error', errDetect);
    // try different input (convert canvas to image element)
    try {
      const imgEl = new Image();
      imgEl.src = canvas.toDataURL('image/png');
      await new Promise(r => (imgEl.onload = r));
      detections = await faceapi.detectAllFaces(imgEl);
    } catch (err2) {
      console.error('PixGuard: face detection failed completely:', err2);
      detections = [];
    }
  }

  const totalFaceArea = detections.reduce((acc, d) => acc + computeArea(d.box), 0);
  const imgArea = (canvas.width || 0) * (canvas.height || 0);
  const morphability = imgArea ? totalFaceArea / imgArea : 0;
  const mode = policyFromScore(morphability);

  console.log(`🧩 PixGuard: Detected ${detections.length} face(s). Mode: ${mode} (score ${morphability.toFixed(3)})`);

  // Create an editable canvas (Offscreen if available)
  let offCanvas, offCtx;
  if (typeof OffscreenCanvas !== 'undefined') {
    offCanvas = new OffscreenCanvas(canvas.width, canvas.height);
    offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    offCtx.drawImage(imgSource, 0, 0);
  } else {
    offCanvas = document.createElement('canvas');
    offCanvas.width = canvas.width;
    offCanvas.height = canvas.height;
    offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    offCtx.drawImage(imgSource, 0, 0);
  }

  // Read image data (we will apply mask first, then watermark)
  const imgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);

  // ---------------------------
  // APPLY ADVERSARIAL MASK FIRST (using applyUniversalMask)
  // ---------------------------
  try {
    // Map the mode to a strength similar to your previous inline values:
    const strengthMap = { Light: 0.3, Balanced: 0.6, Strong: 1.0 };
    const strengthOverride = strengthMap[mode] ?? 0.6;

    // applyUniversalMask returns a new ImageData with mask applied
    const maskedImageData = await applyUniversalMask(imgData, mode, { strengthOverride });

    // Put masked image back on canvas for subsequent watermark embedding
    offCtx.putImageData(maskedImageData, 0, 0);
  } catch (errMask) {
    console.warn('PixGuard: error applying universal mask:', errMask);
    // fallback: write original imgData back (no mask applied)
    try {
      offCtx.putImageData(imgData, 0, 0);
    } catch (e) {
      console.warn('PixGuard: failed to write fallback imageData to canvas:', e);
    }
  }

  // ---------------------------
  // EMBED DCT WATERMARK (after mask)
  // ---------------------------
  // Re-read the (masked) image data to pass to embedDCTWatermark (ensures watermark is embedded into masked pixels)
  const maskedImgData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);

  // Generate watermark bits (same pattern as before)
  const watermarkBits = 'PGv01' + Math.random().toString(36).slice(2, 8);

  // Embed the watermark into the masked image data
  let imgDataWithWatermark;
  try {
    imgDataWithWatermark = embedDCTWatermark(maskedImgData, watermarkBits);
  } catch (errEmbed) {
    console.error('PixGuard: embedDCTWatermark failed:', errEmbed);
    // fallback: continue with maskedImgData if embed fails
    imgDataWithWatermark = maskedImgData;
  }

  // Put the watermarked result back onto the off-canvas
  offCtx.putImageData(imgDataWithWatermark, 0, 0);

  // ---------------------------
  // Convert to Blob (works for OffscreenCanvas and HTMLCanvas)
  // ---------------------------
  let outBlob;
  if (offCanvas instanceof OffscreenCanvas) {
    outBlob = await offCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  } else {
    outBlob = await new Promise((res) => offCanvas.toBlob(res, 'image/jpeg', 0.92));
  }

  // Compute SHA-256 hash of final image bytes
  const buffer = await outBlob.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
  const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Prepare data for popup / storage
  const dataUrl = await blobToDataURL(outBlob);
  const blobUrl = URL.createObjectURL(outBlob);
  const domain = (typeof location !== 'undefined' && location.hostname) ? location.hostname : 'local';

  // Save last result for popup / dashboard (small images ok for hackathon)
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({
        protectedImageUrl: blobUrl,
        lastProtection: {
          timestamp: new Date().toISOString(),
          domain,
          mode,
          hash: hashHex
        }
      });
    }
  } catch (e) {
    console.warn('PixGuard: chrome.storage not available (local test):', e);
  }

  // Send a log to background/service worker (if available)
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'pixguard_log',
        payload: {
          timestamp: new Date().toISOString(),
          domain,
          mode,
          hash: hashHex,
          watermarkBits,
          dataUrl,
          protectedUrl: blobUrl
        }
      });
    }
  } catch (e) {
    console.warn('PixGuard: chrome.runtime.sendMessage failed (maybe local test):', e);
  }

  console.log('✅ PixGuard: Image protected [' + mode + ']');
  console.log('🔢 Hash:', hashHex);

  return outBlob;
}
