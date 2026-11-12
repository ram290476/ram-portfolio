(function () {
  var toggle = document.querySelector(".menu-toggle");
  var sidebar = document.getElementById("sidebar");
  var backdrop = document.querySelector(".backdrop");
  if (!toggle || !sidebar || !backdrop) return;

  function setOpen(open) {
    sidebar.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    backdrop.hidden = !open;
    if (open) {
      var first = sidebar.querySelector("a");
      if (first) first.focus();
    }
  }

  toggle.addEventListener("click", function () {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
  backdrop.addEventListener("click", function () {
    setOpen(false);
    toggle.focus();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
      toggle.focus();
    }
  });
  sidebar.querySelectorAll("a, [data-chat-open]").forEach(function (item) {
    item.addEventListener("click", function () {
      if (window.matchMedia("(max-width: 860px)").matches) setOpen(false);
    });
  });

  var links = Array.prototype.slice.call(document.querySelectorAll(".nav a"));
  var sections = links.map(function (link) {
    return document.querySelector(link.getAttribute("href"));
  }).filter(Boolean);

  function setCurrent(id) {
    links.forEach(function (link) {
      if (link.getAttribute("href") === "#" + id) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
  }

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      var visible = entries.filter(function (entry) { return entry.isIntersecting; });
      if (!visible.length) return;
      visible.sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; });
      setCurrent(visible[0].target.id);
    }, { rootMargin: "-20% 0px -55% 0px", threshold: [0.15, 0.4] });
    sections.forEach(function (section) { observer.observe(section); });
  }
})();

(function () {
  function redirectBookHash() {
    if (location.hash !== "#book") return;
    if (history.replaceState) history.replaceState(null, "", "#contact");
    else location.hash = "contact";
    var contact = document.getElementById("contact");
    if (contact) contact.scrollIntoView();
  }
  window.addEventListener("hashchange", redirectBookHash);
  redirectBookHash();
})();

(function () {
  var panel = document.querySelector(".contact-panel");
  var group = document.querySelector(".contact-layout-switch");
  if (!panel || !group) return;
  var buttons = Array.prototype.slice.call(group.querySelectorAll("[data-contact-layout]"));
  if (!buttons.length) return;

  function setLayout(layout) {
    if (layout !== "a" && layout !== "b" && layout !== "c") layout = "a";
    panel.setAttribute("data-contact-layout", layout);
    buttons.forEach(function (btn) {
      var on = btn.getAttribute("data-contact-layout") === layout;
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
    });
  }

  buttons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setLayout(btn.getAttribute("data-contact-layout"));
    });
    btn.addEventListener("keydown", function (event) {
      var dir = 0;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") dir = 1;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") dir = -1;
      if (!dir) return;
      event.preventDefault();
      var next = buttons[(buttons.indexOf(btn) + dir + buttons.length) % buttons.length];
      setLayout(next.getAttribute("data-contact-layout"));
      next.focus();
    });
  });

  setLayout(panel.getAttribute("data-contact-layout") || "a");
})();
