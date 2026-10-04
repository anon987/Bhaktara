import { chromium } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
const passed = [];
page.on("pageerror", (error) => errors.push(error.message));
const sessionId = () =>
  page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) =>
      key.startsWith("firebase:authUser:"),
    );
    return key ? JSON.parse(localStorage.getItem(key)).uid : null;
  });
await mkdir("docs/verification/screenshots", { recursive: true });
try {
  // Firestore keeps long-poll requests open; readiness comes from visible UI.
  await page.goto(process.env.PREVIEW_URL || "http://127.0.0.1:8766", {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByText(/Development guest connected/).waitFor();
  await page.getByRole("button", { name: /Begin with/ }).waitFor();
  const uid = await sessionId();
  assert.ok(uid);
  passed.push("Real emulator guest and published catalog load");
  await page.getByRole("tab", { name: "Explore", exact: true }).click();
  await page.getByRole("textbox").fill("hanumaan");
  await page
    .getByRole("button", { name: "Hanuman Chalisa", exact: true })
    .waitFor();
  passed.push("Firestore transliteration search");
  await page.getByRole("textbox").fill("durga");
  await page.getByRole("button", { name: "Durga aarti", exact: true }).click();
  await page
    .getByRole("button", { name: "Add to favorites", exact: true })
    .click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText(/Development guest connected/).waitFor();
  assert.equal(await sessionId(), uid);
  passed.push("Anonymous identity persists across page reload");
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Durga aarti", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Durga aarti", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove from favorites", exact: true })
    .waitFor();
  passed.push(
    "Persisted favorite outside initial catalog page loads and opens",
  );
  await page.screenshot({
    path: "docs/verification/screenshots/11-firebase-content.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/verification/firebase-browser-smoke.json",
    JSON.stringify({ passed, errors }, null, 2),
  );
  console.log(passed.join("\n"));
} catch (error) {
  await page.screenshot({
    path: "docs/verification/screenshots/firebase-failure.png",
    fullPage: true,
  });
  await writeFile(
    "docs/verification/firebase-browser-smoke.json",
    JSON.stringify({ passed, errors, failure: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
