declare module "qrcode-terminal" {
  interface QrcodeTerminalOptions {
    small?: boolean;
  }

  export function generate(
    input: string,
    opts?: QrcodeTerminalOptions,
    callback?: (output: string) => void,
  ): void;

  export function setErrorLevel(level: "L" | "M" | "Q" | "H"): void;
}
