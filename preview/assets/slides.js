(function () {
  const TOTAL = 6;
  const SLIDES = [
    {
      webp: "assets/slides/slide-1.webp",
      jpeg: "assets/slides/slide-1.jpg",
      alt: "Career arc: four eras over twenty years — ESP, Corsair Gaming, First Republic, and JPMorgan Chase — with six years in financial services. The common thread is a solo platform owner who coordinates contractors, vendors, and internal teams, production first."
    },
    {
      webp: "assets/slides/slide-2.webp",
      jpeg: "assets/slides/slide-2.jpg",
      alt: "Era 1, ESP, later acquired by IHS Markit, about seven years: application modernization in .NET (C#), moving older desktop business apps onto modern web apps. Takeaway: change working systems safely."
    },
    {
      webp: "assets/slides/slide-3.webp",
      jpeg: "assets/slides/slide-3.jpg",
      alt: "Era 2, Corsair Gaming, about seven years: live-store commerce migrations from Sitecore to Salesforce Commerce Cloud. Role progressed from Senior .NET Engineer to Lead Commerce Architect. Ram was the only on-site owner, with a remote contractor team and a marketing partner who owned the website."
    },
    {
      webp: "assets/slides/slide-4.webp",
      jpeg: "assets/slides/slide-4.jpg",
      alt: "Era 3, First Republic Bank, later acquired by JPMorgan Chase, about three years: Technical Lead, Platform, for the bank’s public website content platform on Azure. One platform owner in the middle of a vendor and internal teams."
    },
    {
      webp: "assets/slides/slide-5.webp",
      jpeg: "assets/slides/slide-5.jpg",
      alt: "Era 4, JPMorgan Chase, about three years: DevOps and SRE across several teams as Associate Software Engineer III, including an application observability stack, a private Kubernetes platform, and AWS applications such as an MLOps app and an anti-money-laundering app."
    },
    {
      webp: "assets/slides/slide-6.webp",
      jpeg: "assets/slides/slide-6.jpg",
      alt: "Era 4, JPMorgan Chase: reliability, security, and compliance on the platform and infrastructure side of production AWS environments. The final year moved mainly into MLOps. Keeping systems reliable in production is exactly the skill ML systems need."
    }
  ];

  const openBtn = document.querySelector("[data-slides-open]");
  const dialog = document.getElementById("slides-player");
  if (!openBtn || !dialog || typeof dialog.showModal !== "function") return;

  const source = dialog.querySelector("[data-slides-webp]");
  const image = dialog.querySelector("[data-slides-image]");
  const counter = dialog.querySelector("[data-slides-counter]");
  const prevBtn = dialog.querySelector("[data-slides-prev]");
  const nextBtn = dialog.querySelector("[data-slides-next]");
  const closeBtn = dialog.querySelector("[data-slides-close]");
  const fullBtn = dialog.querySelector("[data-slides-fullscreen]");
  const stage = dialog.querySelector("[data-slides-stage]");
  const shell = dialog.querySelector("[data-slides-shell]") || dialog;

  let index = 0;
  let opener = null;
  const preloaded = new Set();

  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function fsTarget() {
    return shell;
  }

  function isPlayerFullscreen() {
    const fs = fsElement();
    const el = fsTarget();
    return Boolean(fs && (fs === el || el.contains(fs) || (fs.contains && fs.contains(el))));
  }

  function requestFs(el) {
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    return fn ? fn.call(el) : Promise.reject(new Error("Fullscreen is not available"));
  }

  function exitFs() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    return fn ? fn.call(document) : Promise.resolve();
  }

  function canFullscreen() {
    const el = fsTarget();
    return Boolean(
      (document.fullscreenEnabled || document.webkitFullscreenEnabled) &&
      (el.requestFullscreen || el.webkitRequestFullscreen)
    );
  }

  function isOpen() {
    return dialog.open;
  }

  function preload(i) {
    if (i < 0 || i >= TOTAL || preloaded.has(i)) return;
    preloaded.add(i);
    const slide = SLIDES[i];
    const webp = new Image();
    webp.src = slide.webp;
    const jpeg = new Image();
    jpeg.src = slide.jpeg;
  }

  function render() {
    const slide = SLIDES[index];
    if (source) source.srcset = slide.webp;
    image.src = slide.jpeg;
    image.alt = slide.alt;
    image.width = 1920;
    image.height = 1081;
    counter.textContent = (index + 1) + " / " + TOTAL;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === TOTAL - 1;
    preload(index + 1);
    preload(index - 1);
  }

  function go(delta) {
    const next = index + delta;
    if (next < 0 || next >= TOTAL) return;
    index = next;
    render();
  }

  function focusable() {
    return [...dialog.querySelectorAll("button:not([disabled])")].filter(function (el) {
      return el.getClientRects().length > 0;
    });
  }

  function updateFullscreenButton() {
    if (!fullBtn) return;
    const on = isPlayerFullscreen();
    fullBtn.setAttribute("aria-pressed", on ? "true" : "false");
    fullBtn.textContent = on ? "Exit full screen" : "Full screen";
  }

  function open() {
    opener = document.activeElement;
    index = 0;
    render();
    dialog.showModal();
    openBtn.setAttribute("aria-expanded", "true");
    closeBtn.focus();
  }

  function close() {
    if (isPlayerFullscreen()) {
      Promise.resolve(exitFs()).catch(function () {});
    }
    if (dialog.open) dialog.close();
  }

  function onClosed() {
    openBtn.setAttribute("aria-expanded", "false");
    const target = opener && typeof opener.focus === "function" ? opener : openBtn;
    opener = null;
    target.focus();
  }

  openBtn.removeAttribute("hidden");
  openBtn.setAttribute("aria-expanded", "false");
  if (!canFullscreen() && fullBtn) fullBtn.hidden = true;
  updateFullscreenButton();

  openBtn.addEventListener("click", function (event) {
    event.preventDefault();
    open();
  });

  prevBtn.addEventListener("click", function () { go(-1); });
  nextBtn.addEventListener("click", function () { go(1); });
  closeBtn.addEventListener("click", close);

  if (fullBtn) {
    fullBtn.addEventListener("click", function () {
      var op = isPlayerFullscreen() ? exitFs() : requestFs(fsTarget());
      Promise.resolve(op).then(updateFullscreenButton, updateFullscreenButton);
    });
  }

  document.addEventListener("fullscreenchange", updateFullscreenButton);
  document.addEventListener("webkitfullscreenchange", updateFullscreenButton);

  dialog.addEventListener("close", onClosed);
  dialog.addEventListener("cancel", function (event) {
    event.preventDefault();
    close();
  });

  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) close();
  });

  dialog.addEventListener("keydown", function (event) {
    if (!isOpen()) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    } else if (event.key === "Home") {
      event.preventDefault();
      index = 0;
      render();
    } else if (event.key === "End") {
      event.preventDefault();
      index = TOTAL - 1;
      render();
    } else if (event.key === "Tab") {
      const items = focusable();
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === first || !dialog.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !dialog.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  let touchX = null;
  let touchY = null;
  if (stage) {
    stage.addEventListener("touchstart", function (event) {
      if (event.changedTouches.length !== 1) return;
      touchX = event.changedTouches[0].clientX;
      touchY = event.changedTouches[0].clientY;
    }, { passive: true });

    stage.addEventListener("touchend", function (event) {
      if (touchX == null || event.changedTouches.length !== 1) {
        touchX = touchY = null;
        return;
      }
      const dx = event.changedTouches[0].clientX - touchX;
      const dy = event.changedTouches[0].clientY - touchY;
      touchX = touchY = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      go(dx < 0 ? 1 : -1);
    }, { passive: true });
  }
})();
