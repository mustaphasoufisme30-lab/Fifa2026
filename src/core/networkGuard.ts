export interface ConnectivityProbeResult {
  online: boolean;
  reason: 'ok' | 'navigator_offline' | 'network_error' | 'http_error';
}

export function buildPingUrl(baseHref: string, timestamp: number): string {
  try {
    const url = new URL(baseHref);
    url.searchParams.set('_netcheck', String(timestamp));
    return url.toString();
  } catch {
    return `./?_netcheck=${timestamp}`;
  }
}

export function evaluateOnlineStatus(
  navigatorOnline: boolean,
  probeSucceeded: boolean,
): ConnectivityProbeResult {
  if (!navigatorOnline) {
    return { online: false, reason: 'navigator_offline' };
  }
  if (!probeSucceeded) {
    return { online: false, reason: 'network_error' };
  }
  return { online: true, reason: 'ok' };
}

/**
 * Actively verifies live network reachability with a no-store HEAD request.
 * Works reliably in browsers, mobile WebViews, and Playwright offline emulation.
 */
export async function probeNetworkConnection(
  fetchImpl: typeof fetch = fetch,
  baseHref: string = typeof window !== 'undefined' ? window.location.href : 'http://localhost:3000/',
  navigatorOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true,
  timeoutMs = 3500,
): Promise<ConnectivityProbeResult> {
  if (!navigatorOnline) {
    return { online: false, reason: 'navigator_offline' };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const url = buildPingUrl(baseHref, Date.now());
    const response = await fetchImpl(url, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller?.signal,
    });
    if (!response.ok) {
      return { online: false, reason: 'http_error' };
    }
    return { online: true, reason: 'ok' };
  } catch {
    return { online: false, reason: 'network_error' };
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
}
