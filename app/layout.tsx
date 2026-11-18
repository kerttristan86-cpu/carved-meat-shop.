import "./globals.css";
import { NotificationProvider } from "./components/notifications";
export const metadata = {
  title: "CARVED · Shop operations",
  description: "Inventory, sales and bookkeeping for CARVED Meat Shop",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <NotificationProvider>{children}</NotificationProvider>
      </body>
    </html>
  );
}
