(() => {
'use strict';
const $ = id => document.getElementById(id), app = $('app');
if (!app) return;
let csrf = app.dataset.csrf, data, selected = null, messages = [], canLoadOlder = false, pendingFile = null, sending = false;
let refreshTimer, refreshing = false, refreshAgain = false, messageBusy = false, connection;
const drafts = new Map();
let meetingId = null, meeting = null, room = null, joining = false, wantJoined = false, updatingMeeting = false;
const run = fn => async (...args) => { try { await fn(...args); } catch (e) { notice(e.message); } };
function node(tag, text, className) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; }
function button(text, fn, className) { const b = node('button', text, className); b.type = 'button'; b.onclick = run(fn); return b; }
function notice(text) { $('notice').textContent = text; $('notice').hidden = false; }
async function api(path, body, form = false) {
    const headers = { 'X-CSRF-TOKEN': csrf };
    if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/' + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : form ? body : JSON.stringify(body), credentials: 'same-origin' });
    if (response.status === 401) { location.href = '/Account/Login?returnUrl=' + encodeURIComponent(location.pathname); throw new Error('Your session expired. Please sign in again.'); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { const e = new Error(result.error || (response.status === 429 ? 'Too many requests. Please wait a moment.' : result.title || 'Request failed. Please retry.')); e.status = response.status; throw e; }
    if (result.cleanupPending) notice('Access changes are saved. The meeting server is temporarily unavailable; media disconnection is being retried.');
    return result;
}
const current = () => data?.conversations.find(c => c.id === selected);
const nameOf = c => c.kind === 'direct' ? (c.members.find(m => m.userId !== data.me.id)?.name || 'Direct chat') : c.name;
const initials = name => name.trim().split(/\s+/).map(s => Array.from(s)[0]).slice(0,2).join('').toUpperCase();
try { document.body.classList.toggle('dark', localStorage.getItem('together-theme') === 'dark'); } catch {}
$('themeButton').onclick = () => { document.body.classList.toggle('dark'); try { localStorage.setItem('together-theme',document.body.classList.contains('dark') ? 'dark' : 'light'); } catch {} };
function controls() {
    const c = current(), disabled = !c || sending;
    $('messageInput').disabled = $('sendButton').disabled = $('attachButton').disabled = disabled;
    $('voiceButton').disabled = $('videoButton').disabled = !c || !!meetingId;
    $('membersButton').disabled = !c || c.kind !== 'group';
}
function renderList() {
    if (!data) return;
    const list = $('conversationList'); list.replaceChildren();
    const query = $('searchUsers').value.trim().toLowerCase();
    for (const c of data.conversations) {
        const name = nameOf(c); if (!name.toLowerCase().includes(query)) continue;
        const b = button('', () => choose(c.id), 'conversation' + (selected === c.id ? ' active' : ''));
        b.setAttribute('aria-current', String(selected === c.id));
        b.append(node('span',c.kind === 'direct' ? initials(name) : '#','avatar'));
        const details = node('span',undefined,'details'); details.append(node('strong',name),node('small',c.kind === 'direct' ? 'Private conversation' : `${c.members.length} members`)); b.append(details);
        if (c.unread) b.append(node('span', String(c.unread), 'badge')); list.append(b);
    }
    list.append(node('div','PEOPLE · START A DIRECT CHAT','people-label'));
    for (const user of data.users.filter(u => u.id !== data.me.id && (u.name + ' ' + u.username).toLowerCase().includes(query))) {
        const b = button('', async () => { const c = await api('conversations/direct',{userId:user.id}); await refresh(); await choose(c.id); }, 'conversation');
        b.append(node('span',initials(user.name),'avatar')); const details=node('span',undefined,'details');
        details.append(node('strong',user.name),node('small',`@${user.username} · ${data.online.includes(user.id) ? 'Online' : 'Offline'}`)); b.append(details); list.append(b);
    }
    const unread=data.conversations.reduce((n,c)=>n+c.unread,0);
    $('peopleButton').textContent=unread ? `☰ ${unread}` : '☰';
    $('onlineCount').textContent=`${data.online.length} online`;
}
function renderHeader() {
    const c=current(); if (!c) return;
    $('chatTitle').textContent=nameOf(c); $('chatAvatar').textContent=c.kind==='direct' ? initials(nameOf(c)) : '#';
    $('chatSubtitle').textContent=c.kind==='direct' ? 'Private · saved to your account' : `${c.members.length} members · ${c.kind==='public' ? 'Shared room' : 'Private group'}`;
    $('roomBanner').textContent=c.kind==='public' ? 'Everyone is visible to all registered users.' : 'Only current conversation members can access messages, files and meetings.';
}
function attachmentUi() { $('attachmentPreview').hidden=!pendingFile; $('attachmentName').textContent=pendingFile ? `${pendingFile.name} · ${Math.ceil(pendingFile.size/1024)} KB` : ''; }
async function choose(id) {
    if (selected) drafts.set(selected,{text:$('messageInput').value,file:pendingFile});
    selected=id; messages=[]; $('messages').replaceChildren();
    $('messageInput').value=drafts.get(id)?.text || ''; pendingFile=drafts.get(id)?.file || null; attachmentUi();
    app.classList.remove('people-open'); $('peopleButton').setAttribute('aria-expanded','false');
    renderList();renderHeader();controls(); await loadMessages(true); await listMeetings();
}
function renderMessages(scroll=false) {
    const box=$('messages'), previous=box.scrollTop, oldHeight=box.scrollHeight; box.replaceChildren();
    if (!messages.length) { const empty=node('div',undefined,'empty'); empty.append(node('div','✳','empty-icon'),node('h2','Start the conversation.'),node('p','Send a message, share a file or invite your team to a meeting.'));box.append(empty); }
    for (const m of messages) {
        const item=node('article',undefined,'message'+(m.senderId===data.me.id?' mine':''));
        const meta=node('div',undefined,'message-meta'); const time=node('time',new Date(m.sentAt.endsWith('Z')?m.sentAt:m.sentAt+'Z').toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}));
        meta.append(node('span',m.senderId===data.me.id?'You':m.senderName),time);
        const bubble=node('div',m.text,'bubble');
        if(m.file){const a=node('a',`↓ ${m.file.name} · ${Math.ceil(m.file.size/1024)} KB`,'file-link');a.href=m.file.url;a.download=m.file.name;bubble.append(a);}
        item.append(meta,bubble);box.append(item);
    }
    $('olderButton').hidden=!canLoadOlder;
    box.scrollTop=scroll?box.scrollHeight:previous+Math.max(0,box.scrollHeight-oldHeight);
}
async function loadMessages(reset=false,older=false) {
    if (!selected) return;
    const id=selected, cursor=older?messages[0]?.id:messages.at(-1)?.id;
    let path=`conversations/${id}/messages`;
    if(!reset && cursor) path+=older?`?before=${cursor}`:`?after=${cursor}`;
    const incoming=await api(path); if(selected!==id)return;
    if(reset) {messages=incoming;canLoadOlder=incoming.length===50;} else if(older){ messages=[...incoming,...messages];canLoadOlder=incoming.length===50; } else {
        const existing=new Set(messages.map(m=>m.id)); messages.push(...incoming.filter(m=>!existing.has(m.id)));
    }
    renderMessages(reset || !older);
    if(!older && incoming.length===50 && !reset) await loadMessages();
    if(messages.length && document.visibilityState==='visible') {
        await api(`conversations/${id}/read`,{messageId:messages.at(-1).id});
        if(current()){current().unread=0;renderList();}
    }
}
async function refresh() {
    if(refreshing){refreshAgain=true;return;} refreshing=true;
    try {
        data=await api('bootstrap');csrf=data.csrf;
        $('myName').textContent=data.me.name; $('myAvatar').textContent=initials(data.me.name);
        for(const id of drafts.keys()) if(!data.conversations.some(c=>c.id===id)) drafts.delete(id);
        if(selected && !current()){ selected=null;messages=[];pendingFile=null;attachmentUi();$('messages').replaceChildren();$('messageInput').value='';notice('Conversation access changed.'); }
        renderList();renderHeader();controls();
        if(!selected && data.conversations.length) await choose(data.conversations.find(c=>c.kind==='public')?.id || data.conversations[0].id);
        else if(selected && !messageBusy){messageBusy=true;try {await loadMessages();await listMeetings();} finally{messageBusy=false;}}
        if(meetingId)await updateMeeting();
    } finally {refreshing=false;if(refreshAgain){refreshAgain=false;scheduleRefresh();}}
}
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh().catch(e=>notice(e.message)),180);}
$('searchUsers').oninput=renderList;
$('peopleButton').onclick=()=>{app.classList.toggle('people-open');$('peopleButton').setAttribute('aria-expanded',String(app.classList.contains('people-open')));};
$('olderButton').onclick=run(()=>loadMessages(false,true));
$('attachButton').onclick=()=>$('fileInput').click();
$('fileInput').onchange=()=>{const f=$('fileInput').files[0];if(!f)return;if(!f.size||f.size>2097152){notice('Choose a non-empty file up to 2 MB.');return;}pendingFile=f;attachmentUi();$('fileInput').value='';};
$('removeAttachment').onclick=()=>{pendingFile=null;attachmentUi();};
let retryMessage=null;
$('messageForm').onsubmit=run(async event=>{
    event.preventDefault();if(sending||!selected)return;
    const text=$('messageInput').value.trim(),file=pendingFile,id=selected;if(!text&&!file)return;
    if(!retryMessage || retryMessage.id!==id || retryMessage.text!==text || retryMessage.file!==file) retryMessage={id,text,file,requestId:crypto.randomUUID()};
    const payload=new FormData();payload.append('text',text);payload.append('requestId',retryMessage.requestId);if(file)payload.append('file',file);
    sending=true;controls();
    try{await api(`conversations/${id}/messages`,payload,true);retryMessage=null;drafts.delete(id);if(selected===id){$('messageInput').value='';pendingFile=null;attachmentUi();}await refresh();}
    finally{sending=false;controls();}
});
$('messageInput').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('messageForm').requestSubmit();}};
$('newGroup').onclick=()=>{
    if(!data)return;$('groupError').textContent='';$('groupName').value='';$('groupChoices').replaceChildren();
    for(const user of data.users.filter(u=>u.id!==data.me.id)){const row=node('div',undefined,'member-row'),label=node('label'),input=document.createElement('input');input.type='checkbox';input.value=user.id;label.append(input,node('span',`${user.name} (@${user.username})`));row.append(label);$('groupChoices').append(row);}
    $('groupDialog').showModal();
};
$('cancelGroup').onclick=()=>$('groupDialog').close();
$('groupForm').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const c=await api('conversations/groups',{name:$('groupName').value,userIds:[...$('groupChoices').querySelectorAll('input:checked')].map(x=>x.value)});$('groupDialog').close();await refresh();await choose(c.id);}catch(error){$('groupError').textContent=error.message;}finally{b.disabled=false;}};
function memberRows(){
    const c=current();if(!c)return;$('memberRows').replaceChildren();$('membersTitle').textContent=c.name+' members';
    for(const u of data.users){const member=c.members.some(m=>m.userId===u.id);if(c.ownerId!==data.me.id&&!member)continue;
        const row=node('div',undefined,'member-row');row.append(node('span',`${u.name} (@${u.username})${u.id===c.ownerId?' · Owner':''}`));
        if(c.ownerId===data.me.id&&u.id!==c.ownerId)row.append(button(member?'Remove':'Add',async()=>{try{await api(`conversations/${c.id}/members`,{userId:u.id,add:!member});await refresh();memberRows();}catch(e){$('memberError').textContent=e.message;}}));$('memberRows').append(row);
    }
}
$('membersButton').onclick=()=>{$('memberError').textContent='';memberRows();$('membersDialog').showModal();};$('closeMembers').onclick=()=>$('membersDialog').close();
async function listMeetings(){
    const id=selected;if(!id)return;const list=await api(`conversations/${id}/meetings`);if(selected!==id)return;
    $('activeMeetings').replaceChildren();for(const m of list)$('activeMeetings').append(button(`${m.video?'▣':'☎'} ${m.title}${m.locked?' · Locked':''}`,()=>openMeeting(m.id)));
}
async function createMeeting(video){
    if(!current())return;
    const result=await api('meetings',{conversationId:selected,title:nameOf(current())+(video?' video meeting':' voice meeting'),video});await openMeeting(result.id);await listMeetings();
}
$('voiceButton').onclick=run(()=>createMeeting(false));$('videoButton').onclick=run(()=>createMeeting(true));
async function openMeeting(id){
    if(meetingId&&meetingId!==id)await closeMeeting();
    meetingId=id;wantJoined=false;$('meetingError').textContent='';$('meetingDialog').showModal();controls();await updateMeeting();
}
async function updateMeeting(){
    if(!meetingId||updatingMeeting)return;updatingMeeting=true;const id=meetingId;
    try{
        const state=await api(`meetings/${id}`);if(meetingId!==id)return;meeting=state;
        $('meetingTitle').textContent=state.title;$('meetingLink').value=location.origin+'/meeting/'+id;
        const admitted=state.status==='approved',host=state.hostId===data.me.id;
        $('meetingStatus').textContent=state.ended?'This meeting has ended.':room?'Connected':admitted?'Approved. Join when you are ready.':state.status==='pending'?'Waiting for the host to approve…':state.status==='declined'?'Your request was declined.':state.status==='removed'?'You were removed from this meeting.':state.locked?'Meeting locked. New requests are disabled.':'Request access to this meeting.';
        $('requestJoin').hidden=state.ended||state.locked||state.status!=='none';
        $('joinMeeting').hidden=state.ended||!admitted||!!room;
        $('joinMeeting').disabled=joining;
        $('hostPanel').hidden=!host||state.ended;$('lockMeeting').textContent=state.locked?'Unlock meeting':'Lock meeting';
        $('requestRows').replaceChildren();
        if(host)for(const r of state.requests||[]){if(r.userId===data.me.id)continue;const row=node('div',undefined,'member-row');row.append(node('span',`${r.name} · ${r.status}`));
            const decide=decision=>async()=>{const result=await api(`meetings/${id}/decide`,{userId:r.userId,decision});if(result.cleanupPending)$('meetingError').textContent='Removal saved; server disconnection is pending. Keep this window open and retry if the server stays unavailable.';await updateMeeting();};
            if(r.status==='pending'){const approve=button('Accept',decide('approve'));approve.disabled=state.locked;row.append(approve,button('Decline',decide('decline')));}
            if(r.status==='approved')row.append(button('Remove',decide('remove')));$('requestRows').append(row);
        }
        if(state.ended||!admitted){wantJoined=false;await disconnectRoom();}
        else if(room&&room.name!==state.roomName){await disconnectRoom();$('meetingStatus').textContent='Membership updated. Reconnecting securely…';}
        if(wantJoined&&!room&&!joining&&!state.ended&&admitted)await connectMeeting();
    }catch(e){$('meetingError').textContent=e.message;if(e.status===404||e.status===403){wantJoined=false;await disconnectRoom();$('joinMeeting').hidden=$('requestJoin').hidden=$('hostPanel').hidden=true;}}
    finally{updatingMeeting=false;}
}
function mediaControls(){
    for(const id of ['muteButton','cameraButton','shareButton','leaveMeeting'])$(id).hidden=!room;
    $('joinMeeting').hidden=!!room||!meeting||meeting.ended||meeting.status!=='approved';
    if(room){$('muteButton').textContent=room.localParticipant.isMicrophoneEnabled?'Mute mic':'Unmute mic';$('cameraButton').textContent=room.localParticipant.isCameraEnabled?'Camera off':'Camera on';$('shareButton').textContent=room.localParticipant.isScreenShareEnabled?'Stop sharing':'Share screen';$('shareButton').disabled=!navigator.mediaDevices?.getDisplayMedia;}
}
let attached=[];
function renderMedia(){
    for(const [track,element]of attached)track.detach(element);attached=[];$('meetingStage').replaceChildren();$('participantList').replaceChildren();if(!room)return;
    const people=[room.localParticipant,...room.remoteParticipants.values()];
    for(const person of people){
        $('participantList').append(node('span',`${person.name||person.identity}${person===room.localParticipant?' (you)':''} · ${person.isMicrophoneEnabled?'mic on':'muted'}`,'participant-chip'));
        for(const publication of person.trackPublications.values()){
            const track=publication.track;if(!track||publication.isMuted)continue;
            if(track.kind==='audio'&&person===room.localParticipant)continue;
            const element=track.attach();attached.push([track,element]);
            if(track.kind==='video'){element.playsInline=true;if(person===room.localParticipant)element.muted=true;const tile=node('div',undefined,'media-tile');tile.append(element,node('span',`${person.name||person.identity}${publication.source==='screen_share'?' · Screen':''}`));$('meetingStage').append(tile);}
            else {element.hidden=true;$('meetingStage').append(element);}
        }
    }
    mediaControls();
}
async function connectMeeting(){
    if(joining||room||!meetingId)return;
    if(!window.isSecureContext||!navigator.mediaDevices){$('meetingError').textContent='Calls require HTTPS or localhost and a browser supporting media capture.';return;}
    if(!window.LivekitClient){$('meetingError').textContent='Meeting SDK failed to load. Refresh and try again.';return;}
    joining=true;wantJoined=true;const id=meetingId;$('joinMeeting').disabled=true;$('meetingError').textContent='';let candidate;
    try{
        const access=await api(`meetings/${id}/token`);if(meetingId!==id||!wantJoined)return;
        candidate=new LivekitClient.Room({adaptiveStream:true,dynacast:true});
        for(const event of [LivekitClient.RoomEvent.TrackSubscribed,LivekitClient.RoomEvent.TrackUnsubscribed,LivekitClient.RoomEvent.LocalTrackPublished,LivekitClient.RoomEvent.LocalTrackUnpublished,LivekitClient.RoomEvent.ParticipantConnected,LivekitClient.RoomEvent.ParticipantDisconnected,LivekitClient.RoomEvent.TrackMuted,LivekitClient.RoomEvent.TrackUnmuted]) candidate.on(event,()=>{if(room===candidate)renderMedia();});
        candidate.on(LivekitClient.RoomEvent.Reconnecting,()=>{$('meetingStatus').textContent='Reconnecting media…';});
        candidate.on(LivekitClient.RoomEvent.Reconnected,()=>{$('meetingStatus').textContent='Connected';renderMedia();});
        candidate.on(LivekitClient.RoomEvent.Disconnected,()=>{if(room===candidate){room=null;renderMedia();mediaControls();$('meetingStatus').textContent='Disconnected. Checking meeting access…';scheduleRefresh();}});
        candidate.on(LivekitClient.RoomEvent.AudioPlaybackStatusChanged,()=>{$('playAudio').hidden=candidate.canPlaybackAudio;});
        await candidate.connect(access.url,access.token);
        if(meetingId!==id||!wantJoined){await candidate.disconnect();return;}
        room=candidate;mediaControls();renderMedia();
        try{await candidate.localParticipant.setMicrophoneEnabled(true);if(meeting.video)await candidate.localParticipant.setCameraEnabled(true);}
        catch(e){$('meetingError').textContent='Connected in listen-only mode. Allow microphone/camera access, then use the controls to enable them.';}
        if(room===candidate){$('meetingStatus').textContent='Connected';renderMedia();}
    }catch(e){if(candidate)await candidate.disconnect();$('meetingError').textContent=e.message;}
    finally{joining=false;$('joinMeeting').disabled=false;mediaControls();}
}
async function disconnectRoom(){const old=room;room=null;for(const [track,el]of attached)track.detach(el);attached=[];if(old)await old.disconnect(true);$('meetingStage').replaceChildren();$('participantList').replaceChildren();$('playAudio').hidden=true;mediaControls();}
async function closeMeeting(){wantJoined=false;meetingId=null;meeting=null;await disconnectRoom();$('meetingDialog').close();controls();}
const meetingAction=fn=>async()=>{try{await fn();}catch(e){$('meetingError').textContent=e.message;}};
$('requestJoin').onclick=meetingAction(async()=>{await api(`meetings/${meetingId}/request`,{});await updateMeeting();});
$('joinMeeting').onclick=meetingAction(connectMeeting);
$('closeMeeting').onclick=run(closeMeeting);$('leaveMeeting').onclick=run(closeMeeting);
$('meetingDialog').addEventListener('cancel',e=>{e.preventDefault();closeMeeting();});
$('copyLink').onclick=meetingAction(async()=>{try{await navigator.clipboard.writeText($('meetingLink').value);$('meetingStatus').textContent='Meeting link copied.';}catch{$('meetingLink').select();$('meetingStatus').textContent='Select and copy the meeting link above.';}});
$('lockMeeting').onclick=meetingAction(async()=>{await api(`meetings/${meetingId}/lock`,{locked:!meeting.locked});await updateMeeting();});
$('endMeeting').onclick=meetingAction(async()=>{const result=await api(`meetings/${meetingId}/end`,{});if(result.cleanupPending)$('meetingError').textContent='Meeting ended in the app. Media server disconnection is pending and will be retried.';await updateMeeting();});
$('muteButton').onclick=meetingAction(async()=>{if(room)await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);renderMedia();});
$('cameraButton').onclick=meetingAction(async()=>{if(room)await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled);renderMedia();});
$('shareButton').onclick=meetingAction(async()=>{if(room)await room.localParticipant.setScreenShareEnabled(!room.localParticipant.isScreenShareEnabled);renderMedia();});
$('playAudio').onclick=meetingAction(async()=>{if(room)await room.startAudio();});
async function start(){
    await api('session',{});await refresh();
    connection=new signalR.HubConnectionBuilder().withUrl('/chathub').withAutomaticReconnect().build();
    connection.on('Changed',scheduleRefresh);
    connection.onreconnecting(()=>{$('connectionStatus').textContent='Reconnecting…';});
    connection.onreconnected(()=>{$('connectionStatus').textContent='● Connected';scheduleRefresh();});
    connection.onclose(()=>{$('connectionStatus').textContent='Offline · retrying';});
    try{await connection.start();$('connectionStatus').textContent='● Connected';}catch{$('connectionStatus').textContent='Live updates unavailable · retrying';}
    const match=location.pathname.match(/^\/meeting\/([0-9a-f-]+)$/i);if(match)await openMeeting(match[1]);
}
setInterval(()=>{if(document.visibilityState==='visible')refresh().catch(e=>notice(e.message));if(connection?.state===signalR.HubConnectionState.Disconnected)connection.start().then(()=>{$('connectionStatus').textContent='● Connected';scheduleRefresh();}).catch(()=>{});},15000);
setInterval(()=>{if(meetingId)updateMeeting();},5000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleRefresh();});
window.addEventListener('pagehide',()=>{wantJoined=false;room?.disconnect(true);connection?.stop();});
start().catch(e=>notice(e.message));
})();
