namespace HolyricsMonitor.Services;

public interface IHolyricsService
{
    Task<bool> IsHolyricsRunningAsync();
    Task<bool> StartHolyricsAsync();
}