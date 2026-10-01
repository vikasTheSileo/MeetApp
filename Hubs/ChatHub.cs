using System.Collections.Concurrent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace WebApplication2.Hubs;
public sealed class Presence
{
    private readonly ConcurrentDictionary<string, string> connections = new();
    public void Add(string connection, string user) => connections[connection] = user;
    public void Remove(string connection) => connections.TryRemove(connection, out _);
    public string[] Online() => connections.Values.Distinct().ToArray();
}
[Authorize]
public class ChatHub(Presence presence) : Hub
{
    public override async Task OnConnectedAsync()
    {
        presence.Add(Context.ConnectionId, Context.UserIdentifier!);
        await Clients.All.SendAsync("Changed");
        await base.OnConnectedAsync();
    }
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        presence.Remove(Context.ConnectionId);
        await Clients.All.SendAsync("Changed");
        await base.OnDisconnectedAsync(exception);
    }
}
