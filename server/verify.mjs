import { mailConfig, smtpMailer } from './mail.mjs';
try {
  await smtpMailer(mailConfig()).verify();
  console.log('SMTP connection and authentication successful. No email was sent.');
} catch (error) {
  console.error('SMTP verification failed:', error.code || error.message);
  process.exitCode = 1;
}
