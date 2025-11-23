import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface UseYouTubePlayerOptions {
  videoId: string;
  containerRef: React.RefObject<HTMLDivElement>;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onError?: (error: number) => void;
}

interface UseYouTubePlayerReturn {
  player: any;
  ready: boolean;
  error: string | null;
  currentTime: number;
  isPlaying: boolean;
  duration: number;
}

const SCRIPT_LOAD_TIMEOUT = 10000;

let scriptLoading = false;
let scriptLoaded = false;
let scriptError = false;

function loadYouTubeScript(): Promise<void> {
  if (scriptLoaded && window.YT && window.YT.Player) {
    return Promise.resolve();
  }

  if (scriptError) {
    return Promise.reject(new Error('YouTube IFrame API failed to load'));
  }

  if (scriptLoading) {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (scriptLoaded && window.YT && window.YT.Player) {
          clearInterval(checkInterval);
          resolve();
        } else if (scriptError) {
          clearInterval(checkInterval);
          reject(new Error('YouTube IFrame API failed to load'));
        }
      }, 100);
    });
  }

  scriptLoading = true;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      scriptError = true;
      scriptLoading = false;
      reject(new Error('YouTube IFrame API script load timeout'));
    }, SCRIPT_LOAD_TIMEOUT);

    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout);
      scriptLoaded = true;
      scriptLoading = false;
      resolve();
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      clearTimeout(timeout);
      scriptError = true;
      scriptLoading = false;
      reject(new Error('Failed to load YouTube IFrame API script'));
    };
    document.head.appendChild(script);
  });
}

export function useYouTubePlayer(options: UseYouTubePlayerOptions): UseYouTubePlayerReturn {
  const { videoId, containerRef, onReady, onStateChange, onError } = options;
  const playerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const pollingIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    loadYouTubeScript()
      .then(() => {
        if (!mounted || !containerRef.current) return;

        const container = document.createElement('div');
        container.id = `youtube-player-${videoId}`;
        containerRef.current.appendChild(container);

        const player = new window.YT.Player(container.id, {
          videoId,
          playerVars: {
            autoplay: 0,
            modestbranding: 1,
            rel: 0,
          },
          events: {
            onReady: (event: any) => {
              if (!mounted) return;
              setReady(true);
              setDuration(event.target.getDuration());
              onReady?.();
            },
            onStateChange: (event: any) => {
              if (!mounted) return;
              const state = event.data;
              
              setIsPlaying(state === window.YT.PlayerState.PLAYING);
              
              if (state === window.YT.PlayerState.ENDED) {
                setIsPlaying(false);
              }
              
              onStateChange?.(state);
            },
            onError: (event: any) => {
              if (!mounted) return;
              const errorCode = event.data;
              let errorMessage = 'Video playback error';
              
              switch (errorCode) {
                case 2:
                  errorMessage = 'Invalid video ID';
                  break;
                case 100:
                case 101:
                case 150:
                  errorMessage = 'Video unavailable or restricted';
                  break;
              }
              
              setError(errorMessage);
              onError?.(errorCode);
            },
          },
        });

        playerRef.current = player;
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message);
        }
      });

    return () => {
      mounted = false;
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          console.error('Error destroying player:', e);
        }
        playerRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [videoId, onReady, onStateChange, onError]);

  useEffect(() => {
    if (!ready || !playerRef.current) return;

    const updateTime = () => {
      try {
        const time = playerRef.current?.getCurrentTime();
        if (time !== undefined && Math.abs(time - currentTime) > 0.05) {
          setCurrentTime(time);
        }
      } catch (e) {
        console.error('Error getting current time:', e);
      }
    };

    if (isPlaying) {
      pollingIntervalRef.current = window.setInterval(updateTime, 200);
    } else {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      updateTime();
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [ready, isPlaying, currentTime]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      } else if (!document.hidden && isPlaying && ready) {
        pollingIntervalRef.current = window.setInterval(() => {
          try {
            const time = playerRef.current?.getCurrentTime();
            if (time !== undefined) {
              setCurrentTime(time);
            }
          } catch (e) {
            console.error('Error getting current time:', e);
          }
        }, 200);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying, ready]);

  return {
    player: playerRef.current,
    ready,
    error,
    currentTime,
    isPlaying,
    duration,
  };
}

export function getPlayerContainer(): React.RefObject<HTMLDivElement> {
  return useRef<HTMLDivElement>(null);
}
