// Minimal background service worker.
// The popup and content scripts talk to the Electron bridge directly.
// This worker only handles install logging and future background tasks.

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Crosspost Helper] Extension installed.");
});
