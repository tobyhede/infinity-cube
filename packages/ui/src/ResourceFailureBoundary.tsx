import { Component, type ErrorInfo, type ReactNode } from 'react';
import { sameJsonValue, type JsonValue } from '@project/core';

export interface ResourceFailureBoundaryProps {
  readonly children?: ReactNode;
  /** Told what the plugin threw, so the failure is reported rather than only drawn. */
  readonly onFailure?: ((error: Error) => void) | undefined;
  /**
   * A value a failed drawing is tried again on once it changes, compared as
   * JSON, key order aside. A drawing that has not failed is left as it is.
   */
  readonly retryOn?: JsonValue | undefined;
}

interface ResourceFailureBoundaryState {
  readonly failed: boolean;
  /** The `retryOn` value last drawn with, which a failure happened at. */
  readonly drawnOn: JsonValue | undefined;
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
  override state: ResourceFailureBoundaryState = { failed: false, drawnOn: this.props.retryOn };

  static getDerivedStateFromProps(
    props: ResourceFailureBoundaryProps,
    state: ResourceFailureBoundaryState,
  ): Partial<ResourceFailureBoundaryState> | null {
    if (sameRetry(props.retryOn, state.drawnOn)) return null;
    return { failed: false, drawnOn: props.retryOn };
  }

  static getDerivedStateFromError(): Partial<ResourceFailureBoundaryState> {
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
