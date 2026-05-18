// Adapter for X (Twitter) — twitter.com / x.com
// Finds the file input inside the compose dialog and injects the image.

window.CrosspostBridge._currentAdapter = {
  platform: "x",

  async inject(target) {
    const bridge = window.CrosspostBridge;
    try {
      // 1. Get next image from Electron
      const image = await bridge.getNextImage(target || "x");

      // 2. Ensure the compose dialog is open.
      //    If the tweet textarea isn't visible, click the compose button.
      let textarea = document.querySelector('[data-testid="tweetTextarea_0"]');
      if (!textarea) {
        const composeBtn = document.querySelector(
          '[data-testid="SideNav_NewTweet_Button"], ' +
          '[data-testid="FloatingActionButtons_Tweet"], ' +
          'a[href="/compose/tweet"]'
        );
        if (composeBtn) {
          composeBtn.click();
          textarea = await bridge.waitForElement('[data-testid="tweetTextarea_0"]', 2500);
        }
      }

      if (!textarea) {
        bridge.notify("Open the compose window first", "error");
        return null;
      }

      // 3. Find the file input (X uses data-testid="fileInput")
      const input = document.querySelector('input[data-testid="fileInput"]');
      if (!input) {
        bridge.notify("Could not find the media upload input", "error");
        return null;
      }

      // 4. Fetch the image blob and inject
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
