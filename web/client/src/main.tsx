import { render } from "preact";
import { App } from "./app.js";
import "./style.css";

const root = document.getElementById("app");
if (root) render(<App />, root);

// Offline shell. Visitors run this on foreign eSIMs and hotel wifi that drops;
// the app should still open, and say so, rather than fail to load at all.
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support is a bonus, never a blocker */
    });
  });
}
