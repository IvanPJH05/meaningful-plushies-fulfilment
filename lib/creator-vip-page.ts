import { creatorVipEnglish, creatorVipMalay } from "./creator-vip-markup";
import { renderCreatorTourMalay } from "./creator-tour-malay";
import { creatorTourMarkup } from "./creator-tour-markup";

const assets = "https://meaningful-plushies-fulfilment.vercel.app/creator-vip";

export function renderCreatorVipPage(path: string, malay: boolean) {
  const name = malay ? "Program Pencipta VIP" : "VIP Creator Program";
  const content = malay ? creatorVipMalay : creatorVipEnglish;
  const dialogStart = content.indexOf('<dialog id="creator-application"');
  const tour = malay ? renderCreatorTourMalay(creatorTourMarkup) : creatorTourMarkup;
  const page = tour.replace("__CREATOR_PROGRAM__", () => content.slice(0, dialogStart));
  const storefront = malay ? "/ms" : "";
  return `<!doctype html>
<html lang="${malay ? "ms" : "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} | Meaningful Plushies</title>
  <link rel="stylesheet" href="${assets}/program.css">
  <script src="${assets}/program.js" defer></script>
</head>
<body>
  <header class="creator-vip-header">
    <div class="creator-vip-header__top">
      <a class="creator-vip-header__logo" href="${storefront || "/"}"><img src="${assets}/Front_outside_29x17_19-bf239c186.png" alt="Meaningful Plushies"></a>
      <div class="creator-vip-header__actions">
        <a href="${storefront}/account" aria-label="${malay ? "Akaun" : "Account"}">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><circle cx="12" cy="7" r="3.5"/><path d="M5 20v-1a7 7 0 0 1 14 0v1Z"/></svg>
        </a>
        <a href="${storefront}/cart" aria-label="${malay ? "Troli" : "Cart"}">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3.5" y="7.5" width="17" height="13" rx="1.5"/><path d="M8 7.5v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </a>
      </div>
    </div>
    <nav aria-label="${malay ? "Bahasa" : "Language"}">
      <a href="${path}" lang="en"${malay ? "" : ' aria-current="page"'}>English</a>
      <a href="${path}?lang=ms" lang="ms"${malay ? ' aria-current="page"' : ""}>Malay</a>
    </nav>
  </header>
  <main><div class="shopify-section">${page.replaceAll("__CREATOR_VIP_ASSETS__", assets)}</div></main>
  ${content.slice(dialogStart).replaceAll("__CREATOR_VIP_ASSETS__", assets)}
</body>
</html>`;
}
