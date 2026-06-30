/** Client fetch for TAB JSON API via same-origin proxy. */
export async function fetchTabApiJson<T>(path: string, jurisdiction: string): Promise<T> {
  const trimmedPath = path.replace(/^\//, "");
  const url = `/api/fetch-tab-api?path=${encodeURIComponent(trimmedPath)}&jurisdiction=${encodeURIComponent(jurisdiction)}`;
  const res = await fetch(url, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `TAB API request failed (${res.status}).`);
  }
  return (await res.json()) as T;
}
