"use client";

export default function AISettingsPage() {
  return (
    <>
      <div className="page-header">
        <h1>AI Settings</h1>
      </div>
      <div className="page-content" style={{ maxWidth: 720 }}>
        <div className="card mb-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="badge badge-demo">Demo Mode Active</span>
          </div>
          <h3 className="mb-2">Current Provider: FakeModelProvider</h3>
          <p className="text-sm text-muted mb-4">
            The application is running with a deterministic fake AI provider. No API keys are
            required. All AI responses are generated locally without network calls.
          </p>

          <div className="card" style={{ background: "var(--color-neutral-50)" }}>
            <h4 className="mb-3">Provider Status</h4>
            <div className="mb-2">
              <div className="flex items-center gap-3">
                <span className="badge badge-completed">Active</span>
                <span className="font-semibold text-sm">Fake (Demo)</span>
              </div>
              <p className="text-xs text-muted">Deterministic, no network, always available</p>
            </div>
            <div className="mb-2">
              <div className="flex items-center gap-3">
                <span className="badge badge-pending">Not Configured</span>
                <span className="font-semibold text-sm">OpenAI</span>
              </div>
              <p className="text-xs text-muted">Set OPENAI_API_KEY server-side to enable</p>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <span className="badge badge-pending">Not Configured</span>
                <span className="font-semibold text-sm">Azure OpenAI</span>
              </div>
              <p className="text-xs text-muted">
                Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY server-side to enable
              </p>
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
