import { Component, type ErrorInfo, type ReactNode } from 'react';
import { sameJsonValue, type JsonValue } from '@project/core';

export interface ResourceFailureBoundaryProps {
  readonly children?: ReactNode;
  /** Told what the plugin threw, so the failure is reported rather than only drawn. */
  readonly onFailure?: ((error: Error) => void) | undefined;
  /**
   * A value whose change draws a failed plugin again, without remounting one
   * that is drawing: what it holds, such as an edit asked for while Closed,
   * survives the change.
   */
  readonly retryKey?: string | undefined;
}

interface ResourceFailureBoundaryState {
  readonly failed: boolean;
  readonly retryKey: string | undefined;
}

const sameRetry = (left: JsonValue | undefined, right: JsonValue | undefined): boolean =>
  left === undefined || right === undefined ? left === right : sameJsonValue(left, right);

/**
 * The failure boundary each Resource is drawn inside (ADR 0142): a plugin that
 * throws while drawing loses its own Resource, which draws a short note in its
 * rect, and not the canvas. Keyed by its host on the Resource and the
 * Replacement epoch, so a replaced working Space mounts the plugin afresh, and
 * tried again, once failed, on a new `retryOn` value.
 *
 * A class because React catches a render failure only in one: no hook can.
 */
export class ResourceFailureBoundary extends Component<
  ResourceFailureBoundaryProps,
  ResourceFailureBoundaryState
> {
  override state: ResourceFailureBoundaryState = {
    failed: false,
    retryKey: this.props.retryKey,
  };

  static getDerivedStateFromError(): Partial<ResourceFailureBoundaryState> {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: ResourceFailureBoundaryProps,
    state: ResourceFailureBoundaryState,
  ): ResourceFailureBoundaryState | null {
    if (props.retryKey === state.retryKey) return null;
    return { failed: false, retryKey: props.retryKey };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onFailure?.(error);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <p role="note" className="resource-failure" data-testid="resource-failure">
          This Resource could not be drawn.
        </p>
      );
    }
    return this.props.children;
  }
}
