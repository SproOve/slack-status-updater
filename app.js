"use strict";

const os = require("os");
const axios = require("axios");
const url = require("url");
const execSync = require("child_process").execSync;
const config = require("./config");

var now, actualHour, actualMinutes;
var workingHoursText = getWorkingHoursText();

if (!config.slackToken) {
  console.error("Missing Slack token. Set it in config.js");
  process.exit(1);
}

function getLinuxWiFiName() {
  return execSync("iwgetid -r") // Linux only
    .toString()
    .split("\n")
    .filter((line) => line.match(/.+/))
    .find((ssid) => true); // find first
}

function getMacWiFiName() {
  return execSync(
    "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I"
  ) // macos only
    .toString()
    .split("\n")
    .filter((line) => line.includes(" SSID: "))
    .map((line) => line.match(/: (.*)/)[1])
    .find((ssid) => true); // find first
}

function getWinWiFiName() {
  return execSync("netsh wlan show interfaces") // Windows only
    .toString()
    .split("\n")
    .filter((line) => line.includes(" SSID "))
    .map((line) => line.match(/: (.*)/)[1])
    .find((ssid) => true); // find first
}

function setSlackStatus(token, status) {
  const params = new url.URLSearchParams({
    token: token,
    profile: JSON.stringify(status),
  });
  return axios
    .post("https://slack.com/api/users.profile.set", params.toString())
    .then(function (response) {
      console.log("Set Slack status API response: %j", response.data);
    })
    .catch(function (error) {
      console.error("Set Slack status error: %s", error);
    });
}

const platform = os.platform();

let wiFiName;
let getWiFiName;
// Get appropriate function for platform
switch (platform) {
  case "darwin":
    getWiFiName = getMacWiFiName;
    break;
  case "win32":
    getWiFiName = getWinWiFiName;
    break;
  case "linux":
    getWiFiName = getLinuxWiFiName;
    break;
  default:
    console.error("Unknown platform %s", platform);
    process.exit(1);
}

setInterval(async function () {
  wiFiName = getWiFiName();
  let userData = await readUser(config.slackToken);
  let freeToChangeStatus = await getFreeToChange(userData);
  setPresence(config.slackToken);
  if (freeToChangeStatus) {
    console.log("Connected WiFi SSID: %s", wiFiName);
    var status = config.statusByWiFiName[wiFiName];
    if (!status) {
      console.log("Status not specified for WiFi: %s", wiFiName);
      return;
    }

    let amIWorkingNow = getWorkingStatus();
    let outBoundStatus = {
      status_text:
        amIWorkingNow || config.awayOutsideWorkingHours === false
          ? status.status_text + workingHoursText
          : config.statusWhenAway.status_text,
      status_emoji:
        amIWorkingNow || config.awayOutsideWorkingHours === false
          ? status.status_emoji
          : config.statusWhenAway.status_emoji,
    };
    // outBoundStatus.status_text =
    //   status.status_text + (amIWorkingNow ? workingHoursText : "");
    console.log("Setting Slack status to: %j", outBoundStatus);
    setSlackStatus(config.slackToken, outBoundStatus);
  }
}, config.updateInterval);

async function readUser(token) {
  const params = new url.URLSearchParams({ token: token });
  now = new Date();

  return axios
    .post("https://slack.com/api/users.profile.get", params.toString())
    .then(function (response) {
      return response.data;
    })
    .catch(function (error) {
      console.error("Set Slack status error: %s", error);
    });
}

async function getFreeToChange(userData) {
  let freeToChange = false;
  if (config.overwriteManualStatus === true) {
    console.log("Ignoring manual Status due to config setup");
    freeToChange = true;
  } else if (userData.profile) {
    Object.keys(config.statusByWiFiName).forEach((wifiSetupKey) => {
      const away_status_emoji = config.statusWhenAway.status_emoji;
      const away_status_text = config.statusWhenAway.status_text;
      let current_status_emoji =
        config.statusByWiFiName[wifiSetupKey].status_emoji;
      let current_status_text =
        config.statusByWiFiName[wifiSetupKey].status_text;
      if (
        ((userData.profile.status_emoji === current_status_emoji ||
          userData.profile.status_emoji === away_status_emoji) &&
          (userData.profile.status_text === current_status_text ||
            userData.profile.status_text ===
              current_status_text + workingHoursText ||
            userData.profile.status_text === away_status_text)) ||
        !userData.profile.status_emoji ||
        !userData.profile.status_text
      ) {
        console.log(
          "Found a Wifi-Status from this script or status is blank/away-default, will change status according to Wifi setup."
        );
        freeToChange = true;
      }
    });
    if (freeToChange === false) {
      console.log(
        "Slack-status is set manually and overwrite setup is set to 'false', doing nothing."
      );
    }
  }
  return freeToChange;
}

function getWorkingHoursText() {
  var text = "";
  if (config.showWorkingHoursInStatusText) {
    let stringMinutesTo;
    now = new Date();
    if (config.workingMinutesTo <= 9) {
      stringMinutesTo = "0" + config.workingMinutesTo;
    } else {
      stringMinutesTo = config.workingMinutesTo;
    }
    const offset = now.getTimezoneOffset();
    let offsetInHours = offset / 60;
    text = ` till ${config.workingHoursTo}:${stringMinutesTo} (UTC${offsetInHours})`;
  }
  return text;
}

function getWorkingStatus() {
  let amIWorkingNow = false;
  now = new Date();
  let workingFrom = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    config.workingHoursFrom,
    config.workingMinutesFrom
  );
  let workingTo = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    config.workingHoursTo,
    config.workingMinutesTo
  );

  actualHour = now.getHours();
  actualMinutes = now.getMinutes();
  if (
    now.getTime() >= workingFrom.getTime() &&
    now.getTime() <= workingTo.getTime()
  ) {
    amIWorkingNow = true;
  }
  return amIWorkingNow;
}

async function setPresence(token) {
  let amIWorkingNow = getWorkingStatus();
  let presence = "auto";
  if (config.awayOutsideWorkingHours === true && !amIWorkingNow) {
    presence = "away";
  }
  const presenceParams = new url.URLSearchParams({
    token: token,
    presence: presence,
  });
  axios
    .post("https://slack.com/api/users.setPresence", presenceParams.toString())
    .catch(function (error) {
      console.error("Set Slack presence error: %s", error);
    });
}
