// Standalone print helpers — independent from page CSS (works in every browser, light/dark/mobile).
export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const printHtmlInIframe = (html: string) => {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
  frame.srcdoc = html;
  frame.onload = () => {
    const win = frame.contentWindow;
    window.setTimeout(() => {
      try {
        if (!win) throw new Error("no iframe window");
        win.focus();
        win.print();
      } catch {
        window.print(); // fallback
      }
      window.setTimeout(() => frame.remove(), 60000);
    }, 250);
  };
  document.body.appendChild(frame);
};
