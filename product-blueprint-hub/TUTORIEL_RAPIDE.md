# Tutoriel Rapide - Product Blueprint Hub (v0.1.0)

Ce document décrit comment démarrer, tester et déployer l'application Product Blueprint Hub en mode rapide.

## 1. Prérequis
- Node.js (>= 22.0.0)
- NPM (>= 11.0.0)

## 2. Démarrage Local Rapide

Le projet est configuré avec un provider d'IA fictif (FakeModelProvider) par défaut pour permettre des tests rapides sans clé API.

```bash
# Se placer à la racine du workspace
cd product-blueprint-hub

# Installer les dépendances
npm install

# Démarrer le serveur de développement
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000) dans votre navigateur.

### Mode Localisation Française (fr)
Pour afficher l'interface en français :
1. Connectez-vous (bouton Login)
2. Ouvrez la console du navigateur (F12)
3. Exécutez : `localStorage.setItem('pbh_lang', 'fr')`
4. Rechargez la page (F5)

## 3. Configuration avec OpenAI (Optionnel)

Si vous souhaitez utiliser le véritable modèle OpenAI (gpt-4o-mini ou gpt-4o) :

1. Copiez `.env.example` en `.env.local`
2. Modifiez le `.env.local` :
   ```env
   NEXT_PUBLIC_MODEL_PROVIDER=openai
   OPENAI_API_KEY=sk-votrecleftressecrète
   ```
3. Relancez le serveur (`npm run dev`)

## 4. Tests et Qualité (Smoke Tests)

Avant de déployer ou de publier, exécutez ces commandes :

```bash
# Vérifier le formatage
npm run format:check

# Vérifier le linter
npm run lint

# Vérifier le typage TypeScript
npm run typecheck

# Lancer les tests unitaires / composants
npm run test

# Construire pour la production
npm run build
```

## 5. Déploiement Vercel

Le projet est conçu pour être déployé sur Vercel sans effort.
1. Connectez votre dépôt GitHub à Vercel.
2. Le `Root Directory` doit être configuré sur `product-blueprint-hub`.
3. Le framework sélectionné doit être `Next.js`.
4. Si vous utilisez OpenAI, ajoutez la variable d'environnement `OPENAI_API_KEY` dans les paramètres du projet Vercel.

---

> [!NOTE]  
> Version : 0.1.0  
> Cible Android : ANDROID_TARGET_PARTIAL (Interface web compatible mobile, mais pas encore d'application Android native via Capacitor / React Native encapsulé).
