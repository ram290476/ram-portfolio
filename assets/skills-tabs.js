// Skills section tabs: Heatmap, Category, and Word cloud.
// Automatic activation, roving tabindex, Arrow/Home/End keys.
(function () {
  "use strict";
  var root = document.querySelector("[data-skills-tabs]");
  if (!root) return;
  var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
  var panels = tabs.map(function (tab) {
    return document.getElementById(tab.getAttribute("aria-controls"));
  });
  if (!tabs.length || panels.some(function (panel) { return !panel; })) return;

  function select(tab, moveFocus) {
    tabs.forEach(function (item, i) {
      var on = item === tab;
      item.setAttribute("aria-selected", on ? "true" : "false");
      item.tabIndex = on ? 0 : -1;
      if (on) panels[i].removeAttribute("hidden");
      else panels[i].setAttribute("hidden", "");
    });
    if (moveFocus) tab.focus();
    tab.dispatchEvent(new CustomEvent("skills-tab-selected", { bubbles: true }));
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { select(tab, false); });
    tab.addEventListener("keydown", function (event) {
      var next = -1;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (i + 1) % tabs.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (i - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      if (next < 0) return;
      event.preventDefault();
      select(tabs[next], true);
    });
  });

  var initial = tabs.find(function (tab) { return tab.getAttribute("aria-selected") === "true"; }) || tabs[0];
  select(initial, false);
})();
