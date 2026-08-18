# Changelog / Logs Perubahan

## [2026-08-18]
- **`package.json`**: Menambahkan dependency `node-fetch@2` dan `axios` via `npm install`.
- **`backend/src/services/emailnator.client.js`**: Mengubah implementasi HTTP client dari `fetch` (yang tidak disupport secara native di environment Node tertentu) menjadi `axios` untuk semua metode (`_getXsrfToken`, `generateEmail`, `getMessageList`).
- **`backend/src/services/tempMail.service.js`**: 
  - Memperbarui `getDomains()` untuk mengumpulkan domain dari semua provider (1secmail, Guerrilla, Emailnator) dan memiliki fallback jika semua gagal.
  - Memperbarui `generateEmail()` dengan error handling yang lebih baik dan penyesuaian fallback domain.
- **`backend/src/services/alias.service.js`**: Menambahkan logika `fs.mkdirSync` di inisialisasi agar otomatis membuat folder `data/` jika belum ada, mencegah error saat menyimpan alias ke file json lokal.
- **`frontend/public/js/tempMail.js`**: Memperbarui `populateDomainSelector()` agar secara default memilih (selected) opsi pertama yang di-disable ("Pilih domain"), dan menghilangkan kondisi fallback `else { select.value = ''; }` yang redundant.
- **`frontend/public/css/style.css`**: Menambahkan selector `#domainSelect` di akhir file dengan atribut `overflow-y: auto;` untuk memastikan dropdown dengan jumlah domain banyak dapat discroll.
- **[Fix] Emailnator Fallback Error**:
  - Menghapus dependency `node-fetch` dari `package.json` menggunakan `npm uninstall node-fetch`.
  - Memperbarui ulang `emailnator.client.js` dengan penanganan error CSRF token dan respons yang lebih informatif.
  - Memperbarui `tempMail.service.js` di fungsi `generateEmail()` agar membatalkan fallback diam-diam ke Guerrilla dan langsung melemparkan error jika `emailnator` gagal.
  - Memperbarui alert error di `frontend/public/js/tempMail.js` agar menjadi `❌ Gagal generate email...` untuk memberikan penanda visual yang lebih jelas.
- **[Fix] Domain List & Guerrilla Custom Domain**:
  - Memperbarui `getDomains()` di `tempMail.service.js` agar dengan kuat mengembalikan gabungan dari 1secmail, Guerrilla, dan Emailnator, ditambah domain fallback jika API gagal.
  - Memperbarui `generateGuerrillaEmail(requestedDomain)` agar menggunakan endpoint `set_email_user` dan meneruskan `domain` yang dipilih oleh pengguna (misal: `@grr.la`), sehingga bukan sekadar mengandalkan default `@guerrillamailblock.com`.
  - Menambahkan middleware logging sederhana di `server.js` untuk memantau request API.
  - Menulis ulang `emailnator.client.js` dengan menyertakan header ekstra (`Referer`, `Origin`, `Accept`) untuk meningkatkan resiliensi CSRF scrape.
