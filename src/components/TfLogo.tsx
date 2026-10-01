import React from "react";
import tfLogoExact from "../assets/images/tflogo1.png";
import corporateFacilityImg from "../assets/images/corporate_facility_bg_1790827662470.jpg";
import securityCheckpointImg from "../assets/images/security_checkpoint_login_1790827675252.jpg";

export const CORPORATE_FACILITY_BG = corporateFacilityImg;
export const SECURITY_CHECKPOINT_IMG = securityCheckpointImg;

/**
 * Renders the exact TF Commodities organization logo (tflogo1.png).
 * Distinct from the TFSECURE system title.
 */
export function TfLogo({
  size = "md",
  lightText = false,
}: {
  size?: "sm" | "md" | "lg";
  stacked?: boolean;
  lightText?: boolean;
}) {
  const height = size === "lg" ? 92 : size === "md" ? 64 : 42;

  return (
    <div className="tf-logo-exact-wrap" title="TF Commodities — A Cocoa Processing Company">
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
