# YouTube Video Downloader with Holyrics Integration

This project consists of two main components:
1. A Node.js application that provides YouTube video downloading capabilities with Telegram bot integration
2. A .NET Windows Service (Holyrics Monitor) that provides an HTTP endpoint to monitor and control the Holyrics application

## Features

### Node.js Application
- Download YouTube videos through a Telegram bot
- Convert videos to MP3 format
- Automatic integration with Holyrics playlist
- Support for both video and audio downloads
- Custom file naming with event dates

### Holyrics Monitor Service
- Windows Service built with .NET
- HTTP API endpoints for Holyrics control
- Integration with the main application for playlist management

## Prerequisites

### For Node.js Application
- Node.js (Latest LTS version recommended)
- FFmpeg (for audio conversion)
- Telegram Bot Token (from BotFather)
- YouTube Data API key (optional)

### For Holyrics Monitor
- .NET 7.0 SDK or later
- Windows operating system
- Holyrics application installed

## Installation

### Node.js Application

1. Clone the repository:
```bash
git clone https://github.com/daraujo85/ytmp4.git
cd ytmp4
```

2. Install dependencies:
```bash
npm install
```

3. Create a .env file with the following configuration:
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
VIDEO_OUTPUT_DIR=downloads
HOLYRICS_API_URL=http://localhost:8091/api
HOLYRICS_API_TOKEN=your_holyrics_token
HOLYRICS_MONITOR_API=http://localhost:5858/api
```

### Holyrics Monitor Service

1. Navigate to the HolyricsMonitor directory:
```bash
cd HolyricsMonitor
```

2. Build and publish the service:
```bash
dotnet publish -c Release
```

3. Install the Windows Service:
```bash
sc create HolyricsMonitor binPath= "path_to_published_exe"
sc start HolyricsMonitor
```

## Usage

### Telegram Bot Commands

1. Download and add to Holyrics playlist:
```
/addythl [youtube_url] [event_date] [title]
```
Example:
```
/addythl https://www.youtube.com/watch?v=example 20231225 Christmas Song
```

2. Simple video/audio download:
Just send a YouTube URL to the bot and choose the desired format (Video or Audio)

### API Endpoints

The Node.js application exposes the following endpoint:
- POST `/download` - Download a YouTube video

The Holyrics Monitor service provides endpoints for controlling the Holyrics application. Check the swagger documentation at:
```
http://localhost:5858/swagger
```

## Development

### Running the Node.js Application

1. Start in development mode:
```bash
npm run dev
```

2. Start in production mode:
```bash
npm start
```

### Building the Holyrics Monitor

1. For development:
```bash
dotnet build
```

2. For production:
```bash
dotnet publish -c Release
```

## License

This project is licensed under the MIT License - see the LICENSE file for details

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For support, please open an issue in the GitHub repository.