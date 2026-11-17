"use client";

import { Component, type ReactNode } from "react";
import { PanelError } from "@/components/PanelStates";

/**
 * A crash while drawing what a panel shows (a place, a stay, a flight, a day) stays inside the panel. The panel sits above the page's own error screen,
 * so without this it would take the whole trip with it; here the sheet says it could not show that, offers another try, and can still be closed. Opening
 * something else (a different `resetKey`) clears it.
 */
export class PanelBoundary extends Component<{ children: ReactNode; resetKey: string; onClose?: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  componentDidUpdate(previous: { resetKey: string }) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <PanelError what="this" panel onRetry={() => this.setState({ failed: false })}>
        {this.props.onClose && <button type="button" onClick={this.props.onClose} className="btn-secondary">Close</button>}
      </PanelError>
    );
  }
}
