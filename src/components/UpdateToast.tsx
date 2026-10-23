import { createPortal } from "react-dom";

/** The update toast: stays up (no timer, no swipe away) until Refresh loads the new build. */
export function UpdateToast() {
  return createPortal(
    <div className="toast update-toast" role="status">
      <span>Source has an update.</span>
      <button type="button" className="btn btn-sm btn-primary update-toast-go" onClick={() => location.reload()}>Refresh</button>
    </div>,
    document.body,
  );
}
