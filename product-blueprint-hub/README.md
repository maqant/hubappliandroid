# Product Blueprint Hub

Le Product Blueprint Hub transforme une idée libre, une conversation, des notes et des documents en un projet logiciel structuré, gouverné, traçable, cohérent et directement exploitable par une IA de développement.

## Version 0.1.0 (MVP)

### Lancement Rapide

```bash
# Installation des dépendances
npm install

# Démarrage
npm run dev
```

L'application est disponible sur http://localhost:3000.

Pour la configuration et l'utilisation détaillée, consultez le fichier `TUTORIEL_RAPIDE.md`.

## Fonctionnalités Principales
- **Génération de Blueprint** : Transformation des notes en spécifications claires.
- **Audits Qualité** : Validation bloquante et non bloquante de la cohérence globale.
- **Traçabilité** : Sauvegarde des décisions et suivi des "findings".
- **Gouvernance** : Validation explicite et verrouillage des baselines avec `pbh_lang=fr`.

## Technologies
- Next.js (App Router)
- React, Tailwind CSS
- Zustand pour la gestion d'état
- Turborepo
