"use client";

import { Component, type ReactNode } from "react";
import { Alert } from "antd";

type Props = { children: ReactNode; message: string; resetKey?: unknown };
type State = { failed: boolean; resetKey?: unknown };

// A chart that fails to render must not take down the whole admin page.
export default class ChartBoundary extends Component<Props, State> {
  state: State = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: unknown) {
    console.error("Chart render failed", error);
  }

  render() {
    return this.state.failed ? <Alert type="warning" showIcon title={this.props.message} /> : this.props.children;
  }
}
