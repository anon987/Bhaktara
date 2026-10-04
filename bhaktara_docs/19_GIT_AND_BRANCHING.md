# Git and Claude Code Workflow

## Branches

-   main: production
-   develop: integration
-   feature/\*
-   fix/\*
-   chore/\*

## Commit style

Use:

``` text
feat: add daily challenge screen
fix: prevent duplicate XP rewards
refactor: extract content repository
docs: update Firestore schema
test: add streak edge cases
```

## Pull request checklist

-   summary
-   screenshots for UI changes
-   tests
-   analytics changes
-   Firestore/security changes
-   migration notes
-   rollback notes if needed

## Claude Code operating rules

Before coding: - inspect repository - inspect package.json - inspect
Firebase configuration - inspect existing navigation - inspect current
feature patterns

When changing schema: - update `06_FIRESTORE_SCHEMA.md` - update
security rules - update repositories/types - update relevant Cloud
Functions

When adding a feature: - update PRD/scope if it changes requirements -
define analytics - define loading/error states - define admin controls
if content/config driven

Never silently change product behavior that conflicts with these docs.
