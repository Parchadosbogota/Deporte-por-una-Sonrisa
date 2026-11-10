(() => {
  const cfg = window.APP_CONFIG || {};
  const $ = id => document.getElementById(id);

  const endpoint = String(cfg.GOOGLE_SCRIPT_URL || '').trim();

  const money = n => new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Number(n || 0));

  const form = $('registrationForm');
  const notice = $('formNotice');
  const button = $('submitButton');
  const fileInput = $('receipt');
  const preview = $('receiptPreview');

  let previewUrl = null;

  function configured() {
    return endpoint.startsWith('https://script.google.com/macros/s/') &&
      endpoint.endsWith('/exec');
  }

  // CONSULTAR INFORMACIÓN DE GOOGLE APPS SCRIPT MEDIANTE IFRAME
function getOnce(action) {
  return new Promise((resolve, reject) => {
    if (!configured()) {
      return reject(
        Error('La conexión con Google Apps Script no está configurada.')
      );
    }

    const iframe = document.createElement('iframe');

    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');

    const timer = setTimeout(() => {
      cleanup();
      reject(Error('Tiempo de espera agotado al consultar Apps Script.'));
    }, 30000);

    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener('message', handleMessage);
      iframe.remove();
    }

    function handleMessage(event) {
      const message = event.data;

      if (message?.type !== 'TPS_GAS_PUBLIC_DATA') return;

      cleanup();

      const data = message.result;

      if (data?.ok) {
        resolve(data);
      } else {
        reject(
          Error(data?.error || 'No fue posible consultar los datos.')
        );
      }
    }

    window.addEventListener('message', handleMessage);

    iframe.onerror = () => {
      cleanup();
      reject(Error('No se pudo cargar la consulta de Apps Script.'));
    };

    iframe.src = endpoint +
      '?action=' + encodeURIComponent(action) +
      '&transport=iframe&_=' + Date.now();

    document.body.appendChild(iframe);
  });
}

  // Reintentar consultas públicas ante bloqueos temporales en redes móviles.
  async function get(action) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await getOnce(action); }
      catch (err) {
        lastError = err;
        if (attempt < 2) await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  // ENVIAR INFORMACIÓN A GOOGLE APPS SCRIPT
  function post(action, payload = {}, extras = {}) {
    return new Promise((resolve, reject) => {
      if (!configured()) {
        return reject(Error('La conexión con Google Apps Script aún no está configurada.'));
      }

      const frame = document.createElement('iframe');

      frame.name = 'tps_frame_' + Date.now();
      frame.style.display = 'none';

      const f = document.createElement('form');

      f.method = 'POST';
      f.action = endpoint;
      f.target = frame.name;
      f.style.display = 'none';

      const fields = {
        action,
        payload: JSON.stringify(payload),
        ...extras
      };

      Object.entries(fields).forEach(([k, v]) => {
        const i = document.createElement('input');
        i.name = k;
        i.value = String(v ?? '');
        f.append(i);
      });

      const timer = setTimeout(() => {
        finish(Error(
          'Tiempo de espera agotado. Verifica la conexión e intenta nuevamente.'
        ));
      }, 60000);

      function finish(err, result) {
        clearTimeout(timer);
        window.removeEventListener('message', listener);
        f.remove();
        frame.remove();

        err ? reject(err) : resolve(result);
      }

      function listener(e) {
        if (e.data?.type === 'TPS_GAS_RESULT') {
          finish(
            e.data.result?.ok
              ? null
              : Error(e.data.result?.error || 'La operación no pudo completarse.'),
            e.data.result
          );
        }
      }

      window.addEventListener('message', listener);

      document.body.append(frame, f);
      f.submit();
    });
  }

  // MOSTRAR ERRORES
  function showError(msg) {
    notice.className = 'form-notice error';
    notice.textContent = msg;

    notice.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }

  // MENÚ DE NAVEGACIÓN
  $('menuToggle')?.addEventListener('click', () => {
    $('mainNav').classList.toggle('open');
  });

  document.querySelectorAll('#mainNav a').forEach(a => {
    a.addEventListener('click', () => {
      $('mainNav').classList.remove('open');
    });
  });

  // CUENTA REGRESIVA
  function countdown() {
    const target = new Date(
      cfg.EVENT_DATE || '2026-12-13T06:00:00-05:00'
    ).getTime();

    const diff = target - Date.now();

    if (!$('countdown')) return;

    if (diff <= 0) {
      $('countdown').textContent = '¡Llegó el día de encontrarnos!';
      return;
    }

    const d = Math.floor(diff / 86400000);
    const h = Math.floor(diff % 86400000 / 3600000);
    const m = Math.floor(diff % 3600000 / 60000);
    const s = Math.floor(diff % 60000 / 1000);

    $('countdown').textContent =
      `FALTAN ${d} DÍAS · ${h} H · ${m} MIN · ${s} SEG`;
  }

  countdown();
  setInterval(countdown, 1000);

  // APORTES ADICIONALES
  $('extraDonation')?.addEventListener('change', () => {
    const other = $('extraDonation').value === 'other';

    $('otherDonationWrap').classList.toggle('hidden', !other);
    $('otherDonation').required = other;

    if (!other) {
      $('otherDonation').value = '';
    }
  });

  // COMPROBANTE DE PAGO
  fileInput?.addEventListener('change', () => {
    const f = fileInput.files[0];

    $('fileName').textContent = f
      ? `${f.name} (${(f.size / 1048576).toFixed(2)} MB)`
      : 'Ningún archivo seleccionado';

    preview.innerHTML = '';

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    previewUrl = null;

    if (f && f.type.startsWith('image/')) {
      previewUrl = URL.createObjectURL(f);

      const img = document.createElement('img');
      img.src = previewUrl;
      img.alt = 'Vista previa del comprobante';

      preview.append(img);

    } else if (f?.type === 'application/pdf') {
      preview.textContent = 'PDF seleccionado correctamente.';
    }
  });

  // MOSTRAR LOGOS ALMACENADOS EN GOOGLE DRIVE
  function addCommunityLogo(img, value) {
    const raw = String(value || '').trim();

    const match = raw.match(
      /(?:\/d\/|[?&]id=|\/file\/d\/)([a-zA-Z0-9_-]{20,})/
    );

    const id = match?.[1];

    if (!id) {
      img.src = raw;
      return;
    }

    const alternatives = [
      'https://drive.google.com/thumbnail?id=' +
        encodeURIComponent(id) + '&sz=w1000',

      'https://drive.google.com/uc?export=view&id=' +
        encodeURIComponent(id),

      'https://lh3.googleusercontent.com/d/' +
        encodeURIComponent(id)
    ];

    let attempt = 0;

    img.onerror = () => {
      attempt++;

      if (attempt < alternatives.length) {
        img.src = alternatives[attempt];
      } else {
        img.style.display = 'none';
      }
    };

    img.src = alternatives[0];
  }

  // CARGAR DATOS PÚBLICOS
  async function loadPublicData() {
    try {
      const d = await get('publicData');
      const s = d.stats || {};

      [
        ['statRegistered', s.registrations_received],
        ['statConfirmed', s.participants_confirmed],
        ['statCommunities', s.communities_count],
        ['statMoney', money(s.money_raised)],
        ['statToys', s.toys_verified],
        ['statExtra', money(s.extra_donations)]
      ].forEach(([id, v]) => {
        if ($(id)) {
          $(id).textContent = v ?? 0;
        }
      });

      // COMUNIDADES ALIADAS
      const grid = $('communityGrid');
      const select = $('communitySelect');

      if (grid) {
        grid.innerHTML = '';

        if (select) {
          select.innerHTML =
            '<option value="">Ninguna / Independiente</option>';
        }

        (d.communities || []).forEach(c => {
          const item = document.createElement('div');
          item.className = 'community-item';

          if (c.logo_url) {
            const img = document.createElement('img');

            img.alt = 'Logo ' + c.name;

            addCommunityLogo(img, c.logo_url);

            item.append(img);
          }

          const n = document.createElement('div');
          n.textContent = c.name;

          item.append(n);
          grid.append(item);

          if (select) {
            const o = document.createElement('option');

            o.value = c.id;
            o.textContent = c.name;

            select.append(o);
          }
        });

        if (!d.communities?.length) {
          grid.textContent =
            'Pronto anunciaremos las comunidades aliadas.';
        }
      }

      // GALERÍA DE FOTOGRAFÍAS Y GIF
      const photos = $('galleryGrid');
      const gifs = $('gifSlider');

      if (photos && gifs) {
        photos.innerHTML = '';
        gifs.innerHTML = '';

        (d.gallery || []).forEach(x => {
          const img = document.createElement('img');

          img.src = x.media_url;
          img.alt = x.alt_text || 'Imagen del evento';

          (x.media_type === 'gif' ? gifs : photos).append(img);
        });

        if (!photos.children.length) {
          photos.textContent =
            'Pronto compartiremos imágenes del lugar y de nuestras actividades.';
        }
      }

      // PREGUNTAS FRECUENTES
      const box = $('faqList');

      if (box && d.faqs?.length) {
        box.innerHTML = '';

        d.faqs.forEach(x => {
          const det = document.createElement('details');
          const sum = document.createElement('summary');
          const p = document.createElement('p');

          sum.textContent = x.question;
          p.textContent = x.answer;

          det.append(sum, p);
          box.append(det);
        });
      }

    } catch (e) {
      console.error('ERROR AL CARGAR DATOS:', e);

      const errorMessage = e?.message || String(e);

      ['statRegistered','statConfirmed','statCommunities','statMoney','statToys','statExtra']
        .forEach(id => {
          if ($(id)) $(id).textContent = 'Error de conexión';
        });

      const grid = $('communityGrid');

      if (grid) {
        grid.textContent = 'Detalle del error: ' + errorMessage;
      }

      console.error('Detalle del error:', errorMessage);
    }

  }

  // FORMULARIO DE INSCRIPCIÓN
  form?.addEventListener('submit', async e => {
    e.preventDefault();

    notice.textContent = '';
    notice.className = 'form-notice';

    if (!form.reportValidity()) return;

    const f = fileInput.files[0];

    if (!f) {
      return showError('Debes adjuntar el comprobante de pago.');
    }

    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(f.type)) {
      return showError('Formato no permitido. Adjunta JPG, PNG o PDF.');
    }

    if (f.size > 5 * 1024 * 1024) {
      return showError('El comprobante supera el límite de 5 MB.');
    }

    const fd = new FormData(form);
    const birthDate = String(fd.get('birth_date') || '').trim();

function calculateAge(dateString) {
  if (!dateString) return null;

    const [year, month, day] = dateString.split('-').map(Number);

    const birth = new Date(year, month - 1, day);
    const today = new Date();

    if (
      birth.getFullYear() !== year ||
      birth.getMonth() !== month - 1 ||
      birth.getDate() !== day
    ) {
      return null;
    }

    let age = today.getFullYear() - year;

    if (
      today.getMonth() < month - 1 ||
      (today.getMonth() === month - 1 && today.getDate() < day)
    ) {
      age--;
    }

    return age;
  }

  const calculatedAge = calculateAge(birthDate);

  if (calculatedAge === null || calculatedAge < 1 || calculatedAge > 110) {
    return showError('Verifica que la fecha de nacimiento sea válida.');
  }
    const extra = fd.get('extra_donation');

    let extraAmount = extra === 'other'
      ? Number(fd.get('other_donation') || 0)
      : Number(extra || 0);

    if (
      !Number.isSafeInteger(extraAmount) ||
      extraAmount < 0 ||
      (extra === 'other' && extraAmount < 1000)
    ) {
      return showError('El aporte adicional no es válido.');
    }

    const payload = {
      first_name: String(fd.get('first_name')).trim(),
      last_name: String(fd.get('last_name')).trim(),
      document_type: fd.get('document_type'),
      document_number: String(fd.get('document_number')).trim(),
      birth_date: birthDate,
      age: calculatedAge,
      phone: String(fd.get('phone')).trim(),
      email: String(fd.get('email')).trim().toLowerCase(),
      city: String(fd.get('city')).trim(),
      community_id: fd.get('community_id') || '',
      activity: fd.get('activity'),
      discovery_source: fd.get('discovery_source') || '',
      experience: fd.get('experience') || '',
      emergency_name: String(fd.get('emergency_name')).trim(),
      emergency_phone: String(fd.get('emergency_phone')).trim(),
      emergency_relationship: String(fd.get('emergency_relationship')).trim(),
      extra_donation: extraAmount,
      toy_donation: fd.get('toy_donation'),
      accept_terms: fd.get('accept_terms') === 'on',
      accept_data: fd.get('accept_data') === 'on',
      accept_waiver: fd.get('accept_waiver') === 'on',
      accept_image: fd.get('accept_image') === 'on'
    };

    if (
      !payload.accept_terms ||
      !payload.accept_data ||
      !payload.accept_waiver
    ) {
      return showError(
        'Debes aceptar los términos, el tratamiento de datos y la exoneración.'
      );
    }

    button.disabled = true;
    button.textContent = 'ENVIANDO…';

    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();

        r.onload = () => {
          res(String(r.result).split(',')[1]);
        };

        r.onerror = rej;

        r.readAsDataURL(f);
      });

      const result = await post(
        'submitRegistration',
        payload,
        {
          receipt_base64: base64,
          receipt_mime: f.type,
          receipt_name: f.name
        }
      );

      if (!result.registration_code) {
        throw Error('El servidor no confirmó el registro.');
      }

      $('registrationCode').textContent = result.registration_code;

      $('successModal').classList.add('show');

      $('successModal').setAttribute('aria-hidden', 'false');

      form.reset();

      $('fileName').textContent = 'Ningún archivo seleccionado';

      preview.innerHTML = '';

      $('otherDonationWrap').classList.add('hidden');

      await loadPublicData();

    } catch (err) {
      console.error(err);

      showError(
        err.message.includes('DUPLICATE_DOCUMENT')
          ? 'Ya existe una inscripción con ese documento para este evento. Comunícate con la organización.'
          : 'No pudimos completar tu inscripción: ' + err.message
      );

    } finally {
      button.disabled = false;
      button.textContent = 'ENVIAR MI INSCRIPCIÓN';
    }
  });

  // CERRAR VENTANA DE CONFIRMACIÓN
  $('closeModal')?.addEventListener('click', () => {
    $('successModal').classList.remove('show');
    $('successModal').setAttribute('aria-hidden', 'true');
  });

  $('successModal')?.addEventListener('click', e => {
    if (e.target === $('successModal')) {
      $('closeModal').click();
    }
  });

  // INICIAR CARGA DE INFORMACIÓN
  loadPublicData();

  setInterval(loadPublicData, 60000);

})();