---
name: release
description: Ships what is merged on {{BASE_BRANCH}} of {{PROJECT}}. Shows the user what changed since the last release, runs the whole suite, makes the release ({{RELEASE_HOW}}), tags it {{RELEASE_TAG}} and notes the release on each shipped ticket. Use when the user asks for a release.
---

# Release

Talk to the user in {{TALK_LANGUAGE}}. Runs in the main checkout, on `{{BASE_BRANCH}}`.

## 1. What ships

```sh
git fetch origin --tags
git log --oneline <the last {{RELEASE_TAG_PREFIX}}* tag>..origin/{{BASE_BRANCH}}
```

The last release is the newest `{{RELEASE_TAG}}` tag (`git tag --list '{{RELEASE_TAG_PREFIX}}*' --sort=-creatordate`); before the first one, the whole history. List the merged pull requests and their tickets.

## 2. Ask

Show the list and what the release does. Wait for a yes. It covers the suite, the release and the tag.

## 3. The whole suite

Run `{{FULL_SUITE}}` on `{{BASE_BRANCH}}`. Stop on any failure: the failure becomes a ticket, nothing ships.

## 4. Release and tag

Make the release: {{RELEASE_HOW}}. Then:

```sh
git tag {{RELEASE_TAG}}
git push origin {{RELEASE_TAG}}
```

`<n>` is one more than the last release's number, else 1.

## 5. Notes

On each shipped ticket, a comment with the release ({{TICKET_COMMENT}}), in {{PUBLISH_LANGUAGE}}.

## Hard rules

- Release only what is merged on `{{BASE_BRANCH}}`. Merge nothing here.
- Nothing ships without the user's yes and a green suite.
