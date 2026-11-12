// Skills heatmap: skills by year, built from each Experience role's skill chips and month range.
(function () {
  "use strict";
  var openBtn = document.getElementById("heatmap-open");
  var dialog = document.getElementById("heatmap-dialog");
  var grid = document.getElementById("heatmap-grid");
  var toggle = document.getElementById("heatmap-toggle");
  var out = document.getElementById("heatmap-roles");
  if (!openBtn || !dialog || !grid || !toggle || !out || typeof dialog.showModal !== "function") return;

  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var TOP = 14;
  function month(value) { var p = String(value).split("-"); return Number(p[0]) * 12 + Number(p[1]) - 1; }
  function label(m) { return MON[m % 12] + " " + Math.floor(m / 12); }

  // Roles are read from the Experience markup, so the heatmap never drifts from the page.
  function collectRoles() {
    var roles = [];
    document.querySelectorAll("#experience .exp-role-block").forEach(function (block) {
      var btn = block.querySelector(".xp-role[data-start][data-end]");
      var chips = block.querySelectorAll(".exp-skill-chips li");
      var panel = block.closest(".xp-panel");
      var company = panel ? panel.querySelector(".company-btn") : null;
      if (!btn || !chips.length) return;
      roles.push({
        title: btn.querySelector(".xp-role-t").textContent.trim(),
        company: company ? company.textContent.trim() : "",
        a: month(btn.dataset.start),
        b: month(btn.dataset.end),
        skills: Array.prototype.map.call(chips, function (li) { return li.textContent.replace(/\s+/g, " ").trim(); })
      });
    });
    return roles;
  }

  var roles = collectRoles();
  if (!roles.length) return;
  var minM = Math.min.apply(null, roles.map(function (r) { return r.a; }));
  var maxM = Math.max.apply(null, roles.map(function (r) { return r.b; }));
  var y0 = Math.floor(minM / 12);
  var y1 = Math.floor((maxM - 1) / 12);
  var years = [];
  for (var y = y0; y <= y1; y++) years.push(y);
  var bySkill = new Map();
  roles.forEach(function (r) {
    r.skills.forEach(function (s) {
      if (!bySkill.has(s)) bySkill.set(s, []);
      bySkill.get(s).push(r);
    });
  });
  var skills = Array.from(bySkill.keys()).sort(function (a, b) {
    return bySkill.get(b).length - bySkill.get(a).length || a.localeCompare(b);
  });
  // A role counts in a year when any of its months [start, end) fall in that year.
  function count(skill, year) {
    return bySkill.get(skill).filter(function (r) { return r.a < (year + 1) * 12 && r.b > year * 12; }).length;
  }

  var showAll = false;
  var selected = null;
  grid.style.setProperty("--hm-cols", years.length);

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function render() {
    grid.textContent = "";
    var corner = el("span", "hm-corner", "Skill");
    corner.setAttribute("aria-hidden", "true");
    grid.appendChild(corner);
    years.forEach(function (yr) {
      var head = el("span", "hm-yr", (yr - y0) % 5 === 0 || yr === y1 ? "’" + String(yr).slice(2) : "");
      head.setAttribute("aria-hidden", "true");
      grid.appendChild(head);
    });
    (showAll ? skills : skills.slice(0, TOP)).forEach(function (skill) {
      var used = years.filter(function (yr) { return count(skill, yr) > 0; });
      var n = bySkill.get(skill).length;
      var btn = el("button", "hm-skill", skill);
      btn.type = "button";
      btn.title = skill;
      btn.dataset.skill = skill;
      btn.setAttribute("aria-pressed", selected === skill ? "true" : "false");
      btn.appendChild(el("span", "sr", ", " + n + (n === 1 ? " role" : " roles") + ", " + used[0] + " to " + used[used.length - 1]));
      grid.appendChild(btn);
      years.forEach(function (yr) {
        var c = count(skill, yr);
        var cell = el("span", "hm-cell hm-l" + Math.min(c, 2) + (selected === skill && c ? " is-selected" : ""));
        cell.dataset.skill = skill;
        cell.setAttribute("aria-hidden", "true");
        cell.title = skill + " · " + yr + ": " + c + (c === 1 ? " role" : " roles");
        grid.appendChild(cell);
      });
    });
    toggle.textContent = showAll ? "Show top " + TOP : "Show all (" + skills.length + ")";
    toggle.setAttribute("aria-expanded", showAll ? "true" : "false");
  }

  function listRoles() {
    out.textContent = "";
    if (!selected) return;
    var list = bySkill.get(selected).slice().sort(function (a, b) { return b.a - a.a; });
    out.appendChild(el("h3", "hm-roles-title", selected + " · " + list.length + (list.length === 1 ? " role" : " roles")));
    var ul = el("ul", "hm-roles-list");
    list.forEach(function (r) {
      var li = el("li");
      li.appendChild(el("strong", null, r.title));
      li.appendChild(document.createTextNode(", " + r.company + " · " + label(r.a) + " – " + label(r.b)));
      ul.appendChild(li);
    });
    out.appendChild(ul);
  }

  grid.addEventListener("click", function (event) {
    var target = event.target.closest("[data-skill]");
    if (!target) return;
    var skill = target.dataset.skill;
    selected = selected === skill ? null : skill;
    render();
    listRoles();
    var again = grid.querySelector('.hm-skill[data-skill="' + CSS.escape(skill) + '"]');
    if (again) again.focus();
  });
  toggle.addEventListener("click", function () { showAll = !showAll; render(); });

  openBtn.hidden = false;
  openBtn.addEventListener("click", function () {
    render();
    dialog.showModal();
    openBtn.setAttribute("aria-expanded", "true");
  });
  function focusable() {
    return Array.prototype.slice.call(dialog.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")).filter(function (node) {
      return !node.disabled && node.tabIndex !== -1 && !node.hidden;
    });
  }
  dialog.querySelector(".wc-close").addEventListener("click", function () { dialog.close(); });
  dialog.addEventListener("click", function (event) { if (event.target === dialog) dialog.close(); });
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
