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
  // Node's fetch rejects Expect. Clients and proxies may send it on POST.
  "expect",
]);

// The browser must not choose the client address the API rate-limits on.
const clientAddressHeaders = new Set(["forwarded", "x-real-ip", "true-client-ip", "cf-connecting-ip"]);

const loopbackNames = new Set(["localhost", "127.0.0.1"]);

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

export function readWebOrigins(value: string | undefined, requestUrl: string): string[] {
  if (value === undefined || value.trim() === "") {
    const own = new URL(requestUrl);
    if (!loopbackNames.has(own.hostname)) {
      return [own.origin];
    }
    return [...loopbackNames].map((name) => {
      const alias = new URL(own.origin);
      alias.hostname = name;
      return alias.origin;
    });
  }
  return value.split(",").map((entry) => {
    let url: URL;
    try {
      url = new URL(entry.trim());
    } catch {
      throw new Error("WEB_ORIGINS is invalid");
    }
    if (url.username !== "" || url.password !== "" || (url.protocol !== "http:" && url.protocol !== "https:")) {
      throw new Error("WEB_ORIGINS is invalid");
    }
    return url.origin;
  });
}

export function isAllowedOrigin(origin: string | null, allowed: string[]): boolean {
  return origin !== null && allowed.includes(origin);
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

export function proxyRequestHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  incoming.forEach((value, key) => {
    const name = key.toLowerCase();
    if (hopByHop.has(name) || clientAddressHeaders.has(name) || name.startsWith("x-forwarded-")) {
      return;
    }
    headers.append(key, value);
  });
  return headers;
}

export async function forwardToManagement(request: Request, path: string): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return Response.json({ status: "not_found" }, { status: 404 });
  }
  // Next builds request.url from its configured hostname and port, not the Host
  // header, so a loopback console accepts both loopback names on its port.
  // Behind a proxy or on another hostname, set WEB_ORIGINS.
  const webOrigins = readWebOrigins(process.env.WEB_ORIGINS, request.url);
  if (request.method === "POST" && !isAllowedOrigin(request.headers.get("origin"), webOrigins)) {
    return Response.json({ status: "forbidden" }, { status: 403 });
  }
  const origin = readApiOrigin(process.env.API_URL);
  const incoming = new URL(request.url);
  const target = new URL(`${path}${incoming.search}`, origin);
  const headers = proxyRequestHeaders(request.headers);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "POST" ? request.body : undefined,
      redirect: "manual",
      // Node fetch requires duplex when a streaming body is forwarded.
      duplex: "half",
    } as RequestInit);
  } catch {
    return Response.json({ status: "unavailable" }, { status: 502 });
  }
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
