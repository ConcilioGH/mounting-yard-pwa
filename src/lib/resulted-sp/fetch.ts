/** Fetch results page HTML via same-origin API proxy (avoids CORS). */
export type ResultsHtmlFetchMeta = {
  resolvedUrl: string;
  httpStatus: number;
  responseLength: number;
  redirectsFollowed: string[];
};

export async function fetchResultsHtmlWithMeta(url: string): Promise<{ html: string; meta: ResultsHtmlFetchMeta }> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Results URL is empty.");
  const apiUrl = `/api/fetch-results-html?url=${encodeURIComponent(trimmed)}`;
  const res = await fetch(apiUrl, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "text/html" },
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `Could not fetch results page (${res.status}).`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* html error body */
    }
    throw new Error(message);
  }
  if (!text.trim()) throw new Error("Fetched results page was empty.");

  const redirectsHeader = res.headers.get("X-Resulted-Sp-Redirects") ?? "";
  const redirectsFollowed = redirectsHeader
    ? redirectsHeader.split(" | ").map((part) => part.trim()).filter(Boolean)
    : [];

  return {
    html: text,
    meta: {
      resolvedUrl: res.headers.get("X-Resulted-Sp-Final-Url") || trimmed,
      httpStatus: res.status,
      responseLength: text.length,
      redirectsFollowed,
    },
  };
}

export async function fetchResultsHtml(url: string): Promise<string> {
  const { html } = await fetchResultsHtmlWithMeta(url);
  return html;
}
