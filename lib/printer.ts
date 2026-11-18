export interface PrinterAdapter {
  print(): Promise<void>;
}
class BrowserPrinter implements PrinterAdapter {
  async print() {
    if (typeof window === "undefined")
      throw new Error("Printing needs a browser");
    window.print();
  }
}
class UnconfiguredPrinter implements PrinterAdapter {
  async print() {
    throw new Error(
      "Direct printer is not configured. Select Browser print in Settings. The saved sale is safe.",
    );
  }
}
export function printer(adapter: string): PrinterAdapter {
  return adapter === "browser"
    ? new BrowserPrinter()
    : new UnconfiguredPrinter();
}
