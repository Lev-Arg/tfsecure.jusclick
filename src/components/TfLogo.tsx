import React from "react";
import tfLogoExact from "../assets/images/tflogo1.png";

export const CORPORATE_FACILITY_BG = "/src/assets/images/corporate_facility_bg_1790827662470.jpg";
export const SECURITY_CHECKPOINT_IMG = "/src/assets/images/security_checkpoint_login_1790827675252.jpg";

/**
 * Renders the exact TF Commodities logo image (tflogo1.png) provided by the user.
 */
export function TfLogo({
  size = "md",
  lightText = false,
}: {
  size?: "sm" | "md" | "lg";
  stacked?: boolean;
  lightText?: boolean;
}) {
  const height = size === "lg" ? 112 : size === "md" ? 72 : 44;

  return (
    <div className="tf-logo-exact-wrap">
      <img
        src={tfLogoExact}
        alt="TF Commodities — A Cocoa Processing Company"
        className={`tf-logo-exact-img ${lightText ? "tf-logo-force-light" : ""}`}
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
