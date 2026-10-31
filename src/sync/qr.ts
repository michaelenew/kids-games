import jsQR from 'jsqr';
import qrcode from 'qrcode-generator';

/** A QR code for some text, as an SVG string. */
export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
}

/**
 * Read a QR code with the camera, inside the page. (The phone's own camera
 * app would open the link in Safari, which on an iPad or iPhone doesn't
 * share storage with a game added to the home screen.)
 */
export async function scanQr(video: HTMLVideoElement, signal: AbortSignal): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  try {
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    await video.play();
    const canvas = document.createElement('canvas');
    const g = canvas.getContext('2d', { willReadFrequently: true })!;
    for (;;) {
      if (signal.aborted) throw new Error('cancelled');
      await new Promise((r) => requestAnimationFrame(r));
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) continue;
      const scale = Math.min(1, 720 / Math.max(w, h));
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      g.drawImage(video, 0, 0, canvas.width, canvas.height);
      const found = jsQR(g.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
      if (found?.data) return found.data;
    }
  } finally {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}
