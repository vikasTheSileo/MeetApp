using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.ComponentModel.DataAnnotations;
using WebApplication2.Data;

namespace WebApplication2.Controllers;
public class Credentials
{
    [Required, RegularExpression(@"^[a-zA-Z0-9_.-]{3,40}$", ErrorMessage = "Use 3–40 letters, numbers, dots, hyphens or underscores.")]
    public string Username { get; set; } = "";
    [Required, StringLength(128, MinimumLength = 10)]
    public string Password { get; set; } = "";
    [StringLength(60)] public string? DisplayName { get; set; }
    public string? ReturnUrl { get; set; }
}
[AutoValidateAntiforgeryToken]
public class AccountController(UserManager<AppUser> users, SignInManager<AppUser> signIn, IConfiguration config) : Controller
{
    [HttpGet] public IActionResult Login(string? returnUrl) => View(new Credentials { ReturnUrl = Url.IsLocalUrl(returnUrl) ? returnUrl : "/" });
    [HttpGet] public IActionResult Register(string? returnUrl) => config.GetValue<bool>("RegistrationEnabled") ? View(new Credentials { ReturnUrl = returnUrl }) : NotFound();
    [HttpPost, EnableRateLimiting("auth")]
    public async Task<IActionResult> Login(Credentials input)
    {
        if (ModelState.IsValid)
        {
            var result = await signIn.PasswordSignInAsync(input.Username, input.Password, false, true);
            if (result.Succeeded) return LocalRedirect(Url.IsLocalUrl(input.ReturnUrl) ? input.ReturnUrl! : "/");
            ModelState.AddModelError("", "Sign in failed. Check your details or try again later if the account is locked.");
        }
        return View(input);
    }
    [HttpPost, EnableRateLimiting("auth")]
    public async Task<IActionResult> Register(Credentials input)
    {
        if (!config.GetValue<bool>("RegistrationEnabled")) return NotFound();
        if (ModelState.IsValid)
        {
            var name = (input.DisplayName ?? input.Username).Trim();
            if (name.Length < 2 || name.Any(char.IsControl)) ModelState.AddModelError("", "Choose a display name of 2–60 characters.");
            else
            {
                var user = new AppUser { UserName = input.Username, DisplayName = name };
                var result = await users.CreateAsync(user, input.Password);
                if (result.Succeeded)
                {
                    await signIn.SignInAsync(user, false);
                    return LocalRedirect(Url.IsLocalUrl(input.ReturnUrl) ? input.ReturnUrl! : "/");
                }
                foreach (var error in result.Errors) ModelState.AddModelError("", error.Description);
            }
        }
        return View(input);
    }
    [HttpPost] public async Task<IActionResult> Logout() { await signIn.SignOutAsync(); return RedirectToAction("Login"); }
}
