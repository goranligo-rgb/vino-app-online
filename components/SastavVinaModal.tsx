"use client";

import { useState } from "react";

type Udio = {
  id?: string;
  nazivSorte: string;
  postotak: number;
};

export default function SastavVinaModal({
  udjeli,
}: {
  udjeli: Udio[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
      >
        Sastav vina
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Sastav vina</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-sm hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            {udjeli.length === 0 ? (
              <p className="text-sm text-gray-500">
                Nema upisanog sastava vina.
              </p>
            ) : (
              <div className="space-y-2">
                {udjeli.map((u, index) => (
                  <div
                    key={u.id ?? `${u.nazivSorte}-${index}`}
                    className="flex items-center justify-between rounded-lg border px-3 py-2"
                  >
                    <span>{u.nazivSorte}</span>
                    <span className="font-semibold">
                      {Number(u.postotak).toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}