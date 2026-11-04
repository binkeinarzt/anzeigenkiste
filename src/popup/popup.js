(async function () {
  const AK = globalThis.AK;
  const ads = await AK.store.getAdList();
  document.getElementById("count").textContent = ads.length.toLocaleString("de-AT");
  const value = ads.reduce((s, a) => s + (parseFloat(a.price) || 0), 0);
  document.getElementById("value").textContent = `${Math.round(value).toLocaleString("de-AT")} €`;
  document.getElementById("open").addEventListener("click", async () => {
    await AK.api.tabs.create({ url: AK.api.runtime.getURL("dashboard/dashboard.html") });
    window.close();
  });
})();
