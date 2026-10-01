import Resend from "@auth/core/providers/resend";
// Sends 8-digit codes through Resend's REST API. Enabled only when AUTH_RESEND_KEY is set (see auth.ts).
function otp() { const a = new Uint32Array(8); crypto.getRandomValues(a); return Array.from(a, n => n % 10).join(""); }
function make(id: string, subject: string) {
  return Resend({
    id, apiKey: process.env.AUTH_RESEND_KEY, maxAge: 60 * 15,
    async generateVerificationToken() { return otp(); },
    async sendVerificationRequest({ identifier: email, token }) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${process.env.AUTH_RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.AUTH_EMAIL_FROM ?? "TFsecure <onboarding@resend.dev>", to: [email], subject, text: `Your TFsecure code is ${token}. It expires in 15 minutes.` }),
      });
      if (!res.ok) throw new Error("Could not send email code");
    },
  });
}
export const ResendVerify = make("resend-verify", "Verify your TFsecure email");
export const ResendReset = make("resend-reset", "Reset your TFsecure password");
