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


/* MPS hero world clocks: update the single static panel; never inject a second panel. */
(() => {
  const zones = [
    {id:'tokyo',zone:'Asia/Tokyo',open:9,close:18},
    {id:'london',zone:'Europe/London',open:8,close:17},
    {id:'newyork',zone:'America/New_York',open:8,close:17}
  ];
  const mountClocks = () => {
    const panel = document.querySelector('[data-mps-session-clocks]');
    document.querySelectorAll('.mps-session-board').forEach(node => node.remove());
    document.querySelectorAll('.mps-global-sessions').forEach(node => { if (node !== panel) node.remove(); });
    if (!panel) return;
    zones.forEach(({id}) => {
      const card=panel.querySelector('[data-session="'+id+'"]'), face=card&&card.querySelector('.mps-gs-face');
      if (!face) return;
      const ticks=face.querySelector('.mps-gs-ticks');
      if (ticks && !ticks.children.length) for(let n=0;n<12;n++){
        const tick=document.createElement('i'); tick.className='mps-gs-tick';
        tick.style.transform='translateX(-50%) rotate('+(n*30)+'deg)'; ticks.appendChild(tick);
      }
    });
    const timeFmt=new Map(zones.map(z=>[z.id,new Intl.DateTimeFormat('en-GB',{timeZone:z.zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})]));
    const dateFmt=new Map(zones.map(z=>[z.id,new Intl.DateTimeFormat('id-ID',{timeZone:z.zone,weekday:'short',day:'2-digit',month:'short',year:'numeric'})]));
    const update=()=>{
      const now=new Date();
      zones.forEach(({id,zone,open,close})=>{
        const card=panel.querySelector('[data-session="'+id+'"]'); if(!card)return;
        const parts=Object.fromEntries(timeFmt.get(id).formatToParts(now).map(p=>[p.type,p.value]));
        const hh=+parts.hour,mm=+parts.minute,ss=+parts.second;
        const digital=card.querySelector('.mps-gs-digital'),date=card.querySelector('.mps-gs-date');
        if(digital)digital.textContent=parts.hour+':'+parts.minute+':'+parts.second;
        if(date)date.textContent=dateFmt.get(id).format(now);
        const degrees={hour:(hh%12)*30+mm*.5,minute:mm*6+ss*.1,second:ss*6};
        Object.entries(degrees).forEach(([hand,angle])=>{const el=card.querySelector('.mps-gs-'+hand);if(el)el.style.transform='translateX(-50%) rotate('+angle+'deg)';});
        const weekday=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short'}).format(now);
        const openNow=!['Sat','Sun'].includes(weekday)&&hh>=open&&hh<close;
        const status=card.querySelector('.mps-gs-status');
        if(status){status.classList.toggle('is-closed',!openNow);const label=status.querySelector('span');if(label)label.textContent=openNow?'SESI BERLANGSUNG':'SESI TUTUP';}
      });
      const overlap=panel.querySelector('#mps-gs-overlap');
      if(overlap){
        const london=+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',hour:'2-digit',hourCycle:'h23'}).format(now);
        const ny=+new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(now);
        const weekday=now.getUTCDay()>0&&now.getUTCDay()<6;
        overlap.innerHTML='<strong>MARKET OVERLAP</strong> · '+(weekday&&london>=13&&london<17&&ny>=8&&ny<12?'London dan New York sedang aktif bersamaan.':'Irisan sesi London dan New York belum berlangsung saat ini.');
      }
    };
    update(); window.setInterval(update,1000);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountClocks,{once:true});else mountClocks();
})();

/* MPS verified high-impact event alarm.
   The three world clocks are rendered once in index.html inside the hero mockup. */
(() => {
  const mount = () => {
    if (document.querySelector('[data-mps-news-alarm]')) return;
    const nav = document.querySelector('.navbar');
    if (!nav) return;

    const journal = document.createElement('li');
    journal.innerHTML = '<a href="journal.html">Jurnal Perdagangan</a>';
    const links = nav.querySelector('.nav-links');
    if (links && !links.querySelector('a[href="journal.html"]')) links.appendChild(journal);

    const alarm = document.createElement('div');
    alarm.className = 'mps-news-alarm';
    alarm.dataset.mpsNewsAlarm = '';
    alarm.hidden = true;
    alarm.setAttribute('role', 'status');
    alarm.setAttribute('aria-live', 'polite');
    alarm.innerHTML = `
      <span class="mps-alarm-beacon" aria-hidden="true"></span>
      <div><strong>PERINGATAN BERITA BERDAMPAK TINGGI</strong><b data-mps-news-title></b><span data-mps-news-countdown></span><small data-mps-news-meta></small></div>
    `;
    const placement = document.querySelector('.mps-ticker') || document.querySelector('.page-head') || nav;
    placement.insertAdjacentElement('afterend', alarm);

    const zones = [
      { zone:'Asia/Tokyo', open:9, close:18 },
      { zone:'Europe/London', open:8, close:17 },
      { zone:'America/New_York', open:8, close:17 }
    ];
    const allSessionsClosed = now => zones.every(({zone, open, close}) => {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
          timeZone:zone, weekday:'short', hour:'2-digit', hourCycle:'h23'
        }).formatToParts(now).map(part => [part.type, part.value])
      );
      const hour = Number(parts.hour);
      const weekdayOpen = !['Sat','Sun'].includes(parts.weekday);
      return !(weekdayOpen && hour >= open && hour < close);
    });

    const renderAlarm = now => {
      // Event data must come from a trusted, verified MPS feed; no sample events are fabricated.
      const event = window.MPS_HIGH_IMPACT_EVENT;
      const start = event && Date.parse(event.startsAt);
      const verified = event && event.verified === true && event.impact === 'high' &&
        typeof event.title === 'string' && event.title.trim() && Number.isFinite(start) && start > now.getTime();
      if (!verified || !allSessionsClosed(now)) { alarm.hidden = true; return; }

      alarm.hidden = false;
      alarm.querySelector('[data-mps-news-title]').textContent = event.title;
      const remaining = Math.max(0, start - now.getTime());
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      alarm.querySelector('[data-mps-news-countdown]').textContent = `Mulai dalam ${hours}j ${minutes}m ${seconds}d`;
      alarm.querySelector('[data-mps-news-meta]').textContent = event.timeWib
        ? `Jadwal: ${event.timeWib} WIB · Sumber terverifikasi`
        : 'Jadwal terverifikasi · WIB';
    };

    const update = () => renderAlarm(new Date());
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
