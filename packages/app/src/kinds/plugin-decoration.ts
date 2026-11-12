import type { PluginKind, ResourceId } from '@project/core';
import type { PluginOperations } from '@project/ui';
import type { CanvasResourceDecorationContext, EveryField } from '../canvas-resource-decoration';
import { pluginSurfaceOperations, type PluginHost } from '../plugin-host/plugin-commits';

/** What a plugin kind's canvas decoration reads, whichever plugin it is (ADR 0142). */
export type PluginResourceDecorationContext = Pick<
  CanvasResourceDecorationContext,
  'authorOnCanvas' | 'editableResourceIds'
> & {
  /**
   * Where the plugin's commits go and the gate that withdraws them (ADR 0142).
   * Absent where this canvas offers a plugin no commit.
   */
  readonly pluginHost?: PluginHost | undefined;
};

/** A plugin kind's part of the decoration context, field by field. */
export const pluginDecorationSlice = ({
  authorOnCanvas,
  editableResourceIds,
  pluginHost,
}: PluginResourceDecorationContext): EveryField<PluginResourceDecorationContext> => ({
  authorOnCanvas,
  editableResourceIds,
  pluginHost,
});

/**
 * A plugin kind's Resource surface on the canvas: its commits, the asset store
 * and picker, and a Claim, where the canvas authors the Resource. Every plugin
 * kind's surface is this one, differing only in its kind.
 */
export const pluginResourceOperations = (
  kind: PluginKind,
  resourceId: ResourceId,
  context: PluginResourceDecorationContext,
): PluginOperations =>
  pluginSurfaceOperations(
    kind,
    resourceId,
    {
      authorOnCanvas: context.authorOnCanvas,
      editable: context.editableResourceIds.has(resourceId),
    },
    context.pluginHost,
  );
