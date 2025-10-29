import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="text-white" style={{ fontFamily: 'Spline Sans, Noto Sans, sans-serif', backgroundColor: '#110f22', height: 'calc(100vh - 79px)' }}>
      <div className="flex h-full overflow-hidden items-center justify-center">
        <main className="flex flex-col items-center justify-center flex-1 m-2 overflow-hidden min-h-0 h-[calc(100%-1rem)]" style={{ borderRadius: '16px', backgroundColor: 'rgb(249 250 251 / var(--tw-bg-opacity, 1))', zIndex: 1 }}>
          <div className="text-center p-12 text-gray-900">
            <h1 className="text-6xl font-bold text-pink-600">404</h1>
            <h2 className="mt-4 text-3xl font-bold tracking-tight">Page Not Found</h2>
            <p className="mt-2 text-base text-gray-500">
              Sorry, we couldn’t find the page you’re looking for.
            </p>
            <div className="mt-10">
              <Link
                href="/dashboard"
                className="rounded-full bg-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pink-700"
              >
                Go back home
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
