// Shared, stable reference for the Maps JavaScript API libraries to load.
// @react-google-maps/api requires every useJsApiLoader() call sharing the same
// `id` to pass the exact same `libraries` array reference, so components that
// load the map (MapView) and components that use Places (AddressAutocomplete)
// both import this constant instead of declaring their own array.
export const GOOGLE_MAPS_LIBRARIES = ["places"];
