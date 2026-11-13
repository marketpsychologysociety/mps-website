(() => {
  "use strict";
  const config = window.MPS_CONFIG || {};
  if (!config.publicCenter || config.publicCenter.enabled !== true) return;
  const endpoint = String((config.webApp || {}).endpoint || "");
  let endpointUrl;
  try {
    endpointUrl = new URL(endpoint);
    if (endpointUrl.protocol !== "https:" || endpointUrl.hostname !== "script.google.com" ||
        !/^\/macros\/s\/[^/]+\/exec$/.test(endpointUrl.pathname)) return;
  } catch (_) { return; }

  const safeText = (value, max = 1200) =>
    String(value == null ? "" : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, max);
  const safeLink = value => {
    const raw = safeText(value, 1500).trim();
    if (!raw) return "";
    try {
      const url = new URL(raw, window.location.href);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      if (url.protocol === "http:" && url.origin !== window.location.origin) return "";
      return url.href;
    } catch (_) { return ""; }
  };
  const categoryInfo = value => {
    const raw = safeText(value, 40).toLowerCase();
    if (/maintenance|pemeliharaan|perbaikan/.test(raw)) return {key:"maintenance", label:"MAINTENANCE"};
    if (/important|penting|urgent/.test(raw)) return {key:"important", label:"PENTING"};
    if (/community|komunitas|vip/.test(raw)) return {key:"community", label:"KOMUNITAS"};
    if (/update|fitur|system/.test(raw)) return {key:"update", label:"UPDATE"};
    return {key:"update", label:"INFORMASI"};
  };

  const loadFeed = async () => {
    const url = new URL(endpointUrl.href);
    url.searchParams.set("publicCenter", "1");
    url.searchParams.set("_", String(Date.now()));
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await window.fetch(url.href, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal
      });
      if (!response.ok) throw new Error("feed-unavailable");
      const body = await response.text();
      const prefix = "window.MPS_PUBLIC_CENTER_DATA=";
      if (!body.startsWith(prefix) || !body.endsWith(";")) throw new Error("invalid-feed-envelope");
      const data = JSON.parse(body.slice(prefix.length, -1));
      if (!data || data.ok !== true || !Array.isArray(data.announcements) || !Array.isArray(data.activity)) {
        throw new Error("invalid-feed");
      }
      return data;
    } finally {
      window.clearTimeout(timer);
    }
  };

  const renderTicker = data => {
    const ticker = document.querySelector("[data-mps-demo-ticker]");
    if (!ticker) return;
    if (!data.tickerSettings || data.tickerSettings.enabled !== true) { ticker.hidden = true; return; }
    const items = [];
    data.activity.slice(0, 12).forEach(item => {
      const memberId = /^MPS-(?:[A-F0-9]{8}|[A-F0-9]{10})$/.test(String(item.MemberId || "")) ? String(item.MemberId) : "";
      const eventText = safeText(item.PublicText, 120).trim();
      if (memberId) items.push("Member ID " + memberId + (eventText ? " — " + eventText : ""));
    });
    data.announcements.filter(item => {
      const category = String(item.Category || "").toLowerCase();
      return /important|penting|urgent|maintenance|pemeliharaan|perbaikan|winner|pemenang/.test(category);
    }).slice(0, 12).forEach(item => {
      const category = String(item.Category || "").toLowerCase();
      if (/winner|pemenang/.test(category)) {
        items.push("Pengumuman pemenang MPS telah diverifikasi dan dipublikasikan.");
        return;
      }
      const title = safeText(item.Title, 180).trim();
      if (title) items.push(title);
    });
    if (!items.length) items.push("Belum ada pengumuman aktif yang dipublikasikan.");
    const track = ticker.querySelector(".ticker-track");
    if (!track) return;
    track.replaceChildren();
    const sequence = items.concat(items);
    sequence.forEach((message, index) => {
      const span = document.createElement("span");
      span.textContent = message;
      track.appendChild(span);
      if (index < sequence.length - 1) {
        const separator = document.createElement("b");
        separator.textContent = "✦";
        track.appendChild(separator);
      }
    });
    const label = ticker.querySelector(".ticker-live");
    if (label) label.textContent = "MPS UPDATE";
    ticker.classList.remove("demo-ticker");
    ticker.setAttribute("aria-label", "Running text pengumuman resmi MPS");
    track.style.animationDuration = Math.max(10, Math.min(120, Number(data.tickerSettings.speed) || 34)) + "s";
    ticker.hidden = false;
  };

  const renderAnnouncements = data => {
    const grid = document.querySelector("[data-public-announcements]");
    if (!grid) return;
    grid.replaceChildren();
    const rows = data.announcements.slice(0, 12);
    const empty = document.getElementById("announceEmpty");
    if (!rows.length) {
      if (empty) { empty.hidden = false; empty.textContent = "Belum ada pengumuman publik yang sedang aktif."; }
      return;
    }
    if (empty) empty.hidden = true;
    rows.forEach(row => {
      const category = categoryInfo(row.Category);
      const card = document.createElement("article");
      card.className = "announce-card";
      card.dataset.category = category.key;
      const top = document.createElement("div");
      top.className = "announce-card-top";
      const tag = document.createElement("span");
      tag.className = "announce-tag tag-" + category.key;
      tag.textContent = category.label;
      const date = document.createElement("span");
      date.className = "announce-date";
      date.textContent = "PENGUMUMAN RESMI";
      top.append(tag, date);
      const heading = document.createElement("h3");
      heading.textContent = safeText(row.Title, 180) || "Pengumuman MPS";
      const body = document.createElement("p");
      body.textContent = safeText(row.Body, 900) || "Detail pengumuman belum tersedia.";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "announce-read";
      button.textContent = "Baca detail";
      const detail = document.createElement("span");
      detail.hidden = true;
      detail.className = "announce-live-detail";
      detail.textContent = safeText(row.Body, 12000);
      button.addEventListener("click", () => {
        detail.hidden = !detail.hidden;
        button.textContent = detail.hidden ? "Baca detail" : "Tutup detail";
      });
      card.append(top, heading, body, button, detail);
      const target = safeLink(row.ButtonURL);
      if (target) {
        const link = document.createElement("a");
        link.className = "announce-read";
        link.href = target;
        link.textContent = safeText(row.ButtonText, 60) || "Informasi selengkapnya";
        if (new URL(target).origin !== window.location.origin) {
          link.target = "_blank"; link.rel = "noopener noreferrer";
        }
        card.appendChild(link);
      }
      grid.appendChild(card);
    });
  };

  loadFeed().then(data => {
    renderTicker(data);
    renderAnnouncements(data);
    const notice = document.querySelector(".demo-warning");
    if (notice) {
      const strong = notice.querySelector("strong");
      const detail = notice.querySelector("span");
      if (strong) strong.textContent = "FEED PENGUMUMAN TERHUBUNG";
      if (detail) detail.textContent = "Pengumuman dan ticker berasal dari feed publik backend. Winner Board belum memiliki hasil resmi; Roulette masih berupa simulasi visual.";
    }
    document.documentElement.dataset.mpsPublicCenter = "connected";
  }).catch(() => {
    document.documentElement.dataset.mpsPublicCenter = "demo-fallback";
  });
})();
