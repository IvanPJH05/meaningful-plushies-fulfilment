(() => {
  document.querySelectorAll("[data-snowy-charm-voice]").forEach((block) => {
    const apiUrl = (block.dataset.apiUrl || "").replace(/\/$/, "");
    const form = block.closest("form[action*='/cart/add']") || document.querySelector("form[action*='/cart/add']");
    const recordButton = block.querySelector("[data-record]");
    const fileInput = block.querySelector("[data-audio-file]");
    const recordingPanel = block.querySelector("[data-recording]");
    const recordingTime = block.querySelector("[data-recording-time]");
    const preview = block.querySelector("[data-preview]");
    const fileName = block.querySelector("[data-file-name]");
    const notice = block.querySelector("[data-notice]");
    const progress = block.querySelector("[data-progress]");
    const progressLabel = block.querySelector("[data-progress-label]");
    const progressPercent = block.querySelector("[data-progress-percent]");
    const progressBar = block.querySelector("[data-progress-bar]");
    if (!form || !recordButton || !fileInput) return;

    let selectedFile = null;
    let recorder = null;
    let stream = null;
    let recordStartedAt = 0;
    let recordTimer = 0;
    let saving = false;
    let uploaded = null;

    const setNotice = (message, success = false) => { notice.textContent = message; notice.classList.toggle("is-success", success); };
    const setProgress = (percent, label, complete = false) => { progress.hidden = false; progressLabel.textContent = label; progressPercent.textContent = `${Math.round(percent)}%`; progressBar.style.width = `${percent}%`; progressBar.style.background = complete ? "#2f9c70" : "#668da4"; };
    const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    const updateSelectedFile = (file) => {
      selectedFile = file || null;
      uploaded = null;
      fileName.textContent = selectedFile ? selectedFile.name : "No audio selected yet.";
      preview.hidden = !selectedFile;
      if (selectedFile) preview.src = URL.createObjectURL(selectedFile);
      setNotice("");
    };
    fileInput.addEventListener("change", () => updateSelectedFile(fileInput.files?.[0] || null));

    recordButton.addEventListener("click", async () => {
      if (recorder?.state === "recording") { recorder.stop(); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const type = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
        const chunks = [];
        recorder = new MediaRecorder(stream, { mimeType: type });
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder.onstop = () => {
          stream?.getTracks().forEach((track) => track.stop());
          stream = null;
          window.clearInterval(recordTimer);
          recordingPanel.hidden = true;
          recordButton.classList.remove("is-recording");
          recordButton.textContent = "Record voice message";
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          updateSelectedFile(new File([blob], `snowy-charm-voice-${Date.now()}.webm`, { type: blob.type }));
        };
        recorder.start();
        recordStartedAt = Date.now();
        recordingPanel.hidden = false;
        recordButton.classList.add("is-recording");
        recordButton.textContent = "Stop recording";
        recordTimer = window.setInterval(() => { recordingTime.textContent = formatTime(Math.floor((Date.now() - recordStartedAt) / 1000)); }, 250);
      } catch {
        setNotice("Please allow microphone access to record a voice message.");
      }
    });

    const request = async (path, options) => {
      const response = await fetch(`${apiUrl}${path}`, options);
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not save your voice message.");
      return result;
    };
    const addProperty = (key, value) => {
      const name = `properties[${key}]`;
      let input = form.querySelector(`input[name="${CSS.escape(name)}"]`);
      if (!input) { input = document.createElement("input"); input.type = "hidden"; input.name = name; form.appendChild(input); }
      input.value = value;
    };
    const uploadAudio = async () => {
      if (uploaded?.file === selectedFile) return uploaded;
      if (!selectedFile) throw new Error("Please record or choose an audio file first.");
      if (!apiUrl) throw new Error("Voice message setup is unavailable. Please refresh and try again.");
      setProgress(3, "Preparing secure upload…");
      const session = await request("/api/snowy-charm/sessions", { method: "POST" });
      setProgress(8, "Uploading your voice message…");
      const prepared = await request(`/api/customisation/${encodeURIComponent(session.token)}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: selectedFile.name, contentType: selectedFile.type }) });
      await new Promise((resolve, reject) => {
        const transfer = new XMLHttpRequest();
        transfer.open("PUT", prepared.upload.signedUrl);
        transfer.setRequestHeader("x-upsert", "false");
        transfer.setRequestHeader("Content-Type", selectedFile.type || "application/octet-stream");
        transfer.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(8 + event.loaded / event.total * 87, "Uploading your voice message…"); };
        transfer.onload = () => transfer.status >= 200 && transfer.status < 300 ? resolve() : reject(new Error("Could not upload your audio file."));
        transfer.onerror = () => reject(new Error("Could not upload your audio file."));
        transfer.send(selectedFile);
      });
      await request(`/api/snowy-charm/${encodeURIComponent(session.token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceStoragePath: prepared.upload.path }) });
      uploaded = { file: selectedFile, session, voiceStoragePath: prepared.upload.path };
      setProgress(100, "Voice message saved", true);
      return uploaded;
    };
    const purchaseControls = () => [...form.querySelectorAll("button, input[type='submit']")].filter((control) => (control.form || control.closest("form")) === form && (control.type === "submit" || control.name === "add" || Boolean(control.closest(".shopify-payment-button"))));
    const submitPurchase = async (submitter) => {
      if (saving) return;
      if (!selectedFile) { setNotice("Please record or choose an audio file before adding Snowy Charm to your cart."); return; }
      saving = true;
      purchaseControls().forEach((control) => { control.disabled = true; });
      try {
        const result = await uploadAudio();
        const audioLink = `${apiUrl}/api/customisation/audio-download?path=${encodeURIComponent(result.voiceStoragePath)}&filename=${encodeURIComponent(selectedFile.name)}`;
        addProperty("Meaningful Message", audioLink);
        addProperty("customisation_session_id", result.session.sessionId);
        addProperty("_snowy_charm_audio_token", result.session.token);
        setNotice("Your voice message is saved and ready for Snowy Charm.", true);
        if (/buy\s*it\s*now/i.test(submitter?.textContent || "")) {
          let returnTo = form.querySelector('input[name="return_to"]');
          if (!returnTo) { returnTo = document.createElement("input"); returnTo.type = "hidden"; returnTo.name = "return_to"; form.appendChild(returnTo); }
          returnTo.value = "/checkout";
        }
        form.submit();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not save your voice message.");
        purchaseControls().forEach((control) => { control.disabled = false; });
        saving = false;
      }
    };
    const interceptPurchase = (event) => {
      const target = event.target instanceof Element ? event.target.closest("button, input[type='submit']") : null;
      if (!target || saving) return;
      const owner = target.form || target.closest("form");
      if (owner !== form && !target.closest(".shopify-payment-button")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void submitPurchase(target);
    };
    document.addEventListener("pointerdown", interceptPurchase, true);
    document.addEventListener("click", interceptPurchase, true);
    form.addEventListener("submit", (event) => { event.preventDefault(); event.stopImmediatePropagation(); void submitPurchase(event.submitter); }, true);
  });
})();
