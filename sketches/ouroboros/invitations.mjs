// Invitations for the empty line. They retype one another, a character at a
// time, so the eye finds the place where words go into the circle.
export const INVITATIONS=Object.freeze(['Шепни Уроборосу…','Накорми змея словом','Брось слово в круг','Скажи — и змей услышит','Напиши, и кольцо замкнётся','Дай змею имя','Что съест Уроборос сегодня?','Слово станет чешуёй','Начни заклинание…','Произнеси начало — змей найдёт конец','Оставь след в вечном круге','Говори с тем, кто ест свой хвост','Напиши, что вернётся к тебе','Впиши слово в кольцо','Пробуди змея','Каждое слово — новый виток','Здесь начинается конец…','Расскажи змею о себе','Вызови змея словом','Что ты отдашь кругу?','Змей ждёт твоего слова','Начни круг заново','Подкинь змею мысль','Чем закончится твой виток?','Впусти слово в кольцо','Змей голоден…','Назови то, что повторяется','Твоё слово станет хвостом','Позови — и он придёт','Напиши то, что не кончается','Шепни в чешую','Что было в начале?','Отдай слово вечности','Разбуди круг','Змей слушает…','Напиши, и змей запомнит','Кто ты в этом круге?','Добавь виток к бесконечности','Кольцо ждёт слова','Скажи, и всё начнётся снова']);
export const TYPE_MS=70,ERASE_MS=32,HOLD_MS=4200,EMPTY_MS=450;
// A pure typewriter: next() returns the placeholder text and how long it stays.
// Every phrase is shown once per shuffled round; a round never starts with the
// phrase that ended the previous one.
export class Typewriter{
  constructor(phrases=INVITATIONS,random=Math.random){this.phrases=phrases;this.random=random;this.queue=[];this.text=phrases[0];this.target=phrases[0];this.erasing=false;}
  pick(){
    if(!this.queue.length){
      this.queue=this.phrases.filter(p=>p!==this.target);
      for(let i=this.queue.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.queue[i],this.queue[j]]=[this.queue[j],this.queue[i]];}
    }
    return this.queue.shift();
  }
  // Someone is writing: show the whole current phrase and hold it afterwards.
  settle(){this.text=this.target;this.erasing=false;return this.target;}
  next(reduced=false){
    if(reduced){this.target=this.text=this.pick();return {text:this.text,delay:HOLD_MS*2};}
    if(this.text===this.target&&!this.erasing){this.erasing=true;return {text:this.text,delay:HOLD_MS};}
    if(this.erasing){
      const chars=[...this.text];chars.pop();this.text=chars.join('');
      if(!this.text){this.erasing=false;this.target=this.pick();return {text:'',delay:EMPTY_MS};}
      return {text:this.text,delay:ERASE_MS};
    }
    this.text=[...this.target].slice(0,[...this.text].length+1).join('');
    return {text:this.text,delay:this.text===this.target?0:TYPE_MS};
  }
}
