"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  GRESKA_CITACA,
  NEMA_KAMERE_U_PREGLEDNIKU,
  NIJE_NALJEPNICA,
  opisGreskeKamere,
  putanjaTankaIzQr,
  type GreskaKamere,
} from "@/lib/qr-tank";

const RAZMAK_CITANJA_MS = 250;
const TRAJANJE_PORUKE_MS = 2500;
const DOPUSTENO_GRESAKA_CITANJA = 3;

type Citac = {
  detect(izvor: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};

let citacObecanje: Promise<Citac> | null = null;

/**
 * Biblioteka i .wasm (947 KB) ucitavaju se tek na prvi klik, pa dashboard ostaje
 * jednako lagan. Ponyfill, a ne ugradjeni BarcodeDetector, da iOS i Android rade
 * isti kod. .wasm je iz public/zxing umjesto s CDN-a; verzija u imenu mora
 * odgovarati paketu (scripts/test-qr-tank.ts).
 */
function ucitajCitac(): Promise<Citac> {
  citacObecanje ??= (async () => {
    const paket = await import("barcode-detector/ponyfill");

    try {
      await paket.prepareZXingModule({
        overrides: {
          locateFile: (datoteka: string, prefiks: string) =>
            datoteka.endsWith(".wasm")
              ? `/zxing/zxing_reader-${paket.ZXING_WASM_VERSION}.wasm`
              : prefiks + datoteka,
        },
        fireImmediately: true,
      });
    } catch (greska) {
      paket.purgeZXingModule();
      throw greska;
    }

    return new paket.BarcodeDetector({ formats: ["qr_code"] });
  })().catch((greska) => {
    // Da "Pokusaj ponovno" stvarno pokusa, a ne vrati isti neuspjeh.
    citacObecanje = null;
    throw greska;
  });

  return citacObecanje;
}

export default function SkenirajTank({ stil }: { stil?: CSSProperties }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [otvoreno, setOtvoreno] = useState(false);
  const [pokusaj, setPokusaj] = useState(0);
  const [greska, setGreska] = useState<GreskaKamere | null>(null);
  const [poruka, setPoruka] = useState<string | null>(null);

  function pocni() {
    setGreska(null);
    setPoruka(null);
    setPokusaj((n) => n + 1);
    setOtvoreno(true);
  }

  useEffect(() => {
    if (!otvoreno) return;

    let gotovo = false;
    let tok: MediaStream | null = null;
    let krugTimer: ReturnType<typeof setTimeout> | undefined;
    let porukaTimer: ReturnType<typeof setTimeout> | undefined;

    function zaustavi() {
      gotovo = true;
      clearTimeout(krugTimer);
      clearTimeout(porukaTimer);
      tok?.getTracks().forEach((t) => t.stop());
      tok = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }

    function prekini(opis: GreskaKamere) {
      zaustavi();
      setPoruka(null);
      setGreska(opis);
    }

    async function pokreni() {
      const video = videoRef.current;
      if (!video) return;

      if (!navigator.mediaDevices?.getUserMedia) {
        prekini(NEMA_KAMERE_U_PREGLEDNIKU);
        return;
      }

      try {
        const novi = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (gotovo) {
          novi.getTracks().forEach((t) => t.stop());
          return;
        }

        tok = novi;
        novi.getVideoTracks()[0]?.addEventListener("ended", () => {
          if (!gotovo && document.visibilityState === "visible") {
            prekini(opisGreskeKamere(undefined));
          }
        });

        video.muted = true;
        video.srcObject = novi;
        await video.play();
      } catch (e) {
        if (!gotovo) prekini(opisGreskeKamere((e as Error)?.name));
        return;
      }

      // Kamera radi odmah, a citac se ucitava uz nju.
      let citac: Citac;
      try {
        citac = await ucitajCitac();
      } catch {
        if (!gotovo) prekini(GRESKA_CITACA);
        return;
      }

      let uzastopnihGresaka = 0;

      async function krug() {
        if (gotovo) return;

        try {
          if (video!.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const pogoci = await citac.detect(video!);
            uzastopnihGresaka = 0;
            if (gotovo) return;

            if (pogoci.length > 0) {
              const putanja = pogoci
                .map((p) => putanjaTankaIzQr(p.rawValue))
                .find((p) => p !== null);

              if (putanja) {
                // Prvo stani, da isti kod ne otvori tank dvaput.
                zaustavi();
                setOtvoreno(false);
                router.push(putanja);
                return;
              }

              setPoruka(NIJE_NALJEPNICA);
              clearTimeout(porukaTimer);
              porukaTimer = setTimeout(
                () => setPoruka(null),
                TRAJANJE_PORUKE_MS
              );
            }
          }
        } catch {
          uzastopnihGresaka += 1;
          if (uzastopnihGresaka >= DOPUSTENO_GRESAKA_CITANJA) {
            if (!gotovo) prekini(GRESKA_CITACA);
            return;
          }
        }

        krugTimer = setTimeout(krug, RAZMAK_CITANJA_MS);
      }

      void krug();
    }

    // U pozadini se kamera gasi; pri povratku je treba pokrenuti iznova.
    function promjenaVidljivosti() {
      if (document.visibilityState === "hidden") {
        zaustavi();
      } else {
        setGreska(null);
        setPoruka(null);
        setPokusaj((n) => n + 1);
      }
    }

    document.addEventListener("visibilitychange", promjenaVidljivosti);
    void pokreni();

    return () => {
      document.removeEventListener("visibilitychange", promjenaVidljivosti);
      zaustavi();
    };
  }, [otvoreno, pokusaj, router]);

  return (
    <>
      <button
        type="button"
        onClick={pocni}
        style={{ cursor: "pointer", ...stil }}
      >
        Skeniraj tank
      </button>

      {otvoreno
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Skeniraj tank"
              style={pozadinaStil}
            >
              <div style={trakaStil}>
                <span style={{ fontWeight: 700 }}>Skeniraj tank</span>
                <button
                  type="button"
                  onClick={() => setOtvoreno(false)}
                  style={gumbStil}
                >
                  Zatvori
                </button>
              </div>

              {greska ? (
                <div style={greskaStil}>
                  <p role="alert" style={{ margin: 0, lineHeight: 1.4 }}>
                    {greska.poruka}
                  </p>
                  {greska.ponovno ? (
                    <button type="button" onClick={pocni} style={gumbStil}>
                      Pokušaj ponovno
                    </button>
                  ) : null}
                </div>
              ) : (
                <div style={kadarStil}>
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    style={videoStil}
                  />
                  <div aria-hidden="true" style={okvirStil} />
                  <p role="status" style={uputaStil}>
                    {poruka ?? "Usmjeri kameru na QR naljepnicu tanka"}
                  </p>
                </div>
              )}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

const pozadinaStil: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  display: "flex",
  flexDirection: "column",
  background: "#000",
  color: "#fff",
  fontFamily: "Calibri, Segoe UI, Arial, sans-serif",
  // Aplikacija s pocetnog zaslona ide ispod sata i notcha (viewport-fit=cover).
  paddingTop: "env(safe-area-inset-top)",
  paddingBottom: "env(safe-area-inset-bottom)",
};

const trakaStil: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 16px",
};

const gumbStil: CSSProperties = {
  background: "#14131c",
  border: "2px solid #ff2f92",
  color: "#fff",
  padding: "10px 16px",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
};

const kadarStil: CSSProperties = {
  position: "relative",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
};

const videoStil: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const okvirStil: CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  width: "min(70vw, 70vh)",
  height: "min(70vw, 70vh)",
  transform: "translate(-50%, -50%)",
  border: "3px solid #ff2f92",
  boxShadow: "0 0 0 100vmax rgba(0,0,0,0.35)",
  pointerEvents: "none",
};

const uputaStil: CSSProperties = {
  position: "absolute",
  left: 16,
  right: 16,
  bottom: 24,
  margin: 0,
  padding: "10px 12px",
  background: "rgba(0,0,0,0.75)",
  textAlign: "center",
  fontSize: 16,
  fontWeight: 600,
};

const greskaStil: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 20,
  padding: 24,
  textAlign: "center",
  fontSize: 17,
};
