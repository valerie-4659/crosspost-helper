import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles.css";

// Crosspost Helper is an Electron-only desktop app.
// If it is accidentally opened in a plain browser (e.g. via `npm run preview`),
// the Electron preload bridge is absent and nothing will work.
// Show a helpful error instead of cascading TypeError crashes.
if (!("desktop" in window)) {
  document.getElementById("app")!.innerHTML = `
    <div style="display:flex;height:100vh;align-items:center;justify-content:center;
                font-family:ui-sans-serif,system-ui,sans-serif;background:#0b0d10;
                color:#94a3b8;text-align:center;padding:2rem;">
      <div>
        <p style="font-size:1.125rem;font-weight:600;color:#f5f7fb;margin:0 0 .5rem;">
          Crosspost Helper requires Electron
        </p>
        <p style="margin:0;line-height:1.6;">
          This app cannot run in a plain browser.<br>
          Start it with
          <code style="background:#1c222d;color:#70d6ff;padding:2px 7px;
                        border-radius:4px;font-size:.9em;">npm run electron:dev</code>
        </p>
      </div>
    </div>`;
} else {
  const app = createApp(App).use(createPinia());
  app.config.errorHandler = (err, instance, info) => {
    console.error("[Vue Error]", info, err, instance);
  };
  app.mount("#app");
}

