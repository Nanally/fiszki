export type HskCategoryEntry = {
  hanzi: string;
  pinyin: string;
  meaningPl: string;
  meaningEn: string;
};

export type HskCategory = {
  id: string;
  name: string;
  description: string;
  entries: HskCategoryEntry[];
};

export const HSK1_CATEGORIES: HskCategory[] = [
  {
    id: 'greetings-politeness',
    name: 'Powitania i uprzejmości',
    description:
      'Najczęściej używane zwroty grzecznościowe potrzebne w każdej rozmowie.',
    entries: [
      { hanzi: '你好', pinyin: 'nǐ hǎo', meaningPl: 'cześć', meaningEn: 'hello' },
      { hanzi: '谢谢', pinyin: 'xièxie', meaningPl: 'dziękuję', meaningEn: 'thank you' },
      {
        hanzi: '不客气',
        pinyin: 'bú kèqi',
        meaningPl: 'nie ma za co',
        meaningEn: "you are welcome",
      },
      { hanzi: '对不起', pinyin: 'duìbuqǐ', meaningPl: 'przepraszam', meaningEn: 'sorry' },
      { hanzi: '再见', pinyin: 'zàijiàn', meaningPl: 'do widzenia', meaningEn: 'goodbye' },
    ],
  },
  {
    id: 'people-family',
    name: 'Ludzie i rodzina',
    description: 'Słówka do opisywania osób oraz relacji rodzinnych.',
    entries: [
      { hanzi: '人', pinyin: 'rén', meaningPl: 'osoba', meaningEn: 'person' },
      { hanzi: '朋友', pinyin: 'péngyou', meaningPl: 'przyjaciel', meaningEn: 'friend' },
      { hanzi: '爸爸', pinyin: 'bàba', meaningPl: 'tata', meaningEn: 'father' },
      { hanzi: '妈妈', pinyin: 'māma', meaningPl: 'mama', meaningEn: 'mother' },
      { hanzi: '老师', pinyin: 'lǎoshī', meaningPl: 'nauczyciel', meaningEn: 'teacher' },
    ],
  },
  {
    id: 'numbers-quantities',
    name: 'Liczby i ilości',
    description: 'Podstawowe liczebniki i pytania o ilość.',
    entries: [
      { hanzi: '一', pinyin: 'yī', meaningPl: 'jeden', meaningEn: 'one' },
      { hanzi: '二', pinyin: 'èr', meaningPl: 'dwa', meaningEn: 'two' },
      { hanzi: '三', pinyin: 'sān', meaningPl: 'trzy', meaningEn: 'three' },
      { hanzi: '十', pinyin: 'shí', meaningPl: 'dziesięć', meaningEn: 'ten' },
      { hanzi: '多少', pinyin: 'duōshao', meaningPl: 'ile', meaningEn: 'how many' },
    ],
  },
  {
    id: 'time-calendar',
    name: 'Czas i kalendarz',
    description: 'Określanie czasu, dni i momentów.',
    entries: [
      { hanzi: '今天', pinyin: 'jīntiān', meaningPl: 'dzisiaj', meaningEn: 'today' },
      { hanzi: '明天', pinyin: 'míngtiān', meaningPl: 'jutro', meaningEn: 'tomorrow' },
      { hanzi: '昨天', pinyin: 'zuótiān', meaningPl: 'wczoraj', meaningEn: 'yesterday' },
      { hanzi: '现在', pinyin: 'xiànzài', meaningPl: 'teraz', meaningEn: 'now' },
      { hanzi: '点', pinyin: 'diǎn', meaningPl: 'godzina (na zegarze)', meaningEn: "o'clock" },
    ],
  },
  {
    id: 'food-drink',
    name: 'Jedzenie i picie',
    description: 'Najpopularniejsze słówka związane z posiłkami.',
    entries: [
      { hanzi: '水', pinyin: 'shuǐ', meaningPl: 'woda', meaningEn: 'water' },
      { hanzi: '茶', pinyin: 'chá', meaningPl: 'herbata', meaningEn: 'tea' },
      { hanzi: '米饭', pinyin: 'mǐfàn', meaningPl: 'ryż (gotowany)', meaningEn: 'rice (cooked)' },
      { hanzi: '苹果', pinyin: 'píngguǒ', meaningPl: 'jabłko', meaningEn: 'apple' },
      { hanzi: '菜', pinyin: 'cài', meaningPl: 'potrawa; warzywa', meaningEn: 'dish; vegetables' },
    ],
  },
  {
    id: 'places-directions',
    name: 'Miejsca i kierunki',
    description: 'Słówka pomocne przy pytaniu o lokalizację.',
    entries: [
      { hanzi: '家', pinyin: 'jiā', meaningPl: 'dom', meaningEn: 'home' },
      { hanzi: '学校', pinyin: 'xuéxiào', meaningPl: 'szkoła', meaningEn: 'school' },
      { hanzi: '饭店', pinyin: 'fàndiàn', meaningPl: 'restauracja', meaningEn: 'restaurant' },
      { hanzi: '商店', pinyin: 'shāngdiàn', meaningPl: 'sklep', meaningEn: 'shop' },
      { hanzi: '哪儿', pinyin: 'nǎr', meaningPl: 'gdzie', meaningEn: 'where' },
    ],
  },
];
