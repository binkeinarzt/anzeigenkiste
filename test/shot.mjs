// Screenshot des Dashboards mit Beispieldaten (für README / Store-Eintrag).
import puppeteer from "puppeteer-core";
import { fileURLToPath } from "node:url";
const ext = fileURLToPath(new URL("../dist/chrome", import.meta.url));
const b = await puppeteer.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true, enableExtensions: [ext], args: ["--no-sandbox"] });
const sw = await b.waitForTarget((t) => t.type() === "service_worker");
const id = new URL(sw.url()).host;
const p = await b.newPage();
await p.setViewport({ width: 1200, height: 760, deviceScaleFactor: 1 });
await p.goto(`chrome-extension://${id}/dashboard/dashboard.html`);
await p.evaluate(async () => {
  const items = [
    ["Rennrad Cube Attain, RH 56", "640", "NEGOTIABLE", ["Fahrräder", "Herren"], 1204, "1060 Wien"],
    ["IKEA Kallax Regal 4x4 weiß", "45", "FIXED", ["Möbel & Wohnen", "Regale"], 387, "3021 Pressbaum"],
    ["Nintendo Switch OLED + 2 Spiele", "250", "NEGOTIABLE", ["Konsolen", "Nintendo"], 2911, "1120 Wien"],
    ["Winterjacke The North Face M", "70", "FIXED", ["Mode", "Herrenbekleidung"], 158, "3021 Pressbaum"],
    ["Umzugskartons, 20 Stück", "", "GIVE_AWAY", ["Sonstiges"], 96, "1150 Wien"]
  ];
  for (const [title, price, priceType, category, , location] of items)
    await AK.store.saveAd({ title, price, priceType, category, location, description: "", images: [] });
});
await new Promise((r) => setTimeout(r, 600));
await p.screenshot({ path: fileURLToPath(new URL("../site/dashboard.png", import.meta.url)) });
await b.close();
console.log("site/dashboard.png");
