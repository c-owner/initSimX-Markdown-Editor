import {initial, validate, cardHTML} from './relationship-card.js';
const $=id=>document.getElementById(id);
let state=initial(), revision=0;
$('controls').addEventListener('submit',event=>event.preventDefault());
const tickets=[0,0];
const notify=message=>{ $('status').textContent=message; };
$('people').innerHTML=[0,1].map(i=>`<section class="panel"><h2>0${i+2} · ${i===0?'첫 번째':'두 번째'} 인물</h2><label for="name-${i}">이름</label><input id="name-${i}" maxlength="80"><label for="role-${i}">이 인물을 설명하는 말</label><input id="role-${i}" maxlength="120"><label for="photo-${i}">사진 선택</label><input type="file" id="photo-${i}" accept="image/png,image/jpeg,image/webp"><div class="photo-actions"><button type="button" id="remove-${i}">사진 지우기</button></div><label for="position-${i}">사진 세로 위치</label><input id="position-${i}" type="range" min="0" max="100"><p class="person-help">PNG · JPG · WebP, 최대 20MB. 이름에는 @가 자동으로 붙습니다.</p><label for="feeling-${i}">상대를 바라보는 마음</label><textarea id="feeling-${i}" rows="3" maxlength="2000"></textarea></section>`).join('');
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
 state.people.forEach((p,i)=>['name','role','feeling','position'].forEach(k=>$(k+'-'+i).value=p[k]));
 update();
}
keys.forEach(k=>$(k).addEventListener('input',()=>{state[k]=$(k).value;update();}));
document.querySelectorAll('[data-relation]').forEach(button=>button.addEventListener('click',()=>{state.relation=button.dataset.relation;render();}));
state.people.forEach((_,i)=>{
 ['name','role','feeling','position'].forEach(k=>$(k+'-'+i).addEventListener('input',()=>{state.people[i][k]=k==='position'?Number($(k+'-'+i).value):$(k+'-'+i).value;update();}));
 $('remove-'+i).addEventListener('click',()=>{tickets[i]++;state.people[i].photo='';$('photo-'+i).value='';update();});
 $('photo-'+i).addEventListener('change',async()=>{
  const file=$('photo-'+i).files[0],ticket=++tickets[i];
  if(!file)return;
  try{
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error('20MB 이하 PNG, JPG, WebP 사진을 선택하세요.');
   const source=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('사진을 읽지 못했습니다.'));r.readAsDataURL(file);});
   const saved=await ProfileUpload.save(source,{width:640,height:640,border:0,zoom:1,x:50,y:50});
   if(ticket!==tickets[i])return;
   state.people[i].photo=saved.url;state.people[i].position=50;render();notify('사진을 불러왔습니다.');
  }catch(error){if(ticket===tickets[i])notify(error.message);}
 });
});
function download(text,name,type){
 const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
$('copy').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText($('code').value);notify('HTML을 복사했습니다. 문서 원문에 붙여 넣으세요.');}
 catch{$('code').closest('details').open=true;$('code').focus();$('code').select();notify('아래 선택된 HTML을 Ctrl+C로 복사하세요.');}
});
$('download').addEventListener('click',()=>download(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>관계 카드</title></head><body style="margin:0;padding:12px;background:#131217;">${cardHTML(state)}</body></html>`,'관계카드.html','text/html'));
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
