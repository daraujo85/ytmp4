using Microsoft.AspNetCore.Mvc;
using HolyricsMonitor.Services;

namespace HolyricsMonitor.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HolyricsController : ControllerBase
{
    private readonly IHolyricsService _holyricsService;

    public HolyricsController(IHolyricsService holyricsService)
    {
        _holyricsService = holyricsService;
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var isRunning = await _holyricsService.IsHolyricsRunningAsync();
        return Ok(new { isRunning });
    }

    [HttpGet("start")]
    public async Task<IActionResult> Start()
    {
        var started = await _holyricsService.StartHolyricsAsync();
        if (started)
            return Ok(new { status = started });
        return BadRequest(new { message = "Failed to start Holyrics" });
    }
}