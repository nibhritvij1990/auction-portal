'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginAlias() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/auth/sign-in');
  }, [router]);
  return null;
} 