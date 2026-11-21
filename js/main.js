(() => {
  const cfg = window.MPS_CONFIG || {};

  if (cfg.previewMode === true) {
    document.querySelectorAll("a[data-preview-disabled=\"true\"]").forEach(link => {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.classList.add("mps-preview-disabled");
      link.title = "Belum aktif dalam pratinjau statis";
    });
  }

  // Portal routes remain closed unless an explicit production Web App URL is configured.
  const webAppEndpoint = String((cfg.webApp && cfg.webApp.endpoint) || "").trim();
  const validWebAppEndpoint = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(webAppEndpoint);
  document.querySelectorAll("a[data-portal-route]").forEach(link => {
    const page = String(link.dataset.portalRoute || "").toLowerCase();
    const allowedPages = ["register", "learning", "dashboard", "pulse", "admin"];
    if (cfg.previewMode !== true && validWebAppEndpoint && allowedPages.includes(page)) {
      link.href = webAppEndpoint.replace(/\/$/, "") + "?page=" + encodeURIComponent(page);
      link.removeAttribute("aria-disabled");
      link.classList.remove("mps-preview-disabled");
      link.removeAttribute("title");
    } else {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.classList.add("mps-preview-disabled");
      link.title = "Portal belum diaktifkan: konfigurasi URL Apps Script dan mode produksi terlebih dahulu";
    }
  });
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("navLinks");

  if (toggle && nav) {
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
      const opened = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(opened));
      toggle.setAttribute("aria-label", opened ? "Tutup menu" : "Buka menu");
      toggle.textContent = opened ? "×" : "☰";
    });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Buka menu");
      toggle.textContent = "☰";
    }));
  }

  const current = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(link => {
    if (link.getAttribute("href") === current) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });

  document.querySelectorAll("[data-link]").forEach(link => {
    const key = link.dataset.link;
    const url = cfg.links && cfg.links[key];
    if (url) {
      link.href = url;
    } else if (key === "whatsapp" && cfg.links && cfg.links.telegram) {
      // Avoid a dead "#" contact button when WhatsApp has not been configured.
      link.href = cfg.links.telegram;
      link.setAttribute("aria-label", "Hubungi MPS melalui Telegram");
      link.title = "Hubungi MPS melalui Telegram";
    }
  });
  document.querySelectorAll("[data-rebate='max']").forEach(el => {
    el.textContent = String((cfg.rebate && cfg.rebate.maxPercent) ?? 70);
  });
  document.querySelectorAll("[data-rebate='disclaimer']").forEach(el => {
    el.textContent = (cfg.rebate && cfg.rebate.disclaimer) || "";
  });
  document.querySelectorAll("[data-brand='name']").forEach(el => {
    el.textContent = (cfg.brand && cfg.brand.name) || "Market Psychology Society";
  });
  document.querySelectorAll("[data-brand='tagline']").forEach(el => {
    el.textContent = (cfg.brand && cfg.brand.tagline) || "DISIPLIN DI ATAS IMPULS";
  });
  const year = document.getElementById("year");
  if (year) year.textContent = `© ${new Date().getFullYear()} ${(cfg.brand && cfg.brand.name) || "Market Psychology Society"}. Hak cipta dilindungi.`;
})();
// MPS AUTOMATIC IMAGE SLIDER
document.addEventListener("DOMContentLoaded", function () {
  const slider = document.getElementById("mpsSlider");
  if (!slider) return;

  const slides = slider.querySelector(".mps-slides");
  const images = slides.querySelectorAll("img");
  const dotsContainer = slider.querySelector(".mps-dots");
  const prev = slider.querySelector(".mps-prev");
  const next = slider.querySelector(".mps-next");

  let current = 0;
  let timer;

  images.forEach((_, index) => {
    const dot = document.createElement("button");
    dot.className = "mps-dot";
    dot.setAttribute("aria-label", "Gambar " + (index + 1));
    dot.addEventListener("click", () => showSlide(index));
    dotsContainer.appendChild(dot);
  });

  const dots = dotsContainer.querySelectorAll(".mps-dot");

  function showSlide(index) {
    current = (index + images.length) % images.length;
    slides.style.transform = `translateX(-${current * 100}%)`;

    dots.forEach((dot, i) => {
      dot.classList.toggle("active", i === current);
    });
  }

  function startAuto() {
    clearInterval(timer);
    timer = setInterval(() => showSlide(current + 1), 4000);
  }

  prev.addEventListener("click", () => {
    showSlide(current - 1);
    startAuto();
  });

  next.addEventListener("click", () => {
    showSlide(current + 1);
    startAuto();
  });

  showSlide(0);
  startAuto();
});

