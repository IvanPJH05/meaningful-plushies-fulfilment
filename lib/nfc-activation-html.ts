export function nfcActivationHtml(endpoint: string, processing = false) {
  if (!/^\/[a-z0-9-]+\/[a-z0-9-]+\/n\/[a-f0-9]{32}\/activate$/.test(endpoint)) throw new Error("Invalid activation endpoint.");
  const assets = "https://meaningful-plushies-fulfilment.vercel.app/nfc-certificate";
  return `<link rel="stylesheet" href="${assets}/certificate.css">
  <section class="mp-nfc-activation" data-nfc-activation data-endpoint="${endpoint}" data-processing="${processing}">
    <div data-nfc-introduction ${processing ? "hidden" : ""}>
      <h1>Make this plushie yours</h1>
      <p>Your card is ready to customise. Add your plushie’s details to activate its birth certificate.</p>
      <button type="button" data-nfc-customise>Customise</button>
    </div>
    <form data-nfc-phone-form hidden>
      <h2>Find your order</h2>
      <fieldset class="mp-nfc-activation__methods"><legend>Where did you place your order?</legend>
        <label><input name="verificationMethod" type="radio" value="phone" checked>Website / WhatsApp</label>
        <label><input name="verificationMethod" type="radio" value="tiktok">TikTok Shop</label>
      </fieldset>
      <label data-nfc-phone-field>Order phone number<input name="phone" type="tel" autocomplete="tel" required maxlength="50" placeholder="0123456789"></label>
      <label data-nfc-tiktok-field hidden>Last 6 digits of your TikTok order ID<input name="orderDigits" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="off" required disabled placeholder="123456"></label>
      <label data-nfc-full-order-field hidden>Full TikTok order ID<input name="fullOrderId" inputmode="numeric" pattern="[0-9]{8,32}" minlength="8" maxlength="32" autocomplete="off" required disabled></label>
      <button type="submit">Continue</button>
    </form>
    <form data-nfc-details-form hidden>
      <h2>Your plushie’s birth certificate</h2>
      <label>Choose your plushie<select name="orderId" required></select></label>
      <div class="mp-nfc-activation__fields">
        <label>Character<select name="character" required><option value="">Choose a character</option><option>Billy</option><option>Tootsie</option><option>Hunnie</option><option>Dragon Warrior</option></select></label>
        <label>Plushie’s name<input name="plushName" required maxlength="100" autocomplete="off"></label>
        <label>Gender<input name="plushGender" maxlength="40" autocomplete="off"></label>
        <label>Born on<input name="plushBirthDate" type="date"></label>
        <label>Birthplace<input name="plushBirthPlace" maxlength="150" autocomplete="off"></label>
        <label>Favourite person<input name="plushFavouritePerson" maxlength="150" autocomplete="off"></label>
        <label>Belongs to<input name="plushBelongsTo" maxlength="150" autocomplete="off"></label>
      </div>
      <label>Meaningful note<textarea name="meaningfulNote" rows="5" maxlength="4000"></textarea></label>
      <p>Check your details before activating this card.</p>
      <button type="submit">Save details &amp; activate card</button>
      <button type="button" data-nfc-change-phone>Verify order again</button>
    </form>
    <div data-nfc-processing ${processing ? "" : "hidden"}>
      <h2>Your details are saved</h2><p>Your card is linked to your plushie. We’re preparing its birth certificate.</p>
      <button type="button" data-nfc-check hidden>Check certificate</button>
    </div>
    <p data-nfc-feedback role="status" aria-live="polite"></p>
  </section>
  <script src="${assets}/activation.js" defer></script>`;
}
