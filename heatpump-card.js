/**
 * Heat Pump Card
 * A configurable custom Lovelace card for Home Assistant, styled in the
 * spirit of HA's built-in Energy dashboard cards (bars, gauges, clean rows).
 *
 * Works with any entity source (open3e-ha / MQTT, ViCare integration, etc.)
 * since you map your own entity IDs to semantic "channels" in the config.
 * Nothing is hardcoded to a specific integration.
 *
 * --------------------------------------------------------------------
 * Installation
 * --------------------------------------------------------------------
 * 1. Copy this file to <config>/www/heatpump-card.js
 * 2. Settings -> Dashboards -> Resources -> Add Resource
 *      URL:  /local/heatpump-card.js
 *      Type: JavaScript Module
 * 3. Add a card with type: custom:heatpump-card (see example YAML below,
 *    or in the companion README).
 *
 * --------------------------------------------------------------------
 * Minimal example
 * --------------------------------------------------------------------
 * type: custom:heatpump-card
 * title: Heat Pump
 * entities:
 *   outdoor_temp: sensor.heatpump_outside_temperature
 *   flow_temp: sensor.heatpump_flow_temperature
 *   return_temp: sensor.heatpump_return_temperature
 *   dhw_temp: sensor.heatpump_dhw_temperature
 *   dhw_target_temp: sensor.heatpump_dhw_target_temperature
 *   compressor_power:
 *     entity: sensor.heatpump_compressor_power
 *     max: 3000
 *   heat_output:
 *     entity: sensor.heatpump_heat_output
 *     max: 8000
 *   cop: sensor.heatpump_cop
 *   compressor_speed: sensor.heatpump_compressor_speed
 *   volume_flow: sensor.heatpump_volume_flow
 *   mode: sensor.heatpump_operating_mode
 *   state: sensor.heatpump_operating_state
 *
 * To split into separate per-aspect cards, add multiple card instances
 * with the same entities block but different `sections:`, e.g.:
 *   sections: [temperatures]
 *   sections: [energy]
 *   sections: [dhw]
 *   sections: [status]
 */

const CARD_VERSION = "1.0.0";

// Metadata describing each known "channel". Anything the user configures
// under `entities` that isn't in this list is still rendered (as a plain
// value row in the "status" section) so the card never silently drops
// something you point it at.
const CHANNELS = {
  outdoor_temp: { section: "temperatures", label: "Outdoor", icon: "mdi:thermometer", type: "temp" },
  flow_temp: { section: "temperatures", label: "Flow", icon: "mdi:thermometer-chevron-up", type: "temp" },
  return_temp: { section: "temperatures", label: "Return", icon: "mdi:thermometer-chevron-down", type: "temp" },
  room_temp: { section: "temperatures", label: "Room", icon: "mdi:home-thermometer-outline", type: "temp" },
  target_flow_temp: { section: "temperatures", label: "Flow Target", icon: "mdi:target", type: "temp" },

  dhw_temp: { section: "dhw", label: "Hot Water", icon: "mdi:water-thermometer", type: "temp" },
  dhw_target_temp: { section: "dhw", label: "Hot Water Target", icon: "mdi:water-thermometer-outline", type: "temp" },

  compressor_power: { section: "energy", label: "Compressor Power", icon: "mdi:flash", type: "bar", color: "#ff9800" },
  heat_output: { section: "energy", label: "Heat Output", icon: "mdi:radiator", type: "bar", color: "#e64a19" },
  cop: { section: "energy", label: "COP", icon: "mdi:gauge", type: "gauge", min: 0, max: 6 },
  volume_flow: { section: "energy", label: "Volume Flow", icon: "mdi:pump", type: "value" },
  energy_today: { section: "energy", label: "Energy Today", icon: "mdi:lightning-bolt", type: "value" },

  compressor_speed: { section: "status", label: "Compressor Speed", icon: "mdi:speedometer", type: "percent" },
  mode: { section: "status", label: "Mode", icon: "mdi:cog-outline", type: "text" },
  valve_position: { section: "status", label: "Valve Position", icon: "mdi:valve", type: "text" },
  state: { section: "status", label: "State", icon: "mdi:information-outline", type: "text", badge: true },
  fault: { section: "status", label: "Fault", icon: "mdi:alert-circle-outline", type: "text" },
};

