(() => {
  document.querySelectorAll("[data-snowy-charm-voice]").forEach((block) => {
    const apiUrl = (block.dataset.apiUrl || "").replace(/\/$/, "");
    const form = block.closest("form[action*='/cart/add']") || document.querySelector("form[action*='/cart/add']");
    const recordChoice = block.querySelector("[data-select-record]");
    const uploadChoice = block.querySelector("[data-select-upload]");
    const recordControl = block.querySelector("[data-record-control]");
    const uploadControl = block.querySelector("[data-upload-control]");
    const recordButton = block.querySelector("[data-record]");
    const fileInput = block.querySelector("[data-audio-file]");
    const previewWrap = block.querySelector("[data-preview-wrap]");
    const preview = block.querySelector("[data-preview]");
    const playButton = block.querySelector("[data-play]");
    const playLabel = block.querySelector("[data-play-label]");
    const loading = block.querySelector("[data-loading]");
    const seek = block.querySelector("[data-seek]");
    const playbackTime = block.querySelector("[data-time]");
    const fileName = block.querySelector("[data-file-name]");
    const notice = block.querySelector("[data-notice]");
    const progress = block.querySelector("[data-progress]");
    const progressLabel = block.querySelector("[data-progress-label]");
    const progressPercent = block.querySelector("[data-progress-percent]");
    const progressBar = block.querySelector("[data-progress-bar]");
    const dialog = block.querySelector("[data-record-dialog]");
    const countdown = block.querySelector("[data-record-countdown]");
    const recordStatus = block.querySelector("[data-record-status]");
    const recordTime = block.querySelector("[data-record-time]");
    const recordProgress = block.querySelector("[data-record-progress]");
    const stopButton = block.querySelector("[data-record-stop]");
    const cancelButton = block.querySelector("[data-record-cancel]");
    if (!form || !recordChoice || !uploadChoice || !recordButton || !fileInput || !preview) return;
    if (dialog?.parentElement !== document.body) document.body.appendChild(dialog);

    let source = "record", selectedFile = null, recorder = null, stream = null, recording = false, saving = false, uploading = false, uploaded = null, uploadPromise = null, uploadFile = null, selectionVersion = 0, previewUrl = "", countdownTimer = 0, recordTimer = 0, recordLimitTimer = 0;
    const draftKey = `mp-plush-charm-voice:${location.pathname}`;
    const draftLifetime = 10 * 60 * 1000;
    const audioTypes = { mp3: "audio/mpeg", mp4: "audio/mp4", m4a: "audio/mp4", ogg: "audio/ogg", oga: "audio/ogg", wav: "audio/wav", webm: "audio/webm" };
    const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.max(0, Math.floor(seconds % 60))).padStart(2, "0")}`;
    const setNotice = (message, success = false) => { notice.textContent = message; notice.classList.toggle("is-success", success); };
    const setProgress = (percent, label, complete = false) => { progress.hidden = false; progressLabel.textContent = label; progressPercent.textContent = `${Math.round(percent)}%`; progressBar.style.width = `${percent}%`; progressBar.style.background = complete ? "#2f9c70" : "#7098ae"; };
    const normaliseFile = (file) => { if (!file) return null; const extension = file.name.split(".").pop()?.toLowerCase(); const type = audioTypes[extension] || (file.type.startsWith("audio/") ? file.type : ""); return type && file.type !== type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file; };
    const openDraftDatabase = () => new Promise((resolve, reject) => {
      const databaseRequest = indexedDB.open("meaningful-plushies-plush-charm", 1);
      databaseRequest.onupgradeneeded = () => {
        if (!databaseRequest.result.objectStoreNames.contains("voice-drafts")) databaseRequest.result.createObjectStore("voice-drafts");
      };
      databaseRequest.onsuccess = () => resolve(databaseRequest.result);
      databaseRequest.onerror = () => reject(databaseRequest.error);
    });
    const readVoiceDraft = async () => {
      try {
        const database = await openDraftDatabase();
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction("voice-drafts", "readonly");
          const request = transaction.objectStore("voice-drafts").get(draftKey);
          request.onsuccess = () => resolve(request.result || null);
          request.onerror = () => reject(request.error);
        });
      } catch { return null; }
    };
    const saveVoiceDraft = async (file, result) => {
      try {
        const database = await openDraftDatabase();
        const transaction = database.transaction("voice-drafts", "readwrite");
        transaction.objectStore("voice-drafts").put({
          file,
          source,
          savedAt: Date.now(),
          session: { token: result.session.token },
          voiceStoragePath: result.voiceStoragePath
        }, draftKey);
      } catch {}
    };
    const clearVoiceDraft = async () => {
      try {
        const database = await openDraftDatabase();
        database.transaction("voice-drafts", "readwrite").objectStore("voice-drafts").delete(draftKey);
      } catch {}
    };
    const setSource = (value) => { source = value; recordChoice.classList.toggle("is-active", value === "record"); uploadChoice.classList.toggle("is-active", value === "upload"); recordChoice.setAttribute("aria-pressed", String(value === "record")); uploadChoice.setAttribute("aria-pressed", String(value === "upload")); recordControl.hidden = value !== "record"; uploadControl.hidden = value !== "upload"; };
    const setPlayback = ({ playing = false, waiting = false } = {}) => { playLabel.textContent = waiting ? "LOADING" : playing ? "PAUSE" : "PLAY"; playButton.setAttribute("aria-label", waiting ? "Loading voice message" : playing ? "Pause voice message" : "Play voice message"); loading.hidden = !waiting; playButton.disabled = waiting; };
    const updatePreview = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ""; previewWrap.hidden = !selectedFile; fileName.textContent = selectedFile ? selectedFile.name : ""; if (!selectedFile) return; previewUrl = URL.createObjectURL(selectedFile); preview.src = previewUrl; preview.load(); seek.value = "0"; seek.max = "0"; playbackTime.textContent = "0:00 / 0:00"; setPlayback(); };
    const setSelectedFile = (file) => {
      selectedFile = normaliseFile(file);
      uploaded = null;
      selectionVersion += 1;
      updatePreview();
      if (!selectedFile) { void clearVoiceDraft(); setNotice(""); syncPurchaseBlockers(); return; }
      const fileToSave = selectedFile;
      const versionToSave = selectionVersion;
      setNotice("Saving your voice message…");
      void clearVoiceDraft().then(() => {
        if (selectedFile === fileToSave && selectionVersion === versionToSave) void saveVoiceEarly(fileToSave, versionToSave);
      });
    };
    const selectedLimit = () => { const selected = form.querySelector("[name='id']"); const text = selected?.selectedOptions?.[0]?.textContent || selected?.value || ""; const match = text.match(/(\d+)\s*(?:second|sec|s)\b/i); return Math.max(1, Number(match?.[1] || 20)); };
    const cleanRecording = () => { window.clearInterval(countdownTimer); window.clearInterval(recordTimer); window.clearTimeout(recordLimitTimer); countdownTimer = recordTimer = recordLimitTimer = 0; stream?.getTracks().forEach((track) => track.stop()); stream = null; recording = false; dialog.hidden = true; stopButton.hidden = true; cancelButton.hidden = false; };
    const stopRecording = () => { if (recorder?.state === "recording") recorder.stop(); else cleanRecording(); };
    const beginRecording = async () => {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setNotice("Voice recording is not available here. Please upload an audio file instead."); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const limit = selectedLimit(); let remaining = limit; let value = 3;
        dialog.hidden = false; countdown.textContent = String(value); recordStatus.textContent = "Get ready"; recordTime.textContent = `${formatTime(limit)} left`; recordProgress.style.width = "0%";
        countdownTimer = window.setInterval(() => {
          value -= 1;
          if (value > 0) { countdown.textContent = String(value); return; }
          window.clearInterval(countdownTimer); countdownTimer = 0;
          countdown.textContent = "●"; recordStatus.textContent = "Speak now"; stopButton.hidden = false; cancelButton.hidden = true;
          const type = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
          const chunks = []; recorder = new MediaRecorder(stream, { mimeType: type });
          recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
          recorder.onstop = () => { const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" }); cleanRecording(); setSelectedFile(new File([blob], `plush-charm-voice-${Date.now()}.webm`, { type: blob.type })); };
          recorder.start(); recording = true;
          recordTimer = window.setInterval(() => { remaining -= 0.1; const safe = Math.max(0, remaining); recordTime.textContent = `${formatTime(Math.ceil(safe))} left`; recordProgress.style.width = `${((limit - safe) / limit) * 100}%`; }, 100);
          recordLimitTimer = window.setTimeout(stopRecording, limit * 1000);
        }, 1000);
      } catch { cleanRecording(); setNotice("Please allow microphone access to record your voice message."); }
    };
    recordChoice.addEventListener("click", () => { setSource("record"); });
    uploadChoice.addEventListener("click", () => { setSource("upload"); fileInput.click(); });
    recordButton.addEventListener("click", beginRecording); stopButton.addEventListener("click", stopRecording); cancelButton.addEventListener("click", cleanRecording);
    fileInput.addEventListener("change", () => { setSelectedFile(fileInput.files?.[0] || null); fileInput.value = ""; });
    playButton.addEventListener("click", async () => { if (preview.paused) { setPlayback({ waiting: true }); try { await preview.play(); } catch { setPlayback(); setNotice("This audio could not be played on this device. Please try MP3, MP4/M4A, OGG, WAV, or WebM audio."); } } else preview.pause(); });
    seek.addEventListener("input", () => { preview.currentTime = Number(seek.value); });
    preview.addEventListener("loadedmetadata", () => { const duration = Number.isFinite(preview.duration) ? preview.duration : 0; seek.max = String(duration); playbackTime.textContent = `${formatTime(0)} / ${formatTime(duration)}`; });
    preview.addEventListener("timeupdate", () => { seek.value = String(preview.currentTime); playbackTime.textContent = `${formatTime(preview.currentTime)} / ${formatTime(preview.duration)}`; });
    preview.addEventListener("waiting", () => setPlayback({ waiting: true })); preview.addEventListener("canplay", () => setPlayback({ playing: !preview.paused })); preview.addEventListener("playing", () => setPlayback({ playing: true })); preview.addEventListener("pause", () => setPlayback()); preview.addEventListener("ended", () => { preview.currentTime = 0; seek.value = "0"; setPlayback(); }); preview.addEventListener("error", () => { setPlayback(); setNotice("This audio could not be played on this device. Please try MP3, MP4/M4A, OGG, WAV, or WebM audio."); });
    const request = async (path, options) => { const response = await fetch(`${apiUrl}${path}`, options); const result = await response.json().catch(() => ({})); if (!response.ok || !result.ok) throw new Error(result.error || "Could not save your voice message."); return result; };
    const uploadAudio = async (file = selectedFile) => {
      if (uploaded?.file === file) return uploaded;
      if (uploadPromise && uploadFile === file) return uploadPromise;
      if (!file) throw new Error("Please record or choose an audio file first.");
      if (!apiUrl) throw new Error("Voice message setup is unavailable. Please refresh and try again.");
      uploadFile = file;
      uploadPromise = (async () => {
        setProgress(3, "Preparing secure upload…"); const session = await request("/api/snowy-charm/sessions", { method: "POST" }); setProgress(8, "Saving your voice message…");
        const prepared = await request(`/api/customisation/${encodeURIComponent(session.token)}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, contentType: file.type }) });
        await new Promise((resolve, reject) => { const transfer = new XMLHttpRequest(); transfer.open("PUT", prepared.upload.signedUrl); transfer.setRequestHeader("x-upsert", "false"); transfer.setRequestHeader("Content-Type", file.type || "application/octet-stream"); transfer.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(8 + event.loaded / event.total * 87, "Saving your voice message…"); }; transfer.onload = () => transfer.status >= 200 && transfer.status < 300 ? resolve() : reject(new Error("Could not upload your audio file.")); transfer.onerror = () => reject(new Error("Could not upload your audio file.")); transfer.send(file); });
        await request(`/api/snowy-charm/${encodeURIComponent(session.token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceStoragePath: prepared.upload.path }) }); return { file, session, voiceStoragePath: prepared.upload.path };
      })();
      try { return await uploadPromise; } finally { if (uploadFile === file) { uploadPromise = null; uploadFile = null; } }
    };
    const saveVoiceEarly = async (file, version) => {
      uploading = true;
      syncPurchaseBlockers();
      try {
        const result = await uploadAudio(file);
        if (selectedFile === file && selectionVersion === version) { uploaded = result; void saveVoiceDraft(file, result); setProgress(100, "Voice message saved", true); setNotice("Your voice message is saved and ready for Plush Charm.", true); }
      } catch (error) {
        if (selectedFile === file && selectionVersion === version) { setNotice(error instanceof Error ? error.message : "Could not save your voice message."); }
      } finally {
        if (selectedFile === file && selectionVersion === version) { uploading = false; syncPurchaseBlockers(); }
      }
    };
    const addProperty = (key, value) => { const name = `properties[${key}]`; let input = form.querySelector(`input[name="${CSS.escape(name)}"]`); if (!input) { input = document.createElement("input"); input.type = "hidden"; input.name = name; form.appendChild(input); } input.value = value; };
    const purchaseControls = () => {
      const paymentWidgets = [...form.querySelectorAll(".shopify-payment-button, shopify-accelerated-checkout, [data-shopify=payment-button]")];
      const buttons = [...form.querySelectorAll("button, input[type='submit']")].filter((control) => (control.form || control.closest("form")) === form && (control.type === "submit" || control.name === "add") && !paymentWidgets.some((widget) => widget.contains(control)));
      return [...new Set([...buttons, ...paymentWidgets])];
    };
    let purchaseBlockers = [];
    const clearPurchaseBlockers = () => {
      purchaseBlockers.forEach(({ blocker, control, wasDisabled }) => {
        blocker.remove();
        if (!wasDisabled) control.disabled = false;
      });
      purchaseBlockers = [];
      purchaseControls().forEach((control) => {
        control.removeAttribute("aria-disabled");
        control.removeAttribute("data-mp-snowy-voice-locked");
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
      if (uploaded?.file === selectedFile && !uploading && !saving) return;
      purchaseControls().forEach((control) => {
        const wasDisabled = Boolean(control.disabled);
        control.disabled = true;
        control.setAttribute("aria-disabled", "true");
        control.setAttribute("data-mp-snowy-voice-locked", "");
        const blocker = document.createElement("div");
        blocker.className = "mp-snowy-charm-voice__purchase-blocker";
        blocker.setAttribute("aria-hidden", "true");
        blocker.innerHTML = '<span class="mp-snowy-charm-voice__purchase-lock" aria-hidden="true">🔒</span><span>PLEASE COMPLETE CUSTOMISATION FIRST</span>';
        document.body.appendChild(blocker);
        purchaseBlockers.push({ blocker, control, wasDisabled });
      });
      positionPurchaseBlockers();
    };
    const submitPurchase = async (submitter) => { if (saving || uploading) return; if (!selectedFile || uploaded?.file !== selectedFile) { syncPurchaseBlockers(); return; } saving = true; clearPurchaseBlockers(); purchaseControls().forEach((control) => { control.disabled = true; }); try { const result = uploaded; const audioLink = `${apiUrl}/api/customisation/audio-download?path=${encodeURIComponent(result.voiceStoragePath)}&filename=${encodeURIComponent(selectedFile.name)}`; addProperty("Meaningful Message", audioLink); addProperty("_customisation_token", result.session.token); if (/buy\s*it\s*now/i.test(submitter?.textContent || "")) { let returnTo = form.querySelector('input[name="return_to"]'); if (!returnTo) { returnTo = document.createElement("input"); returnTo.type = "hidden"; returnTo.name = "return_to"; form.appendChild(returnTo); } returnTo.value = "/checkout"; } void clearVoiceDraft(); form.submit(); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save your voice message."); purchaseControls().forEach((control) => { control.disabled = false; }); saving = false; syncPurchaseBlockers(); } };
    const interceptPurchase = (event) => { const target = event.target instanceof Element ? event.target : null; const purchaseTarget = target && purchaseControls().find((control) => control === target || control.contains(target)); if (!purchaseTarget) return; event.preventDefault(); event.stopImmediatePropagation(); if (!saving) void submitPurchase(purchaseTarget); };
    document.addEventListener("click", interceptPurchase, true); form.addEventListener("submit", (event) => { event.preventDefault(); event.stopImmediatePropagation(); syncPurchaseBlockers(); }, true);
    window.addEventListener("resize", positionPurchaseBlockers);
    window.addEventListener("scroll", positionPurchaseBlockers, true);
    const restoreVoiceDraft = async () => {
      const draft = await readVoiceDraft();
      if (!draft || Date.now() - Number(draft.savedAt) > draftLifetime || !(draft.file instanceof Blob) || !draft.session?.token || !draft.voiceStoragePath) {
        if (draft) void clearVoiceDraft();
        return;
      }
      const restoredFile = normaliseFile(draft.file);
      if (!restoredFile) { void clearVoiceDraft(); return; }
      source = draft.source === "upload" ? "upload" : "record";
      selectedFile = restoredFile;
      uploaded = { file: restoredFile, session: draft.session, voiceStoragePath: draft.voiceStoragePath };
      setSource(source);
      updatePreview();
      setProgress(100, "Voice message saved", true);
      setNotice("Your saved voice message is ready for Plush Charm.", true);
      syncPurchaseBlockers();
    };
    syncPurchaseBlockers();
    void restoreVoiceDraft();
    window.setInterval(syncPurchaseBlockers, 400);
  });
})();
