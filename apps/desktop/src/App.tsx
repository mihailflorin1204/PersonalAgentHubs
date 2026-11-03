import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { SidecarStatusPanel } from "./SidecarStatusPanel";
import { readSidecarStatus, type SidecarView } from "./sidecar-status";

const POLL_INTERVAL_MS = 2_000;

export function App() {
  const [view, setView] = useState<SidecarView | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const next = await readSidecarStatus((command) => invoke(command));
      if (!cancelled) {
        setView(next);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <main>
      <header>
        <h1>AgentHub</h1>
        <p>Developer workspace</p>
      </header>
      <SidecarStatusPanel view={view} />
    </main>
  );
}
