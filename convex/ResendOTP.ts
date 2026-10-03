import Resend from "@auth/core/providers/resend";
// Sends 8-digit codes through Resend's REST API. Enabled only when AUTH_RESEND_KEY is set (see auth.ts).
// Uses rejection sampling to avoid modulo bias and ensure uniform distribution
function otp() {
  const digits = [];
  for (let i = 0; i < 8; i++) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    // Rejection sampling to avoid modulo bias: only use values < 2^32 that are evenly divisible by 10
    const max = Math.floor(0xFFFFFFFF / 10) * 10;
    const random = array[0];
    const digit = random < max ? random % 10 : otpDigit();
    digits.push(digit);
  }
  return digits.join('');
}

function otpDigit(): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % 10;
}

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
