# Compound documents and embedding: prior art for Resource plugins

**A pre-ADR assessment.** Written on 2026-11-10 against the draft design, before ADR 0142 was accepted, and kept as written. Where it disagrees with the design it read, the ADR and [`spec.md`](spec.md) record what was decided: a missing plugin's Resource is drawn by the default plugin rather than refused, the deepest of nested Claims shows its commands, and Undo across a Claim is out of scope.

Read 2026-11-10. **Versions:** Microsoft Learn Win32 pages (`ms.date` 2018-12-05, updated 2024-02-22); *OpenDoc Programmer's Guide*, 16 Jul 1996, via Apple's June 1998 Developer CD on discmaster; MCP Apps Stable 2026-01-26; HTML Living Standard, 9 Nov 2026; Adaptive Cards renderer spec, updated 2025-07-03; reveal.js 4.0.0 page; Slidev v53.1.0. **Caveat:** OpenDoc, MCP Apps, HTML and Slack quotes arrived through a summarising fetch; recheck before quoting onward. **Unreachable:** `preserve.mactech.com` (expired certificate; two *develop* articles read through discmaster).

## Bottom line

Host-owned geometry, host-drawn commands and capability-by-absence each have direct precedent, and each removes a mechanism that was costly in OLE. The family's warnings fall elsewhere: **nesting was the part Microsoft's own framework declined to build**, both durable-document systems **opened documents with missing editors rather than refusing them**, and hosts **asked parts what to draw**, which a capability cannot express.

## 1. Activation states

