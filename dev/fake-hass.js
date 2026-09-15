// Fake hass good enough to exercise the card: many domains, one domain that
// exists only among disabled entities, and a callWS that answers the registry.
//
// Entity ids read like a real install rather than fake_sensor_0, because the
// README screenshots are taken from this harness — a real Home Assistant would
// put someone's actual home in a public image.
const ENABLED = {
  light: 40, sensor: 900, binary_sensor: 300, switch: 60, climate: 4, cover: 12,
  fan: 6, vacuum: 2, media_player: 9, camera: 7, lock: 3, device_tracker: 15,
  zone: 4, person: 5, script: 22, automation: 48, scene: 11, button: 18,
  calendar: 6, input_boolean: 14, input_number: 9, input_select: 7, input_text: 5,
  input_datetime: 4, input_button: 3, counter: 2, timer: 3,
  update: 31, select: 26, number: 19, text: 4, weather: 2, sun: 1, todo: 3,
  image: 5, siren: 1, valve: 2, remote: 3, alarm_control_panel: 1, group: 8,
};
// Disabled-only: `event` has no enabled members at all, so it must appear as a
// brand-new domain the moment "Include disabled" is ticked.
const DISABLED = { event: 6, sensor: 120, camera: 2, update: 9, binary_sensor: 40 };

const ROOMS = [
  "living_room", "kitchen", "bedroom", "bathroom", "hallway", "office",
  "garage", "garden", "attic", "basement", "nursery", "guest_room",
];
const NOUNS = {
  light: ["ceiling", "lamp", "strip", "spots"],
  sensor: ["temperature", "humidity", "power", "energy_today", "battery", "illuminance", "co2", "pressure"],
  binary_sensor: ["motion", "door", "window", "occupancy", "smoke", "leak"],
  switch: ["outlet", "pump", "fan_relay"],
  climate: ["thermostat"], cover: ["blind", "shutter"], fan: ["ventilation"],
  vacuum: ["robot"], media_player: ["speaker", "tv"], camera: ["cam"],
  lock: ["door_lock"], device_tracker: ["phone"], zone: ["zone"], person: ["person"],
  script: ["good_night", "movie_mode", "away"], automation: ["lights_on_motion", "heating_schedule", "notify_door"],
  scene: ["evening", "bright", "relax"], button: ["restart", "identify"], calendar: ["family", "bin_collection"],
  input_boolean: ["guest_mode", "vacation", "silent_night"], input_number: ["target_temp", "brightness_step"],
  input_select: ["house_mode", "preset"], input_text: ["note", "shopping"], input_datetime: ["wake_up", "leave"],
  input_button: ["reset_counter"], counter: ["door_openings"], timer: ["laundry", "coffee"],
  update: ["firmware"], select: ["mode", "preset"], number: ["offset", "threshold"], text: ["message"],
  weather: ["forecast"], sun: ["sun"], todo: ["shopping_list", "chores"], image: ["snapshot"],
  siren: ["alarm"], valve: ["water"], remote: ["tv_remote"], alarm_control_panel: ["house"], group: ["all_lights"],
};

// Deterministic: room x noun, with a numeric suffix once the pairs run out.
function idFor(domain, i) {
  const nouns = NOUNS[domain] || [domain];
  const noun = nouns[i % nouns.length];
  const room = ROOMS[Math.floor(i / nouns.length) % ROOMS.length];
  const round = Math.floor(i / (nouns.length * ROOMS.length));
  const suffix = round ? `_${round + 1}` : "";
  return `${domain}.${room}_${noun}${suffix}`;
}

function titleCase(slug) {
  return slug.split("_").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

const states = {};
for (const [domain, n] of Object.entries(ENABLED)) {
  for (let i = 0; i < n; i++) {
    const id = idFor(domain, i);
    states[id] = {
      entity_id: id,
      state: domain === "binary_sensor" ? "off" : "23.4",
      attributes: { friendly_name: titleCase(id.split(".")[1]), unit_of_measurement: "°C" },
    };
  }
}

const registry = Object.keys(states).map(id => ({
  entity_id: id, platform: "fake", disabled_by: null, hidden_by: null,
  original_name: states[id].attributes.friendly_name,
}));
const disabledIds = [];
for (const [domain, n] of Object.entries(DISABLED)) {
  for (let i = 0; i < n; i++) {
    // Offset past the enabled ids so the two sets never collide.
    const id = idFor(domain, (ENABLED[domain] || 0) + i);
    disabledIds.push(id);
    registry.push({
      entity_id: id, platform: "fake",
      disabled_by: i % 2 ? "integration" : "user",
      hidden_by: null, original_name: titleCase(id.split(".")[1]),
    });
  }
}

export const COUNTS = {
  enabledStates: Object.keys(states).length,
  disabledRegistry: disabledIds.length,
  registryTotal: registry.length,
};

export function makeHass({ failRegistry = false } = {}) {
  return {
    states,
    callWS: async (msg) => {
      // Call log for the harness page; guarded so the fixture also runs under node.
      if (typeof window !== "undefined") window.__wsCalls = (window.__wsCalls || []).concat(msg.type);
      if (failRegistry) throw new Error("unauthorized");
      if (msg.type === "config/entity_registry/list") return registry;
      throw new Error("unexpected ws call: " + msg.type);
    },
  };
}
