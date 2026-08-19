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

    const isLater = () => [...radios].some((radio) => radio.checked && radio.value === "later");
    const purchaseControls = () => [...form.querySelectorAll("button, input[type='submit']")].filter((control) => {
      const ownerForm = control.form || control.closest("form");
      return ownerForm === form && (control.type === "submit" || control.name === "add" || Boolean(control.closest(".shopify-payment-button")));
    });
    const setRequired = (container, required) => container.querySelectorAll("input, select, textarea").forEach((input) => { input.required = required; });
    const completeNowReady = () => {
      if (isLater()) return true;
      const fields = [...now.querySelectorAll("input, select, textarea")];
      return fields.every((field) => field.checkValidity()) && Boolean(voiceInput.files?.[0]);
    };
    const syncDelivery = () => {
      const useWhatsApp = method.value === "whatsapp";
      emailField.hidden = useWhatsApp;
      phoneField.hidden = !useWhatsApp;
    };
    let purchaseBlockers = [];
    const clearPurchaseBlockers = () => {
      purchaseBlockers.forEach((blocker) => blocker.remove());
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
      if (isLater() || completeNowReady()) return;
      purchaseControls().forEach((control) => {
        control.setAttribute("aria-disabled", "true");
        control.setAttribute("data-mp-customisation-locked", "");
        const blocker = document.createElement("button");
        blocker.type = "button";
        blocker.className = "mp-purchase-blocker";
        blocker.setAttribute("aria-label", "Complete your customisation before purchasing");
        blocker.innerHTML = '<span class="mp-purchase-blocker__lock" aria-hidden="true">🔒</span><span>PLEASE COMPLETE CUSTOMISATION FIRST</span>';
        document.body.appendChild(blocker);
        purchaseBlockers.push({ blocker, control });
      });
      positionPurchaseBlockers();
    };
    const sync = () => {
      later.hidden = !isLater();
      now.hidden = isLater();
      setRequired(later, isLater());
      setRequired(now, !isLater());
      syncDelivery();
      syncPurchaseBlockers();
      notice.textContent = "";
    };
    radios.forEach((radio) => radio.addEventListener("change", sync));
    method.addEventListener("change", syncDelivery);
    plushName.addEventListener("input", () => { plushName.value = plushName.value.toUpperCase(); });
    const wordCaps = (input) => { input.value = input.value.replace(/(^|[\s-])([a-z])/g, (_, lead, letter) => `${lead}${letter.toUpperCase()}`); };
    ["[data-birth-place]", "[data-favourite-person]", "[data-belongs-to]"].forEach((selector) => block.querySelector(selector).addEventListener("blur", (event) => wordCaps(event.currentTarget)));
    now.querySelectorAll("input, select, textarea").forEach((field) => {
      field.addEventListener("input", () => { notice.textContent = ""; syncPurchaseBlockers(); });
      field.addEventListener("change", () => { notice.textContent = ""; syncPurchaseBlockers(); });
    });
    voiceInput.addEventListener("change", () => { voiceButton.textContent = voiceInput.files[0] ? voiceInput.files[0].name : "UPLOAD VOICE (MP4/MP3)"; notice.textContent = ""; syncPurchaseBlockers(); });
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
      const weeks = ["S", "M", "T", "W", "T", "F", "S"].map((day) => `<div class="mp-deferred-customisation__calendar-weekday">${day}</div>`).join("");
      const blanks = Array.from({ length: firstDay }, () => "<span></span>").join("");
      const days = Array.from({ length: lastDate }, (_, index) => {
        const day = index + 1, value = formatDate(new Date(year, month, day));
        return `<button type="button" data-day="${day}" class="${birthDate.value === value ? "is-selected" : ""}">${day}</button>`;
      }).join("");
      const months = Array.from({ length: 12 }, (_, index) => `<option value="${index}" ${index === month ? "selected" : ""}>${new Date(year, index, 1).toLocaleDateString("en-GB", { month: "long" })}</option>`).join("");
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

    const showIncompleteNowError = () => {
      const message = "Please complete every birth certificate field and upload your voice recording before adding to cart or checking out.";
      notice.textContent = message;
      now.querySelector("input:invalid, select:invalid, textarea:invalid")?.focus();
      window.alert(message);
    };

    let lastBlockedPurchaseAt = 0;
    const blockIncompletePurchase = (event) => {
      if (isLater() || completeNowReady()) return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      const nowTime = Date.now();
      if (nowTime - lastBlockedPurchaseAt > 600) showIncompleteNowError();
      lastBlockedPurchaseAt = nowTime;
      return true;
    };

    // Shopify can begin its cart/accelerated-checkout handler on pointerdown,
    // before the normal click or submit event. Catch all three stages.
    const guardPurchaseControl = (event) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest("button, input[type='submit']");
      if (!control) return;
      const ownerForm = control.form || control.closest("form");
      const insideProductPurchase = ownerForm === form || (control.closest(".shopify-payment-button") && ownerForm === form);
      if (insideProductPurchase) blockIncompletePurchase(event);
    };
    document.addEventListener("pointerdown", guardPurchaseControl, true);
    document.addEventListener("click", guardPurchaseControl, true);
    window.addEventListener("resize", positionPurchaseBlockers);
    window.addEventListener("scroll", positionPurchaseBlockers, true);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (blockIncompletePurchase(event)) return;
      if (!apiUrl) { notice.textContent = "Customisation is not configured yet. Please contact us."; return; }
      if (isLater()) {
        const contact = method.value === "whatsapp" ? phone : email;
        const label = method.value === "whatsapp" ? "WhatsApp number" : "email address";
        if (!contact.checkValidity()) {
          notice.textContent = `Please enter a valid ${label} before adding to cart or checking out.`;
          contact.focus();
          return;
        }
      }
      if (!form.reportValidity()) return;
      const submitter = event.submitter;
      if (submitter) submitter.disabled = true;
      try {
        if (isLater()) {
          notice.textContent = "Preparing your secure customisation link…";
          const result = await request("/api/customisation/sessions", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deliveryMethod: method.value === "whatsapp" ? "whatsapp" : "email", contactEmail: email.value.trim(), contactPhone: phone.value.trim() }),
          });
          appendSessionId(result.sessionId);
          notice.textContent = "Your link will be paired with this order after checkout.";
        } else {
          const voice = block.querySelector("[data-voice]").files[0];
          if (!voice) throw new Error("Please upload your voice recording.");
          notice.textContent = "Saving your customisation…";
          const session = await request("/api/customisation/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "complete_now" }) });
          const upload = new FormData(); upload.append("voice", voice);
          const voiceResult = await request(`/api/customisation/${encodeURIComponent(session.token)}/upload-file`, { method: "POST", body: upload });
          await request(`/api/customisation/${encodeURIComponent(session.token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ form: formData(), voiceStoragePath: voiceResult.voiceStoragePath }) });
          appendSessionId(session.sessionId);
          notice.textContent = "Your customisation is saved and will be linked to this order.";
        }
        form.submit();
      } catch (error) {
        notice.textContent = error instanceof Error ? error.message : "Could not save your customisation.";
        if (submitter) submitter.disabled = false;
      }
    }, true);
  });
})();
