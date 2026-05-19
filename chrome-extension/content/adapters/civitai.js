// Adapter for CivitAI — civitai.com and civitai.red
// Works on the post creation page (/posts/create).
// Supports injecting up to 20 images from the app-selected queue.

window.CrosspostBridge._currentAdapter = {
  platform: "civitai",

  async inject(target) {
    const bridge = window.CrosspostBridge;
    try {
      // ── 1. Navigate to the post-creation page if needed ──────────────────
      const onCreatePage =
        window.location.pathname.includes("/posts/create") ||
        window.location.pathname.includes("/images/upload");

      if (!onCreatePage) {
        bridge.notify("Navigating to /posts/create …", "info");
        window.location.href = `${window.location.origin}/posts/create`;
        return null; // page will reload; user clicks Inject again
      }

      // ── 2. Fetch the app-selected queue ──────────────────────────────────
      const { images, targetId } = await bridge.getQueuedImages(target || "civitai");

      // Graceful fallback to single-random if no explicit queue
      const toInject = images.length > 0
        ? images.slice(0, 20)
        : await bridge.getNextImage(target || "civitai").then((img) => [img]).catch(() => []);

      if (!toInject.length) {
        bridge.notify("No images queued — select images in the Crosspost Helper app first", "error");
        return null;
      }

      // ── 3. Wait for file input ────────────────────────────────────────────
      // civitai.red uses a dropzone; the hidden input may appear lazily.
      const input = await bridge.waitForElement(
        'input[type="file"][accept*="image"], input[type="file"]',
        6000,
      );

      if (!input) {
        bridge.notify("Could not find the file upload input — try reloading the page", "error");
        return null;
      }

      // ── 4. Fetch all blobs and inject at once ─────────────────────────────
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

      bridge.notify(
        `✓ ${toInject.length} image(s) added — add tags and publish`,
        "success",
      );

      // Return multi-image result; popup will mark all as posted on confirmation.
      return { imageIds, targetId: resolvedTargetId, filename: toInject.map((i) => i.filename).join(", ") };
    } catch (err) {
      bridge.notify(err.message, "error");
      return null;
    }
  },
};
