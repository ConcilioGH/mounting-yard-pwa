/** Standalone iOS 12 interaction diagnostic — raw HTML, no React layout or app bundle. */
export const dynamic = "force-dynamic";

const IOS_TEST_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <title>iOS interaction test</title>
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
    button + button { background: #2563eb; }
  </style>
</head>
<body>
  <h1>iOS interaction test</h1>
  <p>Pure HTML — no React, no app shell. Tap a button or anywhere on the page.</p>
  <button onclick="alert('CLICK WORKS')">INLINE CLICK TEST</button>
  <button ontouchstart="alert('TOUCH WORKS')">INLINE TOUCH TEST</button>
  <script>
    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        regs.forEach(function(r) { r.unregister(); });
      });
    }
    document.addEventListener('click', function() {
      document.body.style.background = 'green';
    }, true);
  </script>
</body>
</html>`;

export function GET() {
  return new Response(IOS_TEST_HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
