// Sample only the lower part of the decoded frame. The caller owns the canvas
// and can reuse it between samples without reallocating a full video frame.
export function captureSubtitleFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): { jpeg: string; mediaTime: number } | null {
  if (video.readyState < 2 || video.seeking || !video.videoWidth || !video.videoHeight) {
    return null;
  }
  const mediaTime = video.currentTime;
  const top = Math.floor(video.videoHeight * 0.55);
  const height = video.videoHeight - top;
  const width = Math.min(video.videoWidth, 960);
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(height * width / video.videoWidth));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, top, video.videoWidth, height, 0, 0, width, canvas.height);
  return { jpeg: canvas.toDataURL("image/jpeg", 0.82), mediaTime };
}
