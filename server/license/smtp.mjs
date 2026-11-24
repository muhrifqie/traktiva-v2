// Minimal SMTP sender (implicit TLS, e.g. smtp.gmail.com:465 with an App Password). Standard library only, like the
// rest of the license server. Enough for transactional mail: one recipient, text + HTML, AUTH PLAIN.
import crypto from "node:crypto";
import tls from "node:tls";

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const header = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap = (s) => s.replace(/.{1,76}/g, "$&\r\n");

/** Send one email. cfg = { host, port = 465, user, pass, fromName }. Resolves on 250 after DATA, rejects with the server reply. */
export function sendMail(cfg, { to, subject, text, html }) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host: cfg.host, port: cfg.port || 465, servername: cfg.host });
    sock.setTimeout(20_000, () => sock.destroy(new Error("SMTP timeout")));
    let buf = "";
    const waiters = [];
    sock.on("data", (d) => {
      buf += d.toString("utf8");
      // a reply is complete when its last line is "NNN <text>" (multi-line replies use "NNN-")
      let m;
      while ((m = buf.match(/^(?:\d{3}-[^\r\n]*\r\n)*(\d{3}) [^\r\n]*\r\n/))) {
        buf = buf.slice(m[0].length);
        waiters.shift()?.(m[0]);
      }
    });
    sock.on("error", reject);
    const reply = () => new Promise((r) => waiters.push(r));
    const step = async (cmd, ok) => {
      if (cmd != null) sock.write(cmd + "\r\n");
      const r = await reply();
      if (!ok.includes(Number(r.slice(0, 3)))) throw new Error(`SMTP ${cmd?.split(" ")[0] ?? "greeting"}: ${r.trim().split("\r\n").pop()}`);
      return r;
    };
    const boundary = `trk${crypto.randomBytes(12).toString("hex")}`;
    const domain = cfg.user.split("@")[1] || "localhost";
    const msg = [
      `From: ${header(cfg.fromName || "Traktiva")} <${cfg.user}>`,
      `To: <${to}>`,
      `Subject: ${header(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@${domain}>`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrap(b64(text)),
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      wrap(b64(html)),
      `--${boundary}--`,
      "",
    ].join("\r\n");
    (async () => {
      await step(null, [220]);
      await step(`EHLO ${domain}`, [250]);
      await step(`AUTH PLAIN ${b64(`\0${cfg.user}\0${cfg.pass}`)}`, [235]);
      await step(`MAIL FROM:<${cfg.user}>`, [250]);
      await step(`RCPT TO:<${to}>`, [250, 251]);
      await step("DATA", [354]);
      await step(`${msg}\r\n.`, [250]); // base64 bodies never start a line with "."
      sock.end("QUIT\r\n");
    })().then(resolve, (e) => {
      sock.destroy();
      reject(e);
    });
  });
}
