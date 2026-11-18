(function () {
  "use strict";
  var form = document.getElementById("depositForm");
  if (!form) return;
  form.hidden = true;
  var notice = document.createElement("div");
  notice.className = "notice";
  notice.setAttribute("role", "status");
  var title = document.createElement("strong");
  title.textContent = "Konfirmasi deposit MPS dilakukan melalui Portal Anggota MPS v4.8.";
  var copy = document.createElement("p");
  copy.textContent = "Masuk melalui portal dan gunakan Application Ref dari pengajuan. Nomor login MT5 hanya untuk identifikasi akun, bukan kata sandi. MPS tidak pernah meminta password, OTP, PIN, atau akses jarak jauh.";
  var link = document.createElement("a");
  link.className = "btn btn-gold";
  link.href = "member-portal.html";
  link.textContent = "Buka Portal Konfirmasi Deposit";
  notice.append(title, copy, link);
  form.parentNode.insertBefore(notice, form);
})();