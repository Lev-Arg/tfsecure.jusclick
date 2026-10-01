import React from "react";
import tfLogoExact from "../assets/images/tflogo1.png";
import corporateFacilityImg from "../assets/images/corporate_facility_bg_1790827662470.jpg";
import securityCheckpointImg from "../assets/images/security_checkpoint_login_1790827675252.jpg";
import { useGateRegistry } from "../lib/gateRegistry";

export const DEFAULT_TF_LOGO = tfLogoExact;
export const CORPORATE_FACILITY_BG = corporateFacilityImg;
export const SECURITY_CHECKPOINT_IMG = securityCheckpointImg;

/**
 * Renders the TF Commodities organization logo (or custom configured logo from System Settings).
 * Distinct from the TFSECURE system title.
 */
export function TfLogo({
  size = "md",
  lightText = false,
  customSrc,
}: {
  size?: "sm" | "md" | "lg" | "fill";
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
        title="TF Commodities — A Cocoa Processing Company"
      >
        <img
          src={logoSrc}
          alt="TF Commodities — A Cocoa Processing Company"
          className={`tf-logo-exact-img tf-logo-fill-img ${
            lightText || isCustomLogo ? "tf-logo-force-light" : ""
          }`}
          draggable={false}
        />
      </div>
    );
  }

  const height = size === "lg" ? 92 : size === "md" ? 64 : 42;

  return (
    <div className="tf-logo-exact-wrap" title="TF Commodities — A Cocoa Processing Company">
      <img
        src={logoSrc}
        alt="TF Commodities — A Cocoa Processing Company"
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
