// Adapter for Bluesky — bsky.app

window.CrosspostBridge._currentAdapter = {
  platform: "bluesky",

  async inject(target) {
    const bridge = window.CrosspostBridge;
    try {
      const image = await bridge.getNextImage(target || "bluesky");

      // Ensure compose dialog is open
      let composer = document.querySelector('[data-testid="composer"]');
      if (!composer) {
        // Click the "New post" button
        const newPostBtn = document.querySelector(
          '[aria-label="New post"], ' +
          '[data-testid="composeBtn"], ' +
          'button[aria-label*="post" i]'
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

      // Bluesky file input is inside the compose area
      // Selector targets the hidden file input for media uploads
      const input =
        composer.querySelector('input[type="file"]') ||
        document.querySelector('input[accept*="image"][type="file"]');

      if (!input) {
        bridge.notify("Could not find the media upload input", "error");
        return null;
      }

      const blob = await bridge.getImageBlob(image.id);
      await bridge.injectFileIntoInput(input, blob, image.filename, image.mimeType);

      bridge.notify(`✓ ${image.filename} — ready to post`, "success");
      return { imageId: image.id, targetId: image.targetId, filename: image.filename };
    } catch (err) {
      bridge.notify(err.message, "error");
      return null;
    }
  },
};
