import type { JsonValue, PluginKind, ResourceDocument, ResourceId } from '@project/core';
import type { ObserverErrorReporter } from '@project/persistence';
import type { Answer, Size } from '@project/resource-api/domain';
import type { Assets } from '@project/resource-api/view';
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

/** An answer that refuses, which a commit and a store each answer alike. */
type Refusal = { readonly refused: string };

const GONE: Refusal = { refused: 'This Resource has changed since it was drawn. Try again.' };
const BUSY: Refusal = { refused: 'Another change is still being made. Try again when it ends.' };
const BROKE: Answer = { refused: 'This change could not be made.' };
const NOT_FOUND: Refusal = { refused: 'This Resource is no longer available.' };

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
  /** Complete an Edit where this canvas lands its Edits, told when a queued one settles. */
  readonly complete: (completion: DrawnCompletion, settle: Settle) => AuthoringResult;
  /** Where an Edit that threw, or a plugin that threw while drawing, is reported. */
  readonly report: ObserverErrorReporter;
  /** The asset store and file picker a surface offers where it offers commits; absent, neither. */
  readonly assets?: Pick<Assets, 'store' | 'pick'> | undefined;
  /** A Resource's stored document now, which a Title commit rewrites the Title of. */
  readonly document: (resourceId: ResourceId) => ResourceDocument | undefined;
  /**
   * A plugin's size hint capped at what this canvas shows (`visibleCanvasCap`),
   * a canvas fact; absent, or answering `undefined`, the hint is ignored.
   */
  readonly capSizeHint?: ((hint: Size) => Size | undefined) | undefined;
}

/**
 * The commits a surface's Resource may make, each running only while `live()`
 * answers, and each landing through `complete`: its Title as one ordinary
 * `edited-resource` Edit of the document as it stands, its content as a
 * `changed-content` Edit, its Map content as a `changed-map-content` Edit, and
 * the asset store where the canvas offers one.
 */
function commitsFor(
  host: PluginHost,
  resourceId: ResourceId,
  live: () => Refusal | null,
  complete: PluginHost['complete'],
): PluginCommits {
  const complete = own
    ? (completion: DrawnCompletion, settle: Settle) =>
        host.gate.admit(() => host.complete(completion, settle))
    : host.complete;
  /** Run the Edit `completion` builds, unless withdrawn or its Resource is gone. */
  const run = (completion: () => DrawnCompletion | undefined): Promise<Answer> => {
    const withdrawn = live();
    if (withdrawn !== null) return Promise.resolve(withdrawn);
    const built = completion();
    if (built === undefined) return Promise.resolve(NOT_FOUND);
    return completeAsAnswer((settle) => complete(built, settle), host.report);
  };
  const retitled = (title: string) => (): DrawnCompletion | undefined => {
    const document = host.document(resourceId);
    if (document === undefined) return undefined;
    return { kind: 'edited-resource', resourceId, document: { ...document, title } };
  };
  const changeMapContent = (
    content: JsonValue,
    options?: { readonly sizeHint?: Size },
  ): Promise<Answer> =>
    run(() => {
      const hint = options?.sizeHint;
      const size = hint === undefined ? undefined : host.capSizeHint?.(hint);
      return { kind: 'changed-map-content', resourceId, content, size };
    });
  const store = host.assets?.store;
  return {
    title: (next) => run(retitled(next)),
    content: (next) => run(() => ({ kind: 'changed-content', resourceId, content: next })),
    map: changeMapContent,
    store:
      store === undefined
        ? undefined
        : (bytes) => {
            const withdrawn = live();
            return withdrawn === null ? store(bytes) : Promise.resolve(withdrawn);
          },
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
  if (host.gate.exclusiveRunning()) return { ...drawn, withdrawn: true };
  // While another surface holds a Claim, this one offers nothing to compete
  // with it (ADR 0064, ADR 0142): its commands come back when that Claim ends.
  // A Resource drawn twice, as two embeddings of one Map draw it, is held by
  // one of its surfaces at a time: once one holds it, none offers a second.
  const { holders } = host.gate.getState();
  const heldHere = holders.some((path) => path.includes(resourceId));
  if (holders.length > 0 && !heldHere) return drawn;
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
  const pickFiles = host.assets?.pick;
  const pick =
    pickFiles === undefined
      ? undefined
      : (accept: string): Promise<File[]> =>
          host.gate.exclusiveRunning() || host.replacementEpoch() !== builtIn
            ? Promise.resolve([])
            : pickFiles(accept);
  return {
    ...drawn,
    commitTitle: plain.title,
    commitContent: plain.content,
    commitMap: plain.map,
    commitStore: plain.store,
    pick,
    claim: heldHere ? undefined : claim,
  };
}
