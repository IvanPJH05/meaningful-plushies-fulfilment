const copy = new Map<string, string>([
  [
    "The Plushie Farm",
    "Ladang Plushie"
  ],
  [
    "Welcome to",
    "Selamat datang ke"
  ],
  [
    "Start Tour",
    "Mulakan lawatan"
  ],
  [
    "Customized voice. Talking plushie.",
    "Rakam suara anda. Plushie anda boleh bercakap."
  ],
  [
    "The new standard for plushies.",
    "Piawaian baharu untuk plushie."
  ],
  [
    "Over 1,000 meaningful moments created.",
    "Lebih 1,000 detik bermakna tercipta."
  ],
  [
    "Handmade with love.",
    "Buatan tangan penuh kasih sayang."
  ],
  [
    "Powered by NFC technology",
    "Menggunakan teknologi NFC"
  ],
  [
    "The future",
    "Masa depan"
  ],
  [
    "of plushies",
    "dunia plushie"
  ],
  [
    "Tap to access your plushie’s",
    "Sentuh kad untuk melihat"
  ],
  [
    "digital birth certificate.",
    "sijil kelahiran digital plushie anda."
  ],
  [
    "Meaningful ID NFC card",
    "Kad NFC Meaningful ID"
  ],
  [
    "Birth certificate with fictional details",
    "Contoh sijil kelahiran dengan butiran rekaan"
  ],
  [
    "Fully Customisable ID",
    "ID boleh disesuaikan sepenuhnya"
  ],
  [
    "Tootsie, the blue elephant plushie",
    "Tootsie, plushie gajah biru"
  ],
  [
    "Certificate ID",
    "ID sijil"
  ],
  [
    "Gender",
    "Jantina"
  ],
  [
    "Female",
    "Betina"
  ],
  [
    "Born on",
    "Tarikh lahir"
  ],
  [
    "Birthplace",
    "Tempat lahir"
  ],
  [
    "Plushie Farm",
    "Ladang Plushie"
  ],
  [
    "Favourite person",
    "Orang kesayangan"
  ],
  [
    "Belongs to",
    "Milik"
  ],
  [
    "Meaningful Note",
    "Pesanan bermakna"
  ],
  [
    "Sending you a little hug.",
    "Pelukan kecil untuk anda."
  ],
  [
    "Ultra",
    "Bunyi"
  ],
  [
    "Clear",
    "sangat"
  ],
  [
    "Sound",
    "jelas"
  ],
  [
    "Plushie voice speaker",
    "Pembesar suara plushie"
  ],
  [
    "Choose your speaker",
    "Pilih tempoh rakaman"
  ],
  [
    "Voice capacity",
    "Tempoh rakaman suara"
  ],
  [
    "5 seconds",
    "5 saat"
  ],
  [
    "10 seconds",
    "10 saat"
  ],
  [
    "20 seconds",
    "20 saat"
  ],
  [
    "Tap a duration to play an example",
    "Ketik tempoh rakaman untuk memainkan contoh"
  ],
  [
    "What customers think",
    "Kata pelanggan kami"
  ],
  [
    "Real Meaningful Moments",
    "Detik bermakna sebenar"
  ],
  [
    "Swipe to browse customer reviews",
    "Leret untuk melihat ulasan pelanggan"
  ],
  [
    "Previous review",
    "Ulasan sebelumnya"
  ],
  [
    "Next review",
    "Ulasan seterusnya"
  ],
  [
    "Scroll through the Plushie Farm",
    "Terokai Ladang Plushie"
  ],
  [
    "Previous item",
    "Bahagian sebelumnya"
  ],
  [
    "Next item",
    "Bahagian seterusnya"
  ],
  [
    "Close speaker example",
    "Tutup contoh rakaman"
  ],
  [
    "Play",
    "Mainkan"
  ],
  [
    "Pause",
    "Jeda"
  ],
  [
    "Video timeline",
    "Garis masa video"
  ],
  [
    "Mute",
    "Senyapkan"
  ],
  [
    "Unmute",
    "Hidupkan bunyi"
  ],
  [
    "“I love you. Here’s a little hug from me!”",
    "“Saya sayang awak. Ini pelukan kecil daripada saya!”"
  ],
  [
    "“Happy birthday! I wish I could be there to celebrate. Whenever you miss me, give this little plushie a squeeze.”",
    "“Selamat hari jadi! Kalaulah saya dapat meraikannya bersama awak. Bila awak rindukan saya, peluklah plushie kecil ini.”"
  ],
  [
    "“Hey, I know we don’t get to see each other as often as we’d like. So I made you a little friend to keep you company. Whenever you need a hug or just want to hear my voice, give it a squeeze. I’m thinking of you.”",
    "“Saya tahu kita tak dapat berjumpa sekerap yang kita mahukan. Jadi saya buatkan teman kecil ini untuk menemani awak. Bila awak perlukan pelukan atau mahu dengar suara saya, peluklah plushie ini. Saya sentiasa ingat pada awak.”"
  ],
  [
    "Name",
    "Nama"
  ],
  [
    "Use the arrows to move between scenes.\\n",
    "Gunakan anak panah untuk beralih antara bahagian.\\n"
  ],
  [
    "-second speaker",
    " saat"
  ],
  [
    " review audio",
    " audio ulasan"
  ],
  [
    "Clip sound",
    "Bunyi klip"
  ],
  [
    "Mute clip",
    "Senyapkan klip"
  ],
  [
    "Unmute clip",
    "Hidupkan bunyi klip"
  ]
]);

const parts = /(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->|<\/?[a-z][\w:-]*(?:[^"'<>]|"[^"]*"|'[^']*')*>)/gi;
const normalize = (value: string) => value.trim().replace(/\s+/g, " ");
const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escapeHtml = (value: string) => value.replace(/[&<>"]/g, character => entities[character]);

function translate(value: string) {
  const key = normalize(value);
  const review = /^Meaningful Plushies customer review (\d+)$/.exec(key);
  const text = review ? `Ulasan pelanggan Meaningful Plushies ${review[1]}` : copy.get(key);
  return text === undefined ? value : value.replace(/\S[\s\S]*\S|\S/, () => escapeHtml(text));
}

export function renderCreatorTourMalay(page: string) {
  return page.split(parts).map(part => {
    if (/^<script\b/i.test(part)) {
      return part.replace(/(["'])([^"'\r\n]*)\1/g, (phrase, quote, value) => {
        const translated = copy.get(value);
        return translated === undefined ? phrase : `${quote}${translated}${quote}`;
      });
    }
    if (/^<(?:style\b|!)/i.test(part)) return part;
    if (part.startsWith("<")) {
      return part.replace(/\b(?:alt|aria-label|title|placeholder)="([^"]+)"/g,
        (attribute, value) => attribute.replace(`"${value}"`, `"${translate(value)}"`));
    }
    return translate(part);
  }).join("");
}
