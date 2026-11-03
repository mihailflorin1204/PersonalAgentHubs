const hopByHop = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

export function readApiOrigin(value: string | undefined): string {
  const raw = value === undefined || value.trim() === "" ? "http://127.0.0.1:3001" : value.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("API_URL is invalid");
  }
  if (url.username !== "" || url.password !== "" || (url.protocol !== "http:" && url.protocol !== "https:")) {
    throw new Error("API_URL is invalid");
  }
  return url.origin;
}

export function authProxyPath(segments: string[]): string | null {
  if (segments.length === 0 || segments.some((segment) => !isSafeSegment(segment))) {
    return null;
  }
  return `/api/auth/${segments.join("/")}`;
}

export function organizationProxyPath(organizationId?: string): string | null {
  if (organizationId === undefined) {
    return "/organizations";
  }
  if (!isSafeSegment(organizationId)) {
    return null;
  }
  return `/organizations/${organizationId}`;
}

export function proxyRequestHeaders(incoming: Headers, apiOrigin: string): Headers {
  const headers = new Headers();
  incoming.forEach((value, key) => {
    if (hopByHop.has(key.toLowerCase())) {
      return;
    }
    headers.append(key, value);
  });
  const api = new URL(apiOrigin);
  headers.set("origin", apiOrigin);
  headers.set("host", api.host);
  headers.set("referer", `${apiOrigin}/`);
  return headers;
}

export async function forwardToManagement(request: Request, path: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return Response.json({ status: "not_found" }, { status: 404 });
  }
  const origin = readApiOrigin(process.env.API_URL);
  const incoming = new URL(request.url);
  const target = new URL(`${path}${incoming.search}`, origin);
  const headers = proxyRequestHeaders(request.headers, origin);
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "POST" ? request.body : undefined,
    redirect: "manual",
    // Node fetch requires duplex when a streaming body is forwarded.
    duplex: "half",
  } as RequestInit);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders(upstream.headers),
  });
}

function responseHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  const cookies = typeof incoming.getSetCookie === "function" ? incoming.getSetCookie() : [];
  incoming.forEach((value, key) => {
    const name = key.toLowerCase();
    if (name === "set-cookie" || hopByHop.has(name)) {
      return;
    }
    headers.append(key, value);
  });
  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }
  return headers;
}

function isSafeSegment(segment: string): boolean {
  return segment.length > 0 && segment !== "." && segment !== ".." && !segment.includes("/") && !segment.includes("\\");
}
