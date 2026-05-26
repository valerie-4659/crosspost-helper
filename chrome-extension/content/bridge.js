// Shared helpers used by all platform adapters.
// Loaded before each adapter via the manifest content_scripts order.

const BRIDGE_URL = "http://127.0.0.1:27842";

// Guard: only register the message listener once per document lifetime.
// X (and other SPAs) re-run content scripts on soft navigation which would
// add a second (third, …) listener — each one calls inject() independently,
// causing duplicate text insertion.
const _bridgeFirstRun = !window.__crosspostBridgeListenerAttached;
window.__crosspostBridgeListenerAttached = true;

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

  // ── AI post content ──────────────────────────────────────────────────────

  // Returns { title?, description, tags[] } if the app pushed AI content, or null.
  async getPostContent(target) {
    const res = await fetch(`${BRIDGE_URL}/post-content?target=${encodeURIComponent(target)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? data.content : null;
  },

  // Fill a text field. Handles both contenteditable divs (X/Twitter, Bluesky)
  // and regular <input>/<textarea> elements.
  // Returns true if the field was filled, false if injection failed.
  async fillTextField(element, text) {
    if (!element) return false;
    try {
      element.focus();
      // Brief pause so the browser registers the focus before execCommand.
      await new Promise((r) => setTimeout(r, 80));

      if (element.isContentEditable) {
        // ── Primary: synthetic ClipboardEvent paste ────────────────────────
        // X's ProseMirror editor has a native "paste" handler that correctly
        // inserts text into its own transaction system and updates React state.
        // This is more reliable than execCommand which can fire React's own
        // insertText handler a second time and produce duplicate output.
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        const pasteEvent = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });

        // First clear any existing content via selectAll + delete
        document.execCommand("selectAll", false, null);
        document.execCommand("delete", false, null);

        element.dispatchEvent(pasteEvent);

        // Give the editor a tick to process the paste event
        await new Promise((r) => setTimeout(r, 50));

        // Verify by checking our text is actually in there
        const inserted = (element.textContent ?? "").replace(/\u200B/g, "").trim();
        if (inserted) return true;

        // ── Fallback: execCommand insertText ──────────────────────────────
        document.execCommand("selectAll", false, null);
        const ok = document.execCommand("insertText", false, text);
        await new Promise((r) => setTimeout(r, 30));
        const afterExec = (element.textContent ?? "").replace(/\u200B/g, "").trim();
        if (afterExec) return true;

        // ── Last resort: innerText + plain input event ────────────────────
        // IMPORTANT: do NOT dispatch InputEvent with data+inputType="insertText" —
        // React editors re-process the `data` field and insert the text a second
        // time, causing duplicated content. A plain "input" event is enough to
        // tell React to re-sync its virtual state from the DOM.
        element.innerText = text;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        return !!(element.innerText || element.textContent);
      }

      // Regular input / textarea — use native setter so React picks up the change.
      const proto = element.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(element, text);
        element.dispatchEvent(new Event("input",  { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  // ── File injection ───────────────────────────────────────────────────────

  // Core helper: sets files on a file input and notifies the owning framework.
  //
  // React 17+ dispatches events to the React root, not document.
  // We call __reactProps.onChange directly (React-internal handler) so React's
  // full synthetic-event pipeline runs.  We use a getter accessor for `files`
  // so the value survives any prototype-chain reads React may do internally.
  //
  // For non-React pages (Vue etc.) we fall back to plain DOM events.
  _injectFilesCore(inputEl, dataTransfer) {
    // Getter accessor — survives prototype-chain reads inside React/browser.
    Object.defineProperty(inputEl, "files", {
      get() { return dataTransfer.files; },
      configurable: true,
    });

    // React 17/18 path: call the handler directly.
    const propsKey = Object.keys(inputEl).find((k) => k.startsWith("__reactProps"));
    if (propsKey && typeof inputEl[propsKey]?.onChange === "function") {
      inputEl[propsKey].onChange({
        target: inputEl,
        currentTarget: inputEl,
        nativeEvent: new Event("change", { bubbles: true }),
        bubbles: true,
        cancelable: false,
        type: "change",
        isDefaultPrevented: () => false,
        isPropagationStopped: () => false,
        preventDefault: () => {},
        stopPropagation: () => {},
        persist: () => {},
      });
      return; // don't also fire native events — that confuses React apps (e.g. closes X compose)
    }

    // Fallback: plain DOM events (Vue / non-React pages).
    inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    inputEl.dispatchEvent(new InputEvent("input", { bubbles: true }));
  },

  // Simulate drag-and-drop of files onto an element.
  // Chrome allows real DataTransfer.files in synthetic DragEvents created via
  // the constructor — making this the most reliable cross-framework injection
  // method for editors that support drag-and-drop (Draft.js, ProseMirror, etc.).
  async dropFilesOnElement(el, fileObjs) {
    const dt = new DataTransfer();
    for (const { blob, filename, mimeType } of fileObjs) {
      dt.items.add(new File([blob], filename, { type: mimeType }));
    }
    const opts = { bubbles: true, cancelable: true, dataTransfer: dt };
    el.dispatchEvent(new DragEvent("dragenter", opts));
    await new Promise((r) => setTimeout(r, 60));
    el.dispatchEvent(new DragEvent("dragover",  opts));
    await new Promise((r) => setTimeout(r, 60));
    el.dispatchEvent(new DragEvent("drop",      opts));
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
// The guard above ensures this block runs only once per document lifetime.
if (_bridgeFirstRun) {
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
}
