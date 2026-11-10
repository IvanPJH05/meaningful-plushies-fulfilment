import { platforms, parseCsv, malaysiaUtc, matchCaptions, planTargets, bulkDay } from "./workflow.mjs";

const view = document.querySelector("#view");
const editor = document.querySelector("#editor");
const importer = document.querySelector("#importer");
const format = new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const dateKey = value => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur" }).format(value);
const timeKey = value => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
const table = (columns, rows) => `<div class="table-wrap"><table><thead><tr>${columns.map(column => `<th>${column}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
const empty = message => `<p class="empty-state">${message}</p>`;
const button = (name, action, classes = "") => `<button type="button" class="button ${classes}" data-action="${action}">${name}</button>`;
let posts = [], page = "Overview", selected = new Set(), search = "", filter = "", source = "";
let calendarDate = dateKey(new Date()), week = false, uploading = false;
let uploadProgress = { total: 0, processed: 0 };

const database = new Promise((resolve, reject) => {
  const request = indexedDB.open("meaningful-social-workspace-" + document.documentElement.dataset.store, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore("posts", { keyPath: "id" });
    request.result.createObjectStore("assets", { keyPath: "id" });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
async function read(store, key) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const table = db.transaction(store).objectStore(store);
    const request = key === undefined ? table.getAll() : table.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function write(changes, removals = [], assets = []) {
  const db = await database;
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(["posts", "assets"], "readwrite");
    const records = transaction.objectStore("posts");
    const media = transaction.objectStore("assets");
    for (const post of changes) records.put(post);
    for (const id of removals) records.delete(id);
    for (const asset of assets) media.put(asset);
    for (const assetId of new Set(posts.filter(post => removals.includes(post.id)).map(post => post.assetId))) {
      if (!posts.some(post => post.assetId === assetId && !removals.includes(post.id))) media.delete(assetId);
    }
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error("Local storage could not be updated."));
  });
  posts = await read("posts");
  render();
}
function notice(message) {
  const element = document.querySelector("#notice");
  element.textContent = message;
  element.hidden = !message;
}
function navigate(name) {
  page = name;
  document.querySelector("#title").textContent = name;
  document.querySelectorAll("[data-view]").forEach(item => {
    if (item.dataset.view === name) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  render();
}
const plans = post => post.targets.filter(target => target.status === "planned");
const status = post => post.archived ? "Archived" : plans(post).length ? "Scheduled" : post.targets.length ? "Cancelled" : "Draft";

function inspectVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const cleanup = () => { clearTimeout(timeout); video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url); };
    const fail = () => { cleanup(); reject(new Error("This browser cannot read the video. Try an MP4 encoded with H.264.")); };
    const timeout = setTimeout(fail, 10000);
    video.muted = true;
    video.preload = "auto";
    video.onerror = fail;
    video.onloadeddata = () => {
      if (!(video.duration > 0 && video.duration <= 600) || !video.videoWidth) {
        cleanup(); reject(new Error("Choose a playable clip up to 10 minutes.")); return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = Math.max(1, Math.min(180, Math.round(100 * video.videoHeight / video.videoWidth)));
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      const metadata = { duration: video.duration, width: video.videoWidth, height: video.videoHeight, thumbnail: canvas.toDataURL("image/jpeg", 0.68) };
      cleanup(); resolve(metadata);
    };
    video.src = url;
  });
}
async function upload(files) {
  if (uploading || !files.length) return;
  uploading = true;
  uploadProgress = { total: files.length, processed: 0 };
  render();
  const errors = [];
  const saved = [];
  try {
    for (const [index, file] of files.entries()) {
      notice(`Checking and saving video ${index + 1} of ${files.length} · ${file.name}`);
      try {
        if (!/\.(mp4|mov)$/i.test(file.name) || file.size < 1 || file.size > 250 * 1024 ** 2) throw new Error("Use MP4 or MOV up to 250 MB.");
        const metadata = await inspectVideo(file);
        const id = crypto.randomUUID();
        uploadProgress.processed = index + 1;
        await write([{ id, assetId: id, name: file.name, ...metadata, caption: "", captions: {}, platforms: [], targets: [], archived: false }], [], [{ id, file }]);
        saved.push(id);
      } catch (error) {
        errors.push(`${file.name} · ${error.message}`);
        uploadProgress.processed = index + 1;
        render();
      }
    }
  } finally {
    uploading = false;
    render();
    notice(`${saved.length} of ${files.length} videos saved locally.${errors.length ? " " + errors.join(" | ") : ""}`);
  }
  if (saved.length) chooseUploadPlatforms(saved);
}

