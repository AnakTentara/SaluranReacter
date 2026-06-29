#!/bin/sh
# ================================================================
# WA Reactor — Startup Script untuk Pterodactyl (HaikalDev Egg)
# ================================================================

echo "[WA Reactor] Checking dependencies..."

# Install npm dependencies jika node_modules belum ada atau package.json berubah
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.package-lock.json" ]; then
  echo "[WA Reactor] Running npm install..."
  npm install --omit=dev
fi

# Buat folder yang dibutuhkan kalau belum ada
mkdir -p data/sessions data/media_cache logs

echo "[WA Reactor] Starting bot..."
exec node src/index.js
