# System Memory & Architecture

## Overview
Proyek ini adalah generator email sementara (temp email) dengan dukungan custom alias. Terdiri dari frontend berbasis vanilla HTML/JS/CSS dan backend Node.js (Express) yang berinteraksi dengan berbagai penyedia temp mail (Emailnator, 1secmail, Guerrilla Mail) dan ForwardEmail untuk custom alias.

## Struktur Direktori
- `frontend/`: File statis UI (HTML, CSS, JS).
  - `public/js/tempMail.js`: Logika interaksi frontend untuk temp mail.
  - `public/css/style.css`: Styling UI.
- `backend/`: Server Node.js (Express).
  - `src/services/emailnator.client.js`: Client untuk berinteraksi dengan API tidak resmi Emailnator (menggunakan `axios`).
  - `src/services/tempMail.service.js`: Service agregasi (mengelola Emailnator, 1secmail, Guerrilla).
  - `src/services/alias.service.js`: Service untuk membuat dan mengelola custom alias (menyimpan ke `data/aliases.json`).
  - `package.json`: Dependencies backend.
- `data/`: Folder tempat penyimpanan file state lokal (seperti `aliases.json`).

## Alur Sistem Web
1. **Frontend Request**: User memilih domain atau menekan generate di UI.
2. **Backend Processing**: 
   - `tempMail.service.js` akan merutekan ke provider yang tepat berdasarkan domain (misal: jika 'gmail.com', ke Emailnator).
   - `emailnator.client.js` menggunakan XSRF-TOKEN dan cookies (via Axios) untuk melakukan scraping / request API ke Emailnator.
3. **Data Storage**: 
   - Untuk alias, `alias.service.js` menyimpan data ke `data/aliases.json`. (Otomatis membuat folder `data/` jika belum ada).
4. **Inbox Polling**: 
   - Frontend memanggil endpoint inbox secara berkala, backend kembali memanggil provider yang sesuai untuk mengambil pesan.
