'use client';

import Sidebar from './Sidebar';

export default function ManagePageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen text-white" style={{ fontFamily: 'Spline Sans, Noto Sans, sans-serif', backgroundColor: '#110f22' }}>
      <div className="flex h-full overflow-hidden">
        <div className="absolute -left-[200px] -bottom-[200px] h-[600px] w-[600px] rounded-full blur-[100px] will-change-[filter] [transform:translateZ(0)]"
            style={{background:"radial-gradient(circle, rgb(134 0 255 / 1) 0%, transparent 70%)"}}>
            <div className="h-[400px] w-[400px] bg-brand-700"></div>
        </div>
        <Sidebar />
        <main className="flex-1 p-6 m-2 overflow-y-auto min-h-0 relative bg-white text-gray-900" style={{ borderRadius: '16px' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
