# Architecture

How the product is built, as decided in DECISIONS.md (stage 5). It describes
the shape, not the code: there is no code yet. When the code and this file
disagree, the code is wrong or this file is out of date; say which in
DECISIONS.md.

## Overview

<The system in a few sentences, and a diagram when it helps:>

```
<client> ──▶ <service> ──▶ <store>
```

## Modules

| Module | Responsibility | Depends on | Owns the data |
| --- | --- | --- | --- |
| <name> | <what it does, in one line> | <modules> | <entities> |

## Data

<The entities, their fields that matter, how they relate, where they live,
what must never be lost. Retention and privacy (RESEARCH.md, legal).>

| Entity | Key fields | Lives in | Notes |
| --- | --- | --- | --- |
| <name> | <…> | <…> | <…> |

## Main flows

### <Flow name, e.g. "The user records an expense">

1. <Step: who does what, which module, which data.>
2. <…>

Failure: <what happens when it goes wrong, and what the user sees>.

## Testing

<What is tested at which level (unit, integration, end to end), and the first
test that must pass at setup (stage 8).>

## Open points

- <What is still to decide, and the stage or slice that decides it.>
