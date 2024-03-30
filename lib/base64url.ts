export function encodeBase64Url(base64url: string) {
  return btoa(base64url)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function decodeBase64Url(base64url: string) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");

  return Buffer.from(base64, "base64");
}
