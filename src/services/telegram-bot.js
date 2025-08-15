import dotenv from 'dotenv';
dotenv.config();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
import TelegramBot from 'node-telegram-bot-api';
import VideoService from './videoService.js';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

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
        let reuseFile = false;

        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          const fileDate = new Date(stats.birthtime);
          const today = new Date();

          reuseFile =
            fileDate.getFullYear() === today.getFullYear() &&
            fileDate.getMonth() === today.getMonth() &&
            fileDate.getDate() === today.getDate();
        }

        if (reuseFile) {
          await this.bot.sendMessage(chatId, `♻️ Vídeo já foi baixado hoje. Reutilizando o arquivo.`);
        } else {
          await this.bot.sendMessage(chatId, `⬇️ Baixando vídeo...`);
          await this.videoService.downloadVideo(url, fullPath);
        }

        // Add to Holyrics
        //await this.videoService.addToHolyricsPlaylist(fileName);

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
          await this.bot.sendMessage(chatId, 'Qual formato arquivo OU ação você precisa?', {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🎥 Vídeo', callback_data: `video:${text}` },
                  { text: '🎵 Áudio', callback_data: `audio:${text}` },
                  { text: '📝 Transcrição', callback_data: `transcrever:${text}` },
                  { text: '🧠 Resumo', callback_data: `resumir:${text}` }
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
      const [action, ...urlParts] = query.data.split(':');
      const url = urlParts.join(':');
      const callbackId = `${query.id}_${action}`;

      if (this.processedCallbacks.has(callbackId)) return;
      this.processedCallbacks.add(callbackId);

      try {
        // Remove o teclado inline (ignora erro de "message is not modified")
        try {
          await this.bot.sendMessage(chatId, `👉 ${action.toUpperCase()}`);
          await this.bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
            chat_id: chatId,
            message_id: query.message.message_id
          });
        } catch (err) {
          if (!err.message.includes('message is not modified')) throw err;
        }

        // Fluxo de transcrição/resumo com IA
        if (['transcrever', 'resumir'].includes(action)) {
          const videoInfo = await this.videoService.getVideoInfo(url);
          const fileName = this.videoService.generateFileName('', '', videoInfo.title);
          const outputDir = this.videoService.ensureDirectoryExists(this.videoService.videoOutputDir);
          const fullPath = path.join(outputDir, fileName);

          await this.bot.sendMessage(chatId, `🎬 Baixando o vídeo para processar...`);
          let reuseFile = false;

          if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            const fileDate = new Date(stats.birthtime);
            const today = new Date();

            reuseFile =
              fileDate.getFullYear() === today.getFullYear() &&
              fileDate.getMonth() === today.getMonth() &&
              fileDate.getDate() === today.getDate();
          }

          if (reuseFile) {
            await this.bot.sendMessage(chatId, `♻️ Vídeo já foi baixado hoje. Reutilizando o arquivo.`);
          } else {
            await this.videoService.downloadVideo(url, fullPath);
          }


          await this.bot.sendMessage(chatId, `❓ Deseja analisar o vídeo inteiro ou apenas um trecho específico?`, {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📺 Vídeo inteiro', callback_data: `full_${action}:${fileName}` },
                  { text: '✂️ Trecho específico', callback_data: `partial_${action}:${fileName}` }
                ]
              ]
            }
          });

          // Armazena info para uso posterior
          this.tempVideoCache = this.tempVideoCache || {};
          this.tempVideoCache[chatId] = { url, fileName, action, videoInfo, fullPath };
          return;
        }

        // Segunda etapa: escolha do escopo
        if (['full_resumir', 'partial_resumir', 'full_transcrever', 'partial_transcrever'].includes(action)) {
          const [scope, realAction] = action.split('_');
          const { url, fileName, videoInfo, fullPath } = this.tempVideoCache?.[chatId] || {};

          if (!fileName || !fs.existsSync(fullPath)) {
            return this.bot.sendMessage(chatId, `❌ Arquivo temporário não encontrado. Tente novamente.`);
          }

          let prompt = 'analisar o vídeo inteiro.';

          if (scope === 'partial') {
            await this.bot.sendMessage(chatId, `✍️ Digite abaixo o trecho que deseja ${realAction} (ex: "do minuto 3 ao 5, onde ele fala da guerra")`);
            this.bot.once('message', async (msg) => {
              prompt = msg.text;

              await this.handleSecretAndSendIA(chatId, realAction, url, fileName, videoInfo, fullPath, prompt);
            });
          } else {
            await this.handleSecretAndSendIA(chatId, realAction, url, fileName, videoInfo, fullPath, prompt);
          }
          return;
        }


        // Fluxo de vídeo ou áudio
        const videoInfo = await this.videoService.getVideoInfo(url);
        const fileName = this.videoService.generateFileName('', '', videoInfo.title);
        const outputDir = this.videoService.ensureDirectoryExists(this.videoService.videoOutputDir);
        const fullPath = path.join(outputDir, fileName);
        let reuseFile = false;

        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          const fileDate = new Date(stats.birthtime);
          const today = new Date();

          reuseFile =
            fileDate.getFullYear() === today.getFullYear() &&
            fileDate.getMonth() === today.getMonth() &&
            fileDate.getDate() === today.getDate();
        }

        if (reuseFile) {
          await this.bot.sendMessage(chatId, `♻️ Vídeo já foi baixado hoje. Reutilizando o arquivo.`);
        } else {
          let reuseFile = false;

          if (fs.existsSync(fullPath)) {
            const stats = fs.statSync(fullPath);
            const fileDate = new Date(stats.birthtime);
            const today = new Date();

            reuseFile =
              fileDate.getFullYear() === today.getFullYear() &&
              fileDate.getMonth() === today.getMonth() &&
              fileDate.getDate() === today.getDate();
          }

          if (reuseFile) {
            await this.bot.sendMessage(chatId, `♻️ Vídeo já foi baixado hoje. Reutilizando o arquivo.`);
          } else {
            await this.bot.sendMessage(chatId, `⬇️ Baixando vídeo...`);
            await this.videoService.downloadVideo(url, fullPath);
          }

        }

        if (action === 'video') {
          await this.bot.sendVideo(chatId, fullPath, {
            caption: `*${videoInfo.title}*`,
            parse_mode: 'Markdown'
          });
        } else if (action === 'audio') {
          const audioPath = fullPath.replace('.mp4', '.mp3');
          if (!fs.existsSync(audioPath)) {
            await this.bot.sendMessage(chatId, `🎧 Convertendo vídeo em áudio...`);
            await this.videoService.convertToMp3(fullPath, audioPath, true);
          }          
          await this.bot.sendAudio(chatId, fullPath, {
            caption: `*${videoInfo.title}*`,
            parse_mode: 'Markdown'
          });
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

        setTimeout(() => {
          this.processedCallbacks.delete(callbackId);
        }, 5 * 60 * 1000);

      } catch (err) {
        await this.bot.sendMessage(chatId, `❌ Erro: ${err.message}`);
        console.error(err);
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
  async handleSecretAndSendIA(chatId, action, url, fileName, videoInfo, fullPath, promptText) {
    await this.bot.sendMessage(chatId, `🔐 Envie a palavra secreta para autorizar o uso de IA:`);
  
    this.bot.once('message', async (msg) => {
      const usageSecret = process.env.OPENAI_USAGE_SECRET?.toLowerCase();
      if (!msg.text || msg.text.toLowerCase().trim() !== usageSecret) {
        await this.bot.sendMessage(chatId, `❌ Palavra secreta incorreta. Operação cancelada.`);
        return;
      }
  
      await this.bot.sendMessage(chatId, `✍️ Enviando para a IA...`);
  
      try {
        const audioPath = fullPath.replace('.mp4', '.mp3');
        if (!fs.existsSync(audioPath)) {
          await this.bot.sendMessage(chatId, `🎧 Convertendo vídeo em áudio para transcrição...`);
          await this.videoService.convertToMp3(fullPath, audioPath, true);
        }
  
        const stat = fs.statSync(audioPath);
        const maxSize = 24 * 1024 * 1024;
        let transcript = '';
  
        if (stat.size > maxSize) {
          await this.bot.sendMessage(chatId, `🔀 Arquivo grande. Dividindo o áudio para transcrição...`);
          const parts = await this.videoService.splitAudioFile(audioPath, 240); // 4 min
  
          for (let i = 0; i < parts.length; i++) {
            await this.bot.sendMessage(chatId, `🎙️ Transcrevendo parte ${i + 1} de ${parts.length}...`);
            const partTranscription = await this.videoService.transcribeAudio(parts[i]);
            if (!partTranscription) {
              continue; // Skip to next iteration
            }
            transcript += `\n[Parte ${i + 1}]\n${partTranscription.text.trim()}\n`;
            fs.unlinkSync(parts[i]);
          }
        } else {
          await this.bot.sendMessage(chatId, `🧠 Transcrevendo com Whisper...`);
          const transcription = await this.videoService.transcribeAudio(parts[i]);
          transcript = transcription?.text?.trim();
        }
  
        const promptFinal = `Título: ${videoInfo.title}\nTranscrição: ${transcript}\nAção solicitada: ${action}\nTrecho: ${promptText}`;
        const systemPrompt = action === 'resumir'
          ? `Você é um assistente que resume vídeos com base na transcrição e descrição fornecida.`
          : `Você é um transcritor que extrai exatamente o trecho descrito a partir da transcrição.`;
  
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: promptFinal }
          ],
          temperature: 0.4,
        });
  
        const result = completion.choices[0]?.message?.content?.trim();
        const isTooBig = result.length > 4000;
  
        if (isTooBig) {
          const pdfPath = path.join(path.dirname(fullPath), `${fileName}.${action}.pdf`);
          const doc = new PDFDocument();
          doc.pipe(fs.createWriteStream(pdfPath));
          doc.fontSize(16).text(`[${videoInfo.title}]`, { underline: true });
          doc.moveDown();
          doc.fontSize(12).text(result);
          doc.moveDown();
          doc.fontSize(10).fillColor('blue').text(url);
          doc.end();
  
          await this.bot.sendDocument(chatId, pdfPath, {
            caption: `📄 ${action.charAt(0).toUpperCase() + action.slice(1)} gerado com sucesso! ✅`,
          });
        } else {
          await this.bot.sendMessage(chatId, `✅ *${action.charAt(0).toUpperCase() + action.slice(1)}:*\n\n${result}`, {
            parse_mode: 'Markdown'
          });
        }
  
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      } catch (err) {
        await this.bot.sendMessage(chatId, `❌ Erro ao processar ${action}: ${err.message}`);
      } finally {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      }
    });
  }  

}

export default TelegramBotService;
