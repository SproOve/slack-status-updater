//Rename this file to just "config.js" after editing

module.exports = {
  slackToken: "xoxp-.....", //Paste your own slack token here
  statusByWiFiName: {
    OFFICE: {
      //wifi SSID
      status_text: "In the office",
      status_emoji: ":office:",
    },
    HOME: {
      status_text: "Working from home",
      status_emoji: ":home:",
    },
    HOTSPOT: {
      status_text: "Working outside",
      status_emoji: ":outside:",
    },
  },
  showWorkingHoursInStatusText: true,
  awayOutsideWorkingHours: true,
  workingHoursFrom: 8,
  workingMinutesFrom: 30,
  workingHoursTo: 13,
  workingMinutesTo: 0,
  overwriteManualStatus: false, // true: ignores manually set status and does change it, false: keeps manually set status
  //updateInterval: 1000 // every second
  //updateInterval: 5000 // every 5 seconds
  //updateInterval: 300000 // every 5 minutes
  //updateInterval: 600000 // every 10 minutes
  updateInterval: 1800000, // every 30 minutes
};
