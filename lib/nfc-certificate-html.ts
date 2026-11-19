export type PublicNfcCertificate = {
  code: string; name: string; character: string; gender: string; birthDate: string;
  birthplace: string; favouritePerson: string; belongsTo: string; note: string;
};

function escapeLiquidHtml(value: string) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "{": "&#123;", "}": "&#125;" };
  return value.replace(/[&<>"'{}]/g, character => entities[character]);
}

export function nfcCertificateHtml(certificate?: PublicNfcCertificate, unavailable = false) {
  const styles = `<style>
  .mp-nfc-certificate{max-width:860px;margin:36px auto;padding:clamp(24px,5vw,56px);border:1px solid #d5e3e9;border-radius:20px;background:#f1f7fa;color:#294f60}
  .mp-nfc-certificate h1{margin:12px 0;color:inherit;font:inherit;font-size:clamp(32px,6vw,52px);font-weight:700;overflow-wrap:anywhere}
  .mp-nfc-certificate dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin:32px 0}
  .mp-nfc-certificate dt{font-size:13px;opacity:.8}.mp-nfc-certificate dd{margin:6px 0 0;font-size:18px;overflow-wrap:anywhere}
  .mp-nfc-certificate h2{font:inherit;font-size:20px;font-weight:700;color:inherit}.mp-nfc-certificate p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}
  @media(max-width:480px){.mp-nfc-certificate dl{grid-template-columns:1fr}}
  </style>`;
  if (!certificate) {
    const title = unavailable ? "Your certificate could not be loaded" : "Your plushie's link isn't active yet";
    const message = unavailable ? "Please refresh this page to try again." : "If you have just received this card, please contact Meaningful Plushies for help.";
    return `${styles}<section class="mp-nfc-certificate"><h1>${title}</h1><p>${message}</p></section>`;
  }
  const assets = "https://meaningful-plushies-fulfilment.vercel.app/nfc-certificate";
  const characters: Array<[RegExp, string, string]> = [
    [/tootsie/i, "tootsie", "Tootsie"], [/hunn?ie|hunny/i, "hunnie", "Hunnie"],
    [/dragon/i, "dragon-warrior", "Dragon Warrior"], [/billy/i, "billy", "Billy"],
  ];
  const character = characters.find(([pattern]) => pattern.test(certificate.character));
  const fields: Array<[string, string]> = [
    ["Gender", certificate.gender], ["Born on", certificate.birthDate], ["Birthplace", certificate.birthplace],
    ["Favourite person", certificate.favouritePerson], ["Belongs to", certificate.belongsTo],
  ];
  const certification = '<span>Certified Original Meaningful Plushie</span>'.repeat(4);
  return `<link rel="stylesheet" href="${assets}/certificate.css">
  <article class="mp-birth-certificate" aria-label="Plushie birth certificate">
    <div class="certified" aria-label="Certified Original Meaningful Plushie">
      <div class="certified-track" aria-hidden="true">
        <div class="certified-group">${certification}</div><div class="certified-group">${certification}</div>
      </div>
    </div>
    <picture aria-hidden="true">
      <source media="(min-width: 560px) and (orientation: landscape)" srcset="${assets}/earth-landscape.webp">
      <img class="globe" src="${assets}/earth-portrait.webp" width="1000" height="1500" alt="">
    </picture>
    <div class="certificate-layout">
      <section class="identity-panel" aria-label="Plushie identity">
        ${character ? `<div class="portrait-frame"><img class="portrait" src="${assets}/${character[1]}.webp?v=2" width="1080" height="1080" alt="${character[2]} character portrait" fetchpriority="high"></div>` : ""}
        <div class="name-panel"><h1>${escapeLiquidHtml(certificate.name || "Meaningful Plushie")}</h1></div>
      </section>
      <div class="information-panel">
        <section class="details-panel" aria-label="Certificate details">
          <dl>
            <div class="certificate-id"><dt>Certificate ID</dt><dd>${escapeLiquidHtml(certificate.code)}</dd></div>
            ${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeLiquidHtml(value || "—")}</dd></div>`).join("")}
          </dl>
        </section>
        ${certificate.note.trim() ? `<section class="note-panel" aria-label="Meaningful note">
          <img class="note-divider" src="${assets}/note-divider.webp" width="1080" height="108" alt="" aria-hidden="true">
          <h2>Meaningful Note</h2><p>${escapeLiquidHtml(certificate.note)}</p>
        </section>` : ""}
      </div>
    </div>
  </article>`;
}
