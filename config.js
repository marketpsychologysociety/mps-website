/* MPS public configuration — v4.7.0.
   The endpoint is public routing information, not a secret.
   Never put passwords, bot tokens, PINs, or secret API keys in this file. */
window.MPS_CONFIG = {
  brand: {
    name: "Market Psychology Society",
    short: "MPS",
    tagline: "TRADE WITH DISCIPLINE.",
    quote: "Discipline First. Survival Always.",
    year: 2026
  },
  links: {
    telegram: "https://t.me/Ndhisolasi",
    joinTelegram: "https://t.me/Ndhisolasi",
    email: "mailto:ndhisolasi.music@gmail.com"
  },
  webApp: {
    endpoint: "https://script.google.com/macros/s/AKfycbxhIqXGOr9iUy_oqbwu1iCNW0OKbFQ1nkYNR3mwa2O7tjSSuYYlmPvXAm6dyMFO1lUvGQ/exec"
  },
  form: {
    endpoint: "https://script.google.com/macros/s/AKfycbxhIqXGOr9iUy_oqbwu1iCNW0OKbFQ1nkYNR3mwa2O7tjSSuYYlmPvXAm6dyMFO1lUvGQ/exec",
    fallbackNote: "Pendaftaran online belum terhubung. Silakan buka Portal Member MPS atau hubungi admin melalui Telegram resmi."
  },
  depositForm: {
    endpoint: "https://script.google.com/macros/s/AKfycbxhIqXGOr9iUy_oqbwu1iCNW0OKbFQ1nkYNR3mwa2O7tjSSuYYlmPvXAm6dyMFO1lUvGQ/exec",
    maxFileSizeMB: 5
  },
  rebate: {
    maxPercent: 70,
    disclaimer: "Rebate maksimal dihitung dari komisi IB yang benar-benar diterima MPS dari broker. Persentase aktual bergantung pada jenis akun, ketentuan program, dan persetujuan broker."
  }
};