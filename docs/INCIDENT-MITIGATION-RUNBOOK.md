# MPS Incident & Mitigation Runbook

Dokumen operasional untuk mempercepat diagnosis dan pemulihan gangguan MPS. Gunakan sebagai checklist; jangan mengubah produksi hanya berdasarkan dugaan.

## Aturan keselamatan utama

1. Bedakan **repository**, **GitHub Pages**, **Apps Script**, **Google Sheets**, **Google Drive**, dan **Telegram**. Perubahan di satu tempat tidak otomatis memperbarui tempat lain.
2. Merge PR hanya mengubah branch repository. Itu bukan bukti Pages sudah terbit dan bukan deployment Apps Script.
3. Jangan pernah menaruh token bot, admin token, PIN, password, ID sensitif, atau URL bukti privat ke file publik, log, screenshot publik, maupun issue.
4. Jangan menghapus/mengubah sheet, header, folder, Script Properties, data anggota, atau konfigurasi bot saat diagnosis.
5. Jika ada ketidakpastian, hentikan operasi tulis; ambil bukti read-only, backup, lalu lakukan perubahan terisolasi.

## 1. PR gagal merge / konflik

**Gejala:** GitHub menolak merge dengan pesan merge conflicts atau PR tertinggal dari main.

**Penyebab umum:** PR dibuat dari commit main lama; PR lain lebih dulu mengubah file yang sama.

**Mitigasi cepat:**
- Periksa base SHA, head SHA, daftar file, dan diff PR.
- Bandingkan file branch PR dengan file terbaru di main.
- Jangan force-merge dan jangan menimpa file terbaru dengan salinan branch lama.
- Buat branch baru dari main terbaru, terapkan hanya perubahan yang masih diperlukan, pertahankan perubahan terbaru (misalnya navigasi News & Review), jalankan CI, lalu buka PR pengganti.
- Setelah PR pengganti lolos, tutup PR lama dengan catatan bahwa perubahan telah dipindahkan.

**Pencegahan:** rebase/reapply PR kecil secara berkala; hindari banyak PR mengedit file yang sama secara bersamaan.

## 2. CI PWA gagal

**Gejala:** job `validate-pwa` gagal meskipun perubahan tampak kecil.

**Pemeriksaan cepat:**
- Buka run → job `validate-pwa` → log step `Validate PWA files and privacy rules`.
- Catat pesan error persis; jangan menebak dari status merah saja.
- Untuk halaman baru, pastikan terdaftar dalam array `pages`, mempunyai satu manifest link, satu tombol install yang diharapkan, satu registrasi service worker, ID unik, dan semua aset lokal tersedia.
- Periksa inline JavaScript dengan parser Node.
- Untuk teks instruksi iOS, gunakan escape newline JavaScript satu lapis (`\\n` di source), bukan dua lapis (`\\\\n`).
- Setelah memperbaiki, jalankan ulang CI dan pastikan commit SHA yang diuji sama dengan head PR terbaru.

**Pencegahan:** setiap halaman baru wajib masuk daftar validasi dan diuji melalui CI sebelum merge.

## 3. GitHub Pages belum berubah setelah merge

**Gejala:** branch main sudah memiliki commit baru tetapi website publik masih menampilkan versi lama.

**Diagnosis:**
- Pastikan commit sudah berada di main.
- Periksa Actions workflow Pages/build/deploy dan status deployment environment.
- Periksa URL Pages canonical, bukan domain lama.
- Jika workflow sukses tetapi browser lama, lakukan hard refresh/clear site cache dan periksa service worker.
- Jangan menganggap merge atau CI PWA sebagai bukti deployment.

**Mitigasi:** selesaikan workflow deploy terlebih dahulu; baru periksa cache browser. Jangan mengubah Apps Script untuk masalah yang hanya terjadi di Pages.

## 4. Apps Script menampilkan “Admin belum diinisialisasi”

**Makna:** frontend/backend tidak menemukan state bootstrap Admin yang diharapkan; ini belum membuktikan token atau database hilang.

**Urutan aman:**
1. Verifikasi URL deployment yang sedang dibuka adalah deployment yang benar.
2. Pastikan Code.gs dan Index.html berasal dari versi pasangan yang sama.
3. Baca log eksekusi Apps Script dan error fungsi admin bootstrap.
4. Periksa nama properti yang dibutuhkan secara read-only; jangan menampilkan nilainya.
5. Cocokkan fungsi bootstrap dengan versi kode yang benar.
6. Uji pada project/spreadsheet TEST terpisah.
7. Hanya setelah backup dan hasil uji jelas, rencanakan perbaikan produksi dengan persetujuan eksplisit.

