// Isolated SQL database only. Start the app per README before running this test.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const base=process.argv[2]||'http://localhost:5199';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const suffix=Date.now().toString(36);
class Client{
 cookies=new Map();csrf='';
 async request(path,options={}){
  const headers={...(options.headers||{}),Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ')};
  const r=await fetch(base+path,{...options,headers,redirect:'manual'});
  for(const value of r.headers.getSetCookie()){const pair=value.split(';')[0],i=pair.indexOf('=');this.cookies.set(pair.slice(0,i),pair.slice(i+1));}
  return r;
 }
 async api(path,body,expected=200){
  const form=body instanceof FormData;
  const r=await this.request('/api/'+path,{method:body===undefined?'GET':'POST',headers:{'X-CSRF-TOKEN':this.csrf,...(body!==undefined&&!form?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:form?body:JSON.stringify(body)});
  const text=await r.text();assert.equal(r.status,expected,`${path}: ${text}`);return text?JSON.parse(text):{};
 }
 async register(label){
  this.username=`qa_${label}_${suffix}`;this.password=`Test-${randomUUID()}-aA9`;
  const html=await(await this.request('/Account/Register')).text();
  const token=html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/)[1];
  const r=await this.request('/Account/Register',{method:'POST',body:new URLSearchParams({Username:this.username,Password:this.password,DisplayName:`QA ${label}`,__RequestVerificationToken:token})});
  assert.equal(r.status,302,await r.text());const d=await this.api('bootstrap');this.csrf=d.csrf;this.id=d.me.id;await this.api('session',{});return this;
 }
 async send(id,text,file,requestId=randomUUID(),expected=200){const f=new FormData();f.append('text',text);f.append('requestId',requestId);if(file)f.append('file',new Blob([file.bytes]),file.name);return this.api(`conversations/${id}/messages`,f,expected);}
}
async function mediaJoin(url,token){
 return new Promise(resolve=>{let settled=false;const socket=new WebSocket(url.replace(/^http/,'ws')+'/rtc?access_token='+encodeURIComponent(token)+'&auto_subscribe=1&protocol=15&sdk=js&version=2.22.3');const timer=setTimeout(()=>done(false),5000);function done(ok){if(settled)return;settled=true;clearTimeout(timer);socket.close();resolve(ok);}socket.onmessage=()=>done(true);socket.onerror=()=>done(false);socket.onclose=()=>done(false);});
}
const timeout=setTimeout(()=>{console.error('Timed out');process.exit(1)},90000);
const report=[];
function pass(t){report.push(t);console.log('PASS:',t);}
const meetings=[];
let a,b,c;
try{
 const guest=new Client();assert.equal((await guest.request('/api/bootstrap')).status,401);assert.equal((await guest.request('/chathub/negotiate?negotiateVersion=1',{method:'POST'})).status,401);pass('Anonymous API and hub access denied');
 a=await new Client().register('Alice');b=await new Client().register('Bob');c=await new Client().register('Carol');
 assert.equal((await a.request('/api/conversations/groups',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);pass('Registration, authenticated sessions and CSRF enforcement');
 const group=await a.api('conversations/groups',{name:'QA private group',userIds:[b.id]});
 await c.api(`conversations/${group.id}/messages`,undefined,404);
 await b.api(`conversations/${group.id}/members`,{userId:c.id,add:true},403);pass('Private group visibility and owner-only administration');
 const requestId=randomUUID();const sent=await a.send(group.id,'<b>literal text</b>',null,requestId);const duplicate=await a.send(group.id,'<b>literal text</b>',null,requestId);assert.equal(sent.id,duplicate.id);
 let history=await b.api(`conversations/${group.id}/messages`);assert.equal(history.length,1);assert.equal(history[0].senderId,a.id);assert.equal(history[0].text,'<b>literal text</b>');
 let bootstrap=await b.api('bootstrap');assert.equal(bootstrap.conversations.find(x=>x.id===group.id).unread,1);
 await b.api(`conversations/${group.id}/read`,{messageId:sent.id});bootstrap=await b.api('bootstrap');assert.equal(bootstrap.conversations.find(x=>x.id===group.id).unread,0);pass('Persisted history, sender identity, deduplicated retries and unread positions');
 await pause(550);const attachment=await a.send(group.id,'Document',{name:'notes.txt',bytes:'hello from persisted storage'});
 const download=await b.request('/api/files/'+attachment.id);assert.equal(download.status,200);assert.equal(await download.text(),'hello from persisted storage');assert.match(download.headers.get('content-disposition'),/attachment/);
 assert.equal((await c.request('/api/files/'+attachment.id)).status,404);
 await pause(550);await a.send(group.id,'',{name:'unsafe.html',bytes:'<script>alert(1)</script>'},randomUUID(),400);
 await a.send(group.id,'',{name:'oversize.txt',bytes:new Uint8Array(2097153)},randomUUID(),400);pass('Authenticated file downloads, persistence and file restrictions');
 await a.api(`conversations/${group.id}/members`,{userId:c.id,add:true});await c.api(`conversations/${group.id}/messages`);
 await a.api(`conversations/${group.id}/members`,{userId:c.id,add:false});await c.api(`conversations/${group.id}/messages`,undefined,404);assert.equal((await c.request('/api/files/'+attachment.id)).status,404);pass('Adding members and immediate history/file access revocation');
 const direct=await a.api('conversations/direct',{userId:b.id});const reverse=await b.api('conversations/direct',{userId:a.id});assert.equal(direct.id,reverse.id);await c.api(`conversations/${direct.id}/messages`,undefined,404);pass('Stable direct conversations across users');
 const m=await a.api('meetings',{conversationId:group.id,title:'QA live meeting',video:true});meetings.push(m.id);
 await c.api('meetings/'+m.id,undefined,404);await b.api(`meetings/${m.id}/token`,{},403);
 await b.api(`meetings/${m.id}/request`,{});await b.api(`meetings/${m.id}/decide`,{userId:b.id,decision:'approve'},403);
 await a.api(`meetings/${m.id}/decide`,{userId:b.id,decision:'approve'});
 const access=await b.api(`meetings/${m.id}/token`,{});const claims=JSON.parse(Buffer.from(access.token.split('.')[1],'base64url'));
 assert.equal(claims.sub,b.id);assert.equal(claims.video.roomJoin,true);assert.equal(claims.video.roomAdmin,undefined);assert.ok(claims.exp-claims.nbf<=65);
 assert.equal(await mediaJoin(access.url,access.token),true);pass('Host-approved admission and real LiveKit media signaling connection');
 await a.api(`conversations/${group.id}/members`,{userId:c.id,add:true});
 await a.api(`meetings/${m.id}/lock`,{locked:true});await c.api(`meetings/${m.id}/request`,{},403);await b.api(`meetings/${m.id}/end`,{},403);
 await a.api(`meetings/${m.id}/lock`,{locked:false});await c.api(`meetings/${m.id}/request`,{});await a.api(`meetings/${m.id}/decide`,{userId:c.id,decision:'decline'});await c.api(`meetings/${m.id}/token`,{},403);pass('Lock, decline and host-only meeting controls');
 await a.api(`meetings/${m.id}/decide`,{userId:b.id,decision:'remove'});await b.api(`meetings/${m.id}/token`,{},403);
 assert.equal(await mediaJoin(access.url,access.token),false);const hostAccess=await a.api(`meetings/${m.id}/token`,{});assert.notEqual(hostAccess.roomName,access.roomName);assert.equal(await mediaJoin(hostAccess.url,hostAccess.token),true);pass('Participant removal rotates room and blocks previously issued token');
 await a.api(`meetings/${m.id}/end`,{});await a.api(`meetings/${m.id}/token`,{},409);assert.equal(await mediaJoin(hostAccess.url,hostAccess.token),false);pass('End for everyone deletes room and blocks stale tokens');
 const login=new Client();const html=await(await login.request('/Account/Login')).text();const token=html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/)[1];
 const r=await login.request('/Account/Login',{method:'POST',body:new URLSearchParams({Username:b.username,Password:b.password,__RequestVerificationToken:token})});assert.equal(r.status,302);
 const d=await login.api('bootstrap');login.csrf=d.csrf;history=await login.api(`conversations/${group.id}/messages`);assert.equal(history.length,2);pass('Password sign-in restores saved history in a fresh browser session');
 writeFileSync('.local/test-results.json',JSON.stringify({when:new Date().toISOString(),base,checks:report},null,2));
 writeFileSync('.local/test-users.json',JSON.stringify([a,b,c].map(x=>({username:x.username,password:x.password})),null,2));
 console.log(`${report.length} integration checks passed. Test accounts remain only in the isolated test database.`);
} finally {clearTimeout(timeout);if(a)for(const id of meetings)try{await a.api(`meetings/${id}/end`,{});}catch{}}
