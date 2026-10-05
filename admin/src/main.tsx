import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { describeEnvironment, readConfig } from "./config";
import { createFirebase } from "./firebase";
import "./index.css";

const root = createRoot(document.getElementById("root")!);

try {
  const config = readConfig(import.meta.env);
  const services = createFirebase(config);
  root.render(
    <StrictMode>
      <App services={services} environment={describeEnvironment(config)} />
    </StrictMode>,
  );
} catch (error) {
  root.render(
    <main className="gate">
      <div className="gate-card" role="alert">
        <h1>Configuration problem</h1>
        <p>{error instanceof Error ? error.message : String(error)}</p>
        <p>See docs/ADMIN_CMS.md for the admin app settings.</p>
      </div>
    </main>,
  );
}
