// Generates the Supabase Auth email templates (light theme) into supabase/templates/.
// Run: node scripts/build-email-templates.mjs   then: npx supabase config push
// Email-client safe: table layout, inline styles, no SVG, no web fonts required.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'supabase', 'templates');

const SITE = 'https://aurafit-alpha-one.vercel.app';
const LOGO = `${SITE}/icons/icon-192.png`;

// Light theme tokens (apps/web/src/app/globals.css, AA-safe button colour).
const c = {
  page: '#F1F5F9',
  card: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  secondary: '#475569',
  muted: '#64748B',
  accent: '#4F46E5',
  accentSoft: '#EEF2FF',
  accentText: '#4338CA',
};

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
            <tr>
              <td align="center" bgcolor="${c.accent}" style="border-radius:12px;">
                <a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${font};font-size:16px;font-weight:700;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:12px;">${label}</a>
              </td>
            </tr>
          </table>`;
}

function fallbackLink(href) {
  return `<p style="margin:20px 0 0;font-family:${font};font-size:13px;line-height:20px;color:${c.muted};">
            Button not working? Copy and paste this link into your browser:<br>
            <a href="${href}" target="_blank" style="color:${c.accentText};word-break:break-all;">${href}</a>
          </p>`;
}

function codeBlock(code) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
            <tr>
              <td style="background:${c.accentSoft};border:1px solid ${c.border};border-radius:12px;padding:16px 28px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:8px;color:${c.text};">${code}</td>
            </tr>
          </table>`;
}

function layout({ preheader, eyebrow, title, body, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${c.page};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.page};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 4px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;"><img src="${LOGO}" width="40" height="40" alt="AuraFit" style="display:block;border:0;border-radius:10px;"></td>
                  <td style="vertical-align:middle;padding-left:12px;font-family:${font};font-size:18px;font-weight:800;letter-spacing:1px;color:${c.text};">AURAFIT</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:${c.card};border:1px solid ${c.border};border-radius:18px;padding:36px 32px;">
              <p style="margin:0 0 8px;font-family:${font};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${c.accentText};">${eyebrow}</p>
              <h1 style="margin:0 0 16px;font-family:${font};font-size:24px;line-height:32px;font-weight:800;color:${c.text};">${title}</h1>
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0;font-family:${font};font-size:12px;line-height:18px;color:${c.muted};text-align:center;">
              ${footerNote}<br><br>
              AuraFit — level up your physical stats.<br>
              <a href="${SITE}/privacy" style="color:${c.muted};text-decoration:underline;">Privacy</a>
              &nbsp;·&nbsp;
              <a href="${SITE}/terms" style="color:${c.muted};text-decoration:underline;">Terms</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

const p = (text) =>
  `<p style="margin:0 0 12px;font-family:${font};font-size:16px;line-height:24px;color:${c.secondary};">${text}</p>`;

const notYou = "If you didn't request this, you can safely ignore this email.";

export const templates = {
  confirmation: {
    subject: 'Confirm your AuraFit account',
    html: layout({
      preheader: 'One tap to activate your hunter profile.',
      eyebrow: 'Welcome, hunter',
      title: 'Confirm your email',
      body:
        p("You're one step away from starting your AuraFit journey. Confirm your email to activate your account and start earning Aura.") +
        button('{{ .ConfirmationURL }}', 'Confirm email address') +
        fallbackLink('{{ .ConfirmationURL }}'),
      footerNote: `You're receiving this because {{ .Email }} was used to sign up for AuraFit. ${notYou}`,
    }),
  },
  recovery: {
    subject: 'Reset your AuraFit password',
    html: layout({
      preheader: 'Use this link to choose a new password.',
      eyebrow: 'Account security',
      title: 'Reset your password',
      body:
        p('We received a request to reset the password for your AuraFit account. Tap the button below to choose a new one.') +
        button('{{ .ConfirmationURL }}', 'Reset password') +
        p('For your security, this link expires soon and can only be used once.') +
        fallbackLink('{{ .ConfirmationURL }}'),
      footerNote: `Sent to {{ .Email }}. ${notYou} Your password won't change.`,
    }),
  },
  magic_link: {
    subject: 'Your AuraFit sign-in link',
    html: layout({
      preheader: 'Tap to sign in to AuraFit.',
      eyebrow: 'Sign in',
      title: 'Your sign-in link',
      body:
        p('Tap the button below to sign in to AuraFit. This link can only be used once.') +
        button('{{ .ConfirmationURL }}', 'Sign in to AuraFit') +
        fallbackLink('{{ .ConfirmationURL }}'),
      footerNote: `Sent to {{ .Email }}. ${notYou}`,
    }),
  },
  email_change: {
    subject: 'Confirm your new AuraFit email',
    html: layout({
      preheader: 'Confirm the change to your account email.',
      eyebrow: 'Account security',
      title: 'Confirm your new email',
      body:
        p('You asked to change the email on your AuraFit account from <strong style="color:' + c.text + ';">{{ .Email }}</strong> to <strong style="color:' + c.text + ';">{{ .NewEmail }}</strong>.') +
        button('{{ .ConfirmationURL }}', 'Confirm email change') +
        fallbackLink('{{ .ConfirmationURL }}'),
      footerNote: `If you didn't request this change, ignore this email and your account email will stay the same.`,
    }),
  },
  invite: {
    subject: "You're invited to AuraFit",
    html: layout({
      preheader: 'Accept your invite and start levelling up.',
      eyebrow: "You're invited",
      title: 'Join AuraFit',
      body:
        p("You've been invited to create an AuraFit account. Complete daily quests, keep your streak alive and climb the hunter ranks.") +
        button('{{ .ConfirmationURL }}', 'Accept invite') +
        fallbackLink('{{ .ConfirmationURL }}'),
      footerNote: `This invite was sent to {{ .Email }}. If you weren't expecting it, you can ignore this email.`,
    }),
  },
  reauthentication: {
    subject: 'Your AuraFit verification code',
    html: layout({
      preheader: 'Your one-time verification code.',
      eyebrow: 'Account security',
      title: 'Confirm it’s you',
      body:
        p('Enter this code in AuraFit to confirm your identity:') +
        codeBlock('{{ .Token }}') +
        p('This code expires shortly. Never share it with anyone.'),
      footerNote: `Sent to {{ .Email }}. ${notYou}`,
    }),
  },
};

mkdirSync(outDir, { recursive: true });
for (const [name, t] of Object.entries(templates)) {
  writeFileSync(join(outDir, `${name}.html`), t.html);
}
console.log(`wrote ${Object.keys(templates).length} templates to supabase/templates/`);
