/* global document, navigator */
"use strict";

function enhancePanels(links, panels, attribute) {
  function select(id) {
    for (const panel of panels) panel.hidden = panel.id !== id;
    for (const link of links) {
      const selected = link.getAttribute(attribute) === id;
      link.classList.toggle("selected", selected);
      if (selected) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
  }
  for (const link of links) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const id = link.getAttribute(attribute);
      select(id);
      document.defaultView.history.replaceState(null, "", `#${id}`);
    });
  }
  const hash = document.location.hash.slice(1);
  select(panels.some((panel) => panel.id === hash) ? hash : panels[0].id);
  return select;
}

const selectStep = enhancePanels(
  [...document.querySelectorAll("[data-step]")],
  [...document.querySelectorAll(".step-panel")],
  "data-step",
);
const selectStart = enhancePanels(
  [...document.querySelectorAll("[data-start]")],
  [...document.querySelectorAll(".start-panel")],
  "data-start",
);
document.defaultView.addEventListener("hashchange", () => {
  const id = document.location.hash.slice(1);
  if ([...document.querySelectorAll(".step-panel")].some((panel) => panel.id === id)) selectStep(id);
  if ([...document.querySelectorAll(".start-panel")].some((panel) => panel.id === id)) selectStart(id);
});

document.querySelector(".evidence-filter").hidden = false;
for (const button of document.querySelectorAll("[data-filter]")) {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;
    let shown = 0;
    for (const row of document.querySelectorAll("[data-evidence]")) {
      row.hidden = filter !== "all" && row.dataset.evidence !== filter;
      if (!row.hidden) shown += 1;
    }
    for (const peer of document.querySelectorAll("[data-filter]")) {
      peer.setAttribute("aria-pressed", String(peer === button));
    }
    document.querySelector(".evidence-empty").textContent = `${shown} evidence ${shown === 1 ? "record" : "records"} shown.`;
  });
}

if (navigator.clipboard?.writeText) {
  for (const button of document.querySelectorAll("[data-copy]")) {
    button.hidden = false;
    button.addEventListener("click", async () => {
      const status = document.querySelector(".copy-status");
      try {
        await navigator.clipboard.writeText(document.getElementById(button.dataset.copy).textContent);
        status.textContent = "Commands copied to clipboard.";
        button.textContent = "Copied ✓";
      } catch {
        status.textContent = "Copy unavailable. Select the commands to copy them manually.";
        button.textContent = "Select text";
      }
    });
  }
}
