export const gifts = {
  star: {name:'Звезда', icon:'✦', rarity:'Обычный', color:'blue', description:'Немного света для важного человека.'},
  heart: {name:'Сердце', icon:'♥', rarity:'Обычный', color:'rose', description:'Тёплый знак внимания.'},
  flower: {name:'Цветок', icon:'✿', rarity:'Редкий', color:'violet', description:'Для тех, кто делает дни ярче.'},
  comet: {name:'Комета', icon:'☄', rarity:'Редкий', color:'gold', description:'Пусть всё задуманное сбудется.'},
  moon: {name:'Луна', icon:'☾', rarity:'Особенный', color:'mint', description:'Маленький свет в ночи.'},
  diamond: {name:'Кристалл', icon:'◆', rarity:'Особенный', color:'indigo', description:'На память об особенном моменте.'}
} as const;
export const badges: Record<string,{name:string;icon:string;description:string;condition:string}> = {
  bug_hunter:{name:'Bug Hunter',icon:'bug',description:'Помогает находить и исправлять ошибки nimb.',condition:'Выдаёт владелец nimb за полезные сообщения о багах.'},
  nimb_team:{name:'Nimb team',icon:'team',description:'Участник команды nimb.',condition:'Выдаёт владелец nimb.'},
  beta_tester:{name:'Beta tester',icon:'flask',description:'Тестирует новые возможности nimb.',condition:'Выдаёт владелец nimb за участие в тестировании.'},
  plus:{name:'Plus',icon:'plus',description:'Персональные шрифты, эффекты имени и цвета профиля.',condition:'Подключает владелец nimb.'},
  early:{name:'Ранний участник',icon:'✦',description:'Один из первых пользователей nimb.',condition:'Подтвердить один из первых 100 аккаунтов.'},
  channel_author:{name:'Автор канала',icon:'◉',description:'Создал канал в nimb.',condition:'Создать первый канал.'}
};
