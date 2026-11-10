import { useState, type ReactNode } from 'react';
import { createPluginGate } from './plugin-gate';
import { PluginGateContext } from './plugin-gate-context';

/** Provides the application's one plugin gate to everything it draws (ADR 0142). */
export function PluginGateProvider({ children }: { readonly children: ReactNode }) {
  const [gate] = useState(createPluginGate);
  return <PluginGateContext.Provider value={gate}>{children}</PluginGateContext.Provider>;
}
