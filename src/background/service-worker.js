// ===============================
// PixGuard AI - Background Logger & Message Relay
// ===============================

// Listen for messages from content scripts (protect.js)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 🧠 Save protection logs when an image is processed
  if (msg.type === "pixguard_log") {
    const payload = msg.payload;

    chrome.storage.local.get({ logs: [], lastProtection: {}, protectedImageUrl: null }, (res) => {
      const logs = res.logs || [];
      logs.push(payload);

      // Update all relevant storage fields
      chrome.storage.local.set(
        {
          logs,
          lastProtection: payload,
          protectedImageUrl: payload.protectedUrl || res.protectedImageUrl || null,
        },
        () => {
          console.log("🧾 PixGuard log saved:", payload);

          // Notify popup dashboard to update immediately
          chrome.runtime.sendMessage({
            type: "log_updated",
            payload,
          });
        }
      );
    });
  }

  // 🧩 Allow popup to get the latest protection info
  if (msg.type === "get_latest_log") {
    chrome.storage.local.get({ logs: [], lastProtection: {}, protectedImageUrl: null }, (res) => {
      const latest = res.logs.length ? res.logs[res.logs.length - 1] : res.lastProtection || null;
      sendResponse({
        latest,
        protectedImageUrl: res.protectedImageUrl || null,
      });
    });
    return true; // keep sendResponse alive for async response
  }

  // 🧩 Optional: Allow popup to fetch all protection logs
  if (msg.type === "get_all_logs") {
    chrome.storage.local.get({ logs: [] }, (res) => {
      sendResponse({ logs: res.logs });
    });
    return true;
  }
});
