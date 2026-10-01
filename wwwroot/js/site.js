(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const app = $('app');
    if (!app) return;
    let connection, me, users = [], selected = 'group', joined = false, sending = false, pendingFile = null;
    const known = new Map(), histories = new Map(), unread = new Map(), myIds = new Set(), drafts = new Map();
    let call = null, signalQueue = Promise.resolve(), noticeTimer;
    const MAX_FILE = 2 * 1024 * 1024;
    const readSetting = key => { try { return localStorage.getItem(key); } catch { return null; } };
    const saveSetting = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Storage may be disabled. */ } };
    document.body.classList.toggle('dark', readSetting('together-theme') === 'dark');
    $('themeButton').onclick = () => { document.body.classList.toggle('dark'); saveSetting('together-theme', document.body.classList.contains('dark') ? 'dark' : 'light'); };
    const initials = name => name.split(/\s+/).map(s => Array.from(s)[0]).slice(0, 2).join('').toUpperCase();
    const online = id => users.some(u => u.id === id);
    function notice(text) { $('notice').textContent = text; $('notice').hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('notice').hidden = true, 9000); }
    function errorText(error) { return error.message?.split('HubException: ').pop() || 'Something went wrong. Please try again.'; }
    function controls() {
        const available = joined && (selected === 'group' || online(selected));
        $('messageInput').disabled = $('attachButton').disabled = $('sendButton').disabled = !available || sending;
        $('voiceButton').disabled = $('videoButton').disabled = !available || selected === 'group' || !!call;
        $('voiceButton').title = $('videoButton').title = selected === 'group' ? 'Select a person to call' : 'Start a private call';
    }
    function choose(id) {
        drafts.set(selected, { text: $('messageInput').value, file: pendingFile });
        selected = id; unread.delete(id);
        $('messageInput').value = drafts.get(id)?.text || ''; pendingFile = drafts.get(id)?.file || null; attachmentUi();
        app.classList.remove('people-open'); $('peopleButton').setAttribute('aria-expanded', 'false');
        renderList(); renderMessages(); renderHeader(); controls();
    }
    function renderHeader() {
        const group = selected === 'group', person = known.get(selected);
        $('chatTitle').textContent = group ? 'Everyone' : person?.name || 'Conversation';
        $('chatAvatar').textContent = group ? '#' : initials(person?.name || '?');
        $('chatSubtitle').textContent = group ? `${users.length} online · shared group chat` : online(selected) ? 'Online · private conversation' : 'Offline · select their new session if they rejoin';
        $('roomBanner').textContent = group ? 'A shared space for the whole group. Pick someone on the left for a private conversation.' : 'Only you and this person receive messages in this conversation.';
    }
    function renderList() {
        $('conversationList').replaceChildren();
        const query = $('searchUsers').value.toLowerCase();
        const people = [...known.values()].filter(u => !myIds.has(u.id) && (online(u.id) || histories.has(u.id))).sort((a, b) => Number(online(b.id)) - Number(online(a.id)) || a.name.localeCompare(b.name));
        for (const person of [{ id: 'group', name: 'Everyone' }, ...people]) {
            if (person.id !== 'group' && !person.name.toLowerCase().includes(query)) continue;
            const button = document.createElement('button'); button.type = 'button'; button.className = 'conversation' + (selected === person.id ? ' active' : ''); button.setAttribute('aria-current', String(selected === person.id));
            const avatar = document.createElement('span'); avatar.className = 'avatar'; avatar.textContent = person.id === 'group' ? '#' : initials(person.name);
            const details = document.createElement('span'); details.className = 'details';
            const title = document.createElement('strong'); title.textContent = person.name;
            const subtitle = document.createElement('small'); subtitle.textContent = person.id === 'group' ? 'The whole group, together' : online(person.id) ? '● Online' : 'Offline';
            details.append(title, subtitle); button.append(avatar, details);
            if (unread.get(person.id)) { const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = unread.get(person.id); button.append(badge); }
            button.onclick = () => choose(person.id); $('conversationList').append(button);
        }
        $('onlineCount').textContent = `${users.length} online`;
        const totalUnread = [...unread.values()].reduce((sum, count) => sum + count, 0);
        $('peopleButton').textContent = totalUnread ? `☰ ${totalUnread}` : '☰';
        $('peopleButton').setAttribute('aria-label', totalUnread ? `Open conversations, ${totalUnread} unread messages` : 'Open conversations');
    }
    function renderMessages() {
        const box = $('messages'); box.replaceChildren();
        const messages = histories.get(selected) || [];
        if (!messages.length) {
            const empty = document.createElement('div'); empty.className = 'empty';
            const icon = document.createElement('div'); icon.className = 'empty-icon'; icon.textContent = '✳';
            const title = document.createElement('h2'); title.textContent = selected === 'group' ? 'You’re in good company.' : 'Make the first move.';
            const detail = document.createElement('p'); detail.textContent = selected === 'group' ? 'Share a thought, send a file, or just say hello. This is where your conversations begin.' : 'Say hello, share a file, or start a voice or video call using the buttons above.';
            empty.append(icon, title, detail); box.append(empty);
        }
        for (const message of messages) {
            const item = document.createElement('article'); item.className = 'message' + (myIds.has(message.sender.id) ? ' mine' : '');
            const meta = document.createElement('div'); meta.className = 'message-meta';
            const sender = document.createElement('span'); sender.textContent = myIds.has(message.sender.id) ? 'You' : message.sender.name;
            const time = document.createElement('time'); time.dateTime = message.sentAt; time.textContent = new Date(message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); meta.append(sender, time);
            const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = message.text;
            if (message.file) { const link = document.createElement('a'); link.className = 'file-link'; link.href = message.file.url; link.download = message.file.name; link.textContent = `↓ ${message.file.name} · ${Math.ceil(message.file.size / 1024)} KB`; bubble.append(link); }
            item.append(meta, bubble); box.append(item);
        }
        box.scrollTop = box.scrollHeight;
    }
    let storedBytes = 0;
    const arrivalOrder = [];
    function receive(message) {
        known.set(message.sender.id, message.sender);
        const key = message.recipientId == null ? 'group' : myIds.has(message.sender.id) ? message.recipientId : message.sender.id;
        if (message.file) {
            const bytes = Uint8Array.from(atob(message.file.data), c => c.charCodeAt(0));
            message.file.url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })); delete message.file.data;
            storedBytes += bytes.length;
        }
        if (!histories.has(key)) histories.set(key, []);
        histories.get(key).push(message); arrivalOrder.push({ key, message });
        // Bound memory retained by long-running tabs, including attachment object URLs.
        while (arrivalOrder.length > 500 || storedBytes > 24 * 1024 * 1024) {
            const old = arrivalOrder.shift(); histories.get(old.key).shift();
            if (old.message.file) { URL.revokeObjectURL(old.message.file.url); storedBytes -= old.message.file.size; }
        }
        if (key !== selected) unread.set(key, (unread.get(key) || 0) + 1);
        renderList(); renderMessages();
    }
    function attachmentUi() { $('attachmentPreview').hidden = !pendingFile; $('attachmentName').textContent = pendingFile ? `${pendingFile.name} (${Math.ceil(pendingFile.size / 1024)} KB)` : ''; $('fileInput').value = ''; }
    $('attachButton').onclick = () => $('fileInput').click();
    $('removeAttachment').onclick = () => { pendingFile = null; attachmentUi(); };
    $('fileInput').onchange = () => {
        const file = $('fileInput').files[0];
        if (!file) return;
        if (!file.size || file.size > MAX_FILE || file.name.length > 180) { notice('Choose a non-empty file up to 2 MB, with a filename under 180 characters.'); $('fileInput').value = ''; return; }
        pendingFile = file; attachmentUi();
    };
    $('messageForm').onsubmit = async event => {
        event.preventDefault(); const text = $('messageInput').value.trim(), file = pendingFile, target = selected;
        if (!joined || sending || (!text && !file)) return;
        sending = true; controls();
        try {
            let attachment = null;
            if (file) { const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); }); attachment = { name: file.name, size: file.size, data }; }
            await connection.invoke('SendMessage', target === 'group' ? null : target, text, attachment);
            drafts.delete(target);
            if (selected === target) { $('messageInput').value = ''; pendingFile = null; attachmentUi(); }
        } catch (error) { notice(errorText(error)); }
        finally { sending = false; controls(); $('messageInput').focus(); }
    };
    $('messageInput').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('messageForm').requestSubmit(); } };
    $('searchUsers').oninput = renderList;
    $('peopleButton').onclick = () => { app.classList.toggle('people-open'); $('peopleButton').setAttribute('aria-expanded', String(app.classList.contains('people-open'))); };
    $('joinDialog').showModal();
    $('joinDialog').addEventListener('cancel', event => event.preventDefault());
    $('nameInput').value = readSetting('together-name') || '';
    renderList(); renderMessages();
    if (!window.signalR) { $('joinError').textContent = 'Chat could not load. Check your internet connection and refresh.'; $('joinButton').disabled = true; return; }
    connection = new signalR.HubConnectionBuilder().withUrl(app.dataset.hubUrl).withAutomaticReconnect().build();
    connection.on('Users', list => { users = list; for (const user of list) known.set(user.id, user); renderList(); renderHeader(); controls(); });
    connection.on('Message', receive);
    async function join(name) {
        me = await connection.invoke('Join', name); myIds.add(me.id); joined = true;
        $('myName').textContent = me.name; $('myAvatar').textContent = initials(me.name); $('connectionStatus').textContent = '● Connected';
        saveSetting('together-name', me.name); $('joinDialog').close(); renderList(); renderHeader(); controls();
    }
    $('joinForm').onsubmit = async event => {
        event.preventDefault(); $('joinButton').disabled = true; $('joinError').textContent = '';
        try { if (connection.state === signalR.HubConnectionState.Disconnected) await connection.start(); await join($('nameInput').value.trim()); }
        catch (error) { $('joinError').textContent = errorText(error); }
        finally { $('joinButton').disabled = false; }
    };
    function disconnected(text) { joined = false; users = []; $('connectionStatus').textContent = text; finishCall(false); renderList(); renderHeader(); controls(); }
    connection.onreconnecting(() => disconnected('Reconnecting…'));
    connection.onreconnected(async () => { try { await join(me.name); notice('Reconnected. Messages sent while you were offline are not saved.'); } catch (error) { $('joinError').textContent = errorText(error); $('joinDialog').showModal(); } });
    connection.onclose(() => { disconnected('Disconnected'); $('joinError').textContent = 'Connection lost. Join again to reconnect.'; if (!$('joinDialog').open) $('joinDialog').showModal(); });

    function showCall(current, incoming) {
        $('callTitle').textContent = current.peer.name; $('callKind').textContent = current.video ? 'VIDEO CALL' : 'VOICE CALL';
        $('callStatus').textContent = incoming ? 'Incoming call…' : 'Calling…';
        $('callDialog').classList.toggle('audio-call', !current.video);
        $('acceptCall').hidden = !incoming; $('acceptCall').disabled = false;
        $('hangupButton').textContent = incoming ? 'Decline' : 'End call';
        $('muteButton').hidden = $('cameraButton').hidden = true;
        $('muteButton').textContent = 'Mute mic'; $('cameraButton').textContent = 'Camera off';
        $('callDialog').showModal(); controls();
        current.timer = setTimeout(() => { if (call === current) { notice('Call timed out. Please try again.'); finishCall(true); } }, 60000);
    }
    async function prepare(current) {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('Calling requires HTTPS (or localhost) and a browser with camera/microphone support.');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: current.video });
        if (call !== current) { stream.getTracks().forEach(t => t.stop()); return false; }
        current.stream = stream; $('localVideo').srcObject = stream;
        const response = await fetch(app.dataset.configUrl);
        if (!response.ok) throw new Error('Could not load call configuration.');
        const config = await response.json();
        if (call !== current) return false;
        const pc = current.pc = new RTCPeerConnection(config);
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        pc.ontrack = event => { if (call === current) { $('remoteVideo').srcObject = event.streams[0]; $('remoteVideo').play().catch(() => notice('Tap the call window to enable audio.')); } };
        pc.onicecandidate = event => { if (event.candidate && call === current) connection.invoke('Signal', current.id, 'ice', JSON.stringify(event.candidate.toJSON())).catch(error => callFailure(current, error)); };
        pc.onconnectionstatechange = () => {
            if (call !== current) return;
            if (pc.connectionState === 'connected') { clearTimeout(current.timer); $('callStatus').textContent = 'Connected'; }
            else if (pc.connectionState === 'failed') { notice('Call could not connect. Different networks may require a TURN server.'); finishCall(true); }
            else if (pc.connectionState === 'disconnected') { $('callStatus').textContent = 'Connection interrupted…'; clearTimeout(current.timer); current.timer = setTimeout(() => { if (call === current) finishCall(true); }, 15000); }
        };
        $('muteButton').hidden = false; $('cameraButton').hidden = !current.video;
        return true;
    }
    function callFailure(current, error) { if (call === current) { notice(error.name === 'NotAllowedError' ? 'Microphone/camera permission was denied. Allow access and try again.' : errorText(error)); finishCall(true); } }
    async function startCall(video) {
        if (call || !joined || selected === 'group' || !online(selected)) return;
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) { notice('Calling requires HTTPS (or localhost) and a browser with camera/microphone support.'); return; }
        const current = call = { id: crypto.randomUUID(), peer: known.get(selected), video, candidates: [] };
        showCall(current, false);
        try { if (!await prepare(current)) return; if (call !== current) return; await connection.invoke('StartCall', current.peer.id, current.id, video); if (call !== current) await connection.invoke('EndCall', current.id); }
        catch (error) { callFailure(current, error); }
    }
    $('voiceButton').onclick = () => startCall(false); $('videoButton').onclick = () => startCall(true);
    connection.on('IncomingCall', (id, peer, video) => {
        if (call || !joined) { connection.invoke('EndCall', id).catch(() => {}); return; }
        const current = call = { id, peer, video, candidates: [] }; showCall(current, true);
    });
    $('acceptCall').onclick = async () => {
        const current = call; if (!current) return; $('acceptCall').disabled = true; $('callStatus').textContent = 'Connecting…';
        try { if (!await prepare(current)) return; await connection.invoke('AcceptCall', current.id); if (call === current) { $('acceptCall').hidden = true; $('hangupButton').textContent = 'End call'; } }
        catch (error) { callFailure(current, error); }
    };
    connection.on('CallAccepted', async id => {
        const current = call; if (!current || current.id !== id) return;
        try { $('callStatus').textContent = 'Connecting…'; const offer = await current.pc.createOffer(); if (call !== current) return; await current.pc.setLocalDescription(offer); await connection.invoke('Signal', id, 'offer', JSON.stringify(offer)); }
        catch (error) { callFailure(current, error); }
    });
    connection.on('Signal', (id, kind, payload) => {
        const current = call;
        signalQueue = signalQueue.then(async () => {
            if (!current || call !== current || current.id !== id || !current.pc) return;
            const data = JSON.parse(payload), pc = current.pc;
            if (kind === 'ice') { if (pc.remoteDescription) await pc.addIceCandidate(data); else current.candidates.push(data); return; }
            await pc.setRemoteDescription(data);
            for (const candidate of current.candidates.splice(0)) await pc.addIceCandidate(candidate);
            if (kind === 'offer' && call === current) { const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); await connection.invoke('Signal', id, 'answer', JSON.stringify(answer)); }
        }).catch(error => callFailure(current, error));
    });
    function finishCall(notifyPeer) {
        const current = call; if (!current) return; call = null;
        clearTimeout(current.timer); current.pc?.close(); current.stream?.getTracks().forEach(track => track.stop());
        $('remoteVideo').srcObject = $('localVideo').srcObject = null;
        $('callDialog').close(); controls();
        if (notifyPeer && connection.state === signalR.HubConnectionState.Connected) connection.invoke('EndCall', current.id).catch(() => {});
    }
    connection.on('CallEnded', id => { if (call?.id === id) { finishCall(false); notice('Call ended or declined.'); } });
    $('hangupButton').onclick = () => finishCall(true);
    $('callDialog').addEventListener('cancel', event => { event.preventDefault(); finishCall(true); });
    $('callDialog').addEventListener('click', () => { if ($('remoteVideo').srcObject) $('remoteVideo').play().catch(() => {}); });
    $('muteButton').onclick = () => { const track = call?.stream?.getAudioTracks()[0]; if (track) { track.enabled = !track.enabled; $('muteButton').textContent = track.enabled ? 'Mute mic' : 'Unmute mic'; } };
    $('cameraButton').onclick = () => { const track = call?.stream?.getVideoTracks()[0]; if (track) { track.enabled = !track.enabled; $('cameraButton').textContent = track.enabled ? 'Camera off' : 'Camera on'; } };
    window.addEventListener('pagehide', () => { finishCall(true); connection.stop(); });
})();