const platformMarks = {
  tiktok: '<path fill="currentColor" d="M14 3h3a5 5 0 0 0 4 4v3a8 8 0 0 1-4-1v7a5 5 0 1 1-5-5v3a2 2 0 1 0 2 2Z"/>',
  instagram: '<g fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.5"/></g><circle fill="currentColor" cx="17" cy="7" r="1"/>',
  facebook: '<path fill="currentColor" d="M14 21v-8h3l.5-3H14V8c0-1 .4-1.5 1.7-1.5H18V3h-3c-3 0-5 1.8-5 5v2H7v3h3v8z"/>',
  youtube: '<rect fill="currentColor" x="3" y="6" width="18" height="12" rx="4"/><path fill="#d51d30" d="m10 9 5 3-5 3z"/>',
  rednote: '<text fill="currentColor" x="12" y="15" text-anchor="middle" font-size="8" font-weight="800">RED</text>',
};

function platformIcon(key) {
  return `<span class="platform-icon platform-${key}" role="img" aria-label="${platforms[key].name}" title="${platforms[key].name}"><svg viewBox="0 0 24 24" aria-hidden="true">${platformMarks[key]}</svg></span>`;
}

function chooseUploadPlatforms(ids) {
  const uploaded = posts.filter(post => ids.includes(post.id));
  if (importer.open) importer.close();
  importer.innerHTML = `<form><h2>Where do you want to post?</h2><p>Choose destinations for ${uploaded.length === 1 ? escape(uploaded[0].name) : `${uploaded.length} uploaded videos`}. This saves your choices locally.</p>
    <div class="upload-platforms">${Object.entries(platforms).map(([key, platform]) => `<label><input type="checkbox" name="platform" value="${key}"> ${platformIcon(key)} <span>${platform.name}</span></label>`).join("")}</div>
    <p class="error" role="alert"></p><div class="actions"><button class="button primary" type="submit">Save platforms</button><button class="button" type="button" id="skip-platforms">Choose later</button></div></form>`;
  importer.querySelector("#skip-platforms").onclick = () => importer.close();
  importer.querySelector("form").onsubmit = async event => {
    event.preventDefault();
    const destinations = new FormData(event.currentTarget).getAll("platform");
    const alert = importer.querySelector("[role=alert]");
    if (!destinations.length) { alert.textContent = "Select at least one platform, or choose later."; return; }
    event.submitter.disabled = true;
    try {
      await write(uploaded.map(post => ({ ...post, platforms: destinations })));
      importer.close();
      notice(`Platforms saved for ${uploaded.length} ${uploaded.length === 1 ? "video" : "videos"}.`);
    } catch (error) { alert.textContent = error.message; }
    finally { event.submitter.disabled = false; }
  };
  importer.showModal();
}

function librarySchedule(post) {
  const dates = [...new Set(plans(post).map(target => target.utc))].sort();
  if (!dates.length) return '<small>No schedule set</small>';
  return dates.map(utc => `<time datetime="${escape(utc)}">${format.format(new Date(utc))}</time>`).join("");
}

