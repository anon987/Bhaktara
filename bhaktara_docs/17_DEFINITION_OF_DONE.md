# Definition of Done

A feature is done when:

## Product

-   requirements are implemented
-   edge cases are handled
-   empty/error/loading states exist
-   analytics events are defined in doc 13
-   the decision log is updated if behaviour changed
-   accessibility reviewed

## Code

-   TypeScript passes
-   lint passes
-   tests pass
-   no obvious duplicated business logic
-   no secrets in source
-   no production debug logs
-   reusable components used where appropriate

## Backend

-   security rules reviewed
-   indexes created
-   Cloud Functions validated
-   idempotency handled for rewards/payments
-   monitoring enabled

## Content

-   metadata complete
-   thumbnails optimized
-   language checked
-   checklist in doc 12 §5 complete (the CMS blocks READY otherwise)
-   source text and AI tool/license recorded in contentPrivate
-   preview works

## Admin

-   feature is manageable from CMS where intended
-   role permissions verified
-   audit logging implemented for sensitive mutations

## Release

-   analytics verified
-   crash reporting verified
-   offline behavior verified
-   performance checked on representative Android devices
-   release notes prepared
