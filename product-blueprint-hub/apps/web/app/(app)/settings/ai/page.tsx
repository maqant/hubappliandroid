"use client";

import { useEffect, useState } from "react";
import { useServices } from "@/services";

export default function AISettingsPage() {
  const svc = useServices();
  const [health, setHealth] = useState<{
    provider: string;
    configured: boolean;
    openaiConfigured?: boolean;
    keyPreview?: string | null;
    models?: Record<string, string>;
  } | null>(null);
  const [activeMode, setActiveMode] = useState<"openai" | "fake">("fake");

  const checkHealth = () => {
    fetch("/api/ai/health")
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    checkHealth();
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("pbh.modelProvider") as "openai" | "fake" | null;
      if (saved === "openai" || saved === "fake") {
        setActiveMode(saved);
      } else if (process.env.NEXT_PUBLIC_MODEL_PROVIDER === "openai") {
        setActiveMode("openai");
      }
    }
  }, []);

  const handleToggle = (mode: "openai" | "fake") => {
    setActiveMode(mode);
    svc.switchProviderMode(mode);
  };

  const isOpenAI = activeMode === "openai";

  return (
    <>
      <div className="page-header">
        <h1>Paramètres & Diagnostic IA</h1>
      </div>
      <div className="page-content" style={{ maxWidth: 720 }}>
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className={`badge ${isOpenAI ? "badge-openai" : "badge-demo"}`}>
                {isOpenAI ? "🟢 IA Réelle (OpenAI) Active" : "🟡 Mode Démo (Fake) Actif"}
              </span>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={checkHealth}>
              🔄 Vérifier la connexion
            </button>
          </div>

          <h3 className="mb-2">Moteur IA actif : {isOpenAI ? "RemoteOpenAIProvider" : "FakeModelProvider"}</h3>
          <p className="text-sm text-muted mb-4">
            {isOpenAI 
              ? "L'application effectue de vrais appels d'idéation auprès d'OpenAI (GPT-4o / GPT-4o-mini)."
              : "L'application fonctionne en mode démo déterministe autonome sans consommation de jetons."}
          </p>

          {/* Toggle Provider Box */}
          <div className="p-4 border border-border rounded-lg bg-surface mb-6 flex flex-col gap-3">
            <h4 className="font-semibold text-sm">Sélection du Provider</h4>
            <div className="grid grid-cols-2 gap-3">
              <button 
                className={`btn flex flex-col items-center justify-center p-3 text-center ${activeMode === 'fake' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleToggle('fake')}
              >
                <span className="font-bold text-base mb-1">🟡 Mode Démo (Fake)</span>
                <span className="text-xs font-normal opacity-80">Zéro réseau, instantané, sans clé API</span>
              </button>
              <button 
                className={`btn flex flex-col items-center justify-center p-3 text-center ${activeMode === 'openai' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleToggle('openai')}
              >
                <span className="font-bold text-base mb-1">🟢 IA Réelle (OpenAI)</span>
                <span className="text-xs font-normal opacity-80">Appels distants GPT-4o / GPT-4o-mini</span>
              </button>
            </div>

            {isOpenAI && !health?.openaiConfigured && (
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded text-xs text-amber-900 dark:text-amber-200 mt-2">
                ⚠️ <strong>Clé OPENAI_API_KEY non détectée sur le serveur.</strong><br />
                Définissez la variable <code>OPENAI_API_KEY=sk-...</code> dans votre fichier <code>.env</code> ou sur Vercel/Serveur puis redémarrez l&apos;application.
              </div>
            )}
          </div>

          <div className="card" style={{ background: "var(--color-neutral-50)" }}>
            <h4 className="mb-3">Statut de Configuration Serveur</h4>
            <div className="mb-3">
              <div className="flex items-center gap-3 mb-1">
                <span className={`badge ${health?.openaiConfigured ? "badge-completed" : "badge-pending"}`}>
                  {health?.openaiConfigured ? "Configuré" : "Non Détecté"}
                </span>
                <span className="font-semibold text-sm">Clé API OpenAI</span>
              </div>
              <p className="text-xs text-muted">
                {health?.keyPreview ? `Clé serveur active : ${health.keyPreview}` : "Aucune clé OPENAI_API_KEY renseignée dans le fichier .env"}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="mb-3">Routage des Modèles IA</h3>
          <div className="grid grid-3 gap-3">
            <div
              className="card"
              style={{
                background: "var(--color-primary-50)",
                border: "1px solid var(--color-primary-200)",
              }}
            >
              <h4 className="text-sm font-bold" style={{ color: "var(--color-primary-700)" }}>
                🌙 LUNA
              </h4>
              <div className="text-xs font-mono my-1 font-bold text-gray-700">
                {health?.models?.LUNA || "gpt-4o-mini"}
              </div>
              <p className="text-xs text-muted">
                Tâches rapides et fréquentes, vérifications simples
              </p>
            </div>
            <div
              className="card"
              style={{ background: "var(--color-info-light)", border: "1px solid #93c5fd" }}
            >
              <h4 className="text-sm font-bold" style={{ color: "#1e40af" }}>
                🌍 TERRA
              </h4>
              <div className="text-xs font-mono my-1 font-bold text-gray-700">
                {health?.models?.TERRA || "gpt-4o-mini"}
              </div>
              <p className="text-xs text-muted">Analyse de brief et synthèse générale</p>
            </div>
            <div
              className="card"
              style={{ background: "var(--color-warning-light)", border: "1px solid #fbbf24" }}
            >
              <h4 className="text-sm font-bold" style={{ color: "#92400e" }}>
                ☀️ SOL
              </h4>
              <div className="text-xs font-mono my-1 font-bold text-gray-700">
                {health?.models?.SOL || "gpt-4o"}
              </div>
              <p className="text-xs text-muted">
                Architecture, essaimage complexe et audits critiques
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
