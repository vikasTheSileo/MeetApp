using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using WebApplication2.Data;
namespace WebApplication2.Services;

public sealed class ApiException(int status, string message) : Exception(message) { public int Status { get; } = status; }
// Single application instance. Serialize membership changes and admission token issuance.
public sealed class StateGate { public SemaphoreSlim Mutex { get; } = new(1, 1); }
public class LiveKitService(IConfiguration config, IHttpClientFactory factory)
{
    public bool Configured => !string.IsNullOrWhiteSpace(config["LiveKit:ApiSecret"]) && !string.IsNullOrWhiteSpace(config["LiveKit:ApiKey"]);
    public string BrowserUrl => config["LiveKit:PublicUrl"] ?? "ws://localhost:7880";
    public string Token(string identity, string name, object grant, int lifetime = 60)
    {
        if (!Configured) throw new ApiException(503, "Meetings are not configured. Run the local LiveKit setup first.");
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        string Encode(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        var header = Encode(JsonSerializer.SerializeToUtf8Bytes(new { alg = "HS256", typ = "JWT" }));
        var payload = Encode(JsonSerializer.SerializeToUtf8Bytes(new { iss = config["LiveKit:ApiKey"], sub = identity, name, nbf = now - 5, exp = now + lifetime, video = grant }));
        var text = header + "." + payload;
        return text + "." + Encode(HMACSHA256.HashData(Encoding.UTF8.GetBytes(config["LiveKit:ApiSecret"]!), Encoding.UTF8.GetBytes(text)));
    }
    public async Task<JsonElement> Call(string method, object body, object grant)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, (config["LiveKit:ServerUrl"] ?? "http://localhost:7880").TrimEnd('/') + "/twirp/livekit.RoomService/" + method);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Token("chat-backend", "Chat backend", grant));
        request.Content = JsonContent.Create(body);
        HttpResponseMessage response;
        try { response = await factory.CreateClient("livekit").SendAsync(request); }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException) { throw new ApiException(503, "The meeting server is unavailable. Please retry shortly."); }
        using (response)
        {
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound && method == "DeleteRoom") return default;
            if (!response.IsSuccessStatusCode) throw new ApiException(503, "The meeting server rejected this operation. Check its configuration.");
            return JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync());
        }
    }
    public Task<JsonElement> CreateRoom(string name) => Call("CreateRoom", new { name, empty_timeout = 600, departure_timeout = 120, max_participants = 20 }, new { roomCreate = true });
    public Task<JsonElement> DeleteRoom(string name) => Call("DeleteRoom", new { room = name }, new { roomCreate = true });
}
public class RoomCleanup(IServiceScopeFactory scopes, StateGate gate, ILogger<RoomCleanup> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            await gate.Mutex.WaitAsync(stoppingToken);
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ChatDbContext>();
                var live = scope.ServiceProvider.GetRequiredService<LiveKitService>();
                if (!live.Configured) continue;
                foreach (var room in await db.RetiredRooms.Take(20).ToListAsync(stoppingToken))
                {
                    await live.DeleteRoom(room.Name);
                    db.RetiredRooms.Remove(room);
                    await db.SaveChangesAsync(stoppingToken);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException) { logger.LogWarning("Meeting cleanup retry pending: {Type}", ex.GetType().Name); }
            finally { gate.Mutex.Release(); }
        }
    }
}
