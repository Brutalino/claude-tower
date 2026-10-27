# <Project> documentation

This folder is the memory of the project. A new session (human or agent) reads
it before touching anything, so it knows what the product is, what has been
decided, and what is still open, without re-reading the whole history.

Reading order, and what each file is for:

| File | Read it when | Contents |
| --- | --- | --- |
| [IDEA.md](IDEA.md) | to know where it started | The raw idea in the owner's words, and the sharper version written after the research. |
| [RESEARCH.md](RESEARCH.md) | before questioning the product | The topic, existing products and their gaps, the users, technical and legal constraints. Every finding with its source; the open questions. |
| [PRODUCT.md](PRODUCT.md) | always, first | What the product is and is not, who it is for, why, what is deliberately out of scope. The scope check starts here. |
| [DECISIONS.md](DECISIONS.md) | always, second | Dated log of every decision taken with the owner, with the options and the reason. Overrides are appended, never edited in place. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | before writing code | Modules, data, the main flows. |
| [ROADMAP.md](ROADMAP.md) | before proposing or planning work | Milestones (dated when reached) and what is next, in order; the first slices sized as tickets. |

How to keep this folder alive:

- A decision taken in conversation is written to DECISIONS.md in the same
  session, with the date and the reason.
- A milestone reached or a plan changed is written to ROADMAP.md.
- Documents are in <language>; the conversation with the owner is in
  <language>.
