// Run against an isolated local instance: node tests/chat-smoke.mjs http://localhost:5198
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.argv[2] || 'http://localhost:5198';
const pause = ms => new Promise(r => setTimeout(r, ms));
class Client {
    events = []; pending = new Map(); sequence = 0;
    async connect() {
        this.socket = new WebSocket(base.replace(/^http/, 'ws') + '/chathub');
        await new Promise((resolve, reject) => { this.socket.onopen = resolve; this.socket.onerror = reject; });
        const handshake = new Promise(resolve => this.ready = resolve);
        this.socket.onmessage = ({ data }) => {
            for (const frame of data.split('\x1e').filter(Boolean)) {
                const value = JSON.parse(frame);
                if (!value.type) this.ready();
                else if (value.type === 1) this.events.push(value);
                else if (value.type === 3) { const p = this.pending.get(value.invocationId); this.pending.delete(value.invocationId); value.error ? p.reject(new Error(value.error)) : p.resolve(value.result); }
            }
        };
        this.socket.send(JSON.stringify({ protocol: 'json', version: 1 }) + '\x1e'); await handshake; return this;
    }
    invoke(target, ...args) {
        const invocationId = String(++this.sequence);
        return new Promise((resolve, reject) => { this.pending.set(invocationId, { resolve, reject }); this.socket.send(JSON.stringify({ type: 1, invocationId, target, arguments: args }) + '\x1e'); });
    }
    matching(target) { return this.events.filter(e => e.target === target); }
    clear() { this.events = []; }
}
const timeout = setTimeout(() => { console.error('Smoke test timed out'); process.exit(1); }, 20000);
const clients = [];
try {
    assert.equal((await fetch(base)).status, 200);
    const config = await (await fetch(base + '/Home/CallConfiguration')).json(); assert.ok(config.iceServers[0].urls[0].startsWith('stun:'));
    for (let i = 0; i < 4; i++) clients.push(await new Client().connect());
    const [a, b, c, outsider] = clients;
    const alice = await a.invoke('Join', 'Test Alice'), bob = await b.invoke('Join', 'Test Bob'); await c.invoke('Join', 'Test Carol');
    await assert.rejects(outsider.invoke('Join', 'test alice'), /name is in use/);
    await assert.rejects(outsider.invoke('SendMessage', null, 'forbidden', null), /Join the chat/);
    clients.forEach(x => x.clear());
    await a.invoke('SendMessage', null, 'Group hello', null); await pause(100);
    for (const x of [a, b, c]) assert.equal(x.matching('Message').length, 1);
    assert.equal(outsider.matching('Message').length, 0);
    await pause(500); clients.forEach(x => x.clear());
    await a.invoke('SendMessage', bob.id, '<img src=x onerror=alert(1)>', null); await pause(100);
    assert.equal(a.matching('Message').length, 1); assert.equal(b.matching('Message').length, 1); assert.equal(c.matching('Message').length, 0);
    assert.equal(b.matching('Message')[0].arguments[0].sender.id, alice.id);
    await pause(500); clients.forEach(x => x.clear());
    const file = { name: '../sample.txt', data: Buffer.from('test attachment').toString('base64'), size: 15 };
    await a.invoke('SendMessage', bob.id, '', file); await pause(100);
    assert.equal(b.matching('Message')[0].arguments[0].file.name, 'sample.txt'); assert.equal(c.matching('Message').length, 0);
    await pause(500); await assert.rejects(a.invoke('SendMessage', bob.id, '', { ...file, size: 99 }), /Invalid attachment/);
    await pause(500);
    const large = Buffer.alloc(2 * 1024 * 1024, 65);
    await a.invoke('SendMessage', bob.id, '', {name:'boundary.bin', data:large.toString('base64'), size:large.length});
    await pause(100); assert.equal(b.matching('Message').at(-1).arguments[0].file.size, large.length);
    await pause(500); await assert.rejects(a.invoke('SendMessage', bob.id, '', {name:'oversize.bin', data:Buffer.alloc(large.length + 1).toString('base64'), size:large.length + 1}), /Invalid attachment/);
    const id = randomUUID(); await a.invoke('StartCall', bob.id, id, true);
    await assert.rejects(c.invoke('StartCall', bob.id, randomUUID(), false), /already in a call/);
    await assert.rejects(c.invoke('AcceptCall', id), /no longer available/);
    await assert.rejects(a.invoke('Signal', id, 'offer', '{}'), /Invalid call signal/);
    await b.invoke('AcceptCall', id); await a.invoke('Signal', id, 'offer', '{"type":"offer","sdp":"test"}'); await pause(100);
    assert.equal(b.matching('Signal').length, 1); assert.equal(c.matching('Signal').length, 0);
    await assert.rejects(c.invoke('EndCall', id), /no longer available/);
    await b.invoke('EndCall', id); await pause(100); assert.equal(a.matching('CallEnded').length, 1);
    const next = randomUUID(); await a.invoke('StartCall', bob.id, next, false); b.socket.close(); await pause(250);
    assert.equal(a.matching('CallEnded').length, 2);
    await assert.rejects(a.invoke('SendMessage', bob.id, 'offline', null), /no longer available/);
    console.log('PASS: presence, duplicate names, join guard, group/private isolation, attachment validation and 2 MB boundary, call acceptance/authorization/busy/end/disconnect, HTTP and ICE configuration.');
} finally { clearTimeout(timeout); clients.forEach(c => c.socket.close()); }
