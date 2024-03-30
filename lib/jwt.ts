import { encodeBase64Url } from "./base64url";
import { createHmac } from "crypto";

export const generateJwt = (payload: string, secret: string) => {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const headerPayloadEncoded = `${encodeBase64Url(
    JSON.stringify(header)
  )}.${encodeBase64Url(JSON.stringify(payload))}`;
  let hmac = createHmac("sha256", `${process.env.JWT_SECRET_KEY}`);
  hmac = hmac.update(headerPayloadEncoded);

  const signature = hmac.digest("base64url");

  return `${headerPayloadEncoded}.${signature}`;
};
