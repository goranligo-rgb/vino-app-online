-- Faza 8 ciscenje (opcija A) — brisanje testnih promo podataka po tocnim ID-jevima.
-- 6 testnih promo otpisa + 3 testna globalna ulaza. Katalog i posjeti se NE diraju.

DELETE FROM "PutnikPromoKupca" WHERE "id" IN (
  'cmq6zwsv4000004jyf3qyv1yr',
  'cmq724u54000404jyvsqgqb53',
  'cmq725xj6000104iehvi8ih01',
  'cmq725xj6000204iefm6ggi2j',
  'cmq743yrc000304jux6g167oh',
  'cmq747htk000504juft7ncxmr'
);

DELETE FROM "PutnikPromoUlaz" WHERE "id" IN (
  'cmq71zned000004l8ih58h7c3',
  'cmq720h9b000104l8a3464q89',
  'cmq73z7kh000104juk80f3gc8'
);
