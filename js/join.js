(function () {
  "use strict";
  var form = document.getElementById("joinForm");
  if (!form) return;
  form.hidden = true;
  var notice = document.createElement("div");
  notice.className = "notice";
  notice.setAttribute("role", "status");
  var title = document.createElement("strong");
  title.textContent = "Pendaftaran MPS dilakukan melalui Portal Anggota MPS v4.8.";
  var copy = document.createElement("p");
  copy.textContent = "Sistem memberikan Application Ref setelah pengajuan. ID Anggota hanya diterbitkan setelah seluruh persyaratan diverifikasi dan disetujui admin.";
  var link = document.createElement("a");
  link.className = "btn btn-gold";
  link.href = "member-portal.html";
  link.textContent = "Buka Portal Pendaftaran MPS";
  notice.append(title, copy, link);
  form.parentNode.insertBefore(notice, form);
})();