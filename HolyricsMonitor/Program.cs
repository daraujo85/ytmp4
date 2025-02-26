/*
 * HolyricsMonitor Application
 * 
 * Esta aplicação foi projetada para monitorar e controlar a aplicação Holyrics,
 * fornecendo uma API RESTful para gerenciar vídeos e conteúdo multimídia.
 * 
 * Funcionalidades principais:
 * - Monitoramento contínuo da pasta de mídia do Holyrics
 * - API endpoints para gerenciamento de vídeos
 * - Integração com o sistema Holyrics para controle de mídia
 * - Interface Swagger UI para documentação e teste da API
 */

using HolyricsMonitor.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

var builder = WebApplication.CreateBuilder(args);

// Configure JSON settings
builder.Configuration
    .SetBasePath(Directory.GetCurrentDirectory())
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: true)
    .AddEnvironmentVariables();

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Add HolyricsService as a singleton
builder.Services.AddSingleton<IHolyricsService, HolyricsService>();

// Configure URL and port
builder.WebHost.UseUrls("http://0.0.0.0:5858");

var app = builder.Build();

// Add global exception handler with detailed logging
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = 500;
        context.Response.ContentType = "application/json";
        var error = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
        if (error != null)
        {
            var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
            var exception = error.Error;
            logger.LogError(
                exception,
                "Unhandled exception occurred. Type: {ExceptionType}, Message: {Message}, StackTrace: {StackTrace}",
                exception.GetType().FullName,
                exception.Message,
                exception.StackTrace
            );
            await context.Response.WriteAsJsonAsync(new { error = "An internal error occurred.", details = exception.Message });
        }
    });
});

// Configure the HTTP request pipeline
app.UseSwagger();
app.UseSwaggerUI();

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();