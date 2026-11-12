(function () {
  "use strict";
  var root = document.documentElement;
  var dec = document.getElementById("font-decrease");
  var inc = document.getElementById("font-increase");
  if (!dec || !inc) return;
  var status = document.getElementById("font-size-status");
  var steps = ["87.5", "100", "112.5", "125", "137.5", "150"];

  function indexOfScale() {
    var index = steps.indexOf(root.getAttribute("data-font-scale"));
    return index === -1 ? steps.indexOf("100") : index;
  }

  function apply(index, announce) {
    if (index < 0) index = 0;
    if (index > steps.length - 1) index = steps.length - 1;
    var value = steps[index];
    root.setAttribute("data-font-scale", value);
    try { localStorage.setItem("ram-portfolio-font-scale-v1", value); } catch (e) {}
    dec.disabled = index === 0;
    inc.disabled = index === steps.length - 1;
    if (announce && status) status.textContent = "Font size " + value + "%";
  }

  function onKey(event) {
    var next = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = inc;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = dec;
    else if (event.key === "Home") next = dec;
    else if (event.key === "End") next = inc;
    else return;
    if (next.disabled) return;
    event.preventDefault();
    next.focus();
  }

  dec.addEventListener("click", function () { apply(indexOfScale() - 1, true); });
  inc.addEventListener("click", function () { apply(indexOfScale() + 1, true); });
  dec.addEventListener("keydown", onKey);
  inc.addEventListener("keydown", onKey);
  apply(indexOfScale(), false);
})();
