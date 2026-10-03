/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTP from "../ResendOTP.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as authWrapper from "../authWrapper.js";
import type * as csrf from "../csrf.js";
import type * as departments from "../departments.js";
import type * as http from "../http.js";
import type * as lib from "../lib.js";
import type * as metrics from "../metrics.js";
import type * as notifications from "../notifications.js";
import type * as passcodes from "../passcodes.js";
import type * as security from "../security.js";
import type * as settings from "../settings.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  audit: typeof audit;
  auth: typeof auth;
  authWrapper: typeof authWrapper;
  csrf: typeof csrf;
  departments: typeof departments;
  http: typeof http;
  lib: typeof lib;
  metrics: typeof metrics;
  notifications: typeof notifications;
  passcodes: typeof passcodes;
  security: typeof security;
  settings: typeof settings;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
