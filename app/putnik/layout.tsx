import { Suspense } from "react";
import SpremljenoToast from "./spremljeno-toast";

// Layout postoji samo zbog jedne stvari: zelena potvrda "Spremljeno ✓" vrijedi
// za SVE /putnik/* stranice, pa se montira na jednom mjestu umjesto po stranici.
// Suspense jer SpremljenoToast koristi useSearchParams.
export default function PutnikLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={null}>
        <SpremljenoToast />
      </Suspense>
    </>
  );
}
