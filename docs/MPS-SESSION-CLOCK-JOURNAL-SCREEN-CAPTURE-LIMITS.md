# Catatan implementasi — Jam sesi, alarm berita, jurnal, dan batas perlindungan tangkapan layar

## Perubahan pada cabang ini
- Menambahkan tiga jam digital melingkar untuk Tokyo, London, dan New York. Jam memakai zona waktu IANA melalui Intl.DateTimeFormat sehingga pergeseran waktu musim panas London/New York mengikuti basis data zona waktu perangkat.
- Menambahkan watermark memakai aset logo MPS yang sudah ada. Tidak ada aset logo baru dan tidak ada perubahan logo banteng/beruang yang sudah ada.
- Menambahkan wadah alarm merah untuk peristiwa berdampak tinggi. Wadah hanya muncul jika menerima objek peristiwa terverifikasi melalui window.MPS_HIGH_IMPACT_EVENT atau event mps:verified-high-impact-event, dampak bernilai high, jadwal masih di masa depan, dan seluruh sesi acuan sedang tutup.
- Menambahkan menu Jurnal Perdagangan dan halaman rancangan awal. Belum ada penyimpanan catatan atau API anggota yang terhubung; halaman menyatakannya secara eksplisit.

## Kontrak data alarm
Pemasok data yang tepercaya harus mengirim objek dengan verified=true, impact='high', title, startsAt (tanggal ISO yang dapat diparse), dan opsional timeWib. Jangan mengirim data kalender dari sumber yang belum diverifikasi. Belum ada pemasok kalender/berita langsung yang dikonfigurasi pada cabang ini, sehingga alarm tidak akan menampilkan kejadian palsu.

## Batas anti-screenshot
Website GitHub Pages/PWA berjalan sebagai halaman web di browser. JavaScript dan CSS tidak memiliki hak istimewa Android untuk memblokir tangkapan layar sistem operasi atau perekaman layar. Kode browser hanya menambahkan penghalang ringan untuk menu konteks pada area tertentu dan pintasan cetak; ini bukan perlindungan screenshot dan dapat dilewati. Watermark membantu atribusi, bukan mencegah salinan.

Pemblokiran screenshot Android yang sesungguhnya memerlukan aplikasi Android native atau pembungkus native tepercaya yang menerapkan Android WindowManager.LayoutParams.FLAG_SECURE pada seluruh layar privat. Instalasi PWA biasa tidak dapat menetapkan FLAG_SECURE. Jangan mengklaim bahwa website/PWA ini anti-screenshot.

## Pengamanan data yang masih diperlukan sebelum produksi
- Materi privat, jurnal, data anggota, dan PDF harus dilayani oleh backend yang memeriksa sesi/role pada setiap permintaan.
- Jurnal membutuhkan API backend dengan identitas anggota, validasi input, pembatasan laju, otorisasi baca/tulis, audit log, serta kebijakan retensi dan penghapusan. Jangan menyimpan jurnal privat di localStorage atau file statis publik.
- Alarm berita memerlukan integrasi sumber kalender/berita tepercaya, validasi server, stempel waktu dan zona waktu yang eksplisit, serta mekanisme pembaruan dan penanganan data kedaluwarsa.
- Periksa seluruh rute dan navigasi pada perangkat Android setelah deployment. Perubahan cabang ini tidak mengubah deployment Apps Script atau GitHub Pages produksi.
