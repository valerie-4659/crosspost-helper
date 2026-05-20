// Adapter for X (Twitter) — twitter.com / x.com
// Supports up to 4 images per post (X platform limit).

window.CrosspostBridge._currentAdapter = {
  platform: "x",

  async inject(target) {
    const bridge = window.CrosspostBridge;
    try {
      // ── 1. Ensure the compose dialog is open ──────────────────────────────
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

      // ── 2. Find the file input ────────────────────────────────────────────
      // Walk up from the textarea to the compose dialog root, then look for the
      // fileInput *within that subtree* so we don't accidentally hit a file input
      // from a background reply box.
      const dialogRoot = textarea.closest('[role="dialog"]') ?? document.body;

      // Wait up to 1 s for the input to appear in case the dialog is still animating.
      let input = dialogRoot.querySelector('input[data-testid="fileInput"]');
      if (!input) {
        input = await bridge.waitForElement('input[data-testid="fileInput"]', 1000);
      }
      if (!input) {
        bridge.notify("Could not find the media upload input", "error");
        return null;
      }

      // ── 3. Fetch the app-selected queue (max 4 for X) ────────────────────
      const { images, targetId } = await bridge.getQueuedImages(target || "x");

      // Fallback to single-random if no queue set
      const toInject = images.length > 0
        ? images.slice(0, 4)
        : await bridge.getNextImage(target || "x").then((img) => [img]).catch(() => []);

      if (!toInject.length) {
        bridge.notify("No images queued — select images in the Crosspost Helper app first", "error");
        return null;
      }

      // ── 4. Fetch all blobs and inject ─────────────────────────────────────
      bridge.notify(`Fetching ${toInject.length} image(s)…`, "info");
      const files = await Promise.all(
        toInject.map(async (img) => ({
          blob: await bridge.getImageBlob(img.id),
          filename: img.filename,
          mimeType: img.mimeType,
        })),
      );

      await bridge.injectMultipleFilesIntoInput(input, files);

      const resolvedTargetId = targetId ?? toInject[0]?.targetId;
      const imageIds = toInject.map((i) => i.id);

      bridge.notify(`✓ ${toInject.length} image(s) added — ready to post`, "success");
      return { imageIds, targetId: resolvedTargetId, filename: toInject.map((i) => i.filename).join(", ") };
    } catch (err) {
      bridge.notify(err.message, "error");
      return null;
    }
  },
};
