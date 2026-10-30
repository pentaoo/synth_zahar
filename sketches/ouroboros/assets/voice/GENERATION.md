# Роботизированная речь · 30 октября 2026

Локальные PCM-записи созданы системным синтезатором macOS `say`, голос **Milena**.
Записан только новый рабочий русский текст. Это выбор прототипа, язык и финальный текст автор ещё не утверждал.

Фактически выполненные команды:

```sh
/usr/bin/say -v Milena -r 115 -o /private/tmp/ouroboros-voice-test.aiff 'Свод'
/usr/bin/say -v Milena -r 115 -o /private/tmp/ouroboros-rage.aiff 'Ярость'
/usr/bin/say -v Milena -r 110 -o /private/tmp/ouroboros-split.aiff 'Расщепление'
/usr/bin/say -v Milena -r 115 -o /private/tmp/ouroboros-clear.aiff 'Снять'
/usr/bin/say -v Milena -r 105 -o /private/tmp/ouroboros-recitative-a.aiff 'Круг держит память. Камень слышит имя.'
/usr/bin/say -v Milena -r 105 -o /private/tmp/ouroboros-recitative-b.aiff 'Ветер возвращает голос. Имя входит в круг.'
```

AIFF преобразованы штатным `afconvert … -f WAVE -d LEI16@22050` в одноимённые WAV этой папки. `ouroboros-voice-test.aiff` → `vault.wav`.
В песочнице первый запуск `say` создал пустой файл; успешный запуск с доступом к системному синтезатору заменил его. Содержимое PCM и длительности проверены.

При исполнении сеть и системные голоса не нужны: файлы декодируются в AudioBuffer. `RitualVoice` пропускает их через bandpass, ступенчатый waveshaper и кольцевую модуляцию 43 Гц. Слово прерывает текущий речитатив; отложенной очереди нет. Пауза / финал останавливают BufferSource. Общие заклинания обрабатывают отдельную речевую ветвь, затем речь поступает в общий компрессор и реальный анализ чернил. `speechSynthesis` не используется.
