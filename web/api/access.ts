import type {IncomingMessage,ServerResponse} from "node:http";
import {timingSafeEqual} from "node:crypto";
import {accessToken,local} from "./config.ts";
import {HttpError,body,json} from "./http.ts";

export function validateRequest(req:IncomingMessage) {
 if(local&&!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host||""))throw new HttpError("Invalid local host.",403);
 if(req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin))throw new HttpError("Cross-origin access is disabled.",403);
 if(req.method==="POST"&&req.headers["x-graphops"]!=="1")throw new HttpError("Application header required.",403);
}
export function authorized(req: IncomingMessage) {
  if (!accessToken) return true;
  let cookie =
    (req.headers.cookie || "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("graphops_access="))
      ?.slice(16) || "";
  try {
    cookie = decodeURIComponent(cookie);
  } catch {
    return false;
  }
  const candidate = Buffer.from(cookie),
    expected = Buffer.from(accessToken);
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}
export async function login(req:IncomingMessage,res:ServerResponse) {
 const input=await body(req),provided=Buffer.from(String(input.token||"")),expected=Buffer.from(accessToken);
 if(!accessToken||provided.length!==expected.length||!timingSafeEqual(provided,expected))return json(res,403,{error:"Access token is incorrect."});
 res.setHeader("Set-Cookie",`graphops_access=${encodeURIComponent(accessToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.GRAPHOPS_SECURE_COOKIE==="1"?"; Secure":""}`);
 return json(res,200,{authenticated:true});
}
export function logout(res:ServerResponse) {
 res.setHeader("Set-Cookie",`graphops_access=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.GRAPHOPS_SECURE_COOKIE==="1"?"; Secure":""}`);
 return json(res,200,{authenticated:false});
}
