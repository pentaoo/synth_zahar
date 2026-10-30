# Растровая гравюра · 30 октября 2026

Создано встроенным `image_gen` по заданию `design/ouroboros-brief/IMPLEMENTATION-PROMPT.md`. Референсы использованы для понимания гравюрного языка и композиции, не вырезались в итоговые ассеты. Оба изображения — новая генерация. Оригиналы сохранены рядом с этой записью без апскейла и обработки.

- `engraved-skin.png`: 2172 × 724. Материал тела. В рендерере координата привязана к физической длине кожи; при сжатии скрывается конец материала. Используется зеркальное повторение без размытия границы.
- `engraved-head.png`: 1536 × 1024, RGBA. Голова / челюсти / шея поверх входящего конца тела, единый масштаб с кожей.

Максимальный макровид ограничен так, чтобы высота исходной кожи в рабочем диапазоне была не меньше размера полосы на экране при DPR 2. Canvas и GPU работают в физических пикселях; никаких увеличенных вырезок референса нет.

## Фактический промпт тела

Use case: stylized-concept. Asset type: high resolution raster material for a bendable snake in an interactive musical instrument. Create an original antique black ink wood engraving of a LONG STRAIGHT SNAKE BODY / SKIN STRIP, horizontal, extreme wide 4:1 composition, highest native resolution (ideally 4096 by 1024). The snake runs continuously across left and right edges, absolutely straight, constant width. No head, no tail, no curve, no text. Multiple staggered rows of large irregular overlapping rounded diamond scales, white opaque scale interiors, thick uneven deep black ink seams, fine carved cross hatching and tiny stipple pores INSIDE the scales, subtle wear of a real 17th century relief print. Dorsal surface above and small belly scutes along the lower edge, with strong sculptural engraved volume. Ink black and clean white ONLY, no gray wash, no photographic shadows, no glossy 3D, no vector-clean outlines, no blur. Fill the image vertically with detailed skin; skin continues seamlessly in character at left/right for repeat sampling. Very sharp fine engraving detail suitable for close enlargement. Original drawing, not a crop of any supplied reference.

## Фактический промпт головы

Use case: stylized-concept. Asset type: original high resolution transparent raster sprite for a deformable ouroboros musical instrument. One single serpent HEAD WITH OPEN JAWS and short thick NECK, antique black ink wood engraving, pure black and opaque white ink on genuinely transparent background. Landscape 3:2 composition, highest native resolution. Anatomical side profile head facing LEFT, neck extends horizontally RIGHT to the right edge, so neck can connect to a separate horizontal snake body. The two jaws open towards the LEFT, forming a clear V-shaped mouth that can swallow a thick incoming tail: dark interior, one long upper jaw with expressive eye and nostril, lower curved jaw with fine teeth, restrained bifid tongue. Huge irregular plated scales on head; neck has rounded diamond scales with thick black seams. Dense tiny cross hatching, stippling, white engraved scratches and worn ink, no glossy realism, no smooth vector icon, no flat pictogram, no fantasy horns, no decorative lettering, no other snake, no ring. Transparent space around the head and between open jaws; WHITE parts of the head remain opaque. Frame the whole jaws and neck with a modest transparent margin, detailed enough to remain sharp enlarged to 900 physical pixels. Body thickness at right is about one quarter of image height. Entire artwork reads as one original hand carved 17th century wood engraving.

## Авторские решения при интеграции

Белое поле, три кольца разного радиуса, фиксированная ширина материала в пределах pinch, тёмные промежутки между белыми чешуйками, антиквенный текст. Цвет, гладкий векторный силуэт и постоянная панель в общем виде не добавляются. Координаты текстуры измеряются от шеи вдоль тела, а не пересчитываются в диапазон 0–1 на всё видимое кольцо.
