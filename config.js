/* Konfigurasi publik MPS — v4.8.0.
   The endpoint is public routing information, not a secret.
   Never put passwords, bot tokens, PINs, or secret API keys in this file. */
window.MPS_CONFIG = {
  brand: {
    name: "Market Psychology Society",
    short: "MPS",
    tagline: "DISIPLIN DI ATAS IMPULS",
    quote: "Disiplin Dahulu. Bertahan Selalu.",
    year: 2026
  },
  links: {
    telegram: "https://t.me/Ndhisolasi",
    joinTelegram: "https://t.me/Ndhisolasi",
    email: "mailto:ndhisolasi.music@gmail.com",
    exnessReferral: "https://one.exnessonelink.com/a/bdthbxwb2q"
  },
  partner: {
    broker: "Exness",
    ibCode: "bdthbxwb2q",
    referralUrl: "https://one.exnessonelink.com/a/bdthbxwb2q"
  },
  previewMode: true,
  webApp: { endpoint: "" },
  publicCenter: {
    // Keep disabled until the isolated Apps Script candidate is deployed and runtime-tested.
    enabled: false
  },
  form: {
    endpoint: "",
    fallbackNote: "Pendaftaran online belum terhubung. Silakan buka Portal Anggota MPS atau hubungi admin melalui Telegram resmi."
  },
  depositForm: {
    endpoint: "",
    maxFileSizeMB: 5
  },
  rebate: {
    maxPercent: 70,
    disclaimer: "Rebate maksimal dihitung dari komisi IB yang benar-benar diterima MPS dari broker. Persentase aktual bergantung pada jenis akun, ketentuan program, dan persetujuan broker."
  }
};