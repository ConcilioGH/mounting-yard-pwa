const ALLOWED_HOSTS = new Set([
  "www.racenet.com.au",
  "racenet.com.au",
  "racing.racingnsw.com.au",
  "www.racingnsw.com.au",
  "www.tab.com.au",
  "tab.com.au",
]);

function isAllowedResultsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    return ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Server-side fetch for official results HTML (Racenet, Racing NSW, TAB). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = String(searchParams.get("url") ?? "").trim();
  if (!url || !isAllowedResultsUrl(url)) {
    return Response.json({ error: "Invalid or disallowed results URL." }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "mounting-yard-pwa/1.0",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return Response.json(
        { error: `Upstream returned ${res.status}.` },
        { status: 502, headers: CORS_HEADERS },
      );
    }
    const text = await res.text();
    if (!text.trim()) {
      return Response.json({ error: "Upstream page was empty." }, { status: 502, headers: CORS_HEADERS });
    }
    return new Response(text, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 502, headers: CORS_HEADERS });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
