import { test, expect } from "@playwright/test";

test("Product Blueprint Hub E2E Blocking Flow", async ({ page }) => {
  page.on("pageerror", (err) => {
    console.error("PAGE ERROR IN BROWSER:", err.message, err.stack);
  });
  page.on("console", (msg) => {
    console.log(`BROWSER LOG [${msg.type()}]:`, msg.text());
  });

  // 1. Ouverture de l'application
  await page.goto("/");
  await expect(page).toHaveTitle(/Product Blueprint Hub/);

  // Configure local storage for BLOCKING scenario and speed before click/redirection
  await page.evaluate(() => {
    window.localStorage.setItem("DEMO_MODE_SCENARIO", "DEMO_BLOCKING");
    window.localStorage.setItem("FAKE_PROVIDER_DELAY_MODE", "instant");
    window.localStorage.setItem("pbh_lang", "en");
  });
  await page.reload();

  // 2. Entrée en mode démonstration
  const loginBtn = page.getByRole("button", { name: "Enter Demo Mode" });
  await expect(loginBtn).toBeVisible();
  await loginBtn.click();

  // 3. Attente de la redirection vers /projects
  await page.waitForURL("**/projects");
  await expect(page.getByRole("heading", { name: "My Projects" })).toBeVisible();

  // 4. Clic sur "New Project"
  await page.getByRole("link", { name: "New Project" }).first().click();
  await page.waitForURL("**/projects/new");
  await page.waitForTimeout(5000);

  // 5. Saisie du projet
  await page.locator("#project-name").fill("Blocking E2E Project");
  await page
    .locator("#project-description")
    .fill("A project designed to test validation gate blocking behavior.");
  await page
    .locator("#project-idea")
    .fill(
      "Build a secure communication portal. High security requirements apply. Regular audits must block deployment on threat detection.",
    );

  // 6. Clic sur "Create Project"
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.waitForURL(/\/projects\/[a-z0-9\-]+/);
  await expect(page.getByRole("heading", { name: "Blocking E2E Project" })).toBeVisible();

  // 7. Clic sur "Analyze my idea"
  await page.getByRole("button", { name: "Analyze my idea" }).click();

  // 8. Attente du brief
  const briefTab = page.getByRole("button", { name: /Brief/ });
  await expect(briefTab).toBeVisible();
  await briefTab.click();

  // 9. Acceptation du premier item et planification de la mission
  await page.locator("button:has-text('Accept'):not([disabled])").first().click();
  await page.getByRole("button", { name: "Plan the Mission" }).click();

  // 10. Basculement sur l'onglet Organization et démarrage de la mission
  const orgTab = page.getByRole("button", { name: /Organization/ });
  await expect(orgTab).toBeVisible();
  await orgTab.click();
  await page.getByRole("button", { name: /Start Mission/ }).click();

  // 11. Basculement sur l'onglet Control et attente de la complétion
  const controlTab = page.getByRole("button", { name: /Control/ });
  await expect(controlTab).toBeVisible();
  await controlTab.click();
  await expect(page.getByText("COMPLETED").first()).toBeVisible({ timeout: 15000 });

  // 12. Basculement sur l'onglet Audits et exécution des audits
  const auditsTab = page.getByRole("button", { name: /Audits/ });
  await expect(auditsTab).toBeVisible();
  await auditsTab.click();
  await page.getByRole("button", { name: /Run Audits/ }).click();

  // 13. Vérification du finding BLOCKING et de la gate BLOCKED
  await expect(page.getByText("BLOCKING").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("BLOCKED").first()).toBeVisible();

  // 14. Vérification que le bouton Freeze Baseline est désactivé et que le message d'explication s'affiche
  const baselineTab = page.getByRole("button", { name: /Baseline/ });
  await expect(baselineTab).toBeVisible();
  await baselineTab.click();

  const freezeBtn = page.getByRole("button", { name: /Freeze Baseline/ });
  await expect(freezeBtn).toBeDisabled();
  await expect(
    page.getByText("Baseline creation is blocked. Some validation gates have failed."),
  ).toBeVisible();

  // 15. Vérification que le bouton Generate Package est désactivé et qu'aucun paquet n'est disponible
  const packageTab = page.getByRole("button", { name: /Package/ });
  await expect(packageTab).toBeVisible();
  await packageTab.click();

  const generatePkgBtn = page.getByRole("button", { name: /Generate Package/ });
  await expect(generatePkgBtn).toBeDisabled();
  await expect(page.getByText("No package yet")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Execution Package" })).not.toBeVisible();
});
