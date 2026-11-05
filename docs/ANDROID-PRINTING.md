# Printing receipts from Android and iOS

CARVED now includes a BLE ESC/POS printing adapter in the saved receipt dialog.
The existing receipt is rendered locally as a monochrome 576-dot image, retaining
the logo, peso signs and full decimal amounts. Printing never posts another sale.

## Android Chrome with a BLE receipt printer

1. Open CARVED using its HTTPS address on the tablet. An HTTP LAN address does not
   allow Web Bluetooth; localhost on the development computer is a special case.
2. Complete a sale, or open a saved receipt, and tap **Connect Bluetooth printer**.
3. Select the printer in Chrome's device chooser. Permission is per device/browser.
4. While connected, each newly saved sale prints once by itself. If the receipt of
   a new sale is open when you connect, it prints straight away. Check the paper.
5. Reprints of saved receipts stay manual: tap **Print receipt**.
6. If the connection dropped, CARVED tries to reconnect silently at the next sale.
   After a page reload Chrome usually requires the tap in step 2 again.

Only known writable printer UART profiles are used (18f0/2af1, ISSC and e781/bef8).
These are not a universal ESC/POS Bluetooth standard. A Bluetooth Classic-only
printer will not become BLE-capable through a website change. Use a compatible
Android print service/native bridge for Classic or USB hardware.

## Windows Chrome or Edge with a paired Bluetooth printer

Desktop browsers send to the printer's Bluetooth serial (COM) link, bypassing the
Windows print queue. Pair the printer in Windows, tap **Connect printer** and choose
its outgoing COM port. The choice is remembered, so new sales print by themselves,
even after a reload. The port is only held open while a receipt is sending.

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

## November 5 printing speed update

The raster encoder now emits ESC/POS paper-feed commands for entirely white rows
and trims white bytes on the right of nonblank bands. Text, logo, pixel positions,
receipt height, serial settling/draining delays, chunk pacing and cutter commands
are preserved. The feed path explicitly sets 203-dot motion units (GS P) before
using ESC J; verify spacing on the actual VOZY during acceptance testing.

A saved 576 x 987 receipt image decreased from 71,137 to 28,189 command bytes
(60.4% less). This measures payload reduction, not observed physical print time.
Automated reconstruction tests preserve every black dot and blank row, including
long feeds, partial bytes and the rightmost dot. Typecheck/build passed; regression
suite: 33 passed, 3 PostgreSQL concurrency cases skipped without TEST_DATABASE_URL.
No deployment or database changes were made by this update.


## Fast / Sharper print quality

The receipt dialog defaults to Fast and remembers the choice on that browser.
Fast reduces the raster to half width and height using black-dot-preserving
max-pooling, then uses ESC/POS double-width/double-height raster mode to retain
physical paper size. Text and logo edges become bolder and coarser. Choose Sharper
for the previous full-resolution output. The saved preview and image export retain
full resolution. Transfer pacing and failed-write handling are unchanged.

The 576 x 987 sample measured 7,553 bytes in Fast versus 28,189 in Sharper (73.2%
less). Actual elapsed time, spacing, legibility and cutter behavior require a test
on the physical printer. Fast may add one white dot row for odd image heights.
