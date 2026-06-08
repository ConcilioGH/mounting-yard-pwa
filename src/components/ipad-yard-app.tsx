"use client";

import { useState, type CSSProperties } from "react";

const SAMPLE_RACES = [
  { id: "R1", label: "Race 1" },
  { id: "R2", label: "Race 2" },
] as const;

const SAMPLE_RUNNERS = [
  { id: "horse-1", label: "Horse 1" },
  { id: "horse-2", label: "Horse 2" },
] as const;

const btnStyle: CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: 360,
  margin: "12px 0",
  padding: "16px 18px",
  fontSize: 18,
  fontWeight: 700,
  border: "2px solid #111",
  borderRadius: 12,
  background: "#fff",
  color: "#111",
  cursor: "pointer",
};

export default function IpadYardApp() {
  const [tapCount, setTapCount] = useState(0);
  const [selectedRace, setSelectedRace] = useState("—");
  const [selectedRunner, setSelectedRunner] = useState("—");
  const [selectedFactor, setSelectedFactor] = useState("—");

  const bump = () => setTapCount((count) => count + 1);

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        background: "#f8fafc",
        color: "#0f172a",
      }}
    >
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>iPad Yard Test</h1>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: "#475569" }}>
        Minimal React client — onClick only, no providers
      </p>

      <div
        style={{
          marginBottom: 20,
          padding: 16,
          border: "2px solid #ef4444",
          borderRadius: 12,
          background: "#fef2f2",
          fontSize: 16,
          lineHeight: 1.6,
        }}
      >
        <div>
          <strong>Tap:</strong> {tapCount}
        </div>
        <div>
          <strong>Selected race:</strong> {selectedRace}
        </div>
        <div>
          <strong>Selected runner:</strong> {selectedRunner}
        </div>
        <div>
          <strong>Selected factor:</strong> {selectedFactor}
        </div>
      </div>

      {SAMPLE_RACES.map((race) => (
        <button
          key={race.id}
          type="button"
          style={btnStyle}
          onClick={() => {
            bump();
            setSelectedRace(race.id);
          }}
        >
          {race.id}
        </button>
      ))}

      {SAMPLE_RUNNERS.map((runner) => (
        <button
          key={runner.id}
          type="button"
          style={btnStyle}
          onClick={() => {
            bump();
            setSelectedRunner(runner.label);
          }}
        >
          {runner.label}
        </button>
      ))}

      <button
        type="button"
        style={{ ...btnStyle, background: "#9333ea", color: "#fff" }}
        onClick={() => {
          bump();
          setSelectedFactor("Clean+");
        }}
      >
        Clean+
      </button>
    </div>
  );
}
