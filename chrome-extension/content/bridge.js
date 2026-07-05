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
    const res = await fetch(`${BRIDGE_URL}/next-image?target=${encodeURIComponent(target)}`, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json(); // { id, filename, localPath, mimeType, targetId }
  },

  // Returns the app-selected image queue for a target platform.
  // Response: { images: [{id, filename, mimeType, targetId}], targetId, limit }
  async getQueuedImages(target) {
    const res = await fetch(`${BRIDGE_URL}/queue?target=${encodeURIComponent(target)}`, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async getImageBlob(imageId) {
    const res = await fetch(`${BRIDGE_URL}/image-file?id=${encodeURIComponent(imageId)}`, { cache: "no-store" });
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
    const res = await fetch(`${BRIDGE_URL}/post-content?target=${encodeURIComponent(target)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? data.content : null;
  },

  // Fill a text field. Handles both contenteditable divs (X/Bluesky Lexical/ProseMirror)
  // and regular <input>/<textarea> elements.
  // Returns true if the field was filled, false if all attempts failed.
  async fillTextField(element, text) {
    if (!element || !text) return false;

    // Helper: re-focus the element and wait for the browser to register it.
    // Critical: execCommand always acts on the CURRENTLY FOCUSED element, so
    // losing focus between calls causes insertions to land in the wrong place.
    const refocus = async (ms = 80) => {
      element.focus();
      await new Promise((r) => setTimeout(r, ms));
    };

    // Helper: returns the current visible text content, stripped of ZWS / whitespace.
    const getContent = () =>
      (element.textContent ?? "").replace(/\u200B/g, "").replace(/\s+/g, " ").trim();

    // Helper: select all children using the Selection API (more reliable than
    // execCommand("selectAll") when the editor intercepts that command).
    const selectAll = () => {
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch {
        document.execCommand("selectAll", false, null);
      }
    };

    try {
      await refocus();

      if (element.isContentEditable) {
        // ── Method 1: execCommand insertText (PRIMARY) ────────────────────
        // document.execCommand("insertText") creates a *trusted* beforeinput
        // event in Chrome.  Lexical (X ≥ 2024) and ProseMirror both handle
        // trusted beforeinput events correctly — this is how real keyboard
        // input works.  Synthetic ClipboardEvents with isTrusted=false are
        // increasingly filtered by modern editors.
        selectAll();
        document.execCommand("delete", false, null);
        await refocus(40); // re-focus after delete — editor may move focus away
        document.execCommand("insertText", false, text);
        await new Promise((r) => setTimeout(r, 120));
        if (getContent().length > 10) return true;

        // ── Method 2: ClipboardEvent paste (SECONDARY) ───────────────────
        // Some older editor versions still respond to synthetic paste.
        await refocus();
        selectAll();
        document.execCommand("delete", false, null);
        await new Promise((r) => setTimeout(r, 30));
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        element.dispatchEvent(new ClipboardEvent("paste", {
          bubbles: true, cancelable: true, clipboardData: dt,
        }));
        await new Promise((r) => setTimeout(r, 120));
        if (getContent().length > 10) return true;

        // ── Method 3: real clipboard + execCommand paste ──────────────────
        // Write our text to the system clipboard, then use execCommand("paste")
        // which reads from the real clipboard and is always trusted.
        try {
          await navigator.clipboard.writeText(text);
          await refocus();
          selectAll();
          document.execCommand("delete", false, null);
          await refocus(40);
          document.execCommand("paste", false, null);
          await new Promise((r) => setTimeout(r, 120));
          if (getContent().length > 10) return true;
        } catch { /* clipboard API unavailable */ }

        // ── Method 4: innerText + input event (LAST RESORT) ──────────────
        // Direct DOM mutation — bypasses Lexical's state entirely.
        // The text appears in the DOM but Lexical's virtual tree stays empty,
        // causing the placeholder to show through and hashtags to stay white.
        // We return FALSE so the caller falls through to CDP_FILL_TEXT which
        // uses userGesture:true execCommand and properly updates Lexical state.
        await refocus();
        element.innerText = text;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 50));
        return false; // always treat innerText as failure → trigger CDP fill
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

// ── Auto-inject: SSE push + polling fallback ─────────────────────────────────
//
// Primary: EventSource (SSE) connects to /events on the bridge server.
// The bridge pushes a "trigger" event instantly when "Send to Plugin" fires —
// no polling delay, works even in background tabs (SSE is I/O-driven, not
// subject to Chrome's background-tab timer throttling).
//
// Fallback: if SSE is unavailable (app not running, connection dropped before
// reconnect), a lightweight poll on /auto-inject fires every 3 s as a safety
// net. The adapter is set by the adapter script (x.js) which loads AFTER
// bridge.js, so we wait 2 s before starting either mechanism.
if (_bridgeFirstRun) {
  (function startAutoInject() {
    // Shared claim-and-inject logic used by both SSE and poll paths.
    async function claimAndInject(platform) {
      // Check adapter first — a tab without a ready adapter must not consume
      // the trigger, otherwise no injection happens and the trigger is lost.
      const adapter = window.CrosspostBridge._currentAdapter;
      if (!adapter) return;
      const claimRes = await fetch(`${BRIDGE_URL}/claim-auto-inject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target: platform }),
        cache: "no-store",
      });
      if (!claimRes.ok) return;
      const { claimed } = await claimRes.json();
      if (!claimed) return; // another tab won the race
      const { autoPostEnabled } = await new Promise((resolve) =>
        chrome.storage.local.get("autoPostEnabled", resolve),
      );
      const result = await adapter.inject(adapter.platform, { autoPost: autoPostEnabled ?? false });
      if (result?.imageIds?.length) {
        await window.CrosspostBridge.markAllPosted(result.imageIds, result.targetId).catch(() => {});
        await window.CrosspostBridge.clearQueue(adapter.platform).catch(() => {});
      }
    }

    // ── SSE connection ──────────────────────────────────────────────────────
    // Opened once the adapter is known; reconnects automatically on error.
    let sseOpen = false;
    let es = null;

    function connectSSE(platform) {
      if (es) { es.close(); es = null; }
      es = new EventSource(`${BRIDGE_URL}/events?target=${encodeURIComponent(platform)}`);
      es.addEventListener("trigger", () => {
        claimAndInject(platform).catch(() => {});
      });
      es.onopen  = () => { sseOpen = true; };
      es.onerror = () => {
        sseOpen = false;
        // EventSource auto-reconnects after error; no manual action needed.
      };
    }

    // ── Polling fallback ────────────────────────────────────────────────────
    // Fires every 3 s as backup when the SSE connection is down.
    // Also triggers SSE connect on first successful adapter resolution.
    async function pollOnce() {
      const adapter = window.CrosspostBridge._currentAdapter;
      if (!adapter) { setTimeout(pollOnce, 3000); return; }
      // Open SSE connection as soon as the adapter is known.
      if (!es) connectSSE(adapter.platform);
      // Always poll as a reliable fallback — SSE is the fast path but may miss
      // events when Chrome throttles background-tab network callbacks.
      // If SSE already delivered and the trigger was claimed, /auto-inject
      // returns pending:false and nothing extra happens.
      try {
        const res = await fetch(
          `${BRIDGE_URL}/auto-inject?target=${encodeURIComponent(adapter.platform)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = await res.json();
          if (data.pending) await claimAndInject(adapter.platform);
        }
      } catch { /* app not running */ }
      setTimeout(pollOnce, 3000);
    }

    // Wait for the adapter script to register before starting.
    setTimeout(pollOnce, 2000);
  })();
}

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
