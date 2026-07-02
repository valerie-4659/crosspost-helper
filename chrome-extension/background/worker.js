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

    // 3. Install interceptors in PAGE context.
    //
    //    Why previous approaches failed:
    //    Overriding document.createElement or HTMLInputElement.prototype.click
    //    is unreliable because expo-image-picker may CACHE these references at
    //    module-load time.  A cached reference bypasses any override we install
    //    after page load.
    //
    //    Solution — override the HTMLInputElement.prototype 'type' SETTER:
    //    This is a prototype property descriptor, NOT a method reference.
    //    Every assignment `input.type = 'file'` MUST traverse the prototype
    //    chain and will hit our setter — it cannot be cached.
    //    In the setter we immediately set disabled = true on the element.
    //    Disabled inputs ignore .click() at the C++ level, so Chrome never
    //    schedules the OS file picker regardless of user-activation state.
    //
    //    We also override Element.prototype.setAttribute so that the alternate
    //    form `input.setAttribute('type','file')` is intercepted too (setAttribute
    //    bypasses IDL property setters in the engine).
    //
    //    After injection we re-enable the input before DOM.setFileInputFiles
    //    so CDP can operate on a non-disabled element.
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(function() {
        window.__cdpCapturedInput = null;

        // Layer A: 'type' setter override on HTMLInputElement.prototype.
        // Primary suppressor — cannot be cached by page scripts.
        const _typeDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'type');
        const _origTypeSetter = _typeDesc.set;
        Object.defineProperty(HTMLInputElement.prototype, 'type', {
          ..._typeDesc,
          set(value) {
            _origTypeSetter.call(this, value);
            if (value === 'file') {
              window.__cdpCapturedInput = this;
              this.disabled = true; // blocks OS picker on .click() at C++ level
            }
          }
        });

        // Layer B: setAttribute override — covers input.setAttribute('type','file')
        // which bypasses the IDL property setter above.
        const _origSetAttr = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function(name, value) {
          _origSetAttr.call(this, name, value);
          if (name === 'type' && value === 'file' && this instanceof HTMLInputElement) {
            window.__cdpCapturedInput = this;
            this.disabled = true;
          }
        };

        // Layer C: MutationObserver backup — catches inputs already of type=file
        // when appended (e.g. created via innerHTML or a framework template).
        const _obs = new MutationObserver((mutations) => {
          for (const m of mutations) {
            for (const node of m.addedNodes) {
              const inp = (node instanceof HTMLInputElement && node.type === 'file')
                ? node : (node.querySelector && node.querySelector('input[type="file"]'));
              if (inp && !window.__cdpCapturedInput) {
                window.__cdpCapturedInput = inp;
                inp.disabled = true;
              }
            }
          }
        });
        _obs.observe(document.body, { childList: true, subtree: true });

        // Layer D: capture-phase click listener — final safety net.
        function _captureHandler(e) {
          const t = e.target;
          if (t instanceof HTMLInputElement && t.type === 'file') {
            window.__cdpCapturedInput = t;
            e.preventDefault();
            e.stopImmediatePropagation();
          }
        }
        document.addEventListener('click', _captureHandler, true);

        window.__cdpRestoreAll = function() {
          Object.defineProperty(HTMLInputElement.prototype, 'type', _typeDesc);
          Element.prototype.setAttribute = _origSetAttr;
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

    // 6. Restore interceptors and re-enable the captured input.
    //    The input was set to disabled=true to block the OS picker during the
    //    click.  We must re-enable it before DOM.setFileInputFiles so that CDP
    //    can operate on a normal (non-disabled) file input.
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(function() {
        if (window.__cdpCapturedInput) window.__cdpCapturedInput.disabled = false;
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

// ── CDP text fill ──────────────────────────────────────────────────────────
//
// Runs execCommand('insertText') directly in the page context via CDP
// Runtime.evaluate with userGesture:true.  This fires a *trusted* beforeinput
// event — identical to real keyboard input — which Lexical (X's editor)
// handles correctly.  Content-script execCommand calls are NOT trusted because
// they run in an isolated world; innerText assignment bypasses Lexical's state
// entirely and gets cleared on the next render.  This method sidesteps both
// limitations.

async function cdpFillText(tabId, text) {
  await cdpAttach(tabId);
  try {
    // Step 1: Focus the Lexical editor.
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(function(){
        const ta = document.querySelector('[data-testid="tweetTextarea_0"]');
        if (ta) ta.focus();
      })()`,
      returnByValue: false,
      userGesture: true,
    });
    await new Promise((r) => setTimeout(r, 80));

    // Step 2: Select all existing content via Ctrl+A (trusted CDP keystroke).
    await cdpSend(tabId, "Input.dispatchKeyEvent", {
      type: "keyDown", modifiers: 2, key: "a", code: "KeyA",
      windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65,
    });
    await cdpSend(tabId, "Input.dispatchKeyEvent", {
      type: "keyUp", modifiers: 2, key: "a", code: "KeyA",
      windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65,
    });
    await new Promise((r) => setTimeout(r, 40));

    // Step 3: Delete selected content via Backspace (trusted CDP keystroke).
    await cdpSend(tabId, "Input.dispatchKeyEvent", {
      type: "keyDown", key: "Backspace", code: "Backspace",
      windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8,
    });
    await cdpSend(tabId, "Input.dispatchKeyEvent", {
      type: "keyUp", key: "Backspace", code: "Backspace",
      windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8,
    });
    await new Promise((r) => setTimeout(r, 40));

    // Step 4: Insert text via CDP Input.insertText.
    // This is OS-level input — fires fully trusted beforeinput/textInput events
    // that Lexical processes identically to real keyboard typing.
    // Runtime.evaluate execCommand fires isTrusted=false events which modern
    // Lexical versions (X ≥ 2024) filter out, leaving the EditorState empty
    // even though the DOM appears updated.
    await cdpSend(tabId, "Input.insertText", { text });
    await new Promise((r) => setTimeout(r, 120));

    // Step 5: Verify Lexical actually updated its state (textContent reflects it).
    const { result } = await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(function(){
        const ta = document.querySelector('[data-testid="tweetTextarea_0"]');
        const len = (ta?.textContent ?? '').replace(/​/g, '').trim().length;
        return { ok: len > 0, len };
      })()`,
      returnByValue: true,
    });
    const val = result?.value;
    if (!val?.ok) {
      throw new Error(`CDP fill: len=${val?.len ?? '?'} — Lexical state not updated`);
    }
  } finally {
    await cdpDetach(tabId);
  }
}

// ── CDP hashtag finalization ───────────────────────────────────────────────
//
// After execCommand('insertText') fills the Lexical editor, the cursor sits at
// the end of the last hashtag.  Two things need to happen:
//   1. Escape → dismiss the tag-autocomplete overlay.
//   2. Space  → Lexical runs all pending TextNode→HashtagNode transforms.
//
// These keystrokes must be *trusted* (i.e. from CDP Input.dispatchKeyEvent),
// not synthetic DOM events from a content script.  Untrusted keydown events
// are ignored by X's Lexical editor for security reasons.

async function cdpFinalizeHashtags(tabId) {
  await cdpAttach(tabId);
  try {
    // Re-focus so the keystrokes land in the compose box.
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(function(){
        const ta = document.querySelector('[data-testid="tweetTextarea_0"]');
        if (ta) ta.focus();
      })()`,
      returnByValue: false,
    });
    await new Promise((r) => setTimeout(r, 80));

    // Space: finalise all pending HashtagNode transforms AND dismiss any
    // hashtag autocomplete overlay in one step.  Space is not a valid hashtag
    // character, so X's Lexical autocomplete closes automatically and all
    // pending TextNode→HashtagNode transforms run.
    //
    // We do NOT send Escape here — CDP Escape is fully trusted and triggers
    // X's global compose-close handler ("Discard post?" dialog appears).
    await cdpSend(tabId, "Input.insertText", { text: " " });
    await new Promise((r) => setTimeout(r, 100));

    // Move cursor to the start so the user can prepend text if needed.
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(function(){
        const ta = document.querySelector('[data-testid="tweetTextarea_0"]');
        if (!ta) return;
        const sel = window.getSelection();
        if (!sel) return;
        const walker = document.createTreeWalker(ta, NodeFilter.SHOW_TEXT);
        const first = walker.nextNode();
        if (first) {
          const r = document.createRange();
          r.setStart(first, 0);
          r.collapse(true);
          sel.removeAllRanges();
          sel.addRange(r);
        }
      })()`,
      returnByValue: false,
    });
  } finally {
    await cdpDetach(tabId);
  }
}

