// Server-side singleton in-memory store. Survives across requests within the
// same running Node process (resets on server restart) — use Export/Import
// on the admin dashboard to persist a session to disk.

function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyState() {
  return {
    settings: {
      depotName: "Main Depot",
      depotAddress: "",
      depotLat: null,
      depotLng: null,
      fuelCostPerKm: 0.15,
    },
    vehicles: [],
    drivers: [],
    deliveries: [],
    routes: {}, // vehicleId -> route
  };
}

// `globalThis` keeps a single instance alive across Next.js hot-reloads in dev.
const store = globalThis.__pharmaFleetStore || (globalThis.__pharmaFleetStore = emptyState());

export function getState() {
  return store;
}

export function replaceState(newState) {
  const next = emptyState();
  Object.assign(next, newState);
  Object.assign(store, next);
  return store;
}

// ---- Settings ----
export function getSettings() {
  return store.settings;
}
export function updateSettings(patch) {
  Object.assign(store.settings, patch);
  return store.settings;
}

// ---- Vehicles ----
export function listVehicles() {
  return store.vehicles;
}
export function createVehicle(data) {
  const vehicle = {
    id: makeId("veh"),
    name: data.name,
    type: data.type || "van",
    capacityKg: data.capacityKg || null,
    refrigerated: !!data.refrigerated,
    status: "available",
    createdAt: new Date().toISOString(),
  };
  store.vehicles.push(vehicle);
  return vehicle;
}
export function updateVehicle(id, patch) {
  const vehicle = store.vehicles.find((v) => v.id === id);
  if (!vehicle) return null;
  Object.assign(vehicle, patch);
  return vehicle;
}
export function deleteVehicle(id) {
  store.vehicles = store.vehicles.filter((v) => v.id !== id);
  delete store.routes[id];
  store.drivers.forEach((d) => {
    if (d.vehicleId === id) d.vehicleId = null;
  });
  store.deliveries.forEach((d) => {
    if (d.assignedVehicleId === id) {
      d.assignedVehicleId = null;
      d.assignedDriverId = null;
      d.sequence = null;
      if (d.status === "assigned" || d.status === "in-transit") d.status = "pending";
    }
  });
}

// ---- Drivers ----
export function listDrivers() {
  return store.drivers;
}
export function createDriver(data) {
  const driver = {
    id: makeId("drv"),
    name: data.name,
    phone: data.phone || "",
    vehicleId: data.vehicleId || null,
    createdAt: new Date().toISOString(),
  };
  store.drivers.push(driver);
  return driver;
}
export function updateDriver(id, patch) {
  const driver = store.drivers.find((d) => d.id === id);
  if (!driver) return null;
  Object.assign(driver, patch);
  return driver;
}
export function deleteDriver(id) {
  store.drivers = store.drivers.filter((d) => d.id !== id);
}

// ---- Deliveries ----
export function listDeliveries() {
  return store.deliveries;
}
export function createDelivery(data) {
  const delivery = {
    id: makeId("del"),
    customerName: data.customerName,
    address: data.address,
    lat: data.lat ?? null,
    lng: data.lng ?? null,
    priority: data.priority || "normal",
    requiresRefrigeration: !!data.requiresRefrigeration,
    notes: data.notes || "",
    status: "pending", // pending -> assigned -> in-transit -> delivered
    assignedVehicleId: null,
    assignedDriverId: null,
    sequence: null,
    createdAt: new Date().toISOString(),
  };
  store.deliveries.push(delivery);
  return delivery;
}
export function updateDelivery(id, patch) {
  const delivery = store.deliveries.find((d) => d.id === id);
  if (!delivery) return null;
  Object.assign(delivery, patch);
  return delivery;
}
export function deleteDelivery(id) {
  store.deliveries = store.deliveries.filter((d) => d.id !== id);
}

// ---- Routes ----
export function getRoute(vehicleId) {
  return store.routes[vehicleId] || null;
}
export function setRoute(vehicleId, route) {
  store.routes[vehicleId] = route;
  return route;
}

export { makeId };
