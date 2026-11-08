(() => {
  const cfg = window.APP_CONFIG || {};
  const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("TU-PROYECTO") &&
    cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("PEGA_AQUI");
  const client = configured ? supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(Number(n||0));
  const form = $("registrationForm"), notice = $("formNotice"), button = $("submitButton");
  const fileInput = $("receipt"), preview = $("receiptPreview");
  let previewUrl = null;

  $("menuToggle").addEventListener("click",()=>$("mainNav").classList.toggle("open"));
  document.querySelectorAll("#mainNav a").forEach(a=>a.addEventListener("click",()=>$("mainNav").classList.remove("open")));
  function countdown(){
    const target = new Date(cfg.EVENT_DATE || "2026-12-13T07:00:00-05:00").getTime();
    const diff = target-Date.now();
    if(diff<=0){$("countdown").textContent="¡Llegó el día de encontrarnos!";return;}
    const d=Math.floor(diff/86400000),h=Math.floor(diff%86400000/3600000),m=Math.floor(diff%3600000/60000),s=Math.floor(diff%60000/1000);
    $("countdown").textContent=`FALTAN ${d} DÍAS · ${h} H · ${m} MIN · ${s} SEG`;
  }
  countdown();setInterval(countdown,1000);

  $("extraDonation").addEventListener("change",()=>{
    const other=$("extraDonation").value==="other";
    $("otherDonationWrap").classList.toggle("hidden",!other);
    $("otherDonation").required=other;
    if(!other)$("otherDonation").value="";
  });
  fileInput.addEventListener("change",()=>{
    const f=fileInput.files[0];$("fileName").textContent=f?`${f.name} (${(f.size/1024/1024).toFixed(2)} MB)`:"Ningún archivo seleccionado";
    preview.innerHTML="";
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
    if(f && f.type.startsWith("image/")){previewUrl=URL.createObjectURL(f);const img=document.createElement("img");img.src=previewUrl;img.alt="Vista previa del comprobante";preview.append(img);}
    if(f && f.type==="application/pdf"){preview.textContent="PDF seleccionado correctamente.";}
  });

  async function loadPublicData(){
    if(!client){$("statRegistered").textContent="—";$("statConfirmed").textContent="—";$("statCommunities").textContent="—";$("statMoney").textContent="—";$("statToys").textContent="—";$("statExtra").textContent="—";return;}
    try{
      const {data,error}=await client.rpc("public_event_stats");if(error)throw error;
      $("statRegistered").textContent=data.registrations_received??0;
      $("statConfirmed").textContent=data.participants_confirmed??0;
      $("statCommunities").textContent=data.communities_count??0;
      $("statMoney").textContent=money(data.money_raised??0);
      $("statToys").textContent=data.toys_verified??0;
      $("statExtra").textContent=money(data.extra_donations??0);
    }catch(e){console.warn("No fue posible cargar estadísticas públicas:",e.message);}
    try{
      const {data,error}=await client.from("communities").select("id,name,logo_url").eq("is_active",true).order("name");
      if(!error&&data){
        const grid=$("communityGrid"),select=$("communitySelect");grid.innerHTML="";
        data.forEach(c=>{
          const item=document.createElement("div");item.className="community-item";
          if(c.logo_url){const img=document.createElement("img");img.src=c.logo_url;img.alt=`Logo ${c.name}`;item.append(img);}
          const name=document.createElement("div");name.textContent=c.name;item.append(name);grid.append(item);
          const opt=document.createElement("option");opt.value=c.id;opt.textContent=c.name;select.append(opt);
        });
        if(!data.length)grid.textContent="Pronto anunciaremos las comunidades aliadas.";
      }
    }catch(e){console.warn(e.message);}
    try{
      const {data,error}=await client.from("public_gallery").select("id,media_url,media_type,alt_text").order("sort_order");
      if(!error&&data){
        const photos=$("galleryGrid"),gifs=$("gifSlider");photos.innerHTML="";gifs.innerHTML="";
        data.forEach(x=>{
          const img=document.createElement("img");img.src=x.media_url;img.alt=x.alt_text||"Imagen del evento";
          if(x.media_type==="gif")gifs.append(img);else photos.append(img);
        });
        if(!photos.children.length)photos.textContent="Pronto compartiremos imágenes del lugar y de nuestras actividades.";
      }
    }catch(e){console.warn(e.message);}
    try{
      const {data,error}=await client.from("public_faqs").select("question,answer").order("sort_order");
      if(!error&&data&&data.length){const box=$("faqList");box.innerHTML="";data.forEach(f=>{const d=document.createElement("details"),s=document.createElement("summary"),p=document.createElement("p");s.textContent=f.question;p.textContent=f.answer;d.append(s,p);box.append(d);});}
    }catch(e){console.warn(e.message);}
  }

  function showError(msg){notice.className="form-notice error";notice.textContent=msg;notice.scrollIntoView({behavior:"smooth",block:"center"});}
  form.addEventListener("submit",async e=>{
    e.preventDefault();notice.textContent="";notice.className="form-notice";
    if(!client){showError("La plataforma aún no está configurada. La organización debe completar la conexión con Supabase antes de recibir inscripciones.");return;}
    if(!form.reportValidity())return;
    const f=fileInput.files[0];
    if(!f){showError("Debes adjuntar el comprobante de pago.");return;}
    const allowed=["image/jpeg","image/png","application/pdf"];
    if(!allowed.includes(f.type)){showError("Formato no permitido. Adjunta JPG, PNG o PDF.");return;}
    if(f.size>5*1024*1024){showError("El comprobante supera el límite de 5 MB.");return;}
    const fd=new FormData(form),extra=fd.get("extra_donation");
    let extraAmount=extra==="other"?Number(fd.get("other_donation")||0):Number(extra||0);
    if(extraAmount<0||!Number.isSafeInteger(extraAmount)){showError("El aporte adicional no es válido.");return;}
    if(extra==="other"&&extraAmount<1000){showError("El aporte adicional debe ser de al menos $1.000.");return;}
    const doc=String(fd.get("document_number")||"").trim();
    if(!doc){showError("Ingresa tu número de documento.");return;}
    const payload={
      first_name:String(fd.get("first_name")).trim(),last_name:String(fd.get("last_name")).trim(),
      document_type:fd.get("document_type"),document_number:doc,age:Number(fd.get("age")),
      phone:String(fd.get("phone")).trim(),email:String(fd.get("email")).trim().toLowerCase(),
      city:String(fd.get("city")).trim(),community_id:fd.get("community_id")||null,
      activity:fd.get("activity"),discovery_source:fd.get("discovery_source")||null,
      experience:fd.get("experience")||null,emergency_name:String(fd.get("emergency_name")).trim(),
      emergency_phone:String(fd.get("emergency_phone")).trim(),emergency_relationship:String(fd.get("emergency_relationship")).trim(),
      registration_amount:Number(cfg.EVENT_PRICE_COP||25000),extra_donation:extraAmount,
      toy_donation:fd.get("toy_donation"),accept_terms:fd.get("accept_terms")==="on",
      accept_data:fd.get("accept_data")==="on",accept_waiver:fd.get("accept_waiver")==="on",
      accept_image:fd.get("accept_image")==="on"
    };
    if(!payload.accept_terms||!payload.accept_data||!payload.accept_waiver){showError("Debes aceptar los términos, el tratamiento de datos y la exoneración para continuar.");return;}
    button.disabled=true;button.textContent="ENVIANDO…";
    let uploadedPath=null;
    try{
      const token=crypto.randomUUID();
      const ext=f.name.split(".").pop().toLowerCase();
      uploadedPath=`receipts/${token}.${ext}`;
      const {error:uploadError}=await client.storage.from("payment-receipts").upload(uploadedPath,f,{contentType:f.type,upsert:false});
      if(uploadError)throw new Error("No fue posible guardar el comprobante: "+uploadError.message);
      const {data,error}=await client.rpc("submit_registration",{p_payload:payload,p_receipt_path:uploadedPath,p_request_token:token});
      if(error)throw error;
      if(!data||!data.registration_code)throw new Error("El servidor no confirmó el registro. No se mostrará una inscripción exitosa.");
      $("registrationCode").textContent=data.registration_code;
      $("successModal").classList.add("show");$("successModal").setAttribute("aria-hidden","false");
      form.reset();$("fileName").textContent="Ningún archivo seleccionado";preview.innerHTML="";$("otherDonationWrap").classList.add("hidden");
      await loadPublicData();
    }catch(err){
      console.error(err);
      if(uploadedPath){try{await client.storage.from("payment-receipts").remove([uploadedPath]);}catch(_){}}
      const msg=String(err.message||err);
      showError(msg.includes("duplicate")||msg.includes("registrations_document_event_unique")?"Ya existe una inscripción con ese documento para este evento. Si necesitas ayuda, comunícate con la organización.":`No pudimos completar tu inscripción: ${msg}`);
    }finally{button.disabled=false;button.textContent="ENVIAR MI INSCRIPCIÓN";}
  });
  $("closeModal").addEventListener("click",()=>{$("successModal").classList.remove("show");$("successModal").setAttribute("aria-hidden","true");});
  $("successModal").addEventListener("click",e=>{if(e.target===$("successModal"))$("closeModal").click();});
  loadPublicData();
  setInterval(loadPublicData,60000);
})();