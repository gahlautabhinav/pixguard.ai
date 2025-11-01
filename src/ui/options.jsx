import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { extractDCTWatermark } from "../lib/dct.js";

function VerifyTab() {
  const [result, setResult] = useState(null);

  function onDropFile(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const blob = new Blob([ev.target.result]);
      const img = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const bits = extractDCTWatermark(imgData, 8);
      const confidence =
        (bits.filter((b) => b === 1).length / bits.length) * 100;
      setResult({ bits, confidence });
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div className="p-6 font-sans">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">PixGuard Dashboard</h1>
      <p className="text-sm text-gray-500 mb-4">
        Verify your image’s watermark protection below.
      </p>
      <div
        onDrop={onDropFile}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed border-gray-400 p-10 rounded text-center text-gray-600 hover:border-blue-400 transition"
      >
        Drag & drop an image to verify
      </div>

      {result && (
        <div className="mt-4 p-3 border rounded bg-gray-50">
          <h2 className="font-semibold text-gray-700 mb-1">
            ✅ Verified PixGuard Image
          </h2>
          <p className="text-sm text-gray-600">
            Confidence:{" "}
            <span className="font-bold text-green-600">
              {Math.round(result.confidence)}%
            </span>
            <br />
            Bits: {result.bits.join("")}
          </p>
        </div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<VerifyTab />);
