/**
 * @module SunlightCompensation
 * Corrects outdoor enclosure solar heating from the device's own temperature
 * history. The monitor does not report a solar-heating flag, so the offset is
 * inferred from the series.
 *
 * Each sample, in order:
 *   1. Elapsed hours since the previous poll, floored at 0 and capped at 48 h.
 *   2. Exponential moving average of raw temperature, used only as a trend.
 *      The weight is the continuous-time form α = 1 − exp(−Δt / τ), so an
 *      irregular poll interval does not over-weight the new sample the way a
 *      fixed α would.
 *   3. Smoothed rate in °C/h, from that average. The first sample has no rate.
 *   4. Hysteresis. Solar mode starts at ≥ 1.37 °C/h and ends only once the
 *      rate falls to ≤ 0.73 °C/h. One threshold chatters when the rate sits
 *      on the cut.
 *   5. Heat load. Stored heat is decayed with exp(−Δt / 5.20 h) before the new
 *      delta is applied, including while the raw temperature is flat: that is
 *      the enclosure giving heat back to the air. While solar mode is active,
 *      a raw rise beyond 0.20 °C/h of allowed ambient warming is multiplied by
 *      0.925 and added. The gain is below 1 so a real warm-up is not fully
 *      removed. A raw fall always reduces the load by 0.80 of the drop; the
 *      rest is treated as real cooling. Removing the whole drop would hold the
 *      corrected temperature up through a genuine ambient fall.
 *   6. Corrected temperature = raw − heat load. The load is an offset in °C,
 *      so it is subtracted, not scaled.
 *
 * The load is clamped to 0…20 °C. 20 °C is a corruption ceiling for a bad
 * store blob, not a physical prediction. State is one store value so a restart
 * cannot observe a partially written update. Disabling the setting clears the
 * load; keeping it would apply an old sun correction to the next enabled sample.
 */

import Homey from 'homey';

/** Share of an excess rise stored as enclosure heat. Below 1 so a real ambient increase is only partly removed. */
export const SUNLIGHT_HEATING_GAIN = 0.925;

/** Share of a raw drop removed from the heat load. The remainder stays in the corrected temperature as real cooling. */
export const SUNLIGHT_COOLING_RECOVERY = 0.80;

/** Time constant (hours) of stored enclosure heat. The load is multiplied by exp(−Δt / this) before the new delta. */
export const SUNLIGHT_HEAT_DECAY_HOURS = 5.20;

/**
 * Warming (°C/h) treated as weather.
 * Only the rise above this rate, and only while solar mode is active, is added to the heat load.
 */
export const SUNLIGHT_ALLOWED_AMBIENT_RISE_PER_HOUR = 0.20;

/** Time constant (minutes) of the trend average. The sample weight is 1 − exp(−Δt / this). */
export const SUNLIGHT_TREND_SMOOTHING_MINUTES = 5.10;

/** Smoothed rate (°C/h) that enters solar-heating mode. Paired with a lower stop rate so the mode does not chatter. */
export const SUNLIGHT_HEATING_START_RATE = 1.37;

/** Smoothed rate (°C/h) that leaves solar-heating mode. The trend has to fall through this; touching the start rate is not enough. */
export const SUNLIGHT_HEATING_STOP_RATE = 0.73;

/** Upper bound on heat load (°C). Anything larger is a corrupt store value. */
export const MAX_SUNLIGHT_HEAT_LOAD = 20;

/**
 * Longest gap (hours) fed into decay, rate, and the allowed-ambient term.
 * Past this the stored heat has already decayed (time constant 5.2 h), and an
 * unbounded timestamp would make the allowed-ambient term arbitrarily large.
 */
export const MAX_ELAPSED_HOURS = 48;

const MS_PER_HOUR = 60 * 60 * 1000;
const STATE_STORE = 'sunlightCompensationState';

/** Recursive model state persisted between Homey polls. */
export interface SunlightCompensationState {
  sunlightHeatLoad: number;
  sunlightPreviousRawTemperature: number | null;
  sunlightSmoothedTemperature: number | null;
  sunlightSolarHeatingActive: boolean;
  sunlightLastUpdateTimestamp: number | null;
}

/** Result of one enabled compensation step. */
export interface SunlightCompensationResult {
  correctedTemperature: number;
  heatLoad: number;
  smoothedTemperature: number;
  solarHeatingActive: boolean;
  elapsedHours: number;
  smoothedRatePerHour: number;
}

/**
 * Homey entry point: load state, run one step (or clear if disabled), save the blob.
 * No-ops on drivers that do not expose the sunlight setting.
 *
 * @param device - Outdoor Homey device
 * @param temperature - Temperature before sunlight compensation (°C)
 */
