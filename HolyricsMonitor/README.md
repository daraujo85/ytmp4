# Holyrics Monitor Windows Service

A Windows Service built with .NET that provides an HTTP endpoint to monitor and control the Holyrics application.

## Features

- HTTP endpoint to check Holyrics application status
- Ability to start Holyrics if it's not running
- Windows Service integration for automatic startup

## Prerequisites

- .NET 7.0 SDK or later
- Windows operating system
- Holyrics application installed

## Installation

1. Build the solution
```powershell
dotnet build
```

2. Install the Windows Service
```powershell
sc create HolyricsMonitor binPath= "<path-to-executable>\HolyricsMonitor.exe"
sc start HolyricsMonitor
```

## API Endpoints

### GET /api/holyrics/status
Returns the current status of Holyrics application.

### POST /api/holyrics/start
Attempts to start the Holyrics application if it's not running.

## Configuration

Update the `appsettings.json` file to configure:
- HTTP endpoint port
- Holyrics executable path
- Other service settings