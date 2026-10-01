# Together — SignalR chat

A single-process ASP.NET Core 9 MVC chat app. Run with Visual Studio's HTTPS profile or `dotnet run --launch-profile https` (see Properties/launchSettings.json).

## Features

- Choose a display name (unique among currently connected people); search the online list.
- Everyone room and isolated one-to-one conversations, unread counts, timestamps, per-conversation drafts.
- Files up to 2 MiB in both group and private chat, downloaded as attachments rather than rendered HTML.
- One-to-one WebRTC voice/video calls, incoming accept/decline, busy handling, timeout, mute, camera toggle, disconnect cleanup.
- Responsive phone/tablet/desktop layout and remembered light/dark preference.
- Automatic reconnect; if retries fail, the join dialog allows manual retry.

## Calling on phones / different networks

Microphone and camera require a secure browser context: HTTPS with a certificate trusted by the device, or localhost for local testing. A phone opening an HTTP LAN address cannot use media capture. Host the app with trusted HTTPS for device testing.

The default ICE configuration uses Google's public STUN service. Some mobile, corporate and carrier networks require TURN to relay media. Add your own TURN service under `WebRtc:IceServers`, alongside the STUN entry:

```json
{
  "Urls": ["turn:your-turn-host:3478", "turns:your-turn-host:5349"],
  "Username": "your-issued-username",
  "Credential": "your-issued-credential"
}
```

For deployment, supply credentials through configuration/environment variables (for example `WebRtc__IceServers__1__Urls__0`, `WebRtc__IceServers__1__Username`, `WebRtc__IceServers__1__Credential`). The browser must receive ICE credentials; the configuration endpoint is public in this guest app. Use scoped short-lived TURN credentials and an authenticated credential-issuing endpoint for a public service, never a TURN provider's master secret. No TURN account or credentials are included.

## Scope and storage

This remains a guest chat: chosen names are not verified identities. Private messages and files are routed only to the two connection IDs; there is no login, database, offline delivery, or end-to-end encryption for text/files. HTTPS protects browser/server transport; WebRTC handles media transport.

History exists only in the open tab, capped at 500 messages / 24 MiB of attachments across conversations. Oldest entries are discarded when either cap is reached. Refreshing clears history. Reconnecting creates a new online session; select that person's new session to continue chatting. Calls are one-to-one, not group conferences. Presence and call state are in process memory; multi-instance hosting requires a shared presence/call store and SignalR scale-out configuration.

The Microsoft SignalR 9.0.6 browser client and MIT license are bundled in `wwwroot/lib/signalr`; runtime CDN access is not needed. ASP.NET Core already includes the server SignalR framework, so obsolete extra server/client NuGet references were removed.

## Verification

```powershell
dotnet build
# In another terminal, start an isolated test instance:
dotnet run --no-build --no-launch-profile --urls http://localhost:5198
# Node 22+:
node tests/chat-smoke.mjs http://localhost:5198
```

The smoke test covers presence, duplicate names, unjoined sends, public/private recipient isolation, attachment validation and size boundary, caller identity, call authorization/acceptance/busy/end/disconnect, HTML response, and ICE configuration. It does not simulate microphone/camera hardware or test media across real networks.

Manual device checks: join with different names on two devices, send group/private text and a file, call each way with voice/video, deny permissions, decline and hang up, mute/camera toggle, disconnect/reconnect, and rotate a phone. A third participant should never receive the private text/file or call signals.