const SECTION_TITLES = {
  temperatures: "Temperatures",
  dhw: "Hot Water",
  energy: "Energy & Performance",
  status: "Status",
  visualization: "Visualization",
};

const SECTION_ORDER = ["temperatures", "dhw", "energy", "status", "visualization"];

// State-name -> accent colour, used for the header badge and the card's
// left accent bar (loosely mirrors how the Energy dashboard colour-codes
// flows). Extend/override via config.state_colors.
const DEFAULT_STATE_COLORS = {
  heating: "#e64a19",
  heat: "#e64a19",
  dhw: "#039be5",
  hot_water: "#039be5",
  defrost: "#8e24aa",
  cooling: "#00acc1",
  idle: "#9e9e9e",
  off: "#9e9e9e",
  standby: "#9e9e9e",
};

function fmt(value, decimals) {
  if (value === undefined || value === null || Number.isNaN(value)) return "–";
  if (typeof value !== "number") return String(value);
  if (decimals === undefined) decimals = Math.abs(value) < 10 ? 1 : 0;
  return value.toFixed(decimals);
}

class HeatpumpCard extends HTMLElement {
  static getStubConfig() {
    return {
      title: "Heat Pump",
      entities: {
        outdoor_temp: "",
        flow_temp: "",
        return_temp: "",
        dhw_temp: "",
        dhw_target_temp: "",
        compressor_power: "",
        heat_output: "",
        cop: "",
        compressor_speed: "",
        mode: "",
        state: "",
      },
      sections: ["temperatures", "dhw", "energy", "status", "visualization"],
    };
  }

