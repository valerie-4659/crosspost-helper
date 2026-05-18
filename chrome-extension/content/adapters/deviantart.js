// Adapter for DeviantArt — deviantart.com
// Works on the /submit page where the file upload dropzone is present.

window.CrosspostBridge._currentAdapter = {
  platform: "deviantart",

  async inject(target) {
    const bridge = window.CrosspostBridge;
    try {
      const image = await bridge.getNextImage(target || "deviantart");

      // Navigate to the submit page if not already there
      if (!window.location.pathname.startsWith("/submit")) {
        bridge.notify("Navigating to deviantart.com/submit …", "info");
        window.location.href = "https://www.deviantart.com/submit";
        return null;
      }

      // DeviantArt's submit page has a file input inside a dropzone
      // Wait for it to be available (the page may lazy-load)
      const input = await bridge.waitForElement('input[type="file"]', 4000);

      if (!input) {
        bridge.notify("Could not find the file upload input on this page", "error");
        return null;
      }

      const blob = await bridge.getImageBlob(image.id);
      await bridge.injectFileIntoInput(input, blob, image.filename, image.mimeType);

      bridge.notify(`✓ ${image.filename} — fill in the details and submit`, "success");
      return { imageId: image.id, targetId: image.targetId, filename: image.filename };
    } catch (err) {
      bridge.notify(err.message, "error");
      return null;
    }
  },
};
