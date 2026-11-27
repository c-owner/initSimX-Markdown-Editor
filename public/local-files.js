/* All document operations stay in the browser. No HTTP API. */
class LocalFiles {
 constructor(){this.root=null;this.remembered=null;this.permissionReady=false;this.queue=Promise.resolve();}
 openHandleDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open('initsimx-local-folders',1);request.onupgradeneeded=()=>request.result.createObjectStore('handles');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
 async storeHandle(handle){const db=await this.openHandleDB();await new Promise((resolve,reject)=>{const tx=db.transaction('handles','readwrite');tx.objectStore('handles').put(handle,'active');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}
 async restore(){const db=await this.openHandleDB();const handle=await new Promise((resolve,reject)=>{const request=db.transaction('handles').objectStore('handles').get('active');request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});db.close();this.remembered=handle;if(!handle)return false;if(await handle.queryPermission({mode:'readwrite'})==='granted'){this.root=handle;return true;}return false;}
 async requestRememberedPermission(){if(this.remembered&&await this.remembered.requestPermission({mode:'readwrite'})==='granted')this.permissionReady=true;}
 async connect(){if(this.remembered&&this.permissionReady){this.root=this.remembered;this.permissionReady=false;return this.root.name;}this.root=await window.showDirectoryPicker({mode:'readwrite'});this.remembered=this.root;await this.storeHandle(this.root);return this.root.name;}
 async disconnect(){this.root=null;this.remembered=null;this.permissionReady=false;const db=await this.openHandleDB();await new Promise((resolve,reject)=>{const tx=db.transaction('handles','readwrite');tx.objectStore('handles').delete('active');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}
 async parent(path){
  if(!this.root)throw Error('먼저 로컬 폴더를 연결하세요.');
  const parts=path.split('/');
  if(parts.some(p=>!p||p==='.'||p==='..'||/[\\\x00]/.test(p)))throw Error('잘못된 파일 경로입니다.');
  let dir=this.root;for(const p of parts.slice(0,-1))dir=await dir.getDirectoryHandle(p);
  return [dir,parts.at(-1)];
 }
 async file(path){const [dir,name]=await this.parent(path);return dir.getFileHandle(name);}
 async read(path){const file=await(await this.file(path)).getFile();const content=await file.text();return {content,hash:await this.hash(content)};}
 async hash(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');}
 async tree(){const files=[];if(!this.root)return {files};const walk=async(dir,prefix='')=>{for await(const [name,h]of dir.entries()){if(name.startsWith('.'))continue;const path=prefix+name;if(h.kind==='directory')await walk(h,path+'/');else if(/\.md$/i.test(name)){const file=await h.getFile();files.push({path,lastModified:file.lastModified});}}};await walk(this.root);return {files};}
 name(value){const name=value.trim();if(!name||/[\\/:\x00-\x1f]/.test(name)||name==='.'||name==='..')throw Error('파일 이름을 확인하세요.');return /\.md$/i.test(name)?name:name+'.md';}
 async absent(dir,name){try{await dir.getFileHandle(name);}catch(e){if(e.name==='NotFoundError')return;throw e;}throw Object.assign(Error('같은 이름의 파일이 이미 있습니다.'),{status:409});}
 async checked(path,hash){const data=await this.read(path);if(data.hash!==hash)throw Object.assign(Error('원본 파일이 다른 곳에서 변경되었습니다.'),{status:409});return data;}
 async write(handle,text){const stream=await handle.createWritable();try{await stream.write(text);await stream.close();}catch(e){await stream.abort().catch(()=>{});throw e;}}
 async backup(path,content){const dir=await this.root.getDirectoryHandle('.initsimx-backups',{create:true});const filename=Date.now()+'-'+crypto.randomUUID()+'-'+path.split('/').at(-1);await this.write(await dir.getFileHandle(filename,{create:true}),content);}
 async request(url,opts={}){
  const u=new URL(url,'https://local.invalid'),op=u.pathname,data=JSON.parse(opts.body||'{}');
  if(op==='/api/session')return {csrf:''};
  if(op==='/api/tree')return this.tree();
  if(op==='/api/search'){const q=u.searchParams.get('q').toLocaleLowerCase();const results=[];for(const {path}of(await this.tree()).files){const {content}=await this.read(path);content.split('\n').forEach((text,i)=>{if(text.toLocaleLowerCase().includes(q))results.push({path,line:i+1,text});});if(path.toLocaleLowerCase().includes(q))results.push({path,line:0,text:'파일 이름 일치'});}return {results};}
  if(op==='/api/file'&&!opts.method)return this.read(u.searchParams.get('path'));
  const run=async()=>{
   if(op==='/api/file/create'){const name=this.name(data.name),path=data.parent?data.parent+'/'+name:name;const [dir]=await this.parent(path);await this.absent(dir,name);await this.write(await dir.getFileHandle(name,{create:true}),'');return {path,hash:await this.hash('')};}
   const old=await this.checked(data.path,data.hash);
   await this.backup(data.path,old.content);
   // Recheck after backup; the OS offers no atomic compare-and-swap operation.
   await this.checked(data.path,data.hash);
   if(op==='/api/file'){await this.write(await this.file(data.path),data.content);return {hash:await this.hash(data.content)};}
   const [dir,name]=await this.parent(data.path);
   if(op==='/api/file/delete'){await dir.removeEntry(name);return {};}
   if(op==='/api/file/rename'){const next=this.name(data.name);await this.absent(dir,next);await this.write(await dir.getFileHandle(next,{create:true}),old.content);await dir.removeEntry(name);return {path:[...data.path.split('/').slice(0,-1),next].join('/'),hash:data.hash};}
   throw Error('지원하지 않는 작업입니다.');
  };
  const result=this.queue.then(run);this.queue=result.catch(()=>{});return result;
 }
}
globalThis.LocalFiles=LocalFiles;
