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
  const fields: Array<[string, string]> = [
    ["Certificate number", certificate.code], ["Gender", certificate.gender], ["Date of birth", certificate.birthDate],
    ["Place of birth", certificate.birthplace], ["Favourite person", certificate.favouritePerson], ["Belongs to", certificate.belongsTo],
  ];
  return `${styles}<article class="mp-nfc-certificate" aria-label="Plushie birth certificate">
    <p>Birth certificate</p><h1>${escapeLiquidHtml(certificate.name || "Meaningful Plushie")}</h1>
    <p>${escapeLiquidHtml(certificate.character)}</p>
    <dl>${fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeLiquidHtml(value || "—")}</dd></div>`).join("")}</dl>
    ${certificate.note.trim() ? `<section><h2>A meaningful note</h2><p>${escapeLiquidHtml(certificate.note)}</p></section>` : ""}
  </article>`;
}
