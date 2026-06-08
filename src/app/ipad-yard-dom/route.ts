/** iPad Yard — full DOM assessment page, inline onclick pattern. */
import { buildIpadYardDomHtml } from "@/lib/ipad-yard-dom-html";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(buildIpadYardDomHtml(), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
