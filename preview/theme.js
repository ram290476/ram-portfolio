(function () {
  "use strict";
  var root = document.documentElement;
  var picker = document.querySelector(".theme-picker");
  if (!picker) return;
  var toggle = picker.querySelector(".theme-toggle");
  var menu = picker.querySelector(".theme-menu");
  if (!toggle || !menu) return;
  var items = Array.prototype.slice.call(menu.querySelectorAll("[data-theme-value]"));
  var closeBtn = picker.querySelector("[data-theme-close]");
  var allowed = { editorial: 1, midnight: 1, minimal: 1, gradient: 1, glass: 1, contrast: 1 };
  var fonts = {
    editorial: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,560&family=Inter:wght@400;500;600&family=Playfair+Display:ital,wght@0,600;1,500&display=swap",
    midnight: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@600;700&display=swap",
    minimal: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&display=swap",
    gradient: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap",
    glass: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@500;600;700&display=swap",
    contrast: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap"
  };
  var themeColor = {
    editorial: "#f7f3ec",
    midnight: "#070b1a",
    minimal: "#0d1117",
    gradient: "#0a0f2c",
    glass: "#0b1026",
    contrast: "#000000"
  };

  function current() {
    var theme = root.getAttribute("data-theme");
    return allowed[theme] ? theme : "editorial";
  }

  function mark() {
    var theme = current();
    items.forEach(function (btn) {
      btn.setAttribute("aria-checked", btn.getAttribute("data-theme-value") === theme ? "true" : "false");
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", themeColor[theme]);
  }

  function ensureFonts(theme) {
    var href = fonts[theme];
    var link = document.getElementById("theme-fonts");
    if (!href) return;
    if (!link) {
      link = document.createElement("link");
      link.id = "theme-fonts";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
  }

  function place() {
    menu.style.left = "0px";
    menu.style.right = "auto";
    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      menu.style.left = "auto";
      menu.style.right = "0px";
    }
  }

  function openMenu() {
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    place();
    var selected = null;
    items.forEach(function (btn) {
      if (!selected && btn.getAttribute("aria-checked") === "true") selected = btn;
    });
    (selected || items[0]).focus();
  }

  function closeMenu(focusToggle) {
    if (menu.hidden) return;
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    menu.style.left = "";
    menu.style.right = "";
    if (focusToggle) toggle.focus();
  }

  function apply(theme) {
    if (!allowed[theme]) return;
    root.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch (e) {}
    ensureFonts(theme);
    mark();
  }

  toggle.addEventListener("click", function () {
    if (menu.hidden) openMenu();
    else closeMenu(true);
  });
  if (closeBtn) {
    closeBtn.addEventListener("click", function (event) {
      event.preventDefault();
      closeMenu(true);
    });
  }
  items.forEach(function (btn) {
    btn.addEventListener("click", function () {
      apply(btn.getAttribute("data-theme-value"));
      closeMenu(true);
    });
  });
  menu.addEventListener("keydown", function (event) {
    var index = items.indexOf(document.activeElement);
    var next = null;
    if (event.key === "ArrowDown") next = index < 0 ? 0 : (index + 1) % items.length;
    else if (event.key === "ArrowUp") next = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (next == null) return;
    event.preventDefault();
    items[next].focus();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape" || menu.hidden) return;
    event.preventDefault();
    closeMenu(true);
  });
  document.addEventListener("pointerdown", function (event) {
    if (menu.hidden || picker.contains(event.target)) return;
    closeMenu(false);
    // Focus the toggle after the outside click finishes, so it isn't stolen.
    setTimeout(function () {
      if (menu.hidden) toggle.focus();
    }, 0);
  });
  picker.addEventListener("focusout", function (event) {
    if (picker.contains(event.relatedTarget)) return;
    requestAnimationFrame(function () {
      if (menu.hidden || picker.contains(document.activeElement)) return;
      closeMenu(true);
    });
  });
  window.addEventListener("resize", function () {
    if (!menu.hidden) place();
  });
  mark();
  ensureFonts(current());
})();
