"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Autocomplete, GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/googleMapsLibraries";
import { api } from "@/lib/apiClient";

// Metro Manila — default center for the map picker when no address is set yet.
const DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 };
const PICKER_STYLE = { width: "100%", height: "220px" };

// A plain text input that upgrades to a Google Places autocomplete dropdown
// once the Maps JavaScript API is loaded. Falls back to a normal input if no
// API key is configured or the script hasn't loaded yet. Optionally shows a
// "pick on map" toggle that reverse-geocodes a clicked/dragged map point.
export default function AddressAutocomplete({
  apiKey,
  value,
  onChange,
  onPlaceSelected,
  placeholder,
  className,
  countryRestriction, // ISO 3166-1 alpha-2 code, e.g. "ph" — limits suggestions to one country
  coords, // optional {lat,lng} of the currently resolved address — centers the map picker
  showMapPicker = true,
}) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey || "",
    id: "pharma-fleet-google-maps",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const autocompleteOptions = useMemo(
    () => ({
      // Combining "geocode" + "establishment" is the one type mix Google allows,
      // and it's what surfaces businesses (pharmacies, malls, clinics, etc.)
      // alongside plain addresses — "address" alone hides establishments.
      types: ["geocode", "establishment"],
      fields: ["formatted_address", "geometry"], // keep to Places "Basic Data" (cheapest tier)
      ...(countryRestriction ? { componentRestrictions: { country: countryRestriction } } : {}),
    }),
    [countryRestriction]
  );

  const autocompleteRef = useRef(null);

  const onLoad = useCallback((autocomplete) => {
    autocompleteRef.current = autocomplete;
  }, []);

  const onPlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (!place?.geometry?.location) return;
    const address = place.formatted_address || value;
    onChange(address);
    onPlaceSelected?.({
      address,
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    });
  }, [onChange, onPlaceSelected, value]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMarker, setPickerMarker] = useState(null);
  const [locating, setLocating] = useState(false);
  const [pickerError, setPickerError] = useState(null);

  async function handleMapPick(lat, lng) {
    setPickerMarker({ lat, lng });
    setLocating(true);
    setPickerError(null);
    try {
      const geo = await api.post("/api/geocode", { lat, lng });
      onChange(geo.formattedAddress);
      onPlaceSelected?.({ address: geo.formattedAddress, lat: geo.lat, lng: geo.lng });
    } catch (err) {
      setPickerError(err.message);
    } finally {
      setLocating(false);
    }
  }

  const input = (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );

  const field =
    !apiKey || !isLoaded ? (
      input
    ) : (
      <Autocomplete onLoad={onLoad} onPlaceChanged={onPlaceChanged} options={autocompleteOptions}>
        {input}
      </Autocomplete>
    );

  const markerPosition = pickerMarker || coords || null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1">{field}</div>
        {showMapPicker && apiKey && isLoaded && (
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            className="whitespace-nowrap rounded-md border border-neutral-300 px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            📍 {pickerOpen ? "Hide map" : "Pick on map"}
          </button>
        )}
      </div>

      {pickerOpen && isLoaded && (
        <div className="flex flex-col gap-1">
          <div
            className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800"
            style={PICKER_STYLE}
          >
            <GoogleMap
              mapContainerStyle={{ width: "100%", height: "100%" }}
              center={markerPosition || DEFAULT_CENTER}
              zoom={markerPosition ? 16 : 11}
              onClick={(e) => handleMapPick(e.latLng.lat(), e.latLng.lng())}
            >
              {markerPosition && (
                <Marker
                  position={markerPosition}
                  draggable
                  onDragEnd={(e) => handleMapPick(e.latLng.lat(), e.latLng.lng())}
                />
              )}
            </GoogleMap>
          </div>
          <span className="text-xs text-neutral-400">
            {locating ? "Looking up address…" : "Click the map (or drag the pin) to set the exact location."}
          </span>
          {pickerError && <span className="text-xs text-red-600">{pickerError}</span>}
        </div>
      )}
    </div>
  );
}
