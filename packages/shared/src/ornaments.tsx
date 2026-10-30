// Line-art ornaments and icons. All use currentColor, so color comes from CSS.
import type { SVGProps } from 'react';

type SvgProps = SVGProps<SVGSVGElement>;

// Thin rule with a leaf sprig in the middle, used under section titles.
export function Ornament(props: SvgProps) {
  return (
    <svg viewBox="0 0 220 24" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden {...props}>
      <path d="M0 12h82M138 12h82" />
      <path d="M110 12c-5-6-12-8-20-6 5 5 12 7 20 6z" />
      <path d="M110 12c5-6 12-8 20-6-5 5-12 7-20 6z" />
      <path d="M110 12c-4 4-9 6-15 5M110 12c4 4 9 6 15 5" />
      <path d="M110 15.5s-3.6-2.3-3.6-4.8a1.9 1.9 0 0 1 3.6-.9 1.9 1.9 0 0 1 3.6.9c0 2.5-3.6 4.8-3.6 4.8z" fill="currentColor" stroke="none" />
      <circle cx="78" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="142" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Curved branch with leaves and berries, used in hero and footer corners.
export function Branch(props: SvgProps) {
  return (
    <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" aria-hidden {...props}>
      <path d="M10 190C40 140 70 100 120 70S180 20 195 8" />
      <path d="M41 143c-14-4-24-14-26-28 14 2 24 12 26 28z" />
      <path d="M41 143c4-14 14-24 28-26-2 14-12 24-28 26z" />
      <path d="M76 103c-13-4-22-13-24-26 13 2 22 11 24 26z" />
      <path d="M76 103c4-13 13-22 26-24-2 13-11 22-26 24z" />
      <path d="M120 70c-11-5-18-14-19-26 12 3 19 12 19 26z" />
      <path d="M120 70c5-11 14-18 26-19-3 12-12 19-26 19z" />
      <path d="M158 43c-9-5-14-13-14-23 10 3 15 12 14 23z" />
      <path d="M158 43c5-9 13-14 23-14-3 10-12 15-23 14z" />
      <path d="M22 168c-8 2-15 0-20-6M180 23c3-6 3-12 0-17" />
      <circle cx="58" cy="132" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="64" cy="138" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="100" cy="96" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="140" cy="62" r="2" fill="currentColor" stroke="none" />
      <circle cx="146" cy="67" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

const iconPaths = {
  church: 'M12 2v4M10 4h4M5 21V11l7-5.5 7 5.5v10M3 21h18M10 21v-4.5a2 2 0 0 1 4 0V21M12 10.5v.5',
  rings: 'M10 3.5l2-1.5 2 1.5-2 2.5z',
  cheers: 'M7 3h6l-.6 5.2A2.4 2.4 0 0 1 10 10.3a2.4 2.4 0 0 1-2.4-2.1zM10 10.3V17M7.5 17h5M11 3h6l-.6 5.2a2.4 2.4 0 0 1-2.4 2.1M14 10.3V21M11.5 21h5',
  cocktail: 'M5 4h14l-7 8zM12 12v8M8 20h8M15 4l2-2',
  home: 'M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5.5h4V20',
  pin: 'M12 21s-6.5-5.6-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z',
  envelope: 'M3.5 6.5h17v12h-17zM3.5 7l8.5 6.5L20.5 7',
  gift: 'M4 9h16v3.5H4zM5.5 12.5V20h13v-7.5M12 9v11M12 9c-1.3-3-5-3.8-5-1.4C7 8.8 10 9 12 9zM12 9c1.3-3 5-3.8 5-1.4C17 8.8 14 9 12 9z',
  heart: 'M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3.5v4M16 3.5v4',
  clock: 'M12 7v5l3 2',
  camera: 'M4 8h3.2l1.6-2.2h6.4L16.8 8H20v11H4z',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  lock: 'M6 10.5h12V20H6zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.2v2.4',
  plane: 'M21 3.5L3 10.5l6.5 2.5L21 3.5l-8.5 12.5V21l3-3.6 4 3.1z',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.4 15.4L20 20',
  shield: 'M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6zM9 12l2 2 4-4',
  bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0M12 3.5V5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
} as const;

export type IconName = keyof typeof iconPaths;

export function Icon({ name, size = 28, ...props }: { name: IconName; size?: number } & SvgProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d={iconPaths[name]} />
      {name === 'rings' && (
        <>
          <circle cx="9" cy="14.5" r="5" />
          <circle cx="15" cy="14.5" r="5" />
        </>
      )}
      {name === 'pin' && <circle cx="12" cy="9.8" r="2.2" />}
      {name === 'clock' && <circle cx="12" cy="12" r="8.5" />}
      {name === 'camera' && <circle cx="12" cy="13.5" r="3.4" />}
    </svg>
  );
}
