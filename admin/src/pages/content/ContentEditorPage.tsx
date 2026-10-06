import { ContentEditor } from "../../content/ContentEditor";
import type { ContentType } from "../../domain";

// The content editor (D-036 workflow, doc 12 §5 checklist, media pipeline)
// predates panel v2; it keeps its tested form and gets the v2 look.
export function ContentEditorPage({ id, type }: { id?: string; type?: ContentType }) {
  return (
    <div className="legacy">
      <ContentEditor id={id} type={type} />
    </div>
  );
}
