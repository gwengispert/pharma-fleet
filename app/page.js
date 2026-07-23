import Link from "next/link";
import { listDrivers } from "@/lib/store";

export default async function HomePage() {
  const drivers = listDrivers();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-10 px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Pharma Fleet</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Delivery scheduling &amp; route optimization for pharmaceutical distribution
        </p>
      </div>

      <div className="grid w-full gap-6 sm:grid-cols-2">
        <Link
          href="/admin"
          className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-6 transition hover:border-neutral-400 hover:shadow-sm dark:border-neutral-800 dark:hover:border-neutral-600"
        >
          <span className="text-lg font-medium">Admin Dashboard</span>
          <span className="text-sm text-neutral-500">
            Manage vehicles, drivers, deliveries, and optimize routes.
          </span>
        </Link>

        <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
          <span className="text-lg font-medium">Driver View</span>
          {drivers.length === 0 ? (
            <span className="text-sm text-neutral-500">
              No drivers yet. Ask an admin to add one from the Admin Dashboard.
            </span>
          ) : (
            <div className="flex flex-col gap-2">
              {drivers.map((driver) => (
                <Link
                  key={driver.id}
                  href={`/driver?driverId=${driver.id}`}
                  className="rounded-lg border border-neutral-200 px-3 py-2 text-sm transition hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:border-neutral-600 dark:hover:bg-neutral-900"
                >
                  Driver: {driver.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
