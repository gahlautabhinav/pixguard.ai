// ===============================
// PixGuard AI – Upload Interceptor (Final Stable & CSP-Safe Version)
// ===============================

import { protectImage } from '../lib/protect.js';

// Accepted image types for processing
const acceptedTypes = ['image/png', 'image/jpeg', 'image/webp'];

// ---------------------------------------
// 🧠 Attach PixGuard protection to <input type="file">
// ---------------------------------------
function handleFileInput(fileInput) {
  // Prevent duplicate bindings
  if (fileInput.__pixguard_bound) return;
  fileInput.__pixguard_bound = true;

  fileInput.addEventListener('change', async (e) => {
    // Prevent infinite recursion from re-triggered events
    if (fileInput.__pg_busy) return;
    fileInput.__pg_busy = true;

    const files = Array.from(fileInput.files || []);
    const imageFiles = files.filter(f => acceptedTypes.includes(f.type));

    if (!imageFiles.length) {
      fileInput.__pg_busy = false;
      return;
    }

    const original = imageFiles[0];
    console.log(`🧠 PixGuard: Protecting image "${original.name}"`);

    try {
      // Run the protection pipeline (face detect + watermark + noise mask)
      const protectedBlob = await protectImage(original);
      const newFile = new File([protectedBlob], original.name, { type: protectedBlob.type });

      // ✅ Create a new DataTransfer for the processed file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(newFile);

      // ✅ Replace safely: avoid redefining fileInput.files
      try {
        fileInput.value = ''; // clear old selection
        fileInput.files = dataTransfer.files; // works in most browsers
      } catch (err) {
        console.warn('⚠️ Direct assignment blocked. Using clone fallback.', err);
        const clone = fileInput.cloneNode();
        // attempt assignment on clone
        try {
          clone.files = dataTransfer.files;
        } catch (e2) {
          console.warn('⚠️ Clone assignment failed too; leaving as-is.', e2);
        }
        fileInput.parentNode.replaceChild(clone, fileInput);
      }

      // Trigger new synthetic change event so page upload continues normally
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));

      console.log('✅ PixGuard: Protected image replaced and ready for upload.');
    } catch (err) {
      console.error('❌ PixGuard protectImage error:', err);
    } finally {
      // Release the lock after short delay
      setTimeout(() => {
        fileInput.__pg_busy = false;
      }, 250);
    }
  });
}

// ---------------------------------------
// 🔍 Scan for existing file inputs
// ---------------------------------------
function scanAndAttach(root = document) {
  const inputs = root.querySelectorAll('input[type="file"]');
  if (!inputs.length) return;
  inputs.forEach(handleFileInput);
}

// ---------------------------------------
// 🪄 Observe DOM for dynamically added inputs
// ---------------------------------------
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.tagName === 'INPUT' && node.type === 'file') {
        handleFileInput(node);
      } else {
        scanAndAttach(node);
      }
    }
  }
});

// ---------------------------------------
// 🚀 Initialize PixGuard interception
// ---------------------------------------
try {
  scanAndAttach();
  observer.observe(document, { childList: true, subtree: true });
  console.log('🧩 PixGuard content script active (upload interceptor running)');
} catch (err) {
  console.error('❌ PixGuard initialization failed:', err);
}
