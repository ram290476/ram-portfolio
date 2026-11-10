(function () {
  document.querySelectorAll(".exp-skill-toggle").forEach(function (button) {
    var list = document.getElementById(button.getAttribute("aria-controls"));
    if (!list) return;
    var total = list.querySelectorAll("li").length;
    function setOpen(open) {
      list.classList.toggle("is-open", open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
      button.textContent = open ? "Show fewer" : "Show all " + total;
    }
    button.addEventListener("click", function () {
      setOpen(button.getAttribute("aria-expanded") !== "true");
    });
  });
})();
