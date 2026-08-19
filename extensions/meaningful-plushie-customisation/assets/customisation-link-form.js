(() => {
  document.querySelectorAll("[data-customisation-link-block]").forEach((block) => {
    const form = block.querySelector("form"), api = (block.dataset.apiUrl || "").replace(/\/$/, ""), notice = block.querySelector("[data-notice]");
    const get = (name) => block.querySelector(`[data-${name}]`);
    const name = get("plush-name"), voice = get("voice"), voiceButton = get("voice-button");
    name.addEventListener("input", () => { name.value = name.value.toUpperCase(); });
    const wordCaps = (input) => { input.value = input.value.replace(/(^|[\s-])([a-z])/g, (_, lead, letter) => `${lead}${letter.toUpperCase()}`); };
    ["birth-place", "favourite-person", "belongs-to"].forEach((fieldName) => get(fieldName).addEventListener("blur", (event) => wordCaps(event.currentTarget)));
    voice.addEventListener("change", () => { voiceButton.textContent = voice.files[0] ? voice.files[0].name : "UPLOAD VOICE (MP4/MP3)"; });
    const dateBox = get("birth-date"), calendar = document.createElement("div");
    calendar.className = "mp-deferred-customisation__calendar"; calendar.hidden = true; document.body.appendChild(calendar);
    let month = new Date(); const format = (date) => date.toLocaleDateString("en-GB");
    const render = () => { const y=month.getFullYear(),m=month.getMonth(),start=new Date(y,m,1).getDay(),last=new Date(y,m+1,0).getDate(),latest=new Date().getFullYear()+1; const weeks=["S","M","T","W","T","F","S"].map((d)=>`<div class="mp-deferred-customisation__calendar-weekday">${d}</div>`).join(""), blanks=Array.from({length:start},()=>"<span></span>").join(""), days=Array.from({length:last},(_,i)=>`<button type="button" data-day="${i+1}">${i+1}</button>`).join(""), months=Array.from({length:12},(_,i)=>`<option value="${i}" ${i===m?"selected":""}>${new Date(y,i,1).toLocaleDateString("en-GB",{month:"long"})}</option>`).join(""), years=Array.from({length:latest-1900+1},(_,i)=>latest-i).map((v)=>`<button type="button" data-calendar-year="${v}" class="${v===y?"is-selected":""}">${v}</button>`).join(""); calendar.innerHTML=`<div class="mp-deferred-customisation__calendar-head"><button type="button" data-month="-1">‹</button><span class="mp-deferred-customisation__calendar-selects"><select data-calendar-month>${months}</select><button type="button" data-year-toggle>${y}<span aria-hidden="true">▾</span></button></span><button type="button" data-month="1">›</button><div class="mp-deferred-customisation__calendar-years" hidden>${years}</div></div><div class="mp-deferred-customisation__calendar-grid">${weeks}${blanks}${days}</div>`; };
    calendar.addEventListener("click",(event)=>{const target=event.target.closest("button");if(!target)return;if(target.dataset.yearToggle!==undefined){const years=calendar.querySelector(".mp-deferred-customisation__calendar-years");years.hidden=!years.hidden;return;}if(target.dataset.month){month.setMonth(month.getMonth()+Number(target.dataset.month));render();return;}if(target.dataset.calendarYear){month.setFullYear(Number(target.dataset.calendarYear));render();return;}if(target.dataset.day){dateBox.value=format(new Date(month.getFullYear(),month.getMonth(),Number(target.dataset.day)));calendar.hidden=true;}});
    calendar.addEventListener("change",(event)=>{if(event.target.matches("[data-calendar-month]")){month.setMonth(Number(event.target.value));render();}});
    calendar.addEventListener("pointerdown",(event)=>{if(event.target.matches("[data-calendar-month]"))calendar.querySelector(".mp-deferred-customisation__calendar-years").hidden=true;});
    dateBox.addEventListener("click",()=>{const [d,m,y]=dateBox.value.split("/");month=y?new Date(Number(y),Number(m)-1,Number(d)):new Date();const rect=dateBox.getBoundingClientRect();calendar.style.top=`${Math.min(rect.bottom+8,window.innerHeight-360)}px`;calendar.style.left=`${Math.min(rect.left,window.innerWidth-356)}px`;render();calendar.hidden=false;});
    document.addEventListener("pointerdown",(event)=>{if(!calendar.hidden&&!calendar.contains(event.target)&&!dateBox.contains(event.target))calendar.hidden=true;});
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const token = new URLSearchParams(location.search).get("token"), file = voice.files[0];
      if (!api || !token || !file) { notice.textContent = "This customisation link is unavailable."; return; }
      const button = form.querySelector("button[type=submit]"); button.disabled = true; notice.textContent = "Saving your customisation…";
      try {
        const prepared = await fetch(`${api}/api/customisation/${encodeURIComponent(token)}/upload`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ fileName:file.name, contentType:file.type }) }).then((response) => response.json());
        if (!prepared.ok) throw new Error(prepared.error);
        const upload = new FormData(); upload.append("", file);
        const storage = await fetch(prepared.upload.signedUrl, { method:"PUT", headers:{"x-upsert":"false"}, body:upload });
        if (!storage.ok) throw new Error("Could not upload your file.");
        const up = { ok:true, voiceStoragePath:prepared.upload.path };
        if (!up.ok) throw new Error(up.error);
        const details = { plushName:name.value.trim(), gender:get("gender").value, birthDate:get("birth-date").value.trim(), birthPlace:get("birth-place").value.trim(), favouritePerson:get("favourite-person").value.trim(), belongsTo:get("belongs-to").value.trim(), meaningfulNote:get("meaningful-note").value.trim() };
        const saved = await fetch(`${api}/api/customisation/${encodeURIComponent(token)}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({form:details,voiceStoragePath:up.voiceStoragePath}) }).then((response) => response.json());
        if (!saved.ok) throw new Error(saved.error);
        notice.textContent = "Thank you — your customisation has been saved."; button.hidden = true;
      } catch (error) { notice.textContent = error instanceof Error ? error.message : "Could not save your customisation."; button.disabled = false; }
    });
  });
})();
