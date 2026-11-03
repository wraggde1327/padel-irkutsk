import type { ReactNode } from 'react';

const SCREEN = { w: 390, h: 844 };
const EDGE = 12;

export function Phone({
  width = 320,
  dark = false,
  time = '9:41',
  children,
}: {
  width?: number;
  dark?: boolean;
  time?: string;
  children: ReactNode;
}) {
  const scale = width / (SCREEN.w + EDGE * 2);
  const height = (SCREEN.h + EDGE * 2) * scale;

  return (
    <div
      className="phone"
      data-dark={dark || undefined}
      style={{ width, height, ['--phone-scale' as string]: String(scale) }}
    >
      <div className="phone-glass">
        <div
          className="phone-window"
          style={{ width: SCREEN.w * scale, height: SCREEN.h * scale }}
        >
          <div
            className="phone-screen"
            style={{
              width: SCREEN.w,
              height: SCREEN.h,
              transform: `scale(${scale})`,
            }}
          >
            <div className="phone-status" aria-hidden>
              <span className="phone-time">{time}</span>
              <span className="phone-island" />
              <span className="phone-glyphs">
                <Signal />
                <Wifi />
                <Battery />
              </span>
            </div>
            <div className="phone-content">{children}</div>
            <span className="phone-home" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}

function Signal() {
  return (
    <svg viewBox="0 0 20.33 13.67" width="20" height="14">
      {[6.33, 8.67, 11, 13.67].map((h, i) => (
        <rect key={i} x={i * 5.667} y={13.67 - h} width={3.333} height={h} rx={1.667} fill="currentColor" />
      ))}
    </svg>
  );
}

function Wifi() {
  return (
    <svg viewBox="0 0 19.33 14.33" width="19" height="14">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M0.42 5.54c.49.5 1.24.42 1.86-.13C4.31 3.58 6.84 2.64 9.67 2.64c2.83 0 5.38.97 7.39 2.78.6.56 1.36.62 1.86.13.5-.52.57-1.29.06-1.83C16.83 1.52 13.33 0 9.67 0 6.01 0 2.49 1.53.36 3.72c-.51.53-.46 1.3.06 1.82zm3.53 3.6c.56.54 1.27.49 1.9-.03 1.03-.82 2.4-1.38 3.82-1.36 1.4 0 2.77.54 3.82 1.37.63.52 1.37.55 1.92 0 .53-.54.61-1.37.06-1.89-1.39-1.25-3.48-2.12-5.78-2.12S5.28 5.99 3.91 7.23c-.49.46-.59 1.25.04 1.91zm4.78 4.75c.61.59 1.26.59 1.87 0l1.16-1.12c.61-.6.74-1.36.04-1.88-.59-.41-1.33-.69-2.13-.69s-1.43.27-2 .7c-.7.5-.56 1.27.06 1.86l1 .1z"
      />
    </svg>
  );
}

function Battery() {
  return (
    <svg viewBox="0 0 29.33 13.67" width="27" height="13">
      <path
        fill="currentColor"
        d="M0 6.4C0 4.16 0 3.04.44 2.18A3.2 3.2 0 0 1 2.18.44C3.04 0 4.16 0 6.4 0h13.53c2.24 0 3.36 0 4.22.44a3.2 3.2 0 0 1 1.75 1.74c.43.86.43 1.98.43 4.22v.87c0 2.24 0 3.36-.43 4.21a3.2 3.2 0 0 1-1.75 1.75c-.86.43-1.98.43-4.22.43H6.4c-2.24 0-3.36 0-4.22-.43A3.2 3.2 0 0 1 .44 11.48C0 10.63 0 9.51 0 7.27z"
      />
      <path fill="currentColor" d="M27.33 4.33v5c.6-.14 2-1.25 2-2.5s-1.4-2.36-2-2.5z" />
    </svg>
  );
}
