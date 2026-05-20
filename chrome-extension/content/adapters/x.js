// Adapter for X (Twitter) — twitter.com / x.com
// Supports up to 4 images per post (X platform limit).
//
// Injection strategy:
//   Primary   — drag-and-drop onto the compose editor (Draft.js handles drops natively,
//               and Chrome allows real DataTransfer.files in synthetic DragEvents).
//   Fallback  — file-input __reactProps.onChange (React 17/18 direct call).

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

      // ── 2. Fetch queue ────────────────────────────────────────────────────
      const { images, targetId } = await bridge.getQueuedImages(target || "x");
      const toInject = images.length > 0
        ? images.slice(0, 4)
        : await bridge.getNextImage(target || "x").then((img) => [img]).catch(() => []);
      if (!toInject.length) {
        bridge.notify("No images queued — select images in the Crosspost Helper app first", "error");
        return null;
      }

      // ── 3. Fetch blobs ────────────────────────────────────────────────────
      bridge.notify(`Fetching ${toInject.length} image(s)…`, "info");
      const fileObjs = await Promise.all(
        toInject.map(async (img) => ({
          blob: await bridge.getImageBlob(img.id),
          filename: img.filename,
          mimeType: img.mimeType,
        })),
      );

      // ── 4a. Primary: drag-and-drop onto the compose editor ────────────────
      // Draft.js (used by X) has native drop support; Chrome preserves
      // DataTransfer.files in synthetic DragEvents made via the constructor.
      const dropZone =
        textarea.closest('[data-testid="tweetTextarea_0RichTextInputContainer"]') ??
        textarea.closest('[role="dialog"]')?.querySelector('[data-contents="true"]') ??
        textarea;
      dropZone.focus();
      await bridge.dropFilesOnElement(dropZone, fileObjs);

      // Give X's upload pipeline a moment to kick off.
      await new Promise((r) => setTimeout(r, 500));

      // ── 4b. Fallback: file-input React props (if drop didn't work) ────────
      // Only attempt this if the compose area still looks empty (no img/video
      // preview appeared).  We check for a media-preview sentinel element.
      const hasPreview = !!document.querySelector(
        '[data-testid="attachments"] img, [data-testid="attachments"] video',
      );
      if (!hasPreview) {
        const dialogRoot = textarea.closest('[role="dialog"]') ?? document.body;
        const input =
          dialogRoot.querySelector('input[data-testid="fileInput"]') ??
          document.body.querySelector('input[data-testid="fileInput"]');
        if (input) {
          await bridge.injectMultipleFilesIntoInput(input, fileObjs);
        }
      }

      const resolvedTargetId = targetId ?? toInject[0]?.targetId;
      const imageIds = toInject.map((i) => i.id);
      bridge.notify(`✓ ${toInject.length} image(s) sent — submit the post, then click Mark as Posted`, "success");
      return { imageIds, targetId: resolvedTargetId, filename: toInject.map((i) => i.filename).join(", ") };
    } catch (err) {
      bridge.notify(err.message, "error");
      return null;
    }
  },
};
