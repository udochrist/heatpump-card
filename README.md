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

The energy section includes a live, Energy-dashboard-style power-flow
visualization whenever `compressor_power`, `heat_output`, or
`aux_heater_power` is configured. It shows energy from the available source
flowing into the compressor and auxiliary heater. The diagram shows a heating
heat exchanger between the compressor and buffer, with a branch to Home, and a
separate hot-water heat exchanger between the buffer and Hot water. This
matches systems where a buffer tank stores the heated water and both central
heating and DHW are drawn from it via heat exchange rather than heated directly.
Flow widths are proportional to the readings; ambient energy is estimated as
`heat_output - compressor_power`. `flow_temp`, `return_temp`, and
`volume_flow` are shown in the heating heat exchanger. If your system has a
supplemental electric heating element
(backup/immersion heater), map it to `aux_heater_power` and it appears as a
node feeding the buffer alongside the compressor. If `dhw_temp` is
configured, the buffer feeds the hot-water heat exchanger as well as the
heating side; otherwise it stays a single "Home" output.
Nodes are laid out so none of them overlap.

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
sections: [temperatures, dhw, energy, status, smartgrid, visualization]   # optional, default: all six
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
    attribute: temperature        # optional HA state attribute instead of state
    max: 3000                     # required for bar/gauge-type channels — a literal number,
                                   # or an entity ID (e.g. a `number.` entity) to track a
                                   # runtime-adjustable cap instead of a fixed value
    decimals: 1                   # optional
```

### Known channels (pre-styled)

| key | section | display |
|---|---|---|
| `outdoor_temp`, `flow_temp`, `return_temp`, `room_temp`, `target_flow_temp` | temperatures | plain °C value |
| `dhw_temp`, `dhw_target_temp` | dhw | plain °C value |
| `compressor_power` | energy | bar (needs `max`, watts) |
| `heat_output` | energy | bar (needs `max`, watts) |
| `aux_heater_power` | energy | bar (needs `max`, watts) — supplemental electric heating element |
| `cop` | energy | small gauge, color-coded (red <2, orange 2–3.5, green ≥3.5) |
| `volume_flow`, `energy_today` | energy | plain value |
| `compressor_speed` | energy | percent bar |
| `mode` | energy | plain text |
| `state` | status | colored pill **and** drives the card's header badge/accent color |
| `fault` | status | plain text |
| `smartgrid_status` | smartgrid | plain text (e.g. an enum sensor like open3e-ha's `smart_grid_ready_consolidator`) |
| `smartgrid_enable` | smartgrid | Smart Grid enable state (DID `2560.0`) |
| `smartgrid_room_heating_offset` | smartgrid | Room heating setpoint increase (DID `2543.0`, usually K) |
| `smartgrid_dhw_offset` | smartgrid | DHW setpoint increase (DID `2543.2`, usually K) |
| `smartgrid_buffer_offset` | smartgrid | Heating-water buffer setpoint increase (DID `2543.3`, usually K) |
| `smartgrid_room_cooling_offset` | smartgrid | Room cooling setpoint adjustment (DID `2543.1`, usually K) |
| `smartgrid_booster_allowance` | smartgrid | Electric booster / immersion-heater allowance (DID `2544.0`) |
| `smartgrid_max_power` | smartgrid | plain value — the heat pump's live power cap, useful alongside a `number.`-entity `max` on `aux_heater_power` |
| `smartgrid_lock`, `smartgrid_boost` | smartgrid | plain text — whether the smart-grid lock/boost override is currently armed for the heat pump |

For newer E3-control models, map these channels to the corresponding entities
created for DIDs `2560.0`, `2543.0`, `2543.2`, `2543.3`, `2543.1`, and
`2544.0`. The card displays their current values; changing them remains the
responsibility of the Home Assistant `number` or service entity.

The `visualization` section contains the power-flow diagram. It is shown only
when that section is active and the configured power sensors have numeric data.

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
  aux_heater_power:
    entity: sensor.heatpump_aux_heater_power
    max: 6000
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

---
type: custom:heatpump-card
title: Power Flow
sections: [visualization]
entities: *heatpump_entities
```

Giving the power-flow diagram its own card (`sections: [visualization]`) lets
it stretch to the card's full width instead of sharing space with the other
sections — useful if you find it cramped inside the combined card.

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
