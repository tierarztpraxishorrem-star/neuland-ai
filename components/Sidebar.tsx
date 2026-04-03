"use client";
import Link from "next/link";

export default function Sidebar() {
  return (
    <div style={{
      width: "250px",
      height: "100vh",
      background: "#1f2937",
      color: "white",
      padding: "20px"
    }}>
      <h2>Neuland AI</h2>

      <div style={{ marginTop: "20px" }}>
        <Link href="/">Dashboard</Link><br /><br />
        <Link href="/konsultation">Konsultation</Link><br /><br />
        <Link href="/kommunikation">Kommunikation</Link><br /><br />
        <Link href="/patienten">Patienten</Link><br /><br />
        <Link href="/vorlagen">Vorlagen</Link>
      </div>
    </div>
  );
}