/** Client fetch for TAB JSON API via same-origin proxy. */
export type TabApiFetchMeta = {
  resolvedUrl: string;
  httpStatus: number;
  responseLength: number;
};

export async function fetchTabApiJsonWithMeta<T>(
  path: string,
  jurisdiction: string,
): Promise<{ data: T; meta: TabApiFetchMeta }> {
  const trimmedPath = path.replace(/^\//, "");
  const resolvedUrl = `/api/fetch-tab-api?path=${encodeURIComponent(trimmedPath)}&jurisdiction=${encodeURIComponent(jurisdiction)}`;
  const res = await fetch(resolvedUrl, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `TAB API request failed (${res.status}).`;
    try {
      const data = JSON.parse(text) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return {
    data: JSON.parse(text) as T,
    meta: {
      resolvedUrl,
      httpStatus: res.status,
      responseLength: text.length,
    },
  };
}

export async function fetchTabApiJson<T>(path: string, jurisdiction: string): Promise<T> {
  const { data } = await fetchTabApiJsonWithMeta<T>(path, jurisdiction);
  return data;
}
