import { mkdir, readdir, writeFile } from 'node:fs/promises';

const sampleRate = 22050;
const outputDirectory = new URL('../public/audio/', import.meta.url);
const stampSoundsDirectory = new URL('./stampSounds/', outputDirectory);

function createWave(duration, notes) {
  const frameCount = Math.ceil(sampleRate * duration);
  const samples = new Float32Array(frameCount);

  for (const note of notes) {
    const startFrame = Math.floor(note.start * sampleRate);
    const noteFrames = Math.floor(note.duration * sampleRate);

    for (let frame = 0; frame < noteFrames && startFrame + frame < frameCount; frame++) {
      const elapsed = frame / sampleRate;
      const attack = Math.min(1, elapsed / 0.012);
      const release = Math.min(1, (note.duration - elapsed) / 0.055);
      const envelope = Math.max(0, Math.min(attack, release));
      const phase = 2 * Math.PI * note.frequency * elapsed;
      const tone = note.wave === 'triangle'
        ? (2 / Math.PI) * Math.asin(Math.sin(phase))
        : Math.sin(phase);

      samples[startFrame + frame] += tone * envelope * note.gain;
    }
  }

  const dataSize = frameCount * 2;
  const wave = Buffer.alloc(44 + dataSize);
  wave.write('RIFF', 0);
  wave.writeUInt32LE(36 + dataSize, 4);
  wave.write('WAVE', 8);
  wave.write('fmt ', 12);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write('data', 36);
  wave.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < frameCount; frame++) {
    const sample = Math.max(-1, Math.min(1, samples[frame] * 0.72));
    wave.writeInt16LE(Math.round(sample * 32767), 44 + frame * 2);
  }

  return wave;
}

const stampSounds = {
  'stamp.wav': createWave(0.19, [
    { frequency: 620, start: 0, duration: 0.13, gain: 0.48 },
    { frequency: 930, start: 0.035, duration: 0.15, gain: 0.34 }
  ])
};

const rootSounds = {
  'wildcard-swap.wav': createWave(0.42, [
    { frequency: 330, start: 0, duration: 0.16, gain: 0.3, wave: 'triangle' },
    { frequency: 494, start: 0.12, duration: 0.18, gain: 0.34, wave: 'triangle' },
    { frequency: 740, start: 0.25, duration: 0.17, gain: 0.28, wave: 'triangle' }
  ])
};

const unusedLegacySounds = {
  'bingo.wav': createWave(0.82, [
    { frequency: 523.25, start: 0, duration: 0.23, gain: 0.32 },
    { frequency: 659.25, start: 0.16, duration: 0.25, gain: 0.32 },
    { frequency: 783.99, start: 0.33, duration: 0.29, gain: 0.34 },
    { frequency: 1046.5, start: 0.51, duration: 0.31, gain: 0.35 }
  ]),
  'opponent-bingo.wav': createWave(0.62, [
    { frequency: 659.25, start: 0, duration: 0.17, gain: 0.38, wave: 'triangle' },
    { frequency: 523.25, start: 0.16, duration: 0.19, gain: 0.38, wave: 'triangle' },
    { frequency: 392, start: 0.34, duration: 0.23, gain: 0.4, wave: 'triangle' }
  ])
};

await mkdir(outputDirectory, { recursive: true });
await mkdir(stampSoundsDirectory, { recursive: true });
await Promise.all([
  ...Object.entries(stampSounds).map(([fileName, contents]) =>
    writeFile(new URL(fileName, stampSoundsDirectory), contents)
  ),
  ...Object.entries(rootSounds).map(([fileName, contents]) =>
    writeFile(new URL(fileName, outputDirectory), contents)
  )
]);

const stampEntries = await readdir(stampSoundsDirectory, { withFileTypes: true });
const stampFiles = stampEntries
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.wav'))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));
await writeFile(
  new URL('manifest.json', stampSoundsDirectory),
  `${JSON.stringify({ files: stampFiles }, null, 2)}\n`
);

console.log(`Generated stamp manifest with ${stampFiles.length} WAV files`);