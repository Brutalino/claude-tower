---
name: triage
description: Turns one piece of feedback for {{PROJECT}}, chosen by the user, into a {{TICKET}}. A bug becomes a ticket ready for start-ticket; a request for something new is checked against the repository's rules first. It creates the ticket only after an explicit yes. Use when the user asks to read or triage feedback.
---

# Triage

Talk to the user in {{TALK_LANGUAGE}}; the ticket is in {{PUBLISH_LANGUAGE}}. Runs in the main checkout; it changes no code.

## 1. One piece of feedback

The feedback comes from {{FEEDBACK_SOURCE}}. Show what is there and let the user choose one. One per run.

## 2. Sort it

| It is | Then |
|---|---|
| A bug | Find what is known: when, where, how often. Look for a ticket that already covers it; when there is one, propose a comment on it instead |
| A request for something new or different | Check it against the rules below, say in two sentences whether it fits, and wait for the user's decision: build it, not now, or no. Only "build it" gets a ticket |

{{RULES}}

## 3. Create it after a yes

Write the ticket as `new-ticket` does: title, body, label ({{TICKET_LABELS}}). Show it and wait for an explicit yes. Then create it with {{TICKET_CREATE}}.

## Hard rules

- Never create a ticket without an explicit yes. Never copy a person's name, email or screenshot into the ticket.
