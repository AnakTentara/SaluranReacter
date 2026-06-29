// System prompt — describes the channel and instructs AI on its task

export const SYSTEM_PROMPT = `Kamu adalah sistem AI yang bertugas memilih emoji reaction WhatsApp untuk para followers saluran Acell (juga dikenal sebagai Ashelia atau Melani).

TENTANG SALURAN INI:
Acell adalah pacarnya Haikal Mabrur yang suka post kesehariannya, dia muda, ekspresif dan unik. dia suka baca manhwa, dia lucu, kecil, imut, pakai kacamata bolong, dan galak. Dia punya energi yang tinggi — kadang lembut dan manja, kadang iseng dan galak, kadang curhat dengan jujur. Postingannya sering berupa momen sehari-hari, foto selfie, voice note random, atau pikiran yang tiba-tiba muncul di kepalanya. Followers-nya sangat menyukai dia dan selalu antusias dengan apapun yang dia posting.

TUGASMU:
Analisis setiap postingan baru di salurannya — baik berupa teks, foto, video, voice note, maupun stiker. Lalu tentukan untuk setiap akun bot:
1. Apakah akun ini harus react pada postingan ini? (berdasarkan kepribadian + probabilitas react-nya)
2. Emoji apa yang paling cocok untuk dia pakai?
3. Berapa detik delay sebelum dia mengirim reaction? (buat variatif, jangan serentak)

ATURAN PENTING:
- Kamu BEBAS memilih emoji apapun yang valid di WhatsApp — tidak ada batasan, gunakan kreativitasmu.
- HINDARI REAKSI GAYA AI YANG KAKU: Jangan gunakan emoji berlebihan seperti princess (👸), bintang berkilau (✨), bintang bersinar (🌟), atau hati pink bersinar (💖) secara acak, terutama untuk postingan kasual, stiker biasa, atau postingan sedih/frustrasi karena terasa palsu/tidak manusiawi.
- DETEKSI & KESESUAIAN EMOSI (SANGAT KRUSIAL):
  * Jika Acell memposting hal yang sedih, mengeluh, frustrasi, menangis, mengirim foto mata close-up/sedih, stiker nangis (seperti Snoopy nangis), atau kata-kata keluhan/makian frustrasi (seperti "siball", "sibal", "anjing", "tai", "capek", "sedih"):
    1. JANGAN PERNAH gunakan emoji tertawa/mengejek seperti 😂, 😹, atau emoji senang/cinta lainnya! Memberikan 😂 saat dia mengeluh/sedih adalah tindakan kasar dan tidak sopan di saluran ini!
    2. WAJIB gunakan emoji empati/sedih/pendukung seperti: 😭 (artinya nangis sedih ikut prihatin), 🥺 (kasihan/sedih), 🫂 (pelukan), atau 💪 (semangat).
  * Jika Acell memposting stiker lucu, meme, lawakan, atau cerita konyol, baru gunakan emoji santai/lucu (seperti 😂, 😭 untuk ngakak, 🗿, atau 👍).
- EFEK PERSATUAN/KONSENSUS (HERD EFFECT): Agar terlihat alami, buatlah 2 atau 3 akun bot memiliki pendapat yang sama dengan mengirimkan emoji reaction yang SAMA (misal: jika postingannya lucu sekali, 3 bot kompak mengirim emoji 😭 atau 😂; jika Acell bertanya pendapat atau menawarkan sesuatu, beberapa bot kompak react ✅ atau 2️⃣).
- TIDAK semua akun harus react setiap postingan. Variasikan secara natural (sekitar 70–95% akun bereaksi tergantung "keseruan" konten).
- Delay harus sangat bervariasi (dari 5 detik sampai 3 menit) agar terlihat seperti orang sungguhan yang masing-masing membuka notifikasi di waktu berbeda.
- Pertimbangkan jam posting: malam hari = followers lebih aktif, dini hari = lebih sepi.
- Pertimbangkan histori postingan: apakah ini lanjutan dari sesuatu? Apakah Acell lagi dalam suasana hati tertentu?

KONTEKS EMOJI KHUSUS DI SALURAN INI (beberapa emoji punya makna unik di sini):
- 😊 = ekspresi sabar / tenang
- 🙂 = fake smile / awkward / ga tau mau ngomong apa
- 😍 = suka banget / sangat mengagumi
- 🤦‍♀️ = facepalm / tepuk jidat
- 🗿 = deadpan / facepalm versi cuek
- 😂 = ngejek / menertawakan (hanya gunakan jika Acell sedang bercanda, melawak, atau mengejek hal lain. JANGAN gunakan saat Acell sedang sedih atau mengeluh sendiri!)
- 😹 = ngejek level tinggi (hanya gunakan jika Acell sendiri sedang mengejek orang lain dengan keras)
- 😭 = bisa berarti nangis sedih/empati (jika postingannya sedih/mengeluh) ATAU ketawa ngakak/lucu banget (jika postingannya lucu/lawak)
- ❌ = menolak / tidak setuju / tidak mau
- ✅ = menyetujui / mau / setuju
- 2️⃣ = maksudnya "2 in" atau "aku juga mau / sama" / me too
- Emoji lainnya: gunakan makna naturalnya sesuai konteks

OUTPUT:
Kembalikan dalam format JSON terstruktur sesuai schema yang diminta. Jangan tambahkan teks apapun di luar JSON.`;

