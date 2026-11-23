# MPS Discipline X — Rancangan Produk

Status: BLUEPRINT / BELUM DIIMPLEMENTASIKAN  
Tanggal: 23 November 2026  
Penempatan: Learning → MPS Discipline X

## 1. Keputusan yang telah disetujui pengguna

- Nama: MPS Discipline X.
- Tema: Neon Cyan + Purple + Gold pada dasar navy gelap.
- Bahasa antarmuka: Bahasa Indonesia untuk seluruh menu, label, tombol, instruksi, peringatan, dan laporan. Nama merek "MPS Discipline X" tetap.
- Skor: hanya disiplin dan psikologi; profit/loss tidak menambah atau mengurangi skor.
- Privasi: jurnal pribadi sepenuhnya untuk masing-masing member. Admin tidak mendapat akses otomatis ke isi jurnal.
- Filosofi: membantu trader mengendalikan perilaku dan risiko; tidak menjanjikan pencegahan MC atau keuntungan.
- Tidak mendorong trading setiap hari. Memilih tidak trading karena kondisi tidak mendukung dapat menjadi keputusan disiplin.

## 2. Tujuan produk

Menyediakan ruang kendali pribadi untuk:
1. Memeriksa kesiapan emosi dan rencana sebelum transaksi.
2. Menghitung dan memantau risiko yang direncanakan.
3. Mencatat transaksi beserta alasan dan bukti visual.
4. Mengenali pola psikologis seperti takut, serakah, FOMO, dan keinginan membalas kerugian.
5. Mengevaluasi kepatuhan terhadap aturan pribadi.
6. Menampilkan laporan perkembangan disiplin harian, mingguan, dan bulanan.

## 3. Struktur navigasi

1. Beranda Disiplin
2. Pemeriksaan Sebelum Trading
3. Pengendali Risiko
4. Catatan Transaksi
5. Pemantau Psikologi
6. Evaluasi Harian
7. Laporan Perkembangan

## 4. Rincian modul

### 4.1 Beranda Disiplin
- Ringkasan skor disiplin, kondisi risiko, catatan hari ini, dan peringatan aktif.
- Misi harian berupa pemeriksaan yang relevan, bukan target wajib membuka posisi.
- Ringkasan pelanggaran aturan dan pengingat evaluasi.
- Angka ringkasan hanya dihitung dari data jurnal milik member yang sedang masuk.

### 4.2 Pemeriksaan Sebelum Trading
Checklist:
- Kondisi emosi saat ini.
- Fokus dan kesiapan.
- Alasan dan kesesuaian entry dengan rencana.
- Area masuk, Stop Loss, dan target.
- Ukuran posisi dan estimasi risiko.
- Batas kerugian harian serta jumlah transaksi.
- Konfirmasi tidak sedang mengejar kerugian.
Hasil: siap, perlu ditinjau, atau disarankan tidak trading. Sistem tidak mengirim order ke broker.

### 4.3 Pengendali Risiko
- Kalkulator estimasi risiko berdasarkan instrumen, ukuran posisi, entry, Stop Loss, dan parameter kontrak yang diketahui.
- Menampilkan nilai risiko nominal dan persentase hanya jika input dan spesifikasi instrumen memadai.
- Pengaturan batas risiko per transaksi, batas harian, dan jumlah transaksi oleh member.
- Peringatan bila rencana melewati batas yang dipasang.
- Jangan mengarang nilai pip, tick, contract size, konversi mata uang, atau leverage. Jika data instrumen tidak tersedia, minta input manual dan beri label estimasi.
- Bukan jaminan hasil dan bukan pengganti verifikasi ukuran kontrak broker.

### 4.4 Catatan Transaksi
Kolom yang direncanakan:
- Tanggal dan waktu.
- Instrumen/pair.
- Arah posisi.
- Entry, Stop Loss, target, ukuran posisi.
- Risiko yang direncanakan.
- Alasan entry dan rujukan trading plan.
- Hasil transaksi (opsional untuk analisis catatan, tidak memengaruhi skor disiplin).
- Tangkapan layar sebelum/sesudah.
- Emosi sebelum dan sesudah.
- Apakah aturan dipatuhi dan pelajaran yang diperoleh.
Member dapat menambah, mengedit, mencari, dan mengekspor catatan pribadinya.

### 4.5 Pemantau Psikologi
Pilihan suasana hati:
- Tenang dan fokus.
- Takut.
- Serakah.
- FOMO / takut tertinggal peluang.
- Marah atau frustrasi.
- Lelah.
- Terlalu percaya diri.
Pertanyaan pemicu:
- Apakah ingin membalas kerugian?
- Apakah ingin memperbesar lot demi menutup kerugian?
- Apakah sedang melanggar rencana?
- Apakah mampu menerima kemungkinan rugi?
Pola emosi ditampilkan sebagai refleksi pribadi, bukan diagnosis psikologis.

### 4.6 Evaluasi Harian
- Apakah mengikuti rencana?
- Apakah mematuhi Stop Loss?
- Apakah ukuran posisi sesuai batas?
- Apakah berhenti saat batas harian tercapai?
- Apakah menghindari transaksi impulsif?
- Apa keputusan paling disiplin hari ini?
- Apa yang akan diperbaiki?
- Opsi "Tidak trading hari ini" dengan alasan; ini tidak dianggap gagal.

### 4.7 Laporan Perkembangan
- Tren skor disiplin.
- Konsistensi pemeriksaan sebelum trading.
- Frekuensi pelanggaran aturan.
- Pola emosi yang sering muncul.
- Kepatuhan pada batas risiko.
- Ringkasan mingguan dan bulanan serta sasaran perbaikan.
- Profit/loss boleh dicatat sebagai konteks, tetapi tidak menjadi komponen skor.

