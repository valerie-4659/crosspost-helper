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

    // 3. Install FOUR-layer interceptors in the PAGE context.
    //
    //    Root cause of the persistent OS picker: the user clicking "Inject" in
    //    the extension popup grants User Activation to the service worker, which
    //    Chrome propagates into Runtime.evaluate on the tab regardless of the
    //    userGesture flag.  JS-level prototype suppression alone is not enough
    //    because Chrome may schedule the file picker at C++ level on trusted
    //    events before our JS return statement runs.
    //
    //    Layer A (document.createElement override) is the key fix:
    //    It installs a per-INSTANCE click no-op on every newly created <input>.
    //    Instance methods have higher JS priority than the prototype AND do NOT
    //    fire any browser event at all → Chrome's C++ picker is never reached.
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(function() {
        window.__cdpCapturedInput = null;
        const _origCreate = document.createElement.bind(document);
        const _origProtoClick = HTMLInputElement.prototype.click;

        // Layer A: createElement override — instance-level click no-op.
        // This is the primary suppressor.  expo-image-picker creates the input
        // via document.createElement; our override immediately attaches a
        // per-instance click() that captures the reference and returns without
        // firing any event → Chrome's file picker is never scheduled.
        document.createElement = function(tag, ...args) {
          const el = _origCreate(tag, ...args);
          if (String(tag).toLowerCase() === 'input') {
            el.click = function() {
              if (this.type === 'file') {
                window.__cdpCapturedInput = this;
                return; // no event fired, no OS picker
              }
              _origProtoClick.call(this);
            };
          }
          return el;
        };

        // Layer B: prototype override (inputs not via document.createElement)
        HTMLInputElement.prototype.click = function() {
          if (this.type === 'file') { window.__cdpCapturedInput = this; return; }
          return _origProtoClick.call(this);
        };

        // Layer C: capture-phase listener (HTMLInputElement.prototype.click.call()
        //          bypasses both instance method and prototype chain)
        function _captureHandler(e) {
          const t = e.target;
          if (t instanceof HTMLInputElement && t.type === 'file') {
            window.__cdpCapturedInput = t;
            e.preventDefault();
            e.stopImmediatePropagation();
          }
        }
        document.addEventListener('click', _captureHandler, true);

        // Layer D: MutationObserver — catches inputs appended without any click
        const _obs = new MutationObserver((mutations) => {
          for (const m of mutations) {
            for (const node of m.addedNodes) {
              const inp = (node instanceof HTMLInputElement && node.type === 'file')
                ? node : (node.querySelector && node.querySelector('input[type="file"]'));
              if (inp && !window.__cdpCapturedInput) window.__cdpCapturedInput = inp;
            }
          }
        });
        _obs.observe(document.body, { childList: true, subtree: true });

        window.__cdpRestoreAll = function() {
          document.createElement = _origCreate;
          HTMLInputElement.prototype.click = _origProtoClick;
          document.removeEventListener('click', _captureHandler, true);
          _obs.disconnect();
          delete window.__cdpRestoreAll;
        };
      })()`,
      returnByValue: true,
    });

    // 4. Click the media button. Layer A suppresses the subsequent input.click()
    //    before Chrome can schedule the OS picker.
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
