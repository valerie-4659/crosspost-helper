// Adapter for CivitAI — civitai.com and civitai.red
// Works on the post creation page (/posts/create).
// Supports injecting up to 20 images from the app-selected queue.
//
// CivitAI uses react-dropzone for the upload area.  Synthetic JS events
// (DataTransfer getter tricks, __reactProps.onChange) are silently ignored by
// react-dropzone's internal pipeline.  We therefore use the background
// worker's CDP path (DOM.setFileInputFiles) which fires a *trusted* native
// change event — identical to a real OS file-picker selection.

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
        bridge.notify("Opening CivitAI post-creation page — click Inject again once it loads", "info");
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

      // ── 3. Wait for the dropzone's hidden file input to appear ────────────
      const input = await bridge.waitForElement(
        'input[type="file"][accept*="image"], input[type="file"]',
        6000,
      );

      if (!input) {
        bridge.notify("Could not find the file upload input — try reloading the page", "error");
        return null;
      }

      // ── 4. Inject via CDP (trusted native file selection) ─────────────────
      // react-dropzone requires a trusted change event.  DOM.setFileInputFiles
      // sets files at the C++ level, bypassing all JS sandbox restrictions.
      bridge.notify(`Injecting ${toInject.length} image(s)…`, "info");
      const imageIds = toInject.map((i) => i.id);

      const cdpResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "CDP_INJECT_FILES_CIVITAI", imageIds }, resolve);
      });

      if (!cdpResult?.ok) {
        bridge.notify(cdpResult?.error ?? "File injection failed", "error");
        return null;
      }

      const resolvedTargetId = targetId ?? toInject[0]?.targetId;

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
