/**
 * Shrinks a photo in the browser before it goes up.
 *
 * A phone camera writes 4–12 MB a shot, and a technician standing on a
 * forecourt uploads it over mobile data — where those bytes cost time and a
 * data plan. Nothing in the app ever shows a site photo larger than about
 * 1,600px, so that is what gets sent: typically a twentieth of the original.
 *
 * Anything that cannot be decoded comes back untouched rather than failing the
 * upload — an iPhone HEIC on a browser that cannot read it, or a file that is
 * not an image at all. So does anything re-encoding would not actually shrink.
 */
export async function shrinkImage(
  file: File,
  maxEdge = 1600,
  quality = 0.82
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // Below this a re-encode buys back less than the work of doing it.
  if (file.size <= 400 * 1024) return file;

  try {
    // from-image, or a portrait photo arrives on its side: the canvas keeps the
    // pixels but not the EXIF rotation that was standing them up.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    // A screenshot that is already small and flat can come out bigger as JPEG.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
