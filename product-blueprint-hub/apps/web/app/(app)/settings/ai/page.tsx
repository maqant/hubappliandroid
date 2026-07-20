"use client";

import { useEffect, useState } from "react";

export default function AISettingsPage() {
  const [health, setHealth] = useState<{ provider: string; configured: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/ai/health")
      .then((res) => res.json())
      .then((data) => setHealth(data))
      .catch((err) => console.error(err));
  }, []);

  const isOpenAI = process.env.NEXT_PUBLIC_MODEL_PROVIDER === "openai" && health?.provider === "openai";

  return (
    <>
      <div className="page-header">
        <h1>AI Settings</h1>
      </div>
      <div className="page-content" style={{ maxWidth: 720 }}>
        <div className="card mb-6">
          <div className="flex items-center gap-3 mb-4">
            <span className={`badge ${isOpenAI ? "badge-openai" : "badge-demo"}`}>
              {isOpenAI ? "OpenAI Active" : "Demo Mode Active"}
            </span>
          </div>
          <h3 className="mb-2">Current Provider: {isOpenAI ? "RemoteOpenAIProvider" : "FakeModelProvider"}</h3>
          <p className="text-sm text-muted mb-4">
            {isOpenAI 
              ? "The application is connected to real OpenAI via the secure backend."
              : "The application is running with a deterministic fake AI provider. No API keys are required."}
          </p>

          <div className="card" style={{ background: "var(--color-neutral-50)" }}>
            <h4 className="mb-3">Provider Status</h4>
            <div className="mb-2">
              <div className="flex items-center gap-3">
                <span className={`badge ${!isOpenAI ? "badge-completed" : "badge-pending"}`}>
                  {!isOpenAI ? "Active" : "Inactive"}
                </span>
                <span className="font-semibold text-sm">Fake (Demo)</span>
              </div>
              <p className="text-xs text-muted">Deterministic, no network, always available</p>
            </div>
            <div className="mb-2">
              <div className="flex items-center gap-3">
                <span className={`badge ${isOpenAI ? "badge-completed" : "badge-pending"}`}>
                  {isOpenAI ? "Active" : "Not Configured"}
                </span>
                <span className="font-semibold text-sm">OpenAI</span>
              </div>
              <p className="text-xs text-muted">Set NEXT_PUBLIC_MODEL_PROVIDER=openai and OPENAI_API_KEY server-side to enable</p>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="mb-3">Model Routing</h3>
          <div className="grid grid-3">
            <div
              className="card"
              style={{
                background: "var(--color-primary-50)",
                border: "1px solid var(--color-primary-200)",
              }}
            >
              <h4 className="text-sm" style={{ color: "var(--color-primary-700)" }}>
                🌙 LUNA
              </h4>
              <p className="text-xs text-muted mt-1">
                Narrow tasks, high volume, easy verification
              </p>
            </div>
            <div
              className="card"
              style={{ background: "var(--color-info-light)", border: "1px solid #93c5fd" }}
            >
              <h4 className="text-sm" style={{ color: "#1e40af" }}>
                🌍 TERRA
              </h4>
              <p className="text-xs text-muted mt-1">Analysis and synthesis, default tier</p>
            </div>
            <div
              className="card"
              style={{ background: "var(--color-warning-light)", border: "1px solid #fbbf24" }}
            >
              <h4 className="text-sm" style={{ color: "#92400e" }}>
                ☀️ SOL
              </h4>
              <p className="text-xs text-muted mt-1">
                Architecture, critical conflicts, final audits
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
