import { vi } from "vitest";

/**
 * Spies on every browser API that could carry bytes off the device so privacy
 * tests can assert that nothing was sent.
 */
export function spyOnNetwork() {
  if (typeof navigator.sendBeacon !== "function") {
    Object.defineProperty(navigator, "sendBeacon", { value: () => true, configurable: true });
  }
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, "send");
  const beaconSpy = vi.spyOn(navigator, "sendBeacon");
  return {
    fetchSpy,
    xhrSpy,
    beaconSpy,
    expectNothingSent() {
      if (fetchSpy.mock.calls.length || xhrSpy.mock.calls.length || beaconSpy.mock.calls.length) {
        throw new Error("Expected zero network requests");
      }
    },
  };
}
