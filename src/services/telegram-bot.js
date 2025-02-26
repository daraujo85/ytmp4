import TelegramBot from 'node-telegram-bot-api';
import VideoService from './videoService.js';
import fs from 'fs';

class TelegramBotService {
    constructor(config) {
        this.token = config.telegramBotToken;
        this.bot = new TelegramBot(this.token, { polling: true });
        this.videoService = new VideoService(config);
        this.initializeHandlers();
    }

    initializeHandlers() {
        // Handle /addythl command
        this.bot.onText(/\/addythl (.+)/, async (msg, match) => {
            const chatId = msg.chat.id;
            try {
                const params = match[1].split(' ');
                if (params.length < 3) {
                    throw new Error('Invalid parameters. Usage: /addythl url eventDate title');
                }

                const [url, eventDate, ...titleParts] = params;
                const title = titleParts.join(' ');

                // Validate YouTube URL
                this.videoService.validateYouTubeUrl(url);

                // Get video info
                const videoInfo = await this.videoService.getVideoInfo(url);

                // Generate filename and download video
                const fileName = this.videoService.generateFileName(title, eventDate, videoInfo.title);
                const outputPath = this.videoService.ensureDirectoryExists(this.videoService.videoOutputDir);
                const fullPath = `${outputPath}/${fileName}`;

                await this.bot.sendMessage(chatId, 'Starting video download...');
                await this.videoService.downloadVideo(url, fullPath);

                // Add to Holyrics
                await this.videoService.addToHolyricsPlaylist(fileName);

                await this.bot.sendMessage(chatId, `✅ *Video successfully downloaded and added to Holyrics!*\n\n🎥 *Title:* ${title}\n📅 *Date:* ${eventDate}\n📁 *File:* ${fileName}`, {
                    parse_mode: 'Markdown'
                });
            } catch (error) {
                await this.bot.sendMessage(chatId, `Error: ${error.message}`);
            }
        });

        // Handle YouTube URLs in regular messages
        this.bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text;
            const messageId = msg.message_id;

            // Skip if message is a command or doesn't contain text
            if (!text || text.startsWith('/')) return;

            // Store last processed message info
            if (!this.lastProcessedMessage) {
                this.lastProcessedMessage = { text: '', messageId: 0 };
            }

            try {
                // Check if message contains a YouTube URL and hasn't been processed
                if ((text.includes('youtube.com/') || text.includes('youtu.be/')) && 
                    (this.lastProcessedMessage.text !== text || this.lastProcessedMessage.messageId !== messageId)) {
                    
                    // Update last processed message
                    this.lastProcessedMessage.text = text;
                    this.lastProcessedMessage.messageId = messageId;

                    // Validate YouTube URL
                    this.videoService.validateYouTubeUrl(text);

                    // Send format selection buttons
                    await this.bot.sendMessage(chatId, 'Qual formato você precisa?', {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '🎥 Vídeo', callback_data: `video:${text}` },
                                    { text: '🎵 Áudio', callback_data: `audio:${text}` }
                                ]
                            ]
                        }
                    });
                    return;
                }
            } catch (error) {
                await this.bot.sendMessage(chatId, `Error: ${error.message}`);
                console.log(`Error: ${error.message}`)
            }
        });

        // Handle callback queries from inline buttons
        this.processedCallbacks = new Set();

        this.bot.on('callback_query', async (query) => {
            const chatId = query.message.chat.id;
            const [format, ...urlParts] = query.data.split(':');
            const url = urlParts.join(':');
            const callbackId = `${query.id}_${format}`;

            if (this.processedCallbacks.has(callbackId)) {
                return;
            }

            this.processedCallbacks.add(callbackId);

            try {
                // Remove the inline keyboard
                try {
                    await this.bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                        chat_id: chatId,
                        message_id: query.message.message_id
                    });
                } catch (keyboardError) {
                    // Ignore the "message is not modified" error
                    if (!keyboardError.message.includes('message is not modified')) {
                        throw keyboardError;
                    }
                }

                // Get video info
                const videoInfo = await this.videoService.getVideoInfo(url);
                const fileName = this.videoService.generateFileName('', '', videoInfo.title);
                const outputPath = this.videoService.ensureDirectoryExists(this.videoService.videoOutputDir);
                const fullPath = `${outputPath}/${fileName}`;

                if (format === 'video') {
                    await this.bot.sendMessage(chatId, '⬇️ Iniciando o download do vídeo 📺. Vá tomar um ☕ porque pode demorar ⏳...');
                    await this.videoService.downloadVideo(url, fullPath);

                    // Send the video file
                    await this.bot.sendVideo(chatId, fullPath, {
                        caption: `*${videoInfo.title}*`,
                        parse_mode: 'Markdown'
                    });
                } else if (format === 'audio') {
                    await this.bot.sendMessage(chatId, '⬇️ Iniciando o download e conversão para áudio 🎵. Vá tomar um ☕ porque pode demorar ⏳...');
                    await this.videoService.downloadVideo(url, fullPath);

                    // Convert to MP3
                    const audioPath = fullPath.replace('.mp4', '.mp3');
                    await this.videoService.convertToMp3(fullPath, audioPath);

                    // Send the audio file
                    await this.bot.sendAudio(chatId, audioPath, {
                        caption: `*${videoInfo.title}*`,
                        parse_mode: 'Markdown',
                        title: videoInfo.title
                    });

                    // Add 3 second delay before deleting audio file
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    // Delete the audio file
                    fs.unlinkSync(audioPath);
                }

                // Delete the video file
                try {
                    // Add 3 second delay before deleting audio file
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                        console.log(`Deleted file: ${fullPath}`);
                    }
                } catch (deleteError) {
                    console.error(`Error deleting file ${fullPath}:`, deleteError);
                }

                setTimeout(() => {
                    this.processedCallbacks.delete(callbackId);
                }, 5 * 60 * 1000);

            } catch (error) {
                await this.bot.sendMessage(chatId, `Error: ${error.message}`);
                console.log(`Error: ${error.message}`);
            }
        });
        
        // Handle errors
        this.bot.on('error', (error) => {
            console.error('Telegram Bot Error:', error);
        });

        // Handle polling errors
        this.bot.on('polling_error', (error) => {
            console.error('Telegram Bot Polling Error:', error);
        });
    }
}

export default TelegramBotService;