function libraryRow(post) {
  const seconds = Math.floor(post.duration);
  const duration = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const caption = post.caption.trim();
  const overrides = post.platforms.filter(key => {
    const text = post.captions[key]?.trim();
    return text && text !== caption;
  });
  const state = status(post);
  return `<tr><td><input type="checkbox" data-select="${post.id}" aria-label="Select ${escape(post.name)}" ${selected.has(post.id) ? "checked" : ""}></td>
    <td><div class="library-video"><div class="video-cover"><img alt="" src="${escape(post.thumbnail)}"><span>${duration}</span></div>
    <div class="library-captions">
      ${caption ? `<small>Default caption</small><p>${escape(caption)}</p>` : !overrides.length ? '<p class="muted">No caption yet</p>' : ""}
      ${overrides.map(key => `<div class="library-caption-override">${platformIcon(key)}<p>${escape(post.captions[key].trim())}</p></div>`).join("")}
    </div></div></td>
    <td><div class="platform-icons">${post.platforms.map(platformIcon).join("") || "<small>—</small>"}</div></td>
    <td><span class="badge status-badge status-${state.toLowerCase()}">${state}</span></td><td class="library-schedule">${librarySchedule(post)}</td>
    <td><button type="button" class="more-button" popovertarget="actions-${post.id}" aria-label="Actions for ${escape(post.name)}" title="More actions">⋯</button>
    <div class="row-menu" id="actions-${post.id}" popover>
    ${button("Edit", "edit:" + post.id)}${button("Duplicate", "duplicate:" + post.id)}${button(post.archived ? "Restore" : "Archive", "archive:" + post.id)}${button("Delete", "delete:" + post.id, "danger")}</div></td></tr>`;
}

