// Background service worker for Crosspost Helper.
//
// Handles CDP (Chrome DevTools Protocol) file injection — the only approach
// that creates a *trusted* native change event that React apps (X/Twitter)
// cannot distinguish from a real user file selection.

const BRIDGE_URL = "http://127.0.0.1:27842";

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Crosspost Helper] Extension installed.");
});

// ── CDP helpers ────────────────────────────────────────────────────────────

function cdpAttach(tabId) {
  return new Promise((resolve, reject) =>
    chrome.debugger.attach({ tabId }, "1.3", () =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(),
    ),
  );
}

function cdpDetach(tabId) {
  return new Promise((resolve) => chrome.debugger.detach({ tabId }, resolve));
}

function cdpSend(tabId, method, params) {
  return new Promise((resolve, reject) =>
    chrome.debugger.sendCommand({ tabId }, method, params ?? {}, (result) =>
      chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(result),
    ),
  );
}

// ── CDP file injection ─────────────────────────────────────────────────────

async function cdpInjectFiles(tabId, imageIds) {
  // 1. Resolve local file paths from the bridge server.
  const res = await fetch(`${BRIDGE_URL}/image-paths?ids=${imageIds.join(",")}`, { cache: "no-store" });
  const { paths } = await res.json();
  const filePaths = imageIds.map((id) => paths[id]).filter(Boolean);
  if (!filePaths.length) throw new Error("No local file paths found for the queued images.");

  // 2. Attach debugger.
  await cdpAttach(tabId);
  try {
    await cdpSend(tabId, "DOM.enable");

    // 3. Click X's media/photo button so React wires up its onChange handler
    //    on the file input.  We suppress input.click() to prevent the OS picker
    //    from actually opening — we only need the React state that gets set up
    //    in the button's onClick.
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(function() {
        const origClick = HTMLInputElement.prototype.click;
        HTMLInputElement.prototype.click = function() {};        // no-op → no OS picker
        try {
          const dialog = document.querySelector('[role="dialog"]') || document.body;
          const btn =
            dialog.querySelector('[aria-label="Add photos or video"]') ||
            dialog.querySelector('[data-testid="fileInput"]')?.closest('label') ||
            dialog.querySelector('label[for]');
          if (btn) btn.click();
        } finally {
          HTMLInputElement.prototype.click = origClick;
        }
      })()`,
      returnByValue: false,
    });

    // Give React a moment to reconcile.
    await new Promise((r) => setTimeout(r, 200));

    // 4. Find the file input (scoped to the active compose dialog).
    const { result } = await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(
        document.querySelector('[role="dialog"] input[data-testid="fileInput"]') ||
        document.querySelector('input[data-testid="fileInput"]') ||
        document.querySelector('input[type="file"]')
      )`,
      returnByValue: false,
    });
    if (!result?.objectId) throw new Error("File input not found on the X page.");

    // 5. Set files at the C++ level using objectId directly.
    //    This fires a trusted native change event → React handles it normally.
    await cdpSend(tabId, "DOM.setFileInputFiles", {
      objectId: result.objectId,
      files: filePaths,
    });
  } finally {
    await cdpDetach(tabId);
  }
}

// ── CDP file injection — CivitAI ───────────────────────────────────────────
//
// CivitAI uses react-dropzone.  The only reliable way to trigger it
// programmatically is DOM.setFileInputFiles at the C++ level, which fires a
// *trusted* native change event — identical to what the OS file-picker sends.
// Synthetic JS events (DataTransfer getter tricks, __reactProps.onChange) are
// filtered out by react-dropzone's internal validation pipeline.

