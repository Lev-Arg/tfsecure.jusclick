import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { ResendReset, ResendVerify } from "./ResendOTP";
const email = !!process.env.AUTH_RESEND_KEY; // production: set AUTH_RESEND_KEY to require email verification + enable reset
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({
    profile: p => ({ email: String(p.email), name: String(p.name ?? "") }),
    ...(email ? { verify: ResendVerify, reset: ResendReset } : {}),
  })],
});
