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


// MPS v4.8 stable button feedback: no disappearing ripple or oversized press scaling.
(() => {
  const selector = '.btn,button,.nav-join,.pwa-install-btn,input[type="button"],input[type="submit"]';
  const timers = new WeakMap();
  const active = new Set();
  const findButton = target => {
    const node = target instanceof Element ? target : target && target.parentElement;
    return node && node.closest(selector);
  };
  const clear = el => {
    const timer = timers.get(el);
    if (timer) window.clearTimeout(timer);
    timers.delete(el);
  };
  const press = el => {
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    clear(el);
    active.add(el);
    el.classList.add('mps-is-pressed');
  };
  const release = el => {
    if (!el) return;
    clear(el);
    const timer = window.setTimeout(() => {
      el.classList.remove('mps-is-pressed');
      active.delete(el);
      timers.delete(el);
    }, 150);
    timers.set(el, timer);
  };
  document.addEventListener('pointerdown', event => press(findButton(event.target)), {capture:true, passive:true});
  document.addEventListener('pointerup', event => release(findButton(event.target)), {capture:true, passive:true});
  document.addEventListener('pointercancel', event => {
    const el = findButton(event.target);
    if (!el) return;
    clear(el); el.classList.remove('mps-is-pressed'); active.delete(el);
  }, {capture:true, passive:true});
  document.addEventListener('keydown', event => {
    if (event.repeat || !['Enter',' '].includes(event.key)) return;
    press(findButton(event.target));
  }, true);
  document.addEventListener('keyup', event => {
    if (!['Enter',' '].includes(event.key)) return;
    release(findButton(event.target));
  }, true);
  window.addEventListener('blur', () => {
    active.forEach(el => { clear(el); el.classList.remove('mps-is-pressed'); });
    active.clear();
  });
})();
