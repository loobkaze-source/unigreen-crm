"use client";

import { useEffect, useState } from "react";

/**
 * Random loading art — each load shows one of four animated energy-themed
 * graphics: the Unicloud cloud, a dripping fuel nozzle, a wind turbine, or a
 * solar panel. Chosen client-side after mount so SSR/hydration always match.
 */

function CloudArt() {
  return (
    <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden>
      {/* Small background cloud, drifting slower */}
      <g
        className="text-sky-300/60 dark:text-sky-700/60"
        style={{ animation: "uc-float 3.2s ease-in-out 0.6s infinite" }}
        fill="currentColor"
      >
        <circle cx="70" cy="34" r="7" />
        <circle cx="79" cy="36" r="6" />
        <rect x="66" y="34" width="18" height="8" rx="4" />
      </g>
      {/* Main Unicloud cloud, floating */}
      <g
        className="text-primary"
        style={{ animation: "uc-float 2.4s ease-in-out infinite" }}
        fill="currentColor"
      >
        <circle cx="34" cy="56" r="12" />
        <circle cx="58" cy="56" r="15" />
        <circle cx="46" cy="44" r="15" />
        <rect x="34" y="50" width="24" height="20" rx="7" />
      </g>
      {/* Rain-of-data dots */}
      {[38, 48, 58].map((x, i) => (
        <circle
          key={x}
          cx={x}
          cy="76"
          r="2.2"
          className="fill-sky-400"
          style={{ animation: `uc-drip 1.6s ease-in ${i * 0.35}s infinite` }}
        />
      ))}
    </svg>
  );
}

function FuelArt() {
  return (
    <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden>
      {/* Pump body */}
      <g className="text-primary" fill="currentColor">
        {/* Handle grip */}
        <rect x="30" y="16" width="26" height="9" rx="3" />
        {/* Trigger guard */}
        <path d="M34 25 h8 v8 h-8 z" opacity="0.7" />
        {/* Body */}
        <rect x="28" y="30" width="30" height="28" rx="6" />
        {/* Spout: out to the right, hooking down */}
        <path d="M58 34 h12 a6 6 0 0 1 6 6 v12 h-7 v-10 a2 2 0 0 0-2-2 h-9 z" />
      </g>
      {/* Window on the body */}
      <rect x="34" y="36" width="12" height="9" rx="2" className="fill-card" opacity="0.9" />
      {/* Falling drop from the spout */}
      <path
        d="M72.5 56 c-2.6 3.4 -3.9 5.5 -3.9 7.4 a3.9 3.9 0 0 0 7.8 0 c0-1.9 -1.3-4 -3.9-7.4 z"
        className="fill-amber-500"
        style={{ animation: "uc-drip 1.5s ease-in infinite" }}
      />
      {/* Base */}
      <rect x="26" y="58" width="34" height="6" rx="3" className="fill-muted-foreground/40" />
    </svg>
  );
}

function TurbineArt() {
  return (
    <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden>
      {/* Ground */}
      <path
        d="M20 86 h56"
        className="stroke-muted-foreground/40"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* Tower */}
      <path d="M45.5 84 L47 38 h2 L50.5 84 z" className="fill-primary/80" />
      {/* Rotor blades — spin around the hub */}
      <g
        className="text-primary"
        style={{
          animation: "uc-rotor 2.2s linear infinite",
          transformOrigin: "48px 36px",
        }}
        fill="currentColor"
      >
        {[0, 120, 240].map((deg) => (
          <path
            key={deg}
            d="M48 36 C45.5 26 45.8 16 48 8 C50.2 16 50.5 26 48 36 z"
            transform={`rotate(${deg} 48 36)`}
          />
        ))}
      </g>
      {/* Hub */}
      <circle cx="48" cy="36" r="4" className="fill-primary" />
      <circle cx="48" cy="36" r="1.6" className="fill-card" />
    </svg>
  );
}

function SolarArt() {
  return (
    <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden>
      {/* Sun with rotating rays */}
      <g
        className="text-amber-400"
        style={{ animation: "uc-rotor 9s linear infinite", transformOrigin: "30px 26px" }}
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      >
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <line
            key={deg}
            x1="30"
            y1="10"
            x2="30"
            y2="14.5"
            transform={`rotate(${deg} 30 26)`}
          />
        ))}
      </g>
      <circle
        cx="30"
        cy="26"
        r="7.5"
        className="fill-amber-400"
        style={{ animation: "uc-pulse 2s ease-in-out infinite" }}
      />
      {/* Tilted PV panel */}
      <g>
        <polygon points="30,74 52,52 88,52 66,74" className="fill-primary" />
        {/* Grid lines */}
        <g className="stroke-card" strokeWidth="1.6" opacity="0.85">
          <line x1="41" y1="63" x2="77" y2="63" />
          <line x1="59" y1="52" x2="45" y2="74" />
          <line x1="71" y1="52" x2="57" y2="74" />
        </g>
        {/* Stand */}
        <path d="M56 74 v8 M64 74 v8" className="stroke-muted-foreground/50" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}

const VARIANTS = [CloudArt, FuelArt, TurbineArt, SolarArt];

export function RandomLoadingArt() {
  // Picked after mount so the server-rendered fallback never mismatches.
  const [variant, setVariant] = useState<number | null>(null);
  useEffect(() => {
    setVariant(Math.floor(Math.random() * VARIANTS.length));
  }, []);

  if (variant === null) {
    return <span aria-hidden className="block h-24 w-24" />;
  }
  const Art = VARIANTS[variant];
  return (
    <span role="status" aria-label="กำลังโหลด">
      <Art />
    </span>
  );
}
