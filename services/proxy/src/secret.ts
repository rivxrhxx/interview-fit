import { inspect } from "node:util";

/**
 * Holds a credential so it cannot be serialized or printed by accident. The
 * value is only available through `reveal()` at the point of use.
 */
export class Secret {
  #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return "[redacted]";
  }

  toJSON(): string {
    return "[redacted]";
  }

  [inspect.custom](): string {
    return "Secret([redacted])";
  }
}
