# ISSUES

## 24h - 12h format & language
- make sure to allow the config for 24h / 12h format and also language support to switch the mirror language (not config, only the mirror display itself) -> initially starting with English & German

## module size and adjustments
- the size alignment with the fours squares for each row is not sufficient, because we have to base it on resolution
- full HD is minimum and it will go up from there (if the monitor has been connected)
- the preview doesn't reflect the actual display of each module
- a lot of "unused" space and in other cases, we have overflow [screenshot added of a) test layout editor and b) resulting mirror]
- maybe it makes sense to set up predefined sizes for each module (indiviually for each module) as we have only a certain amount of modules that display different things: examples: clock and date don't need a lot of space and don't need more than a narriw height, but could be centered on top of the display, weather could be only half of the width on the display but more height or vice versa, etc 

## Weather module 
- always showing "Berlin" -> config should be able to enter city, plz and country
- if enough space, show full week forecast and adjust based on the available space

## calendar module
- should be configurable if showing only items as a list or show a "real" calendar where the days are horizontally and for each day each entry has its own little card
- setup should allow to chose full week or between 1, 2, 3 , 4, 5 or 6 day(s) -> based on that the font size has to adjust accordingly
- each calendar should have its own color (config can change and chose each color), so it is obvious on one glance
- don't show the full address of a calendar entry, it is not needed here (we have the ai context to show travel times etc) -> only title, start and end time and the color of the calendar (not the calendar name)

## AI/Daily Brief
- show when it has been updated last
- right now it shows a lot of confusing stuff (look at screenshot): Travel context: Privat Schottmüllerstr. 15 20251 Hamburg Privat Schottmüllserstr. 15 20251 Hamburg Sun 22 Mar - Mon 23 Mar Trip context is active for Privat Schottmüllerstr. 15 20251 Hamburg Privat Schottmüllserstr. 15 20251 Hamburg is active now. Moritz AHrens on Mon23 Mar.
- so make sure all the unnessessary information is omitted -> user knows where he lives -> we don't always need travel context, try to read out of the event title if and what information could be helpful, but don't "push" it.
- example: events "Student Grade Prüfungen Zürich Online" -> maybe show in advance "Tomorrow Christoph has the Online Grade Exams - everything prepared?" or "Cordes Sanitär Reparaturen" -> show two days in advance "Preparations for Cordes for Repairs on Monday!" and if there are things that are repeated events, you most likely don't have to bother or things that seem to be notes like "Start Arbeiten" could be shown a day in advance "Christoph, tomorrow you start at 11:00 Uhr!"