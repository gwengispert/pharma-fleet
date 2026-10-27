"use client";

import { Marker } from "@react-google-maps/api";

// Top-down car for a simulated vehicle, nose pointing north so a Symbol's
// `rotation` is its compass heading. Paths are centered on 0,0, which is the
// Symbol's anchor.
// Symbols have a single fill color, so the windows are a second Symbol
// stacked on the body. Must render inside a loaded <GoogleMap>.
const CAR_BODY_PATH =
  "M -3.5 -10 Q -5 -10 -5 -8 L -5 8 Q -5 10 -3 10 L 3 10 Q 5 10 5 8 L 5 -8 Q 5 -10 3.5 -10 Z";
const CAR_WINDOWS_PATH =
  "M -3.8 -5 L 3.8 -5 L 3 -1.8 L -3 -1.8 Z M -3 4.8 L 3 4.8 L 3.6 7.6 L -3.6 7.6 Z";
const CAR_SCALE = 1.6;

// `offset` ({x, y} in path units, screen axes) draws the car that far from
// `position` at every zoom level — used to fan parked cars out around a
// shared spot without hiding it.
export default function CarMarker({
  position,
  color = "#f97316",
  outline = "#7c2d12",
  title,
  onClick,
  zIndex = 1000,
  offset = null,
}) {
  const rotation = position.heading ?? 0;
  const anchor = offset ? new window.google.maps.Point(-offset.x, -offset.y) : undefined;
  return (
    <>
      <Marker
        position={position}
        zIndex={zIndex}
        title={title}
        onClick={onClick}
        icon={{
          path: CAR_BODY_PATH,
          scale: CAR_SCALE,
          rotation,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: outline,
          strokeWeight: 1.5,
          anchor,
        }}
      />
      <Marker
        position={position}
        zIndex={zIndex + 1}
        clickable={false}
        icon={{
          path: CAR_WINDOWS_PATH,
          scale: CAR_SCALE,
          rotation,
          fillColor: "#1f2937",
          fillOpacity: 0.9,
          strokeWeight: 0,
          anchor,
        }}
      />
    </>
  );
}
