"use client";

import QRCode from "react-qr-code";

type Props = {
  tankId: string;
  brojTanka: number | string;
  naziv?: string | null;
  baseUrl: string;
};

export default function TankQrCard({
  tankId,
  brojTanka,
  naziv,
  baseUrl,
}: Props) {
  const url = `${baseUrl}/tankovi/${tankId}`;

  return (
    <div className="tank-qr-card">
      <div className="tank-qr-label-top">VINARIJA KOSTANJEVEC</div>

      <div className="tank-qr-broj">TANK {brojTanka}</div>

      <div className="tank-qr-sorta">{naziv?.trim() ? naziv : " "}</div>

      <div className="tank-qr-code-wrap">
        <QRCode value={url} size={210} />
      </div>

      <div className="tank-qr-note">Skeniraj za pregled tanka</div>
    </div>
  );
}