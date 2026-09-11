import nodemailer from 'nodemailer';

export function mailConfig(env = process.env) {
  const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM', 'MAIL_TO'];
  for (const key of required) if (!env[key] || env[key].startsWith('REPLACE_')) throw new Error(`Configure ${key} in the server environment`);
  for (const key of ['MAIL_FROM', 'MAIL_TO']) if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(env[key])) throw new Error(`Invalid ${key}`);
  const port = Number(env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP_PORT');
  if (env.SMTP_SECURE && !['true', 'false'].includes(env.SMTP_SECURE)) throw new Error('SMTP_SECURE must be true or false');
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465;
  return {
    from: env.MAIL_FROM, to: env.MAIL_TO,
    transport: {
      host: env.SMTP_HOST, port, secure, requireTLS: !secure,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      disableFileAccess: true, disableUrlAccess: true
    }
  };
}

export function smtpMailer(config) {
  const transport = nodemailer.createTransport(config.transport);
  return {
    verify: () => transport.verify(),
    send: async (data, id) => {
      const result = await transport.sendMail({
        from: { name: 'Gabions — заявки с сайта', address: config.from },
        to: config.to,
        subject: 'Новая заявка с сайта Gabions',
        messageId: `<${id}@${config.from.split('@')[1]}>`,
        text: [
          'Новая заявка с сайта Gabions', `Номер: ${id}`,
          `Интересует: ${data.subject}`, `Имя: ${data.name || 'Не указано'}`,
          `Телефон: ${data.phone}`, `Населённый пункт: ${data.city || 'Не указан'}`,
          '', 'Размеры и пожелания:', data.message || 'Не указаны', '',
          'Пользователь согласился на обработку данных для ответа на заявку.'
        ].join('\n')
      });
      if (!result.accepted?.length) throw new Error('SMTP did not accept the recipient');
    }
  };
}
