import { creatorVipEnglish, creatorVipMalay } from "./creator-vip-markup";

const assets = "https://meaningful-plushies-fulfilment.vercel.app/creator-vip";

export function renderCreatorVipPage(path: string, malay: boolean) {
  const name = malay ? "Program Pencipta VIP" : "VIP Creator Program";
  const content = (malay ? creatorVipMalay : creatorVipEnglish).replaceAll("__CREATOR_VIP_ASSETS__", assets);
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
    <a href="${malay ? "/ms" : "/"}"><img src="${assets}/Front_outside_29x17_19-bf239c186.png" alt="Meaningful Plushies"></a>
    <nav aria-label="${malay ? "Bahasa" : "Language"}">
      <a href="${path}" lang="en"${malay ? "" : ' aria-current="page"'}>English</a>
      <a href="${path}?lang=ms" lang="ms"${malay ? ' aria-current="page"' : ""}>Malay</a>
    </nav>
  </header>
  <main>${content}</main>
</body>
</html>`;
}
