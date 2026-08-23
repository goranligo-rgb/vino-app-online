import SastavModal from "./sastav-modal";
import { jeL12, type Rola } from "@/lib/auth-role";

/**
 * Uredjivanje sastava vidi samo L1/L2. Rola dolazi propom s posluzitelja —
 * vidi obrazlozenje u tank-role-actions.tsx.
 */
export default function TankRoleSastavModal({
  rola,
  tankId,
  stavke,
}: {
  rola: Rola | string | null | undefined;
  tankId: string;
  stavke: {
    id: string;
    nazivSorte: string;
    postotak: number;
  }[];
}) {
  if (!jeL12(rola)) return null;

  return <SastavModal tankId={tankId} stavke={stavke} />;
}
