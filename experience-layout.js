// Experience layout B: company cards open one company's roles, a role opens its responsibilities.
// Only one company and one role are open at a time. Markup is static; without JS everything stays open.
(function () {
  "use strict";
  var cards = Array.prototype.slice.call(document.querySelectorAll(".xp-card"));
  if (!cards.length) return;
  var roleButtons = Array.prototype.slice.call(document.querySelectorAll(".xp-role"));

  function panelFor(button) {
    return document.getElementById(button.getAttribute("aria-controls"));
  }

  function setOpen(button, open) {
    button.setAttribute("aria-expanded", open ? "true" : "false");
    var panel = panelFor(button);
    if (panel) panel.classList.toggle("is-open", open);
  }

  function closeRoles(except) {
    roleButtons.forEach(function (b) { if (b !== except) setOpen(b, false); });
  }

  cards.forEach(function (card) {
    card.addEventListener("click", function () {
      var open = card.getAttribute("aria-expanded") !== "true";
      closeRoles(null);
      cards.forEach(function (c) { setOpen(c, c === card && open); });
    });
    card.addEventListener("keydown", function (event) {
      var i = cards.indexOf(card);
      var j = -1;
      if (event.key === "ArrowRight") j = (i + 1) % cards.length;
      else if (event.key === "ArrowLeft") j = (i - 1 + cards.length) % cards.length;
      else if (event.key === "Home") j = 0;
      else if (event.key === "End") j = cards.length - 1;
      if (j < 0) return;
      event.preventDefault();
      cards[j].focus();
      cards[j].scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  });

  roleButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var open = button.getAttribute("aria-expanded") !== "true";
      closeRoles(button);
      setOpen(button, open);
    });
  });

  document.documentElement.classList.add("xp-ready");
})();
