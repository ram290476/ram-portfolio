(function () {
  var buttons = Array.prototype.slice.call(document.querySelectorAll(".company-btn"));
  if (!buttons.length) return;
  var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var current = null;

  function panelFor(button) {
    return document.getElementById(button.getAttribute("aria-controls"));
  }

  function close(returnFocus) {
    if (!current) return;
    var button = current;
    var panel = panelFor(button);
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.dataset.pinned = "false";
    current = null;
    if (returnFocus) button.focus();
  }

  function open(button, pin) {
    if (current && current !== button) close(false);
    var panel = panelFor(button);
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    button.dataset.pinned = pin ? "true" : "false";
    current = button;
    if (pin) {
      var closer = panel.querySelector(".info-close");
      if (closer) closer.focus();
    }
  }

  buttons.forEach(function (button) {
    var wrap = button.closest(".company");
    button.addEventListener("click", function () {
      if (current === button && button.dataset.pinned === "true") close(false);
      else open(button, true);
    });
    if (canHover && wrap) {
      wrap.addEventListener("pointerenter", function () {
        if (button.dataset.pinned === "true") return;
        open(button, false);
      });
      wrap.addEventListener("pointerleave", function () {
        if (button.dataset.pinned === "true") return;
        if (current === button) close(false);
      });
    }
    panelFor(button).querySelector(".info-close").addEventListener("click", function () {
      close(true);
    });
  });

  document.addEventListener("keydown", function (event) {
    if (!current) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key !== "Tab" || current.dataset.pinned !== "true") return;
    var panel = panelFor(current);
    var items = Array.prototype.slice.call(panel.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"));
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  });
  document.addEventListener("pointerdown", function (event) {
    if (!current) return;
    var wrap = current.closest(".company");
    if (wrap && wrap.contains(event.target)) return;
    var focusInside = panelFor(current).contains(document.activeElement);
    close(focusInside);
  });
})();
