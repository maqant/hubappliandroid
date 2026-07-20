"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ServicesProvider } from "@/services";
import { useTranslation, type Language } from "@/i18n";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<{ displayName: string } | null>(null);
  const { t, lang, setLang } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("pbh_demo_user");
    if (stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  // Close sidebar on path changes
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  return (
    <div className="layout">
      {/* Mobile Top Header */}
      <header className="mobile-header" style={{ display: "none" }}>
        <button
          className="hamburger-btn"
          onClick={() => setIsMenuOpen(true)}
          aria-label="Open menu"
        >
          ☰
        </button>
        <span className="mobile-logo-text">{t("nav.title")}</span>
      </header>

      {/* Sidebar Overlay */}
      {isMenuOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsMenuOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 9,
          }}
        />
      )}

      {/* Sidebar */}
      <nav
        className={`sidebar ${isMenuOpen ? "open" : ""}`}
        aria-label="Main navigation"
        style={{ zIndex: 10 }}
      >
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">📐</div>
          <span>{t("nav.title")}</span>
          <button
            className="close-menu-btn"
            onClick={() => setIsMenuOpen(false)}
            aria-label="Close menu"
            style={{
              display: "none",
              marginLeft: "auto",
              background: "none",
              border: "none",
              color: "white",
              fontSize: "var(--font-size-xl)",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div className="sidebar-nav">
          <div className="sidebar-section-title">Navigation</div>

          <Link
            href="/projects"
            onClick={() => setIsMenuOpen(false)}
            className={`sidebar-link ${isActive("/projects") && !pathname.includes("/projects/") ? "sidebar-link-active" : ""}`}
          >
            {t("nav.projects")}
          </Link>

          <Link
            href="/projects/new"
            onClick={() => setIsMenuOpen(false)}
            className={`sidebar-link ${isActive("/projects/new") ? "sidebar-link-active" : ""}`}
          >
            {t("nav.newProject")}
          </Link>

          <div className="sidebar-section-title">Settings</div>

          <Link
            href="/settings/ai"
            onClick={() => setIsMenuOpen(false)}
            className={`sidebar-link ${isActive("/settings/ai") ? "sidebar-link-active" : ""}`}
          >
            {t("nav.aiSettings")}
          </Link>
        </div>

        {/* Language selector & Demo badge */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: "var(--space-4)",
            borderTop: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div style={{ marginBottom: "var(--space-3)" }}>
            <label
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--color-neutral-400)",
                display: "block",
                marginBottom: "var(--space-1)",
              }}
            >
              🌐 Language / Langue
            </label>
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as Language)}
              style={{
                width: "100%",
                background: "var(--color-neutral-800)",
                color: "var(--color-neutral-100)",
                border: "1px solid var(--color-neutral-700)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-1) var(--space-2)",
                fontSize: "var(--font-size-sm)",
                cursor: "pointer",
              }}
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className={`badge ${process.env.NEXT_PUBLIC_MODEL_PROVIDER === 'openai' ? 'badge-openai' : 'badge-demo'}`} style={{ marginBottom: "var(--space-2)" }}>
            {process.env.NEXT_PUBLIC_MODEL_PROVIDER === 'openai' ? 'OpenAI' : 'Demo Mode'}
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-neutral-500)" }}>
            {user?.displayName ?? "Loading..."}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="main-content">
        <ServicesProvider>{children}</ServicesProvider>
      </main>
    </div>
  );
}
