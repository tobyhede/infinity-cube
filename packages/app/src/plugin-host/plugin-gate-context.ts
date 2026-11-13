import { useState, useSyncExternalStore } from 'react';
import { useOpenSpaces } from '../open-spaces-context';
import { createPluginGate, type PluginGate } from './plugin-gate';

/**
 * The page's one Claim chain and exclusive gate (ADR 0142), which Open Spaces
 * holds for every Space it composes, or one of this caller's own where no
 * Open Spaces is mounted, as in a story or a test that draws a canvas alone.
 */
export function usePluginGate(): PluginGate {
  const [own] = useState(createPluginGate);
  return useOpenSpaces()?.pluginGate ?? own;
}

/**
 * Whether exclusive work runs behind this gate: the hold ADR 0126 sets on
 * authoring and navigation while it does.
 */
export function useExclusiveRunning(gate: PluginGate): boolean {
  return useSyncExternalStore(gate.subscribe, gate.exclusiveRunning, gate.exclusiveRunning);
}
