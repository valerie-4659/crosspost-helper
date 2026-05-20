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

  // Core helper: sets files on a file input and notifies the owning framework.
  //
  // React 17+ changed event delegation from `document` to the React root element,
  // so a plain dispatchEvent('change') on the input is never seen by React's
  // synthetic event system.  The reliable fix is to read the internal
  // __reactProps* key that React attaches to every DOM node and call its
  // onChange handler directly, passing a synthetic-event-shaped object.
  //
  // If the element has no React props (plain HTML or Vue) we fall back to the
  // standard DOM event approach which still works for those frameworks.
  _injectFilesCore(inputEl, dataTransfer) {
    // Override the read-only `files` getter so our DataTransfer is visible.
    Object.defineProperty(inputEl, "files", { value: dataTransfer.files, configurable: true, writable: true });

    // --- React 17 / 18 path ---
    const propsKey = Object.keys(inputEl).find((k) => k.startsWith("__reactProps"));
    if (propsKey && typeof inputEl[propsKey]?.onChange === "function") {
      const nativeEvent = new Event("change", { bubbles: true });
      inputEl[propsKey].onChange({
        target: inputEl,
        currentTarget: inputEl,
        nativeEvent,
        bubbles: true,
        cancelable: false,
        type: "change",
        isDefaultPrevented: () => false,
        isPropagationStopped: () => false,
        preventDefault: () => {},
        stopPropagation: () => {},
        persist: () => {},
      });
      return;
    }

    // --- Fallback: plain DOM events (works for Vue / non-React pages) ---
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    inputEl.dispatchEvent(new InputEvent("input", { bubbles: true }));
  },

  // Injects a single Blob into a file <input>.
  async injectFileIntoInput(inputEl, blob, filename, mimeType) {
    const dt = new DataTransfer();
    dt.items.add(new File([blob], filename, { type: mimeType }));
    this._injectFilesCore(inputEl, dt);
  },

  // Injects multiple files into a single <input type="file"> at once.
  // `files` is an array of { blob, filename, mimeType }.
  async injectMultipleFilesIntoInput(inputEl, files) {
    const dt = new DataTransfer();
    for (const { blob, filename, mimeType } of files) {
      dt.items.add(new File([blob], filename, { type: mimeType }));
    }
    this._injectFilesCore(inputEl, dt);
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
