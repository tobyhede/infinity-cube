import { createContext, useContext, useState } from 'react';
import { createPluginGate, type PluginGate } from './plugin-gate';

/**
 * The application's one Claim chain and exclusive gate, which
 * `PluginGateProvider` provides once at the root so every composed Space's
 * plugin surfaces share it (ADR 0142).
 */
export const PluginGateContext = createContext<PluginGate | null>(null);

/**
 * The gate the root provides, or one of this caller's own where none does, as
 * in a story or a test that draws a canvas alone.
 */
export function usePluginGate(): PluginGate {
  const [own] = useState(createPluginGate);
  return useContext(PluginGateContext) ?? own;
}
