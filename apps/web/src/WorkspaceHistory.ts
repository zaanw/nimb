import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function useSearchTerm(value: string) {
  const normalized = value.trim();
  const [settled, setSettled] = useState(normalized);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(normalized), 200);
    return () => window.clearTimeout(timer);
  }, [normalized]);
  return normalized ? settled : "";
}

type HistoryPosition = { key: string; latest?: number; first?: number };

export function useHistoryPosition(
  key: string,
  searching: boolean,
  first?: number,
  latest?: number,
  ownLatest = false,
) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [waiting, setWaiting] = useState(false);
  const following = useRef(true);
  const previous = useRef<HistoryPosition | null>(null);
  const pagination = useRef<{
    key: string;
    height: number;
    top: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!viewport) return;
    const prior = previous.current;
    previous.current = { key, first, latest };
    if (prior?.key !== key) {
      pagination.current = null;
      following.current = true;
      setWaiting(false);
      viewport.scrollTop = searching ? 0 : viewport.scrollHeight;
      return;
    }
    if (first !== undefined && prior.first === undefined) {
      viewport.scrollTop = searching ? 0 : viewport.scrollHeight;
      return;
    }
    if (
      pagination.current?.key === key &&
      first !== undefined &&
      prior.first !== undefined &&
      first < prior.first
    ) {
      const anchor = pagination.current;
      pagination.current = null;
      viewport.scrollTop = anchor.top + viewport.scrollHeight - anchor.height;
      return;
    }
    if (!searching && latest !== undefined && latest !== prior.latest) {
      if (following.current || ownLatest) {
        viewport.scrollTop = viewport.scrollHeight;
        setWaiting(false);
      } else {
        setWaiting(true);
      }
    }
  }, [viewport, key, searching, first, latest, ownLatest]);

  function follow() {
    if (!viewport) return;
    following.current = true;
    viewport.scrollTop = viewport.scrollHeight;
    setWaiting(false);
  }
  function onScroll() {
    if (!viewport) return;
    following.current =
      viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 96;
    if (following.current) setWaiting(false);
    if (pagination.current?.key === key)
      pagination.current.top = viewport.scrollTop;
  }
  function loadEarlier(load: () => Promise<{ isError: boolean }>) {
    if (!viewport) return;
    const anchor = {
      key,
      height: viewport.scrollHeight,
      top: viewport.scrollTop,
    };
    pagination.current = anchor;
    void load().then((result) => {
      if (result.isError && pagination.current === anchor)
        pagination.current = null;
    });
  }
  return { setViewport, waiting, follow, onScroll, loadEarlier };
}

export function useMobileChatViewport(active: boolean) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) return;
    const root = document.documentElement;
    const resize = () => {
      if (viewport.scale !== 1) return;
      root.style.setProperty(
        "--chat-viewport-height",
        `${Math.round(viewport.height)}px`,
      );
    };
    resize();
    viewport.addEventListener("resize", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      root.style.removeProperty("--chat-viewport-height");
    };
  }, [active]);
}