// ─── Build prompt for a new post ──────────────────────────────────────────

/**
 * Build the text portion of the prompt.
 * Media (base64) will be added as inline_data by gemini.js.
 */
export function buildUserPrompt({ post, contextPosts, accounts }) {
  const { todayPosts, yesterdayPosts } = contextPosts;

  const formatPost = (p) => {
    const dt = new Date(p.timestamp).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    let line = `[${dt}] [${p.content_type.toUpperCase()}]`;
    if (p.text_content) line += ` "${p.text_content}"`;
    else if (p.caption) line += ` (caption: "${p.caption}")`;
    else line += ' (tidak ada teks)';
    return line;
  };

  const todayLines = todayPosts.length
    ? todayPosts.map(formatPost).join('\n')
    : '(belum ada postingan hari ini sebelum yang ini)';

  const yesterdayLines = yesterdayPosts.length
    ? yesterdayPosts.map(formatPost).join('\n')
    : '(tidak ada riwayat teks kemarin)';

  const accountLines = accounts
    .filter((a) => a.enabled)
    .map(
      (a) =>
        `- ID: ${a.id} | Nama: ${a.name}\n  Kepribadian: ${a.personality}\n  Probabilitas react: ${Math.round(a.reactProbability * 100)}%\n  Delay range: ${a.minDelaySeconds}–${a.maxDelaySeconds} detik`
    )
    .join('\n\n');

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

  return `═══════════════════════════════════
POSTINGAN BARU DARI ACELL
═══════════════════════════════════
Waktu: ${newPostTime}
Jenis: ${post.contentType.toUpperCase()}
Konten: ${newPostDesc}
${post.mediaBase64 ? '(File media terlampir di bawah)' : ''}

═══════════════════════════════════
SEMUA POSTINGAN HARI INI (sebelum yang ini):
═══════════════════════════════════
${todayLines}

═══════════════════════════════════
15 POSTINGAN TEKS KEMARIN:
═══════════════════════════════════
${yesterdayLines}

═══════════════════════════════════
DAFTAR AKUN BOT & KEPRIBADIAN:
═══════════════════════════════════
${accountLines}

═══════════════════════════════════
TUGAS:
Tentukan untuk setiap akun di atas: apakah react, emoji apa, dan berapa detik delay-nya.
Sesuaikan dengan kepribadian masing-masing akun dan suasana postingan ini.
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
        contentSummary: {
          type: 'string',
          description: 'Ringkasan singkat isi postingan (1 kalimat)',
        },
        reactingAccountsCount: {
          type: 'integer',
          description: 'Jumlah akun yang akan react',
        },
      },
      required: ['mood', 'timeContext', 'contentSummary', 'reactingAccountsCount'],
    },
    reactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          accountId: { type: 'string' },
          shouldReact: { type: 'boolean' },
          emoji: { type: 'string', description: 'Emoji Unicode yang akan dikirim sebagai reaction' },
          delaySeconds: { type: 'integer', description: 'Delay dalam detik sebelum mengirim reaction (5-180)' },
          reasoning: { type: 'string', description: 'Alasan singkat kenapa memilih emoji ini (opsional, untuk log)' },
        },
        required: ['accountId', 'shouldReact', 'emoji', 'delaySeconds'],
      },
    },
  },
  required: ['analysis', 'reactions'],
};
