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
      // Longer delay (1200ms) — X re-renders the compose box asynchronously after
      // adding the image preview, which can clobber text injected too early.
      await new Promise((r) => setTimeout(r, 1200));

      const postContent = await bridge.getPostContent("x").catch(() => null);
      let textFilled = false;
      // The text we intend to inject — kept for the re-verify pass in step 5.
      let pendingText = "";
      if (postContent) {
        const tags = (postContent.tags ?? [])
          .map((t) => (t.startsWith("#") ? t : "#" + t))
          .join(" ");
        // Use single newline — \n\n triggers a paragraph break in X's Lexical
        // editor which can split description and tags into separate tweet blocks.
        const text = [postContent.description, tags].filter(Boolean).join("\n");
        pendingText = text;
        if (text) {
          // ── Method A: CDP fill (PRIMARY) ──────────────────────────────────
          // Uses CDP Input.insertText — OS-level trusted input that Lexical
          // processes identically to real keyboard typing.
          //
          // We skip the in-page fillTextField() approach entirely for X because:
          // content-script execCommand fires isTrusted=false beforeinput events.
          // X's Lexical ignores untrusted events but does NOT call preventDefault(),
          // so the browser inserts text directly into the DOM.  This produces a
          // "ghost state": textContent shows text, but Lexical's EditorState is
          // empty — the field is visually non-editable and posts as blank.
          const cdpFillResult = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "CDP_FILL_TEXT", text }, resolve);
          });
          textFilled = cdpFillResult?.ok ?? false;

          // ── Method B: clipboard + CDP Ctrl+V (last resort) ───────────────
          if (!textFilled) {
            // clipboardWrite permission is declared in manifest.json so
            // navigator.clipboard.writeText() works without a user gesture.
            await navigator.clipboard.writeText(text).catch(() => {});
            bridge.notify(`Pasting text via clipboard…`, "info");
            await new Promise((r) => setTimeout(r, 700));
            const pasteResult = await new Promise((resolve) => {
              chrome.runtime.sendMessage({ type: "CDP_PASTE_CLIPBOARD" }, (res) =>
                resolve(res ?? { ok: false }),
              );
            });
            if (pasteResult?.ok) {
              await new Promise((r) => setTimeout(r, 800));
              if (autoPost) {
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
          // Escape + Space must be *trusted* keystrokes so Lexical processes them.
          // Content-script dispatchEvent() is untrusted and gets ignored by X's
          // Lexical editor — we use CDP_FINALIZE_HASHTAGS which sends them via
          // CDP Input.dispatchKeyEvent (fully trusted, same as real keyboard).
          await new Promise((r) => setTimeout(r, 200));
          await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "CDP_FINALIZE_HASHTAGS" }, resolve);
          });
        }
      }

      // ── 5. Auto-post: click the tweet button if requested ─────────────────
      if (autoPost) {
        // Poll for the Post button to become active (up to 5 s) — X enables it
        // only after the image upload/preview is fully ready.  Polling avoids a
        // fixed sleep that may be too short on slow connections.
        let postBtn = null;
        for (let i = 0; i < 50; i++) {
          await new Promise((r) => setTimeout(r, 100));
          const btn =
            document.querySelector('[data-testid="tweetButtonInline"]') ||
            document.querySelector('[data-testid="tweetButton"]');
          if (btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true") {
            postBtn = btn;
            break;
          }
        }

        if (postBtn) {
          // X may have re-rendered the compose box while the image was being
          // processed, clearing any text we filled in step 4.  Re-verify and
          // refill right before posting so the text is always present.
          if (pendingText) {
            const currentTA = document.querySelector('[data-testid="tweetTextarea_0"]') || textarea;
            const currentContent = (currentTA?.textContent ?? "").replace(/​/g, "").replace(/\s+/g, " ").trim();
            if (currentContent.length < 5) {
              const refillResult = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ type: "CDP_FILL_TEXT", text: pendingText }, resolve);
              });
              textFilled = refillResult?.ok ?? false;
              await new Promise((r) => setTimeout(r, 300));
            }
          }
          postBtn.click();
          bridge.notify(`✓ ${toInject.length} image(s)${textFilled ? " + text" : ""} — posting automatically…`, "success");
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
