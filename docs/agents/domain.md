# Domain Docs

Use this guide when exploring domain behaviour or settling vocabulary. InfinityCube has one domain context across its packages.

## Before exploring, read these

1. Consult the relevant terms in [CONTEXT.md](../../CONTEXT.md).
2. Follow the [root task table](../../AGENTS.md#read-before-changing-an-area) to the owning requirement and check for applicable pending ADRs in the order it specifies.
3. Read an older ADR when the decision, its history or a rejected alternative matters. Use the [ADR index](../adr/README.md) to find it.

If a required source is missing, check the path, current revision and ADR index. Report any missing binding source before changing the affected behaviour. Record new terms and decisions when they settle, following [Workflow](workflow.md).

## Use the glossary's vocabulary

Use glossary terms in proposals, issue titles, tests and code. An `_Avoid_` line distinguishes terms that can be confused. Keep historical vocabulary in ADRs. Use [Workflow's naming rules](workflow.md#domain-vocabulary) for identifiers. Qualified `Routed*` terms such as `RoutedEdge` name graph-layout geometry.

## Flag ADR and requirement conflicts

If your output contradicts an accepted ADR or a requirement, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (layout/view separation) and the Maps and Graphs requirement that restates it — but worth reopening because…_

A requirement that disagrees with an accepted ADR is a defect in the requirement, never a reason to ignore the ADR: follow the ADR and report the requirement for correction. Changing what an accepted ADR decides takes a new ADR (see [`workflow.md`](workflow.md#when-to-write-an-adr)). Code is evidence of what is built; it does not retire an accepted rule.
