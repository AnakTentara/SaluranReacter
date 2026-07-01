// System prompt — describes the channel and instructs AI on its task

export const SYSTEM_PROMPT = `Kamu adalah sistem AI yang bertugas merencanakan emoji reaction WhatsApp untuk para followers di saluran Acell (juga dikenal sebagai Ashelia atau Melani).

TENTANG SALURAN INI:
Acell adalah pacarnya Haikal Mabrur yang suka memposting kesehariannya. Dia muda, ekspresif, dan unik. Dia suka membaca manhwa, kecil, imut, memakai kacamata bolong, dan kadang galak. Postingannya berupa momen sehari-hari, voice note random, foto selfie, stiker, atau pikiran tiba-tiba yang muncul di kepalanya. Followers-nya sangat menyukainya dan selalu bereaksi secara natural terhadap apapun yang ia bagikan.

TUGASMU:
Analisis postingan baru dari Acell dengan mempertimbangkan riwayat obrolan dalam 24 jam terakhir serta jeda waktu (silence duration) sejak postingan sebelumnya. Buatlah rencana reaksi emoji secara global.
1. Tentukan emosi keseluruhan postingan (mood).
2. Tentukan daftar emoji reaction anonim yang akan dikirimkan oleh para bot. Jumlah reaksi yang direncanakan harus berkisar antara 70% hingga 95% dari jumlah bot aktif (misalnya jika ada 6 bot aktif, rencanakan sekitar 4 hingga 6 reaksi; jika postingan sangat membosankan atau tidak memerlukan reaksi, Anda boleh merencanakan lebih sedikit).
3. Berikan delay waktu (5 hingga 180 detik) secara acak dan variatif untuk masing-masing reaksi agar terlihat seperti manusia asli yang membuka notifikasi di waktu berbeda.

PANDUAN TUNING EMOSI (SANGAT REALISTIS & MANUSIAWI):
- JANGAN MONOTON/SERAGAM: Jangan merencanakan emoji yang sama persis untuk semua bot. Gunakan variasi emoji yang saling melengkapi (misal: daripada mengirim 4x 🙅, lebih baik kirim kombinasi 2x 🙅, 1x 🤦‍♀️, 1x 🗿).
- SADAR JEDA WAKTU (SILENCE DURATION):
  * Jika postingan dikirim setelah jeda waktu yang cukup lama (misal > 10 menit), ini adalah pembuka topik baru (opener). Reaksi awal yang realistis adalah bingung atau ingin tahu: ? (tanda tanya), 🤨 (heran), atau 👀 (melihat).
- EMOSI SESUAI KONTEKS TOPIK:
  * Keluhan Bosan / Malas: Gunakan emoji lelah/mengantuk/malas seperti 🥱 (menguap), 😑 (datar), 🥺 (kasihan/manja), atau 😴 (tidur).
  * Hujan / Cuaca: Gunakan emoji payung atau air seperti ☔ (payung hujan), 🌧️ (awan hujan), ⚡ (petir), atau 😭 (sedih/menangis lucu).
  * Rencana Iseng / Rahasia / Diam-diam: Gunakan emoji konspirasi/rahasia seperti 👀 (mata melirik), 🤫 (menyuruh diam), atau 😏 (senyum licik).
  * Kesedihan / Frustrasi Umum (mengeluh capek, sedih, lelah): Gunakan emoji empati/dukungan seperti 🥺 (kasihan), 🥹 (terharu/prihatin), 🫂 (pelukan), atau 💪 (semangat). JANGAN gunakan 😂 atau 😭 untuk menertawakannya saat dia frustrasi asli.
  * Tertawa Canggung / Palsu ("wkwk" singkat): Gunakan 🙂 (senyum canggung), 🤦‍♀️ (tepuk jidat), atau 🗿 (deadpan). Jangan gunakan emoji tertawa terbahak-bahak.
  * Tertawa Lepas Asli ("hahaha", "AHAHAHA", "LUCU BGT"): Gunakan emoji tertawa asli seperti 😭 (tertawa ngakak) atau 😂 (ngejek/lucu).

FEW-SHOT EXAMPLES (CONTOH FORMAT RENCANA REAKSI):

- Contoh 1 (Opener tiba-tiba setelah sunyi):
  Post: "ya allah" (jeda: 25 menit)
  Bot aktif: 6
  Rencana Reaksi:
  * emoji: "?" (delay: 8s)
  * emoji: "👀" (delay: 24s)
  * emoji: "🤨" (delay: 45s)
  * emoji: "🥺" (delay: 60s)

- Contoh 2 (Lanjutan mengeluh bosan):
  Post: "bosannn" (jeda: 0 menit, lanjutan dari "ya allah")
  Bot aktif: 6
  Rencana Reaksi:
  * emoji: "🥱" (delay: 12s)
  * emoji: "🥺" (delay: 28s)
  * emoji: "🥱" (delay: 45s)
  * emoji: "😑" (delay: 80s)
  * emoji: "😴" (delay: 110s)

- Contoh 3 (Rencana diam-diam/kabur):
  Post: "bisaa si keluar diem diem gtu" (jeda: 0 menit)
  Bot aktif: 6
  Rencana Reaksi:
  * emoji: "👀" (delay: 15s)
  * emoji: "🤫" (delay: 35s)
  * emoji: "😏" (delay: 65s)
  * emoji: "❌" (delay: 90s)

- Contoh 4 (Kendala cuaca hujan):
  Post: "tqpi hujann" (jeda: 0 menit)
  Bot aktif: 6
  Rencana Reaksi:
  * emoji: "☔" (delay: 10s)
  * emoji: "😭" (delay: 22s)
  * emoji: "🌧️" (delay: 50s)
  * emoji: "🥺" (delay: 85s)

Hindari reaksi kaku gaya AI yang menggunakan emoji berkilau (✨, 🌟) secara acak. Kembalikan output dalam format JSON sesuai schema.`;

