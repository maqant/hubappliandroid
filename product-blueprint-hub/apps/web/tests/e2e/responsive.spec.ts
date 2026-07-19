import { test, expect } from "@playwright/test";

const viewports = [
  { name: "mobile-small", width: 320, height: 568 },
  { name: "mobile-medium", width: 375, height: 667 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "desktop", width: 1280, height: 800 },
];

for (const vp of viewports) {
  test(`Responsive verification on ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    // Configure viewport
    await page.setViewportSize({ width: vp.width, height: vp.height });

    // 1. Navigation & Demo login
    await page.goto("/");
    const demoBtn = page.locator(
      "button:has-text('Mode Démonstration'), button:has-text('Enter Demo Mode')",
    );
    await expect(demoBtn).toBeVisible();
    await demoBtn.click();

    // 2. Wait for projects list page
    await page.waitForURL("**/projects");

    // 3. For mobile viewports, verify hamburger menu is functional
    if (vp.width <= 768) {
      // Sidebar should be hidden initially
      const sidebar = page.locator(".sidebar");
      await expect(sidebar).not.toBeInViewport();

      // Open hamburger menu
      const hamburger = page.locator(".hamburger-btn");
      await expect(hamburger).toBeVisible();
      await hamburger.click();

      // Sidebar should now be visible (has class open)
      await expect(sidebar).toBeInViewport();

      // Close menu
      const closeBtn = page.locator(".close-menu-btn");
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      } else {
        // Fallback: click overlay
        await page.locator(".sidebar-overlay").click();
      }
      // Sidebar should be hidden again
      await expect(sidebar).not.toBeInViewport();
    } else {
      // On desktop, sidebar is always visible
      const sidebar = page.locator(".sidebar");
      await expect(sidebar).toBeInViewport();
    }

    // 4. Navigate to New Project
    if (vp.width <= 768) {
      await page.locator(".hamburger-btn").click();
      await page.locator("a:has-text('Nouveau Projet'), a:has-text('New Project')").first().click();
    } else {
      await page.locator("a:has-text('Nouveau Projet'), a:has-text('New Project')").first().click();
    }
    await page.waitForURL("**/projects/new");

    // 5. Verify Create Form usability (no cut-off, inputs focusable)
    const nameInput = page.locator("#project-name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Responsive Test Project");

    // 6. Verify absence of global horizontal overflow
    const bodyOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(bodyOverflow).toBe(false);
  });
}
