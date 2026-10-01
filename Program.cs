using WebApplication2.Hubs;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllersWithViews();
builder.Services.AddSignalR(options => options.MaximumReceiveMessageSize = 3 * 1024 * 1024);
var app = builder.Build();
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}
app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.MapControllerRoute(name: "default", pattern: "{controller=Home}/{action=Index}/{id?}");
app.MapHub<ChatHub>("/chathub", options =>
{
    options.ApplicationMaxBufferSize = 4 * 1024 * 1024;
    options.TransportMaxBufferSize = 4 * 1024 * 1024;
});
app.Run();
