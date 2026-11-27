/* Theme-aware dialogs shared by the profile tools. */
window.ProfileDialog = {
 show({title='알림',message='',kind='alert',value='',danger=false}={}) {
  let host=document.getElementById('profileDialog');
  if(!host){
   host=document.createElement('div');host.id='profileDialog';host.className='pd-overlay';
   host.innerHTML='<section class="pd-box" role="dialog" aria-modal="true" aria-labelledby="pdTitle"><span class="pd-mark">✦</span><h2 id="pdTitle"></h2><p class="pd-message"></p><input class="pd-input" hidden><footer><button class="pd-cancel">취소</button><button class="pd-ok">확인</button></footer></section>';
   document.body.append(host);
   const style=document.createElement('style');style.textContent='.pd-overlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:#09090dbb;backdrop-filter:blur(7px);opacity:0;pointer-events:none;transition:opacity .16s}.pd-overlay.open{opacity:1;pointer-events:auto}.pd-box{width:min(420px,100%);padding:25px;background:#242428;color:#eee;border:1px solid #44444d;border-radius:18px;box-shadow:0 24px 80px #0009;transform:translateY(8px) scale(.98);transition:transform .18s}.pd-overlay.open .pd-box{transform:none}.pd-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:#e7a9cf22;color:#e7a9cf;font-size:21px}.pd-box h2{margin:14px 0 5px;font-size:19px}.pd-message{margin:0;color:#aaa;white-space:pre-wrap;overflow-wrap:anywhere}.pd-input{width:100%;margin-top:16px;padding:11px;background:#19191e;color:#eee;border:1px solid #44444d;border-radius:9px;font:inherit;outline:none}.pd-input:focus{border-color:#e7a9cf} .pd-box footer{display:flex;justify-content:flex-end;gap:9px;margin-top:22px}.pd-box footer button{flex:0 0 auto;min-width:82px;background:#393940;color:#eee;border:1px solid #50505a;border-radius:8px;padding:9px 13px;font:inherit;cursor:pointer}.pd-box footer .pd-ok{background:#e7a9cf;color:#242428;border-color:transparent;font-weight:700}.pd-box footer .pd-ok.danger{background:#cf778d;color:#241318}.pd-box footer button:hover{filter:brightness(1.12)}';document.head.append(style)
  }
  return new Promise(resolve=>{const input=host.querySelector('.pd-input'),ok=host.querySelector('.pd-ok'),cancel=host.querySelector('.pd-cancel');host.querySelector('#pdTitle').textContent=title;host.querySelector('.pd-message').textContent=message;input.hidden=kind!=='prompt';input.value=value;cancel.hidden=kind==='alert';ok.textContent=kind==='prompt'?'저장':'확인';ok.classList.toggle('danger',danger);host.classList.add('open');const finish=result=>{host.classList.remove('open');ok.onclick=cancel.onclick=null;host.onkeydown=null;host.onclick=null;resolve(result)};ok.onclick=()=>finish(kind==='prompt'?input.value:true);cancel.onclick=()=>finish(kind==='prompt'?null:false);host.onclick=e=>{if(e.target===host)finish(kind==='prompt'?null:false)};host.onkeydown=e=>{if(e.key==='Escape')finish(kind==='prompt'?null:false);if(e.key==='Enter'){e.preventDefault();ok.click()}};setTimeout(()=>kind==='prompt'?input.focus():ok.focus(),0)})
 },
 alert(message,title='알림'){return this.show({message,title})},
 confirm(message,title='확인',danger=false){return this.show({message,title,kind:'confirm',danger})}
};
/* Shared crop/export for the two profile helpers. */
window.ProfileUpload = {
 async fromURL(value) {
  let url;
  try { url = new URL(value, location.href); }
  catch { throw Error('올바른 이미지 URL을 입력하세요.'); }
  if (url.username || url.password || !['https:', 'http:'].includes(url.protocol)) {
   throw Error('HTTPS 이미지 주소를 입력하세요.');
  }

  const legacyHttpImage = url.protocol === 'http:' && url.hostname === 'init.n-e.kr' && url.port === '8081' && url.pathname.startsWith('/Images/');
  if (url.protocol === 'http:' && !legacyHttpImage) throw Error('보안 연결(HTTPS) 이미지 주소를 입력하세요.');

  const source = legacyHttpImage ? new URL('/image-proxy', location.origin) : url;
  if (legacyHttpImage) source.searchParams.set('url', url.href);

  try {
   const response = await fetch(source.href, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
   if (!response.ok) throw Error(`이미지를 불러오지 못했습니다. (${response.status})`);
   const type = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
   if (!type.startsWith('image/')) throw Error('주소가 이미지 파일을 가리키지 않습니다.');
   const blob = await response.blob();
   if (blob.size > 20 * 1024 * 1024) throw Error('20MB 이하 이미지를 사용하세요.');
   const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
   });
   const image = new Image(); image.src = data; await image.decode();
   return data;
  } catch (error) {
   if (legacyHttpImage || error.message?.includes('20MB') || error.message?.includes('이미지 파일')) throw error;
   // CORS가 없는 HTTPS 이미지는 직접 표시할 수 있지만 HTML에 내장하거나 크롭할 수는 없습니다.
   const image = new Image(); image.referrerPolicy = 'no-referrer'; image.src = url.href;
   try { await image.decode(); }
   catch { throw Error('이미지를 열 수 없습니다. 직접 이미지 URL인지, 외부 사이트가 이미지 표시를 허용하는지 확인하세요.'); }
   return url.href;
  }
 },
 async crop(source, im) {
  const img = new Image();
  if (/^https:\/\//i.test(source)) img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer'; img.src = source; await img.decode();
  const w = Math.max(1, im.width - 2 * im.border), h = Math.max(1, im.height - 2 * im.border);
  const canvas = document.createElement('canvas');
  const ratio = Math.min(2, 1200 / Math.max(w, h));
  canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
  const ctx = canvas.getContext('2d'); ctx.scale(canvas.width / w, canvas.height / h);
  const cover = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * cover * im.zoom, dh = img.naturalHeight * cover * im.zoom;
  ctx.drawImage(img, (w - dw) * im.x / 100, (h - dh) * im.y / 100, dw, dh);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .82));
  if (!blob || blob.type !== 'image/webp') throw Error('WebP 변환을 지원하는 브라우저가 필요합니다.');
  return blob;
 },
 async save(source, im) {
  let blob;
  try { blob = await this.crop(source, im); }
  catch (error) {
   if (/^https:\/\//i.test(source)) return {url: source, embedded: false};
   throw error;
  }
  const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  return {url};
 }
};
