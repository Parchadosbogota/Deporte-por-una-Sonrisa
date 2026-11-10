(() => {
 const cfg=window.APP_CONFIG||{},url=String(cfg.GOOGLE_SCRIPT_URL||''),$=id=>document.getElementById(id),money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n||0));let token=sessionStorage.getItem('TPS_ADMIN_TOKEN')||'',registrations=[],communities=[];
 function configured(){return url.startsWith('https://script.google.com/macros/s/')&&url.endsWith('/exec');}
 function msg(t,error=false){$('adminMessage').textContent=t;$('adminMessage').className='admin-message'+(error?' error':'');}
 function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function obj(f){return Object.fromEntries(new FormData(f).entries());}
 function get(action){return new Promise((resolve,reject)=>{if(!configured())return reject(Error('Pega la URL del Web App en config.js.'));const cb='tpsadm_'+Date.now()+'_'+Math.random().toString(36).slice(2),s=document.createElement('script'),timer=setTimeout(()=>{clean();reject(Error('Tiempo de espera agotado.'));},20000);function clean(){clearTimeout(timer);delete window[cb];s.remove();}window[cb]=d=>{clean();d?.ok?resolve(d):reject(Error(d?.error||'Error de consulta'));};s.onerror=()=>{clean();reject(Error('No se pudo conectar con Apps Script.'));};s.src=url+'?action='+encodeURIComponent(action)+'&token='+encodeURIComponent(token)+'&callback='+cb;document.body.append(s);});}
 function post(action,payload={}){return new Promise((resolve,reject)=>{const frame=document.createElement('iframe');frame.name='tps_admin_'+Date.now();frame.style.display='none';const f=document.createElement('form');f.method='POST';f.action=url;f.target=frame.name;f.style.display='none';[['action',action],['payload',JSON.stringify({...payload,token})]].forEach(([k,v])=>{const i=document.createElement('input');i.name=k;i.value=v;f.append(i);});const timer=setTimeout(()=>finish(Error('La operación está tardando más de lo habitual. No vuelvas a enviarla todavía: espera unos segundos y pulsa “Actualizar datos” para comprobar si se guardó.')),200000);function finish(err,r){clearTimeout(timer);window.removeEventListener('message',listener);frame.remove();f.remove();err?reject(err):resolve(r);}function listener(e){if(e.data?.type==='TPS_GAS_RESULT')finish(e.data.result?.ok?null:Error(e.data.result?.error||'Operación fallida'),e.data.result);}window.addEventListener('message',listener);document.body.append(frame,f);f.submit();});}
 async function login(){if(!configured())throw Error('Configura GOOGLE_SCRIPT_URL en config.js.');const r=await post('adminLogin',{password:$('loginPassword').value});token=r.token;sessionStorage.setItem('TPS_ADMIN_TOKEN',token);$('loginPanel').classList.add('hidden');$('dashboard').classList.remove('hidden');$('logoutBtn').classList.remove('hidden');await loadAll();}
 $('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';try{await login();}catch(err){$('loginError').textContent=err.message;}});
 $('logoutBtn').addEventListener('click',async()=>{try{await post('adminLogout',{});}catch(_){}sessionStorage.removeItem('TPS_ADMIN_TOKEN');location.reload();});
 document.querySelectorAll('.admin-tabs button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.admin-tabs button').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('tab-'+b.dataset.tab).classList.add('active');}));$('refreshBtn').addEventListener('click',loadAll);
 async function loadAll(){msg('Cargando información…');try{await Promise.all([stats(),participants(),finance(),toys(),loadCommunities(),faqs()]);msg('Información actualizada.');}catch(e){msg(e.message,true);if(/Sesión|vencida/i.test(e.message)){sessionStorage.removeItem('TPS_ADMIN_TOKEN');$('dashboard').classList.add('hidden');$('loginPanel').classList.remove('hidden');}}}
 async function stats(){const d=await get('adminDashboard'),items=[['Formularios recibidos',d.registrations_received],['Pendientes',d.pending],['Pagos confirmados',d.confirmed],['Pagos rechazados',d.rejected],['Ingresos',money(d.income)],['Egresos',money(d.expenses)],['Aportes adicionales',money(d.extra_donations)],['Juguetes verificados',d.toys_verified]];$('adminStats').innerHTML=items.map(x=>`<div class="admin-stat"><strong>${esc(x[1])}</strong><span>${esc(x[0])}</span></div>`).join('');$('financeSummary').textContent=`Ingresos: ${money(d.income)} · Egresos: ${money(d.expenses)} · Saldo: ${money(d.income-d.expenses)} · Aportes adicionales: ${money(d.extra_donations)}`;}
 async function participants(){const d=await get('adminRegistrations');registrations=d.registrations||[];renderParticipants();}
 function renderParticipants(){const q=$('participantSearch').value.toLowerCase(),st=$('statusFilter').value,com=$('communityFilter').value,rows=registrations.filter(r=>(!q||`${r.first_name} ${r.last_name} ${r.document_number}`.toLowerCase().includes(q))&&(!st||r.payment_status===st)&&(!com||r.community_name===com));$('participantsBody').innerHTML=rows.map(r=>`<tr><td>${esc(r.registration_code)}</td><td>${esc(r.first_name)} ${esc(r.last_name)}<br><small>${esc(r.email)}</small></td><td>${esc(r.document_type)} ${esc(r.document_number)}</td><td>${esc(r.phone)}</td><td>${esc(r.community_name||'Independiente')}</td><td>${esc(r.activity)}</td><td>${money(Number(r.registration_amount)+Number(r.extra_donation))}</td><td><span class="status-pill">${esc(r.payment_status)}</span></td><td><button class="action-btn view-btn" data-receipt="${esc(r.receipt_file_id)}">Ver comprobante</button></td><td><button class="action-btn confirm-btn" data-status="Pago confirmado" data-id="${esc(r.id)}">Confirmar</button><button class="action-btn reject-btn" data-status="Pago rechazado" data-id="${esc(r.id)}">Rechazar</button></td></tr>`).join('')||'<tr><td colspan="10">No hay registros para mostrar.</td></tr>';}
 ['participantSearch','statusFilter','communityFilter'].forEach(id=>$(id).addEventListener(id==='participantSearch'?'input':'change',renderParticipants));
 $('participantsBody').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{if(b.dataset.receipt){const d=await post('adminReceiptUrl',{file_id:b.dataset.receipt});window.open(d.url,'_blank','noopener');}else if(b.dataset.status){const note=prompt('Observación (opcional):')||'';await post('adminUpdatePayment',{id:b.dataset.id,status:b.dataset.status,note});await loadAll();}}catch(err){msg(err.message,true);}});
 async function finance(){const d=await get('adminFinance'),rows=d.rows||[];$('financeBody').innerHTML=rows.map(x=>`<tr><td>${esc(x['Fecha'])}</td><td>${esc(x['Tipo de movimiento'])}</td><td>${esc(x['Categoría'])}</td><td>${esc(x['Concepto'])}</td><td>${money(x['Valor'])}</td><td>${esc(x['Responsable'])}</td></tr>`).join('');}
 $('financeForm').addEventListener('submit',async e=>{e.preventDefault();const v=obj(e.target);v.movement_type=v.movement_type==='income'?'Ingreso':'Egreso';v.amount=Number(v.amount);try{await post('adminAddFinance',v);e.target.reset();await loadAll();}catch(x){msg(x.message,true);}});
 async function toys(){const d=await get('adminToys');$('toysBody').innerHTML=(d.rows||[]).map(x=>`<tr><td>${esc(x['Nombre del donante'])}</td><td>${esc(x['Cantidad'])}</td><td>${esc(x['Tipo de juguete'])}</td><td>${esc(x['Estado'])}</td><td>${esc(x['Fecha de recepción'])}</td><td>${x['Verificado']?'Sí':'No'} <button class="action-btn" data-toy="${esc(x.ID)}" data-verified="${x['Verificado']?'false':'true'}">${x['Verificado']?'Quitar verificación':'Verificar'}</button></td></tr>`).join('');}
 $('toyForm').addEventListener('submit',async e=>{e.preventDefault();const v=obj(e.target);v.responsible=v.received_by;v.verified=new FormData(e.target).has('verified');v.quantity=Number(v.quantity);try{await post('adminAddToy',v);e.target.reset();await loadAll();}catch(x){msg(x.message,true);}});
 $('toysBody').addEventListener('click',async e=>{const b=e.target.closest('[data-toy]');if(!b)return;try{await post('adminVerifyToy',{id:b.dataset.toy,verified:b.dataset.verified==='true'});await loadAll();}catch(x){msg(x.message,true);}});
 async function loadCommunities(){const d=await get('adminCommunities');communities=d.rows||[];$('communitiesAdmin').innerHTML=communities.map(c=>`<div class="admin-community-list"><span>${esc(c['Nombre'])} ${c['Activa']?'':'(inactiva)'}</span><button class="action-btn reject-btn" data-community="${esc(c.ID)}" data-active="${c['Activa']?'false':'true'}">${c['Activa']?'Desactivar':'Activar'}</button></div>`).join('');$('communityFilter').innerHTML='<option value="">Todas las comunidades</option>'+communities.map(c=>`<option value="${esc(c['Nombre'])}">${esc(c['Nombre'])}</option>`).join('');}
 const logoInput=$('communityLogoFile'),logoPreview=$('communityLogoPreview'),communitySubmit=$('addCommunityBtn');
 const LOGO_MAX_BYTES=2*1024*1024,LOGO_TYPES=['image/png','image/jpeg','image/webp'];
 function validateLogo(file){if(!file)throw Error('Selecciona el archivo del logo.');if(!LOGO_TYPES.includes(file.type))throw Error('Formato no válido. Utiliza PNG, JPG o WebP.');if(file.size>LOGO_MAX_BYTES)throw Error('El logo supera los 2 MB. Reduce el tamaño del archivo.');}
 function readLogoAsBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const value=String(reader.result||'');const comma=value.indexOf(',');if(comma<0)return reject(Error('No se pudo leer el archivo del logo.'));resolve(value.slice(comma+1));};reader.onerror=()=>reject(Error('No se pudo leer el archivo seleccionado.'));reader.readAsDataURL(file);});}
 logoInput.addEventListener('change',()=>{logoPreview.classList.add('hidden');logoPreview.removeAttribute('src');const file=logoInput.files?.[0];if(!file)return;try{validateLogo(file);const previewUrl=URL.createObjectURL(file);logoPreview.onload=()=>URL.revokeObjectURL(previewUrl);logoPreview.src=previewUrl;logoPreview.classList.remove('hidden');msg('Logo seleccionado correctamente.');}catch(err){logoInput.value='';msg(err.message,true);}});
 $('communityForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  const file=logoInput.files?.[0];
  try{
   validateLogo(file);
   communitySubmit.disabled=true;
   communitySubmit.textContent='Preparando logo…';
   msg('Preparando el logo para enviarlo a Drive…');
   const logo_file={file_name:file.name,mime_type:file.type,base64:await readLogoAsBase64(file)};
   const payload={name:form.elements.name.value.trim(),contact_url:form.elements.contact_url.value.trim(),logo_file};
   communitySubmit.textContent='Enviando…';
   msg('Subiendo la comunidad y su logo. No cierres esta ventana…');
   const result=await post('adminAddCommunity',payload);

   // Limpiar inmediatamente después de recibir confirmación del servidor.
   form.reset();
   logoInput.value='';
   logoPreview.onload=null;
   logoPreview.removeAttribute('src');
   logoPreview.classList.add('hidden');
   communitySubmit.textContent='Comunidad agregada ✓';
   msg('¡Comunidad agregada correctamente! El logo quedó guardado en Google Drive y los datos en la base de datos.');

   // Actualizar listados sin volver a bloquear ni conservar los datos del formulario.
   try{
    await Promise.all([loadCommunities(),stats()]);
   }catch(refreshError){
    msg('¡Comunidad agregada correctamente! El logo y los datos ya se guardaron. No se pudo actualizar el listado automáticamente; pulsa “Actualizar datos”.',true);
   }
  }catch(x){
   msg(x.message||'No se pudo agregar la comunidad. Revisa la conexión e inténtalo de nuevo.',true);
  }finally{
   communitySubmit.disabled=false;
   communitySubmit.textContent='Agregar comunidad';
  }
 });
 $('communitiesAdmin').addEventListener('click',async e=>{const b=e.target.closest('[data-community]');if(!b)return;try{await post('adminUpdateCommunity',{id:b.dataset.community,active:b.dataset.active==='true'});await loadAll();}catch(x){msg(x.message,true);}});
 async function faqs(){const d=await get('adminFaqs');$('faqAdmin').innerHTML=(d.rows||[]).map(x=>`<div class="faq-admin-item"><span>${esc(x['Pregunta'])}</span><button class="action-btn reject-btn" data-faq="${esc(x.ID)}">Eliminar</button></div>`).join('');}
 $('faqForm').addEventListener('submit',async e=>{e.preventDefault();const v=obj(e.target);v.sort_order=Number(v.sort_order||0);try{await post('adminAddFaq',v);e.target.reset();await loadAll();}catch(x){msg(x.message,true);}});$('faqAdmin').addEventListener('click',async e=>{const b=e.target.closest('[data-faq]');if(!b)return;try{await post('adminDeleteFaq',{id:b.dataset.faq});await loadAll();}catch(x){msg(x.message,true);}});
 $('galleryForm').addEventListener('submit',async e=>{e.preventDefault();const v=obj(e.target);v.media_type=v.media_type==='photo'?'image':v.media_type;v.sort_order=Number(v.sort_order||0);try{await post('adminAddGallery',v);e.target.reset();msg('Elemento agregado a la galería.');}catch(x){msg(x.message,true);}});
 $('exportCsv').addEventListener('click',()=>{const cols=['registration_code','first_name','last_name','document_type','document_number','age','phone','email','city','community_name','activity','registration_amount','extra_donation','payment_status','created_at'];const csv=[cols.join(';'),...registrations.map(r=>cols.map(k=>'"'+String(r[k]??'').replace(/"/g,'""')+'"').join(';'))].join('\n'),blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='participantes_trail_por_una_sonrisa.csv';a.click();URL.revokeObjectURL(u);});
 if(token){$('loginPanel').classList.add('hidden');$('dashboard').classList.remove('hidden');$('logoutBtn').classList.remove('hidden');loadAll().catch(e=>msg(e.message,true));}
})();
