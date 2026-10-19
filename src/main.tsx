import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./desktop-tabs.css";
import "./desktop.css";
import "./landing-qa.css";
import "./app-qa.css";
import { monoNumbers } from "./monoNumbers";
import { chartReveal } from "./chartReveal";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

monoNumbers(document.getElementById("root")!);
chartReveal(document.getElementById("root")!);
