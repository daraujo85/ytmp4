using System.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace HolyricsMonitor.Services;

public class HolyricsService : IHolyricsService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<HolyricsService> _logger;
    private const string PROCESS_NAME = "Holyrics";
    private const int START_TIMEOUT_MS = 30000; // 30 seconds timeout
    private const int STARTUP_CHECK_INTERVAL_MS = 500; // Check every half second

    public HolyricsService(IConfiguration configuration, ILogger<HolyricsService> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<bool> IsHolyricsRunningAsync()
    {
        return await Task.Run(() =>
        {
            var processes = Process.GetProcessesByName(PROCESS_NAME);
            return processes.Length > 0;
        });
    }

    public async Task<bool> StartHolyricsAsync()
    {
        if (await IsHolyricsRunningAsync())
        {
            _logger.LogInformation("Holyrics is already running");
            return true;
        }

        try
        {
            var holyricsPath = _configuration["HolyricsPath"] ?? throw new InvalidOperationException("Holyrics path not configured");
            _logger.LogInformation("Starting Holyrics from path: {Path}", holyricsPath);

            if (!File.Exists(holyricsPath))
            {
                _logger.LogError("Holyrics executable not found at path: {Path}", holyricsPath);
                return false;
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = holyricsPath,
                UseShellExecute = true,
                WorkingDirectory = Path.GetDirectoryName(holyricsPath)
            };

            using var process = Process.Start(startInfo);
            if (process == null)
            {
                _logger.LogError("Failed to start Holyrics process");
                return false;
            }

            // Wait for the process to start and respond
            _logger.LogInformation("Waiting for Holyrics process to initialize...");
            var startTime = DateTime.Now;
            var success = false;

            while (DateTime.Now - startTime <= TimeSpan.FromMilliseconds(START_TIMEOUT_MS))
            {
                if (await IsHolyricsRunningAsync())
                {
                    success = true;
                    break;
                }
                _logger.LogInformation("Waiting for Holyrics to start... Time elapsed: {0} seconds", 
                    (DateTime.Now - startTime).TotalSeconds);
                await Task.Delay(STARTUP_CHECK_INTERVAL_MS);
            }

            if (!success)
            {
                _logger.LogError("Timeout waiting for Holyrics to start after {0} seconds", 
                    TimeSpan.FromMilliseconds(START_TIMEOUT_MS).TotalSeconds);
                return false;
            }

            _logger.LogInformation("Holyrics started successfully");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error starting Holyrics");
            return false;
        }
    }
}