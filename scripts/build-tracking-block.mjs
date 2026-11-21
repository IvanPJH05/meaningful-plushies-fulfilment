// Keep the app block's presentation in step with the existing public tracker.
import fs from 'node:fs/promises';
import postcss from 'postcss';
import { transformWithEsbuild } from 'vite';
const base='extensions/meaningful-plushie-customisation';
const original=await fs.readFile('public/order-tracking/index.html','utf8');
let markup=original.slice(original.indexOf('<main>')+6,original.indexOf('<script type="module"'))
  .replace(/<footer>[\s\S]*?<\/footer>/,'').replace('</main>','');
markup=markup.replace(/id="([^"]+)"/g,(_,id)=>`id="mp-tracking-{{ block.id }}-${id}" data-tracking="${id}"`)
  .replace('for="order"','for="mp-tracking-{{ block.id }}-order"')
  .replace('aria-labelledby="help-title"','aria-labelledby="mp-tracking-{{ block.id }}-help-title"')
  .replaceAll('name="channel"','name="mp-tracking-channel-{{ block.id }}"');
const schema={name:'Customer order tracking',target:'section',enabled_on:{templates:['page']},stylesheet:'customer-order-tracking.css',javascript:'customer-order-tracking.js',settings:[]};
await fs.writeFile(`${base}/blocks/customer-order-tracking.liquid`,`<mp-order-tracking class="mp-order-tracking" data-endpoint="/apps/closer/order-progress" lang="{{ request.locale.iso_code | escape }}" {{ block.shopify_attributes }}>\n<div class="mp-tracking-content">${markup}</div>\n<noscript>Please enable JavaScript to track your order.</noscript>\n</mp-order-tracking>\n{% schema %}\n${JSON.stringify(schema,null,2)}\n{% endschema %}\n`);
const selectIds=text=>text.replace(/#([a-z][\w-]*)/gi,'[data-tracking="$1"]');
let js=await fs.readFile('public/order-tracking/main.js','utf8');
js=js.replaceAll('document.querySelector','root.querySelector')
  .replace(/root\.querySelector\("#([^"\s]+)"\)/g,(_,id)=>`root.querySelector('[data-tracking="${id}"]')`)
  .replace('input[name="channel"]:checked','input[type="radio"]:checked').replaceAll('input[name="channel"]','input[type="radio"]')
  .replaceAll('fetch("/api/customer-order-progress",','fetch(root.dataset.endpoint,')
  .replace('document.documentElement.lang = language;','root.lang = language;')
  .replace('document.body.classList.toggle("embedded", options.get("embedded") === "1");','')
  .replace('setLanguage(options.get("lang"));','setLanguage((root.lang || document.documentElement.lang).toLowerCase().split("-")[0]);')
  .replace('const options = new URLSearchParams(location.search);','')
  .replace('root.querySelectorAll("[data-language]").forEach(choice => choice.setAttribute("aria-pressed", String(choice.dataset.language === language)));','')
  .replace('root.querySelectorAll("[data-language]").forEach(button => button.addEventListener("click", () => setLanguage(button.dataset.language)));','');
// Translation selectors are local to this block; do not change the theme language.
js=js.replace(/\["#([^"\s]+)([^"\n]*)",/g,(_,id,tail)=>`['[data-tracking="${id}"]${tail}',`);
js=js.replaceAll('const controller = new AbortController();','const controller = new AbortController();\n  root.pendingLookup = controller;');
const compiled=await transformWithEsbuild(`(() => {\nif (customElements.get('mp-order-tracking')) return;\ncustomElements.define('mp-order-tracking', class extends HTMLElement {\nconnectedCallback() {\nif (this.initialised) return;\nthis.initialised = true;\nconst root = this;\n${js}\n}\ndisconnectedCallback() { this.pendingLookup?.abort(); this.querySelector('dialog')?.close(); }\n});\n})();\n`,'customer-order-tracking.js',{minify:true,target:'es2020'});
await fs.writeFile(`${base}/assets/customer-order-tracking.js`,compiled.code);
const css=postcss.parse(await fs.readFile('public/order-tracking/style.css','utf8'));
// Shopify theme extensions do not allow font files. Inherit the actual theme font.
css.walkAtRules('font-face',rule=>rule.remove());
css.walkDecls('font-family',declaration=>{ declaration.value='inherit'; });
css.walkRules(rule=>{
  if(rule.parent.type==='atrule'&&/keyframes$/.test(rule.parent.name))return;
  const selectors=rule.selectors.filter(s=>!s.includes('.language-bar')&&!/(^|[\s>+])(?:\.header|\.brand|\.shop-nav|\.shop-actions|footer)(?:[\s.:>+]|$)/.test(s));
  if(!selectors.length){rule.remove();return;}
  rule.selectors=selectors.map(selector=>{
    selector=selectIds(selector).replaceAll(':root','.mp-order-tracking').replace(/\bbody\b/g,'.mp-order-tracking').replace(/\bmain\b/g,'.mp-tracking-content');
    return selector.startsWith('.mp-order-tracking')?selector:`.mp-order-tracking ${selector}`;
  });
});
let scoped=css.toString().replaceAll("'./grandstander-regular.woff2'","'./tracking-grandstander-regular.woff2'")
  .replaceAll("'./grandstander-bold.woff2'","'./tracking-grandstander-bold.woff2'").replaceAll("'./layers/7.png'","'./tracking-background.png'")
  .replaceAll("'./layers/earth-portrait.png'","'./tracking-background-mobile.png'").replaceAll('Grandstander','MPTrackingGrandstander');
// Override the old page-wide offset. The background belongs only to the app block.
scoped+='\n.shopify-app-block:has(> .mp-order-tracking){width:100%;min-width:0;align-self:stretch}\n.mp-order-tracking{width:100%;display:block;position:relative;isolation:isolate;min-height:420px;font-size:14px;line-height:1.5;background:#ceeeff;color:#355e72;padding:10px 0 35px}\n.mp-order-tracking:before{inset:0;z-index:-1}\n.mp-order-tracking .mp-tracking-content{max-width:1100px;margin:auto;padding:0 28px}\n.mp-order-tracking .language-bar{background:transparent;justify-content:flex-end}\n.mp-order-tracking button{min-height:0;min-width:0;letter-spacing:normal;text-transform:none;box-shadow:none}\n.mp-order-tracking button:after,.mp-order-tracking button:before{display:none}\n.mp-order-tracking [hidden]{display:none!important}\n@media(max-width:760px){.mp-order-tracking .mp-tracking-content{padding:0 18px}}\n';
await fs.writeFile(`${base}/assets/customer-order-tracking.css`,scoped);
await fs.copyFile('public/order-tracking/layers/7.png',`${base}/assets/tracking-background.png`);
await fs.copyFile('public/order-tracking/layers/earth-portrait.png',`${base}/assets/tracking-background-mobile.png`);
