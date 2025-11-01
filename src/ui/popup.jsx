import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function Popup() {
  const [currentHost, setCurrentHost] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);

  // Get current site and permissions
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.url) return;
      const host = new URL(tab.url).hostname;
      setCurrentHost(host);
      chrome.storage.local.get({ sitesAllowed: [] }, (res) => {
        const allowed = res.sitesAllowed || [];
        setIsEnabled(allowed.includes(host));
      });
    });
  }, []);

  const toggleSite = () => {
    chrome.storage.local.get({ sitesAllowed: [] }, (res) => {
      const sites = new Set(res.sitesAllowed);
      if (sites.has(currentHost)) sites.delete(currentHost);
      else sites.add(currentHost);
      const updated = Array.from(sites);
      chrome.storage.local.set({ sitesAllowed: updated }, () => {
        setIsEnabled(sites.has(currentHost));
      });
    });
  };

  return (
    <div className="p-4 w-64 font-sans">
      <h2 className="text-lg font-bold text-gray-800">🛡️ PixGuard AI</h2>
      <p className="text-xs text-gray-500 mb-3">
        Invisible armor for your photos.
      </p>

      <button
        onClick={toggleSite}
        className={`w-full py-1.5 rounded text-sm font-medium ${
          isEnabled
            ? "bg-red-500 hover:bg-red-600 text-white"
            : "bg-green-500 hover:bg-green-600 text-white"
        }`}
      >
        {isEnabled ? "Disable on this site" : "Enable on this site"}
      </button>

      <div className="mt-3 text-xs text-gray-500 border-t pt-2">
        Site: {currentHost || "loading..."}
      </div>
      <p className="text-[10px] mt-1 text-green-600">
        🔒 Processed locally — No uploads.
      </p>
    </div>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<Popup />);
