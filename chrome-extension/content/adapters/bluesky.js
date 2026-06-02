// Adapter for Bluesky — bsky.app
// Supports up to 4 images per post (Bluesky platform limit).
//
// Bluesky uses expo-image-picker (legacy mode on web) which creates a hidden
// <input type="file"> *on demand* inside a Promise executor when the media
// button is clicked — not as a persistent DOM element.
//
// Content scripts run in an isolated JS world, so prototype overrides there
// have NO effect on expo-image-picker's page context.  We therefore delegate
// file injection to the background worker (CDP_INJECT_FILES_BLUESKY), which
// uses Runtime.evaluate to override HTMLInputElement.prototype.click *in the
// page context*, clicks openMediaBtn, captures the dynamically-created input,
// and sets files via DOM.setFileInputFiles (trusted native C++ event).
//
// Selector notes (current social-app source, 2025+):
//   • Compose button  — aria-label="Compose new post"
//   • Composer open?  — [data-testid="composerPublishBtn"] (the Post button)
//   • Media button    — [data-testid="openMediaBtn"]
//   • data-testid="composer" no longer exists in the current codebase.

window.CrosspostBridge._currentAdapter = {
  platform: "bluesky",

  async inject(target) {
    const bridge = window.CrosspostBridge;
    try {
      // ── 1. Ensure compose dialog is open ──────────────────────────────────
      // [data-testid="composerPublishBtn"] is the Post/Publish button rendered
      // inside the composer; it is the most reliable open-indicator available.
      let composerOpen = !!(
        document.querySelector('[data-testid="composerPublishBtn"]') ||
        document.querySelector('[data-testid="composer"]')
      );

      if (!composerOpen) {
        const newPostBtn = document.querySelector(
          '[aria-label="Compose new post"], ' +
          '[data-testid="composeBtn"], ' +
          '[aria-label="New post"]',
        );
        if (newPostBtn) {
          newPostBtn.click();
          const appeared = await bridge.waitForElement(
            '[data-testid="composerPublishBtn"], [data-testid="composer"]',
            3000,
          );
          composerOpen = !!appeared;
        }
      }

      if (!composerOpen) {
        bridge.notify("Open the compose window first", "error");
        return null;
      }

      // ── 2. Fetch the app-selected queue (max 4 for Bluesky) ──────────────
      const { images, targetId } = await bridge.getQueuedImages(target || "bluesky");

      const toInject = images.length > 0
        ? images.slice(0, 4)
        : await bridge.getNextImage(target || "bluesky").then((img) => [img]).catch(() => []);

      if (!toInject.length) {
        bridge.notify("No images queued — select images in the Crosspost Helper app first", "error");
        return null;
      }

      // ── 3. Inject via CDP (trusted native file selection) ─────────────────
      // The worker overrides HTMLInputElement.prototype.click in the page
      // context, clicks openMediaBtn, captures the dynamically-created file
      // input, and sets our files via DOM.setFileInputFiles — a trusted C++
      // event that expo-image-picker processes like a real OS file selection.
      bridge.notify(`Injecting ${toInject.length} image(s)…`, "info");
      const imageIds = toInject.map((i) => i.id);

      const cdpResult = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "CDP_INJECT_FILES_BLUESKY", imageIds }, resolve);
      });

      if (!cdpResult?.ok) {
        bridge.notify(cdpResult?.error ?? "File injection failed", "error");
        return null;
      }

      const resolvedTargetId = targetId ?? toInject[0]?.targetId;

      // ── 5. Fill AI post text if available ────────────────────────────────
      // Wait for Bluesky to process the injected files and re-render.
      await new Promise((r) => setTimeout(r, 800));

      const postContent = await bridge.getPostContent("bluesky").catch(() => null);
      let textFilled = false;
      if (postContent) {
        const textarea =
          document.querySelector('[data-testid="composeTextInput"]') ??
          document.querySelector('[contenteditable="true"]') ??
          document.querySelector("textarea");
        if (textarea) {
          const tags = (postContent.tags ?? [])
            .map((t) => (t.startsWith("#") ? t : "#" + t))
            .join(" ");
          const text = [postContent.description, tags].filter(Boolean).join("\n");
          if (text) {
            textFilled = await bridge.fillTextField(textarea, text);
            if (!textFilled) {
              await navigator.clipboard.writeText(text).catch(() => {});
              bridge.notify(`✓ ${toInject.length} image(s) added — text injection failed, copied to clipboard → Ctrl+V`, "info");
              return { imageIds, targetId: resolvedTargetId, filename: toInject.map((i) => i.filename).join(", ") };
            }
          }
        }
      }

      bridge.notify(`✓ ${toInject.length} image(s) added${textFilled ? " + text filled" : ""} — ready to post`, "success");
      return { imageIds, targetId: resolvedTargetId, filename: toInject.map((i) => i.filename).join(", ") };
    } catch (err) {
      bridge.notify(err.message, "error");
      return null;
    }
  },
};