function library() {
  const shown = posts.filter(post => (filter ? status(post) === filter : !post.archived) && (!source || post.platforms.includes(source)) &&
    [post.name, post.caption, ...Object.values(post.captions)].some(value => value.toLowerCase().includes(search.toLowerCase())));
  return `<section class="card upload-card"><label class="drop" id="drop" for="videos">
    <span class="upload-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4"/></svg></span>
    <span class="upload-copy"><strong>Upload videos</strong><span>Drop your clips here to start a batch</span><small>MP4 or MOV · up to 250 MB and 10 minutes per clip</small></span>
    <span class="button primary choose-video">${uploading ? "Processing…" : "Choose videos"}</span>
    <input class="visually-hidden" id="videos" aria-label="Choose videos" type="file" accept=".mp4,.mov,video/mp4,video/quicktime" multiple ${uploading ? "disabled" : ""}></label>
    ${uploading ? `<div class="upload-progress"><small>${uploadProgress.processed} of ${uploadProgress.total} processed</small><progress aria-label="Videos processed" max="${uploadProgress.total}" value="${uploadProgress.processed}"></progress></div>` : ""}</section>
  <section class="card library-card"><div class="library-heading line"><div><h2>Videos <span class="badge">${shown.length}</span></h2><p class="muted">Manage captions and plan posts across platforms.</p></div><div class="actions">${button("Import captions", "import")}${button("Bulk schedule", "bulk", "primary")}${button("Delete selected", "bulk-delete", "danger")}</div></div>
  <div class="actions library-filters"><input id="search" aria-label="Search videos" placeholder="Search videos or captions" value="${escape(search)}"><select id="filter" aria-label="Filter by status"><option value="">Active content</option>${["Draft","Scheduled","Cancelled","Archived"].map(value => `<option ${filter === value ? "selected" : ""}>${value}</option>`).join("")}</select><select id="source" aria-label="Filter by platform"><option value="">All platforms</option>${Object.entries(platforms).map(([key, value]) => `<option value="${key}" ${source === key ? "selected" : ""}>${value.name}</option>`).join("")}</select><small id="selection-count">${selected.size ? `${selected.size} selected` : ""}</small></div>
  ${shown.length ? table(["Select", "Video", "Platforms", "Status", "Scheduled (MYT)", "Actions"], shown.map(libraryRow)) : empty(posts.length ? "No videos match your filters." : "Your video library is empty. Upload your first clip to get started.")}</section>`;
}
function calendar() {
  const cursor = new Date(calendarDate + "T12:00:00Z");
  const start = new Date(cursor);
  if (!week) start.setUTCDate(1);
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const days = Array.from({ length: week ? 7 : 42 }, (_, index) => {
    const date = bulkDay(start.toISOString().slice(0, 10), index);
    const entries = posts.filter(post => !post.archived && plans(post).some(target => dateKey(new Date(target.utc)) === date));
    return `<div class="day ${!week && date.slice(0,7) !== calendarDate.slice(0,7) ? "empty" : ""}"><strong>${Number(date.slice(-2))}</strong>${entries.map(post => button(`${timeKey(new Date(plans(post)[0].utc))} · ${escape(post.name)}`, "edit:" + post.id)).join("")}</div>`;
  });
  return `<section class="card"><div class="line"><div><h2>${new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric", timeZone: "UTC" }).format(cursor)}</h2><p class="muted">Malaysia time · select a post to reschedule it.</p></div><div class="actions">${button("←", "calendar-prev")}${button("Today", "calendar-today")}${button("→", "calendar-next")}${button(week ? "Month view" : "Week view", "calendar-mode")}</div></div><div class="table-wrap"><div class="calendar">${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => `<strong>${day}</strong>`).join("")}${days.join("")}</div></div></section>`;
}
function render() {
  const focus = document.activeElement;
  const targets = posts.filter(post => !post.archived).flatMap(post => plans(post).map(target => ({ post, target }))).sort((a,b) => a.target.utc.localeCompare(b.target.utc));
  if (page === "Content Library") view.innerHTML = library();
  else if (page === "Publishing Calendar") view.innerHTML = calendar();
  else if (page === "Connected Accounts") view.innerHTML = `<div class="grid">${Object.values(platforms).map(platform => `<section class="card"><h2>${platform.name}</h2><span class="badge">${platform.access}</span><p class="muted">No live account connected to this local preview.</p></section>`).join("")}</div>`;
  else if (page === "Publishing History") view.innerHTML = `<section class="card"><h2>Publishing history</h2>${empty("No publications. This preview records plans without contacting social platforms.")}</section><section class="card"><h2>Local schedule activity</h2>${table(["Video","Platform","Time (MYT)","State"], posts.flatMap(post => post.targets.map(target => `<tr><td>${escape(post.name)}</td><td>${platforms[target.platform].name}</td><td>${format.format(new Date(target.utc))}</td><td>${target.status === "planned" ? "Planned locally" : "Cancelled"}</td></tr>`)))}</section>`;
  else view.innerHTML = `<section class="card"><div class="line"><div><h2>Plan your next posts</h2><p class="muted">Upload videos once, write captions and review your publishing calendar.</p></div>${button("Open content library", "library", "primary")}</div></section><div class="stats">${[[posts.length,"Uploaded drafts"],[new Set(targets.map(row => row.post.id)).size,"Scheduled videos"],[0,"Published"],[0,"Failed"],[0,"Connected accounts"]].map(([value,label]) => `<section class="card"><strong>${value}</strong><small>${label}</small></section>`).join("")}</div><section class="card"><h2>Upcoming plans</h2>${targets.length ? table(["Video","Platform","Malaysia time"],targets.slice(0,10).map(({post,target}) => `<tr><td>${button(escape(post.name), "edit:" + post.id)}</td><td>${platforms[target.platform].name}</td><td>${format.format(new Date(target.utc))}</td></tr>`)) : empty("No posts scheduled yet.")}</section>`;
  if (focus?.id === "search") {
    const field = document.querySelector("#search");
    field?.focus();
    field?.setSelectionRange(focus.selectionStart, focus.selectionEnd);
  }
}

