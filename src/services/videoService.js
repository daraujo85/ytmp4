import youtubeDl from 'youtube-dl-exec';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class VideoService {
  constructor(config = {}) {
    this.videoOutputDir = config.videoOutputDir || 'downloads';
    this.holyricsApiUrl = config.holyricsApiUrl || 'http://192.168.31.231:8091/api';
    this.holyricsApiToken = config.holyricsApiToken || 'mGWQsXxrveT3W7HD';
    this.holyricsMonitorApi = config.holyricsMonitorApi || 'http://192.168.31.231:5858/api';
  }

  toSnakeCase(str) {
    return str
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .toLowerCase();
  }

  ensureDirectoryExists(dirPath) {
    console.log(`Checking if directory exists: ${dirPath}`);
    if (!fs.existsSync(dirPath)) {
      console.log(`Creating directory: ${dirPath}`);
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
  }

  validateYouTubeUrl(url) {
    if (!url) {
      throw new Error('URL is required');
    }
    if (!url.includes('youtube.com/') && !url.includes('youtu.be/')) {
      throw new Error('Invalid YouTube URL');
    }
    return true;
  }

  async getVideoInfo(url) {
    console.log('Fetching video info for:', url);
    const info = await youtubeDl(url, {
      dumpSingleJson: true,
      noWarnings: true,
      noCallHome: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true
    });

    if (!info) {
      throw new Error('Could not fetch video information');
    }
    console.log('Successfully fetched video info');
    return info;
  }

  generateFileName(customTitle, customDate, youtubeTitle) {
    console.log('Generating filename with:', { customTitle, customDate, youtubeTitle });
    
    // Format the date as YYYYMMDD
    const formattedDate = customDate ? customDate.replace(/[^0-9]/g, '') : '';
    
    // Clean and format the titles
    const sanitizedCustomTitle = customTitle ? customTitle.toLowerCase().replace(/[^a-z0-9]/g, '_') : '';
    const sanitizedYoutubeTitle = youtubeTitle ? youtubeTitle.toLowerCase().replace(/[^a-z0-9]/g, '_') : '';
    
    const fileName = [
      formattedDate,
      sanitizedCustomTitle,
      sanitizedYoutubeTitle
    ].filter(Boolean).join('_') + '.mp4';
    console.log('Generated filename:', fileName);
    return fileName;
  }

  verifyDirectoryAccess(outputDir) {
    console.log('Verifying directory access:', outputDir);
    const testPath = path.join(outputDir, '.write-test');
    try {
      fs.writeFileSync(testPath, '');
      fs.unlinkSync(testPath);
      console.log('Directory access verified successfully');
    } catch (error) {
      console.error('Directory access verification failed:', error);
      throw new Error(`Cannot access output directory: ${error.message}`);
    }
  }

  async downloadVideo(url, outputPath) {
    console.log('Starting video download to:', outputPath);
    await youtubeDl.exec(url, {
      output: outputPath,
      format: 'best[ext=mp4]',
      noCheckCertificate: true,
      noWarnings: true,
      noCallHome: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error('Downloaded file not found');
    }
    console.log('Video download completed successfully');
    return outputPath;
  }

  async processVideo(url, eventDate = '', customTitle = '') {
    this.validateYouTubeUrl(url);

    // Get video info early to use its title
    const videoInfo = await this.getVideoInfo(url);
    const youtubeTitle = videoInfo.title ? this.toSnakeCase(videoInfo.title) : '';
    const sanitizedCustomTitle = customTitle ? this.toSnakeCase(customTitle) : '';
    const sanitizedDate = eventDate ? this.toSnakeCase(eventDate) : '';
    
    // Generate filename and prepare output directory
    const fileName = this.generateFileName(sanitizedCustomTitle, sanitizedDate, youtubeTitle);
    this.ensureDirectoryExists(this.videoOutputDir);
    this.verifyDirectoryAccess(this.videoOutputDir);
    
    const outputPath = path.join(this.videoOutputDir, fileName);

    // Download video
    await this.downloadVideo(url, outputPath);

    // Add to Holyrics playlist
    await this.addToHolyricsPlaylist(fileName);

    return {
      fileName,
      outputPath,
      videoInfo
    };
  }
  async convertToMp3(inputPath, outputPath) {
    console.log('Converting video to MP3:', inputPath);
    
    // Ensure input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error('Input video file not found');
    }
    
    try {
      // Use ffmpeg with improved parameters for better audio quality
      const command = `ffmpeg -i "${inputPath}" -vn -acodec libmp3lame -ab 320k -ar 44100 -y "${outputPath}"`;
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr) {
        console.log('FFmpeg conversion output:', stderr);
      }

      if (!fs.existsSync(outputPath)) {
        throw new Error('Converted audio file not found');
      }
      
      console.log('Audio conversion completed successfully');
      return outputPath;
    } catch (error) {
      console.error('Error during conversion:', error);
      throw new Error(`Failed to convert video to MP3: ${error.message}`);
    }
  }
}

export default VideoService;