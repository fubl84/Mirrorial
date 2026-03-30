# ISSUES

We are close to first release -. can you check the following items and give your opinion and expertise?

## 1. Integration -> Transport in the config UI:
Is this needed any longer? The daily brief uses LLM and from there it could give information about transport, or is it using this api for additional information? If so, we have to keep it and we should extend the given information from only HOME AIRPORT and HOME STATION to HOME AIRPORT, CLOSEST TRAIN STATION, CLOSEST BUS STATION, CLOSEST TUBE STATION
## 2. Integration -> Routing in the config UI:
This is for real-time traffic information? We can keep this, but this will be a "full" integration with its own module -> so let us make a plan for that. The module will have to be configured with route items that get updated in a set interval with the provider and it shows the estimated travel times. Example: item 1 is added with start at the home address and destination Yamaha Music Europe GmbH Rellingen with the transport "Car" -> this will show the estimated travel time by car. item 2 is added to have the same start and destination, but with "public transport" -> this will show as the second card the travel time by public transport (also showing the bus nr and train nr). item 3 is added from home to a specific doctor and "walk" as the travel option -> this will show the extimated travel time by foot. On the mirror it shows small and nicely designed cards for each item, color coded travel time (green, orange and red) -> if we have this, do we still need the "Transport" integration? Or is this redundant? Because we could also use this API for the LLM and the daily brief, right? 
## 3. System in the confic UI: 
Restart Display and Reboot Mirror does not work (tested NOT on a raspberry Pi, but on local Mac with our run_mac script -> check whether this is just a dev version issue or if this will occur on live devices
## 4. For first live deployment: 
check if we already have a "all-in-one" solution for installing on a raspberry PI. Desired goal is, that any user has just installed the OS on the raspberry, then clones the repo and runs one install command that does everything - including setting this as an autostart on the raspberry, so after the automatic install and build it reboots the pi and everything is up and running
## 5. Google Calendar Integration: 
for deployment we need to make sure, we have a good google calendar integration that is easy to connect to google. The average user will use this on their own local wifi network, so what can we prepare in our general project to make sure, every user can connect to his google calendar easily? If possible, can we have a typical one-click-solution where it is just a popup asking for permission to use the calendar etc?
## 6. Additional calendar integrations: 
If possible, can we add other sources for calendars? 1 Apple Calendar 2 Any Calendar Subscription -> make sure, the daily brief also works with the other calendar integrations. -> if possible also allow mutliple calendar sources (example: maybe a family uses google calendar, but they want to show the city trash calendar that is a separate calendar subscription and not in their google calendar)
## 7. Household in config UI: 
check, if all fields in household are relevant and remove all dummy fields. It would be nice having a nickname field for every member that will be used in the daily brief.
## 8. Birthday animations and messages: 
for our household, we need to check for current birthday and if one of the household members has their birthday, show hourly short animation overlays on the mirror (like balloons flying up with confetti) and then showing a big title overlay over the mirror like "HAPPY BIRTHDAY, XYZ!" -> this should be every 30 minutes on the mirror for that day with changing title text (create a wide range of different texts and chose randomly every 30 minutes -> for example happy birthday in different languages, something like "xyz, you are x years old! Yeah!" or something creative - bring in your own ideas)
## 9. Confirm / dialogue popups:
we are using browser popups for confirmation or dialogue. let us change all of these to internal overlay modals and not browser, as this changes the focus to the browser and is annoying to users. If we have confirmation modals, also add an automatic disappearance after 3 seconds, so there is no interaction needed when it is just telling "Save successfull!" -> only if there are error modals, it should stay as long as the user has clicked the button and aknowledged the error message.
## 10. Weather icons
Rework the weather icons and animations. We have problems especially with the icons for lightning, rain and snow as the lightning placed on the grey cloud is not visible, also the rain is ony partly visible (the half over the cloud is visible but the bottomhalf over the dark background is not visible) -> one idea would be to use white borders for every element in the icons.
For the animations: can we have mor interesting animations? For example the rain icon: now the three rain lines are moving down in a parallel movement and it is really boring -> think about rain that is running and each line has their own animation -> think about all other animations and how to improve them to make them more interesting
## 11. Version number
Add the first version number of 1.0 to the config ui on the bottom footer and also in our README file please
## 12. Styling in config UI
The font scaling is not clear to the user -> what does this affect and what is not affected? Do we need this anylonger? Or should we have a more detailed config (font size header 1, header 2, subtitle, text, etc)?
Can we add some more fonts? If so, I will chose from a selection and place them in the project folder -> tell me, where to place them and I will give you the list of additional fonts for the mirror.
