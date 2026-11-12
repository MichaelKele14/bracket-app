# HKN MLBB SERIES 1 - Interactive Tournament Bracket Manager

Aplikasi web turnamen esports modern berbasis Node.js untuk turnamen Mobile Legends: Bang Bang (MLBB).
Diselenggarakan dalam rangka **Hari Kesehatan Nasional ke 62 Tahun** oleh **Dinas Kesehatan, RSUD Maria Walanda Maramis, dan Semua Puskesmas di Minahasa Utara**.

![Banner](public/index.html)

---

## ✨ Fitur Utama

- 🎮 **Bagan Turnamen Interaktif (Interactive Bracket)**: Bagan Single Elimination 14 tim dengan visual modern bernuansa esports.
- ⚡ **Auto-Advance & Real-time Sync**: Pemenang babak otomatis melaju ke babak berikutnya, disinkronkan secara instan ke semua penonton melalui *Server-Sent Events (SSE)*.
- 📱 **Mobile-First & Touch Friendly**: Tampilan bagan responsif di smartphone dengan dukungan gestures *pan* & *pinch-to-zoom*, serta kontrol *floating zoom*.
- 🛡️ **Role Separation (Admin & Penonton)**:
  - **Penonton**: Akses melihat bagan, skor, dan status laga secara langsung.
  - **Admin (PIN Auth)**: Atur skor, tetapkan pemenang pertandingan, input MVP (Player, Hero, KDA, Catatan), serta *drag-and-drop* tukar posisi tim.
- 🎥 **OBS Studio Streaming Overlay Ready**: URL khusus overlay transparan `?mode=overlay` tanpa header untuk kebutuhan siaran langsung livestreaming.
- 💾 **Zero-Dependency Native Storage**: Menggunakan native Node.js tanpa database berat eksternal, tersimpan aman di `data/bracket.json`.

---

## 🚀 Cara Menjalankan

### Persyaratan
- Node.js (v18 atau lebih baru)

### Menjalankan Server
```bash
git clone https://github.com/MichaelKele14/bracket-app.git
cd bracket-app
npm start
```

Akses di browser:
- **Tampilan Utama**: `http://localhost:3000`
- **Akses dari Handphone (Jaringan Wi-Fi Sama)**: `http://<IP-LAPTOP>:3000`
- **OBS Browser Source**: `http://localhost:3000?mode=overlay`

---

## 🔒 Akses Admin
- **PIN Default**: `1234`
- Buka Menu `[ ☰ Menu ]` di pojok kanan atas, pilih **Login Admin**, dan masukkan PIN untuk mengaktifkan mode pengelolaan.
