import { test, expect } from "@playwright/test";

test("Product Blueprint Hub E2E Flow", async ({ page }) => {
  page.on("pageerror", (err) => {
    console.error("PAGE ERROR IN BROWSER:", err.message, err.stack);
  });
  page.on("console", (msg) => {
    console.log(`BROWSER LOG [${msg.type()}]:`, msg.text());
  });

  // 1. Ouverture de l'application
  await page.goto("/");
  await expect(page).toHaveTitle(/Product Blueprint Hub/);

  // Configure local storage for demo scenario and speed before click/redirection
  await page.evaluate(() => {
    window.localStorage.setItem("DEMO_MODE_SCENARIO", "DEMO_PASSING");
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
  await page.locator("#project-name").fill("E2E Test Project");
  await page.locator("#project-description").fill("A full E2E test project flow verification.");
  await page
    .locator("#project-idea")
    .fill(
      "Build a platform that lets users coordinate tasks. Non-technical users need simple views. Security is critical.",
    );

  // 6. Clic sur "Create Project"
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.waitForURL(/\/projects\/[a-z0-9\-]+/);
  await expect(page.getByRole("heading", { name: "E2E Test Project" })).toBeVisible();

  // 7. Clic sur l'onglet "Sources" (déjà actif)
  const sourcesTab = page.getByRole("button", { name: /Sources/ });
  await expect(sourcesTab).toBeVisible();

  // 8. Clic sur "Analyze my idea"
  await page.getByRole("button", { name: "Analyze my idea" }).click();

  // 9. Attente du chargement de l'onglet "Brief"
  const briefTab = page.getByRole("button", { name: /Brief/ });
  await expect(briefTab).toBeVisible();
  await briefTab.click();

  // 10. Clic sur "Accept" pour le premier item
  await page.locator("button:has-text('Accept'):not([disabled])").first().click();

  // 11. Clic sur "Lock" pour verrouiller ce premier item (qui crée une décision)
  await page.locator("button:has-text('Lock'):not([disabled])").first().click();
  await page.getByRole("button", { name: "Confirm" }).click();

  // 12. Correction du deuxième brief item (qui est maintenant le premier PROPOSED)
  const correctionInput = page.locator("input[placeholder='Enter correction...']").first();
  await correctionInput.fill("Corrected E2E statement");
  await page.locator("button:has-text('Correct'):not([disabled])").first().click();

  // 13. Clic sur "Reject" pour le troisième brief item (qui est maintenant le premier PROPOSED)
  await page.locator("button:has-text('Reject'):not([disabled])").first().click();

  // 14. Planification de la mission de conception
  await page.getByRole("button", { name: "Plan the Mission" }).click();

  // 15. Vérification que les 18 agents fixes sont affichés
  const orgTab = page.getByRole("button", { name: /Organization/ });
  await expect(orgTab).toBeVisible();
  await orgTab.click();
  await expect(page.getByRole("heading", { name: /Agents/ })).toBeVisible();
  // Count the card elements under agent section (fixed + dynamic)
  const agentCards = page.locator(".card h4");
  await expect(agentCards.first()).toBeVisible();

  // 16. Exécution de la mission sur l'onglet Organization
  await page.getByRole("button", { name: /Start Mission/ }).click();

  // 17. Basculement sur l'onglet Control pour suivre la progression et attendre la complétion
  const controlTab = page.getByRole("button", { name: /Control/ });
  await expect(controlTab).toBeVisible();
  await controlTab.click();

  // Attente de la fin de la mission (depuis l'onglet Control actif)
  await expect(page.getByText("COMPLETED").first()).toBeVisible({ timeout: 15000 });

  // 18. Résolution d'un conflit
  const conflictsTab = page.getByRole("button", { name: /Conflicts/ });
  await expect(conflictsTab).toBeVisible();
  await conflictsTab.click();
  await page
    .locator("input[placeholder='Rationale for this choice...']")
    .first()
    .fill("E2E Resolution rationale");
  await page.getByRole("button", { name: "Choose This Option" }).first().click();

  // 19. Génération du blueprint (onglet Blueprint)
  const blueprintTab = page.getByRole("button", { name: /Blueprint/ });
  await expect(blueprintTab).toBeVisible();
  await blueprintTab.click();
  await expect(page.getByRole("heading", { name: /Product Vision/ })).toBeVisible();

  // 20. Exécution des audits
  const auditsTab = page.getByRole("button", { name: /Audits/ });
  await expect(auditsTab).toBeVisible();
  await auditsTab.click();
  await page.getByRole("button", { name: /Run Audits/ }).click();
  await expect(page.getByText("Pre-Baseline Gate")).toBeVisible({ timeout: 15000 });

  // 21. Gel de la baseline
  const baselineTab = page.getByRole("button", { name: /Baseline/ });
  await expect(baselineTab).toBeVisible();
  await baselineTab.click();
  await page.getByRole("button", { name: /Freeze Baseline/ }).click();
  await expect(page.getByText("Baseline v")).toBeVisible();

  // 22. Génération du paquet
  const packageTab = page.getByRole("button", { name: /Package/ });
  await expect(packageTab).toBeVisible();
  await packageTab.click();
  await page.getByRole("button", { name: /Generate Package/ }).click();
  await expect(page.getByRole("heading", { name: "Execution Package" })).toBeVisible({
    timeout: 10000,
  });

  // 23. Vérification du téléchargement de MASTER-CONSOLIDATED.txt
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download MASTER/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("MASTER-CONSOLIDATED.txt");

  // 24. Rechargement de la page
  await page.reload();

  // 25. Vérification de la persistance
  await expect(page.getByRole("heading", { name: "E2E Test Project" })).toBeVisible();
  await packageTab.click();
  await expect(page.getByRole("heading", { name: "Execution Package" })).toBeVisible();
});
