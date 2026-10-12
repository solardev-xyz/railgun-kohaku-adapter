/* global document, navigator, IntersectionObserver */
"use strict";

const copyStatus = document.querySelector(".copy-status");
if (navigator.clipboard?.writeText && copyStatus) {
  for (const button of document.querySelectorAll("[data-copy]")) {
    const target = document.getElementById(button.dataset.copy);
    if (!target) continue;
    button.hidden = false;
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(target.textContent);
        copyStatus.textContent = "Code copied to clipboard.";
        button.textContent = "Copied";
      } catch {
        copyStatus.textContent = "Copy unavailable. Select the code to copy manually.";
        button.textContent = "Select text";
      }
    });
  }
}

const contentsLinks = [...document.querySelectorAll(".sidebar nav a")];
if (typeof IntersectionObserver !== "undefined") {
  const observer = new IntersectionObserver((entries) => {
    const current = entries.find((entry) => entry.isIntersecting);
    if (!current) return;
    for (const link of contentsLinks) {
      if (link.hash === "#" + current.target.id) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }, { rootMargin: "-10% 0px -65% 0px" });
  for (const section of document.querySelectorAll("main > section")) observer.observe(section);
}
