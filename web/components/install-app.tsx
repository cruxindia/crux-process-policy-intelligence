"use client";
// Registers the service worker and offers "Install app" (Chrome/Edge/Android) or the Add-to-Home-Screen hint (iPhone/iPad).
import { useEffect, useState, useSyncExternalStore } from "react";

type BeforeInstall = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const noop = () => () => {};

export function InstallApp() {
  const [evt, setEvt] = useState<BeforeInstall | null>(null);
  const [hint, setHint] = useState(false);
  // Read from the browser without an effect (no extra render; the server snapshot is "not iOS / not installed").
  const standalone = useSyncExternalStore(noop, () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true, () => false);
  const ios = useSyncExternalStore(noop, () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1), () => false) && !standalone;

  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BeforeInstall); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setEvt(null));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (evt) return (
    <button type="button" className="secondary" data-testid="install-app"
      onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); }}>Install app</button>
  );
  if (ios) return (
    <span className="small">
      <button type="button" className="secondary" data-testid="install-app" onClick={() => setHint((h) => !h)}>Install app</button>
      {hint && <span className="muted"> Tap Share, then “Add to Home Screen”.</span>}
    </span>
  );
  return null;
}