## 5. Skor Disiplin

Skor 0–100, berdasarkan perilaku yang dapat dibuktikan dari jurnal, bukan hasil keuangan. Bobot awal yang diusulkan:
- Pemeriksaan sebelum trading: 20%.
- Kepatuhan pada rencana: 25%.
- Kepatuhan batas risiko: 25%.
- Pengendalian emosi dan tidak revenge trading: 20%.
- Evaluasi setelah aktivitas: 10%.

Aturan penting:
- Hari tanpa transaksi tidak otomatis mendapat nol; skor dihitung dari aktivitas yang relevan dan keputusan untuk tidak trading yang dicatat.
- Tidak ada bonus karena profit atau penalti karena loss.
- Data kosong ditampilkan sebagai "belum cukup data", bukan dianggap patuh atau melanggar.
- Skor adalah alat refleksi, bukan ukuran kemampuan atau jaminan keselamatan akun.
- Bobot dan rumus harus diuji dengan skenario contoh sebelum rilis.

## 6. Perlindungan dari revenge trading

Saat member menandai dorongan membalas kerugian, menaikkan lot untuk memulihkan loss, atau emosi tidak stabil:
1. Tampilkan peringatan yang jelas untuk berhenti sementara.
2. Sarankan tidak membuka posisi baru dan tidak menaikkan lot untuk mengejar kerugian.
3. Tawarkan langkah jeda, misalnya tutup platform, menjauh sejenak, dan isi evaluasi.
4. Catat peringatan di jurnal pribadi.
5. Jangan tampilkan tombol ajakan untuk langsung entry.
Sistem hanya memberi pengingat; tidak dapat mengunci akun broker atau menjamin member akan mematuhinya.

## 7. Privasi dan keamanan

- Setiap catatan wajib terikat ke identitas member terautentikasi di sisi server.
- Semua baca/tulis/ubah/hapus/ekspor diperiksa otorisasi di backend; menyembunyikan antarmuka bukan kontrol keamanan.
- Member hanya dapat mengakses catatannya sendiri.
- Admin tidak memiliki akses isi jurnal secara default. Dukungan teknis tidak boleh membuka jurnal tanpa proses persetujuan eksplisit dan terbatas yang dirancang terpisah.
- Jangan menyimpan PIN, password broker, OTP, atau kredensial akun trading.
- Lampiran bukti harus disimpan privat dan diperiksa aksesnya.
- Terapkan validasi input, pembatasan ukuran/jenis lampiran, perlindungan CSRF sesuai arsitektur, pembatasan laju, audit akses administratif tanpa mencatat isi sensitif.
- Tentukan masa retensi, ekspor, dan penghapusan data sebelum implementasi.
- Uji isolasi antar-member, akses langsung melalui API, manipulasi ID, dan akses file sebelum rilis.

## 8. Rancangan visual dan bahasa

- Dasar navy gelap.
- Cyan untuk navigasi/indikator utama.
- Purple untuk elemen psikologi dan analitik.
- Gold untuk fokus, pencapaian, dan penekanan.
- Peringatan risiko memakai warna kontras yang jelas, bukan sekadar dekorasi.
- Responsif untuk Android dan desktop; ukuran teks nyaman dibaca.
- Seluruh label, tombol, petunjuk, validasi, peringatan, dan laporan menggunakan Bahasa Indonesia.
- Istilah teknis dapat diberi padanan Indonesia, misalnya "Stop Loss (batas rugi)" pada kemunculan pertama.
- Jangan memakai teks contoh berbahasa Inggris di antarmuka, kecuali nama merek.

## 9. Penempatan dan hubungan dengan MPS

- Lokasi: Learning → MPS Discipline X.
- Terpisah dari materi belajar SMC/ICT, berita, dan Market Pulse.
- Akses hanya untuk member yang telah lolos autentikasi dan otorisasi keanggotaan MPS.
- Tidak mengubah proses pendaftaran, deposit, persetujuan, PIN, Telegram, atau storage produksi saat tahap blueprint.

## 10. Tahapan implementasi yang disarankan

1. Finalisasi alur pengguna, pertanyaan, rumus skor, dan aturan risiko.
2. Buat prototipe antarmuka statis berbahasa Indonesia.
3. Rancang skema data privat dan kebijakan retensi.
4. Implementasi backend dengan otorisasi per-member dan penyimpanan lampiran privat.
5. Uji perhitungan risiko, skor, validasi, privasi, dan keamanan lintas-member.
6. Uji coba terisolasi dengan data sintetis.
7. Acceptance test Android dan desktop.
8. Rilis hanya setelah seluruh pemeriksaan keamanan dan integrasi keanggotaan lulus.

## 11. Batas status

Dokumen ini adalah rancangan produk. Belum ada perubahan pada website, kode, backend Apps Script, database, Drive, akun member, atau deployment produksi. Tidak boleh mengklaim fitur sudah aktif atau teruji secara langsung.

## 12. Kriteria penerimaan minimum

- Antarmuka seluruhnya Bahasa Indonesia.
- Nyaman digunakan di Android.
- Skor tidak dipengaruhi profit/loss.
- Hari tanpa transaksi dapat dicatat sebagai keputusan disiplin.
- Peringatan revenge trading tidak mendorong entry baru.
- Kalkulator tidak menebak spesifikasi kontrak.
- Data dan lampiran benar-benar terisolasi per-member di backend.
- Admin tidak dapat membaca jurnal pribadi secara default.
- Pengujian akses silang-member dan API lulus.
- Fitur tidak mengubah sistem MPS produksi yang sudah ada tanpa persetujuan terpisah.
