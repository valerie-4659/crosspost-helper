const BRIDGE_URL = "http://127.0.0.1:27842";

const PLATFORMS = {
  "twitter.com": "x",
  "x.com": "x",
  "bsky.app": "bluesky",
  "deviantart.com": "deviantart",
  "civitai.com": "civitai",
  "civitai.red": "civitai",
};

const PLATFORM_LABELS = {
  x: "𝕏  Twitter / X",
  bluesky: "🦋 Bluesky",
  deviantart: "🎨 DeviantArt",
  civitai: "⚙️ CivitAI",
};

let currentTab = null;
let currentTarget = null;
let pendingImage = null; // { imageId, targetId, filename }

const dot = document.getElementById("status-dot");
const badge = document.getElementById("platform-badge");
const imageInfo = document.getElementById("image-info");
const injectBtn = document.getElementById("inject-btn");
const markSection = document.getElementById("mark-section");
const markBtn = document.getElementById("mark-btn");
const msg = document.getElementById("msg");

function setMsg(text, type = "") {
  msg.textContent = text;
  msg.className = `msg ${type}`;
}

function showImageInfo(text, hint = "") {
  imageInfo.innerHTML = `<div class="filename">${text}</div>${hint ? `<div class="hint">${hint}</div>` : ""}`;
}

function targetFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return PLATFORMS[host] ?? null;
  } catch { return null; }
}

async function checkStatus() {
  try {
    const res = await fetch(`${BRIDGE_URL}/status`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    dot.className = "status-dot connected";
    dot.title = `Connected — Crosspost Helper v${data.version}`;
    return true;
  } catch {
    dot.className = "status-dot error";
    dot.title = "App not running";
    showImageInfo("App is not running", "Start Crosspost Helper first");
    return false;
  }
}

async function loadNextImage(target) {
  try {
    const res = await fetch(`${BRIDGE_URL}/next-image?target=${encodeURIComponent(target)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showImageInfo("No images available", body.error || "");
      return;
    }
    const img = await res.json();
    showImageInfo(img.filename, `Next up for ${PLATFORM_LABELS[target] ?? target}`);
    injectBtn.disabled = false;
  } catch {
    showImageInfo("Could not load next image", "Check that the app is running");
  }
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  currentTarget = targetFromUrl(tab?.url ?? "");

  if (currentTarget) {
    badge.textContent = PLATFORM_LABELS[currentTarget] ?? currentTarget;
    badge.className = "platform-badge active";
  } else {
    badge.textContent = "— not a supported page —";
    injectBtn.disabled = true;
    setMsg("Open X, Bluesky, DeviantArt, or CivitAI");
  }

  const alive = await checkStatus();
  if (alive && currentTarget) await loadNextImage(currentTarget);
}

injectBtn.addEventListener("click", async () => {
  if (!currentTab || !currentTarget) return;
  injectBtn.disabled = true;
  setMsg("Injecting…");
  markSection.className = "";

  chrome.tabs.sendMessage(currentTab.id, { type: "INJECT_IMAGE", target: currentTarget }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      setMsg("Could not reach the page. Reload and try again.", "error");
      injectBtn.disabled = false;
      return;
    }
    if (!resp.ok) {
      setMsg(resp.error ?? "Injection failed", "error");
      injectBtn.disabled = false;
      return;
    }
    pendingImage = { imageId: resp.imageId, targetId: resp.targetId, filename: resp.filename };
    setMsg(`Image ready — submit the post, then click below`, "success");
    markSection.className = "visible";
  });
});

markBtn.addEventListener("click", async () => {
  if (!pendingImage) return;
  markBtn.disabled = true;
  try {
    const res = await fetch(`${BRIDGE_URL}/mark-posted`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pendingImage),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setMsg(`✓ Marked as posted`, "success");
    markSection.className = "";
    pendingImage = null;
    injectBtn.disabled = false;
    // Refresh the next image preview
    if (currentTarget) await loadNextImage(currentTarget);
  } catch (err) {
    setMsg(err.message, "error");
    markBtn.disabled = false;
  }
});

init();
