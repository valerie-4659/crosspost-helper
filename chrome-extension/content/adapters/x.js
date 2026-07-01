// Adapter for X (Twitter) — twitter.com / x.com
// Supports up to 4 images per post (X platform limit).
//
// Injection: uses chrome.debugger (CDP) via the background service worker.
// DOM.setFileInputFiles sets files at the C++ level → fires a *trusted*
// native change event → React handles it exactly like a real user selection.

window.CrosspostBridge._currentAdapter = {
  platform: "x",

  async inject(target, { autoPost = false } = {}) {
    const bridge = window.CrosspostBridge;
    try {
      // ── 1. Ensure compose is open ─────────────────────────────────────────
      let textarea = document.querySelector('[data-testid="tweetTextarea_0"]');
      if (!textarea) {
        const composeBtn = document.querySelector(
          '[data-testid="SideNav_NewTweet_Button"], ' +
          '[data-testid="FloatingActionButtons_Tweet"], ' +
          'a[href="/compose/tweet"]',
        );
        if (composeBtn) {
          composeBtn.click();
          textarea = await bridge.waitForElement('[data-testid="tweetTextarea_0"]', 3000);
        }
      }
      if (!textarea) {
        bridge.notify("Open the compose window first", "error");
        return null;
      }

      // ── 2. Fetch queue ────────────────────────────────────────────────────
      const { images, targetId } = await bridge.getQueuedImages(target || "x");
      const toInject = images.length > 0
        ? images.slice(0, 4)
        : await bridge.getNextImage(target || "x").then((img) => [img]).catch(() => []);
      if (!toInject.length) {
        bridge.notify("No images queued — select images in the app first", "error");
        return null;
      }

      // ── 3. Inject via CDP (trusted native file selection) ─────────────────
      bridge.notify(`Injecting ${toInject.length} image(s)…`, "info");
      const imageIds = toInject.map((i) => i.id);

      const cdpResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "CDP_INJECT_FILES", imageIds }, resolve);
      });

      if (!cdpResult?.ok) {
        // CDP failed — fall back to the React-props approach
        bridge.notify("CDP failed, trying fallback…", "info");
        const fileObjs = await Promise.all(
          toInject.map(async (img) => ({
            blob: await bridge.getImageBlob(img.id),
            filename: img.filename,
            mimeType: img.mimeType,
          })),
        );
        const dialogRoot = textarea.closest('[role="dialog"]') ?? document.body;
        const input =
          dialogRoot.querySelector('input[data-testid="fileInput"]') ??
          document.body.querySelector('input[data-testid="fileInput"]');
        if (!input) {
          bridge.notify(cdpResult?.error ?? "Could not find file input", "error");
          return null;
        }
        await bridge.injectMultipleFilesIntoInput(input, fileObjs);
      }

      const resolvedTargetId = targetId ?? toInject[0]?.targetId;

      // ── 4. Fill AI post text if available ────────────────────────────────
      // Wait for X to process the injected files and finish re-rendering.
      // Use a longer delay — X re-renders the compose box asynchronously after
      // adding the image preview, which can clobber text injected too early.
      await new Promise((r) => setTimeout(r, 800));

      const postContent = await bridge.getPostContent("x").catch(() => null);
      let textFilled = false;
      if (postContent) {
        const tags = (postContent.tags ?? [])
          .map((t) => (t.startsWith("#") ? t : "#" + t))
          .join(" ");
        // Use single newline — \n\n triggers a paragraph break in X's Lexical
        // editor which can split description and tags into separate tweet blocks.
        const text = [postContent.description, tags].filter(Boolean).join("\n");
        if (text) {
          // Re-query — X may have remounted the textarea after file injection.
          const freshTextarea = document.querySelector('[data-testid="tweetTextarea_0"]') || textarea;
          textFilled = await bridge.fillTextField(freshTextarea, text);
          if (!textFilled) {
            // All in-page injection methods failed — write to clipboard and use
            // CDP to dispatch a trusted Ctrl+V so the user doesn't have to paste manually.
            await navigator.clipboard.writeText(text).catch(() => {});
            bridge.notify(`Pasting text via clipboard…`, "info");
            // Small delay so X finishes rendering before we send the keystroke.
            await new Promise((r) => setTimeout(r, 700));
            const pasteResult = await new Promise((resolve) => {
              chrome.runtime.sendMessage({ type: "CDP_PASTE_CLIPBOARD" }, (res) =>
                resolve(res ?? { ok: false }),
              );
            });
            if (pasteResult?.ok) {
              // CDP paste succeeded — if autoPost, click the tweet button.
              if (autoPost) {
                await new Promise((r) => setTimeout(r, 600));
                const postBtn =
                  document.querySelector('[data-testid="tweetButtonInline"]') ||
                  document.querySelector('[data-testid="tweetButton"]');
                if (postBtn && !postBtn.disabled && postBtn.getAttribute("aria-disabled") !== "true") {
                  postBtn.click();
                  bridge.notify(`✓ ${toInject.length} image(s) + text — posting automatically…`, "success");
                } else {
                  bridge.notify(`✓ ${toInject.length} image(s) + text pasted — post button not ready, click Post manually`, "info");
                }
              } else {
                bridge.notify(`✓ ${toInject.length} image(s) attached + text pasted — post, then click Mark as Posted`, "success");
              }
            } else {
              bridge.notify(`✓ ${toInject.length} image(s) attached — text copied to clipboard, paste with Ctrl+V`, "info");
            }
            return { imageIds, targetId: resolvedTargetId, filename: toInject.map((i) => i.filename).join(", ") };
          }

          // ── Post-injection: finalise hashtag nodes & close autocomplete ──
          // After bulk insertText, X's Lexical editor leaves the cursor at the
          // end of the last hashtag, which (a) opens a tag autocomplete dropdown
          // that blocks keyboard input, and (b) keeps the final #tag as a plain
          // TextNode (white) instead of a HashtagNode (blue) because no delimiter
          // was typed after it.
          //
          // Fix:
          //  1. Escape  → dismisses the autocomplete overlay.
          //  2. Space   → Lexical finalises ALL pending TextNode→HashtagNode
          //               transforms (all tags turn blue); trailing space is
          //               harmless — X trims whitespace on post.
          await new Promise((r) => setTimeout(r, 200));
          const taFinal = document.querySelector('[data-testid="tweetTextarea_0"]') || freshTextarea;
          taFinal.focus();
          // Step 1: close autocomplete
          taFinal.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
          await new Promise((r) => setTimeout(r, 80));
          taFinal.dispatchEvent(new KeyboardEvent("keyup",   { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
          await new Promise((r) => setTimeout(r, 80));
          // Step 2: append trailing space → finalise hashtag nodes
          document.execCommand("insertText", false, " ");

          // Step 3: move cursor to the START of the text using the Selection API.
          // Keyboard event dispatch (Ctrl+Home) is intercepted by Lexical's own handler
          // and doesn't reliably move the cursor — use DOM selection directly instead.
          await new Promise((r) => setTimeout(r, 100));
          try {
            const sel = window.getSelection();
            if (sel) {
              // Walk the editor's DOM to find the very first text node
              // (that's inside the description, before any HashtagNode spans).
              const walker = document.createTreeWalker(taFinal, NodeFilter.SHOW_TEXT);
              const firstText = walker.nextNode();
              if (firstText) {
                const range = document.createRange();
                range.setStart(firstText, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              }
            }
          } catch { /* ignore — editing will still work, cursor just stays at end */ }
        }
      }

      // ── 5. Auto-post: click the tweet button if requested ─────────────────
      if (autoPost) {
        // Give X a moment to enable the Post button after text + images are ready.
        await new Promise((r) => setTimeout(r, 600));
        const postBtn =
          document.querySelector('[data-testid="tweetButtonInline"]') ||
          document.querySelector('[data-testid="tweetButton"]');
        if (postBtn && !postBtn.disabled && postBtn.getAttribute("aria-disabled") !== "true") {
          postBtn.click();
          bridge.notify(`✓ ${toInject.length} image(s) + text — posting automatically…`, "success");
        } else {
          bridge.notify(`✓ ${toInject.length} image(s) attached${textFilled ? " + text filled" : ""} — post button not ready, click Post manually`, "info");
        }
      } else {
        bridge.notify(`✓ ${toInject.length} image(s) attached${textFilled ? " + text filled" : ""} — post, then click Mark as Posted`, "success");
      }
      return { imageIds, targetId: resolvedTargetId, filename: toInject.map((i) => i.filename).join(", ") };
    } catch (err) {
      bridge.notify(err.message, "error");
      return null;
    }
  },
};
