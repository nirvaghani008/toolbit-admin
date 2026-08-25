const UPLOADER_ENDPOINT = 'https://image-uploader.tbit.workers.dev/';
const UPLOADER_TOKEN = 'toolbit-post-img-secret-2026';

/**
 * Uploads an image to the Toolbit CDN via the Cloudflare Worker.
 *
 * @param file  - The image File object to upload.
 * @param flag  - 'featured' for blog/post cover thumbnails (uses title for the filename),
 *                'post' for in-content images uploaded via the rich-text editor.
 * @param title - Required when flag='featured'. Used to build the CDN filename.
 * @returns     - The public CDN URL of the uploaded image.
 */
export async function uploadImageFile(
  file: File,
  flag: 'featured' | 'post' = 'post',
  title?: string,
): Promise<string> {
  const form = new FormData();
  form.append('flag', flag);
  form.append('image', file);
  if (flag === 'featured' && title) {
    form.append('title', title);
  }

  const res = await fetch(UPLOADER_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPLOADER_TOKEN}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Cloud CDN upload failed (HTTP ${res.status}): ${errText}`);
  }

  const json = await res.json() as {
    success: boolean;
    url?: string;
    message?: string;
  };

  if (!json.success || !json.url) {
    throw new Error(`Cloud CDN response missing image URL: ${json.message || JSON.stringify(json)}`);
  }

  return json.url;
}

/**
 * Converts a base64 Data URL to a File object.
 */
export function dataURLtoFile(dataurl: string, filename: string = 'image.png'): File {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

/**
 * Uploads a base64 Data URL to the Toolbit CDN via the Cloudflare Worker.
 */
export async function uploadBase64Image(dataurl: string, title?: string): Promise<string> {
  const isJpeg = dataurl.includes('image/jpeg') || dataurl.includes('image/jpg');
  const ext = isJpeg ? 'jpg' : 'png';
  const filename = `post-img-${Date.now()}-${Math.floor(Math.random() * 1000)}.${ext}`;
  const file = dataURLtoFile(dataurl, filename);
  const url = await uploadImageFile(file, 'post', title);
  if (!url || url.startsWith('data:image/')) {
    throw new Error('Failed to upload base64 image to cloud CDN server.');
  }
  return url;
}

/**
 * Replaces all base64 data URLs in a string/markdown with CDN uploaded URLs.
 */
export async function processAndUploadBase64Images(content: string, title?: string): Promise<string> {
  if (!content || !content.includes('data:image/')) {
    return content;
  }

  // Regex to match base64 data URLs (data:image/...;base64,...) including svg+xml, webp, etc.
  const base64Regex = /data:image\/[a-zA-Z0-9\+\-\.]+;base64,[A-Za-z0-9+/=\s]+/g;
  const matches = Array.from(new Set(content.match(base64Regex) || []));

  let updatedContent = content;

  for (const base64Str of matches) {
    const cleanBase64 = base64Str.trim();
    const cdnUrl = await uploadBase64Image(cleanBase64, title);
    if (cdnUrl && cdnUrl.startsWith('http') && !cdnUrl.startsWith('data:image/')) {
      updatedContent = updatedContent.split(cleanBase64).join(cdnUrl);
    } else {
      throw new Error('CDN Cloud upload returned an invalid URL for embedded image.');
    }
  }

  return updatedContent;
}

