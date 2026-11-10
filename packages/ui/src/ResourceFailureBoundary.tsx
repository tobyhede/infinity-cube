import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ResourceFailureBoundaryProps {
  readonly children?: ReactNode;
  /** Told what the plugin threw, so the failure is reported rather than only drawn. */
  readonly onFailure?: ((error: Error) => void) | undefined;
}

interface ResourceFailureBoundaryState {
  readonly failed: boolean;
}

/**
 * The failure boundary each Resource is drawn inside (ADR 0142): a plugin that
 * throws while drawing loses its own Resource, which draws a short note in its
 * rect, and not the canvas. Keyed by its host on the Resource and the
 * Replacement epoch, so a replaced working Space mounts the plugin afresh.
 *
 * A class because React catches a render failure only in one: no hook can.
 */
export class ResourceFailureBoundary extends Component<
  ResourceFailureBoundaryProps,
  ResourceFailureBoundaryState
> {
  override state: ResourceFailureBoundaryState = { failed: false };

  static getDerivedStateFromError(): ResourceFailureBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onFailure?.(error);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <p role="note" className="resource-failure" data-testid="resource-failure">
          This Resource could not be drawn.
        </p>
      );
    }
    return this.props.children;
  }
}
