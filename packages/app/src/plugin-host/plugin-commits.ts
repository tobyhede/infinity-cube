import type { JsonValue, PluginKind, ResourceId } from '@project/core';
import type { Answer } from '@project/resource-api/domain';
import type { PluginCommits, PluginHostClaim, PluginOperations } from '@project/ui';
import { describeAuthoringRefusal } from '../authoring-refusal';
import type { AuthoringResult, DrawnCompletion, Settle, SettledResult } from '../space-authoring';
import type { PluginGate } from './plugin-gate';

/**
 * What a plugin surface on the canvas is offered (ADR 0142): a commit per Edit
 * the surface allows, each answering how the Edit settled, and a Claim. The
 * host withdraws a commit as well as offering it: one the plugin kept from an
 * earlier render answers refused once the Space it was built against has been
 * replaced, and every surface's plain commits answer refused while exclusive
 * work runs anywhere, whose own commits stay live for that work alone.
 */

/** What decides whether a surface on the canvas offers commits at all. */
export interface PluginSurfaceFacts {
  /** Whether this canvas authors its Space. */
  readonly authorOnCanvas: boolean;
  /** Whether this Resource is the working Space's own, which may be authored here. */
  readonly editable: boolean;
}

/** Whether a surface offers commits: on an authoring canvas, for a Resource it may author. */
export const offersCommits = (facts: PluginSurfaceFacts): boolean =>
  facts.authorOnCanvas && facts.editable;

const GONE: Answer = { refused: 'This Resource has changed since it was drawn. Try again.' };
const BUSY: Answer = { refused: 'Another change is still being made. Try again when it ends.' };

/** A settled Edit as a plugin reads it, its refusal in the words every refusal is reported in. */
export const answerOf = (result: SettledResult): Answer => {
  switch (result.kind) {
    case 'completed':
      return 'completed';
    case 'unchanged':
      return 'unchanged';
    case 'refused':
      return { refused: describeAuthoringRefusal(result.refusal) };
  }
};

/**
 * Run an Edit and answer once it settles: at once for every answer but
 * `queued`, and for a queued one when the drain reaches it.
 */
export function completeAsAnswer(run: (settle: Settle) => AuthoringResult): Promise<Answer> {
  return new Promise((resolve) => {
    const result = run((settled) => resolve(answerOf(settled)));
    if (result.kind !== 'queued') resolve(answerOf(result));
  });
}

/** What the canvas hands a plugin surface's commits to. */
export interface PluginHost {
  readonly gate: PluginGate;
  /** The Replacement epoch now, which a commit compares with the one it was built in. */
  readonly replacementEpoch: () => number;
  /** Complete an Edit where this canvas lands its Edits, told when a queued one settles. */
  readonly complete: (completion: DrawnCompletion, settle: Settle) => AuthoringResult;
}

/** The commits a surface's Resource may make, each running only while `live()` answers. */
function commitsFor(
  host: PluginHost,
  resourceId: ResourceId,
  live: () => Answer | null,
): PluginCommits {
  const changeMapContent = (content: JsonValue): Promise<Answer> => {
    const withdrawn = live();
    if (withdrawn !== null) return Promise.resolve(withdrawn);
    return completeAsAnswer((settle) =>
      host.complete({ kind: 'changed-map-content', resourceId, content }, settle),
    );
  };
  return { map: (next) => changeMapContent(next) };
}

/**
 * A plugin kind's operations on the canvas: bare where the surface offers no
 * commits, and otherwise its commits and a Claim, both withdrawn by the host.
 */
export function pluginSurfaceOperations(
  kind: PluginKind,
  resourceId: ResourceId,
  facts: PluginSurfaceFacts,
  host: PluginHost | undefined,
): PluginOperations {
  if (host === undefined || !offersCommits(facts)) return { kind };
  const builtIn = host.replacementEpoch();
  const plain = commitsFor(host, resourceId, () => {
    if (host.replacementEpoch() !== builtIn) return GONE;
    if (host.gate.exclusiveRunning()) return BUSY;
    return null;
  });
  const operations: { -readonly [K in keyof PluginOperations]: PluginOperations[K] } = { kind };
  if (plain.map !== undefined) operations.commitMap = plain.map;
  operations.claim = (): PluginHostClaim | undefined => {
    const held = host.gate.claim([resourceId], (running) =>
      commitsFor(host, resourceId, () => {
        if (host.replacementEpoch() !== builtIn) return GONE;
        return running() ? null : BUSY;
      }),
    );
    if (held === undefined) return undefined;
    return {
      release: () => held.release(),
      exclusively: (work) => held.exclusively(work),
      unmount: () => host.gate.unmount(resourceId),
    };
  };
  return operations;
}