async function edit(post) {
  const asset = await read("assets", post.assetId);
  const url = asset ? URL.createObjectURL(asset.file) : "";
  const scheduled = plans(post)[0];
  editor.innerHTML = `<form><h2>${escape(post.name)}</h2>${url ? `<video controls preload="metadata" src="${escape(url)}"></video>` : ""}
    <label>Default caption<textarea name="caption">${escape(post.caption)}</textarea></label>
    <div class="actions"><button class="button" type="button" id="template">Insert product caption template</button></div>
    <div class="checks">${Object.entries(platforms).map(([key,value]) => `<label><input type="checkbox" name="platform" value="${key}" ${post.platforms.includes(key) ? "checked" : ""}> ${value.name}</label>`).join("")}</div>
    <div class="grid" id="platform-captions">${Object.entries(platforms).map(([key,value]) => `<label data-caption-platform="${key}" ${post.platforms.includes(key) ? "" : "hidden"}>${value.name} caption<textarea name="${key}" placeholder="Uses default caption when blank">${escape(post.captions[key])}</textarea><small data-count="${key}"></small></label>`).join("")}</div>
    <section class="card" id="rednote-handoff" hidden>
      <h3>Upload to REDnote</h3>
      <p class="muted">Download your video, copy the caption and upload both in REDnote Creator Center. A local schedule is a reminder for manual posting.</p>
      <div class="actions">${url ? `<a class="button" href="${escape(url)}" download="${escape(post.name)}">Download video</a>` : ""}
      <button class="button" type="button" id="copy-rednote">Copy caption</button>
      <a class="button primary" href="https://creator.xiaohongshu.com/" target="_blank" rel="noopener noreferrer">Open REDnote Creator Center ↗</a></div>
      <p id="rednote-status" role="status"></p>
    </section>
    ${post.duration > 180 || post.width > post.height ? '<p class="error">This clip is over three minutes or landscape, so it may not qualify as a YouTube Short.</p>' : ""}
    <div class="grid"><label>Date (Malaysia)<input type="date" name="date" value="${scheduled ? dateKey(new Date(scheduled.utc)) : post.suggestedDate || ""}"></label><label>Time (Malaysia)<input type="time" name="time" value="${scheduled ? timeKey(new Date(scheduled.utc)) : post.suggestedTime || "19:00"}"></label></div>
    <p class="error" role="alert"></p><div class="actions"><button class="button" type="submit" value="save">Save changes</button><button class="button primary" type="submit" value="schedule">Save schedule</button>${scheduled ? '<button class="button danger" type="submit" value="cancel">Cancel schedule</button>' : ""}<button class="button" type="button" id="close-editor">Close</button></div><p class="muted">Publish now becomes available after live accounts are connected in the integrated workspace.</p></form>`;
  const form = editor.querySelector("form");
  const count = () => {
    const data = new FormData(form);
    const selectedPlatforms = data.getAll("platform");
    form.querySelector("#platform-captions").hidden = !selectedPlatforms.length;
    for (const [key, platform] of Object.entries(platforms)) {
      form.querySelector(`[data-caption-platform="${key}"]`).hidden = !selectedPlatforms.includes(key);
      const length = (data.get(key) || data.get("caption")).length;
      const element = form.querySelector(`[data-count="${key}"]`);
      element.textContent = platform.limit === null ? `${length} characters` : `${length} / ${platform.limit}`;
      element.classList.toggle("error", platform.limit !== null && length > platform.limit);
    }
    editor.querySelector("#rednote-handoff").hidden = !selectedPlatforms.includes("rednote");
  };
  count();
  form.oninput = count;
  editor.querySelector("#template").onclick = () => {
    const field = form.elements.caption;
    const template = "A little plushie, a meaningful message 💗\n\n#MeaningfulPlushies #PersonalisedGift";
    field.value = field.value ? field.value + "\n\n" + template : template;
    count();
  };
  editor.querySelector("#close-editor").onclick = () => editor.close();
  editor.querySelector("#copy-rednote").onclick = async () => {
    const data = new FormData(form);
    const caption = data.get("rednote") || data.get("caption");
    const feedback = editor.querySelector("#rednote-status");
    if (!caption.trim()) { feedback.textContent = "Add a REDnote or default caption first."; return; }
    try {
      await navigator.clipboard.writeText(caption);
      feedback.textContent = "Caption copied.";
    } catch {
      const field = data.get("rednote") ? form.elements.rednote : form.elements.caption;
      field.focus();
      field.select();
      feedback.textContent = "Caption selected. Press Ctrl+C to copy.";
    }
  };
  editor.addEventListener("close", () => { if (url) URL.revokeObjectURL(url); }, { once: true });
  form.onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(form);
    const action = event.submitter?.value;
    const next = { ...post, caption: data.get("caption"), captions: Object.fromEntries(Object.keys(platforms).map(key => [key, data.get(key)])), platforms: data.getAll("platform") };
    try {
      if (action === "cancel") next.targets = post.targets.map(target => ({ ...target, status: "cancelled" }));
      else if (action === "schedule" || scheduled) {
        const date = action === "schedule" ? data.get("date") : dateKey(new Date(scheduled.utc));
        const time = action === "schedule" ? data.get("time") : timeKey(new Date(scheduled.utc));
        next.targets = planTargets(next, date, time, action === "schedule" ? Date.now() : 0);
      }
      event.submitter.disabled = true;
      await write([next]);
      editor.close();
      notice(action === "schedule" ? "Schedule saved locally." : action === "cancel" ? "Schedule cancelled." : "Changes saved locally.");
    } catch (error) {
      editor.querySelector("[role=alert]").textContent = error.message;
    } finally { if (event.submitter) event.submitter.disabled = false; }
  };
  editor.showModal();
}

