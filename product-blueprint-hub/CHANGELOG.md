# Changelog

## [0.3.0] - 2026-07-20

### Ajouts (FEAT)
- **Refonte de l'architecture des prompts** : Centralisation de tous les templates de prompt dans un `LocalPromptRepository`. Les agents récupèrent dynamiquement leurs instructions et leurs variables de contexte.
- **Atelier de Conception Assistée Dynamique** : Le frontend transmet la couche sélectionnée (INTENTION, HYPOTHESIS, etc.) au backend. Le backend orchestre dynamiquement le passage de relais (router) entre les sous-agents spécialisés de l'atelier pour produire une proposition validée.
- **Injection des variables de contexte** : Ajout du support pour les variables comme `{{TARGET_PLATFORM}}`, `{{LANGUAGE}}`, `{{PROJECT_TITLE}}` et `{{CONFIRMED_ITEMS_JSON}}`.

### Modifiés (REFACTOR)
- **Mission Executor** : Mise à jour de `executeTask` pour puiser dans le Prompt Registry plutôt que d'utiliser des instructions codées en dur.
- **Planner** : Retrait des `purpose` codés en dur pour les agents fixes (18 agents Blueprint).

### Corrections (FIX)
- Affichage dynamique de l'état "Layer sélectionné" dans le Design Workshop.
- Transmission de `promptId` et `promptVersion` dans l'objet `diagnostic` pour une meilleure traçabilité.
