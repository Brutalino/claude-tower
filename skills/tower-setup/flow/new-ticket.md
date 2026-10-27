---
name: new-ticket
description: Writes one {{TICKET}} of {{PROJECT}} from something the user describes (a bug they saw, an idea, a follow-up) and creates it only after an explicit yes. Use when the user asks to open, write or file a ticket.
argument-hint: "<what the ticket is about>"
---

# New ticket

Talk to the user in {{TALK_LANGUAGE}}; the ticket is in {{PUBLISH_LANGUAGE}}. Runs in the main checkout; it changes no code and makes no worktree.

## 1. The request

Start from the arguments. When they are thin, ask the user for the original words, where it happens and what they expected. A request that goes against the repository's rules is said first:

{{RULES}}

## 2. Write it

- Title: what is wrong or what is wanted, in a few words.
- Body: the problem in the user's words, how to see it (a bug), what done means (acceptance), and what is out of scope.
- Label: {{TICKET_LABELS}}.

## 3. Create it after a yes

Show the title, the label and the whole body, and wait for an explicit yes. Then create it with {{TICKET_CREATE}}, and report its number and link. The next step is `start-ticket {{TICKET_ID}}`.

## Hard rules

- Never create a ticket without an explicit yes.
