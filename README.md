# 🤖 WhatsApp AI Channel Reactor

Bot WhatsApp otomatis yang memantau saluran WhatsApp pacar kamu (Acell/Ashelia/Melani) dan mengirim emoji reaction yang bervariasi serta natural dari hingga 30 akun WhatsApp berbeda. Ditenagai oleh model AI Google **Gemini 3.1 Flash Lite** dengan kepribadian unik untuk tiap akun.

Sistem ini didesain khusus agar ringan, tangguh, dan dapat dihosting di **Pterodactyl Panel** menggunakan **Node.js 20**.

---

## 🚀 Fitur Utama

- **Hingga 30 Akun WhatsApp**: Kelola banyak nomor WhatsApp sekaligus untuk react postingan agar saluran terlihat ramai.
- **Multimodal Gemini AI Support**: AI membaca pesan teks, melihat foto/stiker, video, dan dapat mendengar voice note (VN) untuk menentukan emoji yang tepat.
- **Natural Delay & Jitter**: Emoji tidak dikirim serentak. Bot me-react satu per satu secara bertahap (random delay 5 detik s/d 3 menit) seperti orang sungguhan.
- **Contextual Memory**: AI membaca riwayat 15 teks dari hari kemarin dan seluruh postingan hari ini sebelum memutuskan reaction.
- **Rate Limit Buffer**: Membaca quota free tier Gemini secara aman dengan buffer -2 (`13 RPM / 248.000 TPM / 498 RPD`) untuk menghindari error 429.
- **Browser QR Code Scanner**: Scan QR code untuk login akun WhatsApp langsung dari dashboard web (tanpa terminal).
- **Debug Mode & Discovery**: Jika ID Saluran belum diketahui, aktifkan Debug Mode untuk mencatat dan menyalin ID Saluran (JID) langsung dari log dashboard saat ada postingan baru.
- **Single Port System**: Express serve Dashboard + REST API + WebSocket (Socket.io) di satu port saja (Port 3000).

---

## 🛠️ Persyaratan System

- **Node.js**: Versi 20 atau di atasnya.
- **Database**: SQLite3 (Otomatis dibuat, tidak perlu setup database eksternal).
- **Pterodactyl Egg**: Node.js Egg.

---

## 📂 Struktur Proyek

```
.
├── src/
│   ├── index.js                  # Entry point, Express + Socket.io Server
│   ├── bot/
│   │   ├── manager.js            # Manajemen koneksi Baileys
│   │   ├── session.js            # Handler login QR & sesi Baileys
│   │   └── reactor.js            # Queue pengiriman reaction (delay)
│   ├── channel/
│   │   ├── monitor.js            # Polling saluran WhatsApp
│   │   ├── media.js              # Download & encode media (VN/Foto/Video/Stiker)
│   │   └── history.js            # Manajemen SQLite & AI Context
│   └── ai/
│       ├── gemini.js             # Client Gemini SDK (@google/genai)
│       ├── prompt.js             # Prompt Builder & JSON Output Schema
│       └── ratelimit.js          # Rate limiter RPM/TPM/RPD
├── public/
│   ├── index.html                # UI Dashboard
│   ├── style.css                 # Style Dashboard
│   └── app.js                    # Controller Dashboard (Socket.io/API Client)
├── data/                         # Folder sesi WA & SQLite (Persisten)
├── logs/                         # Folder output log PM2/Pino
├── config.json                   # Konfigurasi bot (Accounts, Channels, Settings)
├── ecosystem.config.js           # PM2 configuration
└── package.json
```

---

## ⚙️ Cara Instalasi & Menjalankan Lokal

1. Clone repositori ke direktori kerjamu.
2. Salin `.env.example` menjadi `.env` dan masukkan API Key Gemini kamu (atau bisa dimasukkan lewat web dashboard nanti):
   ```bash
   cp .env.example .env
   ```
3. Install dependensi proyek:
   ```bash
   npm install
   ```
4. Jalankan aplikasi dalam mode development:
   ```bash
   npm run dev
   ```
5. Buka dashboard di browsermu: `http://localhost:3000`.

---

## 📦 Panduan Hosting di Pterodactyl Panel

### Langkah 1: Buat Server Baru
- Pilih egg **Node.js** (pastikan menggunakan Node.js v20 atau v22).
- Atur Port server (misal `3000`).

### Langkah 2: Upload Files
- Upload semua file proyek Anda ke panel Pterodactyl (kecuali folder `node_modules` jika ada).
- Pastikan folder `data/` dan `logs/` diberikan izin read-write.

### Langkah 3: Setup Startup Command
Secara default, Node.js egg menggunakan startup script dari `package.json`.
Pastikan startup script Anda diatur seperti ini:
```bash
npm install && npm start
```
Atau jika menggunakan PM2 pada Pterodactyl:
```bash
npm install && npx pm2-runtime start ecosystem.config.js
```

### Langkah 4: Tautkan Nomor Bot WhatsApp
1. Buka dashboard web server Pterodactyl kamu di port yang sudah ditentukan.
2. Klik tombol **Tambah Akun** di tab **Akun Bot**.
3. Masukkan ID Akun (misal `bot_1`), Nama Tampilan, dan Kepribadian unik bot tersebut (misal: *"Fans garis keras Acell yang gemes banget"*).
4. Klik **Tambah & Connect**, pop-up QR Code akan muncul. Scan QR tersebut menggunakan aplikasi WhatsApp di HP kamu.
5. Ulangi proses ini untuk semua nomor bot WhatsApp yang ingin kamu gunakan (hingga 30 akun).

### Langkah 5: Cari & Tautkan ID Saluran Pacar
1. Pastikan **Debug Mode** di tab **Pengaturan** dalam kondisi **Aktif**.
2. Masuk ke tab **Debug Pesan** di dashboard.
3. Minta pacarmu membuat postingan baru di salurannya.
4. JID saluran pacarmu akan muncul di tabel debug (berakhiran `@newsletter` atau `@broadcast`).
5. Klik tombol **Gunakan** di kolom aksi pesan tersebut, lalu klik **Tambah Saluran** di pop-up modal.
6. Masuk ke tab **Pengaturan** dan matikan **Debug Mode** agar bot menghemat resource dan tidak mencatat pesan yang tidak perlu.

---

## ⚠️ Penanganan Limitasi & Ban
- **Delay Acak**: Jangan kurangi min delay di bawah 5 detik. Delay acak sangat penting untuk menghindari nomor dibanned oleh WhatsApp.
- **Listener Account**: Bot menggunakan 1 akun WA yang aktif sebagai penangkap postingan baru (listener). Pastikan akun listener ini terhubung ke saluran target sebagai subscriber agar dapat menerima pesan.
- **Gemini Free Tier**: Jika sering terkena error `429 (Rate Limit)`, sistem secara otomatis akan melakukan backoff dan antrian pengiriman reaction akan ditahan sementara sampai limit menit berikutnya terbuka. Anda bisa memantau sisa kuota RPM/RPD di pojok kiri bawah dashboard.
