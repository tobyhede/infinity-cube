import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPluginGate, type PluginGate } from './plugin-gate';

/**
 * The application's one Claim chain and exclusive gate, provided once at the
 * root so every composed Space's plugin surfaces share it (ADR 0142).
 */
const PluginGateContext = createContext<PluginGate | null>(null);

export function PluginGateProvider({ children }: { readonly children: ReactNode }) {
  const [gate] = useState(createPluginGate);
  return <PluginGateContext.Provider value={gate}>{children}</PluginGateContext.Provider>;
}

/**
 * The gate the root provides, or one of this caller's own where none does, as
 * in a story or a test that draws a canvas alone.
 */
export function usePluginGate(): PluginGate {
  const [own] = useState(createPluginGate);
  return useContext(PluginGateContext) ?? own;
}
