(function () {
  var config = window.PORTFOLIO || {};
  var api = String(config.bookingApi || "").replace(/\/$/, "");
  var siteKey = String(config.turnstileSiteKey || "");
  var soon = document.getElementById("booking-soon");
  var form = document.getElementById("booking-form");
  var minutes = document.getElementById("slot-minutes");
  if (!soon || !form) return;
  if (!api || !siteKey) return;

  soon.hidden = true;
  form.hidden = false;

  var hours = document.getElementById("booking-hours");
  var tzNote = document.getElementById("tz-note");
  var status = document.getElementById("slot-status");
  var dayList = document.getElementById("slot-days");
  var timeList = document.getElementById("slot-time-list");
  var error = document.getElementById("booking-error");
  var submit = document.getElementById("book-submit");
  var visitorTz = "UTC";
  try {
    visitorTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (err) {
    visitorTz = "UTC";
  }
  tzNote.textContent = "Times are shown in your time zone (" + visitorTz + "). Openings follow Pacific Time working hours, and same-day times are not offered.";

  var slots = [];
  var selectedDay = "";
  var turnstileToken = "";

  function setError(message) {
    error.textContent = message || "";
  }

  function dayKey(iso) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: visitorTz, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(new Date(iso));
  }

  function dayLabel(iso) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: visitorTz, weekday: "short", month: "short", day: "numeric"
    }).format(new Date(iso));
  }

  function timeLabel(iso) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: visitorTz, hour: "numeric", minute: "2-digit"
    }).format(new Date(iso));
  }

  function renderTimes() {
    var daySlots = slots.filter(function (slot) { return dayKey(slot.start) === selectedDay; });
    timeList.innerHTML = "";
    daySlots.forEach(function (slot) {
      var id = "slot-" + slot.start;
      var label = document.createElement("label");
      label.setAttribute("for", id);
      var input = document.createElement("input");
      input.type = "radio";
      input.name = "slot";
      input.id = id;
      input.value = slot.start;
      input.dataset.end = slot.end;
      input.required = true;
      label.appendChild(input);
      label.appendChild(document.createTextNode(timeLabel(slot.start)));
      timeList.appendChild(label);
    });
    if (!daySlots.length) {
      status.textContent = "No open times on that day.";
    }
  }

  function renderDays() {
    var seen = [];
    slots.forEach(function (slot) {
      var key = dayKey(slot.start);
      if (seen.indexOf(key) === -1) seen.push(key);
    });
    dayList.innerHTML = "";
    if (!seen.length) {
      status.textContent = "No open times in the current window. Email me and we will find one.";
      return;
    }
    selectedDay = seen[0];
    seen.forEach(function (key) {
      var sample = slots.filter(function (slot) { return dayKey(slot.start) === key; })[0];
      var button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", key === selectedDay ? "true" : "false");
      button.textContent = dayLabel(sample.start);
      button.addEventListener("click", function () {
        selectedDay = key;
        Array.prototype.forEach.call(dayList.children, function (child) {
          child.setAttribute("aria-selected", "false");
        });
        button.setAttribute("aria-selected", "true");
        renderTimes();
      });
      dayList.appendChild(button);
    });
    renderTimes();
  }

  function loadTurnstile() {
    var holder = document.getElementById("turnstile-slot");
    window.onTurnstile = function (token) { turnstileToken = token || ""; };
    window.onTurnstileExpired = function () { turnstileToken = ""; };
    var script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = function () {
      if (!window.turnstile) return;
      window.turnstile.render(holder, {
        sitekey: siteKey,
        callback: window.onTurnstile,
        "expired-callback": window.onTurnstileExpired,
        "error-callback": window.onTurnstileExpired
      });
    };
    document.head.appendChild(script);
  }

  status.textContent = "Loading open times.";
  fetch(api + "/config", { headers: { accept: "application/json" } })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (body) {
      if (body && body.slotMinutes) minutes.textContent = String(body.slotMinutes);
      if (body && body.workStart && body.workEnd) {
        hours.textContent = "Weekdays " + body.workStart + "–" + body.workEnd + " Pacific Time. The earliest opening is the next Pacific calendar day.";
      }
    })
    .catch(function () { /* the slots request reports a real failure */ });

  fetch(api + "/slots?tz=" + encodeURIComponent(visitorTz), { headers: { accept: "application/json" } })
    .then(function (res) {
      if (!res.ok) throw new Error("unavailable");
      return res.json();
    })
    .then(function (body) {
      if (body && body.slotMinutes) minutes.textContent = String(body.slotMinutes);
      slots = Array.isArray(body.slots) ? body.slots : [];
      status.textContent = slots.length ? "" : "No open times in the current window. Email me and we will find one.";
      renderDays();
    })
    .catch(function () {
      status.textContent = "Open times are unavailable right now. Email me instead.";
    });

  loadTurnstile();

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    setError("");
    var name = document.getElementById("book-name").value.trim();
    var email = document.getElementById("book-email").value.trim();
    var phone = document.getElementById("book-phone").value.trim();
    var chosen = form.querySelector("input[name=slot]:checked");
    if (!name) {
      setError("Add your name.");
      return;
    }
    if (!email && !phone) {
      setError("Add an email or a phone number.");
      return;
    }
    if (!chosen) {
      setError("Choose a time.");
      return;
    }
    if (!turnstileToken) {
      setError("Complete the spam check, then try again.");
      return;
    }
    submit.disabled = true;
    status.textContent = "Sending the request.";
    fetch(api + "/book", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        slotStart: chosen.value,
        slotEnd: chosen.dataset.end,
        name: name,
        email: email || undefined,
        phone: phone || undefined,
        turnstileToken: turnstileToken,
        visitorTz: visitorTz
      })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        return { status: res.status, body: body };
      });
    }).then(function (result) {
      submit.disabled = false;
      if (result.status === 200 && result.body && result.body.ok) {
        form.hidden = true;
        soon.hidden = false;
        soon.querySelector("p").textContent = "You are booked for " + dayLabel(result.body.start) + " at " + timeLabel(result.body.start) + ". A calendar invite goes out when an email was included.";
        status.textContent = "";
        return;
      }
      if (result.status === 409) setError("That time was just taken. Pick another.");
      else if (result.status === 429) setError("Too many requests. Try again later, or email me.");
      else if (result.status === 400) setError(result.body.error || "That time is not available.");
      else setError("Booking is unavailable right now. Email me instead.");
      status.textContent = "";
      if (window.turnstile) window.turnstile.reset();
      turnstileToken = "";
    }).catch(function () {
      submit.disabled = false;
      setError("Booking is unavailable right now. Email me instead.");
      status.textContent = "";
    });
  });
})();
