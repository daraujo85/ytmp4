import { config } from 'dotenv';
import express from 'express';
import cors from 'cors';
import VideoService from './src/services/videoService.js';
import TelegramBotService from './src/services/telegram-bot.js';

config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize VideoService with configuration from environment variables
const videoService = new VideoService({
  videoOutputDir: process.env.VIDEO_OUTPUT_DIR || 'downloads',
  holyricsApiUrl: process.env.HOLYRICS_API_URL,
  holyricsApiToken: process.env.HOLYRICS_API_TOKEN,
  holyricsMonitorApi: process.env.HOLYRICS_MONITOR_API || 'http://localhost:5858/api'
});

// Initialize Telegram Bot Service
let telegramBot;
try {
  telegramBot = new TelegramBotService({
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN
  });
  console.log('Telegram bot initialized successfully');
} catch (error) {
  console.error('Failed to initialize Telegram bot:', error);
}

// API endpoint for video processing
app.post('/download', async (req, res) => {
  const { url, eventDate, title } = req.body;

  try {
    const result = await videoService.processVideo(url, eventDate, title);
    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    console.error('Error processing video:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Start the server
const port = process.env.PORT || 3000;
const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Graceful shutdown handling
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown(signal) {
  console.log(`${signal} received. Starting graceful shutdown...`);

  // Close the Express server
  server.close(() => {
    console.log('HTTP server closed');
  });

  // Cleanup Telegram bot if it was initialized
  if (telegramBot) {
    try {
      await telegramBot.cleanup();
      console.log('Telegram bot cleaned up');
    } catch (error) {
      console.error('Error cleaning up Telegram bot:', error);
    }
  }

  // Give processes a chance to cleanup before forcing exit
  setTimeout(() => {
    console.log('Forcing process exit...');
    process.exit(1);
  }, 5000);
}