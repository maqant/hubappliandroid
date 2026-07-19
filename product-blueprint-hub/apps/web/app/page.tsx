"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const user = localStorage.getItem("pbh_demo_user");
    if (user) {
      setIsLoggedIn(true);
      router.push("/projects");
    }
  }, [router]);

  const handleDemoLogin = () => {
    setIsLoading(true);
    const demoUser = {
      id: "demo-user-001",
      displayName: "Demo User",
      email: "demo@blueprint-hub.local",
      isDemo: true,
      loginAt: new Date().toISOString(),
    };
    localStorage.setItem("pbh_demo_user", JSON.stringify(demoUser));

    setTimeout(() => {
      router.push("/projects");
    }, 600);
  };

  if (isLoggedIn) {
    return (
      <div className="loading-state">
        <div className="loading-spinner" />
        <span>Redirecting...</span>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, var(--color-neutral-900) 0%, var(--color-primary-950) 50%, var(--color-neutral-900) 100%)",
      }}
    >
      <div
        style={{
          textAlign: "center",
          maxWidth: 480,
          padding: "var(--space-8)",
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 72,
            height: 72,
            background:
              "linear-gradient(135deg, var(--color-primary-400), var(--color-primary-600))",
            borderRadius: "var(--radius-xl)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "2rem",
            margin: "0 auto var(--space-6)",
            boxShadow: "0 8px 32px rgba(59, 91, 247, 0.3)",
          }}
        >
          📐
        </div>

        <h1
          style={{
            color: "white",
            fontSize: "var(--font-size-3xl)",
            fontWeight: "var(--font-weight-bold)",
            marginBottom: "var(--space-3)",
          }}
        >
          Product Blueprint Hub
        </h1>

        <p
          style={{
            color: "var(--color-neutral-400)",
            fontSize: "var(--font-size-lg)",
            marginBottom: "var(--space-8)",
            lineHeight: "var(--line-height-relaxed)",
          }}
        >
          Transform your ideas into structured, governed, and traceable software project blueprints.
        </p>

        <button
          className="btn btn-primary btn-lg"
          onClick={handleDemoLogin}
          disabled={isLoading}
          style={{
            width: "100%",
            fontSize: "var(--font-size-base)",
            padding: "var(--space-4) var(--space-8)",
          }}
          aria-label="Enter demo mode"
        >
          {isLoading ? (
            <>
              <div className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              Entering...
            </>
          ) : (
            <>🚀 Enter Demo Mode</>
          )}
        </button>

        <div
          className="badge badge-demo"
          style={{
            marginTop: "var(--space-4)",
            display: "inline-flex",
          }}
        >
          No API key required — fully functional demo
        </div>

        <p
          style={{
            color: "var(--color-neutral-500)",
            fontSize: "var(--font-size-xs)",
            marginTop: "var(--space-6)",
          }}
        >
          All data is stored locally in your browser. No server connection needed.
        </p>
      </div>
    </div>
  );
}
