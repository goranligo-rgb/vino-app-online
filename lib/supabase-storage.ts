// Server-only helperi za Supabase Storage (privatni bucket).
// Koristi REST API + service_role kljuc (NIKAD na klijent) - bez @supabase/supabase-js.
// U bazi se cuva samo `putanja` u bucketu; URL za prikaz se generira potpisan i istekne.
// NAPOMENA: importati iskljucivo iz server koda (route handleri / server komponente).

function cfg() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_POSJET_BUCKET;
  if (!url || !key || !bucket) {
    throw new Error(
      "Supabase Storage nije konfiguriran (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_POSJET_BUCKET)."
    );
  }
  // bez zavrsnog "/"
  return { url: url.replace(/\/+$/, ""), key, bucket };
}

const auth = (key: string) => ({ Authorization: `Bearer ${key}`, apikey: key });

/** Upload datoteke u bucket. Vraca spremljenu putanju (bez bucket prefiksa). */
export async function uploadObjekt(
  putanja: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const { url, key, bucket } = cfg();
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${putanja}`, {
    method: "POST",
    headers: {
      ...auth(key),
      "Content-Type": contentType,
      "cache-control": "3600",
      "x-upsert": "false",
    },
    body: body as BodyInit,
  });
  if (!res.ok) {
    const detalj = await res.text().catch(() => "");
    throw new Error(`Upload na Storage nije uspio (${res.status}): ${detalj}`);
  }
  return putanja;
}

/** Potpisani URL za citanje privatnog objekta (istekne nakon expiresIn sekundi). */
export async function potpisaniUrl(
  putanja: string,
  expiresIn = 60 * 60
): Promise<string> {
  const { url, key, bucket } = cfg();
  const res = await fetch(`${url}/storage/v1/object/sign/${bucket}/${putanja}`, {
    method: "POST",
    headers: { ...auth(key), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) {
    const detalj = await res.text().catch(() => "");
    throw new Error(`Potpisivanje URL-a nije uspjelo (${res.status}): ${detalj}`);
  }
  const data = (await res.json()) as { signedURL?: string };
  if (!data.signedURL) throw new Error("Storage nije vratio signedURL.");
  return `${url}/storage/v1${data.signedURL}`;
}

/** Brisanje objekta iz bucketa. Ne baca ako objekt vec ne postoji (404 se tolerira). */
export async function obrisiObjekt(putanja: string): Promise<void> {
  const { url, key, bucket } = cfg();
  const res = await fetch(`${url}/storage/v1/object/${bucket}/${putanja}`, {
    method: "DELETE",
    headers: auth(key),
  });
  if (!res.ok && res.status !== 404) {
    const detalj = await res.text().catch(() => "");
    throw new Error(`Brisanje sa Storagea nije uspjelo (${res.status}): ${detalj}`);
  }
}
