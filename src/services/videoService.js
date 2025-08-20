import youtubeDl from 'youtube-dl-exec';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';
dotenv.config();
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const execAsync = promisify(exec);

class VideoService {
  constructor(config = {}) {
    this.videoOutputDir = config.videoOutputDir || 'downloads';
    this.preferredFormat = config.preferredFormat || 'best';
    this.forceMP4 = config.forceMP4 || false;
    this.holyricsApiUrl = config.holyricsApiUrl || 'http://192.168.31.231:8091/api';
    this.holyricsApiToken = config.holyricsApiToken || 'mGWQsXxrveT3W7HD';
    this.holyricsMonitorApi = config.holyricsMonitorApi || 'http://192.168.31.231:5858/api';
    this.whisperApiUrl = config.whisperApiUrl || process.env.WHISPER_API_URL || 'http://localhost:9000';
  }

  toSnakeCase(str) {
    return str
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, '_')
      .toLowerCase();
  }

  ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
  }

  validateYouTubeUrl(url) {
    if (!url) throw new Error('URL is required');
    if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
      throw new Error('Invalid YouTube URL');
    }
    return true;
  }

  async getVideoInfo(url) {
    const info = await youtubeDl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true
    });

    if (!info) throw new Error('Could not fetch video information');
    return info;
  }

  generateFileName(customTitle, customDate, youtubeTitle) {
    const formattedDate = customDate ? customDate.replace(/[^0-9]/g, '') : '';
    const sanitizedCustomTitle = customTitle ? customTitle.toLowerCase().replace(/[^a-z0-9]/g, '_') : '';
    const sanitizedYoutubeTitle = youtubeTitle ? youtubeTitle.toLowerCase().replace(/[^a-z0-9]/g, '_') : '';
    return [formattedDate, sanitizedCustomTitle, sanitizedYoutubeTitle].filter(Boolean).join('_') + '.mp4';
  }

  verifyDirectoryAccess(outputDir) {
    const testPath = path.join(outputDir, '.write-test');
    try {
      fs.writeFileSync(testPath, '');
      fs.unlinkSync(testPath);
    } catch (error) {
      throw new Error(`Cannot access output directory: ${error.message}`);
    }
  }

  async downloadVideo(url, outputPath) {
    console.log(`Starting download: ${url} -> ${outputPath}`);
    
    const options = {
      output: outputPath,
      noCheckCertificate: true,
      noWarnings: true,
      noCallHome: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true
    };
    
    if (this.forceMP4) {
      options.format = 'best[ext=mp4]/best';
    }
    
    try {
      const result = await youtubeDl.exec(url, options);
      console.log('yt-dlp output:', result);
    } catch (error) {
      console.error('yt-dlp execution failed:', error);
      throw new Error(`Download failed: ${error.message}`);
    }
    
    console.log(`Download completed, checking file existence...`);
    
    // Debug: List all files in the directory
    const dir = path.dirname(outputPath);
    console.log(`Checking directory: ${dir}`);
    
    try {
      const allFiles = fs.readdirSync(dir);
      console.log(`All files in directory:`, allFiles);
    } catch (error) {
      console.error(`Error reading directory: ${error.message}`);
    }
    
    // Check if the exact file exists
    console.log(`Looking for exact file: ${outputPath}`);
    if (fs.existsSync(outputPath)) {
      console.log(`Found exact file: ${outputPath}`);
      return outputPath;
    }
    
    // If not, look for files with different extensions in the same directory
    const baseName = path.basename(outputPath, path.extname(outputPath));
    console.log(`Looking for files with base name: ${baseName}`);
    
    let files;
    try {
      files = fs.readdirSync(dir).filter(file => {
        const fileBaseName = path.basename(file, path.extname(file));
        const matches = fileBaseName === baseName;
        console.log(`Comparing '${fileBaseName}' with '${baseName}': ${matches}`);
        return matches;
      });
      console.log(`Found matching files:`, files);
    } catch (error) {
      console.error(`Error filtering files: ${error.message}`);
      throw new Error('Downloaded file not found - directory read error');
    }
    
    if (files.length > 0) {
      const actualFile = path.join(dir, files[0]);
      console.log(`Found file with different name: ${actualFile}`);
      
      // Rename to expected extension if needed
      if (actualFile !== outputPath) {
        console.log(`Renaming ${actualFile} to ${outputPath}`);
        try {
          fs.renameSync(actualFile, outputPath);
          console.log(`Successfully renamed file`);
        } catch (error) {
          console.error(`Error renaming file: ${error.message}`);
          return actualFile; // Return the original file if rename fails
        }
      }
      return outputPath;
    }
    
    // Additional check: look for any files that might contain part of the expected name
    console.log(`No exact matches found. Looking for partial matches...`);
    try {
      const partialMatches = fs.readdirSync(dir).filter(file => {
        const lowerFile = file.toLowerCase();
        const lowerBase = baseName.toLowerCase();
        return lowerFile.includes(lowerBase.substring(0, Math.min(20, lowerBase.length)));
      });
      console.log(`Partial matches found:`, partialMatches);
      
      if (partialMatches.length > 0) {
        const partialFile = path.join(dir, partialMatches[0]);
        console.log(`Using partial match: ${partialFile}`);
        
        // Try to rename to expected name
        try {
          fs.renameSync(partialFile, outputPath);
          console.log(`Successfully renamed partial match`);
          return outputPath;
        } catch (error) {
          console.error(`Error renaming partial match: ${error.message}`);
          return partialFile;
        }
      }
    } catch (error) {
      console.error(`Error looking for partial matches: ${error.message}`);
    }
    
    throw new Error('Downloaded file not found');
  }

  async downloadVideoWithRetry(url, outputPath, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.downloadVideo(url, outputPath);
      } catch (error) {
        console.log(`Download attempt ${attempt} failed: ${error.message}`);
        if (attempt === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
      }
    }
  }

  async processVideo(url, eventDate = '', customTitle = '') {
    this.validateYouTubeUrl(url);
    const videoInfo = await this.getVideoInfo(url);
    const youtubeTitle = videoInfo.title ? this.toSnakeCase(videoInfo.title) : '';
    const sanitizedCustomTitle = customTitle ? this.toSnakeCase(customTitle) : '';
    const sanitizedDate = eventDate ? this.toSnakeCase(eventDate) : '';

    const fileName = this.generateFileName(sanitizedCustomTitle, sanitizedDate, youtubeTitle);
    this.ensureDirectoryExists(this.videoOutputDir);
    this.verifyDirectoryAccess(this.videoOutputDir);

    const outputPath = path.join(this.videoOutputDir, fileName);
    await this.downloadVideoWithRetry(url, outputPath); // Usando a versão com retry
    await this.addToHolyricsPlaylist?.(fileName);

    return {
      fileName,
      outputPath,
      videoInfo
    };
  }

  async convertToMp3(inputPath, outputPath, lowQuality = false, bitrate = null) {
    const command = lowQuality 
      ? `ffmpeg -i "${inputPath}" -vn -ar 44100 -ac 2 -b:a ${bitrate || '128k'} "${outputPath}"` 
      : `ffmpeg -i "${inputPath}" -vn -ar 44100 -ac 2 -b:a ${bitrate || '192k'} "${outputPath}"`;
    
    try {
      await execAsync(command);
      console.log(`Audio converted successfully: ${outputPath}`);
    } catch (error) {
      console.error(`Error converting to MP3: ${error.message}`);
      throw error;
    }
  }

  async splitAudioFile(inputPath, chunkDuration = 300) {
    const dir = path.dirname(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputPattern = path.join(dir, `${baseName}-part-%03d.mp3`);
    const command = `ffmpeg -i "${inputPath}" -f segment -segment_time ${chunkDuration} -c copy "${outputPattern}"`;
    await execAsync(command);

    return fs.readdirSync(dir)
      .filter(f => f.startsWith(`${baseName}-part-`) && f.endsWith('.mp3'))
      .map(f => path.join(dir, f))
      .sort();
  }

  async transcribeAudio(filePath) {
    const useLocal = process.env.USE_LOCAL_WHISPER === 'true';
    return useLocal
      ? await this.transcribeWithLocalWhisper(filePath)
      : (await openai.audio.transcriptions.create({
          file: fs.createReadStream(filePath),
          model: 'whisper-1',
          language: 'pt'
        }))?.text?.trim();
  }

  async transcribeWithLocalWhisper(filePath) {
    try {
      const response = await axios.post('http://localhost:8000/transcribe', {
        file_path: filePath
      });
      return response.data;
    } catch (error) {
      console.error('Error with local Whisper API:', error.message);
      throw error;
    }
  }

  async splitVideo(inputPath, outputDir, maxSizeMB = 45) {
    const stats = fs.statSync(inputPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    if (fileSizeMB <= maxSizeMB) {
      return [inputPath]; // Não precisa dividir
    }
    
    // Calcular número de partes necessárias
    const numParts = Math.ceil(fileSizeMB / maxSizeMB);
    const videoDuration = await this.getVideoDuration(inputPath);
    const partDuration = Math.floor(videoDuration / numParts);
    
    const parts = [];
    
    for (let i = 0; i < numParts; i++) {
      const startTime = i * partDuration;
      const endTime = i === numParts - 1 ? videoDuration : (i + 1) * partDuration;
      const outputPath = path.join(outputDir, `part_${i + 1}_${path.basename(inputPath)}`);
      
      // Usar ffmpeg para dividir o vídeo
      const ffmpeg = require('fluent-ffmpeg');
      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .seekInput(startTime)
          .duration(endTime - startTime)
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
      
      parts.push(outputPath);
    }
    
    return parts;
  }

  async getVideoDuration(videoPath) {
    const ffprobe = require('ffprobe-static');
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg.setFfprobePath(ffprobe.path);
    
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration);
      });
    });
  }

  async convertToMp4(inputPath, outputPath, quality = 'medium') {
    let qualitySettings;
    
    switch (quality) {
      case 'low':
        qualitySettings = '-crf 28 -preset fast -vf scale=640:360';
        break;
      case 'medium':
        qualitySettings = '-crf 23 -preset medium -vf scale=1280:720';
        break;
      case 'high':
        qualitySettings = '-crf 18 -preset slow -vf scale=1920:1080';
        break;
      default:
        qualitySettings = '-crf 23 -preset medium';
    }
    
    const command = `ffmpeg -i "${inputPath}" ${qualitySettings} -c:a aac -b:a 128k "${outputPath}"`;
    
    try {
      await execAsync(command);
      console.log(`Video converted successfully to ${quality} quality: ${outputPath}`);
    } catch (error) {
      console.error(`Error converting to MP4 ${quality}: ${error.message}`);
      throw error;
    }
  }
}

export default VideoService;