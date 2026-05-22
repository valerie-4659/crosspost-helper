// Adapter for X (Twitter) — twitter.com / x.com
// Supports up to 4 images per post (X platform limit).
//
// Injection: uses chrome.debugger (CDP) via the background service worker.
// DOM.setFileInputFiles sets files at the C++ level → fires a *trusted*
// native change event → React handles it exactly like a real user selection.

window.CrosspostBridge._currentAdapter = {
  platform: "x",

  async inject(target) {
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
      await new Promise((r) => setTimeout(r, 500));

      const postContent = await bridge.getPostContent("x").catch(() => null);
      let textFilled = false;
      if (postContent) {
        const tags = (postContent.tags ?? [])
          .map((t) => (t.startsWith("#") ? t : "#" + t))
          .join(" ");
        // Use single newline — \n\n triggers a paragraph break in X's ProseMirror
        // editor which can split description and tags into separate tweet blocks.
        const text = [postContent.description, tags].filter(Boolean).join("\n");
        if (text) {
          // Re-query in case React remounted the element after file injection.
          const freshTextarea = document.querySelector('[data-testid="tweetTextarea_0"]') || textarea;
          textFilled = await bridge.fillTextField(freshTextarea, text);
          if (!textFilled) {
            // Fallback: copy to clipboard so user can paste manually.
            await navigator.clipboard.writeText(text).catch(() => {});
            bridge.notify(`✓ ${toInject.length} image(s) attached — AI text copied to clipboard, paste with Ctrl+V`, "success");
            return { imageIds, targetId: resolvedTargetId, filename: toInject.map((i) => i.filename).join(", ") };
          }
        }
      }

      bridge.notify(`✓ ${toInject.length} image(s) attached${textFilled ? " + text filled" : ""} — post, then click Mark as Posted`, "success");
      return { imageIds, targetId: resolvedTargetId, filename: toInject.map((i) => i.filename).join(", ") };
    } catch (err) {
      bridge.notify(err.message, "error");
      return null;
    }
  },
};
