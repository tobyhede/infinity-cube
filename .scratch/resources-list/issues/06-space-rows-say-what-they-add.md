# 06: Rows sharing a Space's name say what each adds

**What to build:** In the Dock's Resources list, a Space Resource row draws the view it shows (its target Map's and Graph's titles) under its name and in its accessible description, and a Space row reads "New view" and is named "Add new view of <Space> to Map". Display only: nothing about what a press does changes.

**Why:** A Space Resource and the Space it shows carry one name, and two Space Resources showing one Space usually do too, so the list could draw several identical rows with nothing to say which adds what. A Space row press always authors a new Space Resource, which the row never said. Raised while reviewing PR #456 (case 6 of the Space row walkthrough); independent of #456's withholding rule.

**Blocked by:** None

**Status:** in-review

- [x] A Space Resource row names its view under its name and in its description, once its target has been read
- [x] A Space row reads "New view" and its accessible name says it adds a new view
- [x] A component test, a Ladle story with its parity claim, and an application spec tagged with that claim
