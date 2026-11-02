/* Full screen button in the header (both pages).
   Hidden where the browser can't go full screen (e.g. iPhone Safari). */
(function () {
  const btn = document.getElementById("btn-full");
  if (!btn) return;
  const root = document.documentElement;
  const enter = root.requestFullscreen || root.webkitRequestFullscreen;
  const leave = document.exitFullscreen || document.webkitExitFullscreen;
  if (!enter || !leave || !(document.fullscreenEnabled || document.webkitFullscreenEnabled)) { btn.hidden = true; return; }
  const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const sync = () => {
    const f = isFull();
    const label = f ? "Exit full screen" : "Full screen";
    btn.querySelector(".fs-txt").textContent = label;   // on phones only the icon shows
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.setAttribute("aria-pressed", String(f));
  };
  btn.addEventListener("click", () => {
    const p = isFull() ? leave.call(document) : enter.call(root);
    if (p && p.catch) p.catch(() => {});
  });
  document.addEventListener("fullscreenchange", sync);
  document.addEventListener("webkitfullscreenchange", sync);
  btn.hidden = false;
  sync();
})();
