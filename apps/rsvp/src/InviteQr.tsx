import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { checkinUrl } from './storage';

export function InviteQr({ code }: { code: string }) {
  const src = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(checkinUrl(code));
    qr.make();
    return qr.createDataURL(6, 0);
  }, [code]);

  return (
    <div className="rsvp-qr">
      <img src={src} alt={`QR Code do convite ${code}`} width={180} height={180} />
    </div>
  );
}