OLE defines [passive, loaded, running](https://learn.microsoft.com/en-us/windows/win32/com/object-states); in-place adds two, split by [verbs](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-ioleobject-doverb): `INPLACEACTIVATE` (no tools) and `UIACTIVATE` (menus, toolbars). The split needed patching: [`OLEMISC_INSIDEOUT`, `ACTIVATEWHENVISIBLE`, `NOUIACTIVATE`, `IGNOREACTIVATEWHENVISIBLE`](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/ne-oleidl-olemisc). OpenDoc separates [selected from active](https://discmaster.textfiles.com/file/12652/www.mactech.com.tar/www.mactech.com/articles/develop/issue_22/opendoc.html?html=true), "only one part at a time" active.

Mounted maps to in-place active, claim to UI active, `paint.selected` to OpenDoc selected. Two OLE states have no equivalent. **Loaded**, cached pictures with no live code, is for viewing and printing; we mount every visible plugin, nested Maps included. **"Ready"**: after [`UIDeactivate`](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-ioleinplaceobject-uideactivate) the object stays quickly reactivatable "until the undo state of the document changes", and [`InPlaceDeactivate`](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-ioleinplaceobject-inplacedeactivate) discards undo. Neither the ADR nor the spec says what undo means across a claim release.

## 2. Nested activation

OLE walks the chain stepwise: [the immediate container](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-ioleinplaceobject-uideactivate) deactivates, and [a container that is itself embedded removes its document-level UI](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-ioleinplacesite-onuiactivate). Keys: the active object ["must always be given the first chance"](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-ioleinplaceactiveobject-translateaccelerator). Failure evidence: [MFC "does not support nested in-place activation"](https://learn.microsoft.com/en-us/cpp/mfc/activation-cpp), so an activated container/server cannot activate its own embeds. No first-party account of why found.

OpenDoc named separate [foci as strings](https://discmaster.textfiles.com/file/32775/Dev.CD%20Jun%2098%20RL2.toast/Technical%20Documentation/Technical%20Publications/mac/ODProgGuide/ODProgGuide-37.html?html=true) (keyboard, menu, modal and others), transferred in a two-stage transaction any owner can refuse. Clicks go to the most deeply embedded frame. Our Claim refuses no release: an outer release waits until the inner Claim ends. MCP Apps is [silent on keyboard, focus and menus](https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/main/specification/2026-01-26/apps.mdx).

## 3. Geometry

Every system let the part ask and kept the veto in the container. OLE: the object calls [`OnPosRectChange`, the container must `SetObjectRects`, "only then does the object resize"](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-ioleinplacesite-onposrectchange). OpenDoc: ["the containing part has unilateral control"](https://discmaster.textfiles.com/file/32775/Dev.CD%20Jun%2098%20RL2.toast/Technical%20Documentation/Technical%20Publications/mac/ODProgGuide/ODProgGuide-27.html?html=true), and the part [must accept the result but may ask again](https://discmaster.textfiles.com/file/32775/Dev.CD%20Jun%2098%20RL2.toast/Technical%20Documentation/Technical%20Publications/mac/ODClassRef/ODClassRef-466.html?html=true). The documented cost is loops: Piersol's rule is ["Don't ask twice!"](https://discmaster.textfiles.com/file/12652/www.mactech.com.tar/www.mactech.com/articles/develop/issue_21/21piersol.html?html=true). MCP Apps [draft text](https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/main/specification/draft/apps.mdx) has flexible container dimensions the host must follow, auto-resize on by default. None forbids asking.

OpenDoc also separates [frame shape from used shape](https://discmaster.textfiles.com/file/32775/Dev.CD%20Jun%2098%20RL2.toast/Technical%20Documentation/Technical%20Publications/mac/ODProgGuide/ODProgGuide-26.html?html=true): a part reports what it occupies without requesting geometry.

## 4. Shared commands

OLE builds a composite menu: [the container fills groups 0, 2, 4, the object the rest](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-ioleinplaceframe-insertmenus), a [descriptor routes commands, with deadlock warnings](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-ioleinplaceframe-setmenu), and toolbars [negotiate border pixels](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-ioleinplaceuiwindow-requestborderspace). OpenDoc: a part [adds menus on activation, removes them on deactivation](https://discmaster.textfiles.com/file/32775/Dev.CD%20Jun%2098%20RL2.toast/Technical%20Documentation/Technical%20Publications/mac/ODProgGuide/ODProgGuide-36.html?html=true); I could not find its root-part rules.

Host-drawn data removes merging, dispatch and space negotiation, but not the policy question OLE answered by replacement: whose commands show during a nested claim? The spec does not say.

## 5. Missing handlers

OLE keeps [cached presentation data](https://learn.microsoft.com/en-us/windows/win32/com/object-states). When Microsoft [removed Equation Editor 3.0 for security](https://learn.microsoft.com/en-us/office/troubleshoot/office-suite-issues/issue-when-edit-equation-in-office), editing failed with "not available" and the new editor cannot edit old equations: code loss became permanent uneditability, but the document opened.

OpenDoc's ladder runs [preferred editor, kind, category, any reader, then an "editor of last resort" that is "always available" and shows an icon in the frame](https://discmaster.textfiles.com/file/32775/Dev.CD%20Jun%2098%20RL2.toast/Technical%20Documentation/Technical%20Publications/mac/ODProgGuide/ODProgGuide-74.html?html=true). [Part kinds stay readable "if the part editor that stored the data is not present"](https://discmaster.textfiles.com/file/32775/Dev.CD%20Jun%2098%20RL2.toast/Technical%20Documentation/Technical%20Publications/mac/ODProgGuide/ODProgGuide-46.html?html=true), and representations are stored by descending fidelity.

Refusal is safe for bytes, since nothing is rewritten. Its cost is availability: one Resource makes a whole aggregate unopenable.

## 6. Decline

**No designer retrospective found** for either system; no Apple cancellation notice or WWDC 1997 transcript reached. The nearest participant account is OpenDoc's [product marketing manager (2006)](https://gregmaletic.wordpress.com/2006/11/12/opendoc/): nobody in Apple wanted it, RAM, a document-centric UI that scared developers, fear of competing with developers. Piersol, contemporaneously: ["with power comes a certain amount of complexity"](https://discmaster.textfiles.com/file/12652/www.mactech.com.tar/www.mactech.com/articles/develop/issue_21/21piersol.html?html=true).

OLE's retreat shows only in documents: [no "hard binding" to in-place activation in Windows 7's Paint and WordPad](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-server-2008-R2-and-2008/ee681702(v=ws.10)); [ActiveX off by default in Office](https://support.microsoft.com/en-au/office/activex-controls-are-disabled-by-default-in-office-2024-9cae60f8-478c-42c6-978c-eca072525d64) (search excerpt; ActiveX is adjacent to embedding).

Applies to us: complexity and memory under nesting. Not: vendor incentives, installation, cross-platform. Security only with outside plugins.

## 7. Exclusive operations

OLE's [frame](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-ioleinplaceframe-enablemodeless) and [object](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-ioleinplaceactiveobject-enablemodeless) `EnableModeless` are two-way and enforced by nothing. OpenDoc makes modal a [focus under the same arbitrator](https://discmaster.textfiles.com/file/32775/Dev.CD%20Jun%2098%20RL2.toast/Technical%20Documentation/Technical%20Publications/mac/ODProgGuide/ODProgGuide-37.html?html=true); the holder refuses while its dialog is up. Withdrawing `commit` is stronger than either, since compliance is structural. `'busy'` matches the refusal. MCP Apps says nothing.

## 8. Isolation

OLE had both models: [DLL objects get keys through the container; EXE objects run their own pump](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-ioleinplaceactiveobject-translateaccelerator). I found no first-party statement of what a faulting OpenDoc part did to its document.

The HTML sandbox gives [an opaque origin, and warns that `allow-scripts` with `allow-same-origin` on same-origin content defeats it](https://html.spec.whatwg.org/multipage/iframe-embed-object.html). MCP Apps [requires both flags but on a different origin, with a host-served document and `connect-src 'none'` by default](https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/main/specification/2026-01-26/apps.mdx); it specifies no crash handling.

Trusting compiled plugins costs containment. My inference: Office's exposure came from documents selecting installed code, whereas our `kind` selects only from a build-time list. A lint ban is discipline, not a boundary, and an in-tree render error propagates; neither the ADR nor the spec mentions an error boundary.

## 9. Declarative models

Adaptive Cards: [`supportsInteractivity: false` forbids actions and inputs; unknown types "MUST BE DROPPED"; a newer `version` returns `fallbackText`; hosts may register custom elements](https://learn.microsoft.com/en-gb/adaptive-cards/rendering-cards/implement-a-renderer). Portability failed at actions: ["this led to fragmentation"](https://learn.microsoft.com/en-us/adaptive-cards/authoring-cards/universal-action-model). Block Kit: [block caps, and blocks valid only on some surfaces](https://docs.slack.dev/block-kit/). Given up: pixels, in-place editing. Right for the rail, wrong for the rect.

## 10. Read-only hosting

Three answers. **Separate artefact:** OpenDoc [viewers register as "viewers and not full editors"](https://discmaster.textfiles.com/file/32775/Dev.CD%20Jun%2098%20RL2.toast/Technical%20Documentation/Technical%20Publications/mac/ODProgGuide/ODProgGuide-74.html?html=true). **Verb or aspect:** `DoVerb` [playback without editing](https://learn.microsoft.com/en-us/windows/win32/api/oleidl/nf-oleidl-ioleobject-doverb), and [`DVASPECT` content, thumbnail, icon, docprint](https://learn.microsoft.com/en-us/windows/win32/api/wtypes/ne-wtypes-dvaspect). **Capability:** `supportsInteractivity`, our model. [reveal.js plugins](https://revealjs.com/creating-plugins/) and [Slidev layouts](https://sli.dev/guide/write-layout) document no authoring side.

## Where this family disagrees with our design

1. **`claim` bundles what OpenDoc split.** Keyboard and whole-rect pointer move together; OpenDoc held foci separately so one could be requested without the others.
2. **Our nesting direction differs.** "An outer cannot release while an inner runs"; OLE's container deactivates the inner on an outside click. MFC's omission suggests this is the riskiest code; the spec already orders Space last.
3. **A capability says what is withheld, not what to draw.** `DVASPECT` names a rendering purpose without naming a host. Commit `1cc4f3af` shows the pressure: Markdown drops a repeated heading "as the Stage does". A Stage-specific drawing need has no route under "not told which surface".
4. **Never-asks is stricter than all precedent, and just regressed in practice.** `1cc4f3af` added `opensToFit` because Open at Closed Size gave "two cramped lines"; ADR 0142 retires that. A hint the canvas may ignore keeps the veto.
5. **Refusal strains against the ADR's own reach.** "Written outside this repository" means aggregates can outlive a plugin list. OLE and OpenDoc degraded per part.
6. **No containment.** Iframes get it free; ours needs a stated boundary per surface.

## Worth copying

- OpenDoc's **"Don't ask twice!"** as a rule for any future size hint.
- **Used shape:** a plugin reports its occupied region (Ur's outline) with no geometry request.
- A **last-resort plugin** in place of whole-aggregate refusal, if plugins ever leave the repo: frame, kind name, bytes untouched.
- OpenDoc's **two-stage transfer** for `exclusively`: ask every holder, then commit or abort.
- An **explicit rule for command ownership under nesting**, written before Space moves.