export async function applySunlightCompensation(
  device: Homey.Device,
  temperature: number | undefined,
): Promise<number | undefined> {
  if (typeof device.getSetting('applySunlightCompensation') !== 'boolean') {
    return temperature;
  }

  if (temperature === undefined) {
    return temperature;
  }

  const state = loadState(device);
  const enabled = device.getSetting('applySunlightCompensation') as boolean;
  const now = Date.now();
  const log = Homey.env.DEBUG === 'true'
    ? (...args: unknown[]) => device.log(...args)
    : undefined;

  if (!enabled) {
    // Clear so a later re-enable does not reuse a stale heat load.
    clearState(state, temperature, now);
    log?.('[sunlight]', {
      enabled: false,
      rawTemperature: temperature,
      correctedTemperature: temperature,
      heatLoad: 0,
      solarHeatingActive: false,
    });
    await saveState(device, state);
    return temperature;
  }

  const result = processSunlightCompensation(temperature, state, now);

  state.sunlightHeatLoad = result.heatLoad;
  state.sunlightPreviousRawTemperature = temperature;
  state.sunlightSmoothedTemperature = result.smoothedTemperature;
  state.sunlightSolarHeatingActive = result.solarHeatingActive;
  state.sunlightLastUpdateTimestamp = now;

  log?.('[sunlight]', result);
  await saveState(device, state);
  return result.correctedTemperature;
}

/**
 * One sample of the compensation model.
 * Hysteresis is decided from the smoothed rate before the heat load is updated,
 * so this rise is classified from the trend and the previous state.
 *
 * @param rawTemperature - Current raw temperature (°C)
 * @param state - Prior persisted state
 * @param now - Sample time in epoch ms
 */
export function processSunlightCompensation(
  rawTemperature: number,
  state: SunlightCompensationState,
  now: number,
): SunlightCompensationResult {
  const elapsedHours = calculateElapsedHours(state.sunlightLastUpdateTimestamp, now);

  const smoothedTemperature = calculateSmoothedTemperature(
    rawTemperature,
    state.sunlightSmoothedTemperature,
    elapsedHours,
  );

  const smoothedRatePerHour = calculateSmoothedHeatingRate(
    smoothedTemperature,
    state.sunlightSmoothedTemperature,
    elapsedHours,
  );

  const solarHeatingActive = calculateHysteresisState(
    smoothedRatePerHour,
    state.sunlightSolarHeatingActive,
  );

  const heatLoad = calculateHeatLoad(
    rawTemperature,
    state.sunlightPreviousRawTemperature,
    state.sunlightHeatLoad,
    elapsedHours,
    solarHeatingActive,
  );

  const correctedTemperature = calculateCorrectedTemperature(rawTemperature, heatLoad);

  return {
    elapsedHours,
    smoothedTemperature,
    smoothedRatePerHour,
    solarHeatingActive,
    heatLoad,
    correctedTemperature,
  };
}

/**
 * Hours since the last sample, never negative and never above {@link MAX_ELAPSED_HOURS}.
 * A backwards clock would otherwise feed a negative gap into exp(−Δt / τ) and increase the load.
 * The upper cap keeps the allowed-ambient term finite when a stored timestamp is corrupt.
 * It also shortens the heating-rate denominator, so a multi-day gap is treated as a
 * faster change than it was; 48 h is long enough that stored heat has already decayed.
 *
 * @param previousTimestamp - Previous sample epoch ms, or null on first sample
 * @param now - Current sample epoch ms
 */
export function calculateElapsedHours(
  previousTimestamp: number | null,
  now: number,
): number {
  if (previousTimestamp === null) {
    return 0;
  }

  return Math.min(MAX_ELAPSED_HOURS, Math.max(0, (now - previousTimestamp) / MS_PER_HOUR));
}

/**
 * Trend average of raw temperature.
 * Seeded to the raw value on the first sample so the next rate is not invented
 * from a zero baseline. This series drives hysteresis only; the heat load uses
 * the raw delta, because smoothing would lag the enclosure rise the model is
 * trying to catch.
 *
 * @param rawTemperature - Current raw temperature (°C)
 * @param previousSmoothedTemperature - Prior smoothed value, or null on first sample
 * @param elapsedHours - Hours since the previous sample
 */
export function calculateSmoothedTemperature(
  rawTemperature: number,
  previousSmoothedTemperature: number | null,
  elapsedHours: number,
): number {
  if (previousSmoothedTemperature === null) {
    return rawTemperature;
  }

  const elapsedMinutes = elapsedHours * 60;
  const alpha = 1 - Math.exp(-elapsedMinutes / SUNLIGHT_TREND_SMOOTHING_MINUTES);
  return previousSmoothedTemperature + alpha * (rawTemperature - previousSmoothedTemperature);
}

/**
 * Smoothed °C/h rate for hysteresis.
 * Zero on the first sample and on a zero-length gap: dividing by a zero elapsed
 * time would mark every repeated poll as infinite heating.
 *
 * @param smoothedTemperature - Current smoothed temperature (°C)
 * @param previousSmoothedTemperature - Prior smoothed value, or null on first sample
 * @param elapsedHours - Hours since the previous sample
 */
export function calculateSmoothedHeatingRate(
  smoothedTemperature: number,
  previousSmoothedTemperature: number | null,
  elapsedHours: number,
): number {
  if (previousSmoothedTemperature === null || elapsedHours <= 0) {
    return 0;
  }

  return (smoothedTemperature - previousSmoothedTemperature) / elapsedHours;
}

