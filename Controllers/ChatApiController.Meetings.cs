using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using WebApplication2.Data;
using WebApplication2.Services;
namespace WebApplication2.Controllers;
public partial class ChatApiController
{
    private async Task<Meeting> Meeting(Guid id)
    {
        var meeting = await db.Meetings.Include(m => m.Admissions).SingleOrDefaultAsync(m => m.Id == id) ?? throw new ApiException(404, "Meeting not found.");
        await Conversation(meeting.ConversationId); return meeting;
    }
    private void Host(Meeting m) { if (m.HostId != Me) throw new ApiException(403, "Only the meeting host can do this."); }
    private static void Active(Meeting m) { if (m.Ended) throw new ApiException(409, "This meeting has ended."); }
    private async Task NotifyMeeting(Meeting m) => await Notify(await db.Memberships.Where(x => x.ConversationId == m.ConversationId).Select(x => x.UserId).ToArrayAsync());
    [HttpGet("conversations/{id:guid}/meetings")]
    public async Task<IActionResult> Meetings(Guid id)
    {
        await Conversation(id);
        return Ok(await db.Meetings.Where(m => m.ConversationId == id && !m.Ended).OrderByDescending(m => m.CreatedAt).Select(m => new { m.Id, m.Title, m.Video, m.HostId, m.Locked }).ToArrayAsync());
    }
    [HttpPost("meetings")]
    public async Task<IActionResult> CreateMeeting(MeetingInput input)
    {
        var c = await Conversation(input.ConversationId);
        if (!live.Configured) throw new ApiException(503, "Configure the self-hosted LiveKit server first.");
        if (await db.Meetings.CountAsync(m => m.HostId == Me && !m.Ended) >= 3) throw new ApiException(400, "End an existing meeting before creating another (limit 3).");
        var title = (input.Title ?? "").Trim();
        if (title.Length is < 2 or > 100) throw new ApiException(400, "Meeting title must be 2–100 characters.");
        var m = new Meeting { ConversationId = c.Id, HostId = Me, Title = title, Video = input.Video, Admissions = [new() { UserId = Me, Status = "approved" }] };
        await live.CreateRoom(m.RoomName);
        db.Add(m); await db.SaveChangesAsync(); await Notify(c);
        return Ok(new { m.Id, path = "/meeting/" + m.Id });
    }
    [HttpGet("meetings/{id:guid}")]
    public async Task<IActionResult> MeetingState(Guid id)
    {
        var m = await Meeting(id);
        var entries = m.HostId == Me ? await db.Admissions.Where(a => a.MeetingId == id).Select(a => new { a.UserId, name = a.User.DisplayName, a.Status }).ToArrayAsync() : null;
        return Ok(new { m.Id, m.ConversationId, m.Title, m.HostId, m.Video, m.Locked, m.Ended, m.RoomName, status = m.Admissions.FirstOrDefault(a => a.UserId == Me)?.Status ?? "none", requests = entries });
    }
    [HttpPost("meetings/{id:guid}/request")]
    public async Task<IActionResult> RequestJoin(Guid id)
    {
        var m = await Meeting(id); Active(m);
        var a = m.Admissions.SingleOrDefault(a => a.UserId == Me);
        if (a?.Status == "approved") return Ok(new { });
        if (a?.Status is "removed" or "declined") throw new ApiException(403, "The host has declined or removed you from this meeting.");
        if (m.Locked) throw new ApiException(403, "This meeting is locked.");
        if (a == null) m.Admissions.Add(new Admission { UserId = Me });
        await db.SaveChangesAsync(); await NotifyMeeting(m); return Ok(new { });
    }
    [HttpPost("meetings/{id:guid}/decide")]
    public async Task<IActionResult> Decide(Guid id, DecisionInput input)
    {
        var m = await Meeting(id); Host(m); Active(m);
        if (input.UserId == Me || input.Decision is not ("approve" or "decline" or "remove")) throw new ApiException(400, "Invalid host action.");
        var a = m.Admissions.SingleOrDefault(a => a.UserId == input.UserId) ?? throw new ApiException(404, "Request not found.");
        if (input.Decision == "approve")
        {
            if (m.Locked) throw new ApiException(409, "Unlock the meeting before admitting people.");
            if (a.Status != "pending") throw new ApiException(409, "Only pending requests can be approved.");
            if (!await db.Memberships.AnyAsync(x => x.ConversationId == m.ConversationId && x.UserId == a.UserId)) throw new ApiException(403, "This person is no longer a member.");
            a.Status = "approved";
        }
        else
        {
            if (input.Decision == "decline" && a.Status != "pending") throw new ApiException(409, "Use remove for admitted participants.");
            if (a.Status == "approved") Retire(m);
            a.Status = input.Decision == "remove" ? "removed" : "declined";
        }
        await db.SaveChangesAsync(); await NotifyMeeting(m);
        return Ok(new { cleanupPending = !await Cleanup() });
    }
    [HttpPost("meetings/{id:guid}/lock")]
    public async Task<IActionResult> Lock(Guid id, LockInput input)
    {
        var m = await Meeting(id); Host(m); Active(m); m.Locked = input.Locked;
        await db.SaveChangesAsync(); await NotifyMeeting(m); return Ok(new { });
    }
    [HttpPost("meetings/{id:guid}/end")]
    public async Task<IActionResult> End(Guid id)
    {
        var m = await Meeting(id); Host(m);
        if (!m.Ended) { m.Ended = true; Retire(m); await db.SaveChangesAsync(); await NotifyMeeting(m); }
        return Ok(new { cleanupPending = !await Cleanup() });
    }
    [HttpPost("meetings/{id:guid}/token")]
    public async Task<IActionResult> JoinToken(Guid id)
    {
        var m = await Meeting(id); Active(m);
        if (!m.Admissions.Any(a => a.UserId == Me && a.Status == "approved")) throw new ApiException(403, "Wait for the host to approve your request.");
        if (!await Cleanup()) throw new ApiException(503, "Meeting permissions are updating. Please retry shortly.");
        await live.CreateRoom(m.RoomName);
        var user = await db.Users.FindAsync(Me);
        return Ok(new { url = live.BrowserUrl, roomName = m.RoomName, token = live.Token(Me, user!.DisplayName, new { roomJoin = true, room = m.RoomName, canPublish = true, canSubscribe = true, canPublishData = false }) });
    }
    private void Retire(Meeting m)
    {
        // Self-hosted LiveKit does not revoke old JWTs on RemoveParticipant. Rotate the
        // media room, delete the old one, and require room.auto_create=false on LiveKit.
        db.RetiredRooms.Add(new RetiredRoom { Name = m.RoomName });
        m.RoomName = "chat-" + Guid.NewGuid().ToString("N");
    }
    private async Task<bool> Cleanup()
    {
        foreach (var room in await db.RetiredRooms.ToListAsync())
        {
            try { await live.DeleteRoom(room.Name); }
            catch (ApiException) { return false; }
            db.Remove(room); await db.SaveChangesAsync();
        }
        return true;
    }
}
