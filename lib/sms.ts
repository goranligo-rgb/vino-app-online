import { prisma } from "@/lib/prisma";

/**
 * SMS obavijesti preko Infobipa - strana aplikacije (Vercel).
 *
 * Gateway na Pi-ju ima svoju, istovjetnu izvedbu u gateway/gateway.py; ova se
 * koristi samo za heartbeat watchdog (vidi app/api/cron/heartbeat/route.ts),
 * jer mrtav gateway ne moze poslati poruku sam za sebe.
 *
 * Modul je OPCIONALAN: bez INFOBIP_API_KEY / INFOBIP_BASE_URL / SMS_BROJEVI
 * slanje se preskace bez greske.
 */

const KVACICE: Record<string, string> = {
  č: "c", ć: "c", ž: "z", š: "s", đ: "d",
  Č: "C", Ć: "C", Ž: "Z", Š: "S", Đ: "D",
  "°": "", "–": "-", "—": "-", "…": "...",
};

/**
 * GSM-7 abeceda nema nasa slova s kvacicama: jedno takvo slovo prebacuje poruku
 * u UCS-2 i prepolovljuje segment (70 znakova umjesto 160), pa se isti tekst
 * naplacuje dvostruko. Zato tekst ide bez dijakritike.
 */
export function gsmTekst(tekst: string): string {
  return [...tekst]
    .map((z) => KVACICE[z] ?? z)
    .map((z) => (z.charCodeAt(0) < 128 ? z : "?"))
    .join("");
}

export function smsBrojevi(): string[] {
  const sirovo = process.env.SMS_BROJEVI ?? "";
  const brojevi: string[] = [];
  for (const dio of sirovo.split(/[,;]/)) {
    const broj = dio.trim().replace(/[\s-]/g, "").replace(/^\+/, "");
    if (!broj) continue;
    if (!/^\d+$/.test(broj)) {
      console.warn(`[sms] neispravan broj u SMS_BROJEVI: ${broj} - preskacem`);
      continue;
    }
    if (!brojevi.includes(broj)) brojevi.push(broj);
  }
  return brojevi;
}

/** Zasto je modul ugasen; prazan string znaci da je spreman za slanje. */
export function razlogIskljucenja(): string {
  if ((process.env.SMS_OMOGUCEN ?? "true").toLowerCase() === "false") return "SMS_OMOGUCEN=false";
  if (!process.env.INFOBIP_API_KEY) return "nema INFOBIP_API_KEY";
  if (!process.env.INFOBIP_BASE_URL) return "nema INFOBIP_BASE_URL";
  if (smsBrojevi().length === 0) return "nema SMS_BROJEVI";
  return "";
}

export function smsUkljucen(): boolean {
  return razlogIskljucenja() === "";
}

/** Sat i minuta u vremenskoj zoni vinarije - za tekst poruke. */
export function sadaHHMM(): string {
  return new Intl.DateTimeFormat("hr-HR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: process.env.SMS_VREMENSKA_ZONA || "Europe/Zagreb",
  }).format(new Date());
}

type Zahtjev = {
  tekst: string;
  tip: string; // "HEARTBEAT" | "HEARTBEAT_OK" | "TEST"
  izvor?: string; // tko salje: "WATCHDOG"
  tankId?: string | null;
  tankBroj?: number | null;
  alarmId?: string | null;
};

/**
 * Posalje jednu poruku svim primateljima i zapise je u SmsObavijest.
 *
 * Slanje se NE ponavlja: ponovljeni POST kod isteka veze lako znaci dvije
 * poruke za isti dogadaj. Nikad ne baca - vraca ishod, a pozivatelj odlucuje.
 */
export async function posaljiSms(z: Zahtjev): Promise<{ uspjeh: boolean; greska: string | null }> {
  const razlog = razlogIskljucenja();
  if (razlog) {
    console.warn(`[sms] (${z.tip}) preskocen [${razlog}]: ${z.tekst}`);
    return { uspjeh: false, greska: `preskoceno: ${razlog}` };
  }

  const brojevi = smsBrojevi();
  const primatelji = brojevi.join(",");
  const greska = await posaljiInfobip(z.tekst, brojevi);

  if (greska) {
    console.error(`[sms] (${z.tip}) NIJE poslan na ${primatelji}: ${greska} | ${z.tekst}`);
  } else {
    console.log(`[sms] (${z.tip}) poslan na ${primatelji}: ${z.tekst}`);
  }

  try {
    await prisma.smsObavijest.create({
      data: {
        tip: z.tip,
        izvor: z.izvor ?? "WATCHDOG",
        tankId: z.tankId ?? null,
        tankBroj: z.tankBroj ?? null,
        alarmId: z.alarmId ?? null,
        tekst: z.tekst.slice(0, 500),
        primatelji: primatelji.slice(0, 200),
        uspjeh: greska === null,
        greska: greska ? greska.slice(0, 500) : null,
      },
    });
  } catch (e) {
    // Poruka je vec otisla - dnevnik ne smije srusiti odgovor.
    console.error("[sms] dnevnik nije zapisan:", e);
  }

  return { uspjeh: greska === null, greska };
}

async function posaljiInfobip(tekst: string, brojevi: string[]): Promise<string | null> {
  const base = (process.env.INFOBIP_BASE_URL ?? "").replace(/\/+$/, "");
  const kontrola = AbortSignal.timeout(Number(process.env.SMS_TIMEOUT_MS ?? 10000));

  let odgovor: Response;
  try {
    odgovor = await fetch(`${base}/sms/2/text/advanced`, {
      method: "POST",
      headers: {
        Authorization: `App ${process.env.INFOBIP_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            destinations: brojevi.map((to) => ({ to })),
            from: process.env.SMS_POSILJATELJ || "Vinarija",
            text: tekst,
          },
        ],
      }),
      signal: kontrola,
      cache: "no-store",
    });
  } catch (e) {
    return `veza prema Infobipu: ${e instanceof Error ? e.message : String(e)}`;
  }

  const sirovo = await odgovor.text();
  if (!odgovor.ok) {
    return `HTTP ${odgovor.status}: ${sirovo.slice(0, 300)}`;
  }
  return greskaIzOdgovora(sirovo);
}

/**
 * Infobip vraca HTTP 200 i kad poruku odbije - pravi status je u tijelu
 * (messages[].status.groupName: PENDING/DELIVERED je dobro, REJECTED nije).
 */
function greskaIzOdgovora(sirovo: string): string | null {
  let podaci: unknown;
  try {
    podaci = sirovo.trim() ? JSON.parse(sirovo) : {};
  } catch {
    return null; // poruka je predana, samo ne razumijemo odgovor
  }
  const poruke = (podaci as { messages?: unknown }).messages;
  if (!Array.isArray(poruke)) return null;

  const odbijeni: string[] = [];
  for (const p of poruke) {
    const status = (p as { status?: { groupName?: string; description?: string; name?: string } }).status ?? {};
    const skupina = (status.groupName ?? "").toUpperCase();
    if (skupina === "REJECTED" || skupina === "UNDELIVERABLE") {
      const to = (p as { to?: string }).to ?? "?";
      odbijeni.push(`${to}: ${status.description ?? status.name ?? skupina}`);
    }
  }
  return odbijeni.length ? `Infobip odbio - ${odbijeni.join("; ")}` : null;
}
