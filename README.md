# Market Psychology Society (MPS) — Website Publik

Website publik MPS menggunakan HTML, CSS, dan JavaScript statis serta dipublikasikan melalui GitHub Pages. Portal pendaftaran, layanan member, dan administrasi berjalan pada Google Apps Script Web App yang terpisah.

## Halaman publik

- Beranda, About, Core System, Education
- Membership, Rewards, Rebate
- Join dan Konfirmasi Deposit (halaman informasi yang mengarahkan ke Portal Resmi)
- Market Pulse (preview statis; bukan dataset aktual)\n- Announcement Center (prototipe publik; data demo, belum terhubung backend)
- Member Portal, Contact, Syarat & Ketentuan, dan Kebijakan Privasi

## Alur pendaftaran dan keanggotaan

1. Calon anggota mengirim pendaftaran melalui Portal Resmi MPS.
2. Sistem membuat Application Ref. Member ID belum diterbitkan pada tahap ini.
3. Calon anggota mengirim konfirmasi deposit dan bukti melalui portal. Data deposit disimpan terpisah dari sheet Database Member selama proses pemeriksaan.
4. Calon anggota menyelesaikan verifikasi Telegram.
5. Admin memeriksa data dan dapat menyetujui atau menolak pengajuan.
6. Member ID diterbitkan setelah persetujuan admin. Status member menjadi Berhasil setelah proses pengiriman dan penyimpanan PIN terkonfirmasi.

Minimum deposit yang ditampilkan saat ini adalah Rp1.000.000. Nominal lebih besar diperbolehkan. Deposit merupakan dana di akun trading milik calon anggota pada broker, bukan biaya pendaftaran atau pembayaran kepada MPS.

## Integrasi portal

- Endpoint Google Apps Script pada `config.js` adalah alamat routing publik, bukan kredensial rahasia.
- Jangan mengubah endpoint tanpa mencocokkan URL pada Apps Script > Deploy > Manage deployments.
- Portal menggunakan `google.script.run`; halaman portal harus dibuka melalui URL Web App Apps Script.
- Pesan berhasil pada browser tidak menggantikan pemeriksaan status pada backend dan administrasi MPS.
- Website statis tidak boleh mengumpulkan password trading, password investor, OTP, PIN, token bot, atau kredensial admin.

## Keamanan dan privasi

- Data privat harus dilindungi di backend, bukan hanya dengan menyembunyikan panel pada frontend.
- Dashboard, Heatmap, Learning, Market Pulse, dan fungsi Admin harus memvalidasi sesi serta role di backend pada setiap permintaan.
- Bukti deposit dan materi Learning harus berada pada folder/file privat; jangan memakai tautan Drive publik.
- Tautan eksternal dengan `target="_blank"` wajib memakai `rel="noopener noreferrer"`.
- Ticker publik MPS boleh menampilkan nama asli/identitas member sesuai keputusan produk; jangan menyamarkan nama sebagai default dan jangan membuat aktivitas sosial palsu. Tampilkan hanya nama dan teks aktivitas yang aman. Jangan tampilkan nomor telepon, email, Telegram ID/username, MT5, nominal/tanggal deposit, bukti, PIN, token, atau referensi internal.\n- Announcement Center saat ini adalah prototipe UI dengan data demonstrasi; tidak ada feed pengumuman, status layanan, pemenang, atau undian resmi yang terhubung. Roulette hanya animasi presentasi dan tidak menentukan hasil.
- File `google-apps-script/Code.gs` dan `google-apps-script-v2/Code.gs` adalah sumber historis/legacy di repository, bukan bukti versi backend yang sedang terpasang. Jangan deploy keduanya untuk menggantikan backend aktif tanpa audit dan persetujuan.
- Jangan menganggap file backend lokal atau isi repository sama dengan deployment Apps Script yang sedang berjalan. Verifikasi versi dari deployment dan pengujian runtime.

## Status pemeriksaan

Pemeriksaan statis dapat memastikan struktur file, sintaks, rute, dan konsistensi referensi kode. Pemeriksaan tersebut tidak membuktikan integrasi runtime Google Apps Script, Google Sheets, Google Drive, Telegram, atau perangkat Android.

Sebelum rilis produksi, lakukan:
1. Cocokkan URL dan versi deployment Apps Script.
2. Uji akses langsung tanpa sesi untuk Dashboard, Heatmap, Learning, dan Market Pulse; pastikan API privat menolak akses.
3. Uji pendaftaran → konfirmasi deposit → verifikasi Telegram → approval admin → penerbitan Member ID → pengiriman PIN → aktivasi.
4. Periksa izin privat spreadsheet, folder bukti, file bukti, folder Learning, file Learning, dan dataset Market Pulse.
5. Uji backup dan pemulihan, bukan hanya pembuatan salinan spreadsheet.
6. Uji navigasi, upload bukti, login, Learning, dan Market Pulse pada Android.

**Penting:** Audit statis bukan sertifikasi keamanan dan tidak boleh dilaporkan sebagai pengujian produksi yang telah berhasil.
