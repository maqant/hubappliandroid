import { test, expect } from "@playwright/test";

test("Product Blueprint Hub French E2E Flow", async ({ page }) => {
  page.on("pageerror", (err) => {
    console.error("PAGE ERROR IN BROWSER FR:", err.message, err.stack);
  });
  page.on("console", (msg) => {
    console.log(`BROWSER LOG FR [${msg.type()}]:`, msg.text());
  });

  // 1. Ouverture de l'application
  await page.goto("/");
  await expect(page).toHaveTitle(/Product Blueprint Hub/);

  // Configure local storage pour forcer le français, le scénario nominal de test, et pas de délai IA avant redirection
  await page.evaluate(() => {
    window.localStorage.setItem("DEMO_MODE_SCENARIO", "DEMO_PASSING");
    window.localStorage.setItem("FAKE_PROVIDER_DELAY_MODE", "instant");
    window.localStorage.setItem("pbh_lang", "fr");
  });
  await page.reload();

  // 2. Entrée en mode démonstration (Le bouton d'accueil est maintenant traduit en français)
  const loginBtn = page.getByRole("button", { name: "Mode Démonstration" });
  await expect(loginBtn).toBeVisible();
  await loginBtn.click();

  // 3. Attente de la redirection vers /projects
  await page.waitForURL("**/projects");
  await expect(page.getByRole("heading", { name: "Mes Projets" })).toBeVisible();

  // 4. Clic sur "Nouveau Projet"
  await page.getByRole("link", { name: "Nouveau Projet" }).first().click();
  await page.waitForURL("**/projects/new");
  await page.waitForTimeout(1000);

  // 5. Saisie du projet d'application vestimentaire
  await page.locator("#project-name").fill("Projet Vestimentaire E2E");
  await page
    .locator("#project-description")
    .fill("Une garde-robe intelligente et connectée météo.");
  await page
    .locator("#project-idea")
    .fill(
      "Créer une application de garde-robe connectée météo. L'utilisateur doit pouvoir cataloguer ses vêtements par matière. Il faut une prévision météo locale. Exclure le partage sur les réseaux sociaux.",
    );

  // 6. Clic sur "Créer le projet"
  await page.getByRole("button", { name: "Créer le projet" }).click();
  await page.waitForURL(/\/projects\/[a-z0-9\-]+/);
  await expect(page.getByRole("heading", { name: "Projet Vestimentaire E2E" })).toBeVisible();

  // 7. Clic sur l'onglet "Sources"
  const sourcesTab = page.getByRole("button", { name: /Sources/ });
  await expect(sourcesTab).toBeVisible();

  // 8. Clic sur "Analyser mon idée"
  await page.getByRole("button", { name: "Analyser mon idée" }).click();

  // 9. Attente du chargement de l'onglet "Compréhension"
  const briefTab = page.getByRole("button", { name: /Compréhension/ });
  await expect(briefTab).toBeVisible();
  await briefTab.click();

  // 10. Clic sur "Accepter" pour le premier item
  const acceptBtn = page.locator("button:has-text('Accepter'):not([disabled])").first();
  await acceptBtn.click();

  // 11. Vérification de l'idempotence (cliquer à nouveau sur Accepter ne doit rien modifier et lever un toast/message informatif d'absence de modifs)
  const acceptBtnDisabled = page.locator("button:has-text('Accepter')").first();
  await expect(acceptBtnDisabled).toBeDisabled(); // L'état visuel passe à désactivé pour cet item déjà accepté !

  // 12. Correction du deuxième brief item
  const correctionInput = page.locator("input[placeholder='Saisir une correction...']").first();
  await correctionInput.fill("Prévision météo locale obligatoire");
  await page.locator("button:has-text('Corriger'):not([disabled])").first().click();

  // Test de correction identique (doit lever l'info toast)
  await correctionInput.fill("Prévision météo locale obligatoire");
  await page.locator("button:has-text('Corriger')").first().click();
  await expect(page.locator(".toast-info")).toBeVisible();

  // 13. Clic sur "Refuser" pour le troisième brief item
  await page.locator("button:has-text('Refuser'):not([disabled])").first().click();

  // 14. Verrouiller le premier item (nécessite acceptation/correction au préalable)
  await page.locator("button:has-text('Verrouiller'):not([disabled])").first().click();

  // Attente de la modal de confirmation
  await expect(page.locator("h3:has-text('Verrouiller la référence')")).toBeVisible();
  // Clic sur Confirmer
  await page.getByRole("button", { name: "Confirmer" }).click();

  // 15. Vérification de l'explication du cycle de décision (onglet Décisions)
  const decisionsTab = page.getByRole("button", { name: /Décisions/ });
  await expect(decisionsTab).toBeVisible();
  await decisionsTab.click();
  await expect(
    page.getByText("Les décisions formalisées apparaîtront ici après l'exécution de la mission"),
  ).toBeVisible();

  // 16. Planification de la mission (onglet Organisation)
  const orgTab = page.getByRole("button", { name: /Organisation/ });
  await expect(orgTab).toBeVisible();
  await orgTab.click();
  await page.getByRole("button", { name: "Planifier la mission" }).click();

  // 17. Vérification des agents en français
  await expect(page.getByRole("heading", { name: /Agents affectés/ })).toBeVisible();
  await expect(page.getByText("Directeur de Produit").first()).toBeVisible();

  // 18. Lancement de la mission
  await page.getByRole("button", { name: "Lancer la mission" }).click();

  // 19. Basculement sur l'onglet Centre de contrôle pour suivre et vérifier la complétion (18/18 et TERMINÉE)
  const controlTab = page.getByRole("button", { name: /Centre de contrôle/ });
  await expect(controlTab).toBeVisible();
  await controlTab.click();
  await expect(page.getByText("TERMINÉE").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Tâches (18)")).toBeVisible();

  // 20. Vérification des décisions formalisées
  await decisionsTab.click();
  const decisionCards = page.locator(".card h4");
  await expect(decisionCards.first()).toBeVisible();
  await expect(page.getByText("Décision :").first()).toBeVisible();

  // 21. Vérification d'un blueprint spécifique
  const blueprintTab = page.getByRole("button", { name: /Blueprint/ });
  await expect(blueprintTab).toBeVisible();
  await blueprintTab.click();
  await expect(page.getByRole("heading", { name: "Vision Du Produit" })).toBeVisible();
  await expect(page.getByText("garde-robe intelligente").first()).toBeVisible();

  // 22. Approbation des 17 artefacts (DRAFT -> APPROVED) pour débloquer le gèle de la baseline
  const approveButtons = page.locator("button:has-text('Approuver')");
  let count = await approveButtons.count();
  for (let i = 0; i < count; i++) {
    await page.locator("button:has-text('Approuver')").first().click();
    await page.waitForTimeout(100);
  }

  // 23. Lancement des audits
  const auditsTab = page.getByRole("button", { name: /Audits/ });
  await expect(auditsTab).toBeVisible();
  await auditsTab.click();
  await page.getByRole("button", { name: "Lancer les audits" }).click();
  await expect(page.getByText("Portes de validation")).toBeVisible();
  await expect(page.getByText("Réussie").first()).toBeVisible({ timeout: 10000 });

  // 24. Geler la version de référence (Baseline)
  const baselineTab = page.getByRole("button", { name: /Version de référence/ });
  await expect(baselineTab).toBeVisible();
  await baselineTab.click();
  await page.getByRole("button", { name: "Geler la version de référence" }).click();
  await expect(page.getByText("Baseline v")).toBeVisible();

  // 25. Génération du paquet et téléchargement du MASTER consolidé
  const packageTab = page.getByRole("button", { name: /Paquet final/ });
  await expect(packageTab).toBeVisible();
  await packageTab.click();
  await page.getByRole("button", { name: "Générer le paquet" }).click();
  await expect(page.getByRole("heading", { name: "Paquet de livraison" })).toBeVisible({
    timeout: 10000,
  });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger le MASTER" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("MASTER-CONSOLIDATED.txt");

  // 26. Rechargement et vérification de la persistance
  await page.reload();
  await expect(page.getByRole("heading", { name: "Projet Vestimentaire E2E" })).toBeVisible();
  await packageTab.click();
  await expect(page.getByRole("heading", { name: "Paquet de livraison" })).toBeVisible();
});
