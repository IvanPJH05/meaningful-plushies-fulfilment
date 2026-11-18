(() => {
  const root = document.querySelector('[data-nfc-activation]');
  if (!root) return;
  const endpoint = root.dataset.endpoint;
  const introduction = root.querySelector('[data-nfc-introduction]');
  const phoneForm = root.querySelector('[data-nfc-phone-form]');
  const detailsForm = root.querySelector('[data-nfc-details-form]');
  const processing = root.querySelector('[data-nfc-processing]');
  const feedback = root.querySelector('[data-nfc-feedback]');
  const check = root.querySelector('[data-nfc-check]');
  let session = '';
  let orders = [];
  let busy = false;
  let checking = false;

  async function request(body) {
    const response = await fetch(endpoint, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Please try again.');
    return data;
  }

  function setBusy(value) {
    busy = value;
    root.querySelectorAll('button[type="submit"]').forEach(button => { button.disabled = value; });
  }

  function selectedOrder() {
    const order = orders.find(item => item.id === detailsForm.elements.orderId.value);
    if (!order) return;
    detailsForm.elements.plushName.value = order.plushName || '';
    const character = String(order.character || '');
    const match = [['Tootsie', /tootsie/i], ['Hunnie', /hunn?ie|hunny/i], ['Dragon Warrior', /dragon/i], ['Billy', /billy/i]].find(([,pattern]) => pattern.test(character));
    detailsForm.elements.character.value = match ? match[0] : '';
  }

  async function waitForCertificate() {
    if (checking) return;
    checking = true;
    check.hidden = true;
    feedback.textContent = 'Opening your certificate as soon as it is ready…';
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const data = await request();
        if (data.state === 'assigned') {
          window.location.reload();
          return;
        }
        if (data.state !== 'processing') {
          feedback.textContent = 'This card’s activation changed. Refresh the page or contact our team.';
          checking = false;
          check.hidden = false;
          return;
        }
      } catch {
        feedback.textContent = 'Your details are saved. Checking your certificate again…';
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    feedback.textContent = 'Your details are saved and linked. The certificate is still being prepared. You can check again or return to this card’s link later.';
    checking = false;
    check.hidden = false;
  }

  root.querySelector('[data-nfc-customise]').addEventListener('click', () => {
    introduction.hidden = true;
    phoneForm.hidden = false;
    phoneForm.elements.phone.focus();
  });
  phoneForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    feedback.textContent = 'Checking your order…';
    try {
      const data = await request({ action: 'verify', phone: phoneForm.elements.phone.value });
      session = data.session;
      orders = data.orders;
      const select = detailsForm.elements.orderId;
      select.replaceChildren();
      for (const order of orders) {
        const option = document.createElement('option');
        option.value = order.id;
        option.textContent = `#${order.orderNumber || order.id} · ${order.character || 'Plushie'}${order.plushName ? ` · ${order.plushName}` : ''}`;
        select.append(option);
      }
      selectedOrder();
      phoneForm.hidden = true;
      detailsForm.hidden = false;
      detailsForm.elements.plushName.focus();
      feedback.textContent = '';
    } catch (error) {
      feedback.textContent = error.message || 'Your phone number could not be checked. Please try again.';
    } finally {
      setBusy(false);
    }
  });
  detailsForm.elements.orderId.addEventListener('change', selectedOrder);
  root.querySelector('[data-nfc-change-phone]').addEventListener('click', () => {
    if (busy) return;
    session = '';
    detailsForm.hidden = true;
    phoneForm.hidden = false;
    feedback.textContent = '';
    phoneForm.elements.phone.focus();
  });
  detailsForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    feedback.textContent = 'Saving your plushie’s details…';
    const fields = {};
    for (const key of ['character', 'plushName', 'plushGender', 'plushBirthDate', 'plushBirthPlace', 'plushFavouritePerson', 'plushBelongsTo', 'meaningfulNote']) {
      fields[key] = detailsForm.elements[key].value;
    }
    try {
      await request({ action: 'submit', session, orderId: detailsForm.elements.orderId.value, fields });
      detailsForm.hidden = true;
      processing.hidden = false;
      void waitForCertificate();
    } catch (error) {
      feedback.textContent = error.message || 'Your details could not be saved. Please try again.';
    } finally {
      setBusy(false);
    }
  });
  check.addEventListener('click', () => void waitForCertificate());
  if (root.dataset.processing === 'true') void waitForCertificate();
})();
