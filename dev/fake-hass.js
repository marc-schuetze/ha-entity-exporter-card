// Fake hass good enough to exercise the card: many domains, one domain that
// exists only among disabled entities, and a callWS that answers the registry.
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

const states = {};
for (const [domain, n] of Object.entries(ENABLED)) {
  for (let i = 0; i < n; i++) {
    const id = `${domain}.fake_${domain}_${i}`;
    states[id] = {
      entity_id: id,
      state: domain === "binary_sensor" ? "off" : "23.4",
      attributes: { friendly_name: `Fake ${domain} ${i}`, unit_of_measurement: "°C" },
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
    const id = `${domain}.disabled_${domain}_${i}`;
    disabledIds.push(id);
    registry.push({
      entity_id: id, platform: "fake",
      disabled_by: i % 2 ? "integration" : "user",
      hidden_by: null, original_name: `Disabled ${domain} ${i}`,
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
      window.__wsCalls = (window.__wsCalls || []).concat(msg.type);
      if (failRegistry) throw new Error("unauthorized");
      if (msg.type === "config/entity_registry/list") return registry;
      throw new Error("unexpected ws call: " + msg.type);
    },
  };
}
