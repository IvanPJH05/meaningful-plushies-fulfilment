(() => {
  document.querySelectorAll("[data-customisation-block]").forEach((block) => {
    const now = block.querySelector("[data-complete-now]");
    const later = block.querySelector(".mp-deferred-customisation__later");
    const method = block.querySelector("[data-delivery-method]");
    const emailField = block.querySelector("[data-email-field]");
    const phoneField = block.querySelector("[data-phone-field]");
    const email = block.querySelector("[data-contact-email]");
    const phone = block.querySelector("[data-contact-phone]");
    const notice = block.querySelector("[data-notice]");
    const plushName = block.querySelector("[data-plush-name]");
    const voiceInput = block.querySelector("[data-voice]");
    const voiceButton = block.querySelector("[data-voice-button]");
    const birthDate = block.querySelector("[data-birth-date]");
    const dateDisplay = block.querySelector("[data-date-display]");
    const dateBox = block.querySelector(".mp-deferred-customisation__date");
    const radios = block.querySelectorAll("input[type=radio]");
    const apiUrl = (block.dataset.apiUrl || "").replace(/\/$/, "");
    const form = block.closest("form[action*='/cart/add']") || document.querySelector("form[action*='/cart/add']");
    if (!form) return;
    const language = /^ms(?:-|$)/i.test(block.dataset.locale || "") ? "ms" : "en";
    const translations = {
      en: {
        completeNow: "Complete it now", fillLater: "Fill it in later", plushNameLabel: "Plushie's Name", plushNamePlaceholder: "NAME YOUR PLUSHIE", genderLabel: "Plushie's Gender", male: "Male", female: "Female", birthDateLabel: "Plushie's Birth Date", meaningfulDate: "A meaningful date", birthPlaceLabel: "Plushie's Birth Place", meaningfulPlace: "A meaningful place", favouritePersonLabel: "Plushie's Favourite Person", meaningfulPerson: "A meaningful person", belongsToLabel: "Plushie Belongs To", plushOwner: "The plushie's owner", meaningfulNoteLabel: "Meaningful Note", meaningfulNotePlaceholder: "A message for the plushie's owner", uploadVoiceLabel: "Upload Your Voice Here", uploadVoiceButton: "UPLOAD VOICE (MP4/MP3)", sendLinkBy: "Send my link by", email: "Email", emailLinkNotice: "A link to customise your plushie will be sent to your email", whatsappLinkNotice: "A link to customise your plushie will be sent to your WhatsApp",
        completeFirst: "PLEASE COMPLETE CUSTOMISATION FIRST", enterWhatsApp: "ENTER A VALID WHATSAPP NUMBER FIRST", enterEmail: "ENTER A VALID EMAIL ADDRESS FIRST", incompleteError: "Please complete every birth certificate field and upload your voice recording before adding to cart or checking out.", contactError: "Please enter a valid {contact} before adding to cart or checking out.", whatsappNumber: "WhatsApp number", emailAddress: "email address", notConfigured: "Customisation is not configured yet. Please contact us.", preparingLink: "Preparing your secure customisation link…", paired: "Your link will be paired with this order after checkout.", saving: "Saving your customisation…", saved: "Your customisation is saved and will be linked to this order.", uploadVoiceError: "Please upload your voice recording.", unavailable: "This customisation link is no longer available.",
      },
      ms: {
        completeNow: "Lengkapkan sekarang", fillLater: "Isi kemudian", plushNameLabel: "Nama Plushie", plushNamePlaceholder: "NAMA PLUSHIE ANDA", genderLabel: "Jantina Plushie", male: "Lelaki", female: "Perempuan", birthDateLabel: "Tarikh Lahir Plushie", meaningfulDate: "Tarikh yang bermakna", birthPlaceLabel: "Tempat Lahir Plushie", meaningfulPlace: "Tempat yang bermakna", favouritePersonLabel: "Orang Kegemaran Plushie", meaningfulPerson: "Orang yang bermakna", belongsToLabel: "Plushie Milik", plushOwner: "Pemilik plushie", meaningfulNoteLabel: "Nota Bermakna", meaningfulNotePlaceholder: "Mesej untuk pemilik plushie", uploadVoiceLabel: "Muat Naik Suara Anda Di Sini", uploadVoiceButton: "MUAT NAIK SUARA (MP4/MP3)", sendLinkBy: "Hantar pautan saya melalui", email: "E-mel", emailLinkNotice: "Pautan untuk menyesuaikan plushie anda akan dihantar ke e-mel anda", whatsappLinkNotice: "Pautan untuk menyesuaikan plushie anda akan dihantar ke WhatsApp anda",
        completeFirst: "SILA LENGKAPKAN PENYESUAIAN DAHULU", enterWhatsApp: "MASUKKAN NOMBOR WHATSAPP YANG SAH", enterEmail: "MASUKKAN ALAMAT E-MEL YANG SAH", incompleteError: "Sila lengkapkan semua maklumat sijil kelahiran dan muat naik rakaman suara sebelum menambah ke troli atau membuat pembayaran.", contactError: "Sila masukkan {contact} yang sah sebelum menambah ke troli atau membuat pembayaran.", whatsappNumber: "nombor WhatsApp", emailAddress: "alamat e-mel", notConfigured: "Penyesuaian belum disediakan. Sila hubungi kami.", preparingLink: "Menyediakan pautan penyesuaian selamat anda…", paired: "Pautan anda akan dipadankan dengan pesanan ini selepas pembayaran.", saving: "Menyimpan penyesuaian anda…", saved: "Penyesuaian anda telah disimpan dan akan dipadankan dengan pesanan ini.", uploadVoiceError: "Sila muat naik rakaman suara anda.", unavailable: "Pautan penyesuaian ini tidak lagi tersedia.",
      },
    };
    const t = (key, values = {}) => String(translations[language][key] || translations.en[key] || key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] || ""));
    block.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n); });
    block.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder)); });
    const draftKey = `mp-customisation-draft:${location.pathname}`;
    const draftFields = ["[data-plush-name]", "[data-gender]", "[data-birth-date]", "[data-birth-place]", "[data-favourite-person]", "[data-belongs-to]", "[data-meaningful-note]", "[data-delivery-method]", "[data-contact-email]", "[data-contact-phone]"];
    let restoredVoiceFile = null;
    let preparedUpload = null;
    let uploadPromise = null;
    let earlySavePromise = null;
    let earlySaveTimer = null;
    let savedCompleteNowFingerprint = "";

    const selectedVoice = () => voiceInput.files?.[0] || restoredVoiceFile || null;
    const updateVoiceLabel = () => { voiceButton.textContent = selectedVoice()?.name || voiceInput.value.split(/[/\\\\]/).pop() || t("uploadVoiceButton"); };
    const uploadVoiceEarly = async () => {
      const voice = selectedVoice();
      if (!voice || isLater() || !apiUrl) return null;
      if (preparedUpload?.file === voice) return preparedUpload;
      if (uploadPromise) return uploadPromise;
      uploadPromise = (async () => {
        notice.textContent = "Uploading your voice…";
        const session = await request("/api/customisation/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "complete_now" }) });
        const prepared = await request(`/api/customisation/${encodeURIComponent(session.token)}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: voice.name, contentType: voice.type }) });
        const storage = await fetch(prepared.upload.signedUrl, { method: "PUT", headers: { "x-upsert": "false", "Content-Type": voice.type || "application/octet-stream" }, body: voice });
        if (!storage.ok) throw new Error("Could not upload your file.");
        preparedUpload = { file: voice, session, voiceStoragePath: prepared.upload.path };
        notice.textContent = "Voice uploaded. Ready to add to cart.";
        return preparedUpload;
      })();
      try { return await uploadPromise; } finally { uploadPromise = null; }
    };
    const openDraftDatabase = () => new Promise((resolve, reject) => {
      const request = indexedDB.open("meaningful-plushies-customisation", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("voices");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const saveVoiceDraft = async (file) => {
      if (!file) return;
      try {
        const database = await openDraftDatabase();
        const transaction = database.transaction("voices", "readwrite");
        transaction.objectStore("voices").put({ file, savedAt: Date.now() }, draftKey);
      } catch (_) { /* The fields still persist if browser storage is unavailable. */ }
    };
    const loadVoiceDraft = async () => {
      try {
        const database = await openDraftDatabase();
        const transaction = database.transaction("voices", "readonly");
        const request = transaction.objectStore("voices").get(draftKey);
        return await new Promise((resolve) => { request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(null); });
      } catch (_) { return null; }
    };
    const saveDraft = () => {
      try {
        const values = Object.fromEntries(draftFields.map((selector) => [selector, block.querySelector(selector)?.value || ""]));
        values.choice = [...radios].find((radio) => radio.checked)?.value || "now";
        sessionStorage.setItem(draftKey, JSON.stringify(values));
      } catch (_) { /* Storage is optional; the checkout flow continues normally. */ }
    };
    const restoreDraft = async () => {
      try {
        const saved = JSON.parse(sessionStorage.getItem(draftKey) || "null");
        if (saved) {
          draftFields.forEach((selector) => { const field = block.querySelector(selector); if (field && saved[selector]) field.value = saved[selector]; });
          const choice = [...radios].find((radio) => radio.value === saved.choice);
          if (choice) choice.checked = true;
          if (birthDate.value) { dateDisplay.textContent = birthDate.value; dateDisplay.classList.add("is-filled"); }
        }
      } catch (_) { /* Ignore an invalid old draft. */ }
      const voiceDraft = await loadVoiceDraft();
      // Keep one day of local recovery only. This is browser-local and is not uploaded.
      if (voiceDraft?.file && Date.now() - voiceDraft.savedAt < 24 * 60 * 60 * 1000) {
        restoredVoiceFile = voiceDraft.file;
        updateVoiceLabel();
      }
      sync();
    };

    const isLater = () => [...radios].some((radio) => radio.checked && radio.value === "later");
    const purchaseControls = () => [...form.querySelectorAll("button, input[type='submit']")].filter((control) => {
      const ownerForm = control.form || control.closest("form");
      return ownerForm === form && (control.type === "submit" || control.name === "add" || Boolean(control.closest(".shopify-payment-button")));
    });
    const setRequired = (container, required) => container.querySelectorAll("input, select, textarea").forEach((input) => { input.required = required; });
    // Some mobile storefront browsers briefly expose a selected file through
    // the input value before they populate FileList. Treat either state as a
    // selected recording so the purchase lock releases immediately.
    const hasVoiceRecording = () => Boolean(selectedVoice() || voiceInput.value);
    const completeNowReady = () => {
      return Boolean(
        plushName.value.trim()
        && block.querySelector("[data-gender]").value
        && birthDate.value.trim()
        && block.querySelector("[data-birth-place]").value.trim()
        && block.querySelector("[data-favourite-person]").value.trim()
        && block.querySelector("[data-belongs-to]").value.trim()
        && block.querySelector("[data-meaningful-note]").value.trim()
        && hasVoiceRecording(),
      );
    };
    const laterReady = () => {
      if (!isLater()) return true;
      const contact = method.value === "whatsapp" ? phone : email;
      return Boolean(contact.value.trim() && contact.checkValidity());
    };
    const purchaseReady = () => isLater() ? laterReady() : completeNowReady();
    const syncDelivery = () => {
      const useWhatsApp = method.value === "whatsapp";
      emailField.hidden = useWhatsApp;
      phoneField.hidden = !useWhatsApp;
    };
    let purchaseBlockers = [];
    const clearPurchaseBlockers = () => {
      purchaseBlockers.forEach(({ blocker }) => blocker.remove());
      purchaseBlockers = [];
      purchaseControls().forEach((control) => {
        control.removeAttribute("aria-disabled");
        control.removeAttribute("data-mp-customisation-locked");
      });
    };
    const positionPurchaseBlockers = () => {
      purchaseBlockers.forEach(({ blocker, control }) => {
        const rect = control.getBoundingClientRect();
        blocker.style.top = `${rect.top}px`;
        blocker.style.left = `${rect.left}px`;
        blocker.style.width = `${rect.width}px`;
        blocker.style.height = `${rect.height}px`;
      });
    };
    const syncPurchaseBlockers = () => {
      clearPurchaseBlockers();
      if (purchaseReady()) return;
      purchaseControls().forEach((control) => {
        control.setAttribute("aria-disabled", "true");
        control.setAttribute("data-mp-customisation-locked", "");
        const blocker = document.createElement("button");
        blocker.type = "button";
        blocker.className = "mp-purchase-blocker";
        blocker.setAttribute("aria-label", "Complete your customisation before purchasing");
        const message = isLater() ? (method.value === "whatsapp" ? t("enterWhatsApp") : t("enterEmail")) : t("completeFirst");
        blocker.innerHTML = `<span class="mp-purchase-blocker__lock" aria-hidden="true">🔒</span><span>${message}</span>`;
        document.body.appendChild(blocker);
        purchaseBlockers.push({ blocker, control });
      });
      positionPurchaseBlockers();
    };
    const sync = () => {
      later.hidden = !isLater();
      now.hidden = isLater();
      setRequired(now, !isLater());
      email.required = isLater() && method.value === "email";
      phone.required = isLater() && method.value === "whatsapp";
      syncDelivery();
      syncPurchaseBlockers();
      notice.textContent = "";
    };
    radios.forEach((radio) => radio.addEventListener("change", () => { sync(); saveDraft(); }));
    method.addEventListener("change", () => { syncDelivery(); syncPurchaseBlockers(); saveDraft(); });
    plushName.addEventListener("input", () => { plushName.value = plushName.value.toUpperCase(); saveDraft(); });
    const wordCaps = (input) => { input.value = input.value.replace(/(^|[\s-])([a-z])/g, (_, lead, letter) => `${lead}${letter.toUpperCase()}`); };
    ["[data-birth-place]", "[data-favourite-person]", "[data-belongs-to]"].forEach((selector) => block.querySelector(selector).addEventListener("blur", (event) => wordCaps(event.currentTarget)));
    now.querySelectorAll("input, select, textarea").forEach((field) => {
      field.addEventListener("input", () => { notice.textContent = ""; syncPurchaseBlockers(); saveDraft(); scheduleCompleteNowSave(); });
      field.addEventListener("change", () => { notice.textContent = ""; syncPurchaseBlockers(); saveDraft(); scheduleCompleteNowSave(); });
      field.addEventListener("blur", () => { syncPurchaseBlockers(); saveDraft(); scheduleCompleteNowSave(); });
    });
    later.querySelectorAll("input, select").forEach((field) => {
      field.addEventListener("input", () => { notice.textContent = ""; syncPurchaseBlockers(); saveDraft(); });
      field.addEventListener("change", () => { notice.textContent = ""; syncPurchaseBlockers(); saveDraft(); });
      field.addEventListener("blur", () => { syncPurchaseBlockers(); saveDraft(); });
    });
    voiceInput.addEventListener("change", () => { restoredVoiceFile = voiceInput.files?.[0] || null; preparedUpload = null; savedCompleteNowFingerprint = ""; updateVoiceLabel(); saveVoiceDraft(restoredVoiceFile); saveDraft(); syncPurchaseBlockers(); void uploadVoiceEarly().then(() => scheduleCompleteNowSave()).catch((error) => { notice.textContent = error instanceof Error ? error.message : "Could not upload your file."; }); });
    const calendar = document.createElement("div");
    calendar.className = "mp-deferred-customisation__calendar";
    calendar.hidden = true;
    document.body.appendChild(calendar);
    let calendarMonth = new Date();
    const formatDate = (date) => date.toLocaleDateString("en-GB");
    const renderCalendar = () => {
      const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const lastDate = new Date(year, month + 1, 0).getDate();
      const weeks = (language === "ms" ? ["A", "I", "S", "R", "K", "J", "S"] : ["S", "M", "T", "W", "T", "F", "S"]).map((day) => `<div class="mp-deferred-customisation__calendar-weekday">${day}</div>`).join("");
      const blanks = Array.from({ length: firstDay }, () => "<span></span>").join("");
      const days = Array.from({ length: lastDate }, (_, index) => {
        const day = index + 1, value = formatDate(new Date(year, month, day));
        return `<button type="button" data-day="${day}" class="${birthDate.value === value ? "is-selected" : ""}">${day}</button>`;
      }).join("");
      const months = Array.from({ length: 12 }, (_, index) => `<option value="${index}" ${index === month ? "selected" : ""}>${new Date(year, index, 1).toLocaleDateString(language === "ms" ? "ms-MY" : "en-GB", { month: "long" })}</option>`).join("");
      const latestYear = new Date().getFullYear() + 1;
      const years = Array.from({ length: latestYear - 1900 + 1 }, (_, index) => latestYear - index).map((value) => `<button type="button" data-calendar-year="${value}" class="${value === year ? "is-selected" : ""}">${value}</button>`).join("");
      calendar.innerHTML = `<div class="mp-deferred-customisation__calendar-head"><button type="button" data-month="-1" aria-label="Previous month">‹</button><span class="mp-deferred-customisation__calendar-selects"><select aria-label="Month" data-calendar-month>${months}</select><button type="button" data-year-toggle aria-label="Choose year">${year}<span aria-hidden="true">▾</span></button></span><button type="button" data-month="1" aria-label="Next month">›</button><div class="mp-deferred-customisation__calendar-years" hidden>${years}</div></div><div class="mp-deferred-customisation__calendar-grid">${weeks}${blanks}${days}</div>`;
    };
    calendar.addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target) return;
      if (target.dataset.yearToggle !== undefined) { const years = calendar.querySelector(".mp-deferred-customisation__calendar-years"); years.hidden = !years.hidden; return; }
      if (target.dataset.month) { calendarMonth.setMonth(calendarMonth.getMonth() + Number(target.dataset.month)); renderCalendar(); return; }
      if (target.dataset.calendarYear) { calendarMonth.setFullYear(Number(target.dataset.calendarYear)); renderCalendar(); return; }
      if (target.dataset.day) {
        const selected = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), Number(target.dataset.day));
        birthDate.value = formatDate(selected);
        dateDisplay.textContent = birthDate.value;
        dateDisplay.classList.add("is-filled");
        calendar.hidden = true;
        birthDate.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    calendar.addEventListener("change", (event) => {
      if (event.target.matches("[data-calendar-month]")) calendarMonth.setMonth(Number(event.target.value));
      renderCalendar();
    });
    calendar.addEventListener("pointerdown", (event) => {
      if (event.target.matches("[data-calendar-month]")) calendar.querySelector(".mp-deferred-customisation__calendar-years").hidden = true;
    });
    dateBox.addEventListener("click", () => {
      const selected = birthDate.value.split("/");
      calendarMonth = selected.length === 3 ? new Date(Number(selected[2]), Number(selected[1]) - 1, Number(selected[0])) : new Date();
      const rect = dateBox.getBoundingClientRect();
      calendar.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 360)}px`;
      calendar.style.left = `${Math.min(rect.left, window.innerWidth - 356)}px`;
      renderCalendar();
      calendar.hidden = false;
    });
    document.addEventListener("pointerdown", (event) => { if (!calendar.hidden && !calendar.contains(event.target) && !dateBox.contains(event.target)) calendar.hidden = true; });
    sync();
    restoreDraft();

    const appendSessionId = (id) => {
      let input = form.querySelector("input[name='properties[customisation_session_id]']");
      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.name = "properties[customisation_session_id]";
        form.appendChild(input);
      }
      input.value = id;
    };
    // Mirror Upload Lift's line-item properties so the birth-certificate
    // details are immediately visible inside the Shopify order as well as in
    // the fulfilment workspace.
    const appendOrderProperty = (key, value) => {
      const propertyName = `properties[${key}]`;
      let input = form.querySelector(`input[name="${CSS.escape(propertyName)}"]`);
      if (!input) {
        input = document.createElement("input");
        input.type = "hidden";
        input.name = propertyName;
        form.appendChild(input);
      }
      input.value = value || "";
    };
    const appendCompleteNowProperties = (details, voiceStoragePath, token) => {
      appendOrderProperty("Name", details.plushName);
      appendOrderProperty("Gender", details.gender);
      appendOrderProperty("Born On", details.birthDate);
      appendOrderProperty("Birthplace", details.birthPlace);
      appendOrderProperty("Favourite Person", details.favouritePerson);
      appendOrderProperty("Belongs To", details.belongsTo);
      appendOrderProperty("Meaningful Note", details.meaningfulNote);
      const fileName = selectedVoice()?.name || "meaningful-plushie-voice";
      const voiceLink = `${apiUrl}/api/customisation/audio-download?path=${encodeURIComponent(voiceStoragePath)}&filename=${encodeURIComponent(fileName)}`;
      appendOrderProperty("Meaningful Message", voiceLink);
      // Retain the token only as an internal property for recovery/support.
      appendOrderProperty("_customisation_token", token);
    };
    const request = async (path, options) => {
      const response = await fetch(`${apiUrl}${path}`, options);
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not save your customisation.");
      return result;
    };
    const formData = () => ({
      plushName: block.querySelector("[data-plush-name]").value.trim(),
      gender: block.querySelector("[data-gender]").value,
      birthDate: block.querySelector("[data-birth-date]").value.trim(),
      birthPlace: block.querySelector("[data-birth-place]").value.trim(),
      favouritePerson: block.querySelector("[data-favourite-person]").value.trim(),
      belongsTo: block.querySelector("[data-belongs-to]").value.trim(),
      meaningfulNote: block.querySelector("[data-meaningful-note]").value.trim(),
    });

    const completeNowFingerprint = (details, upload) => JSON.stringify({ details, voiceStoragePath: upload.voiceStoragePath });
    const saveCompleteNowEarly = async () => {
      if (isLater() || !completeNowReady() || !apiUrl) return null;
      const upload = await uploadVoiceEarly();
      if (!upload) return null;
      const details = formData();
      const fingerprint = completeNowFingerprint(details, upload);
      if (savedCompleteNowFingerprint === fingerprint) return upload;
      if (earlySavePromise) return earlySavePromise;
      earlySavePromise = request(`/api/customisation/${encodeURIComponent(upload.session.token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form: details, voiceStoragePath: upload.voiceStoragePath }),
      }).then(() => {
        savedCompleteNowFingerprint = fingerprint;
        return upload;
      }).finally(() => { earlySavePromise = null; });
      return earlySavePromise;
    };
    const scheduleCompleteNowSave = () => {
      if (earlySaveTimer) window.clearTimeout(earlySaveTimer);
      if (isLater() || !completeNowReady()) return;
      earlySaveTimer = window.setTimeout(() => {
        void saveCompleteNowEarly().catch(() => { /* Checkout retries and shows any real error. */ });
      }, 500);
    };

    const showIncompleteNowError = () => {
      const message = isLater()
        ? t("contactError", { contact: method.value === "whatsapp" ? t("whatsappNumber") : t("emailAddress") })
        : t("incompleteError");
      notice.textContent = message;
      (isLater() ? later : now).querySelector("input:invalid, select:invalid, textarea:invalid")?.focus();
      window.alert(message);
    };

    let lastBlockedPurchaseAt = 0;
    const blockIncompletePurchase = (event) => {
      if (purchaseReady()) return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      const nowTime = Date.now();
      if (nowTime - lastBlockedPurchaseAt > 600) showIncompleteNowError();
      lastBlockedPurchaseAt = nowTime;
      return true;
    };

    // Shopify can begin its cart/accelerated-checkout handler on pointerdown,
    // before the normal click or submit event. Catch all three stages.
    let purchaseInProgress = false;
    const guardPurchaseControl = (event) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest("button, input[type='submit']");
      if (!control) return;
      const ownerForm = control.form || control.closest("form");
      const insideProductPurchase = ownerForm === form || (control.closest(".shopify-payment-button") && ownerForm === form);
      if (!insideProductPurchase) return;
      if (purchaseInProgress) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (!purchaseReady()) {
        blockIncompletePurchase(event);
        return;
      }
      // This theme adds products with its own Ajax click handler, which means
      // a normal form submit is not guaranteed to happen. Capture the click
      // before the theme handles it, save the customisation, then use the
      // native form submission to add the exact same product to the cart.
      if (event.type === "pointerdown" || event.type === "click") {
        event.preventDefault();
        event.stopImmediatePropagation();
        void prepareCustomisationAndSubmit(control);
      }
    };
    document.addEventListener("pointerdown", guardPurchaseControl, true);
    document.addEventListener("click", guardPurchaseControl, true);
    window.addEventListener("resize", positionPurchaseBlockers);
    window.addEventListener("scroll", positionPurchaseBlockers, true);
    // Some mobile browsers don't fire a usable change event after choosing a
    // local file. Recheck the values so the lock always clears once complete.
    window.setInterval(syncPurchaseBlockers, 400);

    const prepareCustomisationAndSubmit = async (submitter) => {
      if (purchaseInProgress) return;
      if (!purchaseReady()) {
        showIncompleteNowError();
        return;
      }
      if (!apiUrl) { notice.textContent = t("notConfigured"); return; }
      if (isLater()) {
        const contact = method.value === "whatsapp" ? phone : email;
        const label = method.value === "whatsapp" ? t("whatsappNumber") : t("emailAddress");
        if (!contact.checkValidity()) {
          notice.textContent = t("contactError", { contact: label });
          contact.focus();
          return;
        }
      }
      if (!form.reportValidity()) return;
      if (submitter) submitter.disabled = true;
      purchaseInProgress = true;
      try {
        if (isLater()) {
          notice.textContent = t("preparingLink");
          const result = await request("/api/customisation/sessions", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deliveryMethod: method.value === "whatsapp" ? "whatsapp" : "email", contactEmail: email.value.trim(), contactPhone: phone.value.trim() }),
          });
          appendSessionId(result.sessionId);
          notice.textContent = t("paired");
        } else {
          const upload = await uploadVoiceEarly();
          if (!upload) throw new Error(t("uploadVoiceError"));
          const details = formData();
          const fingerprint = completeNowFingerprint(details, upload);
          if (savedCompleteNowFingerprint !== fingerprint) {
            notice.textContent = t("saving");
            await saveCompleteNowEarly();
          }
          appendSessionId(upload.session.sessionId);
          appendCompleteNowProperties(details, upload.voiceStoragePath, upload.session.token);
          notice.textContent = t("saved");
        }
        // Preserve the two storefront actions: Add to cart opens the cart,
        // while Buy it now sends the just-saved customisation straight into
        // Shopify checkout.
        if (/buy\s*it\s*now/i.test(submitter?.textContent || "")) {
          let returnTo = form.querySelector('input[name="return_to"]');
          if (!returnTo) {
            returnTo = document.createElement("input");
            returnTo.type = "hidden";
            returnTo.name = "return_to";
            form.appendChild(returnTo);
          }
          returnTo.value = "/checkout";
        }
        form.submit();
      } catch (error) {
        notice.textContent = error instanceof Error ? error.message : "Could not save your customisation.";
        if (submitter) submitter.disabled = false;
        purchaseInProgress = false;
      }
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      void prepareCustomisationAndSubmit(event.submitter);
    }, true);
  });
})();
