// Podaci vinarije za zaglavlje ispisnih dokumenata (otpremnica / razduženje / popis prodaje).
// Jedno mjesto izmjene; kasnije se po potrebi može prebaciti na env ili DB bez lomljenja poziva.
export const VINARIJA = {
  naziv: "Vinarija Kostanjevec",
  adresa: "Lukovec 23a, 48312 Rasinja",
  oib: "56593778949",
} as const;
