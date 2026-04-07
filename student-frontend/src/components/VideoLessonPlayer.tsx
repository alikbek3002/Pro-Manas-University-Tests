import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import type { VideoLesson } from '../lib/api';

interface VideoLessonPlayerProps {
  lesson: VideoLesson | null;
}

function getPlayableSource(lesson: VideoLesson | null) {
  if (!lesson) return null;
  return lesson.hlsUrl || lesson.playbackUrl || lesson.mp4Url || lesson.previewUrl;
}

export default function VideoLessonPlayer({ lesson }: VideoLessonPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playableSource = getPlayableSource(lesson);
  const isHls = Boolean(lesson?.hlsUrl);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playableSource) return;

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });

      hls.loadSource(playableSource);
      hls.attachMedia(video);

      return () => {
        hls.destroy();
      };
    }

    video.src = playableSource;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }, [isHls, playableSource]);

  if (!lesson) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 text-sm text-stone-500">
        Выберите урок, чтобы начать просмотр
      </div>
    );
  }

  if (!playableSource) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-6 text-center text-sm text-amber-800">
        <p className="font-semibold">Урок уже в каталоге, но еще не опубликован в CDN/HLS.</p>
        <p>Для production добавьте `HLS` или публичный `MP4` URL в видеокаталог.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-black">
      <video
        ref={videoRef}
        className="aspect-video w-full bg-black"
        controls
        preload="metadata"
        playsInline
        poster={lesson.posterUrl || undefined}
      />
    </div>
  );
}
