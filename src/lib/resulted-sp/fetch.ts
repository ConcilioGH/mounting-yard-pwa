/** Fetch results page HTML via same-origin API proxy (avoids CORS). */
export async function fetchResultsHtml(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Results URL is empty.");
  const apiUrl = `/api/fetch-results-html?url=${encodeURIComponent(trimmed)}`;
  const res = await fetch(apiUrl, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "text/html" },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `Could not fetch results page (${res.status}).`);
  }
  const text = await res.text();
  if (!text.trim()) throw new Error("Fetched results page was empty.");
  return text;
}
