// Shared helpers used by all platform adapters.
// Loaded before each adapter via the manifest content_scripts order.

const BRIDGE_URL = "http://127.0.0.1:27842";

window.CrosspostBridge = {
  _currentAdapter: null,

  // ── Image retrieval ──────────────────────────────────────────────────────

  async getNextImage(target) {
    const res = await fetch(`${BRIDGE_URL}/next-image?target=${encodeURIComponent(target)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json(); // { id, filename, localPath, mimeType, targetId }
  },

  // Returns the app-selected image queue for a target platform.
  // Response: { images: [{id, filename, mimeType, targetId}], targetId, limit }
  async getQueuedImages(target) {
    const res = await fetch(`${BRIDGE_URL}/queue?target=${encodeURIComponent(target)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async getImageBlob(imageId) {
    const res = await fetch(`${BRIDGE_URL}/image-file?id=${encodeURIComponent(imageId)}`);
    if (!res.ok) throw new Error(`Could not load image: HTTP ${res.status}`);
    return res.blob();
  },

  // ── Post-record helpers ──────────────────────────────────────────────────

  async markPosted(imageId, targetId) {
    const res = await fetch(`${BRIDGE_URL}/mark-posted`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageId, targetId }),
    });
    if (!res.ok) throw new Error(`Mark posted failed: HTTP ${res.status}`);
    return res.json();
  },

  // Marks an entire batch of images as posted in one request.
  async markAllPosted(imageIds, targetId) {
    const res = await fetch(`${BRIDGE_URL}/mark-all-posted`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageIds, targetId }),
    });
    if (!res.ok) throw new Error(`Mark all posted failed: HTTP ${res.status}`);
    return res.json();
  },

  // Clears the selection queue for a platform after a successful post.
  async clearQueue(target) {
    await fetch(`${BRIDGE_URL}/clear-queue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target }),
    });
  },

  // ── File injection ───────────────────────────────────────────────────────

  // Injects a single Blob into a file <input> in a way that works with React/Vue apps.
  async injectFileIntoInput(inputEl, blob, filename, mimeType) {
    const file = new File([blob], filename, { type: mimeType });
    const dt = new DataTransfer();
    dt.items.add(file);
    // Some React apps intercept the native files setter — set it directly.
    Object.defineProperty(inputEl, "files", { value: dt.files, writable: true, configurable: true });
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    inputEl.dispatchEvent(new InputEvent("input", { bubbles: true }));
  },

  // Injects multiple files into a single <input type="file"> at once.
  // `files` is an array of { blob, filename, mimeType }.
  async injectMultipleFilesIntoInput(inputEl, files) {
    const dt = new DataTransfer();
    for (const { blob, filename, mimeType } of files) {
      dt.items.add(new File([blob], filename, { type: mimeType }));
    }
    Object.defineProperty(inputEl, "files", { value: dt.files, writable: true, configurable: true });
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    inputEl.dispatchEvent(new InputEvent("input", { bubbles: true }));
  },

  // Small toast notification shown on the active page.
  notify(message, type = "info") {
    const existing = document.getElementById("cph-toast");
    if (existing) existing.remove();
    const el = document.createElement("div");
    el.id = "cph-toast";
    const colors = { info: "#6366f1", success: "#22c55e", error: "#ef4444" };
    el.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 2147483647;
      padding: 11px 18px; border-radius: 10px; font-size: 13px; font-weight: 600;
      font-family: system-ui, -apple-system, sans-serif; line-height: 1.4;
      background: ${colors[type] ?? colors.info}; color: #fff;
      box-shadow: 0 4px 20px rgba(0,0,0,0.35); max-width: 320px;
      animation: cph-in 0.2s ease;
    `;
    el.textContent = message;
    const style = document.createElement("style");
    style.textContent = `@keyframes cph-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`;
    document.head.appendChild(style);
    document.body.appendChild(el);
    setTimeout(() => el?.remove(), 4000);
  },

  // Wait for a DOM element matching selector to appear (max waitMs).
  waitForElement(selector, waitMs = 3000) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) { resolve(el); return; }
      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) { observer.disconnect(); resolve(found); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(null); }, waitMs);
    });
  },
};

// Listen for INJECT_IMAGE and MARK_POSTED messages from the popup.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "INJECT_IMAGE") {
    const adapter = window.CrosspostBridge._currentAdapter;
    if (!adapter) { sendResponse({ ok: false, error: "No adapter for this page" }); return; }
    adapter.inject(msg.target)
      .then((result) => sendResponse(result ? { ok: true, ...result } : { ok: false, error: "Injection failed" }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async
  }
  if (msg.type === "MARK_POSTED") {
    window.CrosspostBridge.markPosted(msg.imageId, msg.targetId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
