using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using WebApplication2.Models;

namespace WebApplication2.Controllers;

public class HomeController(IConfiguration configuration) : Controller
{
    public IActionResult Index() => View();

    [HttpGet]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public IActionResult CallConfiguration() => Json(new
    {
        iceServers = configuration.GetSection("WebRtc:IceServers").GetChildren().Select(server => new
        {
            urls = server.GetSection("Urls").Get<string[]>() ?? Array.Empty<string>(),
            username = server["Username"],
            credential = server["Credential"]
        })
    });

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error() => View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
}
