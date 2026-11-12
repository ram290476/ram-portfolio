// Skills heatmap: skills by year, built from each Experience role's skill list and month range.
// Rows can be grouped or sorted: Most used, By category, A–Z, Most recent.
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
  // A role counts in a year when any of its months [start, end) fall in that year.
  function count(skill, year) {
    return bySkill.get(skill).filter(function (r) { return r.a < (year + 1) * 12 && r.b > year * 12; }).length;
  }

  var skills = Array.from(bySkill.keys());
  var stats = new Map();
  skills.forEach(function (skill) {
    var used = years.filter(function (yr) { return count(skill, yr) > 0; });
    stats.set(skill, { years: used.length, first: used[0], last: used[used.length - 1], roles: bySkill.get(skill).length });
  });
  function byName(a, b) { return a.localeCompare(b, "en", { sensitivity: "base" }); }
  // Most used: years of use, then number of roles. Most recent: latest year used.
  function byUsed(a, b) {
    var x = stats.get(a), y = stats.get(b);
    return y.years - x.years || y.roles - x.roles || byName(a, b);
  }
  function byRecent(a, b) {
    var x = stats.get(a), y = stats.get(b);
    return y.last - x.last || y.years - x.years || byName(a, b);
  }

  // Categories come from the Skills section's own group names. A skill listed there keeps its group;
  // ALIAS maps role skills worded differently onto those groups; FALLBACK covers skills with no site group.
  var ALIAS = {
    "AWS": "Cloud", "Azure": "Cloud", "Private Clouds": "Cloud", "Cloud Services": "Cloud",
    "Cloud Infrastructure": "Cloud", "Cloud Cost Optimization": "Cloud",
    "Infrastructure as code": "Infrastructure & containers", "RHEL": "Infrastructure & containers",
    "CI/CD": "CI/CD", "Git": "CI/CD", "GitHub": "CI/CD",
    "Incident Response": "Reliability", "Reliability Engineering": "Reliability", "Capacity Planning": "Reliability",
    "Disaster Recovery": "Reliability", "Splunk Enterprise": "Reliability", "ServiceNow": "Reliability",
    "Machine Learning": "AI/ML platform", "Large Language Models": "AI/ML platform", "MLOps": "AI/ML platform",
    "Oracle Database": "Security & data", "SSO": "Security & data",
    "Akamai": "Edge", "Web Application Firewalls": "Edge",
    "jQuery": "Web & backend", "ASP.NET Core": "Web & backend", ".NET Framework": "Web & backend",
    "REST": "Web & backend", "Microservices": "Web & backend"
  };
  var FALLBACK = {
    "Visual Studio": "Developer tools", "VS Code": "Developer tools", "Jules": "Developer tools",
    "PayPal Integration": "Integrations", "Salesforce integration": "Integrations",
    "Cybersource Integration": "Integrations", "Magento Integration": "Integrations", "Zendesk Integration": "Integrations"
  };
  var siteGroups = [];
  var siteGroupOf = new Map();
  document.querySelectorAll("#skills .skill-grid h3").forEach(function (h) {
    var name = h.textContent.replace(/\s+/g, " ").trim();
    siteGroups.push(name);
    h.parentElement.querySelectorAll("li").forEach(function (li) {
      var key = li.textContent.replace(/\s+/g, " ").trim().toLowerCase();
      if (!siteGroupOf.has(key)) siteGroupOf.set(key, name);
    });
  });
  function groupOf(skill) {
    var site = siteGroupOf.get(skill.toLowerCase());
    if (site) return site;
    if (ALIAS[skill] && siteGroups.indexOf(ALIAS[skill]) !== -1) return ALIAS[skill];
    return FALLBACK[skill] || "Other";
  }
  var groupOrder = siteGroups.concat(["Developer tools", "Integrations", "Other"]);

  var MODES = ["used", "category", "az", "recent"];
  var MODE_KEY = "ram-portfolio-heatmap-sort-v1";
  var mode = "used";
  try {
    var saved = window.sessionStorage.getItem(MODE_KEY);
    if (MODES.indexOf(saved) !== -1) mode = saved;
  } catch (e) {}
  var sortButtons = Array.prototype.slice.call(dialog.querySelectorAll(".hm-sort-btn[data-sort]"));

  // Top 14 is always the 14 most used skills, except Most recent, which picks the 14 used most recently.
  function visibleSkills() {
    var pool = skills.slice().sort(mode === "recent" ? byRecent : byUsed);
    if (!showAll) pool = pool.slice(0, TOP);
    if (mode === "az") return pool.sort(byName);
    if (mode === "category") {
      return pool.sort(function (a, b) {
        return groupOrder.indexOf(groupOf(a)) - groupOrder.indexOf(groupOf(b)) || byUsed(a, b);
      });
    }
    return pool;
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
    var lastGroup = null;
    visibleSkills().forEach(function (skill) {
      if (mode === "category" && groupOf(skill) !== lastGroup) {
        lastGroup = groupOf(skill);
        var head = el("h3", "hm-group");
        head.appendChild(el("span", null, lastGroup));
        grid.appendChild(head);
      }
      var st = stats.get(skill);
      var n = st.roles;
      var btn = el("button", "hm-skill", skill);
      btn.type = "button";
      btn.title = skill;
      btn.dataset.skill = skill;
      btn.setAttribute("aria-pressed", selected === skill ? "true" : "false");
      btn.appendChild(el("span", "sr", ", " + n + (n === 1 ? " role" : " roles") + ", " + st.first + " to " + st.last));
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
    grid.dataset.sort = mode;
    sortButtons.forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.sort === mode ? "true" : "false"); });
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
  sortButtons.forEach(function (button, i) {
    button.addEventListener("click", function () {
      mode = button.dataset.sort;
      try { window.sessionStorage.setItem(MODE_KEY, mode); } catch (e) {}
      render();
    });
    button.addEventListener("keydown", function (event) {
      var j = -1;
      if (event.key === "ArrowRight") j = (i + 1) % sortButtons.length;
      else if (event.key === "ArrowLeft") j = (i - 1 + sortButtons.length) % sortButtons.length;
      else if (event.key === "Home") j = 0;
      else if (event.key === "End") j = sortButtons.length - 1;
      if (j < 0) return;
      event.preventDefault();
      sortButtons[j].focus();
    });
  });

  openBtn.hidden = false;
  openBtn.addEventListener("click", function () {
    render();
    dialog.showModal();
    // Start at the latest years so recent use is in view when the grid scrolls sideways.
    var scroller = document.getElementById("heatmap-scroll");
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
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
