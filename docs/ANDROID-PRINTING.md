# Printing receipts from Android and iOS

CARVED now includes a BLE ESC/POS printing adapter in the saved receipt dialog.
The existing receipt is rendered locally as a monochrome 576-dot image, retaining
the logo, peso signs and full decimal amounts. Printing never posts another sale.

## Android Chrome with a BLE receipt printer

1. Open CARVED using its HTTPS address on the tablet. An HTTP LAN address does not
   allow Web Bluetooth; localhost on the development computer is a special case.
2. Open a saved receipt and tap **Connect Bluetooth printer**.
3. Select the printer in Chrome's device chooser. Permission is per device/browser.
4. Tap **Print receipt**. Check paper output before reprinting.
5. Reconnect after a page reload or a disconnected printer.

Only known writable printer UART profiles are used (18f0/2af1, ISSC and e781/bef8).
These are not a universal ESC/POS Bluetooth standard. A Bluetooth Classic-only
printer will not become BLE-capable through a website change. Use a compatible
Android print service/native bridge for Classic or USB hardware.

## iPhone/iPad and other browsers

Tap **System print** to use the operating system's available printers/services.
Alternatively tap **Save receipt image**, then open the downloaded PNG in a
compatible printer app. That app must support the actual printer connection.
Safari does not provide native Web Bluetooth. This change does not claim direct
Bluetooth support in Safari, AirPrint support in VOZY, or an installed native bridge.

## Reliability

BLE data is sent sequentially in conservative 20-byte chunks. A failed transfer
stops without automatic retry or fallback, because paper may already have printed.
Successful transmission means bytes were sent, not verified physical output.
Real tablet/printer acceptance testing is still required, including a receipt with
large amounts, the rightmost decimals, a long item name, and a connection failure.

Reference: Chrome's official Web Bluetooth documentation:
https://developer.chrome.com/docs/capabilities/bluetooth
