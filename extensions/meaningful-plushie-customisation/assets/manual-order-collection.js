(() => {
  document.querySelectorAll("[data-manual-order-collection]").forEach((block) => {
    const form = block.querySelector("form"); const notice = block.querySelector("[data-notice]"); const api = block.dataset.apiUrl;
    const say = (message, success = false) => { notice.textContent = message; notice.classList.toggle("is-success", success); };
    const request = async (body) => { const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || "Please try again."); return data; };
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); if (!form.reportValidity()) return;
      const data = new FormData(form); const voice = data.get("voice");
      if (!(voice instanceof File) || !voice.size) return say("Please record or choose a voice message.");
      if (voice.size > 50 * 1024 * 1024) return say("Your voice message must be 50 MB or smaller.");
      const button = form.querySelector("button[type=submit]"); button.disabled = true;
      try {
        say("Saving your details…"); const started = await request({ action: "start" });
        const upload = await request({ action: "prepare_voice_upload", sessionToken: started.session.token, fileName: voice.name || "voice-message.webm", contentType: voice.type || "audio/webm" });
        const uploadResponse = await fetch(upload.upload.signedUrl, { method: "PUT", headers: { "Content-Type": voice.type || "application/octet-stream" }, body: voice });
        if (!uploadResponse.ok) throw new Error("Your voice message could not be uploaded. Please try again.");
        await request({ action: "submit", sessionToken: started.session.token, voiceStoragePath: upload.upload.path,
          customerName: data.get("customerName"), customerEmail: data.get("customerEmail"), phone: data.get("phone"), character: data.get("character"), productKey: data.get("productKey"), shippingRegion: data.get("shippingRegion"),
          shippingAddress: { address1: data.get("address1"), address2: data.get("address2"), city: data.get("city"), province: data.get("province"), zip: data.get("zip"), countryCode: "MY" },
          form: { plushName: data.get("plushName"), gender: data.get("gender"), birthDate: data.get("birthDate"), birthPlace: data.get("birthPlace"), favouritePerson: data.get("favouritePerson"), belongsTo: data.get("belongsTo"), meaningfulNote: data.get("meaningfulNote") }
        });
        form.reset(); say("Your plushie's details are saved. We will create your order after your payment is confirmed.", true);
      } catch (error) { say(error instanceof Error ? error.message : "Your details could not be saved."); }
      finally { button.disabled = false; }
    });
  });
})();
