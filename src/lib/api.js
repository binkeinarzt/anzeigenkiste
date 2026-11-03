// Einheitlicher Zugriff auf die Extension-API (Chrome + Firefox, Manifest V3).
// In MV3 liefern beide Browser Promises zurück.
(function () {
  const api = globalThis.browser ?? globalThis.chrome;
  globalThis.AK = globalThis.AK || {};
  globalThis.AK.api = api;
})();
