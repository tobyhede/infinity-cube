import type { JsonValue, PluginKind, ResourceId } from '@project/core';
import type { ObserverErrorReporter } from '@project/persistence';
import type { Answer } from '@project/resource-api/domain';
import type { PluginCommits, PluginHostClaim, PluginOperations } from '@project/ui';
import { describeAuthoringRefusal } from '../authoring-refusal';
import type { AuthoringResult, DrawnCompletion, Settle, SettledResult } from '../space-authoring';
import { holds } from './claim-chain';
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
const BROKE: Answer = { refused: 'This change could not be made.' };

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
 * `queued`, and for a queued one when the drain reaches it. An Edit that
 * throws is reported and answers refused, so a commit always settles.
 */
export function completeAsAnswer(
  run: (settle: Settle) => AuthoringResult,
  report: ObserverErrorReporter,
): Promise<Answer> {
  return new Promise((resolve) => {
    try {
      const result = run((settled) => resolve(answerOf(settled)));
      if (result.kind !== 'queued') resolve(answerOf(result));
    } catch (error) {
      report(error);
      resolve(BROKE);
    }
  });
}

/** What the canvas hands a plugin surface's commits to. */
export interface PluginHost {
  readonly gate: PluginGate;
  /** The Replacement epoch now, which a commit compares with the one it was built in. */
  readonly replacementEpoch: () => number;
  /** Complete an Edit where this canvas lands its Edits, told when a queued one settles. */
  readonly complete: (completion: DrawnCompletion, settle: Settle) => AuthoringResult;
  /** Where an Edit that threw, or a plugin that threw while drawing, is reported. */
  readonly report: ObserverErrorReporter;
}

/**
 * The commits a surface's Resource may make, each running only while `live()`
 * answers. Exclusive work's own commits are admitted past the gate every
 * Space's Authoring asks at `complete`; a plain one is not.
 */
function commitsFor(
  host: PluginHost,
  resourceId: ResourceId,
  live: () => Answer | null,
  own: boolean,
): PluginCommits {
  const complete = own
    ? (completion: DrawnCompletion, settle: Settle) =>
        host.gate.admit(() => host.complete(completion, settle))
    : host.complete;
  const changeMapContent = (content: JsonValue): Promise<Answer> => {
    const withdrawn = live();
    if (withdrawn !== null) return Promise.resolve(withdrawn);
    return completeAsAnswer(
      (settle) => complete({ kind: 'changed-map-content', resourceId, content }, settle),
      host.report,
    );
  };
  return { map: (next) => changeMapContent(next) };
}

/**
 * A plugin kind's operations on the canvas: bare where the surface offers no
 * commits, and otherwise its commits and a Claim, both withdrawn by the host.
 * While exclusive work runs anywhere the surface is offered nothing, and says
 * so, so it re-renders without what was withdrawn rather than finding out on
 * a press; the decoration is rebuilt whenever the gate publishes.
 */
export function pluginSurfaceOperations(
  kind: PluginKind,
  resourceId: ResourceId,
  facts: PluginSurfaceFacts,
  host: PluginHost | undefined,
): PluginOperations {
  if (host === undefined) return { kind };
  const builtIn = host.replacementEpoch();
  const drawn = {
    kind,
    epoch: builtIn,
    claimed: holds(host.gate.getState(), resourceId),
    onFailure: (error: Error) => host.report(error),
  };
  if (!offersCommits(facts)) return drawn;
  if (host.gate.exclusiveRunning()) return { ...drawn, withdrawn: true };
  const plain = commitsFor(
    host,
    resourceId,
    () => {
      if (host.replacementEpoch() !== builtIn) return GONE;
      if (host.gate.exclusiveRunning()) return BUSY;
      return null;
    },
    false,
  );
  const claim = (): PluginHostClaim | undefined => {
    const held = host.gate.claim([resourceId], (running) =>
      commitsFor(
        host,
        resourceId,
        () => {
          if (host.replacementEpoch() !== builtIn) return GONE;
          return running() ? null : BUSY;
        },
        true,
      ),
    );
    if (held === undefined) return undefined;
    return {
      release: () => held.release(),
      exclusively: (work) => held.exclusively(work),
      unmount: () => host.gate.unmount(resourceId),
    };
  };
  return { ...drawn, commitMap: plain.map, claim };
}
