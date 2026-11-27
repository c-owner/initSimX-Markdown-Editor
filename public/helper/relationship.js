import {initial, validate, cardHTML} from './relationship-card.js';
const $=id=>document.getElementById(id);
let state=initial(), revision=0;
$('controls').addEventListener('submit',event=>event.preventDefault());
const tickets=[0,0];
const notify=message=>{ $('status').textContent=message; };
$('people').innerHTML=[0,1].map(i=>`<section class="panel"><h2>0${i+2} · ${i===0?'첫 번째':'두 번째'} 인물</h2><label for="name-${i}">이름</label><input id="name-${i}" maxlength="80"><label for="role-${i}">이 인물을 설명하는 말</label><input id="role-${i}" maxlength="120"><label for="photo-${i}">사진 선택</label><input type="file" id="photo-${i}" accept="image/png,image/jpeg,image/webp"><div class="photo-actions"><button type="button" id="remove-${i}">사진 지우기</button></div><label for="zoom-${i}">이미지 확대 <output id="zoomValue-${i}">1.00배</output></label><input id="zoom-${i}" type="range" min="1" max="5" step="0.05" value="1"><label for="x-${i}">가로 위치 <output id="xValue-${i}">50%</output></label><input id="x-${i}" type="range" min="0" max="100" value="50"><label for="position-${i}">세로 위치 <output id="positionValue-${i}">50%</output></label><input id="position-${i}" type="range" min="0" max="100" value="50"><p class="person-help">PNG · JPG · WebP, 최대 20MB. 이름에는 @가 자동으로 붙습니다.</p><label for="feeling-${i}">상대를 바라보는 마음</label><textarea id="feeling-${i}" rows="3" maxlength="2000"></textarea></section>`).join('');
const keys=['relation','summary','theme','date','change','memory','unfinished'];
function update(){
 revision++;
 const html=cardHTML(state);
 $('code').value=html;
 $('preview').srcdoc=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';"><style>html{background:#19151f}body{margin:0;padding:1px 12px;background:#19151f}table,td{border:0}@media(max-width:400px){body{padding:1px 0}}</style></head><body>${html}</body></html>`;
}
function fitPreview(){
 const doc=$('preview').contentDocument;
 if(doc?.body) $('preview').style.height=Math.max(400,doc.body.scrollHeight+8)+'px';
}
$('preview').addEventListener('load',fitPreview);
let previewWidth=0;
new ResizeObserver(entries=>{
 const width=entries[0].contentRect.width;
 if(width!==previewWidth){previewWidth=width;requestAnimationFrame(fitPreview);}
}).observe($('preview'));
function render(){
 keys.forEach(k=>$(k).value=state[k]);
 state.people.forEach((p,i)=>{['name','role','feeling'].forEach(k=>$(k+'-'+i).value=p[k]);$('position-'+i).value=p.position;$('x-'+i).value=p.x??50;$('zoom-'+i).value=p.zoom??1;$('positionValue-'+i).value=p.position+'%';$('xValue-'+i).value=(p.x??50)+'%';$('zoomValue-'+i).value=((p.zoom??1).toFixed(2))+'배';});
 update();
}
keys.forEach(k=>$(k).addEventListener('input',()=>{state[k]=$(k).value;update();}));
document.querySelectorAll('[data-relation]').forEach(button=>button.addEventListener('click',()=>{state.relation=button.dataset.relation;render();}));
state.people.forEach((_,i)=>{
 ['name','role','feeling','position','x','zoom'].forEach(k=>$(k+'-'+i).addEventListener('input',()=>{state.people[i][k]=['position','x','zoom'].includes(k)?Number($(k+'-'+i).value):$(k+'-'+i).value;if(k==='position')$('positionValue-'+i).value=state.people[i].position+'%';if(k==='x')$('xValue-'+i).value=state.people[i].x+'%';if(k==='zoom')$('zoomValue-'+i).value=state.people[i].zoom.toFixed(2)+'배';update();}));
 $('remove-'+i).addEventListener('click',()=>{tickets[i]++;state.people[i].photo='';$('photo-'+i).value='';update();});
 $('photo-'+i).addEventListener('change',async()=>{
  const file=$('photo-'+i).files[0],ticket=++tickets[i];
  if(!file)return;
  try{
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error('20MB 이하 PNG, JPG, WebP 사진을 선택하세요.');
   const source=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('사진을 읽지 못했습니다.'));r.readAsDataURL(file);});
   if(ticket!==tickets[i])return;
   state.people[i].photo=source;state.people[i].position=50;render();notify('사진을 불러왔습니다. HTML 복사 시 크롭하여 저장합니다.');
  }catch(error){if(ticket===tickets[i])notify(error.message);}
 });
});
function download(text,name,type){
 const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
$('copy').addEventListener('click',async()=>{
 try{const html=await prepareExport();$('code').value=html;await navigator.clipboard.writeText(html);notify('HTML을 복사했습니다. 문서 원문에 붙여 넣으세요.');}
 catch(error){$('code').closest('details').open=true;$('code').value=cardHTML(state);$('code').focus();$('code').select();notify(error.message||'사진 저장에 실패했습니다.');}
});
 $('download').addEventListener('click',async()=>{try{download(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>관계 카드</title></head><body style="margin:0;padding:12px;background:#131217;">${await prepareExport()}</body></html>`,'관계카드.html','text/html');}catch(error){notify('사진 저장 실패: '+error.message);}});
async function prepareExport(){
 const snapshot=JSON.stringify(state), results=[];
 for(const p of state.people){
  if(!p.photo)continue;
  const saved=await ProfileUpload.save(p.photo,{width:640,height:640,border:0,zoom:p.zoom??1,x:p.x??50,y:p.position});
  ProfileUpload.download(saved.blob,`${(p.name||'인물').replace(/[\\/:*?"<>|]/g,'_')}_프로필.webp`);
  results.push([p,saved.url,saved.blob]);
 }
 if(snapshot!==JSON.stringify(state))throw Error('편집 내용이 바뀌었습니다. 다시 복사하세요.');
 try{results.forEach(([p,url,blob])=>{p.exported=url;p.exportBlob=blob;});return cardHTML(state);}
 finally{results.forEach(([p])=>{delete p.exported;delete p.exportBlob;});}
}
$('save').addEventListener('click',()=>{download(JSON.stringify(state,null,2),'관계카드_작업.json','application/json');notify('작업 파일을 저장했습니다.');});
$('load').addEventListener('click',()=>$('project-file').click());
$('project-file').addEventListener('change',async()=>{
 const file=$('project-file').files[0];if(!file)return;
 const before=revision;
 try{
  if(file.size>12*1024*1024)throw Error('12MB 이하 작업 파일을 선택하세요.');
  const next=validate(JSON.parse(await file.text()));
  if(before!==revision)throw Error('편집 내용이 바뀌었습니다. 다시 불러오세요.');
  if(!window.confirm('현재 편집 내용을 불러온 관계 카드로 바꿀까요?'))return;
  tickets[0]++;tickets[1]++;state=next;render();notify('작업을 불러왔습니다.');
 }catch(error){notify('불러오기 실패: '+error.message);}
 finally{$('project-file').value='';}
});
$('reset').addEventListener('click',()=>{
 if(!window.confirm('편집 내용을 처음의 예시로 바꿀까요?'))return;
 tickets[0]++;tickets[1]++;state=initial();render();notify('예시로 초기화했습니다.');
});
render();
