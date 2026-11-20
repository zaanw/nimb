import { useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web";
import { Gift } from "lucide-react";

const artwork: Record<string, string> = {
  star: "hanging-star",
  heart: "heart-locket",
  flower: "pretty-posy",
  comet: "stellar-rocket",
  moon: "moon-pendant",
  diamond: "astral-shard",
  pepe: "plush-pepe",
  bear: "toy-bear",
};

// Local copies of Telegram's original gift posters and animations.
// Provenance and checksums: apps/web/gift-art-sources.json.
export function GiftArtwork({
  template,
  animate = false,
  lazy = false,
}: {
  template: string;
  animate?: boolean;
  lazy?: boolean;
}) {
  const asset = artwork[template];
  const container = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [template]);
  useEffect(() => {
    setPlaying(false);
    if (!animate || !asset) return;
    const abort = new AbortController();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: AnimationItem | undefined;
    let disposed = false;
    let generation = 0;
    async function start() {
      const current = ++generation;
      animation?.destroy();
      animation = undefined;
      setPlaying(false);
      if (
        media.matches ||
        document.documentElement.dataset.reduceMotion === "true"
      )
        return;
      try {
        const [module, data] = await Promise.all([
          import("lottie-web/build/player/lottie_light"),
          fetch(`/gifts/telegram/${asset}.json`, { signal: abort.signal }).then(
            (response) => {
              if (!response.ok) throw new Error("Animation unavailable");
              return response.json();
            },
          ),
        ]);
        if (disposed || current !== generation || !container.current) return;
        animation = module.default.loadAnimation({
          container: container.current,
          renderer: "svg",
          loop: true,
          autoplay: false,
          animationData: data,
          rendererSettings: { progressiveLoad: true },
        });
        animation.addEventListener("DOMLoaded", () => {
          if (disposed || current !== generation) return;
          setPlaying(true);
          if (document.visibilityState !== "hidden") animation?.play();
        });
        animation.addEventListener("data_failed", () => {
          if (disposed || current !== generation) return;
          animation?.destroy();
          setPlaying(false);
        });
      } catch {
        if (!disposed && current === generation) setPlaying(false);
      }
    }
    function visibility() {
      if (document.visibilityState === "hidden") animation?.pause();
      else animation?.play();
    }
    const restart = () => {
      void start();
    };
    restart();
    media.addEventListener("change", restart);
    window.addEventListener("nimb-motion-change", restart);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      generation++;
      abort.abort();
      animation?.destroy();
      media.removeEventListener("change", restart);
      window.removeEventListener("nimb-motion-change", restart);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [asset, animate]);
  return (
    <div
      className={`gift-artwork ${playing ? "is-playing" : ""}`}
      data-gift-art={asset || "unavailable"}
    >
      {asset && !failed ? (
        <img
          src={`/gifts/telegram/${asset}.webp`}
          width="256"
          height="256"
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          loading={lazy ? "lazy" : "eager"}
          onError={() => setFailed(true)}
        />
      ) : (
        <Gift
          className="gift-art-unavailable"
          aria-label="Изображение подарка недоступно"
        />
      )}
      {animate && (
        <div className="gift-animation" ref={container} aria-hidden="true" />
      )}
    </div>
  );
}
