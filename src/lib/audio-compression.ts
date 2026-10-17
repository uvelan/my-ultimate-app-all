interface PcmAudio { rate: number; channels: number; chunks: Buffer[] }
const SAMPLE_RATES = new Set([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]);

function readPcmWav(audio: Buffer): PcmAudio | null {
    if (audio.length < 12 || audio.toString('ascii', 0, 4) !== 'RIFF'
        || audio.toString('ascii', 8, 12) !== 'WAVE') return null;
    const end = audio.readUInt32LE(4) + 8;
    if (end < 12 || end > audio.length) return null;
    let rate = 0;
    let channels = 0;
    let formatSeen = false;
    const chunks: Buffer[] = [];
    for (let offset = 12; offset < end;) {
        if (offset + 8 > end) return null;
        const id = audio.toString('ascii', offset, offset + 4);
        const length = audio.readUInt32LE(offset + 4);
        const start = offset + 8;
        const next = start + length + (length % 2);
        if (next > end) return null;
        if (id === 'fmt ') {
            if (formatSeen || length < 16) return null;
            formatSeen = true;
            const encoding = audio.readUInt16LE(start);
            const pcmExtensible = encoding === 0xfffe && length >= 40
                && audio.readUInt16LE(start + 16) >= 22 && audio.readUInt16LE(start + 18) === 16
                && audio.subarray(start + 24, start + 40).equals(Buffer.from('0100000000001000800000aa00389b71', 'hex'));
            if (encoding !== 1 && !pcmExtensible) return null;
            channels = audio.readUInt16LE(start + 2);
            rate = audio.readUInt32LE(start + 4);
            if ((channels !== 1 && channels !== 2) || !SAMPLE_RATES.has(rate)
                || audio.readUInt16LE(start + 14) !== 16
                || audio.readUInt16LE(start + 12) !== channels * 2
                || audio.readUInt32LE(start + 8) !== rate * channels * 2) return null;
        } else if (id === 'data' && length) {
            chunks.push(audio.subarray(start, start + length));
        }
        offset = next;
    }
    if (!formatSeen || !chunks.length || chunks.some(chunk => chunk.length % (channels * 2))) return null;
    return { rate, channels, chunks };
}

function validMp3Frames(audio: Buffer): boolean {
    let offset = 0;
    let frames = 0;
    while (offset + 4 <= audio.length) {
        const b1 = audio[offset + 1];
        const b2 = audio[offset + 2];
        if (audio[offset] !== 0xff || (b1 & 0xe0) !== 0xe0 || ((b1 >> 1) & 3) !== 1) return false;
        const version = (b1 >> 3) & 3;
        const bitrateIndex = b2 >> 4;
        const sampleIndex = (b2 >> 2) & 3;
        if (version === 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) return false;
        const bitrates = version === 3
            ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
            : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
        const rate = [44100, 48000, 32000][sampleIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
        const length = Math.floor((version === 3 ? 144000 : 72000) * bitrates[bitrateIndex] / rate) + ((b2 >> 1) & 1);
        if (length < 4 || offset + length > audio.length) return false;
        offset += length;
        frames++;
    }
    return frames >= 2 && offset === audio.length;
}

export async function compressNarrationAudio(
    audio: Buffer,
    contentType: string,
    signal?: AbortSignal,
): Promise<{ audio: Buffer; contentType: string }> {
    signal?.throwIfAborted();
    const original = { audio, contentType };
    if (/^audio\/(?:mpeg|mp3)(?:;|$)/i.test(contentType)) return original;
    const pcm = readPcmWav(audio);
    if (!pcm) return original;
    try {
        const { Mp3Encoder } = await import('@breezystack/lamejs');
        signal?.throwIfAborted();
        const encoder = new Mp3Encoder(1, pcm.rate, 64);
        const encoded: Buffer[] = [];
        const samples = new Int16Array(1152);
        let filled = 0;
        let blocks = 0;
        for (const chunk of pcm.chunks) {
            for (let offset = 0; offset < chunk.length; offset += pcm.channels * 2) {
                const left = chunk.readInt16LE(offset);
                samples[filled++] = pcm.channels === 1 ? left : (left + chunk.readInt16LE(offset + 2)) >> 1;
                if (filled === samples.length) {
                    const bytes = encoder.encodeBuffer(samples);
                    if (bytes.length) encoded.push(Buffer.from(bytes));
                    filled = 0;
                    if (++blocks % 8 === 0) {
                        await new Promise<void>(resolve => setImmediate(resolve));
                        signal?.throwIfAborted();
                    }
                }
            }
        }
        signal?.throwIfAborted();
        if (filled) {
            const bytes = encoder.encodeBuffer(samples.subarray(0, filled));
            if (bytes.length) encoded.push(Buffer.from(bytes));
        }
        const tail = encoder.flush();
        if (tail.length) encoded.push(Buffer.from(tail));
        signal?.throwIfAborted();
        const compressed = Buffer.concat(encoded);
        if (compressed.length < audio.length && validMp3Frames(compressed)) return { audio: compressed, contentType: 'audio/mpeg' };
        return original;
    } catch (error) {
        signal?.throwIfAborted();
        return original;
    }
}