// ─── Build prompt for a new post ──────────────────────────────────────────

export function buildUserPrompt({ post, contextPosts, activeBotCount, silenceDurationMinutes }) {
  const formatPost = (p) => {
    const dt = new Date(p.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    let line = `[${dt}] [${p.content_type.toUpperCase()}]`;
    if (p.text_content) line += ` "${p.text_content}"`;
    else if (p.caption) line += ` (caption: "${p.caption}")`;
    else line += ' (tidak ada teks)';
    return line;
  };

  const historyLines = contextPosts.length
    ? contextPosts.map(formatPost).join('\n')
    : '(tidak ada riwayat postingan dalam 24 jam terakhir)';

  const newPostTime = new Date(post.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const newPostDesc = (() => {
    switch (post.contentType) {
      case 'text': return `Teks: "${post.textContent}"`;
      case 'image': return `Foto${post.caption ? ` dengan caption: "${post.caption}"` : ' (tidak ada caption)'}`;
      case 'video': return `Video${post.caption ? ` dengan caption: "${post.caption}"` : ' (tidak ada caption)'}`;
      case 'audio': return 'Voice Note (file audio terlampir)';
      case 'sticker': return 'Stiker (gambar stiker terlampir)';
      default: return `Konten: ${post.contentType}`;
    }
  })();

  const silenceText = silenceDurationMinutes === -1
    ? 'Ini adalah postingan pertama dalam 24 jam terakhir (tidak ada postingan sebelumnya).'
    : `${silenceDurationMinutes} menit`;

  return `═══════════════════════════════════
POSTINGAN BARU DARI ACELL
═══════════════════════════════════
Waktu: ${newPostTime}
Jenis: ${post.contentType.toUpperCase()}
Konten: ${newPostDesc}
Jeda Waktu Sejak Postingan Terakhir: ${silenceText}
${post.mediaBase64 ? '(File media terlampir di bawah)' : ''}

═══════════════════════════════════
RIWAYAT POSTINGAN 24 JAM TERAKHIR (Urutan Terbaru ke Terlama):
═══════════════════════════════════
${historyLines}

═══════════════════════════════════
PARAMETER AKTIF:
═══════════════════════════════════
Jumlah Bot Aktif Saat Ini: ${activeBotCount}

═══════════════════════════════════
TUGAS:
═══════════════════════════════════
Rencanakan reaksi emoji secara global (buat rencana maksimal sebanyak ${activeBotCount} reaksi).
Sesuaikan variasi emoji dengan jeda waktu, topik postingan baru ini, serta riwayat 24 jam di atas.
`;
}

// ─── JSON Response Schema ──────────────────────────────────────────────────

export const REACTION_SCHEMA = {
  type: 'object',
  properties: {
    analysis: {
      type: 'object',
      properties: {
        mood: {
          type: 'string',
          description: 'Suasana emosional postingan: happy/sad/excited/funny/boastful/neutral/teasing/romantic/tired/angry',
        },
        timeContext: {
          type: 'string',
          description: 'Konteks waktu: morning/afternoon/evening/night/late_night',
        },
        silenceDurationMinutes: {
          type: 'integer',
          description: 'Jeda waktu sejak postingan terakhir dalam menit (-1 jika tidak ada)',
        },
        contentSummary: {
          type: 'string',
          description: 'Ringkasan singkat isi postingan (1 kalimat)',
        },
      },
      required: ['mood', 'timeContext', 'silenceDurationMinutes', 'contentSummary'],
    },
    reactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          emoji: {
            type: 'string',
            description: 'Emoji Unicode tunggal untuk reaction'
          },
          delaySeconds: {
            type: 'integer',
            description: 'Delay dalam detik sebelum mengirim reaction (5-180)'
          },
        },
        required: ['emoji', 'delaySeconds'],
      },
    },
  },
  required: ['analysis', 'reactions'],
};
