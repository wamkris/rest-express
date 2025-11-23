export function openYouTubeVideo(videoId: string) {
  const youtubeWebUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // Always open in new tab for consistent user experience
  window.open(youtubeWebUrl, '_blank', 'noopener,noreferrer');
}

export function formatDuration(duration: string): string {
  // Duration is already formatted from the server
  return duration;
}

export function formatViewCount(count: string | null): string {
  if (!count) return '0 views';
  return `${count} views`;
}
