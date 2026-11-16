export const gifts = {
  star: {name:'Звезда', icon:'✦', rarity:'Обычный', color:'blue', description:'Немного света для важного человека.'},
  heart: {name:'Сердце', icon:'♥', rarity:'Обычный', color:'rose', description:'Тёплый знак внимания.'},
  flower: {name:'Цветок', icon:'✿', rarity:'Редкий', color:'violet', description:'Для тех, кто делает дни ярче.'},
  comet: {name:'Комета', icon:'☄', rarity:'Редкий', color:'gold', description:'Пусть всё задуманное сбудется.'},
  moon: {name:'Луна', icon:'☾', rarity:'Особенный', color:'mint', description:'Маленький свет в ночи.'},
  diamond: {name:'Кристалл', icon:'◆', rarity:'Особенный', color:'indigo', description:'На память об особенном моменте.'}
} as const;
export const badges: Record<string,{name:string;icon:string;description:string;condition:string}> = {
  early:{name:'Ранний участник',icon:'✦',description:'Один из первых пользователей nimb.',condition:'Подтвердить один из первых 100 аккаунтов.'},
  channel_author:{name:'Автор канала',icon:'◉',description:'Создал канал в nimb.',condition:'Создать первый канал.'},
  verified:{name:'Nimb Verified',icon:'✓',description:'Аккаунт подтверждён командой Nimb.',condition:'Выдаётся владельцем Nimb.'},
  bug_hunter:{name:'Bug Hunter',icon:'🐛',description:'Помог сделать Nimb лучше, сообщив об ошибках.',condition:'Выдаётся владельцем Nimb за подтверждённый баг.'},
  nimb_team:{name:'Nimb Team',icon:'✧',description:'Участник команды Nimb.',condition:'Выдаётся владельцем Nimb.'},
  beta_tester:{name:'Beta Tester',icon:'◈',description:'Тестировал Nimb на раннем этапе.',condition:'Выдаётся владельцем Nimb.'},
  plus:{name:'Nimb Plus',icon:'✦',description:'Премиальный статус Nimb.',condition:'Выдаётся владельцем Nimb.'}
};
