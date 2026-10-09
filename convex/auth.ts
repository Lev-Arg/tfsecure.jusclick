import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ResendReset, ResendVerify } from "./ResendOTP";

const email = !!process.env.AUTH_RESEND_KEY;

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile: p => ({
        email: String(p.email ?? "").trim().toLowerCase(),
        name: String(p.name ?? "").trim().slice(0, 80),
      }),
      ...(email ? { verify: ResendVerify, reset: ResendReset } : {}),
    }),
  ],
});
