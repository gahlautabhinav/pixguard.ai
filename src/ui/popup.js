// ===============================
// PixGuard AI – Popup Dashboard (with Verify Feature)
// ===============================

import { extractDCTWatermark } from "../lib/dct.js";

const btn = document.getElementById("enableBtn");
const siteInfo = document.getElementById("siteInfo");
const protectionInfo = document.getElementById("protectionInfo");
const verifyInput = document.getElementById("verifyInput");
const verifyResult = document.getElementById("verifyResult");

const downloadBtn = document.getElementById("downloadBtn");
let lastBlobUrl = null;

let currentHost = "";

// -----------------------------
// Load site info
// -----------------------------
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab || !tab.url) return;
  currentHost = new URL(tab.url).hostname;
  siteInfo.textContent = `Site: ${currentHost}`;
  refreshDashboard();
});

// -----------------------------
// Refresh dashboard data
// -----------------------------
function refreshDashboard() {
  chrome.storage.local.get(
    { sitesAllowed: [], lastProtection: {}, protectedImageUrl: null },
    (res) => {
      const allowed = res.sitesAllowed || [];
      const isEnabled = allowed.includes(currentHost);
      updateButton(isEnabled);

      const lp = res.lastProtection;
      if (lp && lp.mode) {
        protectionInfo.innerHTML = `
          ✅ <b>Last Protection</b><br>
          Mode: ${lp.mode}<br>
          Site: ${lp.domain || currentHost}<br>
          Time: ${new Date(lp.timestamp).toLocaleTimeString()}<br>
          Hash: ${lp.hash?.slice(0, 12)}...
        `;
      } else {
        protectionInfo.textContent = "No protections logged yet.";
      }

      // ✅ Show download button if a protected image is stored
      if (res.protectedImageUrl) {
        lastBlobUrl = res.protectedImageUrl;
        downloadBtn.style.display = "block";
      } else {
        downloadBtn.style.display = "none";
      }
    }
  );
}


// -----------------------------
// Enable/Disable toggle
// -----------------------------
function updateButton(isEnabled) {
  if (isEnabled) {
    btn.textContent = "Disable on this site";
    btn.classList.add("enabled");
    btn.classList.remove("disabled");
  } else {
    btn.textContent = "Enable on this site";
    btn.classList.add("disabled");
    btn.classList.remove("enabled");
  }
}

btn.addEventListener("click", () => {
  chrome.storage.local.get({ sitesAllowed: [] }, (res) => {
    const sites = new Set(res.sitesAllowed);
    if (sites.has(currentHost)) sites.delete(currentHost);
    else sites.add(currentHost);
    const updated = Array.from(sites);
    chrome.storage.local.set({ sitesAllowed: updated }, () => {
      updateButton(sites.has(currentHost));
    });
  });
});

// -----------------------------
// 🧠 Verify Image Protection (true/false)
// -----------------------------
verifyInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  verifyResult.textContent = "Analyzing image...";
  verifyResult.className = "";

  try {
    const blob = new Blob([await file.arrayBuffer()]);
    const img = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const { approxString, confidence } = extractDCTWatermark(imgData, 128);
    console.log("🧩 Extract result:", { approxString, confidence });
    const isProtected = approxString.includes("PGv01") && confidence > 40;

    if (isProtected) {
      verifyResult.textContent = "✅ This image is PixGuard protected.";
      verifyResult.classList.add("protected");
    } else {
      verifyResult.textContent =
        "❌ This image is not protected or watermark missing.";
      verifyResult.classList.add("not-protected");
    }
  } catch (err) {
    console.error("Verification error:", err);
    verifyResult.textContent = "❌ Could not analyze image.";
    verifyResult.classList.add("not-protected");
  }
});


// 🧩 Download last protected image
downloadBtn.addEventListener("click", () => {
  if (!lastBlobUrl) {
    alert("No protected image available yet!");
    return;
  }

  chrome.downloads.download({
    url: lastBlobUrl,
    filename: `PixGuard-Protected-${Date.now()}.jpg`,
    saveAs: true,
  });
});


// -----------------------------
// Listen for background updates
// -----------------------------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "log_updated" || msg.type === "pixguard_log") {
    setTimeout(refreshDashboard, 300);
  }
});
