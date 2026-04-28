import { useState, useEffect } from "react";

/**
 * IosInstallBanner
 *
 * Toont een uitlegbanner aan iOS Safari gebruikers die de app nog niet
 * geïnstalleerd hebben. De banner verdwijnt na sluiten en wordt niet
 * meer getoond (opgeslagen in localStorage).
 *
 * Gebruik: drop dit component in _app.js of AppLayout.js
 *   <IosInstallBanner />
 */
export default function IosInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    const dismissed = localStorage.getItem("iosInstallBannerDismissed");

    if (isIos && !isStandalone && !dismissed) {
      // Kleine vertraging zodat de pagina eerst laadt
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  function dismiss() {
    setVisible(false);
    localStorage.setItem("iosInstallBannerDismissed", "1");
  }

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={dismiss}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 9998,
          animation: "fadeIn 0.25s ease",
        }}
      />

      {/* Banner — verschijnt onderaan, boven de Safari toolbar */}
      <div
        role="dialog"
        aria-label="Installeer Skippr"
        style={{
          position: "fixed",
          bottom: 80, // boven Safari's adresbalk
          left: "50%",
          transform: "translateX(-50%)",
          width: "calc(100% - 32px)",
          maxWidth: 420,
          background: "#1a1a2e",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          zIndex: 9999,
          padding: "20px 20px 18px",
          color: "#f0f0f0",
          fontFamily: "system-ui, -apple-system, sans-serif",
          animation: "slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Sluitknop */}
        <button
          onClick={dismiss}
          aria-label="Sluiten"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "rgba(255,255,255,0.08)",
            border: "none",
            borderRadius: "50%",
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#aaa",
            fontSize: 16,
            lineHeight: 1,
          }}
        >
          ×
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          {/* App icon placeholder — vervang src door jouw /icons/apple-touch-icon.png */}
          <img
            src="/icons/apple-touch-icon.png"
            alt="Skippr"
            width={44}
            height={44}
            style={{ borderRadius: 10, flexShrink: 0 }}
            onError={(e) => {
              // Fallback als icon nog niet bestaat
              e.target.style.display = "none";
            }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Installeer Skippr</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
              Voeg toe aan je beginscherm voor de beste ervaring
            </div>
          </div>
        </div>

        {/* Stappen */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Step number={1}>
            Tik op{" "}
            <strong style={{ color: "#fff" }}>
              <ShareIcon /> Deel
            </strong>{" "}
            onderaan in Safari
          </Step>
          <Step number={2}>
            Scroll naar beneden en tik op{" "}
            <strong style={{ color: "#fff" }}>"Zet op beginscherm"</strong>
          </Step>
          <Step number={3}>
            Tik op <strong style={{ color: "#fff" }}>"Voeg toe"</strong> rechtsboven
          </Step>
        </div>

        {/* Pijl die naar de Safari toolbar wijst */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: -10,
            left: "50%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "10px solid transparent",
            borderRight: "10px solid transparent",
            borderTop: "10px solid #1a1a2e",
          }}
        />
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(24px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </>
  );
}

function Step({ number, children }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        background: "rgba(255,255,255,0.05)",
        borderRadius: 10,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          background: "#4f46e5",
          color: "#fff",
          borderRadius: "50%",
          width: 22,
          height: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {number}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.45, color: "#ccc" }}>{children}</div>
    </div>
  );
}

// iOS Share-icoon als inline SVG (herkenbaar voor iOS-gebruikers)
function ShareIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "inline", verticalAlign: "middle", marginBottom: 2 }}
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
