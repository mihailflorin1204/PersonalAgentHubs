import type { SidecarState, SidecarView } from "./sidecar-status";

const STATE_LABELS: Record<SidecarState, string> = {
  starting: "Starting",
  healthy: "Healthy",
  unhealthy: "Not responding",
  stopped: "Stopped",
  failed: "Failed",
};

export interface SidecarStatusPanelProps {
  view: SidecarView | undefined;
}

export function SidecarStatusPanel({ view }: SidecarStatusPanelProps) {
  if (!view) {
    return (
      <section className="panel" aria-label="Local runtime">
        <h2>Local runtime</h2>
        <p className="state" data-state="checking">
          Checking…
        </p>
      </section>
    );
  }

  if (view.kind === "unavailable") {
    return (
      <section className="panel" aria-label="Local runtime">
        <h2>Local runtime</h2>
        <p className="state" data-state="unavailable">
          Unavailable
        </p>
        <p className="detail">{view.reason}</p>
      </section>
    );
  }

  const { status } = view;
  return (
    <section className="panel" aria-label="Local runtime">
      <h2>Local runtime</h2>
      <p className="state" data-state={status.state}>
        {STATE_LABELS[status.state]}
      </p>
      <dl>
        {status.pid !== null && (
          <>
            <dt>Process</dt>
            <dd>{status.pid}</dd>
          </>
        )}
        {status.version !== null && (
          <>
            <dt>Version</dt>
            <dd>{status.version}</dd>
          </>
        )}
        {status.lastHealthAtMs !== null && (
          <>
            <dt>Last health check</dt>
            <dd>{new Date(status.lastHealthAtMs).toISOString()}</dd>
          </>
        )}
        {status.exitCode !== null && (
          <>
            <dt>Exit code</dt>
            <dd>{status.exitCode}</dd>
          </>
        )}
      </dl>
      {status.error !== null && <p className="detail">{status.error}</p>}
    </section>
  );
}
