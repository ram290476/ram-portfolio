(function () {
  function bindToggles(selector, closedLabel, openLabel, countFromList) {
    document.querySelectorAll(selector).forEach(function (button) {
      var list = document.getElementById(button.getAttribute("aria-controls"));
      if (!list) return;
      var total = list.querySelectorAll("li").length;
      function setOpen(open) {
        list.classList.toggle("is-open", open);
        button.setAttribute("aria-expanded", open ? "true" : "false");
        if (countFromList) {
          button.textContent = open ? openLabel : closedLabel + " " + total;
        } else {
          button.textContent = open ? openLabel : closedLabel;
        }
      }
      button.addEventListener("click", function () {
        setOpen(button.getAttribute("aria-expanded") !== "true");
      });
    });
  }

  bindToggles(".exp-skill-toggle", "Show all", "Show fewer", true);
  bindToggles(".exp-resp-toggle", "Show more", "Show less", false);

  var EXP_LIST_LIMIT = 3;

  function initExpListCollapse(listId) {
    var list = document.getElementById(listId);
    if (!list) return;
    var cards = Array.prototype.slice.call(list.querySelectorAll(":scope > .cred-card"));
    var dates = Array.prototype.slice.call(list.querySelectorAll(":scope > .exp-date"));
    var bodies = Array.prototype.slice.call(list.querySelectorAll(":scope > .exp-body"));
    if (cards.length) {
      if (cards.length <= EXP_LIST_LIMIT) return;
      for (var i = EXP_LIST_LIMIT; i < cards.length; i += 1) {
        cards[i].classList.add("exp-more");
      }
    } else {
      if (dates.length !== bodies.length) return;
      if (dates.length <= EXP_LIST_LIMIT) return;
      for (var i = EXP_LIST_LIMIT; i < dates.length; i += 1) {
        dates[i].classList.add("exp-more");
        bodies[i].classList.add("exp-more");
      }
    }
    var button = document.createElement("button");
    button.type = "button";
    button.className = "exp-list-toggle";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", listId);
    button.textContent = "Show more";
    list.appendChild(button);
    button.addEventListener("click", function () {
      var open = button.getAttribute("aria-expanded") !== "true";
      list.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.textContent = open ? "Show less" : "Show more";
    });
  }

  initExpListCollapse("cert-exp");
  initExpListCollapse("training-exp");
})();
