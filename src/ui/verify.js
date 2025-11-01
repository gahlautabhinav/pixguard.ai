// src/ui/verify.js
// Assumes extractDCTWatermark is exported in ../lib/dct.js and bundled during build
(async function(){
  const drop = document.getElementById('drop');
  const fileInput = document.getElementById('file');
  const resultEl = document.getElementById('result');

  function showResult(img, res) {
    resultEl.innerHTML = `
      <div><b>Confidence:</b> ${res.confidence}%</div>
      <div><b>Bits (first 64):</b> ${res.bits.slice(0,64).join('')}</div>
      <div><b>Approx text:</b> ${res.approxString || '(none)'}</div>
    `;
    if (img) {
      const p = document.createElement('img');
      p.className = 'preview';
      p.src = img.src;
      resultEl.appendChild(p);
    }
  }

  function handleFile(f) {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const img = new Image();
      img.onload = async () => {
        // draw to canvas
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img,0,0);
        const imgData = ctx.getImageData(0,0,c.width,c.height);
        // call extractor (assumes global function from bundled dct.js)
        if (typeof extractDCTWatermark !== 'function') {
          resultEl.textContent = 'extractDCTWatermark not available. Make sure dct.js is bundled.';
          return;
        }
        const res = extractDCTWatermark(imgData, 64);
        showResult(img, res);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  }

  drop.addEventListener('dragover', (e)=>{ e.preventDefault(); drop.style.borderColor = '#66aaff'; });
  drop.addEventListener('dragleave', ()=>{ drop.style.borderColor = '#ccc'; });
  drop.addEventListener('drop', (e)=>{ e.preventDefault(); drop.style.borderColor = '#ccc'; const f = e.dataTransfer.files[0]; if (f) handleFile(f); });

  fileInput.addEventListener('change', (e)=>{ const f = e.target.files[0]; if (f) handleFile(f); });

})();
