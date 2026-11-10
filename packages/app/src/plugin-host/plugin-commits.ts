import type { JsonValue, PluginKind, ResourceDocument, ResourceId } from '@project/core';
import type { ObserverErrorReporter } from '@project/persistence';
import type { Answer, Size } from '@project/resource-api/domain';
import type { Assets } from '@project/resource-api/view';
import type { ClaimHolder, PluginCommits, PluginHostClaim, PluginOperations } from '@project/ui';
import { describeAuthoringRefusal } from '../authoring-refusal';
import type { AuthoringResult, DrawnCompletion, Settle, SettledResult } from '../space-authoring';
import {
  claimedElsewhere,
  heldByAnotherDrawing,
  holds,
  type ClaimChain,
  type Drawing,
} from './claim-chain';
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
  /**
   * The Resources whose Map embedding this canvas draws inside, outermost
   * first: a surface here is embedded in each, so its Claim nests under one
   * they hold (ADR 0142). Empty, or absent, on a canvas drawn in no embedding.
   */
  readonly embeddedIn?: readonly ResourceId[] | undefined;
}

/** Who holds a Claim on a drawing's Resource, as that drawing reads it. */
export const claimHolderOf = (chain: ClaimChain, drawing: Drawing): ClaimHolder => {
  if (holds(chain, drawing.key)) return 'this-drawing';
  return heldByAnotherDrawing(chain, drawing) ? 'another-drawing' : 'none';
};

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

/** Whether two Claim chains name the same surface. */
const sameChain = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((surface, index) => surface === b[index]);

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
  // A surface inside a Map embedding whose Resource holds the Claim may nest
  // its own under it, as an Image inside an entered Space may (ADR 0142).
  const chain = [...(host.embeddedIn ?? []), resourceId];
  const { holders } = host.gate.getState();
  const heldHere = holders.some((held) => held.includes(resourceId));
  const deepest = holders.at(-1);
  const nests =
    deepest !== undefined &&
    deepest.length < chain.length &&
    deepest.every((surface, index) => chain[index] === surface);
  if (holders.length > 0 && !heldHere && !nests) return drawn;
  const plain = commitsFor(
    host,
    resourceId,
    () => replaced() ?? (host.gate.exclusiveRunning() ? BUSY : null),
    host.complete,
  );
  const claim = (): PluginHostClaim | undefined => {
    const held = host.gate.claim(chain, (running) =>
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
    // The surface holding the Claim keeps offering one, so the render in
    // which its own release lands, before the gate's publication rebuilds
    // these operations, does not draw it without its Edit for a frame and
    // drop the focus that was on its Done. Another drawing of the same
    // Resource offers none while it is held.
    claim: heldHere && !holders.some((held) => sameChain(held, chain)) ? undefined : claim,
  };
}
