import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
await mkdir("docs/verification/screenshots", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
});
const errors = [];
const checks = [];
page.on("pageerror", (error) => errors.push(error.message));
const shot = (name) =>
  page.screenshot({
    path: `docs/verification/screenshots/${name}.png`,
    fullPage: true,
  });
try {
  await page.goto(process.env.PREVIEW_URL || "http://127.0.0.1:8765", {
    waitUntil: "networkidle",
  });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("tab", { name: "Home", exact: true }).waitFor();
  assert.deepEqual(await page.getByRole("tab").allTextContents(), [
    "Home",
    "Explore",
    "Mandir",
    "Sadhana",
    "Profile",
  ]);
  checks.push("Language-only onboarding and exact five-tab order");
  await shot("01-home-en");
  await page.getByRole("tab", { name: "Explore", exact: true }).click();
  await page.getByRole("textbox").fill("hanumaan");
  await page
    .getByRole("button", { name: "Hanuman Chalisa", exact: true })
    .waitFor();
  await shot("02-explore-search");
  await page
    .getByRole("button", { name: "Hanuman Chalisa", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add to favorites", exact: true })
    .click();
  await page.getByRole("button", { name: "Listen", exact: true }).click();
  // Fixture items have no audio stream: the player says so and cannot play.
  await page
    .getByText("Audio for this item isn't available yet.", { exact: true })
    .last()
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Play", exact: true }).isDisabled(),
    true,
  );
  await shot("03-player");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Now playing: Hanuman Chalisa",
      exact: true,
    })
    .waitFor();
  checks.push(
    "Transliteration search, content detail, favorite, player and persistent mini-player",
  );
  await page.getByRole("tab", { name: "Mandir", exact: true }).click();
  await page.getByRole("button", { name: "Shiva", exact: true }).click();
  await page.getByRole("button", { name: "Light diya", exact: true }).click();
  await page
    .getByText("Your diya is glowing", { exact: true })
    .first()
    .waitFor();
  await page
    .getByRole("button", { name: "Offer flowers", exact: true })
    .click();
  await page
    .getByText("Flowers offered · 1", { exact: true })
    .first()
    .waitFor();
  await shot("04-mandir");
  await page
    .getByRole("button", { name: "Watch an ad to offer", exact: true })
    .click();
  await page.getByText(/In the full app, one rewarded ad/).waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  checks.push(
    "First-visit deity selection, diya/flowers and explicit unavailable rewarded-offering dialog",
  );
  await page.getByRole("tab", { name: "Sadhana", exact: true }).click();
  await shot("05-sadhana");
  await page.getByRole("button", { name: /Jaap counter/ }).click();
  for (let i = 0; i < 3; i++) await page.getByTestId("jaap-counter").click();
  assert.equal(
    await page.getByTestId("jaap-counter").getAttribute("aria-label"),
    "Tap to count, 3",
  );
  await shot("06-jaap");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: /Meditation Five minutes/ }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
  await shot("07-meditation");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  checks.push("Local jaap taps and meditation start/pause/resume state");
  await page.getByRole("tab", { name: "Profile", exact: true }).click();
  await page
    .getByRole("button", { name: "Hanuman Chalisa", exact: true })
    .waitFor();
  await shot("08-profile");
  await page.getByRole("button", { name: "हिन्दी", exact: true }).click();
  await page.getByRole("tab", { name: "होम", exact: true }).click();
  await shot("09-home-hi");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "होम", exact: true }).waitFor();
  checks.push(
    "Favorites in Profile, Hindi switching, and persisted onboarding/language after reload",
  );
  const savedState = await page.evaluate(() =>
    localStorage.getItem("bhaktara.local.v1"),
  );
  assert.ok(savedState);
  // Seed before the new app mounts, after the old page's background flush.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("storage-recovery-seeded")) {
      localStorage.setItem("bhaktara.local.v1", "{invalid");
      sessionStorage.setItem("storage-recovery-seeded", "true");
    }
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("alert").waitFor();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("bhaktara.local.v1")),
    "{invalid",
  );
  await shot("10-storage-recovery");
  await page.evaluate(
    (value) => localStorage.setItem("bhaktara.local.v1", value),
    savedState,
  );
  await page
    .getByRole("button", { name: "फिर प्रयास करें", exact: true })
    .click();
  await page.getByRole("tab", { name: "होम", exact: true }).waitFor();
  checks.push(
    "Invalid saved data remains untouched; startup retry restores saved progress",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/verification/browser-smoke.json",
    JSON.stringify({ passed: checks, errors }, null, 2),
  );
  console.log(checks.join("\n"));
} catch (error) {
  await shot("failure");
  await writeFile(
    "docs/verification/browser-smoke.json",
    JSON.stringify({ passed: checks, errors, failure: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
}
