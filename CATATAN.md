# CATATAN PENGEMBANGAN — Neko Mail Pro (Temp Mail Generator)

File ini = memory singkat: struktur, alur system, yang sudah diperbaiki, dan yang **belum** terverifikasi/terbuka. Perbarui seiring kerja lanjutan.

---

## 1. Ringkasan

Web app temp email generator + custom alias.
- Backend: Node.js + Express 4 + Socket.IO
- Frontend: HTML/CSS/vanilla JS (no framework)
- Provider email sementara: **1secmail.com** (primary) + **Guerrilla Mail** (fallback) + **Emailnator** (opsi `gmail.com (Emailnator)`)
- Alias: mode lokal (persist file JSON) + integrasi opsional ForwardEmail.net
- Deploy: Vercel supported (`process.env.VERCEL === '1'` → data di `/tmp`, ephemeral)

---

## 2. Struktur

```text
temp-email-generator/
├── .gitignore
├── CATATAN.md                     ← file ini
├── backend/
│   ├── .env                       ← konfigurasi lokal (TIDAK di-commit)
│   ├── .env.example               ← template env untuk commit
│   ├── check.js                   ← self-check (npm run check)
│   ├── package.json               ← script: start / dev / check
│   ├── data/aliases.json          ← persist alias (di-generate, di-ignore)
│   └── src/
│       ├── server.js              ← app, CORS, static, 404, error handler, health
│       ├── config/index.js        ← baca .env, default seluruh provider
│       ├── routes/
│       │   ├── tempMail.routes.js
│       │   └── alias.routes.js
│       ├── controllers/
│       │   ├── tempMail.controller.js
│       │   └── alias.controller.js
│       ├── services/
│       │   ├── tempMail.service.js  ← multi-provider (1secmail + guerrilla + emailnator)
│       │   ├── emailnator.client.js ← client emailnator.com (UNVERIFIED spec)
│       │   └── alias.service.js     ← validasi + persist JSON + Vercel /tmp
│       └── sockets/
│           └── email.socket.js      ← status koneksi + subscribe-email
└── frontend/public/
    ├── index.html
    ├── css/style.css
    └── js/
        ├── app.js                  ← inisialisasi socket, tab
        ├── tempMail.js             ← generate, polling inbox, render
        └── alias.js                ← CRUD alias, render
```

---

## 3. Alur system

### Temp Mail
1. Frontend `loadDomains()` → `GET /api/temp-mail/domains` → backend minta `getDomainList` ke 1secmail.
2. User klik Generate → `POST /api/temp-mail/generate`.
   - Tanpa domain: pilih domain pertama 1secmail → buat login acak.
   - Domain `gmail.com (Emailnator)` → `POST /generate` Emailnator (`plusGmail`+`dotGmail`).
   - Domain = domain Guerrilla → panggil `get_email_address` Guerrilla (perlu token session).
   - 1secmail down → fallback Guerrilla; `generateWithFallback` pakai domain tanpa `( … )`.
3. Email tampil → frontend subscribe socket `subscribe-email` + mulai polling `POST /api/temp-mail/inbox` tiap 30 detik (pause saat tab alias aktif).
4. Backend `getInbox()`: kalau `gmail.com`/emailnator → `getMessageList` emailnator; domain Guerrilla → `check_email` (butuh session); bukan → `getMessages` + `readMessage` 1secmail.
5. Pesan di-normalisasi → `{ id, from, subject, date, body, source }` → frontend render via **DOM + textContent** (anti XSS).

### Custom Alias
1. `POST /api/alias/create` `{ domain, prefix, forwardTo }` → validasi:
   - domain format valid
   - prefix `^[a-z0-9._-]{1,64}$`
   - forwardTo format email
   - cek duplikat → 409
2. Simpan ke `data/aliases.json` (persist, rollback kalau gagal tulis).
3. Kalau `FORWARD_EMAIL_API_KEY` ada → post ke ForwardEmail; gagal → jatuh ke lokal.
4. `GET /api/alias/list` → gabung alias lokal + remote.
5. `DELETE /api/alias/delete` → hapus; tak ada → 404.

### Socket
- Hanya status online/offline + registrasi email ke server.
- `broadcastNewEmail` ada tapi provider saat ini **polling-only** → email baru sampai via polling, bukan push. Client polling tiap 30 detik.

---

## 4. Yang SUDAH diperbaiki

