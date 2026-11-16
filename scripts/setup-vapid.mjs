import {readFile,writeFile,rename} from 'node:fs/promises';
import {generateVAPIDKeys} from 'web-push';
import dotenv from 'dotenv';
const path=new URL('../.env',import.meta.url);
let contents;try{contents=await readFile(path,'utf8')}catch{throw new Error('Сначала создайте .env из .env.example')}
const values=dotenv.parse(contents);
if(values.VAPID_PUBLIC_KEY&&values.VAPID_PRIVATE_KEY){console.log('VAPID-ключи уже настроены.');process.exit(0)}
if(values.VAPID_PUBLIC_KEY||values.VAPID_PRIVATE_KEY)throw new Error('Найдена только часть пары VAPID. Исправьте .env вручную, чтобы не потерять существующий ключ.');
const keys=generateVAPIDKeys();
function set(name,value){const line=`${name}="${value}"`;const pattern=new RegExp(`^${name}=.*$`,'m');contents=pattern.test(contents)?contents.replace(pattern,line):contents.trimEnd()+'\n'+line+'\n'}
set('VAPID_PUBLIC_KEY',keys.publicKey);set('VAPID_PRIVATE_KEY',keys.privateKey);if(!values.VAPID_SUBJECT)set('VAPID_SUBJECT','mailto:admin@example.test');
const temporary=new URL('../.env.vapid.tmp',import.meta.url);await writeFile(temporary,contents,{mode:0o600,flag:'wx'});await rename(temporary,path);console.log('VAPID-ключи сохранены в .env. Перезапустите API.');
