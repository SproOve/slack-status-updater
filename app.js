"use strict";

const os = require("os");
const axios = require("axios");
const url = require("url");
const execSync = require("child_process").execSync;
const config = require("./config");

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

  if (freeToChangeStatus) {
    console.log("Connected WiFi SSID: %s", wiFiName);

    const status = config.statusByWiFiName[wiFiName];
    if (!status) {
      console.log("Status not specified for WiFi: %s", wiFiName);
      return;
    }
    console.log("Setting Slack status to: %j", status);
    setSlackStatus(config.slackToken, status);
  }
}, config.updateInterval);

async function readUser(token) {
  const params = new url.URLSearchParams({ token: token });
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
      let current_status_emoji =
        config.statusByWiFiName[wifiSetupKey].status_emoji;
      let current_status_text =
        config.statusByWiFiName[wifiSetupKey].status_text;
      if (
        (userData.profile.status_emoji === current_status_emoji &&
          userData.profile.status_text === current_status_text) ||
        !userData.profile.status_emoji ||
        !userData.profile.status_text
      ) {
        console.log(
          "Found a Wifi-Status from this script or status is blank, will change status according to Wifi setup."
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
