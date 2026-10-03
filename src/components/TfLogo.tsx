import React, { useEffect } from "react";
import tfLogoExact from "../assets/images/tflogo1.png";
import corporateFacilityImg from "../assets/images/corporate_facility_bg_1790827662470.jpg";
import securityCheckpointImg from "../assets/images/security_checkpoint_login_1790827675252.jpg";
import { useGateRegistry } from "../lib/gateRegistry";

export const DEFAULT_TF_LOGO = tfLogoExact;
export const CORPORATE_FACILITY_BG = corporateFacilityImg;
export const SECURITY_CHECKPOINT_IMG = securityCheckpointImg;

/**
 * Generates a square 192x192 / 512x512 icon data URL from the active dashboard logo
 * and applies it to all browser favicon, Apple touch icon, and tile icon links.
 */
export function syncSystemLogoAndFavicons(customLogoUrl?: string): void {
  if (typeof document === "undefined") return;
  const activeLogoSrc = customLogoUrl?.trim() || tfLogoExact;
  const isDefaultWhiteLogo = !customLogoUrl?.trim();

  const applyHrefToIcons = (href: string, type = "image/png") => {
    const iconSelectors = [
      'link[rel="icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
    ];
    iconSelectors.forEach(sel => {
      const links = document.querySelectorAll<HTMLLinkElement>(sel);
      links.forEach(link => {
        link.href = href;
        if (link.rel !== "apple-touch-icon") {
          link.type = type;
        }
      });
    });
    const tileMeta = document.querySelector<HTMLMetaElement>('meta[name="msapplication-TileImage"]');
    if (tileMeta) {
      tileMeta.content = href;
    }
  };

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const size = 192;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        applyHrefToIcons(activeLogoSrc);
        return;
      }

      // Rounded dark badge container so both default white logo and custom dashboard logos are crisp as system icons
      const r = 36;
      ctx.fillStyle = "#0b111e";
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.fill();

      if (isDefaultWhiteLogo) {
        ctx.strokeStyle = "rgba(224, 161, 0, 0.38)";
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      const pad = Math.round(size * 0.11);
      const availW = size - pad * 2;
      const availH = size - pad * 2;
      const scale = Math.min(availW / (img.naturalWidth || 1), availH / (img.naturalHeight || 1));
      const drawW = (img.naturalWidth || availW) * scale;
      const drawH = (img.naturalHeight || availH) * scale;
      const dx = (size - drawW) / 2;
      const dy = (size - drawH) / 2;

      ctx.drawImage(img, dx, dy, drawW, drawH);
      const iconDataUrl = canvas.toDataURL("image/png");
      applyHrefToIcons(iconDataUrl, "image/png");
    } catch {
      applyHrefToIcons(activeLogoSrc);
    }
  };
  img.onerror = () => {
    applyHrefToIcons("/pwa-192x192.png", "image/png");
  };
  img.src = activeLogoSrc;
}

/**
 * Hook that keeps the browser's favicon, Apple touch icon, and system icon
 * synchronized with the current logo in the dashboard.
 */
export function useSystemLogoFaviconSync() {
  const registry = useGateRegistry();
  useEffect(() => {
    syncSystemLogoAndFavicons(registry.systemConfig.customLogoUrl);
  }, [registry.systemConfig.customLogoUrl]);
}

/**
 * Renders the TF Commodities organization / system logo (or custom configured logo from the Dashboard).
 */
export function TfLogo({
  size = "md",
  lightText = false,
  customSrc,
}: {
  size?: "icon" | "sm" | "md" | "lg" | "fill";
  stacked?: boolean;
  lightText?: boolean;
  customSrc?: string;
}) {
  const registry = useGateRegistry();
  const logoSrc = customSrc || registry.systemConfig.customLogoUrl || tfLogoExact;
  const isCustomLogo = Boolean(customSrc || registry.systemConfig.customLogoUrl);

  if (size === "fill") {
    return (
      <div
        className="tf-logo-exact-wrap tf-logo-fill-wrap"
        title="TF Commodities — System Logo"
      >
        <img
          src={logoSrc}
          alt="TF Commodities — System Logo"
          referrerPolicy="no-referrer"
          className={`tf-logo-exact-img tf-logo-fill-img ${
            lightText || isCustomLogo ? "tf-logo-force-light" : ""
          }`}
          draggable={false}
        />
      </div>
    );
  }

  if (size === "icon") {
    return (
      <div
        className="tf-logo-exact-wrap tf-system-icon-badge"
        title="TFsecure System Icon"
      >
        <img
          src={logoSrc}
          alt="TFsecure System Icon"
          referrerPolicy="no-referrer"
          className="tf-logo-exact-img tf-logo-force-light"
          style={{
            width: 24,
            height: 24,
            display: "block",
            objectFit: "contain",
          }}
          draggable={false}
        />
      </div>
    );
  }

  const height = size === "lg" ? 92 : size === "md" ? 64 : 42;

  return (
    <div className="tf-logo-exact-wrap" title="TF Commodities — System Logo">
      <img
        src={logoSrc}
        alt="TF Commodities — System Logo"
        referrerPolicy="no-referrer"
        className={`tf-logo-exact-img ${lightText || isCustomLogo ? "tf-logo-force-light" : ""}`}
        style={{
          height,
          width: "auto",
          display: "block",
          objectFit: "contain",
        }}
        draggable={false}
      />
    </div>
  );
}

