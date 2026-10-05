import { ContentEditor } from "../../content/ContentEditor";

// The content editor (D-036 workflow, doc 12 §5 checklist, media pipeline)
// predates panel v2; it keeps its tested form and gets the v2 look.
export function ContentEditorPage({ id }: { id?: string }) {
  return (
    <div className="legacy">
      <ContentEditor id={id} />
    </div>
  );
}