/**
 * Solar-mode flag from separate start and stop rates.
 * While active, the mode stays on until the rate falls through the stop rate,
 * so a reading that oscillates around the start rate does not flip every poll.
 *
 * @param smoothedRatePerHour - Current smoothed warming rate (°C/h)
 * @param previouslyActive - Prior hysteresis state
 */
export function calculateHysteresisState(
  smoothedRatePerHour: number,
  previouslyActive: boolean,
): boolean {
  if (!previouslyActive) {
    return smoothedRatePerHour >= SUNLIGHT_HEATING_START_RATE;
  }

  return smoothedRatePerHour > SUNLIGHT_HEATING_STOP_RATE;
}

/**
 * Stored enclosure heat after this sample.
 * Decay is applied to the previous load before the new rise or drop, so heat
 * gained on this step is not immediately decayed away. A raw rise is absorbed
 * only while solar mode is active, and only past the allowed ambient warming.
 * A raw fall reduces the load whether or not solar mode is active: the enclosure
 * can cool after the sun has already dropped the trend below the stop rate.
 *
 * @param rawTemperature - Current raw temperature (°C)
 * @param previousRawTemperature - Prior raw temperature, or null on first sample
 * @param previousHeatLoad - Prior heat load (°C)
 * @param elapsedHours - Hours since the previous sample
 * @param solarHeatingActive - Current hysteresis state
 */
export function calculateHeatLoad(
  rawTemperature: number,
  previousRawTemperature: number | null,
  previousHeatLoad: number,
  elapsedHours: number,
  solarHeatingActive: boolean,
): number {
  let heatLoad = Math.max(0, previousHeatLoad)
    * Math.exp(-elapsedHours / SUNLIGHT_HEAT_DECAY_HOURS);

  if (previousRawTemperature !== null) {
    const rawDelta = rawTemperature - previousRawTemperature;

    if (rawDelta > 0 && solarHeatingActive) {
      const allowedAmbientRise = SUNLIGHT_ALLOWED_AMBIENT_RISE_PER_HOUR * elapsedHours;
      heatLoad += SUNLIGHT_HEATING_GAIN * Math.max(0, rawDelta - allowedAmbientRise);
    } else if (rawDelta < 0) {
      heatLoad -= SUNLIGHT_COOLING_RECOVERY * Math.abs(rawDelta);
    }
  }

  return Math.min(MAX_SUNLIGHT_HEAT_LOAD, Math.max(0, heatLoad));
}

/**
 * Ambient estimate reported to Homey.
 * The heat load is an enclosure offset in °C, so it is subtracted from the raw reading.
 *
 * @param rawTemperature - Current raw temperature (°C)
 * @param heatLoad - Estimated enclosure heat load (°C)
 */
export function calculateCorrectedTemperature(
  rawTemperature: number,
  heatLoad: number,
): number {
  return rawTemperature - heatLoad;
}

/**
 * Fills a missing or partial store blob.
 * The step functions test `=== null`. An undefined field from an older blob
 * would miss those tests and produce a NaN heat load.
 *
 * @param restored - Partial store value
 */
export function normalizeState(
  restored: Partial<SunlightCompensationState> = {},
): SunlightCompensationState {
  return {
    sunlightHeatLoad: restored.sunlightHeatLoad ?? 0,
    sunlightPreviousRawTemperature: restored.sunlightPreviousRawTemperature ?? null,
    sunlightSmoothedTemperature: restored.sunlightSmoothedTemperature ?? null,
    sunlightSolarHeatingActive: restored.sunlightSolarHeatingActive ?? false,
    sunlightLastUpdateTimestamp: restored.sunlightLastUpdateTimestamp ?? null,
  };
}

/**
 * Reads the compensation blob, or a blank state when none has been stored.
 * A missing key is the first poll, not a failure.
 *
 * @param device - Homey device with store access
 */
function loadState(device: Homey.Device): SunlightCompensationState {
  const stored = device.getStoreValue(STATE_STORE);
  if (stored && typeof stored === 'object') {
    return normalizeState(stored as Partial<SunlightCompensationState>);
  }

  return normalizeState();
}

/**
 * Persists state as one value so a restart cannot see a half-written update.
 *
 * @param device - Homey device with store access
 * @param state - Current compensation state
 */
async function saveState(
  device: Homey.Device,
  state: SunlightCompensationState,
): Promise<void> {
  await device.setStoreValue(STATE_STORE, { ...state });
}

/**
 * Resets model memory while disabled; keeps the latest raw as the seed point.
 *
 * @param state - Mutable compensation state
 * @param rawTemperature - Current raw temperature (°C)
 * @param now - Sample time in epoch ms
 */
function clearState(
  state: SunlightCompensationState,
  rawTemperature: number,
  now: number,
): void {
  state.sunlightHeatLoad = 0;
  state.sunlightPreviousRawTemperature = rawTemperature;
  state.sunlightSmoothedTemperature = rawTemperature;
  state.sunlightSolarHeatingActive = false;
  state.sunlightLastUpdateTimestamp = now;
}
