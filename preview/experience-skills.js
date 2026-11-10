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
})();
