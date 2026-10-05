// The admin app's single entry point into the shared domain rules. The Cloud
// Functions enforce the same code, so the UI explains exactly what the server
// will accept; the server is still the authority on every write.
export * from "../../src/domain/cms";
export {
  applicableChecks,
  checkLabels,
  sacredTypes,
  type CheckItem,
} from "../../src/domain/checklist";
export { contentTypes, type ContentType } from "../../src/domain/models";
export {
  mediaVariantNames,
  type MediaVariant,
  type MediaVariantName,
} from "../../src/domain/media";
