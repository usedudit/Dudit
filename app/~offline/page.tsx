"use client"

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        backgroundColor: "#fff",
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <img
        src="https://img.dudit.com.br/static/Icon.png"
        alt="Dudit"
        width={80}
        height={80}
        style={{ marginBottom: "1.5rem", borderRadius: "1rem" }}
      />
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: "#003d32",
          marginBottom: "0.5rem",
          textAlign: "center",
        }}
      >
        Você está offline
      </h1>
      <p
        style={{
          color: "#6b7280",
          textAlign: "center",
          marginBottom: "2rem",
          maxWidth: "24rem",
          lineHeight: 1.5,
        }}
      >
        Verifique sua conexão com a internet e tente novamente.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          backgroundColor: "#059669",
          color: "#fff",
          padding: "0.625rem 1.5rem",
          borderRadius: "9999px",
          border: "none",
          fontWeight: 600,
          fontSize: "0.875rem",
          cursor: "pointer",
        }}
      >
        Tentar novamente
      </button>
    </div>
  )
}
