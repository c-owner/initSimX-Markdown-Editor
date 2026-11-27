import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../public/local-files.js';
function directory(){const entries=new Map();return {kind:'directory',async getDirectoryHandle(name,{create}={}){if(!entries.has(name)&&create)entries.set(name,directory());if(!entries.has(name))throw Object.assign(Error(),{name:'NotFoundError'});return entries.get(name);},async getFileHandle(name,{create}={}){if(!entries.has(name)&&create){let text='';entries.set(name,{kind:'file',async getFile(){return {text:async()=>text};},async createWritable(){let next;return {write:async s=>{next=s;},close:async()=>{text=next;},abort:async()=>{}};}});}if(!entries.has(name))throw Object.assign(Error(),{name:'NotFoundError'});return entries.get(name);},async removeEntry(name){entries.delete(name);},async *entries(){yield*entries;}};}
test('create, conflict protection, backup, rename and delete',async()=>{
 const fs=new LocalFiles();fs.root=directory();
 const call=(path,data)=>fs.request('/api/'+path,{method:'POST',body:JSON.stringify(data)});
 let d=await call('file/create',{name:'한글 메모'});assert.equal(d.path,'한글 메모.md');
 await assert.rejects(call('file/create',{name:'한글 메모'}),e=>e.status===409);
 d=await call('file',{path:d.path,content:'원본',hash:d.hash});
 const handle=await fs.file('한글 메모.md');await fs.write(handle,'외부 변경');
 await assert.rejects(call('file',{path:'한글 메모.md',content:'덮어쓰기',hash:d.hash}),e=>e.status===409);
 assert.equal((await fs.read('한글 메모.md')).content,'외부 변경');
 const original=await fs.read('한글 메모.md');
 d=await call('file/rename',{path:'한글 메모.md',name:'새 이름',hash:original.hash});
 assert.equal((await fs.tree()).files[0].path,'새 이름.md');
 await call('file/delete',{path:d.path,hash:d.hash});assert.deepEqual((await fs.tree()).files,[]);
 const backup=await fs.root.getDirectoryHandle('.initsimx-backups');let count=0;for await(const entry of backup.entries())count++;assert.equal(count,3);
});
test('reject path traversal and invalid names',async()=>{const fs=new LocalFiles();fs.root=directory();for(const path of ['../a.md','a/../../b.md','/a.md','a\\b.md'])await assert.rejects(fs.parent(path));assert.throws(()=>fs.name('../x'));});