// ── CDP clipboard paste ────────────────────────────────────────────────────
//
// Focuses the tweet textarea and dispatches a trusted Ctrl+V keystroke via CDP.
// Called as last resort when all other text injection methods fail.

async function cdpPasteClipboard(tabId) {
  await cdpAttach(tabId);
  try {
    // Re-focus the Lexical editor so the keystroke lands in the right element.
    await cdpSend(tabId, "Runtime.evaluate", {
      expression: `(function(){
        const ta = document.querySelector('[data-testid="tweetTextarea_0"]');
        if (ta) ta.focus();
      })()`,
      returnByValue: false,
    });
    await new Promise((r) => setTimeout(r, 120));
    // Dispatch a trusted Ctrl+V (CDP Input events bypass the user-gesture check).
    await cdpSend(tabId, "Input.dispatchKeyEvent", {
      type: "keyDown", modifiers: 2, key: "v", code: "KeyV",
      windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86,
    });
    await new Promise((r) => setTimeout(r, 80));
    await cdpSend(tabId, "Input.dispatchKeyEvent", {
      type: "keyUp", modifiers: 2, key: "v", code: "KeyV",
      windowsVirtualKeyCode: 86, nativeVirtualKeyCode: 86,
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

  if (msg.type === "CDP_FILL_TEXT") {
    cdpFillText(sender.tab.id, msg.text)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "CDP_FINALIZE_HASHTAGS") {
    cdpFinalizeHashtags(sender.tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "CDP_PASTE_CLIPBOARD") {
    cdpPasteClipboard(sender.tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
