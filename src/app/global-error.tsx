"use client";

// Root-level fallback: replaces the entire document when the root layout
// itself throws, so it must render its own <html>/<body>.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="th">
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            textAlign: "center",
            padding: 24,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>
            เกิดข้อผิดพลาดที่ไม่คาดคิด
          </h2>
          <p style={{ color: "#666", fontSize: 14 }}>
            ลองใหม่อีกครั้ง หรือรีเฟรชหน้านี้
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "1px solid #ddd",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            ลองใหม่
          </button>
        </div>
      </body>
    </html>
  );
}
