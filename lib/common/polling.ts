/**
 * @module Polling
 * One timer per device, cleared before it is replaced.
 * Ad-hoc intervals leaked handles when a settings change and an mDNS restart overlapped.
 */

import Homey = require('homey/lib/Homey');

/** Fallback poll interval when a device setting omits `pollingInterval`. */
export const DEFAULT_POLL_INTERVAL_MS = 60_000;

export interface StartPollingOptions {
  pollInterval?: number;
}

type PollFunction = () => void | Promise<void>;

/**
 * Owns one recurring poll timer per device.
 *
 * Replaces ad-hoc `setInterval` / `clearInterval` so restarts (settings changes,
 * discovery) always clear the previous handle before scheduling anew.
 */
export default class Polling {
  private readonly homey: Homey;
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  /**
   * @param homey - Homey instance used for timers and error logging
   */
  constructor(homey: Homey) {
    this.homey = homey;
  }

  /**
   * Replaces any previous timer, runs once immediately, then on the interval.
   * Waiting a full interval after init or a settings change would leave the tile stale.
   *
   * @param pollFn - Work executed on start and every tick
   * @param options - Optional interval override in milliseconds
   */
  start(pollFn: PollFunction, options: StartPollingOptions = {}): void {
    const pollInterval = options.pollInterval ?? DEFAULT_POLL_INTERVAL_MS;

    this.stop();
    this.run(pollFn);
    this.interval = this.homey.setInterval(() => this.run(pollFn), pollInterval);
  }

  /**
   * Runs one tick, skipping it while a previous poll is still outstanding.
   * Without this a poll slower than the interval would overlap with the next.
   *
   * @param pollFn - Work to execute for this tick
   */
  private run(pollFn: PollFunction): void {
    if (this.running) {
      return;
    }

    this.running = true;
    Promise.resolve(pollFn())
      .catch((error) => this.homey.error('[Polling] Poll failed:', error))
      .finally(() => {
        this.running = false;
      });
  }

  /**
   * Clears the active interval so lifecycle hooks and restarts do not leak timers.
   * Safe to call when no interval is running; a later `start` may schedule again.
   */
  stop(): void {
    if (this.interval) {
      this.homey.clearInterval(this.interval);
      this.interval = null;
    }
  }
}
