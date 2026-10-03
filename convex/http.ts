import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import { v } from "convex/values";

const http = httpRouter();
auth.addHttpRoutes(http);

export default http;
