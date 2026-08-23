import DokumentiUpload from "./dokumenti-upload";
import { jeL12, type Rola } from "@/lib/auth-role";

/**
 * Prilaganje dokumenata vidi samo L1/L2. Rola dolazi propom s posluzitelja —
 * vidi obrazlozenje u tank-role-actions.tsx.
 */
export default function TankRoleDokumentiUpload({
  rola,
  tankId,
}: {
  rola: Rola | string | null | undefined;
  tankId: string;
}) {
  if (!jeL12(rola)) return null;

  return <DokumentiUpload tankId={tankId} />;
}
