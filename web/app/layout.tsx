import './globals.css';
import './glassmorphism.css';
import HeaderGate from '../components/HeaderGate';

export const metadata = {
  title: 'Auction Central',
  description: 'Player Auction Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?display=swap&family=Noto+Sans:wght@400;500;700;900&family=Spline+Sans:wght@400;500;700" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <HeaderGate />
        {children}
      </body>
    </html>
  );
} 