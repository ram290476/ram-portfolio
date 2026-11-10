(function () {
  "use strict";
  var openBtn = document.getElementById("wordcloud-open");
  var dialog = document.getElementById("wordcloud-dialog");
  var list = document.getElementById("wordcloud-list");
  if (!openBtn || !dialog || !list || typeof dialog.showModal !== "function") return;

  // Every keyword chip on the page: the Skills grid, each role's skill chips and project tags.
  function collect() {
    var counts = new Map();
    document.querySelectorAll("main .pills li, .pills li").forEach(function (li) {
      if (li.closest("#wordcloud-dialog")) return;
      var word = li.textContent.replace(/\s+/g, " ").trim();
      if (!word || word.length > 40) return;
      var key = word.toLowerCase();
      var entry = counts.get(key);
      if (entry) entry.n += 1; else counts.set(key, { word: word, n: 1 });
    });
    return Array.from(counts.values());
  }

  // Stable pseudo-random order so the cloud looks scattered but never reshuffles between opens.
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function render() {
    var words = collect();
    if (!words.length) return;
    var max = Math.max.apply(null, words.map(function (w) { return w.n; }));
    words.sort(function (a, b) { return hash(a.word) - hash(b.word); });
    list.textContent = "";
    words.forEach(function (w) {
      var li = document.createElement("li");
      var t = max > 1 ? (w.n - 1) / (max - 1) : 0;
      li.style.fontSize = ((13 + Math.round(Math.sqrt(t) * 25)) / 16) + "rem";
      li.className = "wc-t" + (t >= 0.6 ? 3 : t >= 0.3 ? 2 : t > 0 ? 1 : 0);
      li.textContent = w.word;
      li.title = w.word + " appears " + w.n + (w.n === 1 ? " time" : " times");
      list.appendChild(li);
    });
  }

  openBtn.hidden = false;
  openBtn.addEventListener("click", function () {
    render();
    dialog.showModal();
    openBtn.setAttribute("aria-expanded", "true");
  });
  function focusable() {
    return Array.prototype.slice.call(dialog.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")).filter(function (el) {
      return !el.disabled && el.tabIndex !== -1 && !el.hidden;
    });
  }
  dialog.querySelector(".wc-close").addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("click", function (e) { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("keydown", function (event) {
    if (event.key !== "Tab") return;
    var items = focusable();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  dialog.addEventListener("close", function () { openBtn.setAttribute("aria-expanded", "false"); openBtn.focus(); });
})();
