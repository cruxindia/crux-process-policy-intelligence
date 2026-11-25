"use client";
// Registers the service worker and offers "Install app" (Chrome/Edge/Android) or the Add-to-Home-Screen hint (iPhone/iPad).
import { useEffect, useState } from "react";

type BeforeInstall = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function InstallApp() {
  const [evt, setEvt] = useState<BeforeInstall | null>(null);
  const [ios, setIos] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BeforeInstall); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setEvt(null));
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
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
