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

          // Atualizar o menu de seleção inicial
          await this.bot.sendMessage(chatId, 'Qual formato arquivo OU ação você precisa?', {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🎥 Vídeo', callback_data: `video:${text}` },
                  { text: '🎵 Áudio', callback_data: `audio:${text}` }
                ],
                [
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

        // Verificar se arquivo já existe (sem restrição de data)
        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          const fileSizeMB = stats.size / (1024 * 1024);
          
          // Se o arquivo existe e tem tamanho razoável, reutilizar
          if (fileSizeMB > 0.1) { // Arquivo maior que 100KB
            reuseFile = true;
            await this.bot.sendMessage(chatId, `♻️ Arquivo já existe na pasta downloads. Reutilizando o arquivo.`);
          }
        }

        // Só baixar se não existir arquivo válido
        if (!reuseFile) {
          await this.bot.sendMessage(chatId, `⬇️ Baixando vídeo...`);
          await this.videoService.downloadVideo(url, fullPath);
        }

        if (action === 'video') {
          // Verificar tamanho do arquivo antes de enviar
          const stats = fs.statSync(fullPath);
          const fileSizeMB = stats.size / (1024 * 1024);
          
          if (fileSizeMB > 50) {
            // Função para estimar tamanho baseado na qualidade
            const estimateSize = (originalSizeMB, quality) => {
              const compressionRates = {
                'low': 0.05,   // ~5% do tamanho original (baseado no exemplo: 640MB -> 33MB)
                'medium': 0.15, // ~15% do tamanho original 
                'high': 0.25    // ~25% do tamanho original
              };
              return originalSizeMB * compressionRates[quality];
            };
            
            // Calcular estimativas para cada qualidade
            const lowEstimate = estimateSize(fileSizeMB, 'low');
            const mediumEstimate = estimateSize(fileSizeMB, 'medium');
            const highEstimate = estimateSize(fileSizeMB, 'high');
            
            // Criar botões apenas para qualidades que ficam abaixo de 50MB
            const mp4Buttons = [];
            
            //if (lowEstimate <= 50) {
              mp4Buttons.push({ 
                text: `🎥 MP4 Baixa (~${lowEstimate.toFixed(1)}MB)`, 
                callback_data: `mp4_low:${url}` 
              });
            //}
            
            if (mediumEstimate <= 50) {
              mp4Buttons.push({ 
                text: `🎥 MP4 Média (~${mediumEstimate.toFixed(1)}MB)`, 
                callback_data: `mp4_medium:${url}` 
              });
            }
            
            if (highEstimate <= 50) {
              mp4Buttons.push({ 
                text: `🎥 MP4 Alta (~${highEstimate.toFixed(1)}MB)`, 
                callback_data: `mp4_high:${url}` 
              });
            }
            
            // Criar layout do teclado inline
            const inlineKeyboard = [];
            
            // Adicionar botões MP4 se houver algum viável
            if (mp4Buttons.length > 0) {
              // Dividir em linhas de até 2 botões
              for (let i = 0; i < mp4Buttons.length; i += 2) {
                inlineKeyboard.push(mp4Buttons.slice(i, i + 2));
              }
            }
            
            // Sempre adicionar opções de áudio e divisão
            inlineKeyboard.push([
              { text: '🎵 Converter para Áudio', callback_data: `audio:${url}` },
              { text: '✂️ Dividir Vídeo', callback_data: `split:${url}` }
            ]);
            
            // Adicionar opção de upload
            inlineKeyboard.push([
              { text: '📤 Upload para Drive', callback_data: `upload:${url}` }
            ]);
            
            let messageText = `⚠️ *Arquivo muito grande para envio pelo Telegram*\n\n` +
              `📁 *Tamanho:* ${fileSizeMB.toFixed(2)} MB\n` +
              `📏 *Limite do Telegram:* 50 MB\n\n` +
              `*Opções disponíveis:*\n`;
            
            if (mp4Buttons.length > 0) {
              messageText += `🎥 Converter MP4 (com estimativas de tamanho)\n`;
            } else {
              messageText += `⚠️ Nenhuma qualidade MP4 ficará abaixo de 50MB\n`;
            }
            
            messageText += `🎵 Converter para áudio\n` +
              `✂️ Dividir em partes menores\n` +
              `☁️ Upload para serviço de nuvem`;
            
            await this.bot.sendMessage(chatId, messageText, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: inlineKeyboard
              }
            });
            return;
          }
          
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
          
          // Verificar tamanho do áudio também
          const audioStats = fs.statSync(audioPath);
          const audioSizeMB = audioStats.size / (1024 * 1024);
          
          if (audioSizeMB > 50) {
            await this.bot.sendMessage(chatId, 
              `⚠️ *Arquivo de áudio muito grande*\n\n` +
              `📁 *Tamanho:* ${audioSizeMB.toFixed(2)} MB\n` +
              `📏 *Limite do Telegram:* 50 MB\n\n` +
              `Tentando comprimir o áudio...`, 
              { parse_mode: 'Markdown' }
            );
            
            // Comprimir áudio com qualidade menor
            const compressedPath = audioPath.replace('.mp3', '_compressed.mp3');
            await this.videoService.convertToMp3(fullPath, compressedPath, true, '64k'); // Bitrate menor
            
            const compressedStats = fs.statSync(compressedPath);
            const compressedSizeMB = compressedStats.size / (1024 * 1024);
            
            if (compressedSizeMB <= 50) {
              await this.bot.sendAudio(chatId, compressedPath, {
                caption: `*${videoInfo.title}* (Comprimido)`,
                parse_mode: 'Markdown'
              });
              fs.unlinkSync(compressedPath);
            } else {
              await this.bot.sendMessage(chatId, 
                `❌ Mesmo comprimido, o arquivo ainda é muito grande (${compressedSizeMB.toFixed(2)} MB).\n` +
                `Considere baixar um vídeo mais curto ou usar um serviço de nuvem.`
              );
            }
            return;
          }
          
          await this.bot.sendAudio(chatId, audioPath, {
            caption: `*${videoInfo.title}*`,
            parse_mode: 'Markdown'
          });
        } else if (action.startsWith('mp4_')) {
          const quality = action.split('_')[1]; // low, medium, high
          
          await this.bot.sendMessage(chatId, `🎬 Convertendo vídeo para MP4 qualidade ${quality}...`);
          
          const convertedPath = fullPath.replace('.mp4', `_${quality}.mp4`);
          await this.videoService.convertToMp4(fullPath, convertedPath, quality);
          
          // Verificar tamanho do arquivo convertido
          const convertedStats = fs.statSync(convertedPath);
          const convertedSizeMB = convertedStats.size / (1024 * 1024);
          
          if (convertedSizeMB > 50) {
            await this.bot.sendMessage(chatId, 
              `⚠️ *Arquivo convertido ainda é muito grande*\n\n` +
              `📁 *Tamanho:* ${convertedSizeMB.toFixed(2)} MB\n` +
              `Tente uma qualidade menor ou divida o vídeo.`, 
              { parse_mode: 'Markdown' }
            );
            
            // Oferecer opção de dividir o vídeo convertido
            await this.bot.sendMessage(chatId, 'Deseja dividir o vídeo em partes menores?', {
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: '✂️ Sim, dividir', callback_data: `split_converted:${convertedPath}` },
                    { text: '❌ Cancelar', callback_data: 'cancel' }
                  ]
                ]
              }
            });
            return;
          }
          
          await this.bot.sendVideo(chatId, convertedPath, {
            caption: `*${videoInfo.title}* (${quality.toUpperCase()})`,
            parse_mode: 'Markdown'
          });
          
          // Limpar arquivo convertido
          if (fs.existsSync(convertedPath)) fs.unlinkSync(convertedPath);
        } else if (action === 'split' || action.startsWith('split_')) {
          const pathToSplit = action.startsWith('split_converted:') ? 
            action.replace('split_converted:', '') : fullPath;
          
          await this.bot.sendMessage(chatId, `✂️ Dividindo vídeo em partes menores...`);
          
          const parts = await this.videoService.splitVideo(pathToSplit, path.dirname(pathToSplit));
          
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            await this.bot.sendVideo(chatId, part, {
              caption: `*${videoInfo.title}* - Parte ${i + 1}/${parts.length}`,
              parse_mode: 'Markdown'
            });
            
            // Limpar arquivo da parte após envio
            if (fs.existsSync(part)) fs.unlinkSync(part);
          }
          
          // Limpar arquivo original se foi dividido
          if (action.startsWith('split_converted:') && fs.existsSync(pathToSplit)) {
            fs.unlinkSync(pathToSplit);
          }
        } else if (action === 'upload') {
          await this.bot.sendMessage(chatId, 
            `☁️ *Upload para serviço de nuvem*\n\n` +
            `Esta funcionalidade estará disponível em breve.\n` +
            `Por enquanto, você pode:\n` +
            `• Converter para qualidade menor\n` +
            `• Dividir o vídeo em partes\n` +
            `• Converter apenas para áudio`, 
            { parse_mode: 'Markdown' }
          );
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
