import { AuditLog } from "../audit/AuditLog";

// Doc 09 §16: every admin change, newest first.
export function AuditPage() {
  return (
    <div className="legacy">
      <AuditLog />
    </div>
  );
}