async function readWorkbook(file) {
  const bytes = await file.arrayBuffer();
  const zip = new DataView(bytes);
  const decode = new TextDecoder();
  let end = zip.byteLength - 22;
  while (end >= Math.max(0, zip.byteLength - 65557) && zip.getUint32(end, true) !== 0x06054b50) end--;
  if (end < Math.max(0, zip.byteLength - 65557)) throw new Error("Choose a valid Excel .xlsx workbook.");
  const entries = new Map();
  let offset = zip.getUint32(end + 16, true);
  for (let count = zip.getUint16(end + 10, true); count > 0; count--) {
    if (zip.getUint32(offset, true) !== 0x02014b50) throw new Error("Excel archive could not be read.");
    const length = zip.getUint16(offset + 28, true);
    const name = decode.decode(bytes.slice(offset + 46, offset + 46 + length));
    entries.set(name, { method: zip.getUint16(offset + 10, true), compressed: zip.getUint32(offset + 20, true), size: zip.getUint32(offset + 24, true), local: zip.getUint32(offset + 42, true) });
    offset += 46 + length + zip.getUint16(offset + 30, true) + zip.getUint16(offset + 32, true);
  }
  async function xml(path) {
    const entry = entries.get(path);
    if (!entry) return null;
    if (entry.size > 10 * 1024 ** 2 || ![0, 8].includes(entry.method)) throw new Error("The Excel worksheet is too large or uses unsupported compression.");
    const start = entry.local + 30 + zip.getUint16(entry.local + 26, true) + zip.getUint16(entry.local + 28, true);
    const payload = new Blob([bytes.slice(start, start + entry.compressed)]);
    const reader = (entry.method === 8 ? payload.stream().pipeThrough(new DecompressionStream("deflate-raw")) : payload.stream()).getReader();
    let text = "", size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > entry.size) { await reader.cancel(); throw new Error("Invalid Excel worksheet size."); }
      text += decode.decode(value, { stream: true });
    }
    const parsed = new DOMParser().parseFromString(text + decode.decode(), "application/xml");
    if (parsed.querySelector("parsererror")) throw new Error("Excel worksheet XML could not be read.");
    return parsed;
  }
  const workbook = await xml("xl/workbook.xml");
  const relations = await xml("xl/_rels/workbook.xml.rels");
  const relationship = workbook?.querySelector("sheet")?.getAttribute("r:id");
  const target = [...(relations?.querySelectorAll("Relationship") || [])].find(row => row.getAttribute("Id") === relationship)?.getAttribute("Target");
  const path = target ? new URL(target, "https://workbook.invalid/xl/workbook.xml").pathname.slice(1) : "xl/worksheets/sheet1.xml";
  const sheet = await xml(path);
  if (!sheet) throw new Error("The workbook has no readable first worksheet.");
  const strings = [...((await xml("xl/sharedStrings.xml"))?.querySelectorAll("si") || [])].map(node => [...node.querySelectorAll("t")].map(text => text.textContent).join(""));
  return [...sheet.querySelectorAll("sheetData > row")].map(node => {
    const row = [];
    for (const cell of node.querySelectorAll("c")) {
      const column = cell.getAttribute("r")?.match(/^[A-Z]{1,3}/)?.[0];
      if (!column) continue;
      const index = [...column].reduce((value, char) => value * 26 + char.charCodeAt(0) - 64, 0) - 1;
      const value = cell.querySelector("v")?.textContent ?? "";
      const type = cell.getAttribute("t");
      row[index] = type === "s" ? strings[Number(value)] || "" : type === "inlineStr" ? cell.querySelector("is")?.textContent || "" : value;
    }
    return Array.from(row, value => value ?? "");
  }).filter(row => row.some(Boolean));
}

