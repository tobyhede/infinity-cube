import {
  RESOURCE_TITLE_REQUIRED,
  resourceDocumentSchema,
  type JsonValue,
  type PluginKind,
  type ResourceDocument,
  type ResourceId,
} from '@project/core';
import type { ObserverErrorReporter } from '@project/persistence';
import type { Answer } from '@project/resource-api/domain';
import type { ClaimHolder, PluginCommits, PluginHostClaim, PluginOperations } from '@project/ui';
import { describeAuthoringRefusal } from '../authoring-refusal';
import type { AuthoringResult, DrawnCompletion, Settle, SettledResult } from '../space-authoring';
import { heldByAnotherDrawing, holds, type ClaimChain, type Drawing } from './claim-chain';
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
const INVALID: Answer = { refused: 'This change cannot be kept.' };

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
  /**
   * The gate's chain as last published, which the canvas read to decorate its
   * Resources: what a surface is offered is built from it, and each commit
   * asks the gate itself when it is called.
   */
  readonly claims: ClaimChain;
  /** The Replacement epoch now, which a commit compares with the one it was built in. */
  readonly replacementEpoch: () => number;
  /** A Resource's stored document now, which a Title or content commit changes one field of. */
  readonly document: (resourceId: ResourceId) => ResourceDocument | undefined;
  /** Complete an Edit where this canvas lands its Edits, told when a queued one settles. */
  readonly complete: (completion: DrawnCompletion, settle: Settle) => AuthoringResult;
  /** Where an Edit that threw, or a plugin that threw while drawing, is reported. */
  readonly report: ObserverErrorReporter;
}

/** Who holds a Claim on a drawing's Resource, as that drawing reads it. */
export const claimHolderOf = (chain: ClaimChain, drawing: Drawing): ClaimHolder => {
  if (holds(chain, drawing.key)) return 'this-drawing';
  return heldByAnotherDrawing(chain, drawing) ? 'another-drawing' : 'none';
};

/**
 * The commits a surface's Resource may make, each running only while `live()`
 * answers, and each landing through `complete`.
 */
function commitsFor(
  host: PluginHost,
  resourceId: ResourceId,
  live: () => Answer | null,
  complete: PluginHost['complete'],
): PluginCommits {
  const changeMapContent = (content: JsonValue): Promise<Answer> => {
    const withdrawn = live();
    if (withdrawn !== null) return Promise.resolve(withdrawn);
    return completeAsAnswer(
      (settle) => complete({ kind: 'changed-map-content', resourceId, content }, settle),
      host.report,
    );
  };
  /** One Edit of the Resource's document, its kind's schema answering for the next one. */
  const editDocument = (
    change: { readonly title: string } | { readonly content: JsonValue },
  ): Promise<Answer> => {
    const withdrawn = live();
    if (withdrawn !== null) return Promise.resolve(withdrawn);
    const stored = host.document(resourceId);
    if (stored === undefined) {
      return Promise.resolve({ refused: describeAuthoringRefusal({ code: 'resource-not-found' }) });
    }
    const parsed = resourceDocumentSchema.safeParse({ ...stored, ...change });
    if (!parsed.success) {
      const titleRequired = parsed.error.issues.some(
        (issue) => issue.code === 'custom' && issue.params?.['code'] === RESOURCE_TITLE_REQUIRED,
      );
      return Promise.resolve(
        titleRequired
          ? { refused: describeAuthoringRefusal({ code: RESOURCE_TITLE_REQUIRED }) }
          : INVALID,
      );
    }
    return completeAsAnswer(
      (settle) => complete({ kind: 'edited-resource', resourceId, document: parsed.data }, settle),
      host.report,
    );
  };
  // A size hint is ignored: Ur, the one plugin drawn here, commits none, and
  // the canvas applies none yet (`docs/agents/maps-and-graphs.md`, R38, R40).
  return {
    title: (next) => editDocument({ title: next }),
    content: (next) => editDocument({ content: next }),
    map: (next) => changeMapContent(next),
  };
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
    // Read when called, so a commit kept from an earlier render is withheld
    // once another drawing of the Resource holds a Claim.
    claimHolder: (drawing: symbol) =>
      claimHolderOf(host.gate.getState(), { resource: resourceId, key: drawing }),
    onFailure: (error: Error) => host.report(error),
  };
  if (!offersCommits(facts)) return drawn;
  if (host.claims.exclusive !== null) return { ...drawn, withdrawn: true };
  const replaced = (): Answer | null => (host.replacementEpoch() === builtIn ? null : GONE);
  const plain = commitsFor(
    host,
    resourceId,
    () => replaced() ?? (host.gate.exclusiveRunning() ? BUSY : null),
    host.complete,
  );
  // Exclusive work's own commits are admitted past the gate every Space's
  // Authoring asks at `complete`; a plain one is not.
  const admitted: PluginHost['complete'] = (completion, settle) =>
    host.gate.admit(() => host.complete(completion, settle));
  const claim = (drawing: symbol): PluginHostClaim | undefined => {
    const held = host.gate.claim([{ resource: resourceId, key: drawing }], (running) =>
      commitsFor(host, resourceId, () => replaced() ?? (running() ? null : BUSY), admitted),
    );
    if (held === undefined) return undefined;
    return {
      release: () => held.release(),
      exclusively: (work) => held.exclusively(work),
      unmount: () => host.gate.unmount(drawing),
    };
  };
  return {
    ...drawn,
    commitTitle: plain.title,
    commitContent: plain.content,
    commitMap: plain.map,
    claim,
  };
}
