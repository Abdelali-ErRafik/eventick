import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { getToken } from "../../api";

/**
 * Subscribes to the organiser's realtime feed.
 *
 * `onEvent` is kept in a ref so a caller can pass an inline arrow without
 * tearing down and re-opening the socket on every render — reconnect storms
 * are the usual way this hook goes wrong.
 *
 * Realtime is strictly an enhancement: if the socket never connects, the
 * dashboard still works, it just stops updating on its own.
 */
export function useRealtime(onEvent) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const token = getToken();
    if (!token) return undefined;

    const socket = io(process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4100", {
      path: "/socket.io",
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("eventick", (event) => handler.current?.(event));

    return () => {
      socket.off("eventick");
      socket.disconnect();
    };
  }, []);
}