**Jangan:** membuat ulang sheet, mengganti token, menghapus Script Properties, atau menjalankan fungsi setup/provisioning berulang kali tanpa mengetahui efeknya.

## 5. Ketidakcocokan skema Google Sheets (18 vs 30 kolom)

**Gejala:** pesan jumlah header/kolom tidak cocok atau migrasi dianggap belum siap.

**Diagnosis:** bedakan 18 header legacy dari skema tambahan v4.8; hitung nama header, urutan, dan sheet tujuan, bukan hanya jumlah kolom.

**Mitigasi:** gunakan inspector read-only; cocokkan nama dan urutan header; buat backup; migrasi append-only di TEST terlebih dahulu. Jangan menghapus kolom tambahan atau menimpa sheet lama untuk memaksa jumlah kolom cocok.

## 6. Pendaftaran, deposit, dan ID member

**Alur yang harus dijaga:**
- Pendaftaran awal membuat Application Ref, bukan ID Member.
- Pengajuan deposit dan bukti diterima sebelum proses penerbitan ID member.
- PIN/akses member diberikan setelah Admin menyetujui data dan pembayaran.
- Bukti deposit harus tetap privat dan hanya diakses Admin melalui jalur terautentikasi.

**Jika data tidak muncul:** cek request ID/Application Ref, response API, log server, dan penulisan sheet secara read-only. Jangan mengirim ulang pembayaran atau membuat ID manual sebelum status transaksi dipastikan.

## 7. Renewal Regular dan status masa aktif

**Gejala:** member kedaluwarsa bisa memperoleh masa aktif baru dari tanggal kosong/rusak.

**Mitigasi:** semua tanggal expiry dan waktu approval wajib valid. Data kosong/rusak harus fail-closed dan diarahkan ke Admin; jangan diam-diam mengganti tanggal rusak dengan waktu sekarang. Cocokkan ledger, status member, bukti pembayaran, dan audit log sebelum memperpanjang.

**Batas:** tes sintetis di CI bukan bukti runtime Apps Script produksi. Uji pada data TEST terisolasi terlebih dahulu.

## 8. PDF Learning / Google Drive bocor atau gagal diunduh

**Gejala:** file tidak muncul, unduhan ditolak, atau file/folder dapat diakses publik.

**Pemeriksaan:**
- Pastikan file PDF berada di folder Learning yang benar.
- Periksa sharing file, folder induk langsung, dan seluruh rantai folder induk.
- Endpoint unduhan harus memeriksa sesi/role dan mengulang pemeriksaan ACL sebelum membaca bytes.
- File atau salah satu parent bukan PRIVATE → hentikan akses; jangan membuat link publik sebagai jalan pintas.
- Uji dengan file dummy dan akun TEST. Mocked Drive CI tidak menggantikan pemeriksaan Drive sebenarnya.

**Pencegahan:** jangan membagikan direct Drive URL; pertahankan server-side authorization.

## 9. Telegram gagal, retry, atau status VIP tidak sinkron

**Diagnosis:** pisahkan token/bot auth, webhook/polling, chat ID, link token, membership event, dan invite expiry. Catat update ID/request ID agar retry idempotent.

**Mitigasi:** cek log dan status outbox secara read-only; retry hanya untuk operasi idempotent; jika hasil Telegram ambigu, rekonsiliasi status chat/member sebelum mengirim undangan baru. Jangan mencetak token atau mengirim pesan uji ke grup produksi tanpa persetujuan.

## 10. Checklist penutupan insiden

- [ ] Gejala dan waktu kejadian dicatat.
- [ ] Lapisan penyebab teridentifikasi (Pages / Apps Script / Sheets / Drive / Telegram).
- [ ] Bukti log/commit/CI disimpan tanpa rahasia.
- [ ] Backup tersedia sebelum operasi tulis.
- [ ] Perbaikan diuji di branch atau lingkungan TEST.
- [ ] CI lulus pada SHA terbaru.
- [ ] Deployment diverifikasi terpisah dari merge.
- [ ] Fungsi terkait diuji dengan skenario berhasil dan gagal.
- [ ] Dampak terhadap data anggota dan pembayaran diperiksa.
- [ ] Catatan mitigasi diperbarui agar insiden yang sama lebih cepat ditangani.

## Status operasional yang wajib dilaporkan

Gunakan label yang tepat: **Diperbaiki di branch**, **CI lulus**, **Merged**, **Pages ter-deploy**, **Apps Script ter-deploy**, dan **Runtime produksi terverifikasi**. Jangan menyamakan satu status dengan status lainnya.
