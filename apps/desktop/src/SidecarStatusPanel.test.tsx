import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SidecarStatusPanel } from "./SidecarStatusPanel";

it("shows a checking state before the first status arrives", () => {
  expect(renderToStaticMarkup(<SidecarStatusPanel view={undefined} />)).toContain("Checking");
});

it("shows a healthy sidecar with its process id and version", () => {
  const html = renderToStaticMarkup(
    <SidecarStatusPanel
      view={{
        kind: "status",
        status: {
          state: "healthy",
          pid: 4242,
          version: "0.0.0",
          lastHealthAtMs: Date.UTC(2026, 10, 2, 12, 0, 0),
          exitCode: null,
          error: null,
        },
      }}
    />,
  );
  expect(html).toContain('data-state="healthy"');
  expect(html).toContain("Healthy");
  expect(html).toContain("4242");
  expect(html).toContain("0.0.0");
  expect(html).toContain("2026-11-02T12:00:00.000Z");
  expect(html).not.toContain("Exit code");
});

it("shows a failed sidecar with its exit code and error", () => {
  const html = renderToStaticMarkup(
    <SidecarStatusPanel
      view={{
        kind: "status",
        status: {
          state: "failed",
          pid: null,
          version: null,
          lastHealthAtMs: null,
          exitCode: 1,
          error: "The local runtime exited unexpectedly.",
        },
      }}
    />,
  );
  expect(html).toContain("Failed");
  expect(html).toContain("Exit code");
  expect(html).toContain("The local runtime exited unexpectedly.");
});

it("shows an unavailable shell", () => {
  const html = renderToStaticMarkup(
    <SidecarStatusPanel view={{ kind: "unavailable", reason: "The desktop shell is not reachable." }} />,
  );
  expect(html).toContain("Unavailable");
  expect(html).toContain("The desktop shell is not reachable.");
});