function openImport() {
  importer.innerHTML = '<h2>Import captions</h2><p>Include a Filename column and any platform caption, Scheduled Date or Scheduled Time columns. Dates and times are imported as suggestions.</p><label>Caption file<input type="file" id="captions" accept=".csv,.xlsx"></label><p class="error" role="alert"></p><div id="matches"></div><div class="actions"><button class="button primary" id="apply" disabled>Import matched rows</button><button class="button" id="close-import">Close</button></div>';
  const apply = importer.querySelector("#apply");
  const alert = importer.querySelector("[role=alert]");
  const matches = importer.querySelector("#matches");
  let rows = [];
  importer.querySelector("#close-import").onclick = () => importer.close();
  importer.querySelector("#captions").onchange = async event => {
    const file = event.target.files[0];
    apply.disabled = true;
    matches.replaceChildren();
    alert.textContent = "";
    if (!file) return;
    try {
      if (file.size > 5 * 1024 ** 2) throw new Error("Caption files must be under 5 MB.");
      const data = /\.xlsx$/i.test(file.name) ? await readWorkbook(file) : parseCsv(await file.text());
      rows = matchCaptions(data, posts);
      matches.innerHTML = table(["Row","Filename","Result"], rows.map(row => `<tr><td>${row.row}</td><td>${escape(row.filename)}</td><td>${row.message || "Matched"}</td></tr>`));
      apply.disabled = !rows.some(row => !row.message);
    } catch (error) { alert.textContent = error.message; }
  };
  apply.onclick = async () => {
    apply.disabled = true;
    try {
    const changes = rows.filter(row => !row.message).map(row => {
      const post = posts.find(item => item.id === row.id);
      const captions = { ...post.captions };
      for (const key of Object.keys(platforms)) {
        if (row.values[key + " caption"]) captions[key] = row.values[key + " caption"];
      }
      const date = row.values["scheduled date"]?.trim();
      const time = row.values["scheduled time"]?.trim();
      const serial = Number(date), minutes = Math.round(Number(time) * 1440);
      const next = { ...post, captions, caption: row.values["default caption"] || post.caption,
        suggestedDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : serial > 0 && serial < 2958466 ? new Date(Date.UTC(1899,11,30) + Math.floor(serial) * 86400000).toISOString().slice(0,10) : post.suggestedDate,
        suggestedTime: /^\d{2}:\d{2}$/.test(time) ? time : time && minutes >= 0 && minutes < 1440 ? `${String(Math.floor(minutes / 60)).padStart(2,"0")}:${String(minutes % 60).padStart(2,"0")}` : post.suggestedTime };
      const existing = plans(post)[0];
      if (existing) next.targets = planTargets(next, dateKey(new Date(existing.utc)), timeKey(new Date(existing.utc)), 0);
      return next;
    });
    await write(changes); importer.close(); notice(`Imported captions for ${changes.length} videos.`); }
    catch (error) { alert.textContent = error.message; apply.disabled = false; }
  };
  importer.showModal();
}

