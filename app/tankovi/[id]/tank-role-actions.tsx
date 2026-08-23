import Link from "next/link";
import ArhivirajButton from "./arhiviraj-button";
import { jeL12, type Rola } from "@/lib/auth-role";

/**
 * Gumbi u zaglavlju tanka, ovisno o roli.
 *
 * Rola dolazi PROPOM S POSLUZITELJA. Prije se citala iz
 * `localStorage["user"]`, koji upisuje samo /login: tko je ocistio preglednik,
 * dosao s drugog uredjaja ili se prijavio prije nego je taj kljuc uveden,
 * imao je `null` — a `null` je padao u granu "smije sve", pa je i PREGLED
 * vidio gumb Arhiviraj i dobio "nemate prava" tek nakon klika. Stranica je
 * server-komponenta i rolu ima iz potpisane sesije (citajSesiju), pa nema
 * razloga da je klijent pogadja.
 *
 * Vise nije klijentska komponenta — nema stanja ni efekta. ArhivirajButton
 * ispod jest, i to ostaje nepromijenjeno.
 */
export default function TankRoleActions({
  rola,
  tankId,
  brojTanka,
  primaryStyle,
  secondaryStyle,
}: {
  rola: Rola | string | null | undefined;
  tankId: string;
  brojTanka: number;
  primaryStyle: React.CSSProperties;
  secondaryStyle: React.CSSProperties;
}) {
  const smijeUredjivati = jeL12(rola);

  return (
    <>
      <Link href="/dashboard" style={primaryStyle}>
        Početna
      </Link>

      {smijeUredjivati ? (
        <>
          <Link href="/tankovi" style={secondaryStyle}>
            Popis tankova
          </Link>

          <ArhivirajButton
            tankId={tankId}
            brojTanka={brojTanka}
            style={secondaryStyle}
          />
        </>
      ) : (
        <Link href="/monitor" style={secondaryStyle}>
          Monitor
        </Link>
      )}
    </>
  );
}
