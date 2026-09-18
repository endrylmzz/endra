#!/usr/bin/env node
// One-time interactive setup for Gmail + Calendar OAuth (TOOLS-003/004).
// Run with: node --env-file=.env scripts/google-oauth-setup.mjs
//
// Starts a local server, opens the Google consent screen for you to
// approve in your own browser, catches the redirect on localhost,
// exchanges the code for a refresh token, and writes it into .env.
// Never run this on Ender's behalf - the browser consent step has to
// be done by him, logged into his own Google account.

import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");

const PORT = 45678;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
].join(" ");

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set - add them to .env first.");
  process.exit(1);
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPES);
authUrl.searchParams.set("access_type", "offline");
// Forces the consent screen every time, which is the only way Google
// reliably issues a refresh_token (it's otherwise only sent on a
// user's very first-ever authorization).
authUrl.searchParams.set("prompt", "consent");

console.log("\nAşağıdaki URL'yi kendi tarayıcında aç ve Google hesabınla onayla:\n");
console.log(authUrl.toString());
console.log(
  "\nOnayladıktan sonra bu pencereye otomatik dönülecek, script kendiliğinden bitecek.\n",
);

function saveRefreshToken(token) {
  let content = readFileSync(envPath, "utf8");
  if (content.includes("GOOGLE_REFRESH_TOKEN=")) {
    content = content.replace(/GOOGLE_REFRESH_TOKEN=.*/g, `GOOGLE_REFRESH_TOKEN=${token}`);
  } else {
    content += `\nGOOGLE_REFRESH_TOKEN=${token}\n`;
  }
  writeFileSync(envPath, content);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const error = url.searchParams.get("error");
  if (error) {
    res
      .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end(`<p>Yetkilendirme reddedildi: ${error}. Bu sekmeyi kapatabilirsin.</p>`);
    console.error("Authorization denied:", error);
    server.close();
    process.exit(1);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    res.writeHead(400).end();
    return;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
      }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new Error(tokenData.error_description || tokenData.error || "token exchange failed");
    }
    if (!tokenData.refresh_token) {
      throw new Error(
        "Google bir refresh_token döndürmedi - muhtemelen bu hesap için zaten bir yetki var. " +
          "myaccount.google.com/permissions üzerinden ENDRA'ya verilen izni kaldırıp tekrar dene.",
      );
    }

    if (!existsSync(envPath)) throw new Error(`.env not found at ${envPath}`);
    saveRefreshToken(tokenData.refresh_token);

    res
      .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end("<p>Başarılı! refresh_token .env dosyasına kaydedildi. Bu sekmeyi kapatabilirsin.</p>");
    console.log("\nrefresh_token .env dosyasına kaydedildi (GOOGLE_REFRESH_TOKEN).");
    server.close();
    process.exit(0);
  } catch (err) {
    res
      .writeHead(500, { "Content-Type": "text/html; charset=utf-8" })
      .end(`<p>Hata: ${err.message}</p>`);
    console.error("Token exchange failed:", err.message);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, "127.0.0.1");
