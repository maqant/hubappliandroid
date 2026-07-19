import React from "react";

// ============================================
// StatusBadge — reusable status indicator
// ============================================

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const normalized = status.toLowerCase().replace(/\s+/g, "-");
  return (
    <span className={`badge badge-${normalized} ${className}`} role="status">
      {status}
    </span>
  );
}

// ============================================
// EmptyState — guided empty view
// ============================================

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status" aria-label={title}>
      <div className="empty-state-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

// ============================================
// LoadingState
// ============================================

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = "Loading..." }: LoadingStateProps) {
  return (
    <div className="loading-state" role="status" aria-busy="true" aria-label={message}>
      <div className="loading-spinner" />
      <span>{message}</span>
    </div>
  );
}

// ============================================
// ProgressBar
// ============================================

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
}

export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const percent = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted">{label}</span>
          <span className="text-xs font-semibold">{percent}%</span>
        </div>
      )}
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
