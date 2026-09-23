/**
 * @module Request
 * Error classification and host validation shared by the local and cloud
 * transports so both surface failures the same way.
 */

import { AxiosError } from 'axios';
import { AirGradientConnectStatus } from './types';

/** Network error codes that mean the host was never reached. */
const UNREACHABLE_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

/**
 * Hostname or IPv4 address, with an optional port.
 * Anything containing `/`, `@`, `?` or `#` is rejected so a user-supplied
 * address cannot retarget a request at a different host.
 */
const HOST_PATTERN = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*(:\d{1,5})?$/;

/**
 * Whether `value` can be placed in a request base URL.
 * A value with `/`, `@`, `?` or `#` could retarget the request at a different host.
 *
 * @param value - Address entered during pairing or repair
 */
export function isValidHost(value: string): boolean {
  return HOST_PATTERN.test(value);
}

/**
 * Classifies a failed request so callers can distinguish "the device is
 * offline" from "the credentials were rejected" from everything else.
 *
 * @param error - Caught request error
 */
export function classifyRequestError(error: unknown): AirGradientConnectStatus {
  if (!(error instanceof AxiosError)) {
    return AirGradientConnectStatus.FAILED_UNKNOWN;
  }

  const httpStatus = error.response?.status;
  if (httpStatus === 401 || httpStatus === 403) {
    return AirGradientConnectStatus.FAILED_AUTH;
  }

  // A response of any status means the host answered, so it is not unreachable.
  if (httpStatus !== undefined) {
    return AirGradientConnectStatus.FAILED_UNKNOWN;
  }

  // EHOSTUNREACH reaches us in the message rather than the code.
  const unreachable = UNREACHABLE_CODES.has(error.code ?? '')
    || error.message.includes('EHOSTUNREACH');

  return unreachable
    ? AirGradientConnectStatus.UNREACHABLE
    : AirGradientConnectStatus.FAILED_UNKNOWN;
}
