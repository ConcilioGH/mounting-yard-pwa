/** Standalone iOS 12 legacy yard — raw HTML only, same pattern as /ios-test. */
export const dynamic = "force-dynamic";

const LEGACY_YARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <title>Legacy Yard</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      background: #ffffff;
      color: #111;
    }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { font-size: 14px; color: #444; margin: 0 0 20px; }
    .status {
      margin: 0 0 20px;
      padding: 16px;
      border: 2px solid #ef4444;
      border-radius: 12px;
      background: #fef2f2;
      font-size: 16px;
      line-height: 1.6;
    }
    button {
      display: block;
      width: 100%;
      max-width: 360px;
      margin: 16px 0;
      padding: 18px 20px;
      font-size: 20px;
      font-weight: 700;
      border: 2px solid #111;
      border-radius: 12px;
      background: #ef4444;
      color: #fff;
      cursor: pointer;
    }
    button.btn-r2 { background: #2563eb; }
    button.btn-horse { background: #16a34a; }
    button.btn-factor { background: #9333ea; }
  </style>
</head>
<body>
  <h1>Legacy Yard</h1>
  <p>Pure HTML — no React, no app shell, no service worker. Tap a button.</p>
  <div class="status">
    <div><strong>Tap count:</strong> <span id="tap-count">0</span></div>
    <div><strong>Selected race:</strong> <span id="selected-race">—</span></div>
    <div><strong>Selected horse:</strong> <span id="selected-horse">—</span></div>
    <div><strong>Selected factor:</strong> <span id="selected-factor">—</span></div>
  </div>
  <button type="button" onclick="legacyTapRace('R1')">R1</button>
  <button type="button" class="btn-r2" onclick="legacyTapRace('R2')">R2</button>
  <button type="button" class="btn-horse" onclick="legacyTapHorse('Horse 1')">Horse 1</button>
  <button type="button" class="btn-factor" onclick="legacyTapFactor('Clean+')">Clean+</button>
  <script>
    window.legacyTapCount = 0;

    function legacyBump() {
      window.legacyTapCount = window.legacyTapCount + 1;
      document.getElementById('tap-count').textContent = String(window.legacyTapCount);
    }

    function legacyTapRace(raceId) {
      legacyBump();
      document.getElementById('selected-race').textContent = raceId;
    }

    function legacyTapHorse(horseName) {
      legacyBump();
      document.getElementById('selected-horse').textContent = horseName;
    }

    function legacyTapFactor(factorName) {
      legacyBump();
      document.getElementById('selected-factor').textContent = factorName;
    }
  </script>
</body>
</html>`;

export function GET() {
  return new Response(LEGACY_YARD_HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
