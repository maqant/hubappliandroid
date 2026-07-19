import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge, EmptyState, LoadingState, ProgressBar } from "@pbh/professional-ui";

describe("Professional UI Component Tests", () => {
  describe("StatusBadge", () => {
    it("should render correct status text and classes", () => {
      render(<StatusBadge status="ACCEPTED" />);
      const badge = screen.getByRole("status");
      expect(badge).toHaveTextContent("ACCEPTED");
      expect(badge).toHaveClass("badge-accepted");
    });
  });

  describe("EmptyState", () => {
    it("should render title, description, icon and action", () => {
      const actionButton = <button>Create First Project</button>;
      render(
        <EmptyState
          icon="📁"
          title="No projects yet"
          description="Create your first project to start."
          action={actionButton}
        />,
      );

      expect(screen.getByText("No projects yet")).toBeInTheDocument();
      expect(screen.getByText("Create your first project to start.")).toBeInTheDocument();
      expect(screen.getByText("📁")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create First Project" })).toBeInTheDocument();
    });
  });

  describe("LoadingState", () => {
    it("should render loading text and spinner", () => {
      render(<LoadingState message="Fetching data..." />);
      const container = screen.getByRole("status");
      expect(container).toHaveAttribute("aria-busy", "true");
      expect(screen.getByText("Fetching data...")).toBeInTheDocument();
    });
  });

  describe("ProgressBar", () => {
    it("should render correct progress bar width and labels", () => {
      render(<ProgressBar value={40} max={100} label="Mission Tasks" />);
      const pb = screen.getByRole("progressbar");
      expect(pb).toHaveAttribute("aria-valuenow", "40");
      expect(pb).toHaveAttribute("aria-valuemin", "0");
      expect(pb).toHaveAttribute("aria-valuemax", "100");
      expect(screen.getByText("40%")).toBeInTheDocument();
    });
  });
});
