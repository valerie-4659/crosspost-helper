// Adapter for CivitAI — civitai.com and civitai.red
// Works on the post creation page (/posts/create).

window.CrosspostBridge._currentAdapter = {
  platform: "civitai",

  async inject(target) {
    const bridge = window.CrosspostBridge;
    try {
      const image = await bridge.getNextImage(target || "civitai");

      // If not on the post creation page, navigate there
      const onCreatePage =
        window.location.pathname.includes("/posts/create") ||
        window.location.pathname.includes("/images/upload");

      if (!onCreatePage) {
        bridge.notify("Navigating to civitai.com/posts/create …", "info");
        window.location.href = `${window.location.origin}/posts/create`;
        return null;
      }

      // CivitAI uses a dropzone with a hidden file input
      const input = await bridge.waitForElement('input[type="file"]', 4000);

      if (!input) {
        bridge.notify("Could not find the file upload input on this page", "error");
        return null;
      }

      const blob = await bridge.getImageBlob(image.id);
      await bridge.injectFileIntoInput(input, blob, image.filename, image.mimeType);

      bridge.notify(`✓ ${image.filename} — add tags and publish`, "success");
      return { imageId: image.id, targetId: image.targetId, filename: image.filename };
    } catch (err) {
      bridge.notify(err.message, "error");
      return null;
    }
  },
};