  setConfig(config) {
    if (!config || !config.entities) {
      throw new Error("heatpump-card: 'entities' is required in the card config");
    }
    this._config = config;
    this._sections = (config.sections && config.sections.length)
      ? config.sections.filter((s) => SECTION_ORDER.includes(s))
      : SECTION_ORDER;
    this._stateColors = Object.assign({}, DEFAULT_STATE_COLORS, config.state_colors || {});
    this._built = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) {
      this._buildStaticShell();
      this._built = true;
    }
    this._render();
  }

  getCardSize() {
    return 1 + this._sections.length * 2;
  }

  // ---- config normalisation -------------------------------------------

  _channelDef(key) {
    return CHANNELS[key] || { section: "status", label: key, icon: "mdi:help-circle-outline", type: "value" };
  }

  _channelConfig(key) {
    const raw = this._config.entities[key];
    if (raw === undefined || raw === null || raw === "") return null;
    if (typeof raw === "string") return { entity: raw };
    return raw; // object form: { entity, name, icon, unit, max, min, decimals }
  }

  _entries() {
    return Object.keys(this._config.entities)
      .map((key) => {
        const cfg = this._channelConfig(key);
        if (!cfg || !cfg.entity) return null;
        const def = this._channelDef(key);
        return { key, cfg, def };
      })
      .filter(Boolean);
  }

  // ---- shell (built once) ----------------------------------------------

  _buildStaticShell() {
    const root = document.createElement("style");
    root.textContent = this._css();

    const card = document.createElement("ha-card");
    card.appendChild(root);

    const header = document.createElement("div");
    header.className = "hp-header";
    header.innerHTML = `
      <div class="hp-header-left">
        <ha-icon class="hp-icon" icon="mdi:heat-pump-outline"></ha-icon>
        <div class="hp-title">${this._config.title || "Heat Pump"}</div>
      </div>
      <div class="hp-badge" part="badge"></div>
    `;
    card.appendChild(header);

    const body = document.createElement("div");
    body.className = "hp-body";
    card.appendChild(body);
    this._bodyEl = body;
    this._badgeEl = header.querySelector(".hp-badge");
    this._cardEl = card;

    this.innerHTML = "";
    this.appendChild(card);

    // Build one container per configured section, in fixed order, and
    // remember refs so re-render just updates values, not DOM structure.
    this._sectionEls = {};
    this._rowEls = {};
    for (const section of this._sections) {
      const wrap = document.createElement("div");
      wrap.className = "hp-section";
      const h = document.createElement("div");
      h.className = "hp-section-title";
      h.textContent = SECTION_TITLES[section] || section;
      wrap.appendChild(h);
      const rows = document.createElement("div");
      rows.className = "hp-rows";
      if (section === "visualization") {
        const flow = document.createElement("div");
        flow.className = "hp-flow";
        wrap.appendChild(flow);
        this._flowEl = flow;
      }
      wrap.appendChild(rows);
      body.appendChild(wrap);
      this._sectionEls[section] = { wrap, rows };
    }
  }

  // ---- render (every hass update) ---------------------------------------

  _render() {
    if (!this._hass) return;
    const entries = this._entries();

    // Group by each channel's owning section. Inactive sections do not receive rows.
    const bySection = {};
    for (const e of entries) {
      const section = e.def.section;
      if (!this._sections.includes(section)) continue;
      (bySection[section] = bySection[section] || []).push(e);
    }

    // header badge: prefer explicit "state" channel
    const stateEntry = entries.find((e) => e.key === "state");
    let badgeText = "";
    let accent = "var(--primary-color)";
    if (stateEntry) {
      const st = this._hass.states[stateEntry.cfg.entity];
      if (st) {
        badgeText = this._hass.formatEntityState
          ? this._hass.formatEntityState(st)
          : st.state;
        const norm = (st.state || "").toLowerCase().replace(/\s+/g, "_");
        accent = this._stateColors[norm] || accent;
      }
    }
    this._badgeEl.textContent = badgeText;
    this._badgeEl.style.color = accent;
    this._badgeEl.style.borderColor = accent;
    this._cardEl.style.setProperty("--hp-accent", accent);
    this._renderFlow(this._sections.includes("visualization") ? entries : []);

    for (const section of this._sections) {
      const { wrap, rows } = this._sectionEls[section];
      const list = bySection[section] || [];
      const hasVisualization = section === "visualization"
        && this._flowEl
        && this._flowEl.style.display !== "none";
      wrap.style.display = list.length || hasVisualization ? "" : "none";
      rows.innerHTML = "";
      for (const entry of list) {
        rows.appendChild(this._renderRow(entry));
      }
    }
  }

  _renderRow(entry) {
    const { cfg, def } = entry;
    const stateObj = this._hass.states[cfg.entity];
    const icon = cfg.icon || def.icon;
    const label = cfg.name || def.label;
    const row = document.createElement("div");
    row.className = "hp-row";
    row.title = cfg.entity;
    row.addEventListener("click", () => this._moreInfo(cfg.entity));

    if (!stateObj) {
      row.classList.add("hp-unavailable");
      row.innerHTML = `
        <ha-icon icon="${icon}"></ha-icon>
        <div class="hp-row-label">${label}</div>
        <div class="hp-row-value">not found</div>
      `;
      return row;
    }

    const rawValue = cfg.attribute !== undefined
      ? stateObj.attributes[cfg.attribute]
      : stateObj.state;
    const numeric = parseFloat(rawValue);
    const hasNumeric = !Number.isNaN(numeric);
    const unit = cfg.unit || stateObj.attributes.unit_of_measurement || "";
    const decimals = cfg.decimals;

    let valueHtml = "";
    let extraHtml = "";

    switch (def.type) {
      case "temp": {
        valueHtml = `<span class="hp-num">${fmt(numeric, decimals)}</span><span class="hp-unit">${unit || "°C"}</span>`;
        break;
      }
      case "percent": {
        const pct = hasNumeric ? Math.max(0, Math.min(100, numeric)) : 0;
        valueHtml = `<span class="hp-num">${fmt(numeric, decimals !== undefined ? decimals : 0)}</span><span class="hp-unit">${unit || "%"}</span>`;
        extraHtml = `<div class="hp-bar-track"><div class="hp-bar-fill" style="width:${pct}%;background:var(--hp-accent)"></div></div>`;
        break;
      }
      case "bar": {
        const max = cfg.max !== undefined ? cfg.max : (def.max || 100);
        const pct = hasNumeric && max > 0 ? Math.max(0, Math.min(100, (numeric / max) * 100)) : 0;
        const color = cfg.color || def.color || "var(--hp-accent)";
        valueHtml = `<span class="hp-num">${fmt(numeric, decimals)}</span><span class="hp-unit">${unit}</span>`;
        extraHtml = `<div class="hp-bar-track"><div class="hp-bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
        break;
      }
      case "gauge": {
        const min = cfg.min !== undefined ? cfg.min : (def.min || 0);
        const max = cfg.max !== undefined ? cfg.max : (def.max || 6);
        const pct = hasNumeric ? Math.max(0, Math.min(100, ((numeric - min) / (max - min)) * 100)) : 0;
        const color = numeric >= (cfg.good || 3.5) ? "#43a047" : numeric >= (cfg.ok || 2) ? "#fb8c00" : "#e53935";
        valueHtml = `<span class="hp-num" style="color:${hasNumeric ? color : "inherit"}">${fmt(numeric, decimals !== undefined ? decimals : 2)}</span><span class="hp-unit">${unit}</span>`;
        extraHtml = `<div class="hp-bar-track"><div class="hp-bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
        break;
      }
      case "text": {
        const display = this._hass.formatEntityState ? this._hass.formatEntityState(stateObj) : stateObj.state;
        if (def.badge) {
          const norm = (stateObj.state || "").toLowerCase().replace(/\s+/g, "_");
          const color = this._stateColors[norm];
          valueHtml = color
            ? `<span class="hp-pill" style="background:${color}22;color:${color}">${display}</span>`
            : `<span class="hp-num">${display}</span>`;
        } else {
          valueHtml = `<span class="hp-num">${display}</span>`;
        }
        break;
      }
      default: {
        const display = hasNumeric ? fmt(numeric, decimals) : (this._hass.formatEntityState ? this._hass.formatEntityState(stateObj) : stateObj.state);
        valueHtml = `<span class="hp-num">${display}</span><span class="hp-unit">${hasNumeric ? unit : ""}</span>`;
      }
    }

    row.innerHTML = `
      <ha-icon icon="${icon}"></ha-icon>
      <div class="hp-row-main">
        <div class="hp-row-top">
          <div class="hp-row-label">${label}</div>
          <div class="hp-row-value">${valueHtml}</div>
        </div>
        ${extraHtml}
      </div>
    `;
    return row;
  }

  _renderFlow(entries) {
    if (!this._flowEl) return;

    const getEntry = (key) => entries.find((entry) => entry.key === key);
    const getValue = (key, fallbackUnit) => {
      const entry = getEntry(key);
      if (!entry) return null;
      const stateObj = this._hass.states[entry.cfg.entity];
      if (!stateObj || stateObj.state === "unavailable" || stateObj.state === "unknown") return null;
      const numeric = parseFloat(stateObj.state);
      if (Number.isNaN(numeric)) return null;
      return {
        numeric,
        text: `${fmt(numeric, entry.cfg.decimals)} ${entry.cfg.unit || stateObj.attributes.unit_of_measurement || fallbackUnit || "W"}`,
      };
    };

    const compressor = getValue("compressor_power");
    const heat = getValue("heat_output");
    const flowTemp = getValue("flow_temp", "°C");
    const returnTemp = getValue("return_temp", "°C");
    const hasFlowData = compressor || heat;
    this._flowEl.style.display = hasFlowData ? "" : "none";
    if (!hasFlowData) return;

    const outdoorEntry = getEntry("outdoor_temp");
    const outdoorState = outdoorEntry ? this._hass.states[outdoorEntry.cfg.entity] : null;
    const outdoorValue = outdoorState && !Number.isNaN(parseFloat(outdoorState.state))
      ? `${fmt(parseFloat(outdoorState.state), outdoorEntry.cfg.decimals)} ${outdoorEntry.cfg.unit || outdoorState.attributes.unit_of_measurement || "°C"}`
      : "Outdoor air";

    const ambientPower = compressor && heat ? Math.max(0, heat.numeric - compressor.numeric) : null;
    const powerUnit = (getEntry("heat_output") && (getEntry("heat_output").cfg.unit || "W")) || "W";
    const ambientText = ambientPower === null ? "No reading" : `${fmt(ambientPower)} ${powerUnit}`;
    const hasDhw = Boolean(getEntry("dhw_temp"));
    const heatingText = heat ? heat.text : "No reading";
    const total = Math.max(heat ? heat.numeric : 0, compressor ? compressor.numeric : 0, 1);
    const strokeWidth = (value) => Math.max(2, Math.min(11, (value / total) * 11));
    const electricWidth = compressor ? strokeWidth(compressor.numeric) : 2;
    const ambientWidth = ambientPower === null ? 2 : strokeWidth(ambientPower);
    const outputWidth = heat ? strokeWidth(heat.numeric) : 2;
    const refrigerantWidth = flowTemp || returnTemp ? 4 : 2;
    const activeClass = (value) => value > 0 ? " hp-flow-active" : "";
    this._flowEl.innerHTML = `
      <div class="hp-flow-heading">Power flow</div>
      <div class="hp-flow-diagram">
        <svg class="hp-flow-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path class="hp-flow-link hp-flow-electric-link${activeClass(compressor ? compressor.numeric : 0)}" style="--flow-width:${electricWidth}" d="M 22 25 C 29 25, 33 42, 36 48" />
          <path class="hp-flow-link hp-flow-ambient-link${activeClass(ambientPower || 0)}" style="--flow-width:${ambientWidth}" d="M 22 75 C 34 75, 45 69, 56 56" />
          <path class="hp-flow-link hp-flow-refrigerant-link${activeClass(flowTemp ? 1 : 0)}" style="--flow-width:${refrigerantWidth}" d="M 48 47 C 52 47, 53 47, 57 47" />
          <path class="hp-flow-link hp-flow-return-link${activeClass(returnTemp ? 1 : 0)}" style="--flow-width:${refrigerantWidth}" d="M 57 53 C 53 53, 52 53, 48 53" />
          <path class="hp-flow-link hp-flow-output-link${activeClass(heat ? heat.numeric : 0)}" style="--flow-width:${outputWidth}" d="M 67 50 C 72 44, 73 25, 78 25" />
        </svg>
        <div class="hp-flow-node hp-flow-electricity">
          <ha-icon icon="mdi:transmission-tower"></ha-icon>
          <span>Grid</span>
          <strong>${compressor ? compressor.text : "No reading"}</strong>
        </div>
        <div class="hp-flow-node hp-flow-outdoor">
          <ha-icon icon="mdi:air-filter"></ha-icon>
          <span>Outdoor air</span>
          <strong>${outdoorValue}</strong>
          <small>${ambientText}</small>
        </div>
        <div class="hp-flow-node hp-flow-compressor">
          <ha-icon icon="mdi:engine"></ha-icon>
          <span>Compressor</span>
          <strong>${compressor ? compressor.text : "No reading"}</strong>
        </div>
        <div class="hp-flow-refrigerant-label${flowTemp || returnTemp ? "" : " hp-flow-muted"}">
          Flow <strong>${flowTemp ? flowTemp.text : "--"}</strong><br>
          Return <strong>${returnTemp ? returnTemp.text : "--"}</strong>
        </div>
        <div class="hp-flow-node hp-flow-exchanger">
          <ha-icon icon="mdi:heat-exchanger"></ha-icon>
          <span>Heat exchanger</span>
          <strong>${heat ? heat.text : "No reading"}</strong>
        </div>
        <div class="hp-flow-node hp-flow-heating">
          <ha-icon icon="mdi:home"></ha-icon>
          <span>${hasDhw ? "Home + water" : "Home"}</span>
          <strong>${heatingText}</strong>
        </div>
      </div>
    `;
  }

  _moreInfo(entityId) {
    const event = new Event("hass-more-info", { bubbles: true, composed: true });
    event.detail = { entityId };
    this.dispatchEvent(event);
  }

  _css() {
    return `
      ha-card {
        padding: 0;
        overflow: hidden;
        border-radius: var(--ha-card-border-radius, 12px);
      }
      .hp-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.08));
      }
      .hp-header-left { display: flex; align-items: center; gap: 8px; }
      .hp-icon { color: var(--hp-accent, var(--primary-color)); --mdc-icon-size: 22px; }
      .hp-title { font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
      .hp-badge {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: .03em;
        padding: 2px 10px;
        border-radius: 999px;
        border: 1px solid currentColor;
      }
      .hp-body { padding: 4px 16px 12px; }
      .hp-section { margin-top: 10px; }
      .hp-section-title {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: var(--secondary-text-color);
        margin: 8px 0 4px;
      }
      .hp-rows { display: flex; flex-direction: column; }
      .hp-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 7px 4px;
        border-radius: 8px;
        cursor: pointer;
      }
      .hp-row:hover { background: var(--secondary-background-color); }
      .hp-row ha-icon { color: var(--paper-item-icon-color, #808080); flex: none; }
      .hp-row-main { flex: 1; min-width: 0; }
      .hp-row-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
      .hp-row-label { color: var(--primary-text-color); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hp-row-value { font-size: 14px; white-space: nowrap; }
      .hp-num { font-weight: 600; color: var(--primary-text-color); }
      .hp-unit { font-size: 12px; color: var(--secondary-text-color); margin-left: 2px; }
      .hp-pill { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
      .hp-bar-track {
        margin-top: 4px;
        height: 6px;
        border-radius: 3px;
        background: var(--secondary-background-color, #e0e0e0);
        overflow: hidden;
      }
      .hp-bar-fill { height: 100%; border-radius: 3px; transition: width .3s ease; }
      .hp-unavailable .hp-row-value { color: var(--secondary-text-color); font-style: italic; }
      .hp-flow {
        margin: 4px 0 14px;
        padding: 12px;
        border: 1px solid var(--divider-color, rgba(0,0,0,0.08));
        border-radius: 10px;
        background: color-mix(in srgb, var(--secondary-background-color, #f5f5f5) 55%, transparent);
      }
      .hp-flow-heading {
        color: var(--secondary-text-color);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .06em;
        margin-bottom: 10px;
        text-transform: uppercase;
      }
      .hp-flow-diagram {
        min-height: 158px;
        position: relative;
      }
      .hp-flow-links { height: 100%; left: 0; overflow: visible; position: absolute; top: 0; width: 100%; }
      .hp-flow-link { fill: none; stroke: var(--divider-color, #bdbdbd); stroke-linecap: round; stroke-width: var(--flow-width, 2); vector-effect: non-scaling-stroke; }
      .hp-flow-electric-link { stroke: #ff9800; }
      .hp-flow-ambient-link { stroke: #039be5; }
      .hp-flow-refrigerant-link { stroke: #43a047; }
      .hp-flow-return-link { stroke: #0288d1; }
      .hp-flow-output-link { stroke: #e64a19; }
      .hp-flow-active { stroke-dasharray: 2 4; animation: hp-flow-move .8s linear infinite; }
      .hp-flow-node {
        align-items: center;
        background: var(--card-background-color, var(--ha-card-background, #fff));
        border: 2px solid var(--divider-color, rgba(0,0,0,0.1));
        border-radius: 50%;
        display: flex;
        flex-direction: column;
        gap: 3px;
        height: 70px;
        justify-content: center;
        min-width: 70px;
        padding: 4px;
        position: absolute;
        text-align: center;
        transform: translate(-50%, -50%);
        width: 70px;
        z-index: 1;
      }
      .hp-flow-node ha-icon { color: var(--primary-text-color); --mdc-icon-size: 22px; }
      .hp-flow-node span { color: var(--primary-text-color); font-size: 10px; line-height: 1.15; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hp-flow-node strong { color: var(--secondary-text-color); font-size: 10px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hp-flow-node small { color: var(--secondary-text-color); font-size: 9px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hp-flow-electricity { left: 13%; top: 25%; }
      .hp-flow-outdoor { left: 13%; top: 75%; }
      .hp-flow-compressor { border-color: #ff9800; left: 42%; top: 50%; }
      .hp-flow-exchanger { border-color: #43a047; left: 62%; top: 50%; }
      .hp-flow-refrigerant-label { background: var(--card-background-color, var(--ha-card-background, #fff)); border-radius: 4px; color: #43a047; font-size: 9px; left: 52%; line-height: 1.15; padding: 2px 4px; position: absolute; text-align: center; top: 28%; transform: translate(-50%, -50%); z-index: 2; }
      .hp-flow-refrigerant-label strong { font-size: 10px; }
      .hp-flow-muted { color: var(--secondary-text-color); opacity: .7; }
      .hp-flow-heating { left: 87%; top: 25%; }
      @keyframes hp-flow-move { to { stroke-dashoffset: -6; } }
      @media (prefers-reduced-motion: reduce) { .hp-flow-active { animation: none; } }
      @media (max-width: 360px) {
        .hp-flow { padding: 8px 5px; }
        .hp-flow-diagram { min-height: 145px; }
        .hp-flow-node { height: 62px; min-width: 62px; width: 62px; }
        .hp-flow-node span { font-size: 9px; }
        .hp-flow-node strong { font-size: 10px; }
      }
    `;
  }
}

customElements.define("heatpump-card", HeatpumpCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "heatpump-card",
  name: "Heat Pump Card",
  description: "Configurable dashboard card for any heat pump (temperatures, energy/COP, DHW, status). Works with any entity source (open3e-ha, ViCare, generic MQTT, template sensors, etc.).",
});

console.info(
  `%c HEATPUMP-CARD %c v${CARD_VERSION} `,
  "color: white; background: #e64a19; font-weight: 700;",
  "color: #e64a19; background: transparent; font-weight: 700;"
);
