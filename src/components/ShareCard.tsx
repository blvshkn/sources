import { useEffect, useRef, useState } from "react";
import { DetailSheet } from "./DetailSheet";
import { Icon, type IconName } from "./ui";

/** True when this browser can hand a PNG file to the native share sheet (iOS, Android, some desktop Safari and Edge). */
export function canShareFile(file: File | null): file is File {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!file || typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try { return nav.canShare({ files: [file] }); } catch { return false; }
}

/** Copying an image needs ClipboardItem and a PNG-capable clipboard. Firefox and older Safari say no. */
export const canCopyImage = () => {
  if (typeof ClipboardItem === "undefined" || typeof navigator.clipboard?.write !== "function") return false;
  const supports = (ClipboardItem as unknown as { supports?: (t: string) => boolean }).supports;
  return typeof supports === "function" ? supports("image/png") : true;
};
/** sms: links only make sense where there's a phone app to catch them */
const isTouch = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

type Act = "save" | "img" | "msg" | "mail" | "sms";

/**
 * Our own share view for browsers that can't share a file natively (most desktop browsers). Built on DetailSheet:
 * a centered modal from 768px up and a bottom sheet below, with pull to dismiss, Escape and Back to close.
 * Email and text only carry the message, so the note under the card says to save the image to attach it.
 */
export function ShareCard({ url, blob, fileName, text, subject, alt, onToast, onClose, onShared }: {
  url: string; blob: Blob; fileName: string; text: string; subject: string; alt: string;
  onToast: (msg: string) => void; onClose: () => void;
  /** Any action that sends the offer on its way: saves it to Sent offers */
  onShared?: (via: string) => void;
}) {
  const [done, setDone] = useState<Act | null>(null);
  const [said, setSaid] = useState("");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const flash = (a: Act, msg: string) => {
    window.clearTimeout(timer.current);
    setDone(a); setSaid(msg);
    timer.current = window.setTimeout(() => setDone(null), 1800);
  };

  const save = () => {
    const a = document.createElement("a");
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    flash("save", "Image saved");
    onShared?.("saved image");
  };
  const copyImage = async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); flash("img", "Image copied"); onShared?.("copied image"); }
    catch { onToast("Couldn't copy the image. Save it instead."); }
  };
  const copyMessage = async () => {
    try { await navigator.clipboard.writeText(text); flash("msg", "Message copied"); onShared?.("copied"); }
    catch { onToast("Couldn't copy the message. Select it in the box and copy it."); }
  };
  const touch = isTouch();
  const mail = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  const sms = `sms:?&body=${encodeURIComponent(text)}`;

  // A render function, not a component: a component defined in here would remount on every state change and drop focus
  const btn = (act: Act, icon: IconName, label: string, doneLabel: string, onClick: () => void, primary = false) => (
    <button type="button" className={`shr-act${primary ? " shr-primary" : ""}${done === act ? " is-done" : ""}`} onClick={onClick}>
      <Icon name={done === act ? "check" : icon} size={18} /><span>{done === act ? doneLabel : label}</span>
    </button>
  );

  return (
    <DetailSheet className="shr-sheet" title={<h2 className="ds-h">Share image</h2>} onClose={onClose}>
      <div className="shr-body">
        <figure className="shr-preview">
          <img src={url} alt={alt} />
        </figure>
        <div className="shr-acts">
          {btn("save", "download", "Save image", "Saved", save, true)}
          {canCopyImage() && btn("img", "image", "Copy image", "Copied", copyImage)}
          {btn("msg", "copy", "Copy message", "Copied", copyMessage)}
          <a className={`shr-act${done === "mail" ? " is-done" : ""}`} href={mail} onClick={() => { flash("mail", "Opening your email app"); onShared?.("email"); }}>
            <Icon name={done === "mail" ? "check" : "mail"} size={18} /><span>{done === "mail" ? "Opening email" : "Email"}</span>
          </a>
          {touch && (
            <a className={`shr-act${done === "sms" ? " is-done" : ""}`} href={sms} onClick={() => { flash("sms", "Opening Messages"); onShared?.("text"); }}>
              <Icon name={done === "sms" ? "check" : "msg"} size={18} /><span>{done === "sms" ? "Opening Messages" : "Text message"}</span>
            </a>
          )}
        </div>
        <p className="shr-note">{touch ? "Email and text send the message only." : "Email sends the message only."} Save the image to attach it.</p>
        <span className="sr-only" role="status" aria-live="polite">{said}</span>
      </div>
    </DetailSheet>
  );
}
