/**
 * Verify mobile bottom sheet sizing at a phone viewport.
 * Usage: BASE_URL=http://localhost:3003 node scripts/verify-bottom-sheet.mjs
 */
import { chromium, devices } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3003";

async function checkSheet(page, triggerSelector) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  const trigger = page.locator(triggerSelector);
  await trigger.waitFor({ state: "visible" });
  await trigger.click();

  const dialog = page.locator('[role="dialog"][data-state="open"]').last();
  await dialog.waitFor({ state: "visible", timeout: 10000 });

  const metrics = await dialog.evaluate((el) => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      height: rect.height,
      top: rect.top,
      viewportHeight: window.innerHeight,
      borderTopLeftRadius: style.borderTopLeftRadius,
      maxHeight: style.maxHeight,
      overflow: style.overflow,
    };
  });

  const overlayVisible = await page
    .locator('[data-state="open"].fixed.inset-0')
    .first()
    .isVisible();

  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});

  return { ...metrics, overlayVisible };
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge" });
  const context = await browser.newContext({
    ...devices["iPhone 14"],
  });
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector('nav[aria-label="Categories"]', { timeout: 30000 });

  const categories = await checkSheet(
    page,
    'nav[aria-label="Categories"] button[aria-haspopup="dialog"]'
  );
  console.log("\n=== Categories sheet (iPhone 14 viewport) ===");
  console.log(JSON.stringify(categories, null, 2));

  const filters = await checkSheet(page, 'button:has-text("Filters")');
  console.log("\n=== Filters sheet (iPhone 14 viewport) ===");
  console.log(JSON.stringify(filters, null, 2));

  const checks = [
    {
      name: "Categories height < 85% viewport",
      pass: categories.height < categories.viewportHeight * 0.85,
    },
    {
      name: "Categories leaves space above (top > 0)",
      pass: categories.top > 0,
    },
    {
      name: "Categories rounded top corners",
      pass: parseFloat(categories.borderTopLeftRadius) > 0,
    },
    {
      name: "Categories backdrop visible",
      pass: categories.overlayVisible,
    },
    {
      name: "Filters height < 85% viewport",
      pass: filters.height < filters.viewportHeight * 0.85,
    },
    {
      name: "Filters leaves space above (top > 0)",
      pass: filters.top > 0,
    },
    {
      name: "Filters rounded top corners",
      pass: parseFloat(filters.borderTopLeftRadius) > 0,
    },
    {
      name: "Filters backdrop visible",
      pass: filters.overlayVisible,
    },
  ];

  console.log("\n=== Results ===");
  for (const c of checks) {
    console.log(`${c.pass ? "PASS" : "FAIL"}: ${c.name}`);
  }

  await browser.close();
  const allPass = checks.every((c) => c.pass);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
