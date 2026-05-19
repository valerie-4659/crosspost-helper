// Adapter for Bluesky — bsky.app
// Supports up to 4 images per post (Bluesky platform limit).

window.CrosspostBridge._currentAdapter = {
  platform: "bluesky",

  async inject(target) {
    const bridge = window.CrosspostBridge;
    try {
      // ── 1. Ensure compose dialog is open ──────────────────────────────────
      let composer = document.querySelector('[data-testid="composer"]');
      if (!composer) {
        const newPostBtn = document.querySelector(
          '[aria-label="New post"], ' +
          '[data-testid="composeBtn"], ' +
          'button[aria-label*="post" i]',
        );
        if (newPostBtn) {
          newPostBtn.click();
          composer = await bridge.waitForElement('[data-testid="composer"]', 2500);
        }
      }

      if (!composer) {
        bridge.notify("Open the compose window first", "error");
        return null;
      }

      // ── 2. Find the file input ────────────────────────────────────────────
      const input =
        composer.querySelector('input[type="file"]') ||
        document.querySelector('input[accept*="image"][type="file"]');

      if (!input) {
        bridge.notify("Could not find the media upload input", "error");
        return null;
      }

      // ── 3. Fetch the app-selected queue (max 4 for Bluesky) ──────────────
      const { images, targetId } = await bridge.getQueuedImages(target || "bluesky");

      const toInject = images.length > 0
        ? images.slice(0, 4)
        : await bridge.getNextImage(target || "bluesky").then((img) => [img]).catch(() => []);

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
