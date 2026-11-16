import nodemailer from 'nodemailer';

type Mail = {to:string;subject:string;text:string};
type MailConfig = {provider?:string;brevoApiKey?:string;brevoSenderEmail?:string;brevoSenderName?:string;smtpHost?:string;smtpPort?:string;smtpSecure?:string;smtpUser?:string;smtpPassword?:string;mailFrom?:string};
export function createMailSender(config:MailConfig, http:typeof fetch=fetch){
  if(config.provider==='brevo'){
    const apiKey=config.brevoApiKey?.trim(),senderEmail=config.brevoSenderEmail?.trim();
    if(!apiKey||!senderEmail)throw new Error('BREVO_API_KEY и BREVO_SENDER_EMAIL обязательны для отправки писем через Brevo');
    return async (mail:Mail)=>{
      const response=await http('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':apiKey,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({sender:{email:senderEmail,name:config.brevoSenderName||'nimb'},to:[{email:mail.to}],subject:mail.subject,textContent:mail.text}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error(`Не удалось отправить письмо (почтовый сервис: HTTP ${response.status})`);
    };
  }
  if(config.provider&&config.provider!=='smtp')throw new Error('Неизвестный MAIL_PROVIDER');
  const transporter=nodemailer.createTransport({host:config.smtpHost||'localhost',port:Number(config.smtpPort||1025),secure:config.smtpSecure==='true',...(config.smtpUser?{auth:{user:config.smtpUser,pass:config.smtpPassword}}:{})});
  return async(mail:Mail)=>{await transporter.sendMail({from:config.mailFrom||'nimb <noreply@example.test>',...mail})};
}
