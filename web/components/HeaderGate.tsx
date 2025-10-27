'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';

export default function HeaderGate() {
  const pathname = usePathname();
  if (pathname && (pathname.startsWith('/auth') || pathname.startsWith('/overlays') || pathname.startsWith('/overlay'))) return null;
  return <Header />;
}