async function cdpInjectFilesCivitai(tabId, imageIds) {
  // 1. Resolve local file paths from the bridge server.
  const res = await fetch(`${BRIDGE_URL}/image-paths?ids=${imageIds.join(",")}`, { cache: "no-store" });
  const { paths } = await res.json();
  const filePaths = imageIds.map((id) => paths[id]).filter(Boolean);
  if (!filePaths.length) throw new Error("No local file paths found for the queued images.");

  // 2. Attach debugger.
  await cdpAttach(tabId);
  try {
    await cdpSend(tabId, "DOM.enable");

    // 3. Find the hidden file input react-dropzone creates.
    const { result } = await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(
        document.querySelector('input[type="file"][accept*="image"]') ||
        document.querySelector('input[type="file"]')
      )`,
      returnByValue: false,
    });
    if (!result?.objectId) throw new Error("File input not found on the CivitAI page — try reloading.");

    // 4. Set files at the C++ level.  Fires a trusted change event that
    //    react-dropzone processes exactly like a real OS file-picker selection.
    await cdpSend(tabId, "DOM.setFileInputFiles", {
      objectId: result.objectId,
      files: filePaths,
    });
  } finally {
    await cdpDetach(tabId);
  }
}

// ── CDP file injection — Bluesky ──────────────────────────────────────────
//
// Bluesky uses expo-image-picker (legacy mode on web).  When the media button
// is clicked, the library creates a hidden <input type="file"> dynamically
// inside a Promise executor and immediately calls input.click() — which opens
// the OS file dialog.  We need to:
//
//   a) Intercept that click() call BEFORE the OS picker opens.
//   b) Capture the input element reference.
//   c) Set our files on it via DOM.setFileInputFiles (trusted C++ event).
//
// Content scripts run in an *isolated* JavaScript world — prototype overrides
// there do NOT affect page code.  Runtime.evaluate runs directly in the page
// context, so prototype overrides ARE visible to expo-image-picker.

async function cdpInjectFilesBluesky(tabId, imageIds) {
  // 1. Resolve local file paths from the bridge server.
  const res = await fetch(`${BRIDGE_URL}/image-paths?ids=${imageIds.join(",")}`, { cache: "no-store" });
  const { paths } = await res.json();
  const filePaths = imageIds.map((id) => paths[id]).filter(Boolean);
  if (!filePaths.length) throw new Error("No local file paths found for the queued images.");

  // 2. Attach debugger.
  await cdpAttach(tabId);
  try {
    await cdpSend(tabId, "DOM.enable");

    // 3. Install THREE interceptors in the PAGE context (Runtime.evaluate runs
    //    in the real page JS world, not the isolated content-script world):
    //
    //    a) HTMLInputElement.prototype.click override — catches explicit .click()
    //    b) Capture-phase 'click' event listener — catches dispatchEvent clicks
    //    c) MutationObserver on document.body — catches inputs added to the DOM
    //       even when .click() is deferred or bypassed
    //
    //    All three store the reference in window.__cdpCapturedInput and suppress
    //    the OS file picker from opening.
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(function() {
        window.__cdpCapturedInput = null;

        // (a) prototype override
        const _origClick = HTMLInputElement.prototype.click;
        HTMLInputElement.prototype.click = function() {
          if (this.type === 'file') {
            window.__cdpCapturedInput = this;
            return; // suppress OS picker
          }
          return _origClick.call(this);
        };

        // (b) capture-phase event listener
        function _captureHandler(e) {
          const t = e.target;
          if (t instanceof HTMLInputElement && t.type === 'file') {
            window.__cdpCapturedInput = t;
            e.preventDefault();
            e.stopImmediatePropagation();
          }
        }
        document.addEventListener('click', _captureHandler, true);

        // (c) MutationObserver — fires after the sync task that creates & clicks
        //     the input; acts as a last-resort reference store
        const _obs = new MutationObserver((mutations) => {
          for (const m of mutations) {
            for (const node of m.addedNodes) {
              const inp = (node instanceof HTMLInputElement && node.type === 'file')
                ? node
                : node.querySelector && node.querySelector('input[type="file"]');
              if (inp && !window.__cdpCapturedInput) {
                window.__cdpCapturedInput = inp;
              }
            }
          }
        });
        _obs.observe(document.body, { childList: true, subtree: true });

        window.__cdpRestoreAll = function() {
          HTMLInputElement.prototype.click = _origClick;
          document.removeEventListener('click', _captureHandler, true);
          _obs.disconnect();
          delete window.__cdpRestoreAll;
        };
      })()`,
      returnByValue: true,
    });

    // 4. Click the media button with userGesture:true so Chrome allows the
    //    subsequent file-input click inside expo-image-picker's Promise executor
    //    (Chrome blocks programmatic file-input clicks without a user gesture).
    const { result: btnResult } = await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(function() {
        const btn =
          document.querySelector('[data-testid="openMediaBtn"]') ||
          document.querySelector('[aria-label*="Add media" i]') ||
          document.querySelector('[aria-label*="media" i][role="button"]') ||
          document.querySelector('[aria-label*="image" i][role="button"]');
        if (btn) btn.click();
        return btn ? btn.getAttribute('data-testid') || btn.getAttribute('aria-label') || 'found' : null;
      })()`,
      returnByValue: true,
      userGesture: true,   // ← critical: lets expo-image-picker's input.click() run
    });

    // 5. Poll for the captured input (expo-image-picker may run in a microtask).
    let capturedObjId = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const { result } = await cdpSend(tabId, "Runtime.evaluate", {
        expression: `window.__cdpCapturedInput`,
        returnByValue: false,
      });
      if (result?.objectId) {
        capturedObjId = result.objectId;
        break;
      }
    }

    // 6. Restore everything regardless of success.
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(function() {
        if (window.__cdpRestoreAll) window.__cdpRestoreAll();
        delete window.__cdpCapturedInput;
      })()`,
      returnByValue: true,
    });

    if (!capturedObjId) {
      const btnLabel = btnResult?.value ?? "null";
      throw new Error(
        `Could not capture Bluesky's file input (media btn: ${btnLabel}) — ` +
        "try reloading bsky.app and ensure the compose window is open",
      );
    }

    // 7. Set files at C++ level → trusted native change event that expo-image-picker
    //    processes identically to a real OS file-picker selection.
    await cdpSend(tabId, "DOM.setFileInputFiles", {
      objectId: capturedObjId,
      files: filePaths,
    });
  } finally {
    await cdpDetach(tabId);
  }
}

// ── Message listener ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CDP_INJECT_FILES") {
    cdpInjectFiles(sender.tab.id, msg.imageIds)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (msg.type === "CDP_INJECT_FILES_CIVITAI") {
    cdpInjectFilesCivitai(sender.tab.id, msg.imageIds)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "CDP_INJECT_FILES_BLUESKY") {
    cdpInjectFilesBluesky(sender.tab.id, msg.imageIds)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
