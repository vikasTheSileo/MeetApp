using System.Diagnostics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using WebApplication2.Models;
namespace WebApplication2.Controllers;
public class HomeController : Controller
{
    [Authorize] public IActionResult Index() => View();
    [Authorize, HttpGet("/meeting/{id:guid}")] public IActionResult Meeting(Guid id) => View("Index");
    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error() => View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
}
