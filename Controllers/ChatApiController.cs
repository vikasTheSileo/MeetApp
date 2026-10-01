using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using WebApplication2.Data;
using WebApplication2.Hubs;
using WebApplication2.Services;
namespace WebApplication2.Controllers;
public record GroupInput(string Name, string[] UserIds);
public record MemberInput(string UserId, bool Add);
public record DirectInput(string UserId);
public record ReadInput(long MessageId);
public record MeetingInput(Guid ConversationId, string Title, bool Video);
public record DecisionInput(string UserId, string Decision);
public record LockInput(bool Locked);

[Authorize, ApiController, Route("api"), AutoValidateAntiforgeryToken]
[Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("api")]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public partial class ChatApiController(ChatDbContext db, IAntiforgery antiforgery, Presence presence, IHubContext<ChatHub> hub, LiveKitService live) : ControllerBase
{
    private string Me => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    public static readonly Guid Everyone = Guid.Parse("10000000-0000-0000-0000-000000000001");
    private async Task<Conversation> Conversation(Guid id)
    {
        var c = await db.Conversations.Include(c => c.Members).SingleOrDefaultAsync(c => c.Id == id);
        if (c == null || !c.Members.Any(m => m.UserId == Me)) throw new ApiException(404, "Conversation unavailable or access removed.");
        return c;
    }
    private Task Notify(IEnumerable<string> users) => hub.Clients.Users(users.Distinct().ToArray()).SendAsync("Changed");
    private Task Notify(Conversation c) => Notify(c.Members.Select(m => m.UserId));

    [HttpGet("bootstrap")]
    public async Task<IActionResult> Bootstrap()
    {
        var me = await db.Users.Where(u => u.Id == Me).Select(u => new { u.Id, name = u.DisplayName, username = u.UserName }).SingleAsync();
        var users = await db.Users.OrderBy(u => u.DisplayName).Select(u => new { u.Id, name = u.DisplayName, username = u.UserName }).ToListAsync();
        var conversations = await db.Conversations.Where(c => c.Members.Any(m => m.UserId == Me)).OrderByDescending(c => c.CreatedAt)
            .Select(c => new { c.Id, c.Name, c.Kind, c.OwnerId,
                members = c.Members.Select(m => new { m.UserId, name = m.User.DisplayName, username = m.User.UserName }),
                unread = db.Messages.Count(m => m.ConversationId == c.Id && m.SenderId != Me && m.Id > c.Members.Where(x => x.UserId == Me).Select(x => x.LastReadId).First()),
                lastId = db.Messages.Where(m => m.ConversationId == c.Id).Select(m => (long?)m.Id).Max() ?? 0
            }).ToListAsync();
        return Ok(new { me, users, conversations, online = presence.Online(), csrf = antiforgery.GetAndStoreTokens(HttpContext).RequestToken, meetingsConfigured = live.Configured });
    }
    [HttpPost("session")]
    public async Task<IActionResult> Session()
    {
        if (!await db.Memberships.AnyAsync(m => m.ConversationId == Everyone && m.UserId == Me))
        { db.Memberships.Add(new Membership { ConversationId = Everyone, UserId = Me }); await db.SaveChangesAsync(); }
        return Ok(new { });
    }
    [HttpPost("conversations/direct")]
    public async Task<IActionResult> Direct(DirectInput input)
    {
        if (input.UserId == Me || !await db.Users.AnyAsync(u => u.Id == input.UserId)) throw new ApiException(400, "Select another registered user.");
        var key = string.Join(':', new[] { Me, input.UserId }.Order(StringComparer.Ordinal));
        var c = await db.Conversations.SingleOrDefaultAsync(c => c.DirectKey == key);
        if (c == null)
        {
            c = new Conversation { Kind = "direct", Name = "Direct conversation", OwnerId = Me, DirectKey = key, Members = [new() { UserId = Me }, new() { UserId = input.UserId }] };
            db.Add(c); await db.SaveChangesAsync(); await Notify(c);
        }
        return Ok(new { c.Id });
    }
    [HttpPost("conversations/groups")]
    public async Task<IActionResult> Group(GroupInput input)
    {
        var name = (input.Name ?? "").Trim();
        var ids = (input.UserIds ?? []).Append(Me).Distinct().ToArray();
        if (name.Length is < 2 or > 80 || name.Any(char.IsControl) || ids.Length is < 2 or > 100 || await db.Users.CountAsync(u => ids.Contains(u.Id)) != ids.Length)
            throw new ApiException(400, "Enter a 2–80 character name and choose 1–99 other registered members.");
        var c = new Conversation { Name = name, OwnerId = Me, Members = ids.Select(id => new Membership { UserId = id }).ToList() };
        db.Add(c); await db.SaveChangesAsync(); await Notify(c); return Ok(new { c.Id });
    }
    [HttpPost("conversations/{id:guid}/members")]
    public async Task<IActionResult> Members(Guid id, MemberInput input)
    {
        var c = await Conversation(id);
        if (c.Kind != "group" || c.OwnerId != Me) throw new ApiException(403, "Only the group owner can manage members.");
        if (input.UserId == Me) throw new ApiException(400, "The group owner cannot be removed.");
        var member = c.Members.SingleOrDefault(m => m.UserId == input.UserId);
        if (input.Add)
        {
            if (!await db.Users.AnyAsync(u => u.Id == input.UserId)) throw new ApiException(400, "User not found.");
            if (member == null) { if (c.Members.Count >= 100) throw new ApiException(400, "Group limit reached."); c.Members.Add(new Membership { UserId = input.UserId }); }
        }
        else if (member != null)
        {
            db.Remove(member);
            foreach (var meeting in await db.Meetings.Include(m => m.Admissions).Where(m => m.ConversationId == id && !m.Ended).ToListAsync())
            {
                var admission = meeting.Admissions.SingleOrDefault(a => a.UserId == input.UserId);
                if (admission != null) admission.Status = "removed";
                if (meeting.HostId == input.UserId) meeting.Ended = true;
                Retire(meeting);
            }
        }
        await db.SaveChangesAsync();
        await Notify(c.Members.Select(m => m.UserId).Append(input.UserId));
        return Ok(new { cleanupPending = !await Cleanup() });
    }
    [HttpGet("conversations/{id:guid}/messages")]
    public async Task<IActionResult> Messages(Guid id, long? before = null, long? after = null)
    {
        await Conversation(id);
        var q = db.Messages.AsNoTracking().Where(m => m.ConversationId == id);
        if (before.HasValue) q = q.Where(m => m.Id < before);
        if (after.HasValue) q = q.Where(m => m.Id > after);
        var sorted = after.HasValue ? q.OrderBy(m => m.Id) : q.OrderByDescending(m => m.Id);
        var items = await sorted.Take(50).Select(m => new { m.Id, m.ConversationId, m.SenderId, senderName = m.Sender.DisplayName, m.Text, m.SentAt,
            file = m.Attachment == null ? null : new { name = m.Attachment.Name, size = m.Attachment.Bytes.Length, url = "/api/files/" + m.Id } }).ToArrayAsync();
        return Ok(items.OrderBy(m => m.Id));
    }
    [HttpPost("conversations/{id:guid}/messages"), RequestSizeLimit(2300000)]
    public async Task<IActionResult> Send(Guid id, [FromForm] string? text, [FromForm] Guid requestId, IFormFile? file)
    {
        var c = await Conversation(id);
        if (requestId == Guid.Empty) throw new ApiException(400, "A message request ID is required.");
        var existing = await db.Messages.SingleOrDefaultAsync(m => m.SenderId == Me && m.RequestId == requestId);
        if (existing != null) { if (existing.ConversationId != id) throw new ApiException(409, "Request ID already used."); return Ok(new { existing.Id }); }
        text = (text ?? "").Trim();
        if (text.Length > 4000 || (text.Length == 0 && file == null)) throw new ApiException(400, "Enter text up to 4,000 characters or attach a file.");
        var since = DateTime.UtcNow.AddMilliseconds(-500);
        if (await db.Messages.AnyAsync(m => m.SenderId == Me && m.SentAt > since)) throw new ApiException(429, "Please wait a moment between messages.");
        var message = new ChatMessage { ConversationId = id, SenderId = Me, Text = text, RequestId = requestId };
        if (file != null)
        {
            var name = Path.GetFileName(file.FileName.Replace('\\','/'));
            var allowed = new[] { ".pdf", ".txt", ".csv", ".png", ".jpg", ".jpeg", ".webp", ".docx", ".xlsx", ".pptx", ".zip" };
            if (file.Length is < 1 or > 2097152 || name.Length is < 1 or > 180 || name.Any(char.IsControl) || !allowed.Contains(Path.GetExtension(name).ToLowerInvariant()))
                throw new ApiException(400, "Allowed: PDF, text, CSV, images, Office documents or ZIP, up to 2 MB.");
            using var stream = new MemoryStream(); await file.CopyToAsync(stream);
            message.Attachment = new Attachment { Name = name, Bytes = stream.ToArray() };
        }
        db.Messages.Add(message); await db.SaveChangesAsync(); await Notify(c); return Ok(new { message.Id });
    }
    [HttpPost("conversations/{id:guid}/read")]
    public async Task<IActionResult> Read(Guid id, ReadInput input)
    {
        var c = await Conversation(id);
        if (input.MessageId > 0 && !await db.Messages.AnyAsync(m => m.Id == input.MessageId && m.ConversationId == id)) throw new ApiException(400, "Invalid read position.");
        var member = c.Members.Single(m => m.UserId == Me); member.LastReadId = Math.Max(member.LastReadId, input.MessageId);
        await db.SaveChangesAsync(); return Ok(new { });
    }
    [HttpGet("files/{id:long}")]
    public async Task<IActionResult> Download(long id)
    {
        var record = await db.Messages.Where(m => m.Id == id).Select(m => new { m.ConversationId }).SingleOrDefaultAsync();
        if (record == null) throw new ApiException(404, "File not found.");
        await Conversation(record.ConversationId);
        var file = await db.Attachments.AsNoTracking().SingleOrDefaultAsync(f => f.MessageId == id) ?? throw new ApiException(404, "File not found.");
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return File(file.Bytes, "application/octet-stream", file.Name);
    }
}
