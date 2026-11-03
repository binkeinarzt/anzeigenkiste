(async function () {
  const AK = globalThis.AK;
  const ads = await AK.store.getAdList();
  document.getElementById("count").textContent = ads.length.toLocaleString("de-AT");
  document.getElementById("views").textContent = ads.reduce((s, a) => s + (a.stats?.views || 0), 0).toLocaleString("de-AT");
  document.getElementById("open").addEventListener("click", async () => {
    await AK.api.tabs.create({ url: AK.api.runtime.getURL("dashboard/dashboard.html") });
    window.close();
  });
})();
