import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./desktop-tabs.css";
import "./desktop.css";
import "./landing-qa.css";
import "./app-qa.css";
import "./ideas-qa.css";
import "./trade-qa.css";
import "./states-qa.css";
import "./accounts.css";
import "./panel.css";
import "./startsit.css";
import "./select.css";
import "./signs.css";
import "./icon-motion.css";
import "./tooltip.css";
import "./standings.css";
import "./news.css";
import "./needs-list.css";
import "./waivers-kdef.css";
import "./inbox-toggle.css";
import { monoNumbers } from "./monoNumbers";
import { chartReveal } from "./chartReveal";
import { iconMotion } from "./components/icons";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

monoNumbers(document.getElementById("root")!);
chartReveal(document.getElementById("root")!);
iconMotion();
