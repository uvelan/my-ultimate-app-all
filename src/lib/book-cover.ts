import sharp from 'sharp';

export async function encodeBookCover(image: Buffer): Promise<string> {
    const bytes = await sharp(image, { limitInputPixels: 25_000_000 })
        .rotate()
        .resize(900, 1350, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 88, mozjpeg: true })
        .toBuffer();
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}
