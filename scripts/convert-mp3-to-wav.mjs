import { spawn } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const audioDirectory = path.resolve(scriptsDirectory, '../public/audio');

async function findMp3Files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findMp3Files(entryPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp3')) {
      files.push(entryPath);
    }
  }

  return files;
}

function convertFile(inputPath) {
  const outputPath = inputPath.replace(/\.mp3$/i, '.wav');

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', ['-y', '-v', 'error', '-i', inputPath, outputPath], {
      stdio: 'inherit'
    });

    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code} while converting ${inputPath}`));
      }
    });
  });
}

try {
  const mp3Files = await findMp3Files(audioDirectory);

  if (!mp3Files.length) {
    console.log('No MP3 files found under public/audio');
  } else {
    for (const mp3File of mp3Files) {
      const wavFile = await convertFile(mp3File);
      await rm(mp3File);
      console.log(`Converted and removed ${path.relative(audioDirectory, mp3File)} -> ${path.relative(audioDirectory, wavFile)}`);
    }

    console.log(`Converted ${mp3Files.length} MP3 file${mp3Files.length === 1 ? '' : 's'} to WAV`);

    await new Promise((resolve, reject) => {
      const generator = spawn(process.execPath, [path.join(scriptsDirectory, 'generate-audio-assets.mjs')], {
        stdio: 'inherit'
      });
      generator.on('error', reject);
      generator.on('close', (code) => code === 0
        ? resolve()
        : reject(new Error(`Audio manifest generation exited with code ${code}`)));
    });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
