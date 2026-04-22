const tabButtons = Array.from(document.querySelectorAll("[data-preview-tab]"));
const tabPanels = Array.from(document.querySelectorAll("[data-preview-panel]"));

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.previewTab;

    tabButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", active ? "true" : "false");
    });

    tabPanels.forEach((panel) => {
      const active = panel.dataset.previewPanel === target;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
  });
});
