(function () {
  "use strict";
  var list = document.getElementById("wordcloud-list");
  if (!list) return;

  // Every keyword chip on the page: the Skills grid, each role's skill chips and project tags.
  function collect() {
    var counts = new Map();
    document.querySelectorAll("main .pills li, .pills li").forEach(function (li) {
      if (li.closest("#wordcloud-list")) return;
      var word = li.textContent.replace(/\s+/g, " ").trim();
      if (!word || word.length > 40) return;
      var key = word.toLowerCase();
      var entry = counts.get(key);
      if (entry) entry.n += 1; else counts.set(key, { word: word, n: 1 });
    });
    return Array.from(counts.values());
  }

  // Stable pseudo-random order so the cloud looks scattered but never reshuffles between visits.
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
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "skill-ask";
      btn.textContent = w.word;
      btn.setAttribute("data-chat-prefill", "What is his experience with " + w.word + "?");
      btn.setAttribute("aria-label", "Ask Ram about " + w.word);
      btn.title = w.word + " appears " + w.n + (w.n === 1 ? " time" : " times");
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  render();
})();