// MPS tactile click feedback: ripple originates from the real pointer/touch location (no fake cursor).
(() => {
  const selector = '.btn, button, .nav-join, .pwa-install-btn';
  const addRipple = (target, x, y) => {
    if (!(target instanceof Element) || !target.matches(selector)) return;
    if (target.disabled || target.getAttribute('aria-disabled') === 'true') return;
    const rect = target.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'mps-click-ripple';
    ripple.setAttribute('aria-hidden', 'true');
    ripple.style.left = Math.max(0, Math.min(rect.width, x - rect.left)) + 'px';
    ripple.style.top = Math.max(0, Math.min(rect.height, y - rect.top)) + 'px';
    target.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    window.setTimeout(() => ripple.remove(), 750);
  };
  document.addEventListener('pointerdown', event => {
    const target = event.target.closest?.(selector);
    if (target) addRipple(target, event.clientX, event.clientY);
  }, { passive: true });
  document.addEventListener('click', event => {
    if (event.detail !== 0) return;
    const target = event.target.closest?.(selector);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    addRipple(target, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
})();


/* MPS live market-session clocks, existing-logo watermark, and verified-event alarm.
   London/New York DST is handled by IANA time-zone data in Intl. */
(() => {
  const mount = () => {
    if (document.querySelector('[data-mps-session-clocks]')) return;
    const nav = document.querySelector('.navbar');
    if (!nav) return;

    const journal = document.createElement('li');
    journal.innerHTML = '<a href="journal.html">Jurnal Perdagangan</a>';
    const links = nav.querySelector('.nav-links');
    if (links && !links.querySelector('a[href="journal.html"]')) links.appendChild(journal);

    const section = document.createElement('section');
    section.className = 'mps-session-board';
    section.dataset.mpsSessionClocks = 'true';
    section.setAttribute('aria-label', 'Jam sesi pasar dunia');
    section.innerHTML = `
      <div class="mps-session-heading">
        <span class="eyebrow">WAKTU PASAR DUNIA</span>
        <h2>Jam Sesi Perdagangan</h2>
        <p>Waktu lokal langsung · penyesuaian waktu musim panas otomatis</p>
      </div>
      <div class="mps-session-grid">
        <article class="mps-session-card" data-zone="Asia/Tokyo" data-open="9" data-close="18" data-label="ASIA · TOKYO" data-color="cyan">
          <div class="mps-session-ring"><div class="mps-session-face"><span class="mps-session-time">--:--:--</span><small>WAKTU LOKAL</small><b class="mps-session-status">MEMUAT</b></div></div>
          <strong>ASIA · TOKYO</strong><small class="mps-session-zone">Tokyo</small>
        </article>
        <article class="mps-session-card" data-zone="Europe/London" data-open="8" data-close="17" data-label="EROPA · LONDON" data-color="magenta">
          <div class="mps-session-ring"><div class="mps-session-face"><span class="mps-session-time">--:--:--</span><small>WAKTU LOKAL</small><b class="mps-session-status">MEMUAT</b></div></div>
          <strong>EROPA · LONDON</strong><small class="mps-session-zone">London</small>
        </article>
        <article class="mps-session-card" data-zone="America/New_York" data-open="8" data-close="17" data-label="AMERIKA · NEW YORK" data-color="gold">
          <div class="mps-session-ring"><div class="mps-session-face"><span class="mps-session-time">--:--:--</span><small>WAKTU LOKAL</small><b class="mps-session-status">MEMUAT</b></div></div>
          <strong>AMERIKA · NEW YORK</strong><small class="mps-session-zone">New York</small>
        </article>
      </div>
      <div class="mps-session-foot">Jam sesi merupakan acuan umum sesi pasar, bukan jaminan likuiditas atau jam operasional broker.</div>
      <div class="mps-news-alarm" data-mps-news-alarm hidden role="status" aria-live="polite">
        <span class="mps-alarm-beacon" aria-hidden="true"></span>
        <div><strong>PERINGATAN BERITA BERDAMPAK TINGGI</strong><b data-mps-news-title></b><span data-mps-news-countdown></span><small data-mps-news-meta></small></div>
      </div>
      <img class="mps-clock-watermark" src="assets/logo.svg?v=mps-original-20261118" alt="" aria-hidden="true">
    `;
    const placement = document.querySelector('.mps-ticker') || document.querySelector('.page-head') || nav;\n    placement.insertAdjacentElement('afterend', section);

    const formatter = (zone, options) => new Intl.DateTimeFormat('id-ID', { timeZone: zone, ...options });
    const getParts = (zone, now) => {
      const parts = formatter(zone, { hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23', weekday:'short' }).formatToParts(now);
      return Object.fromEntries(parts.map(part => [part.type, part.value]));
    };
    const cards = [...section.querySelectorAll('.mps-session-card')];
    const sessions = new Map();
    const update = () => {
      const now = new Date();
      let allClosed = true;
      cards.forEach(card => {
        const zone = card.dataset.zone;
        const parts = getParts(zone, now);
        const hour = Number(parts.hour);
        const minute = Number(parts.minute);
        const open = Number(card.dataset.open);
        const close = Number(card.dataset.close);
        const weekday = parts.weekday;
        const weekdayOk = !['Min', 'Sab'].includes(weekday);
        const isOpen = weekdayOk && (hour > open || (hour === open && minute >= 0)) && hour < close;
        if (isOpen) allClosed = false;
        card.querySelector('.mps-session-time').textContent = `${parts.hour}:${parts.minute}:${parts.second}`;
        card.querySelector('.mps-session-status').textContent = isOpen ? 'SESI BERLANGSUNG' : 'SESI TUTUP';
        card.classList.toggle('is-open', isOpen);
        card.classList.toggle('is-closed', !isOpen);
        card.querySelector('.mps-session-zone').textContent = formatter(zone, { timeZoneName:'short' }).format(now);
        sessions.set(zone, isOpen);
      });
      renderAlarm(now, allClosed);
    };
    const alarm = section.querySelector('[data-mps-news-alarm]');
    const renderAlarm = (now, allClosed) => {
      // Event data must come from a trusted, verified MPS feed; no sample events are fabricated.
      const event = window.MPS_HIGH_IMPACT_EVENT;
      const start = event && Date.parse(event.startsAt);
      const verified = event && event.verified === true && event.impact === 'high' &&
        typeof event.title === 'string' && event.title.trim() && Number.isFinite(start) && start > now.getTime();
      if (!verified || !allClosed) { alarm.hidden = true; return; }
      alarm.hidden = false;
      section.querySelector('[data-mps-news-title]').textContent = event.title;
      const remaining = Math.max(0, start - now.getTime());
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      section.querySelector('[data-mps-news-countdown]').textContent = `Mulai dalam ${hours}j ${minutes}m ${seconds}d`;
      section.querySelector('[data-mps-news-meta]').textContent = event.timeWib ? `Jadwal: ${event.timeWib} WIB · Sumber terverifikasi` : 'Jadwal terverifikasi · WIB';
    };
    update();
    window.setInterval(update, 1000);
    window.addEventListener('mps:verified-high-impact-event', event => {
      if (event.detail && typeof event.detail === 'object') window.MPS_HIGH_IMPACT_EVENT = event.detail;
      update();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true });
  else mount();
})();

/* Browser-only deterrents. These cannot prevent OS-level screenshots or external cameras. */
(() => {
  document.addEventListener('contextmenu', event => {
    if (event.target.closest('.mps-session-board, [data-mps-private-preview]')) event.preventDefault();
  });
  document.addEventListener('keydown', event => {
    const key = String(event.key || '').toLowerCase();
    if ((event.ctrlKey || event.metaKey) && ['p'].includes(key)) event.preventDefault();
  });
  window.addEventListener('beforeprint', () => document.documentElement.classList.add('mps-print-guard'));
  window.addEventListener('afterprint', () => document.documentElement.classList.remove('mps-print-guard'));
})();
