# Neko Mail Pro

Temp email berbasis **1secmail.com** dengan fallback **Guerrilla Mail**, plus custom alias lokal atau ForwardEmail.net.

## Fitur

- Generate mailbox sementara.
- Daftar dan baca inbox melalui polling 30 detik.
- Refresh inbox manual.
- Buat, daftar, hapus custom alias.
- Persist alias lokal ke `backend/data/aliases.json`.
- Rendering inbox dan alias tanpa `innerHTML` untuk data eksternal.

## Struktur

```text
temp-email-generator/
├── backend/
│   ├── src/
│   │   ├── config/index.js
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── sockets/
│   │   └── server.js
│   ├── .env
│   ├── package.json
│   └── package-lock.json
├── frontend/public/
│   ├── index.html
│   ├── css/style.css
│   └── js/
└── docs/README.md
```

## Menjalankan

```bash
cd backend
npm install
npm start
```

Buka `http://localhost:3000`.

Mode development:

```bash
npm run dev
```

## Konfigurasi

Salin contoh env lalu sesuaikan:

```bash
cp backend/.env.example backend/.env
```

`backend/.env`:

```env
PORT=3000
TEMP_MAIL_BASE_URL=https://www.1secmail.com/api/v1/
GUERRILLA_BASE_URL=https://api.guerrillamail.com/ajax.php
FORWARD_EMAIL_API_KEY=
CUSTOM_DOMAIN=mail.example.com
DEFAULT_DOMAIN=1secmail.com
CORS_ORIGIN=*
```

Untuk deploy, ganti `CORS_ORIGIN=*` dengan origin frontend sebenarnya. Jangan commit API key.

## Endpoint

### Temp mail

- `GET /api/temp-mail/domains`
- `POST /api/temp-mail/generate` — body `{ "domain": "..." }` (opsional)
- `POST /api/temp-mail/inbox` — body `{ "email": "..." }`
- `POST /api/temp-mail/refresh` — body `{ "email": "..." }`

### Alias

- `GET /api/alias/domains`
- `POST /api/alias/create` — body `{ "domain", "prefix", "forwardTo" }`
- `GET /api/alias/list?domain=...`
- `DELETE /api/alias/delete` — body `{ "domain", "prefix" }`

## Catatan provider

1secmail dan Guerrilla Mail bersifat polling-only. Socket.IO hanya menangani status koneksi dan subscription; frontend mengambil inbox tiap 30 detik. Fallback Guerrilla mempertahankan session selama proses backend berjalan.

Inbox provider publik. Jangan gunakan untuk password, token, atau data pribadi.
