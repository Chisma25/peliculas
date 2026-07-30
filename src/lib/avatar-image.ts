import sharp from "sharp";

const AVATAR_OUTPUT_SIZE = 172;

export type OptimizedAvatar = {
  bytes: Buffer;
  contentType: "image/webp";
};

export async function optimizeAvatarImage(bytes: Uint8Array): Promise<OptimizedAvatar> {
  const optimized = await sharp(bytes, { animated: false })
    .rotate()
    .resize({
      width: AVATAR_OUTPUT_SIZE,
      height: AVATAR_OUTPUT_SIZE,
      fit: "cover",
      position: "centre",
      withoutEnlargement: true
    })
    .webp({
      quality: 82,
      effort: 4,
      smartSubsample: true
    })
    .toBuffer();

  return {
    bytes: optimized,
    contentType: "image/webp"
  };
}
