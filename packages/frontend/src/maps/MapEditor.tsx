import { useEffect, useRef } from "react";

interface MapEditorProps {
  token: string;
}

/** Hosts the eomap-js fork (served same-origin under /eomap/) in an iframe and
 *  hands it the admin token. The fork posts { type: "aio-ready" } once loaded;
 *  we reply with { type: "aio-auth", token }, both pinned to our own origin.
 *
 *  The ?v= build stamp is load-bearing. React mounts this iframe after page
 *  load, so its navigation is never part of a reload and never inherits the
 *  cache bypass -- a hard refresh of the app leaves a stale editor in place,
 *  and Chrome keys subframe documents separately, so refreshing /eomap/
 *  directly doesn't heal it either. A per-build URL sidesteps the cache
 *  entirely. The bundle it pulls in is content-hashed for the same reason. */
export function MapEditor({ token }: MapEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const origin = window.location.origin;

    const sendToken = () => {
      iframeRef.current?.contentWindow?.postMessage({ type: "aio-auth", token }, origin);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      if (event.data?.type === "aio-ready") sendToken();
    };

    window.addEventListener("message", onMessage);
    // Also push on load in case the iframe's ready message raced our listener.
    const iframe = iframeRef.current;
    iframe?.addEventListener("load", sendToken);

    return () => {
      window.removeEventListener("message", onMessage);
      iframe?.removeEventListener("load", sendToken);
    };
  }, [token]);

  return (
    <iframe
      ref={iframeRef}
      src={`/eomap/index.html?v=${__EOMAP_BUILD_ID__}`}
      title="Map Editor"
      className="h-full w-full border-0"
    />
  );
}
