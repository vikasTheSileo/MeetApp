using Microsoft.AspNetCore.SignalR;

namespace WebApplication2.Hubs;

public sealed record ChatUser(string Id, string Name);
public sealed record ChatFile(string Name, string Data, int Size);
public sealed record ChatMessage(string Id, ChatUser Sender, string? RecipientId, string Text, ChatFile? File, DateTimeOffset SentAt);
public sealed record CallSession(string Id, string Caller, string Callee, bool Video, DateTimeOffset CreatedAt, bool Accepted = false);

// Single-process, ephemeral rooms. No messages or attachments are stored on the server.
public sealed class ChatHub : Hub
{
    private static readonly object Gate = new();
    private static readonly Dictionary<string, ChatUser> Users = new();
    private static readonly Dictionary<string, CallSession> Calls = new();
    private static readonly Dictionary<string, DateTimeOffset> LastSent = new();
    private const int MaxFileSize = 2 * 1024 * 1024;

    public async Task<ChatUser> Join(string name)
    {
        name = (name ?? "").Trim();
        if (name.Length is < 2 or > 30 || name.Any(char.IsControl))
            throw new HubException("Choose a name with 2–30 characters.");
        ChatUser user;
        lock (Gate)
        {
            if (Users.Values.Any(u => u.Id != Context.ConnectionId && string.Equals(u.Name, name, StringComparison.OrdinalIgnoreCase)))
                throw new HubException("That name is in use. Please choose another.");
            user = new(Context.ConnectionId, name);
            Users[user.Id] = user;
        }
        await PublishUsers();
        return user;
    }

    public async Task SendMessage(string? recipientId, string text, ChatFile? file)
    {
        ChatUser sender;
        lock (Gate)
        {
            sender = RequireUser();
            if (recipientId != null && (!Users.ContainsKey(recipientId) || recipientId == sender.Id))
                throw new HubException("This person is no longer available.");
            if (LastSent.TryGetValue(sender.Id, out var last) && DateTimeOffset.UtcNow - last < TimeSpan.FromMilliseconds(500))
                throw new HubException("Please wait a moment before sending again.");
            LastSent[sender.Id] = DateTimeOffset.UtcNow;
        }
        text = (text ?? "").Trim();
        if (text.Length > 4000 || (text.Length == 0 && file == null))
            throw new HubException("Enter a message (up to 4,000 characters) or attach a file.");
        if (file != null)
        {
            if (string.IsNullOrWhiteSpace(file.Name) || file.Name.Length > 180 || file.Name.Any(char.IsControl) || file.Data == null || file.Data.Length > 2796204)
                throw new HubException("Invalid attachment. Maximum file size is 2 MB.");
            byte[] bytes;
            try { bytes = Convert.FromBase64String(file.Data); }
            catch (FormatException) { throw new HubException("Invalid attachment."); }
            if (bytes.Length is 0 or > MaxFileSize || file.Size != bytes.Length)
                throw new HubException("Invalid attachment. Maximum file size is 2 MB.");
            file = file with { Name = Path.GetFileName(file.Name.Replace('\\', '/')) };
        }
        var message = new ChatMessage(Guid.NewGuid().ToString("N"), sender, recipientId, text, file, DateTimeOffset.UtcNow);
        // Only explicitly joined connections receive the public room.
        string[] audience;
        lock (Gate) audience = recipientId == null ? Users.Keys.ToArray() : new[] { sender.Id, recipientId };
        await Clients.Clients(audience).SendAsync("Message", message);
    }

    public async Task StartCall(string recipientId, string callId, bool video)
    {
        ChatUser sender;
        lock (Gate)
        {
            sender = RequireUser();
            if (!Guid.TryParse(callId, out _) || !Users.ContainsKey(recipientId) || recipientId == sender.Id)
                throw new HubException("This person is unavailable.");
            foreach (var expired in Calls.Values.Where(c => !c.Accepted && DateTimeOffset.UtcNow - c.CreatedAt > TimeSpan.FromSeconds(60)).ToArray())
                Calls.Remove(expired.Id);
            if (Calls.ContainsKey(callId) || Calls.Values.Any(c => c.Caller == sender.Id || c.Callee == sender.Id || c.Caller == recipientId || c.Callee == recipientId))
                throw new HubException("One of you is already in a call.");
            Calls[callId] = new(callId, sender.Id, recipientId, video, DateTimeOffset.UtcNow);
        }
        await Clients.Client(recipientId).SendAsync("IncomingCall", callId, sender, video);
    }

    public async Task AcceptCall(string callId)
    {
        CallSession call;
        lock (Gate)
        {
            call = RequireCall(callId);
            if (call.Callee != Context.ConnectionId || call.Accepted || DateTimeOffset.UtcNow - call.CreatedAt > TimeSpan.FromSeconds(60))
                throw new HubException("This call is no longer available.");
            Calls[callId] = call with { Accepted = true };
        }
        await Clients.Client(call.Caller).SendAsync("CallAccepted", callId);
    }

    public async Task Signal(string callId, string kind, string payload)
    {
        CallSession call;
        lock (Gate) call = RequireCall(callId);
        if (!call.Accepted || payload == null || payload.Length > 16000 || kind is not ("offer" or "answer" or "ice"))
            throw new HubException("Invalid call signal.");
        if ((kind == "offer" && Context.ConnectionId != call.Caller) || (kind == "answer" && Context.ConnectionId != call.Callee))
            throw new HubException("Invalid call signal.");
        await Clients.Client(Other(call)).SendAsync("Signal", callId, kind, payload);
    }

    public async Task EndCall(string callId)
    {
        CallSession? call;
        lock (Gate)
        {
            if (!Calls.TryGetValue(callId, out call)) return;
            call = RequireCall(callId);
            Calls.Remove(callId);
        }
        await Clients.Client(Other(call)).SendAsync("CallEnded", callId);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        CallSession[] ended;
        lock (Gate)
        {
            Users.Remove(Context.ConnectionId);
            LastSent.Remove(Context.ConnectionId);
            ended = Calls.Values.Where(c => c.Caller == Context.ConnectionId || c.Callee == Context.ConnectionId).ToArray();
            foreach (var call in ended) Calls.Remove(call.Id);
        }
        foreach (var call in ended) await Clients.Client(Other(call)).SendAsync("CallEnded", call.Id);
        await PublishUsers();
        await base.OnDisconnectedAsync(exception);
    }

    private ChatUser RequireUser() => Users.TryGetValue(Context.ConnectionId, out var user) ? user : throw new HubException("Join the chat first.");
    private CallSession RequireCall(string id) => Calls.TryGetValue(id, out var call) && (call.Caller == Context.ConnectionId || call.Callee == Context.ConnectionId)
        ? call : throw new HubException("This call is no longer available.");
    private string Other(CallSession call) => call.Caller == Context.ConnectionId ? call.Callee : call.Caller;
    private Task PublishUsers()
    {
        ChatUser[] users;
        lock (Gate) users = Users.Values.OrderBy(u => u.Name).ToArray();
        return Clients.All.SendAsync("Users", users);
    }
}
