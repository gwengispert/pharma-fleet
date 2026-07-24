"use client";

import { useCallback, useMemo, useRef } from "react";
import { Autocomplete, useJsApiLoader } from "@react-google-maps/api";
import { GOOGLE_MAPS_LIBRARIES } from "@/lib/googleMapsLibraries";

// A plain text input that upgrades to a Google Places autocomplete dropdown
// once the Maps JavaScript API is loaded. Falls back to a normal input if no
// API key is configured or the script hasn't loaded yet.
export default function AddressAutocomplete({
  apiKey,
  value,
  onChange,
  onPlaceSelected,
  placeholder,
  className,
  countryRestriction, // ISO 3166-1 alpha-2 code, e.g. "ph" — limits suggestions to one country
}) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey || "",
    id: "pharma-fleet-google-maps",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const autocompleteOptions = useMemo(
    () => ({
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

  const input = (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );

  if (!apiKey || !isLoaded) return input;

  return (
    <Autocomplete onLoad={onLoad} onPlaceChanged={onPlaceChanged} options={autocompleteOptions}>
      {input}
    </Autocomplete>
  );
}
