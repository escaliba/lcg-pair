export function pairPageHTML(callbackPort: number, nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>lcg pair</title>
  <style>
    html, body { background: #0a0a0a; color: #fafafa; font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; height: 100%; }
    main { display: flex; align-items: center; justify-content: center; height: 100vh; padding: 24px; }
    .card { max-width: 420px; text-align: center; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    p { font-size: 14px; color: #a3a3a3; line-height: 1.5; margin: 6px 0; }
    .clash { height: 1px; background: linear-gradient(to right, #fde047 0% 28%, #f43f5e 32% 100%); margin: 16px 0; }
  </style>
</head>
<body>
<main>
  <div class="card">
    <h1>Connecting your Steam account to lcg</h1>
    <div class="clash"></div>
    <p>A Rust+ login window should pop up. Sign in with Steam there.</p>
    <p>If popups are blocked, allow them for this page and refresh.</p>
  </div>
</main>
<script type="text/javascript">
  var NONCE = ${JSON.stringify(nonce)};
  var popupWindow = window.open("https://companion-rust.facepunch.com/login", "_blank", "width=520,height=720");

  var handlerInterval = setInterval(function() {
    try {
      if (popupWindow && popupWindow.ReactNativeWebView === undefined) {
        popupWindow.ReactNativeWebView = {
          postMessage: function(message) {
            clearInterval(handlerInterval);
            try {
              var auth = JSON.parse(message);
              window.location.href = "http://localhost:${callbackPort}/callback?n=" + encodeURIComponent(NONCE) + "&token=" + encodeURIComponent(auth.Token);
            } catch (e) {
              window.location.href = "http://localhost:${callbackPort}/callback?n=" + encodeURIComponent(NONCE) + "&error=" + encodeURIComponent(String(e));
            }
            try { popupWindow.close(); } catch (e) {}
          },
        };
      }
    } catch (e) {}
  }, 250);
</script>
</body>
</html>`;
}
