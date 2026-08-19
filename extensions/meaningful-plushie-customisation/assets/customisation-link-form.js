(() => {
  document.querySelectorAll("[data-customisation-link-block]").forEach((block) => {
    const form = block.querySelector("form"), api = (block.dataset.apiUrl || "").replace(/\/$/, ""), notice = block.querySelector("[data-notice]");
    const get = (name) => block.querySelector(`[data-${name}]`);
    const name = get("plush-name"), voice = get("voice"), voiceButton = get("voice-button");
    name.addEventListener("input", () => { name.value = name.value.toUpperCase(); });
    voice.addEventListener("change", () => { voiceButton.textContent = voice.files[0] ? voice.files[0].name : "UPLOAD VOICE (MP4/MP3)"; });
    const dateBox = get("birth-date"), calendar = document.createElement("div");
    calendar.className = "mp-deferred-customisation__calendar"; calendar.hidden = true; document.body.appendChild(calendar);
    let month = new Date(); const format = (date) => date.toLocaleDateString("en-GB");
    const render = () => { const y=month.getFullYear(),m=month.getMonth(),start=new Date(y,m,1).getDay(),last=new Date(y,m+1,0).getDate(); const weeks=["S","M","T","W","T","F","S"].map((d)=>`<div class="mp-deferred-customisation__calendar-weekday">${d}</div>`).join(""), blanks=Array.from({length:start},()=>"<span></span>").join(""), days=Array.from({length:last},(_,i)=>`<button type="button" data-day="${i+1}">${i+1}</button>`).join(""); calendar.innerHTML=`<div class="mp-deferred-customisation__calendar-head"><button type="button" data-month="-1">‹</button><span>${month.toLocaleDateString("en-GB",{month:"long",year:"numeric"})}</span><button type="button" data-month="1">›</button></div><div class="mp-deferred-customisation__calendar-grid">${weeks}${blanks}${days}</div>`; };
    calendar.addEventListener("click",(event)=>{const target=event.target.closest("button");if(!target)return;if(target.dataset.month){month.setMonth(month.getMonth()+Number(target.dataset.month));render();return;}if(target.dataset.day){dateBox.value=format(new Date(month.getFullYear(),month.getMonth(),Number(target.dataset.day)));calendar.hidden=true;}});
    dateBox.addEventListener("click",()=>{const [d,m,y]=dateBox.value.split("/");month=y?new Date(Number(y),Number(m)-1,Number(d)):new Date();const rect=dateBox.getBoundingClientRect();calendar.style.top=`${Math.min(rect.bottom+8,window.innerHeight-360)}px`;calendar.style.left=`${Math.min(rect.left,window.innerWidth-356)}px`;render();calendar.hidden=false;});
    document.addEventListener("pointerdown",(event)=>{if(!calendar.hidden&&!calendar.contains(event.target)&&!dateBox.contains(event.target))calendar.hidden=true;});
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
