using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace WebApplication2.Data;

public class AppUser : IdentityUser
{
    public string DisplayName { get; set; } = "";
}
public class Conversation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = "";
    public string Kind { get; set; } = "group";
    public string OwnerId { get; set; } = "";
    public string? DirectKey { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<Membership> Members { get; set; } = [];
}
public class Membership
{
    public Guid ConversationId { get; set; }
    public Conversation Conversation { get; set; } = null!;
    public string UserId { get; set; } = "";
    public AppUser User { get; set; } = null!;
    public long LastReadId { get; set; }
}
public class ChatMessage
{
    public long Id { get; set; }
    public Guid ConversationId { get; set; }
    public Conversation Conversation { get; set; } = null!;
    public string SenderId { get; set; } = "";
    public AppUser Sender { get; set; } = null!;
    public Guid RequestId { get; set; }
    public string Text { get; set; } = "";
    public DateTime SentAt { get; set; } = DateTime.UtcNow;
    public Attachment? Attachment { get; set; }
}
public class Attachment
{
    public long MessageId { get; set; }
    public ChatMessage Message { get; set; } = null!;
    public string Name { get; set; } = "";
    public byte[] Bytes { get; set; } = [];
}
public class Meeting
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId { get; set; }
    public Conversation Conversation { get; set; } = null!;
    public string HostId { get; set; } = "";
    public string Title { get; set; } = "";
    public bool Video { get; set; }
    public bool Locked { get; set; }
    public bool Ended { get; set; }
    public string RoomName { get; set; } = "chat-" + Guid.NewGuid().ToString("N");
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public List<Admission> Admissions { get; set; } = [];
}
public class Admission
{
    public Guid MeetingId { get; set; }
    public Meeting Meeting { get; set; } = null!;
    public string UserId { get; set; } = "";
    public AppUser User { get; set; } = null!;
    public string Status { get; set; } = "pending";
}
public class RetiredRoom
{
    public string Name { get; set; } = "";
}
public class ChatDbContext(DbContextOptions<ChatDbContext> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<Membership> Memberships => Set<Membership>();
    public DbSet<ChatMessage> Messages => Set<ChatMessage>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<Meeting> Meetings => Set<Meeting>();
    public DbSet<Admission> Admissions => Set<Admission>();
    public DbSet<RetiredRoom> RetiredRooms => Set<RetiredRoom>();
    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        b.HasDefaultSchema("together");
        b.Entity<AppUser>().Property(x => x.DisplayName).HasMaxLength(60);
        b.Entity<Conversation>().Property(x => x.Name).HasMaxLength(80);
        b.Entity<Conversation>().Property(x => x.OwnerId).HasMaxLength(450);
        b.Entity<Conversation>().Property(x => x.Kind).HasMaxLength(10);
        b.Entity<Conversation>().Property(x => x.DirectKey).HasMaxLength(100);
        b.Entity<Conversation>().HasIndex(x => x.DirectKey).IsUnique().HasFilter("[DirectKey] IS NOT NULL");
        b.Entity<Membership>().HasKey(x => new { x.ConversationId, x.UserId });
        b.Entity<Membership>().HasOne(x => x.User).WithMany().OnDelete(DeleteBehavior.NoAction);
        b.Entity<ChatMessage>().Property(x => x.Text).HasMaxLength(4000);
        b.Entity<ChatMessage>().HasOne(x => x.Sender).WithMany().OnDelete(DeleteBehavior.NoAction);
        b.Entity<ChatMessage>().HasIndex(x => new { x.SenderId, x.RequestId }).IsUnique();
        b.Entity<ChatMessage>().HasIndex(x => new { x.ConversationId, x.Id });
        b.Entity<Attachment>().HasKey(x => x.MessageId);
        b.Entity<Attachment>().Property(x => x.Name).HasMaxLength(180);
        b.Entity<Attachment>().HasOne(x => x.Message).WithOne(x => x.Attachment).HasForeignKey<Attachment>(x => x.MessageId);
        b.Entity<Meeting>().Property(x => x.Title).HasMaxLength(100);
        b.Entity<Meeting>().Property(x => x.HostId).HasMaxLength(450);
        b.Entity<Meeting>().Property(x => x.RoomName).HasMaxLength(80);
        b.Entity<Admission>().HasKey(x => new { x.MeetingId, x.UserId });
        b.Entity<Admission>().Property(x => x.Status).HasMaxLength(12);
        b.Entity<Admission>().HasOne(x => x.User).WithMany().OnDelete(DeleteBehavior.NoAction);
        b.Entity<RetiredRoom>().HasKey(x => x.Name);
        b.Entity<RetiredRoom>().Property(x => x.Name).HasMaxLength(80);
        b.Entity<Conversation>().HasData(new Conversation { Id = Guid.Parse("10000000-0000-0000-0000-000000000001"), Name = "Everyone", Kind = "public", OwnerId = "", CreatedAt = new DateTime(2026, 10, 1, 0, 0, 0, DateTimeKind.Utc) });
    }
}
