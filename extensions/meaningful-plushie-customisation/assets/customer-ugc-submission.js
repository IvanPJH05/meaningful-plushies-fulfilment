(() => {
  const init = () => document.querySelectorAll('[data-ugc-submission]').forEach(block => {
    if (block.dataset.ugcReady) return;
    block.dataset.ugcReady = 'true';
    const form = block.querySelector('form'), notice = block.querySelector('[data-ugc-notice]'), button = form.querySelector('button[type=submit]');
    let session = null, uploadedFile = null;
    const say = (text, success = false) => { notice.textContent = text; notice.classList.toggle('is-success', success); };
    const request = async body => {
      const response = await fetch(block.dataset.apiUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      let result; try { result = await response.json(); } catch { throw new Error('The submission service is unavailable. Please try again later.'); }
      if (!response.ok || !result.ok) throw new Error(result.error || 'Your submission could not be saved. Please try again.');
      return result;
    };
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (!form.reportValidity() || button.disabled) return;
      const data = new FormData(form), video = data.get('video');
      if (data.get('website')) return;
      if (!(video instanceof File) || !video.size || video.size > 50 * 1024 * 1024) return say('Choose a video up to 50 MB.');
      const mime = {mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'}[video.name.split('.').pop().toLowerCase()];
      if (!mime) return say('Choose an MP4, MOV or WebM video.');
      button.disabled = true; form.setAttribute('aria-busy','true');
      try {
        if (!session) { say('Preparing your submission...'); session = (await request({action:'start'})).session; }
        if (uploadedFile !== video) {
          const {upload} = await request({action:'upload',token:session.token,fileName:video.name,contentType:mime,size:video.size});
          say('Uploading your video. Please keep this page open...');
          if (!upload.alreadyUploaded) {
            const response = await fetch(upload.signedUrl,{method:'PUT',headers:{'Content-Type':mime},body:video});
            if (!response.ok) throw new Error('Your video could not be uploaded. Please try again.');
          }
          uploadedFile = video;
        }
        say('Saving your submission...');
        const result = await request({action:'submit',token:session.token,customerName:data.get('customerName'),orderNumber:data.get('orderNumber'),phone:data.get('phone'),email:data.get('email'),notes:data.get('notes'),consent:data.get('consent')==='on'});
        form.reset(); session = null; uploadedFile = null;
        say(`Thank you! Your video has been submitted for review. Your reference is ${result.reference}.`,true);
      } catch(error) { say(error instanceof Error ? error.message : 'Please try again.'); }
      finally {button.disabled=false;form.removeAttribute('aria-busy');}
    });
  });
  init(); document.addEventListener('shopify:section:load',init);
})();