| Area | Perbaikan |
|---|---|
| Provider | temp-mail.org (mati) → 1secmail primary + Guerrilla fallback + Emailnator (gmail.com) |
| XSS | renderInbox & renderAliases pindah dari `innerHTML` → DOM `textContent` |
| Alias | persist ke JSON, validasi input, duplicate 409, delete 404, rollback file |
| alias save | `saveAliases()` throw saat gagal tulis (bukan diam-diam sukses) |
| Socket | hapus dead code `manual-refresh`, update subscribe email baru |
| CORS | pakai `config.corsOrigin` dari .env (bukan `*` hardcode ala cors()) |
| Error | 404 handler + error handler JSON, status 400/404/409/502 benar |
| Controller | body kosong aman (`req.body || {}`) |
| Config | `tempMailBaseUrl` & `guerrillaBaseUrl` dibaca dari config (bukan hardcode) |
| Frontend | fallback domain kosong aman; polling inbox 30 detik; error generate ditampilkan |
| idx.html | tambah `/socket.io/socket.io.js` (dulu `io()` undefined) |
| Deps | `npm run check`; clean `node_modules`/lockfile pakai registry npmjs.org (mirror npmmirror corrupt) |
| Hygiene | `.gitignore`: `.env`, `package-lock.json`, `backend/data/aliases.json`; ada `.env.example` |

---

## 5. Yang BELUM terverifikasi / masih terbuka

- [ ] **Uji inbox real**: generate alamat 1secmail, kirim email test, pastikan `getMessages`+`readMessage` mengembalikan body.
- [ ] **Uji Guerrilla inbox**: `get_email_address` → `check_email`. Session hanya hidup selama proses backend jalan (restart = session hilang).
- [ ] **Emailnator UNVERIFIED**: `POST /generate`, `GET /message` asumsi — harus diuji langsung `www.emailnator.com` (`emailnator.client.js`).
- [ ] **`getDomains()` fallback**: kalau 1secmail gagal, list = `gmail.com (Emailnator)` + domain Guerrilla statis; entry emailnator selalu `unshift` → default domain select = Emailnator. Pastikan itu diinginkan.
- [ ] **`generateWithFallback()`** pilih domain pertama tanpa `( … )`; kalau source `getDomains()` berupa domain list user, fallback mengubah provider asal.
- [ ] **`generateWithFallback()`** sering `errors` diisi 1secmail; pastikan tidak pernah double-throw / promise rejected tanpa pesan.
- [ ] **XSS test nyata**: email dengan `<script>`/`onerror` harus tampil polos (render sudah DOM, tapi belum diuji live).
- [x] **Race double-click** sudah: `btn.disabled` + `if (btn.disabled) return` di `generateNewEmail`.
- [x] **Frontend polling tab-aware** sudah: hanya refresh saat `#tab-temp.active`.
- [ ] **Rate limit**: 1secmail/Guerrilla public — request sering kemungkinan dibatasi/injur. Belum ada throttling delay antar refresh.
- [ ] **Socket subscribe tidak dibatasi** — siapa pun bisa subscribe email tertentu (deploy publik perlu revisi).
- [ ] **Port 3000** konflik kalau proses node lain pakai.

---

## 6. Perintah

```bash
cd backend
npm install            # pakai registry npmjs.org (npmmirror corrupt paket)
npm run check          # self-check validasi alias
npm start              # jalankan di http://localhost:3000
npm run dev            # nodemon
```

Smoke test (PowerShell — jangan pakai `&&`/`!`):

```powershell
curl.exe -s http://localhost:3000/health
curl.exe -s http://localhost:3000/api/temp-mail/domains
curl.exe -X POST -H "Content-Type: application/json" -d "{}" http://localhost:3000/api/temp-mail/generate
```

---

## 7. Catatan penting provider

- 1secmail: `getDomainList`, `getMessages?login=&domain=`, `readMessage?login=&domain=&id=`. Ambil login+domain dari alamat email. Tidak ada SMTP sendiri — alamat = `login@domain` valid selama domain ada di list.
- Guerrilla: stateful (`sid_token`). `get_email_address` → simpan `sid_token`; `check_email?seq=0&sid_token=` baca inbox. **Session hilang saat server restart** — email Guerrilla tidak bisa di-fetch lagi setelah restart.
- 1secmail umumnya bisa fetch inbox kapan saja (login+domain bebas) — tapi pastikan domain memang di list-nya.
- Emailnator: payload `generate` = `["plusGmail","dotGmail"]` → variasi gmail (dot/plus) — spesifikasi endpoint TIDAK TERVERIFIKASI terhadap API nyata.
- Vercel: `backend/data` → `/tmp` — alias hilang setiap deploy/restart. Untuk persistence permanen perlu penyimpanan eksternal (object storage).

---

_Terakhir diperbarui: 2026-08-17 (konteks kode dari sesi perbaikan)._