function bulkSchedule() {
  const chosen = posts.filter(post => selected.has(post.id) && !post.archived);
  if (!chosen.length) return notice("Select one or more active videos first.");
  importer.innerHTML = `<form><h2>Bulk schedule · ${chosen.length} videos</h2><p>Schedules videos one per day in the order listed below.</p><ol>${chosen.map(post => `<li>${escape(post.name)}</li>`).join("")}</ol><div class="grid"><label>Start date (Malaysia)<input type="date" name="date" required></label><label>Daily time (Malaysia)<input type="time" name="time" value="19:00" required></label></div><div class="checks">${Object.entries(platforms).map(([key,value]) => `<label><input type="checkbox" name="platform" value="${key}"> ${value.name}</label>`).join("")}</div><p class="error" role="alert"></p><div class="actions"><button class="button primary" type="submit">Save local schedules</button><button class="button" type="button" id="close-bulk">Close</button></div></form>`;
  importer.querySelector("#close-bulk").onclick = () => importer.close();
  importer.querySelector("form").onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const changes = chosen.map((post, index) => {
        const next = { ...post, platforms: data.getAll("platform") };
        return { ...next, targets: planTargets(next, bulkDay(data.get("date"), index), data.get("time")) };
      });
      event.submitter.disabled = true;
      await write(changes); importer.close(); notice(`${changes.length} local schedules saved.`);
    } catch (error) { importer.querySelector("[role=alert]").textContent = error.message; }
    finally { event.submitter.disabled = false; }
  };
  importer.showModal();
}

document.querySelector("nav").onclick = event => {
  const target = event.target.closest("[data-view]");
  if (target) navigate(target.dataset.view);
};
view.addEventListener("input", event => {
  if (event.target.id === "search") { search = event.target.value; render(); }
});
view.addEventListener("change", event => {
  const target = event.target;
  if (target.id === "videos") void upload([...target.files]);
  if (target.id === "filter") { filter = target.value; render(); }
  if (target.id === "source") { source = target.value; render(); }
  if (target.dataset.select) {
    if (target.checked) selected.add(target.dataset.select);
    else selected.delete(target.dataset.select);
    document.querySelector("#selection-count").textContent = selected.size ? `${selected.size} selected` : "";
  }
});
view.addEventListener("dragover", event => {
  const drop = event.target.closest("#drop");
  if (drop) { event.preventDefault(); drop.classList.add("active"); }
});
view.addEventListener("dragleave", event => event.target.closest("#drop")?.classList.remove("active"));
view.addEventListener("drop", event => {
  if (!event.target.closest("#drop")) return;
  event.preventDefault();
  void upload([...event.dataTransfer.files]);
});
view.addEventListener("click", async event => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const [action, id] = target.dataset.action.split(":");
  target.closest(".row-menu")?.hidePopover();
  const post = posts.find(item => item.id === id);
  try {
    if (action === "library") navigate("Content Library");
    if (action === "import") openImport();
    if (action === "bulk") bulkSchedule();
    if (action === "edit" && post) await edit(post);
    if (action === "duplicate" && post) await write([{ ...post, id: crypto.randomUUID(), targets: [], archived: false }]);
    if (action === "archive" && post) {
      await write([{ ...post, archived: !post.archived, targets: post.targets.map(job => ({ ...job, status: "cancelled" })) }]);
      selected.delete(post.id);
    }
    if (action === "delete" || action === "bulk-delete") {
      const ids = action === "delete" ? [id] : [...selected];
      if (ids.length && confirm(`Delete ${ids.length} local video draft(s) and their plans?`)) {
        await write([], ids);
        ids.forEach(item => selected.delete(item));
      }
    }
    if (action.startsWith("calendar-")) {
      if (action === "calendar-mode") week = !week;
      else if (action === "calendar-today") calendarDate = dateKey(new Date());
      else {
        const direction = action === "calendar-next" ? 1 : -1;
        const date = new Date(calendarDate + "T12:00:00Z");
        if (week) date.setUTCDate(date.getUTCDate() + direction * 7);
        else { date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + direction); }
        calendarDate = date.toISOString().slice(0,10);
      }
      render();
    }
  } catch (error) { notice(error.message); }
});
try { posts = await read("posts"); render(); }
catch { notice("This browser could not open local storage. Allow site storage and reload."); }
