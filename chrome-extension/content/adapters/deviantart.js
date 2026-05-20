// Adapter for DeviantArt — deviantart.com / www.deviantart.com
// Works on the /submit page where the file upload dropzone is present.
// Note: DeviantArt only supports 1 image per submission, so the first
// queued image is used.

window.CrosspostBridge._currentAdapter = {
  platform: "deviantart",

  async inject(target) {
    const bridge = window.CrosspostBridge;
    try {
      // ── 1. Navigate to /submit if not already there ───────────────────────
      if (!window.location.pathname.startsWith("/submit")) {
        bridge.notify("Navigating to deviantart.com/submit …", "info");
        window.location.href = "https://www.deviantart.com/submit";
        return null; // page reloads; user clicks Inject again
      }

      // ── 2. Fetch the app-selected queue (DA supports 1 image per post) ────
      const { images, targetId } = await bridge.getQueuedImages(target || "deviantart");

      // Fallback to single-random if nothing is queued
      const toInject = images.length > 0
        ? images.slice(0, 1)
        : await bridge.getNextImage(target || "deviantart").then((img) => [img]).catch(() => []);

      if (!toInject.length) {
        bridge.notify("No images queued — select an image in the Crosspost Helper app first", "error");
        return null;
      }

      // ── 3. Wait for the file input (lazy-loaded dropzone) ─────────────────
      const input = await bridge.waitForElement('input[type="file"]', 4000);
      if (!input) {
        bridge.notify("Could not find the file upload input — try reloading the page", "error");
        return null;
      }

      // ── 4. Fetch blob and inject ───────────────────────────────────────────
      const img = toInject[0];
      bridge.notify(`Fetching ${img.filename}…`, "info");
      const blob = await bridge.getImageBlob(img.id);
      await bridge.injectFileIntoInput(input, blob, img.filename, img.mimeType);

      const resolvedTargetId = targetId ?? img.targetId;
      bridge.notify(`✓ ${img.filename} — fill in the details and submit`, "success");
      return { imageIds: [img.id], targetId: resolvedTargetId, filename: img.filename };
    } catch (err) {
      bridge.notify(err.message, "error");
      return null;
    }
  },
};
