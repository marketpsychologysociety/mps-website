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


// Homepage information ticker: pause/resume the moving text with an accessible state.
(() => {
  const ticker = document.querySelector('.mps-home-ticker');
  const button = ticker && ticker.querySelector('.ticker-toggle');
  const track = ticker && ticker.querySelector('.ticker-track');
  if (!button || !track) return;
  button.addEventListener('click', () => {
    const paused = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(paused));
    button.textContent = paused ? 'Lanjut' : 'Jeda';
    track.style.animationPlayState = paused ? 'paused' : 'running';
    button.setAttribute('aria-label', paused ? 'Lanjutkan teks berjalan' : 'Jeda teks berjalan');
  });
})();

// MPS v4.8 button feedback v4: tactile press + real pointer-position ripple.
(() => {
  const selector = '.btn,button,.nav-join,.pwa-install-btn,input[type="button"],input[type="submit"]';
  let pressed = null;
  let releaseTimer = 0;
  let flashTimer = 0;
  const getControl = target => {
    const node = target instanceof Element ? target : target && target.parentElement;
    return node && node.closest(selector);
  };
  const usable = el => el && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
  const ripple = (el, event) => {
    if (!usable(el) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = el.getBoundingClientRect();
    const x = event && Number.isFinite(event.clientX) && event.clientX
      ? event.clientX - rect.left : rect.width / 2;
    const y = event && Number.isFinite(event.clientY) && event.clientY
      ? event.clientY - rect.top : rect.height / 2;
    const dot = document.createElement('span');
    dot.className = 'mps-click-ripple';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.left = x + 'px';
    dot.style.top = y + 'px';
    el.querySelectorAll(':scope > .mps-click-ripple').forEach(old => old.remove());
    el.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
    window.setTimeout(() => { if (dot.isConnected) dot.remove(); }, 750);
  };
  const flash = el => {
    if (!usable(el)) return;
    el.classList.remove('mps-click-feedback');
    void el.offsetWidth;
    el.classList.add('mps-click-feedback');
    window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => el.classList.remove('mps-click-feedback'), 480);
  };
  const begin = (el, event) => {
    if (!usable(el)) return;
    pressed = el;
    window.clearTimeout(releaseTimer);
    el.classList.add('mps-is-pressed');
    ripple(el, event);
  };
  const end = () => {
    const el = pressed;
    if (!el) return;
    pressed = null;
    el.classList.remove('mps-is-pressed');
    flash(el);
  };
  if ('PointerEvent' in window) {
    document.addEventListener('pointerdown', event => begin(getControl(event.target), event), true);
  } else {
    document.addEventListener('touchstart', event => begin(getControl(event.target), event.changedTouches[0]), { capture: true, passive: true });
    document.addEventListener('mousedown', event => begin(getControl(event.target), event), true);
  }
  document.addEventListener('pointerup', end, true);
  document.addEventListener('touchend', end, true);
  document.addEventListener('touchcancel', () => {
    if (pressed) pressed.classList.remove('mps-is-pressed');
    pressed = null;
  }, true);
  document.addEventListener('pointercancel', () => {
    if (pressed) pressed.classList.remove('mps-is-pressed');
    pressed = null;
  }, true);
  document.addEventListener('keydown', event => {
    if (event.repeat || !['Enter', ' '].includes(event.key)) return;
    begin(getControl(event.target), null);
  }, true);
  document.addEventListener('keyup', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    end();
  }, true);
  window.addEventListener('blur', () => {
    if (pressed) pressed.classList.remove('mps-is-pressed');
    pressed = null;
  });
  document.addEventListener('click', event => {
    const el = getControl(event.target);
    if (el && !el.classList.contains('mps-click-feedback')) flash(el);
    if (el && event.detail === 0) ripple(el, null);
  }, true);
})();
