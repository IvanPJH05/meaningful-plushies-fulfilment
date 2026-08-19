(() => {
  document.querySelectorAll("[data-customisation-link-block]").forEach((block) => {
    const form = block.querySelector("form"), api = (block.dataset.apiUrl || "").replace(/\/$/, ""), notice = block.querySelector("[data-notice]");
    const get = (name) => block.querySelector(`[data-${name}]`);
    const name = get("plush-name"), voice = get("voice"), voiceButton = get("voice-button");
    name.addEventListener("input", () => { name.value = name.value.toUpperCase(); });
    voice.addEventListener("change", () => { voiceButton.textContent = voice.files[0] ? voice.files[0].name : "UPLOAD VOICE (MP4/MP3)"; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const token = new URLSearchParams(location.search).get("token"), file = voice.files[0];
      if (!api || !token || !file) { notice.textContent = "This customisation link is unavailable."; return; }
      const button = form.querySelector("button[type=submit]"); button.disabled = true; notice.textContent = "Saving your customisation…";
      try {
        const upload = new FormData(); upload.append("voice", file);
        const up = await fetch(`${api}/api/customisation/${encodeURIComponent(token)}/upload-file`, { method:"POST", body:upload }).then((response) => response.json());
        if (!up.ok) throw new Error(up.error);
        const details = { plushName:name.value.trim(), gender:get("gender").value, birthDate:get("birth-date").value.trim(), birthPlace:get("birth-place").value.trim(), favouritePerson:get("favourite-person").value.trim(), belongsTo:get("belongs-to").value.trim(), meaningfulNote:get("meaningful-note").value.trim() };
        const saved = await fetch(`${api}/api/customisation/${encodeURIComponent(token)}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({form:details,voiceStoragePath:up.voiceStoragePath}) }).then((response) => response.json());
        if (!saved.ok) throw new Error(saved.error);
        notice.textContent = "Thank you — your customisation has been saved."; button.hidden = true;
      } catch (error) { notice.textContent = error instanceof Error ? error.message : "Could not save your customisation."; button.disabled = false; }
    });
  });
})();
