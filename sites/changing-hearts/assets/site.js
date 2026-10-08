/* Changing Hearts — site behaviour: header, menu, reveal, forms, config-driven bits. No dependencies. */
(function () {
  "use strict";
  var C = window.CH_CONFIG || {};
  var doc = document.documentElement;
  doc.classList.add("js");
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function store(get, k, v) { try { return get ? sessionStorage.getItem(k) : sessionStorage.setItem(k, v); } catch (e) { return null; } }

  /* intro reveal: home page, once per browser session */
  var intro = $("#intro");
  if (intro) {
    var hide = function () { intro.classList.add("hide"); store(false, "ch_intro", "1"); };
    if (store(true, "ch_intro") === "1" || reduce) intro.classList.add("hide");
    else { setTimeout(hide, 3600); }
    var skip = $(".intro-skip", intro); if (skip) skip.addEventListener("click", hide);
  }

  /* header: solid after scrolling */
  var header = $(".site-header");
  function onScroll() { if (header) header.classList.toggle("solid", window.scrollY > 24 || document.body.dataset.solid === "1"); }
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* mobile menu */
  var menuBtn = $(".menu-btn");
  if (menuBtn) {
    var setMenu = function (open) { document.body.classList.toggle("menu-open", open); menuBtn.setAttribute("aria-expanded", String(open)); menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu"); };
    menuBtn.addEventListener("click", function () { setMenu(!document.body.classList.contains("menu-open")); });
    $$(".nav a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
    window.addEventListener("resize", function () { if (window.innerWidth > 1080) setMenu(false); });
  }

  /* scroll reveal */
  var reveals = $$(".reveal");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }); }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else reveals.forEach(function (el) { el.classList.add("in"); });

  /* card spotlight follows the pointer */
  $$(".card").forEach(function (c) {
    c.addEventListener("pointermove", function (e) { var r = c.getBoundingClientRect(); c.style.setProperty("--mx", (e.clientX - r.left) + "px"); c.style.setProperty("--my", (e.clientY - r.top) + "px"); });
  });

  /* embers in heroes */
  $$(".embers").forEach(function (box) {
    if (reduce) return;
    for (var i = 0; i < 18; i++) {
      var s = document.createElement("i");
      s.style.left = (Math.random() * 100) + "%";
      s.style.animationDuration = (9 + Math.random() * 12) + "s";
      s.style.animationDelay = (-Math.random() * 20) + "s";
      var z = 2 + Math.random() * 3; s.style.width = s.style.height = z + "px";
      box.appendChild(s);
    }
  });

  /* marquee: duplicate content for a seamless loop */
  $$(".marquee-track").forEach(function (t) { t.innerHTML += t.innerHTML; });

  /* footer year + design credit + socials */
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
  $$("[data-design-credit]").forEach(function (el) { if (C.designCredit) el.textContent = C.designCredit; else el.remove(); });
  var social = C.social || {};
  $$("[data-social]").forEach(function (a) { var u = social[a.dataset.social]; if (u) a.href = u; else a.closest("li") ? a.closest("li").remove() : a.remove(); });
  $$("[data-social-list]").forEach(function (ul) { if (!ul.children.length) { var h = ul.previousElementSibling; if (h) h.remove(); ul.remove(); } });

  /* impact numbers: shown only when real numbers are set */
  var impact = C.impact || {};
  $$("[data-impact]").forEach(function (el) {
    var v = impact[el.dataset.impact];
    if (v === null || v === undefined || v === "") { el.remove(); return; }
    var b = $("b", el); if (b) countUp(b, Number(v));
  });
  $$("[data-impact-wrap]").forEach(function (w) { if (!$("[data-impact]", w)) w.remove(); });
  function countUp(b, n) {
    if (reduce || !("IntersectionObserver" in window)) { b.textContent = n.toLocaleString("en-US"); return; }
    b.textContent = "0";
    var o = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return; o.disconnect();
      var t0 = performance.now();
      (function step(t) { var p = Math.min(1, (t - t0) / 1600); b.textContent = Math.round(n * (1 - Math.pow(1 - p, 3))).toLocaleString("en-US"); if (p < 1) requestAnimationFrame(step); })(t0);
    });
    o.observe(b);
  }

  /* payment links: "Pay now" buttons appear only when configured */
  var pay = C.payments || {};
  $$("[data-pay]").forEach(function (a) { var u = pay[a.dataset.pay]; if (u) { a.href = u; a.target = "_blank"; a.rel = "noopener"; a.hidden = false; } else a.remove(); });

  /* chips that set a form field, e.g. "I want to sponsor" */
  $$("[data-set]").forEach(function (el) {
    el.addEventListener("click", function () {
      var parts = el.dataset.set.split("="), f = document.getElementById(parts[0]);
      if (f) { f.value = parts[1]; f.dispatchEvent(new Event("change")); }
      var group = el.closest(".chips");
      if (group) $$(".chip", group).forEach(function (c) { c.setAttribute("aria-pressed", String(c === el)); });
      var target = el.dataset.scroll && document.querySelector(el.dataset.scroll);
      if (target) { target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }); var first = $("input:not(.hp),textarea", target); if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 500); }
    });
  });

  /* prefill a form field from ?interest=... or ?package=... links */
  var qs = new URLSearchParams(location.search);
  qs.forEach(function (v, k) { var f = document.querySelector('form [name="' + k + '"]'); if (f && f.tagName === "SELECT" && $$("option", f).some(function (o) { return o.value === v; })) f.value = v; });

  /* forms: POST to formEndpoint, else open a pre-addressed email draft */
  $$("form[data-form]").forEach(function (form) {
    var status = $(".form-status", form);
    function say(kind, msg) { if (!status) return; status.className = "form-status " + kind; status.textContent = msg; }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var hp = $(".hp input", form); if (hp && hp.value) return; // bot
      var bad = null;
      $$("[required]", form).forEach(function (f) {
        var ok = f.type === "checkbox" ? f.checked : f.value.trim() !== "" && (f.type !== "email" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value.trim()));
        f.setAttribute("aria-invalid", String(!ok)); if (!ok && !bad) bad = f;
      });
      if (bad) { say("err", bad.type === "email" && bad.value ? "Please check the email address." : "Please fill in the highlighted fields."); bad.focus(); return; }

      var data = {}; new FormData(form).forEach(function (v, k) { if (k !== "_gotcha") data[k] = typeof v === "string" ? v.trim() : v; });
      data.form = form.dataset.form; data.page = location.pathname;
      var subject = "Changing Hearts — " + (form.dataset.subject || "Website inquiry") + (data.name ? " from " + data.name : "");
      var btn = $("button[type=submit]", form);

      if (C.formEndpoint) {
        if (btn) btn.disabled = true; say("info", "Sending…");
        fetch(C.formEndpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(Object.assign({ _subject: subject }, data)) })
          .then(function (r) { if (!r.ok) throw new Error(r.status); form.reset(); say("ok", form.dataset.success || "Thank you — your message is on its way. We'll be in touch soon."); })
          .catch(function () { say("err", "That didn't send. Please try again" + (C.contactEmail ? ", or email " + C.contactEmail + "." : " in a moment.")); })
          .then(function () { if (btn) btn.disabled = false; });
        return;
      }
      if (C.contactEmail) {
        var body = Object.keys(data).filter(function (k) { return k !== "form" && k !== "page" && data[k] !== ""; }).map(function (k) { return k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ") + ": " + data[k]; }).join("\n");
        location.href = "mailto:" + encodeURIComponent(C.contactEmail).replace("%40", "@") + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
        say("ok", "Your email app is opening with this message addressed to " + C.contactEmail + ". Press send there to finish.");
        return;
      }
      say("err", "Our message inbox is being set up. Please check back soon.");
      if (window.console) console.warn("Changing Hearts: set contactEmail or formEndpoint in assets/config.js to switch forms on.");
    });
    $$("input,textarea,select", form).forEach(function (f) { f.addEventListener("input", function () { f.removeAttribute("aria-invalid"); }); });
  });
})();
