const TAB_API_BASE = "https://api.beta.tab.com.au/v1/tab-info-service/";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function safeTabPath(path: string): string | null {
  const normalized = path.replace(/^\//, "").trim();
  if (!normalized || normalized.includes("..")) return null;
  if (!normalized.startsWith("racing/")) return null;
  return normalized;
}

function safeJurisdiction(value: string): string {
  const upper = value.trim().toUpperCase();
  if (/^(NSW|VIC|QLD|SA|WA|TAS|ACT)$/.test(upper)) return upper;
  return "NSW";
}

/** Server-side proxy for TAB racing JSON API. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = safeTabPath(String(searchParams.get("path") ?? ""));
  const jurisdiction = safeJurisdiction(String(searchParams.get("jurisdiction") ?? "NSW"));
  if (!path) {
    return Response.json({ error: "Invalid TAB API path." }, { status: 400, headers: CORS_HEADERS });
  }

  const url = `${TAB_API_BASE}${path}?jurisdiction=${encodeURIComponent(jurisdiction)}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "mounting-yard-pwa/1.0",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      return Response.json(
        { error: `TAB API returned ${res.status}.` },
        { status: 502, headers: CORS_HEADERS },
      );
    }
    const text = await res.text();
    if (!text.trim()) {
      return Response.json({ error: "TAB API response was empty." }, { status: 502, headers: CORS_HEADERS });
    }
    return new Response(text, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
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
