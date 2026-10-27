"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/apiClient";
import { positionAlongPath } from "@/lib/geo";

const POLL_MS = 1000;
const DRIVE_URL = "/api/simulation/drive";

// Follows the server's shared simulated drives (see
// lib/driveSimulation.server.js) — the same ones the Android app drives —
// and animates the vehicles along them every frame. Positions are derived
// from each drive's anchor (progress at a server time) and speed, corrected
// for clock skew, so every viewer sees a vehicle at the same point no matter
// who pressed "Start driving" or changed its speed.
//
// Same formula as the server's progressAt().
function progressAt(drive, serverTime) {
  const advanced = ((serverTime - drive.anchorAt) * drive.speed) / (drive.realDurationSeconds * 1000);
  return Math.min(1, Math.max(0, drive.anchorProgress + advanced));
}

// Server time at which `drive` reaches its stop at its current speed.
function endsAt(drive) {
  return drive.anchorAt + ((1 - drive.anchorProgress) * drive.realDurationSeconds * 1000) / drive.speed;
}

// `url` is polled every second (null = don't poll); `select` turns its
// response into a { vehicleId: drive } map. Also tracks the vehicle's chosen
// speed when the response carries one.
function usePolledDrives(url, select) {
  const [drives, setDrives] = useState({});
  const [speed, setSpeed] = useState(null);
  const [speedOptions, setSpeedOptions] = useState([]);
  // The server's clock, as best this client can tell — the animation clock.
  const [serverTime, setServerTime] = useState(() => Date.now());
  const clockOffsetRef = useRef(0); // serverNow - local now
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  }, [select]);

  // Don't show the previous target's drives while the new first poll is in
  // flight.
  const [prevUrl, setPrevUrl] = useState(url);
  if (url !== prevUrl) {
    setPrevUrl(url);
    setDrives({});
  }

  const applyResponse = useCallback((data, sentAt) => {
    const receivedAt = Date.now();
    clockOffsetRef.current = data.serverNow - (sentAt + receivedAt) / 2;
    setServerTime(receivedAt + clockOffsetRef.current);
    const incoming = selectRef.current(data);
    if (data.speed != null) setSpeed(data.speed);
    if (data.speeds) setSpeedOptions(data.speeds);
    setDrives((prev) => {
      const next = {};
      let changed = Object.keys(prev).length !== Object.keys(incoming).length;
      for (const [vehicleId, drive] of Object.entries(incoming)) {
        const old = prev[vehicleId];
        // Keep the old object when it's the same drive, so its decoded
        // `points` (and anything memoized on it) stay stable; take the new
        // anchor/speed when they changed (a speed change or skip).
        if (old && old.startedAt === drive.startedAt) {
          if (old.anchorAt === drive.anchorAt && old.speed === drive.speed) {
            next[vehicleId] = old;
          } else {
            next[vehicleId] = { ...old, anchorAt: drive.anchorAt, anchorProgress: drive.anchorProgress, speed: drive.speed };
            changed = true;
          }
        } else {
          next[vehicleId] = { ...drive, points: drive.path.map(([lat, lng]) => ({ lat, lng })) };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const poll = async () => {
      const sentAt = Date.now();
      try {
        const data = await api.get(url);
        if (!cancelled) applyResponse(data, sentAt);
      } catch {
        // Transient — the next poll retries.
      }
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [url, applyResponse]);

  // Re-render every frame only while some vehicle is actually moving.
  useEffect(() => {
    const lastEnd = Math.max(0, ...Object.values(drives).map(endsAt));
    let raf;
    const tick = () => {
      const t = Date.now() + clockOffsetRef.current;
      setServerTime(t);
      if (t < lastEnd) raf = requestAnimationFrame(tick);
    };
    if (Date.now() + clockOffsetRef.current < lastEnd) raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drives]);

  return { drives, serverTime, speed, speedOptions, applyResponse };
}

// Where a drive's vehicle is at `serverTime`.
function driveSnapshot(drive, serverTime) {
  const progress = progressAt(drive, serverTime);
  return {
    drive,
    legPath: drive.points,
    vehiclePos: positionAlongPath(drive.points, progress),
    progress,
    driving: progress < 1,
  };
}

const selectSingle = (data) => (data.drive ? { [data.drive.vehicleId]: data.drive } : {});
const selectAll = (data) => data.drives || {};

// One vehicle's drive, plus actions to start it (`start(deliveryId)`),
// change its playback speed (`changeSpeed(n)`, shared with every viewer and
// the next legs) and jump to the destination (`skip()`).
export function useDriveSimulation(vehicleId) {
  const url = vehicleId ? `${DRIVE_URL}?vehicleId=${encodeURIComponent(vehicleId)}` : null;
  const { drives, serverTime, speed, speedOptions, applyResponse } = usePolledDrives(url, selectSingle);

  const start = useCallback(
    async (deliveryId) => {
      const sentAt = Date.now();
      const data = await api.post(DRIVE_URL, { vehicleId, deliveryId });
      applyResponse(data, sentAt);
    },
    [vehicleId, applyResponse]
  );

  const patch = useCallback(
    async (body) => {
      const sentAt = Date.now();
      const data = await api.patch(DRIVE_URL, { vehicleId, ...body });
      applyResponse(data, sentAt);
    },
    [vehicleId, applyResponse]
  );
  const changeSpeed = useCallback((n) => patch({ speed: n }), [patch]);
  const skip = useCallback(() => patch({ skip: true }), [patch]);

  const controls = { start, changeSpeed, skip, speed: speed ?? 1, speedOptions };
  const drive = vehicleId ? drives[vehicleId] : null;
  if (!drive) return { drive: null, legPath: [], vehiclePos: null, progress: 0, driving: false, ...controls };
  return { ...driveSnapshot(drive, serverTime), ...controls };
}

// Every vehicle's drive, for the fleet live map: { vehicleId: snapshot }.
export function useFleetDriveSimulation() {
  const { drives, serverTime } = usePolledDrives(DRIVE_URL, selectAll);
  return Object.fromEntries(
    Object.entries(drives).map(([vehicleId, drive]) => [vehicleId, driveSnapshot(drive, serverTime)])
  );
}
