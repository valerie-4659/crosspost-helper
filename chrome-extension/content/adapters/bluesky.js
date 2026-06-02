// Adapter for Bluesky — bsky.app
// Supports up to 4 images per post (Bluesky platform limit).
//
// Bluesky uses expo-image-picker (legacy mode on web) which creates a hidden
// <input type="file"> *on demand* inside a Promise executor when the media
// button is clicked — not as a persistent DOM element.  We intercept
// document.createElement to capture that element before the OS picker opens,
// then inject our files directly via _injectFilesCore.
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

      // ── 3. Intercept document.createElement to capture expo-image-picker's
      //        dynamically created <input type="file"> before the OS dialog
      //        opens.  The Promise executor inside launchImageLibraryAsync runs
      //        synchronously, so capturedInput is set by the time btn.click()
      //        returns.
      let capturedInput = null;
      const origCreateElement = document.createElement.bind(document);
      document.createElement = function (tagName, ...args) {
        const el = origCreateElement(tagName, ...args);
        if (tagName.toLowerCase() === "input") {
          const origElClick = HTMLInputElement.prototype.click.bind(el);
          el.click = function () {
            if (this.type === "file") {
              capturedInput = this;
              return; // suppress OS file picker
            }
            origElClick();
          };
        }
        return el;
      };

      // Click the image/media button so expo-image-picker creates the input.
      const mediaBtn =
        document.querySelector('[data-testid="openMediaBtn"]') ||
        document.querySelector('[aria-label*="media" i]') ||
        document.querySelector('[aria-label*="image" i]');
      if (mediaBtn) mediaBtn.click();

      // Restore immediately — the Promise executor already ran synchronously.
      document.createElement = origCreateElement;

      if (!capturedInput) {
        bridge.notify("Could not find the media upload input — try reloading", "error");
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

      await bridge.injectMultipleFilesIntoInput(capturedInput, files);

      const resolvedTargetId = targetId ?? toInject[0]?.targetId;
      const imageIds = toInject.map((i) => i.id);

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
