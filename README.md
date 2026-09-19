# Heat Pump Card

A configurable custom Lovelace card for Home Assistant, styled after the
built-in Energy dashboard (bars, small gauges, clean rows, an accent color
tied to the heat pump's current state). No entity IDs are hardcoded and
nothing is brand-specific — you map your own sensors to it, so it works
with any heat pump / any integration (`open3e-ha` over MQTT, `vicare`,
Modbus, a generic template sensor, whatever you have).

This folder is a self-contained HACS "plugin" repository (`hacs.json` +
the card + this README), so it installs like any other custom card
instead of being a manual file copy.

The energy section includes a live power-flow visualization whenever
`compressor_power` or `heat_output` is configured. It shows outdoor air,
electricity input, the heat pump, and delivered heat; directional animation
pauses naturally when a reading is unavailable or zero.

---

## Install via HACS (recommended — updates like any other card)

This card isn't in the default HACS store, so add it as a **custom
repository**:

1. Push the contents of this folder (`heatpump-card.js`, `hacs.json`,
   `README.md`) to a GitHub repo you own — e.g. `github.com/udochrist/heatpump-card`.
2. In Home Assistant: **HACS → ⋮ (top right) → Custom repositories**.
3. Add the repo URL, category **Dashboard**.
4. Find "Heat Pump Card" in HACS and click **Download**.
5. HACS registers the Lovelace resource automatically. Reload the
   frontend (or hard-refresh the browser).
6. Add a card of type `custom:heatpump-card` to any dashboard.

## Install manually (no GitHub repo needed)

1. Copy `heatpump-card.js` to `<config>/www/heatpump-card.js`.
2. **Settings → Dashboards → ⋮ → Resources → Add Resource**
   - URL: `/local/heatpump-card.js`
   - Resource type: `JavaScript Module`
3. Reload the frontend.
4. Add a card of type `custom:heatpump-card`.

---

## Config shape

```yaml
type: custom:heatpump-card
title: Heat Pump                  # optional
sections: [temperatures, dhw, energy, status]   # optional, default: all four
state_colors:                     # optional, overrides/extends defaults
  heating: "#e64a19"
  dhw: "#039be5"
entities:
  <channel>: sensor.your_entity
  # or, for anything needing a max/label/icon override:
  <channel>:
    entity: sensor.your_entity
    name: "Custom label"          # optional
    icon: mdi:whatever            # optional
    unit: kW                      # optional override
    max: 3000                     # required for bar/gauge-type channels
    decimals: 1                   # optional
```

### Known channels (pre-styled)

| key | section | display |
|---|---|---|
| `outdoor_temp`, `flow_temp`, `return_temp`, `room_temp`, `target_flow_temp` | temperatures | plain °C value |
| `dhw_temp`, `dhw_target_temp` | dhw | plain °C value |
| `compressor_power` | energy | bar (needs `max`, watts) |
| `heat_output` | energy | bar (needs `max`, watts) |
| `cop` | energy | small gauge, color-coded (red <2, orange 2–3.5, green ≥3.5) |
| `volume_flow`, `energy_today` | energy | plain value |
| `compressor_speed` | status | percent bar |
| `mode` | status | plain text |
| `state` | status | colored pill **and** drives the card's header badge/accent color |
| `fault` | status | plain text |

Any key you add that isn't in this list still renders (as a plain value
row in whichever `sections` list it falls under), so you can point it at
anything without editing the card.

## Full example (single combined card)

```yaml
type: custom:heatpump-card
title: Heat Pump
entities:
  outdoor_temp: sensor.heatpump_outside_temperature
  flow_temp: sensor.heatpump_flow_temperature
  return_temp: sensor.heatpump_return_temperature
  target_flow_temp: sensor.heatpump_flow_temperature_setpoint
  dhw_temp: sensor.heatpump_dhw_temperature
  dhw_target_temp: sensor.heatpump_dhw_target_temperature
  compressor_power:
    entity: sensor.heatpump_compressor_electrical_power
    max: 3000
  heat_output:
    entity: sensor.heatpump_heat_output
    max: 8000
  cop: sensor.heatpump_cop
  volume_flow: sensor.heatpump_volume_flow
  compressor_speed: sensor.heatpump_compressor_speed
  mode: sensor.heatpump_operating_mode
  state: sensor.heatpump_operating_state
```

## Splitting into per-aspect cards

Same `entities` block, different `sections:` per card — put these in a
horizontal-stack, separate dashboard views, or as tabs:

```yaml
type: custom:heatpump-card
title: Temperatures
sections: [temperatures]
entities: *heatpump_entities   # YAML anchor, or just repeat the block

---
type: custom:heatpump-card
title: Hot Water
sections: [dhw]
entities: *heatpump_entities

---
type: custom:heatpump-card
title: Energy & COP
sections: [energy]
entities: *heatpump_entities

---
type: custom:heatpump-card
title: Status
sections: [status]
entities: *heatpump_entities
```

(YAML anchors only work if you're editing `ui-lovelace.yaml` / a YAML-mode
dashboard directly — in the visual editor, just paste the same
`entities:` block into each card.)

## Notes on `open3e-ha` / MQTT-sourced entities

Since integrations like `open3e-ha` publish to MQTT topics (e.g.
`open3e/680_274_OutsideTemperatureSensor/Actual`) and you map those to HA
entities yourself, there's no fixed entity-ID convention to hardcode
against — that's exactly why every channel above is opt-in and
user-mapped. If you paste your actual entity IDs (or the source YAML that
generates them), I can generate a filled-in `entities:` block for you.
